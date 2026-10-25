// TCP, UDP, TLS and DNS for the runtime's systems and scripts - agapi's
// src-tauri/src/plugins/net (its mDNS and device-status parts left out) - and
// the device's own info for CF.device (device.rs).
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{Manager, AppHandle, Runtime, State};
use tokio::sync::mpsc::{Receiver, Sender};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

pub mod device;
pub mod dns;
pub mod tcp;
pub mod tls;
pub mod udp;
#[cfg(test)]
mod tests;

pub struct NetState {
    pub tcp_sockets: Arc<Mutex<HashMap<String, Conn<tcp::TcpCommand>>>>,
    pub udp_sockets: Arc<Mutex<HashMap<String, Conn<udp::UdpCommand>>>>,
    pub tcp_servers: Arc<Mutex<HashMap<String, tokio::sync::mpsc::Sender<tcp::TcpServerCommand>>>>,
    pub tls_sockets: Arc<Mutex<HashMap<String, Conn<tls::TlsCommand>>>>,
}

/// A socket's task as its commands have it: what it's told, in turn (`tx`),
/// and `stop` - it lets go of whatever it's doing: a write its peer doesn't
/// take (it stopped reading) would hold up every command behind it, the
/// close too.
pub struct Conn<C> {
    pub tx: Sender<C>,
    pub stop: CancellationToken,
}

impl<C> Conn<C> {
    /// A new socket's, and its task's ends of it.
    pub fn new(capacity: usize) -> (Self, Receiver<C>, CancellationToken) {
        let (tx, rx) = tokio::sync::mpsc::channel(capacity);
        let stop = CancellationToken::new();
        (Conn { tx, stop: stop.clone() }, rx, stop)
    }

    /// Closed: what it was told before still done as far as it can be at
    /// once (Node's destroy() sends what the socket takes), then its commands'
    /// end (this sender gone) closes it.
    pub fn close(self) {
        self.stop.cancel();
    }
}

/// Socket `id`'s commands, the lock let go of before anything is sent: one
/// whose commands wait (its task busy) holds up no other.
pub async fn sender<C>(sockets: &Mutex<HashMap<String, Conn<C>>>, id: &str) -> Option<Sender<C>> {
    sockets.lock().await.get(id).map(|c| c.tx.clone())
}

/// `f`, unless the socket is let go of first (None then). What can be done
/// at once still is: a write just before a close goes out.
pub async fn unless_stopped<T>(stop: &CancellationToken, f: impl std::future::Future<Output = T>) -> Option<T> {
    tokio::select! {
        biased;
        r = f => Some(r),
        _ = stop.cancelled() => None,
    }
}

/// Keepalive's probes once the first goes: 1 s apart, 10 of them - Node's
/// (libuv's), as iva dev has them - not the OS's 75 s x 9.
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(1);
#[cfg(not(windows))]
const KEEPALIVE_PROBES: u32 = 10;

/// Keepalive on (its first probe `delay` ms after the peer was last heard,
/// else when the OS has it) or off. A peer gone is found out `delay` + 10 s
/// on, and a write it doesn't take fails as soon (TCP_USER_TIMEOUT) - not
/// after the OS's ~15 minutes of resends.
pub fn keep_alive(sock: socket2::SockRef<'_>, enable: bool, delay: Option<u64>) -> std::io::Result<()> {
    if !enable {
        #[cfg(any(target_os = "android", target_os = "linux"))]
        sock.set_tcp_user_timeout(None)?;
        return sock.set_keepalive(false);
    }
    let mut ka = socket2::TcpKeepalive::new().with_interval(KEEPALIVE_INTERVAL);
    // (Windows sends 10, its own number)
    #[cfg(not(windows))]
    {
        ka = ka.with_retries(KEEPALIVE_PROBES);
    }
    if let Some(ms) = delay {
        ka = ka.with_time(Duration::from_millis(ms));
    }
    sock.set_tcp_keepalive(&ka)?;
    #[cfg(any(target_os = "android", target_os = "linux"))]
    if let Some(ms) = delay {
        sock.set_tcp_user_timeout(Some(Duration::from_millis(ms) + KEEPALIVE_INTERVAL * KEEPALIVE_PROBES))?;
    }
    Ok(())
}

/// How long a TCP connect waits. A LAN host that isn't there would otherwise
/// take the OS's ~2 minutes, while a GUI polling it (a page timer every
/// second or two) piles up connections meanwhile.
pub const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

/// A TCP connection to `addr` (host:port), or ETIMEDOUT after CONNECT_TIMEOUT.
pub async fn connect(addr: &str) -> std::io::Result<tokio::net::TcpStream> {
    match tokio::time::timeout(CONNECT_TIMEOUT, tokio::net::TcpStream::connect(addr)).await {
        Ok(r) => r,
        Err(_) => Err(std::io::Error::new(std::io::ErrorKind::TimedOut, format!("connect ETIMEDOUT {addr}"))),
    }
}

/// Every socket and server of the plugin closed, however many: a page
/// starting afresh (the panel after a reload) owns none of what the page
/// before it left, and a server still listening would hold its port from the
/// new page's systems. They're taken out under the lock and told after it,
/// as each socket's task takes the same lock to go; a socket is stopped, not
/// told in turn (one its peer stopped reading would never get to it).
#[derive(serde::Serialize)]
pub struct Closed {
    pub servers: usize,
    pub connections: usize,
    pub udp: usize,
    pub tls: usize,
}

#[tauri::command]
pub async fn net_close_all(state: State<'_, NetState>) -> Result<Closed, String> {
    let servers: Vec<_> = state.tcp_servers.lock().await.drain().map(|(_, tx)| tx).collect();
    let sockets: Vec<_> = state.tcp_sockets.lock().await.drain().map(|(_, c)| c).collect();
    let udps: Vec<_> = state.udp_sockets.lock().await.drain().map(|(_, c)| c).collect();
    let tls: Vec<_> = state.tls_sockets.lock().await.drain().map(|(_, c)| c).collect();
    let closed = Closed { servers: servers.len(), connections: sockets.len(), udp: udps.len(), tls: tls.len() };
    for tx in servers { let _ = tx.send(tcp::TcpServerCommand::Close).await; }
    for c in sockets { c.close(); }
    for c in udps { c.close(); }
    for c in tls { c.close(); }
    Ok(closed)
}

pub fn init_state<R: Runtime>(app: &AppHandle<R>) {
    app.manage(NetState {
        tcp_sockets: Arc::new(Mutex::new(HashMap::new())),
        udp_sockets: Arc::new(Mutex::new(HashMap::new())),
        tcp_servers: Arc::new(Mutex::new(HashMap::new())),
        tls_sockets: Arc::new(Mutex::new(HashMap::new())),
    });
}

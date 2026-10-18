// TCP, UDP, TLS and DNS for the runtime's systems and scripts - agapi's
// src-tauri/src/plugins/net (its mDNS and device-status parts left out) - and
// the device's own info for CF.device (device.rs).
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Manager, AppHandle, Runtime, State};
use tokio::sync::Mutex;

pub mod device;
pub mod dns;
pub mod tcp;
pub mod tls;
pub mod udp;

pub struct NetState {
    pub tcp_sockets: Arc<Mutex<HashMap<String, tokio::sync::mpsc::Sender<tcp::TcpCommand>>>>,
    pub udp_sockets: Arc<Mutex<HashMap<String, tokio::sync::mpsc::Sender<udp::UdpCommand>>>>,
    pub tcp_servers: Arc<Mutex<HashMap<String, tokio::sync::mpsc::Sender<tcp::TcpServerCommand>>>>,
    pub tls_sockets: Arc<Mutex<HashMap<String, tokio::sync::mpsc::Sender<tls::TlsCommand>>>>,
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
/// new page's systems. The senders are taken out under the lock and told
/// after it, as each socket's task takes the same lock to go.
#[tauri::command]
pub async fn net_close_all(state: State<'_, NetState>) -> Result<usize, String> {
    let servers: Vec<_> = state.tcp_servers.lock().await.drain().map(|(_, tx)| tx).collect();
    let sockets: Vec<_> = state.tcp_sockets.lock().await.drain().map(|(_, tx)| tx).collect();
    let udps: Vec<_> = state.udp_sockets.lock().await.drain().map(|(_, tx)| tx).collect();
    let tls: Vec<_> = state.tls_sockets.lock().await.drain().map(|(_, tx)| tx).collect();
    let n = servers.len() + sockets.len() + udps.len() + tls.len();
    for tx in servers { let _ = tx.send(tcp::TcpServerCommand::Close).await; }
    for tx in sockets { let _ = tx.send(tcp::TcpCommand::Destroy).await; }
    for tx in udps { let _ = tx.send(udp::UdpCommand::Close).await; }
    for tx in tls { let _ = tx.send(tls::TlsCommand::Destroy).await; }
    Ok(n)
}

pub fn init_state<R: Runtime>(app: &AppHandle<R>) {
    app.manage(NetState {
        tcp_sockets: Arc::new(Mutex::new(HashMap::new())),
        udp_sockets: Arc::new(Mutex::new(HashMap::new())),
        tcp_servers: Arc::new(Mutex::new(HashMap::new())),
        tls_sockets: Arc::new(Mutex::new(HashMap::new())),
    });
}

// TCP, UDP, TLS and DNS for the runtime's systems and scripts - agapi's
// src-tauri/src/plugins/net (its mDNS and device-status parts left out) - and
// the device's own info for CF.device (device.rs).
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Manager, AppHandle, Runtime};
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

pub fn init_state<R: Runtime>(app: &AppHandle<R>) {
    app.manage(NetState {
        tcp_sockets: Arc::new(Mutex::new(HashMap::new())),
        udp_sockets: Arc::new(Mutex::new(HashMap::new())),
        tcp_servers: Arc::new(Mutex::new(HashMap::new())),
        tls_sockets: Arc::new(Mutex::new(HashMap::new())),
    });
}

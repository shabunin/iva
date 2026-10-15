// TCP, UDP, TLS and DNS for the runtime's systems and scripts - agapi's
// src-tauri/src/plugins/net (its mDNS and device-status parts left out).
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Manager, AppHandle, Runtime};
use tokio::sync::Mutex;

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

pub fn init_state<R: Runtime>(app: &AppHandle<R>) {
    app.manage(NetState {
        tcp_sockets: Arc::new(Mutex::new(HashMap::new())),
        udp_sockets: Arc::new(Mutex::new(HashMap::new())),
        tcp_servers: Arc::new(Mutex::new(HashMap::new())),
        tls_sockets: Arc::new(Mutex::new(HashMap::new())),
    });
}

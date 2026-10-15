pub mod server;

use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::{Mutex, oneshot};
use tokio::task::JoinHandle;

pub struct HttpResponsePayload {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

pub struct WsConnection {
    pub tx: tokio::sync::mpsc::UnboundedSender<axum::extract::ws::Message>,
}

pub struct HttpState {
    pub servers: Arc<Mutex<HashMap<u16, JoinHandle<()>>>>,
    pub pending_requests: Arc<Mutex<HashMap<String, oneshot::Sender<HttpResponsePayload>>>>,
    pub ws_connections: Arc<Mutex<HashMap<String, WsConnection>>>,
}

pub fn init_state(app: &AppHandle) {
    app.manage(HttpState {
        servers: Arc::new(Mutex::new(HashMap::new())),
        pending_requests: Arc::new(Mutex::new(HashMap::new())),
        ws_connections: Arc::new(Mutex::new(HashMap::new())),
    });
}

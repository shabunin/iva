use super::NetState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NetEventPayload {
    pub id: String,
    pub event: String,
    pub data: Option<Vec<u8>>,
    pub error: Option<String>,
    pub remote_address: Option<String>,
    pub remote_port: Option<u16>,
    pub local_address: Option<String>,
    pub local_port: Option<u16>,
    pub family: Option<String>,
}

#[derive(Serialize)]
pub struct TcpConnectResult {
    pub id: String,
    pub remote_address: String,
    pub remote_port: u16,
    pub local_address: String,
    pub local_port: u16,
    pub family: String,
}

#[derive(Serialize)]
pub struct TcpListenResult {
    pub id: String,
    pub local_address: String,
    pub local_port: u16,
    pub family: String,
}

pub enum TcpCommand {
    Write(Vec<u8>),
    /// Half-close the write side (Node `socket.end()`); keep reading.
    Shutdown,
    Destroy,
    SetKeepAlive(bool, Option<u64>),
    SetNoDelay(bool),
}

pub enum TcpServerCommand {
    Close,
}

#[tauri::command]
pub async fn tcp_connect<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, NetState>,
    host: String,
    port: u16,
) -> Result<TcpConnectResult, String> {
    let addr = format!("{}:{}", host, port);
    let mut stream = TcpStream::connect(&addr).await.map_err(|e| e.to_string())?;
    
    let peer_addr = stream.peer_addr().map_err(|e| e.to_string())?;
    let local_addr = stream.local_addr().map_err(|e| e.to_string())?;
    let family = if peer_addr.is_ipv4() { "IPv4" } else { "IPv6" }.to_string();
    
    let id = Uuid::new_v4().to_string();
    let id_clone = id.clone();
    
    let (tx, mut rx) = tokio::sync::mpsc::channel::<TcpCommand>(32);
    state.tcp_sockets.lock().await.insert(id.clone(), tx);
    
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut buf = vec![0; 4096];
        loop {
            tokio::select! {
                result = stream.read(&mut buf) => {
                    match result {
                        Ok(0) => {
                            let _ = app_clone.emit("plugin:net:tcp", NetEventPayload {
                                id: id_clone.clone(),
                                event: "close".to_string(),
                                ..Default::default()
                            });
                            break;
                        }
                        Ok(n) => {
                            let _ = app_clone.emit("plugin:net:tcp", NetEventPayload {
                                id: id_clone.clone(),
                                event: "data".to_string(),
                                data: Some(buf[..n].to_vec()),
                                ..Default::default()
                            });
                        }
                        Err(e) => {
                            let _ = app_clone.emit("plugin:net:tcp", NetEventPayload {
                                id: id_clone.clone(),
                                event: "error".to_string(),
                                error: Some(e.to_string()),
                                ..Default::default()
                            });
                            break;
                        }
                    }
                }
                cmd = rx.recv() => {
                    match cmd {
                        Some(TcpCommand::Write(data)) => {
                            if let Err(e) = stream.write_all(&data).await {
                                let _ = app_clone.emit("plugin:net:tcp", NetEventPayload {
                                    id: id_clone.clone(),
                                    event: "error".to_string(),
                                    error: Some(e.to_string()),
                                    ..Default::default()
                                });
                                break;
                            }
                        }
                        Some(TcpCommand::Shutdown) => {
                            // Node-like end(): FIN on write side, keep reading
                            if let Err(e) = stream.shutdown().await {
                                let _ = app_clone.emit("plugin:net:tcp", NetEventPayload {
                                    id: id_clone.clone(),
                                    event: "error".to_string(),
                                    error: Some(e.to_string()),
                                    ..Default::default()
                                });
                                break;
                            }
                            let _ = app_clone.emit("plugin:net:tcp", NetEventPayload {
                                id: id_clone.clone(),
                                event: "finish".to_string(),
                                ..Default::default()
                            });
                        }
                        Some(TcpCommand::SetKeepAlive(enable, delay)) => {
                            let sock = socket2::SockRef::from(&stream);
                            if enable {
                                let mut ka = socket2::TcpKeepalive::new();
                                if let Some(ms) = delay {
                                    ka = ka.with_time(std::time::Duration::from_millis(ms));
                                }
                                let _ = sock.set_tcp_keepalive(&ka);
                            } else {
                                let _ = sock.set_keepalive(false);
                            }
                        }
                        Some(TcpCommand::SetNoDelay(no_delay)) => {
                            let _ = stream.set_nodelay(no_delay);
                        }
                        Some(TcpCommand::Destroy) | None => {
                            let _ = stream.shutdown().await;
                            break;
                        }
                    }
                }
            }
        }
        
        if let Some(state_mutex) = app_clone.try_state::<NetState>() {
            state_mutex.tcp_sockets.lock().await.remove(&id_clone);
        }
    });
    
    Ok(TcpConnectResult {
        id,
        remote_address: peer_addr.ip().to_string(),
        remote_port: peer_addr.port(),
        local_address: local_addr.ip().to_string(),
        local_port: local_addr.port(),
        family,
    })
}

#[tauri::command]
pub async fn tcp_write(
    state: State<'_, NetState>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let sockets = state.tcp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        tx.send(TcpCommand::Write(data)).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn tcp_destroy(
    state: State<'_, NetState>,
    id: String,
) -> Result<(), String> {
    let mut sockets = state.tcp_sockets.lock().await;
    if let Some(tx) = sockets.remove(&id) {
        let _ = tx.send(TcpCommand::Destroy).await;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

/// Half-close write side (Node `socket.end()` without destroying the handle).
#[tauri::command]
pub async fn tcp_shutdown(
    state: State<'_, NetState>,
    id: String,
) -> Result<(), String> {
    let sockets = state.tcp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        tx.send(TcpCommand::Shutdown)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

// TCP SERVER
#[tauri::command]
pub async fn tcp_listen<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, NetState>,
    host: String,
    port: u16,
) -> Result<TcpListenResult, String> {
    let addr = format!("{}:{}", host, port);
    let listener = TcpListener::bind(&addr).await.map_err(|e| e.to_string())?;
    
    let local_addr = listener.local_addr().map_err(|e| e.to_string())?;
    let family = if local_addr.is_ipv4() { "IPv4" } else { "IPv6" }.to_string();
    
    let id = Uuid::new_v4().to_string();
    let id_clone = id.clone();
    
    let (tx, mut rx) = tokio::sync::mpsc::channel::<TcpServerCommand>(8);
    state.tcp_servers.lock().await.insert(id.clone(), tx);
    
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                accept_res = listener.accept() => {
                    match accept_res {
                        Ok((stream, peer_addr)) => {
                            let client_id = Uuid::new_v4().to_string();
                            let local_addr = stream.local_addr().ok();
                            let family = peer_addr.is_ipv4().then(|| "IPv4".to_string()).or_else(|| Some("IPv6".to_string()));

                            // Register the socket BEFORE announcing it: a JS 'connection'
                            // handler may synchronously write/destroy by client_id.
                            let (client_tx, mut client_rx) = tokio::sync::mpsc::channel::<TcpCommand>(32);
                            if let Some(state_mutex) = app_clone.try_state::<NetState>() {
                                state_mutex.tcp_sockets.lock().await.insert(client_id.clone(), client_tx);
                            }

                            let _ = app_clone.emit("plugin:net:tcpserver", NetEventPayload {
                                id: id_clone.clone(),
                                event: "connection".to_string(),
                                data: Some(client_id.as_bytes().to_vec()),
                                remote_address: Some(peer_addr.ip().to_string()),
                                remote_port: Some(peer_addr.port()),
                                local_address: local_addr.as_ref().map(|a| a.ip().to_string()),
                                local_port: local_addr.as_ref().map(|a| a.port()),
                                family,
                                ..Default::default()
                            });
                            
                            let app_clone_inner = app_clone.clone();
                            let client_id_clone = client_id.clone();
                            let mut stream = stream;
                            
                            tauri::async_runtime::spawn(async move {
                                let mut buf = vec![0; 4096];
                                loop {
                                    tokio::select! {
                                        result = stream.read(&mut buf) => {
                                            match result {
                                                Ok(0) => {
                                                    let _ = app_clone_inner.emit("plugin:net:tcp", NetEventPayload {
                                                        id: client_id_clone.clone(),
                                                        event: "close".to_string(),
                                                        ..Default::default()
                                                    });
                                                    break;
                                                }
                                                Ok(n) => {
                                                    let _ = app_clone_inner.emit("plugin:net:tcp", NetEventPayload {
                                                        id: client_id_clone.clone(),
                                                        event: "data".to_string(),
                                                        data: Some(buf[..n].to_vec()),
                                                        ..Default::default()
                                                    });
                                                }
                                                Err(e) => {
                                                    let _ = app_clone_inner.emit("plugin:net:tcp", NetEventPayload {
                                                        id: client_id_clone.clone(),
                                                        event: "error".to_string(),
                                                        error: Some(e.to_string()),
                                                        ..Default::default()
                                                    });
                                                    break;
                                                }
                                            }
                                        }
                                        cmd = client_rx.recv() => {
                                            match cmd {
                                                Some(TcpCommand::Write(data)) => {
                                                    if let Err(e) = stream.write_all(&data).await {
                                                        let _ = app_clone_inner.emit("plugin:net:tcp", NetEventPayload {
                                                            id: client_id_clone.clone(),
                                                            event: "error".to_string(),
                                                            error: Some(e.to_string()),
                                                            ..Default::default()
                                                        });
                                                        break;
                                                    }
                                                }
                                                Some(TcpCommand::Shutdown) => {
                                                    if let Err(e) = stream.shutdown().await {
                                                        let _ = app_clone_inner.emit("plugin:net:tcp", NetEventPayload {
                                                            id: client_id_clone.clone(),
                                                            event: "error".to_string(),
                                                            error: Some(e.to_string()),
                                                            ..Default::default()
                                                        });
                                                        break;
                                                    }
                                                    let _ = app_clone_inner.emit("plugin:net:tcp", NetEventPayload {
                                                        id: client_id_clone.clone(),
                                                        event: "finish".to_string(),
                                                        ..Default::default()
                                                    });
                                                }
                                                Some(TcpCommand::SetKeepAlive(enable, delay)) => {
                                                    let sock = socket2::SockRef::from(&stream);
                                                    if enable {
                                                        let mut ka = socket2::TcpKeepalive::new();
                                                        if let Some(ms) = delay {
                                                            ka = ka.with_time(std::time::Duration::from_millis(ms));
                                                        }
                                                        let _ = sock.set_tcp_keepalive(&ka);
                                                    } else {
                                                        let _ = sock.set_keepalive(false);
                                                    }
                                                }
                                                Some(TcpCommand::SetNoDelay(no_delay)) => {
                                                    let _ = stream.set_nodelay(no_delay);
                                                }
                                                Some(TcpCommand::Destroy) | None => {
                                                    let _ = stream.shutdown().await;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                                if let Some(state_mutex) = app_clone_inner.try_state::<NetState>() {
                                    state_mutex.tcp_sockets.lock().await.remove(&client_id_clone);
                                }
                            });
                        }
                        Err(e) => {
                            let _ = app_clone.emit("plugin:net:tcpserver", NetEventPayload {
                                id: id_clone.clone(),
                                event: "error".to_string(),
                                error: Some(e.to_string()),
                                ..Default::default()
                            });
                            break;
                        }
                    }
                }
                cmd = rx.recv() => {
                    match cmd {
                        Some(TcpServerCommand::Close) | None => {
                            break;
                        }
                    }
                }
            }
        }
        
        let _ = app_clone.emit("plugin:net:tcpserver", NetEventPayload {
            id: id_clone.clone(),
            event: "close".to_string(),
            ..Default::default()
        });

        if let Some(state_mutex) = app_clone.try_state::<NetState>() {
            state_mutex.tcp_servers.lock().await.remove(&id_clone);
        }
    });
    
    Ok(TcpListenResult {
        id,
        local_address: local_addr.ip().to_string(),
        local_port: local_addr.port(),
        family,
    })
}

#[tauri::command]
pub async fn tcp_server_close(
    state: State<'_, NetState>,
    id: String,
) -> Result<(), String> {
    let mut servers = state.tcp_servers.lock().await;
    if let Some(tx) = servers.remove(&id) {
        let _ = tx.send(TcpServerCommand::Close).await;
        Ok(())
    } else {
        Err("Server not found".to_string())
    }
}

#[tauri::command]
pub async fn tcp_set_keep_alive(
    state: State<'_, NetState>,
    id: String,
    enable: bool,
    delay: Option<u64>,
) -> Result<(), String> {
    let sockets = state.tcp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        tx.send(TcpCommand::SetKeepAlive(enable, delay)).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn tcp_set_no_delay(
    state: State<'_, NetState>,
    id: String,
    no_delay: bool,
) -> Result<(), String> {
    let sockets = state.tcp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        tx.send(TcpCommand::SetNoDelay(no_delay)).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

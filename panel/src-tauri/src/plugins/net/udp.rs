use super::{tcp::NetEventPayload, NetState};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::UdpSocket;
use uuid::Uuid;

#[cfg(unix)]
use std::os::unix::io::{AsRawFd, FromRawFd};
#[cfg(windows)]
use std::os::windows::io::{AsRawSocket, FromRawSocket};

#[derive(serde::Serialize)]
pub struct UdpBindResult {
    pub id: String,
    pub local_address: String,
    pub local_port: u16,
    pub family: String,
}

/// `"::1:9000"`-style strings don't parse as `SocketAddr` (IPv6 needs brackets),
/// so build the address from parts instead of formatting a string.
fn make_addr(host: &str, port: u16) -> Result<std::net::SocketAddr, String> {
    host.parse::<std::net::IpAddr>()
        .map(|ip| std::net::SocketAddr::new(ip, port))
        .map_err(|e| format!("Invalid address {}: {}", host, e))
}

fn emit_udp_err<R: tauri::Runtime>(app: &AppHandle<R>, id: &str, e: impl ToString) {
    let _ = app.emit("plugin:net:udp", NetEventPayload {
        id: id.to_string(),
        event: "error".to_string(),
        error: Some(e.to_string()),
        ..Default::default()
    });
}

pub enum UdpCommand {
    Send(Vec<u8>, Option<String>, Option<u16>),
    Close,
    AddMembership(String, Option<String>),
    DropMembership(String, Option<String>),
    SetBroadcast(bool),
    Connect(String, u16, tokio::sync::oneshot::Sender<Result<(), String>>),
    Disconnect(tokio::sync::oneshot::Sender<Result<(), String>>),
    SetTtl(u32),
    SetMulticastTtl(u32),
    SetMulticastLoopback(bool),
    SetRecvBufferSize(usize),
    SetSendBufferSize(usize),
    GetRecvBufferSize(tokio::sync::oneshot::Sender<Result<usize, String>>),
    GetSendBufferSize(tokio::sync::oneshot::Sender<Result<usize, String>>),
}

#[tauri::command]
pub async fn udp_bind<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, NetState>,
    host: Option<String>,
    port: Option<u16>,
    reuse_addr: Option<bool>,
    reuse_port: Option<bool>,
    ipv6_only: Option<bool>,
    recv_buffer_size: Option<usize>,
    send_buffer_size: Option<usize>,
) -> Result<UdpBindResult, String> {
    let id = Uuid::new_v4().to_string();
    let id_clone = id.clone();
    
    let (tx, mut rx) = tokio::sync::mpsc::channel::<UdpCommand>(32);
    
    let h = host.unwrap_or_else(|| "0.0.0.0".to_string());
    let p = port.unwrap_or(0);
    
    let socket_addr = make_addr(&h, p)?;
    
    let domain = match socket_addr {
        std::net::SocketAddr::V4(_) => socket2::Domain::IPV4,
        std::net::SocketAddr::V6(_) => socket2::Domain::IPV6,
    };
    
    let socket = socket2::Socket::new(domain, socket2::Type::DGRAM, Some(socket2::Protocol::UDP))
        .map_err(|e| format!("Socket creation failed: {}", e))?;
        
    if let Some(true) = reuse_addr {
        socket.set_reuse_address(true).map_err(|e| format!("Failed to set reuse_address: {}", e))?;
    }
    
    #[cfg(unix)]
    {
        if let Some(true) = reuse_port {
            socket.set_reuse_port(true).map_err(|e| format!("Failed to set reuse_port: {}", e))?;
        }
    }
    
    if let Some(val) = ipv6_only {
        socket.set_only_v6(val).map_err(|e| format!("Failed to set only_v6: {}", e))?;
    }
    if let Some(size) = recv_buffer_size {
        socket.set_recv_buffer_size(size).map_err(|e| format!("Failed to set recv_buffer_size: {}", e))?;
    }
    if let Some(size) = send_buffer_size {
        socket.set_send_buffer_size(size).map_err(|e| format!("Failed to set send_buffer_size: {}", e))?;
    }
    
    socket.set_nonblocking(true).map_err(|e| format!("Failed to set non-blocking: {}", e))?;
    
    socket.bind(&socket_addr.into()).map_err(|e| format!("Bind failed: {}", e))?;
    
    let std_socket: std::net::UdpSocket = socket.into();
    let bound_addr = std_socket.local_addr().map_err(|e| format!("Failed to get local address: {}", e))?;
    
    let tokio_socket = UdpSocket::from_std(std_socket).map_err(|e| format!("Tokio socket conversion failed: {}", e))?;
    
    let local_address = bound_addr.ip().to_string();
    let local_port = bound_addr.port();
    let family = match bound_addr {
        std::net::SocketAddr::V4(_) => "IPv4".to_string(),
        std::net::SocketAddr::V6(_) => "IPv6".to_string(),
    };
    
    state.udp_sockets.lock().await.insert(id.clone(), tx);
    
    tauri::async_runtime::spawn(async move {
        let socket = Arc::new(tokio_socket);
        let mut connected_addr: Option<std::net::SocketAddr> = None;
        
        let _ = app.emit("plugin:net:udp", NetEventPayload {
            id: id_clone.clone(),
            event: "listening".to_string(),
            ..Default::default()
        });

        let mut buf = vec![0; 65535];
        loop {
            let socket_read = Arc::clone(&socket);
            tokio::select! {
                result = socket_read.recv_from(&mut buf) => {
                    match result {
                        Ok((n, peer_addr)) => {
                            if let Some(conn_addr) = connected_addr {
                                if peer_addr != conn_addr {
                                    continue;
                                }
                            }
                            
                            let _ = app.emit("plugin:net:udp", NetEventPayload {
                                id: id_clone.clone(),
                                event: "message".to_string(),
                                data: Some(buf[..n].to_vec()),
                                remote_address: Some(peer_addr.ip().to_string()),
                                remote_port: Some(peer_addr.port()),
                                family: Some(match peer_addr {
                                    std::net::SocketAddr::V4(_) => "IPv4".to_string(),
                                    std::net::SocketAddr::V6(_) => "IPv6".to_string(),
                                }),
                                ..Default::default()
                            });
                        }
                        Err(e) => {
                            let _ = app.emit("plugin:net:udp", NetEventPayload {
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
                        Some(UdpCommand::Send(data, host_opt, port_opt)) => {
                            let dest_addr = match (host_opt, port_opt) {
                                (Some(host), Some(port)) => {
                                    // IP literal → proper SocketAddr string (brackets IPv6);
                                    // otherwise keep host:port for DNS resolution in send_to.
                                    Some(match make_addr(&host, port) {
                                        Ok(addr) => addr.to_string(),
                                        Err(_) => format!("{}:{}", host, port),
                                    })
                                }
                                _ => {
                                    connected_addr.map(|addr| addr.to_string())
                                }
                            };
                            
                            if let Some(addr_str) = dest_addr {
                                let socket_write = Arc::clone(&socket);
                                if let Err(e) = socket_write.send_to(&data, &addr_str).await {
                                    let _ = app.emit("plugin:net:udp", NetEventPayload {
                                        id: id_clone.clone(),
                                        event: "error".to_string(),
                                        error: Some(e.to_string()),
                                        ..Default::default()
                                    });
                                }
                            } else {
                                let _ = app.emit("plugin:net:udp", NetEventPayload {
                                    id: id_clone.clone(),
                                    event: "error".to_string(),
                                    error: Some("Destination address is required for connectionless socket".to_string()),
                                    ..Default::default()
                                });
                            }
                        }
                        Some(UdpCommand::SetBroadcast(flag)) => {
                            if let Err(e) = socket.set_broadcast(flag) {
                                emit_udp_err(&app, &id_clone, e);
                            }
                        }
                        Some(UdpCommand::Connect(host, port, resp_tx)) => {
                            match make_addr(&host, port) {
                                Ok(addr) => {
                                    connected_addr = Some(addr);
                                    let _ = resp_tx.send(Ok(()));
                                    let _ = app.emit("plugin:net:udp", NetEventPayload {
                                        id: id_clone.clone(),
                                        event: "connect".to_string(),
                                        ..Default::default()
                                    });
                                }
                                Err(e) => {
                                    let _ = resp_tx.send(Err(e.to_string()));
                                }
                            }
                        }
                        Some(UdpCommand::Disconnect(resp_tx)) => {
                            connected_addr = None;
                            let _ = resp_tx.send(Ok(()));
                        }
                        Some(UdpCommand::AddMembership(multicast_addr, interface_opt)) => {
                            let res = match multicast_addr.parse::<std::net::IpAddr>() {
                                Ok(std::net::IpAddr::V4(addr)) => {
                                    let multi_if = interface_opt
                                        .and_then(|s| s.parse::<std::net::Ipv4Addr>().ok())
                                        .unwrap_or_else(|| std::net::Ipv4Addr::new(0, 0, 0, 0));
                                    socket.join_multicast_v4(addr, multi_if).map_err(|e| e.to_string())
                                }
                                Ok(std::net::IpAddr::V6(addr)) => {
                                    let if_index = interface_opt
                                        .and_then(|s| s.parse::<u32>().ok())
                                        .unwrap_or(0);
                                    socket.join_multicast_v6(&addr, if_index).map_err(|e| e.to_string())
                                }
                                Err(e) => Err(format!("Invalid multicast address {}: {}", multicast_addr, e)),
                            };
                            if let Err(e) = res {
                                emit_udp_err(&app, &id_clone, e);
                            }
                        }
                        Some(UdpCommand::DropMembership(multicast_addr, interface_opt)) => {
                            let res = match multicast_addr.parse::<std::net::IpAddr>() {
                                Ok(std::net::IpAddr::V4(addr)) => {
                                    let multi_if = interface_opt
                                        .and_then(|s| s.parse::<std::net::Ipv4Addr>().ok())
                                        .unwrap_or_else(|| std::net::Ipv4Addr::new(0, 0, 0, 0));
                                    socket.leave_multicast_v4(addr, multi_if).map_err(|e| e.to_string())
                                }
                                Ok(std::net::IpAddr::V6(addr)) => {
                                    let if_index = interface_opt
                                        .and_then(|s| s.parse::<u32>().ok())
                                        .unwrap_or(0);
                                    socket.leave_multicast_v6(&addr, if_index).map_err(|e| e.to_string())
                                }
                                Err(e) => Err(format!("Invalid multicast address {}: {}", multicast_addr, e)),
                            };
                            if let Err(e) = res {
                                emit_udp_err(&app, &id_clone, e);
                            }
                        }
                        Some(UdpCommand::SetTtl(ttl)) => {
                            if let Err(e) = socket.set_ttl(ttl) {
                                emit_udp_err(&app, &id_clone, e);
                            }
                        }
                        Some(UdpCommand::SetMulticastTtl(ttl)) => {
                            let _ = socket.set_multicast_ttl_v4(ttl);
                            #[cfg(unix)]
                            {
                                let raw_fd = socket.as_raw_fd();
                                let s2 = unsafe { socket2::Socket::from_raw_fd(raw_fd) };
                                let _ = s2.set_multicast_hops_v6(ttl);
                                std::mem::forget(s2);
                            }
                            #[cfg(windows)]
                            {
                                let raw_socket = socket.as_raw_socket();
                                let s2 = unsafe { socket2::Socket::from_raw_socket(raw_socket) };
                                let _ = s2.set_multicast_hops_v6(ttl);
                                std::mem::forget(s2);
                            }
                        }
                        Some(UdpCommand::SetMulticastLoopback(flag)) => {
                            let _ = socket.set_multicast_loop_v4(flag);
                            let _ = socket.set_multicast_loop_v6(flag);
                        }
                        Some(UdpCommand::SetRecvBufferSize(size)) => {
                            #[cfg(unix)]
                            {
                                let raw_fd = socket.as_raw_fd();
                                let s2 = unsafe { socket2::Socket::from_raw_fd(raw_fd) };
                                let _ = s2.set_recv_buffer_size(size);
                                std::mem::forget(s2);
                            }
                            #[cfg(windows)]
                            {
                                let raw_socket = socket.as_raw_socket();
                                let s2 = unsafe { socket2::Socket::from_raw_socket(raw_socket) };
                                let _ = s2.set_recv_buffer_size(size);
                                std::mem::forget(s2);
                            }
                        }
                        Some(UdpCommand::SetSendBufferSize(size)) => {
                            #[cfg(unix)]
                            {
                                let raw_fd = socket.as_raw_fd();
                                let s2 = unsafe { socket2::Socket::from_raw_fd(raw_fd) };
                                let _ = s2.set_send_buffer_size(size);
                                std::mem::forget(s2);
                            }
                            #[cfg(windows)]
                            {
                                let raw_socket = socket.as_raw_socket();
                                let s2 = unsafe { socket2::Socket::from_raw_socket(raw_socket) };
                                let _ = s2.set_send_buffer_size(size);
                                std::mem::forget(s2);
                            }
                        }
                        Some(UdpCommand::GetRecvBufferSize(resp_tx)) => {
                            let res = {
                                #[cfg(unix)]
                                {
                                    let raw_fd = socket.as_raw_fd();
                                    let s2 = unsafe { socket2::Socket::from_raw_fd(raw_fd) };
                                    let r = s2.recv_buffer_size().map_err(|e| e.to_string());
                                    std::mem::forget(s2);
                                    r
                                }
                                #[cfg(windows)]
                                {
                                    let raw_socket = socket.as_raw_socket();
                                    let s2 = unsafe { socket2::Socket::from_raw_socket(raw_socket) };
                                    let r = s2.recv_buffer_size().map_err(|e| e.to_string());
                                    std::mem::forget(s2);
                                    r
                                }
                            };
                            let _ = resp_tx.send(res);
                        }
                        Some(UdpCommand::GetSendBufferSize(resp_tx)) => {
                            let res = {
                                #[cfg(unix)]
                                {
                                    let raw_fd = socket.as_raw_fd();
                                    let s2 = unsafe { socket2::Socket::from_raw_fd(raw_fd) };
                                    let r = s2.send_buffer_size().map_err(|e| e.to_string());
                                    std::mem::forget(s2);
                                    r
                                }
                                #[cfg(windows)]
                                {
                                    let raw_socket = socket.as_raw_socket();
                                    let s2 = unsafe { socket2::Socket::from_raw_socket(raw_socket) };
                                    let r = s2.send_buffer_size().map_err(|e| e.to_string());
                                    std::mem::forget(s2);
                                    r
                                }
                            };
                            let _ = resp_tx.send(res);
                        }
                        Some(UdpCommand::Close) | None => {
                            break;
                        }
                    }
                }
            }
        }
        
        let _ = app.emit("plugin:net:udp", NetEventPayload {
            id: id_clone.clone(),
            event: "close".to_string(),
            ..Default::default()
        });

        if let Some(state_mutex) = app.try_state::<NetState>() {
            state_mutex.udp_sockets.lock().await.remove(&id_clone);
        }
    });

    Ok(UdpBindResult {
        id,
        local_address,
        local_port,
        family,
    })
}

#[tauri::command]
pub async fn udp_send(
    state: State<'_, NetState>,
    id: String,
    data: Vec<u8>,
    host: Option<String>,
    port: Option<u16>,
) -> Result<(), String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        tx.send(UdpCommand::Send(data, host, port)).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_close(
    state: State<'_, NetState>,
    id: String,
) -> Result<(), String> {
    let mut sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.remove(&id) {
        let _ = tx.send(UdpCommand::Close).await;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_connect(
    state: State<'_, NetState>,
    id: String,
    host: String,
    port: u16,
) -> Result<(), String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
        tx.send(UdpCommand::Connect(host, port, resp_tx)).await.map_err(|e| e.to_string())?;
        resp_rx.await.map_err(|e| e.to_string())?
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_disconnect(
    state: State<'_, NetState>,
    id: String,
) -> Result<(), String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
        tx.send(UdpCommand::Disconnect(resp_tx)).await.map_err(|e| e.to_string())?;
        resp_rx.await.map_err(|e| e.to_string())?
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_add_membership(
    state: State<'_, NetState>,
    id: String,
    multicast_address: String,
    multicast_interface: Option<String>,
) -> Result<(), String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        let _ = tx.send(UdpCommand::AddMembership(multicast_address, multicast_interface)).await;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_drop_membership(
    state: State<'_, NetState>,
    id: String,
    multicast_address: String,
    multicast_interface: Option<String>,
) -> Result<(), String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        let _ = tx.send(UdpCommand::DropMembership(multicast_address, multicast_interface)).await;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_set_broadcast(
    state: State<'_, NetState>,
    id: String,
    flag: bool,
) -> Result<(), String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        let _ = tx.send(UdpCommand::SetBroadcast(flag)).await;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_set_ttl(
    state: State<'_, NetState>,
    id: String,
    ttl: u32,
) -> Result<(), String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        tx.send(UdpCommand::SetTtl(ttl)).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_set_multicast_ttl(
    state: State<'_, NetState>,
    id: String,
    ttl: u32,
) -> Result<(), String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        tx.send(UdpCommand::SetMulticastTtl(ttl)).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_set_multicast_loopback(
    state: State<'_, NetState>,
    id: String,
    flag: bool,
) -> Result<(), String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        tx.send(UdpCommand::SetMulticastLoopback(flag)).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_set_recv_buffer_size(
    state: State<'_, NetState>,
    id: String,
    size: usize,
) -> Result<(), String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        tx.send(UdpCommand::SetRecvBufferSize(size)).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_set_send_buffer_size(
    state: State<'_, NetState>,
    id: String,
    size: usize,
) -> Result<(), String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        tx.send(UdpCommand::SetSendBufferSize(size)).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_get_recv_buffer_size(
    state: State<'_, NetState>,
    id: String,
) -> Result<usize, String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
        tx.send(UdpCommand::GetRecvBufferSize(resp_tx)).await.map_err(|e| e.to_string())?;
        resp_rx.await.map_err(|e| e.to_string())?
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn udp_get_send_buffer_size(
    state: State<'_, NetState>,
    id: String,
) -> Result<usize, String> {
    let sockets = state.udp_sockets.lock().await;
    if let Some(tx) = sockets.get(&id) {
        let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
        tx.send(UdpCommand::GetSendBufferSize(resp_tx)).await.map_err(|e| e.to_string())?;
        resp_rx.await.map_err(|e| e.to_string())?
    } else {
        Err("Socket not found".to_string())
    }
}

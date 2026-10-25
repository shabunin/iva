use super::tcp::NetEventPayload;
use super::{Conn, NetState};
use rustls::ClientConfig;
use rustls_pki_types::{CertificateDer, ServerName, UnixTime};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_rustls::TlsConnector;
use uuid::Uuid;

pub enum TlsCommand {
    Write(Vec<u8>),
    Shutdown,
    SetKeepAlive(bool, Option<u64>),
}

#[derive(Serialize)]
pub struct TlsConnectResult {
    pub id: String,
    pub remote_address: String,
    pub remote_port: u16,
    pub local_address: String,
    pub local_port: u16,
    pub family: String,
    pub authorized: bool,
    pub alpn_protocol: Option<String>,
}

/// Verifier that accepts any certificate (rejectUnauthorized: false).
#[derive(Debug)]
struct AcceptAnyCert;

impl rustls::client::danger::ServerCertVerifier for AcceptAnyCert {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

fn ensure_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

fn build_connector(
    reject_unauthorized: bool,
    alpn: Option<Vec<String>>,
) -> Result<TlsConnector, String> {
    ensure_crypto_provider();

    let mut config = if reject_unauthorized {
        let mut root_store = rustls::RootCertStore::empty();
        root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth()
    } else {
        ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(AcceptAnyCert))
            .with_no_client_auth()
    };

    if let Some(protos) = alpn {
        if !protos.is_empty() {
            config.alpn_protocols = protos.into_iter().map(|p| p.into_bytes()).collect();
        }
    }

    Ok(TlsConnector::from(Arc::new(config)))
}

/// TLS client connect (Node-shaped tls.connect).
/// Events: `plugin:net:tls` with same shape as TCP net events.
#[tauri::command]
pub async fn tls_connect<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, NetState>,
    host: String,
    port: u16,
    server_name: Option<String>,
    reject_unauthorized: Option<bool>,
    alpn: Option<Vec<String>>,
) -> Result<TlsConnectResult, String> {
    let reject = reject_unauthorized.unwrap_or(true);
    let sni = server_name.unwrap_or_else(|| host.clone());

    let addr = format!("{}:{}", host, port);
    let stream = super::connect(&addr)
        .await
        .map_err(|e| format!("connect failed: {}", e))?;

    let peer_addr = stream.peer_addr().map_err(|e| e.to_string())?;
    let local_addr = stream.local_addr().map_err(|e| e.to_string())?;
    let family = if peer_addr.is_ipv4() {
        "IPv4"
    } else {
        "IPv6"
    }
    .to_string();

    let connector = build_connector(reject, alpn)?;

    let server = ServerName::try_from(sni.clone())
        .map_err(|e| format!("EINVAL: invalid server name '{}': {}", sni, e))?;

    let tls_stream = connector
        .connect(server, stream)
        .await
        .map_err(|e| format!("TLS handshake failed: {}", e))?;

    let alpn_protocol = {
        let (_io, conn) = tls_stream.get_ref();
        conn.alpn_protocol()
            .map(|p| String::from_utf8_lossy(p).into_owned())
    };

    let id = Uuid::new_v4().to_string();
    let id_clone = id.clone();
    let (conn, mut rx, stop) = Conn::<TlsCommand>::new(32);
    state.tls_sockets.lock().await.insert(id.clone(), conn);

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut stream = tls_stream;
        let mut buf = vec![0u8; 4096];
        loop {
            tokio::select! {
                result = stream.read(&mut buf) => {
                    match result {
                        Ok(0) => {
                            let _ = app_clone.emit("plugin:net:tls", NetEventPayload {
                                id: id_clone.clone(),
                                event: "close".to_string(),
                                ..Default::default()
                            });
                            break;
                        }
                        Ok(n) => {
                            let _ = app_clone.emit("plugin:net:tls", NetEventPayload {
                                id: id_clone.clone(),
                                event: "data".to_string(),
                                data: Some(buf[..n].to_vec()),
                                ..Default::default()
                            });
                        }
                        Err(e) => {
                            let _ = app_clone.emit("plugin:net:tls", NetEventPayload {
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
                        Some(TlsCommand::Write(data)) => {
                            // closed while its peer doesn't take it: let go of
                            let Some(written) = super::unless_stopped(&stop, stream.write_all(&data)).await else { break };
                            if let Err(e) = written {
                                let _ = app_clone.emit("plugin:net:tls", NetEventPayload {
                                    id: id_clone.clone(),
                                    event: "error".to_string(),
                                    error: Some(e.to_string()),
                                    ..Default::default()
                                });
                                break;
                            }
                        }
                        Some(TlsCommand::Shutdown) => {
                            // (its close_notify waits for the peer to take what's before it)
                            let Some(shut) = super::unless_stopped(&stop, stream.shutdown()).await else { break };
                            if let Err(e) = shut {
                                let _ = app_clone.emit("plugin:net:tls", NetEventPayload {
                                    id: id_clone.clone(),
                                    event: "error".to_string(),
                                    error: Some(e.to_string()),
                                    ..Default::default()
                                });
                                break;
                            }
                            let _ = app_clone.emit("plugin:net:tls", NetEventPayload {
                                id: id_clone.clone(),
                                event: "finish".to_string(),
                                ..Default::default()
                            });
                        }
                        Some(TlsCommand::SetKeepAlive(enable, delay)) => {
                            let _ = super::keep_alive(socket2::SockRef::from(stream.get_ref().0), enable, delay);
                        }
                        // closed (tls_destroy, net_close_all): its sender gone
                        None => {
                            let _ = super::unless_stopped(&stop, stream.shutdown()).await;
                            break;
                        }
                    }
                }
            }
        }

        // a command still waiting to be taken fails now, not after the lock
        drop(rx);
        if let Some(state_mutex) = app_clone.try_state::<NetState>() {
            state_mutex.tls_sockets.lock().await.remove(&id_clone);
        }
    });

    Ok(TlsConnectResult {
        id,
        remote_address: peer_addr.ip().to_string(),
        remote_port: peer_addr.port(),
        local_address: local_addr.ip().to_string(),
        local_port: local_addr.port(),
        family,
        authorized: reject,
        alpn_protocol,
    })
}

#[tauri::command]
pub async fn tls_write(
    state: State<'_, NetState>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    if let Some(tx) = super::sender(&state.tls_sockets, &id).await {
        tx.send(TlsCommand::Write(data))
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn tls_shutdown(
    state: State<'_, NetState>,
    id: String,
) -> Result<(), String> {
    if let Some(tx) = super::sender(&state.tls_sockets, &id).await {
        tx.send(TlsCommand::Shutdown)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

#[tauri::command]
pub async fn tls_destroy(
    state: State<'_, NetState>,
    id: String,
) -> Result<(), String> {
    let conn = state.tls_sockets.lock().await.remove(&id);
    if let Some(conn) = conn {
        conn.close();
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

/// Keepalive on the TCP connection under it, as tcp_set_keep_alive.
#[tauri::command]
pub async fn tls_set_keep_alive(
    state: State<'_, NetState>,
    id: String,
    enable: bool,
    delay: Option<u64>,
) -> Result<(), String> {
    if let Some(tx) = super::sender(&state.tls_sockets, &id).await {
        tx.send(TlsCommand::SetKeepAlive(enable, delay))
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Socket not found".to_string())
    }
}

use std::collections::HashMap;
use axum::{
    extract::{Request, State},
    http::StatusCode,
    response::IntoResponse,
    routing::any,
    Router,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State as TauriState};
use tokio::sync::oneshot;
use uuid::Uuid;
use axum::extract::ws::{Message, WebSocketUpgrade};
use futures_util::{StreamExt, SinkExt};

use crate::plugins::http::{HttpResponsePayload, HttpState, WsConnection};

#[derive(Serialize, Clone)]
pub struct HttpRequestEvent {
    pub id: String,
    pub port: u16,
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

#[derive(Clone)]
struct ServerState {
    app: AppHandle,
    port: u16,
}

#[tauri::command]
pub async fn http_server_listen(
    app: AppHandle,
    state: TauriState<'_, HttpState>,
    port: u16,
) -> Result<(), String> {
    let mut servers = state.servers.lock().await;

    if servers.contains_key(&port) {
        return Err(format!("Server already listening on port {}", port));
    }

    let server_state = ServerState {
        app: app.clone(),
        port,
    };

    let router = Router::new()
        .fallback(any(handle_request))
        .with_state(server_state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .map_err(|e| e.to_string())?;

    let port_bound = listener.local_addr().map_err(|e| e.to_string())?.port();

    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    servers.insert(port_bound, handle);

    Ok(())
}

#[tauri::command]
pub async fn http_server_close(
    state: TauriState<'_, HttpState>,
    port: u16,
) -> Result<(), String> {
    let mut servers = state.servers.lock().await;
    if let Some(handle) = servers.remove(&port) {
        handle.abort();
        Ok(())
    } else {
        Err(format!("No server listening on port {}", port))
    }
}

async fn handle_request(
    State(state): State<ServerState>,
    req: Request,
) -> impl IntoResponse {
    let (mut parts, body) = req.into_parts();

    // Try extracting WebSocketUpgrade manually from request parts
    use axum::extract::FromRequestParts;
    if let Ok(ws) = WebSocketUpgrade::from_request_parts(&mut parts, &state).await {
        let uri = parts.uri.to_string();
        let mut headers = HashMap::new();
        for (k, v) in &parts.headers {
            if let Ok(v_str) = v.to_str() {
                headers.insert(k.as_str().to_string(), v_str.to_string());
            }
        }
        return ws.on_upgrade(move |socket| handle_ws_socket(socket, state, uri, headers)).into_response();
    }

    let request_id = Uuid::new_v4().to_string();
    let method = parts.method.to_string();
    let url = parts.uri.to_string();
    
    let mut headers = HashMap::new();
    for (k, v) in &parts.headers {
        if let Ok(v_str) = v.to_str() {
            headers.insert(k.as_str().to_string(), v_str.to_string());
        }
    }

    // Read the body, capped so a client can't exhaust memory
    const MAX_BODY: usize = 32 * 1024 * 1024;
    let body_bytes = match axum::body::to_bytes(body, MAX_BODY).await {
        Ok(b) => b,
        Err(_) => {
            return axum::http::Response::builder()
                .status(StatusCode::PAYLOAD_TOO_LARGE)
                .body(axum::body::Body::from("Payload too large"))
                .unwrap();
        }
    };

    let event = HttpRequestEvent {
        id: request_id.clone(),
        port: state.port,
        method,
        url,
        headers,
        body: body_bytes.to_vec(),
    };

    let (tx, rx) = oneshot::channel();

    {
        let http_state = state.app.state::<HttpState>();
        let mut pending = http_state.pending_requests.lock().await;
        pending.insert(request_id.clone(), tx);
    }

    // Emit event to JS
    let _ = state.app.emit("plugin:http:request", event);

    // Wait for JS to respond
    match rx.await {
        Ok(payload) => {
            let mut builder = axum::http::Response::builder()
                .status(StatusCode::from_u16(payload.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR));
            
            for (k, v) in payload.headers {
                builder = builder.header(k, v);
            }
            
            builder.body(axum::body::Body::from(payload.body)).unwrap()
        }
        Err(_) => {
            // JS side didn't respond or crashed
            axum::http::Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(axum::body::Body::from("Internal Server Error (No response from JS)"))
                .unwrap()
        }
    }
}

#[derive(Serialize, Clone)]
struct WsConnectionEvent {
    #[serde(rename = "connectionId")]
    connection_id: String,
    port: u16,
    url: String,
    headers: HashMap<String, String>,
}

#[derive(Serialize, Clone)]
struct WsMessageEvent {
    #[serde(rename = "connectionId")]
    connection_id: String,
    #[serde(rename = "type")]
    msg_type: String,
    data: Option<String>,
    binary: Option<Vec<u8>>,
}

#[derive(Serialize, Clone)]
struct WsCloseEvent {
    #[serde(rename = "connectionId")]
    connection_id: String,
}

async fn handle_ws_socket(
    socket: axum::extract::ws::WebSocket,
    state: ServerState,
    uri: String,
    headers: HashMap<String, String>,
) {
    let connection_id = Uuid::new_v4().to_string();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

    // Insert connection into global state
    {
        let http_state = state.app.state::<HttpState>();
        let mut conns = http_state.ws_connections.lock().await;
        conns.insert(connection_id.clone(), WsConnection { tx });
    }

    // Split the websocket stream/sink
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Emit ws:connection event to JS
    let _ = state.app.emit("plugin:ws:connection", WsConnectionEvent {
        connection_id: connection_id.clone(),
        port: state.port,
        url: uri,
        headers,
    });

    let app_clone = state.app.clone();
    let conn_id_clone = connection_id.clone();

    // Receive loop: listen for messages from client, send to JS
    let mut receive_task = tokio::spawn(async move {
        while let Some(result) = ws_receiver.next().await {
            match result {
                Ok(msg) => {
                    let event_payload = match msg {
                        Message::Text(txt) => {
                            Some(WsMessageEvent {
                                connection_id: conn_id_clone.clone(),
                                msg_type: "text".to_string(),
                                data: Some(txt.as_str().to_string()),
                                binary: None,
                            })
                        }
                        Message::Binary(bin) => {
                            Some(WsMessageEvent {
                                connection_id: conn_id_clone.clone(),
                                msg_type: "binary".to_string(),
                                data: None,
                                binary: Some(bin.to_vec()),
                            })
                        }
                        Message::Close(_) => {
                            break;
                        }
                        _ => None,
                    };

                    if let Some(payload) = event_payload {
                        let _ = app_clone.emit("plugin:ws:message", payload);
                    }
                }
                Err(_) => {
                    break;
                }
            }
        }
    });

    // Send loop: listen for messages from JS (via channel), send to client
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Err(_) = ws_sender.send(msg).await {
                break;
            }
        }
    });

    // Wait until either loop ends, then abort the other
    tokio::select! {
        _ = &mut receive_task => {
            send_task.abort();
        }
        _ = &mut send_task => {
            receive_task.abort();
        }
    }

    // Clean up connection from global state
    {
        let http_state = state.app.state::<HttpState>();
        let mut conns = http_state.ws_connections.lock().await;
        conns.remove(&connection_id);
    }

    // Emit ws:close event to JS
    let _ = state.app.emit("plugin:ws:close", WsCloseEvent {
        connection_id,
    });
}

#[derive(Deserialize)]
pub struct HttpResponseCommandArgs {
    pub id: String,
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

#[tauri::command]
pub async fn http_server_respond(
    state: TauriState<'_, HttpState>,
    args: HttpResponseCommandArgs,
) -> Result<(), String> {
    let mut pending = state.pending_requests.lock().await;
    if let Some(tx) = pending.remove(&args.id) {
        let payload = HttpResponsePayload {
            status: args.status,
            headers: args.headers,
            body: args.body,
        };
        let _ = tx.send(payload);
        Ok(())
    } else {
        Err(format!("No pending request found for id {}", args.id))
    }
}

#[tauri::command]
pub async fn ws_send_message(
    state: TauriState<'_, HttpState>,
    connection_id: String,
    message_type: String,
    text_data: Option<String>,
    binary_data: Option<Vec<u8>>,
) -> Result<(), String> {
    let ws_connections = state.ws_connections.lock().await;
    if let Some(conn) = ws_connections.get(&connection_id) {
        let msg = match message_type.as_str() {
            "text" => Message::Text(axum::extract::ws::Utf8Bytes::from(text_data.unwrap_or_default())),
            "binary" => Message::Binary(bytes::Bytes::from(binary_data.unwrap_or_default())),
            _ => return Err("Invalid message type".to_string()),
        };
        conn.tx.send(msg).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Connection not found".to_string())
    }
}

#[tauri::command]
pub async fn ws_close_connection(
    state: TauriState<'_, HttpState>,
    connection_id: String,
) -> Result<(), String> {
    let mut ws_connections = state.ws_connections.lock().await;
    if let Some(_conn) = ws_connections.remove(&connection_id) {
        Ok(())
    } else {
        Err("Connection not found".to_string())
    }
}

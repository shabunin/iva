// iva panel: iViewer (.gui) projects on iva's own runtime (../../src/runtime).
// The page runs the GUI; this side gives it real sockets - the commands the
// runtime's host classes invoke (agapi's, by the same names and payloads).
mod atlas;
mod plugins;
mod unpack;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_opener::init())
        .manage(unpack::Guis::default())
        .invoke_handler(tauri::generate_handler![
            plugins::net::tcp::tcp_connect,
            plugins::net::tcp::tcp_write,
            plugins::net::tcp::tcp_destroy,
            plugins::net::tcp::tcp_shutdown,
            plugins::net::tcp::tcp_listen,
            plugins::net::tcp::tcp_server_close,
            plugins::net::net_close_all,
            plugins::net::tcp::tcp_set_keep_alive,
            plugins::net::tcp::tcp_set_no_delay,
            plugins::net::dns::dns_lookup,
            plugins::net::device::device_info,
            plugins::net::tls::tls_connect,
            plugins::net::tls::tls_write,
            plugins::net::tls::tls_shutdown,
            plugins::net::tls::tls_destroy,
            plugins::net::tls::tls_set_keep_alive,
            plugins::net::udp::udp_bind,
            plugins::net::udp::udp_send,
            plugins::net::udp::udp_close,
            plugins::net::udp::udp_add_membership,
            plugins::net::udp::udp_drop_membership,
            plugins::net::udp::udp_set_broadcast,
            plugins::net::udp::udp_connect,
            plugins::net::udp::udp_disconnect,
            plugins::net::udp::udp_set_ttl,
            plugins::net::udp::udp_set_multicast_ttl,
            plugins::net::udp::udp_set_multicast_loopback,
            plugins::net::udp::udp_set_recv_buffer_size,
            plugins::net::udp::udp_set_send_buffer_size,
            plugins::net::udp::udp_get_recv_buffer_size,
            plugins::net::udp::udp_get_send_buffer_size,
            plugins::http::server::http_server_listen,
            plugins::http::server::http_server_close,
            plugins::http::server::http_server_respond,
            plugins::http::server::ws_send_message,
            plugins::http::server::ws_close_connection,
            unpack::gui_upload_begin,
            unpack::gui_upload,
            unpack::gui_fetch,
            unpack::gui_kept,
            unpack::gui_archive,
            unpack::gui_archive_text,
            unpack::gui_unpack,
            unpack::gui_pack,
            unpack::gui_unpacked,
            unpack::gui_keep_parsed,
            unpack::gui_forget,
        ])
        .setup(|app| {
            plugins::net::init_state(app.handle());
            plugins::http::init_state(app.handle());
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running iva panel");
}

//! The device and its network as iViewer hands them to scripts: CF.device
//! (platform, version, model, name, uuid) and CF.ipv4address, ipv4netmask,
//! ipv6address, ipv6netmask, MACaddress, networkType, networkSSID.
//!
//! The network is the main interface's - Wi-Fi first, then a wired LAN, a
//! VPN, the mobile network - told apart by interface names (as agapi's
//! device.rs). No SSID, no MAC: Android keeps both from apps without
//! permissions this doesn't ask for (iViewer leaves them empty then too).
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

/// An Android system property (ro.product.model ...): "" where there's none.
#[cfg(target_os = "android")]
fn prop(name: &str) -> String {
    use std::ffi::{CStr, CString};
    let Ok(key) = CString::new(name) else { return String::new() };
    // PROP_VALUE_MAX
    let mut buf = [0 as libc::c_char; 92];
    let n = unsafe { libc::__system_property_get(key.as_ptr(), buf.as_mut_ptr()) };
    if n <= 0 {
        return String::new();
    }
    unsafe { CStr::from_ptr(buf.as_ptr()) }.to_string_lossy().trim().to_string()
}

/// (platform, OS version, model, name) - iViewer's platform names
fn os_info() -> (String, String, String, String) {
    #[cfg(target_os = "android")]
    {
        let model = prop("ro.product.model");
        let maker = prop("ro.product.manufacturer");
        let name = if maker.is_empty() || model.to_lowercase().starts_with(&maker.to_lowercase()) {
            model.clone()
        } else {
            format!("{maker} {model}")
        };
        return ("Android".into(), prop("ro.build.version.release"), model, name);
    }
    #[cfg(not(target_os = "android"))]
    {
        let platform = match std::env::consts::OS {
            "linux" => "Linux",
            "windows" => "Windows",
            "macos" => "macOS",
            "ios" => "iOS",
            other => other,
        };
        let host = hostname::get().map(|h| h.to_string_lossy().into_owned()).unwrap_or_default();
        (platform.into(), String::new(), host.clone(), host)
    }
}

/// This device's ID: made once, kept in the app's data folder.
fn device_id<R: Runtime>(app: &AppHandle<R>) -> String {
    let file: Option<PathBuf> = app.path().app_data_dir().ok().map(|d| d.join("device-id"));
    if let Some(f) = &file {
        if let Ok(id) = std::fs::read_to_string(f) {
            let id = id.trim().to_string();
            if !id.is_empty() {
                return id;
            }
        }
    }
    let id = uuid::Uuid::new_v4().to_string().to_uppercase();
    if let Some(f) = &file {
        if let Some(dir) = f.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(f, &id);
    }
    id
}

/// An interface's rank (lower: the main one) and its network type, by its name.
fn kind_of(name: &str) -> (u8, &'static str) {
    let n = name.to_lowercase();
    if n.starts_with("wl") || n.starts_with("swlan") || n.starts_with("ap") || n.contains("wi-fi") || n.contains("wifi") {
        (0, "WiFi")
    } else if n.starts_with("eth") || n.starts_with("en") || n.contains("ethernet") {
        // a wired LAN: the local network, as Wi-Fi is
        (1, "WiFi")
    } else if n.starts_with("tun") || n.starts_with("zt") || n.starts_with("wg") || n.starts_with("ppp") || n.starts_with("utun") || n.contains("tailscale") {
        (2, "VPN")
    } else if n.starts_with("rmnet") || n.starts_with("ccmni") || n.starts_with("pdp") || n.starts_with("wwan") || n.starts_with("seth") {
        (3, "WAN")
    } else {
        (1, "WiFi")
    }
}

/// The device's IPv4 networks to look for iva serve on (the settings' Found
/// on the network): (name, address, netmask, type), the main one first as
/// device_info ranks them - not loopback, not the mobile network's (no one
/// serves a GUI there, and a query there costs data).
pub fn lan_networks(list: &[(String, std::net::Ipv4Addr, std::net::Ipv4Addr)]) -> Vec<(String, std::net::Ipv4Addr, std::net::Ipv4Addr, &'static str)> {
    let mut out: Vec<_> = list
        .iter()
        .filter(|(_, ip, _)| !ip.is_loopback() && !ip.is_unspecified() && !ip.is_link_local())
        .map(|(name, ip, mask)| (name.clone(), *ip, *mask, kind_of(name)))
        .filter(|(_, _, _, (_, kind))| *kind != "WAN")
        .map(|(name, ip, mask, (rank, kind))| (rank, name, ip, mask, kind))
        .collect();
    out.sort_by_key(|(rank, ..)| *rank);
    out.into_iter().map(|(_, name, ip, mask, kind)| (name, ip, mask, kind)).collect()
}

#[tauri::command]
pub fn net_interfaces() -> Result<Vec<serde_json::Value>, String> {
    let interfaces = if_addrs::get_if_addrs().map_err(|e| format!("get_if_addrs: {e}"))?;
    let v4: Vec<_> = interfaces
        .iter()
        .filter_map(|i| if let if_addrs::IfAddr::V4(v4) = &i.addr { Some((i.name.clone(), v4.ip, v4.netmask)) } else { None })
        .collect();
    Ok(lan_networks(&v4)
        .into_iter()
        .map(|(name, ip, mask, kind)| serde_json::json!({ "name": name, "address": ip.to_string(), "netmask": mask.to_string(), "type": kind }))
        .collect())
}

#[tauri::command]
pub fn device_info<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value, String> {
    let (platform, version, model, name) = os_info();
    let interfaces = if_addrs::get_if_addrs().map_err(|e| format!("get_if_addrs: {e}"))?;
    // the main interface: the best ranked with an IPv4 address
    let main = interfaces
        .iter()
        .filter(|i| !i.is_loopback() && matches!(i.addr, if_addrs::IfAddr::V4(_)))
        .min_by_key(|i| kind_of(&i.name).0);
    let (mut ipv4, mut ipv4mask, mut ipv6, mut ipv6mask, mut kind) = (String::new(), String::new(), String::new(), String::new(), "None");
    if let Some(m) = main {
        kind = kind_of(&m.name).1;
        if let if_addrs::IfAddr::V4(v4) = &m.addr {
            ipv4 = v4.ip.to_string();
            ipv4mask = v4.netmask.to_string();
        }
        // its IPv6 address: a global one before a link-local one
        let mut v6s: Vec<&if_addrs::Ifv6Addr> = interfaces
            .iter()
            .filter(|i| i.name == m.name)
            .filter_map(|i| if let if_addrs::IfAddr::V6(v6) = &i.addr { Some(v6) } else { None })
            .collect();
        v6s.sort_by_key(|v6| (v6.ip.segments()[0] & 0xffc0) == 0xfe80);
        if let Some(v6) = v6s.first() {
            ipv6 = v6.ip.to_string();
            ipv6mask = v6.netmask.to_string();
        }
    }
    Ok(serde_json::json!({
        "platform": platform,
        "version": version,
        "model": model,
        "name": name,
        "uuid": device_id(&app),
        "ipv4address": ipv4,
        "ipv4netmask": ipv4mask,
        "ipv6address": ipv6,
        "ipv6netmask": ipv6mask,
        "MACaddress": "",
        "networkType": kind,
        "networkSSID": "",
    }))
}

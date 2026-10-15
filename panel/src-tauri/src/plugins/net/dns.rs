use serde::Serialize;
use std::net::SocketAddr;

#[derive(Debug, Clone, Serialize)]
pub struct DnsAddress {
    pub address: String,
    /// 4 or 6 — Node dns.lookup family style
    pub family: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum DnsLookupResult {
    One(DnsAddress),
    All(Vec<DnsAddress>),
}

/// Resolve hostname via the OS resolver (tokio lookup_host).
///
/// Node-shaped: dns.lookup(hostname, { family, all }).
/// - family: 0/undefined = any, 4 = IPv4, 6 = IPv6
/// - all: true → array of addresses; false → first match
#[tauri::command]
pub async fn dns_lookup(
    hostname: String,
    family: Option<u32>,
    all: Option<bool>,
) -> Result<DnsLookupResult, String> {
    let host = hostname.trim();
    if host.is_empty() {
        return Err("ENOTFOUND: empty hostname".to_string());
    }

    // If already an IP, short-circuit (Node does this too)
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        let fam = if ip.is_ipv4() { 4 } else { 6 };
        if let Some(want) = family {
            if want != 0 && want != fam {
                return Err(format!(
                    "ENOTFOUND: address family mismatch for {}",
                    host
                ));
            }
        }
        let addr = DnsAddress {
            address: ip.to_string(),
            family: fam,
        };
        return Ok(if all.unwrap_or(false) {
            DnsLookupResult::All(vec![addr])
        } else {
            DnsLookupResult::One(addr)
        });
    }

    // Port 0 is fine for pure name resolution
    let query = format!("{}:0", host);
    let iter = tokio::net::lookup_host(&query)
        .await
        .map_err(|e| format!("ENOTFOUND: {}", e))?;

    let want = family.unwrap_or(0);
    let mut addrs: Vec<DnsAddress> = Vec::new();

    for sa in iter {
        let (address, fam) = match sa {
            SocketAddr::V4(v4) => (v4.ip().to_string(), 4u32),
            SocketAddr::V6(v6) => (v6.ip().to_string(), 6u32),
        };
        if want == 0 || want == fam {
            // de-dupe
            if !addrs.iter().any(|a| a.address == address && a.family == fam) {
                addrs.push(DnsAddress { address, family: fam });
            }
        }
    }

    if addrs.is_empty() {
        return Err(format!("ENOTFOUND: {}", host));
    }

    if all.unwrap_or(false) {
        Ok(DnsLookupResult::All(addrs))
    } else {
        Ok(DnsLookupResult::One(addrs.remove(0)))
    }
}

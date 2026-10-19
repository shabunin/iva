// A GUI's archive unpacked on the device - the size the screen runs, one
// folder per GUI and version in the app's data (unpacked/<GUI>/<version>/gui/)
// - and its images packed into sheets there (atlas.rs), behind the GUI
// running: the page's first start runs from the archive, the starts after
// that from the folder (the asset protocol: each file by its URL), its
// images in sheets. The archive comes from the page (gui_upload, in pieces:
// an Android web view hands the app strings, not bytes), or is the app's
// own (the built-in demo, among its assets). Events: iva-gui-unpacked,
// iva-gui-packing (groups done, of how many), iva-gui-packed.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use base64::Engine;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::atlas;

#[derive(Default)]
pub struct Guis {
    uploads: Mutex<HashMap<u32, Vec<u8>>>,
    next: AtomicU32,
    /// the version folders being unpacked or packed now
    busy: Mutex<HashSet<PathBuf>>,
}

/// What the page asks to unpack.
#[derive(serde::Deserialize, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UnpackArgs {
    /// the GUI (its URL) and its version (the archive's, the screen's): another, another folder
    id: String,
    version: String,
    /// the app's own file (the built-in demo: /demo/x.gui.zip) ...
    #[serde(default)]
    asset: Option<String>,
    /// ... or what the page sent (gui_upload)
    #[serde(default)]
    upload: Option<u32>,
    /// the archive's files to unpack (the size run)
    files: Vec<String>,
    /// where the sheets go (beside the .gui: 1400w1400h/iva-atlas)
    atlas: String,
    /// the images to pack: [file, name in the .gui, group], in the groups' order
    images: Vec<[String; 3]>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Unpacked {
    /// the folder the files are in
    root: String,
    files: Vec<String>,
    /// its sheets made (atlas.json there)
    packed: bool,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Event {
    id: String,
    version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ms: Option<u128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    done: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sheets: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    images: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl Event {
    fn of(a: &UnpackArgs) -> Self {
        Event { id: a.id.clone(), version: a.version.clone(), ms: None, done: None, total: None, sheets: None, images: None, error: None }
    }
}

/// a name for a folder: FNV-1a, 64 bits
fn hash(s: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h = (h ^ b as u64).wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

fn root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("unpacked"))
}

/// a GUI's folder, and its version's
fn folders<R: Runtime>(app: &AppHandle<R>, id: &str, version: &str) -> Result<(PathBuf, PathBuf), String> {
    let gui = root(app)?.join(hash(id));
    let ver = gui.join(hash(version));
    Ok((gui, ver))
}

/// a path in the archive as one under the folder: relative, no '..'
fn safe(name: &str) -> Option<PathBuf> {
    let p = Path::new(name);
    p.components().all(|c| matches!(c, Component::Normal(_))).then(|| p.to_path_buf())
}

/// A zip archive's entries: stored or deflated (no zip64, no encryption), by name.
struct Zip<'a> {
    data: &'a [u8],
    entries: HashMap<String, (u16, usize, usize)>,
}

impl<'a> Zip<'a> {
    fn open(data: &'a [u8]) -> Result<Self, String> {
        let u16_at = |i: usize| u16::from_le_bytes([data[i], data[i + 1]]);
        let u32_at = |i: usize| u32::from_le_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]);
        if data.len() < 22 {
            return Err("not a zip archive".into());
        }
        // the end of central directory record: the last PK\5\6 (after it, at most a comment)
        let low = data.len().saturating_sub(22 + 0xffff);
        let end = (low..=data.len() - 22).rev().find(|&i| u32_at(i) == 0x06054b50).ok_or("not a zip archive")?;
        let count = u16_at(end + 10) as usize;
        let mut at = u32_at(end + 16) as usize;
        let mut entries = HashMap::new();
        for _ in 0..count {
            if at + 46 > data.len() || u32_at(at) != 0x02014b50 {
                return Err("a broken zip archive".into());
            }
            let method = u16_at(at + 10);
            let size = u32_at(at + 20) as usize;
            let name_len = u16_at(at + 28) as usize;
            let local = u32_at(at + 42) as usize;
            let name = String::from_utf8_lossy(&data[at + 46..at + 46 + name_len]).into_owned();
            at += 46 + name_len + u16_at(at + 30) as usize + u16_at(at + 32) as usize;
            if name.ends_with('/') || local + 30 > data.len() {
                continue;
            }
            let start = local + 30 + u16_at(local + 26) as usize + u16_at(local + 28) as usize;
            if start + size <= data.len() {
                entries.insert(name, (method, start, size));
            }
        }
        Ok(Zip { data, entries })
    }

    fn read(&self, name: &str) -> Result<Vec<u8>, String> {
        let &(method, start, size) = self.entries.get(name).ok_or_else(|| format!("{name}: not in the archive"))?;
        let body = &self.data[start..start + size];
        match method {
            0 => Ok(body.to_vec()),
            8 => {
                let mut out = Vec::new();
                flate2::read::DeflateDecoder::new(body).read_to_end(&mut out).map_err(|e| format!("{name}: {e}"))?;
                Ok(out)
            }
            m => Err(format!("{name}: zip compression {m} isn't supported")),
        }
    }
}

/// A new upload: its pieces come with gui_upload, its token goes to gui_unpack.
#[tauri::command]
pub fn gui_upload_begin(state: State<'_, Guis>) -> u32 {
    let token = state.next.fetch_add(1, Ordering::SeqCst) + 1;
    state.uploads.lock().unwrap().insert(token, Vec::new());
    token
}

/// A piece of an upload, base64.
#[tauri::command]
pub fn gui_upload(state: State<'_, Guis>, token: u32, data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    let mut uploads = state.uploads.lock().unwrap();
    uploads.get_mut(&token).ok_or("no such upload")?.extend_from_slice(&bytes);
    Ok(())
}

/// The files unpacked into the version's folder, and what they are (meta.json: written last - there, they are).
fn unpack_files<R: Runtime>(app: &AppHandle<R>, a: &UnpackArgs, ver: &Path) -> Result<usize, String> {
    let bytes = match (&a.asset, a.upload) {
        (Some(path), _) => app.asset_resolver().get(path.clone()).ok_or_else(|| format!("{path}: not among the app's files"))?.bytes,
        (None, Some(token)) => app.state::<Guis>().uploads.lock().unwrap().remove(&token).ok_or("no such upload")?,
        _ => return Err("no archive".into()),
    };
    let zip = Zip::open(&bytes)?;
    let _ = fs::remove_dir_all(ver);
    let dir = ver.join("gui");
    let mut n = 0;
    for name in &a.files {
        let Some(rel) = safe(name) else { continue };
        let data = match zip.read(name) {
            Ok(d) => d,
            Err(_) => continue,
        };
        let to = dir.join(rel);
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&to, data).map_err(|e| e.to_string())?;
        n += 1;
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(ver.join("meta.json"), serde_json::to_vec(a).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(n)
}

/// Its images packed into sheets beside its .gui.
fn pack_images<R: Runtime>(app: &AppHandle<R>, a: &UnpackArgs, ver: &Path) {
    let t0 = Instant::now();
    let dir = ver.join("gui");
    let files: HashSet<&str> = a.files.iter().map(|s| s.as_str()).collect();
    let inputs = a
        .images
        .iter()
        .filter(|[file, ..]| files.contains(file.as_str()))
        .filter_map(|[file, name, group]| Some(atlas::Input { file: dir.join(safe(file)?), name: name.clone(), group: group.clone() }))
        .collect();
    let Some(out) = safe(&a.atlas).map(|p| dir.join(p)) else { return };
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).saturating_sub(2).clamp(1, 3);
    let progress = |done, total| {
        let _ = app.emit("iva-gui-packing", Event { done: Some(done), total: Some(total), ..Event::of(a) });
    };
    let mut e = Event::of(a);
    match atlas::pack(inputs, &out, threads, &progress) {
        Ok(map) => {
            e.sheets = Some(map.sheets.len());
            e.images = Some(map.frames.len());
            log::info!("[iva] {} packed: {} images in {} sheets, {} ms", a.id, map.frames.len(), map.sheets.len(), t0.elapsed().as_millis());
        }
        Err(err) => e.error = Some(err.to_string()),
    }
    e.ms = Some(t0.elapsed().as_millis());
    let _ = app.emit("iva-gui-packed", e);
}

/// unpacked (if it isn't) and packed, in a thread of its own - one at a time a folder
fn work<R: Runtime>(app: AppHandle<R>, a: UnpackArgs, unpack: bool) -> Result<(), String> {
    let (gui, ver) = folders(&app, &a.id, &a.version)?;
    if !app.state::<Guis>().busy.lock().unwrap().insert(ver.clone()) {
        return Ok(());
    }
    std::thread::spawn(move || {
        if unpack {
            let t0 = Instant::now();
            let mut e = Event::of(&a);
            match unpack_files(&app, &a, &ver) {
                Ok(n) => {
                    e.done = Some(n);
                    // its other versions go
                    for old in fs::read_dir(&gui).into_iter().flatten().flatten() {
                        if old.path() != ver {
                            let _ = fs::remove_dir_all(old.path());
                        }
                    }
                }
                Err(err) => e.error = Some(err),
            }
            e.ms = Some(t0.elapsed().as_millis());
            let failed = e.error.is_some();
            let _ = app.emit("iva-gui-unpacked", e);
            if failed {
                app.state::<Guis>().busy.lock().unwrap().remove(&ver);
                return;
            }
        }
        pack_images(&app, &a, &ver);
        app.state::<Guis>().busy.lock().unwrap().remove(&ver);
    });
    Ok(())
}

/// The archive's files unpacked and its images packed, behind the GUI running (the events say how far it got).
#[tauri::command]
pub fn gui_unpack<R: Runtime>(app: AppHandle<R>, args: UnpackArgs) -> Result<(), String> {
    let (_, ver) = folders(&app, &args.id, &args.version)?;
    if ver.join("meta.json").exists() {
        // unpacked already: packed, if it isn't
        return gui_unpacked(app, args.id, args.version).map(|_| ());
    }
    work(app, args, true)
}

/// The GUI's files unpacked from this version, if they are: where, which, whether its images are in sheets
/// yet (if they aren't, and nothing is packing them - the app stopped meanwhile - they're packed now).
#[tauri::command]
pub fn gui_unpacked<R: Runtime>(app: AppHandle<R>, id: String, version: String) -> Result<Option<Unpacked>, String> {
    let (_, ver) = folders(&app, &id, &version)?;
    let Ok(meta) = fs::read(ver.join("meta.json")) else { return Ok(None) };
    let a: UnpackArgs = serde_json::from_slice(&meta).map_err(|e| e.to_string())?;
    if a.id != id || a.version != version {
        return Ok(None);
    }
    let dir = ver.join("gui");
    let packed = safe(&a.atlas).is_some_and(|p| dir.join(p).join("atlas.json").exists());
    let files = a.files.iter().filter(|f| safe(f).is_some_and(|p| dir.join(p).is_file())).cloned().collect();
    if !packed {
        work(app, a, false)?;
    }
    Ok(Some(Unpacked { root: dir.to_string_lossy().into_owned(), files, packed }))
}

/// A GUI's files unpacked let go - every GUI's, without one.
#[tauri::command]
pub fn gui_forget<R: Runtime>(app: AppHandle<R>, id: Option<String>) -> Result<(), String> {
    let dir = match id {
        Some(id) => root(&app)?.join(hash(&id)),
        None => root(&app)?,
    };
    match fs::remove_dir_all(&dir) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// a zip of these files, the first stored, the others deflated
    fn zip_of(files: &[(&str, &[u8])]) -> Vec<u8> {
        use std::io::Write;
        let (mut out, mut central) = (Vec::new(), Vec::new());
        for (i, (name, data)) in files.iter().enumerate() {
            let body = if i == 0 {
                data.to_vec()
            } else {
                let mut e = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
                e.write_all(data).unwrap();
                e.finish().unwrap()
            };
            let method: u16 = if i == 0 { 0 } else { 8 };
            let offset = out.len() as u32;
            out.extend(0x04034b50u32.to_le_bytes());
            out.extend([20, 0, 0, 0]);
            out.extend(method.to_le_bytes());
            out.extend([0; 8]); // time, date, crc
            out.extend((body.len() as u32).to_le_bytes());
            out.extend((data.len() as u32).to_le_bytes());
            out.extend((name.len() as u16).to_le_bytes());
            out.extend([0, 0]);
            out.extend(name.as_bytes());
            out.extend(&body);
            central.extend(0x02014b50u32.to_le_bytes());
            central.extend([20, 0, 20, 0, 0, 0]);
            central.extend(method.to_le_bytes());
            central.extend([0; 8]);
            central.extend((body.len() as u32).to_le_bytes());
            central.extend((data.len() as u32).to_le_bytes());
            central.extend((name.len() as u16).to_le_bytes());
            central.extend([0; 12]);
            central.extend(offset.to_le_bytes());
            central.extend(name.as_bytes());
        }
        let at = out.len() as u32;
        out.extend(&central);
        out.extend(0x06054b50u32.to_le_bytes());
        out.extend([0; 4]);
        out.extend((files.len() as u16).to_le_bytes());
        out.extend((files.len() as u16).to_le_bytes());
        out.extend((central.len() as u32).to_le_bytes());
        out.extend(at.to_le_bytes());
        out.extend([0, 0]);
        out
    }

    #[test]
    fn zip_entries_stored_and_deflated() {
        let z = zip_of(&[("a.gui", b"<gui/>"), ("images/b.js", b"var b = 1; var b = 1; var b = 1;")]);
        let zip = Zip::open(&z).unwrap();
        assert_eq!(zip.read("a.gui").unwrap(), b"<gui/>");
        assert_eq!(zip.read("images/b.js").unwrap(), b"var b = 1; var b = 1; var b = 1;");
        assert!(zip.read("c").is_err());
        assert!(Zip::open(b"not a zip, not at all").is_err());
    }

    #[test]
    fn only_paths_under_the_folder() {
        assert!(safe("images/a.png").is_some());
        assert!(safe("../a.png").is_none());
        assert!(safe("/etc/a").is_none());
        assert!(safe("a/../../b").is_none());
    }
}

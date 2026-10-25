// A GUI's archive unpacked on the device - the size the screen runs, one
// folder per GUI, version and size in the app's data
// (unpacked/<GUI>/<version>/<size>/gui/: a GUI in several sizes keeps the one
// for each orientation it was run in) - and its images packed into sheets
// there (atlas.rs). The page runs the
// GUI from that folder (the asset protocol: each file by its URL), at once
// on its first start, its images one by one while they're packed behind it,
// in sheets from the next start on. A zipped GUI from a server (iva serve's
// whole build too) the app downloads itself, straight to the GUI's folder
// (gui_fetch: unpacked/<GUI>/kept.zip, kept.json what it is) - it stays
// there as the GUI's copy, the size for the other orientation unpacked from
// it when the device turns - and the page only asks what's in it
// (gui_archive, gui_archive_text: its .gui, to choose a size). The built-in
// demo is among the app's assets; a copy an older panel kept in the page
// comes from the page (gui_upload, in pieces: an Android web view hands the
// app strings, not bytes). Events: iva-gui-download (bytes come, of how
// many), iva-gui-packing (groups done, of how many), iva-gui-packed.

use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Cursor, Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::Engine;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_http::reqwest;
use tokio::io::AsyncWriteExt;

use crate::atlas;

#[derive(Default)]
pub struct Guis {
    uploads: Mutex<HashMap<u32, Vec<u8>>>,
    next: AtomicU32,
    /// the version folders being unpacked or packed now, the GUIs' archives being downloaded
    busy: Mutex<HashSet<PathBuf>>,
    /// what downloads the archives (made once)
    client: OnceLock<reqwest::Client>,
}

/// What the page asks to unpack (and what's unpacked: meta.json).
#[derive(serde::Deserialize, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UnpackArgs {
    /// the GUI (its URL) and its version (the archive's, the screen's): another, another folder
    id: String,
    version: String,
    /// the size run (its folder in the archive: '' for the first, '1080w1920h/'): each its own folder
    #[serde(default)]
    size: String,
    /// the app's own file (the built-in demo: /demo/x.gui.zip) ...
    #[serde(default, skip_serializing)]
    asset: Option<String>,
    /// ... or what the page sent (gui_upload) ...
    #[serde(default, skip_serializing)]
    upload: Option<u32>,
    /// ... or a GUI's copy the app keeps (gui_fetch)
    #[serde(default, skip_serializing)]
    kept: Option<KeptAt>,
    /// that copy let go once unpacked (a GUI no copy is kept of)
    #[serde(default, skip_serializing)]
    drop: bool,
    /// the archive's files to unpack (the size run)
    files: Vec<String>,
    /// where its sheets go (beside the .gui: 1400w1400h/iva-atlas)
    atlas: String,
}

/// A GUI's copy the app keeps: whose (the GUI it was downloaded for), and when it came - its version.
#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeptAt {
    id: String,
    saved_at: u64,
}

/// What the page asks to pack: the images, [file, name in the .gui, group], in the groups' order.
#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PackArgs {
    id: String,
    version: String,
    #[serde(default)]
    size: String,
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
    /// the GUI as the page parsed it, kept (gui_keep_parsed): its file, if there is one
    #[serde(skip_serializing_if = "Option::is_none")]
    parsed: Option<String>,
    /// how long unpacking took (unpacked just now)
    #[serde(skip_serializing_if = "Option::is_none")]
    ms: Option<u128>,
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
    fn of(id: &str, version: &str) -> Self {
        Event { id: id.into(), version: version.into(), ms: None, done: None, total: None, sheets: None, images: None, error: None }
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

/// a GUI's folder, its version's, and the size's in that
fn folders<R: Runtime>(app: &AppHandle<R>, id: &str, version: &str, size: &str) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let gui = root(app)?.join(hash(id));
    let ver = gui.join(hash(version));
    let at = ver.join(format!("s{}", hash(size)));
    Ok((gui, ver, at))
}

/// a path in the archive as one under the folder: relative, no '..'
fn safe(name: &str) -> Option<PathBuf> {
    let p = Path::new(name);
    p.components().all(|c| matches!(c, Component::Normal(_))).then(|| p.to_path_buf())
}

fn u16_at(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}

fn u32_at(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

/// A zip archive's entries: stored or deflated (no zip64, no encryption), by name - read where the archive lies
/// (a file: its central directory and the entries asked for, nothing else).
struct Zip<S> {
    src: S,
    /// each entry's method, where its local header is, its size as stored
    entries: HashMap<String, (u16, u64, u64)>,
}

impl<S: Read + Seek> Zip<S> {
    fn open(mut src: S) -> Result<Self, String> {
        let broken = |_| "a broken zip archive".to_string();
        let len = src.seek(SeekFrom::End(0)).map_err(broken)?;
        if len < 22 {
            return Err("not a zip archive".into());
        }
        // the end of central directory record: the last PK\5\6 (after it, at most a comment)
        let tail_len = len.min(22 + 0xffff);
        let mut tail = vec![0; tail_len as usize];
        src.seek(SeekFrom::Start(len - tail_len)).map_err(broken)?;
        src.read_exact(&mut tail).map_err(broken)?;
        let end = (0..=tail.len() - 22).rev().find(|&i| u32_at(&tail, i) == 0x06054b50).ok_or("not a zip archive")?;
        let count = u16_at(&tail, end + 10) as usize;
        let (from, to) = (u32_at(&tail, end + 16) as u64, len - tail_len + end as u64);
        if from > to {
            return Err("a broken zip archive".into());
        }
        let mut cd = vec![0; (to - from) as usize];
        src.seek(SeekFrom::Start(from)).map_err(broken)?;
        src.read_exact(&mut cd).map_err(broken)?;
        let mut entries = HashMap::new();
        let mut at = 0;
        for _ in 0..count {
            if at + 46 > cd.len() || u32_at(&cd, at) != 0x02014b50 || at + 46 + u16_at(&cd, at + 28) as usize > cd.len() {
                return Err("a broken zip archive".into());
            }
            let name_len = u16_at(&cd, at + 28) as usize;
            let name = String::from_utf8_lossy(&cd[at + 46..at + 46 + name_len]).into_owned();
            if !name.ends_with('/') {
                entries.insert(name, (u16_at(&cd, at + 10), u32_at(&cd, at + 42) as u64, u32_at(&cd, at + 20) as u64));
            }
            at += 46 + name_len + u16_at(&cd, at + 30) as usize + u16_at(&cd, at + 32) as usize;
        }
        Ok(Zip { src, entries })
    }

    fn read(&mut self, name: &str) -> Result<Vec<u8>, String> {
        let &(method, local, size) = self.entries.get(name).ok_or_else(|| format!("{name}: not in the archive"))?;
        let broken = |_| format!("{name}: a broken zip archive");
        let mut head = [0; 30];
        self.src.seek(SeekFrom::Start(local)).map_err(broken)?;
        self.src.read_exact(&mut head).map_err(broken)?;
        if u32_at(&head, 0) != 0x04034b50 {
            return Err(format!("{name}: a broken zip archive"));
        }
        self.src.seek(SeekFrom::Current(u16_at(&head, 26) as i64 + u16_at(&head, 28) as i64)).map_err(broken)?;
        let mut body = Vec::new();
        (&mut self.src).take(size).read_to_end(&mut body).map_err(broken)?;
        if body.len() as u64 != size {
            return Err(format!("{name}: a broken zip archive"));
        }
        match method {
            0 => Ok(body),
            8 => {
                let mut out = Vec::new();
                flate2::read::DeflateDecoder::new(&body[..]).read_to_end(&mut out).map_err(|e| format!("{name}: {e}"))?;
                Ok(out)
            }
            m => Err(format!("{name}: zip compression {m} isn't supported")),
        }
    }
}

/// A text file's bytes as text: UTF-8, its BOM dropped (GUI Designer writes one), or UTF-16 with its BOM.
fn text_of(b: &[u8]) -> String {
    if let Some(rest) = b.strip_prefix(&[0xff, 0xfe]) {
        let units: Vec<u16> = rest.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        return String::from_utf16_lossy(&units);
    }
    String::from_utf8_lossy(b.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(b)).into_owned()
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

// ── a GUI's archive downloaded by the app, kept as its copy ──

/// What gui_fetch is asked: a GUI's own file (its URL) - with what the copy kept was (its ETag, Last-Modified),
/// only if it's another now.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchArgs {
    /// the GUI whose copy a zip becomes
    id: String,
    url: String,
    #[serde(default)]
    etag: Option<String>,
    #[serde(default)]
    last_modified: Option<String>,
}

/// A GUI's copy the app keeps (kept.json, beside kept.zip): where it came from, what tells its next version,
/// when it came, how large.
#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Kept {
    id: String,
    url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    etag: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_modified: Option<String>,
    saved_at: u64,
    bytes: u64,
}

/// A zip kept: its version (when it came) and its size.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Archive {
    saved_at: u64,
    bytes: u64,
}

/// What gui_fetch answers: 304 (the same as the copy kept), a zip kept, or what else came (as text).
#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Fetched {
    status: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    etag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    server: Option<String>,
    /// not a zip: what came, as text (a .gui; a web page, a wrong address)
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    /// a zip: the GUI's copy now
    #[serde(skip_serializing_if = "Option::is_none")]
    archive: Option<Archive>,
    /// that zip the very bytes of the copy kept before: it stays, its version too
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    same: bool,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Downloading {
    id: String,
    done: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    total: Option<u64>,
}

/// What a GET brought: nothing new (304), a text, or a zip - in its file, so many bytes.
#[derive(Debug, PartialEq)]
enum Got {
    NotModified,
    Text(String),
    Zip(u64),
}

/// The GET's answer: what it brought, and its ETag, Last-Modified and Server.
struct Download {
    got: Got,
    etag: Option<String>,
    last_modified: Option<String>,
    server: Option<String>,
}

/// past this, an answer that isn't a zip is no GUI
const TEXT_MAX: usize = 64 << 20;

/// an error and what caused it (reqwest's own says only "error sending request")
fn why(e: &dyn std::error::Error) -> String {
    let mut s = e.to_string();
    let mut at = e.source();
    while let Some(cause) = at {
        s = format!("{s}: {cause}");
        at = cause.source();
    }
    s
}

/**
 * GET url - with a copy's ETag and Last-Modified, if-none-match and
 * if-modified-since. A zip (by its first bytes, whatever the URL says) goes
 * into `part` as it comes, never all in memory; anything else is read as
 * text. `progress`: bytes so far, of how many (if the server says).
 */
async fn download(
    client: &reqwest::Client,
    a: &FetchArgs,
    part: &Path,
    progress: &mut (impl FnMut(u64, Option<u64>) + Send),
) -> Result<Download, String> {
    let url = &a.url;
    let mut req = client.get(url);
    if let Some(etag) = &a.etag {
        req = req.header(reqwest::header::IF_NONE_MATCH, etag);
    }
    if let Some(when) = &a.last_modified {
        req = req.header(reqwest::header::IF_MODIFIED_SINCE, when);
    }
    let mut res = req.send().await.map_err(|e| why(&e))?;
    let header = |name: reqwest::header::HeaderName| res.headers().get(name).and_then(|v| v.to_str().ok()).map(String::from);
    let (etag, last_modified, server) = (header(reqwest::header::ETAG), header(reqwest::header::LAST_MODIFIED), header(reqwest::header::SERVER));
    let status = res.status();
    if status == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(Download { got: Got::NotModified, etag, last_modified, server });
    }
    if !status.is_success() {
        return Err(format!("{url}: HTTP {}", status.as_u16()));
    }
    let total = res.content_length();
    let io = |e: std::io::Error| format!("{}: {e}", part.display());
    // the first bytes, till they tell a zip; all of it, if it isn't one
    let mut head = Vec::new();
    let mut file: Option<tokio::io::BufWriter<tokio::fs::File>> = None;
    let (mut done, mut told) = (0u64, Instant::now());
    while let Some(chunk) = res.chunk().await.map_err(|e| why(&e))? {
        done += chunk.len() as u64;
        if let Some(f) = &mut file {
            f.write_all(&chunk).await.map_err(io)?;
        } else {
            head.extend_from_slice(&chunk);
            if head.starts_with(b"PK\x03\x04") {
                let mut f = tokio::io::BufWriter::with_capacity(1 << 18, tokio::fs::File::create(part).await.map_err(io)?);
                f.write_all(&head).await.map_err(io)?;
                head = Vec::new();
                file = Some(f);
            } else if head.len() > TEXT_MAX {
                return Err(format!("{url}: not a GUI (a .gui, a zipped GUI or iva serve's address)"));
            }
        }
        if told.elapsed() >= Duration::from_millis(100) {
            progress(done, total);
            told = Instant::now();
        }
    }
    progress(done, total);
    let got = match file {
        Some(mut f) => {
            f.flush().await.map_err(io)?;
            Got::Zip(done)
        }
        None => Got::Text(text_of(&head)),
    };
    Ok(Download { got, etag, last_modified, server })
}

/// The copy kept in a GUI's folder, if it's whole (its zip as large as kept.json says).
fn kept_in(gui: &Path) -> Option<Kept> {
    let k: Kept = serde_json::from_slice(&fs::read(gui.join("kept.json")).ok()?).ok()?;
    (fs::metadata(gui.join("kept.zip")).ok()?.len() == k.bytes).then_some(k)
}

fn same_files(a: &Path, b: &Path) -> std::io::Result<bool> {
    let (mut a, mut b) = (File::open(a)?, File::open(b)?);
    let (mut x, mut y) = (vec![0; 1 << 16], vec![0; 1 << 16]);
    loop {
        let n = a.read(&mut x)?;
        if n == 0 {
            return Ok(b.read(&mut y)? == 0);
        }
        b.read_exact(&mut y[..n])?;
        if x[..n] != y[..n] {
            return Ok(false);
        }
    }
}

/**
 * A zip downloaded (`part`) made the GUI's copy: kept.zip, kept.json - but
 * the very bytes of the copy kept leave that one, its version too (its ETag
 * and Last-Modified the new ones). An archive without its central directory
 * (cut short) isn't kept. The copy now, and whether it's the one before.
 */
fn keep_zip(gui: &Path, part: &Path, new: Kept) -> Result<(Kept, bool), String> {
    let io = |e: std::io::Error| e.to_string();
    Zip::open(File::open(part).map_err(io)?)?;
    let json = gui.join("kept.json");
    let write = |k: &Kept| {
        let tmp = gui.join("kept.json.tmp");
        fs::write(&tmp, serde_json::to_vec(k).map_err(|e| e.to_string())?).map_err(io)?;
        fs::rename(&tmp, &json).map_err(io)
    };
    if let Some(old) = kept_in(gui).filter(|old| old.bytes == new.bytes) {
        if same_files(part, &gui.join("kept.zip")).map_err(io)? {
            let _ = fs::remove_file(part);
            let k = Kept { saved_at: old.saved_at, ..new };
            write(&k)?;
            return Ok((k, true));
        }
    }
    // no kept.json while the zip is another: a copy is its zip and what it is, or none
    let _ = fs::remove_file(&json);
    fs::rename(part, gui.join("kept.zip")).map_err(io)?;
    write(&new)?;
    Ok((new, false))
}

/// The GUI's copy (kept.zip), if it is the one the page knows (when it came).
fn kept_zip<R: Runtime>(app: &AppHandle<R>, id: &str, saved_at: u64) -> Result<PathBuf, String> {
    let gui = root(app)?.join(hash(id));
    match kept_in(&gui) {
        Some(k) if k.id == id && k.saved_at == saved_at => Ok(gui.join("kept.zip")),
        Some(_) => Err("the copy kept is another now".into()),
        None => Err("no copy kept".into()),
    }
}

/**
 * A GUI's own file from its server, by the app: a zip (iva serve's
 * /__iva/gui.zip, a zipped GUI) straight to the GUI's folder - kept there as
 * its copy - anything else (a .gui) as text. With the copy's ETag and
 * Last-Modified, 304 if it's the same.
 */
#[tauri::command]
pub async fn gui_fetch<R: Runtime>(app: AppHandle<R>, args: FetchArgs) -> Result<Fetched, String> {
    let parsed = reqwest::Url::parse(&args.url).map_err(|e| format!("{}: {e}", args.url))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("{}: not an http:// or https:// address", args.url));
    }
    let gui = root(&app)?.join(hash(&args.id));
    fs::create_dir_all(&gui).map_err(|e| e.to_string())?;
    let part = gui.join("kept.zip.part");
    let _busy = Busy::take(&app, &part).ok_or("being downloaded already")?;
    let client = {
        let state = app.state::<Guis>();
        match state.client.get() {
            Some(c) => c.clone(),
            None => {
                let c = reqwest::Client::builder()
                    .connect_timeout(Duration::from_secs(15))
                    .read_timeout(Duration::from_secs(30))
                    .build()
                    .map_err(|e| why(&e))?;
                state.client.get_or_init(|| c).clone()
            }
        }
    };
    let (to, id) = (app.clone(), args.id.clone());
    let mut progress = move |done, total| {
        let _ = to.emit("iva-gui-download", Downloading { id: id.clone(), done, total });
    };
    let d = match download(&client, &args, &part, &mut progress).await {
        Ok(d) => d,
        Err(e) => {
            let _ = fs::remove_file(&part);
            return Err(e);
        }
    };
    let mut out = Fetched { status: 200, etag: d.etag.clone(), last_modified: d.last_modified.clone(), server: d.server, ..Fetched::default() };
    match d.got {
        Got::NotModified => out.status = 304,
        Got::Text(text) => out.text = Some(text),
        Got::Zip(bytes) => {
            let saved_at = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64);
            let new = Kept { id: args.id.clone(), url: args.url.clone(), etag: d.etag, last_modified: d.last_modified, saved_at, bytes };
            let (k, same) = tauri::async_runtime::spawn_blocking(move || {
                let kept = keep_zip(&gui, &part, new);
                let _ = fs::remove_file(&part);
                kept
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("{}: {e}", args.url))?;
            log::info!("[iva] {} downloaded: {} bytes{}", args.url, k.bytes, if same { ", the copy kept's" } else { "" });
            out.archive = Some(Archive { saved_at: k.saved_at, bytes: k.bytes });
            out.same = same;
        }
    }
    Ok(out)
}

/// The names in a GUI's copy (gui_fetch's zip), that copy (when it came).
#[tauri::command]
pub async fn gui_archive<R: Runtime>(app: AppHandle<R>, id: String, saved_at: u64) -> Result<Vec<String>, String> {
    let zip = kept_zip(&app, &id, saved_at)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<String>, String> {
        Ok(Zip::open(File::open(&zip).map_err(|e| e.to_string())?)?.entries.into_keys().collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A file of a GUI's copy as text (its .gui: the page chooses the size from it).
#[tauri::command]
pub async fn gui_archive_text<R: Runtime>(app: AppHandle<R>, id: String, saved_at: u64, name: String) -> Result<String, String> {
    let zip = kept_zip(&app, &id, saved_at)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        Ok(text_of(&Zip::open(File::open(&zip).map_err(|e| e.to_string())?)?.read(&name)?))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A GUI's copy let go, if it's still that one (when it came).
fn forget_kept<R: Runtime>(app: &AppHandle<R>, k: &KeptAt) {
    if let Ok(zip) = kept_zip(app, &k.id, k.saved_at) {
        let _ = fs::remove_file(zip.with_file_name("kept.json"));
        let _ = fs::remove_file(zip);
    }
}

/// The files unpacked into the version's folder, and what they are (meta.json: written last - there, they are).
fn unpack_files<R: Runtime>(app: &AppHandle<R>, a: &UnpackArgs, ver: &Path) -> Result<(), String> {
    match (&a.asset, a.upload, &a.kept) {
        (Some(path), ..) => {
            let bytes = app.asset_resolver().get(path.clone()).ok_or_else(|| format!("{path}: not among the app's files"))?.bytes;
            unpack_from(Zip::open(Cursor::new(bytes))?, a, ver)
        }
        (None, Some(token), _) => {
            let bytes = app.state::<Guis>().uploads.lock().unwrap().remove(&token).ok_or("no such upload")?;
            unpack_from(Zip::open(Cursor::new(bytes))?, a, ver)
        }
        (None, None, Some(k)) => unpack_from(Zip::open(File::open(kept_zip(app, &k.id, k.saved_at)?).map_err(|e| e.to_string())?)?, a, ver),
        _ => Err("no archive".into()),
    }
}

fn unpack_from<S: Read + Seek>(mut zip: Zip<S>, a: &UnpackArgs, ver: &Path) -> Result<(), String> {
    let _ = fs::remove_dir_all(ver);
    let dir = ver.join("gui");
    for name in &a.files {
        let Some(rel) = safe(name) else { continue };
        let Ok(data) = zip.read(name) else { continue };
        let to = dir.join(rel);
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&to, data).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(ver.join("meta.json"), serde_json::to_vec(a).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(())
}

/// The version's folder taken (it's unpacked or packed now: once at a time), let go when the guard goes.
struct Busy<R: Runtime>(AppHandle<R>, PathBuf);

impl<R: Runtime> Busy<R> {
    fn take(app: &AppHandle<R>, ver: &Path) -> Option<Self> {
        app.state::<Guis>().busy.lock().unwrap().insert(ver.to_path_buf()).then(|| Busy(app.clone(), ver.to_path_buf()))
    }
}

impl<R: Runtime> Drop for Busy<R> {
    fn drop(&mut self) {
        self.0.state::<Guis>().busy.lock().unwrap().remove(&self.1);
    }
}

/// The archive's files of the size run unpacked (if they aren't): where they are.
#[tauri::command]
pub async fn gui_unpack<R: Runtime>(app: AppHandle<R>, args: UnpackArgs) -> Result<Unpacked, String> {
    let (gui, ver, at) = folders(&app, &args.id, &args.version, &args.size)?;
    if let Some(token) = args.upload.filter(|_| at.join("meta.json").exists()) {
        app.state::<Guis>().uploads.lock().unwrap().remove(&token);
    }
    let u = if !at.join("meta.json").exists() {
        let t0 = Instant::now();
        let a = args.clone();
        let app2 = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _busy = Busy::take(&app2, &at).ok_or("being unpacked")?;
            unpack_files(&app2, &a, &at)?;
            // its other versions go (this one's other sizes stay; its copy too)
            for old in fs::read_dir(&gui).into_iter().flatten().flatten() {
                if old.path() != ver && old.file_type().is_ok_and(|t| t.is_dir()) {
                    let _ = fs::remove_dir_all(old.path());
                }
            }
            Ok::<_, String>(())
        })
        .await
        .map_err(|e| e.to_string())??;
        let mut u = gui_unpacked(app.clone(), args.id.clone(), args.version.clone(), Some(args.size.clone())).await?.ok_or("not unpacked")?;
        u.ms = Some(t0.elapsed().as_millis());
        u
    } else {
        gui_unpacked(app.clone(), args.id.clone(), args.version.clone(), Some(args.size.clone())).await?.ok_or("not unpacked")?
    };
    if let Some(k) = args.kept.as_ref().filter(|_| args.drop) {
        forget_kept(&app, k);
    }
    Ok(u)
}

/// Its images packed into sheets beside its .gui, in a thread of its own (the events say how far it got) - if
/// they aren't, and nothing is packing them now.
#[tauri::command]
pub fn gui_pack<R: Runtime>(app: AppHandle<R>, args: PackArgs) -> Result<(), String> {
    let (_, _, at) = folders(&app, &args.id, &args.version, &args.size)?;
    let meta: UnpackArgs = serde_json::from_slice(&fs::read(at.join("meta.json")).map_err(|_| "not unpacked")?).map_err(|e| e.to_string())?;
    let dir = at.join("gui");
    let out = dir.join(safe(&meta.atlas).ok_or("no folder for the sheets")?);
    if out.join("atlas.json").exists() {
        return Ok(());
    }
    let Some(busy) = Busy::take(&app, &at) else { return Ok(()) };
    let files: HashSet<&str> = meta.files.iter().map(|s| s.as_str()).collect();
    let inputs: Vec<atlas::Input> = args
        .images
        .iter()
        .filter(|[file, ..]| files.contains(file.as_str()))
        .filter_map(|[file, name, group]| Some(atlas::Input { file: dir.join(safe(file)?), name: name.clone(), group: group.clone() }))
        .collect();
    std::thread::spawn(move || {
        let _busy = busy;
        let t0 = Instant::now();
        // a core for the page, one for the web view's drawing
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).saturating_sub(2).clamp(1, 3);
        let progress = |done, total| {
            let _ = app.emit("iva-gui-packing", Event { done: Some(done), total: Some(total), ..Event::of(&args.id, &args.version) });
        };
        let mut e = Event::of(&args.id, &args.version);
        match atlas::pack(inputs, &out, threads, &progress) {
            Ok(map) => {
                e.sheets = Some(map.sheets.len());
                e.images = Some(map.frames.len());
                log::info!("[iva] {} packed: {} images in {} sheets, {} ms", args.id, map.frames.len(), map.sheets.len(), t0.elapsed().as_millis());
            }
            Err(err) => e.error = Some(err.to_string()),
        }
        e.ms = Some(t0.elapsed().as_millis());
        let _ = app.emit("iva-gui-packed", e);
    });
    Ok(())
}

/// The GUI's files unpacked from this version, if they are: where, which (its sheets among them), whether
/// its images are in sheets yet.
#[tauri::command]
pub async fn gui_unpacked<R: Runtime>(app: AppHandle<R>, id: String, version: String, size: Option<String>) -> Result<Option<Unpacked>, String> {
    let size = size.unwrap_or_default();
    let (_, _, at) = folders(&app, &id, &version, &size)?;
    let Ok(meta) = fs::read(at.join("meta.json")) else { return Ok(None) };
    let a: UnpackArgs = serde_json::from_slice(&meta).map_err(|e| e.to_string())?;
    if a.id != id || a.version != version || a.size != size {
        return Ok(None);
    }
    let dir = at.join("gui");
    let packed = safe(&a.atlas).is_some_and(|p| dir.join(p).join("atlas.json").exists());
    let mut files: Vec<String> = a.files.iter().filter(|f| safe(f).is_some_and(|p| dir.join(p).is_file())).cloned().collect();
    if packed {
        for e in fs::read_dir(dir.join(&a.atlas)).into_iter().flatten().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name == "atlas.json" || name.ends_with(".png") {
                files.push(format!("{}/{name}", a.atlas));
            }
        }
    }
    let parsed = at.join("parsed.json");
    let parsed = parsed.is_file().then(|| parsed.to_string_lossy().into_owned());
    Ok(Some(Unpacked { root: dir.to_string_lossy().into_owned(), files, packed, parsed, ms: None }))
}

/**
 * The GUI as the page parsed it (JSON), kept beside its files: the next start
 * reads it instead of parsing the .gui again (a slow phone: 0.1 s, not 1.6).
 */
#[tauri::command]
pub async fn gui_keep_parsed<R: Runtime>(app: AppHandle<R>, id: String, version: String, size: Option<String>, data: String) -> Result<(), String> {
    let (_, _, at) = folders(&app, &id, &version, &size.unwrap_or_default())?;
    if !at.join("meta.json").is_file() {
        return Err("not unpacked".into());
    }
    let tmp = at.join("parsed.json.tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, at.join("parsed.json")).map_err(|e| e.to_string())
}

/// A GUI's files unpacked let go, its copy too - every GUI's, without one.
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

    /// a folder of its own for a test, empty
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("iva-unpack-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn zip_entries_stored_and_deflated() {
        let z = zip_of(&[("a.gui", b"<gui/>"), ("images/b.js", b"var b = 1; var b = 1; var b = 1;"), ("images/", b"")]);
        let mut zip = Zip::open(Cursor::new(&z)).unwrap();
        assert_eq!(zip.read("a.gui").unwrap(), b"<gui/>");
        assert_eq!(zip.read("images/b.js").unwrap(), b"var b = 1; var b = 1; var b = 1;");
        assert!(zip.read("c").is_err());
        assert_eq!(zip.entries.len(), 2, "no folders");
        assert!(Zip::open(Cursor::new(b"not a zip, not at all")).is_err());
        // cut short: its central directory gone
        assert!(Zip::open(Cursor::new(&z[..z.len() / 2])).is_err());
        // from a file: the same
        let dir = scratch("zip");
        fs::write(dir.join("a.zip"), &z).unwrap();
        assert_eq!(Zip::open(File::open(dir.join("a.zip")).unwrap()).unwrap().read("images/b.js").unwrap(), b"var b = 1; var b = 1; var b = 1;");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn only_paths_under_the_folder() {
        assert!(safe("images/a.png").is_some());
        assert!(safe("../a.png").is_none());
        assert!(safe("/etc/a").is_none());
        assert!(safe("a/../../b").is_none());
    }

    #[test]
    fn texts_as_a_gui_is_written() {
        assert_eq!(text_of(b"\xef\xbb\xbf<gui/>"), "<gui/>");
        assert_eq!(text_of(b"<gui/>"), "<gui/>");
        assert_eq!(text_of(b"\xff\xfe<\0g\0/\0>\0"), "<g/>");
    }

    #[test]
    fn a_zip_downloaded_is_the_copy_the_same_bytes_keep_their_version() {
        let dir = scratch("keep");
        let kept = |saved_at, bytes| Kept { id: "http://h/a.gui.zip".into(), url: "http://h/a.gui.zip".into(), etag: Some("\"1\"".into()), last_modified: None, saved_at, bytes };
        let z = zip_of(&[("a.gui", b"<gui/>")]);
        fs::write(dir.join("kept.zip.part"), &z).unwrap();
        let (k, same) = keep_zip(&dir, &dir.join("kept.zip.part"), kept(1, z.len() as u64)).unwrap();
        assert!(!same);
        assert_eq!(k.saved_at, 1);
        assert_eq!(kept_in(&dir), Some(k));
        assert!(!dir.join("kept.zip.part").exists());
        // again, the same bytes (a server without ETags): the copy and its version stay, the new ETag kept
        fs::write(dir.join("kept.zip.part"), &z).unwrap();
        let (k, same) = keep_zip(&dir, &dir.join("kept.zip.part"), Kept { etag: Some("\"2\"".into()), ..kept(2, z.len() as u64) }).unwrap();
        assert!(same);
        assert_eq!((k.saved_at, k.etag.as_deref()), (1, Some("\"2\"")));
        // another archive of the same size: the copy now
        let other = zip_of(&[("a.gui", b"<guy/>")]);
        assert_eq!(other.len(), z.len());
        fs::write(dir.join("kept.zip.part"), &other).unwrap();
        let (k, same) = keep_zip(&dir, &dir.join("kept.zip.part"), kept(3, other.len() as u64)).unwrap();
        assert!(!same);
        assert_eq!(k.saved_at, 3);
        assert_eq!(fs::read(dir.join("kept.zip")).unwrap(), other);
        // cut short: not kept, the copy before stays
        fs::write(dir.join("kept.zip.part"), &z[..z.len() - 10]).unwrap();
        assert!(keep_zip(&dir, &dir.join("kept.zip.part"), kept(4, z.len() as u64 - 10)).is_err());
        assert_eq!(kept_in(&dir).map(|k| k.saved_at), Some(3));
        // its zip not what kept.json says: no copy
        fs::write(dir.join("kept.zip"), b"PK").unwrap();
        assert_eq!(kept_in(&dir), None);
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn a_download_zip_to_its_file_text_back_304_nothing() {
        use tokio::io::AsyncReadExt;
        let zip = zip_of(&[("a.gui", b"<gui/>"), ("images/b.js", &[b'b'; 5000])]);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let at = listener.local_addr().unwrap();
        let body = zip.clone();
        tokio::spawn(async move {
            loop {
                let (mut s, _) = listener.accept().await.unwrap();
                let body = body.clone();
                tokio::spawn(async move {
                    let mut buf = vec![0; 8192];
                    let n = s.read(&mut buf).await.unwrap();
                    let req = String::from_utf8_lossy(&buf[..n]).to_lowercase();
                    let (head, data): (&str, Vec<u8>) = if req.contains("if-none-match: \"v1\"") {
                        ("304 Not Modified\r\nETag: \"v1\"", Vec::new())
                    } else if req.starts_with("get /gone") {
                        ("404 Not Found", Vec::new())
                    } else if req.starts_with("get /a.gui ") {
                        ("200 OK\r\nServer: iva", "\u{feff}<gui></gui>".as_bytes().to_vec())
                    } else {
                        ("200 OK\r\nETag: \"v1\"\r\nLast-Modified: Sat, 24 Oct 2026 10:00:00 GMT", body)
                    };
                    let _ = s.write_all(format!("HTTP/1.1 {head}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", data.len()).as_bytes()).await;
                    let _ = s.write_all(&data).await;
                });
            }
        });
        let client = reqwest::Client::new();
        let dir = scratch("download");
        let part = dir.join("kept.zip.part");
        let ask = |path: &str, etag: Option<&str>| FetchArgs { id: "g".into(), url: format!("http://{at}{path}"), etag: etag.map(String::from), last_modified: None };
        let mut seen = Vec::new();
        let d = download(&client, &ask("/a.gui.zip", None), &part, &mut |done: u64, total: Option<u64>| seen.push((done, total))).await.unwrap();
        assert_eq!(d.got, Got::Zip(zip.len() as u64));
        assert_eq!(d.etag.as_deref(), Some("\"v1\""));
        assert_eq!(d.last_modified.as_deref(), Some("Sat, 24 Oct 2026 10:00:00 GMT"));
        assert_eq!(fs::read(&part).unwrap(), zip);
        assert_eq!(seen.last(), Some(&(zip.len() as u64, Some(zip.len() as u64))));
        let d = download(&client, &ask("/a.gui.zip", Some("\"v1\"")), &part, &mut |_: u64, _: Option<u64>| {}).await.unwrap();
        assert_eq!(d.got, Got::NotModified);
        let d = download(&client, &ask("/a.gui", None), &dir.join("text.part"), &mut |_: u64, _: Option<u64>| {}).await.unwrap();
        assert_eq!(d.got, Got::Text("<gui></gui>".into()));
        assert_eq!(d.server.as_deref(), Some("iva"));
        assert!(!dir.join("text.part").exists(), "a text: no file");
        let e = download(&client, &ask("/gone", None), &part, &mut |_: u64, _: Option<u64>| {}).await.err().unwrap();
        assert_eq!(e, format!("http://{at}/gone: HTTP 404"));
        let _ = fs::remove_dir_all(dir);
    }
}

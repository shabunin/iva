// A GUI's images packed into a few sheets per page (texture atlases): the
// panel's page loads a page's sheets - a handful of files - instead of its
// images one by one (hundreds: a slow phone spends ~30 ms on each, whatever
// its size). Which images go together the page says (src/runtime/cf/atlas.ts
// atlasGroups); this decodes them, shelf-packs each group into sheets up to
// SHEET a side, each image with PAD pixels of its own edge around it (scaled,
// it doesn't pick up its neighbours'), and writes the sheets and their map
// (atlas.json, as the renderer reads it: version 1, sheets, frames).

use std::fs;
use std::io::{BufReader, Cursor};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

pub const SHEET: u32 = 2048;
pub const PAD: u32 = 2;
/// larger than this a side: a file of its own
pub const MAX_SIDE: u32 = 1024;

/// An image to pack: its file, its name in the .gui (the map's key), its group.
pub struct Input {
    pub file: PathBuf,
    pub name: String,
    pub group: String,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct Sheet {
    pub file: String,
    pub w: u32,
    pub h: u32,
    pub group: String,
}

/// atlas.json
#[derive(serde::Serialize, Debug)]
pub struct AtlasMap {
    pub version: u32,
    pub sheets: Vec<Sheet>,
    /// each image by its name: [sheet, x, y, w, h]
    pub frames: std::collections::BTreeMap<String, [u32; 5]>,
}

struct Sized {
    file: PathBuf,
    name: String,
    w: u32,
    h: u32,
}

struct Placed {
    item: usize,
    sheet: usize,
    x: u32,
    y: u32,
}

/// A PNG's size from its header, without its pixels.
fn png_size(file: &Path) -> Option<(u32, u32)> {
    let reader = png::Decoder::new(BufReader::new(fs::File::open(file).ok()?)).read_info().ok()?;
    let info = reader.info();
    Some((info.width, info.height))
}

/// A PNG's pixels as RGBA, 8 bits a channel.
pub fn decode_rgba(data: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
    let mut decoder = png::Decoder::new(Cursor::new(data));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16 | png::Transformations::ALPHA);
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0; reader.output_buffer_size()?];
    let out = reader.next_frame(&mut buf).ok()?;
    let (w, h) = (out.width, out.height);
    let px = w as usize * h as usize;
    let rgba = match out.color_type {
        png::ColorType::Rgba => {
            buf.truncate(px * 4);
            buf
        }
        png::ColorType::Rgb => buf[..px * 3].chunks_exact(3).flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
        png::ColorType::GrayscaleAlpha => buf[..px * 2].chunks_exact(2).flat_map(|p| [p[0], p[0], p[0], p[1]]).collect(),
        png::ColorType::Grayscale => buf[..px].iter().flat_map(|&g| [g, g, g, 255]).collect(),
        png::ColorType::Indexed => return None,
    };
    Some((w, h, rgba))
}

/// RGBA pixels as a PNG: each row filtered "up" (flat UI art packs small), deflated fast.
pub fn encode_png(rgba: &[u8], w: u32, h: u32) -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_compression(png::Compression::Fast);
        enc.set_filter(png::Filter::Up);
        let mut writer = enc.write_header().expect("a PNG header");
        writer.write_image_data(rgba).expect("a PNG's pixels");
    }
    out
}

/// Shelves, tallest first, in sheets up to SHEET a side: where each image goes, and each sheet's size.
fn shelve(items: &[Sized]) -> (Vec<Placed>, Vec<(u32, u32)>) {
    let mut order: Vec<usize> = (0..items.len()).collect();
    order.sort_by(|&a, &b| {
        let (a, b) = (&items[a], &items[b]);
        b.h.cmp(&a.h).then(b.w.cmp(&a.w)).then(a.name.cmp(&b.name))
    });
    let mut placed = Vec::new();
    let mut sizes = Vec::new();
    let (mut sheet, mut x, mut shelf_y, mut shelf_h, mut width) = (0usize, 0u32, 0u32, 0u32, 0u32);
    let round = |v: u32| v.div_ceil(4) * 4;
    for i in order {
        let (w, h) = (items[i].w + 2 * PAD, items[i].h + 2 * PAD);
        if x + w > SHEET {
            shelf_y += shelf_h;
            x = 0;
            shelf_h = 0;
        }
        if shelf_y + h > SHEET {
            sizes.push((round(width), round(shelf_y + shelf_h)));
            sheet += 1;
            x = 0;
            shelf_y = 0;
            shelf_h = 0;
            width = 0;
        }
        placed.push(Placed { item: i, sheet, x: x + PAD, y: shelf_y + PAD });
        x += w;
        width = width.max(x);
        shelf_h = shelf_h.max(h);
    }
    if !placed.is_empty() {
        sizes.push((round(width), round(shelf_y + shelf_h)));
    }
    (placed, sizes)
}

/// The image into the sheet at (x, y), its edge pixels repeated PAD wide around it.
fn blit(sheet: &mut [u8], sw: u32, x: u32, y: u32, w: u32, h: u32, rgba: &[u8]) {
    let row = (w * 4) as usize;
    let pad = PAD as i64;
    for dy in -pad..(h as i64 + pad) {
        let sy = dy.clamp(0, h as i64 - 1) as usize;
        let src = &rgba[sy * row..(sy + 1) * row];
        let dst = (((y as i64 + dy) as usize) * sw as usize + x as usize) * 4;
        sheet[dst..dst + row].copy_from_slice(src);
        for k in 1..=PAD as usize {
            sheet[dst - k * 4..dst - k * 4 + 4].copy_from_slice(&src[..4]);
            let right = dst + row + (k - 1) * 4;
            sheet[right..right + 4].copy_from_slice(&src[row - 4..]);
        }
    }
}

/// One group's sheets, written as `<prefix>-<k>.png` in `out`: each sheet's size, each image's frame (its sheet the group's own count).
fn pack_group(items: &[Sized], out: &Path, prefix: &str) -> std::io::Result<(Vec<(String, u32, u32)>, Vec<(String, [u32; 5])>)> {
    let (placed, sizes) = shelve(items);
    let mut sheets = Vec::new();
    let mut frames = Vec::new();
    for (k, &(sw, sh)) in sizes.iter().enumerate() {
        let mut buf = vec![0u8; sw as usize * sh as usize * 4];
        for p in placed.iter().filter(|p| p.sheet == k) {
            let it = &items[p.item];
            // read again: one image's pixels at a time, not the group's
            let Some((w, h, rgba)) = fs::read(&it.file).ok().and_then(|d| decode_rgba(&d)) else { continue };
            if (w, h) != (it.w, it.h) {
                continue;
            }
            blit(&mut buf, sw, p.x, p.y, w, h, &rgba);
            frames.push((it.name.clone(), [k as u32, p.x, p.y, w, h]));
        }
        let file = format!("{prefix}-{k}.png");
        fs::write(out.join(&file), encode_png(&buf, sw, sh))?;
        sheets.push((file, sw, sh));
    }
    Ok((sheets, frames))
}

/**
 * The images packed, by group (in the order the groups first come), into
 * sheets in `out`, their map beside them (atlas.json, written last: there,
 * the sheets are). PNGs up to MAX_SIDE a side; any other image, one that
 * doesn't decode, a lone one: a file of its own. `threads` groups at once;
 * `progress(groups done, groups)`.
 */
pub fn pack(inputs: Vec<Input>, out: &Path, threads: usize, progress: &(dyn Fn(usize, usize) + Sync)) -> std::io::Result<AtlasMap> {
    // by group, the ones that fit (their size from their header)
    let mut groups: Vec<(String, Vec<Sized>)> = Vec::new();
    for it in inputs {
        if !it.name.to_ascii_lowercase().ends_with(".png") {
            continue;
        }
        let Some((w, h)) = png_size(&it.file) else { continue };
        if w == 0 || h == 0 || w > MAX_SIDE || h > MAX_SIDE {
            continue;
        }
        let item = Sized { file: it.file, name: it.name, w, h };
        match groups.iter_mut().find(|(g, _)| *g == it.group) {
            Some((_, items)) => items.push(item),
            None => groups.push((it.group, vec![item])),
        }
    }
    fs::create_dir_all(out)?;
    let mut map = AtlasMap { version: 1, sheets: Vec::new(), frames: Default::default() };
    if groups.iter().map(|(_, g)| g.len()).sum::<usize>() >= 2 {
        let results: Vec<Mutex<Option<std::io::Result<_>>>> = groups.iter().map(|_| Mutex::new(None)).collect();
        let next = AtomicUsize::new(0);
        let done = AtomicUsize::new(0);
        std::thread::scope(|s| {
            for _ in 0..threads.clamp(1, groups.len()) {
                s.spawn(|| loop {
                    let i = next.fetch_add(1, Ordering::SeqCst);
                    if i >= groups.len() {
                        break;
                    }
                    let r = pack_group(&groups[i].1, out, &format!("s{i}"));
                    *results[i].lock().unwrap() = Some(r);
                    progress(done.fetch_add(1, Ordering::SeqCst) + 1, groups.len());
                });
            }
        });
        for (i, r) in results.into_iter().enumerate() {
            let (sheets, frames) = r.into_inner().unwrap().expect("each group packed")?;
            let first = map.sheets.len() as u32;
            for (file, w, h) in sheets {
                map.sheets.push(Sheet { file, w, h, group: groups[i].0.clone() });
            }
            for (name, [k, x, y, w, h]) in frames {
                map.frames.insert(name, [first + k, x, y, w, h]);
            }
        }
    }
    let json = serde_json::to_vec(&map).map_err(std::io::Error::other)?;
    let tmp = out.join("atlas.json.tmp");
    fs::write(&tmp, json)?;
    fs::rename(&tmp, out.join("atlas.json"))?;
    Ok(map)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// a w x h PNG of one colour, its top-left pixel another (to see edges and padding)
    fn png_of(w: u32, h: u32, rgba: [u8; 4], corner: Option<[u8; 4]>) -> Vec<u8> {
        let mut data: Vec<u8> = (0..w * h).flat_map(|_| rgba).collect();
        if let Some(c) = corner {
            data[..4].copy_from_slice(&c);
        }
        encode_png(&data, w, h)
    }

    #[test]
    fn packed_pixel_for_pixel_with_its_edge_around_it() {
        let dir = std::env::temp_dir().join(format!("iva-atlas-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let (red, blue) = ([255, 0, 0, 255], [0, 0, 255, 255]);
        let images: Vec<(&str, &str, Vec<u8>)> = vec![
            ("shared", "icons/menu.png", png_of(16, 16, blue, None)),
            ("page:Home", "icons/home.png", png_of(30, 20, red, Some(blue))),
            ("page:Home", "buttons/a.png", png_of(50, 40, blue, None)),
            ("page:Home", "buttons/a-down.png", png_of(50, 40, red, None)),
            // too big for a sheet: a file of its own
            ("page:Home", "icons/popup.png", png_of(1500, 10, red, None)),
            // not a PNG
            ("page:Home", "icons/broken.png", b"not a png".to_vec()),
        ];
        let inputs = images
            .iter()
            .enumerate()
            .map(|(i, (group, name, data))| {
                let file = dir.join(format!("{i}.png"));
                fs::write(&file, data).unwrap();
                Input { file, name: name.to_string(), group: group.to_string() }
            })
            .collect();
        let out = dir.join("iva-atlas");
        let calls = AtomicUsize::new(0);
        let map = pack(inputs, &out, 2, &|_, total| {
            assert_eq!(total, 2);
            calls.fetch_add(1, Ordering::SeqCst);
        })
        .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        let names: Vec<&str> = map.frames.keys().map(|s| s.as_str()).collect();
        assert_eq!(names, ["buttons/a-down.png", "buttons/a.png", "icons/home.png", "icons/menu.png"]);
        // the groups in the order they came
        assert_eq!(map.sheets.iter().map(|s| s.group.as_str()).collect::<Vec<_>>(), ["shared", "page:Home"]);
        let sheets: Vec<(u32, u32, Vec<u8>)> = map.sheets.iter().map(|s| decode_rgba(&fs::read(out.join(&s.file)).unwrap()).unwrap()).collect();
        for (s, sheet) in map.sheets.iter().zip(&sheets) {
            assert_eq!((s.w, s.h), (sheet.0, sheet.1));
            assert_eq!(s.w % 4, 0);
        }
        let at = |sheet: u32, x: u32, y: u32| {
            let (w, _, px) = &sheets[sheet as usize];
            let i = ((y * w + x) * 4) as usize;
            [px[i], px[i + 1], px[i + 2], px[i + 3]]
        };
        let [s, x, y, w, h] = map.frames["icons/home.png"];
        assert_eq!([w, h], [30, 20]);
        assert_eq!(at(s, x, y), blue, "its top-left pixel");
        assert_eq!(at(s, x + 1, y + 1), red);
        // the edge repeated outside it: left of the corner, above it, and diagonally
        assert_eq!(at(s, x - 1, y), blue);
        assert_eq!(at(s, x, y - 2), blue);
        assert_eq!(at(s, x - 2, y - 2), blue);
        assert_eq!(at(s, x + w, y + h), red, "past the bottom-right corner: that corner");
        let json: serde_json::Value = serde_json::from_slice(&fs::read(out.join("atlas.json")).unwrap()).unwrap();
        assert_eq!(json["version"], 1);
        assert_eq!(json["frames"]["icons/home.png"], serde_json::json!([s, x, y, w, h]));
        assert_eq!(json["sheets"][0]["file"], "s0-0.png");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn shelves_fill_a_sheet_then_open_another() {
        let items: Vec<Sized> = (0..5).map(|i| Sized { file: PathBuf::new(), name: format!("{i}"), w: 1000, h: 1000 }).collect();
        let (placed, sizes) = shelve(&items);
        // two a shelf, two shelves a sheet: four in the first, one in the second
        assert_eq!(placed.iter().filter(|p| p.sheet == 0).count(), 4);
        assert_eq!(sizes, vec![(2008, 2008), (1004, 1004)]);
        assert!(placed.iter().all(|p| p.x >= PAD && p.y >= PAD));
    }
}

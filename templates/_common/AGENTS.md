# {{name}}: an iViewer panel in JSX (iva)

This folder is a CommandFusion iViewer project written in JSX. `iva` compiles
it into an ordinary `.gui` (the format GUI Designer writes) that iViewer and
GUI Designer open.

## Commands

```bash
iva dev            # live preview (app.jsx): rebuilds on save; real TCP/UDP/HTTP to devices
iva check          # types (as the editor sees them) + a test build: run before handing over
iva build          # -> dist/: the .gui, its images and scripts, joins.json
```

## Files

- `app.jsx`: the entry; `export default <Project>...</Project>`.
- `pages/`, `components/`, `systems.jsx`: split as you like; plain ES imports.
- `assets/`: images (and sounds). Everything here ships; images are found by
  bare name (`image="bg.png"`), as iViewer finds them.
- `scripts/`: iViewer JavaScript (the `CF.*` API), shipped as is with `<Script src>`.
- `IVA.md`: every element and prop. `iva.d.ts`: their types (don't edit;
  `iva types` rewrites it).

## Rules that matter

- Elements are capitalised (`<Button>`, `<Text>`); there are no HTML tags.
  Props are checked: an unknown one is an error with a suggestion.
- Coordinates are pixels from the top-left of the page / subpage; `w` and `h`
  are required on items.
- Joins: `join={12}` is a number; `join="volume"` is a name iva numbers (from
  1000). Scripts read names as `Joins.d.volume` (a generated script).
  Button = digital, Text / Input / Image = serial, Slider / Gauge = analog.
- Styling is props (`bg`, `color`, `fontSize`, `bold`, `align`, `image` +
  `slice`, `active={{...}}` for a button's pressed / on state). iva turns them
  into GUI Designer themes; same style = same theme.
- Sliders and gauges are drawn from images: use `bg` / `fill` / `thumbColor`
  (iva draws them) or image files.
- Fonts: `font="Helvetica Neue" bold` - iva finds the device font name; an
  unknown font is a warning.
- Devices: `<System host port>` with `<Command>` and `<Feedback>`; button
  `cmd="Name"` sends a command.
- Keep it valid for the real iViewer: prefer iva's props; `xml={{...}}` and
  `<Raw>` exist for what iva doesn't model, rarely needed.

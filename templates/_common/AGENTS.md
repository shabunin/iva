# {{name}}: an iViewer panel in JSX (iva)

This folder is a CommandFusion iViewer project written in JSX. `iva` compiles
it into an ordinary `.gui` (the format GUI Designer writes) that iViewer and
GUI Designer open.

## Commands

```bash
iva dev            # live preview (app.jsx): rebuilds on save; real TCP/UDP/HTTP to devices
iva check          # types (as the editor sees them) + a test build: run before handing over
iva build          # -> dist/: the .gui, assets/ (its image folder: a folder per component type, scripts/), joins.json
iva serve          # to iViewer on a real device (GUI File URL http://<this machine>:8019), reloads on save
```

## Files

- `app.jsx`: the entry; `export default <Project>...</Project>`.
- `pages/`, `components/`, `systems.jsx`: split as you like; plain ES imports.
- `assets/`: images (and sounds). Everything here ships; images are found by
  bare name (`image="bg.png"`), as iViewer finds them.
- `scripts/`: iViewer JavaScript (the `CF.*` API), shipped as is with `<Script src>`.
- `IVA.md`: every element and prop; `IVA-UI.md`: the iva/ui components;
  `IVA-WEB.md`: web apps; `IVA-DRIVERS.md`: the drivers (MQTT ...) - iva's
  docs, copied in (`iva types` rewrites them; don't edit). `iva.d.ts`: the types (don't edit;
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
- Rounded corners / borders: `radius`, `borderWidth` + `borderColor` on a
  `<Button>` or `<Subpage>` (iva draws the background). Icons:
  `icon={fa('lightbulb')}` (Font Awesome free names), `iconAlign="left"|"top"`;
  `<Image src={fa('house')} />`. Not as text: iViewer has no icon font.
- Fonts: `font="Helvetica Neue" bold` - iva finds the device font name; an
  unknown font is a warning.
- Ready-made components: `import { createUi } from 'iva/ui'` (Card, Tile,
  IconButton, Toggle, Slider, Stepper, Segmented, SceneBar, Dimmer, Blinds,
  Knob, Thermostat, ColorPicker, RadioGroup, CheckBox, SelectBox,
  TextField, SearchSelect, TimePicker, DatePicker, NumberField, DataList,
  WeekDays, AlarmCard, PinPad, Header, SideMenu, ConfirmDialog, DataTable,
  AlarmTable, AlarmBanner, Breadcrumbs, Loader, Pager, Trend, Chart,
  DragDrop, ...);
  see IVA-UI.md: every component, its props, examples, how the circular
  ones, lists and phone screens work.
- Charts, 3D, any page a script makes: `<WebApp entry="./web/app.js">` - the
  module (and the npm packages it imports; three, chart.js, uplot come with
  iva) runs in a web view the panel serves itself; `import { panel } from
  'iva/web'` to read and set joins. Keep that code in web/. See IVA-WEB.md.
- Several screens: `<Project sizes={['1920x1080', '1400x1400@3x']}>` builds
  the project for each (`@3x`: a phone, laid out at a third of its pixels and
  scaled up by iViewer). Lay pages out from `screen()` (the size being
  built): iva/ui's `ui.grid()` places cards for the size, `<ui.ScrollArea>`
  scrolls a page that doesn't fit. A ScrollArea is a list: iViewer shows no
  list, subpage or gesture in one (DataList, DataTable, Pager, Knob,
  DragDrop... - the build warns); on a phone give those `<ui.Screens>` (a
  subpage a tab, on one page). See IVA.md (Screen sizes) and IVA-UI.md.
- Devices: `<System host port>` with `<Command>` and `<Feedback>`; button
  `cmd="Name"` sends a command. An MQTT broker: `import { Mqtt } from
  'iva/drivers/mqtt'`, topics in and out of joins (see IVA-DRIVERS.md).
- Keep it valid for the real iViewer: prefer iva's props; `xml={{...}}` and
  `<Raw>` exist for what iva doesn't model, rarely needed.

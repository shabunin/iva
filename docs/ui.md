# iva/ui

Components for iViewer panels, in a theme. Each returns ordinary iva
elements (Button, Text, Box, Slider, Subpage...), so what they make is what
the `.gui` holds; rounded shapes and Font Awesome icons are drawn by iva.
What has to happen on the panel (value labels, steppers, one-of-several,
the clock, the side menu) is a small script, `iva-ui.js`, shipped once when
a component needs it, wired up through `<OnStart>`.

```jsx
// ui.js - the components in your theme
import { createUi } from 'iva/ui';
export const ui = createUi({ accent: '#0A84FF', panel: { width: 1280, height: 800 } });

// a page
import { ui } from '../ui.js';
<ui.Card title="Living room" x={16} y={88} w={612} h={300}>
  <ui.Tile x={28} y={64} icon="tv" title="TV" status="On / off" join="tv" />
  <ui.Slider x={220} y={64} w={360} label="Volume" join="volume" value={30} />
</ui.Card>
```

Or the default look straight away: `import { Tile, Card } from 'iva/ui'`.
The whole set in use: [examples/gallery](../examples/gallery) (`iva dev examples/gallery/app.jsx`).

## Theme

`createUi(theme)` takes any of: `page`, `bar`, `surface`, `raised`,
`accent`, `text`, `muted`, `danger`, `warning` (colours), `font` (an
iOS / Android family), `radius`, `panel: { width, height }`. The default
is a dark look with a teal accent (`defaultTheme`).

## Joins

Analog joins run 0..65535 in iViewer; `min` / `max` are what they stand
for (a slider with min -60, max 0 still sets its join 0..65535). Components
that keep a value (Slider, Stepper, Segmented, SceneBar) take an analog
`join`; on / off ones (Toggle, Tile, Badge) a digital one. Names work:
`join="volume"`. In scripts: `IvaUI.set(Joins.a.volume, 30, 0, 100)` sets
it as a value in min..max.

## Components

| Component | What | Key props |
|---|---|---|
| `Card` | a rounded panel with a caps title; children placed relative to it | `title`, `x`, `y`, `w`, `h` |
| `Icon` | a Font Awesome icon | `icon`, `size`, `color` |
| `IconButton` | a button: icon + text, icon only, text only | `icon`, `text`, `tone` (`raised`·`accent`·`danger`·`flat`), `cmd` / `page` / `js` / `onPress`… |
| `Tile` | a big toggle: icon, title, status line; lit when on | `icon`, `title`, `status` / `statusJoin`, `join`, `feedback` |
| `Badge` | a small pill; or on / off bound to a join | `text`, `tone`, `dot`, `join` + `on` / `off` |
| `Stat` | an icon, a big value, a label | `icon`, `value` / `valueJoin`, `label` |
| `Toggle` | a label and an ON / OFF pill | `label`, `join` |
| `Slider` | a bar with a label and the value | `label`, `join`, `min`, `max`, `value`, `unit`, `decimals`, `showValue`, `dragCmd` |
| `Stepper` | − value + | `join`, `value`, `min`, `max`, `step`, `decimals`, `unit` |
| `Segmented` | one of a few options | `options`, `join` (the index), `value` |
| `SceneBar` | one of several scenes, icon tiles | `scenes: [{ icon, title, cmd }]`, `join`, `value` |
| `Dimmer` | a light: icon, name, on / off, level | `label`, `icon`, `on`, `level` |
| `Blinds` | up / stop / down and the position | `label`, `position`, `onOpen` / `onStop` / `onClose` |
| `Dial` | a ring the value runs round: arc, thumb, the value in the middle; touch / drag the ring | `join`, `min`, `max`, `value`, `step`, `decimals`, `unit`, `label` / `labelJoin`, `size`, `thickness`, `color`, `sweep`, `steps` |
| `Knob` | a knob that turns, tick marks round it (GUI Designer's Dial demo); the value under it | `join`, `min`, `max`, `value`, `step`, `unit`, `label`, `size`, `color`, `pointer`, `sweep` |
| `Thermostat` | a setpoint Dial, the room temperature, − / +; modes below | `setpoint`, `value`, `current` / `currentJoin`, `min`, `max`, `step`, `unit`, `size`, `modes` + `mode` |
| `RadioGroup` | one of a few, as radio buttons | `options`, `join` (the index), `value` |
| `CheckBox` / `CheckBoxGroup` | on / off boxes | `label`, `join`, `value`; group: `options: [{ label, join, value }]` |
| `SelectBox` | a field opening the options: a sheet over the page, or a dropdown under the field | `options`, `join` (the index), `value`, `title`, `mode` (`sheet`·`dropdown`) |
| `ListRow` | a row: icon, title, subtitle; a value, a toggle or a chevron on the right | `icon`, `title`, `subtitle`, `value` / `valueJoin`, `toggle`, `chevron` + `page` / `js` / `cmd`, `divider` |
| `DataList` | a CF list of headers, rows, alerts, spacers, filled at start | `join` (list), `items: [{ header } \| { icon, title, subtitle, value, alert } \| { spacer }]` |
| `ScrollBox` | lines of text to drag through; or anything (children) scrolled as one: a list whose one row is a subpage of them (iViewer scrolls lists only; inside, joins are the row's - `IvaUI.fill` / `CF.listUpdate` reach them; pages, commands and JS on buttons work as anywhere) | `join` (list), `lines`, or children + `contentH` (default: as far down as they go), `w`, `h` |
| `WeekDays` | seven day toggles; the bitmask (Mon 1 … Sun 64) and a summary ("Weekdays", "Sun, Mon") | `join` (bitmask), `value`, `first` (`mon`·`sun`), `labels`, `textJoin`, `size` |
| `AlarmCard` | a titled card: on / off, the time (a TimePicker: a tap opens the drums), the days | `title`, `on`, `hour` / `minute` (analog joins, as numbers), `value` ("06:45"), `minuteStep`, `ampm`, `timeTitle`, `days`, `daysValue` |
| `TextField` | a label, a field (an icon, a placeholder while empty), the text in a serial join | `join`, `label`, `value`, `placeholder`, `password`, `icon`, `cmd` (sent on Return) |
| `SearchSelect` | a select box for long lists: the field opens a search field over the options, which filter as you type; a tap picks one | `options`, or `source` (a serial join with a JSON array: a script or a feedback fills it), `join` (the index), `value`, `mode`, `title`, `placeholder`, `empty`, `rows` |
| `TimePicker` | a time field; a tap opens hour and minute drums, OK writes them | `hour` / `minute` (analog joins, as numbers: 0-23, 0-59), `value` ('07:30'), `minuteStep`, `ampm`, `now` (a button: the panel's time), `mode`, `title`, `fontSize`, `showIcon` |
| `DatePicker` | a date field; a tap opens day, month and year drums, OK writes them (31 Feb becomes 28 / 29) | `day` / `month` / `year` (analog joins, as numbers), `value` ('2026-10-08'), `format` (D DD M MM MMM MMMM YYYY), `order` (`dmy`·`mdy`·`ymd`), `minYear` / `maxYear`, `months` (names), `today` (button text; false: none), `placeholder`, `mode` |
| `NumberField` | a number field; a tap opens a keypad, OK checks it's in range (else a message, the keypad stays) | `join` (analog, min..max as 0..65535), `value`, `min`, `max`, `decimals`, `digits`, `unit`, `words` ({ invalid, range }), `mode`, `title` |
| `ColorPicker` | a colour wheel, a brightness slider, a swatch with the hex, colours one tap away | `r` / `g` / `b` (analog joins, 0..255: written as you pick, followed when they change), `hex`, `value` ('#FFB000'), `swatches`, `onChange` (JS with `r`, `g`, `b`, `hex`), `size`, `port` |
| `PinPad` | a keypad: digits, ← (hold: clear), OK; the code shown as dots | `code` (serial join OK writes), `onEnter` (JS with `code`), `length`, `mask`, `placeholder` |
| `NavCard` | a card that goes to a page | `icon`, `title`, `text`, `page` |
| `Header` | the top bar: menu button, title, breadcrumbs, clock | `title`, `section`, `home`, `menu`, `clock`, `themeToggle` (a ◐ button: `IvaTheme.toggle()`) |
| `SideMenu` | a menu over the page, marking the page shown; its items scroll when there are more than fit (a tap acts on release, a drag scrolls) | `title`, `subtitle`, `items: [{ icon, text, page }]`, `menu`, `slide` |
| `ConfirmDialog` | a dialog over a dimmed page | `join`, `title`, `message`, `confirmText`, `cancelText`, `danger`, `onConfirm` |
| `DataTable` | a table: a search field, header taps sort (up, down, off), striped rows in tones, badge columns, a tap selects a row; "9 rows" / "2 of 9 rows" | `columns: [{ key, title, w, align, decimals, badge }]`, `data` or `source` (serial join: a JSON array), `keyField` + `selected` (serial join, both ways), `toneKey` (the field naming the tone: `alarm`·`warning`·`ok`·`running`·`muted`·`heating`·`cooling`·`offline`), `onSelect` (JS with `row`), `search`, `placeholder`, `words` |
| `Trend` | curves of joins over time (uPlot, in a web view the panel serves): range buttons, ‹ › through the past, Live; a touch reads the values; the panel records the joins | `curves: [{ join, label, color, scale, unit, decimals, side, width }]` (analog: 0..65535 as `scale`; serial: a number as text), `ranges` (seconds), `range`, `min` / `max`, `rightMin` / `rightMax`, `every` (seconds per sample), `history` (a panel function for older data: a database) |
| `Chart` | a Chart.js chart (in a web view the panel serves): bar, line, doughnut, pie, radar, polarArea | `type`, `labels`, `datasets: [{ label, data, joins (live, one per label), scale, color, colors }]`, `source` (serial join: JSON `{ labels, datasets }` or `[numbers]`), `horizontal`, `stacked`, `min` / `max`, `unit`, `legend`, `title` |
| `AlarmTable` | an alarm list: new alarms red / amber, acked ones dimmed, cleared grey; All / Active / Unacked, Ack (the selected row), Ack all, the counts. A cleared alarm goes away once acked | `name`, `conditions: [{ id, text, source, severity, join, above / below / equals }]` (checked on the panel), `source` (serial join: a JSON array of `{ id, text, source, severity, active, acked }`), `summary`; from scripts: `IvaAlarms.raise / clear / ack / ackAll(name, …)` |
| `AlarmBanner` | the newest unacknowledged alarm (alarms before warnings) and "+N more", blinking while any is unacknowledged; then the active ones, steady; else "No alarms" | `alarms` (the AlarmTable's name), `page` / `js` (a tap) |
| `Breadcrumbs` | Home › Floor 1 › Kitchen: all but the last are links | `items: (string \| { label, page, js })[]`, `back` (‹ to the previous page), `separator`, `fontSize` |
| `Loader` | a busy overlay over everything while a join is on: a spinner and a text; taps stay on it | `join` (digital), `text` / `textJoin`, `icon` |
| `DragDrop` | drag and drop, as CommandFusion's DragDropManager: tiles (items) dragged onto cards (targets); a target lights up while an item it takes is over it, a drop writes the item's label into its serial join and runs `onDrop`; the item goes back to its place | `name`, `items: [{ id, label, icon, x, y }]`, `targets: [{ id, label, icon, value (serial join), accept (item ids), x, y }]`, `onDrop` (JS with `item`, `target`), `placeholder`, `itemW` / `itemH`, `targetW` / `targetH`, `gap`, `w`, `h` |
| `Pager` | pages in one place: swipe, or tap a dot | `join` (analog: the page shown, 0, 1 …, both ways), `value`, `dots`, `w`, `h`; a page per child |

Put `Header` and `SideMenu` on every page (a small `Shell` component, as
the gallery does): the menu's subpages are defined the same each time, so
iva keeps one definition.

## How the circular ones work

iViewer can't draw an arc, so a Dial's arc is drawn by iva as frames
(`steps`, default 50: one every 2 %; 1x and @2x) and the panel shows the
frame for the value (an image's serial join), as CommandFusion's
ImageLevel demo does. The thumb (Dial) or the knob (Knob) is one image the
panel turns with `CF.setProperties({ zrotation })`, as in their Dial demo,
so it moves smoothly to the exact value. A touch or a drag on the ring
(tap and pan gestures) becomes an angle, then a value, snapped to `step`.
Dials that look the same share their frames; each look costs `steps + 1`
small images (× 2 for retina) - fewer `steps` for lighter projects.

The ColorPicker's swatch: iViewer can't colour anything from a script, so
(as CommandFusion's ColorPicker2 demo does) it's a web view loading a page
of that colour from the panel itself - the picker brings a TCP system
the panel's web server answers `GET /iva-color/RRGGBB` (one server, one
port, for every picker and web app - `<Project httpPort>`): its page knows
the colour from its own URL, so pickers loading at once can't show each
other's.

Trend and Chart are web apps (`<WebApp>`, [web.md](web.md)): the panel
serves the page from a server of its own, the chart library inline.

Pickers open as a sheet in the middle of the panel (`mode="sheet"`,
dimmed behind) or a dropdown under the field (`mode="dropdown"`); a tap
outside closes them. A drum is a list: drag it (it settles on a row) or tap
a row. Two pickers on the same joins share their popup when they look the
same, else each has its own.

Two looks: `defaultTheme` (dark) and `lightTheme`. With
`<Project themes={['dark', 'light']}>` (docs/components.md, "Runtime
themes"), `createUi()` builds each look in its colours and the panel switches
between them; `createUi({ accent: '#0A84FF' }, { light: { accent: '#0060DF' } })`
changes a colour in every look, and one look's own.

Tables: a DataTable is a CF list whose rows are a subpage of their own.
iViewer can't colour a row from a script, so each tone's row (normal, every
other, selected) and badge is an image iva draws (kept in a hidden subpage,
so they ship with the .gui), and each row sets its own through a serial
join. The search and the sorting run on the panel, over the rows it has.

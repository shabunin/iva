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
| `NavCard` | a card that goes to a page | `icon`, `title`, `text`, `page` |
| `Header` | the top bar: menu button, title, breadcrumbs, clock | `title`, `section`, `home`, `menu`, `clock` |
| `SideMenu` | a menu over the page, marking the page shown | `title`, `subtitle`, `items: [{ icon, text, page }]`, `menu`, `slide` |
| `ConfirmDialog` | a dialog over a dimmed page | `join`, `title`, `message`, `confirmText`, `cancelText`, `danger`, `onConfirm` |

Put `Header` and `SideMenu` on every page (a small `Shell` component, as
the gallery does): the menu's subpages are defined the same each time, so
iva keeps one definition.

Not yet: Dial, Thermostat, ColorPicker (arcs need drawn frames), forms,
pickers, lists and tables, runtime theme switching.

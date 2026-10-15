# iva base components

Every element compiles to the `.gui` XML GUI Designer writes (checked
against CommandFusion's 48 demo projects). Elements need no import (they're
injected); `import { Button } from 'iva'` works too.

## Structure

| JSX | `.gui` | Key props |
|---|---|---|
| `<Project>` | `<gui>` + `<properties>` | `name`; `device` (`iPad`, `iPad Pro 11`, `iPad Pro 12.9`, `iPad Air 10.5`, `iPhone X`, `iPhone XS Max`, `iPhone 8`, `iPhone 8 Plus`, `iPhone 5`, `iPhone 4`) + `orientation`, or `width` / `height` (wider than tall → landscape is the main orientation); `otherSize`, `autoposition`, `joinBase`, `assets` (a folder shipped whole; images found there by bare name; default `./assets`), `properties` (raw XML after `<size>`), `licenses` (the devices licensed to run it, iViewer's registration data: `{ 'Kitchen iPad': '8437F51D…' }`, the code iViewer shows on the device), `themes` + `theme` (looks switched at runtime, below), `folders` (default true: the build's assets/ - the .gui's image folder: iva's drawings in a folder per component type - dials/<its label>/, knobs/, pickers/, buttons/, boxes/, rows/, banners/, sliders/, backgrounds/, icons/ - readably named, and scripts/, where iViewer looks for the .gui's scripts; false: everything beside the .gui, in the image folder its `properties` name, if any), `httpPort` (the panel's web server: web apps, swatches; default the first free from 8900), `sizes` (other screens it's built for, `'1920x1080'`, a phone's `'1400x1400@3x'`: [Screen sizes](#screen-sizes)) |
| `<Page>` | `<page>` + `<portrait>`/`<landscape>` | `name`, `start`, `bg`, `image`, `theme`, `tags`. Items go into the main orientation (the other is written empty, as GUI Designer does) |
| `<Landscape>` / `<Portrait>` | `<landscape>` / `<portrait>` | `bg`, `image`, `theme`. With these, the page has exactly the orientations given, in that order |
| `<Subpage>` | `<subpage name w h>` (definition) + placement | `name`, `w`, `h`, `clip`, `bg`/`image`/`theme`, `radius` / `borderWidth` / `borderColor` (drawn). Inside a page it is defined *and* placed (`x`, `y`, `join`, `visible`, `in`, `out`, `topmost` (above everything: placed last), `fixed` (at x / y whatever `<Group>` it is in), `clickthrough`), or only defined with `define`; in `<Project>` it is only defined |
| `<SubpageRef>` | `<subpage name x y j …>` | `name` + the placement props: places a subpage defined elsewhere |

## Items

| JSX | `.gui` | Join | Key props |
|---|---|---|---|
| `<Button>` | `<btn>` + `<inactive>`/`<active>` (+ `<actions>`) | `join` digital; `textJoin` / `activeTextJoin` serial | `text`, `activeText`, `icon` / `activeIcon` (a file, `fa('name')`, or `{ src, x, y, w, h }`), `iconAlign` (`center`·`left`·`top`), `feedback` (`momentary`·`toggle`·`none`), `page` (flip; `'Return'`), `cmd`, `js`, `repeat`, `onPress` / `onRelease` / `onHold` + `holdTime`, style props incl. `radius` / `borderWidth` / `borderColor`, `active={{…}}` |
| `<Text>` | `<txt>` | `join` serial | `text` or children, `wrap`, style props; `bg` / `radius` / a border become a drawn box behind it (iViewer draws no text backgrounds) |
| `<Image>` | `<img>` | `join` serial (file / URL) | `src` (a file, a URL, or `fa('name', { color, size })`), `clickthrough`, `refresh`, `noCache`, `downloadIndicator`, `clearOnURLChange`; children: `<Gesture>` |
| `<Slider>` | `<slider>` + `<indicator>`×2 | `join` analog; `pressJoin` digital | `min`, `max`, `decimals`, `invert`, `feedback`, `dragCmd` / `pressCmd` / `releaseCmd`; looks: `bg`/`image` (track), `fill`/`fillImage`, `radius`, `thumb`/`activeThumb` or `thumbColor` + `thumbSize` |
| `<Gauge>` | `<gauge>` | `join` analog | `bg`/`image`, `fill`/`fillImage`, `radius`, `theme` |
| `<List>` | `<list>` | `join` list | `item` (subpage name or an inline `<Subpage>`), `header`, `title`, `footer`, `orientation`, `swipeDelete`, `scrollCmd`, `scrollInterval`, `listEndCmd`, `listEndOffset`, `bg` |
| `<Input>` | `<input>` | `join` serial (`s=`): typing writes it, setting it sets the text | `text` (initial), `password`, `autoFocus`, `cmd` / `macro` (sent on Return; `[inputval]` is the text), `changeCmd` / `changeMacro` (on each change), style props |
| `<Web>` | `<web>` | `join` serial (the URL: setting it loads it), `titleJoin` serial, `backJoin`, `forwardJoin`, `refreshJoin`, `stopJoin` digital | `url`: a URL, a file of the project (`page.html`, in `assets/`), or `panel:/path` (a page of the panel's own web server) |
| `<Video>` | `<video>` | `join`, `playJoin`, `stopJoin` (numbers) | `url`, `format` (`mjpeg`·`mpeg4`), `autoplay`, `controls`, `bg`, `cache`, `auth={{user, password, …}}` |
| `<WebApp>` | `<web>` + a server `<system>` + `apps/<name>.js` | `joins={{ name: d('x'), … }}`: what the page sees and sets, by name | a web page the panel serves itself (charts, 3D - [docs/web.md](web.md)): `entry` (your module, bundled with its npm imports; or `iva:trend` / `iva:chart`), `name` (its path on the panel's web server: `/<name>/`; one port for all, `<Project httpPort>`), `options` (JSON for the page), `handlers` (panel functions it may call), `record={{ every, keep }}`, `bg`, `title` |
| `<Gesture>` | `<gesture>` + `<action phase>` | in actions: `join: 'd10'` / `d(10)` | `type` (`tap`·`swipe`·`pan`·`press`·`rotate`·`pinch`), `touches`, `taps`, `direction`, `onBegin` / `onChange` / `onEnd` (js string or `{ js, join, value }`) |

All items take `x`, `y` (default 0), `w`, `h` (required) and `tags`.

## Systems and logic

| JSX | `.gui` | Key props |
|---|---|---|
| `<System>` | `<systems><system>` | `name`, `host`, `port`, `protocol` (`tcp`·`udp`·`http`), `localPort`, `mode` (`alwaysOn`·`transitory`·`dialog`) + `idleTimeout` / `dialogTimeout`, `accept` (TCP: server; UDP: incoming), `acceptBroadcasts`, `eom`, `offlineQueue`, `connectJoin` / `disconnectJoin`, `heartbeat={{ mode: 'reply'\|'initiate', tx, rx }}`, `ssl`, `textEncoding`, `sendHandler`, `startupCmd`, `startupMacro`, `maxConnections`; children `<Command>`, `<Feedback>`. Defaults are GUI Designer's for a new system of the protocol. Anywhere (a component can bring one): lifted to the project, the same system once |
| `<HttpServer>` | a TCP `<system accept>` + its request feedback | `name`, `port`, `handler`: a panel function (name or `function (req, res) {…}`) answering each request with `res.json` / `html` / `text` / `bytes` / `asset` ([docs/web.md](web.md)) |
| `<Command>` | `<cmd>` | `name`, `send` (or children; `\xNN`, `[tokens]`), `js` + `jsSendsCommand`, `target` + `value` (set a join), `folder` |
| `<Feedback>` | `<fb>` | `name`, `regex` (`(?ims)` flags allowed); children `<Capture>`, `<OnMatch>` |
| `<Capture>` | `<group>` | `join` (`d(5)`, `'s12'`, `'a:level'`), `type` (how it's read, default: the join's type: `type="a" join="s2"` = a number, transformed, into a serial join), `index`, `name`, `onVal` / `offVal`, `transform`, `min` / `max`, `unit`, `setToken` |
| `<OnMatch>` | `<onmatch>` | `target`, `value`, `cmd`, `token` |
| `<Macro>` + `<Step>` | `<macros><macro>` + `<command delay>` | `name`; steps: `command`, `delay` (ms from the start) |
| `<Token>` | `<tokens><token>` | `name` (`[brackets]` optional), `value`, `persist` |
| `<Script>` | `<scripts><script>` + the file | `src` (copied), or `name` + `code`. Anywhere (a component can bring one): lifted to the project, the same script once |
| `<Sound>` | `<sounds><sound>` + the file | `name`, `src`, `join` digital, `loop`, `releaseStop` |
| `<Theme>` | `<themes><theme>` | `name`, `type` (`button`·`text`·`background`·`gauge`·`input`·`list`), style props + `active`, or `states={[css0, css1, …]}` (exact CSS): a named theme, used with `theme="Name"` |
| `<Box>` | `<img clickthrough>` + a drawn image | `x`, `y`, `w`, `h`, `bg`, `radius`, `borderWidth` / `borderColor`: a rounded rectangle touches go through (card, bar, track backgrounds) |
| `<Group>` | its children | `x`, `y`: moves what's inside (lay a card's content out relative to the card) |
| `<OnStart>` | a generated `iva-start.js` | `js`: code run once the panel has started (all of it in one `CF.modules` setup, each distinct piece once); `joins`: the joins it uses no element does |
| `<Raw>` | the element as written | `xml`: one .gui element, verbatim (anywhere an item, a system / feedback / macro child, or a project section goes) |

## Style props → themes

`bg`, `image` (+ `slice` for 9-slice), `color`, `font`, `fontStyle`, `fontName`,
`fontSize`, `bold`, `italic`, `align`, `valign`, `shadow`, `opacity`,
`padding`, `borderWidth`, `borderColor`, `css` (raw extra CSS).

Fonts: `font` is the family as iOS / Android name it (`'Helvetica Neue'`,
`'Avenir Next'`, `'Roboto'`; default `'Arial'`), `bold` / `italic` or
`fontStyle` (`'Medium'`, `'Light'`, `'Demi Bold'`, ...) pick the style, and
iva writes the device's font name for it (`font-name: 'HelveticaNeue-Bold'`,
from GUI Designer's font list). A family or style the devices don't have is
a warning; give `fontName` for fonts you ship. A `.gui` styles objects
only through named CSS themes, so each distinct style becomes one generated
theme (`btn_1a2b3c`), shared by every element that looks the same. Text
themes get the full text block GUI Designer writes. Buttons have two states:
`active={{ bg: '#2f6fd6' }}` is laid over the normal style.
`theme="Name"` uses a `<Theme>` instead (not both).

Sliders and gauges are drawn by iViewer from images only: `bg`, `fill` and
`thumbColor` make iva draw them (anti-aliased PNGs, `radius` for the
corners), or give image files with `image`, `fillImage`, `thumb`.

## Rounded corners, borders, icons

iViewer has no CSS border-radius and loads no font files of the project's
own, so iva **draws** these into images at build time (PNG, plus an `@2x`
version iViewer uses on retina screens):

- `radius`, `borderWidth` + `borderColor` on a `<Button>` or `<Subpage>`:
  the background is drawn at the element's size, per state
  (`active={{ bg, borderColor }}` gets its own). `radius={h / 2}` is a pill,
  on a square a circle.
- `fa('lightbulb')`: a [Font Awesome](https://fontawesome.com/search?m=free)
  (free) icon. On a `<Button>` (`icon={fa('tv')}`) it's drawn in the text
  colour of each state, half the button's height (`fa('tv', { size: 32 })`),
  centred, or with `iconAlign="left"` / `"top"` beside / above the text.
  `<Image src={fa('house', { color: '#9aa4b1' })} />` is an icon on its own.
  `fa('bell', { style: 'regular' })`, `fa('brands:spotify')`. A misspelt
  name is an error with a suggestion. (Font Awesome Free: CC BY 4.0 icons.)

Other drawings for `<Image src>` (what the circular `iva/ui` controls are
made of): `draw.arc({ size, thickness, from, to, color })`,
`draw.dot({ size, ring, at, diameter, color })`,
`draw.knob({ size, color, pointer, at })`,
`draw.ticks({ size, count, from, to, length, width, color })` - angles in
degrees clockwise from 12 o'clock; `draw.wheel({ size })` (a colour wheel:
hue round it, red at 12 o'clock, white in the middle),
`draw.ring({ size, thickness, color, outline })` (a marker),
`draw.cutout({ w, h, radius, color })` (a frame with a rounded hole: over a
`<Web>`, it rounds its corners). `name` fixes the file name.

## Web views and input fields in the preview

`iva dev` shows a `<Web>` as a real page (an iframe) and an `<Input>` as a
real text field, stacked as on the device: an image drawn over a web view
still covers it (CommandFusion's ColorPicker2 demo shows its colour through
a logo cut out of an image), and the field you type into sits where the
`<Input>` is. A web view loading from the panel's own HTTP server (a TCP
`<System accept>`) works too: the preview's backend listens on that port,
and the page loads through `iva dev` (`/__iva/loop/<port>/`), so it works
from any machine you open the preview on.
A browser keeps other sites' pages to themselves, so for those the title
join stays empty, and back / forward only go through the URLs the panel
loaded.

## Runtime themes

```jsx
<Project name="Home" width={1280} height={800} themes={['dark', 'light']}>   // starts in the first (or theme="light")
  <Page name="Main" bg={variant() === 'light' ? '#EEF1F4' : '#14171A'}>…</Page>
</Project>
```

iva builds the project once per look - `variant()` says which one is being
built (iva/ui's `createUi` takes its colours from it) - and merges the looks
into one .gui. On the panel, `IvaTheme.set('light')` / `IvaTheme.toggle()`
switch with the CommandFusion API:

- an object whose theme differs between the looks is tagged, and one
  `CF.setProperties([{ join: tag, theme }, …])` swaps them all;
- an image that differs gets a serial join and `CF.setJoin` swaps its file.
  So in a themed project a page's / subpage's colour background is a drawn
  image, and a button's drawn icon is drawn into its state's background;
- a subpage used only as list rows is copied per look (`name__light`):
  iva/ui's lists fill with the look's rows, and fill again on a switch;
- the look shown is a persisted global token, `[iva_theme]`: the panel starts
  in the last one. `IvaTheme.current()`, `IvaTheme.onChange(fn)`,
  `IvaTheme.file(name)` (an image's name in the look shown, for scripts).

The looks must be the same elements: only colours (themes, drawn images)
may differ - iva says where they don't. Not switched: a slider's thumb
image, a page background from an image file, lists a project's own script
fills with its default row.

## Screen sizes

iViewer shows a GUI on any screen: smaller than the screen, it's scaled up
to fill it, keeping its proportions (black bars where they differ - on
Android the project's positioning, iva's `autoposition="scale"`); bigger,
it's cropped. To fit a screen for real, a project is built for it:

```jsx
const { width, height } = screen();   // the size being built
<Project name="Home" width={1280} height={800} sizes={['1920x1080', '1400x1400@3x']}>
```

- `screen()` is the size being built: the `<Project>`'s own, or the one
  asked for. A project that lays itself out from it fits every size (iva/ui
  does: its header, menu and dialogs follow it; `ui.grid()` places cards,
  `ui.ScrollArea` scrolls what doesn't fit, `ui.Screens` puts what can't
  scroll on screens a tab apart - [docs/ui.md](ui.md)).
- `sizes`: the other screens. `iva build` writes the project's own size to
  `dist/` and each other in `dist/<W>w<H>h/` (`1920w1080h/`); `--zip` puts
  them all in one archive - iViewer (4.1 on) loads the GUI whose path names
  its screen (Android: `1080w1920h`, either orientation; else the first GUI
  in the archive). `iva dev` lists each size in the GUI picker; `--size
  1400x1400` builds or previews one size (`iva build`, `dev`, `serve`,
  `designer`).
- A phone: `'1400x1400@3x'`. Its screen is dense - laid out at its own
  pixels, a tablet's layout comes out a third of the size. So it's laid out
  at the size divided by the scale (467x467; `screen().scale` is 3), iViewer
  scales the GUI up to the screen, and iva draws its images at 3x so they
  stay sharp. Pick the scale for the screen's density (a 1400x1400 phone of
  4.5": 3; 2 or 2.5 fit more on it).

## Joins

| Write | Means |
|---|---|
| `join={12}` | join 12 of the type the element uses (Button: digital, Text: serial, Slider: analog, List: list) |
| `join="volume"` | a named join: iva numbers names from `joinBase` (1000) up, per type, skipping numbers used explicitly |
| `d(12)`, `a('level')`, `s(…)`, `l(…)` | a join with its type, where the element can't tell (`<Capture>`, `<OnMatch>`, gestures). Also `'d12'`, `'s:title'` |

Named joins land in `dist/joins.json` and in a generated `iva-joins.js`
script, loaded first, so project scripts write `CF.setJoin(Joins.s.title, …)`.

## Button actions

| Write | `.gui` |
|---|---|
| `cmd="Power"` / `onPress={['Power']}` | `<btn cmd="Power">` |
| `js="…"` / `onPress={[js('…')]}` | `<btn js="…">` |
| `onPress={[cmd('Up', { repeat: 200 })]}` | `<actions><action><press repeat="200" command="Up"/>` |
| `onHold={[macro('AllOff')]}` + `holdTime={1500}` | `<press hold="1500" macro="AllOff"/>` |
| `onRelease={[js('stop()', { delay: 100 })]}` | `<release delay="100" js="stop()"/>` |
| `page="Settings"` | `flip="Settings"` |
| `href="cf://192.168.0.10:8019/other.gui"` | `href="…"`: on release, iViewer loads that GUI (GUI linking); another URL opens outside |
| `onPress={setProps(d('cube'), { scale: 1.5 }, { duration: 0.3 })}` | `<btn js="CF.setProperties({ join: Joins.d[&quot;cube&quot;], scale: 1.5 }, 0, 0.3, …);">` |

## Animations: setProps()

`setProps(element, properties, options)` changes an element's properties
with `CF.setProperties` - moved, scaled, turned, faded, flipped - at once or
animated, then the next thing. It's an action: a button's `onPress`, or code
in a script (`` js={`${setProps(...)}`} ``, `<OnStart js={...}>`).

```jsx
<ui.IconButton icon="cube" join="cube" feedback="none" />

// bigger, then back: the second in the first one's callback
<Button text="Bounce" onPress={setProps(d('cube'), { scale: 1.3 }, { duration: 0.15, curve: 'easeOut',
  then: setProps(d('cube'), { scale: 1 }, { duration: 0.25, curve: 'easeIn' }) })} />

// by how much, from where it is (CF.getProperties first)
<Button text="Right" onPress={setProps(d('cube'), { x: '+200' }, { duration: 0.6, curve: 'easeInOut' })} />

// several elements in one call: joins and tags (elements' `tags`)
<Button text="Hide" onPress={setProps([d('cube'), 'controls'], { opacity: 0 }, { duration: 0.4 })} />
```

- **element**: a join - `d('cube')`, `s(12)`, `a('level')` (the element's
  `join`: a button's digital, an image's or a text's serial, a slider's
  analog) - a tag, or a list of them. A named join no element has is a
  build warning (with the nearest name).
- **properties**: `x`, `y`, `w`, `h`, `opacity` (0..1; at 0 not tapped
  either), `scale`, `xscale`, `yscale`, `zrotation` (degrees clockwise),
  `xrotation` / `yrotation` (3D: `yrotation` 0 → 90 shows the edge - a card
  flip), `theme` (a `<Theme>` by name, switched at the end of the delay).
  A number, or `'+n'` / `'-n'`: by how much (joins only).
- **options**: `delay` and `duration` in seconds; `curve` - `'linear'`
  (default), `'easeIn'`, `'easeOut'`, `'easeInOut'`; `then` - another
  `setProps()`, a `cmd()` / `macro()` / `js()`, or a list of them, run once
  it's done.

A turn of more than 180° at once may go either way: split it (`zrotation`
179, then 358, then 0 at once, as CommandFusion's docs do). What isn't one
call - a toggle (there and back), a value from the panel - is a script's: the
gallery's Animations page (`examples/gallery/pages/Animations.jsx`) has both.
Subpages animate on their own: `in` / `out` on `<Subpage>` / `<SubpageRef>`
(fade, moveIn / push / reveal from a side, a time, an ease).

## GUI linking

A button's `href="cf://host:port/other.gui"`, `CF.openURL("cf://…")` and
`CF.loadGUI(url, { startPage })` load another GUI (`CF.loadGUI("")`: this
one again). In `iva dev` the GUI it names is, in order: a `.gui` of the
project being previewed with that file name (the link's own folder first -
CommandFusion's GUILinking demo links `cf://192.168.0.10:8019/gui-B.gui`,
the preview opens this machine's `gui-B.gui` and says so in the status
bar); else the URL, fetched by `iva dev` with its images and scripts (the
browser can't fetch another site's files) - `iva dev http://host/x.gui`
previews one too. A zipped GUI (`x.gui.zip`, `x.zip`: the .gui and its
files in one archive, as iViewer loads one) loads from the archive - on disk,
or fetched: its .gui is the one named after the archive, else the
shallowest; images, scripts and CF.loadAsset's files come from the archive.
iViewer 5 profiles (`profile:Name`) are the device's own: not in the
preview.

## What iva doesn't model

Every element takes `xml={{ attr: 'value' }}`: attributes written over what
iva writes, `null` removing one. `<Raw xml={`<timer j="1" interval="0" />`} />`
writes an element as is. The decompiler uses both, so any `.gui` survives a
round trip; in new code they're rarely needed.

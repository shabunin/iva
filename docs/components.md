# iva base components

Every element compiles to the `.gui` XML GUI Designer writes (checked
against CommandFusion's 48 demo projects). Elements need no import (they're
injected); `import { Button } from 'iva'` works too.

## Structure

| JSX | `.gui` | Key props |
|---|---|---|
| `<Project>` | `<gui>` + `<properties>` | `name`; `device` (`iPad`, `iPad Pro 11`, `iPad Pro 12.9`, `iPad Air 10.5`, `iPhone X`, `iPhone XS Max`, `iPhone 8`, `iPhone 8 Plus`, `iPhone 5`, `iPhone 4`) + `orientation`, or `width` / `height` (wider than tall → landscape is the main orientation); `otherSize`, `autoposition`, `joinBase`, `assets` (a folder shipped whole; images found there by bare name; default `./assets`), `properties` (raw XML after `<size>`) |
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
| `<Web>` | `<web>` | `join` serial (the URL: setting it loads it), `titleJoin` serial, `backJoin`, `forwardJoin`, `refreshJoin`, `stopJoin` digital | `url`: a URL, or a file of the project (`page.html`, in `assets/`) |
| `<Video>` | `<video>` | `join`, `playJoin`, `stopJoin` (numbers) | `url`, `format` (`mjpeg`·`mpeg4`), `autoplay`, `controls`, `bg`, `cache`, `auth={{user, password, …}}` |
| `<Gesture>` | `<gesture>` + `<action phase>` | in actions: `join: 'd10'` / `d(10)` | `type` (`tap`·`swipe`·`pan`·`press`·`rotate`·`pinch`), `touches`, `taps`, `direction`, `onBegin` / `onChange` / `onEnd` (js string or `{ js, join, value }`) |

All items take `x`, `y` (default 0), `w`, `h` (required) and `tags`.

## Systems and logic

| JSX | `.gui` | Key props |
|---|---|---|
| `<System>` | `<systems><system>` | `name`, `host`, `port`, `protocol` (`tcp`·`udp`·`http`), `localPort`, `mode` (`alwaysOn`·`transitory`·`dialog`) + `idleTimeout` / `dialogTimeout`, `accept` (TCP: server; UDP: incoming), `acceptBroadcasts`, `eom`, `offlineQueue`, `connectJoin` / `disconnectJoin`, `heartbeat={{ mode: 'reply'\|'initiate', tx, rx }}`, `ssl`, `textEncoding`, `sendHandler`, `startupCmd`, `startupMacro`, `maxConnections`; children `<Command>`, `<Feedback>`. Defaults are GUI Designer's for a new system of the protocol. Anywhere (a component can bring one): lifted to the project, the same system once |
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
`<System accept>`) works too: the preview's backend listens on that port.
A browser keeps other sites' pages to themselves, so for those the title
join stays empty, and back / forward only go through the URLs the panel
loaded.

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

## What iva doesn't model

Every element takes `xml={{ attr: 'value' }}`: attributes written over what
iva writes, `null` removing one. `<Raw xml={`<timer j="1" interval="0" />`} />`
writes an element as is. The decompiler uses both, so any `.gui` survives a
round trip; in new code they're rarely needed.

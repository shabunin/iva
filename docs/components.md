# iva base components

Every element compiles to the `.gui` XML GUI Designer writes (checked
against CommandFusion's 48 demo projects). Elements need no import (they're
injected); `import { Button } from 'iva'` works too.

## Structure

| JSX | `.gui` | Key props |
|---|---|---|
| `<Project>` | `<gui>` + `<properties>` | `name`, `width`, `height` (wider than tall → landscape is the main orientation), `otherSize`, `autoposition`, `joinBase` |
| `<Page>` | `<page>` + `<portrait>`/`<landscape>` | `name`, `start`, `bg`, `image`, `theme`, `tags`. Items go into the main orientation |
| `<Landscape>` / `<Portrait>` | `<landscape>` / `<portrait>` | `bg`, `image`, `theme`: for a page laid out for both orientations |
| `<Subpage>` | `<subpage name w h>` (definition) + placement | `name`, `w`, `h`, `clip`, `bg`/`image`/`theme`. Inside a page it is defined *and* placed (`x`, `y`, `join`, `visible`, `in`, `out`, `topmost`, `clickthrough`); in `<Project>` it is only defined |
| `<SubpageRef>` | `<subpage name x y j …>` | `name` + the placement props: places a subpage defined elsewhere |

## Items

| JSX | `.gui` | Join | Key props |
|---|---|---|---|
| `<Button>` | `<btn>` + `<inactive>`/`<active>` (+ `<actions>`) | `join` digital; `textJoin` / `activeTextJoin` serial | `text`, `activeText`, `icon`, `activeIcon`, `feedback` (`momentary`·`toggle`·`none`), `page` (flip; `'Return'`), `cmd`, `js`, `repeat`, `onPress` / `onRelease` / `onHold` + `holdTime`, style props, `active={{…}}` |
| `<Text>` | `<txt>` | `join` serial | `text` or children, `wrap`, style props |
| `<Image>` | `<img>` | `join` serial (file / URL) | `src` (file or URL), `clickthrough`, `refresh`, `noCache`, `downloadIndicator`, `clearOnURLChange`; children: `<Gesture>` |
| `<Slider>` | `<slider>` + `<indicator>`×2 | `join` analog; `pressJoin` digital | `min`, `max`, `decimals`, `invert`, `feedback`, `dragCmd` / `pressCmd` / `releaseCmd`; looks: `bg`/`image` (track), `fill`/`fillImage`, `radius`, `thumb`/`activeThumb` or `thumbColor` + `thumbSize` |
| `<Gauge>` | `<gauge>` | `join` analog | `bg`/`image`, `fill`/`fillImage`, `radius`, `theme` |
| `<List>` | `<list>` | `join` list | `item` (subpage name or an inline `<Subpage>`), `header`, `title`, `footer`, `orientation`, `swipeDelete`, `scrollCmd`, `scrollInterval`, `listEndCmd`, `listEndOffset`, `bg` |
| `<Input>` | `<input>` | `join` serial (`s=`) | `password`, `autoFocus`, style props |
| `<Web>` | `<web>` | `join`, `titleJoin`, `backJoin`, `forwardJoin`, `refreshJoin`, `stopJoin` (numbers) | `url` |
| `<Video>` | `<video>` | `join`, `playJoin`, `stopJoin` (numbers) | `url`, `format` (`mjpeg`·`mpeg4`), `autoplay`, `controls`, `bg`, `cache`, `auth={{user, password, …}}` |
| `<Gesture>` | `<gesture>` + `<action phase>` | in actions: `join: 'd10'` / `d(10)` | `type` (`tap`·`swipe`·`pan`·`press`·`rotate`·`pinch`), `touches`, `taps`, `direction`, `onBegin` / `onChange` / `onEnd` (js string or `{ js, join, value }`) |

All items take `x`, `y` (default 0), `w`, `h` (required) and `tags`.

## Systems and logic

| JSX | `.gui` | Key props |
|---|---|---|
| `<System>` | `<systems><system>` | `name`, `host`, `port`, `protocol` (`tcp`·`udp`), `localPort`, `accept`, `acceptBroadcasts`, `eom`, `alwaysOn`, `offlineQueue`, `connectJoin` / `disconnectJoin`, `heartbeat={{tx, rx, mode}}`, `startupCmd`, `startupMacro`, `maxConnections`; children `<Command>`, `<Feedback>` |
| `<Command>` | `<cmd>` | `name`, `send` (or children; `\xNN`, `[tokens]`), `js` + `jsSendsCommand`, `target` + `value` (set a join), `folder` |
| `<Feedback>` | `<fb>` | `name`, `regex` (`(?ims)` flags allowed); children `<Capture>`, `<OnMatch>` |
| `<Capture>` | `<group>` | `join` (`d(5)`, `'s12'`, `'a:level'`), `index`, `name`, `onVal` / `offVal`, `transform`, `min` / `max`, `unit`, `setToken` |
| `<OnMatch>` | `<onmatch>` | `target`, `value`, `cmd`, `token` |
| `<Macro>` + `<Step>` | `<macros><macro>` + `<command delay>` | `name`; steps: `command`, `delay` (ms from the start) |
| `<Token>` | `<tokens><token>` | `name` (`[brackets]` optional), `value`, `persist` |
| `<Script>` | `<scripts><script>` + the file | `src` (copied), or `name` + `code` |
| `<Sound>` | `<sounds><sound>` + the file | `name`, `src`, `join` digital, `loop`, `releaseStop` |
| `<Theme>` | `<themes><theme>` | `name`, `type` (`button`·`text`·`background`·`gauge`·`input`·`list`), style props, `active`: a named theme, used with `theme="Name"` |

## Style props → themes

`bg`, `image` (+ `slice` for 9-slice), `color`, `font`, `fontName`, `fontSize`,
`bold`, `italic`, `align`, `valign`, `shadow`, `opacity`, `padding`,
`borderWidth`, `borderColor`, `css` (raw extra CSS). A `.gui` styles objects
only through named CSS themes, so each distinct style becomes one generated
theme (`btn_1a2b3c`), shared by every element that looks the same. Text
themes get the full text block GUI Designer writes. Buttons have two states:
`active={{ bg: '#2f6fd6' }}` is laid over the normal style.
`theme="Name"` uses a `<Theme>` instead (not both).

Sliders and gauges are drawn by iViewer from images only: `bg`, `fill` and
`thumbColor` make iva draw them (anti-aliased PNGs, `radius` for the
corners), or give image files with `image`, `fillImage`, `thumb`.

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

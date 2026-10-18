# CommandFusion JavaScript API: what iva's runtime supports

Checked on 18 October 2026 against main (after the review fixes, commit
114e826) and CommandFusion's own docs at commandfusion.com/docs/scripting
(gui, lists, display, sound, net, video, sensors, util, globals, startup,
modules, changes). Method: every documented function, event, constant and
variable was looked up on the live `CF` object of iva's runtime running a GUI
in Node (`test/gui-runtime.ts`), the known-answer checks below were run, and
the behaviour of each member was read in `src/runtime/cf`. That probe is now
`test/cf-api-surface.test.ts`; the docs' rules are held up to the runtime in
`test/cf-docs-gui.test.ts` and `test/cf-docs-net.test.ts`. The behavioural
gaps found that day were closed the same day (commits 6a9f669 to ede2638):
this is the state after them.

Status words: Yes (as documented), Partly (works with a difference that can
matter), No (a stub, or nothing behind it).

| | Documented | Yes | Partly | No |
|---|---|---|---|---|
| Functions | 44 | 35 | 1 | 8 |
| Events | 25 | 18 | 1 | 6 |
| Constants | all | all present | | |

Everything documented exists on `CF`, so a script never hits "undefined is
not a function". What is missing is behind the sound, sensor, video and
device-property calls, which need hardware iva's hosts don't expose.

## Startup, globals and watching

| Member | Documented | iva | Notes |
|---|---|---|---|
| `CF.userMain` | called after scripts load, modules set up, before systems start | Yes | Order: scripts, GUI shown, module `setup` (with `object` as `this`), `userMain`, systems started, PreloadingCompleteEvent. |
| `CF.modules` | `{ name, setup, object, version }` entries | Yes | |
| `CF.device` | platform, version, model, uuid, legacyUniqueIdentifier, uniqueIdentifier, name, screenBrightness, soundOutputVolume, batteryLevel, batteryChargeStatus, hasSensors, displayDensity, machineName, pushid | Partly | Platform, version, model, name and uuid come from the host (the machine in `iva dev`, the phone in the panel app). Brightness, volume, battery and pushid are placeholders; `hasSensors` says false. |
| `CF.ipv4address`, `ipv4netmask`, `ipv6address`, `ipv6netmask`, `MACaddress`, `networkType`, `networkSSID` | the device's network | Partly | From the host. `networkSSID` is empty, `MACaddress` on Android is the placeholder Android gives apps. |
| `CF.systems` | per system: type, enabled, address, port, localPort, connect, disconnect, connections | Yes | Live getters. The Main Control System (`""`, type `cf`) does not exist: iva has no CF protocol client. |
| `CF.guiURL`, `CF.currentPage`, `CF.currentOrientation` | | Yes | |
| `CF.GlobalTokensJoin`, orientation, animation curve, hash, CRC, output format, list position, cache, device property, charge, status bar, navigation bar, keypress and sensor constants | | Yes | Values are iva's own strings; use the symbols as the docs do. |
| `CF.watch(event, cb)`, `(event, join or joins, cb)`, trailing `true` to fire once | | Yes | Fire-now works for JoinChange, ConnectionStatusChange, NetworkStatusChange, PageFlip and OrientationChange, and is refused for GUISuspended as documented. Fire-now for a join hands what `getJoin` hands: the tags, and a null value and null tokens for a join the GUI lacks. |
| `CF.watch(FeedbackMatchedEvent, system, feedback, cb)`, `(ConnectionStatusChangeEvent, system, cb)` | | Yes | |
| `CF.watch(BeaconDetectionEvent, uuid, major, minor, cb)` | | No | Parsed as a join watch; nothing fires. |
| `CF.unwatch(event)`, `(event, join or joins)`, with or without the callback | | Yes | |
| `CF.debug`, `CF.version` | not in the docs | undefined | iViewer has `CF.debug` under the remote debugger; iva's start code checks it. iva adds `CF.runtime = "iva"`. |

## GUI API

| Member | Documented | iva | Notes |
|---|---|---|---|
| `CF.getJoin(join, cb)` | cb(join, value as string, tokens, tags); missing join: null value and tokens | Yes | Also returns the value. |
| `CF.getJoins(joins, cb)` | cb(object by join: value, tokens, tags) | Yes | |
| `CF.setJoin(join, value [, sendEvent])` | strings evaluated like feedback: `[@a1]`, `{{math}}`; digital clipping | Yes | Setting a join to the value it has fires no event. |
| `CF.setJoins(array [, sendEvent])` | in order; `value` and `tokens` optional | Yes | An item's `properties` (4.0.6) set its join's objects' properties as `setProperties` does, at once. |
| `CF.setToken(join, token, value)` | values evaluated | Yes | `[name]` and `name` are one token. |
| `CF.addTag`, `CF.removeTag` (all three forms) | | Yes | |
| `CF.getProperties(join or joins, cb)` | join, x, y, w, h, xrotation, yrotation, zrotation, scale, opacity, theme; null for none or join 0; list items `l1:3:s1` | Yes | Adds `xscale` and `yscale`. |
| `CF.setProperties(changes [, delay, duration, curve, cb, ...args])` | seconds; theme after the delay, not animated; a null parameter refused | Yes | `w` and `h` make the element again at that size. A turn over 180 degrees in one call animates the way it is asked, which iViewer does not promise. |
| `CF.getGuiDescription(cb)` | name, url, sizes, allJoins, pages with objects, subpages | Yes | |
| PreloadingCompleteEvent | | Yes | |
| JoinChangeEvent | (join, value, tokens, tags) | Yes | Delivered once the script that set the join has moved on (a microtask later), as iViewer does - the script's own `setJoin` included, each change in its turn; a watcher writing the join it watches runs again the next turn, not inside `setJoin`. A watcher set up right after a `setJoin` hears of it. Fire-now is immediate. |
| InputFieldEditedEvent | (join, value, tokens, tags) | Yes | |
| KeyboardUpEvent | (editedField) | Yes | |
| KeyboardDownEvent | (editedField, fieldText) | Yes | |
| ObjectPressedEvent | (join, value, tokens); buttons and sliders | Yes | Buttons as documented, with advanced actions too; a slider's value is its raw 0..65535 as a string, and the tags follow the tokens. |
| ObjectDraggedEvent | sliders only; (join, value, tokens, tags) | Yes | The value a string. |
| ObjectReleasedEvent | (join, value, tokens, tags) | Yes | Buttons "1"/"0", sliders the raw value as a string. |
| GUISuspendedEvent, GUIResumedEvent | app to background and back | Yes | From page visibility in the preview; the panel app's activity drives it on Android. Systems close while asleep unless `disconnectOnSuspend` is false. |

## Lists API

| Member | Documented | iva | Notes |
|---|---|---|---|
| `CF.listAdd(list, items [, position])` | items: `subpage`, `title`, join keys as strings or `{ value, tokens }`, `properties` (4.0.6); position or appended | Yes | An item's `properties`: its elements' properties as `setProperties` takes them, keyed by the item's join (`{ s1: { x, opacity, theme } }`) or as change objects; set at once on the item's joins (`l1:3:s1`), a row made later gets them too, and they move with the item as others come and go. `listUpdate` takes them too. |
| `CF.listUpdate(list, items)` | `index` (number, `CF.LastItem`, `CF.AllItems`) plus joins; no JoinChangeEvent | Yes | |
| `CF.listRemove(list)`, `(list, index)`, `(list, index, count)` | all; from index to the end; that many | Yes | |
| `CF.listScroll(list, index, position, animated [, visibleOnly])` | every position constant, `CF.LastItem`, relative | Yes | `visibleOnly` true scrolls only a list on screen (not one in a hidden subpage). |
| `CF.listInfo(list, cb)` | (list, count, first, numVisible, scrollPosition) | Yes | Position in GUI pixels; iViewer gives device units when it scales the GUI. |
| `CF.listContents(list, index, count, cb)` | array of items with `subpage` and `{ value, tokens }` per join; count 0 is the rest | Yes | |
| ListWillStartScrollingEvent, ListDidScrollEvent, ListDidEndScrollingEvent | (list, count, first, numVisible, position) | Yes | |

## Display and sound

| Member | iva | Notes |
|---|---|---|
| `CF.flipToPage(name)`, PageFlipEvent (from, to, orientation), OrientationChangeEvent (page, orientation) | Yes | `from` is null on a fire-now, as documented. |
| `CF.playSound`, `CF.stopSound`, `CF.muteSound`, `CF.unmuteSound` | No | Stubs. `<sound>` joins play nothing either. |

## Network API

| Member | Documented | iva | Notes |
|---|---|---|---|
| `CF.setSystemProperties(name, { enabled, address, port, localPort, connect, disconnect })` | restarts a changed system | Yes | |
| `CF.send(system, data [, CF.BINARY or CF.UTF8])` | no EOM added; past the send handler; a server's every client | Yes | In `userMain` a UDP send is queued until the socket is up, where iViewer drops it. |
| `CF.runCommand(system, command)`, `CF.runMacro`, `CF.stopMacro(name, "" or null)` | | Yes | Command JavaScript gets `system` and `data`, as documented. |
| `CF.request` forms 1 to 4 | GET, headers, method, body (string as UTF-8, object as a form) | Yes | Headers come back under their usual names and match in any case. |
| `CF.request` form 5 (timeout) | seconds, default 30 | Yes | Nothing back in time: the request is given up and the callback told once, status 0 (as for a failed connection). iva also takes an options object `{ method, headers, body, rejectUnauthorized, timeout }`. |
| `CF.startLookup`, `CF.stopLookup`, `CF.startPublishing`, `CF.stopPublishing` | Bonjour; callbacks as documented | Yes | iva's own mDNS engine; checked against a simulated network and once against official iViewer on the LAN. |
| NetworkStatusChangeEvent | object with hasNetwork and the addresses; on changes and on resume | Partly | On resume and fire-now only; a change while awake is not noticed. |
| ConnectionStatusChangeEvent | (system, connected, remote) for TCP and UDP, none for HTTP | Yes | HTTP systems do raise it when a request first answers or fails, which iViewer does not. |
| FeedbackMatchedEvent | (feedback, matchedString), watched per system | Yes | |

## Video, sensors and utilities

| Member | Documented | iva | Notes |
|---|---|---|---|
| MovieInfoReceivedEvent, MoviePlaybackStateChangedEvent, MovieLoadStateChangedEvent | (join, info) | No | A `<video>` shows a still texture; nothing streams, so nothing fires. |
| `CF.startMonitoring(sensor, options, cb)`, `CF.stopMonitoring(id)` | returns a monitor id; cb(sensorType, points) | No | Stub: returns undefined and calls the callback once with (sensor, options). |
| `CF.log`, `CF.logObject` | | Yes | To the console; `iva serve` forwards it. |
| `CF.crc(type, string, format, cb)` | six types, four formats | Yes | Known answers for "123456789": CRC_8 F4, CRC_16 BB3D (ARC), CRC_16_CCITT 29B1 (CCITT-FALSE), CRC_16_MODBUS 4B37, CRC_32 CBF43926, CRC_32C E3069283. iViewer's choice of CCITT variant is not documented, so that one is a best guess. |
| `CF.hash(type, string, cb)` | MD5, SHA1, SHA256, SHA384, SHA512 | Yes | Known answers for "abc" all match. |
| `CF.openURL(url)` | `cf://` loads a GUI; http(s) to the browser; `tel:`, `mailto:` to their apps | Yes | `cf://` loads the GUI. The rest goes to the host: the panel app opens a web page, `tel:` or `mailto:` in the device's app for it (and loads a GUI's URL - a `.gui`, a zipped GUI, an Upload Service's root - itself, being a browser of GUIs); the preview opens a tab. |
| `CF.loadGUI(url, settings)` | `""` reloads, null the app default; 13 settings | Partly | url (relative to the GUI, `?page=` in it the page), `""`, null and the settings `startPage`, `reloadGUI`, `reloadAssets`, `rememberLastGUI`, `showPreloadStatus` and `disconnectOnSuspend` are honoured. Not: `preloadAllAssets`, `buttonPressSound`, `enableMultitasking`, `enableProximitySensor`, `autoLockDelay`, `password`, `remoteDebugging`, `remoteDebuggingPort` (nothing here for them). null is the app's default GUI: the preview's picker's first GUI, the panel's settings URL (kept apart from the GUI last loaded). `profile:` URLs are refused. |
| `CF.loadAsset(name, CF.BINARY or CF.UTF8, cb, cache)` | five cache modes | Yes | |
| `CF.setDeviceProperty(property, value)`, DevicePropertyChangedEvent | brightness, status bar, navigation bar | No | The event fires from the stub itself; the device is not touched and `CF.device` does not change. |
| `CF.interceptHardwareKey(key, pressTime, mode, cb)` | Android | No | Stub. |
| ApplicationCallbackEvent, PushNotificationEvent | | No | Never dispatched. |

## Script contexts

| Context | Documented locals | iva |
|---|---|---|
| Button and advanced action JavaScript | `join`, `tokens`, `list`, `listIndex` | Yes, plus `value`. |
| Gesture action JavaScript | `gesture`, `join`, `tokens`, `list`, `listIndex`; gesture has type, x, y, startx, starty, deltax, deltay, and direction, velocity, rotation, scale by type | Yes, plus `velocityx`, `velocityy` and `distance` (the wiki's gesture tokens). |
| Command JavaScript and the send handler | `system`, `data` | Yes |
| Gesture action value tokens | `[startx]` `[starty]` `[x]` `[y]` `[deltax]` `[deltay]` `[distance]` `[velocity]` `[scale]` `[rotation]` `[velocityx]` `[velocityy]` | Yes |

## What iva adds beyond the docs

`CF.runtime` ("iva"), `TokenChangedEvent`, `CF.getProperties` giving
`xscale` and `yscale`, `CF.request` with an options object,
`CF.loadGUI`'s `startPage`, `CF.suspend()` / `CF.resume()` for a host that
knows when it is put away, and `CF.addTag` / `CF.removeTag` as the GUI page
documents them. The runtime's own state (`tokensStore`, `propertiesStore`,
`listsStore`, `watchers`, `renderer`, `controlSystems`) is reachable on `CF`
too; scripts should not rely on it.

## Not checked here

Anything only a device shows: exactly when iViewer delivers JoinChangeEvent
(iva: a microtask after the set, which is "after the script moved on" as
iViewer is known to do it), the CCITT CRC variant, `listInfo` units on a
scaled GUI, and the sound, sensor and device-property calls.

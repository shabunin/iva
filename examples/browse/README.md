# Browse: GUIs linking to one another

Three projects - Home, Lights (two pages), Media - each a `.gui` of its
own, linking to the others the way web pages link: `CF.loadGUI` with a
relative URL (`../lights/Lights.gui`), `?page=Kitchen` for the page to
start on, `CF.openURL` with a GUI's URL, and a web page opened outside.
The iva panel follows them like a browser: back, forward, an address bar
(Settings, Ctrl+S: Address bar), Ctrl+R for the GUI again from its server.

Build each into its own folder and serve the folder of them:

```bash
node bin/iva.mjs build examples/browse/home.jsx -o examples/browse/dist/home
node bin/iva.mjs build examples/browse/lights.jsx -o examples/browse/dist/lights
node bin/iva.mjs build examples/browse/media.jsx -o examples/browse/dist/media
node bin/iva.mjs serve examples/browse/dist
```

`iva serve` of a folder serves every file in it by its path, and a page
at `/` listing its GUIs. In the panel's address bar (or settings), the
Home GUI is

```
http://<this machine>:8019/home/Home.gui
```

and a page of another GUI `http://<this machine>:8019/lights/Lights.gui?page=Kitchen`.
In iViewer the same links work with absolute `cf://` URLs; `?page=` is the
panel's.

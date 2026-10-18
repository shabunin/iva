/**
 * Where a GUI is, the way the panel's address bar and GUI links name it - a
 * browser's URL, for GUIs:
 *
 *   http://192.168.1.10:8019/panel.gui?page=Home   a GUI and the page to show
 *   cf://192.168.1.10:8019/panel.gui               iViewer's GUI link (cf:// is http://)
 *   http://192.168.1.10:8019/?page=Home            iva serve's root, a page
 *   http://host/panel.gui/Home, http://host/#Home  the page after the file, or as a fragment: read too
 *   192.168.1.10:8019                              a bare address: http://
 *   other.gui, ../x.gui.zip, /x.gui                relative to the GUI the link is in
 *
 * A GUI change reloads the panel's page (the runtime keeps its globals per
 * page), so where the panel has been - its back and forward - is kept in
 * session storage (History). No Tauri here: tests run it in Node.
 */
export interface GuiLocation {
  /** the GUI's URL: http(s), no fragment, no page */
  gui: string;
  /** the page to show (CF.loadGUI's startPage; the address's ?page=) */
  page?: string;
}

/** a .gui, or a zipped GUI */
const GUI_FILE = /\.(gui|zip)$/i;
/** GUI Designer's Upload Service port (iva serve's too): its root is a GUI */
const GUI_PORT = '8019';

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** cf:// is http://; a text without a scheme is a host (http://), or - with `from` - a link relative to that GUI */
function absolute(text: string, from?: string): URL | null {
  const t = text.trim().replace(/^cf:\/\//i, 'http://');
  if (!t) return null;
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return new URL(t);
    // relative: a path (/x.gui, ./x, ../x), a file (other.gui, x.gui.zip?page=Home), a folder without a dot or port (pages/x.gui)
    const first = t.split(/[/?#]/)[0];
    const relative = from && (/^\.{0,2}\//.test(t) || GUI_FILE.test(first) || !/[.:]/.test(first));
    return relative ? new URL(t, from) : new URL(`http://${t}`);
  } catch {
    return null;
  }
}

/** The GUI and page a text names (see above); null for nothing. `from`: the GUI relative links resolve against. */
export function parseLocation(text: string, from?: string): GuiLocation | null {
  const u = absolute(text, from);
  if (!u) return null;
  let page: string | undefined;
  // a fragment, then the page after the GUI's file (/x.gui/Lights%20Page), then ?page= - the last given wins
  if (u.hash.length > 1) page = decode(u.hash.slice(1));
  u.hash = '';
  const segs = u.pathname.split('/');
  let at = -1;
  for (let i = 0; i < segs.length; i++) if (GUI_FILE.test(segs[i])) at = i;
  if (at >= 0 && at < segs.length - 1) {
    const rest = segs.slice(at + 1).filter(Boolean).map(decode).join('/');
    if (rest) page = rest;
    u.pathname = segs.slice(0, at + 1).join('/');
  }
  const named = u.searchParams.get('page');
  if (named !== null) {
    if (named) page = named;
    u.searchParams.delete('page');
    if (!u.searchParams.size) u.search = '';
  }
  return { gui: u.href, page: page || undefined };
}

/** A location as the address bar shows it: the GUI's URL with ?page=Name. */
export function formatLocation(loc: GuiLocation): string {
  if (!loc.page) return loc.gui;
  try {
    const u = new URL(loc.gui);
    u.searchParams.set('page', loc.page);
    return u.href;
  } catch {
    return `${loc.gui}?page=${encodeURIComponent(loc.page)}`;
  }
}

/** Whether a URL names a GUI (a cf:// link, a .gui or .zip, an Upload Service's root) rather than a web page; `from`: the GUI a relative one is in. */
export function isGuiUrl(text: string, from?: string): boolean {
  if (/^cf:\/\//i.test(text.trim())) return true;
  const loc = parseLocation(text, from);
  if (!loc) return false;
  const u = new URL(loc.gui);
  return GUI_FILE.test(u.pathname.split('/').pop() ?? '') || (u.port === GUI_PORT && (u.pathname === '/' || u.pathname === ''));
}

/** what History keeps itself in (sessionStorage; a test's object) */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const MOST = 50;

/** Where the panel has been: the GUIs in the order visited, and which one it is at - a browser's history. */
export class History {
  constructor(private readonly store: KeyStore, private readonly key = 'iva-panel:history') {}

  private read(): { at: number; items: GuiLocation[] } {
    try {
      const v = JSON.parse(this.store.getItem(this.key) ?? '') as { at: number; items: GuiLocation[] };
      if (Array.isArray(v.items) && Number.isInteger(v.at)) return v;
    } catch {
      // nothing kept yet
    }
    return { at: -1, items: [] };
  }

  private write(state: { at: number; items: GuiLocation[] }) {
    this.store.setItem(this.key, JSON.stringify(state));
  }

  current(): GuiLocation | null {
    const { at, items } = this.read();
    return items[at] ?? null;
  }

  /** every GUI visited, the earliest first */
  entries(): GuiLocation[] {
    return this.read().items;
  }

  canBack(): boolean {
    return this.read().at > 0;
  }

  canForward(): boolean {
    const { at, items } = this.read();
    return at >= 0 && at < items.length - 1;
  }

  /** Arrived at `loc`: a new entry after the one it is at (what was ahead goes) - or, the same GUI again, that entry's page. */
  arrive(loc: GuiLocation) {
    const state = this.read();
    const now = state.items[state.at];
    if (now && now.gui === loc.gui) {
      state.items[state.at] = { gui: loc.gui, ...(loc.page ? { page: loc.page } : {}) };
    } else {
      state.items = [...state.items.slice(0, state.at + 1), { gui: loc.gui, ...(loc.page ? { page: loc.page } : {}) }].slice(-MOST);
      state.at = state.items.length - 1;
    }
    this.write(state);
  }

  /** the page the GUI it is at shows now (the address bar follows page flips) */
  page(page: string | undefined) {
    const state = this.read();
    const now = state.items[state.at];
    if (!now) return;
    state.items[state.at] = { gui: now.gui, ...(page ? { page } : {}) };
    this.write(state);
  }

  /** a step back (to where it was); null at the start */
  back(): GuiLocation | null {
    const state = this.read();
    if (state.at <= 0) return null;
    state.at--;
    this.write(state);
    return state.items[state.at];
  }

  /** a step forward again; null at the end */
  forward(): GuiLocation | null {
    const state = this.read();
    if (state.at >= state.items.length - 1) return null;
    state.at++;
    this.write(state);
    return state.items[state.at];
  }
}

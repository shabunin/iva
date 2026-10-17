import { joinStore, normalizeJoinString, type JoinType } from "./joinStore";
import { indexGui, type GuiIndex, type GuiDescription } from "./guiIndex";
import { Mdns } from "./mdns/mdns";
import { CFRenderer } from "./renderer";
import { CFCallback, CFContext, Watcher } from "./jsapi/types";
import { EVENTS, CONSTANTS } from "./jsapi/constants";
import * as guiApi from "./jsapi/gui";
import { joinText } from "./jsapi/gui";
import { getHost } from "../stdlib/host";
import * as listsApi from "./jsapi/lists";
import * as displayApi from "./jsapi/display";
import * as soundApi from "./jsapi/sound";
import * as networkApi from "./jsapi/network";
import * as sensorsApi from "./jsapi/sensors";
import * as utilitiesApi from "./jsapi/utilities";
import { ControlSystem, runMacroByName, stopMacroByName } from "./systemManager";

export class CFAPI implements CFContext {
    // EVENTS
    PreloadingCompleteEvent = EVENTS.PreloadingCompleteEvent;
    JoinChangeEvent = EVENTS.JoinChangeEvent;
    InputFieldEditedEvent = EVENTS.InputFieldEditedEvent;
    KeyboardUpEvent = EVENTS.KeyboardUpEvent;
    KeyboardDownEvent = EVENTS.KeyboardDownEvent;
    ObjectPressedEvent = EVENTS.ObjectPressedEvent;
    ObjectDraggedEvent = EVENTS.ObjectDraggedEvent;
    ObjectReleasedEvent = EVENTS.ObjectReleasedEvent;
    GUISuspendedEvent = EVENTS.GUISuspendedEvent;
    GUIResumedEvent = EVENTS.GUIResumedEvent;
    OrientationChangeEvent = EVENTS.OrientationChangeEvent;
    PageFlipEvent = EVENTS.PageFlipEvent;
    ListWillStartScrollingEvent = EVENTS.ListWillStartScrollingEvent;
    ListDidScrollEvent = EVENTS.ListDidScrollEvent;
    ListDidEndScrollingEvent = EVENTS.ListDidEndScrollingEvent;
    NetworkStatusChangeEvent = EVENTS.NetworkStatusChangeEvent;
    ConnectionStatusChangeEvent = EVENTS.ConnectionStatusChangeEvent;
    FeedbackMatchedEvent = EVENTS.FeedbackMatchedEvent;
    MovieInfoReceivedEvent = EVENTS.MovieInfoReceivedEvent;
    MoviePlaybackStateChangedEvent = EVENTS.MoviePlaybackStateChangedEvent;
    MovieLoadStateChangedEvent = EVENTS.MovieLoadStateChangedEvent;
    DevicePropertyChangedEvent = EVENTS.DevicePropertyChangedEvent;
    ApplicationCallbackEvent = EVENTS.ApplicationCallbackEvent;
    PushNotificationEvent = EVENTS.PushNotificationEvent;
    TokenChangedEvent = "TokenChangedEvent";

    // CONSTANTS
    guiURL = CONSTANTS.guiURL;
    GlobalTokensJoin = CONSTANTS.GlobalTokensJoin;
    AnimationCurveLinear = CONSTANTS.AnimationCurveLinear;
    AnimationCurveEaseIn = CONSTANTS.AnimationCurveEaseIn;
    AnimationCurveEaseOut = CONSTANTS.AnimationCurveEaseOut;
    AnimationCurveEaseInOut = CONSTANTS.AnimationCurveEaseInOut;
    LastItem = CONSTANTS.LastItem;
    AllItems = CONSTANTS.AllItems;
    TopPosition = CONSTANTS.TopPosition;
    LeftPosition = CONSTANTS.LeftPosition;
    MiddlePosition = CONSTANTS.MiddlePosition;
    BottomPosition = CONSTANTS.BottomPosition;
    RightPosition = CONSTANTS.RightPosition;
    VisiblePosition = CONSTANTS.VisiblePosition;
    RelativePosition = CONSTANTS.RelativePosition;
    PixelPosition = CONSTANTS.PixelPosition;
    ItemPosition = CONSTANTS.ItemPosition;
    AbsolutePosition = CONSTANTS.AbsolutePosition;
    PortraitOrientation = CONSTANTS.PortraitOrientation;
    LandscapeOrientation = CONSTANTS.LandscapeOrientation;
    LandscapeOrienation = CONSTANTS.LandscapeOrienation;
    UTF8 = CONSTANTS.UTF8;
    BINARY = CONSTANTS.BINARY;

    // Hash constants
    Hash_MD5 = CONSTANTS.Hash_MD5;
    Hash_SHA1 = CONSTANTS.Hash_SHA1;
    Hash_SHA256 = CONSTANTS.Hash_SHA256;
    Hash_SHA384 = CONSTANTS.Hash_SHA384;
    Hash_SHA512 = CONSTANTS.Hash_SHA512;
    
    // CRC constants
    CRC_8 = CONSTANTS.CRC_8;
    CRC_16 = CONSTANTS.CRC_16;
    CRC_16_CCITT = CONSTANTS.CRC_16_CCITT;
    CRC_16_MODBUS = CONSTANTS.CRC_16_MODBUS;
    CRC_32 = CONSTANTS.CRC_32;
    CRC_32C = CONSTANTS.CRC_32C;

    // Output format constants
    OUTPUT_NUMBER = CONSTANTS.OUTPUT_NUMBER;
    OUTPUT_STRING = CONSTANTS.OUTPUT_STRING;
    OUTPUT_BINARY = CONSTANTS.OUTPUT_BINARY;
    OUTPUT_BINARY_LE = CONSTANTS.OUTPUT_BINARY_LE;

    // Sensors
    Accelerometer = CONSTANTS.Accelerometer;
    Gyroscope = CONSTANTS.Gyroscope;

    // GLOBAL VARIABLES
    device = {
        platform: "Web",
        version: "1.0",
        model: "Browser",
        uuid: "1234567890",
        legacyUniqueIdentifier: "",
        uniqueIdentifier: "1234567890",
        name: "Preview Device",
        screenBrightness: 1.0,
        soundOutputVolume: 1.0,
        batteryLevel: 1.0,
        batteryChargeStatus: 1, // CF.ChargeStatusUnknown
        hasSensors: {
            [CONSTANTS.Gyroscope]: false,
            [CONSTANTS.Accelerometer]: false
        },
        displayDensity: window.devicePixelRatio || 1.0,
        machineName: "Browser",
        pushid: ""
    };

    ipv4address = "127.0.0.1";
    ipv4netmask = "255.255.255.0";
    ipv6address = "::1";
    ipv6netmask = "ffff:ffff:ffff:ffff::";
    MACaddress = "00:00:00:00:00:00";
    networkType = "WiFi";
    networkSSID = "Preview Network";

    system = {
        type: "",
        enabled: false,
        address: "",
        port: 0,
        localPort: 0,
        connect: "",
        disconnect: "",
        connections: []
    };

    systems: Record<string, any> = {};
    controlSystems: Record<string, any> = {};

    /** what CF.getGuiDescription hands (filled in from the GUI loaded) */
    gui: GuiDescription = {
        name: "",
        url: "",
        portraitSize: { w: 0, h: 0 },
        landscapeSize: { w: 0, h: 0 },
        allJoins: [],
        pages: [],
        subpages: []
    };

    modules: any[] = [];

    /** the runtime the GUI runs on: iva's (not iViewer's - a GUI's workarounds for iViewer can tell) */
    runtime = 'iva';

    // VARIABLES
    currentPage = 'CURRENT_PAGE';
    currentOrientation = CONSTANTS.LandscapeOrientation;
    requestMode: 'fetch' | 'socket' = 'fetch';
    imageRequestMode: 'custom' | 'native' = 'custom';

    // STATE STORES
    tokensStore: Record<string, Record<string, string>> = {};
    propertiesStore: Record<string, any> = {};
    listsStore: Record<string, any[]> = {};
    watchers: Record<string, Watcher[]> = {};
    renderer: CFRenderer | null = null;

    /** global tokens with persist="1" */
    persistedTokens = new Set<string>();

    /** where a persisted token is kept: per project */
    tokenKey(name: string): string {
        const raw = this.renderer?.project?.properties?.raw as { children?: { type: string; text?: string }[] } | undefined;
        return `cf-token:${raw?.children?.find((c) => c.type === 'project')?.text ?? ''}:${name}`;
    }

    /** the network as NetworkStatusChangeEvent hands it to scripts */
    networkStatus() {
        return {
            hasNetwork: !!this.ipv4address && this.networkType !== 'None',
            ipv4address: this.ipv4address,
            ipv4netmask: this.ipv4netmask,
            ipv6address: this.ipv6address,
            ipv6netmask: this.ipv6netmask,
            networkType: this.networkType,
        };
    }

    /**
     * CF.device and the network variables from the host - the device's own;
     * the placeholders stay where it has none (or doesn't answer in 2 s).
     */
    async loadDevice(): Promise<void> {
        const host = getHost();
        if (!host?.device) return;
        try {
            const d = await Promise.race([host.device(), new Promise<null>((r) => setTimeout(() => r(null), 2000))]);
            if (!d) return;
            Object.assign(this.device, { platform: d.platform, version: d.version, model: d.model, name: d.name, uuid: d.uuid, uniqueIdentifier: d.uuid });
            this.ipv4address = d.ipv4address;
            this.ipv4netmask = d.ipv4netmask;
            this.ipv6address = d.ipv6address;
            this.ipv6netmask = d.ipv6netmask;
            this.MACaddress = d.MACaddress;
            this.networkType = d.networkType;
            this.networkSSID = d.networkSSID;
        } catch (e) {
            console.warn('[CF] the device info:', e);
        }
    }

    /**
     * The page hidden - the app in the background, the screen off - and shown
     * again: the GUI asleep and awake, as iViewer's (suspend, resume).
     */
    private onVisibility = () => this.setAsleep(document.visibilityState === 'hidden');
    private waking: ReturnType<typeof setTimeout> | undefined;

    /**
     * Asleep at once; awake once it stays so a moment: the screen unlocking
     * shows and hides the app a few times in a second (Android pauses and
     * resumes it six times in 0.2 s) - not each time stopped and started.
     * What the page's visibility says, and what an app around it says (the
     * panel app: its activity paused and resumed).
     */
    setAsleep(asleep: boolean) {
        clearTimeout(this.waking);
        if (asleep) this.suspend();
        else this.waking = setTimeout(() => this.resume(), 250);
    }

    /** asleep (in the background): its page timers don't run */
    suspended = false;
    /** iViewer's "Disconnect on Exit/Sleep" (CF.loadGUI's disconnectOnSuspend): systems close while asleep */
    disconnectOnSuspend = true;
    /** the systems the sleep stopped: started again on waking */
    private sleeping: ControlSystem[] = [];
    /** the network as it was on going to sleep */
    private networkBefore = '';

    /** To sleep: GUISuspendedEvent, then (Disconnect on Exit/Sleep) its systems' connections closed. */
    suspend() {
        if (this.suspended) return;
        this.suspended = true;
        this.networkBefore = JSON.stringify(this.networkStatus());
        this.dispatchEvent(this.GUISuspendedEvent);
        // Bonjour: our services gone from the network while asleep (as iViewer's), lookups paused
        this.mdns?.suspend();
        if (!this.disconnectOnSuspend) return;
        for (const sys of new Set(Object.values(this.controlSystems))) {
            if (!sys?.enabled) continue;
            this.sleeping.push(sys);
            try {
                sys.stop();
            } catch (e) {
                console.warn(`[CF] suspend: system ${sys.name}:`, e);
            }
        }
    }

    /**
     * Awake again: GUIResumedEvent, its systems connecting again, and - if the
     * network changed meanwhile (another address, none) - NetworkStatusChangeEvent,
     * as iViewer checks it on a resume.
     */
    resume() {
        if (!this.suspended) return;
        this.suspended = false;
        this.dispatchEvent(this.GUIResumedEvent);
        void this.mdns?.resume();
        const sleeping = this.sleeping;
        this.sleeping = [];
        for (const sys of sleeping) {
            // (one a script started again meanwhile runs already)
            if (sys.enabled) continue;
            sys.enabled = true;
            try {
                sys.start();
            } catch (e) {
                console.warn(`[CF] resume: system ${sys.name}:`, e);
            }
        }
        const before = this.networkBefore;
        void this.loadDevice().then(() => {
            const now = this.networkStatus();
            if (JSON.stringify(now) !== before) this.dispatchEvent(this.NetworkStatusChangeEvent, now);
        });
    }

    init(renderer: CFRenderer) {
        this.renderer = renderer;
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.onVisibility);
            document.addEventListener('visibilitychange', this.onVisibility);
        }

        // Initialize Global Tokens from XML
        if (renderer.project && renderer.project.tokens) {
            if (!this.tokensStore[this.GlobalTokensJoin]) {
                this.tokensStore[this.GlobalTokensJoin] = {};
            }
            for (const t of renderer.project.tokens) {
                const name = t.attributes['name'];
                const value = t.attributes['value'];
                if (name && value !== undefined) {
                    this.tokensStore[this.GlobalTokensJoin][name] = value;
                }
                // persist="1": kept between runs, as on a device (here: the browser's storage)
                if (name && t.attributes['persist'] === '1') {
                    this.persistedTokens.add(name);
                    try {
                        const saved = localStorage.getItem(this.tokenKey(name));
                        if (saved !== null) this.tokensStore[this.GlobalTokensJoin][name] = saved;
                    } catch {
                        // no storage (a private window): the .gui's value
                    }
                }
            }
        }

        // Initialize Control Systems
        if (renderer && renderer.project && renderer.project.systems) {
            for (const sysNode of renderer.project.systems) {
                const sys = new ControlSystem(this, sysNode);
                this.controlSystems[sys.name] = sys;

                // Map protocol → CF.systems type string per docs:
                // "cf", "tcp", "udp", "http"
                let sysType: string;
                if (sys.type === 'cf') sysType = 'cf';
                else if (sys.type === 'udp') sysType = 'udp';
                else if (sys.type === 'http') sysType = 'http';
                else sysType = 'tcp';

                // as the docs have it - kept up to date: each a getter on the system as it is now
                // (CF.setSystemProperties, its connections coming and going); connect / disconnect
                // full join strings ("d100"), "" for none
                const entry: Record<string, unknown> = {};
                const live = (key: string, get: () => unknown) => Object.defineProperty(entry, key, { get, enumerable: true });
                live('type', () => sysType);
                live('enabled', () => !!sys.enabled);
                live('address', () => sys.address);
                live('port', () => sys.port);
                live('localPort', () => sys.localPort);
                live('connect', () => (sys.connectJoin ? 'd' + sys.connectJoin : ''));
                live('disconnect', () => (sys.disconnectJoin ? 'd' + sys.disconnectJoin : ''));
                live('connections', () => [...(sys.connections ?? [])]);
                this.systems[sys.name] = entry;

                // Alias empty string for Loopback / main CF system
                if (sys.name.toLowerCase() === 'loopback' || sys.name === '') {
                    this.systems[''] = this.systems[sys.name];
                    this.controlSystems[''] = sys;
                }
            }
        }

        // Bridge internal joinStore changes to CF API JoinChangeEvent: one bridge, this CF
        // object's - the last GUI's goes (a GUI loaded anew doesn't stack another)
        if (CFAPI.bridge) joinStore.offAny(CFAPI.bridge);
        CFAPI.bridge = (id: string, type: JoinType, val: any) => {
            // the join as a script names it ("s1"; a list item's "l1:0:s1")
            const j = normalizeJoinString(type, id);
            const tokens = this.tokensStore[j] || {};
            // a string, as iViewer hands values to scripts ("1" / "0" for a digital join)
            this.dispatchEvent(this.JoinChangeEvent, j, joinText(val) ?? "", tokens, this.tagsOf(j));
        };
        joinStore.onAny(CFAPI.bridge);
    }

    /** the join store's one JoinChangeEvent bridge: the CF object made last (init) */
    private static bridge: ((id: string, type: JoinType, val: any) => void) | null = null;

    /**
     * Start all external systems connections.
     * In the iViewer startup sequence, this must happen AFTER userMain is called
     * so that watchers on ConnectionStatusChangeEvent are registered before connections occur.
     */
    startSystems() {
        for (const name in this.controlSystems) {
            // Avoid calling start() twice on the loopback alias
            if (name !== '') {
                this.controlSystems[name].start();
            }
        }
    }

    /**
     * Close all TCP/UDP/server sockets owned by this CF instance.
     * Must run before project reload or page reload — Rust sockets outlive JS
     * if we only tear down the webview (window.location.reload).
     */
    stopSystems() {
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
        // Bonjour: goodbyes for what's published, lookups ended
        this.mdns?.dispose();
        this.mdns = null;
        const seen = new Set<any>();
        for (const name in this.controlSystems) {
            const sys = this.controlSystems[name];
            if (!sys || seen.has(sys)) continue;
            seen.add(sys);
            try {
                // stop() sets enabled=false and closes sockets
                sys.stop();
            } catch (e) {
                console.warn(`[CF] stopSystems(${name}):`, e);
            }
        }
        this.controlSystems = {};
        this.systems = {};
    }

    public dispatchEvent(eventName: string, ...args: any[]) {
        if (eventName === this.ListDidScrollEvent && args.length >= 5) {
            const [listJoin, count, first, numVisible, scrollPosition] = args;
            if (!this.listsStore[listJoin]) this.listsStore[listJoin] = [];
            (this.listsStore[listJoin] as any)._scrollInfo = { count, first, numVisible, scrollPosition };
        }
        
        if (!this.watchers[eventName]) return;
        this.watchers[eventName].forEach(w => {
            if (eventName === this.JoinChangeEvent && w.joins && args.length >= 2) {
                const joinArg = args[0];
                if (Array.isArray(w.joins) && !w.joins.includes(joinArg)) return;
                if (typeof w.joins === 'string' && w.joins !== joinArg) return;
            }
            // a system's connection: the systems watched (by name), as for joins; an object's
            // press, drag and release: the joins watched
            if ((eventName === this.InputFieldEditedEvent ||
                 eventName === this.ObjectPressedEvent ||
                 eventName === this.ObjectDraggedEvent ||
                 eventName === this.ObjectReleasedEvent ||
                 eventName === this.ConnectionStatusChangeEvent ||
                 eventName === this.ListWillStartScrollingEvent ||
                 eventName === this.ListDidScrollEvent || 
                 eventName === this.ListDidEndScrollingEvent) && w.joins && args.length >= 1) {
                const joinArg = args[0];
                if (Array.isArray(w.joins) && !w.joins.includes(joinArg)) return;
                if (typeof w.joins === 'string' && w.joins !== joinArg) return;
            }
            // FeedbackMatchedEvent: args = [systemName, feedbackName, matchedString]
            // Callback receives only (feedbackName, matchedString) per spec
            if (eventName === this.FeedbackMatchedEvent) {
                const [sysName, fbName, matchedStr] = args;
                if (w.systemName && w.systemName !== sysName) return;
                if (w.feedbackName && w.feedbackName !== fbName) return;
                try {
                    w.callback(fbName, matchedStr);
                } catch (e) {
                    console.error(`Error in CF watch callback for ${eventName}:`, e);
                }
                return;
            }
            try {
                w.callback(...args);
            } catch (e) {
                console.error(`Error in CF watch callback for ${eventName}:`, e);
            }
        });
    }


    public parseJoin(join: string): { type: "a" | "d" | "s" | "l", id: string } | null {
        if (!join) return null;
        if (join.includes(":")) {
            const parts = join.split(":");
            if (parts.length >= 3) {
                const last = parts.pop()!;
                const type = last.charAt(0).toLowerCase();
                const num = last.substring(1);
                if (type === "a" || type === "d" || type === "s" || type === "l") {
                    return { type: type as any, id: `${parts.join(":")}:${num}` };
                }
            }
        }
        
        const type = join.charAt(0).toLowerCase();
        const id = join.substring(1);
        if (type === "a" || type === "d" || type === "s" || type === "l") {
            return { type: type as any, id };
        }
        return null;
    }

    private mdns: Mdns | null = null;

    /** Bonjour (CF.startLookup, CF.startPublishing): one engine, made when first used; its doings in CF.log. */
    bonjour(): Mdns {
        if (!this.mdns) {
            this.mdns = new Mdns({
                network: () => ({ ipv4address: this.ipv4address, ipv4netmask: this.ipv4netmask }),
                deviceName: () => String(this.device?.name || 'iva panel'),
                deviceId: () => String(this.device?.uniqueIdentifier || this.device?.uuid || ''),
                log: (m) => this.log(m),
            });
        }
        return this.mdns;
    }

    // ── what the GUI has: its joins, objects and tags (getJoin's null, tags, getProperties, getGuiDescription) ──

    private indexed: { project: unknown; index: GuiIndex } | null = null;

    /** The GUI's joins and objects; none before a GUI is loaded. */
    guiIndex(): GuiIndex | null {
        const project = this.renderer?.project;
        if (!project) return null;
        if (this.indexed?.project !== project) this.indexed = { project, index: indexGui(project) };
        return this.indexed.index;
    }

    /**
     * A join the GUI has: an object of it carries the join - a list item's
     * ("l1:2:s1") if the list has that item and its subpage the join. (No GUI
     * loaded: any.)
     */
    hasJoin(join: string): boolean {
        const index = this.guiIndex();
        if (!index) return true;
        const item = /^(l\d+):(\d+):([ads]\d+)$/.exec(join);
        if (item) return index.joins.has(item[1]) && Number(item[2]) < (this.listsStore[item[1]]?.length ?? 0) && !!index.listItems.get(item[1])?.has(item[3]);
        return index.joins.has(join);
    }

    /** the tags scripts gave (CF.addTag) and took (CF.removeTag), by join; tags taken from every object */
    private tagEdits = { added: new Map<string, Set<string>>(), removed: new Map<string, Set<string>>(), gone: new Set<string>() };

    /** An object's tags: the GUI's (less those taken), and those scripts gave its join. */
    tagsOfObject(join: string | null | undefined, guiTags: string[]): string[] {
        const { added, removed, gone } = this.tagEdits;
        const out = guiTags.filter((t) => !gone.has(t) && !(join && removed.get(join)?.has(t)));
        if (join) for (const t of added.get(join) ?? []) if (!out.includes(t)) out.push(t);
        return out;
    }

    /** A join's tags, as getJoin hands them: its objects'. */
    tagsOf(join: string): string[] {
        const guiTags = [...new Set((this.guiIndex()?.objects.get(join) ?? []).flatMap((o) => o.tags))];
        return this.tagsOfObject(join, guiTags);
    }

    /** The joins whose objects carry a tag. */
    joinsTagged(tag: string): string[] {
        const joins = new Set<string>([...(this.guiIndex()?.objects.keys() ?? []), ...this.tagEdits.added.keys()]);
        return [...joins].filter((j) => this.tagsOf(j).includes(tag));
    }

    /** CF.addTag(join or joins, tag): the objects on them carry it (once, however often added). */
    addTag = (joins: string | string[], tag: string) => {
        const { added, removed } = this.tagEdits;
        for (const join of Array.isArray(joins) ? joins : [joins]) {
            removed.get(join)?.delete(tag);
            if (!added.has(join)) added.set(join, new Set());
            added.get(join)!.add(tag);
            this.renderer?.retag(join);
        }
    };

    /** CF.removeTag(tag): from every object; CF.removeTag(join or joins, tag): from those. */
    removeTag = (...args: [string] | [string | string[], string]) => {
        const { added, removed, gone } = this.tagEdits;
        if (args.length === 1) {
            const tag = args[0] as string;
            gone.add(tag);
            for (const set of added.values()) set.delete(tag);
            this.renderer?.untag(tag);
            return;
        }
        const [joins, tag] = args;
        for (const join of Array.isArray(joins) ? joins : [joins]) {
            added.get(join)?.delete(tag);
            if (!removed.has(join)) removed.set(join, new Set());
            removed.get(join)!.add(tag);
            this.renderer?.retag(join);
        }
    };

    // DELEGATE GUI FUNCTIONS
    getJoin = (join: string, callback?: (join: string, value: string | null, tokens: any, tags: string[]) => void) => {
        return guiApi.getJoin(this, join, callback);
    };

    getJoins = (arrayOfJoins: string[], callback?: (arrayOfJoinValues: Record<string, any>) => void) => {
        return guiApi.getJoins(this, arrayOfJoins, callback);
    };

    setJoin = (join: string, value: string | number | boolean, sendJoinChangeEvent: boolean = true) => {
        guiApi.setJoin(this, join, value, sendJoinChangeEvent);
    };

    setJoins = (joinsArray: { join: string; value?: string | number | boolean | null; tokens?: Record<string, string | number | boolean> | null }[], sendJoinChangeEvents: boolean = true) => {
        guiApi.setJoins(this, joinsArray, sendJoinChangeEvents);
    };

    setToken = (join: string, token: string, value: string | number | boolean) => {
        guiApi.setToken(this, join, token, value);
    };

    getProperties = (joinOrJoinsArray: string | string[], callback: CFCallback) => {
        guiApi.getProperties(this, joinOrJoinsArray, callback);
    };

    setProperties = (changes: any, ...args: [delay?: number, duration?: number, curve?: string, callback?: CFCallback, ...callbackParams: any[]]) => {
        // as iViewer: one of these passed as null or undefined (an optional callback handed on with
        // none) refuses the call - logged, nothing changed
        const bad = args.slice(0, 4).findIndex((v) => v === null || v === undefined);
        if (bad >= 0) {
            this.log(`setProperties(): Invalid parameter ${bad + 2}: null is not allowed`);
            return;
        }
        guiApi.setProperties(this, changes, ...(args as [number, number, string, CFCallback?, ...any[]]));
    };

    getGuiDescription = (callback?: CFCallback) => {
        const description = this.guiIndex()?.description;
        if (description) this.gui = { ...description, url: this.guiURL };
        guiApi.getGuiDescription(this, callback);
    };

    // DELEGATE DISPLAY FUNCTIONS
    flipToPage = (pageName: string) => {
        displayApi.flipToPage(this, pageName);
    };

    // DELEGATE LISTS FUNCTIONS
    listScroll = (listJoin: string, index: any, position: any, animated: boolean, overrideScale?: boolean) => {
        listsApi.listScroll(this, listJoin, index, position, animated, overrideScale);
    };

    listAdd = (list: string, array: any[], position?: number | string) => {
        listsApi.listAdd(this, list, array, position);
    };
    
    listUpdate = (list: string, array: any[]) => {
        listsApi.listUpdate(this, list, array);
    };
    
    listRemove = (list: string, index?: number, count?: number) => {
        listsApi.listRemove(this, list, index, count);
    };

    listInfo = (list: string, callback?: CFCallback) => {
        listsApi.listInfo(this, list, callback);
    };
    
    listContents = (list: string, index: number, count: number, callback?: CFCallback) => {
        listsApi.listContents(this, list, index, count, callback);
    };

    // DELEGATE NETWORK FUNCTIONS
    send = (systemName: string, string: string, outputFormat?: number) => {
        networkApi.send(this, systemName, string, outputFormat);
    };
    
    request = (...args: any[]) => {
        // Overloads (per CF docs + agapi TLS extras):
        //   1. (url, callback)
        //   2. (url, headers, callback)
        //   3. (url, method, headers, callback)
        //   4. (url, method, headers, body, callback)
        //   5. (url, method, headers, body, timeout, callback)  — timeout ignored
        //   6. (url, options, callback)  — agapi: options may include method, headers, body,
        //        rejectUnauthorized, insecure
        let url: string, method: string, headers: any, body: any, callback: any;
        let tlsOptions: {
            rejectUnauthorized?: boolean;
            insecure?: boolean;
        } | null = null;

        if (args.length === 2 && typeof args[1] === 'function') {
            // Form 1
            [url, callback] = args;
            method = 'GET'; headers = null; body = null;
        } else if (
            args.length === 3 &&
            typeof args[2] === 'function' &&
            typeof args[1] === 'object' &&
            args[1] !== null &&
            // options bag: has method/body/tls keys OR not a plain header map heuristic
            (typeof args[1].method === 'string' ||
                'body' in args[1] ||
                'rejectUnauthorized' in args[1] ||
                'insecure' in args[1] ||
                'headers' in args[1])
        ) {
            // Form 6: (url, options, callback)
            url = args[0];
            callback = args[2];
            const opt = args[1];
            method = opt.method || 'GET';
            headers = opt.headers ?? null;
            body = opt.body ?? null;
            tlsOptions = {
                rejectUnauthorized: opt.rejectUnauthorized,
                insecure: opt.insecure,
            };
        } else if (args.length === 3 && typeof args[2] === 'function' && typeof args[1] === 'object') {
            // Form 2: (url, headers, callback)
            [url, headers, callback] = args;
            method = 'GET'; body = null;
        } else if (args.length === 4 && typeof args[3] === 'function' && typeof args[1] === 'string') {
            // Form 3: (url, method, headers, callback)
            [url, method, headers, callback] = args;
            body = null;
        } else if (args.length >= 5 && typeof args[args.length - 1] === 'function') {
            // Form 4 / Form 5
            callback = args[args.length - 1];
            url = args[0]; method = args[1]; headers = args[2]; body = args[3];
            // optional trailing options object before callback:
            // (url, method, headers, body, tlsOptions, callback)
            if (
                args.length >= 6 &&
                typeof args[4] === 'object' &&
                args[4] !== null &&
                typeof args[4] !== 'function'
            ) {
                const opt = args[4];
                tlsOptions = {
                    rejectUnauthorized: opt.rejectUnauthorized,
                    insecure: opt.insecure,
                };
            }
        } else {
            console.warn('CF.request: unrecognized argument pattern', args);
            return;
        }
        networkApi.request(this, url, method || 'GET', headers, body, callback, tlsOptions);
    };

    runCommand = (systemName: string, command: string, data?: string, tokenContext?: any) => {
        networkApi.runCommand(this, systemName, command, data, tokenContext);
    };


    runMacro = (macroName: string) => {
        runMacroByName(this, macroName);
    };

    stopMacro = (macroName: string | null) => {
        stopMacroByName(macroName);
    };

    startLookup = (serviceType: string, serviceName: string, callback?: CFCallback) => {
        networkApi.startLookup(this, serviceType, serviceName, callback);
    };

    stopLookup = (serviceType: string, serviceName: string) => {
        networkApi.stopLookup(this, serviceType, serviceName);
    };

    startPublishing = (serviceType: string, serviceName: string | null, port: number, txtData: Record<string, unknown> | null, callback?: CFCallback) => {
        networkApi.startPublishing(this, serviceType, serviceName, port, txtData, callback);
    };

    stopPublishing = (serviceType: string, serviceName: string, port: number) => {
        networkApi.stopPublishing(this, serviceType, serviceName, port);
    };

    setSystemProperties = (systemName: string, changes: any) => {
        networkApi.setSystemProperties(this, systemName, changes);
    };

    // DELEGATE SENSOR FUNCTIONS
    startMonitoring = (sensor: string, options: any, callback?: CFCallback) => {
        sensorsApi.startMonitoring(this, sensor, options, callback);
    };

    stopMonitoring = (monitorID: string) => {
        sensorsApi.stopMonitoring(this, monitorID);
    };

    // DELEGATE SOUND FUNCTIONS
    playSound = (sound: string) => {
        soundApi.playSound(this, sound);
    };

    stopSound = (sound: string) => {
        soundApi.stopSound(this, sound);
    };

    muteSound = (sound: string) => {
        soundApi.muteSound(this, sound);
    };

    unmuteSound = (sound: string) => {
        soundApi.unmuteSound(this, sound);
    };

    // DELEGATE UTILITY FUNCTIONS
    log = (message: string) => {
        utilitiesApi.log(this, message);
    };

    logObject = (object: any) => {
        utilitiesApi.logObject(this, object);
    };

    crc = (crcType: string, str: string, outputFormat: number, callback?: CFCallback) => {
        utilitiesApi.crc(this, crcType, str, outputFormat, callback);
    };

    hash = (hashType: string, str: string, callback?: CFCallback) => {
        utilitiesApi.hash(this, hashType, str, callback);
    };
    
    openURL = (url: string) => {
        utilitiesApi.openURL(this, url);
    };
    
    loadGUI = (url: string, settings: any) => {
        utilitiesApi.loadGUI(this, url, settings);
    };
    
    loadAsset = (assetName: string, dataEncoding: string, callback?: CFCallback, cache?: string) => {
        utilitiesApi.loadAsset(this, assetName, dataEncoding, callback, cache);
    };
    
    setDeviceProperty = (property: string, value: any) => {
        utilitiesApi.setDeviceProperty(this, property, value);
    };

    interceptHardwareKey = (key: string, intercept: boolean) => {
        utilitiesApi.interceptHardwareKey(this, key, intercept);
    };

    // EVENTS SUBSCRIPTION
    watch = (event: string, ...args: any[]) => {
        if (!this.watchers[event]) {
            this.watchers[event] = [];
        }

        let joins: string | string[] | undefined;
        let callback: CFCallback | undefined;
        let fireNow = false;
        let systemName: string | undefined;
        let feedbackName: string | undefined;

        // Special 4-arg form for FeedbackMatchedEvent:
        // CF.watch(FeedbackMatchedEvent, "SYSTEM", "feedbackName", cb)
        if (event === this.FeedbackMatchedEvent &&
            args.length >= 3 &&
            typeof args[0] === 'string' &&
            typeof args[1] === 'string' &&
            typeof args[2] === 'function') {
            systemName = args[0];
            feedbackName = args[1];
            callback = args[2];
        } else {
            // Standard parsing: detect (joins?, callback, fireNow?)
            let i = 0;
            if (typeof args[i] === 'string' || Array.isArray(args[i])) {
                joins = args[i++];
            }
            if (typeof args[i] === 'function') {
                callback = args[i++];
            }
            if (typeof args[i] === 'boolean') {
                fireNow = args[i];
            }
        }

        if (!callback) return;

        this.watchers[event].push({ joins, callback, systemName, feedbackName });

        // fireNow: immediately call callback with current state
        if (fireNow) {
            this._fireNow(event, joins, callback);
        }
    };

    private _fireNow(event: string, joins: string | string[] | undefined, callback: CFCallback) {
        try {
            if (event === this.ConnectionStatusChangeEvent) {
                // Fire once per matching control system with its current connection status
                for (const [name, sys] of Object.entries(this.controlSystems as Record<string, any>)) {
                    if (joins) {
                        const joinList = Array.isArray(joins) ? joins : [joins];
                        if (!joinList.includes(name)) continue;
                    }
                    const connected = sys.connections && sys.connections.length > 0;
                    const remote = connected ? sys.connections[0] : null;
                    callback(name, connected, remote);
                }
            } else if (event === this.NetworkStatusChangeEvent) {
                callback(this.networkStatus());
            } else if (event === this.JoinChangeEvent && joins) {
                // Fire with current value for each watched join
                const joinList = Array.isArray(joins) ? joins : [joins];
                for (const j of joinList) {
                    const parsed = this.parseJoin(j);
                    if (parsed) {
                        const tokens = this.tokensStore[j] || {};
                        callback(j, joinText(joinStore.get(parsed.id, parsed.type)) ?? "", tokens, []);
                    }
                }
            } else if (event === this.PageFlipEvent && this.currentPage !== 'CURRENT_PAGE') {
                // the page shown now: no page before it
                callback(null, this.currentPage, this.currentOrientation);
            } else if (event === this.OrientationChangeEvent && this.currentPage !== 'CURRENT_PAGE') {
                callback(this.currentPage, this.currentOrientation);
            }
            // GUISuspendedEvent: docs say fireNow is NOT supported for this event — skip
        } catch (e) {
            console.error(`CF._fireNow error for ${event}:`, e);
        }
    }

    unwatch = (event: string, ...args: any[]) => {
        if (!this.watchers[event]) return;

        // FeedbackMatched form (same as watch):
        //   CF.unwatch(FeedbackMatchedEvent, systemName, feedbackName [, callback])
        if (
            event === this.FeedbackMatchedEvent &&
            args.length >= 2 &&
            typeof args[0] === 'string' &&
            typeof args[1] === 'string'
        ) {
            const systemName = args[0];
            const feedbackName = args[1];
            const callback = typeof args[2] === 'function' ? args[2] : undefined;
            this.watchers[event] = this.watchers[event].filter((w) => {
                if (w.systemName && w.systemName !== systemName) return true;
                if (w.feedbackName && w.feedbackName !== feedbackName) return true;
                if (callback && w.callback !== callback) return true;
                // system+feedback (+optional cb) match → remove
                if (!w.systemName && !w.feedbackName) {
                    // bare FeedbackMatched watcher: only remove if no system filter requested
                    // keep bare watchers when unwatching a specific system/item
                    return true;
                }
                return false;
            });
            return;
        }

        let callback: Function | undefined;
        let joins: string[] | string | undefined;

        if (args.length > 0) {
            if (typeof args[args.length - 1] === 'function') {
                callback = args.pop();
            }
            if (args.length > 0) {
                joins = args[0];
            }
        }

        // If no constraints provided, clear all watchers for this event
        if (joins === undefined && callback === undefined) {
            this.watchers[event] = [];
            return;
        }

        const joinsToRemove = joins ? new Set(Array.isArray(joins) ? joins : [joins]) : null;

        this.watchers[event] = this.watchers[event].filter(w => {
            // If callback provided, only consider matching watchers for removal
            if (callback && w.callback !== callback) return true;

            // If we are here, callback matched (or wasn't provided).
            // If no specific joins were requested to be removed, remove this watcher entirely.
            if (!joinsToRemove) return false;

            if (!w.joins) return true;  // keep global watchers
            if (Array.isArray(w.joins)) {
                w.joins = w.joins.filter(j => !joinsToRemove.has(j));
                return w.joins.length > 0; // keep if it still has joins
            }
            return !joinsToRemove.has(w.joins);
        });
    };

    // Make instance global
    static makeGlobal(renderer: CFRenderer) {
        const instance = new CFAPI();
        instance.init(renderer);
        (window as any).CF = instance;
        (globalThis as any).CF = instance;
        return instance;
    }
}


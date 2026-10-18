/**
 * The device as scripts have it, where the host reaches it (the panel app:
 * Android's own settings; a browser: its battery): CF.device's brightness,
 * volume and battery, DevicePropertyChangedEvent on each change the device
 * makes (the user, the battery, a swipe showing the bars), CF.setDeviceProperty
 * and CF.interceptHardwareKey. A script's own change is heard by no script
 * (iViewer's brightness, as its docs have it). With no host for them, CF
 * keeps what a script sets.
 */
import { getHost } from '../../stdlib/host';
import type { HostDeviceChange, HostDeviceControl, HostDeviceProperties } from '../../stdlib/host';
import { CONSTANTS } from './constants';
import type { CFCallback, CFContext } from './types';

const CHARGE: Record<string, string> = {
    unknown: CONSTANTS.CHARGE_UNKNOWN,
    unplugged: CONSTANTS.CHARGE_UNPLUGGED,
    charging: CONSTANTS.CHARGE_CHARGING,
    full: CONSTANTS.CHARGE_FULL,
};

/** a number from 0 to 1 (a string of one too), or null */
const unit = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
};

interface KeyWatch {
    keyCode: number;
    pressTime: number;
    intercept: boolean;
    callback: CFCallback;
}

export class CFDevice {
    /** the system bars as last heard or set (no CF.device field for them) */
    private bars: Record<'statusBar' | 'navigationBar', string | undefined> = { statusBar: undefined, navigationBar: undefined };
    private keys: KeyWatch[] = [];
    private followed = false;

    constructor(private cf: CFContext) {}

    private get control(): HostDeviceControl | undefined {
        return getHost()?.deviceControl;
    }

    /** The host's properties now, and its changes from then on (once; 2 s at most for the first). */
    async follow(): Promise<void> {
        const c = this.control;
        if (!c || this.followed) return;
        this.followed = true;
        try {
            c.onChange((p, quiet) => this.changed(p, quiet));
            const now = await Promise.race([c.properties(), new Promise<null>((r) => setTimeout(() => r(null), 2000))]);
            if (now) this.changed(now, true);
        } catch (e) {
            console.warn('[CF] the device properties:', e);
        }
    }

    /** What the device says changed: into CF.device (and the bars), and - unless quiet - DevicePropertyChangedEvent for each that did. */
    changed(p: HostDeviceProperties, quiet = false) {
        const d = this.cf.device;
        const news: [string, unknown][] = [];
        const field = (name: 'screenBrightness' | 'soundOutputVolume' | 'batteryLevel', property: string) => {
            const v = unit(p[name]);
            if (v === null || d[name] === v) return;
            d[name] = v;
            news.push([property, v]);
        };
        field('screenBrightness', CONSTANTS.ScreenBrightnessProperty);
        field('soundOutputVolume', CONSTANTS.SoundOutputVolumeProperty);
        field('batteryLevel', CONSTANTS.BatteryLevelProperty);
        const charge = p.batteryChargeStatus !== undefined ? CHARGE[p.batteryChargeStatus] : undefined;
        if (charge && d.batteryChargeStatus !== charge) {
            d.batteryChargeStatus = charge;
            news.push([CONSTANTS.BatteryChargeStatusProperty, charge]);
        }
        const bar = (name: 'statusBar' | 'navigationBar', property: string, visible: string, hidden: string) => {
            const v = p[name] === 'visible' ? visible : p[name] === 'hidden' ? hidden : undefined;
            if (!v || this.bars[name] === v) return;
            this.bars[name] = v;
            news.push([property, v]);
        };
        bar('statusBar', CONSTANTS.StatusBarAppearanceProperty, CONSTANTS.STATUS_BAR_VISIBLE, CONSTANTS.STATUS_BAR_HIDDEN);
        bar('navigationBar', CONSTANTS.NavigationBarAppearanceProperty, CONSTANTS.NAVIGATION_BAR_VISIBLE, CONSTANTS.NAVIGATION_BAR_HIDDEN);
        if (quiet) return;
        for (const [property, v] of news) this.cf.dispatchEvent(this.cf.DevicePropertyChangedEvent, property, v);
    }

    /**
     * CF.setDeviceProperty: the screen's brightness (0 to 1; the app's, not
     * the system's setting), the media volume (0 to 1), the status bar (shown,
     * hidden; its text white or black) and the navigation bar (shown, hidden).
     * CF.device has it at once; no event (the script knows).
     */
    setDeviceProperty(property: string, value: unknown) {
        const change: HostDeviceChange = {};
        const say = (why: string) => console.warn(`CF.setDeviceProperty(${property}, ${JSON.stringify(value)}): ${why}`);
        switch (property) {
            case CONSTANTS.ScreenBrightnessProperty:
            case CONSTANTS.SoundOutputVolumeProperty: {
                const v = unit(value);
                if (v === null) return say('a number from 0 to 1 is wanted');
                const name = property === CONSTANTS.ScreenBrightnessProperty ? 'screenBrightness' : 'soundOutputVolume';
                change[name] = v;
                this.cf.device[name] = v;
                break;
            }
            case CONSTANTS.StatusBarAppearanceProperty:
                if (value === CONSTANTS.STATUS_BAR_VISIBLE || value === CONSTANTS.STATUS_BAR_HIDDEN) {
                    change.statusBar = value === CONSTANTS.STATUS_BAR_VISIBLE ? 'visible' : 'hidden';
                    this.bars.statusBar = value;
                } else if (value === CONSTANTS.STATUS_BAR_WHITE_TEXT || value === CONSTANTS.STATUS_BAR_BLACK_TEXT) {
                    change.statusBarText = value === CONSTANTS.STATUS_BAR_WHITE_TEXT ? 'white' : 'black';
                } else return say('one of CF.STATUS_BAR_VISIBLE, _HIDDEN, _WHITE_TEXT, _BLACK_TEXT is wanted');
                break;
            case CONSTANTS.NavigationBarAppearanceProperty:
                if (value !== CONSTANTS.NAVIGATION_BAR_VISIBLE && value !== CONSTANTS.NAVIGATION_BAR_HIDDEN) {
                    return say('CF.NAVIGATION_BAR_VISIBLE or CF.NAVIGATION_BAR_HIDDEN is wanted');
                }
                change.navigationBar = value === CONSTANTS.NAVIGATION_BAR_VISIBLE ? 'visible' : 'hidden';
                this.bars.navigationBar = value;
                break;
            case CONSTANTS.BatteryLevelProperty:
            case CONSTANTS.BatteryChargeStatusProperty:
                return say('the battery is read, not set');
            default:
                return say('not a device property');
        }
        this.control?.set(change);
    }

    /**
     * CF.interceptHardwareKey (Android): a key (Android's key code: CF.HARDWARE_KEY_BACK,
     * _VOLUME_UP, _VOLUME_DOWN or any other) let go after being held at
     * least pressTime ms calls the callback (keyCode, the time held);
     * KEYPRESS_INTERCEPT keeps such a press from the system (a shorter one it
     * gets), KEYPRESS_OBSERVE leaves it the key. A null callback ends the
     * watch of those three.
     */
    interceptHardwareKey(keyCode: unknown, pressTime: unknown, mode: unknown, callback: unknown) {
        const code = typeof keyCode === 'number' ? keyCode : typeof keyCode === 'string' && keyCode.trim() ? Number(keyCode) : NaN;
        const args = `CF.interceptHardwareKey(${JSON.stringify(keyCode)}, ${JSON.stringify(pressTime)}, ${JSON.stringify(mode)})`;
        if (!Number.isInteger(code) || code < 0) return console.warn(`${args}: an Android key code is wanted (CF.HARDWARE_KEY_BACK...)`);
        const time = Math.max(0, Number(pressTime) || 0);
        if (mode !== CONSTANTS.KEYPRESS_INTERCEPT && mode !== CONSTANTS.KEYPRESS_OBSERVE) {
            console.warn(`${args}: CF.KEYPRESS_INTERCEPT or CF.KEYPRESS_OBSERVE is wanted - observed`);
        }
        const intercept = mode === CONSTANTS.KEYPRESS_INTERCEPT;
        this.keys = this.keys.filter((k) => !(k.keyCode === code && k.pressTime === time && k.intercept === intercept));
        if (typeof callback === 'function') this.keys.push({ keyCode: code, pressTime: time, intercept, callback: callback as CFCallback });
        else if (callback != null) console.warn(`${args}: the callback is not a function - the key isn't watched`);
        const c = this.control;
        if (!c?.keys) {
            if (this.keys.length) console.log(`${args}: no hardware keys here (the panel app on Android has them)`);
            return;
        }
        c.keys(this.keys.map(({ keyCode, pressTime, intercept }) => ({ keyCode, pressTime, intercept })), (k, held) => this.heard(k, held));
    }

    /** A key let go after `held` ms: the callbacks watching it from as short a hold. */
    heard(keyCode: number, held: number) {
        for (const k of this.keys.slice()) {
            if (k.keyCode !== keyCode || k.pressTime > held) continue;
            try {
                k.callback(keyCode, held);
            } catch (e) {
                console.error(`CF.interceptHardwareKey(${keyCode}) callback:`, e);
            }
        }
    }
}

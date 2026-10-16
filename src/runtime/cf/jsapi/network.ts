import { CFContext, CFCallback } from './types';
import { TokenEngine, TokenContext } from '../tokenEngine';
import { getHost } from '../../stdlib/host';

export function send(
    ctx: CFContext,
    systemName: string,
    string: string,
    outputFormat?: number
) {
    const sys = (ctx as any).controlSystems?.[systemName];
    if (sys) {
        sys.send(string, outputFormat);
    } else {
        console.warn(`CF.send: System "${systemName}" not found.`);
    }
}

/** Optional TLS / HTTP extras (agapi / CF.request options bag). */
export interface CFRequestTlsOptions {
    /** `false` (default): accept invalid cert + hostname. `true`: verify. */
    rejectUnauthorized?: boolean;
    /** Alias: true → rejectUnauthorized false */
    insecure?: boolean;
}

export function request(
    ctx: CFContext,
    url: string,
    method: string,
    headers: any,
    body: any,
    callback: CFCallback,
    tlsOptions?: CFRequestTlsOptions | null
) {
    const doRequest = async () => {
        if (getHost()?.http) {
            try {
                // Prefer stdlib http (host-backed after installStdlib)
                const http = (await import('../../stdlib/http')).default;
                
                const requestOptions: any = {
                    url,
                    method: method || 'GET',
                    headers: headers || {},
                };

                if (tlsOptions) {
                    if (tlsOptions.rejectUnauthorized !== undefined) {
                        requestOptions.rejectUnauthorized = tlsOptions.rejectUnauthorized;
                    }
                    if (tlsOptions.insecure !== undefined) {
                        requestOptions.insecure = tlsOptions.insecure;
                    }
                }
                
                const req = http.request(requestOptions, (res) => {
                    const chunks: Uint8Array[] = [];
                    res.on('data', (chunk: Uint8Array) => {
                        chunks.push(chunk);
                    });
                    res.on('end', () => {
                        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
                        const fullBody = new Uint8Array(totalLen);
                        let offset = 0;
                        for (const c of chunks) {
                            fullBody.set(c, offset);
                            offset += c.length;
                        }
                        const text = new TextDecoder().decode(fullBody);
                        
                        const resHeaders: any = {};
                        for (const [k, v] of Object.entries(res.headers)) {
                            resHeaders[k.toLowerCase()] = v;
                        }
                        if (callback) callback((res as any).statusCode || 200, resHeaders, text);
                    });
                });
                
                req.on('error', (err: unknown) => {
                    const detail = (err && ((err as any).message || String(err))) || 'unknown';
                    console.error("Tauri request failed:", detail, err);
                    if (callback) callback(0, {}, detail || "Request failed");
                });
                
                if (body) {
                    if (typeof body === 'object' && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)) {
                        const searchParams = new URLSearchParams(body).toString();
                        if (!requestOptions.headers) requestOptions.headers = {};
                        requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                        req.write(searchParams);
                    } else {
                        req.write(body);
                    }
                }
                
                req.end();
                return;
            } catch (e) {
                console.error("Tauri HTTP request failed, falling back to fetch", e);
            }
        }
        
        // Browser/Mock fallback
        const opts: RequestInit = {
            method: method || 'GET',
        };
        if (headers) {
            opts.headers = headers;
        }
        if (body) {
            if (typeof body === 'object') {
                opts.body = new URLSearchParams(body).toString();
                if (!opts.headers) opts.headers = {};
                (opts.headers as any)['Content-Type'] = 'application/x-www-form-urlencoded';
            } else {
                opts.body = body;
            }
        }

        fetch(url, opts).then(async res => {
            const text = await res.text();
            const resHeaders: any = {};
            res.headers.forEach((v, k) => resHeaders[k] = v);
            if (callback) callback(res.status, resHeaders, text);
        }).catch(err => {
            console.error(`CF.request failed:`, err);
            if (callback) callback(0, {}, "Request failed");
        });
    };

    doRequest();
}

export function runCommand(
    ctx: CFContext,
    systemName: string,
    command: string,
    data?: string,
    tokenContext?: TokenContext
) {
    const api = ctx as any;

    // Commands can live in the top-level project.commands dict OR
    // be children (<cmd>) of a specific system node.
    let cmdNode = api.renderer?.project?.commands?.[command];
    let foundSysName = '';

    // Even if cmdNode is found in the global dict, it might be an embedded command 
    // that lacks an explicit 'system' attribute. Search the systems to find its parent.
    if (api.renderer?.project?.systems && (!cmdNode || !cmdNode.attributes?.system)) {
        // Search system nodes for embedded commands
        for (const sysNode of api.renderer.project.systems) {
            const found = sysNode.children?.find(
                (c: any) => c.type === 'cmd' && (c.attributes?.name === command || c.name === command)
            );
            if (found) {
                cmdNode = found;
                foundSysName = sysNode.attributes?.name || sysNode.name || '';
                break;
            }
        }
    }

    if (!cmdNode) {
        console.warn(`CF.runCommand: Command "${command}" not found.`);
        return;
    }

    // ── Native action command ──────────────────────────────────────
    // <cmd name="X" target="d1" value="1"> means: directly setJoin,
    // no network send. Used heavily in loopback systems (LongShortPress, etc).
    const nativeTarget = cmdNode.attributes?.target;
    const nativeValue = cmdNode.attributes?.value;
    if (nativeTarget && nativeValue !== undefined) {
        // Resolve the join type prefix if not already present
        const resolvedNativeValue = TokenEngine.replaceTokens(nativeValue, ctx, tokenContext);
        const join = /^[ads]/.test(nativeTarget) ? nativeTarget : nativeTarget;
        const val = resolvedNativeValue === '0' ? 0 : (isNaN(Number(resolvedNativeValue)) ? resolvedNativeValue : Number(resolvedNativeValue));
        (ctx as any).setJoin(join, val, true);
        // If there is also text body, fall through to send it too.
        // If there is NO text body, we're done.
        if (!cmdNode.text) return;
    }

    // The system it goes to: the one asked for, else the command's own
    let targetSysName = systemName || cmdNode.attributes?.system || foundSysName || '';
    if (targetSysName && targetSysName.includes('(')) {
        targetSysName = targetSysName.substring(0, targetSysName.indexOf('(')).trim();
    }
    // What it sends: its value, tokens ([data], a list's [top] ...) and \x escapes in
    const value = TokenEngine.replaceTokens(cmdNode.text || '', ctx, { data: data ?? '', ...tokenContext })
        .replace(/\\x([0-9A-Fa-f]{2})/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));

    // ── JS handler ────────────────────────────────────────────────
    // its code run with `system` and `data` (what the command generated);
    // "Javascript sends command value": the code sends it (or not), not the command
    if (cmdNode.js) {
        try {
            new Function('system', 'data', `try { ${cmdNode.js} } catch(e) { console.error(e); }`).call(globalThis, targetSysName, value);
        } catch (e) {
            console.error('Error executing JS for command', command, e);
        }
        if (cmdNode.attributes?.jsSendsCommand === 'True') return;
    }

    // ── Child Actions ─────────────────────────────────────────────
    if (cmdNode.children) {
        for (const actionNode of cmdNode.children) {
            if (actionNode.type === 'action') {
                const targetJoin = actionNode.j || actionNode.attributes?.join;
                const actionType = actionNode.attributes?.t || actionNode.attributes?.type;
                const value = actionNode.attributes?.val || actionNode.attributes?.value;
                if (targetJoin && value !== undefined) {
                    let finalVal: string | number = value;
                    if (value === '[currentpos]' || value === '[currentPos]') finalVal = Number(data) || 0;
                    let prefix = '';
                    if (actionType === 'analog') prefix = 'a';
                    else if (actionType === 'serial') prefix = 's';
                    else if (actionType === 'digital') prefix = 'd';
                    const setJ = targetJoin.match(/^[a-zA-Z]/) ? targetJoin : prefix + targetJoin;

                    (ctx as any).setJoin(setJ, finalVal);
                }
            }
        }
    }

    // ── Text / network send ───────────────────────────────────────
    if (!cmdNode.text && !(cmdNode.children?.length > 0)) return;

    const sys = api.controlSystems?.[targetSysName] ?? api.controlSystems?.[''];
    if (sys) {
        // through the system's send handler, in its text encoding
        sys.deliver(value);
    } else {
        console.warn(`CF.runCommand: No system found for "${targetSysName}", command: "${command}"`);
    }
}


// runMacro and stopMacro are now implemented in systemManager.ts
// and exposed via cf.ts directly. These stubs are kept for backward
// compatibility in case network.ts is imported elsewhere.
export function runMacro(ctx: CFContext, macroName: string) {
    console.warn('CF.runMacro: use cf.ts runMacroByName instead');
}
export function stopMacro(ctx: CFContext, macroName: string | null) {
    console.warn('CF.stopMacro: use cf.ts stopMacroByName instead');
}

export function startLookup(
    ctx: CFContext,
    serviceType: string,
    serviceName: string,
    callback?: CFCallback
) {
    console.log(`CF STUB: startLookup(${serviceType}, ${serviceName})`);
    if (callback) {
        setTimeout(() => callback([], [], null), 10);
    }
}

export function stopLookup(
    ctx: CFContext,
    serviceType: string,
    serviceName: string
) {
    console.log(`CF STUB: stopLookup(${serviceType}, ${serviceName})`);
}

export function startPublishing(
    ctx: CFContext,
    serviceType: string,
    serviceName: string,
    port: number,
    txtData: string,
    callback?: CFCallback
) {
    console.log(`CF STUB: startPublishing(${serviceType}, ${serviceName}, ${port}, ${txtData})`);
    if (callback) {
        setTimeout(() => callback(serviceType, serviceName, port, true, null), 10);
    }
}

export function stopPublishing(
    ctx: CFContext,
    serviceType: string,
    serviceName: string,
    port: number
) {
    console.log(`CF STUB: stopPublishing(${serviceType}, ${serviceName}, ${port})`);
}

export function setSystemProperties(
    ctx: CFContext,
    systemName: string,
    changes: any
) {
    const api = ctx as any;
    const sys = api.controlSystems?.[systemName];
    if (sys) {
        if (changes.address !== undefined) sys.address = changes.address;
        if (changes.port !== undefined) sys.port = changes.port;
        if (changes.localPort !== undefined) sys.localPort = changes.localPort;
        if (changes.connect !== undefined) sys.connectJoin = changes.connect;
        if (changes.disconnect !== undefined) sys.disconnectJoin = changes.disconnect;

        let needsRestart = false;
        if (changes.address !== undefined || changes.port !== undefined || changes.localPort !== undefined) {
            needsRestart = true;
        }

        if (changes.enabled !== undefined) {
            if (sys.enabled && !changes.enabled) {
                sys.stop();
            } else if (!sys.enabled && changes.enabled) {
                sys.enabled = true;
                sys.start();
                needsRestart = false;
            }
        }

        if (sys.enabled && needsRestart) {
            sys.stop();
            sys.enabled = true;
            sys.start();
        }

        // Update public dictionary
        const pubSys = api.systems?.[systemName];
        if (pubSys) {
            if (changes.address !== undefined) pubSys.address = changes.address;
            if (changes.port !== undefined) pubSys.port = changes.port;
            if (changes.localPort !== undefined) pubSys.localPort = changes.localPort;
            if (changes.enabled !== undefined) pubSys.enabled = changes.enabled;
            if (changes.connect !== undefined) pubSys.connect = changes.connect;
            if (changes.disconnect !== undefined) pubSys.disconnect = changes.disconnect;
        }

    } else {
        console.warn(`CF.setSystemProperties: System "${systemName}" not found.`);
    }
}

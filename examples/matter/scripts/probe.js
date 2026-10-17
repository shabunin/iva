// The Probe page: what this panel can do for a Matter controller (matter.js over UDP systems) - the JavaScript
// engine, Web Crypto, UDP systems carrying bytes, persisted tokens, a big script. Each check is a line on the
// page (a serial join a group) and in CF.log (iva serve's console shows it). Runs at start and on "Run again".
var MatterProbe = (function () {
  var lines = {};
  var running = false;
  var frames = {};   // system -> [strings that came through its catch-all feedback]
  var waiters = {};  // system -> resolve(): the next frame
  var ups = {};      // system -> resolve(): its next "connected"
  var tokensAtStart = null;

  function group(name) { return Joins.s['probe' + name]; }
  function clear(name) { lines[name] = []; CF.setJoin(group(name), ''); }
  function say(name, text) {
    lines[name].push(text);
    CF.setJoin(group(name), lines[name].join('\n'));
    CF.log('probe ' + name + ': ' + text);
  }
  function yesNo(ok, detail) { return (ok ? 'Yes' : 'No') + (detail ? ' (' + detail + ')' : ''); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hex(bytes) { return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  /** a binary string (a char a byte) from bytes, as CF.send takes it */
  function str(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; }
  function bytesOf(n, f) { var b = []; for (var i = 0; i < n; i++) b.push(f(i) & 255); return b; }
  /** where a string first differs from the bytes: -1 when it's them */
  function differs(s, bytes) {
    if (s.length !== bytes.length) return Math.min(s.length, bytes.length);
    for (var i = 0; i < bytes.length; i++) if (s.charCodeAt(i) !== bytes[i]) return i;
    return -1;
  }
  function compare(what, s, bytes) {
    if (s === null) return what + ': No (nothing came back in time)';
    var at = differs(s, bytes);
    if (at < 0) return what + ': Yes (' + bytes.length + ' of ' + bytes.length + ' bytes back, in order)';
    if (s.length !== bytes.length) return what + ': No (' + s.length + ' chars back for ' + bytes.length + ' bytes' + (at < s.length && s.charCodeAt(at) !== bytes[at] ? '; byte ' + at + ' = 0x' + ('0' + bytes[at].toString(16)).slice(-2) + ' came as U+' + ('0000' + s.charCodeAt(at).toString(16).toUpperCase()).slice(-4) : '') + ')';
    return what + ': No (byte ' + at + ' = 0x' + ('0' + bytes[at].toString(16)).slice(-2) + ' came as U+' + ('0000' + s.charCodeAt(at).toString(16).toUpperCase()).slice(-4) + ')';
  }

  // ── the engine ─────────────────────────────────────────────────
  function has(expr) { try { return !!new Function('return (' + expr + ')')(); } catch (e) { return false; } }
  function engine() {
    clear('Engine');
    var d = CF.device || {};
    say('Engine', 'Runtime: ' + (CF.runtime === 'iva' ? 'iva panel' : 'iViewer') + ' on ' + (d.platform || '?') + ' ' + (d.version || '') + ' (' + (d.model || '?') + ')');
    var where = typeof location !== 'undefined' ? location.protocol + '//' + (location.host || '') : 'no location';
    say('Engine', 'Page: ' + where + ', secure context: ' + yesNo(typeof isSecureContext !== 'undefined' && isSecureContext));
    var missing = [];
    var checks = {
      'async/await': 'new Function("return (async () => 1)()")()', 'private fields': 'new Function("class A { #x = 1; get x() { return this.#x; } }; return new A().x")()',
      BigInt: 'typeof BigInt === "function"', WeakRef: 'typeof WeakRef === "function"', FinalizationRegistry: 'typeof FinalizationRegistry === "function"',
      TextEncoder: 'typeof TextEncoder === "function" && typeof TextDecoder === "function"', MessageChannel: 'typeof MessageChannel === "function"',
      queueMicrotask: 'typeof queueMicrotask === "function"', structuredClone: 'typeof structuredClone === "function"', AbortController: 'typeof AbortController === "function"',
      'Symbol.dispose': 'typeof Symbol.dispose === "symbol"', 'crypto.getRandomValues': 'typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"',
      'Promise.withResolvers': 'typeof Promise.withResolvers === "function"', 'Array.prototype.at': 'typeof [].at === "function"',
    };
    Object.keys(checks).forEach(function (k) { if (!has(checks[k])) missing.push(k); });
    say('Engine', 'Modern JavaScript: ' + (missing.length ? 'Partly (missing ' + missing.join(', ') + ')' : 'Yes (' + Object.keys(checks).length + ' features)'));
    say('Engine', 'Address: ' + (CF.ipv4address || '?') + ' / ' + (CF.ipv4netmask || '?') + ', MAC ' + (CF.MACaddress || '?') + ', IPv6 ' + (CF.ipv6address || 'none'));
    say('Engine', 'Network: ' + (CF.networkType || '?') + (CF.networkSSID ? ' ' + CF.networkSSID : ''));
    var services = Object.keys(found).length;
    say('Engine', 'Bonjour: ' + services + ' Matter service(s) so far (the Devices page lists them)');
  }

  // ── Web Crypto ─────────────────────────────────────────────────
  async function cryptoChecks() {
    clear('Crypto');
    var subtle = typeof crypto !== 'undefined' && crypto.subtle;
    say('Crypto', 'crypto.subtle: ' + yesNo(!!subtle, subtle ? undefined : typeof crypto === 'undefined' ? 'no crypto at all' : 'crypto without subtle: not a secure context?'));
    if (!subtle) return false;
    var ok = true;
    async function check(name, f) {
      var t0 = Date.now();
      try {
        var detail = await f();
        say('Crypto', name + ': Yes (' + (Date.now() - t0) + ' ms' + (detail ? ', ' + detail : '') + ')');
        return true;
      } catch (e) {
        ok = false;
        say('Crypto', name + ': No (' + (e && e.message || e) + ')');
        return false;
      }
    }
    var enc = new TextEncoder();
    await check('SHA-256', async function () {
      var h = hex(new Uint8Array(await subtle.digest('SHA-256', enc.encode('abc'))));
      if (h.slice(0, 8) !== 'ba7816bf') throw new Error('wrong digest ' + h.slice(0, 8));
    });
    var ecdh = { name: 'ECDH', namedCurve: 'P-256' };
    var a, b;
    await check('ECDH P-256 key agreement', async function () {
      a = await subtle.generateKey(ecdh, true, ['deriveBits']);
      b = await subtle.generateKey(ecdh, true, ['deriveBits']);
      var t0 = Date.now();
      var s1 = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: b.publicKey }, a.privateKey, 256));
      var one = Date.now() - t0;
      var s2 = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: a.publicKey }, b.privateKey, 256));
      if (hex(s1) !== hex(s2) || s1.length !== 32) throw new Error('secrets differ');
      return 'one agreement ' + one + ' ms';
    });
    if (a) await check('ECDH public key raw export + import', async function () {
      var raw = new Uint8Array(await subtle.exportKey('raw', a.publicKey));
      if (raw.length !== 65 || raw[0] !== 4) throw new Error('raw key is ' + raw.length + ' bytes');
      await subtle.importKey('raw', raw, ecdh, true, []);
      var jwk = await subtle.exportKey('jwk', a.privateKey);
      if (!jwk.d) throw new Error('no private jwk');
      return '65 bytes, jwk';
    });
    await check('ECDSA P-256 sign + verify', async function () {
      var k = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      var sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.privateKey, enc.encode('matter'));
      if (!(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.publicKey, sig, enc.encode('matter')))) throw new Error('did not verify');
    });
    var key16 = new Uint8Array(16);
    crypto.getRandomValues(key16);
    await check('AES-CTR', async function () {
      var k = await subtle.importKey('raw', key16, 'AES-CTR', false, ['encrypt', 'decrypt']);
      var ct = await subtle.encrypt({ name: 'AES-CTR', counter: new Uint8Array(16), length: 64 }, k, enc.encode('0123456789abcdef'));
      if (ct.byteLength !== 16) throw new Error(ct.byteLength + ' bytes');
    });
    await check('AES-CBC', async function () {
      var k = await subtle.importKey('raw', key16, 'AES-CBC', false, ['encrypt', 'decrypt']);
      var ct = await subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, k, enc.encode('0123456789abcdef'));
      if (ct.byteLength !== 32) throw new Error(ct.byteLength + ' bytes');
    });
    await check('HKDF SHA-256', async function () {
      var k = await subtle.importKey('raw', key16, 'HKDF', false, ['deriveBits']);
      var out = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(8), info: enc.encode('info') }, k, 256);
      if (out.byteLength !== 32) throw new Error(out.byteLength + ' bytes');
    });
    await check('PBKDF2 SHA-256, 1000 rounds', async function () {
      var k = await subtle.importKey('raw', enc.encode('20202021'), 'PBKDF2', false, ['deriveBits']);
      var t0 = Date.now();
      var out = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(16), iterations: 1000 }, k, 640);
      if (out.byteLength !== 80) throw new Error(out.byteLength + ' bytes');
      return 'a Matter PASE (up to 100000 rounds) about ' + Math.round((Date.now() - t0) * 100) + ' ms';
    });
    await check('HMAC SHA-256', async function () {
      var k = await subtle.importKey('raw', key16, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      var out = await subtle.sign('HMAC', k, enc.encode('x'));
      if (out.byteLength !== 32) throw new Error(out.byteLength + ' bytes');
    });
    return ok;
  }

  // ── UDP systems ────────────────────────────────────────────────
  /** the next frame on a system, or null after `ms` */
  function nextFrame(system, ms) {
    return new Promise(function (resolve) {
      var me = function (s) { clearTimeout(t); if (waiters[system] === me) waiters[system] = null; resolve(s); };
      var t = setTimeout(function () { if (waiters[system] === me) waiters[system] = null; resolve(null); }, ms);
      waiters[system] = me;
    });
  }
  /** every frame on a system within `ms` */
  function framesWithin(system, ms) {
    frames[system] = [];
    return sleep(ms).then(function () { var f = frames[system]; frames[system] = []; return f; });
  }
  function sendTo(system, bytes) { CF.send(system, str(bytes)); }
  /** the system's next "connected" (ConnectionStatusChangeEvent), or false after `ms` */
  function connected(system, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { done = true; resolve(false); }, ms);
      ups[system] = function () { if (done) return; done = true; clearTimeout(t); resolve(true); };
    });
  }

  async function udp() {
    clear('UDP');
    var ok = true;
    var all = bytesOf(256, function (i) { return i; });
    // 1. every byte value through the client to the echo server and back (the server's script sends back what it got)
    frames.ProbeEcho = [];
    var reply = nextFrame('ProbeUdp', 1500);
    sendTo('ProbeUdp', all);
    var got = await reply;
    var line = compare('Bytes 0x00-0xFF, client -> echo -> client', got, all);
    say('UDP', line);
    await sleep(100);
    say('UDP', frames.ProbeEcho.length ? compare('  the echo server got', frames.ProbeEcho[0], all) : '  the echo server\'s frame: none seen by the script (its feedback fired - the echo came)');
    if (got === null || differs(got, all) >= 0) ok = false;
    // 2. bytes that are UTF-8 text (a runtime that decodes text would turn them into fewer chars)
    var utf8 = [0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80, 0x41];
    reply = nextFrame('ProbeUdp', 1500);
    sendTo('ProbeUdp', utf8);
    got = await reply;
    say('UDP', compare('Bytes that read as UTF-8', got, utf8));
    // (a runtime reading them as text is fine if iso-8859-1 - what the driver's systems use - carries them: line 5)
    var utf8Ok = got !== null && differs(got, utf8) < 0;
    // 3. a Matter-sized packet
    var big = bytesOf(1232, function (i) { return i * 7 + 3; });
    reply = nextFrame('ProbeUdp', 1500);
    sendTo('ProbeUdp', big);
    got = await reply;
    say('UDP', compare('1232 bytes in one packet', got, big));
    if (got === null || differs(got, big) >= 0) ok = false;
    // 4. a burst: four packets at once - do they come as four frames or run together?
    var burstWait = framesWithin('ProbeUdp', 1500);
    for (var n = 0; n < 4; n++) sendTo('ProbeUdp', bytesOf(300, function (i) { return n * 50 + i; }));
    var burst = await burstWait;
    var sizes = burst.map(function (s) { return s.length; });
    var apart = burst.length === 4 && sizes.every(function (l) { return l === 300; });
    say('UDP', 'Four packets at once: ' + (apart ? 'Yes (four frames of 300)' : 'No (' + burst.length + ' frame(s) of ' + (sizes.join(', ') || 'nothing') + ')'));
    if (!apart) ok = false;
    // 5. the same bytes through a system with textEncoding iso-8859-1, to itself
    reply = nextFrame('ProbeLatin', 1500);
    sendTo('ProbeLatin', all);
    got = await reply;
    say('UDP', compare('Bytes 0x00-0xFF, textEncoding iso-8859-1', got, all));
    if (!utf8Ok && (got === null || differs(got, all) >= 0)) ok = false;
    // 6. IPv6: a system whose host is ::1, to itself
    var v6 = CF.systems && CF.systems.ProbeV6;
    reply = nextFrame('ProbeV6', 1500);
    try { sendTo('ProbeV6', bytesOf(16, function (i) { return i + 65; })); } catch (e) { say('UDP', 'IPv6 send threw: ' + e); }
    got = await reply;
    say('UDP', 'IPv6 (host ::1): ' + yesNo(got !== null && got.length === 16, got !== null ? got.length + ' bytes back' : 'nothing back; CF.systems says ' + (v6 ? v6.address + ':' + v6.port + (v6.enabled ? ', enabled' : ', disabled') + ', ' + (v6.connections || []).length + ' connection(s)' : 'no such system')));
    // 7. retargeting, three ways - each tells whether a ConnectionStatusChangeEvent came (in how long) and where the
    //    next packet went: ProbeLatin's own frame (5544: the new target) or the echo back on ProbeUdp (5541: the old
    //    one). iViewer keeps sending to the old address when only address and port change; the driver does the third.
    var ways = [
      { what: 'address + port', expect: 'ProbeLatin', set: function () { CF.setSystemProperties('ProbeUdp', { address: '127.0.0.2', port: 5544 }); } },
      { what: 'address + port + localPort', expect: 'ProbeUdp', set: function () { CF.setSystemProperties('ProbeUdp', { address: '127.0.0.2', port: 5541, localPort: 5542 }); } },
      { what: 'off, address + port, on', expect: 'ProbeLatin', set: function () {
        CF.setSystemProperties('ProbeUdp', { enabled: false });
        CF.setSystemProperties('ProbeUdp', { address: '127.0.0.2', port: 5544 });
        CF.setSystemProperties('ProbeUdp', { enabled: true });
      } },
    ];
    var anyWay = false;
    for (var w = 0; w < ways.length; w++) {
      var way = ways[w];
      var t0 = Date.now();
      var up = connected('ProbeUdp', 1500);
      var onLatin = nextFrame('ProbeLatin', 1500);
      var onUdp = nextFrame('ProbeUdp', 1500);
      way.set();
      var ready = await up;
      var took = Date.now() - t0;
      var marker = 0xa0 + w;
      sendTo('ProbeUdp', [marker, 1, 2, 3]);
      var came = await Promise.race([
        onLatin.then(function (f) { return f === null ? null : { on: 'ProbeLatin', f: f }; }),
        onUdp.then(function (f) { return f === null ? null : { on: 'ProbeUdp', f: f }; }),
      ]);
      waiters.ProbeLatin = null;
      waiters.ProbeUdp = null;
      var event = ready ? 'connected again after ' + took + ' ms' : 'no connection event in 1.5 s';
      var okWay = !!came && came.on === way.expect && came.f.charCodeAt(0) === marker;
      var whereLine = !came ? 'nothing came' : came.f.charCodeAt(0) !== marker ? 'an older packet came on ' + came.on : came.on === way.expect ? 'the packet came where it was sent' : 'the packet went to the old target';
      say('UDP', 'Retarget (' + way.what + '): ' + yesNo(okWay, event + ', ' + whereLine));
      if (okWay) anyWay = true;
      await sleep(200);
    }
    if (!anyWay) ok = false;
    // back where it started (the way the driver does it)
    CF.setSystemProperties('ProbeUdp', { enabled: false });
    CF.setSystemProperties('ProbeUdp', { address: '127.0.0.2', port: 5541, localPort: 5542 });
    CF.setSystemProperties('ProbeUdp', { enabled: true });
    return ok;
  }

  // ── persisted tokens ───────────────────────────────────────────
  function tokens() {
    return new Promise(function (resolve) {
      CF.getJoin(CF.GlobalTokensJoin, function (j, v, tokens) { resolve(tokens || {}); });
    });
  }
  function tokenOf(all, name) { return all['[' + name + ']'] !== undefined ? all['[' + name + ']'] : all[name]; }
  /** the tokens as names (brackets off: a text join would put the token's value in their place) and lengths */
  function tokenSummary(all) {
    var keys = Object.keys(all).filter(function (k) { return /probe/i.test(k); });
    return keys.length ? keys.map(function (k) { return k.replace(/[\[\]]/g, '') + '=' + String(all[k] === null || all[k] === undefined ? '' : all[k]).length; }).join(' ') : 'none';
  }
  async function tokenChecks() {
    clear('Tokens');
    var before = tokensAtStart || await tokens();
    var ok = true;
    say('Tokens', 'At start (name=chars): ' + tokenSummary(before));
    var sizes = [4, 16, 64];
    for (var i = 0; i < sizes.length; i++) {
      var kb = sizes[i];
      var name = 'probe' + kb + 'k';
      var kept = tokenOf(before, name);
      var keptLine = kept === undefined ? 'no token at start' : kept === '' ? 'empty at start' : 'at start ' + kept.length + ' chars' + (kept.length === kb * 1024 ? ' (kept from the last run)' : '');
      var value = '';
      // not one character over and over: bytes a store might compress differently
      for (var n = 0; n < kb * 1024; n++) value += String.fromCharCode(48 + ((n * 7) % 74));
      CF.setToken(CF.GlobalTokensJoin, '[' + name + ']', value);
      var now = tokenOf(await tokens(), name);
      var back = now === value;
      if (!back) ok = false;
      say('Tokens', kb + ' KB: ' + (back ? 'written and read back' : 'No (' + (now === undefined ? 'not there' : now.length + ' chars back') + ')') + '; ' + keptLine);
    }
    // a token written without the brackets its declaration has: read back, kept?
    var kept = tokenOf(before, 'probeNoBr');
    var stamp = 'nb' + Date.now();
    CF.setToken(CF.GlobalTokensJoin, 'probeNoBr', stamp);
    var nb = tokenOf(await tokens(), 'probeNoBr');
    say('Tokens', 'Written without brackets: ' + yesNo(nb === stamp, (nb === stamp ? 'read back' : 'read back ' + JSON.stringify(nb)) + '; at start ' + (kept ? JSON.stringify(kept) : 'empty')));
    // a value with brackets and braces: iViewer's substitution ({{1+1}}, [@s1]) changes it - the driver keeps base64 (not counted)
    var tricky = '{"a":[1,2],"b":"[x]","c":"{{1+1}}","d":"[@s1]"}';
    CF.setToken(CF.GlobalTokensJoin, '[probeJson]', tricky);
    var tk = tokenOf(await tokens(), 'probeJson');
    say('Tokens', 'A JSON value verbatim: ' + yesNo(tk === tricky, tk === tricky ? undefined : 'came back as ' + JSON.stringify(tk) + ' - base64 then'));
    return ok;
  }

  // ── Bonjour ────────────────────────────────────────────────────
  // (the driver looks the same types up for the Devices page; this only counts what comes, in the log)
  var found = {};
  function lookups() {
    var types = { '_matter._tcp.': 'operational', '_matterc._udp.': 'commissionable' };
    Object.keys(types).forEach(function (type) {
      CF.startLookup(type, '', function (added, removed, error) {
        if (error) { CF.log('probe Bonjour ' + type + ': error ' + error); return; }
        (removed || []).forEach(function (s) { delete found[type + s.name]; });
        (added || []).forEach(function (s) { found[type + s.name] = { kind: types[type], s: s }; });
        var all = Object.keys(found).map(function (k) {
          var f = found[k], d = f.s.data || {};
          var info = Object.keys(d).filter(function (x) { return x; }).map(function (x) { return x + '=' + d[x]; }).join(' ');
          return f.kind + ' ' + f.s.name + ' at ' + ((f.s.addresses || []).join(',') || f.s.hostname || '?') + ':' + f.s.port + (info ? ' [' + info + ']' : '');
        });
        CF.log('probe Bonjour: ' + all.length + ' Matter service(s): ' + all.join('; '));
      });
    });
  }

  async function run() {
    if (running) return;
    running = true;
    CF.setJoin(Joins.s.probeSummary, 'Running…');
    try {
      engine();
      var c = await cryptoChecks();
      var u = await udp();
      var t = await tokenChecks();
      clear('Script');
      var bigOk = typeof ProbeBig !== 'undefined';
      say('Script', 'A 1.5 MB script loaded: ' + yesNo(bigOk, bigOk ? ProbeBig.size + ' chars' : 'ProbeBig is not defined'));
      var why = [];
      if (!c) why.push('Web Crypto');
      if (!u) why.push('UDP bytes');
      if (!t) why.push('tokens');
      if (!bigOk) why.push('the big script');
      CF.setJoin(Joins.s.probeSummary, why.length ? 'Matter over UDP systems here: No - ' + why.join(', ') + ' failed (see above)' : 'Matter over UDP systems here: Yes - everything a matter.js controller needs works');
      CF.log('probe: ' + (why.length ? 'FAILED ' + why.join(', ') : 'all checks passed'));
    } catch (e) {
      CF.setJoin(Joins.s.probeSummary, 'The probe itself failed: ' + (e && e.stack || e));
      CF.log('probe: failed - ' + (e && e.stack || e));
    }
    running = false;
  }

  return {
    /** at start: the systems' frames collected, the echo server answering, the tokens as they were, then the checks */
    start: function () {
      ['ProbeEcho', 'ProbeUdp', 'ProbeLatin', 'ProbeV6'].forEach(function (name) {
        frames[name] = [];
        CF.watch(CF.FeedbackMatchedEvent, name, 'frame', function (fb, data) {
          data = String(data);
          frames[name].push(data);
          if (name === 'ProbeEcho') CF.send('ProbeEcho', data);
          if (waiters[name]) waiters[name](data);
        });
        // (one system a watch: iViewer takes no array here)
        CF.watch(CF.ConnectionStatusChangeEvent, name, function (system, up) {
          if (up && ups[name]) ups[name]();
        });
      });
      CF.getJoin(CF.GlobalTokensJoin, function (j, v, tokens) {
        tokensAtStart = tokens || {};
        CF.log('probe tokens at start: ' + JSON.stringify(tokensAtStart).slice(0, 300));
      });
      lookups();
      // the systems connect a moment after the scripts start (iViewer); the echo path needs both up
      setTimeout(run, 1500);
    },
    run: run,
  };
})();

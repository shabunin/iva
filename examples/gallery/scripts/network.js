// The Network page: CF.request in each of its forms; the GUI's own systems - a TCP echo, its client and
// its server both the panel's (CF.send, feedback, CF.setSystemProperties, CF.systems); Bonjour
// (CF.startPublishing, CF.startLookup) - looked up while the page shows, as the docs suggest. What it
// does goes to CF.log too: iva serve's console shows it.
var GalleryNetwork = (function () {
  // the gallery's own API (scripts/net.js: /now, /echo)
  var API = 'http://127.0.0.1:8899';
  // what Bonjour looks for: Web, Cast, AirPlay, Printers (the Segmented's options)
  var TYPES = ['_http._tcp.', '_googlecast._tcp.', '_airplay._tcp.', '_ipp._tcp.'];
  // what the panel publishes itself as: named outright - the docs let '' stand for the device's name, but
  // Android's own service discovery (iViewer's there) refuses an empty name; iva's runtime names it the same
  var PUBLISHED = { type: '_http._tcp.', name: (CF.device && CF.device.name) || 'iva gallery', port: 8900 };
  var events = [];
  var lookingFor = null;
  var found = {};
  var started = false;

  function show(join, text) {
    CF.setJoin(join, text);
  }

  // ── CF.request ─────────────────────────────────────────────────

  /** its answer on the page: the status and the time it took, some headers, the start of the body */
  function answered(what, t0) {
    return function (status, headers, body) {
      var ms = Date.now() - t0;
      show(Joins.s.reqStatus, (status ? 'HTTP ' + status : 'no answer (status 0)') + '  ·  ' + ms + ' ms');
      var names = ['Server', 'Content-Type', 'Content-Length'].filter(function (n) { return headers && headers[n] !== undefined; });
      var all = headers ? Object.keys(headers).length : 0;
      show(Joins.s.reqHeaders, names.map(function (n) { return n + ': ' + headers[n]; }).join('\n') +
        (all > names.length ? '\n+ ' + (all - names.length) + ' more header(s)' : ''));
      show(Joins.s.reqBody, String(body || '').replace(/\s+/g, ' ').slice(0, 400));
      CF.log('Network: ' + what + ' - ' + (status || 'no answer') + ', ' + ms + ' ms');
    };
  }

  /** CF.request with these arguments (all but the callback), what it is on the page */
  function ask(what) {
    var args = Array.prototype.slice.call(arguments, 1);
    show(Joins.s.reqLine, what);
    show(Joins.s.reqStatus, 'asking…');
    show(Joins.s.reqHeaders, '');
    show(Joins.s.reqBody, '');
    CF.request.apply(CF, args.concat([answered(what, Date.now())]));
  }

  // ── systems ────────────────────────────────────────────────────

  /** the last few things the systems did */
  function event(line) {
    events.push(new Date().toTimeString().slice(0, 8) + '  ' + line);
    if (events.length > 6) events.shift();
    show(Joins.s.sysLog, events.join('\n'));
  }

  /** CF.systems as a table: each system, where it goes, whether it's on, its connections */
  function systems() {
    var rows = Object.keys(CF.systems).filter(function (n) { return n; }).map(function (n) {
      var s = CF.systems[n];
      var c = (s.connections || []).length;
      return {
        name: n, type: s.type, where: s.address + ':' + s.port,
        state: !s.enabled ? 'off' : c ? c + ' connected' : s.type === 'http' ? 'on' : 'idle',
        tone: !s.enabled ? 'offline' : c ? 'ok' : 'muted',
      };
    });
    show(Joins.s.sysTable, JSON.stringify(rows));
  }

  // ── Bonjour ────────────────────────────────────────────────────

  function foundTable() {
    var rows = Object.keys(found).sort().map(function (k) {
      var s = found[k];
      return { name: s.name, where: ((s.addresses || [])[0] || s.hostname || '?') + ':' + s.port };
    });
    show(Joins.s.bjFound, JSON.stringify(rows));
  }

  /**
   * a service's TXT data as key=value pairs; a key with no value (a flag) on its own. An empty TXT
   * record (a printer's) comes from iViewer as one empty key with a null value: nothing to show.
   */
  function txt(data) {
    return Object.keys(data || {}).filter(function (k) { return k; }).map(function (k) {
      var v = data[k];
      return v === null || v === undefined || v === '' ? k : k + '=' + v;
    }).join('  ');
  }

  /** a lookup of one type: what comes in, what goes, kept in a table */
  function lookup(index) {
    if (lookingFor) CF.stopLookup(lookingFor, '');
    found = {};
    foundTable();
    show(Joins.s.bjDetail, '');
    lookingFor = TYPES[index] || TYPES[0];
    CF.startLookup(lookingFor, '', function (added, removed, error) {
      if (error) {
        show(Joins.s.bjDetail, error);
        return;
      }
      removed.forEach(function (s) { delete found[s.name]; });
      added.forEach(function (s) { found[s.name] = s; });
      foundTable();
    });
  }

  function stopLooking() {
    if (lookingFor) CF.stopLookup(lookingFor, '');
    lookingFor = null;
  }

  // (the docs' text has it (type, name, port, published, error), their example (name, type, ...): both shown)
  function published(type, name, port, ok, error) {
    show(Joins.s.bjStatus, ok ? 'Published: ' + [type, name].filter(Boolean).join(' \u00b7 ') + ', port ' + port : error ? 'Not published: ' + error : 'Not published');
  }

  return {
    /** at start: the systems watched, the table filled, Bonjour while the page shows */
    start: function () {
      if (started) return;
      started = true;
      // the echo server: a line in, the line back in capitals
      CF.watch(CF.FeedbackMatchedEvent, 'EchoServer', 'line', function (fb, data) {
        var text = String(data).replace(/[\r\n]+$/, '');
        CF.send('EchoServer', 'ECHO ' + text.toUpperCase() + '\r\n');
        event('server got "' + text + '"');
      });
      CF.watch(CF.FeedbackMatchedEvent, 'EchoClient', 'reply', function (fb, data) {
        event('client got "' + String(data).replace(/[\r\n]+$/, '') + '"');
      });
      // (one system a watch: iViewer takes no array here - "Invalid parameter 1: Array is not allowed")
      ['EchoClient', 'EchoServer'].forEach(function (name) {
        CF.watch(CF.ConnectionStatusChangeEvent, name, function (system, connected, remote) {
          event(system + (connected ? ' connected ' : ' disconnected ') + (remote || ''));
          systems();
        });
      });
      systems();
      setInterval(systems, 2000);
      CF.watch(CF.PageFlipEvent, function (from, to) {
        var here = /^Network/.test(to || '');
        if (here && !lookingFor) CF.getJoin(Joins.a.bjType, function (j, v) { lookup(Number(v) || 0); });
        if (!here) stopLooking();
      });
      CF.watch(CF.JoinChangeEvent, Joins.a.bjType, function (j, v) {
        if (lookingFor) lookup(Number(v) || 0);
      });
      CF.watch(CF.JoinChangeEvent, Joins.d.bjPublish, function (j, v) {
        if (v == '1') CF.startPublishing(PUBLISHED.type, PUBLISHED.name, PUBLISHED.port, { path: '/', from: 'iva gallery' }, published);
        else CF.stopPublishing(PUBLISHED.type, PUBLISHED.name, PUBLISHED.port);
      });
    },

    // the request buttons: the docs' four forms
    get: function () { ask('GET /now', API + '/now'); },
    headers: function () { ask('GET /echo, our headers', API + '/echo', { 'User-Agent': 'iva-gallery/1.0', 'X-Room': 'Kitchen' }); },
    head: function () { ask('HEAD /now: headers["Server"]', API + '/now', 'HEAD', null); },
    post: function () { ask('POST a form to httpbin.org', 'https://httpbin.org/post', 'POST', null, { first_name: 'John', city: 'New-York' }); },
    put: function () { ask('PUT text to httpbin.org', 'https://httpbin.org/put', 'PUT', { 'Content-Type': 'text/plain; charset=utf-8' }, 'héllo wörld, привет'); },
    refused: function () { ask('GET a port nobody listens on', 'http://127.0.0.1:9/'); },

    /** the field's text to the echo server, through the client */
    echo: function () {
      CF.getJoin(Joins.s.echoText, function (j, text) {
        if (!text) return;
        CF.send('EchoClient', text + '\r\n');
        event('client sent "' + text + '"');
      });
    },
    /** the client off, on again (CF.setSystemProperties: enabled) */
    toggle: function () {
      var on = !CF.systems.EchoClient.enabled;
      CF.setSystemProperties('EchoClient', { enabled: on });
      event('EchoClient ' + (on ? 'on' : 'off'));
      systems();
    },
    /** the client to another port and back (CF.setSystemProperties: port) - nobody listens on 8896 */
    port: function () {
      var p = CF.systems.EchoClient.port === 8897 ? 8896 : 8897;
      CF.setSystemProperties('EchoClient', { port: p });
      event('EchoClient to port ' + p + (p === 8897 ? '' : ': nobody there'));
      systems();
    },

    /** a found service tapped: its addresses and TXT data */
    detail: function (row) {
      var s = found[row.name];
      if (!s) return;
      var data = txt(s.data);
      show(Joins.s.bjDetail, (s.hostname || '') + '  ' + (s.addresses || []).join(', ') + (data ? '\n' + data : ''));
    },
  };
})();

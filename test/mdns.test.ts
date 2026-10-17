import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TYPE, encode, decode, labels, joinLabels, txtData, type Message } from '../src/runtime/cf/mdns/dns.ts';
import { Mdns, fqType, type FoundService, type GoneService } from '../src/runtime/cf/mdns/mdns.ts';

// ── DNS messages ─────────────────────────────────────────────────

test('DNS: a response with PTR, SRV, TXT, A and AAAA back as it went, names compressed', () => {
  const m: Message = {
    id: 0, response: true, authoritative: true, questions: [],
    answers: [
      { name: '_http._tcp.local', type: TYPE.PTR, ttl: 4500, data: 'Kitchen panel._http._tcp.local' },
      { name: 'Kitchen panel._http._tcp.local', type: TYPE.SRV, ttl: 120, flush: true, data: { priority: 0, weight: 0, port: 8900, target: 'iva-ab12.local' } },
      { name: 'Kitchen panel._http._tcp.local', type: TYPE.TXT, ttl: 4500, flush: true, data: ['path=/', 'v=1'] },
    ],
    authorities: [],
    additionals: [
      { name: 'iva-ab12.local', type: TYPE.A, ttl: 120, flush: true, data: '10.0.0.3' },
      { name: 'iva-ab12.local', type: TYPE.AAAA, ttl: 120, flush: true, data: 'fe80::1:2' },
    ],
  };
  const bytes = encode(m);
  const back = decode(bytes);
  // (a record not flushing: flush false, read back)
  assert.deepEqual(back, { ...m, answers: m.answers.map((r) => ({ flush: false, ...r })) });
  // the names after the first: pointers (much shorter than written out)
  const plain = 2 * 'Kitchen panel._http._tcp.local'.length + 3 * 'iva-ab12.local'.length + '_http._tcp.local'.length;
  assert.ok(bytes.length < plain + 120, `${bytes.length} bytes`);
});

test('DNS: a question asking for a unicast answer (QU); a dot in an instance name kept as one label', () => {
  const m: Message = { id: 7, response: false, questions: [{ name: 'Room 1\\.5._http._tcp.local', type: TYPE.ANY, unicast: true }], answers: [], authorities: [], additionals: [] };
  const back = decode(encode(m));
  assert.deepEqual(back.questions, m.questions);
  assert.deepEqual(labels(back.questions[0].name), ['Room 1.5', '_http', '_tcp', 'local']);
  assert.equal(joinLabels(['Room 1.5', '_http']), 'Room 1\\.5._http');
});

test('DNS: a message cut short or with pointers in a loop is no message (throws)', () => {
  const good = encode({ id: 0, response: true, questions: [], answers: [{ name: 'a.local', type: TYPE.A, ttl: 1, data: '1.2.3.4' }], authorities: [], additionals: [] });
  assert.throws(() => decode(good.slice(0, good.length - 2)));
  // a name that points at itself
  const loop = Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0xc0, 12, 0, 1, 0, 1]);
  assert.throws(() => decode(loop), /loop/);
});

test("DNS-SD: a TXT record's key=value strings as data; a key alone is ''; the first of a key wins", () => {
  assert.deepEqual(txtData(['path=/', 'flag', 'PATH=/x', '', 'eq=a=b']), { path: '/', flag: '', eq: 'a=b' });
});

test('a service type as a script writes it, as the wire has it: "_http._tcp." is _http._tcp.local', () => {
  assert.equal(fqType('_http._tcp.'), '_http._tcp.local');
  assert.equal(fqType('_http._tcp'), '_http._tcp.local');
  assert.equal(fqType('_http._tcp.local.'), '_http._tcp.local');
});

// ── the engine, on a network of its own ─────────────────────────

/** UDP sockets on a pretend network: multicast to 224.0.0.251:5353 reaches every socket joined there (its sender too) */
class FakeNet {
  sockets = new Set<FakeUdp>();
  next = 40000;
  /** devices whose 5353 something else holds */
  taken = new Set<string>();
  sent: { from: string; to: string; m: Message }[] = [];
  deliver(from: FakeUdp, bytes: Uint8Array, port: number, address: string) {
    this.sent.push({ from: `${from.address}:${from.port}`, to: `${address}:${port}`, m: decode(bytes) });
    for (const s of this.sockets) {
      const hit = address === '224.0.0.251' ? s.joined && s.port === port : s.address === address && s.port === port;
      if (hit) queueMicrotask(() => s.emit('message', bytes, { address: from.address, port: from.port }));
    }
  }
}
class FakeUdp extends EventEmitter {
  port = 0;
  joined = false;
  constructor(private net: FakeNet, public address: string) {
    super();
  }
  bind(port: number, cb?: () => void) {
    if (port === 5353 && this.net.taken.has(this.address)) {
      queueMicrotask(() => this.emit('error', Object.assign(new Error('Address already in use'), { code: 'EADDRINUSE' })));
      return this;
    }
    this.port = port || this.net.next++;
    this.net.sockets.add(this);
    queueMicrotask(() => cb?.());
    return this;
  }
  addMembership() {
    this.joined = true;
  }
  setMulticastTTL() {}
  setMulticastLoopback() {}
  send(b: Uint8Array, off: number, len: number, port: number, address: string) {
    this.net.deliver(this, b.subarray(off, off + len), port, address);
  }
  close() {
    this.net.sockets.delete(this);
    return this;
  }
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
/** time passes (timers, and what they set off) */
const pass = async (ms: number) => {
  for (let t = 0; t < ms; t += 50) {
    mock.timers.tick(50);
    await settle();
  }
};

function device(net: FakeNet, address: string, name: string, id: string) {
  const logs: string[] = [];
  const engine = new Mdns({
    network: () => ({ ipv4address: address, ipv4netmask: '255.255.255.0' }),
    deviceName: () => name,
    deviceId: () => id,
    createSocket: () => new FakeUdp(net, address) as any,
    log: (m) => logs.push(m),
  });
  return { engine, logs };
}

/** what a lookup's callback has been told, in order */
function watcher() {
  const calls: { added: FoundService[]; removed: GoneService[]; error: string | null }[] = [];
  return { calls, cb: (added: FoundService[], removed: GoneService[], error: string | null) => calls.push({ added, removed, error }) };
}

test("Bonjour: one device publishes, another looks up - found with its addresses, host, port and TXT data; a goodbye when it stops: removed", async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    const a = device(net, '10.0.0.2', 'Hall panel', 'aa11');
    const b = device(net, '10.0.0.3', 'Kitchen panel', 'bb22');
    const published: unknown[] = [];
    void b.engine.publish('_http._tcp.', '', 8900, { path: '/', v: 1 }, (...x) => published.push(x));
    await pass(800);
    assert.deepEqual(published, [['_http._tcp.', '', 8900, true, null]]);
    const w = watcher();
    void a.engine.lookup('_http._tcp.', '', w.cb);
    await pass(500);
    assert.deepEqual(w.calls, [{
      added: [{ name: 'Kitchen panel', type: '_http._tcp.', addresses: ['10.0.0.3'], hostname: 'iva-bb22.local', port: 8900, data: { path: '/', v: '1' } }],
      removed: [], error: null,
    }]);
    assert.ok(b.logs.some((l) => /published "Kitchen panel"/.test(l)), b.logs.join('\n'));
    assert.ok(a.logs.some((l) => /found "Kitchen panel" .* at iva-bb22\.local:8900 \[10\.0\.0\.3\]/.test(l)), a.logs.join('\n'));
    // stopped: a goodbye - removed by name and type; the publisher's callback once more (not published, no error)
    b.engine.stopPublishing('_http._tcp.', '', 8900);
    await pass(100);
    assert.deepEqual(w.calls[1], { added: [], removed: [{ name: 'Kitchen panel', type: '_http._tcp.' }], error: null });
    assert.deepEqual(published[1], ['_http._tcp.', '', 8900, false, null]);
    a.engine.dispose();
    b.engine.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('Bonjour: a lookup started after a service is up finds it too; one for another name finds nothing; its own services are found (loopback)', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    const a = device(net, '10.0.0.2', 'Hall panel', 'aa11');
    const b = device(net, '10.0.0.3', 'Kitchen panel', 'bb22');
    void b.engine.publish('_iva._tcp.', 'Kitchen', 8900, null);
    void a.engine.publish('_iva._tcp.', 'Hall', 8900, null);
    await pass(800);
    const all = watcher();
    const named = watcher();
    const other = watcher();
    void a.engine.lookup('_iva._tcp.', '', all.cb);
    void a.engine.lookup('_iva._tcp.', 'Kitchen', named.cb);
    void a.engine.lookup('_iva._tcp.', 'Nowhere', other.cb);
    await pass(500);
    const names = all.calls.flatMap((c) => c.added.map((s) => s.name)).sort();
    assert.deepEqual(names, ['Hall', 'Kitchen']);
    assert.deepEqual(named.calls.flatMap((c) => c.added.map((s) => s.name)), ['Kitchen']);
    assert.deepEqual(other.calls, []);
    a.engine.dispose();
    b.engine.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('Bonjour: the same type, name and port published twice: "Duplicate service"; a name someone has already: a conflict, not published', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    const a = device(net, '10.0.0.2', 'Hall panel', 'aa11');
    const b = device(net, '10.0.0.3', 'Kitchen panel', 'bb22');
    const got: unknown[] = [];
    void a.engine.publish('_http._tcp.', 'Panel', 80, null, (...x) => got.push(x));
    await pass(800);
    void a.engine.publish('_http._tcp.', 'Panel', 80, null, (...x) => got.push(x));
    await settle();
    assert.deepEqual(got, [['_http._tcp.', 'Panel', 80, true, null], ['_http._tcp.', 'Panel', 80, false, 'Duplicate service']]);
    const theirs: unknown[] = [];
    void b.engine.publish('_http._tcp.', 'Panel', 8080, null, (...x) => theirs.push(x));
    await pass(800);
    assert.equal(theirs.length, 1);
    assert.deepEqual((theirs[0] as unknown[]).slice(0, 4), ['_http._tcp.', 'Panel', 8080, false]);
    assert.match(String((theirs[0] as unknown[])[4]), /Name conflict/);
    a.engine.dispose();
    b.engine.dispose();
  } finally {
    mock.timers.reset();
  }
});

test("Bonjour: a service's addresses - IPv4 first, those off our subnet left out (unless that's all there is), IPv6 after", async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    const a = device(net, '10.0.0.2', 'Hall panel', 'aa11');
    const w = watcher();
    void a.engine.lookup('_ssh._tcp.', '', w.cb);
    await pass(100);
    // a host with three addresses answers (a raw responder on the network)
    const raw = new FakeUdp(net, '10.0.0.9');
    raw.bind(5353);
    raw.addMembership();
    await settle();
    const answer = encode({
      id: 0, response: true, authoritative: true, questions: [],
      answers: [{ name: '_ssh._tcp.local', type: TYPE.PTR, ttl: 4500, data: 'nas._ssh._tcp.local' }],
      authorities: [],
      additionals: [
        { name: 'nas._ssh._tcp.local', type: TYPE.SRV, ttl: 120, data: { priority: 0, weight: 0, port: 22, target: 'nas.local' } },
        { name: 'nas.local', type: TYPE.AAAA, ttl: 120, data: 'fe80::9' },
        { name: 'nas.local', type: TYPE.A, ttl: 120, data: '192.168.5.9' },
        { name: 'nas.local', type: TYPE.A, ttl: 120, data: '10.0.0.9' },
      ],
    });
    raw.send(answer, 0, answer.length, 5353, '224.0.0.251');
    await pass(100);
    assert.deepEqual(w.calls[0].added[0].addresses, ['10.0.0.9', 'fe80::9']);
    assert.deepEqual(w.calls[0].added[0].data, {});
    a.engine.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('Bonjour: asleep, our services say goodbye (removed elsewhere) - awake, they are announced again (found again)', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    const a = device(net, '10.0.0.2', 'Hall panel', 'aa11');
    const b = device(net, '10.0.0.3', 'Kitchen panel', 'bb22');
    const published: unknown[] = [];
    void b.engine.publish('_http._tcp.', '', 8900, null, (...x) => published.push(x));
    await pass(800);
    const w = watcher();
    void a.engine.lookup('_http._tcp.', '', w.cb);
    await pass(500);
    assert.equal(w.calls.length, 1);
    b.engine.suspend();
    await pass(100);
    assert.deepEqual(w.calls[1].removed, [{ name: 'Kitchen panel', type: '_http._tcp.' }]);
    void b.engine.resume();
    await pass(1500);
    assert.deepEqual(w.calls[2].added.map((s) => s.name), ['Kitchen panel']);
    // back as it was: the publisher's callback not told again
    assert.equal(published.length, 1);
    a.engine.dispose();
    b.engine.dispose();
  } finally {
    mock.timers.reset();
  }
});

test("Bonjour: the looking device asleep a while - awake, a service that didn't answer again within a few seconds is gone", async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    const a = device(net, '10.0.0.2', 'Hall panel', 'aa11');
    const b = device(net, '10.0.0.3', 'Kitchen panel', 'bb22');
    void b.engine.publish('_http._tcp.', '', 8900, null);
    await pass(800);
    const w = watcher();
    void a.engine.lookup('_http._tcp.', '', w.cb);
    await pass(500);
    a.engine.suspend();
    // meanwhile the other device went away without a goodbye (switched off)
    b.engine.dispose();
    for (const s of [...net.sockets]) if (s.address === '10.0.0.3') s.close();
    void a.engine.resume();
    await pass(6000);
    assert.deepEqual(w.calls.at(-1)!.removed, [{ name: 'Kitchen panel', type: '_http._tcp.' }]);
    a.engine.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('Bonjour: 5353 taken by another program - lookups ask from a port of their own (answered by unicast); publishing says why it cannot', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    net.taken.add('10.0.0.2');
    const a = device(net, '10.0.0.2', 'Hall panel', 'aa11');
    const b = device(net, '10.0.0.3', 'Kitchen panel', 'bb22');
    void b.engine.publish('_http._tcp.', '', 8900, null);
    await pass(800);
    const w = watcher();
    void a.engine.lookup('_http._tcp.', '', w.cb);
    await pass(500);
    assert.deepEqual(w.calls[0].added.map((s) => s.name), ['Kitchen panel']);
    // the answer came straight to its port
    assert.ok(net.sent.some((x) => x.from.startsWith('10.0.0.3:') && /^10\.0\.0\.2:4\d{4}$/.test(x.to) && x.m.response));
    const got: unknown[] = [];
    void a.engine.publish('_http._tcp.', 'Hall', 80, null, (...x) => got.push(x));
    await settle();
    assert.deepEqual((got[0] as unknown[]).slice(0, 4), ['_http._tcp.', 'Hall', 80, false]);
    assert.match(String((got[0] as unknown[])[4]), /5353 is taken/);
    a.engine.dispose();
    b.engine.dispose();
  } finally {
    mock.timers.reset();
  }
});

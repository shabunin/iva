import { ui, t, narrow } from '../ui.js';
import Shell, { enter } from '../components/Shell.jsx';

/**
 * The probe (scripts/probe.js): what this panel can do for a Matter controller - its JavaScript engine, Web
 * Crypto, UDP systems carrying every byte value, persisted tokens, a 1.5 MB script. Each check a line; the
 * same lines go to CF.log (iva serve's console).
 */
const font = { font: t.font };
const fs = narrow ? 13 : 15;

const lines = (c, title, join, h) => {
  const m = narrow ? 14 : 24;
  const top = title ? 52 : 14;
  return (
    <ui.Card title={title} {...c}>
      <Text x={m} y={top} w={c.w - 2 * m} h={(h ?? c.h) - top - m} join={join} wrap valign="top" {...font} fontSize={fs} />
    </ui.Card>
  );
};

// a script of 1.5 MB (made here, not kept in the repo): does it load?
const filler = `// ${'0123456789abcdef'.repeat(5)}\n`;
const bigScript = `var ProbeBig = { size: ${filler.length * 18000 + 60} };\n${filler.repeat(18000)}`;

/** the probe's systems and script: once */
const setup = (
  <>
    {/* the echo: a server (its socket on 5541) answering to the client's port; the client (on 5542) sending to it.
        127.0.0.2 is the device itself through a real socket (127.0.0.1 would be an in-process loopback system) */}
    <System name="ProbeEcho" protocol="udp" host="127.0.0.2" port={5542} localPort={5541} accept>
      <Feedback name="frame" regex="(?s)(.+)" />
    </System>
    <System name="ProbeUdp" protocol="udp" host="127.0.0.2" port={5541} localPort={5542}>
      <Feedback name="frame" regex="(?s)(.+)" />
    </System>
    {/* the same bytes with GUI Designer's iso-8859-1 encoding, to itself */}
    <System name="ProbeLatin" protocol="udp" host="127.0.0.2" port={5544} localPort={5544} textEncoding="iso-8859-1">
      <Feedback name="frame" regex="(?s)(.+)" />
    </System>
    {/* IPv6: to itself */}
    <System name="ProbeV6" protocol="udp" host="::1" port={5545} localPort={5545}>
      <Feedback name="frame" regex="(?s)(.+)" />
    </System>
    <Token name="probe4k" persist />
    <Token name="probe16k" persist />
    <Token name="probe64k" persist />
    <Token name="probeJson" persist />
    <Token name="probeNoBr" persist />
    <Script src="../scripts/probe.js" />
    <Script name="probe-big.js" code={bigScript} />
    <OnStart js="MatterProbe.start();" joins={[s('probeEngine'), s('probeCrypto'), s('probeUDP'), s('probeTokens'), s('probeScript'), s('probeSummary')]} />
  </>
);

const L = ui.grid({
  summary: [1248, 110],
  engine: [600, 190],
  crypto: [632, 320],
  udp: [600, 340],
  tokens: [632, 230],
}, [['summary'], ['engine', 'crypto'], ['udp', 'tokens']]);

export default (
  <Page name="Probe" bg={t.page} transition={enter}>
    <ui.ScrollArea>
      <ui.Card {...L.summary}>
        <Text x={narrow ? 14 : 24} y={14} w={L.summary.w - (narrow ? 28 : 48) - 150} h={L.summary.h - 28} join={s('probeSummary')} text="Running…" wrap valign="top" {...font} fontSize={narrow ? 14 : 17} />
        <ui.IconButton x={L.summary.w - 24 - 130} y={L.summary.h - 14 - 40} w={130} h={40} icon="rotate" text="Run again" js="MatterProbe.run()" />
      </ui.Card>
      {lines(L.engine, 'Engine', s('probeEngine'))}
      {lines(L.crypto, 'Web Crypto', s('probeCrypto'))}
      {lines(L.udp, 'UDP systems', s('probeUDP'))}
      <ui.Card title="Tokens · script" {...L.tokens}>
        <Text x={narrow ? 14 : 24} y={52} w={L.tokens.w - (narrow ? 28 : 48)} h={L.tokens.h - 52 - 36} join={s('probeTokens')} wrap valign="top" {...font} fontSize={fs} />
        <Text x={narrow ? 14 : 24} y={L.tokens.h - 36} w={L.tokens.w - (narrow ? 28 : 48)} h={24} join={s('probeScript')} {...font} fontSize={fs} />
      </ui.Card>
    </ui.ScrollArea>
    {setup}
    <Shell section="Probe" />
  </Page>
);

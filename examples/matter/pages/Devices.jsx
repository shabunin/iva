import { ui, t, narrow } from '../ui.js';
import Shell, { enter, tab } from '../components/Shell.jsx';

/**
 * The Matter devices around: what CF.startLookup finds - operational ones (_matter._tcp., already in a
 * fabric) and commissionable ones (_matterc._udp., waiting for a setup code) - with the UDP system (slot)
 * the driver gave each. The rows come as JSON in the `matterFound` join.
 */
const table = (c, title) => {
  const m = narrow ? 14 : 28;
  const top = title ? 56 : 14;
  return (
    <ui.Card title={title} {...c}>
      <ui.DataTable x={m} y={top} w={c.w - 2 * m} h={c.h - top - m} rowH={narrow ? 34 : 38} fontSize={narrow ? 13 : 15} source={s('matterFound')} keyField="name" search={false}
                    words={{ rows: 'devices', empty: 'Looking… (Bonjour: the phone on the Wi-Fi, no VPN)' }} columns={narrow ? [
                      { key: 'name', title: 'Device' },
                      { key: 'kind', title: 'Kind', w: 110 },
                      { key: 'slot', title: 'Slot', w: 64 },
                    ] : [
                      { key: 'name', title: 'Device', w: 300 },
                      { key: 'kind', title: 'Kind', w: 150 },
                      { key: 'where', title: 'Address', w: 200 },
                      { key: 'info', title: 'TXT' },
                      { key: 'slot', title: 'Slot', w: 90 },
                    ]} />
    </ui.Card>
  );
};

const L = ui.grid({ devices: { w: 1248, h: 400, grow: true } }, [['devices']]);
const A = ui.screenArea;

export default narrow ? (
  <ui.Screens name="Devices" transition={enter} tabTransition={tab} shell={<Shell section="Devices" />} screens={[
    { title: 'Found', content: table(A) },
  ]} />
) : (
  <Page name="Devices" bg={t.page} transition={enter}>
    {table(L.devices, 'Found with Bonjour')}
    <Shell section="Devices" />
  </Page>
);

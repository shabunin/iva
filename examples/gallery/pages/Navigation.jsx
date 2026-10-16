import { ui, t, narrow } from '../ui.js';
import Shell, { enter, tab } from '../components/Shell.jsx';

const note = (y, text, w = 360) => <Text x={28} y={y} w={w} h={52} text={text} color={t.muted} font={t.font} fontSize={16} wrap />;

// the cards, each laid out in its cell
const menu = (c) => (
  <ui.Card title="Header & SideMenu" {...c}>
    {note(56, 'The bar on top: the menu, the title, breadcrumbs home, the look switch and a clock. The menu marks the page you are on.', c.w - 44)}
    <ui.IconButton x={28} y={150} w={220} icon="bars" text="Open menu" js="CF.setJoin(Joins.d.menu, 1)" />
  </ui.Card>
);
const confirm = (c) => (
  <ui.Card title="ConfirmDialog" {...c}>
    {note(56, 'A dialog over a dimmed page, shown by a join; its buttons close it (OK can run a command).', c.w - 44)}
    <ui.IconButton x={28} y={150} w={220} icon="trash" text="Delete…" tone="danger" js="CF.setJoin(Joins.d.confirm, 1)" />
  </ui.Card>
);
const loader = (c) => (
  <ui.Card title="Loader" {...c}>
    {note(56, 'A busy overlay while a join is on: taps stay on it. Here: for two seconds.', c.w - 44)}
    <ui.IconButton x={28} y={150} w={220} icon="spinner" text="Busy…" js="CF.setJoin(Joins.d.busy, 1); setTimeout(function () { CF.setJoin(Joins.d.busy, 0); }, 2000);" />
  </ui.Card>
);
const crumbs = (c) => (
  <ui.Card title="Breadcrumbs" {...c}>
    <ui.Breadcrumbs x={28} y={56} items={[{ label: 'Home', page: 'Overview' }, { label: 'Floor 1' }, 'Kitchen']} />
    <ui.Breadcrumbs x={28} y={110} back items={[{ label: 'Lists', page: 'Lists' }, 'Living room']} fontSize={18} />
  </ui.Card>
);
const navCard = (c) => (
  <ui.Card title="NavCard" {...c}>
    <ui.NavCard x={28} y={56} w={c.w - 56} h={140} icon="sliders" title="Controls" text="Go to the section" page="Controls" />
  </ui.Card>
);
const pager = (c, title) => {
  const top = title ? 48 : 14;
  const pw = c.w - 56;
  const ph = c.h - top - 60;
  const stats = pw < 700;
  return (
    <ui.Card title={title} {...c}>
      {note(top, 'Pages in one place: swipe, or tap a dot. The page shown is in an analog join.', c.w - 68)}
      <ui.Pager x={28} y={top + 44} w={pw} h={ph} join="page">
        <Group>
          <ui.SceneBar y={Math.min(40, ph - 190)} w={pw} h={150} scenes={[{ title: 'Morning', icon: 'sun' }, { title: 'Movie', icon: 'film' }, { title: 'Night', icon: 'moon' }]} join="scene" />
        </Group>
        <Group>
          <ui.Stat x={stats ? 20 : 40} y={stats ? 20 : 60} w={300} icon="temperature-half" label="Inside" value="22.4 °C" />
          <ui.Stat x={stats ? 20 : 400} y={stats ? 120 : 60} w={300} icon="droplet" label="Humidity" value="46 %" />
        </Group>
        <Group>
          <Text x={stats ? 20 : 40} y={stats ? 30 : 70} w={pw - (stats ? 40 : 80)} h={60} text="The third page" font={t.font} fontSize={34} />
          <Text x={stats ? 20 : 40} y={stats ? 90 : 130} w={pw - (stats ? 40 : 80)} h={stats ? 64 : 40} wrap text="Any elements: a page is a subpage of its own" color={t.muted} font={t.font} fontSize={19} />
        </Group>
      </ui.Pager>
    </ui.Card>
  );
};
const dialogs = (
  <>
    <ui.ConfirmDialog join="confirm" title="Delete the scene?" message="It can't be undone." confirmText="Delete" danger />
    <ui.Loader join="busy" text="Working…" />
  </>
);

// the pager takes the height there is
const L = ui.grid({
  menu: [404, 240], confirm: [404, 240], loader: [408, 240],
  crumbs: [404, 190], navCard: [404, 214],
  pager: { w: 828, h: 420, grow: true },
}, [['menu', 'confirm', 'loader'], [['crumbs', 'navCard'], 'pager']]);
// a phone: the cards of a screen one under another (they scroll)
const D = ui.grid({ menu: [404, 220], confirm: [404, 220], loader: [404, 220] }, [['menu'], ['confirm'], ['loader']], ui.screenArea);
const C = ui.grid({ crumbs: [404, 190], navCard: [404, 214] }, [['crumbs'], ['navCard']], ui.screenArea);

// a phone: a screen each - the pager's pages are subpages, which a list (a ScrollArea) doesn't show on the device
export default narrow ? (
  <ui.Screens name="Navigation" transition={enter} tabTransition={tab} shell={<Shell section="Navigation & feedback" />} screens={[
    { title: 'Dialogs', content: <>{menu(D.menu)}{confirm(D.confirm)}{loader(D.loader)}{dialogs}</> },
    { title: 'Breadcrumbs', content: <>{crumbs(C.crumbs)}{navCard(C.navCard)}</> },
    { title: 'Pager', content: pager(ui.screenArea) },
  ]} />
) : (
  <Page name="Navigation" bg={t.page} transition={enter}>
    {menu(L.menu)}
    {confirm(L.confirm)}
    {loader(L.loader)}
    {crumbs(L.crumbs)}
    {navCard(L.navCard)}
    {pager(L.pager, 'Pager')}
    <Shell section="Navigation & feedback" />
    {dialogs}
  </Page>
);

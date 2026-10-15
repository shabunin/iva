import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const note = (y, text, w = 360) => <Text x={28} y={y} w={w} h={52} text={text} color={t.muted} font={t.font} fontSize={16} wrap />;

export default (
  <Page name="Navigation" bg={t.page}>
    <ui.Card title="Header & SideMenu" x={16} y={88} w={404} h={240}>
      {note(56, 'The bar on top: the menu, the title, breadcrumbs home, the look switch and a clock. The menu marks the page you are on.')}
      <ui.IconButton x={28} y={150} w={220} icon="bars" text="Open menu" js="CF.setJoin(Joins.d.menu, 1)" />
    </ui.Card>
    <ui.Card title="ConfirmDialog" x={436} y={88} w={404} h={240}>
      {note(56, 'A dialog over a dimmed page, shown by a join; its buttons close it (OK can run a command).')}
      <ui.IconButton x={28} y={150} w={220} icon="trash" text="Delete…" tone="danger" js="CF.setJoin(Joins.d.confirm, 1)" />
    </ui.Card>
    <ui.Card title="Loader" x={856} y={88} w={408} h={240}>
      {note(56, 'A busy overlay while a join is on: taps stay on it. Here: for two seconds.')}
      <ui.IconButton x={28} y={150} w={220} icon="spinner" text="Busy…" js="CF.setJoin(Joins.d.busy, 1); setTimeout(function () { CF.setJoin(Joins.d.busy, 0); }, 2000);" />
    </ui.Card>

    <ui.Card title="Breadcrumbs" x={16} y={344} w={404} h={190}>
      <ui.Breadcrumbs x={28} y={56} items={[{ label: 'Home', page: 'Overview' }, { label: 'Floor 1' }, 'Kitchen']} />
      <ui.Breadcrumbs x={28} y={110} back items={[{ label: 'Lists', page: 'Lists' }, 'Living room']} fontSize={18} />
    </ui.Card>
    <ui.Card title="NavCard" x={16} y={550} w={404} h={214}>
      <ui.NavCard x={28} y={56} w={348} h={140} icon="sliders" title="Controls" text="Go to the section" page="Controls" />
    </ui.Card>

    <ui.Card title="Pager" x={436} y={344} w={828} h={420}>
      {note(48, 'Pages in one place: swipe, or tap a dot. The page shown is in an analog join.', 760)}
      <ui.Pager x={28} y={92} w={772} h={312} join="page">
        <Group>
          <ui.SceneBar y={40} w={772} h={150} scenes={[{ title: 'Morning', icon: 'sun' }, { title: 'Movie', icon: 'film' }, { title: 'Night', icon: 'moon' }]} join="scene" />
        </Group>
        <Group>
          <ui.Stat x={40} y={60} w={300} icon="temperature-half" label="Inside" value="22.4 °C" />
          <ui.Stat x={400} y={60} w={300} icon="droplet" label="Humidity" value="46 %" />
        </Group>
        <Group>
          <Text x={40} y={70} w={700} h={60} text="The third page" font={t.font} fontSize={34} />
          <Text x={40} y={130} w={700} h={40} text="Any elements: a page is a subpage of its own" color={t.muted} font={t.font} fontSize={19} />
        </Group>
      </ui.Pager>
    </ui.Card>
    <Shell section="Navigation & feedback" />
    <ui.ConfirmDialog join="confirm" title="Delete the scene?" message="It can't be undone." confirmText="Delete" danger />
    <ui.Loader join="busy" text="Working…" />
  </Page>
);

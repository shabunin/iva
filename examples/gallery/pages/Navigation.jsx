import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const note = (y, text) => <Text x={28} y={y} w={560} h={52} text={text} color={t.muted} font={t.font} fontSize={16} wrap />;

export default (
  <Page name="Navigation" bg={t.page}>
    <ui.Card title="Header & SideMenu" x={16} y={88} w={612} h={240}>
      {note(56, 'The bar on top: the menu button, the title, breadcrumbs back home and a clock. The menu slides in from the left and marks the page you are on.')}
      <ui.IconButton x={28} y={140} w={220} icon="bars" text="Open menu" js="CF.setJoin(Joins.d.menu, 1)" />
    </ui.Card>
    <ui.Card title="ConfirmDialog" x={652} y={88} w={612} h={240}>
      {note(56, 'A dialog over a dimmed page, shown by a join; its buttons close it (OK can run a command).')}
      <ui.IconButton x={28} y={140} w={220} icon="trash" text="Delete…" tone="danger" js="CF.setJoin(Joins.d.confirm, 1)" />
    </ui.Card>
    <ui.Card title="NavCard" x={16} y={344} w={1248} h={260}>
      <ui.NavCard x={28} y={60} w={380} h={170} icon="hand-pointer" title="Buttons & status" text="Go to the section" page="Buttons" />
      <ui.NavCard x={428} y={60} w={380} h={170} icon="sliders" title="Controls" text="Go to the section" page="Controls" />
    </ui.Card>
    <Shell section="Navigation & feedback" />
    <ui.ConfirmDialog join="confirm" title="Delete the scene?" message="It can't be undone." confirmText="Delete" danger />
  </Page>
);

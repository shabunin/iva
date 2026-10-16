import { ui, t, narrow } from '../ui.js';
import Shell, { enter, tab } from '../components/Shell.jsx';

const note = (x, y, w, text) => <Text x={x} y={y} w={w} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;

const sources = [
  { id: 'tv', label: 'TV', icon: 'tv' },
  { id: 'radio', label: 'Radio', icon: 'radio' },
  { id: 'spotify', label: 'Spotify', icon: 'spotify' },
  { id: 'vinyl', label: 'Vinyl', icon: 'record-vinyl' },
  { id: 'airplay', label: 'AirPlay', icon: 'tower-broadcast' },
];
// what plays where: a serial join per room (a driver would route the audio from it)
const rooms = [
  { id: 'living', label: 'Living room', icon: 'couch', value: s('zoneLiving') },
  { id: 'kitchen', label: 'Kitchen', icon: 'kitchen-set', value: s('zoneKitchen') },
  { id: 'terrace', label: 'Terrace', icon: 'umbrella-beach', value: s('zoneTerrace') },
  { id: 'bedroom', label: 'Bedroom', icon: 'bed', value: s('zoneBedroom'), accept: ['radio', 'spotify'] },
];

const how = "As CommandFusion's DragDropManager: a pan gesture on a layer over the area finds the item under the finger " +
  'and moves it with CF.setProperties; where everything is comes from CF.getProperties when a drag starts, ' +
  'so the area can sit in a card, a group or a subpage. A target lights up through its join; a drop writes the ' +
  "item's label into the target's serial join and runs onDrop (with item and target); the item goes back to " +
  'its place, like a palette. Items are buttons, drawn after the targets: on top of them while dragged.';
const onDrop = "CF.setJoin(Joins.s.ddLast, item + ' → ' + target)";

const L = ui.grid({
  area: [1248, 400],
  how: [1248, 280],
}, [['area'], ['how']]);
const A = ui.screenArea;
// a phone: the sources in a row, small; the rooms two by two
const pw = A.w - 40;
const ph = 262;

// a phone: a screen each - a gesture in a list (a ScrollArea) doesn't fire on the device
export default narrow ? (
  <ui.Screens name="DragDrop" transition={enter} tabTransition={tab} shell={<Shell section="Drag & drop" />} screens={[
    {
      title: 'Drag & drop',
      content: (
        <ui.Card {...A}>
          <ui.DragDrop x={20} y={16} w={pw} h={ph} name="audio" items={sources} targets={rooms} placeholder="Nothing playing"
                       itemW={68} itemH={64} gap={10} targetW={Math.floor((pw - 10) / 2)} targetH={80} onDrop={onDrop} />
          <Text x={20} y={ph + 24} w={110} h={28} text="Last drop" color={t.muted} font={t.font} fontSize={16} />
          <Text x={130} y={ph + 24} w={A.w - 150} h={28} join={s('ddLast')} font={t.font} fontSize={16} />
        </ui.Card>
      ),
    },
    {
      title: 'How it works',
      content: (
        <ui.Card {...A}>
          <Text x={20} y={16} w={A.w - 40} h={A.h - 32} wrap valign="top" color={t.muted} font={t.font} fontSize={15}
                text={`Drag a source onto a room: the room lights up while it is over it, and plays it once dropped. The bedroom takes only Radio and Spotify (accept).\n\n${how}`} />
        </ui.Card>
      ),
    },
  ]} />
) : (
  <Page name="DragDrop" bg={t.page} transition={enter}>
    <ui.Card title="DragDrop · a source onto a room" {...L.area}>
      <ui.DragDrop x={28} y={56} w={L.area.w - 56} h={240} name="audio" items={sources} targets={rooms} placeholder="Nothing playing" targetW={230}
                   onDrop={onDrop} />
      {note(28, 310, L.area.w - 56, 'Drag a source onto a room: the room lights up while it is over it, and plays it once dropped. The bedroom takes only Radio and Spotify (accept).')}
      <Text x={28} y={344} w={160} h={32} text="Last drop" color={t.muted} font={t.font} fontSize={18} />
      <Text x={188} y={344} w={L.area.w - 216} h={32} join={s('ddLast')} font={t.font} fontSize={18} />
    </ui.Card>

    <ui.Card title="How it works" {...L.how}>
      <Text x={28} y={56} w={L.how.w - 56} h={L.how.h - 80} wrap valign="top" color={t.muted} font={t.font} fontSize={16} text={how} />
    </ui.Card>

    <Shell section="Drag & drop" />
  </Page>
);

import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

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

export default (
  <Page name="DragDrop" bg={t.page}>
    <ui.Card title="DragDrop · a source onto a room" x={16} y={88} w={1248} h={400}>
      <ui.DragDrop x={28} y={56} w={1192} h={240} name="audio" items={sources} targets={rooms} placeholder="Nothing playing"
                   onDrop="CF.setJoin(Joins.s.ddLast, item + ' → ' + target)" />
      {note(28, 310, 1192, 'Drag a source onto a room: the room lights up while it is over it, and plays it once dropped. The bedroom takes only Radio and Spotify (accept).')}
      <Text x={28} y={344} w={160} h={32} text="Last drop" color={t.muted} font={t.font} fontSize={18} />
      <Text x={188} y={344} w={600} h={32} join={s('ddLast')} font={t.font} fontSize={18} />
    </ui.Card>

    <ui.Card title="How it works" x={16} y={504} w={1248} h={280}>
      {note(28, 56, 1192, 'As CommandFusion\'s DragDropManager: a pan gesture on a layer over the area finds the item under the finger')}
      {note(28, 84, 1192, 'and moves it with CF.setProperties; where everything is comes from CF.getProperties when a drag starts,')}
      {note(28, 112, 1192, 'so the area can sit in a card, a group or a subpage. A target lights up through its join; a drop writes the')}
      {note(28, 140, 1192, "item's label into the target's serial join and runs onDrop (with item and target); the item goes back to")}
      {note(28, 168, 1192, 'its place, like a palette. Items are buttons, drawn after the targets: on top of them while dragged.')}
    </ui.Card>

    <Shell section="Drag & drop" />
  </Page>
);

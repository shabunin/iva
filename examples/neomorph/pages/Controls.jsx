import { neu, t, W, phone, P } from '../ui.js';
import Shell, { fade } from '../components/Shell.jsx';
import Stack from '../components/Stack.jsx';

const bands = [
  { label: '60 Hz', value: 4 },
  { label: '250 Hz', value: 2 },
  { label: '1 kHz', value: -1 },
  { label: '4 kHz', value: 3 },
  { label: '16 kHz', value: 6 },
];

/** switches: the whole row toggles; the knob slides across */
const switches = (w) => (
  <>
    <neu.Toggle x={P} y={62} w={w - 2 * P} label="Wi-Fi" sub="Home-5G" join="sw_wifi" value />
    <neu.Toggle x={P} y={124} w={w - 2 * P} label="Bluetooth" sub="2 devices" join="sw_bt" />
    <neu.Toggle x={P} y={186} w={w - 2 * P} label="Night mode" sub="Warmer after sunset" join="sw_night" value />
    <neu.Toggle x={P} y={248} w={w - 2 * P} label="Do not disturb" sub="Until 7:00" join="sw_dnd" />
  </>
);

/** sliders: the value above, the groove lit up to the thumb */
const sliders = (w) => (
  <>
    <neu.Slider x={P} y={62} w={w - 2 * P} label="Volume" join="volume" value={64} />
    <neu.Slider x={P} y={144} w={w - 2 * P} label="Brightness" join="brightness" value={80} />
    <neu.Slider x={P} y={226} w={w - 2 * P} label="Colour temperature" join="kelvin" min={2700} max={6500} value={4000} unit=" K" />
  </>
);

/** faders: an equaliser, -12..+12 dB, spread across */
const faders = (w) => {
  const slot = (w - 2 * P) / bands.length;
  return bands.map((b, i) => (
    <neu.Fader x={Math.round(P + i * slot + (slot - 30) / 2)} y={62} h={186} label={b.label} join={`eq_${i}`} min={-12} max={12} value={b.value} unit=" dB" />
  ));
};

/** one of several: a pill slides to the option chosen; a stepper */
const segmented = (w) => (
  <>
    <neu.Segmented x={P} y={62} w={w - 2 * P} options={['Day', 'Week', 'Month', 'Year']} join="range" value={1} />
    <neu.Segmented x={P} y={136} w={w - 2 * P} options={['Auto', 'Cool', 'Heat', 'Fan']} join="mode" />
    <neu.Text x={P} y={222} w={180} h={26} text="Fan speed" fontSize={18} fontStyle="Medium" />
    <neu.Text x={P} y={248} w={180} h={22} text="1 to 5" color={t.muted} fontSize={14} />
    <neu.Stepper x={w - P - 180} y={214} w={180} join="fan" value={3} min={1} max={5} />
  </>
);

/** boxes and radios, two columns: the whole row is the button */
const choices = (w) => {
  const col = Math.floor((w - 2 * P) / 2);
  return (
    <>
      <neu.Text x={P} y={56} w={col} h={22} text="Notify by" color={t.sub} fontSize={15} fontStyle="Medium" />
      <neu.CheckBox x={P - 6} y={86} w={col} label="Email" join="by_email" value />
      <neu.CheckBox x={P - 6} y={134} w={col} label="Push" join="by_push" value />
      <neu.CheckBox x={P - 6} y={182} w={col} label="SMS" join="by_sms" />
      <neu.Text x={P + col} y={56} w={col} h={22} text="Quality" color={t.sub} fontSize={15} fontStyle="Medium" />
      <neu.RadioGroup x={P + col - 6} y={86} w={col} rowH={48} options={['Low', 'Medium', 'High']} join="quality" value={2} />
      <neu.Text x={P} y={250} w={w - 2 * P} h={44} wrap valign="top" color={t.muted} fontSize={14} text="Checks are toggles; radios pick one of the group (the index in an analog join)." />
    </>
  );
};

/** progress: a gauge in a groove */
const progress = (w) => (
  <>
    <neu.Progress x={P} y={62} w={w - 2 * P} label="Download" join="p_down" value={72} />
    <neu.Progress x={P} y={138} w={w - 2 * P} label="Upload" join="p_up" value={35} color={t.ok} />
    <neu.Progress x={P} y={214} w={w - 2 * P} label="Storage" join="p_disk" value={88} color={t.warn} />
  </>
);

export default (
  <Page name="Controls" bg={t.base} transition={fade}>
    {phone ? (
      <Stack page="Controls" items={[
        { title: 'Switches', h: 318, body: switches(W - 36) },
        { title: 'Sliders', h: 296, body: sliders(W - 36) },
        { title: 'Faders', h: 320, body: faders(W - 36) },
        { title: 'Segmented & stepper', h: 300, body: segmented(W - 36) },
        { title: 'Check & radio', h: 306, body: choices(W - 36) },
        { title: 'Progress', h: 266, body: progress(W - 36) },
      ]} />
    ) : (
      <>
        <neu.Card title="Switches" x={136} y={116} w={360} h={320}>{switches(360)}</neu.Card>
        <neu.Card title="Sliders" x={520} y={116} w={400} h={320}>{sliders(400)}</neu.Card>
        <neu.Card title="Faders" x={944} y={116} w={312} h={320}>{faders(312)}</neu.Card>
        <neu.Card title="Segmented & stepper" x={136} y={460} w={460} h={316}>{segmented(460)}</neu.Card>
        <neu.Card title="Check & radio" x={620} y={460} w={340} h={316}>{choices(340)}</neu.Card>
        <neu.Card title="Progress" x={984} y={460} w={272} h={316}>{progress(272)}</neu.Card>
      </>
    )}
    <Shell page="Controls" title="Controls" sub="Sunk tracks and grooves, raised knobs and pills that slide in them" />
  </Page>
);

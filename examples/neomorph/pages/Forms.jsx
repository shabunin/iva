import { neu, t, W, phone, P } from '../ui.js';
import Shell, { fade } from '../components/Shell.jsx';
import Stack from '../components/Stack.jsx';

const devices = [
  'Ceiling lights', 'Desk lamp', 'Floor lamp', 'Smart TV', 'Speaker', 'Air purifier', 'Thermostat', 'Blinds',
  'Garage door', 'Front door', 'Doorbell camera', 'Garden lights', 'Sprinklers', 'Robot vacuum', 'Fridge', 'Oven',
];

/** sign in: an avatar, two fields, a check, two buttons */
const signIn = (w) => {
  const fw = w - 2 * P - 8, cx = w / 2;
  return (
    <>
      <neu.Plate x={cx - 44} y={44} w={88} h={88} r={44} kind="convex" depth="md" />
      <neu.Plate x={cx - 30} y={58} w={60} h={60} r={30} kind="inset" depth="sm" />
      <neu.Icon x={cx - 13} y={75} icon="user" size={26} color={t.accent} />
      <neu.Text x={P} y={150} w={w - 2 * P} h={40} text="Welcome back" align="center" fontSize={28} fontStyle="Demi Bold" />
      <neu.Text x={P} y={190} w={w - 2 * P} h={22} text="Sign in to your home" align="center" color={t.muted} fontSize={16} />
      <neu.Field x={P + 4} y={246} w={fw} icon="envelope" hint="you@example.com" join="f_email" />
      <neu.Field x={P + 4} y={322} w={fw} icon="lock" hint="Password" join="f_password" password />
      <neu.CheckBox x={P - 2} y={394} w={200} label="Remember me" join="f_remember" value />
      <neu.Text x={w - P - 4 - 140} y={394} w={140} h={44} text="Forgot it?" align="right" color={t.accent} fontSize={16} fontStyle="Demi Bold" />
      <neu.Button x={P + 4} y={466} w={fw} h={58} text="Sign in" icon="arrow-right-to-bracket" kind="accent" />
      <neu.Button x={P + 4} y={548} w={fw} h={58} text="Create an account" />
    </>
  );
};

/** pickers: select boxes (a dropdown, a sheet, one to search), a time, a date, a number - their fields sunk in */
const pickers = (w) => {
  const fw = w - 2 * P - 8, x = P + 4;
  // the room's a dropdown on a tablet (it opens under the field: the top one has the room); the rest, and every
  // one on a phone, a sheet in the middle (a dropdown would scroll with the page: a scroll can't hold it)
  const mode = phone ? 'sheet' : 'dropdown';
  const row = (i, label) => <neu.Text x={x} y={58 + i * 94} w={fw} h={22} text={label} color={t.sub} fontSize={15} fontStyle="Medium" />;
  const at = (i) => 86 + i * 94;
  return (
    <>
      {row(0, 'Room · a dropdown')}
      <neu.Select x={x} y={at(0)} w={fw} options={['Living room', 'Kitchen', 'Bedroom', 'Office', 'Garage']} join="f_room" value={0} mode={mode} title="Room" />
      {row(1, 'Scene · a sheet')}
      <neu.Select x={x} y={at(1)} w={fw} options={['Morning', 'Day', 'Evening', 'Movie night', 'Away']} join="f_scene" value={2} mode="sheet" title="Scene" />
      {row(2, 'Device · search as you type')}
      <neu.SearchSelect x={x} y={at(2)} w={fw} options={devices} join="f_device" placeholder="Pick a device" title="Device" mode="sheet" />
      {row(3, 'Wake up · hour and minute')}
      <neu.TimePicker x={x} y={at(3)} w={fw} hour="f_hour" minute="f_minute" value="07:30" minuteStep={5} now="Now" title="Wake up" mode="sheet" />
      {row(4, 'Away from · day, month, year')}
      <neu.DatePicker x={x} y={at(4)} w={fw} day="f_day" month="f_month" year="f_year" value="2026-12-20" format="D MMMM YYYY" title="Away from" mode="sheet" />
      {row(5, 'Setpoint · a keypad, 16 to 30')}
      <neu.NumberField x={x} y={at(5)} w={fw} join="f_number" value={21.5} min={16} max={30} decimals={1} unit="°" title="Setpoint" mode="sheet" />
    </>
  );
};

/** a PIN pad: 1234 opens */
const security = (w) => (
  <>
    <neu.Plate x={w / 2 - 32} y={56} w={64} h={64} r={32} kind="convex" depth="md" />
    <neu.Icon x={w / 2 - 12} y={76} icon="shield-halved" size={24} color={t.accent} />
    <neu.PinPad x={Math.round((w - 236) / 2)} y={146} code="1234" />
    <neu.Text x={P} y={612} w={w - 2 * P} h={22} text="Hint: 1 2 3 4" align="center" color={t.muted} fontSize={13} />
  </>
);

export default (
  <Page name="Forms" bg={t.base} transition={fade}>
    {phone ? (
      <Stack page="Forms" items={[
        { title: 'Pickers', h: 86 + 5 * 94 + 54 + 26, body: pickers(W - 36) },
        { h: 640, body: signIn(W - 36) },
        { title: 'Security', h: 650, body: security(W - 36) },
      ]} />
    ) : (
      <>
        <neu.Card x={136} y={116} w={380} h={660}>{signIn(380)}</neu.Card>
        <neu.Card title="Pickers" x={540} y={116} w={380} h={660}>{pickers(380)}</neu.Card>
        <neu.Card title="Security" x={944} y={116} w={312} h={660}>{security(312)}</neu.Card>
      </>
    )}
    <Shell page="Forms" title="Forms" sub="Fields sunk into the surface: select boxes, pickers, a keypad of round keys" />
  </Page>
);

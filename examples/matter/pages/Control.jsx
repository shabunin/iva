import { ui, t, narrow } from '../ui.js';
import Shell, { enter, tab } from '../components/Shell.jsx';

/**
 * Controlling the devices the driver knows (app.jsx: <Matter devices>): an on/off lamp on a Toggle, a dimmer
 * on a Slider, a colour lamp on a colour picker (its hue and saturation go to the driver's joins).
 */
const m = narrow ? 14 : 28;

const lamp = (c, title) => {
  const top = title ? 64 : 20;
  return (
    <ui.Card title={title} {...c}>
      <ui.Toggle x={m} y={top} w={c.w - 2 * m} label="Lamp" join="lamp" />
    </ui.Card>
  );
};
const level = (c, title) => {
  const top = title ? 64 : 20;
  return (
    <ui.Card title={title} {...c}>
      <ui.Slider x={m} y={top} w={c.w - 2 * m} label="Level" join="level" unit="%" />
    </ui.Card>
  );
};
const colour = (c, title) => {
  const top = title ? 64 : 24;
  return (
    <ui.Card title={title} {...c}>
      <ui.ColorPicker x={m} y={top} size={narrow ? 200 : 240} r="lampR" g="lampG" b="lampB" hex="lampHex" value="#FFB000"
                      onChange="MatterControl.color(r, g, b)" />
    </ui.Card>
  );
};

/** the page's script: once */
const setup = (
  <>
    <Script src="../scripts/control.js" />
    <OnStart js="MatterControl.start();" joins={[a('hue'), a('sat')]} />
  </>
);

const L = ui.grid({
  lamp: [400, 150],
  level: [440, 150],
  colour: [400, 360],
}, [['lamp', 'level'], ['colour']]);
const A = ui.screenArea;

// a phone: the colour picker's wheel is a subpage, which a ScrollArea (a list) can't hold - a screen each
export default narrow ? (
  <ui.Screens name="Control" transition={enter} tabTransition={tab} shell={<Shell section="Control" />} screens={[
    { title: 'Lamp', content: <>{lamp({ ...A, h: 100 })}{level({ x: A.x, y: A.y + 112, w: A.w, h: 110 })}{setup}</> },
    { title: 'Colour', content: colour(A) },
  ]} />
) : (
  <Page name="Control" bg={t.page} transition={enter}>
    {lamp(L.lamp, 'OnOff')}
    {level(L.level, 'LevelControl')}
    {colour(L.colour, 'ColorControl')}
    {setup}
    <Shell section="Control" />
  </Page>
);

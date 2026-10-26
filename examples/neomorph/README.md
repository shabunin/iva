# neomorph

A neumorphic ("soft UI") gallery: every control made of one colour, lit from
the top left - raised shapes catch the light and cast a shadow, sunk ones hold
both inside. Six pages: Overview, Buttons, Controls, Dials, Smart home, Forms
(select boxes, time, date and number pickers, a PIN pad); a light look and a
dark one, switched on the panel; built for a 1280x800 tablet and two phones,
each page laid out both ways in one .gui (`orientation="both"`): turn the
panel and the page shows its other layout at once, what was set kept.

```bash
iva dev examples/neomorph/app.jsx
```

<p align="center">
  <img src="../../docs/images/neomorph-forms.webp" width="640" alt="Forms in the light look: a sign-in card, a dropdown open over the pickers, a PIN pad of round keys">
  <img src="../../docs/images/neomorph-dials-dark.webp" width="640" alt="Dials in the dark look: a knob, a thermostat with its readings, four rings">
</p>

On a phone (`<Project sizes={['1400x1400@3x', '1080x1920@2.5x']}>`): a header,
the cards one under another in a scroll, the sections in a bar at the bottom,
the dials on tabs; every picker opens as a sheet. On its side the bar goes
down the left and the cards scroll beside it (the thermostat's knob beside
its readings, the rings in a row); the tablet upright is laid out the same
way, its cards two a row.

<p align="center">
  <img src="../../docs/images/neomorph-phone-date.webp" width="280" alt="A date picker's sheet on a square phone screen: three drums in a sunk band, Today, Cancel, OK">
  <img src="../../docs/images/neomorph-phone-select-dark.webp" width="280" alt="A select box's sheet in the dark look: the chosen room pressed in">
</p>

## How it's made

- `neu/index.jsx` - the components (`createNeu()`; `ui.js` makes `neu` and
  `t`, the theme): Plate (flat, convex, concave, inset, pressed, accent), Card,
  Button, RoundButton, Chip, Tile, NavCard, Toggle, CheckBox, RadioGroup,
  Segmented, ButtonGroup, Slider, Fader, Progress, Stepper, Knob, Ring, Field,
  PinPad, Select, Scroll. Give one the shape's own x / y / w / h: its shadows
  go round it.
- `neu/paint.js` - iViewer draws no shadows and no gradients, so every soft
  shape is a PNG drawn as the project builds, at the element's own size and
  as sharp as the screen needs (2x on the tablet, 3x and 2.5x on the phones):
  a shape's fill and its outer and inset shadows as CSS box-shadow has them
  (blurred rounded rects in Evan Wallace's closed form). The files go to
  `.neu/`, outside `assets/`, so each size ships only the drawings it uses; a
  rebuild draws only what's new, and `iva build` / `iva check` delete the ones
  no longer used.
- `scripts/neu.js` - the panel side: values as text, one-of-several groups and
  their sliding pill, steppers, the knob, the PIN pad, field hints, the select
  boxes (a row picked on release, never on a drag), the clock.
- The other pickers (search select, time, date, number) are iva/ui's, made
  soft: their logic kept, every flat piece swapped for a raised or sunk one
  (`soften` in `neu/index.jsx`).
- Two looks: colours come from `variant()`. An image with a join of its own
  (it moves: a switch's knob, a segmented pill) is swapped by `Neu.skin`; a
  slider's thumb is the same in both looks (iViewer can't switch it).
- Phones: `components/Stack.jsx` stacks a page's cards in a `neu.Scroll` (a
  list with no join, so the joins in it are the page's own); Dials puts its
  knobs on tabs of subpages, as gestures don't fire in a list.
- Both ways: iva evaluates the project again with `screen()` turned and puts
  each page's two layouts in one .gui; `ui.js` picks the layout from the
  size (the rail and fixed cards for a tablet on its side, stacked for the
  rest). An image that moves (a switch's knob, a pill, a dial's pointer) has
  a join of its own each way (`moving()` in `neu/index.jsx`: iViewer moves
  every element on a join, and turned it's placed otherwise), and `neu.js`
  takes a control set up again for the other way as the same one: its value
  kept, that way's pill or pointer put where the value has it.

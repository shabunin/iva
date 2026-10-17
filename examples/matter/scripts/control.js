// The Control page: the colour picker's r, g, b to the driver's hue and saturation joins (0..65535, as the
// ColorControl cluster has them, 0..254 scaled), and back when the driver reports the lamp's colour.
var MatterControl = (function () {
  var last = { hue: -1, sat: -1 };
  function toJoin(v) { return Math.round(Math.max(0, Math.min(1, v)) * 65535); }
  function hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h: h / 360, s: max ? d / max : 0, v: max };
  }
  return {
    start: function () {},
    /** a pick: hue and saturation to the joins the driver watches */
    color: function (r, g, b) {
      var c = hsv(r, g, b);
      var hue = toJoin(c.h), sat = toJoin(c.s);
      if (hue !== last.hue) CF.setJoin(Joins.a.hue, hue);
      if (sat !== last.sat) CF.setJoin(Joins.a.sat, sat);
      last = { hue: hue, sat: sat };
    },
  };
})();

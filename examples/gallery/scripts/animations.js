// The gallery's Animations page, the script's part: what keeps state between presses - a toggle,
// where an element started - with CF.setProperties / CF.getProperties by hand (as in CommandFusion's
// docs, gui.md); the sheet shown in the way of its placement. The rest are setProps() actions in the JSX.
var GalleryAnim = (function () {
  /** each element's properties before it first moved: where Reset takes it back */
  var first = {};
  /** whether the element is over (Move: there and back) */
  var over = {};

  /** the element's properties as they first were, then fn(them) */
  function start(join, fn) {
    if (first[join]) return fn(first[join]);
    CF.getProperties(join, function (p) {
      if (!p) return CF.log('GalleryAnim: no element on ' + join);
      first[join] = { x: p.x, y: p.y };
      fn(first[join]);
    });
  }

  /** what CF.getProperties says of the element now, in a serial join */
  function readout(join, out) {
    CF.getProperties(join, function (p) {
      if (!p) return;
      var n = function (v, d) { return (+v || 0).toFixed(d); };
      CF.setJoin(out, 'CF.getProperties: x ' + n(p.x, 0) + '  y ' + n(p.y, 0) + '  scale ' + n(p.scale, 2) +
        '  zrotation ' + n(p.zrotation, 0) + '°  opacity ' + n(p.opacity, 2));
    });
  }

  return {
    readout: readout,

    /** over to the other end of the stage and back: x, eased in and out; the callback (and its argument) after */
    move: function (join, dx, out) {
      start(join, function (s) {
        over[join] = !over[join];
        CF.setProperties({ join: join, x: over[join] ? s.x + dx : s.x }, 0, 0.6, CF.AnimationCurveEaseInOut, readout, join, out);
      });
    },

    /** everything at once in one call - over, bigger, half turned, half faded - and back from where it started */
    all: function (join, dx, out) {
      start(join, function (s) {
        CF.setProperties({ join: join, x: s.x + dx, scale: 1.4, zrotation: 180, opacity: 0.5 }, 0, 0.8, CF.AnimationCurveEaseInOut, function () {
          CF.setProperties({ join: join, x: s.x, scale: 1, zrotation: 0, opacity: 1 }, 0.3, 0.8, CF.AnimationCurveEaseInOut, readout, join, out);
          over[join] = false;
        });
      });
    },

    /** back where it started */
    reset: function (join, out) {
      start(join, function (s) {
        over[join] = false;
        CF.setProperties({ join: join, x: s.x, y: s.y, scale: 1, zrotation: 0, yrotation: 0, opacity: 1 }, 0, 0.3, CF.AnimationCurveEaseOut, readout, join, out);
      });
    },

    /** the sheet in the way its placement shows it (animSheet<Kind>): the one shown before goes first */
    sheet: function (join, what) {
      var shown = Object.keys(Joins.d).filter(function (k) { return k.indexOf('animSheet') === 0; }).map(function (k) { return Joins.d[k]; });
      CF.getJoins(shown, function (joins) {
        var open = shown.filter(function (j) { return joins[j] && joins[j].value == '1'; });
        open.forEach(function (j) { CF.setJoin(j, 0); });
        CF.setJoin(Joins.s.animSheetText, what);
        setTimeout(function () { CF.setJoin(join, 1); }, open.length ? 450 : 0);
      });
    },

    /** the sheet away again (its out transition) */
    closeSheet: function () {
      Object.keys(Joins.d).forEach(function (k) {
        if (k.indexOf('animSheet') === 0) CF.setJoin(Joins.d[k], 0);
      });
    },
  };
})();

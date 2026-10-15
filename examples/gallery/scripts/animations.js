// The gallery's Animations page: elements moved, scaled, turned and faded by their joins with
// CF.setProperties (its delay, duration, curve and callback), read back with CF.getProperties;
// subpages shown with their transitions. As in CommandFusion's docs (gui.md, "Advanced tips").
var GalleryAnim = (function () {
  /** each element's properties before it first moved: where Reset takes it back */
  var first = {};
  /** what each toggle did last (an element moved over, the curve dots out) */
  var on = {};

  var CURVES = {
    Linear: CF.AnimationCurveLinear,
    EaseIn: CF.AnimationCurveEaseIn,
    EaseOut: CF.AnimationCurveEaseOut,
    EaseInOut: CF.AnimationCurveEaseInOut,
  };

  /** the element's properties as they first were, then fn(them) */
  function start(join, fn) {
    if (first[join]) return fn(first[join]);
    CF.getProperties(join, function (p) {
      if (!p) return CF.log('GalleryAnim: no element on ' + join);
      first[join] = { x: p.x, y: p.y, scale: p.scale, zrotation: p.zrotation, opacity: p.opacity };
      fn(first[join]);
    });
  }

  /** what CF.getProperties says of the element now, in a serial join */
  function readout(join, out) {
    if (!out) return;
    CF.getProperties(join, function (p) {
      if (!p) return;
      var n = function (v, d) { return (+v || 0).toFixed(d); };
      CF.setJoin(out, 'CF.getProperties: x ' + n(p.x, 0) + '  y ' + n(p.y, 0) + '  scale ' + n(p.scale, 2) +
        '  zrotation ' + n(p.zrotation, 0) + '°  opacity ' + n(p.opacity, 2));
    });
  }

  /** the joins named prefix + 0, 1, ... (the bars of a row) */
  function row(prefix) {
    var joins = [];
    for (var i = 0; Joins.d[prefix + i]; i++) joins.push(Joins.d[prefix + i]);
    return joins;
  }

  return {
    /** over to the other end of the stage and back: x, eased in and out */
    move: function (join, dx, out) {
      start(join, function (s) {
        on[join] = !on[join];
        CF.setProperties({ join: join, x: on[join] ? s.x + dx : s.x }, 0, 0.6, CF.AnimationCurveEaseInOut, readout, join, out);
      });
    },

    /** bigger, then back: the second animation in the first one's callback */
    scale: function (join, out) {
      CF.setProperties({ join: join, scale: 1.6 }, 0, 0.35, CF.AnimationCurveEaseOut, function () {
        CF.setProperties({ join: join, scale: 1 }, 0.15, 0.35, CF.AnimationCurveEaseIn, readout, join, out);
      });
    },

    /** a full turn: two halves (more than 180° at once may turn either way), then 0 again at once */
    spin: function (join, out) {
      CF.setProperties({ join: join, zrotation: 179 }, 0, 0.45, CF.AnimationCurveLinear, function () {
        CF.setProperties({ join: join, zrotation: 358 }, 0, 0.45, CF.AnimationCurveLinear, function () {
          CF.setProperties({ join: join, zrotation: 0 });
          readout(join, out);
        });
      });
    },

    /** nearly gone, then back */
    fade: function (join, out) {
      CF.setProperties({ join: join, opacity: 0.1 }, 0, 0.4, CF.AnimationCurveEaseIn, function () {
        CF.setProperties({ join: join, opacity: 1 }, 0.2, 0.4, CF.AnimationCurveEaseOut, readout, join, out);
      });
    },

    /** a card turning over: about Y to its edge, then from the other edge back (a 3D rotation) */
    flip: function (join, out) {
      CF.setProperties({ join: join, yrotation: 90 }, 0, 0.22, CF.AnimationCurveEaseIn, function () {
        CF.setProperties({ join: join, yrotation: -90 });
        CF.setProperties({ join: join, yrotation: 0 }, 0, 0.22, CF.AnimationCurveEaseOut, readout, join, out);
      });
    },

    /** everything at once in one call - over, bigger, half turned, half faded - and back */
    all: function (join, dx, out) {
      start(join, function (s) {
        CF.setProperties({ join: join, x: s.x + dx, scale: 1.4, zrotation: 180, opacity: 0.5 }, 0, 0.8, CF.AnimationCurveEaseInOut, function () {
          CF.setProperties({ join: join, x: s.x, scale: 1, zrotation: 0, opacity: 1 }, 0.3, 0.8, CF.AnimationCurveEaseInOut, readout, join, out);
          on[join] = false;
        });
      });
    },

    /** back where it started */
    reset: function (join, out) {
      start(join, function (s) {
        on[join] = false;
        CF.setProperties({ join: join, x: s.x, y: s.y, scale: 1, zrotation: 0, yrotation: 0, opacity: 1 }, 0, 0.3, CF.AnimationCurveEaseOut, readout, join, out);
      });
    },

    /** a tap on it: a little bounce */
    bounce: function (join) {
      CF.setProperties({ join: join, scale: 1.2 }, 0, 0.12, CF.AnimationCurveEaseOut, function () {
        CF.setProperties({ join: join, scale: 1 }, 0, 0.25, CF.AnimationCurveEaseIn);
      });
    },

    /** the same move on each lane, each with its curve (animCurveLinear ... animCurveEaseInOut) */
    curves: function (dx) {
      on.curves = !on.curves;
      Object.keys(CURVES).forEach(function (name) {
        var join = Joins.s['animCurve' + name];
        start(join, function (s) {
          CF.setProperties({ join: join, x: on.curves ? s.x + dx : s.x }, 0, 1.2, CURVES[name]);
        });
      });
    },

    /** a wave along the bars: each a little later (the delay), up and, in its callback, down again */
    wave: function () {
      row('animBar').forEach(function (join, i) {
        CF.setProperties({ join: join, yscale: 1.6 }, i * 0.07, 0.22, CF.AnimationCurveEaseOut, function (j) {
          CF.setProperties({ join: j, yscale: 1 }, 0, 0.3, CF.AnimationCurveEaseIn);
        }, join);
      });
    },

    /** the bars topple one after another, and stand up again once the last is down */
    domino: function () {
      var bars = row('animBar');
      bars.forEach(function (join, i) {
        CF.setProperties({ join: join, zrotation: 90 }, i * 0.1, 0.25, CF.AnimationCurveEaseIn, i < bars.length - 1 ? null : function () {
          bars.forEach(function (j, k) {
            CF.setProperties({ join: j, zrotation: 0 }, 0.3 + (bars.length - 1 - k) * 0.06, 0.25, CF.AnimationCurveEaseOut);
          });
        });
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

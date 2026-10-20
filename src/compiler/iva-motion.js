// iva's motion runtime: what motion={...} on an element does on the panel (shipped with a GUI that has one).
// An element's motion - enter: when its page is shown, from `from` to where it's laid out; press: while it's
// pressed (iViewer's press events), back on release; when: a digital join, `on` while high, `off` while low.
// Values '+n' / '-n' are from where the element is laid out (CF.getProperties, read once).
var IvaMotion = (function () {
  var items = [];
  var CURVES = { linear: 'AnimationCurveLinear', easeIn: 'AnimationCurveEaseIn', easeOut: 'AnimationCurveEaseOut', easeInOut: 'AnimationCurveEaseInOut' };
  var SKIP = { delay: 1, duration: 1, curve: 1, join: 1 };
  function curve(name) {
    return CF[CURVES[name] || 'AnimationCurveLinear'];
  }
  /** the element as laid out (x, y, w, h, scale, opacity, the rotations), read once */
  function base(it, cb) {
    if (it.base) return cb(it.base);
    CF.getProperties(it.join, function (p) {
      it.base = p || {};
      cb(it.base);
    });
  }
  /** the properties as values: '+n' / '-n' from the laid-out value */
  function resolve(props, b) {
    var out = {};
    Object.keys(props).forEach(function (k) {
      if (SKIP[k]) return;
      var v = props[k];
      out[k] = typeof v === 'string' && /^[+-]/.test(v) && typeof b[k] === 'number' ? b[k] + Number(v) : v;
    });
    return out;
  }
  /** the laid-out values of the properties named: back to them */
  function back(props, b) {
    var out = {};
    Object.keys(props).forEach(function (k) {
      if (!SKIP[k] && b[k] !== undefined) out[k] = b[k];
    });
    return out;
  }
  function set(join, props, delay, duration, c) {
    var keys = Object.keys(props);
    if (!keys.length) return;
    var change = { join: join };
    keys.forEach(function (k) { change[k] = props[k]; });
    CF.setProperties(change, delay || 0, duration || 0, curve(c));
  }
  function enter(it) {
    var now = Date.now();
    if (it.entered && now - it.entered < 500) return; // once a show (a start may tell twice)
    it.entered = now;
    base(it, function (b) {
      var e = it.enter;
      set(it.join, resolve(e.from, b), 0, 0);
      set(it.join, back(e.from, b), e.delay, e.duration === undefined ? 0.3 : e.duration, e.curve || 'easeOut');
    });
  }
  function shown(page) {
    items.forEach(function (it) {
      if (it.enter && it.page === page) enter(it);
    });
  }
  // iViewer passes (from, to, orientation); some runtimes just (to)
  CF.watch(CF.PageFlipEvent, function (from, to) { shown(typeof to === 'string' ? to : from); });
  return {
    /** an element's motion: { join, page, enter, press, when } */
    add: function (it) {
      // again (iva-start.js, the panel turned): the same element's motion, as given now
      for (var k = 0; k < items.length; k++) {
        if (items[k].join === it.join) {
          for (var f in it) items[k][f] = it[f];
          return;
        }
      }
      items.push(it);
      // on the page shown already (the scripts starting after it): in now
      if (it.enter && CF.currentPage === it.page) enter(it);
      if (it.press) {
        var p = it.press;
        var d = p.duration === undefined ? 0.1 : p.duration;
        CF.watch(CF.ObjectPressedEvent, it.join, function () {
          base(it, function (b) { set(it.join, resolve(p, b), 0, d, p.curve || 'easeOut'); });
        });
        CF.watch(CF.ObjectReleasedEvent, it.join, function () {
          base(it, function (b) { set(it.join, back(p, b), 0, d, p.curve || 'easeOut'); });
        });
      }
      if (it.when) {
        var w = it.when;
        CF.watch(CF.JoinChangeEvent, w.join, function (j, v) {
          base(it, function (b) {
            var on = Number(v) === 1 || v === true;
            var props = Object.assign(back(w.on, b), back(w.off || {}, b), resolve(on ? w.on : (w.off || {}), b));
            set(it.join, props, w.delay, w.duration === undefined ? 0.25 : w.duration, w.curve || 'easeInOut');
          });
        }, true);
      }
    },
  };
})();

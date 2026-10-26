/*
 * neu.js - what the neumorphic components do on the panel (neu/index.jsx
 * wires each up with <OnStart>): values as text, one-of-several groups and
 * their sliding pill, steppers, knobs, the PIN pad, field hints, the clock.
 * Analog joins run 0..65535 and stand for min..max.
 */
var Neu = (function () {
  var groups = {}, steppers = {}, dials = {}, pins = {}, clocks = {}, skins = [];
  // select boxes: by id, and by their list; a row pressed (armed) in a list, and whether the list moved since
  var selects = {}, selectOf = {}, pressed = {}, scrollWatched = {};
  /** a list row's subpage in the look shown (iva copies one that differs: name__dark) */
  function rowIn(name) { return typeof IvaTheme !== 'undefined' && IvaTheme.row ? IvaTheme.row(name) : name; }
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /** a group's pill under option i: by its offset from where it was placed, sliding (at once just after it was) */
  function place(p, i) {
    if (p.x0 === undefined || p.xs[i] === undefined || p.at === i) return;
    CF.setProperties({ join: p.join, x: p.x0 + p.xs[i] }, 0, Date.now() - p.born < 500 ? 0 : p.time, CF.AnimationCurveEaseInOut);
    p.at = i;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function toJoin(v, min, max) { return Math.round(clamp((v - min) / ((max - min) || 1), 0, 1) * 65535); }
  function fromJoin(j, min, max) { return min + (Number(j) || 0) / 65535 * (max - min); }
  function fmt(v, decimals, unit) { return v.toFixed(decimals) + (unit || ''); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  return {
    /** the time (HH:MM) and the date ("Saturday, 25 October") in serial joins */
    clock: function (time, date) {
      if (clocks[time]) return;
      clocks[time] = true;
      function tick() {
        var d = new Date();
        CF.setJoin(time, pad(d.getHours()) + ':' + pad(d.getMinutes()));
        if (date) CF.setJoin(date, DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]);
      }
      tick();
      setInterval(tick, 5000);
    },

    /** an analog join's value as text in a serial join */
    value: function (join, text, unit, decimals, min, max) {
      CF.watch(CF.JoinChangeEvent, join, function (j, v) { CF.setJoin(text, fmt(fromJoin(v, min, max), decimals, unit)); }, true);
    },
    /** an analog join set to a value in min..max */
    set: function (join, value, min, max) { CF.setJoin(join, toJoin(value, min, max)); },

    /**
     * one of several: the index in an analog join, each option's digital join
     * on when it's the one. With a pill ({ join, xs, at, time }: an image placed
     * under option `at`), it slides under the one chosen - by offsets from where
     * it was placed, so the group can sit anywhere. Again for a page laid out the
     * other way (<Project orientation="both">, the panel turned): that way's pill
     * too, under the one chosen now - the value as it is.
     */
    group: function (id, value, joins, initial, pill) {
      var g = groups[id];
      if (!g) {
        g = groups[id] = { value: value, joins: joins, pills: [], at: -1 };
        CF.watch(CF.JoinChangeEvent, value, function (j, v) {
          var i = Number(v);
          g.at = i;
          for (var k = 0; k < g.joins.length; k++) CF.setJoin(g.joins[k], k === i ? 1 : 0);
          for (var n = 0; n < g.pills.length; n++) place(g.pills[n], i);
        }, true);
        Neu.pick(id, initial);
      }
      if (!pill) return;
      for (var n = 0; n < g.pills.length; n++) if (g.pills[n].join === pill.join) return;
      var p = { join: pill.join, xs: pill.xs, at: pill.at, time: pill.time, born: Date.now() };
      g.pills.push(p);
      CF.getProperties(pill.join, function (props) {
        p.x0 = (props && props.x !== undefined ? Number(props.x) : 0) - pill.xs[pill.at];
        if (g.at >= 0) place(p, g.at);
      });
    },
    pick: function (id, i) {
      var g = groups[id];
      if (!g) return;
      CF.setJoin(g.value, i);
      for (var k = 0; k < g.joins.length; k++) CF.setJoin(g.joins[k], k === i ? 1 : 0);
    },

    /** a stepper: the value in an analog join, shown in a serial join, stepped from what the join holds */
    stepper: function (id, join, text, o) {
      // again (a page laid out the other way): as it is
      if (steppers[id]) return;
      var st = steppers[id] = { join: join, text: text, o: o, v: o.min };
      // what the join holds by then (iViewer tells of a script's own CF.setJoin a moment later: an event may be an old one)
      CF.watch(CF.JoinChangeEvent, join, function () {
        CF.getJoin(join, function (j, v) {
          st.v = fromJoin(v, o.min, o.max);
          CF.setJoin(text, fmt(st.v, o.decimals, o.unit));
        });
      }, true);
      if (o.value === undefined) return;
      st.v = o.value;
      Neu.step(id, 0);
    },
    step: function (id, dir) {
      var st = steppers[id];
      if (!st) return;
      var o = st.o;
      st.v = clamp(Math.round((st.v + dir * o.step) / o.step) * o.step, o.min, o.max);
      CF.setJoin(st.join, toJoin(st.v, o.min, o.max));
      CF.setJoin(st.text, fmt(st.v, o.decimals, o.unit));
    },

    /**
     * a knob: its pointer (an image drawn at the start, `from`) turned by the
     * value, 0..sweep degrees; the value as text. A tap turns it there in
     * 0.3 s, a drag has it follow the finger straight. Again for a page laid
     * out the other way (the panel turned): its size that way's (a touch goes
     * by it), that way's pointer too, turned to the value as it is.
     */
    dial: function (id, o, join, pointer, text) {
      var was = dials[id];
      if (was) {
        was.size = o.size;
        if (was.pointers.indexOf(pointer) < 0) {
          was.pointers.push(pointer);
          if (was.turn !== undefined) CF.setProperties({ join: pointer, zrotation: was.turn }, 0, 0, CF.AnimationCurveLinear);
        }
        return;
      }
      o.join = join;
      o.pointers = [pointer];
      o.text = text;
      dials[id] = o;
      CF.watch(CF.JoinChangeEvent, join, function (j, v) { Neu.dialShow(id, v); }, true);
      if (o.value !== undefined && o.value !== null) CF.setJoin(join, toJoin(o.value, o.min, o.max));
    },
    dialShow: function (id, v) {
      var o = dials[id], f = clamp((Number(v) || 0) / 65535, 0, 1);
      if (Number(v) !== o.put) o.put = undefined;
      var turn = f * o.sweep;
      if (turn !== o.turn) {
        o.turn = turn;
        for (var i = 0; i < o.pointers.length; i++) {
          CF.setProperties({ join: o.pointers[i], zrotation: turn }, 0, Date.now() - (o.touched || 0) < 400 ? 0 : 0.3, CF.AnimationCurveEaseOut);
        }
      }
      CF.setJoin(o.text, fmt(fromJoin(v, o.min, o.max), o.decimals, o.unit));
    },
    /** a touch at (x, y) in the knob's square: the value at that angle, snapped to the step */
    dialTouch: function (id, x, y, kind) {
      var o = dials[id];
      if (!o) return;
      var c = o.size / 2, dx = x - c, dy = y - c;
      if (dx * dx + dy * dy < c * c * 0.06) return; // the very middle: no clear angle
      var deg = Math.atan2(dx, -dy) * 180 / Math.PI; // clockwise from 12 o'clock
      var f = clamp((deg - o.from) / o.sweep, 0, 1);
      var v = o.min + f * (o.max - o.min);
      if (o.step) v = Math.round(v / o.step) * o.step;
      o.touched = kind === 'tap' ? 0 : Date.now();
      o.want = toJoin(v, o.min, o.max);
      if (!o.timer) Neu.dialPut(id);
    },
    /** what a finger asks for, if it's new; the next no sooner than 40 ms on */
    dialPut: function (id) {
      var o = dials[id];
      o.timer = null;
      if (o.want === o.put) return;
      o.put = o.want;
      CF.setJoin(o.join, o.put);
      o.timer = setTimeout(function () { Neu.dialPut(id); }, 40);
    },
    dialStep: function (id, dir) {
      var o = dials[id];
      if (!o) return;
      CF.getJoin(o.join, function (j, v) {
        var step = o.step || (o.max - o.min) / 100;
        var value = Math.round(fromJoin(v, o.min, o.max) / step) * step + dir * step;
        CF.setJoin(o.join, toJoin(clamp(value, o.min, o.max), o.min, o.max));
      });
    },

    /** a PIN pad: digits as dots, OK checks the code (onEnter(code) when right) */
    pin: function (id, o, dots, status, onEnter) {
      if (pins[id]) return;
      pins[id] = { o: o, dots: dots, status: status, code: '', onEnter: onEnter };
      Neu.pinShow(id, 'Enter your PIN');
    },
    pinShow: function (id, message) {
      var p = pins[id], out = [];
      for (var i = 0; i < p.o.length; i++) out.push(i < p.code.length ? '●' : '○');
      CF.setJoin(p.dots, out.join('  '));
      if (message !== undefined) CF.setJoin(p.status, message);
    },
    pinKey: function (id, k) {
      var p = pins[id];
      if (!p || p.busy || p.code.length >= p.o.length) return;
      p.code += k;
      Neu.pinShow(id, p.code.length === p.o.length ? 'Press ✓ to unlock' : 'Enter your PIN');
    },
    pinBack: function (id) {
      var p = pins[id];
      if (!p || p.busy) return;
      p.code = p.code.slice(0, -1);
      Neu.pinShow(id, 'Enter your PIN');
    },
    pinOk: function (id) {
      var p = pins[id];
      if (!p || p.busy) return;
      var right = p.code === p.o.code;
      Neu.pinShow(id, right ? 'Unlocked — welcome home' : 'Wrong PIN, try again');
      if (right && p.onEnter) p.onEnter(p.code);
      p.busy = true;
      setTimeout(function () { p.busy = false; p.code = ''; Neu.pinShow(id, 'Enter your PIN'); }, right ? 2500 : 1200);
    },

    /**
     * an image with a join of its own (one that moves): its file in the look shown, now and after each
     * switch (iva swaps only images without a join; IvaTheme.file names the look's own)
     */
    skin: function (join, name) {
      if (typeof IvaTheme === 'undefined') return;
      if (!skins.length) {
        IvaTheme.onChange(function () {
          for (var i = 0; i < skins.length; i++) CF.setJoin(skins[i][0], IvaTheme.file(skins[i][1]));
        });
      }
      // again (a page laid out the other way): one entry a join
      var had = false;
      for (var i = 0; i < skins.length; i++) if (skins[i][0] === join) { skins[i][1] = name; had = true; }
      if (!had) skins.push([join, name]);
      CF.setJoin(join, IvaTheme.file(name));
    },

    /**
     * a select box: its options a list's rows (s1 the text, d1 on for the one chosen) and a short blank
     * row after them, so even a list that fits scrolls; the index in an analog join, the text in a serial one
     */
    select: function (id, o) {
      var sel = selects[id];
      if (sel) {
        // again (a page laid out the other way, its sheet another width): its rows that way's, the one chosen as it is
        sel.o = o;
        selectOf[o.list] = id;
        sel.fill();
        return;
      }
      sel = selects[id] = { o: o, at: -1 };
      selectOf[o.list] = id;
      sel.fill = function () {
        var o = sel.o, items = [];
        for (var i = 0; i < o.options.length; i++) items.push({ subpage: rowIn(o.row), s1: o.options[i], d1: i === sel.at ? 1 : 0 });
        items.push({ subpage: rowIn(o.end) });
        CF.listRemove(o.list);
        CF.listAdd(o.list, items);
      };
      sel.fill();
      if (typeof IvaTheme !== 'undefined') IvaTheme.onChange(sel.fill);
      if (!scrollWatched[o.list]) {
        scrollWatched[o.list] = true;
        CF.watch(CF.ListWillStartScrollingEvent, o.list, function () { if (pressed[o.list]) pressed[o.list].moved = true; });
      }
      CF.watch(CF.JoinChangeEvent, o.join, function (j, v) {
        var i = Math.round(Number(v) || 0);
        if (i === sel.at) return;
        var was = sel.at, update = [];
        sel.at = i;
        CF.setJoin(o.label, o.options[i] === undefined ? '' : o.options[i]);
        if (was >= 0 && was < o.options.length) update.push({ index: was, d1: 0 });
        if (i >= 0 && i < o.options.length) update.push({ index: i, d1: 1 });
        if (update.length) CF.listUpdate(o.list, update);
      }, true);
      if (o.value !== undefined) CF.setJoin(o.join, o.value);
    },
    selectOpen: function (id) {
      var sel = selects[id];
      if (!sel) return;
      CF.setJoin(sel.o.open, 1);
      // a long list: the one chosen in the middle
      if (sel.at > 2 && sel.o.options.length > 6) CF.listScroll(sel.o.list, sel.at, CF.MiddlePosition, false);
    },
    selectClose: function (id) { if (selects[id]) CF.setJoin(selects[id].o.open, 0); },
    /** a list row's button pressed: armed (its release picks, unless the list moved meanwhile) */
    rowDown: function (list) { pressed[list] = { moved: false }; },
    selectPick: function (list, index) {
      var p = pressed[list];
      delete pressed[list];
      if (!p || p.moved) return;
      var sel = selects[selectOf[list]];
      if (!sel || index >= sel.o.options.length) return;
      CF.setJoin(sel.o.join, index);
      setTimeout(function () { CF.setJoin(sel.o.open, 0); }, 150);
    },

    /** a field's hint: shown while its text is empty */
    hint: function (input, hint, text) {
      CF.watch(CF.JoinChangeEvent, input, function (j, v) { CF.setJoin(hint, v ? '' : text); }, true);
    }
  };
})();

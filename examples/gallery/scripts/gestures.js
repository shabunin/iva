// The gallery's Gestures page, the script's part: the shape two fingers pinch and turn and one drags
// (CF.setProperties), from how it was when the gesture began; and the last gestures, one a line.
var GalleryGest = (function () {
  /** where the shape is and how big and turned (as the gestures leave it) */
  var at = null;
  /** its scale and turn while a pinch / rotate goes on */
  var now = { scale: 1, turn: 0 };
  /** the pan's delta last time: a drag moves the shape by what the finger moved since */
  var last = null;
  var home = null;

  function shape(fn) {
    if (at) return fn();
    CF.getProperties(Joins.s.gestShape, function (p) {
      if (!p) return;
      home = { x: p.x, y: p.y };
      at = { x: p.x, y: p.y, scale: 1, turn: 0 };
      fn();
    });
  }
  function show() {
    CF.setProperties({ join: Joins.s.gestShape, x: at.x, y: at.y, scale: now.scale, zrotation: now.turn });
  }

  var lines = [];
  return {
    /** two fingers apart / together: the scale from when they came down */
    pinch: function (scale) {
      shape(function () {
        now.scale = Math.max(0.4, Math.min(3, at.scale * scale));
        show();
      });
    },
    /** two fingers turning: radians since they began */
    turn: function (radians) {
      shape(function () {
        now.turn = at.turn + (radians * 180) / Math.PI;
        show();
      });
    },
    /** a pan begins: where its delta starts from */
    grab: function (dx, dy) {
      last = { x: dx, y: dy };
    },
    drag: function (dx, dy) {
      shape(function () {
        if (!last) last = { x: dx, y: dy };
        at.x += dx - last.x;
        at.y += dy - last.y;
        last = { x: dx, y: dy };
        show();
      });
    },
    /** the fingers up: what they did stays */
    settle: function () {
      if (!at) return;
      at.scale = now.scale;
      at.turn = now.turn;
      last = null;
    },
    /** back as it was, in a moment */
    reset: function () {
      shape(function () {
        at = { x: home.x, y: home.y, scale: 1, turn: 0 };
        now = { scale: 1, turn: 0 };
        CF.setProperties({ join: Joins.s.gestShape, x: home.x, y: home.y, scale: 1, zrotation: 0 }, 0, 0.3, CF.AnimationCurveEaseOut);
        CF.setJoin(Joins.s.gestScale, 'pinch 100 %');
        CF.setJoin(Joins.s.gestTurn, 'turned 0°');
      });
    },
    /** a gesture said: the newest line on top, the last four */
    log: function (text) {
      lines.unshift(text);
      lines = lines.slice(0, 4);
      CF.setJoin(Joins.s.gestLog, lines.join('\n'));
    },
  };
})();

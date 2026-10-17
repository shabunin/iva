// The gallery's own web servers (<HttpServer>): a "camera" - a picture a second, drawn here as SVG - and
// an API an HTTP system (<System protocol="http">) asks: its command is the path of a GET, the answer's
// body goes to its feedback. The Network page's CF.request asks it too.
var GalleryNet = (function () {
  var shots = 0;
  var two = function (n) { return (n < 10 ? '0' : '') + n; };

  /** what camera `cam` sees now: the sun going round once a minute, the time, the picture's number */
  function picture(cam) {
    var d = new Date();
    var time = two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
    var turn = ((d.getSeconds() + d.getMilliseconds() / 1000) / 60) * 2 * Math.PI - Math.PI / 2;
    var night = cam === '2';
    var sky = night ? ['#0b1430', '#1d2b5a'] : ['#3d8bd9', '#9fd0f5'];
    var x = (160 + Math.cos(turn) * 110).toFixed(1);
    var y = (100 + Math.sin(turn) * 55).toFixed(1);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + sky[0] + '"/><stop offset="1" stop-color="' + sky[1] + '"/></linearGradient></defs>' +
      '<rect width="320" height="180" fill="url(#g)"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="15" fill="' + (night ? '#f2f2d0' : '#ffd23f') + '"/>' +
      '<path d="M0 150 L60 112 L110 140 L170 98 L230 136 L280 116 L320 140 L320 180 L0 180 Z" fill="' + (night ? '#121a2e' : '#2f6b3a') + '"/>' +
      '<rect width="320" height="22" fill="#000" fill-opacity="0.45"/>' +
      '<text x="8" y="16" font-family="monospace" font-size="13" fill="#fff">CAM ' + cam + '  ' + time + '  #' + (++shots) + '</text>' +
      '<circle cx="306" cy="11" r="5" fill="#e33"/>' +
      '</svg>';
  }

  return {
    camera: function (req, res) {
      var m = /^\/camera\/(\d)/.exec(req.path);
      if (!m) return res.notFound();
      // a moment, as a camera takes one: the spinner shows while a camera's first picture comes
      setTimeout(function () { res.bytes('image/svg+xml', picture(m[1])); }, 350);
    },
    /** the API: /now (the time, for the HTTP system), /echo (the request as the server got it) - a Server header on each */
    api: function (req, res) {
      var head = { Server: 'iva gallery' };
      if (req.path === '/now') return res.bytes('text/plain; charset=utf-8', IvaHttp.utf8('now=' + new Date().toTimeString().slice(0, 8)), 200, head);
      if (req.path === '/echo') {
        var got = { method: req.method, path: req.path, query: req.query, headers: req.headers };
        return res.bytes('application/json', IvaHttp.utf8(JSON.stringify(got, null, 1)), 200, head);
      }
      res.notFound();
    },
  };
})();

/** the <HttpServer> handlers (by name) */
function galleryCamera(req, res) { GalleryNet.camera(req, res); }
function galleryApi(req, res) { GalleryNet.api(req, res); }

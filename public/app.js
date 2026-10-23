'use strict';

// Kidraw's board. The drawing is plain data (an array of marks) and every
// pixel on the sheet is painted from it, so undo, clear, a resize and the
// saved picture all come from the same source. Nothing is stored: the
// drawing lives in this page and leaves as a PNG the person saves.
(function () {
  var canvas = document.querySelector('canvas[data-board]');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var hint = document.querySelector('[data-hint]');
  var undoBtn = document.querySelector('[data-undo]');
  var clearBtn = document.querySelector('[data-clear]');
  var saveBtn = document.querySelector('[data-save]');
  var saveError = document.querySelector('[data-save-error]');
  var retryBtn = document.querySelector('[data-retry]');
  var demoNote = document.querySelector('[data-usernode-demo-note]');
  var crayons = Array.prototype.slice.call(document.querySelectorAll('.cr'));
  var tools = Array.prototype.slice.call(document.querySelectorAll('.t'));
  var sizeButtons = Array.prototype.slice.call(document.querySelectorAll('.d'));

  var SIZES = [4, 10, 18, 28];
  var STAMP_FACTOR = 3;
  var isDemo = new URLSearchParams(location.search).get('demo') === '1';

  var marks = [];
  var color = '#000000';
  var tool = 'brush';
  var size = SIZES[2];
  var activePointer = null;
  var pendingStamp = null;
  var dpr = 1;

  // ── Colours from the kit's tokens ───────────────────────────────────────
  function tokenColor(name) {
    var raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--' + name)
      .trim();
    return raw ? 'rgb(' + raw + ')' : 'rgb(0 0 0)';
  }

  function paperColor() {
    var board = document.querySelector('.board');
    var c = board ? getComputedStyle(board).backgroundColor : '';
    return c && c !== 'rgba(0, 0, 0, 0)' ? c : 'rgb(255 255 255)';
  }

  // ── Painting from state ─────────────────────────────────────────────────
  // A 'clear' entry hides every mark before it; undoing it brings them back.
  function visibleMarks(list) {
    var start = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === 'clear') start = i + 1;
    }
    return list.slice(start);
  }

  function starPath(c, cx, cy, r) {
    var inner = r * 0.45;
    for (var i = 0; i < 10; i++) {
      var radius = i % 2 ? inner : r;
      var a = -Math.PI / 2 + (i * Math.PI) / 5;
      var x = cx + Math.cos(a) * radius;
      var y = cy + Math.sin(a) * radius;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  }

  function heartPath(c, cx, cy, r) {
    c.moveTo(cx, cy + r * 0.85);
    c.bezierCurveTo(cx - r * 1.4, cy - r * 0.15, cx - r * 0.55, cy - r * 1.05, cx, cy - r * 0.28);
    c.bezierCurveTo(cx + r * 0.55, cy - r * 1.05, cx + r * 1.4, cy - r * 0.15, cx, cy + r * 0.85);
    c.closePath();
  }

  function drawMark(c, mark, w, h) {
    if (mark.type === 'stroke') {
      var pts = mark.points.map(function (p) {
        return { x: p.x * w, y: p.y * h };
      });
      c.strokeStyle = mark.color;
      c.fillStyle = mark.color;
      c.lineWidth = mark.size;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      if (pts.length === 1) {
        c.beginPath();
        c.arc(pts[0].x, pts[0].y, mark.size / 2, 0, Math.PI * 2);
        c.fill();
        return;
      }
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length - 1; i++) {
        var mx = (pts[i].x + pts[i + 1].x) / 2;
        var my = (pts[i].y + pts[i + 1].y) / 2;
        c.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      c.stroke();
      return;
    }
    if (mark.type === 'stamp') {
      var r = (mark.size * STAMP_FACTOR) / 2;
      c.fillStyle = mark.color;
      c.beginPath();
      if (mark.shape === 'star') starPath(c, mark.x * w, mark.y * h, r);
      else heartPath(c, mark.x * w, mark.y * h, r);
      c.fill();
    }
  }

  function paintMarks(c, list, w, h) {
    for (var i = 0; i < list.length; i++) {
      var mark = list[i];
      if (mark.type === 'clear') {
        c.clearRect(0, 0, w, h);
      } else {
        drawMark(c, mark, w, h);
      }
    }
  }

  function repaint() {
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintMarks(ctx, marks, w, h);
  }

  // ── Sizing ──────────────────────────────────────────────────────────────
  function resize() {
    var rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    repaint();
  }

  // ── Tool state ──────────────────────────────────────────────────────────
  function baseName(btn) {
    return (btn.getAttribute('aria-label') || '').replace(/,\s*selected$/, '');
  }

  function selectCrayon(btn) {
    crayons.forEach(function (b) {
      var on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', baseName(b) + (on ? ', selected' : ''));
    });
    color = getComputedStyle(btn).backgroundColor;
  }

  function selectTool(btn) {
    tools.forEach(function (b) {
      var on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('aria-label', baseName(b) + (on ? ', selected' : ''));
    });
    tool = btn.getAttribute('data-tool');
  }

  function selectSize(btn) {
    sizeButtons.forEach(function (b) {
      var on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('aria-label', baseName(b) + (on ? ', selected' : ''));
    });
    size = SIZES[sizeButtons.indexOf(btn)];
  }

  function updateStates() {
    var visible = visibleMarks(marks);
    var has = visible.length > 0;
    undoBtn.setAttribute('aria-disabled', marks.length === 0 ? 'true' : 'false');
    clearBtn.setAttribute('aria-disabled', has ? 'false' : 'true');
    if (hint) hint.hidden = has;
    canvas.setAttribute(
      'aria-label',
      has
        ? 'Drawing board with ' + visible.length + (visible.length === 1 ? ' mark' : ' marks')
        : 'Blank drawing board'
    );
  }

  // ── Pointer input ───────────────────────────────────────────────────────
  function pointFromEvent(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: r.width ? (e.clientX - r.left) / r.width : 0,
      y: r.height ? (e.clientY - r.top) / r.height : 0,
    };
  }

  function hideSaveError() {
    if (saveError) saveError.hidden = true;
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    hideSaveError();
    activePointer = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      // A synthetic pointer (tests, scripts) has no capture to take.
    }
    if (tool === 'brush') {
      marks.push({
        type: 'stroke',
        color: color,
        size: size,
        points: [pointFromEvent(e)],
      });
      repaint();
    } else {
      pendingStamp = { shape: tool, x: 0, y: 0 };
    }
    updateStates();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerId !== activePointer) return;
    if (tool !== 'brush' || pendingStamp) return;
    var last = marks[marks.length - 1];
    if (!last || last.type !== 'stroke') return;
    var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (!events.length) events = [e];
    for (var i = 0; i < events.length; i++) {
      var p = pointFromEvent(events[i]);
      var before = last.points[last.points.length - 1];
      if (Math.abs(p.x - before.x) > 0.0005 || Math.abs(p.y - before.y) > 0.0005) {
        last.points.push(p);
      }
    }
    repaint();
  });

  function endPointer(e) {
    if (e.pointerId !== activePointer) return;
    if (pendingStamp) {
      var p = pointFromEvent(e);
      marks.push({
        type: 'stamp',
        shape: pendingStamp.shape,
        color: color,
        size: size,
        x: p.x,
        y: p.y,
      });
      pendingStamp = null;
    }
    activePointer = null;
    updateStates();
    repaint();
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', function (e) {
    if (e.pointerId !== activePointer) return;
    pendingStamp = null;
    activePointer = null;
    updateStates();
    repaint();
  });
  canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // ── Buttons ─────────────────────────────────────────────────────────────
  crayons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectCrayon(btn);
    });
  });

  tools.forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectTool(btn);
    });
  });

  sizeButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectSize(btn);
    });
  });

  undoBtn.addEventListener('click', function () {
    if (undoBtn.getAttribute('aria-disabled') === 'true') return;
    marks.pop();
    hideSaveError();
    updateStates();
    repaint();
  });

  clearBtn.addEventListener('click', function () {
    if (clearBtn.getAttribute('aria-disabled') === 'true') return;
    marks.push({ type: 'clear', before: marks.slice() });
    hideSaveError();
    updateStates();
    repaint();
  });

  // ── Saving ──────────────────────────────────────────────────────────────
  // Painted synchronously, so navigator.share runs inside the tap that asked
  // for it (a phone refuses a share started after an await).
  function exportPngBlob() {
    var rect = canvas.getBoundingClientRect();
    var scale = 2;
    var off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(rect.width * scale));
    off.height = Math.max(1, Math.round(rect.height * scale));
    var c = off.getContext('2d');
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.fillStyle = paperColor();
    c.fillRect(0, 0, off.width / scale, off.height / scale);
    paintMarks(c, visibleMarks(marks), rect.width, rect.height);
    var dataUrl = off.toDataURL('image/png');
    var base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  }

  function showSaveError() {
    if (!saveError) return;
    saveError.hidden = false;
    // The line appears under the button, sometimes just past the fold on a
    // phone; keep it in view after the tap.
    saveError.scrollIntoView({ block: 'nearest' });
  }

  function savePicture() {
    hideSaveError();
    var blob;
    try {
      blob = exportPngBlob();
    } catch (err) {
      showSaveError();
      return;
    }
    var file = new File([blob], 'kidraw.png', { type: 'image/png' });
    var canShare =
      typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
    if (canShare) {
      navigator.share({ files: [file], title: 'Kidraw' }).catch(function (err) {
        // Closing the share sheet is not a failure.
        if (err && err.name === 'AbortError') return;
        showSaveError();
      });
      return;
    }
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'kidraw.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 2000);
    } catch (err) {
      showSaveError();
    }
  }

  saveBtn.addEventListener('click', savePicture);
  if (retryBtn) retryBtn.addEventListener('click', savePicture);

  // ── Staging demo (?demo=1) ──────────────────────────────────────────────
  // The drawn scene, as ordinary marks: a house with a door, a sun, grass,
  // a blue hill, two purple birds, an orange and a purple star and two red
  // hearts. Nothing is written anywhere.
  function demoMarks() {
    var W = 358;
    var H = 470;
    function p(x, y) {
      return { x: x / W, y: y / H };
    }
    function polyline(colorName, size, coords) {
      return {
        type: 'stroke',
        color: tokenColor(colorName),
        size: size,
        points: coords.map(function (c) {
          return p(c[0], c[1]);
        }),
      };
    }
    function circle(colorName, size, cx, cy, r) {
      var coords = [];
      for (var i = 0; i <= 48; i++) {
        var a = (i / 48) * Math.PI * 2;
        coords.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return polyline(colorName, size, coords);
    }
    function stamp(shape, colorName, size, x, y) {
      return { type: 'stamp', shape: shape, color: tokenColor(colorName), size: size, x: x / W, y: y / H };
    }
    return [
      // The blue hill behind the house.
      polyline('blue', 18, [[30, 400], [100, 332], [170, 400], [242, 461], [330, 380]]),
      // The sun and its rays.
      circle('yellow', 10, 270, 90, 36),
      polyline('yellow', 10, [[270, 30], [270, 16]]),
      polyline('yellow', 10, [[270, 150], [270, 164]]),
      polyline('yellow', 10, [[210, 90], [196, 90]]),
      polyline('yellow', 10, [[330, 90], [344, 90]]),
      polyline('yellow', 10, [[228, 48], [218, 38]]),
      polyline('yellow', 10, [[312, 132], [322, 142]]),
      polyline('yellow', 10, [[312, 48], [322, 38]]),
      polyline('yellow', 10, [[228, 132], [218, 142]]),
      // The house, its roof and its door.
      polyline('red', 10, [[60, 290], [60, 200], [140, 200], [140, 290], [60, 290]]),
      polyline('red', 10, [[50, 204], [100, 160], [150, 204]]),
      polyline('brown', 10, [[90, 290], [90, 250], [110, 250], [110, 290]]),
      // Grass along the bottom.
      polyline('green', 18, [[16, 316], [100, 304], [180, 318], [250, 328], [342, 312]]),
      // Two purple birds.
      polyline('purple', 4, [[150, 60], [160, 52], [170, 60]]),
      polyline('purple', 4, [[196, 38], [204, 31], [212, 38]]),
      // The stamps.
      stamp('star', 'orange', 10, 60, 40),
      stamp('star', 'purple', 10, 210, 230),
      stamp('heart', 'red', 10, 250, 270),
      stamp('heart', 'red', 4, 300, 240),
    ];
  }

  // ── Start ───────────────────────────────────────────────────────────────
  var selectedCrayon = crayons.filter(function (b) {
    return b.classList.contains('on');
  })[0] || crayons[0];
  var selectedTool = tools.filter(function (b) {
    return b.classList.contains('on');
  })[0] || tools[0];
  var selectedSize = sizeButtons.filter(function (b) {
    return b.classList.contains('on');
  })[0] || sizeButtons[2];

  if (selectedCrayon) selectCrayon(selectedCrayon);
  if (selectedTool) selectTool(selectedTool);
  if (selectedSize) selectSize(selectedSize);

  if (isDemo) {
    marks = demoMarks();
    if (demoNote) demoNote.hidden = false;
  }

  updateStates();
  resize();

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener('resize', resize);
  }
})();

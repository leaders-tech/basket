/*
This file draws the game on a small pixel canvas: courts, players, ball, hoops, score, and the main menu.
Edit this file when the look of the game changes (colors, courts, on-screen text, menu buttons).
Do not copy this file. Add a new court as one more branch in background() and a new text label in hud().
*/
// The canvas is 190 px tall. Its width grows with the screen from 290 to 420 px.
import { BOOSTS, LIFE as BOOST_LIFE } from "./boosts.js";
  var H = 190, FIELD_W = 290, GROUND = 142;
  var FONT = '"Press Start 2P", monospace';

  var TEAM = [
    { name: 'GREEN', jersey: '#3fbf7f', jerseyD: '#2a8d5a', shorts: '#33a86d', trim: '#f4f7fb', ui: '#2fa46a', uiD: '#14482f', glow: '#9ff0c4' },
    { name: 'PURPLE', jersey: '#7d55c7', jerseyD: '#5a3a99', shorts: '#6a47b0', trim: '#ffd34d', ui: '#7a4fd0', uiD: '#33195e', glow: '#d2b8ff' }
  ];
  var OUT = '#17120f';

  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function rnd(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function px(x, c, a, b, w, h) { x.fillStyle = c; x.fillRect(a, b, w, h); }
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function f(v) { return Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))); }
    return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
  }
  function outline(src, color) {
    var c = mk(src.width + 2, src.height + 2), x = c.getContext('2d');
    var d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    x.fillStyle = color;
    for (var y = 0; y < src.height; y++) for (var i = 0; i < src.width; i++) if (d[(y * src.width + i) * 4 + 3] > 0) x.fillRect(i, y, 3, 3);
    x.drawImage(src, 1, 1);
    return c;
  }

  // ---------- pixel font text ----------
  // Press Start 2P is a monospace font: every letter is exactly `size` pixels wide.
  // Use 16 px when the text fits in maxW, otherwise 8 px.
  export function fitSize(str, maxW) { return str.length * 16 + 4 <= maxW ? 16 : 8; }
  // Join round title parts into lines no longer than maxChars, so long titles never run off the screen.
  // Left edge of a team's score box: team 0 plays on the left, so its score is in the bottom-left corner.
  export function scoreX(team, W, boxW) { return team === 0 ? 0 : W - boxW; }
  export function wrapParts(parts, maxChars) {
    var lines = [], cur = '';
    for (var i = 0; i < parts.length; i++) {
      var next = cur ? cur + ' · ' + parts[i] : parts[i];
      if (cur && next.length > maxChars) { lines.push(cur); cur = parts[i]; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  var tcache = {};
  function ptext(str, size, fill, out, shadow) {
    var key = [str, size, fill, out, shadow].join('|');
    if (tcache[key]) return tcache[key];
    var m = mk(4, 4).getContext('2d'); m.font = size + 'px ' + FONT;
    var w = Math.ceil(m.measureText(str).width) + 2, h = size + 2;
    var c = mk(w, h), x = c.getContext('2d');
    x.font = size + 'px ' + FONT; x.textBaseline = 'top'; x.fillStyle = '#fff'; x.fillText(str, 1, 1);
    var d = x.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
    for (var i = 0; i < w * h; i++) mask[i] = d[i * 4 + 3] > 100 ? 1 : 0;
    var pad = out ? 1 : 0, sh = shadow ? Math.max(1, Math.round(size / 8)) : 0;
    var o = mk(w + pad * 2, h + pad * 2 + sh), ox = o.getContext('2d');
    function paint(col, dx, dy, grow) {
      ox.fillStyle = col;
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) if (mask[yy * w + xx]) {
        if (grow) ox.fillRect(xx + pad - 1 + dx, yy + pad - 1 + dy, 3, 3); else ox.fillRect(xx + pad + dx, yy + pad + dy, 1, 1);
      }
    }
    if (shadow) paint(shadow, 0, sh, !!out);
    if (out) paint(out, 0, 0, true);
    if (Array.isArray(fill)) { // gradient from top to bottom
      for (var yy = 0; yy < h; yy++) { ox.fillStyle = fill[Math.min(fill.length - 1, Math.floor(yy / h * fill.length))]; for (var xx = 0; xx < w; xx++) if (mask[yy * w + xx]) ox.fillRect(xx + pad, yy + pad, 1, 1); }
    } else paint(fill, 0, 0, false);
    tcache[key] = o;
    return o;
  }
  function text(ctx, str, size, x, y, fill, out, align, shadow) {
    var c = ptext(str, size, fill, out || null, shadow || null);
    var dx = align === 'left' ? 0 : align === 'right' ? -c.width : -Math.round(c.width / 2);
    ctx.drawImage(c, Math.round(x + dx), Math.round(y));
    return c;
  }

  // ---------- backgrounds ----------
  function bands(x, W, cols, y0, y1) { var n = cols.length, h = (y1 - y0) / n; for (var i = 0; i < n; i++) px(x, cols[i], 0, Math.round(y0 + i * h), W, Math.ceil(h) + 1); }
  function buildings(x, W, r, col, win, base, minH, maxH, wc) {
    for (var bx = -4; bx < W;) {
      var bw = 10 + Math.floor(r() * 20), bh = minH + Math.floor(r() * (maxH - minH));
      px(x, col, bx, base - bh, bw, bh);
      if (r() < 0.25) px(x, col, bx + 2 + Math.floor(r() * (bw - 4)), base - bh - 4, 2, 4);
      if (r() < 0.2) { px(x, col, bx + 2, base - bh - 2, bw - 4, 2); }
      if (win) for (var wy = base - bh + 3; wy < base - 3; wy += 4) for (var wx = bx + 2; wx < bx + bw - 2; wx += 3) if (r() < wc) px(x, win, wx, wy, 1, 2);
      bx += bw + Math.floor(r() * 2);
    }
  }
  function fence(x, W, r, plank, dark, light, top, bot, snow, ragged) {
    px(x, dark, 0, top + 6, W, bot - top - 6);
    for (var fx = 0; fx < W; fx += 7) {
      var t = top + (ragged ? Math.floor(r() * 5) : (r() < 0.5 ? 0 : 1));
      px(x, plank, fx, t + 1, 6, bot - t - 1);
      px(x, plank, fx + 1, t, 4, 1);
      px(x, light, fx, t + 1, 1, bot - t - 1);
      px(x, shade(plank, 0.86), fx + 5, t + 1, 1, bot - t - 1);
      if (r() < 0.3) px(x, shade(plank, 0.78), fx + 2 + Math.floor(r() * 2), t + 6 + Math.floor(r() * 16), 1, 1);
      if (snow) { px(x, '#f4f8fc', fx, t - 1, 6, 2); }
    }
    px(x, shade(plank, 0.7), 0, top + 7, W, 2);
    px(x, shade(plank, 0.7), 0, bot - 8, W, 2);
  }
  function puffs(x, W, r, col, y0, y1) {
    for (var cx = -10; cx < W; cx += 18 + Math.floor(r() * 16)) {
      var rad = 8 + Math.floor(r() * 10), cy = y0 + Math.floor(r() * (y1 - y0));
      for (var yy = -rad; yy <= 0; yy++) { var w = Math.round(Math.sqrt(rad * rad - yy * yy)); px(x, col, cx - w, cy + yy, w * 2 + 1, 1); }
      px(x, col, cx - rad, cy, rad * 2 + 1, y1 - cy + 40);
    }
  }
  function bushes(x, W, r, d, l, top, bot) {
    for (var bx = -4; bx < W; bx += 6 + Math.floor(r() * 6)) {
      var h = 3 + Math.floor(r() * 7), w = 8 + Math.floor(r() * 8);
      px(x, d, bx, bot - h - 1, w, h + 1); px(x, l, bx + 1, bot - h - 2, w - 2, 2);
      for (var k = 0; k < w; k += 2) if (r() < 0.5) px(x, l, bx + k, bot - h - 3, 1, 1);
    }
    px(x, d, 0, bot - 3, W, 3);
  }
  function grass(x, W, r, d, l, top, bot) {
    px(x, d, 0, top + 2, W, bot - top - 2);
    for (var gx = 0; gx < W; gx++) { var h = Math.floor(r() * 4); px(x, gx % 3 ? l : d, gx, top + 2 - h, 1, h + 1); }
    px(x, shade(d, 0.8), 0, bot - 1, W, 1);
  }
  function noise(x, W, r, cols, y0, y1, n) { for (var i = 0; i < n; i++) px(x, cols[i % cols.length], Math.floor(r() * W), y0 + Math.floor(r() * (y1 - y0)), 1 + (r() < 0.25 ? 1 : 0), 1); }
  function line(x, x0, y0, x1, y1) { var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (var i = 0; i <= n; i++) x.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1); }
  function court(x, ox, col) {
    x.fillStyle = col;
    var fy = 121, ny = 167;
    line(x, ox + 46, fy, ox + 244, fy);
    line(x, ox + 24, ny, ox + 266, ny);
    line(x, ox + 46, fy, ox + 24, ny); line(x, ox + 244, fy, ox + 266, ny);
    [[1, 46, 24], [-1, 244, 266]].forEach(function (s) {
      var d = s[0];
      line(x, ox + s[1] + d * 22, fy, ox + s[1] + d * 22, 150);   // free throw lane
      line(x, ox + s[1] - d * 6, 150, ox + s[1] + d * 22, 150);
      line(x, ox + s[1] - d * 2, 134, ox + s[1] + d * 22, 134);
    });
  }
  function disk(x, cx, cy, r, c) { for (var yy = -r; yy <= r; yy++) { var w = Math.round(Math.sqrt(r * r - yy * yy)); px(x, c, cx - w, cy + yy, w * 2 + 1, 1); } }

  var bgCache = {};
  function background(place, W) {
    var key = place + W;
    if (bgCache[key]) return bgCache[key];
    var c = mk(W, H), x = c.getContext('2d'), r = rnd(place.length * 977 + 3), ox = Math.floor((W - FIELD_W) / 2);
    if (place === 'street') {
      bands(x, W, ['#f7c48f', '#f8c994', '#f9ce9a', '#fad3a0', '#fbd8a7'], 0, 92);
      puffs(x, W, r, '#fde7c8', 30, 52);
      buildings(x, W, r, '#f4b47a', null, 90, 22, 62, 0);
      buildings(x, W, r, '#eb9b5e', '#f7c48d', 92, 12, 40, 0.12);
      fence(x, W, r, '#8d7d72', '#5c5049', '#a39488', 76, 106, false, true);
      bushes(x, W, r, '#8fc24c', '#acd862', 96, 110);
      px(x, '#3c3c41', 0, 108, W, H - 108);
      noise(x, W, r, ['#38383d', '#424247', '#3f3f44'], 109, H, 700);
      court(x, ox, '#b7b8bc');
    } else if (place === 'night') {
      bands(x, W, ['#0a0f26', '#0e1531', '#131b3d', '#19244a', '#1f2c55'], 0, 96);
      for (var s = 0; s < 70; s++) px(x, r() < 0.2 ? '#fff0b8' : '#ffffff', Math.floor(r() * W), Math.floor(r() * 70), 1, 1);
      disk(x, Math.round(W * 0.78), 22, 7, '#f2ecc8'); disk(x, Math.round(W * 0.78) + 3, 20, 6, '#131b3d');
      buildings(x, W, r, '#121833', '#f0cc66', 94, 16, 58, 0.16);
      fence(x, W, r, '#3b302a', '#211a16', '#4a3d35', 76, 108);
      grass(x, W, r, '#21431c', '#2f5f27', 103, 113);
      px(x, '#222228', 0, 112, W, H - 112);
      noise(x, W, r, ['#1e1e23', '#29292f'], 113, H, 700);
      x.globalAlpha = 0.09; x.fillStyle = '#ffe08a';
      [0.3, 0.7].forEach(function (k) { var lx = Math.round(W * k); x.beginPath(); x.moveTo(lx - 3, 40); x.lineTo(lx + 3, 40); x.lineTo(lx + 55, 190); x.lineTo(lx - 55, 190); x.fill(); });
      x.globalAlpha = 1;
      [0.3, 0.7].forEach(function (k) { var lx = Math.round(W * k); px(x, '#2a2d36', lx, 40, 2, 72); px(x, '#ffeaa0', lx - 3, 38, 8, 2); });
      court(x, ox, '#5f626d');
    } else if (place === 'beach') {
      bands(x, W, ['#58aee6', '#69b8ea', '#7cc2ee', '#92ccf1', '#a8d7f4'], 0, 92);
      disk(x, Math.round(W * 0.82), 22, 9, '#fff3b0');
      [[0.12, 18], [0.45, 10], [0.62, 30]].forEach(function (cl) { var cx = Math.round(W * cl[0]); px(x, '#fff', cx, cl[1], 22, 4); px(x, '#fff', cx + 5, cl[1] - 3, 12, 3); px(x, '#e3f2fb', cx + 1, cl[1] + 4, 20, 1); });
      px(x, '#2b80c4', 0, 88, W, 22);
      for (var wv = 0; wv < 50; wv++) px(x, '#5aaee3', Math.floor(r() * W), 90 + Math.floor(r() * 18), 4 + Math.floor(r() * 6), 1);
      px(x, '#e3f3ff', 0, 108, W, 2);
      px(x, '#e7cc8a', 0, 110, W, H - 110);
      noise(x, W, r, ['#d8b973', '#f2dca2', '#cdac66'], 111, H, 900);
      // palm tree
      var pxx = Math.max(6, ox - 2);
      px(x, '#86572f', pxx, 50, 3, 60); for (var tt = 52; tt < 110; tt += 4) px(x, '#6b4325', pxx, tt, 3, 1);
      [[-1, 0], [1, 0], [-1, 3], [1, 3]].forEach(function (lf) { for (var i = 0; i < 15; i++) px(x, '#3a9440', pxx + 1 + lf[0] * i, 50 + Math.round(i * i * 0.04) + lf[1], 2, 2); });
      court(x, ox, '#b89a55');
    } else if (place === 'snow') {
      bands(x, W, ['#8eaac6', '#9db6cf', '#adc3da', '#bfd1e3', '#d1dfec'], 0, 96);
      for (var mx = 0; mx < W; mx++) { var mh = 28 + Math.round(14 * Math.sin(mx * 0.03) + 8 * Math.sin(mx * 0.083 + 1)); px(x, '#a6b9cd', mx, 92 - mh, 1, mh); if (mh > 36) px(x, '#f2f6fa', mx, 92 - mh, 1, mh - 36); }
      for (var tx = 4; tx < W; tx += 16 + Math.floor(r() * 12)) { var th = 14 + Math.floor(r() * 10); for (var ty = 0; ty < th; ty++) { var tw = Math.floor(ty * 0.45); px(x, ty % 5 < 2 ? '#e8f0f6' : '#2c5743', tx - tw, 80 - th + ty, tw * 2 + 1, 1); } }
      fence(x, W, r, '#755b48', '#4a3a2f', '#88705c', 78, 108, true);
      px(x, '#edf3f8', 0, 106, W, H - 106);
      for (var sy = 108; sy < H; sy += 2) if (r() < 0.5) px(x, '#dfe8f1', 0, sy, W, 1);
      noise(x, W, r, ['#d3dee9', '#ffffff'], 107, H, 500);
      court(x, ox, '#9db0c4');
    } else if (place === 'indoor') {
      px(x, '#c9a06d', 0, 0, W, 112);
      for (var p = 0; p < W; p += 30) px(x, '#bd955f', p, 0, 1, 50);
      px(x, '#a98153', 0, 48, W, 3);
      for (var fl = 12; fl < W; fl += 42) { var col = ['#d0342c', '#3e5fb8', '#e8b33a', '#3d9a52'][Math.floor(fl / 42) % 4]; px(x, col, fl, 8, 12, 18); px(x, '#f3efe6', fl + 4, 12, 4, 4); }
      for (var row = 0; row < 6; row++) {
        var ry = 53 + row * 8;
        px(x, row % 2 ? '#5a3e2f' : '#674836', 0, ry, W, 8);
        for (var sx = 1 + (row % 2) * 2; sx < W; sx += 4) if (r() < 0.8) {
          px(x, ['#d0342c', '#3e5fb8', '#e8b33a', '#f3efe6', '#3d9a52', '#8b4fb5', '#e07b39'][Math.floor(r() * 7)], sx, ry + 4, 3, 3);
          px(x, ['#f0c39a', '#c98d5f', '#8d5a3a', '#e8b48a'][Math.floor(r() * 4)], sx, ry + 1, 3, 3);
        }
      }
      for (var b = 0; b < W; b += 58) { px(x, ['#2b4485', '#d0342c', '#232329'][Math.round(b / 58) % 3], b, 101, 58, 9); px(x, '#f3efe6', b + 8, 104, 40, 1); px(x, '#f3efe6', b + 14, 106, 28, 1); }
      px(x, '#c8884a', 0, 110, W, H - 110);
      for (var py = 112, gap = 3; py < H; py += gap, gap += 0.4) px(x, '#b67a3f', 0, Math.round(py), W, 1);
      for (var k = 0; k < 120; k++) px(x, '#d6985a', Math.floor(r() * W), 112 + Math.floor(r() * 76), 4 + Math.floor(r() * 8), 1);
      court(x, ox, '#f4eee2');
    }
    bgCache[key] = c;
    return c;
  }

  // ---------- sprites ----------
  function bodySprite(team, look, h) {
    var T = TEAM[team], w = 14, c = mk(w, h), x = c.getContext('2d');
    var skin = look.skin, skinD = shade(skin, 0.8);
    var shoe = 3, sock = 2, leg = Math.round(h * 0.25), shorts = Math.round(h * 0.2);
    var y = h;
    // sneakers (toes point right)
    y -= shoe; px(x, '#18181b', 4, y, 8, shoe); px(x, '#f2f2f2', 4, h - 1, 8, 1); px(x, '#3a3a40', 5, y, 2, 1);
    y -= sock; px(x, '#efefef', 5, y, 5, sock); px(x, '#cfcfd4', 5, y, 1, sock);
    y -= leg; px(x, skin, 5, y, 5, leg); px(x, skinD, 5, y, 1, leg); px(x, skinD, 7, y + 1, 1, leg - 1);
    y -= shorts; px(x, T.shorts, 4, y, 7, shorts); px(x, shade(T.shorts, 0.8), 4, y, 1, shorts);
    if (team === 1) px(x, T.trim, 9, y, 1, shorts - 1);
    var jt = y - 1; // jersey up to the top
    px(x, T.jersey, 4, 1, 7, jt); px(x, T.jerseyD, 4, 1, 1, jt);
    if (team === 0) { px(x, T.trim, 10, 2, 1, jt - 2); px(x, T.trim, 4, jt - 1, 7, 1); }
    else for (var d = 0; d < jt - 2; d++) px(x, T.trim, 5 + Math.round(d * 4 / (jt - 2)), 2 + d, 2, 1);
    px(x, skin, 6, 0, 4, 2); px(x, T.trim, 5, 1, 1, 2); px(x, T.trim, 10, 1, 1, 2);
    px(x, T.trim, 7, Math.round(jt * 0.4), 2, 1);
    return outline(c, OUT);
  }
  function headSprite(look) {
    var c = mk(10, 12), x = c.getContext('2d'), skin = look.skin, skinD = shade(skin, 0.8), hair = look.hair;
    px(x, skin, 1, 1, 8, 10); px(x, skinD, 1, 9, 8, 2);
    if (look.style === 0) { px(x, hair, 1, 0, 8, 3); px(x, hair, 0, 1, 3, 6); }
    else if (look.style === 1) { px(x, hair, 0, 0, 10, 2); px(x, hair, 1, 2, 8, 1); px(x, hair, 0, 1, 2, 5); }
    else if (look.style === 2) { px(x, hair, 2, 0, 6, 2); px(x, hair, 1, 1, 2, 3); }
    else { px(x, hair, 0, 0, 9, 3); px(x, hair, 0, 2, 2, 7); px(x, hair, 8, 2, 1, 1); }
    px(x, '#17120f', 7, 5, 1, 2);               // eye
    px(x, skinD, 3, 5, 2, 2);                    // ear
    px(x, skin, 9, 6, 1, 2);                     // nose
    px(x, shade(skin, 0.62), 6, 9, 2, 1);        // mouth
    return outline(c, OUT);
  }
  function armSprite(look, reach) {
    var len = reach + 3, c = mk(3, len), x = c.getContext('2d');
    px(x, look.skin, 0, 0, 3, len); px(x, shade(look.skin, 0.8), 2, 0, 1, len);
    px(x, shade(look.skin, 0.9), 0, len - 3, 3, 3);
    return outline(c, OUT);
  }
  function ballSprite(kind, r) {
    var d = Math.round(r * 2), c = mk(d, d), x = c.getContext('2d'), R = d / 2;
    for (var y = 0; y < d; y++) for (var i = 0; i < d; i++) {
      var dx = i + 0.5 - R, dy = y + 0.5 - R;
      if (dx * dx + dy * dy > R * R) continue;
      var lit = (-dx - dy) / R > 0.75, dim = (dx + dy) / R > 0.8, col;
      if (kind === 'normal') { col = lit ? '#f4a259' : dim ? '#b8581f' : '#e27a30'; if (Math.abs(dx) < 0.55 || Math.abs(dy) < 0.55) col = '#4a2310'; }
      else if (kind === 'heavy') { col = lit ? '#7e8590' : dim ? '#24262b' : '#3a3d45'; }
      else if (kind === 'beach') { var a = Math.atan2(dy, dx), sg = Math.floor((a + Math.PI) / (Math.PI / 3)) % 6; col = ['#e23b3b', '#f6f6f6', '#2f7fd6', '#f6f6f6', '#f2c531', '#f6f6f6'][sg]; if (dim) col = shade(col, 0.82); }
      else { col = lit ? '#eaf27a' : dim ? '#a7ba26' : '#cfe03a'; if (Math.abs(Math.abs(dx) - R * 0.55) < 0.5 && Math.abs(dy) < R * 0.7) col = '#f6f6ee'; }
      x.fillStyle = col; x.fillRect(i, y, 1, 1);
    }
    return outline(c, OUT);
  }

  // ---------- renderer ----------
  class Renderer { constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.W = 290; this.key = null; this.t = 0;
    this.net = [0, 0]; this.flash = 0; this.shake = 0; this.pops = [];
    this.sparks = [];
    this.flakes = []; for (var i = 0; i < 70; i++) this.flakes.push({ x: Math.random() * 400, y: Math.random() * H, v: 8 + Math.random() * 14, s: Math.random() < 0.25 ? 2 : 1 });
  } }
  Renderer.prototype.resize = function (W) {
    if (!isFinite(W)) W = 290;   // a tab opened in the background can report a 0 x 0 window
    W = Math.max(290, Math.min(420, Math.round(W)));
    if (W !== this.W || this.canvas.width !== W) { this.W = W; this.canvas.width = W; this.canvas.height = H; }
    this.ctx.imageSmoothingEnabled = false;
    return W;
  };
  Renderer.prototype.prepare = function (L, key) {
    if (this.key === key) return;
    this.key = key;
    this.spr = L.teams.map(function (team, i) {
      var look = L.looks[i];
      return { body: bodySprite(team, look, L.chars.h), head: headSprite(look), arm: armSprite(look, L.chars.arm) };
    });
    this.ball = ballSprite(L.ballKind, L.ball.r);
  };
  Renderer.prototype.onEvent = function (e, v) {
    if (e === 'score' && v) { this.net[v.bodies[v.L.teams.length * 7] > 145 ? 1 : 0] = 0.4; this.flash = 0.25; this.shake = 0.2; }
    if (e.indexOf('steady:') === 0) {
      // "steady:<player>:<x>:<y>": white and gold sparks rise around the player who stands up
      var sp2 = e.split(':'), sx = +sp2[2], sy = +sp2[3];
      for (var j = 0; j < 10; j++) {
        this.sparks.push({ x: sx + (Math.random() - 0.5) * 12, y: sy + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 20,
          vy: -30 - Math.random() * 30, t: 0, life: 0.4 + Math.random() * 0.2, c: j % 2 ? '#ffffff' : '#ffe7a3' });
      }
      return;
    }
    if (e.indexOf('boost:') === 0) {
      // "boost:<kind>:<player>:<x>:<y>": a burst of sparks where it was, and its name rising over the player
      var parts = e.split(':'), B = BOOSTS[parts[1]];
      if (!B) return;
      var x = +parts[3], y = +parts[4];
      for (var k = 0; k < 14; k++) {
        var a = k / 14 * Math.PI * 2, sp = 25 + Math.random() * 35;
        this.sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.45 + Math.random() * 0.25, c: k % 3 ? B.color : '#ffffff' });
      }
      this.pops = this.pops.filter(function (p) { return p.idx !== +parts[2]; });   // one name per player at a time
      this.pops.push({ text: (B.good ? '+' : '') + B.label + (B.good ? '' : '!'), color: B.color, good: B.good, idx: +parts[2], t: 0 });
    }
  };

  // ---------- boosts ----------
  // 7 x 7 pixel icons; '#' is the boost color, 'w' is white.
  var ICONS = {
    jump: ['...w...', '..www..', '.wwwww.', '...#...', '..#.#..', '.#...#.', '..###..'],
    speed: ['....##.', '...##..', '..##...', '.#####.', '...##..', '..##...', '.##....'],
    arms: ['.#.#.#.', '.#.#.#.', '.#####.', '######.', '.#####.', '..###..', '..###..'],
    slow: ['.......', '..www..', '.w...w.', '.w.w.w.', '.w..ww.', '######.', '#######'],
    freeze: ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#']
  };
  var iconCache = {};
  function boostIcon(kind) {
    if (iconCache[kind]) return iconCache[kind];
    var rows = ICONS[kind], c = mk(7, 7), x = c.getContext('2d'), col = BOOSTS[kind].color;
    rows.forEach(function (row, yy) { for (var xx = 0; xx < 7; xx++) if (row[xx] !== '.') px(x, row[xx] === 'w' ? '#ffffff' : col, xx, yy, 1, 1); });
    iconCache[kind] = outline(c, '#17120f');
    return iconCache[kind];
  }
  function ring(ctx, cx, cy, r, c) {
    for (var a = 0; a < 48; a++) { var t = a / 48 * Math.PI * 2; px(ctx, c, Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), 1, 1); }
  }

  // Boosts waiting on the court: a soft glow, a gold (good) or red (bad) ring, the icon, and two orbiting sparkles.
  Renderer.prototype.drawItems = function (ctx, items, ox) {
    var t = this.t;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], B = BOOSTS[it.kind];
      if (!B) continue;
      if (it.age > BOOST_LIFE - 2 && Math.floor(it.age * 8) % 2 === 0) continue;   // blink before it disappears
      var grow = Math.min(1, it.age / 0.25);   // pops in
      var x = Math.round(it.x + ox), y = Math.round(it.y + Math.sin(t * 3 + it.x) * 2);
      var rim = B.good ? '#ffd34d' : '#ff4f6d';
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 6 + i);
      disk(ctx, x, y, Math.round(10 * grow), B.color);
      ctx.globalAlpha = 1;
      disk(ctx, x, y, Math.round(7 * grow), '#17120f');
      disk(ctx, x, y, Math.round(6 * grow), B.good ? '#3b2a08' : '#3a0b16');
      ring(ctx, x, y, 6 * grow, rim);
      if (grow >= 1) {
        var icon = boostIcon(it.kind);
        ctx.drawImage(icon, x - 4, y - 4);
        for (var k = 0; k < 2; k++) {
          var a = t * 4 + k * Math.PI;
          px(ctx, '#ffffff', Math.round(x + Math.cos(a) * 9), Math.round(y + Math.sin(a) * 9), 1, 1);
        }
      }
    }
  };
  Renderer.prototype.drawSparks = function (ctx, ox, dt) {
    this.sparks = this.sparks.filter(function (s) {
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt;
      if (s.t > s.life) return false;
      px(ctx, s.c, Math.round(s.x + ox), Math.round(s.y), s.t < s.life * 0.5 ? 2 : 1, s.t < s.life * 0.5 ? 2 : 1);
      return true;
    });
  };
  // The boost's name rises from the player's head and fades out.
  Renderer.prototype.drawPops = function (ctx, b, ox, dt) {
    this.pops = this.pops.filter(function (p) {
      p.t += dt;
      if (p.t > 1.3 || p.idx * 7 + 4 >= b.length) return false;
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.3 - p.t) / 0.4));
      text(ctx, p.text, 8, b[p.idx * 7 + 3] + ox, b[p.idx * 7 + 4] - 34 - p.t * 12, p.color, '#17120f');
      ctx.globalAlpha = 1;
      return true;
    });
  };
  // Icons of the boosts a player has right now, side by side above the head.
  Renderer.prototype.fxIcons = function (ctx, fx, cx, y) {
    var on = Object.keys(BOOSTS).filter(function (k) { return fx[k] > 0; });
    var x0 = Math.round(cx - on.length * 10 / 2);
    for (var i = 0; i < on.length; i++) {
      if (fx[on[i]] < 1.5 && Math.floor(this.t * 8) % 2 === 0) continue;   // blinks when it is about to end
      ctx.drawImage(boostIcon(on[i]), x0 + i * 10, Math.round(y) - 9);
    }
  };
  // A frozen player stands in a block of ice.
  function iceBlock(ctx, b, o, ox, t) {
    var x1 = Math.min(b[o], b[o + 3]) + ox - 7, x2 = Math.max(b[o], b[o + 3]) + ox + 7;
    var y1 = Math.min(b[o + 1], b[o + 4]) - 8, y2 = Math.max(b[o + 1], b[o + 4]) + 1;
    x1 = Math.round(x1); y1 = Math.round(y1);
    var w = Math.round(x2) - x1, h = Math.round(y2) - y1;
    ctx.fillStyle = 'rgba(170,225,255,0.45)'; ctx.fillRect(x1, y1, w, h);
    ctx.fillStyle = 'rgba(235,250,255,0.95)';
    ctx.fillRect(x1, y1, w, 1); ctx.fillRect(x1, y1 + h - 1, w, 1); ctx.fillRect(x1, y1, 1, h); ctx.fillRect(x1 + w - 1, y1, 1, h);
    var shine = Math.floor(t * 2) % 2;
    ctx.fillRect(x1 + 2, y1 + 3 + shine, 1, 4); ctx.fillRect(x1 + 3, y1 + 2 + shine, 1, 1); ctx.fillRect(x2 - 4, y2 - 7, 1, 3);
  }

  Renderer.prototype.hoop = function (ctx, h, front, ox) {
    var rimL = Math.min(h.backEnd, h.frontX) + ox, rimR = Math.max(h.backEnd, h.frontX) + ox, ry = h.rimY;
    if (!front) {
      var pxx = Math.round((h.side < 0 ? 21 : 269) + ox), bl = Math.round(Math.min(h.boardIn, h.boardOut) + ox), bt = Math.round(h.boardTop), bb = Math.round(h.boardBot);
      var joint = Math.round(ry + 3), dir = h.side < 0 ? 1 : -1;
      // pole
      px(ctx, '#2a2a2e', pxx - 2, joint - 1, 5, GROUND + 4 - joint + 1);
      px(ctx, '#f2f2f2', pxx - 1, joint, 3, GROUND + 4 - joint);
      px(ctx, '#b9bcc2', pxx + (dir > 0 ? 1 : -1), joint, 1, GROUND + 4 - joint);
      // arm to the backboard
      var xa = Math.min(pxx, bl), xb = Math.max(pxx, bl + 2);
      px(ctx, '#2a2a2e', xa, joint - 1, xb - xa + 1, 4); px(ctx, '#f2f2f2', xa + 1, joint, xb - xa - 1, 2);
      // brace from the pole to the top of the backboard
      var n = Math.abs(bl - pxx), ex = bl + (dir > 0 ? 0 : 2);
      for (var pass = 0; pass < 2; pass++) for (var i = 0; i <= n * 2; i++) {
        var t = i / (n * 2), xx = Math.round(pxx + (ex - pxx) * t), yy = Math.round(joint + (bt + 2 - joint) * t);
        if (pass === 0) px(ctx, '#2a2a2e', xx - 1, yy - 1, 4, 4); else px(ctx, '#f2f2f2', xx, yy, 2, 2);
      }
      // backboard (side view)
      px(ctx, '#2a2a2e', bl - 1, bt - 1, 5, bb - bt + 2);
      px(ctx, '#f4f4f4', bl, bt, 3, bb - bt);
      px(ctx, '#c4c7cc', bl + (dir > 0 ? 2 : 0), bt, 1, bb - bt);
      // far half of the rim
      px(ctx, '#2a2a2e', Math.round(rimL) - 1, ry - 3, Math.round(rimR - rimL) + 2, 3);
      px(ctx, '#8e1d14', Math.round(rimL), ry - 2, Math.round(rimR - rimL), 2);
    } else {
      // net
      var st = this.net[h.side < 0 ? 0 : 1] > 0 ? 1.4 : 1;
      var nh = Math.round(11 * st), wT = rimR - rimL, wB = wT * 0.6;
      ctx.fillStyle = 'rgba(246,246,246,0.95)';
      for (var r = 0; r < nh; r++) {
        var w = wT + (wB - wT) * r / nh, xs = (rimL + rimR) / 2 - w / 2;
        for (var c = 0; c <= Math.round(w); c++) if ((c + r) % 3 === 0 || (c - r + 300) % 3 === 0 || c === 0 || c === Math.round(w)) ctx.fillRect(Math.round(xs + c), ry + 1 + r, 1, 1);
      }
      // near half of the rim
      var L0 = Math.round(rimL), L1 = Math.round(rimR);
      px(ctx, '#2a2a2e', L0 - 2, ry - 2, L1 - L0 + 4, 5);
      px(ctx, '#e2412f', L0 - 1, ry - 1, L1 - L0 + 2, 3);
      px(ctx, '#9c2117', L0 + 1, ry, L1 - L0 - 2, 1);
      px(ctx, '#ff8a6a', L0, ry - 1, Math.round((L1 - L0) * 0.4), 1);
    }
  };

  // sy (optional): stretch the picture along its length (long arms boost)
  function draw(ctx, img, x, y, ang, flip, ox, oy, sy) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(ang); if (flip) ctx.scale(-1, 1); if (sy) ctx.scale(1, sy);
    ctx.drawImage(img, -ox, -oy); ctx.restore();
  }

  // v: {L, key, bodies[31], score, state, timer, lastScorer, roundTime, holder, hints, menu, dt}
  Renderer.prototype.draw = function (v) {
    var ctx = this.ctx, L = v.L, b = v.bodies, W = this.W, ox = Math.floor((W - FIELD_W) / 2), i, dt = v.dt || 1 / 60;
    this.t += dt;
    this.prepare(L, v.key);
    for (i = 0; i < 2; i++) this.net[i] = Math.max(0, this.net[i] - dt);
    var ch = v.chaos;   // { t, seed } while chaos (Z + W) is on, otherwise null
    if (ch) px(ctx, '#000', 0, 0, W, H);   // corners that the spinning picture uncovers
    ctx.save();
    if (this.shake > 0) { this.shake -= dt; ctx.translate(Math.round((Math.random() - 0.5) * 2), Math.round((Math.random() - 0.5) * 2)); }
    if (ch) {
      // the whole court spins, wobbles, and zooms in and out
      var spin = Math.sin(ch.t * 2.1) * 0.5 + ch.t * 0.9, zoom = 1 + 0.12 * Math.sin(ch.t * 5);
      ctx.translate(W / 2, H / 2); ctx.rotate(spin); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);
    }
    ctx.drawImage(background(L.place, W), 0, 0);
    // clouds and shark fin
    if (L.place === 'street' || L.place === 'beach') {
      ctx.fillStyle = L.place === 'street' ? 'rgba(236,190,150,0.55)' : 'rgba(255,255,255,0.8)';
      for (var cl = 0; cl < 3; cl++) { var cx = ((this.t * (3 + cl) + cl * 140) % (W + 60)) - 40, cy = 10 + cl * 13; ctx.fillRect(Math.round(cx), cy, 26, 3); ctx.fillRect(Math.round(cx) + 6, cy - 2, 12, 2); }
    }
    if (L.place === 'beach') {
      var sx = ((this.t * 14) % (W + 40)) - 20, sy = 100;
      px(ctx, '#53606b', Math.round(sx), sy - 4, 2, 4); px(ctx, '#53606b', Math.round(sx) + 2, sy - 2, 2, 2); px(ctx, '#53606b', Math.round(sx) - 1, sy - 1, 1, 1);
      px(ctx, '#e3f3ff', Math.round(sx) - 3, sy, 9, 1);
    }

    this.hoop(ctx, L.hoops[0], false, ox);
    this.hoop(ctx, L.hoops[1], false, ox);

    // shadows
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    // bodies: 7 numbers per player, then the ball (x, y, angle) at index bi
    var n = L.teams.length, bi = n * 7;
    for (i = 0; i < n; i++) {
      var sc = Math.min(1, Math.max(0.2, 1 - (GROUND - b[i * 7 + 1]) / 150));
      var sw = Math.round(12 * sc);
      ctx.fillRect(Math.round(b[i * 7] + ox - sw / 2), GROUND, sw, 2);
    }
    var bsc = Math.min(1, Math.max(0.2, 1 - (GROUND - b[bi + 1]) / 150)), bw = Math.round(L.ball.r * 2 * bsc);
    ctx.fillRect(Math.round(b[bi] + ox - bw / 2), GROUND, bw, 2);

    // players
    for (i = 0; i < n; i++) {
      var o = i * 7, flip = L.teams[i] === 1, sp = this.spr[i], hgt = L.chars.h;
      var a = b[o + 2], f = flip ? -1 : 1, sxl = -f * 3, syl = -(hgt - 5);
      var shx = b[o] + sxl * Math.cos(a) - syl * Math.sin(a), shy = b[o + 1] + sxl * Math.sin(a) + syl * Math.cos(a);
      sp.shoulder = [shx + ox, shy];
      var raised = Math.abs(b[o + 6]) > 100;
      var fxi = v.fx ? v.fx[i] : null, armLen = fxi && fxi.arms > 0 ? 1.5 : 1;
      if (v.holder !== i && !raised) draw(ctx, sp.arm, shx + ox, shy, b[o + 6] * Math.PI / 180, false, 2, 2, armLen);
      draw(ctx, sp.body, b[o] + ox, b[o + 1], b[o + 2], flip, 8, hgt + 1);
      draw(ctx, sp.head, b[o + 3] + ox, b[o + 4], b[o + 5], flip, 6, 7);
      if (v.holder !== i && raised) draw(ctx, sp.arm, shx + ox, shy, b[o + 6] * Math.PI / 180, false, 2, 2, armLen);
      if (fxi && fxi.freeze > 0) iceBlock(ctx, b, o, ox, this.t);
    }
    // ball
    draw(ctx, this.ball, b[bi] + ox, b[bi + 1], b[bi + 2], false, this.ball.width / 2, this.ball.height / 2);
    if (v.holder >= 0) {
      var ho = v.holder * 7, s2 = this.spr[v.holder], hfx = v.fx ? v.fx[v.holder] : null;
      draw(ctx, s2.arm, s2.shoulder[0], s2.shoulder[1], b[ho + 6] * Math.PI / 180, false, 2, 2, hfx && hfx.arms > 0 ? 1.5 : 1);
    }
    if (v.items) this.drawItems(ctx, v.items, ox);
    this.drawSparks(ctx, ox, dt);
    if (b[bi + 1] < -4) { var ax = Math.round(b[bi] + ox); px(ctx, '#fff', ax, 2, 1, 1); px(ctx, '#fff', ax - 1, 3, 3, 1); px(ctx, '#fff', ax - 2, 4, 5, 1); }

    this.hoop(ctx, L.hoops[0], true, ox);
    this.hoop(ctx, L.hoops[1], true, ox);

    if (L.place === 'snow') {
      ctx.fillStyle = '#fff';
      for (i = 0; i < this.flakes.length; i++) { var fl = this.flakes[i]; fl.y += fl.v * dt; fl.x += Math.sin(fl.y * 0.06 + i) * 0.15; if (fl.y > H) { fl.y = -2; fl.x = Math.random() * W; } ctx.fillRect(Math.round(fl.x % W), Math.round(fl.y), fl.s, fl.s); }
    }
    if (ch) this.chaosCrowd(ctx, ch, W, L);
    ctx.restore();
    if (ch) {
      // color flashes
      var COLORS = ['rgba(255,0,140,0.18)', 'rgba(0,255,200,0.16)', 'rgba(255,230,0,0.16)', 'rgba(120,80,255,0.18)'];
      ctx.fillStyle = COLORS[Math.floor(ch.t * 7) % COLORS.length]; ctx.fillRect(0, 0, W, H);
    }

    if (this.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (this.flash * 1.2).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); this.flash -= dt; }

    // labels over the players at the start of a round (v.hints has one label or null per player)
    var showHints = v.hints && v.roundTime < 3 && v.state === 'play' && Math.floor(v.roundTime * 4) % 2 === 0;
    for (i = 0; i < n; i++) {
      var hint = showHints ? v.hints[i] : null, T = TEAM[L.teams[i]];
      var hx = b[i * 7 + 3] + ox, hy = b[i * 7 + 4] - 18;
      if (hint) text(ctx, hint, 8, hx, hy - 9, '#ffffff', T.uiD);
      // the little arrow: during the label blink, and always over your own player in a party room
      if (hint || (v.me === i && v.state !== 'over')) {
        px(ctx, T.ui, Math.round(hx) - 2, Math.round(hy) + 1, 5, 1); px(ctx, T.ui, Math.round(hx) - 1, Math.round(hy) + 2, 3, 1); px(ctx, T.ui, Math.round(hx), Math.round(hy) + 3, 1, 1);
      }
      // active boosts: small icons just above the head (above the arrow if there is one), not while the
      // start-of-round label is shown there, and below where a boost's name rises after a pickup
      if (!hint && v.fx && v.fx[i]) this.fxIcons(ctx, v.fx[i], hx, v.me === i ? hy : hy + 10);
    }
    this.drawPops(ctx, b, ox, dt);
    if (!v.menu) this.hud(v);
  };

  // Chaos crowd: lots of extra players and balls that fly, bounce, and spin. They are only pictures (no physics),
  // made from the chaos seed and time, so the host and the guest see the same crowd.
  Renderer.prototype.chaosCrowd = function (ctx, ch, W, L) {
    var r = rnd(ch.seed), i, x, y, u;
    for (i = 0; i < 18; i++) {
      var sp = this.spr[Math.floor(r() * this.spr.length)], vx = (r() - 0.5) * 180, x0 = r() * W, period = 0.7 + r() * 1.1, jump = 40 + r() * 100;
      var turn = (r() - 0.5) * 14, phase = r();
      x = (((x0 + vx * ch.t) % (W + 40)) + W + 40) % (W + 40) - 20;
      u = (ch.t / period + phase) % 1;
      y = GROUND - 4 * jump * u * (1 - u);
      var a = turn * ch.t, hgt = L.chars.h;
      draw(ctx, sp.body, x, y, a, vx < 0, 8, hgt + 1);
      draw(ctx, sp.head, x + Math.sin(a) * (hgt + 2), y - Math.cos(a) * (hgt + 2), a * 1.5, vx < 0, 6, 7);
    }
    for (i = 0; i < 10; i++) {
      var bvx = (r() - 0.5) * 240, bx0 = r() * W, bp = 0.5 + r() * 0.8, bj = 30 + r() * 110, bphase = r();
      x = (((bx0 + bvx * ch.t) % (W + 20)) + W + 20) % (W + 20) - 10;
      u = (ch.t / bp + bphase) % 1;
      y = GROUND - 6 - 4 * bj * u * (1 - u);
      draw(ctx, this.ball, x, y, ch.t * 10 + i, false, this.ball.width / 2, this.ball.height / 2);
    }
    var big = ptext('CHAOS!', 16, ['#ffffff', '#ffd34d', '#ff4fa3'], '#17120f', '#000');
    var cx = W / 2 + Math.sin(ch.t * 3) * 60, cy = 40 + Math.cos(ch.t * 4.3) * 18;
    draw(ctx, big, cx, cy, Math.sin(ch.t * 6) * 0.4, false, big.width / 2, big.height / 2);
  };

  function chip(ctx, x, y, w, h, fill, dark) {
    px(ctx, 'rgba(0,0,0,0.35)', x + 1, y + 2, w, h);
    px(ctx, dark, x, y, w, h); px(ctx, fill, x + 1, y + 1, w - 2, h - 2);
    px(ctx, shade(fill, 1.3), x + 1, y + 1, w - 2, 1);
  }

  Renderer.prototype.hud = function (v) {
    var ctx = this.ctx, W = this.W, cx = Math.round(W / 2);
    // score in the bottom corners, on each team's own side: team 0 (left), team 1 (right)
    for (var t = 0; t < 2; t++) {
      var T = TEAM[t], bw2 = 34, x = scoreX(t, W, bw2), y = H - 20, inner = t === 0 ? 0 : 1;
      px(ctx, '#17120f', x, y - 1, bw2, 21);
      px(ctx, T.ui, x + inner, y, bw2 - 1, 20);
      px(ctx, shade(T.ui, 1.25), x + inner, y, bw2 - 1, 2);
      px(ctx, shade(T.ui, 0.8), x + inner, y + 17, bw2 - 1, 3);
      text(ctx, String(v.score[t]), 8, x + bw2 / 2, y + 5, '#ffffff', '#17120f');
    }
    // pause button
    px(ctx, '#17120f', W - 13, 4, 10, 12); px(ctx, '#ffffff', W - 12, 5, 3, 10); px(ctx, '#ffffff', W - 7, 5, 3, 10);
    // round title, split into lines so it never runs past the screen edges
    var parts = v.L.titleParts || [];
    if (parts.length && v.state === 'play' && v.roundTime < 2.6) {
      var a = v.roundTime < 2.1 ? 1 : (2.6 - v.roundTime) / 0.5;
      var lines = wrapParts(parts.map(function (p) { return p.toUpperCase(); }), Math.floor((W - 40) / 8));
      var widest = 0, imgs = lines.map(function (l) { var c = ptext(l, 8, '#ffe7a3', '#17120f'); widest = Math.max(widest, c.width); return c; });
      ctx.globalAlpha = Math.max(0, a);
      px(ctx, 'rgba(0,0,0,0.45)', Math.round(cx - widest / 2) - 4, 30, widest + 8, imgs.length * 12 + 3);
      for (var li = 0; li < imgs.length; li++) ctx.drawImage(imgs[li], Math.round(cx - imgs[li].width / 2), 32 + li * 12);
      ctx.globalAlpha = 1;
    }
    if (v.state === 'goal' && v.lastScorer >= 0) {
      var T2 = TEAM[v.lastScorer], el = 1.8 - v.timer, pop = el < 0.2 ? Math.round((0.2 - el) * 60) : 0;
      text(ctx, 'POINT!', 16, cx, 52 - pop, '#ffffff', T2.uiD, null, '#000');
      text(ctx, T2.name, 8, cx, 76, T2.glow, '#17120f');
    }
    if (v.state === 'over') {
      ctx.fillStyle = 'rgba(8,8,12,0.6)'; ctx.fillRect(0, 0, W, H);
      var w = v.score[0] > v.score[1] ? 0 : 1, T3 = TEAM[w];
      var lbl = v.winLabel || (T3.name + ' WINS');
      text(ctx, lbl, fitSize(lbl, W - 16), cx, 62, ['#ffffff', '#ffffff', T3.glow], T3.uiD, null, '#000');
      text(ctx, v.score[0] + ' : ' + v.score[1], 16, cx, 90, '#ffe7a3', '#17120f');
      if (v.timer <= 0 && Math.floor(this.t * 2) % 2 === 0) text(ctx, v.restartHint || 'PRESS TO PLAY AGAIN', 8, cx, 122, '#ffffff', '#17120f');
    }
    if (v.status) text(ctx, v.status, 8, 4, 22, 'rgba(255,255,255,0.8)', '#17120f', 'left');
  };

  // ---------- main menu ----------
  // items: [{ id, x, y, w, h, label }] in canvas pixels, built by buildMenu() in game.js
  Renderer.prototype.menu = function (hover, items) {
    var ctx = this.ctx, W = this.W, cx = Math.round(W / 2), t = this.t;
    px(ctx, 'rgba(10,10,14,0.78)', 0, 12, W, 34);
    px(ctx, 'rgba(255,255,255,0.12)', 0, 12, W, 1); px(ctx, 'rgba(255,255,255,0.12)', 0, 45, W, 1);
    var a = ptext('WOBBLE', 16, ['#ffffff', '#e6fff2', '#9ff0c4'], '#14482f', '#000');
    var b = ptext('HOOPS', 16, ['#f1e6ff', '#d2b8ff', '#a785ee'], '#33195e', '#000');
    var x0 = cx - Math.round((a.width + b.width + 6) / 2), bob = Math.round(Math.sin(t * 2.5));
    ctx.drawImage(a, x0, 20 + bob); ctx.drawImage(b, x0 + a.width + 6, 20 - bob);
    for (var i = 0; i < items.length; i++) {
      var it = items[i], hov = hover === it.id, by = it.y + (hov ? -1 : 0);
      var tc = ptext(it.label, 8, '#2a1606', null);
      // a toggle button (it.on true/false) is green when on and grey when off
      var face = it.on === true ? (hov ? '#a6f08f' : '#7ddc6b') : it.on === false ? (hov ? '#c4c8d2' : '#a9adbb') : (hov ? '#ffcf5a' : '#ffb52e');
      chip(ctx, it.x, by, it.w, it.h, face, it.on === undefined ? '#5a3208' : '#2a2f38');
      ctx.drawImage(tc, Math.round(it.x + it.w / 2 - tc.width / 2), Math.round(by + it.h / 2 - tc.height / 2) + 1);
    }
    var help = ptext('W / ↑ / SPACE / CLICK', 8, 'rgba(255,255,255,0.8)', '#17120f');
    px(ctx, 'rgba(10,10,14,0.55)', Math.round(cx - help.width / 2) - 4, 171, help.width + 8, help.height + 4);
    ctx.drawImage(help, Math.round(cx - help.width / 2), 173);
  };

export var Render = { Renderer: Renderer, TEAM: TEAM, H: H, text: text, ptext: ptext, clearText: function () { tcache = {}; } };

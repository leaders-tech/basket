/*
This file runs the game: main menu, keyboard and mouse controls, the game loop, and online play over /ws/game.
Edit this file when menus, controls, on-screen hints, or online play messages change.
Do not copy this file. GamePage.tsx calls startGame() once and calls the returned stop() when the page closes.
*/

import { Sim } from "./sim.js";
import { Render } from "./render.js";
import { createSound } from "./sound.js";

export const SOCKET_PATH = "/ws/game";

export function startGame() {
  var DT = Sim.DT, H = Render.H;
  var canvas = document.getElementById('c');
  var R = new Render.Renderer(canvas);
  var $ = function (id) { return document.getElementById(id); };
  var Sfx = createSound();
  // One AbortController removes every event listener when the page closes.
  var life = new AbortController(), opt = { signal: life.signal }, stopped = false, rafId = 0;
  function on(target, type, fn, extra) { target.addEventListener(type, fn, Object.assign({}, extra || {}, opt)); }

  // ---------- state ----------
  var mode = 'menu';            // menu | cpu | local | host | guest
  var game = new Sim.Game();
  var bots = [new Sim.Bot(0, 1), new Sim.Bot(1, 1)];
  var keys = { team0: false, team1: false, mine: false };
  var remoteKey = false, ws = null, roomCode = null;
  var snaps = [], guestLayouts = {}, tickN = 0, netEvents = [];
  var hover = null, menuItems = [];

  function panel(id) {
    ['p-online', 'p-wait', 'p-connect'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
    $('panels').classList.toggle('hidden', !id);
  }
  function toast(text, ms) {
    var t = $('toast'); t.textContent = text; t.classList.remove('hidden');
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.add('hidden'); }, ms || 3000);
  }
  function hint(t) { $('hint').textContent = t || ''; $('hint').classList.toggle('hidden', !t); }

  var BUTTON = 'W, ↑, Space or click';
  function startLocal(m) {
    closeNet(); panel(null);
    mode = m; game = new Sim.Game();
    bots = [new Sim.Bot(0, 1), new Sim.Bot(1, 1)];
    keys.team0 = keys.team1 = keys.mine = false;
    hint(m === 'local' ? 'Green: W · Purple: ↑ · Esc: menu' : 'Hold ' + BUTTON + ', then let go to shoot · Esc: menu');
    Sfx.play('round');
  }
  function toMenu() {
    closeNet(); panel(null); hint('');
    mode = 'menu'; game = new Sim.Game(); bots = [new Sim.Bot(0, 1), new Sim.Bot(1, 1)];
  }
  function openOnline() {
    $('net-err').textContent = ''; $('code-in').value = '';
    panel('p-online');
    setTimeout(function () { if (!stopped) $('code-in').focus(); }, 50);
  }

  on($('b-create'), 'click', function () { Sfx.play('click'); connect(function () { send({ t: 'create' }); }); });
  on($('b-join'), 'click', function () { Sfx.play('click'); joinByInput(); });
  on($('b-back'), 'click', function () { Sfx.play('click'); panel(null); });
  on($('b-cancel'), 'click', function () { Sfx.play('click'); toMenu(); });
  on($('b-copy'), 'click', function () {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(roomCode).then(function () { toast('Code copied', 1500); }, function () { });
  });
  on($('code-in'), 'keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') joinByInput(); if (e.key === 'Escape') panel(null); });
  on($('code-in'), 'input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
  on($('b-mute'), 'click', function () {
    var m = Sfx.toggle(); this.textContent = m ? '🔇' : '🔊'; this.setAttribute('aria-label', m ? 'Sound off' : 'Sound on'); this.blur();
  });

  function joinByInput() {
    var code = $('code-in').value.trim().toUpperCase();
    if (code.length !== 4) { $('net-err').textContent = 'The code has 4 characters.'; return; }
    connect(function () { send({ t: 'join', code: code }); });
  }

  // ---------- network ----------
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function closeNet() {
    if (ws) { var w = ws; ws = null; try { w.onclose = null; w.close(); } catch { } }
    roomCode = null; snaps = []; remoteKey = false;
  }
  function connect(onOpen) {
    closeNet(); panel('p-connect');
    var w;
    try { w = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + SOCKET_PATH); } catch { netFail('Could not connect.'); return; }
    ws = w;
    w.onopen = onOpen;
    w.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch { return; } onNet(m); };
    w.onclose = function () {
      if (ws !== w) return;
      ws = null;
      if (mode === 'host' || mode === 'guest') { toMenu(); toast('Lost connection to the server.', 4000); }
      else netFail('Cannot reach the game server. Please try again.');
    };
  }
  function netFail(msg) { panel('p-online'); $('net-err').textContent = msg; }

  function onNet(m) {
    switch (m.t) {
      case 'created':
        roomCode = m.code;
        var tiles = $('room-code'); tiles.innerHTML = '';
        m.code.split('').forEach(function (ch) { var s = document.createElement('span'); s.textContent = ch; tiles.appendChild(s); });
        $('room-addr').textContent = location.host;
        $('room-local').classList.toggle('hidden', !/^(localhost|127\.|\[::1\])/.test(location.host));
        panel('p-wait');
        break;
      case 'error':
        netFail(m.msg); if (ws) { ws.onclose = null; ws.close(); ws = null; }
        break;
      case 'peer-joined':
        mode = 'host'; game = new Sim.Game(); remoteKey = false; panel(null);
        hint('Room ' + roomCode + ' · you are GREEN (left) · button: ' + BUTTON + ' · Esc: leave');
        Sfx.play('round'); toast('Your opponent joined!', 2000);
        break;
      case 'joined':
        mode = 'guest'; roomCode = m.code; snaps = []; panel(null);
        hint('Room ' + m.code + ' · you are PURPLE (right) · button: ' + BUTTON + ' · Esc: leave');
        toast('Joined room ' + m.code, 2000);
        break;
      case 'peer-left':
        toMenu(); toast('Your opponent left the game.', 4000);
        break;
      case 'i':
        if (mode === 'host') remoteKey = !!m.d;
        break;
      case 's':
        if (mode !== 'guest') break;
        snaps.push({ at: performance.now(), s: m });
        if (snaps.length > 12) snaps.shift();
        if (m.ev) for (var i = 0; i < m.ev.length; i++) handleEvent(m.ev[i]);
        break;
    }
  }

  // ---------- input ----------
  var KEYS0 = { KeyW: 1 }, KEYS1 = { ArrowUp: 1 }, ANY = { KeyW: 1, ArrowUp: 1, Space: 1 };
  function setMine(down) {
    if (keys.mine === down) return;
    keys.mine = down;
    if (mode === 'guest') send({ t: 'i', d: down ? 1 : 0 });
  }
  function panelOpen() { return !$('panels').classList.contains('hidden'); }
  on(window, 'keydown', function (e) {
    if (e.code === 'Escape') { if (panelOpen()) { if (mode === 'menu') { closeNet(); panel(null); } } else if (mode !== 'menu') toMenu(); return; }
    if (e.code === 'KeyM') { $('b-mute').click(); return; }
    if (ANY[e.code]) e.preventDefault();
    if (e.repeat || panelOpen()) return;
    Sfx.unlock();
    if (mode === 'menu') { if (e.code === 'Enter' || e.code === 'Space') { startLocal('cpu'); } return; }
    if (mode === 'local') { if (KEYS0[e.code]) keys.team0 = true; if (KEYS1[e.code]) keys.team1 = true; }
    else if (ANY[e.code]) setMine(true);
  });
  on(window, 'keyup', function (e) {
    if (mode === 'local') { if (KEYS0[e.code]) keys.team0 = false; if (KEYS1[e.code]) keys.team1 = false; }
    else if (ANY[e.code]) setMine(false);
  });

  function logical(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * R.W, y: (e.clientY - r.top) / r.height * H };
  }
  function itemAt(p) {
    for (var i = 0; i < menuItems.length; i++) { var it = menuItems[i]; if (p.x >= it.x - 2 && p.x <= it.x + it.w + 2 && p.y >= it.y - 2 && p.y <= it.y + it.h + 2) return it.id; }
    return null;
  }
  on(canvas, 'pointermove', function (e) {
    if (mode !== 'menu' || panelOpen()) { hover = null; canvas.style.cursor = mode === 'menu' ? 'default' : 'pointer'; return; }
    hover = itemAt(logical(e)); canvas.style.cursor = hover ? 'pointer' : 'default';
  });
  on(canvas, 'pointerdown', function (e) {
    e.preventDefault(); Sfx.unlock();
    var p = logical(e);
    if (mode === 'menu') {
      if (panelOpen()) return;
      var id = itemAt(p);
      if (id) Sfx.play('click');
      if (id === '1p') startLocal('cpu'); else if (id === '2p') startLocal('local'); else if (id === 'net') openOnline();
      return;
    }
    if (p.x > R.W - 16 && p.y < 20) { toMenu(); return; }  // pause button: back to the menu
    if (mode !== 'local') setMine(true);
  });
  on(window, 'pointerup', function () { if (mode !== 'local') setMine(false); });
  on(window, 'blur', function () { keys.team0 = keys.team1 = false; setMine(false); });

  // ---------- events ----------
  var currentView = null;
  function handleEvent(e) {
    if (mode !== 'menu') Sfx.play(e);
    if (currentView) R.onEvent(e, currentView);
  }

  // ---------- simulation ----------
  function tick() {
    if (mode === 'guest') return;
    var k0, k1;
    if (mode === 'menu') { k0 = bots[0].update(game); k1 = bots[1].update(game); }
    else if (mode === 'cpu') { k0 = keys.mine; k1 = bots[1].update(game); }
    else if (mode === 'local') { k0 = keys.team0; k1 = keys.team1; }
    else if (mode === 'host') { k0 = keys.mine; k1 = remoteKey; }
    game.setKey(0, k0); game.setKey(1, k1);
    game.step();
    var ev = game.takeEvents();
    for (var i = 0; i < ev.length; i++) { handleEvent(ev[i]); if (mode === 'host') netEvents.push(ev[i]); }
    if (mode === 'menu' && game.state === 'over') game = new Sim.Game();
    tickN++;
    if (mode === 'host' && tickN % 2 === 0) {
      var b = game.bodies();
      for (var j = 0; j < b.length; j++) b[j] = Math.round(b[j] * 100) / 100;
      send({ t: 's', r: game.round, c: game.cfg, b: b, sc: game.score, st: game.state, tm: Math.round(game.timer * 100) / 100,
        ls: game.lastScorer, rt: Math.round(game.roundTime * 100) / 100, h: game.holder, ev: netEvents });
      netEvents = [];
    }
  }

  function lerpA(a, b, t) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
  function hostView() {
    var hints = mode === 'local' ? ['W', '↑'] : (mode === 'cpu' || mode === 'host') ? ['YOU', null] : null;
    var win = null;
    if ((mode === 'cpu' || mode === 'host') && game.state === 'over') win = game.score[0] > game.score[1] ? 'YOU WIN!' : (mode === 'cpu' ? 'COMPUTER WINS' : 'OPPONENT WINS');
    return { L: game.L, key: 'r' + game.round + '_' + game.cfg.seed, bodies: game.bodies(), score: game.score, state: game.state, timer: game.timer,
      lastScorer: game.lastScorer, roundTime: game.roundTime, holder: game.holder, hints: hints, menu: mode === 'menu', winLabel: win,
      status: null };
  }
  function guestView() {
    if (!snaps.length) return null;
    var rt = performance.now() - 80, a = snaps[0], b2 = null;
    for (var i = 0; i < snaps.length; i++) { if (snaps[i].at <= rt) a = snaps[i]; else { b2 = snaps[i]; break; } }
    var s = a.s, bodies;
    if (b2 && b2.s.r === s.r && b2.at > a.at) {
      var t = Math.min(1, Math.max(0, (rt - a.at) / (b2.at - a.at)));
      bodies = new Array(s.b.length);
      for (var k = 0; k < s.b.length; k++) {
        var slot = k < 28 ? k % 7 : (k - 28) + 7;
        if (slot === 2 || slot === 5 || slot === 9) bodies[k] = lerpA(s.b[k], b2.s.b[k], t);
        else bodies[k] = s.b[k] + (b2.s.b[k] - s.b[k]) * t;
      }
    } else { s = snaps[snaps.length - 1].s; bodies = s.b; }
    var key = 'r' + s.r + '_' + s.c.seed;
    if (!guestLayouts[key]) guestLayouts[key] = Sim.layout(s.c);
    return { L: guestLayouts[key], key: key, bodies: bodies, score: s.sc, state: s.st, timer: s.tm, lastScorer: s.ls, roundTime: s.rt, holder: s.h,
      hints: [null, 'YOU'], winLabel: s.st === 'over' ? (s.sc[1] > s.sc[0] ? 'YOU WIN!' : 'OPPONENT WINS') : null, status: null };
  }

  // Menu buttons in canvas pixels. They are stacked in one column so labels never overlap.
  function buildMenu() {
    var bw = 104, bh = 18, x = Math.round(R.W / 2 - bw / 2);
    menuItems = [
      { id: '1p', x: x, y: 60, w: bw, h: bh, label: '1 PLAYER' },
      { id: '2p', x: x, y: 86, w: bw, h: bh, label: '2 PLAYERS' },
      { id: 'net', x: x, y: 112, w: bw, h: bh, label: 'ONLINE' }
    ];
  }

  // ---------- loop ----------
  var last = performance.now(), acc = 0;
  function frame(now) {
    if (stopped) return;
    var dt = Math.min(0.25, (now - last) / 1000); last = now;
    acc += dt;
    while (acc >= DT) { tick(); acc -= DT; }
    var v = mode === 'guest' ? guestView() : hostView();
    if (v) {
      v.dt = dt; currentView = v;
      R.draw(v);
      if (mode === 'menu' && !panelOpen()) R.menu(hover, menuItems);
      else if (mode === 'menu') { R.ctx.fillStyle = 'rgba(8,8,12,0.45)'; R.ctx.fillRect(0, 0, R.W, H); }
    } else {
      R.ctx.fillStyle = '#15161a'; R.ctx.fillRect(0, 0, R.W, H);
      Render.text(R.ctx, 'WAITING FOR HOST...', 8, R.W / 2, 90, '#ffffff', '#000');
    }
    rafId = requestAnimationFrame(frame);
  }

  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var W = R.resize(H * vw / vh);
    var s = Math.min(vw / W, vh / H);
    var wrap = $('wrap');
    wrap.style.width = Math.round(W * s) + 'px'; wrap.style.height = Math.round(H * s) + 'px';
    wrap.style.setProperty('--s', s.toFixed(3));
    // The hint sits at the bottom between the two score boxes (each 34 canvas pixels wide).
    wrap.style.setProperty('--chip', Math.ceil(36 * s) + 'px');
    buildMenu();
  }
  on(window, 'resize', resize);
  resize();  // size the canvas and menu buttons right away, so early clicks already work

  var fontsReady = document.fonts ? document.fonts.load('8px "Press Start 2P"') : Promise.resolve();
  fontsReady.catch(function () { }).then(function () {
    if (stopped) return;
    Render.clearText();
    resize();
    rafId = requestAnimationFrame(frame);
  });

  return function stop() {
    stopped = true;
    cancelAnimationFrame(rafId);
    clearTimeout(toast.h);
    life.abort();
    closeNet();
    Sfx.close();
  };
}

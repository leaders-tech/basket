/*
This file runs the game: main menu, keyboard and mouse controls, the game loop, and online play over /ws/game.
Edit this file when menus, controls, on-screen hints, or online play messages change.
Do not copy this file. GamePage.tsx calls startGame() once and calls the returned stop() when the page closes.
*/

import { Sim } from "./sim.js";
import { Render } from "./render.js";
import { createSound } from "./sound.js";
import { COMBO_KEYS, UNLOCK_KEYS, comboFor, createCheatUnlock } from "./combos.js";
import { createPeer } from "./p2p.js";
import { MAX_PLAYERS, addPlayer, canStart, playOrder, removePlayer, setTeam, teamCounts } from "./party.js";

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
  var mode = 'menu';            // menu | cpu | local | lobby | host | guest
  var game = new Sim.Game();
  var bots = [new Sim.Bot(0, 1), new Sim.Bot(1, 1)];
  var keys = { team0: false, team1: false, mine: false };
  var remoteKey = false, ws = null, roomCode = null;
  var tickN = 0, netEvents = [];
  // Online play. The host runs the real game. Guests send each button change with the game tick it is meant for ("at").
  // Host: guest button changes that wait for their tick, and how early each guest's pings arrive ("slack").
  var inputQueue = [], slacks = {};
  // Guest: its own copy of the game (lg). On every host snapshot it loads the host's state and replays its own button
  // presses on top, so its own player reacts at once. corr smooths small jumps when the host's state differs.
  var lg = null, ownHist = [], lastSnapTick = -1, pendingSnap = null, snapKeys = null, corr = null;
  var skew = 0, lastPingAt = 0, pingSeq = 0, lastSlackSeq = -1;
  var hover = null, menuItems = [];
  // Secret combos (see combos.js): locked until you press 1 four times in the first 5 seconds of a match.
  var held = {}, cheats = createCheatUnlock(5000, 4);
  // Party room (3+ players): null in other modes.
  // { host, myId, roster: [{ id, name, team }], ids: player id of every game player, myIdx: my game player }
  var party = null, remoteKeys = {};
  // Direct browser-to-browser connections (p2p.js). Host: one per guest id ('duo' in a 1 vs 1 room). Guest: hostPeer.
  var peers = {}, hostPeer = null;

  function panel(id) {
    ['p-online', 'p-wait', 'p-party', 'p-connect'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
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
    cheats.start(performance.now());
    hint(m === 'local' ? 'Green: W · Purple: ↑ · Esc: menu' : 'Hold ' + BUTTON + ', then let go to shoot · Esc: menu');
    Sfx.play('round');
  }
  function toMenu() {
    closeNet(); panel(null); hint(''); cheats.reset(); party = null;
    mode = 'menu'; game = new Sim.Game(); bots = [new Sim.Bot(0, 1), new Sim.Bot(1, 1)];
  }
  function openOnline() {
    $('net-err').textContent = ''; $('code-in').value = '';
    try { $('name-in').value = localStorage.getItem('wobble-name') || ''; } catch { }
    panel('p-online');
    setTimeout(function () { if (!stopped) $(($('name-in').value ? 'code-in' : 'name-in')).focus(); }, 50);
  }
  function myName() {
    var name = $('name-in').value.trim();
    try { localStorage.setItem('wobble-name', name); } catch { }
    return name;
  }

  on($('b-create'), 'click', function () { Sfx.play('click'); connect(function () { send({ t: 'create' }); }); });
  on($('b-party'), 'click', function () {
    Sfx.play('click');
    var name = myName();
    if (!name) { $('net-err').textContent = 'Type your name first.'; $('name-in').focus(); return; }
    connect(function () { send({ t: 'create-party', name: name }); });
  });
  on($('b-party-start'), 'click', function () { Sfx.play('click'); startParty(); });
  on($('b-party-leave'), 'click', function () { Sfx.play('click'); toMenu(); });
  on($('name-in'), 'keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') panel(null); });
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
    var name = myName();
    connect(function () { send({ t: 'join', code: code, name: name }); });
  }

  // ---------- party room ----------
  function teamOfId(id) {
    var idx = party.ids.indexOf(id);
    return idx >= 0 ? game.teams[idx] : 1;
  }
  function openLobby() {
    mode = 'lobby';
    var tiles = $('party-code'); tiles.innerHTML = '';
    roomCode.split('').forEach(function (ch) { var s = document.createElement('span'); s.textContent = ch; tiles.appendChild(s); });
    $('party-addr').textContent = location.host;
    renderLobby();
    panel('p-party');
  }
  // The admin changed the list: show it and send it to everyone.
  function lobbyChanged() { renderLobby(); send({ t: 'lobby', players: party.roster }); }
  function renderLobby() {
    var list = $('party-list'), counts = teamCounts(party.roster);
    list.innerHTML = '';
    party.roster.forEach(function (p) {
      var li = document.createElement('li'), name = document.createElement('span');
      name.className = 'pname'; name.textContent = p.name;
      var tags = [];
      if (p.id === 0) tags.push('admin');
      if (p.id === party.myId) tags.push('you');
      if (tags.length) { var small = document.createElement('small'); small.textContent = ' (' + tags.join(', ') + ')'; name.appendChild(small); }
      li.appendChild(name);
      if (party.host) {
        [['GREEN', 0, 'g'], ['PURPLE', 1, 'p']].forEach(function (t) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'tbtn ' + t[2] + (p.team === t[1] ? ' on' : ''); b.textContent = t[0];
          b.setAttribute('aria-label', 'Put ' + p.name + ' in ' + t[0]);
          b.onclick = function () { party.roster = setTeam(party.roster, p.id, t[1]); lobbyChanged(); };
          li.appendChild(b);
        });
      } else {
        var label = document.createElement('span');
        label.className = 'tlabel ' + (p.team === 0 ? 'g' : 'p'); label.textContent = p.team === 0 ? 'GREEN' : 'PURPLE';
        li.appendChild(label);
      }
      list.appendChild(li);
    });
    $('party-count').textContent = party.roster.length + ' / ' + MAX_PLAYERS + ' players · GREEN ' + counts[0] + ' · PURPLE ' + counts[1];
    $('b-party-start').classList.toggle('hidden', !party.host);
    $('b-party-start').disabled = !canStart(party.roster);
    $('party-note').textContent = !party.host ? 'Waiting for the admin to start the game.'
      : canStart(party.roster) ? 'Put players into teams, then press Start. Teams may be uneven.'
        : 'Each team needs at least one player.';
  }
  // Both the admin and the guests: set up who plays which game player, then hide the lobby.
  function beginParty(players) {
    var order = playOrder(players);
    party.roster = players;
    party.ids = order.map(function (p) { return p.id; });
    party.myIdx = party.ids.indexOf(party.myId);
    keys.mine = false;
    panel(null); cheats.start(performance.now());
    var myTeam = order[party.myIdx] ? order[party.myIdx].team : 0;
    hint('Room ' + roomCode + ' · you are ' + (myTeam === 0 ? 'GREEN (left)' : 'PURPLE (right)') + ' · button: ' + BUTTON + ' · Esc: leave');
    Sfx.play('round');
    return order;
  }
  function startParty() {
    if (!party || !party.host || !canStart(party.roster)) return;
    send({ t: 'lock' });   // nobody can join after the start
    send({ t: 'start', players: party.roster });
    var order = beginParty(party.roster);
    remoteKeys = {};
    game = new Sim.Game({ teams: order.map(function (p) { return p.team; }) });
    mode = 'host';
  }

  // ---------- direct connection (WebRTC) ----------
  // The host starts a direct connection to each guest. Setup messages ({t: 'rtc'}) travel through the game server.
  function startPeer(id) {
    if (peers[id]) peers[id].close();
    peers[id] = createPeer(true,
      function (d) { send(party ? { t: 'rtc', to: id, d: d } : { t: 'rtc', d: d }); },
      function (m) { if (party) m.from = id; onNet(m); },
      function () { $('wrap').dataset.link = 'direct'; });
  }
  function guestPeer() {
    if (!hostPeer) hostPeer = createPeer(false, function (d) { send({ t: 'rtc', d: d }); }, onNet, function () {
      $('wrap').dataset.link = 'direct';   // shows in the page for checks: the game talks to the host directly
      toast('Fast direct connection', 1500);
    });
    return hostPeer;
  }
  function closePeers() {
    for (var id in peers) if (peers[id]) peers[id].close();
    peers = {};
    if (hostPeer) hostPeer.close();
    hostPeer = null;
    delete $('wrap').dataset.link;
  }
  // Host: send a snapshot directly where possible. If some guest has no direct connection, the server gets it too
  // (guests drop the copy they already have).
  function sendSnapshot(snap) {
    var ids = Object.keys(peers), allDirect = ids.length > 0;
    ids.forEach(function (id) { if (!(peers[id] && peers[id].send(snap, true))) allDirect = false; });
    if (!allDirect) send(snap);
  }
  // Guest: send to the host directly if possible, otherwise through the server.
  function sendToHost(o) { if (!(hostPeer && hostPeer.send(o, false))) send(o); }

  // ---------- network ----------
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function closeNet() {
    closePeers();
    if (ws) { var w = ws; ws = null; try { w.onclose = null; w.close(); } catch { } }
    roomCode = null; remoteKey = false; resetNet();
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
      if (mode === 'host' || mode === 'guest' || mode === 'lobby') { toMenu(); toast('Lost connection to the server.', 4000); }
      else netFail('Cannot reach the game server. Please try again.');
    };
  }
  function netFail(msg) { panel('p-online'); $('net-err').textContent = msg; }

  function onNet(m) {
    switch (m.t) {
      case 'created':
        roomCode = m.code;
        if (m.party) {
          party = { host: true, myId: 0, roster: [{ id: 0, name: m.name, team: 0 }] };
          openLobby();
          break;
        }
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
        mode = 'host'; game = new Sim.Game(); remoteKey = false; panel(null); cheats.start(performance.now());
        startPeer('duo');
        hint('Room ' + roomCode + ' · you are GREEN (left) · button: ' + BUTTON + ' · Esc: leave');
        Sfx.play('round'); toast('Your opponent joined!', 2000);
        break;
      case 'p-join':
        if (mode !== 'lobby' || !party || !party.host) break;
        party.roster = addPlayer(party.roster, m.id, m.name);
        startPeer(m.id);
        Sfx.play('click'); lobbyChanged();
        break;
      case 'p-left':
        if (!party || !party.host) break;
        if (peers[m.id]) { peers[m.id].close(); delete peers[m.id]; }
        if (mode === 'lobby') { party.roster = removePlayer(party.roster, m.id); lobbyChanged(); break; }
        remoteKeys[m.id] = false;   // their player just stands still now
        var gone = party.roster.filter(function (p) { return p.id === m.id; })[0];
        toast((gone ? gone.name : 'A player') + ' left the game.', 3000);
        break;
      case 'lobby':
        if (mode !== 'lobby' || !party || party.host) break;
        party.roster = m.players; renderLobby();
        break;
      case 'start':
        if (mode !== 'lobby' || !party || party.host) break;
        beginParty(m.players);
        mode = 'guest'; resetNet();
        break;
      case 'joined':
        if (m.party) {
          roomCode = m.code;
          party = { host: false, myId: m.id, roster: [] };
          openLobby();
          break;
        }
        mode = 'guest'; roomCode = m.code; resetNet(); panel(null); cheats.start(performance.now());
        hint('Room ' + m.code + ' · you are PURPLE (right) · button: ' + BUTTON + ' · Esc: leave');
        toast('Joined room ' + m.code, 2000);
        break;
      case 'peer-left':
        var wasParty = !!party;
        toMenu(); toast(wasParty ? 'The admin left the room.' : 'Your opponent left the game.', 4000);
        break;
      case 'i':
        if (mode === 'host') queueInput(party ? m.from : 'duo', !!m.d, m.at);
        break;
      case 'ping':
        // how many ticks early this guest's message arrived; the guest uses it to stay a little ahead of the host
        if (mode === 'host') slacks[party ? m.from : 'duo'] = [m.q, m.at - game.tick];
        break;
      case 'c':
        // a guest pressed the cheat combo: shoot for their team
        if (mode === 'host') game.cheatShot(party ? teamOfId(m.from) : 1);
        break;
      case 'u':
        if (party && party.host) { uwu(false); send({ t: 'u', from: m.from }); }   // play it and pass it to everyone
        else if (party) { if (m.from !== party.myId) uwu(false); }
        else if (mode === 'host' || mode === 'guest') uwu(false);   // the other player pressed Z + U
        break;
      case 'x':
        if (mode === 'host') game.startChaos();   // the guest pressed Z + W
        break;
      case 'd':
        if (mode === 'host') game.stopBall();   // a guest pressed Z + S
        break;
      case 'rtc':
        if (party && party.host) { if (peers[m.from]) peers[m.from].signal(m.d); }
        else if (mode === 'host') { if (peers.duo) peers.duo.signal(m.d); }
        else if (!party || m.to === party.myId) { var hp = guestPeer(); if (hp) hp.signal(m.d); }
        break;
      case 's':
        if (mode !== 'guest' || m.st.tick <= lastSnapTick) break;   // an old or repeated snapshot
        lastSnapTick = m.st.tick;
        pendingSnap = m;
        var mySlack = m.sl && m.sl[party ? party.myId : 'duo'];
        if (mySlack && mySlack[0] !== lastSlackSeq) {
          lastSlackSeq = mySlack[0];
          skew += Math.max(-3, Math.min(6, TARGET_SLACK - mySlack[1]));
        }
        // the guest's own copy makes most sounds itself; only host-side surprises come from here
        if (m.ev) for (var i = 0; i < m.ev.length; i++) if (m.ev[i] === 'stop') handleEvent(m.ev[i]);
        break;
    }
  }

  // ---------- input ----------
  var KEYS0 = { KeyW: 1 }, KEYS1 = { ArrowUp: 1 }, ANY = { KeyW: 1, ArrowUp: 1, Space: 1 };
  function setMine(down) {
    if (keys.mine === down) return;
    keys.mine = down;
    if (mode === 'guest' && lg) {
      ownHist.push({ at: lg.tick, d: down });
      sendToHost({ t: 'i', d: down ? 1 : 0, at: lg.tick });
    }
  }
  function panelOpen() { return !$('panels').classList.contains('hidden'); }
  on(window, 'keydown', function (e) {
    if (e.code === 'Escape') {
      if (panelOpen()) { if (mode === 'menu') { closeNet(); panel(null); } else if (mode === 'lobby') toMenu(); }
      else if (mode !== 'menu') toMenu();
      return;
    }
    if (e.code === 'KeyM') { $('b-mute').click(); return; }
    if (ANY[e.code]) e.preventDefault();
    if (e.repeat || panelOpen()) return;
    Sfx.unlock();
    if (UNLOCK_KEYS[e.code]) { if (cheats.press(performance.now())) toast('Cheats unlocked!', 1500); return; }
    if (COMBO_KEYS[e.code]) {
      held[e.code] = true;
      var action = cheats.isUnlocked() ? comboFor(held, e.code) : null;
      if (action === 'cheat') cheat(); else if (action === 'uwu') uwu(true); else if (action === 'chaos') chaos(); else if (action === 'stop') stopBall();
      if (!ANY[e.code]) return;   // W is also the jump button, so it goes on to the controls below
    }
    if (mode === 'menu') { if (e.code === 'Enter' || e.code === 'Space') { startLocal('cpu'); } return; }
    if (mode === 'local') { if (KEYS0[e.code]) keys.team0 = true; if (KEYS1[e.code]) keys.team1 = true; }
    else if (ANY[e.code]) setMine(true);
  });
  on(window, 'keyup', function (e) {
    delete held[e.code];
    if (mode === 'local') { if (KEYS0[e.code]) keys.team0 = false; if (KEYS1[e.code]) keys.team1 = false; }
    else if (ANY[e.code]) setMine(false);
  });

  // Z + U: play the "uwu" sound here, and online tell the other players to play it too.
  function uwu(fromMe) {
    Sfx.play('uwu');
    if (!fromMe) return;
    if (party && party.host && mode === 'host') send({ t: 'u', from: 0 });
    else if (mode === 'host' || mode === 'guest') send({ t: 'u' });
  }
  // Z + W: chaos for everyone (the host runs it, so the guest asks the host).
  function chaos() {
    if (mode === 'menu' || mode === 'cpu' || mode === 'local' || mode === 'host') game.startChaos();
    else if (mode === 'guest') send({ t: 'x' });
  }
  // Z + S: the flying ball stops in the air and falls straight down (the host runs it, so the guest asks the host).
  function stopBall() {
    if (mode === 'cpu' || mode === 'local' || mode === 'host') game.stopBall();
    else if (mode === 'guest') sendToHost({ t: 'd' });
  }
  // Z + C: the ball you hold flies straight into the other team's hoop.
  function cheat() {
    if (mode === 'host' && party) game.cheatShot(game.teams[party.myIdx]);
    else if (mode === 'cpu' || mode === 'host') game.cheatShot(0);
    else if (mode === 'local') { if (!game.cheatShot(0)) game.cheatShot(1); }
    else if (mode === 'guest') send({ t: 'c' });
  }

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
  on(window, 'blur', function () { keys.team0 = keys.team1 = false; held = {}; setMine(false); });

  // ---------- events ----------
  var currentView = null;
  function handleEvent(e) {
    if ((mode !== 'menu' && mode !== 'lobby') || e === 'uwu-chaos') Sfx.play(e);   // the menu demo is quiet, except for chaos
    if (currentView) R.onEvent(e, currentView);
  }

  // ---------- online: host input timing ----------
  function applyInput(who, down) { if (who === 'duo') remoteKey = down; else remoteKeys[who] = down; }
  function queueInput(who, down, at) {
    // late (or far too early) button changes count right away
    if (typeof at !== 'number' || at <= game.tick || at > game.tick + 180) applyInput(who, down);
    else inputQueue.push({ at: at, who: who, d: down });
  }
  function applyDueInputs() {
    inputQueue = inputQueue.filter(function (q) { if (q.at > game.tick) return true; applyInput(q.who, q.d); return false; });
  }

  // ---------- online: guest prediction ----------
  var TARGET_SLACK = 3, START_LEAD = 6, MAX_REPLAY = 90;
  function resetNet() {
    lg = null; ownHist = []; lastSnapTick = -1; pendingSnap = null; snapKeys = null; corr = null;
    skew = 0; lastSlackSeq = -1; inputQueue = []; slacks = {};
  }
  function ownKeyAt(t) {
    var d = false;
    for (var i = 0; i < ownHist.length && ownHist[i].at <= t; i++) d = ownHist[i].d;
    return d;
  }
  // Set every player's button in the guest copy for the step at tick t, the same way the host does.
  function setGuestKeys(t) {
    var own = ownKeyAt(t);
    if (party) {
      var pk = (snapKeys.pkeys || []).slice();
      pk[party.myIdx] = own;
      lg.setPlayerKeys(pk);
      lg.setKey(0, pk.some(Boolean)); lg.setKey(1, false);
    } else {
      lg.setKey(0, !!snapKeys.keys[0]); lg.setKey(1, own);
    }
  }
  function stepGuest(playEvents) {
    setGuestKeys(lg.tick);
    lg.step();
    var ev = lg.takeEvents();
    if (playEvents) for (var i = 0; i < ev.length; i++) handleEvent(ev[i]);
  }
  // Load the newest host snapshot and replay our own button presses up to where we were.
  function rollback(m) {
    var st = m.st;
    snapKeys = { keys: st.keys, pkeys: st.pkeys };
    if (!lg) {
      lg = new Sim.Game({ teams: st.teams });
      lg.loadState(st);
      while (lg.tick < st.tick + START_LEAD) stepGuest(false);
      return;
    }
    // normally we replay up to where we already were; if we fell behind the host (hidden tab), jump ahead again
    var target = lg.tick > st.tick ? Math.min(lg.tick, st.tick + MAX_REPLAY) : st.tick + START_LEAD;
    var shown = guestBodies(), round = lg.round;
    lg.loadState(st);
    while (lg.tick < target) stepGuest(false);
    // keep showing where things were and slide them to the new place over a few frames
    var now = lg.bodies(), ballAngle = now.length - 1;
    corr = null;
    if (lg.round === round && shown.length === now.length) {
      corr = shown.map(function (x, k) {
        var d = x - now[k];
        if (k === ballAngle || (k < ballAngle - 2 && (k % 7 === 2 || k % 7 === 5))) d = Math.atan2(Math.sin(d), Math.cos(d));   // angles
        return Math.abs(d) > 40 ? 0 : d;   // a big jump (new ball, teleport) is shown at once
      });
    }
    var keep = lg.tick - 30;
    while (ownHist.length > 1 && ownHist[1].at <= keep) ownHist.shift();
  }
  function guestTick() {
    if (pendingSnap) { rollback(pendingSnap); pendingSnap = null; }
    if (!lg) return;
    var now = performance.now();
    if (now - lastPingAt > 250) { lastPingAt = now; sendToHost({ t: 'ping', at: lg.tick, q: ++pingSeq }); }
    // stay about TARGET_SLACK ticks ahead of the host: sometimes take an extra step, sometimes skip one
    if (skew < 0) { skew++; return; }
    stepGuest(true);
    if (skew > 0) { skew--; stepGuest(true); }
  }
  function guestBodies() {
    var b = lg.bodies();
    if (corr) for (var k = 0; k < b.length; k++) b[k] += corr[k] || 0;
    return b;
  }

  // ---------- simulation ----------
  function tick() {
    if (mode === 'guest') { guestTick(); return; }
    if (mode === 'host') applyDueInputs();
    var k0, k1;
    if (mode === 'menu' || mode === 'lobby') { k0 = bots[0].update(game); k1 = bots[1].update(game); }
    else if (mode === 'cpu') { k0 = keys.mine; k1 = bots[1].update(game); }
    else if (mode === 'local') { k0 = keys.team0; k1 = keys.team1; }
    else if (mode === 'host' && party) {
      // every player has their own button; any button after the end of a match starts a rematch
      var pk = party.ids.map(function (id, idx) { return idx === party.myIdx ? keys.mine : !!remoteKeys[id]; });
      game.setPlayerKeys(pk);
      k0 = pk.some(Boolean); k1 = false;
    }
    else if (mode === 'host') { k0 = keys.mine; k1 = remoteKey; }
    game.setKey(0, k0); game.setKey(1, k1);
    game.step();
    var ev = game.takeEvents();
    for (var i = 0; i < ev.length; i++) { handleEvent(ev[i]); if (mode === 'host') netEvents.push(ev[i]); }
    if ((mode === 'menu' || mode === 'lobby') && game.state === 'over') game = new Sim.Game();
    tickN++;
    if (mode === 'host' && tickN % 2 === 0) {
      // 30 times a second: the whole game state, so guests can replay from it
      sendSnapshot({ t: 's', st: game.saveState(), sl: slacks, ev: netEvents });
      netEvents = [];
    }
  }

  // Chaos info for drawing: { t: seconds since start, seed }, or null when there is no chaos.
  function chaosInfo(g) { return g.chaos > 0 ? { t: g.chaosTime, seed: g.chaosSeed } : null; }
  // One label (or null) per player, shown over them at the start of each round.
  function playerHints(teams) {
    if (party) return teams.map(function (t, i) { return i === party.myIdx ? 'YOU' : null; });
    if (mode === 'local') return teams.map(function (t) { return t === 0 ? 'W' : '↑'; });
    if (mode === 'cpu' || mode === 'host') return teams.map(function (t) { return t === 0 ? 'YOU' : null; });
    if (mode === 'guest') return teams.map(function (t) { return t === 1 ? 'YOU' : null; });
    return null;
  }
  function partyWinLabel(teams, score) {
    var mine = teams[party.myIdx];
    return score[mine] > score[1 - mine] ? 'YOUR TEAM WINS!' : 'YOUR TEAM LOST';
  }
  // What to draw for game g (the real game, or the guest's copy) with these body positions.
  function gameView(g, bodies) {
    var win = null;
    if (g.state === 'over') {
      if (party) win = partyWinLabel(g.teams, g.score);
      else if (mode === 'guest') win = g.score[1] > g.score[0] ? 'YOU WIN!' : 'OPPONENT WINS';
      else if (mode === 'cpu' || mode === 'host') win = g.score[0] > g.score[1] ? 'YOU WIN!' : (mode === 'cpu' ? 'COMPUTER WINS' : 'OPPONENT WINS');
    }
    return { L: g.L, key: 'r' + g.round + '_' + g.cfg.seed, bodies: bodies, score: g.shownScore(), state: g.state, timer: g.timer,
      chaos: chaosInfo(g), lastScorer: g.lastScorer, roundTime: g.roundTime, holder: g.holder, hints: playerHints(g.teams),
      menu: mode === 'menu' || mode === 'lobby', winLabel: win, me: party && (mode === 'host' || mode === 'guest') ? party.myIdx : -1, status: null };
  }
  function hostView() { return gameView(game, game.bodies()); }
  function guestView() {
    if (!lg) return null;
    if (corr) for (var k = 0; k < corr.length; k++) corr[k] *= 0.8;   // slide away the last correction
    return gameView(lg, guestBodies());
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
  // The game clock runs on its own: pump() runs every physics tick that is due. Animation frames call it,
  // and so does a small worker timer, which keeps the host running when its tab is hidden.
  var lastPump = performance.now(), acc = 0, lastFrame = lastPump;
  function pump() {
    var now = performance.now();
    acc += Math.min(0.25, (now - lastPump) / 1000); lastPump = now;
    while (acc >= DT) { tick(); acc -= DT; }
  }
  var ticker = null;
  try {
    ticker = new Worker(new URL('./ticker.js', import.meta.url), { type: 'module' });
    ticker.onmessage = function () { if (!stopped && mode === 'host') pump(); };
  } catch { ticker = null; }

  function frame(now) {
    if (stopped) return;
    var dt = Math.min(0.25, (now - lastFrame) / 1000); lastFrame = now;
    pump();
    var v = mode === 'guest' ? guestView() : hostView();
    if (v) {
      v.dt = dt; currentView = v;
      R.draw(v);
      if (mode === 'menu' && !panelOpen()) R.menu(hover, menuItems);
      else if (mode === 'menu' || mode === 'lobby') { R.ctx.fillStyle = 'rgba(8,8,12,0.45)'; R.ctx.fillRect(0, 0, R.W, H); }
    } else {
      R.ctx.fillStyle = '#15161a'; R.ctx.fillRect(0, 0, R.W, H);
      Render.text(R.ctx, 'WAITING FOR HOST...', 8, R.W / 2, 90, '#ffffff', '#000');
    }
    rafId = requestAnimationFrame(frame);
  }

  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (!vw || !vh) return;   // hidden tab with no size yet: wait for the next resize
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
  on(document, 'visibilitychange', resize);
  resize();  // size the canvas and menu buttons right away, so early clicks already work

  var fontsReady = document.fonts ? document.fonts.load('8px "Press Start 2P"') : Promise.resolve();
  fontsReady.catch(function () { }).then(function () {
    if (stopped) return;
    Render.clearText();
    resize();
    rafId = requestAnimationFrame(frame);
  });

  // Development only: lets tests and debugging look inside the running game (never in the built app).
  if (import.meta.env.DEV) window.__wobble = { get mode() { return mode; }, get game() { return game; }, get guestGame() { return lg; }, get party() { return party; } };

  return function stop() {
    stopped = true;
    cancelAnimationFrame(rafId);
    if (ticker) ticker.terminate();
    clearTimeout(toast.h);
    life.abort();
    closeNet();
    Sfx.close();
  };
}

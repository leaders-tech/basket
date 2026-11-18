/*
This file makes the game sounds with the Web Audio API. Most sounds are generated; "uwu" is a short sound file.
Edit this file when you want to change a sound or add a new one.
Copy one `case` line below when you add another sound effect, and one CLIPS entry when you add another sound file.
*/

import uwuUrl from "./sounds/uwu.mp3";

var CLIPS = { uwu: uwuUrl };

export function createSound() {
  var ac = null, muted = false, master = null, clips = {};
  function ctx() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination); } catch { return null; }
      for (var name in CLIPS) loadClip(name);   // load sound files early, so the first play has no delay
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function loadClip(name) {
    if (!clips[name]) {
      clips[name] = fetch(CLIPS[name]).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return ac.decodeAudioData(b); });
      clips[name].catch(function () { clips[name] = null; });
    }
    return clips[name];
  }
  // rate 1 is normal speed; bigger is faster and higher, smaller is slower and lower
  function clip(name, rate) {
    var a = ctx(); if (!a || muted) return;
    loadClip(name).then(function (buf) {
      if (muted || ac !== a) return;
      var s = a.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate || 1; s.connect(master); s.start();
    }, function () { });
  }
  function tone(f0, f1, dur, type, vol, delay) {
    var a = ctx(); if (!a || muted) return;
    var t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    var a = ctx(); if (!a || muted) return;
    var n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  var last = {};
  function play(name) {
    var now = performance.now();
    if (last[name] && now - last[name] < 45) return;
    last[name] = now;
    switch (name) {
      case 'bounce': tone(160, 70, 0.08, 'triangle', 0.3); break;
      case 'rim': tone(900, 860, 0.06, 'square', 0.05); tone(1350, 1300, 0.08, 'square', 0.035, 0.02); break;
      case 'board': noise(0.05, 0.3, 900); break;
      case 'hit': tone(240, 120, 0.05, 'square', 0.04); break;
      case 'jump': tone(300, 560, 0.05, 'square', 0.03); break;
      case 'land': noise(0.03, 0.12, 500); break;
      case 'catch': tone(620, 720, 0.04, 'triangle', 0.12); break;
      case 'shoot': tone(420, 900, 0.07, 'square', 0.04); break;
      case 'steal': tone(800, 300, 0.08, 'square', 0.045); break;
      case 'score': [523, 659, 784, 1046].forEach(function (f, i) { tone(f, f, 0.09, 'square', 0.055, i * 0.07); }); noise(0.25, 0.18, 3000); break;
      case 'win': [523, 659, 784, 1046, 784, 1046, 1318].forEach(function (f, i) { tone(f, f, 0.13, 'square', 0.055, i * 0.1); }); break;
      case 'round': tone(1700, 1650, 0.07, 'square', 0.035); tone(1700, 1650, 0.12, 'square', 0.035, 0.11); break;
      case 'redrop': tone(700, 300, 0.12, 'triangle', 0.1); break;
      case 'click': tone(880, 1200, 0.05, 'square', 0.05); break;
      case 'uwu': clip('uwu'); break;
      case 'uwu-chaos': clip('uwu', 0.6 + Math.random() * 1.2); break;   // chaos: uwu again and again, at random pitch
    }
  }
  return { play: play, unlock: ctx, toggle: function () { muted = !muted; return muted; }, close: function () { if (ac) { try { ac.close(); } catch { } ac = null; } } };
}

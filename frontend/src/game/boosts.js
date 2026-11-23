/*
This file is the boosts (power-ups) rule book: which boosts exist, when they appear on the court, how a player picks
one up, and how long it lasts. sim.js calls stepBoosts() every tick and reads player.fx to change jumps and arms.
Edit this file to add a boost, change how often they appear, or change how long they last.
Copy one entry in BOOSTS when you add another boost (then use its timer in sim.js and draw its icon in render.js).
*/

// good: helps the player who takes it (gold ring); bad: hurts the player who takes it (red ring).
// time: seconds it lasts. weight: how often it appears compared to the others.
export var BOOSTS = {
  jump: { good: true, time: 8, weight: 3, label: 'BIG JUMP', color: '#7dff8a' },
  speed: { good: true, time: 8, weight: 2, label: 'SPEED', color: '#ffe14d' },
  arms: { good: true, time: 8, weight: 2, label: 'LONG ARMS', color: '#6ee7ff' },
  slow: { good: false, time: 6, weight: 2, label: 'SLOW', color: '#c08bff' },
  freeze: { good: false, time: 2.5, weight: 2, label: 'FREEZE', color: '#a8e6ff' }
};
export var KINDS = Object.keys(BOOSTS);

var MAX_ON_COURT = 2;     // never more than this many boosts waiting on the court
export var LIFE = 10;     // seconds a boost waits before it disappears
var FIRST = [3, 6];       // seconds until the first boost of a round
var NEXT = [5, 10];       // seconds between boosts

// What the boost changes, used by sim.js.
export var JUMP_BOOST = 1.55, SPEED_SIDEWAYS = 1.8, SPEED_ARM = 1.6, SLOW_JUMP = 0.6, SLOW_ARM = 0.5, ARMS_REACH = 1.5;

export function newFx() { return { jump: 0, speed: 0, arms: 0, slow: 0, freeze: 0 }; }

// A new round: an empty court and a fresh timer.
export function resetBoosts(g) {
  g.items = [];
  g.nextBoost = g.boostsOn ? g.rnd(FIRST[0], FIRST[1]) : 0;
}

function pickKind(g) {
  var total = 0, i;
  for (i = 0; i < KINDS.length; i++) total += BOOSTS[KINDS[i]].weight;
  var r = g.random() * total;
  for (i = 0; i < KINDS.length; i++) { r -= BOOSTS[KINDS[i]].weight; if (r <= 0) return KINDS[i]; }
  return KINDS[0];
}

function segmentDistance(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  var t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

// Does player p touch the boost at (x, y)? Body, head, or hand.
function touches(g, p, x, y) {
  var f = g.feet(p), t = g.top(p), h = g.headPoint(p), hand = g.hand(p);
  return segmentDistance(x, y, f.x, f.y, t.x, t.y) < 8 ||
    Math.hypot(h.x - x, h.y - y) < 9 ||
    Math.hypot(hand.x - x, hand.y - y) < 7;
}

// Every tick: count down effects, spawn boosts, let players pick them up.
// Pickup events look like "boost:<kind>:<player index>:<x>:<y>" (sounds and sparkles use them).
export function stepBoosts(g, dt) {
  g.players.forEach(function (p) {
    KINDS.forEach(function (k) { if (p.fx[k] > 0) p.fx[k] = Math.max(0, p.fx[k] - dt); });
  });
  if (!g.boostsOn || g.state !== 'play') return;
  g.nextBoost -= dt;
  if (g.nextBoost <= 0) {
    g.nextBoost = g.rnd(NEXT[0], NEXT[1]);
    if (g.items.length < MAX_ON_COURT) {
      // somewhere above the middle of the court that a jump can reach, away from the hoops
      g.items.push({ kind: pickKind(g), x: Math.round(g.rnd(70, 220)), y: Math.round(g.rnd(68, 112)), age: 0 });
    }
  }
  g.items = g.items.filter(function (it) {
    it.age += dt;
    if (it.age > LIFE) return false;
    for (var i = 0; i < g.players.length; i++) {
      var p = g.players[i];
      if (!touches(g, p, it.x, it.y)) continue;
      var B = BOOSTS[it.kind];
      p.fx[it.kind] = B.time;
      if (it.kind === 'speed') p.fx.slow = 0;   // a good boost ends the matching bad one, and the other way round
      if (it.kind === 'slow') p.fx.speed = 0;
      g.events.push('boost:' + it.kind + ':' + i + ':' + it.x + ':' + it.y);
      return false;
    }
    return true;
  });
}

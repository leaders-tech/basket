/*
This file is the strong computer player for 1 PLAYER mode. It looks into the future: it copies the game, plays
ideas for pressing the button in the copy, and does one that works (the game is the same every time for the same
buttons, so the copy shows what will really happen).
- With the ball: it tries "wait W ticks, then hold the button for N ticks" throws until one goes in.
- Without the ball: it tries jump timings until one gets the ball for its team.
Edit this file when you want the computer to play differently (stronger, weaker, other ideas).
Do not copy this file. The simple Bot in sim.js is still used for the menu demo.
*/

import { Sim } from "./sim.js";

// Work per tick: about this many physics steps in the copy (one step is ~0.04 ms, so about 10 ms at most).
var STEPS_PER_TICK = 260;

// opts (for tuning and tests): { giveUp, grabLook } — see GIVE_UP and the look-ahead below.
export function createSmartBot(team, opts) {
  opts = opts || {};
  var sandbox = new Sim.Game();
  var plan = null;   // { start: tick, wait, hold, kind }: button up for `wait` ticks, then down for `hold`, then up
  var job = null;    // thinking in progress: { kind, round, start, state, ideas, next, tried: [[idea, score]] }

  function myHolder(g) { return g.holder >= 0 && g.players[g.holder].team === team; }
  function theirHolder(g) { return g.holder >= 0 && g.players[g.holder].team !== team; }

  // Ideas, best guesses first. Throws: holding 17-18 ticks (arm straight up) goes in about twice as often as others,
  // and often the very first moment already works.
  function shootIdeas() {
    var list = [];
    for (var wait = 1; wait <= 41; wait += 2) {
      [18, 17, 15, 12].forEach(function (hold) { list.push({ wait: wait, hold: hold }); });
    }
    return list;
  }
  var GIVE_UP = opts.giveUp || 24;   // ticks of holding the ball without a sure basket: then throw the best try anyway
  function grabIdeas() {
    var list = [{ wait: 60, hold: 0 }];   // do nothing
    [1, 2, 4, 6, 8, 11, 14, 18, 24].forEach(function (wait) {
      [4, 8, 14].forEach(function (hold) { list.push({ wait: wait, hold: hold }); });
    });
    return list;
  }
  function keyAt(idea, i) { return i >= idea.wait && i < idea.wait + idea.hold; }

  // Play one idea in the copy from the saved state. Returns [score (higher is better), steps done].
  function run(kind, state, idea, otherKey) {
    var g = sandbox, i, best = Infinity;
    g.loadState(state);
    var h = g.L.hoops[team === 0 ? 1 : 0], goal = { x: (h.openA + h.openB) / 2, y: h.rimY };
    var startScore = g.score.slice(), horizon = idea.wait + idea.hold + (kind === 'shoot' ? 90 : (opts.grabLook || 25));
    for (i = 0; i < horizon; i++) {
      g.setKey(team, keyAt(idea, i));
      g.setKey(1 - team, otherKey);
      g.step();
      g.takeEvents();
      if (g.score[team] > startScore[team]) return [1000 - i, i];
      if (g.score[1 - team] > startScore[1 - team]) return [-1000, i];
      if (theirHolder(g)) return [kind === 'shoot' ? -900 + i : -400 + i, i];
      if (g.state !== 'play') return [-500, i];
      var bp = g.ball.getPosition(), bx = bp.x / Sim.S, by = bp.y / Sim.S;
      if (kind === 'shoot') {
        if (g.holder < 0) {
          best = Math.min(best, Math.hypot(bx - goal.x, by - goal.y));
          if (by > goal.y + 25 && g.ball.getLinearVelocity().y > 0) break;   // fell past the hoop: a miss
        }
      } else if (myHolder(g)) {
        return [500 - i, i];
      }
    }
    if (kind === 'shoot') return [myHolder(g) ? -2000 : -best, i];
    var near = Infinity, bb = g.ball.getPosition();
    g.players.forEach(function (p) {
      if (p.team !== team) return;
      var hand = g.hand(p);
      near = Math.min(near, Math.hypot(hand.x - bb.x / Sim.S, hand.y - bb.y / Sim.S));
    });
    return [-near, i];
  }

  function startJob(game, kind) {
    // Rebuild the real game from its own save, so the copy matches it exactly (same fresh physics world).
    var state = game.saveState();
    game.loadState(state);
    job = { kind: kind, round: game.round, start: game.tick, state: state, ideas: kind === 'shoot' ? shootIdeas() : grabIdeas(),
      next: 0, tried: [] };
  }

  function choose(idea) { plan = { start: job.start, wait: idea.wait, hold: idea.hold, kind: job.kind }; job = null; }

  function work(game, otherKey) {
    var spent = 0, elapsed = game.tick - job.start;
    while (job.next < job.ideas.length && spent < STEPS_PER_TICK) {
      var idea = job.ideas[job.next++];
      if (idea.hold > 0 && idea.wait <= elapsed) continue;   // its first press is already in the past
      var r = run(job.kind, job.state, idea, otherKey);
      spent += r[1] + 3;
      if (r[0] > 0) { choose(idea); return; }   // a basket (or the ball for us): do it
      job.tried.push([idea, r[0]]);
    }
    var done = job.next >= job.ideas.length, giveUp = job.kind === 'shoot' && elapsed >= GIVE_UP;
    if (!done && !giveUp) return;   // keep thinking next tick
    // no sure thing: take the best idea that can still start
    var best = null, bestScore = -Infinity;
    job.tried.forEach(function (t) {
      var ok = t[0].hold === 0 || t[0].wait > elapsed + 1;
      if (ok && t[1] > bestScore) { bestScore = t[1]; best = t[0]; }
    });
    if (best) choose(best);
    else job = null;   // nothing left: think again from now
  }

  // Returns true when the computer's button should be down this tick. otherKey: the human's button right now.
  function update(game, otherKey) {
    if (game.state !== 'play') { plan = null; job = null; return false; }
    if (job && job.round !== game.round) job = null;
    if (plan) {
      var i = game.tick - plan.start, end = plan.wait + plan.hold;
      // a throw plan breaks if we lose the ball before the release; a jump plan ends when we get the ball
      var broken = plan.kind === 'shoot' ? (!myHolder(game) && i < end) : myHolder(game);
      // while only waiting for the ball, look again every 15 ticks: the human may have changed everything
      var stale = plan.kind === 'grab' && i >= 15 && i < plan.wait;
      if (i > end || broken || stale) plan = null;
      else return keyAt(plan, i);
    }
    var kind = myHolder(game) ? 'shoot' : 'grab';
    if (!job || job.kind !== kind) startJob(game, kind);
    work(game, otherKey);
    if (plan) return keyAt(plan, game.tick - plan.start);
    return false;
  }

  return { update: update };
}

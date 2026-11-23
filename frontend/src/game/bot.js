/*
This file is the strong computer player for 1 PLAYER mode. Each of its players has its own button.
It looks into the future: it copies the game, plays ideas for pressing the buttons in the copy, and does one that
works (the game is the same every time for the same buttons, so the copy shows what will really happen).
- With the ball: the player with the ball tries "wait W ticks, then hold the button for N ticks" throws until one
  goes in. The other player keeps still.
- Without the ball: it tries jump timings for one player, the other player, or both, until one wins the ball for its
  team (a steal, a block in the air, or a rebound), checking early jumps first and deciding within 6 ticks.
  (Tested: guessing what the human will do and jumping "just in case" made defense worse, so it plans with the
  human's button as it is now and looks again every 15 ticks.)
Edit this file when you want the computer to play differently (stronger, weaker, other ideas).
Do not copy this file. The simple Bot in sim.js is still used for the menu demo.
*/

import { Sim } from "./sim.js";

// Work per tick: about this many physics steps in the copy (one step is ~0.04 ms; measured: 99.9% of ticks under 11 ms).
var STEPS_PER_TICK = 180;

// opts (for tuning and tests): { giveUp, grabLook, stepsPerTick } — see GIVE_UP, run, and STEPS_PER_TICK.
export function createSmartBot(team, opts) {
  opts = opts || {};
  var sandbox = new Sim.Game();
  // An idea: { who: [player indexes that press], wait, hold }: those buttons are up for `wait` ticks, then down
  // for `hold` ticks, then up. Everyone else on our team keeps their button up.
  var plan = null;   // { start: tick, idea, kind }
  var job = null;    // thinking in progress: { kind, round, start, state, ideas, next, tried: [[idea, score]], otherKey }

  function myHolder(g) { return g.holder >= 0 && g.players[g.holder].team === team; }
  function theirHolder(g) { return g.holder >= 0 && g.players[g.holder].team !== team; }
  function myPlayers(g) { return g.players.filter(function (p) { return p.team === team; }).map(function (p) { return p.idx; }); }

  // Throw ideas for the player with the ball, best guesses first: holding 17-18 ticks (arm straight up) goes in about
  // twice as often as other holds, and often the very first moment already works.
  function shootIdeas(game) {
    var list = [], who = [game.holder];
    for (var wait = 1; wait <= 41; wait += 2) {
      [18, 17, 15, 12].forEach(function (hold) { list.push({ who: who, wait: wait, hold: hold }); });
    }
    return list;
  }
  var GIVE_UP = opts.giveUp || 24;   // ticks of holding the ball without a sure basket: then throw the best try anyway
  var GRAB_GIVE_UP = 6;   // ticks of thinking without the ball: then do the best jump found so far
  // Jump ideas without the ball: the player nearest the ball first, then the other one, then both together.
  function grabIdeas(game) {
    var bx = game.ball.getPosition().x / Sim.S;
    var mine = myPlayers(game).sort(function (a, b) {
      return Math.abs(game.feet(game.players[a]).x - bx) - Math.abs(game.feet(game.players[b]).x - bx);
    });
    var groups = mine.map(function (p) { return [p]; });
    if (mine.length > 1) groups.push(mine);
    var list = [{ who: [], wait: 60, hold: 0 }];   // do nothing
    [1, 2, 4, 6, 9, 13, 18, 24].forEach(function (wait) {
      [4, 10, 16].forEach(function (hold) {
        groups.forEach(function (who) { list.push({ who: who, wait: wait, hold: hold }); });
      });
    });
    return list;
  }
  function keyAt(idea, i, p) { return i >= idea.wait && i < idea.wait + idea.hold && idea.who.indexOf(p) >= 0; }
  // Buttons of every player at tick i of an idea: ours from the idea, the human's team from otherKey.
  function buttons(g, idea, i, otherKey) {
    return g.players.map(function (p) { return p.team === team ? keyAt(idea, i, p.idx) : otherKey; });
  }

  // Play one idea in the copy from the saved state. Returns [score (higher is better), steps done].
  function run(kind, state, idea, otherKey) {
    var g = sandbox, i, best = Infinity;
    g.loadState(state);
    var h = g.L.hoops[team === 0 ? 1 : 0], goal = { x: (h.openA + h.openB) / 2, y: h.rimY };
    var startScore = g.score.slice(), horizon = idea.wait + idea.hold + (kind === 'shoot' ? 90 : (opts.grabLook || 25));
    for (i = 0; i < horizon; i++) {
      g.setPlayerKeys(buttons(g, idea, i, otherKey));
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

  function startJob(game, kind, otherKey) {
    // Rebuild the real game from its own save, so the copy matches it exactly (same fresh physics world).
    var state = game.saveState();
    game.loadState(state);
    job = { kind: kind, round: game.round, start: game.tick, state: state, ideas: kind === 'shoot' ? shootIdeas(game) : grabIdeas(game),
      next: 0, tried: [], otherKey: otherKey };
  }

  function choose(idea) { plan = { start: job.start, idea: idea, kind: job.kind }; job = null; }

  function work(game) {
    var spent = 0, elapsed = game.tick - job.start;
    while (job.next < job.ideas.length && spent < (opts.stepsPerTick || STEPS_PER_TICK)) {
      var idea = job.ideas[job.next++];
      if (idea.hold > 0 && idea.wait <= elapsed) continue;   // its first press is already in the past
      var r = run(job.kind, job.state, idea, job.otherKey);
      spent += r[1] + 3;
      if (r[0] > 0) { choose(idea); return; }   // a basket (or the ball for us): do it
      job.tried.push([idea, r[0]]);
    }
    var done = job.next >= job.ideas.length;
    var giveUp = elapsed >= (job.kind === 'shoot' ? GIVE_UP : GRAB_GIVE_UP);
    if (!done && !giveUp) return;   // keep thinking next tick
    // no sure thing: take the best idea that can still start
    var best = null, bestScore = -Infinity;
    job.tried.forEach(function (t) {
      var ok = t[0].hold === 0 || t[0].wait > elapsed + 1;
      if (ok && t[1] > bestScore) { bestScore = t[1]; best = t[0]; }
    });
    // nothing that can still start: with the ball, throw now with the arm straight up (never get stuck holding it);
    // without the ball, think again from now
    if (!best && job.kind === 'shoot') best = { who: job.ideas[0].who, wait: elapsed + 1, hold: 17 };
    if (best) choose(best);
    else job = null;
  }

  function nobody(game) { return game.players.map(function () { return false; }); }

  // Returns the button of every player this tick (an array by player index; only our team's entries matter).
  // otherKey: the human's button right now.
  function update(game, otherKey) {
    if (game.state !== 'play') { plan = null; job = null; return nobody(game); }
    if (job && job.round !== game.round) job = null;
    if (plan) {
      var i = game.tick - plan.start, end = plan.idea.wait + plan.idea.hold;
      // a throw plan breaks if we lose the ball before the release; a jump plan ends when we get the ball
      var broken = plan.kind === 'shoot' ? (!myHolder(game) && i < end) : myHolder(game);
      // while only waiting for the ball, look again every 15 ticks: the human may have changed everything
      var stale = plan.kind === 'grab' && i >= 15 && i < plan.idea.wait;
      if (i > end || broken || stale) plan = null;
      else return buttons(game, plan.idea, i, false);
    }
    var kind = myHolder(game) ? 'shoot' : 'grab';
    if (!job || job.kind !== kind) startJob(game, kind, otherKey);
    work(game);
    if (plan) return buttons(game, plan.idea, game.tick - plan.start, false);
    return nobody(game);
  }

  return { update: update };
}

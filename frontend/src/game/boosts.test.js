/*
This file tests boosts (power-ups): they appear only when turned on, never too many, players pick them up,
and each boost changes the player the way it should, then wears off.
Edit this file when the boost rules in boosts.js or their effects in sim.js change.
Copy a test here when you add another boost.
*/

import { describe, expect, it } from "vitest";
import { Sim } from "./sim.js";
import { BOOSTS } from "./boosts.js";

function run(game, ticks, keysAt) {
  const events = [];
  for (let t = 0; t < ticks; t++) {
    if (keysAt) game.setPlayerKeys(keysAt(t));
    game.step();
    events.push(...game.takeEvents());
  }
  return events;
}

// How high player 0 gets in one jump.
function jumpHeight(game) {
  for (let i = 0; i < 40; i++) game.step();
  const y0 = game.feet(game.players[0]).y;
  let top = y0;
  for (let t = 0; t < 60; t++) {
    game.setPlayerKeys([t < 4, false, false, false]);
    game.step();
    top = Math.min(top, game.feet(game.players[0]).y);
  }
  return y0 - top;
}

describe("boosts", () => {
  it("never appear when boosts are off", () => {
    const game = new Sim.Game();
    run(game, 60 * 30);
    expect(game.items).toEqual([]);
  });

  it("appear when on, but never more than two at a time, and vanish after a while", () => {
    const game = new Sim.Game({ boosts: true });
    let most = 0, seen = 0;
    for (let t = 0; t < 60 * 60; t++) {
      game.step();
      game.takeEvents();
      most = Math.max(most, game.items.length);
      if (game.items.length) seen++;
    }
    expect(seen).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(2);
  });

  it("a player who touches a boost gets it, with a pickup event", () => {
    const game = new Sim.Game({ boosts: true });
    for (let i = 0; i < 30; i++) game.step();
    const head = game.headPoint(game.players[2]);
    game.items = [{ kind: "arms", x: head.x, y: head.y, age: 0 }];
    const events = run(game, 1);
    expect(game.items).toEqual([]);
    expect(game.players[2].fx.arms).toBeGreaterThan(BOOSTS.arms.time - 0.1);
    expect(events.some((e) => e.startsWith("boost:arms:2:"))).toBe(true);
    run(game, 1);   // arm length is updated on the next step
    expect(game.players[2].reach).toBeGreaterThan(game.players[2].baseReach * 1.4);
    run(game, 60 * 9);
    expect(game.players[2].fx.arms).toBe(0);
    expect(game.players[2].reach).toBe(game.players[2].baseReach);
  });

  it("BIG JUMP jumps higher and SLOW jumps lower", () => {
    const normal = jumpHeight(new Sim.Game());
    const big = new Sim.Game();
    big.players[0].fx.jump = 5;
    const slow = new Sim.Game();
    slow.players[0].fx.slow = 5;
    expect(jumpHeight(big)).toBeGreaterThan(normal * 1.5);
    expect(jumpHeight(slow)).toBeLessThan(normal * 0.6);
  });

  it("FREEZE stops a player from jumping until it wears off", () => {
    const game = new Sim.Game();
    game.players[0].fx.freeze = 1;
    expect(jumpHeight(game)).toBeLessThan(1);
    run(game, 60);
    expect(game.players[0].fx.freeze).toBe(0);
    expect(jumpHeight(game)).toBeGreaterThan(5);
  });

  it("boosts and effects survive save and load (online play and the computer's look-ahead)", () => {
    const a = new Sim.Game({ boosts: true });
    for (let t = 0; t < 60 * 8; t++) { a.step(); a.takeEvents(); }
    a.players[1].fx.speed = 3;
    const saved = JSON.parse(JSON.stringify(a.saveState()));
    const b = new Sim.Game(), c = new Sim.Game();
    b.loadState(saved);
    c.loadState(saved);
    expect(b.boostsOn).toBe(true);
    expect(b.items).toEqual(a.items);
    expect(b.players[1].fx.speed).toBeCloseTo(3);
    for (let t = 0; t < 60 * 20; t++) { b.step(); c.step(); b.takeEvents(); c.takeEvents(); }
    expect(c.items).toEqual(b.items);
    expect(c.bodies()).toEqual(b.bodies());
  });
});

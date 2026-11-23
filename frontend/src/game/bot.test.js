/*
This file tests the strong computer player: it beats the simple bot clearly, scores when it holds the ball,
and moves its two players with separate buttons.
Edit this file when the strong bot's rules in bot.js change.
Copy a test here when you add another computer player.
*/

import { describe, expect, it } from "vitest";
import { Sim } from "./sim.js";
import { createSmartBot } from "./bot.js";

// One tick the way 1 PLAYER mode does it: team 0 shares one button, every computer player has its own.
function stepWith(game, humanKey, botKeys) {
  game.setPlayerKeys(game.teams.map((t, i) => (t === 0 ? humanKey : !!botKeys[i])));
  game.setKey(0, humanKey);
  game.setKey(1, false);
  game.step();
  return game.takeEvents();
}

describe("strong computer player", () => {
  it("beats the simple bot", () => {
    let smartPoints = 0, simplePoints = 0;
    for (let m = 0; m < 2; m++) {
      const game = new Sim.Game();
      const simple = new Sim.Bot(0, 1), smart = createSmartBot(1);
      for (let t = 0; t < 60 * 120 && game.state !== "over"; t++) {
        const k0 = simple.update(game);
        stepWith(game, k0, smart.update(game, k0));
      }
      smartPoints += game.score[1];
      simplePoints += game.score[0];
    }
    expect(smartPoints).toBeGreaterThan(simplePoints * 2);
  }, 60000);

  it("throws soon and scores most of the time after it gets the ball, when nobody bothers it", () => {
    let baskets = 0, neverThrew = 0;
    for (let k = 0; k < 8; k++) {
      const game = new Sim.Game();
      for (let i = 0; i < 40 + k * 17; i++) game.step();
      game.grab(2);
      const smart = createSmartBot(1);
      let threw = false;
      for (let t = 0; t < 60 * 4 && game.state === "play"; t++) {
        if (stepWith(game, false, smart.update(game, false)).includes("shoot")) threw = true;
      }
      if (game.score[1] === 1) baskets++;
      if (!threw) neverThrew++;
    }
    expect(neverThrew).toBe(0);   // it must never get stuck holding the ball
    expect(baskets).toBeGreaterThanOrEqual(4);
  }, 60000);

  it("presses its two players' buttons separately, and never the human team's", () => {
    const game = new Sim.Game(), smart = createSmartBot(1);
    let onlyOne = 0;
    for (let t = 0; t < 60 * 20 && game.state !== "over"; t++) {
      const keys = smart.update(game, false);
      expect(keys).toHaveLength(4);
      expect(keys[0] || keys[1]).toBe(false);
      if (keys[2] !== keys[3]) onlyOne++;
      stepWith(game, false, keys);
    }
    expect(onlyOne).toBeGreaterThan(0);
  }, 60000);
});

describe("smaller hoop for the human in 1 PLAYER", () => {
  it("makes the rim reach further in and the scoring zone narrower only on the shrunk hoop", () => {
    const normal = new Sim.Game(), small = new Sim.Game({ hoopShrink: [1, 0] });
    const radius = (g, hoop) => g.hoopFix[hoop][2].getShape().getRadius() / Sim.S;
    // team 0 shoots at the right hoop (index 1); team 1 at the left hoop (index 0)
    expect(radius(small, 1)).toBeCloseTo(radius(normal, 1) + 1);
    expect(radius(small, 0)).toBeCloseTo(radius(normal, 0));
    // the setting survives save and load (online play and the computer's look-ahead use it)
    const copy = new Sim.Game();
    copy.loadState(JSON.parse(JSON.stringify(small.saveState())));
    expect(copy.hoopShrink).toEqual([1, 0]);
    expect(radius(copy, 1)).toBeCloseTo(radius(normal, 1) + 1);
  });
});

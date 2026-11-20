/*
This file tests the strong computer player: it beats the simple bot clearly and scores when it holds the ball.
Edit this file when the strong bot's rules in bot.js change.
Copy a test here when you add another computer player.
*/

import { describe, expect, it } from "vitest";
import { Sim } from "./sim.js";
import { createSmartBot } from "./bot.js";

describe("strong computer player", () => {
  it("beats the simple bot", () => {
    let smartPoints = 0, simplePoints = 0;
    for (let m = 0; m < 2; m++) {
      const game = new Sim.Game();
      const simple = new Sim.Bot(0, 1), smart = createSmartBot(1);
      for (let t = 0; t < 60 * 120 && game.state !== "over"; t++) {
        const k0 = simple.update(game);
        game.setKey(1, smart.update(game, k0));
        game.setKey(0, k0);
        game.step();
        game.takeEvents();
      }
      smartPoints += game.score[1];
      simplePoints += game.score[0];
    }
    expect(smartPoints).toBeGreaterThan(simplePoints * 2);
  }, 60000);

  it("scores soon after it gets the ball, when nobody bothers it", () => {
    let baskets = 0;
    for (let k = 0; k < 4; k++) {
      const game = new Sim.Game();
      for (let i = 0; i < 40 + k * 17; i++) game.step();
      game.grab(2);
      const smart = createSmartBot(1);
      for (let t = 0; t < 60 * 4 && game.state === "play"; t++) {
        game.setKey(1, smart.update(game, false));
        game.setKey(0, false);
        game.step();
        game.takeEvents();
      }
      if (game.score[1] === 1) baskets++;
    }
    expect(baskets).toBeGreaterThanOrEqual(3);
  }, 60000);
});

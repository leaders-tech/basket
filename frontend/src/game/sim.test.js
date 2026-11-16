/*
This file tests the game rules in sim.js: round options, English names, scoring, and a long game run without errors.
Edit this file when the game rules or round options change.
Copy a test here when you add another court, ball, player type, or hoop.
*/

import { describe, expect, it } from "vitest";
import { Sim } from "./sim.js";

const CYRILLIC = /[А-Яа-яЁё]/;

describe("game rules", () => {
  it("names every round option in English", () => {
    for (const list of [Sim.PLACES, Sim.BALLS, Sim.CHARS, Sim.GOALS]) {
      for (const option of Object.values(list)) {
        expect(option.name).not.toMatch(CYRILLIC);
      }
    }
  });

  it("builds a round title from the options that are not normal", () => {
    const layout = Sim.layout({ place: "snow", ball: "heavy", chars: "tall", goal: "low", seed: 1 });
    expect(layout.titleParts).toEqual(["Snow", "Heavy ball", "Tall", "Low hoop"]);
    expect(Sim.layout({ place: "street", ball: "normal", chars: "normal", goal: "normal", seed: 1 }).titleParts).toEqual([]);
  });

  it("starts with a normal round and a 0 : 0 score", () => {
    const game = new Sim.Game();
    expect(game.cfg).toMatchObject({ place: "street", ball: "normal", chars: "normal", goal: "normal" });
    expect(game.score).toEqual([0, 0]);
    expect(game.state).toBe("play");
  });

  it("runs two computer players for a long time without broken numbers", () => {
    const game = new Sim.Game();
    const bots = [new Sim.Bot(0, 1), new Sim.Bot(1, 1)];
    for (let i = 0; i < 60 * 40; i++) {
      game.setKey(0, bots[0].update(game));
      game.setKey(1, bots[1].update(game));
      game.step();
      game.takeEvents();
      if (game.state === "over") break;
    }
    expect(game.bodies()).toHaveLength(31);
    expect(game.bodies().every(Number.isFinite)).toBe(true);
    expect(game.score[0] + game.score[1]).toBeLessThanOrEqual(2 * Sim.WIN_SCORE);
  });

  it("ends the match at the win score and a button press starts a new one", () => {
    const game = new Sim.Game();
    game.score = [Sim.WIN_SCORE, 2];
    game.state = "over";
    game.timer = 0;
    game.setKey(1, true);
    expect(game.state).toBe("play");
    expect(game.score).toEqual([0, 0]);
  });
});

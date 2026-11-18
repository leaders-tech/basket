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

  it("cheat key sends the held ball straight into the other team's hoop", () => {
    for (const team of [0, 1]) {
      const game = new Sim.Game();
      const holder = team === 0 ? 1 : 2;
      game.grab(holder);
      expect(game.cheatShot(1 - team)).toBe(false);
      expect(game.cheatShot(team)).toBe(true);
      expect(game.holder).toBe(-1);
      let steps = 0;
      while (game.state === "play" && steps < 120) {
        game.step();
        steps++;
      }
      expect(game.state).toBe("goal");
      expect(game.lastScorer).toBe(team);
      expect(game.score[team]).toBe(1);
      expect(game.score[1 - team]).toBe(0);
    }
  });

  it("cheat key does nothing when your team does not hold the ball", () => {
    const game = new Sim.Game();
    expect(game.cheatShot(0)).toBe(false);
    expect(game.cheatShot(1)).toBe(false);
  });

  it("chaos shakes everything for a while, plays uwu many times, and then gives the real score back", () => {
    const game = new Sim.Game();
    game.score = [2, 1];
    expect(game.startChaos()).toBe(true);
    const shown = new Set();
    let uwus = 0;
    for (let i = 0; i < 60 * 9; i++) {
      game.step();
      uwus += game.takeEvents().filter((e) => e === "uwu-chaos").length;
      if (game.chaos > 0) shown.add(game.shownScore().join(":"));
    }
    expect(game.chaos).toBe(0);
    expect(shown.size).toBeGreaterThan(5);
    expect(uwus).toBeGreaterThan(20);
    expect(game.shownScore()).toBe(game.score);
    expect(game.score[0]).toBeGreaterThanOrEqual(2);
    expect(game.score[1]).toBeGreaterThanOrEqual(1);
    expect(game.bodies().every(Number.isFinite)).toBe(true);
  });

  it("chaos cannot start after the match is over", () => {
    const game = new Sim.Game();
    game.state = "over";
    expect(game.startChaos()).toBe(false);
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

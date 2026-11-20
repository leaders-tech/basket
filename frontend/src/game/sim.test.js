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

  it("plays with uneven teams, like 1 against 3 or 3 against 1, each player with their own button", () => {
    for (const teams of [[0, 1, 1, 1], [0, 0, 0, 1], [0, 1], [0, 0, 0, 0, 1, 1, 1, 1]]) {
      const game = new Sim.Game({ teams });
      expect(game.players.map((p) => p.team)).toEqual(teams);
      expect(game.L.looks).toHaveLength(teams.length);
      for (let i = 0; i < 60 * 10; i++) {
        // each player presses on their own rhythm
        game.setPlayerKeys(teams.map((_, k) => (i + k * 13) % 50 < 12));
        game.step();
        game.takeEvents();
      }
      expect(game.bodies()).toHaveLength(teams.length * 7 + 3);
      expect(game.bodies().every(Number.isFinite)).toBe(true);
      // the team stays the same after new rounds
      expect(game.cfg.teams).toEqual(teams);
    }
  });

  it("party mode: only the pressed player jumps", () => {
    const game = new Sim.Game({ teams: [0, 1, 1, 1] });
    for (let i = 0; i < 30; i++) game.step();
    const startY = game.players.map((p) => p.body.getPosition().y);
    game.setPlayerKeys([false, false, true, false]);
    for (let i = 0; i < 10; i++) game.step();
    const dy = game.players.map((p, i) => p.body.getPosition().y - startY[i]);
    expect(dy[2]).toBeLessThan(-0.1);
    expect(Math.abs(dy[1])).toBeLessThan(0.05);
    expect(Math.abs(dy[3])).toBeLessThan(0.05);
  });

  it("stop-ball combo stops a flying ball and it falls straight down, whoever threw it", () => {
    for (const thrower of [0, 2]) {
      const game = new Sim.Game();
      game.grab(thrower);
      game.players[thrower].arm = 150;
      game.throwBall(game.players[thrower]);
      for (let i = 0; i < 8; i++) game.step();
      expect(game.stopBall()).toBe(true);
      const x0 = game.ball.getPosition().x;
      const y0 = game.ball.getPosition().y;
      for (let i = 0; i < 10; i++) game.step();
      expect(Math.abs(game.ball.getPosition().x - x0)).toBeLessThan(0.001);
      expect(game.ball.getPosition().y).toBeGreaterThan(y0);
    }
  });

  it("stop-ball combo does nothing while someone holds the ball", () => {
    const game = new Sim.Game();
    game.grab(1);
    expect(game.stopBall()).toBe(false);
    expect(game.holder).toBe(1);
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

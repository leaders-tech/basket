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

  it("stand-up combo turns that team's players upright within half a second, and only that team", () => {
    const game = new Sim.Game();
    for (let i = 0; i < 30; i++) game.step();
    const tip = () => game.players.forEach((p) => { p.body.setTransform(p.body.getPosition(), 1.4); p.body.setAngularVelocity(4); });
    const tilt = (p) => Math.abs(Math.atan2(Math.sin(p.body.getAngle()), Math.cos(p.body.getAngle())));
    tip();
    expect(game.stabilize(1)).toBe(true);
    expect(game.takeEvents().filter((e) => e.startsWith("steady:"))).toHaveLength(2);
    for (let i = 0; i < 30; i++) game.step();
    for (const p of game.players.filter((q) => q.team === 1)) {
      expect(tilt(p)).toBeLessThan(0.02);
      // the head is right above the feet
      expect(Math.abs(game.headPoint(p).x - game.feet(p).x)).toBeLessThan(1);
    }
    expect(Math.max(...game.players.filter((q) => q.team === 0).map(tilt))).toBeGreaterThan(0.2);
  });

  it("stand-up combo can stand up just one player (party rooms: only the one who pressed)", () => {
    const game = new Sim.Game({ teams: [0, 1, 1, 1] });
    for (let i = 0; i < 30; i++) game.step();
    game.players.forEach((p) => { p.body.setTransform(p.body.getPosition(), 1.4); p.body.setAngularVelocity(4); });
    game.stabilize(1, 2);
    expect(game.takeEvents().filter((e) => e.startsWith("steady:"))).toEqual([expect.stringMatching(/^steady:2:/)]);
    expect(game.players.map((p) => p.steady > 0)).toEqual([false, false, true, false]);
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

  const pressFor = (teams) => (g, i) =>
    teams[1] === 0 ? (g.setKey(0, i % 37 < 9), g.setKey(1, i % 23 < 6)) : g.setPlayerKeys(teams.map((_, k) => (i + k * 11) % 31 < 8));

  it("two games loaded from the same saved state play out exactly alike with the same buttons", () => {
    for (const teams of [[0, 0, 1, 1], [0, 1, 1, 1]]) {
      const press = pressFor(teams);
      const a = new Sim.Game({ teams });
      for (let i = 0; i < 400; i++) { press(a, i); a.step(); a.takeEvents(); }
      const saved = JSON.parse(JSON.stringify(a.saveState()));
      const b = new Sim.Game();
      const c = new Sim.Game();
      b.loadState(saved);
      c.loadState(saved);
      expect(b.tick).toBe(a.tick);
      for (let i = 400; i < 1000; i++) { press(b, i); press(c, i); b.step(); c.step(); }
      expect(c.bodies()).toEqual(b.bodies());
      expect(c.score).toEqual(b.score);
      expect(c.round).toBe(b.round);
    }
  });

  it("a loaded copy usually stays within a pixel of the original over a short replay (half a second)", () => {
    // Rim bounces can still go a bit differently; the guest fixes that with the next snapshot.
    const teams = [0, 0, 1, 1], press = pressFor(teams);
    let close = 0;
    for (let start = 100; start <= 1000; start += 100) {
      const a = new Sim.Game({ teams });
      for (let i = 0; i < start; i++) { press(a, i); a.step(); }
      const b = new Sim.Game();
      b.loadState(JSON.parse(JSON.stringify(a.saveState())));
      for (let i = start; i < start + 30; i++) { press(a, i); press(b, i); a.step(); b.step(); }
      // positions only (x, y of bodies, heads, and the ball), not angles
      const A = a.bodies(), B = b.bodies();
      const diff = Math.max(...A.map((x, k) => ([0, 1, 3, 4].includes(k % 7) || k === 28 || k === 29 ? Math.abs(x - B[k]) : 0)));
      if (diff < 1) close++;
    }
    expect(close).toBeGreaterThanOrEqual(7);
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

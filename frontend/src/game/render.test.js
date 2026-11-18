/*
This file tests the text helpers in render.js that keep on-screen labels inside the screen and apart from each other.
Edit this file when those helpers or the team names change.
Copy a test here when you add another text helper.
*/

import { describe, expect, it } from "vitest";
import { Render, fitSize, scoreX, wrapParts } from "./render.js";

describe("text helpers", () => {
  it("uses big text only when it fits", () => {
    expect(fitSize("YOU WIN!", 274)).toBe(16);
    expect(fitSize("A VERY LONG WINNER LABEL", 274)).toBe(8);
  });

  it("splits a long round title into lines that fit", () => {
    const parts = ["BEACH", "HEAVY BALL", "LONG ARMS", "HIGH HOOP"];
    const lines = wrapParts(parts, 31);
    expect(lines).toEqual(["BEACH · HEAVY BALL · LONG ARMS", "HIGH HOOP"]);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(31);
  });

  it("keeps a short title on one line", () => {
    expect(wrapParts(["SNOW"], 31)).toEqual(["SNOW"]);
    expect(wrapParts([], 31)).toEqual([]);
  });

  it("shows each team's score on its own side", () => {
    expect(scoreX(0, 290, 34)).toBe(0);
    expect(scoreX(1, 290, 34)).toBe(256);
  });

  it("names the teams in English", () => {
    expect(Render.TEAM.map((team) => team.name)).toEqual(["GREEN", "PURPLE"]);
  });
});

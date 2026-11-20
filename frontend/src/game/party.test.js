/*
This file tests the party room player list: team choice for new players, team changes, start rule, and play order.
Edit this file when the party room rules in party.js change.
Copy a test here when you add another party room rule.
*/

import { describe, expect, it } from "vitest";
import { addPlayer, canStart, playOrder, removePlayer, setTeam, teamCounts } from "./party.js";

describe("party room list", () => {
  it("puts each new player into the smaller team", () => {
    let roster = [{ id: 0, name: "Admin", team: 0 }];
    roster = addPlayer(roster, 1, "Ann");
    roster = addPlayer(roster, 2, "Bob");
    roster = addPlayer(roster, 3, "Cid");
    expect(roster.map((p) => p.team)).toEqual([0, 1, 0, 1]);
    expect(teamCounts(roster)).toEqual([2, 2]);
  });

  it("lets the admin make uneven teams, even 1 against 3", () => {
    let roster = [0, 1, 2, 3].reduce((r, id) => addPlayer(r, id, `P${id}`), []);
    roster = setTeam(roster, 2, 1);
    expect(teamCounts(roster)).toEqual([1, 3]);
    expect(canStart(roster)).toBe(true);
  });

  it("needs at least one player in each team to start", () => {
    let roster = addPlayer(addPlayer([], 0, "A"), 1, "B");
    expect(canStart(roster)).toBe(true);
    roster = setTeam(roster, 1, 0);
    expect(canStart(roster)).toBe(false);
    expect(canStart(removePlayer(roster, 1))).toBe(false);
  });

  it("orders players for the game: GREEN first, then PURPLE", () => {
    const roster = [
      { id: 0, name: "A", team: 1 },
      { id: 1, name: "B", team: 0 },
      { id: 2, name: "C", team: 1 },
      { id: 3, name: "D", team: 0 },
    ];
    expect(playOrder(roster).map((p) => p.id)).toEqual([1, 3, 0, 2]);
  });
});

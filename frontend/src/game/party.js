/*
This file keeps the player list of a party room: who is in it, their names, and their teams.
The party host (admin) changes the list; everyone else only shows it.
Edit this file when party room rules change (team choice for new players, when the game may start, player order).
Do not copy this file. Add a new list rule here as one more small function.
*/

export var MAX_PLAYERS = 8;

// roster: [{ id, name, team }] in join order. team 0 is GREEN (left), team 1 is PURPLE (right).
export function teamCounts(roster) {
  var counts = [0, 0];
  roster.forEach(function (p) { counts[p.team]++; });
  return counts;
}

// A new player goes to the smaller team (GREEN when they are equal).
export function addPlayer(roster, id, name) {
  var counts = teamCounts(roster);
  return roster.concat([{ id: id, name: name, team: counts[0] <= counts[1] ? 0 : 1 }]);
}

export function removePlayer(roster, id) {
  return roster.filter(function (p) { return p.id !== id; });
}

export function setTeam(roster, id, team) {
  return roster.map(function (p) { return p.id === id ? { id: p.id, name: p.name, team: team } : p; });
}

// The game may start when each team has at least one player. Teams may be uneven, like 1 against 3.
export function canStart(roster) {
  var counts = teamCounts(roster);
  return counts[0] >= 1 && counts[1] >= 1;
}

// Player order in the game: GREEN players first, then PURPLE, each team in join order.
export function playOrder(roster) {
  return roster.filter(function (p) { return p.team === 0; }).concat(roster.filter(function (p) { return p.team === 1; }));
}

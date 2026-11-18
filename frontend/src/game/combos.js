/*
This file decides which secret key combo was pressed: Z + C is the cheat shot, Z + U plays the "uwu" sound,
Z + W starts chaos.
Edit this file when you want to add or change a key combo.
Copy one line in COMBOS when you add another combo.
*/

var COMBOS = [
  { keys: ['KeyZ', 'KeyC'], action: 'cheat' },
  { keys: ['KeyZ', 'KeyU'], action: 'uwu' },
  { keys: ['KeyZ', 'KeyW'], action: 'chaos' }
];

// Keys that take part in some combo. game.js remembers which of them are held down.
// W is also the jump button, so game.js still passes it on to the normal controls.
export var COMBO_KEYS = { KeyZ: 1, KeyC: 1, KeyU: 1, KeyW: 1 };

// Cheats are locked until the player presses 1 four times in the first 5 seconds of a match.
export var UNLOCK_KEYS = { Digit1: 1, Numpad1: 1 };
export function createCheatUnlock(windowMs, pressesNeeded) {
  windowMs = windowMs || 5000; pressesNeeded = pressesNeeded || 4;
  var startAt = null, presses = 0, unlocked = false;
  return {
    // call when a match starts; now is in ms
    start: function (now) { startAt = now; presses = 0; unlocked = false; },
    // call when the player leaves the match
    reset: function () { startAt = null; presses = 0; unlocked = false; },
    // call on every press of 1; returns true at the moment the cheats get unlocked
    press: function (now) {
      if (unlocked || startAt === null || now - startAt > windowMs) return false;
      presses++;
      if (presses >= pressesNeeded) { unlocked = true; return true; }
      return false;
    },
    isUnlocked: function () { return unlocked; }
  };
}

// held: keys that are down right now (including `code`); code: the key that was just pressed.
// Returns the combo action, or null. A combo fires only when its last key goes down, so holding keys does not repeat it.
export function comboFor(held, code) {
  for (var i = 0; i < COMBOS.length; i++) {
    var keys = COMBOS[i].keys;
    if (keys.indexOf(code) >= 0 && keys.every(function (k) { return held[k]; })) return COMBOS[i].action;
  }
  return null;
}

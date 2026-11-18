/*
This file decides which secret key combo was pressed: Z + C is the cheat shot, Z + U plays the "uwu" sound.
Edit this file when you want to add or change a key combo.
Copy one line in COMBOS when you add another combo.
*/

var COMBOS = [
  { keys: ['KeyZ', 'KeyC'], action: 'cheat' },
  { keys: ['KeyZ', 'KeyU'], action: 'uwu' }
];

// Keys that take part in some combo. game.js remembers which of them are held down.
export var COMBO_KEYS = { KeyZ: 1, KeyC: 1, KeyU: 1 };

// held: keys that are down right now (including `code`); code: the key that was just pressed.
// Returns the combo action, or null. A combo fires only when its last key goes down, so holding keys does not repeat it.
export function comboFor(held, code) {
  for (var i = 0; i < COMBOS.length; i++) {
    var keys = COMBOS[i].keys;
    if (keys.indexOf(code) >= 0 && keys.every(function (k) { return held[k]; })) return COMBOS[i].action;
  }
  return null;
}

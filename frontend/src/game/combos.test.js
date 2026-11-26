/*
This file tests the secret key combos: Z + C (cheat shot) and Z + U (uwu sound).
Edit this file when the combos in combos.js change.
Copy a test here when you add another combo.
*/

import { describe, expect, it } from "vitest";
import { comboFor, createCheatUnlock } from "./combos.js";

describe("key combos", () => {
  it("fires the cheat only when Z and C are both down", () => {
    expect(comboFor({ KeyC: true }, "KeyC")).toBeNull();
    expect(comboFor({ KeyZ: true }, "KeyZ")).toBeNull();
    expect(comboFor({ KeyZ: true, KeyC: true }, "KeyC")).toBe("cheat");
    expect(comboFor({ KeyZ: true, KeyC: true }, "KeyZ")).toBe("cheat");
  });

  it("fires the uwu sound when Z and U are both down, in any order", () => {
    expect(comboFor({ KeyU: true }, "KeyU")).toBeNull();
    expect(comboFor({ KeyZ: true, KeyU: true }, "KeyU")).toBe("uwu");
    expect(comboFor({ KeyU: true, KeyZ: true }, "KeyZ")).toBe("uwu");
  });

  it("starts chaos when Z and W are both down, but W alone is just the jump button", () => {
    expect(comboFor({ KeyW: true }, "KeyW")).toBeNull();
    expect(comboFor({ KeyZ: true, KeyW: true }, "KeyW")).toBe("chaos");
    expect(comboFor({ KeyW: true, KeyZ: true }, "KeyZ")).toBe("chaos");
  });

  it("does not fire for a key that is not part of the combo", () => {
    expect(comboFor({ KeyZ: true, KeyC: true, KeyQ: true }, "KeyQ")).toBeNull();
  });
});

describe("cheat unlock", () => {
  it("unlocks after 4 presses of 1 in the first 5 seconds of a match", () => {
    const unlock = createCheatUnlock(5000, 4);
    unlock.start(1000);
    expect(unlock.press(1500)).toBe(false);
    expect(unlock.press(2000)).toBe(false);
    expect(unlock.press(3000)).toBe(false);
    expect(unlock.isUnlocked()).toBe(false);
    expect(unlock.press(5900)).toBe(true);
    expect(unlock.isUnlocked()).toBe(true);
  });

  it("stays locked when the presses come too late or before a match", () => {
    const unlock = createCheatUnlock(5000, 4);
    expect(unlock.press(0)).toBe(false);
    unlock.start(0);
    for (let i = 0; i < 3; i++) unlock.press(1000);
    expect(unlock.press(5001)).toBe(false);
    expect(unlock.isUnlocked()).toBe(false);
  });

  it("locks again when the player leaves the match", () => {
    const unlock = createCheatUnlock(5000, 4);
    unlock.start(0);
    for (let i = 0; i < 4; i++) unlock.press(100);
    expect(unlock.isUnlocked()).toBe(true);
    unlock.reset();
    expect(unlock.isUnlocked()).toBe(false);
  });
});

describe("stand-up combo", () => {
  it("fires when Z and T are both down", () => {
    expect(comboFor({ KeyT: true }, "KeyT")).toBeNull();
    expect(comboFor({ KeyZ: true, KeyT: true }, "KeyT")).toBe("steady");
    expect(comboFor({ KeyT: true, KeyZ: true }, "KeyZ")).toBe("steady");
  });
});

describe("stop-ball combo", () => {
  it("fires when Z and S are both down", () => {
    expect(comboFor({ KeyS: true }, "KeyS")).toBeNull();
    expect(comboFor({ KeyZ: true, KeyS: true }, "KeyS")).toBe("stop");
    expect(comboFor({ KeyS: true, KeyZ: true }, "KeyZ")).toBe("stop");
  });
});

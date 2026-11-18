/*
This file tests the secret key combos: Z + C (cheat shot) and Z + U (uwu sound).
Edit this file when the combos in combos.js change.
Copy a test here when you add another combo.
*/

import { describe, expect, it } from "vitest";
import { comboFor } from "./combos.js";

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

  it("does not fire for a key that is not part of the combo", () => {
    expect(comboFor({ KeyZ: true, KeyC: true, KeyW: true }, "KeyW")).toBeNull();
  });
});

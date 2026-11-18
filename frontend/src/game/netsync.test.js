/*
This file tests the guest snapshot buffer: it blends neighbour snapshots and keeps the delay small on a good network.
Edit this file when the delay rules in netsync.js change.
Copy a test here when you add another network helper.
*/

import { describe, expect, it } from "vitest";
import { createSnapshotBuffer } from "./netsync.js";

const TICK = 1000 / 60;

describe("snapshot buffer", () => {
  it("returns nothing before the first snapshot", () => {
    expect(createSnapshotBuffer(TICK).sample(0)).toBeNull();
  });

  it("keeps a small delay and blends two neighbour snapshots on a steady network", () => {
    const buf = createSnapshotBuffer(TICK);
    for (let n = 0; n < 240; n++) buf.push({ n }, 1000 + n * TICK + 40);
    expect(buf.delay()).toBeLessThan(45);
    const pick = buf.sample(1000 + 239 * TICK + 40);
    expect(pick?.b).not.toBeNull();
    expect(pick?.b.n).toBe(pick?.a.n + 1);
    expect(pick?.t).toBeGreaterThanOrEqual(0);
    expect(pick?.t).toBeLessThanOrEqual(1);
  });

  it("waits longer when snapshots arrive unevenly", () => {
    const buf = createSnapshotBuffer(TICK);
    for (let n = 0; n < 240; n++) buf.push({ n }, 1000 + n * TICK + (n % 3 === 0 ? 90 : 0));
    expect(buf.delay()).toBeGreaterThan(80);
  });

  it("holds the newest snapshot when nothing newer has arrived", () => {
    const buf = createSnapshotBuffer(TICK);
    buf.push({ n: 5 }, 100);
    const pick = buf.sample(5000);
    expect(pick?.a.n).toBe(5);
    expect(pick?.b).toBeNull();
  });
});

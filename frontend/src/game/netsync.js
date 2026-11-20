/*
This file keeps the game snapshots that the guest gets from the host and picks which two to blend for each frame.
Edit this file when online play feels laggy or jumpy and you want to tune the delay.
Do not copy this file. game.js creates one buffer for the guest and calls push() and sample().
*/

// The guest shows the game a little in the past, so there is always a newer snapshot to move towards.
// The delay adapts: it is as small as the network allows and grows when snapshots arrive unevenly.
var MIN_DELAY = 20, MAX_DELAY = 300, KEEP_MS = 3000, MAX_SNAPS = 90;

export function createSnapshotBuffer(tickMs) {
  var snaps = [], arrivals = [], base = 0, delay = 60;

  // s.n is the host tick number of this snapshot; now is when it arrived (ms).
  // Returns false for a snapshot that is old or already here (it can come twice: directly and through the server).
  function push(s, now) {
    if (snaps.length && s.n <= snaps[snaps.length - 1].n) return false;
    snaps.push(s);
    if (snaps.length > MAX_SNAPS) snaps.shift();
    // off = how late this snapshot is compared to the host clock. The smallest off is the fastest delivery.
    arrivals.push({ at: now, off: now - s.n * tickMs });
    while (arrivals.length > 1 && arrivals[0].at < now - KEEP_MS) arrivals.shift();
    base = Infinity;
    for (var i = 0; i < arrivals.length; i++) base = Math.min(base, arrivals[i].off);
    var late = arrivals.map(function (a) { return a.off - base; }).sort(function (x, y) { return x - y; });
    var jitter = late[Math.floor((late.length - 1) * 0.9)];
    var want = Math.max(MIN_DELAY, Math.min(MAX_DELAY, jitter + tickMs * 1.5));
    delay += (want - delay) * (want > delay ? 0.3 : 0.02);   // grow fast, shrink slowly
    return true;
  }

  // Returns { a, b, t }: show snapshot a blended towards b by t (0..1). b is null when there is nothing newer yet.
  function sample(now) {
    if (!snaps.length) return null;
    var target = (now - base - delay) / tickMs;
    var a = null, b = null;
    for (var i = 0; i < snaps.length; i++) {
      if (snaps[i].n <= target) a = snaps[i];
      else { b = snaps[i]; break; }
    }
    if (!a) return { a: snaps[0], b: null, t: 0 };
    if (!b) return { a: a, b: null, t: 0 };
    return { a: a, b: b, t: (target - a.n) / (b.n - a.n) };
  }

  function reset() { snaps = []; arrivals = []; base = 0; delay = 60; }

  return { push: push, sample: sample, reset: reset, delay: function () { return delay; } };
}

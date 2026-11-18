/*
This tiny Web Worker sends a "tick" message 60 times a second.
Browsers slow down or pause animation frames in a hidden tab, but not this worker, so the host keeps the game running
for the guest even when the host switches to another tab or window.
Do not copy this file. game.js starts it once.
*/

setInterval(function () { postMessage(0); }, 1000 / 60);

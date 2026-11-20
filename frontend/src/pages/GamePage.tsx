/*
This file shows the game page: the game canvas plus the online play panels that sit on top of it.
Edit this file when the text or buttons in the online play panels change.
Copy this file as a starting point when you add another full-screen page that runs plain JavaScript.
*/

import { useEffect } from "react";
import { startGame } from "../game/game.js";
import "../game/game.css";

export function GamePage() {
  useEffect(() => startGame(), []);

  return (
    <div className="game-root">
      <div id="wrap">
        <canvas id="c" width="290" height="190" aria-label="Wobble Hoops game" />

        <div id="panels" className="hidden">
          <div id="p-online" className="card hidden">
            <h2>Online game</h2>
            <p>Create a room and send the code to friends, or type a friend's code.</p>
            <input id="name-in" className="field" maxLength={12} placeholder="Your name" autoComplete="off" spellCheck={false} aria-label="Your name" />
            <div className="stack" style={{ marginTop: "0.7em" }}>
              <button type="button" className="btn" id="b-create">
                Create room (1 vs 1)
              </button>
              <button type="button" className="btn" id="b-party">
                Create party room (up to 8)
              </button>
            </div>
            <div className="or">or</div>
            <div className="join">
              <input id="code-in" maxLength={4} placeholder="ABCD" autoComplete="off" spellCheck={false} aria-label="Room code" />
              <button type="button" className="btn" id="b-join">
                Join
              </button>
            </div>
            <div className="err" id="net-err" role="alert" />
            <button type="button" className="btn ghost" id="b-back">
              Back
            </button>
          </div>

          <div id="p-wait" className="card hidden">
            <h2>Room is ready</h2>
            <div className="tiles" id="room-code" aria-label="Room code" />
            <p>
              Your friend opens <span className="addr" id="room-addr" />, clicks Online, and types this code.
            </p>
            <p id="room-local" className="hidden">
              Tip: localhost works only on this computer. To play with a friend on the same Wi-Fi, start the app with make front-lan.
            </p>
            <div className="wait">
              <div className="spin" />
              Waiting for an opponent
            </div>
            <div className="row">
              <button type="button" className="btn ghost" id="b-copy">
                Copy code
              </button>
              <button type="button" className="btn ghost" id="b-cancel">
                Cancel
              </button>
            </div>
          </div>

          <div id="p-party" className="card hidden">
            <h2>Party room</h2>
            <div className="tiles" id="party-code" aria-label="Party room code" />
            <p>
              Friends open <span className="addr" id="party-addr" />, click Online, type their name and this code.
            </p>
            <p id="party-count" />
            <ul className="party-list" id="party-list" aria-label="Players" />
            <p id="party-note" />
            <div className="row">
              <button type="button" className="btn" id="b-party-start">
                Start game
              </button>
              <button type="button" className="btn ghost" id="b-party-leave">
                Leave
              </button>
            </div>
          </div>

          <div id="p-connect" className="card hidden">
            <div className="wait" style={{ margin: "0.3em 0" }}>
              <div className="spin" />
              Connecting...
            </div>
          </div>
        </div>

        <div id="toast" className="hidden" role="status" />
        <div id="hint" className="hidden" />
        <button type="button" id="b-mute" title="Sound (M)" aria-label="Sound on">
          🔊
        </button>
      </div>
    </div>
  );
}

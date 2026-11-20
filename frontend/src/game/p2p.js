/*
This file makes a direct browser-to-browser connection (WebRTC) between the host and one guest.
Game snapshots go over a "fast" channel that never waits for lost packets; button presses go over a "sure" channel.
The game server only passes the setup messages ({t: 'rtc'}); if the direct connection fails, game.js keeps using
the server websocket.
Edit this file when the direct connection setup changes (STUN server, channel settings).
Do not copy this file. game.js creates one peer per guest (the host) or one peer to the host (a guest).
*/

// A public STUN server helps two browsers behind home routers find each other. On the same Wi-Fi it is not needed.
var ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// initiator: true for the host. sendSignal(data) passes setup data to the other browser through the game server.
// onMessage(obj) gets every game message. onOpen() runs when the direct connection is ready.
export function createPeer(initiator, sendSignal, onMessage, onOpen) {
  if (typeof RTCPeerConnection === 'undefined') return null;
  var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  var channels = { fast: null, sure: null }, pendingIce = [], closed = false;

  function wire(ch) {
    channels[ch.label] = ch;
    ch.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
    ch.onopen = function () { if (isOpen()) onOpen(); };
  }
  function isOpen() { return !!(channels.fast && channels.sure && channels.fast.readyState === 'open' && channels.sure.readyState === 'open'); }

  pc.onicecandidate = function (e) { if (e.candidate) sendSignal({ ice: e.candidate.toJSON() }); };
  if (initiator) {
    wire(pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 }));
    wire(pc.createDataChannel('sure'));
    pc.createOffer().then(function (offer) { return pc.setLocalDescription(offer); })
      .then(function () { sendSignal({ sdp: pc.localDescription.toJSON() }); }, function () { });
  } else {
    pc.ondatachannel = function (e) { wire(e.channel); };
  }

  // Setup data from the other browser (an offer, an answer, or a network address).
  function signal(data) {
    if (closed || !data) return;
    if (data.sdp) {
      pc.setRemoteDescription(data.sdp).then(function () {
        pendingIce.splice(0).forEach(function (c) { pc.addIceCandidate(c).catch(function () { }); });
        if (data.sdp.type !== 'offer') return;
        return pc.createAnswer().then(function (answer) { return pc.setLocalDescription(answer); })
          .then(function () { sendSignal({ sdp: pc.localDescription.toJSON() }); });
      }).catch(function () { });
    } else if (data.ice) {
      if (pc.remoteDescription) pc.addIceCandidate(data.ice).catch(function () { });
      else pendingIce.push(data.ice);
    }
  }

  // Send a game message. fast = may be lost (snapshots). Returns false when the direct connection is not ready.
  function send(obj, fast) {
    var ch = fast ? channels.fast : channels.sure;
    if (!ch || ch.readyState !== 'open') return false;
    try { ch.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  function close() { closed = true; try { pc.close(); } catch { } }

  return { signal: signal, send: send, isOpen: isOpen, close: close };
}

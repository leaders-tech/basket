/*
This file holds the game physics and rules: players, ball, hoops, scoring, random rounds, and the computer player.
Edit this file when gameplay changes (jump power, win score, new courts, balls, or hoops).
Do not copy this file. Add a new court, ball, player type, or hoop as one more entry in the lists below.
*/
// Units: field pixels (290 x 190), Y axis points down, angles in degrees (clockwise).
// Inside planck everything is in meters: 1 px = 0.02 m.
import * as pl from "planck";
import { ARMS_REACH, JUMP_BOOST, KINDS as BOOST_KINDS, SLOW_ARM, SLOW_JUMP, SPEED_ARM, SPEED_SIDEWAYS, newFx, resetBoosts, stepBoosts } from "./boosts.js";

  var Vec2 = pl.Vec2;
  var S = 0.02;                   // meters per pixel
  var DT = 1 / 60;
  var FIELD_W = 290, FIELD_H = 190, GROUND = 142, CENTER = 145;
  var WALL_L = 24, WALL_R = 266;
  var G = 200;                    // gravity: 4 m/s² = 200 px/s²
  var WIN_SCORE = 5;

  // control constants
  var ANGULAR_FORCE = 60, ANGULAR_SUB = 8, DIVIDE_SMOOTH = 1.1, WOOBLE = 200;
  var LAND_MIN = 100, LAND_MAX = 150, JUMP_LEAN = 5;
  var ARM_SPEED = 10, ARM_MAX = 180, ARM_DIV = 160;
  var MORE_JUMP_RATE = 130, MORE_JUMP_MAX = 10;
  var JUMP_V0 = 130, JUMP_THRUST = 0;          // px/s: jump speed along the body
  var THROW_C = 50;

  // ---------- random round options ----------
  var PLACES = {
    street: { name: 'Street',   friction: 1.0 },
    night:  { name: 'Night',    friction: 1.0 },
    beach:  { name: 'Beach',    friction: 0.8 },
    snow:   { name: 'Snow',     friction: 0.04 },
    indoor: { name: 'Gym', friction: 1.0 }
  };
  var BALLS = {
    normal: { name: 'Ball',         r: 5,   density: 0.1,  restitution: 0.7,  damping: 0.3,  friction: 1 },
    heavy:  { name: 'Heavy ball',   r: 5.5, density: 3.0,  restitution: 0.25, damping: 0.15, friction: 1 },
    beach:  { name: 'Beach ball',   r: 6.5, density: 0.03, restitution: 0.85, damping: 0.55, friction: 1, hoopBonus: 6 },
    small:  { name: 'Small ball', r: 4,  density: 0.1,  restitution: 0.8,  damping: 0.3,  friction: 1 }
  };
  var CHARS = {
    normal: { name: 'Normal',    h: 33, arm: 17 },
    tall:   { name: 'Tall',      h: 44, arm: 19 },
    short:  { name: 'Short', h: 24, arm: 14 },
    longarm:{ name: 'Long arms', h: 33, arm: 26 }
  };
  var GOALS = {
    normal: { name: 'Hoop',          rimY: 78, open: 14 },
    wide:   { name: 'Wide hoop', rimY: 78, open: 22 },
    low:    { name: 'Low hoop', rimY: 94, open: 14 },
    high:   { name: 'High hoop', rimY: 64, open: 15 }
  };

  function weighted(obj, weights, random) {
    var keys = Object.keys(obj), tot = 0, i;
    for (i = 0; i < keys.length; i++) tot += (weights && weights[keys[i]]) || 1;
    var r = random() * tot;
    for (i = 0; i < keys.length; i++) { r -= (weights && weights[keys[i]]) || 1; if (r <= 0) return keys[i]; }
    return keys[0];
  }
  // teams: the team (0 or 1) of every player, in player order. Party rooms can have uneven teams like [0, 1, 1, 1].
  var DEFAULT_TEAMS = [0, 0, 1, 1];
  // random: the game's own random number function, so host and guest pick the same next round
  function randomConfig(first, teams, random) {
    teams = teams || DEFAULT_TEAMS;
    random = random || Math.random;
    if (first) return { place: 'street', ball: 'normal', chars: 'normal', goal: 'normal', seed: Math.floor(random() * 1e9), teams: teams };
    return {
      place: weighted(PLACES, { street: 2 }, random),
      ball: weighted(BALLS, { normal: 3 }, random),
      chars: weighted(CHARS, { normal: 3 }, random),
      goal: weighted(GOALS, { normal: 3 }, random),
      seed: Math.floor(random() * 1e9),
      teams: teams
    };
  }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function layout(cfg) {
    var r = rng(cfg.seed);
    var hairs = ['#e8c35a', '#f1d77a', '#6b4425', '#2e1f16', '#16120f', '#b85a2a', '#d9d4c7'];
    var skins = ['#f2c7a0', '#e9b48a', '#c98d5f', '#8f5a3a', '#f6d2b4', '#a86b45'];
    var teams = cfg.teams || DEFAULT_TEAMS, looks = [];
    for (var i = 0; i < teams.length; i++) looks.push({ hair: hairs[Math.floor(r() * hairs.length)], skin: skins[Math.floor(r() * skins.length)], style: Math.floor(r() * 4) });
    var parts = [];
    var place = PLACES[cfg.place], ball = BALLS[cfg.ball], ch = CHARS[cfg.chars], goal = GOALS[cfg.goal];
    if (cfg.place !== 'street') parts.push(place.name);
    if (cfg.ball !== 'normal') parts.push(ball.name);
    if (cfg.chars !== 'normal') parts.push(ch.name);
    if (cfg.goal !== 'normal') parts.push(goal.name);
    return { cfg: cfg, place: cfg.place, ballKind: cfg.ball, ball: ball, chars: ch, goal: goal, looks: looks, teams: teams,
      hoops: [hoopGeom(-1, fitHoop(goal, ball)), hoopGeom(1, fitHoop(goal, ball))], titleParts: parts, title: parts.join(' · ') };
  }

  // A big ball (the beach ball) needs a wider hoop: ball.hoopBonus pixels are added to the opening.
  // Without it the beach ball (13 px wide in a 13.5 px gap) almost never went in, and never with the 1 PLAYER
  // smaller hoop. With +6 it goes in about as often as the normal ball (measured on human-like throws).
  function fitHoop(goal, ball) {
    return { name: goal.name, rimY: goal.rimY, open: goal.open + (ball.hoopBonus || 0) };
  }

  // hoop shape: side -1 is the left hoop, +1 is the right hoop
  function hoopGeom(side, goal) {
    var boardIn = side < 0 ? 44 : 246;            // inner side of the backboard
    var d = side < 0 ? 1 : -1;                    // direction into the court
    var rimY = goal.rimY;
    var backEnd = boardIn + d * 5;
    var frontX = backEnd + d * (goal.open + 1.5);
    var openA = Math.min(backEnd, frontX - d * 1.5), openB = Math.max(backEnd, frontX - d * 1.5);
    return {
      side: side, d: d, boardIn: boardIn, boardOut: boardIn - d * 3, boardTop: rimY - 34, boardBot: rimY + 6,
      rimY: rimY, backEnd: backEnd, frontX: frontX, openA: openA, openB: openB,
      targetX: (openA + openB) / 2 + d * 3.5, poleX: side < 0 ? 19.5 : 270.5
    };
  }

  // ---------- game ----------
  // opts.teams: team of every player (default two players per team)
  class Game { constructor(opts) {
    this.teams = (opts && opts.teams) || DEFAULT_TEAMS.slice();
    // All randomness in the game comes from this seed, so the same state and the same buttons give the same game
    // on the host and on a guest (online play replays the game from the host's snapshots).
    this.seed = Math.floor(Math.random() * 4294967296) >>> 0;
    this.tick = 0;           // number of physics steps so far
    this.pkeys = null;       // party mode: one button per player instead of one per team (see setPlayerKeys)
    // Pixels taken off each side of the hoop a team shoots at (1 PLAYER: the hoop the human shoots at is a bit smaller,
    // so the computer has it easier). The hoop looks the same; its rim hitboxes reach further in and the "it went in"
    // check is narrower.
    this.hoopShrink = (opts && opts.hoopShrink) || [0, 0];
    this.boostsOn = !!(opts && opts.boosts);   // boosts (power-ups) appear on the court, see boosts.js
    this.score = [0, 0];
    this.keys = [false, false];
    this.state = 'play';           // play | goal | over
    this.timer = 0;
    this.lastScorer = -1;
    this.events = [];
    this.round = 0;
    this.slow = 0;
    this.chaos = 0;          // seconds of chaos left (keys Z + W); it lasts across rounds
    this.chaosTime = 0;      // seconds since chaos started
    this.chaosSeed = 0;
    this.newRound(randomConfig(true, this.teams, this.random.bind(this)));
  } }

  // The game's random numbers (mulberry32): 0 <= x < 1.
  Game.prototype.random = function () {
    var t = (this.seed = (this.seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Game.prototype.rnd = function (a, b) { return a + this.random() * (b - a); };

  Game.prototype.newRound = function (cfg) {
    this.cfg = cfg;
    this.L = layout(cfg);
    this.round++;
    this.roundTime = 0;
    this.build();
    this.events.push('round');
  };

  Game.prototype.resetMatch = function () {
    this.score = [0, 0];
    this.state = 'play';
    this.lastScorer = -1;
    this.newRound(randomConfig(false, this.teams, this.random.bind(this)));
  };

  function P(x, y) { return Vec2(x * S, y * S); }

  Game.prototype.build = function () {
    var L = this.L, self = this;
    var world = new pl.World({ gravity: Vec2(0, G * S) });
    this.world = world;
    var st = world.createBody();
    this.static = st;
    var fr = PLACES[L.place].friction;
    // floor
    st.createFixture(pl.Box(600 * S, 30 * S, P(145, GROUND + 30), 0), { friction: fr, restitution: 0, userData: { kind: 'ground' } });
    // bouncy side walls
    st.createFixture(pl.Box(2.5 * S, 400 * S, P(WALL_L - 2.5, GROUND - 400), 0), { friction: 0, restitution: 1, userData: { kind: 'wall' } });
    st.createFixture(pl.Box(2.5 * S, 400 * S, P(WALL_R + 2.5, GROUND - 400), 0), { friction: 0, restitution: 1, userData: { kind: 'wall' } });
    // slanted hoop pole bases
    [[36, -30], [254, 30]].forEach(function (q) {
      var a = q[1] * Math.PI / 180;
      var cx = q[0] + Math.sin(a) * 14.5, cy = GROUND - Math.cos(a) * 14.5;
      st.createFixture(pl.Box(1.5 * S, 14.5 * S, P(cx, cy), a), { friction: 0, restitution: 1, userData: { kind: 'wall' } });
    });
    // hoops
    this.hoopFix = [[], []];
    L.hoops.forEach(function (h, hi) {
      var bx = (h.boardIn + h.boardOut) / 2;
      var f1 = st.createFixture(pl.Box(1.5 * S, (h.boardBot - h.boardTop) / 2 * S, P(bx, (h.boardTop + h.boardBot) / 2), 0), { friction: 0, restitution: 0, userData: { kind: 'board', hoop: hi } });
      // a smaller hoop (hoopShrink for the team that shoots here): the back rim and the front rim reach further in
      var shrink = self.hoopShrink[hi === 1 ? 0 : 1], backEnd = h.backEnd + h.d * shrink;
      var f2 = st.createFixture(pl.Box(Math.abs(backEnd - h.boardIn) / 2 * S, 2 * S, P((backEnd + h.boardIn) / 2, h.rimY), 0), { friction: 0, restitution: 0, userData: { kind: 'rim', hoop: hi } });
      var f3 = st.createFixture(pl.Circle(P(h.frontX, h.rimY), (2 + shrink) * S), { friction: 0, restitution: 0, userData: { kind: 'rim', hoop: hi } });
      self.hoopFix[hi] = [f1, f2, f3];
    });
    this.hoopOff = [0, 0];

    // players: team 0 stands on the left (facing right), team 1 on the right
    var xs = spawnXs(this.teams);
    this.players = [];
    for (var i = 0; i < this.teams.length; i++) this.players.push(this.makePlayer(i, xs[i]));
    resetBoosts(this);

    // ball
    this.ball = null;
    this.makeBall(CENTER + (this.random() - 0.5) * 6, 58);
    this.holder = -1;
    this.magnet = -1;
    this.idle = 0;
    this.cheat = null;     // cheat shot in flight: { team, t, from: {x, y}, to: {x, y}, arc }

    world.on('pre-solve', function (c) {
      var ua = c.getFixtureA().getUserData() || {}, ub = c.getFixtureB().getUserData() || {};
      var h = ua.hoop !== undefined ? ua : (ub.hoop !== undefined ? ub : null);
      var b = ua.kind === 'ball' || ub.kind === 'ball';
      if (h && b && self.hoopOff[h.hoop] > 0) c.setEnabled(false);
    });
    world.on('begin-contact', function (c) {
      var ua = c.getFixtureA().getUserData() || {}, ub = c.getFixtureB().getUserData() || {};
      var o = ua.kind === 'ball' ? ub : (ub.kind === 'ball' ? ua : null);
      if (!o) return;
      var v = self.ball.getLinearVelocity().length() / S;
      if (o.kind === 'ground' && v > 40) self.events.push('bounce');
      else if (o.kind === 'rim' && v > 25) self.events.push('rim');
      else if (o.kind === 'board' && v > 25) self.events.push('board');
      else if ((o.kind === 'body' || o.kind === 'head') && v > 60) self.events.push('hit');
      else if (o.kind === 'wall' && v > 50) self.events.push('bounce');
    });
  };

  Game.prototype.makeBall = function (x, y) {
    var b = this.L.ball;
    if (this.ball) this.world.destroyBody(this.ball);
    var ball = this.world.createBody({ type: 'dynamic', position: P(x, y), bullet: true, linearDamping: b.damping, angularDamping: 0.5 });
    ball.createFixture(pl.Circle(b.r * S), { density: b.density, restitution: b.restitution, friction: b.friction, userData: { kind: 'ball' } });
    this.ball = ball;
    this.prevBallY = y;
  };

  // Start x of every player: each team is spread evenly around its half of the court.
  function spawnXs(teams) {
    var xs = [], count = [0, 0], seen = [0, 0], i;
    for (i = 0; i < teams.length; i++) count[teams[i]]++;
    for (i = 0; i < teams.length; i++) {
      var t = teams[i], n = count[t], center = t === 0 ? 94.5 : 196.5, span = Math.min(41 * (n - 1), 60);
      xs.push(n === 1 ? center : center - span / 2 + seen[t] * span / (n - 1));
      seen[t]++;
    }
    return xs;
  }

  Game.prototype.makePlayer = function (idx, x) {
    var world = this.world, ch = this.L.chars, h = ch.h, team = this.teams[idx];
    var facing = team === 0 ? 1 : -1, group = -(idx + 1);
    var body = world.createBody({ type: 'dynamic', position: P(x, GROUND - 0.02), fixedRotation: true });
    var area = 6 * h * S * S;
    body.createFixture(pl.Box(3 * S, h / 2 * S, Vec2(0, -h / 2 * S), 0), { density: 1 / area, friction: 1, restitution: 0, filterGroupIndex: group, userData: { kind: 'body', p: idx } });
    var head = world.createBody({ type: 'dynamic', position: P(x, GROUND - h - 2.5) });
    head.createFixture(pl.Circle(4.5 * S), { density: 1, friction: 0, restitution: 0, filterGroupIndex: group, userData: { kind: 'head', p: idx } });
    world.createJoint(pl.RevoluteJoint({ enableLimit: true, lowerAngle: -10 * Math.PI / 180, upperAngle: 10 * Math.PI / 180 }, body, head, P(x, GROUND - h + 3)));
    return { idx: idx, team: team, facing: facing, body: body, head: head, h: h, reach: ch.arm, baseReach: ch.arm, fx: newFx(),
      angular: 0, jump: false, moreJump: 0, wait: 0, upArrow: false, onGround: true, prevKey: false,
      arm: 0, armed: false, regrab: 0, armTouch: false };
  };

  function deg(a) { return a * 180 / Math.PI; }
  function normDeg(a) { a = a % 360; if (a > 180) a -= 360; if (a < -180) a += 360; return a; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // player points in pixels
  Game.prototype.pt = function (p, lx, ly) { var w = p.body.getWorldPoint(Vec2(lx * S, ly * S)); return { x: w.x / S, y: w.y / S }; };
  Game.prototype.headPoint = function (p) { var q = p.head.getPosition(); return { x: q.x / S, y: q.y / S }; };
  Game.prototype.feet = function (p) { var q = p.body.getPosition(); return { x: q.x / S, y: q.y / S }; };
  Game.prototype.top = function (p) { return this.pt(p, 0, -(p.h - 2)); };
  Game.prototype.shoulder = function (p) { return this.pt(p, -p.facing * 3, -(p.h - 5)); };
  Game.prototype.armAngle = function (p) { return -p.facing * p.arm; };   // arm angle on screen: 0 means down
  Game.prototype.hand = function (p) {
    var s = this.shoulder(p), a = this.armAngle(p) * Math.PI / 180;
    return { x: s.x - Math.sin(a) * p.reach, y: s.y + Math.cos(a) * p.reach };
  };
  Game.prototype.onGround = function (p) {
    var a = p.body.getAngle(), c = Math.cos(a), s = Math.sin(a), q = p.body.getPosition();
    var ys = [[-3, 0], [3, 0], [-3, -p.h], [3, -p.h]].map(function (v) { return q.y / S + v[0] * s + v[1] * c; });
    return Math.max.apply(null, ys) >= GROUND - 3;
  };

  // Party mode: arr[i] is true while player i's button is down.
  Game.prototype.setPlayerKeys = function (arr) { this.pkeys = arr; };

  Game.prototype.setKey = function (team, down) {
    if (this.state === 'over' && down && !this.keys[team] && this.timer <= 0) { this.keys[team] = down; this.resetMatch(); return; }
    this.keys[team] = down;
  };

  Game.prototype.grab = function (i) {
    var p = this.players[i];
    if (this.holder >= 0 && this.holder !== i) this.players[this.holder].armed = false;
    this.events.push(this.holder >= 0 ? 'steal' : 'catch');
    this.holder = i;
    this.magnet = -1;
    p.armed = false;
    this.ball.setActive(false);
  };

  Game.prototype.throwBall = function (p) {
    var hp = this.hand(p);
    var hoop = this.L.hoops[p.team === 0 ? 1 : 0];
    var k = p.arm / ARM_DIV;
    var c = THROW_C + (78 - this.L.goal.rimY);
    var vx = (hoop.targetX - hp.x) * k * this.rnd(0.9, 1.1);
    var vy = (-hp.y - c) * k * this.rnd(0.9, 1.1);
    this.holder = -1;
    p.armed = false;
    p.regrab = 0.25;
    this.ball.setActive(true);
    this.ball.setTransform(P(hp.x, hp.y), this.ball.getAngle());
    this.ball.setLinearVelocity(Vec2(vx * S, vy * S));
    this.ball.setAngularVelocity(-p.facing * 4);
    this.hoopOff[p.team === 0 ? 0 : 1] = 0.1;   // your own hoop lets the ball pass for a moment
    this.events.push('shoot');
  };

  // Cheat code (key C): if this team holds the ball, it flies along an arc straight into the other team's hoop.
  var CHEAT_TIME = 0.6;   // seconds of flight
  Game.prototype.cheatShot = function (team) {
    if (this.state !== 'play' || this.holder < 0 || this.players[this.holder].team !== team || this.cheat) return false;
    var p = this.players[this.holder], hp = this.hand(p);
    var hi = team === 0 ? 1 : 0, h = this.L.hoops[hi];
    var to = { x: (h.openA + h.openB) / 2, y: h.rimY + 6 };
    this.holder = -1;
    this.magnet = -1;
    p.armed = false;
    p.regrab = CHEAT_TIME + 0.3;
    this.ball.setActive(false);     // we move the ball ourselves, so nothing can knock it off course
    this.cheat = { team: team, hoop: hi, t: 0, from: { x: hp.x, y: hp.y }, to: to, arc: 40 + Math.max(0, hp.y - to.y) / 2 };
    this.events.push('shoot');
    return true;
  };

  // Stop-ball combo (keys Z + S): a flying ball stops in the air and falls straight down, whoever threw it.
  Game.prototype.stopBall = function () {
    if (this.state === 'over' || this.holder >= 0 || this.magnet >= 0) return false;
    this.cheat = null;                      // also stops a cheat shot in flight
    this.ball.setActive(true);
    this.ball.setLinearVelocity(Vec2(0, 0));
    this.ball.setAngularVelocity(0);
    this.events.push('stop');
    return true;
  };

  // Ball position on the cheat arc at u = 0..1, plus its speed in px/s.
  function cheatPoint(c, u) {
    // x eases in, so the ball is already right above the hoop when it comes down through the rim
    var ease = 1 - (1 - u) * (1 - u);
    var x = lerp(c.from.x, c.to.x, ease), y = lerp(c.from.y, c.to.y, u) - c.arc * 4 * u * (1 - u);
    var vx = (c.to.x - c.from.x) * 2 * (1 - u) / CHEAT_TIME, vy = ((c.to.y - c.from.y) - c.arc * 4 * (1 - 2 * u)) / CHEAT_TIME;
    return { x: x, y: y, vx: vx, vy: vy };
  }

  // Chaos (keys Z + W): for a few seconds everything goes wild. Players and the ball get random kicks, gravity is low,
  // the shown score jumps around, and the uwu sound plays again and again. The real score is kept and comes back after.
  var CHAOS_TIME = 8, CHAOS_KICK = 0.35, CHAOS_UWU = 0.3, CHAOS_GRAVITY = 0.35;
  Game.prototype.startChaos = function () {
    if (this.state === 'over') return false;
    this.chaos = CHAOS_TIME;
    this.chaosTime = 0;
    this.chaosSeed = Math.floor(this.random() * 1e9);
    this.chaosKick = 0;
    this.chaosUwu = 0;
    this.fakeScore = this.score.slice();
    return true;
  };
  Game.prototype.endChaos = function () {
    this.chaos = 0;
    this.world.setGravity(Vec2(0, G * S));
  };
  // The score to show on screen: random numbers during chaos, the real score otherwise.
  Game.prototype.shownScore = function () { return this.chaos > 0 ? this.fakeScore : this.score; };
  Game.prototype.chaosStep = function () {
    this.chaos -= DT;
    this.chaosTime += DT;
    if (this.chaos <= 0 || this.state === 'over') { this.endChaos(); return; }
    this.world.setGravity(Vec2(0, G * S * CHAOS_GRAVITY));
    this.chaosUwu -= DT;
    if (this.chaosUwu <= 0) { this.chaosUwu = CHAOS_UWU; this.events.push('uwu-chaos'); }
    this.chaosKick -= DT;
    if (this.chaosKick > 0) return;
    this.chaosKick = CHAOS_KICK;
    this.fakeScore = [Math.floor(this.random() * 100), Math.floor(this.random() * 100)];
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      p.body.setLinearVelocity(Vec2(this.rnd(-120, 120) * S, this.rnd(-140, -60) * S));
      p.body.setAngularVelocity(this.rnd(-14, 14));
      p.head.setAngularVelocity(this.rnd(-20, 20));
    }
    if (this.holder < 0 && this.magnet < 0 && !this.cheat) {
      this.ball.setLinearVelocity(Vec2(this.rnd(-160, 160) * S, this.rnd(-160, -40) * S));
      this.ball.setAngularVelocity(this.rnd(-20, 20));
    }
  };

  Game.prototype.step = function () {
    this.tick++;
    if (this.chaos > 0) this.chaosStep();
    var ts = this.slow > 0 ? 0.4 : 1;
    var dt = DT * ts, i, p;
    this.roundTime += DT;
    if (this.slow > 0) this.slow -= DT;
    for (i = 0; i < 2; i++) if (this.hoopOff[i] > 0) this.hoopOff[i] -= dt;
    var playing = this.state !== 'over';

    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      var f = this.feet(p), t = this.top(p);
      var ang = normDeg(deg(p.body.getAngle()));
      var ground = this.onGround(p);
      // landing gives a random push that makes the player wobble
      if (ground && !p.onGround) {
        p.angular = (f.x >= t.x ? 1 : -1) * this.rnd(LAND_MIN, LAND_MAX);
        if (this.roundTime > 0.3) this.events.push('land');
      }
      if (ground && p.jump) { p.jump = false; p.moreJump = 0; }
      p.onGround = ground;
      // wobble is controlled only on the ground; in the air the body keeps spinning as it was
      if (ground) {
        if (f.y < t.y) p.angular = (f.x > t.x ? 1 : -1) * WOOBLE;       // upside down: flip back
        p.body.setAngularVelocity(p.angular * DT * ANGULAR_FORCE * Math.PI / 180);
        p.angular = lerp(p.angular, 0, dt / DIVIDE_SMOOTH);
        if (Math.abs(ang) <= 10) p.angular = lerp(p.angular, 0, dt / DIVIDE_SMOOTH);
        else if (f.x > t.x) p.angular += ANGULAR_SUB * dt * 60;
        else if (f.x < t.x) p.angular -= ANGULAR_SUB * dt * 60;
      }

      // controls (a frozen player cannot press; boosts change jump power, arm speed, and arm length)
      var fx = p.fx, frozen = fx.freeze > 0;
      var key = playing && !frozen && (this.pkeys ? !!this.pkeys[i] : this.keys[p.team]);
      var jumpPower = JUMP_V0 * (fx.jump > 0 ? JUMP_BOOST : 1) * (fx.slow > 0 ? SLOW_JUMP : 1);
      var armSpeed = ARM_SPEED * (fx.speed > 0 ? SPEED_ARM : 1) * (fx.slow > 0 ? SLOW_ARM : 1);
      p.reach = p.baseReach * (fx.arms > 0 ? ARMS_REACH : 1);
      if (p.wait > 0) p.wait -= dt;
      if (p.regrab > 0) p.regrab -= dt;
      if (key && !p.prevKey && this.holder === i && !p.armed) p.armed = true;
      if (key) {
        // jump
        if (!p.upArrow && p.wait <= 0 && !p.jump) {
          p.upArrow = true;
          p.angular = 0; p.jump = true; p.wait = 0.3;
          if (ground) {
            var ax = t.x - f.x, ay = t.y - f.y, al = Math.sqrt(ax * ax + ay * ay) || 1;
            var side = fx.speed > 0 ? SPEED_SIDEWAYS : 1;
            p.body.setLinearVelocity(Vec2(ax / al * jumpPower * side * S, ay / al * jumpPower * S));
            p.body.setAngularVelocity(0);
            this.events.push('jump');
          }
          p.angular = -JUMP_LEAN * (f.x - t.x);
        }
        // extra push along the body while the button is held
        if (JUMP_THRUST > 0 && p.moreJump < MORE_JUMP_MAX) {
          var bx = t.x - f.x, by = t.y - f.y, bl = Math.sqrt(bx * bx + by * by) || 1;
          var v = p.body.getLinearVelocity();
          var k2 = JUMP_THRUST * ts;
          p.body.setLinearVelocity(Vec2(v.x + bx / bl * k2 * S, v.y + by / bl * k2 * S));
          p.moreJump += MORE_JUMP_RATE * dt;
        }
        p.arm = Math.min(ARM_MAX, p.arm + armSpeed * ts);
      } else {
        p.upArrow = false;
        p.arm = p.arm > 1 ? Math.max(0, p.arm - armSpeed * ts) : 0;
        if (p.prevKey && p.armed && this.holder === i && !frozen) this.throwBall(p);
      }
      p.prevKey = key;
    }

    // ball and arms
    var bp = this.ball.getPosition(), bx0 = bp.x / S, by0 = bp.y / S, br = this.L.ball.r;
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      var s = this.shoulder(p), hnd = this.hand(p);
      // does the ball touch the arm (line from shoulder to hand)
      var dx = hnd.x - s.x, dy = hnd.y - s.y, ll = dx * dx + dy * dy;
      var tt = Math.max(0, Math.min(1, ((bx0 - s.x) * dx + (by0 - s.y) * dy) / (ll || 1)));
      var cx = s.x + dx * tt - bx0, cy = s.y + dy * tt - by0;
      var touch = cx * cx + cy * cy < (br + 2) * (br + 2);
      if (touch && !this.cheat && !p.armTouch && this.holder !== i && p.regrab <= 0 && this.state !== 'over') {
        var ok = this.holder < 0 || this.players[this.holder].team !== p.team;
        if (ok) this.grab(i);
      }
      p.armTouch = touch;
      // magnet: a low ball near the hand gets pulled into it
      if (!this.cheat && this.holder < 0 && this.magnet < 0 && p.regrab <= 0 && by0 >= 125 && Math.abs(bx0 - hnd.x) < 10 + br && Math.abs(by0 - hnd.y) < 10 + br) {
        this.magnet = i;
        this.ball.setActive(false);
      }
    }
    if (this.magnet >= 0) {
      p = this.players[this.magnet];
      var mh = this.hand(p);
      var nx = lerp(bx0, mh.x, dt * 10), ny = lerp(by0, mh.y, dt * 10);
      this.ball.setTransform(P(nx, ny), this.ball.getAngle());
      if (Math.abs(nx - mh.x) < 3 && Math.abs(ny - mh.y) < 3) this.grab(this.magnet);
      else if (Math.abs(nx - mh.x) > 30 || Math.abs(ny - mh.y) > 30) { this.magnet = -1; this.ball.setActive(true); this.ball.setLinearVelocity(Vec2(0, 0)); }
    }

    if (this.cheat) {
      var ch = this.cheat;
      ch.t = Math.min(CHEAT_TIME, ch.t + dt);
      var cp = cheatPoint(ch, ch.t / CHEAT_TIME);
      this.ball.setTransform(P(cp.x, cp.y), this.ball.getAngle() + 0.3);
      this.ball.setLinearVelocity(Vec2(cp.vx * S, cp.vy * S));
      if (ch.t >= CHEAT_TIME) {
        // the ball is below the rim now: let physics take over and drop it through the net
        this.cheat = null;
        this.hoopOff[ch.hoop] = 0.4;
        this.ball.setActive(true);
        this.ball.setLinearVelocity(Vec2(0, 80 * S));
      }
    }

    this.world.step(dt, 8, 3);
    stepBoosts(this, DT);

    if (this.holder >= 0) {
      var hp2 = this.hand(this.players[this.holder]);
      this.ball.setTransform(P(hp2.x, hp2.y), this.ball.getAngle());
    }

    // score
    bp = this.ball.getPosition();
    var bx = bp.x / S, by = bp.y / S;
    if (this.holder < 0 && this.magnet < 0 && this.state === 'play') {
      for (var hi = 0; hi < 2; hi++) {
        var h = this.L.hoops[hi];
        var line = h.rimY + 2;
        var team = hi === 1 ? 0 : 1;   // the right hoop gives a point to team 0
        var edge = br * 0.3 + this.hoopShrink[team];
        if (this.prevBallY < line && by >= line && bx > h.openA + edge && bx < h.openB - edge && this.ball.getLinearVelocity().y > 0) {
          this.score[team]++;
          this.lastScorer = team;
          this.slow = 0.7;
          this.events.push('score');
          if (this.score[team] >= WIN_SCORE) { this.state = 'over'; this.timer = 1.4; this.events.push('win'); this.endChaos(); }
          else { this.state = 'goal'; this.timer = 1.8; }
        }
      }
    }
    this.prevBallY = by;

    // ball flew away or stopped moving
    var bv = this.ball.getLinearVelocity().length() / S;
    if (this.holder < 0 && this.magnet < 0 && bv < 8) this.idle += DT; else this.idle = 0;
    var out = bx < 0 || bx > FIELD_W || by > GROUND + 20 || by < -400;
    if (out || this.idle > (by < GROUND - 15 ? 2.5 : 5)) {
      this.idle = 0;
      this.ball.setActive(true);
      this.makeBall(CENTER + (this.random() - 0.5) * 6, 40);
      this.events.push('redrop');
    }
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      var fp = this.feet(p);
      if (fp.x < 0 || fp.x > FIELD_W || fp.y > GROUND + 30 || !isFinite(fp.x)) {
        var rx = p.team === 0 ? 90 : 200;
        p.body.setTransform(P(rx, GROUND - 40), 0); p.body.setLinearVelocity(Vec2(0, 0));
        p.head.setTransform(P(rx, GROUND - 40 - p.h - 2.5), 0); p.head.setLinearVelocity(Vec2(0, 0));
      }
    }

    if (this.state === 'goal') {
      this.timer -= DT;
      if (this.timer <= 0) { this.state = 'play'; this.newRound(randomConfig(false, this.teams, this.random.bind(this))); }
    } else if (this.state === 'over') this.timer -= DT;
  };

  // snapshot for drawing and network: per player [x, y, angle, headX, headY, headAngle, arm], then ball [x, y, angle]
  Game.prototype.bodies = function () {
    var out = [], i;
    for (i = 0; i < this.players.length; i++) {
      var p = this.players[i], a = p.body.getPosition(), h = p.head.getPosition();
      out.push(a.x / S, a.y / S, p.body.getAngle(), h.x / S, h.y / S, p.head.getAngle(), this.armAngle(p));
    }
    var b = this.ball.getPosition();
    out.push(b.x / S, b.y / S, this.ball.getAngle());
    return out;
  };
  // ---------- save and load the whole game (online play) ----------
  // The host sends saveState() to guests. A guest loads it and replays its own button presses on top,
  // so its own player reacts at once and the host still decides what really happened.
  function q(x) { return Math.round(x * 1e5) / 1e5; }
  function saveBody(b) {
    var p = b.getPosition(), v = b.getLinearVelocity();
    return [q(p.x), q(p.y), q(b.getAngle()), q(v.x), q(v.y), q(b.getAngularVelocity())];
  }
  function loadBody(b, a) {
    b.setTransform(Vec2(a[0], a[1]), a[2]);
    b.setLinearVelocity(Vec2(a[3], a[4]));
    b.setAngularVelocity(a[5]);
    b.setAwake(true);
  }
  var SCALARS = ['tick', 'seed', 'state', 'timer', 'lastScorer', 'roundTime', 'slow', 'chaos', 'chaosTime', 'chaosSeed',
    'chaosKick', 'chaosUwu', 'holder', 'magnet', 'idle', 'prevBallY'];
  var PLAYER_FIELDS = ['angular', 'jump', 'moreJump', 'wait', 'upArrow', 'onGround', 'prevKey', 'arm', 'armed', 'regrab', 'armTouch'];
  Game.prototype.saveState = function () {
    var st = { round: this.round, cfg: this.cfg, teams: this.teams, score: this.score.slice(), hoopOff: this.hoopOff.slice(), hoopShrink: this.hoopShrink.slice(),
      keys: this.keys.slice(), pkeys: this.pkeys ? this.pkeys.slice() : null, fakeScore: this.fakeScore ? this.fakeScore.slice() : null,
      cheat: this.cheat ? JSON.parse(JSON.stringify(this.cheat)) : null,
      boostsOn: this.boostsOn, nextBoost: q(this.nextBoost), items: JSON.parse(JSON.stringify(this.items)),
      fx: this.players.map(function (p) { return BOOST_KINDS.map(function (k) { return q(p.fx[k]); }); }) };
    for (var i = 0; i < SCALARS.length; i++) st[SCALARS[i]] = typeof this[SCALARS[i]] === 'number' ? q(this[SCALARS[i]]) : this[SCALARS[i]];
    st.tick = this.tick; st.seed = this.seed;
    st.ball = saveBody(this.ball).concat([this.ball.isActive() ? 1 : 0]);
    st.players = this.players.map(function (p) {
      return saveBody(p.body).concat(saveBody(p.head), PLAYER_FIELDS.map(function (f) { return typeof p[f] === 'boolean' ? (p[f] ? 1 : 0) : q(p[f]); }));
    });
    return st;
  };
  Game.prototype.loadState = function (st) {
    // Always start from a fresh physics world, so two games loaded from the same state play out exactly alike.
    this.teams = st.teams.slice();
    if (st.round !== this.round || !this.cfg || st.cfg.seed !== this.cfg.seed) this.L = layout(st.cfg);
    this.cfg = st.cfg;
    this.round = st.round;
    this.hoopShrink = st.hoopShrink ? st.hoopShrink.slice() : [0, 0];
    this.build();
    for (var i = 0; i < SCALARS.length; i++) this[SCALARS[i]] = st[SCALARS[i]];
    this.score = st.score.slice(); this.hoopOff = st.hoopOff.slice(); this.keys = st.keys.slice();
    this.pkeys = st.pkeys ? st.pkeys.slice() : null;
    this.fakeScore = st.fakeScore ? st.fakeScore.slice() : null;
    this.cheat = st.cheat ? JSON.parse(JSON.stringify(st.cheat)) : null;
    this.boostsOn = !!st.boostsOn;
    if (st.items) { this.items = JSON.parse(JSON.stringify(st.items)); this.nextBoost = st.nextBoost; }
    var self = this;
    if (st.fx) st.fx.forEach(function (arr, k) { BOOST_KINDS.forEach(function (kind, j) { self.players[k].fx[kind] = arr[j]; }); });
    loadBody(this.ball, st.ball);
    this.ball.setActive(!!st.ball[6]);
    for (var k = 0; k < this.players.length; k++) {
      var p = this.players[k], a = st.players[k];
      loadBody(p.body, a.slice(0, 6)); loadBody(p.head, a.slice(6, 12));
      for (var f = 0; f < PLAYER_FIELDS.length; f++) {
        var v = a[12 + f];
        p[PLAYER_FIELDS[f]] = typeof p[PLAYER_FIELDS[f]] === 'boolean' ? !!v : v;
      }
    }
    this.world.setGravity(Vec2(0, G * S * (this.chaos > 0 ? CHAOS_GRAVITY : 1)));
    this.events = [];
  };

  Game.prototype.takeEvents = function () { var e = this.events; this.events = []; return e; };

  // ---------- computer player ----------
  class Bot { constructor(team, level) {
    this.team = team; this.level = level || 1;
    this.down = false; this.t = 0; this.plan = null; this.cool = 0.4;
  } }
  Bot.prototype.update = function (g) {
    var dt = DT;
    if (g.state === 'over') { this.down = false; return false; }
    var mine = g.players.filter(function (p) { return p.team === this.team; }, this);
    var holder = g.holder >= 0 ? g.players[g.holder] : null;
    var bp = g.ball.getPosition(), bx = bp.x / S, by = bp.y / S;
    this.t += dt;
    if (this.cool > 0) { this.cool -= dt; return this.down; }
    if (holder && holder.team === this.team) {
      // holding the ball: press, wait for the arm to go up, release
      if (!this.down) {
        if (!holder.armed && this.t > 0.08 + Math.random() * 0.1) { this.down = true; this.t = 0; this.target = 150 + Math.random() * 30; }
      } else if (holder.armed && holder.arm >= Math.min(180, this.target)) { this.down = false; this.t = 0; this.cool = 0.1; }
      else if (!holder.armed && this.t > 0.1) { this.down = false; this.t = 0; }
      return this.down;
    }
    if (this.down) {
      if (this.t > this.hold) { this.down = false; this.t = 0; this.cool = 0.12 + Math.random() * 0.25; }
      return this.down;
    }
    var want = 0.02;
    for (var i = 0; i < mine.length; i++) {
      var p = mine[i], f = g.feet(p);
      var dx = (bx - f.x) * p.facing, ady = f.y - by;
      if (Math.abs(bx - f.x) < 40 && ady < 90) want = Math.max(want, dx > -10 ? 0.35 : 0.12);
      if (holder && holder.team !== this.team && Math.abs(bx - f.x) < 35) want = Math.max(want, 0.3);
    }
    if (Math.random() < want * (0.6 + 0.3 * this.level)) { this.down = true; this.t = 0; this.hold = 0.12 + Math.random() * 0.3; }
    return this.down;
  };

export var Sim = { Game: Game, Bot: Bot, layout: layout, randomConfig: randomConfig, PLACES: PLACES, BALLS: BALLS, CHARS: CHARS, GOALS: GOALS,
    DT: DT, WIN_SCORE: WIN_SCORE, FIELD_W: FIELD_W, FIELD_H: FIELD_H, GROUND: GROUND, S: S };

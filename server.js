// 三麻 ノーマル華4 オンライン対戦サーバー
"use strict";
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { createGame } = require("./game.js");

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/game.js", (req, res) => res.sendFile(path.join(__dirname, "game.js")));
app.get("/healthz", (req, res) => res.send("ok"));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = new Map();
const CPU_NAMES = ["CPU 一号", "CPU 二号", "CPU 三号"];
const newCode = () => { let c; do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(c)); return c; };
const newToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ---------- 席の回転（自分を0、下家を1、上家を2にして送る） ----------
const rotOf = me => s => (s == null || s < 0) ? s : (s - me + 3) % 3;
const rotArr = (arr, me) => [0, 1, 2].map(i => arr[(i + me) % 3]);

// ---------- 半荘の成績をスプレッドシートに記録（環境変数 SHEET_URL があるとき） ----------
const SHEET_URL = (process.env.SHEET_URL || "").trim(), SHEET_SECRET = (process.env.SHEET_SECRET || "").trim();
// テスト用：true の間は、最初からCPUが入っている半荘も記録する（確認が終わったら false に戻す）
const RECORD_CPU_GAMES = true;
async function callSheet(body) {
  for (let i = 0; i < 3; i++) {
    try {
      // POST は Apps Script の転送先で失敗することがあるので、結果も GET の ?data=… で送る
      const res = await fetch(body ? SHEET_URL + (SHEET_URL.includes("?") ? "&" : "?") + "data=" + encodeURIComponent(JSON.stringify(body)) : SHEET_URL);
      const text = await res.text(); let d;
      try { d = JSON.parse(text); }
      catch { console.log(`sheet bad response ${res.status} ${res.url.slice(0, 60)} :: ${text.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)}`); throw new Error("not JSON"); }
      if (d.ok) { console.log(`sheet ok (${body ? `recorded ${body.gameKey}, ${(d.totals || []).length} names this week` : "connected"})`); return true; }
      console.log("sheet error", d.error); return false;
    } catch (e) { console.log("sheet failed", e.message); await new Promise(r => setTimeout(r, 3000 * (i + 1))); }
  }
  return false;
}
function sendToSheet(room, order) {
  if (!SHEET_URL || room.sentGid === room.gameId) return;
  room.sentGid = room.gameId;
  const G = room.game.G;
  const players = [0, 1, 2].map(s => ({ name: room.names[s], rank: order.indexOf(s) + 1, chips: G.chips[s] }));
  callSheet({ secret: SHEET_SECRET, room: room.code, gameKey: room.gameKey, players });
}
if (SHEET_URL && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(SHEET_URL)) console.log("sheet WARNING: SHEET_URL は https://script.google.com/macros/s/…/exec の形にしてください（今: " + SHEET_URL.slice(0, 60) + "…）");
if (SHEET_URL) callSheet(null); else console.log("sheet off (SHEET_URL not set)");

function roomPublic(room) {
  return {
    code: room.code, phase: room.phase,
    seats: room.seats.map((p, i) => p ? { name: p.name, cpu: !!p.cpu, online: p.cpu || !!p.socket, host: p.token === room.hostToken, ready: !!p.ready } : null),
    allReady: room.seats.filter(p => p && !p.cpu).every(p => p.ready),
  };
}
function broadcastLobby(room) {
  for (const p of room.seats) if (p && p.socket) p.socket.emit("lobby", { ...roomPublic(room), mySeat: room.seats.indexOf(p), isHost: p.token === room.hostToken });
}

function viewFor(room, seat) {
  const g = room.game, G = g.G, H = g.H, r = rotOf(seat);
  const pl = H.p.map((P, s) => ({
    hand: s === seat || P.open ? P.hand : null, handCount: P.hand.length, open: !!P.open,
    melds: P.melds.map(m => ({ ...m, from: r(m.from) })),
    river: P.river, kita: P.kita, hana: P.hana, riichi: P.riichi,
  }));
  const me = H.p[seat];
  let acts = null;
  if (H.state === "play" && H.turn === seat) {
    const tw = g.tryTsumo(seat);
    acts = { tsumo: !!tw, pocchi: !!(tw && tw.pocchi), riichi: g.riichiOptions(seat), openRiichi: g.riichiOptions(seat, true), kan: g.kanOptions(seat),
      kita: me.hand.some(t => t.k === 30), hana: me.hand.some(t => t.k >= 34) };
  }
  let prompt = null, othersDeciding = false;
  if (H.state === "prompt" && H.prompt) {
    const p = H.prompt.pend[seat];
    if (p && !p.answer) prompt = { s: r(H.prompt.s), t: H.prompt.t, human: !!p.ron, pon: p.pon, kan: p.kan };
    else othersDeciding = true;
  }
  return {
    gid: room.gameId, hid: H.id,
    names: rotArr(room.names.map((n, i) => room.seats[i] && !room.seats[i].cpu && (room.seats[i].away || !room.seats[i].socket) ? n + "（代打）" : n), seat), kyoku: G.dealer + 1,
    away: !!(room.seats[seat] && room.seats[seat].away),
    turnLeft: room.turnTimer && room.turnTimer.seat === seat ? Math.max(0, room.turnTimer.until - Date.now()) : null, phase: G.phase, honba: G.honba, kyotaku: G.kyotaku,
    dealer: r(G.dealer), turn: r(H.turn), state: H.state, live: H.live.length,
    scores: rotArr(G.scores, seat), chips: rotArr(G.chips, seat),
    dora: H.dead.dora.concat(H.kanDora), players: rotArr(pl, seat),
    drawnId: H.turn === seat && H.drawn ? H.drawn.id : null,
    acts, prompt, othersDeciding, danger: g.openDanger(seat), allowed: g.discardable(seat),
    tp: tenpaiFor(g, seat), noNaki: !!H.noNaki[seat], log: G.log.slice(0, 40),
  };
}
// 聴牌補助：切るとテンパイになる牌と待ち・フリテン
function tenpaiFor(g, seat) {
  const H = g.H, P = H.p[seat], out = { cand: {}, cur: null };
  if (P.hand.some(t => t.k >= 34)) return out;
  const riverK = P.river.map(r => r.t.k);
  if (H.state === "play" && H.turn === seat) {
    const ok = g.discardable(seat), done = {};
    for (const t of P.hand) {
      if (!ok.includes(t.id)) continue;
      if (done[t.k] !== undefined) { if (done[t.k]) out.cand[t.id] = done[t.k]; continue; }
      const rest = P.hand.filter(x => x !== t); let info = null;
      if (g.shanten(rest, P.melds.length) === 0) { const w = g.waits(seat, rest); if (w.length) info = { waits: w, fu: !!P.riichiF || w.some(k => riverK.includes(k) || k === t.k) }; }
      done[t.k] = info; if (info) out.cand[t.id] = info;
    }
  } else if (P.hand.length % 3 === 1 && g.shanten(P.hand, P.melds.length) === 0) {
    const w = g.waits(seat, P.hand);
    if (w.length) out.cur = { waits: w, fu: !!(P.tempF || P.riichiF) || w.some(k => riverK.includes(k)) };
  }
  return out;
}
function rotG(G, seat) {
  return { scores: rotArr(G.scores, seat), chips: rotArr(G.chips, seat), dealer: rotOf(seat)(G.dealer), phase: G.phase, honba: G.honba, kyotaku: G.kyotaku, over: G.over,
    log: G.log.slice(0, 60), hist: G.hist.map(h => ({ ...h, dp: rotArr(h.dp, seat), dc: rotArr(h.dc, seat), sc: rotArr(h.sc, seat), ch: rotArr(h.ch, seat) })) };
}
function rotR(R, seat) {
  const r = rotOf(seat);
  return {
    ...R,
    handDealer: r(R.handDealer), handKyoku: R.handDealer + 1,
    pts: R.pts.map(p => ({ ...p, from: r(p.from), to: r(p.to) })),
    chips: R.chips.map(c => ({ ...c, from: r(c.from), to: r(c.to) })),
    dice: R.dice.map(d => ({ ...d, s: r(d.s) })),
    wins: R.wins.map(w => ({ ...w, s: r(w.s), from: r(w.from), pao: w.pao == null ? w.pao : r(w.pao), w: w.w ? { ...w.w, o: r(w.w.o) } : w.w })),
    draw: R.draw ? { ten: rotArr(R.draw.ten, seat), naga: R.draw.naga.map(r) } : null,
    yame: R.yame ? { ...R.yame, s: r(R.yame.s) } : null,
  };
}
function resultFor(room, seat) {
  const g = room.game, H = g.H, R = g.R;
  const showHand = new Set();
  for (const w of R.wins) showHand.add(w.s);
  const waits = [null, null, null];
  if (R.draw) for (let s = 0; s < 3; s++) if (R.draw.ten[s]) { showHand.add(s); waits[s] = g.waits(s, H.p[s].hand); }
  const p = H.p.map((P, s) => ({ melds: P.melds.map(m => ({ ...m, from: rotOf(seat)(m.from) })), kita: P.kita, hana: P.hana, riichi: P.riichi, hand: showHand.has(s) ? P.hand : [] }));
  return {
    gid: room.gameId, hid: H.id,
    R: rotR(R, seat), G: rotG(g.G, seat), names: rotArr(room.names, seat),
    snap: { dora: H.dead.dora, kanDora: H.kanDora, ura: H.dead.ura, kanUra: H.kanUra, p: rotArr(p, seat), waits: rotArr(waits, seat) },
  };
}

function humanSeats(room) { return [0, 1, 2].filter(s => room.seats[s] && !room.seats[s].cpu); }
function emitTo(room, seat, ev, data) { const p = room.seats[seat]; if (p && p.socket) p.socket.emit(ev, data); }

const TURN_MS = +(process.env.TURN_MS || 2 * 60 * 1000);
function armTurnTimer(room) {
  const g = room.game; if (!g || room.phase !== "play") return;
  const H = g.H; const s = H.turn; const p = room.seats[s];
  const human = p && !p.cpu && p.socket && !p.away;
  const key = H.state === "play" && human ? `${H.id}:${s}:${H.p[s].river.length}:${H.p[s].melds.length}:${H.p[s].kita.length}:${H.p[s].hana.length}` : null;
  if (room.turnTimer && room.turnTimer.key === key) return;
  if (room.turnTimer) clearTimeout(room.turnTimer.t);
  room.turnTimer = null;
  if (!key) return;
  room.turnTimer = { key, seat: s, until: Date.now() + TURN_MS, t: setTimeout(() => {
    room.turnTimer = null;
    const pp = room.seats[s]; if (!pp || pp.cpu) return;
    pp.away = true; // 一度退出（CPUに切り替え）
    kickAway(room, s); schedulePush(room);
  }, TURN_MS) };
}
function backFromAway(room, s) {
  const p = room.seats[s]; if (!p || !p.away) return false;
  p.away = false; schedulePush(room); return true;
}
function pushViews(room) {
  if (!room.game || room.phase !== "play") return;
  armTurnTimer(room);
  for (const s of humanSeats(room)) emitTo(room, s, "view", viewFor(room, s));
}

function startGame(room) {
  room.gameId = (room.gameId || 0) + 1;
  room.gameKey = room.code + "-" + Date.now();
  // 席をシャッフル（起家はランダム）
  const people = room.seats.map((p, i) => p || { name: CPU_NAMES[i], cpu: true, token: null, socket: null });
  shuffleArr(people);
  room.seats = people;
  room.names = people.map(p => p.name);
  room.phase = "play"; room.ready = new Set();
  if (room.game) room.game.destroy();
  const SE = {
    say: (text, s) => { for (const h of humanSeats(room)) emitTo(room, h, "se", { say: text, seat: rotOf(h)(s) }); },
    clack: () => { for (const h of humanSeats(room)) emitTo(room, h, "se", { t: "clack" }); },
    draw: s => emitTo(room, s, "se", { t: "draw" }),
    shuffle: () => { for (const h of humanSeats(room)) emitTo(room, h, "se", { t: "shuffle" }); },
    win: () => {},
  };
  room.game = createGame({
    names: room.names,
    isCPU: s => { const p = room.seats[s]; return !p || p.cpu || !p.socket || p.away; },
    SE,
    update: () => schedulePush(room),
    result: () => {
      room.phase = "result"; room.ready = new Set();
      for (const s of humanSeats(room)) emitTo(room, s, "result", resultFor(room, s));
      autoReadyAway(room);
    },
    final: order => {
      room.phase = "final"; room.ready = new Set();
      const g = room.game;
      // 最初からCPUが入っている半荘は通算に入れない（途中の切断で代打になった人は本人の名前で入れる）
      if (RECORD_CPU_GAMES || !room.seats.some(p => p && p.cpu)) sendToSheet(room, order);
      else console.log("sheet skip (CPU game) room " + room.code);
      for (const s of humanSeats(room)) emitTo(room, s, "final", { gid: room.gameId, order: order.map(rotOf(s)), R: rotR(g.R, s), G: rotG(g.G, s), names: rotArr(room.names, s) });
    },
  });
  broadcastLobby(room);
  room.game.newGame();
}
function backToRoom(room) {
  if (room.game) room.game.destroy();
  room.game = null; room.phase = "lobby"; room.ready = new Set();
  if (room.turnTimer) { clearTimeout(room.turnTimer.t); room.turnTimer = null; }
  room.seats = room.seats.map(p => p && !p.cpu ? Object.assign(p, { ready: false, away: false }) : null);
  if (!room.seats.some(p => p && p.token === room.hostToken)) { const h = room.seats.find(p => p); if (h) room.hostToken = h.token; }
  broadcastLobby(room);
}
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function schedulePush(room) { if (room._push) return; room._push = setImmediate(() => { room._push = null; pushViews(room); }); }

function readyState(room) {
  const need = humanSeats(room).filter(s => room.seats[s].socket && !room.seats[s].away);
  return { ready: need.filter(s => room.ready.has(s)).length, total: need.length };
}
function checkReady(room) {
  const need = humanSeats(room).filter(s => room.seats[s].socket && !room.seats[s].away);
  for (const s of humanSeats(room)) emitTo(room, s, "ready", readyState(room));
  // オーラスの親の和了やめ：親がまだ選んでいなければ待つ（CPU・代打・切断中なら自動で決める）
  const Y = room.phase === "result" && room.game && room.game.R.yame;
  if (Y && Y.choice == null) {
    const p = room.seats[Y.s];
    if (p && !p.cpu && p.socket && !p.away) return;
    const G = room.game.G;
    room.game.decideYame(G.scores[Y.s] === Math.max(...G.scores)); // 代打はトップならやめる
  }
  if (need.every(s => room.ready.has(s))) {
    room.ready = new Set();
    if (room.phase === "result") {
      if (room.game.G.over) room.game.endGame();
      else { room.phase = "play"; room.game.startHand(); }
    } else if (room.phase === "final") {
      room.phase = "play"; room.game.newGame();
    }
  }
}
function autoReadyAway(room) { /* 切断中の人は待たない */ checkReady(room); }

// 切断中の人の番を代わりに進める
function kickAway(room, seat) {
  const g = room.game; if (!g || room.phase !== "play") return;
  const H = g.H;
  if (H.state === "prompt" && H.prompt && H.prompt.pend[seat] && !H.prompt.pend[seat].answer) g.promptAnswer(seat, "pass");
  if (H.state === "play" && H.turn === seat) {
    const P = H.p[seat];
    while (P.hand.some(t => t.k >= 34)) g.nukiHana(seat);
    while (P.hand.some(t => t.k === 30)) g.nukiKita(seat);
    const tw = g.tryTsumo(seat); if (tw) return g.settleTsumo(seat, tw);
    const ok = g.discardable(seat);
    const t = H.drawn && ok.includes(H.drawn.id) ? H.drawn : P.hand.find(x => ok.includes(x.id));
    if (t) g.discard(seat, t.id, false);
  }
}

io.on("connection", socket => {
  let room = null, _seat = -1;
  // 対局開始時に席がシャッフルされるので、毎回ソケットから席を引き直す
  const seatNow = () => { if (!room) return -1; const i = room.seats.findIndex(p => p && p.socket === socket); return i >= 0 ? i : _seat; };
  const err = msg => socket.emit("err", msg);

  function attach(r, s) {
    room = r; _seat = s;
    const p = r.seats[s]; p.socket = socket; p.away = false;
    socket.emit("joined", { code: r.code, token: p.token, seat: s });
    broadcastLobby(r);
    if (r.phase === "play" && r.game) emitTo(r, s, "view", viewFor(r, s));
    if (r.phase === "result" && r.game) { emitTo(r, s, "result", resultFor(r, s)); emitTo(r, s, "ready", readyState(r)); }
  }

  socket.on("create", ({ name }) => {
    name = String(name || "").trim().slice(0, 12) || "プレイヤー";
    const code = newCode(), token = newToken();
    const r = { code, seats: [{ name, token, socket: null, ready: false }, null, null], hostToken: token, phase: "lobby", game: null, ready: new Set(), names: [] };
    rooms.set(code, r);
    attach(r, 0);
  });

  socket.on("join", ({ code, name, token }) => {
    const r = rooms.get(String(code || "").trim());
    if (!r) return err("そのルームは見つかりません");
    if (token) { const s = r.seats.findIndex(p => p && p.token === token); if (s >= 0) { if (name && r.phase === "lobby") r.seats[s].name = String(name).slice(0, 12); clearTimeout(r.seats[s].awayTimer); return attach(r, s); } }
    if (r.phase !== "lobby") return err("このルームはもう対局が始まっています");
    const s = r.seats.findIndex(p => !p);
    if (s < 0) return err("このルームは満員です");
    name = String(name || "").trim().slice(0, 12) || "プレイヤー";
    r.seats[s] = { name, token: newToken(), socket: null, ready: false };
    attach(r, s);
  });

  socket.on("start", () => {
    if (!room || room.phase !== "lobby") return;
    if (room.seats[seatNow()].token !== room.hostToken) return err("開始できるのはルームを作った人です");
    if (!room.seats.filter(p => p && !p.cpu).every(p => p.ready)) return err("全員の準備OKがそろっていません");
    startGame(room);
  });

  socket.on("lobbyReady", () => {
    if (!room || room.phase !== "lobby") return;
    const p = room.seats[seatNow()]; if (!p) return;
    p.ready = !p.ready; broadcastLobby(room);
    // 3人とも人間で全員準備OKなら自動で開始
    if (room.seats.every(q => q && !q.cpu && q.ready)) startGame(room);
  });
  socket.on("toRoom", () => {
    if (!room || room.phase !== "final") return;
    backToRoom(room);
  });
  socket.on("act", a => {
    if (!room || !room.game || room.phase !== "play") return;
    const g = room.game, H = g.H, s = seatNow(); if (s < 0) return;
    if (a && a.t === "back") { backFromAway(room, s); return; }
    if (backFromAway(room, s)) return; // 代打中だった：まず本人に戻すだけ
    try {
      switch (a && a.t) {
        case "discard": {
          if (H.state !== "play" || H.turn !== s) return;
          const P = H.p[s]; if (P.hand.some(t => t.k >= 34)) return;
          if (a.riichi && !g.riichiOptions(s, !!a.open).includes(a.id)) return;
          if (P.riichi && H.drawn && a.id !== H.drawn.id) return;
          g.discard(s, a.id, !!a.riichi, !!(a.riichi && a.open)); break;
        }
        case "tsumo": { if (H.state !== "play" || H.turn !== s) return; const w = g.tryTsumo(s); if (w) g.settleTsumo(s, w); break; }
        case "kita": { if (H.state !== "play" || H.turn !== s) return; g.nukiKita(s); schedulePush(room); if (H.p[s].riichi) setTimeout(() => g.riichiAuto(s), 380); break; }
        case "hana": { if (H.state !== "play" || H.turn !== s) return; g.nukiHana(s); schedulePush(room); if (H.p[s].riichi) setTimeout(() => g.riichiAuto(s), 380); break; }
        case "kan": { if (H.state !== "play" || H.turn !== s) return; if (!g.kanOptions(s).some(o => o.type === a.type && o.k === a.k)) return; g.doKan(s, a.type, a.k); break; }
        case "answer": { if (!g.promptAnswer(s, a.a)) return; break; }
        case "nonaki": { H.noNaki[s] = !H.noNaki[s];
          if (H.noNaki[s] && H.state === "prompt" && H.prompt && H.prompt.pend[s] && !H.prompt.pend[s].answer && !H.prompt.pend[s].ron) g.promptAnswer(s, "pass");
          schedulePush(room); break; }
      }
    } catch (e) { console.error(e); }
  });

  socket.on("next", () => {
    if (!room || !["result", "final"].includes(room.phase)) return;
    { const pp = room.seats[seatNow()]; if (pp) pp.away = false; }
    room.ready.add(seatNow()); checkReady(room);
  });

  socket.on("yame", stop => {
    if (!room || room.phase !== "result" || !room.game) return;
    const Y = room.game.R.yame, seat = seatNow();
    if (!Y || Y.choice != null || Y.s !== seat) return;
    room.game.decideYame(!!stop);
    for (const s of humanSeats(room)) emitTo(room, s, "yame", { stop: !!stop, msg: room.game.R.msg });
    room.ready.add(seat); checkReady(room);
  });

  socket.on("leaveRoom", () => {
    if (!room) return;
    const seat = seatNow();
    if (room.phase === "lobby") { room.seats[seat] = null; if (room.seats.every(p => !p)) rooms.delete(room.code); else { if (!room.seats.some(p => p && p.token === room.hostToken)) { const h = room.seats.find(p => p); room.hostToken = h.token; } broadcastLobby(room); } }
    room = null; _seat = -1;
  });

  socket.on("disconnect", () => {
    if (!room) return;
    const r = room, s = seatNow(), p = r.seats[s];
    if (!p || p.socket !== socket) return;
    p.socket = null;
    broadcastLobby(r);
    if (r.phase === "lobby") {
      p.awayTimer = setTimeout(() => { if (!p.socket && r.seats[s] === p) { r.seats[s] = null; if (r.seats.every(x => !x)) rooms.delete(r.code); else broadcastLobby(r); } }, 60000);
      return;
    }
    // 対局中：その人の番なら代わりに進める（CPU扱い）
    setTimeout(() => { if (!p.socket) { kickAway(r, s); if (r.phase !== "play") checkReady(r); } }, 3000);
    // 全員いなくなったらルームを片付ける
    p.awayTimer = setTimeout(() => { if (humanSeats(r).every(x => !r.seats[x].socket)) { if (r.game) r.game.destroy(); rooms.delete(r.code); } }, 30 * 60 * 1000);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("sanma server on " + PORT));

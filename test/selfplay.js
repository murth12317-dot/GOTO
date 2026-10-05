// 自動テスト：CPUだけで何半荘も続けて打たせて、止まる・エラー・点数や祝儀のずれ・結果の出し直しがないかを見る
// 使い方：npm test（または node test/selfplay.js 半荘数）
"use strict";
const { createGame } = require("../game.js");
const GAMES = +(process.argv[2] || 10);
const HAND_TIMEOUT_MS = 5000;

let failed = 0;
const fail = msg => { failed++; console.error("NG:", msg); };

const g = createGame({
  speed: 0, names: ["CPU1", "CPU2", "CPU3"], isCPU: () => true,
  SE: { say() {}, clack() {}, draw() {}, shuffle() {}, win() {} },
  update() {}, result: onResult, final: onFinal,
});

let yames = 0, games = 0, hands = 0, lastKey = null, watchdog = null, gameHands = 0;
const seen = new Set();
function arm() {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => { fail(`止まりました（${games + 1}半荘目 ${g.H && g.H.id}局目）`); finish(); }, HAND_TIMEOUT_MS);
}
function onResult() {
  const G = g.G, H = g.H;
  const key = games + ":" + H.id;
  if (seen.has(key)) fail(`同じ結果が2回出ました（${key}）`);
  seen.add(key); hands++; gameHands++;
  const pts = G.scores.reduce((a, b) => a + b, 0) + G.kyotaku * 1000;
  const chips = G.chips.reduce((a, b) => a + b, 0);
  if (pts !== 105000) fail(`点数の合計がずれました：${pts}（${key}）`);
  if (chips !== 0) fail(`祝儀の合計がずれました：${chips}（${key}）`);
  if (G.hist.length !== gameHands) fail(`履歴の数がずれました：${G.hist.length} / ${gameHands}`);
  if (g.R.yame) { yames++; if (G.over) fail("和了やめを選ぶ前に終局になっています"); g.decideYame(Math.random() < 0.5); }
  arm();
  setImmediate(() => { try { G.over ? g.endGame() : g.startHand(); } catch (e) { fail(e.stack); finish(); } });
}
function onFinal(order) {
  games++; gameHands = 0;
  const G = g.G;
  if (G.chips.reduce((a, b) => a + b, 0) !== 0) fail("終局の祝儀の合計がずれました");
  if (order.length !== 3) fail("順位が3人分ありません");
  if (games >= GAMES) return finish();
  arm();
  setImmediate(() => { try { g.newGame(); } catch (e) { fail(e.stack); finish(); } });
}
function finish() {
  clearTimeout(watchdog); g.destroy();
  console.log(`${games}半荘・${hands}局を打ちました（和了やめの選択 ${yames}回）。` + (failed ? `NG ${failed}件` : "問題なし"));
  process.exit(failed ? 1 : 0);
}
process.on("uncaughtException", e => { fail(e.stack); finish(); });
arm(); g.newGame();

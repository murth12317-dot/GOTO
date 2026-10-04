// 配牌の偏りチェック（カイ二乗検定）
// 使い方：node test/deal-check.js 回数
"use strict";
const N = +(process.argv[2] || 200000);
// game.js と同じ作り方の山とシャッフル
const ALLK = [0, 8]; for (let i = 9; i <= 33; i++) ALLK.push(i);
function buildTiles() { let id = 0; const a = []; const add = (k, o = {}) => a.push(Object.assign({ id: id++, k }, o));
  for (const k of ALLK) { if (k === 13 || k === 22) { add(k, { red: true }); add(k, { gold: true }); add(k); add(k); } else if (k === 31) { add(k, { pocchi: true }); add(k); add(k); add(k); } else for (let j = 0; j < 4; j++) add(k); }
  for (let f = 34; f <= 37; f++) add(f); return a; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// カイ二乗分布の上側確率
function gammaincc(s, x) { // 正則化不完全ガンマ Q(s,x)
  if (x < s + 1) { let sum = 1 / s, term = sum; for (let n = 1; n < 500; n++) { term *= x / (s + n); sum += term; if (term < sum * 1e-12) break; } return 1 - sum * Math.exp(-x + s * Math.log(x) - lgamma(s)); }
  let b = x + 1 - s, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 500; i++) { const an = -i * (i - s); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; }
  return Math.exp(-x + s * Math.log(x) - lgamma(s)) * h; }
function lgamma(z) { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i); const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); }
const chi = (obs, exp) => obs.reduce((a, o, i) => a + (o - exp[i]) ** 2 / exp[i], 0);
const report = (name, obs, exp) => { const x = chi(obs, exp), df = obs.length - 1, p = gammaincc(df / 2, x / 2);
  console.log(`${name}：χ²=${x.toFixed(1)}（自由度${df}） p=${p.toFixed(3)} ${p > 0.01 ? "偏りなし" : "偏りの疑いあり"}`); return p; };

const T = buildTiles(); const n = T.length;
const posOf0 = new Array(n).fill(0);          // 1枚目の牌がどの位置に来るか
const seatKind = [0, 1, 2].map(() => new Array(38).fill(0)); // 各席の配牌13枚に入る牌の種類
const deadKind = new Array(38).fill(0);       // 王牌（嶺上12＋ドラ4）に入る牌の種類
for (let r = 0; r < N; r++) {
  const a = shuffle(buildTiles());
  posOf0[a.findIndex(t => t.id === 0)]++;
  const dead = a.slice(-16), live = a.slice(0, -16);
  for (const t of dead) deadKind[t.k]++;
  for (let i = 0; i < 39; i++) seatKind[i % 3][live[i].k]++;
}
const kinds = ALLK.concat([34, 35, 36, 37]);
const cnt = k => T.filter(t => t.k === k).length;
let ok = true;
ok &= report("牌の位置（1枚目の牌）", posOf0, posOf0.map(() => N / n)) > 0.01;
for (let s = 0; s < 3; s++) ok &= report(`${["親", "南家", "西家"][s]}の配牌の種類`, kinds.map(k => seatKind[s][k]), kinds.map(k => N * 13 * cnt(k) / n)) > 0.01;
ok &= report("王牌の種類", kinds.map(k => deadKind[k]), kinds.map(k => N * 16 * cnt(k) / n)) > 0.01;
console.log(ok ? "→ 配牌に偏りはありません" : "→ 偏りの疑いがあります");
process.exit(ok ? 0 : 1);

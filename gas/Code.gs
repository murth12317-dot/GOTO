// 三麻 成績の自動記録（Google Apps Script）
// スプレッドシートの「拡張機能 → Apps Script」に貼り付けて、ウェブアプリとして公開する
// 手順は README の「通算成績をスプレッドシートに記録する」を見てください
// 週（日曜はじまり・日本時間）ごとに1枚のシートを作り、左に半荘ごとの記録、右にその週の通算を出す

// Render の環境変数 SHEET_SECRET と同じ文字列にする（他の人に書き込まれないための合言葉）
const SECRET = "ここに合言葉を入れる";

const REC_HEAD = ["日時", "ルーム", "半荘ID", "名前", "着順", "祝儀", "倍率", "祝儀×倍率"];
const TOT_HEAD = ["名前", "半荘", "1着", "2着", "3着", "祝儀計", "祝儀×倍率計"];
const TOT_COL = REC_HEAD.length + 2; // 記録の右に1列あけて通算を出す

// ゲームのサーバーから半荘の結果が届く（GET の ?data=… で届く。POST でも受け付ける）
function doPost(e) { return record(JSON.parse(e.postData.contents)); }
function record(d) {
  if (d.secret !== SECRET) return json({ ok: false, error: "secret" });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const now = new Date();
    const sh = weekSheet(weekName(now));
    const last = lastRecRow(sh);
    // 同じ半荘が二重に届いたら書かない
    const ids = last > 1 ? sh.getRange(2, 3, last - 1, 1).getValues().flat().map(String) : [];
    if (!ids.includes(String(d.gameKey))) {
      const at = Utilities.formatDate(now, "Asia/Tokyo", "yyyy/MM/dd HH:mm");
      const rate = Number(d.rate) || 1;
      const rows = d.players.map(p => [at, d.room, d.gameKey, p.name, p.rank, p.chips, rate, Math.round(p.chips * rate * 1000) / 1000]);
      sh.getRange(last + 1, 1, rows.length, REC_HEAD.length).setValues(rows);
    }
    return json({ ok: true, totals: rebuild(sh) });
  } finally { lock.releaseLock(); }
}

// 今週の通算を返す（サーバーが起動時や対局開始時に読む）。?data=… が付いていれば半荘の結果として記録する
function doGet(e) {
  if (e && e.parameter && e.parameter.data) return record(JSON.parse(e.parameter.data));
  const sh = SpreadsheetApp.getActive().getSheetByName(weekName(new Date()));
  return json({ ok: true, totals: sh ? rebuild(sh) : [] });
}

// 日曜はじまりの週の名前（例：2026/10/4〜10/10）
function weekName(date) {
  const [y, m, d] = Utilities.formatDate(date, "Asia/Tokyo", "yyyy/MM/dd").split("/").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(day.getTime() - day.getUTCDay() * 864e5), end = new Date(start.getTime() + 6 * 864e5);
  const md = x => (x.getUTCMonth() + 1) + "/" + x.getUTCDate();
  return start.getUTCFullYear() + "/" + md(start) + "〜" + md(end);
}

// その週のシート（なければ一番左に作る）
function weekSheet(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name, 0);
    sh.getRange(1, 1, 1, REC_HEAD.length).setValues([REC_HEAD]).setFontWeight("bold");
    sh.getRange(1, TOT_COL, 1, TOT_HEAD.length).setValues([TOT_HEAD]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

// 記録（A列）が入っている最後の行
function lastRecRow(sh) {
  const n = sh.getLastRow();
  if (n < 2) return 1;
  const col = sh.getRange(2, 1, n - 1, 1).getValues();
  let last = 1;
  col.forEach((r, i) => { if (r[0] !== "") last = i + 2; });
  return last;
}

// シートの記録から名前ごとに合計して、右側の通算を作り直す
// 記録の行を消したり直したりしたら、メニューの「この週の通算を再計算」で反映できる
function rebuild(sh) {
  const last = lastRecRow(sh);
  const vals = last > 1 ? sh.getRange(2, 1, last - 1, REC_HEAD.length).getValues() : [];
  const by = {};
  for (const r of vals) {
    const name = String(r[3]); if (!name) continue;
    const t = by[name] = by[name] || { name, games: 0, ranks: [0, 0, 0], chips: 0, amount: 0 };
    t.games++; t.ranks[Number(r[4]) - 1]++; t.chips += Number(r[5]) || 0; t.amount += Number(r[7]) || 0;
  }
  const list = Object.values(by).sort((a, b) => b.amount - a.amount || b.chips - a.chips);
  list.forEach(t => t.amount = Math.round(t.amount * 1000) / 1000);
  sh.getRange(2, TOT_COL, Math.max(sh.getMaxRows() - 1, 1), TOT_HEAD.length).clearContent();
  if (list.length) sh.getRange(2, TOT_COL, list.length, TOT_HEAD.length).setValues(list.map(t =>
    [t.name, t.games, t.ranks[0], t.ranks[1], t.ranks[2], t.chips, t.amount]));
  return list;
}

function onOpen() { SpreadsheetApp.getUi().createMenu("三麻").addItem("この週の通算を再計算", "rebuildActive").addToUi(); }
function rebuildActive() { rebuild(SpreadsheetApp.getActiveSheet()); }

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

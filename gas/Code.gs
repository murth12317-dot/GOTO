// 三麻 通算成績の自動記録（Google Apps Script）
// スプレッドシートの「拡張機能 → Apps Script」に貼り付けて、ウェブアプリとして公開する
// 手順は README の「通算成績をスプレッドシートに記録する」を見てください

// Render の環境変数 SHEET_SECRET と同じ文字列にする（他の人に書き込まれないための合言葉）
const SECRET = "ここに合言葉を入れる";

const REC = "記録", TOT = "通算";
const REC_HEAD = ["日時", "ルーム", "半荘ID", "名前", "着順", "祝儀"];
const TOT_HEAD = ["名前", "半荘", "1着", "2着", "3着", "祝儀計"];

// ゲームのサーバーから半荘の結果が届く（GET の ?data=… で届く。POST でも受け付ける）
function doPost(e) { return record(JSON.parse(e.postData.contents)); }
function record(d) {
  if (d.secret !== SECRET) return json({ ok: false, error: "secret" });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet(REC, REC_HEAD);
    // 同じ半荘が二重に届いたら書かない
    const ids = sh.getLastRow() > 1 ? sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues().flat().map(String) : [];
    if (!ids.includes(String(d.gameKey))) {
      const now = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm");
      const rows = d.players.map(p => [now, d.room, d.gameKey, p.name, p.rank, p.chips]);
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, REC_HEAD.length).setValues(rows);
    }
    return json({ ok: true, totals: rebuild() });
  } finally { lock.releaseLock(); }
}

// 通算成績を返す（サーバーの起動時に読む）。?data=… が付いていれば半荘の結果として記録する
function doGet(e) {
  if (e && e.parameter && e.parameter.data) return record(JSON.parse(e.parameter.data));
  return json({ ok: true, totals: rebuild() });
}

// 「記録」シートから名前ごとに合計して「通算」シートを作り直す
// 記録の行を消したり直したりしたら、メニューの「通算を再計算」で反映できる
function rebuild() {
  const rec = sheet(REC, REC_HEAD), tot = sheet(TOT, TOT_HEAD);
  const vals = rec.getLastRow() > 1 ? rec.getRange(2, 1, rec.getLastRow() - 1, REC_HEAD.length).getValues() : [];
  const by = {};
  for (const r of vals) {
    const name = String(r[3]); if (!name) continue;
    const t = by[name] = by[name] || { name, games: 0, ranks: [0, 0, 0], chips: 0 };
    t.games++; t.ranks[Number(r[4]) - 1]++; t.chips += Number(r[5]) || 0;
  }
  const list = Object.values(by).sort((a, b) => b.chips - a.chips || b.games - a.games);
  tot.getRange(2, 1, Math.max(tot.getMaxRows() - 1, 1), TOT_HEAD.length).clearContent();
  if (list.length) tot.getRange(2, 1, list.length, TOT_HEAD.length).setValues(list.map(t =>
    [t.name, t.games, t.ranks[0], t.ranks[1], t.ranks[2], t.chips]));
  return list;
}

function onOpen() { SpreadsheetApp.getUi().createMenu("三麻").addItem("通算を再計算", "rebuild").addToUi(); }

function sheet(name, head) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold"); sh.setFrozenRows(1); }
  return sh;
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

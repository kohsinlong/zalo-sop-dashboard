/**
 * Zalo Audit Tracker (cz/) — customers, audits, weekly feedback and
 * screenshots for the reviewer's weekly chat audit.
 *
 * This is a further file of the same Apps Script project as live-feed.gs
 * (the optometry feed) and lasik-feed.gs. live-feed.gs routes ?app=cz here
 * and hands posts carrying {app:"cz"} to czPost, so the one deployment, URL
 * and TOKEN serve every page.
 *
 * What it does
 *   1. reads the customer rows of the reviewer's tracker workbook
 *      (CZ.tracker: its "CRM (live)" tab, which IMPORTRANGEs the clinic's
 *      Membership tracker) and serves one case per customer in the shape
 *      the page embeds: [no, zaloTag, name, da, product, cdAnchor, deposit,
 *      collected, friendAdd, Y/N, flag, secondChild, clinic]. Phone numbers
 *      and dates of birth never leave the sheet.
 *   2. stores every audit the page saves (one row per week × clinic ×
 *      customer: the ticks per cadence, data-issue flag, remark, screenshot
 *      links) and the weekly overall feedback, and serves them back. The
 *      store is a spreadsheet "Zalo audit log" created in your Drive on the
 *      first save, unless CZ.store.id names one.
 *   3. saves screenshots the page uploads into a Drive folder "Zalo audit
 *      screenshots" (created on first use, unless CZ.shots.folderId names
 *      one) and returns a link that the audit row keeps.
 *
 * To switch it on (once)
 *   1. Open the optometry feed project at script.google.com.
 *   2. Replace its code with the current tools/live-feed.gs, then
 *      File → New → Script, name it cz-feed, paste this file.
 *   3. Put the tracker's spreadsheet ID (the long id in its URL) into
 *      CZ.tracker.id below. One entry per clinic once more go live.
 *   4. Deploy → Manage deployments → Edit → Version: New version → Deploy.
 *      The URL does not change. Put it and the TOKEN into LIVE at the top
 *      of the script in cz/index.html; the chip in the header turns green.
 *   Standalone project instead? Add
 *      function doGet(e){ return czGet(e); }  function doPost(e){ return czPost(e); }
 *   and a TOKEN, deploy as a web app, and put its URL into LIVE.url.
 *
 * Privacy: the page is behind its sign-in but public once deployed and its
 * token sits in the page source. Screenshots are shared "anyone with the
 * link can view" only when CZ.shots.share is true; otherwise the links open
 * for people who have access to the folder.
 */

var CZ = {
  /* one entry per clinic's tracker workbook; the clinic code is what the page shows */
  tracker: [
    /* { id: "PASTE-THE-CZ-TRACKER-SPREADSHEET-ID", clinic: "NGT", sheet: "CRM (live)" } */
  ],
  /* audit log store. Empty id: a spreadsheet is created on the first save. */
  store: { id: "", title: "Zalo audit log", audits: "Audits", feedback: "Weekly feedback" },
  /* screenshots. Empty folderId: a folder is created on the first upload. */
  shots: { folderId: "", title: "Zalo audit screenshots", share: false, maxBytes: 8 * 1024 * 1024 },
  names: "full",                 /* "full" | "none" */
  cacheSeconds: 120,
  tz: "Asia/Ho_Chi_Minh"
};

/* GET ?app=cz&token=…  → cases + audits + feedback */
function czGet(e) {
  var p = (e && e.parameter) || {};
  if (czToken() && p.token !== czToken()) return czOut({ error: "forbidden" });
  var cache = CacheService.getScriptCache(), hit = cache.get("cz-feed");
  var feed = hit && !p.nocache ? JSON.parse(hit) : null;
  if (!feed) {
    feed = czBuildFeed();
    try { cache.put("cz-feed", JSON.stringify(feed), CZ.cacheSeconds); } catch (err) {}
  }
  var store = czReadStore();          /* never cached: the page just wrote to it */
  feed.audits = store.audits; feed.feedback = store.feedback;
  return czOut(feed);
}

/* The page posts, as text/plain so the browser sends it without a preflight:
     {token, app:"cz", action:"audit",    audit:{key, week, clinic, tag, name, prod, cads, data, rv, remark, shots, by, at, removed, added, legacy}}
     {token, app:"cz", action:"feedback", feedback:{week, clinic, text, by, at}}
     {token, app:"cz", action:"shot",     shot:{id, week, clinic, tag, name, type, data}}   (data: a data: URL) */
function czPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); }
  catch (err) { return czOut({ error: "bad json" }); }
  if (czToken() && body.token !== czToken()) return czOut({ error: "forbidden" });
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (body.action === "audit" && body.audit) return czOut({ cz: true, ok: 1, audit: czUpsertAudit(body.audit) });
    if (body.action === "feedback" && body.feedback) return czOut({ cz: true, ok: 1, feedback: czUpsertFeedback(body.feedback) });
    if (body.action === "shot" && body.shot) return czOut(czSaveShot(body.shot));
  } finally { lock.releaseLock(); }
  return czOut({ error: "unknown action" });
}

/* Run this from the editor to check the feed before publishing a version. */
function czTest() {
  var f = czBuildFeed();
  Logger.log(JSON.stringify(f.sources));
  Logger.log(f.cases.length + " cases; first: " + JSON.stringify(f.cases[0]));
  var s = czReadStore();
  Logger.log(s.audits.length + " audits, " + s.feedback.length + " feedback notes");
}

function czToken() { return typeof TOKEN === "string" ? TOKEN : (CZ.token || ""); }
function czOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- cases ---------------- */

function czBuildFeed() {
  var cases = [], sources = [];
  CZ.tracker.forEach(function (src) {
    var ss;
    try { ss = SpreadsheetApp.openById(src.id); }
    catch (err) { sources.push({ id: src.id, error: String(err) }); return; }
    var want = src.sheet || "CRM (live)";
    var sh = ss.getSheets().filter(function (s) { return s.getName().indexOf(want) === 0; })[0]
          || ss.getSheets().filter(function (s) { return /^membership/i.test(s.getName()); })[0];
    if (!sh) { sources.push({ id: src.id, error: "no " + want + " sheet" }); return; }
    var v = sh.getDataRange().getValues(), h = v[0];
    var c = {
      no: czCol(h, "0"), friend: czCol(h, "Ngày kết bạn"), name: czCol(h, "Tên Khách Hàng"), prod: czCol(h, "Sản phẩm"),
      da: czCol(h, "Trợ lý"), tag: czCol(h, "Zalo"), deposit: czCol(h, "Ngày đặt cọc"), coll: czCol(h, "Ngày nhận kính"),
      anchor: czCol(h, "Ngày neo"), flag: czCol(h, "Cờ cảnh báo"), kid2: czCol(h, "Tên bé thứ 2")
    };
    if (c.tag < 0 || c.name < 0) { sources.push({ id: src.id, error: "no Zalo / Tên Khách Hàng columns" }); return; }
    var n = 0;
    for (var r = 1; r < v.length; r++) {
      var row = v[r], tag = czFirstLine(row[c.tag]), name = czClean(row[c.name]);
      if (!tag && !name) continue;
      n++;
      cases.push([
        c.no >= 0 && row[c.no] !== "" ? Number(row[c.no]) || n : n,
        tag,
        CZ.names === "full" ? name : "",
        c.da >= 0 ? czClean(row[c.da]) : "",
        c.prod >= 0 ? czProduct(row[c.prod]) : "",
        c.anchor >= 0 ? czIso(row[c.anchor]) : (c.coll >= 0 ? czIso(row[c.coll]) : ""),
        c.deposit >= 0 ? czIso(row[c.deposit]) : "",
        c.coll >= 0 ? czIso(row[c.coll]) : "",
        c.friend >= 0 ? czIso(row[c.friend]) : "",
        czTagYN(tag),
        c.flag >= 0 ? czClean(row[c.flag]) : "",
        c.kid2 >= 0 && CZ.names === "full" ? czClean(row[c.kid2]) : "",
        src.clinic || "NGT"
      ]);
    }
    sources.push({ id: src.id, clinic: src.clinic, sheet: sh.getName(), rows: n });
  });
  return { cz: true, v: 1, generated: new Date().toISOString(),
           asof: Utilities.formatDate(new Date(), CZ.tz, "yyyy-MM-dd"), sources: sources, cases: cases };
}

/* ---------------- store ---------------- */

var CZ_AUDIT_HEADER = ["key", "week", "clinic", "tag", "name", "product", "cads", "data", "remark", "shots", "by", "at", "removed", "added", "legacy", "marked"];
var CZ_FB_HEADER = ["key", "week", "clinic", "text", "by", "at"];

function czStore(create) {
  var props = PropertiesService.getScriptProperties();
  var id = CZ.store.id || props.getProperty("czStoreId"), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; } }
  if (!ss) {
    if (!create) return null;
    ss = SpreadsheetApp.create(CZ.store.title);
    props.setProperty("czStoreId", ss.getId());
  }
  return ss;
}
function czSheet(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0
       ? ss.getSheets()[0].setName(name) : ss.insertSheet(name);
    sh.appendRow(header); sh.setFrozenRows(1);
  }
  return sh;
}

function czReadStore() {
  var out = { audits: [], feedback: [] };
  try {
    var ss = czStore(false);
    if (!ss) return out;
    var a = czSheet(ss, CZ.store.audits, CZ_AUDIT_HEADER).getDataRange().getValues();
    for (var r = 1; r < a.length; r++) {
      if (!a[r][0]) continue;
      var cads = {}, shots = [], legacy = null;
      try { cads = JSON.parse(a[r][6] || "{}"); } catch (e1) {}
      try { shots = JSON.parse(a[r][9] || "[]"); } catch (e2) {}
      try { legacy = a[r][14] ? JSON.parse(a[r][14]) : null; } catch (e3) {}
      out.audits.push({ key: String(a[r][0]), week: czDay(a[r][1]), clinic: String(a[r][2]), tag: String(a[r][3]),
                        name: String(a[r][4] || ""), prod: String(a[r][5] || ""), cads: cads, data: Number(a[r][7]) ? 1 : 0,
                        remark: String(a[r][8] || ""), shots: shots, by: String(a[r][10] || ""), at: czStamp(a[r][11]),
                        removed: Number(a[r][12]) ? 1 : 0, added: czStamp(a[r][13]), legacy: legacy, rv: Number(a[r][15]) ? 1 : 0 });
    }
    var f = czSheet(ss, CZ.store.feedback, CZ_FB_HEADER).getDataRange().getValues();
    for (var q = 1; q < f.length; q++) {
      if (!f[q][0]) continue;
      out.feedback.push({ week: czDay(f[q][1]), clinic: String(f[q][2]), text: String(f[q][3] || ""),
                          by: String(f[q][4] || ""), at: czStamp(f[q][5]) });
    }
  } catch (err) {}
  return out;
}

function czUpsertAudit(a) {
  if (!a.key || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.week || ""))) throw new Error("audit needs key and week");
  var rec = {
    key: String(a.key), week: String(a.week), clinic: String(a.clinic || "NGT"), tag: String(a.tag || "").slice(0, 200),
    name: String(a.name || "").slice(0, 120), prod: String(a.prod || ""), cads: a.cads && typeof a.cads === "object" ? a.cads : {},
    data: a.data ? 1 : 0, remark: String(a.remark || "").slice(0, 4000),
    shots: (a.shots || []).slice(0, 20).map(function (s) { return { id: String(s.id || ""), name: String(s.name || "").slice(0, 120), url: String(s.url || "") }; }),
    by: String(a.by || "").slice(0, 80), at: String(a.at || new Date().toISOString()), removed: a.removed ? 1 : 0,
    added: String(a.added || ""), legacy: a.legacy || null, rv: a.rv ? 1 : 0
  };
  var sh = czSheet(czStore(true), CZ.store.audits, CZ_AUDIT_HEADER);
  var line = [rec.key, "'" + rec.week, rec.clinic, rec.tag, rec.name, rec.prod, JSON.stringify(rec.cads), rec.data, rec.remark,
              JSON.stringify(rec.shots), rec.by, rec.at, rec.removed, rec.added, rec.legacy ? JSON.stringify(rec.legacy) : "", rec.rv];
  czWriteRow(sh, rec.key, line);
  return rec;
}

function czUpsertFeedback(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.week || ""))) throw new Error("feedback needs week YYYY-MM-DD");
  var rec = { week: String(f.week), clinic: String(f.clinic || "NGT"), text: String(f.text || "").slice(0, 8000),
              by: String(f.by || "").slice(0, 80), at: String(f.at || new Date().toISOString()) };
  var key = rec.week + "|" + rec.clinic;
  var sh = czSheet(czStore(true), CZ.store.feedback, CZ_FB_HEADER);
  czWriteRow(sh, key, [key, "'" + rec.week, rec.clinic, rec.text, rec.by, rec.at]);
  return rec;
}

function czWriteRow(sh, key, line) {
  var v = sh.getDataRange().getValues(), rowNo = -1;
  for (var r = 1; r < v.length; r++) if (String(v[r][0]) === key) { rowNo = r + 1; break; }
  if (rowNo > 0) sh.getRange(rowNo, 1, 1, line.length).setValues([line]);
  else sh.appendRow(line);
}

/* ---------------- screenshots ---------------- */

function czFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = CZ.shots.folderId || props.getProperty("czShotsFolderId"), folder = null;
  if (id) { try { folder = DriveApp.getFolderById(id); } catch (err) { folder = null; } }
  if (!folder) {
    folder = DriveApp.createFolder(CZ.shots.title);
    props.setProperty("czShotsFolderId", folder.getId());
  }
  return folder;
}

function czSaveShot(s) {
  var m = /^data:([^;]+);base64,(.+)$/.exec(String(s.data || ""));
  if (!m || m[1].indexOf("image/") !== 0) return { error: "shot needs an image data: URL" };
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > CZ.shots.maxBytes) return { error: "screenshot too large" };
  var ext = m[1] === "image/png" ? ".png" : m[1] === "image/webp" ? ".webp" : ".jpg";
  var name = [String(s.week || ""), String(s.clinic || ""), czClean(s.tag).replace(/[\\/:*?"<>|]/g, "").slice(0, 60), String(s.id || "")].join(" ") + ext;
  var file = czFolder().createFile(Utilities.newBlob(bytes, m[1], name));
  if (CZ.shots.share) { try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {} }
  return { cz: true, ok: 1, id: String(s.id || file.getId()), fileId: file.getId(), url: file.getUrl() };
}

/* ---------------- helpers ---------------- */

function czCol(hdr, needle) {
  var n = czClean(needle).toLowerCase();
  for (var i = 0; i < hdr.length; i++) if (czClean(hdr[i]).toLowerCase().indexOf(n) === 0) return i;
  return -1;
}
function czClean(v) { return String(v === null || v === undefined ? "" : v).replace(/ /g, " ").replace(/\s+/g, " ").trim(); }
function czFirstLine(v) { return czClean(String(v === null || v === undefined ? "" : v).split("\n")[0]); }
function czProduct(v) {
  var s = czClean(v), low = s.toLowerCase();
  if (low.indexOf("kính") !== -1 || low.indexOf("kinh") !== -1) return "Kính";
  if (low.indexOf("atropine") !== -1 || low.indexOf("atr") === 0) return "Atropine";
  if (low === "ok") return "OK";
  if (low === "mc") return "MC";
  return s;
}
/* the letter just before the first digit of the compacted tag: MCY260720… → Y */
function czTagYN(tag) {
  var s = String(tag || "").replace(/\s+/g, ""), m = /\d/.exec(s);
  if (!m || m.index < 1) return "";
  for (var back = 1; back <= 2; back++) {
    var ch = m.index - back >= 0 ? s.charAt(m.index - back).toUpperCase() : "";
    if (ch === "Y" || ch === "N") return ch;
  }
  return "";
}
function czIso(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, CZ.tz, "yyyy-MM-dd");
  if (typeof v === "number" && v > 30000 && v < 60000)
    return Utilities.formatDate(new Date(Date.UTC(1899, 11, 30) + v * 86400000), "UTC", "yyyy-MM-dd");
  var s = String(v || "").trim(), m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[0];
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return "";
}
/* a week typed as 2026-10-12 can come back from the sheet as a Date */
function czDay(v) { return v instanceof Date ? czIso(v) : String(v || "").replace(/^'/, "").slice(0, 10); }
function czStamp(v) { return v instanceof Date && !isNaN(v) ? v.toISOString() : String(v || ""); }

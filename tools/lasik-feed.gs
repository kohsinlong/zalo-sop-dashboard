/**
 * Lasik SOP Compliance — live feed and QA ratings for the Lasik dashboard.
 *
 * One standalone Google Apps Script that
 *   1. reads each DA's customer-information sheet listed in SOURCES (the CTE
 *      format: a "…_PT" surgery sheet and a "…_Khám" exam sheet) and serves
 *      the dashboard one case per surgery: clinic, DA, surgery date, name,
 *      phone, Zalo tag;
 *   2. looks the Zalo tag up in the Salework raw data by phone number (and
 *      surgery date when a phone has several conversations), leaving it
 *      empty - "not available yet" on the page - until a message exists;
 *   3. takes the touchpoint scores (10 / 5 / 0) from the D90 SOP QC
 *      workbook's audit sheet when a row matches the case, which makes the
 *      case scoreable; otherwise the case stays "pending";
 *   4. stores the monthly response-quality ratings keyed in on the page
 *      (band 1-4 per DA per month, with remarks) in the RATINGS sheet and
 *      serves them back.
 *
 * Setup (once):
 *   1. script.google.com → New project → paste this file → fill SOURCES,
 *      AUDIT, SALEWORK, RATINGS and set TOKEN.
 *   2. Deploy → New deployment → Web app.
 *        Execute as: Me.   Who has access: Anyone.
 *   3. Copy the web-app URL (ends in /exec) into LIVE.url in lasik/index.html,
 *      and the TOKEN into LIVE.token.
 *   After editing this file: Deploy → Manage deployments → Edit → New version.
 *
 * Privacy: the page is public once deployed and its token sits in the page
 * source, so PHONE controls how much of each number leaves the sheet.
 * "full" is what the DAs asked for in the worklist; "last4" shows "…1234".
 */

var SOURCES = [
  /* one entry per DA workbook; the clinic code is what the dashboard shows */
  { id: "PASTE-SPREADSHEET-ID", clinic: "CTE" }
];
/* D90 SOP QC workbook (the "D90 Audit" sheet). Leave id empty to skip. */
var AUDIT = { id: "", sheet: "D90 Audit" };
/* Salework raw data pasted or synced into a sheet: one row per conversation
   with the customer's phone, the Zalo display name / tag, and the date of
   the first message. Header names are matched by prefix. Leave id empty to
   skip (every tag then reads "not available yet"). */
var SALEWORK = { id: "", sheet: "Salework", phone: "Phone", tag: "Tag", date: "Date" };
/* Where the page's quality ratings are stored (a sheet is created if missing). */
var RATINGS = { id: "PASTE-SPREADSHEET-ID", sheet: "QA ratings" };

var TOKEN = "change-me";        /* must match LIVE.token in lasik/index.html */
var PHONE = "full";             /* "full" | "last4" | "none" */
var CACHE_SECONDS = 120;        /* the sheets change slowly; spare their quota */
var TZ = "Asia/Ho_Chi_Minh";

/* The QC guide's seven touchpoints, as embedded in the page. */
var TOUCH = [
  ["D1",     [["meds", "care"]],                          [1, 1]],
  ["D2–4",   [["checkin", "care"], ["vipintro", "vip"]],  [2, 4]],
  ["D6",     [["recall", "care"], ["referral", "ref"]],   [6, 6]],
  ["D15",    [["checkin", "care"]],                       [15, 15]],
  ["D25–30", [["recall1m", "care"], ["vipben", "vip"]],   [25, 30]],
  ["D30–60", [["checkin", "care"], ["eyecare", "care"]],  [30, 60]],
  ["D60–90", [["recall3m", "care"], ["referral", "ref"]], [60, 90]]
];

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (TOKEN && p.token !== TOKEN) return out({ error: "forbidden" });
  if (p.action === "ratings") return out({ generated: new Date().toISOString(), ratings: readRatings() });
  var cache = CacheService.getScriptCache(), hit = cache.get("lasik-feed");
  var feed = hit && !p.nocache ? JSON.parse(hit) : null;
  if (!feed) {
    feed = buildFeed();
    try { cache.put("lasik-feed", JSON.stringify(feed), CACHE_SECONDS); } catch (err) {}
  }
  feed.ratings = readRatings();          /* never cached: the page just wrote them */
  return out(feed);
}

/* The page posts {token, action:"rate", rating:{clinic, da, month, band, remarks, by}}
   as text/plain so the browser sends it without a preflight. */
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || "{}"); } catch (err) { return out({ error: "bad json" }); }
  if (TOKEN && body.token !== TOKEN) return out({ error: "forbidden" });
  if (body.action !== "rate" || !body.rating) return out({ error: "unknown action" });
  var r = body.rating, band = Number(r.band);
  if (!r.clinic || !r.da || !/^\d{4}-\d{2}$/.test(String(r.month)) || !(band >= 1 && band <= 4))
    return out({ error: "rating needs clinic, da, month YYYY-MM and band 1-4" });
  var rec = { clinic: String(r.clinic).trim(), da: String(r.da).trim(), month: String(r.month),
              band: band, remarks: String(r.remarks || "").slice(0, 2000),
              by: String(r.by || "").slice(0, 80), at: new Date().toISOString() };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { upsertRating(rec); } finally { lock.releaseLock(); }
  return out({ ok: 1, rating: rec });
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- cases ---------------- */

function buildFeed() {
  var salework = readSalework(), audit = readAudit();
  var cases = [], sources = [], asof = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  SOURCES.forEach(function (src) {
    var ss;
    try { ss = SpreadsheetApp.openById(src.id); }
    catch (err) { sources.push({ id: src.id, error: String(err) }); return; }
    var pt = ss.getSheets().filter(function (s) { return /_PT$/.test(s.getName()); })[0];
    var kh = ss.getSheets().filter(function (s) { return /_Khám$/.test(s.getName()); })[0];
    if (!pt) { sources.push({ id: src.id, error: "no _PT sheet" }); return; }

    var zalo = {};
    if (kh) {
      var kv = kh.getDataRange().getValues(), kh0 = kv[0];
      var kPhone = col(kh0, "SDT") >= 0 ? col(kh0, "SDT") : col(kh0, "SĐT"), kZalo = col(kh0, "Zalo");
      if (kPhone >= 0 && kZalo >= 0)
        for (var i = 1; i < kv.length; i++) {
          var kp = normPhone(kv[i][kPhone]), z = String(kv[i][kZalo] || "").trim().toLowerCase();
          if (kp && z) zalo[kp] = z.charAt(0) === "c" ? "y" : z.charAt(0) === "k" ? "n" : "";
        }
    }

    var v = pt.getDataRange().getValues(), h = v[0];
    var cDate = col(h, "NGÀY PT"), cName = col(h, "HỌ & TÊN"), cPhone = col(h, "SĐT"), cDA = col(h, "NV TƯ VẤN");
    if (cDate < 0 || cName < 0 || cPhone < 0) { sources.push({ id: src.id, error: "missing NGÀY PT / HỌ & TÊN / SĐT" }); return; }
    var tally = {}, n = 0;
    for (var r = 1; r < v.length; r++) if (cDA >= 0 && v[r][cDA]) tally[String(v[r][cDA]).trim()] = (tally[String(v[r][cDA]).trim()] || 0) + 1;
    var daDefault = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; })[0] || "";

    for (var r2 = 1; r2 < v.length; r2++) {
      var row = v[r2], d = iso(row[cDate]), name = cleanName(row[cName]);
      if (!d || !name || d > asof) continue;
      var phone = normPhone(row[cPhone]);
      var da = cDA >= 0 && row[cDA] ? String(row[cDA]).trim() : daDefault;
      var tag = lookupTag(salework, phone, d);
      var scores = audit[phone + "|" + d];
      var flags = scores ? flagsFrom(scores) : zeros();
      var verdict = zalo[phone] === "n" ? "nozalo" : scores ? "audited" : "pending";
      cases.push([src.clinic, da, d, verdict, scores ? 1 : 0, tag, name, showPhone(phone)].concat(flags));
      n++;
    }
    sources.push({ id: src.id, clinic: src.clinic, sheet: pt.getName(), rows: n });
  });
  cases.sort(function (a, b) { return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0; });
  return { v: 2, generated: new Date().toISOString(), asof: asof, touch: TOUCH, sources: sources, cases: cases };
}

function zeros() { var z = []; TOUCH.forEach(function (t) { t[1].forEach(function () { z.push(0); }); }); return z; }

/* 10 → every item sent, 5 → one of two (the first is marked), 0 / blank → none. */
function flagsFrom(scores) {
  var f = [];
  TOUCH.forEach(function (t, i) {
    var k = t[1].length, s = scores[i];
    if (!(s > 0)) for (var a = 0; a < k; a++) f.push(0);
    else if (s >= 10) for (var b = 0; b < k; b++) f.push(1);
    else { f.push(1); for (var c = 1; c < k; c++) f.push(0); }
  });
  return f;
}

/* {phone|surgeryDate: [7 scores]} from the QC workbook's audit sheet. */
function readAudit() {
  var map = {};
  if (!AUDIT.id) return map;
  try {
    var ss = SpreadsheetApp.openById(AUDIT.id);
    var sh = ss.getSheets().filter(function (s) { return s.getName().indexOf(AUDIT.sheet) === 0; })[0];
    if (!sh) return map;
    var v = sh.getDataRange().getValues(), hi = -1;
    for (var i = 0; i < Math.min(10, v.length); i++)
      if (v[i].some(function (x) { return String(x || "").indexOf("Phone") === 0; })) { hi = i; break; }
    if (hi < 0) return map;
    var h = v[hi], cPhone = col(h, "Phone"), cDate = col(h, "Surgery");
    var cTp = TOUCH.map(function (t) { return col(h, t[0]); });
    for (var r = hi + 1; r < v.length; r++) {
      var p = normPhone(v[r][cPhone]), d = iso(v[r][cDate]);
      if (!p || !d) continue;
      map[p + "|" + d] = cTp.map(function (c) { var x = c >= 0 ? v[r][c] : ""; return x === "" || x === null ? null : Number(x); });
    }
  } catch (err) {}
  return map;
}

/* ---------------- Salework: phone → Zalo tag ---------------- */

/* {phone: [{tag, date}]} from the raw-data sheet. */
function readSalework() {
  var map = {};
  if (!SALEWORK.id) return map;
  try {
    var ss = SpreadsheetApp.openById(SALEWORK.id);
    var sh = ss.getSheets().filter(function (s) { return s.getName().indexOf(SALEWORK.sheet) === 0; })[0];
    if (!sh) return map;
    var v = sh.getDataRange().getValues(), h = v[0];
    var cPhone = col(h, SALEWORK.phone), cTag = col(h, SALEWORK.tag), cDate = col(h, SALEWORK.date);
    if (cPhone < 0 || cTag < 0) return map;
    for (var r = 1; r < v.length; r++) {
      var p = normPhone(v[r][cPhone]), tag = String(v[r][cTag] || "").replace(/\s+/g, " ").trim();
      if (!p || !tag) continue;
      (map[p] = map[p] || []).push({ tag: tag, date: cDate >= 0 ? iso(v[r][cDate]) : "" });
    }
  } catch (err) {}
  return map;
}

/* The conversation for this surgery: same phone, and when there are several,
   the one whose first message is closest to the surgery date (a returning
   customer or a relative on the same number gets their own conversation). */
function lookupTag(salework, phone, surgery) {
  var list = salework[phone];
  if (!list || !list.length) return "";
  if (list.length === 1) return list[0].tag;
  var s = Date.parse(surgery), best = null, bestGap = Infinity;
  list.forEach(function (x) {
    var gap = x.date ? Math.abs(Date.parse(x.date) - s) : Infinity;
    if (gap < bestGap) { bestGap = gap; best = x; }
  });
  return (best || list[list.length - 1]).tag;
}

/* ---------------- ratings ---------------- */

var RATING_HEADER = ["key", "clinic", "da", "month", "band", "remarks", "by", "at"];

function ratingsSheet() {
  var ss = SpreadsheetApp.openById(RATINGS.id);
  var sh = ss.getSheetByName(RATINGS.sheet);
  if (!sh) { sh = ss.insertSheet(RATINGS.sheet); sh.appendRow(RATING_HEADER); sh.setFrozenRows(1); }
  return sh;
}

function readRatings() {
  var list = [];
  if (!RATINGS.id) return list;
  try {
    var v = ratingsSheet().getDataRange().getValues();
    for (var r = 1; r < v.length; r++) {
      if (!v[r][1]) continue;
      list.push({ clinic: String(v[r][1]), da: String(v[r][2]), month: monthKey(v[r][3]),
                  band: Number(v[r][4]), remarks: String(v[r][5] || ""), by: String(v[r][6] || ""),
                  at: v[r][7] instanceof Date ? v[r][7].toISOString() : String(v[r][7] || "") });
    }
  } catch (err) {}
  return list;
}

function upsertRating(rec) {
  var sh = ratingsSheet(), key = rec.clinic + "|" + rec.da + "|" + rec.month;
  var v = sh.getDataRange().getValues(), rowNo = -1;
  for (var r = 1; r < v.length; r++) if (String(v[r][0]) === key) { rowNo = r + 1; break; }
  var line = [key, rec.clinic, rec.da, "'" + rec.month, rec.band, rec.remarks, rec.by, rec.at];
  if (rowNo > 0) sh.getRange(rowNo, 1, 1, line.length).setValues([line]);
  else sh.appendRow(line);
}

/* A month typed as 2026-08 can come back from the sheet as a Date. */
function monthKey(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, "yyyy-MM");
  var s = String(v || "").replace(/^'/, "");
  var m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? m[1] + "-" + m[2] : s;
}

/* ---------------- helpers ---------------- */

/* Column whose header equals needle (case- and whitespace-insensitive);
   failing that, the first header that starts with it. Exact first, because
   "Họ & tên KH giới thiệu" (the referrer) sits before "HỌ & TÊN". */
function col(hdr, needle) {
  var n = String(needle).toLowerCase(), norm = function (h) { return String(h || "").replace(/\s+/g, " ").trim().toLowerCase(); };
  for (var i = 0; i < hdr.length; i++) if (norm(hdr[i]) === n) return i;
  for (var j = 0; j < hdr.length; j++) if (hdr[j] && norm(hdr[j]).indexOf(n) === 0) return j;
  return -1;
}

/* Sheets store phones as numbers, so the leading zero is gone. */
function normPhone(v) {
  if (v === null || v === undefined || v === "") return "";
  var d = String(v).replace(/\.0$/, "").replace(/\D/g, "");
  if (!d) return "";
  if (d.indexOf("84") === 0 && d.length >= 11) d = "0" + d.slice(2);
  else if (d.charAt(0) !== "0") d = "0" + d;
  return d;
}

function showPhone(p) {
  if (!p) return "";
  if (PHONE === "full") return p;
  if (PHONE === "none") return "";
  return "…" + p.slice(-4);
}

function cleanName(v) {
  var s = String(v || "").replace(/\s+/g, " ").trim();
  if (s && s === s.toUpperCase() && s !== s.toLowerCase())
    s = s.toLowerCase().replace(/(^|\s)(\S)/g, function (_, a, b) { return a + b.toUpperCase(); });
  return s;
}

function iso(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  if (typeof v === "number" && v > 30000 && v < 60000)
    return Utilities.formatDate(new Date(Date.UTC(1899, 11, 30) + v * 86400000), "UTC", "yyyy-MM-dd");
  var s = String(v || "").trim(), m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[0];
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return "";
}

/* Run this from the editor to check the feed before deploying. */
function test() {
  var f = buildFeed();
  Logger.log(JSON.stringify(f.sources));
  Logger.log(f.cases.length + " cases; first: " + JSON.stringify(f.cases[0]));
  Logger.log(readRatings().length + " ratings");
}

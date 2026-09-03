/**
 * ZALO SOP Compliance — live feed for the optometry dashboard.
 *
 * One standalone Google Apps Script that reads every Membership tracker
 * listed in SHEETS and serves the dashboard a minimised JSON feed:
 * clinic, assistant, product, a shortened Zalo tag (child's name reduced
 * to initials), Y/N, tag date, collection date and the tracker's data
 * flag. Names, phone numbers and dates of birth never leave the sheet.
 *
 * Setup (once):
 *   1. script.google.com → New project → paste this file → set TOKEN.
 *   2. Deploy → New deployment → Web app.
 *        Execute as: Me.   Who has access: Anyone.
 *   3. Copy the web-app URL (ends in /exec) into LIVE.url in index.html,
 *      and the TOKEN into LIVE.token.
 *   After editing this file: Deploy → Manage deployments → Edit → New version.
 */

var SHEETS = [
  "1IdKCJ58wJHrjFkaQmnTKwPo3rWtAvAA3CUYRkH_4IJI",
  "10jnR1G5fCWrFkkLdcEFHAp3k-cOXUKKIjh7hcOyKY8Q",
  "1AlBiPUmBPfvkGmwG9U6_1DH7VoZUNTbboRGB9JqlpME"
];
var TOKEN = "change-me";        /* must match LIVE.token in index.html */
var CACHE_SECONDS = 120;        /* the sheets change slowly; spare their quota */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (TOKEN && p.token !== TOKEN) return out({ error: "forbidden" });
  var cache = CacheService.getScriptCache(), hit = cache.get("feed");
  if (hit && !p.nocache) return out(JSON.parse(hit));
  var feed = buildFeed();
  try { cache.put("feed", JSON.stringify(feed), CACHE_SECONDS); } catch (err) {}
  return out(feed);
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildFeed() {
  var rows = [], sources = [];
  SHEETS.forEach(function (id) {
    var ss = SpreadsheetApp.openById(id);
    var sheet = ss.getSheets().filter(function (s) { return /^membership/i.test(s.getName()); })[0];
    if (!sheet) { sources.push({ id: id, error: "no Membership sheet" }); return; }
    var clinic = sheet.getName().replace(/^membership[\s_-]*/i, "").trim();
    var values = sheet.getDataRange().getValues();
    var hdr = values[0].map(function (h) { return String(h || ""); });
    var col = function (needle) {
      for (var i = 0; i < hdr.length; i++) if (hdr[i].indexOf(needle) !== -1) return i;
      return -1;
    };
    var cProd = col("Sản phẩm"), cDA = col("Trợ lý"), cTag = col("Zalo"),
        cColl = col("Ngày nhận"), cAnchor = col("Ngày neo"), cFlag = col("Cờ cảnh báo");
    var n = 0;
    for (var r = 1; r < values.length; r++) {
      var v = values[r], raw = cTag >= 0 ? v[cTag] : "";
      if (!raw) continue;
      var t = parseTag(String(raw));
      if (t === "exam") continue;
      n++;
      rows.push({
        clinic: clinic,
        da: cDA >= 0 && v[cDA] ? String(v[cDA]).trim() : "",
        product: cProd >= 0 && v[cProd] ? String(v[cProd]).trim() : "",
        prod: t ? t.prod : "",
        yn: t ? t.yn : "",
        tagDate: t ? t.date : "",
        tag: t ? t.short : "?",
        anchor: cAnchor >= 0 ? iso(v[cAnchor]) : "",
        coll: cColl >= 0 ? iso(v[cColl]) : "",
        flag: cFlag >= 0 && v[cFlag] ? String(v[cFlag]) : ""
      });
    }
    sources.push({ id: id, clinic: clinic, sheet: sheet.getName(), rows: n });
  });
  return { generated: new Date().toISOString(), sources: sources, rows: rows };
}

/* Dates arrive as Date objects, or as serial numbers where the tracker's
   helper column is formatted as a plain number. */
function iso(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, "Asia/Ho_Chi_Minh", "yyyy-MM-dd");
  if (typeof v === "number" && v > 30000 && v < 60000)
    return Utilities.formatDate(new Date(Date.UTC(1899, 11, 30) + v * 86400000), "UTC", "yyyy-MM-dd");
  return "";
}

var PREFIX = { MC: "MC", KT: "Kính", KH: "Kính", "KÍNH": "Kính", KINH: "Kính", OK: "OK", ATR: "Atropine", EXAM: null };

/* Tag formats seen in the trackers:
     MCY-260804-Chị Sa-Nguyễn Thị Thảo Chi      (CTE D5)
     MCY 260720 Ô.Ngoại bé Tuấn Kiệt            (NGT)
     KTN 260822 MẸ BÉ HẢI BĂNG & NHÃ UYÊN       (two kids)
   Returns product (from the prefix), Y/N, the date and a shortened tag. */
function parseTag(raw) {
  var line = raw.trim().split("\n")[0];
  var m = /^\s*(MC|KT|KH|Kính|Kinh|OK|Atr|Exam)\s*([YNK])?/i.exec(line);
  if (!m) return null;
  var key = m[1].toUpperCase(), prod = PREFIX.hasOwnProperty(key) ? PREFIX[key] : "";
  if (key === "EXAM") return "exam";
  var yn = (m[2] || "").toUpperCase(); if (yn === "K") yn = "";
  var rest = line.slice(m[0].length), dm = /(\d{6})/.exec(rest);
  var d6 = "", date = "";
  if (dm) {
    d6 = dm[1];
    var y = 2000 + +d6.slice(0, 2), mo = +d6.slice(2, 4), da = +d6.slice(4, 6);
    var dt = new Date(Date.UTC(y, mo - 1, da));
    if (dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === da) date = dt.toISOString().slice(0, 10);
    rest = rest.slice(dm.index + 6);
  }
  var pre = prod === "Kính" ? "KT" : (prod || key);
  return { prod: prod, yn: yn, date: date, short: shortTag(pre, yn || "?", d6 || "??????", rest) };
}

function shortTag(prefix, yn, d6, rest) {
  rest = rest.replace(/^[\s\-\n]+|[\s\-\n]+$/g, "");
  var parent, child, i = rest.indexOf("-");
  if (i !== -1) { parent = rest.slice(0, i); child = rest.slice(i + 1); }
  else {
    var sp = /\s+b[éẹ]\s+/i.exec(rest);
    if (sp) { parent = rest.slice(0, sp.index); child = rest.slice(sp.index + sp[0].length); }
    else { parent = ""; child = rest; }
  }
  var kids = child.split("&").map(initials).join("&");
  parent = tidy(parent);
  return prefix + yn + "-" + d6 + "-" + (parent ? parent + "-" : "") + kids;
}
function initials(name) {
  name = name.replace(/^\s*b[éẹ]\s+/i, "").trim();
  return name.split(/\s+/).filter(Boolean).map(function (p) { return p.charAt(0).toUpperCase() + "."; }).join("");
}
function tidy(s) {
  s = s.replace(/^[\s\-\n]+|[\s\-\n]+$/g, "");
  if (s && s === s.toUpperCase() && s !== s.toLowerCase())
    s = s.toLowerCase().replace(/(^|\s)(\S)/g, function (_, a, b) { return a + b.toUpperCase(); });
  return s;
}

/* Run this from the editor to check the feed before deploying. */
function test() {
  var f = buildFeed();
  Logger.log(JSON.stringify(f.sources));
  Logger.log(f.rows.length + " rows; first: " + JSON.stringify(f.rows[0]));
}

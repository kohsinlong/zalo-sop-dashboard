#!/usr/bin/env python3
"""
Lasik SOP dashboard — build the DATA payload embedded in lasik/index.html.

Sources
  --cte FILE.xlsx     A DA's customer-information workbook (the CTE format).
                      The surgery sheet (name ending in "_PT") gives one case
                      per row: surgery date (NGÀY PT), name (HỌ & TÊN), phone
                      (SĐT) and DA (NV TƯ VẤN). The exam sheet ("_Khám") says
                      whether the customer added Zalo; those who did not are
                      kept but not scored (verdict "nozalo").
  --audit FILE.xlsx   The D90 SOP QC workbook. Rows on its "D90 Audit" sheet
                      that match a case (phone + surgery date) supply the
                      touchpoint scores (10 / 5 / 0 per touchpoint) and make
                      the case scoreable. Cases without an audit row, and
                      without Salework data, stay "pending".
  --base index.html   The current page. Cases of every clinic other than
                      --clinic are carried over unchanged (a v1 payload is
                      remapped onto the QC touchpoints first).

Output
  --write index.html  Replace the `var DATA = …` line in place, or
  --json out.json     write the payload to a file.

Options
  --clinic CTE              Clinic code for the --cte cases (default CTE).
  --asof YYYY-MM-DD         Reporting date. Surgeries after it are left out.
                            Defaults to the base page's as-of date.
  --phones last4|full|none  How much of each phone number to embed
                            (default last4: "…1234"). The page is public
                            once deployed, so full numbers are opt-in.

Needs openpyxl (pip install openpyxl). Static page otherwise: no build step.
"""
import argparse, datetime, json, re, sys
from collections import Counter

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required: pip install openpyxl")

# The QC guide's seven touchpoints: label, required items (key, content group),
# and the window in days after surgery during which the message is on time.
# Content groups feed the content KPIs: care follow-up, VIP benefits, referral.
TOUCH = [
    ["D1",     [["meds", "care"]],                          [1, 1]],
    ["D2–4",   [["checkin", "care"], ["vipintro", "vip"]],  [2, 4]],
    ["D6",     [["recall", "care"], ["referral", "ref"]],   [6, 6]],
    ["D15",    [["checkin", "care"]],                       [15, 15]],
    ["D25–30", [["recall1m", "care"], ["vipben", "vip"]],   [25, 30]],
    ["D30–60", [["checkin", "care"], ["eyecare", "care"]],  [30, 60]],
    ["D60–90", [["recall3m", "care"], ["referral", "ref"]], [60, 90]],
]
CP_TOTAL = sum(len(t[1]) for t in TOUCH)
# case row: [clinic, da, surgeryDate, verdict, scored, zaloTag, name, phone, ...flags]
CP_OFFSET = 8

# The v1 payload had 15 flags across seven older touchpoints. Modelled clinics
# are carried over by picking the closest older item for each QC item.
V1_MAP = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14]

# Column headers on the audit sheet, matched by prefix (EN line of the header).
AUDIT_TP = ["D1", "D2–4", "D6", "D15", "D25–30", "D30–60", "D60–90"]


def norm_phone(v):
    """Digits only, leading zero restored (sheets store phones as numbers)."""
    if v is None:
        return ""
    s = str(v).strip()
    if re.fullmatch(r"\d+\.0", s):
        s = s[:-2]
    d = re.sub(r"\D", "", s)
    if not d:
        return ""
    if d.startswith("84") and len(d) >= 11:
        d = "0" + d[2:]
    elif not d.startswith("0"):
        d = "0" + d
    return d


def mask_phone(p, mode):
    if not p:
        return ""
    if mode == "full":
        return p
    if mode == "none":
        return ""
    return "…" + p[-4:]


def iso(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, str):
        m = re.match(r"(\d{4})-(\d{2})-(\d{2})", v.strip())
        if m:
            return m.group(0)
        m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", v.strip())
        if m:
            return "%s-%02d-%02d" % (m.group(3), int(m.group(2)), int(m.group(1)))
    return ""


def clean_name(v):
    s = re.sub(r"\s+", " ", str(v or "")).strip()
    return s.title() if s.isupper() else s


def header_index(row, needle):
    """Column whose header equals needle; failing that, the first that starts
    with it. Exact first, because "Họ & tên KH giới thiệu" (the referrer)
    sits two columns before "HỌ & TÊN" (the customer)."""
    def norm(h):
        return re.sub(r"\s+", " ", str(h).replace("\n", " ")).strip().lower()
    n = needle.lower()
    for i, h in enumerate(row):
        if h and norm(h) == n:
            return i
    for i, h in enumerate(row):
        if h and norm(h).startswith(n):
            return i
    return -1


def read_cte(path, clinic, phones):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    pt = next((s for s in wb.sheetnames if s.endswith("_PT")), None)
    kh = next((s for s in wb.sheetnames if s.endswith("_Khám")), None)
    if not pt:
        sys.exit("no surgery sheet (name ending in _PT) in " + path)

    rows = list(wb[pt].iter_rows(values_only=True))
    hdr = rows[0]
    c_date = header_index(hdr, "NGÀY PT")
    c_name = header_index(hdr, "HỌ & TÊN")
    c_phone = header_index(hdr, "SĐT")
    c_da = header_index(hdr, "NV TƯ VẤN")
    if min(c_date, c_name, c_phone) < 0:
        sys.exit("surgery sheet is missing NGÀY PT / HỌ & TÊN / SĐT columns")

    zalo = {}
    if kh:
        krows = list(wb[kh].iter_rows(values_only=True))
        k_phone = header_index(krows[0], "SDT")
        if k_phone < 0:
            k_phone = header_index(krows[0], "SĐT")
        k_zalo = header_index(krows[0], "Zalo")
        if k_phone >= 0 and k_zalo >= 0:
            for r in krows[1:]:
                p = norm_phone(r[k_phone]) if k_phone < len(r) else ""
                z = str(r[k_zalo] or "").strip().lower() if k_zalo < len(r) else ""
                if p and z:
                    zalo[p] = "y" if z.startswith("c") else "n" if z.startswith("k") else ""

    das = Counter(str(r[c_da]).strip() for r in rows[1:] if c_da >= 0 and r[c_da])
    da_default = das.most_common(1)[0][0] if das else ""

    cases = []
    for r in rows[1:]:
        d = iso(r[c_date]) if c_date < len(r) else ""
        name = clean_name(r[c_name]) if c_name < len(r) else ""
        if not d or not name:
            continue
        phone = norm_phone(r[c_phone]) if c_phone < len(r) else ""
        da = str(r[c_da]).strip() if c_da >= 0 and c_da < len(r) and r[c_da] else da_default
        verdict = "nozalo" if zalo.get(phone) == "n" else "pending"
        cases.append({
            "clinic": clinic, "da": da, "date": d, "verdict": verdict,
            "name": name, "phone": phone, "show": mask_phone(phone, phones),
            "flags": [0] * CP_TOTAL,
        })
    return cases, {"sheet": pt, "rows": len(cases), "zaloKnown": len(zalo)}


def read_audit(path):
    """{(phone, surgeryDate): [7 touchpoint scores]} from the D90 Audit sheet."""
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    name = next((s for s in wb.sheetnames if s.lower().startswith("d90 audit")), None)
    if not name:
        return {}
    rows = list(wb[name].iter_rows(values_only=True))
    hdr_i = next((i for i, r in enumerate(rows[:10])
                  if any(h and str(h).startswith("Phone") for h in r)), None)
    if hdr_i is None:
        return {}
    hdr = rows[hdr_i]
    c_phone = header_index(hdr, "Phone")
    c_date = header_index(hdr, "Surgery")
    c_tp = [header_index(hdr, lbl) for lbl in AUDIT_TP]
    out = {}
    for r in rows[hdr_i + 1:]:
        p = norm_phone(r[c_phone]) if c_phone < len(r) else ""
        d = iso(r[c_date]) if c_date < len(r) else ""
        if not p or not d:
            continue
        scores = []
        for i in c_tp:
            v = r[i] if 0 <= i < len(r) else None
            try:
                scores.append(int(float(v)) if v not in (None, "") else None)
            except ValueError:
                scores.append(None)
        out[(p, d)] = scores
    return out


def apply_audit(cases, audit):
    n = 0
    for c in cases:
        s = audit.get((c["phone"], c["date"]))
        if s is None:
            continue
        flags = []
        for ti, t in enumerate(TOUCH):
            k = len(t[1])
            v = s[ti]
            if v is None or v <= 0:
                flags += [0] * k
            elif v >= 10:
                flags += [1] * k
            else:                       # 5 = one of two items: mark the first
                flags += [1] + [0] * (k - 1)
        c["flags"] = flags
        c["verdict"] = "audited"
        n += 1
    return n


def load_base(path):
    txt = open(path, encoding="utf-8").read()
    m = re.search(r"^(\s*var DATA = )(\{.*\});\s*$", txt, re.M)
    if not m:
        sys.exit("no `var DATA = {...};` line in " + path)
    return txt, m, json.loads(m.group(2))


def carry_over(base, clinic):
    """Cases of the other clinics, in the current row shape."""
    out = []
    v2 = base.get("v", 1) >= 2
    for c in base["cases"]:
        if c[0] == clinic:
            continue
        if v2:
            out.append(c)
        else:   # v1: [clinic, da, date, verdict, scored, tag, ...15 flags]
            flags = c[6:]
            out.append(c[:6] + ["", ""] + [flags[i] if i < len(flags) else 0 for i in V1_MAP])
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cte", required=True)
    ap.add_argument("--audit")
    ap.add_argument("--base", default="lasik/index.html")
    ap.add_argument("--write")
    ap.add_argument("--json")
    ap.add_argument("--clinic", default="CTE")
    ap.add_argument("--asof")
    ap.add_argument("--phones", choices=["last4", "full", "none"], default="last4")
    a = ap.parse_args()
    if not a.write and not a.json:
        ap.error("give --write or --json")

    txt, m, base = load_base(a.base)
    asof = a.asof or base.get("asof") or ""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", asof):
        ap.error("--asof YYYY-MM-DD is required (base page has none)")

    cte, info = read_cte(a.cte, a.clinic, a.phones)
    late = [c for c in cte if c["date"] > asof]
    cte = [c for c in cte if c["date"] <= asof]
    audited = apply_audit(cte, read_audit(a.audit)) if a.audit else 0

    rows = carry_over(base, a.clinic)
    for c in sorted(cte, key=lambda c: (c["date"], c["name"])):
        rows.append([c["clinic"], c["da"], c["date"], c["verdict"],
                     1 if c["verdict"] == "audited" else 0,
                     "", c["name"], c["show"]] + c["flags"])
    rows.sort(key=lambda r: (r[2], r[0], r[1]))

    payload = {"v": 2, "asof": asof, "generated": datetime.date.today().isoformat(),
               "touch": TOUCH, "cases": rows}
    out = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    if a.json:
        open(a.json, "w", encoding="utf-8").write(out)
    if a.write:
        new = txt[:m.start(2)] + out + txt[m.end(2):]
        open(a.write, "w", encoding="utf-8").write(new)

    by_v = Counter(c["verdict"] for c in cte)
    print("%s: %d cases from %s (%s), zalo status known for %d phones"
          % (a.clinic, len(cte), a.cte, info["sheet"], info["zaloKnown"]))
    print("  verdicts:", dict(by_v), "| audited:", audited,
          "| after as-of %s, left out: %d" % (asof, len(late)))
    print("  other clinics carried over: %d | total cases: %d | payload %d bytes"
          % (len(rows) - len(cte), len(rows), len(out.encode("utf-8"))))


if __name__ == "__main__":
    main()

# Zalo SOP Compliance — dashboard demos

| Dashboard | Link |
|---|---|
| Optometry — weekly outreach sent check | https://kohsinlong.github.io/zalo-sop-dashboard/ |
| Lasik — SOP audit, D1–D90 | https://kohsinlong.github.io/zalo-sop-dashboard/lasik/ |

**Optometry** — SOP compliance scored per cadence (0 / 0.5 / 1) across the
product cadences in the CRM form (MC, glasses, Ortho-K, Atropine: D1 to
CD+365), filtered by month, week, clinic, assistant and product. Customers,
products, assistants, tag dates and data flags come from the clinics'
Membership trackers, with Zalo tags shown as written. Whether each content item was actually sent is modelled until the
Salework Zalo API is connected. Data flags (two kids on one tag, product ≠
tag, collected but still N, stale N, missing Y/N) are counted by type, clinic
and assistant, with the fix for each, on the live month only.

*Live data.* `tools/live-feed.gs` is a Google Apps Script that reads every
Membership tracker listed in it and serves the page a minimised JSON feed
(tags and dates, no phones or birthdays). Deploy it once as a web app (execute as
you, access: anyone), then put its `/exec` URL and token into `LIVE` near
the top of the script in `index.html`. The page reads the sheets on every
load and falls back to the embedded snapshot if they are unreachable;
`?feed=<url>` overrides the URL for testing. The embedded snapshot is the
trackers as exported on 3 Sep 2026.

**Lasik** — SOP compliance scored per the D90 SOP QC guide: seven
touchpoints from D1 to D90 (D1, D2–4, D6, D15, D25–30, D30–60, D60–90) worth
10 points each — 10 when every required item went out, 5 when only part of
it did, 0 when nothing did — plus response quality out of 30, rated once a
month per DA by QA in four bands (30 / 20 / 10 / 0) with a justification.
Total 100, pass at 70. Follow-up scores are pro-rated to the touchpoints that
have fallen due; a total appears once at least half the cadences in view carry
a quality rating.

*CTE cases* come from the DA's customer-information workbook (the surgery
sheet: surgery date, name, phone), imported with `tools/lasik-import.py`. The
surgery date anchors D1. The workbook has no Zalo tag: tags are resolved from
the Salework raw data by phone number and surgery date, and until a message
exists the worklist shows the customer's name and number with "Zalo tag not
available yet". Whether each item was sent comes from the QC workbook's audit
sheet where a row matches the case; every other case carries modelled
sent-flags until Salework is connected, as on the optometry page. The other
clinics are made-up cases at MSG's real volume (about 1,000 Lasik surgeries a
month across the hospitals) from May 2026, and the response-quality ratings
for May to July are seeded so the month-by-month scoring can be shown; from
August on the QA scores each DA on the page.

*No live CTE feed yet.* The CTE cases are the workbook's Excel export as
of 2 Sep 2026, embedded by `tools/lasik-import.py` (re-run it with a newer
export to refresh). Quality ratings are kept in the browser that entered
them; "Copy link with ratings" in the rating panel makes a link that carries
them to another browser, where they merge in (newest wins). The marking list
shows each case's name, phone number and Zalo tag in full, since those
identify the case being marked; the page sits behind the sign-in gate but is
public once deployed (`--phones last4` masks the numbers).

*When the workbook lives in Google Sheets.* `tools/lasik-feed.gs` is a
second file for the same Apps Script project as the optometry feed:
`live-feed.gs` routes `?app=lasik` to it and hands it the ratings the page
saves, so one deployment, URL and token serve both dashboards. Open that
project, replace its code with the current `live-feed.gs`, add
`lasik-feed.gs` as a new script file, put the workbook's spreadsheet ID into
`LASIK.sources` (the QC audit and Salework sheets are optional; the ratings
store is created in Drive on the first save), publish a new version, and put
the deployment URL and token into `LIVE` near the top of the script in
`lasik/index.html`. The page then reads cases and ratings from the sheets on
every load and posts ratings back; the feed serves full phone numbers
(`LASIK.phone`).

Static HTML, no dependencies. Language: EN / Tiếng Việt / 中文.
The optometry page shows no patient data; the Lasik snapshot shows customer
names with masked numbers, behind the sign-in gate.

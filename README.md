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
sheet where a row matches the case; cases without one are listed in the
worklist as "No data yet" and left out of the scores. The other clinics are
still modelled data until Salework is connected.

*Live data and ratings.* `tools/lasik-feed.gs` is a Google Apps Script that
reads the DA workbooks, the QC audit sheet and the Salework sheet, serves the
page its cases, and stores the quality ratings keyed in on the page in a
"QA ratings" sheet. Deploy it as a web app (execute as you, access: anyone)
and put its `/exec` URL and token into `LIVE` near the top of the script in
`lasik/index.html`. Without it the page uses the embedded snapshot and keeps
ratings in the browser that entered them. The embedded snapshot carries names
with phone numbers masked to their last four digits; the feed serves full
numbers (see `PHONE` in the script), because the page is public once deployed.

Static HTML, no dependencies. Language: EN / Tiếng Việt / 中文.
The optometry page shows no patient data; the Lasik snapshot shows customer
names with masked numbers, behind the sign-in gate.

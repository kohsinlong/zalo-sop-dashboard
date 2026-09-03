# Zalo SOP Compliance — dashboard demos

| Dashboard | Who it is for | Link |
|---|---|---|
| Optometry — weekly outreach sent check | Head office | https://kohsinlong.github.io/zalo-sop-dashboard/ |
| Optometry — my follow-ups | Each DA, on their phone | https://kohsinlong.github.io/zalo-sop-dashboard/da/ |
| Optometry — KPI at a glance (concept) | Clinic / head office | https://kohsinlong.github.io/zalo-sop-dashboard/kpi/ |
| Lasik — SOP audit, D1–D90 | Head office | https://kohsinlong.github.io/zalo-sop-dashboard/lasik/ |

**Optometry, head office** — SOP compliance scored per cadence (0 / 0.5 / 1)
across the product cadences in the CRM form (MC, glasses, Ortho-K, Atropine:
D1 to CD+365), filtered by month, week, clinic, assistant and product.
Customers, products, assistants, tag dates and data flags come from the
clinics' Membership trackers; Zalo tags are shown with the child's name
reduced to initials. Whether each content item was actually sent is modelled
until the Salework Zalo API is connected. Data flags (two kids on one tag,
product ≠ tag, collected but still N, stale N, missing Y/N) are counted by
type, clinic and assistant, with the fix for each, on the live month only.

**Optometry, DA view** (`da/`) — the same data and the same scoring, turned
round to face one assistant. After sign-in the DA picks their clinic and
name once (remembered on the phone) and sees: due today, due this week, and
what is missed; a "today" ring that fills as the day's cadences are sent,
the month-to-date and since-July scores as head office sees them, a
day-by-day strip with streak and perfect-day counts, and a team table. The
due-today list shows each Zalo tag with the exact CRM items still to send
(and when a windowed cadence like D6-7 or CD+3-5 opened). Missed and
incomplete cadences are listed newest first, this week and last by default.
Only cadences whose window has closed count toward any percentage; days
ahead are shown to plan, not scored. Two sections are explicitly modelled
until their feeds exist: *Waiting for your reply* (needs the Zalo
conversation feed) and, as everywhere, the sent / not-sent ticks.

**Optometry, KPI at a glance** (`kpi/`) — concept only. SOP compliance is
real; sales (membership, repurchase and referral revenue, and customers for
each, target vs achieved) and leads (target vs generated, by week) are
placeholders defined in the `TARGETS` block at the top of the script, with
"achieved" modelled from them. Replace that block with the real targets and
point `actuals()` at the sales tracker and Salework lead counts.

*Shared core.* `optom-core.js` holds the embedded snapshot of the trackers,
the live-feed settings and the rules that turn feed rows into cases
(including the modelled sent marks). All three optometry pages load it, so a
customer scores the same on every page. The password gate is shared too, and
one sign-in covers all three pages in the same browser tab.

*Live data.* `tools/live-feed.gs` is a Google Apps Script that reads every
Membership tracker listed in it and serves the pages a minimised JSON feed
(no names, phones or birthdays). Deploy it once as a web app (execute as
you, access: anyone), then put its `/exec` URL and token into `LIVE` near
the top of `optom-core.js`. Every page reads the sheets on load and falls
back to the embedded snapshot if they are unreachable; `?feed=<url>`
overrides the URL for testing and `?asof=YYYY-MM-DD` moves the reporting
date. The embedded snapshot is the trackers as exported on 3 Sep 2026.

**Lasik** — SOP compliance scored at checkpoint level across eight touchpoints
from D1 to D90. Cases, clinics, reps, surgery dates, verdicts and touchpoints
D1–D25 are taken from the QC workbook (1,099 cases, Oct 2025 – Mar 2026).
Checkpoint detail within each touchpoint, and all of D30–D90, are modelled —
the workbook records only a single mark per touchpoint, and D30–D90 is new SOP
with no audit data yet.

Static HTML, no dependencies. Language: EN / Tiếng Việt / 中文.
No patient data appears on any page.

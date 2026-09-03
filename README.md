# Zalo SOP Compliance — dashboard demos

| Dashboard | Link |
|---|---|
| Optometry — weekly outreach sent check | https://kohsinlong.github.io/zalo-sop-dashboard/ |
| Lasik — SOP audit, D1–D90 | https://kohsinlong.github.io/zalo-sop-dashboard/lasik/ |

**Optometry** — SOP compliance scored per cadence (0 / 0.5 / 1) across the
product cadences in the CRM form (MC, glasses, Ortho-K, Atropine: D1 to
CD+365), filtered by month, week, clinic, assistant and product. Customers,
products, assistants, tag dates and data flags are taken from the CTE D5 and
NGT Membership trackers (576 customers, tagged Jul–Aug 2026); Zalo tags are
shown with the child's name reduced to initials. Whether each content item
was actually sent is modelled until the Salework Zalo API is connected. Data
flags (two kids on one tag, product ≠ tag, collected but still N, stale N,
missing Y/N) are counted by type, clinic and assistant, with the fix for each.

**Lasik** — SOP compliance scored at checkpoint level across eight touchpoints
from D1 to D90. Cases, clinics, reps, surgery dates, verdicts and touchpoints
D1–D25 are taken from the QC workbook (1,099 cases, Oct 2025 – Mar 2026).
Checkpoint detail within each touchpoint, and all of D30–D90, are modelled —
the workbook records only a single mark per touchpoint, and D30–D90 is new SOP
with no audit data yet.

Static HTML, no dependencies. Language: EN / Tiếng Việt / 中文.
No patient data appears in either page.

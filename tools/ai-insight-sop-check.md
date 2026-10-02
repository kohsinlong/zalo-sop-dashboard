# Salework Zalo AI Insight — SOP compliance check prompt

> **Status (2 Oct 2026): blocked.** The first NGT run showed that the AI
> is given conversation IDs, not the contact name, so it cannot read the
> Zalo tag; Salework only renders the name in the report afterwards.
> Every anchor date came back "unknown". The prompt is sound only once
> the contact name (or something mappable to it) reaches the model.

A prompt for Salework's **Zalo AI Insight** (Salework Zalo → AI Insight →
*Tạo yêu cầu AI*) that reads each conversation's Zalo tag, works out which
SOP milestones fell due in the period, and checks whether the DA sent the
required content on time. Written for the optometry cadence in the
Membership trackers (MC, Kính, Ortho-K, Atropine; D1 to CD+365) and
piloted on NGT (one DA, tags from 20 Jul 2026).

Paste the Vietnamese prompt below as written. Edit only the line
`KỲ KIỂM TRA` (the period) and, if you want an English report, the
language in `BƯỚC 4`.

## How to run it

1. **Model** — Claude Sonnet 4.6 or GPT-5.x. The check needs date
   arithmetic over long chats; the doc itself says to use a stronger
   model for that. Don't use the mini / Flash models for this one.
2. **Bộ lọc hội thoại** — *Khoảng thời gian* = exactly the period in the
   prompt's `KỲ KIỂM TRA` line. *Tài khoản Zalo* = the DA's NGT account(s).
   *Trạng thái đọc / trả lời* = Tất cả. No tag filter.
3. **One run reads at most 100 conversations.** For NGT in September the
   tracker (export of 29 Sep 2026) has ~470 customers with 933 milestones
   due — CD+30 274, CD+3-5 189, CD 169, CD+14 132, CD+7 81, D1 44, D6-7 25,
   CDN 9, CD+1 9, CD+90 1 — i.e. about 200 customers a week. So a weekly
   window gets truncated. Run the saved prompt per **3–4-day window**
   (8–10 runs for the month), changing `KỲ KIỂM TRA` to match the filter
   each time. If a run says it retrieved exactly 100 conversations, split
   that window again.
4. **Pilot first** — *Xem thử (5 KH)*, then one 3-day window, then check
   five rows by hand against the chats before trusting the rest.
5. **What it cannot see** — a conversation with no message at all in the
   window is not in the data. Those are the likeliest real misses. After
   the runs, paste the *Nhãn Zalo* column of every run next to
   `Membership_NGT`: a customer with a milestone due in the window and no
   row in any run was not contacted at all. Only the tracker (or the
   dashboard) can produce that list.
6. The table shows the due date the AI computed, so arithmetic slips are
   visible. If they are frequent, the fallback is to generate the due list
   from the tracker and paste it into the prompt per batch instead of
   letting the AI compute it.
7. Chats go to a third-party model (OpenAI / Google / Anthropic). Clear
   that with whoever owns data protection before running it across clinics.

## Cài đặt doanh nghiệp (Business settings) — suggested text

**Ngành & khách hàng:** Phòng khám mắt trẻ em (NGT), B2C. Khách hàng là
phụ huynh của trẻ dùng kính kiểm soát cận thị (MC), kính gọng (KT),
Ortho-K (OK) hoặc Atropine (Atr). Trợ lý bác sĩ (DA) chăm sóc qua Zalo cá
nhân theo SOP mốc thời gian tính từ ngày đặt cọc và ngày nhận kính.

**Tiêu chí đánh giá:** Tuân thủ SOP = đúng nội dung và đúng thời điểm theo
từng mốc (D1, D6-7, CD, CD+3-5, CD+7, CD+14, CD+30, CD+90, CD+180,
CD+270, CD+365) như mô tả trong yêu cầu phân tích. Trả lời khách trong
ngày; giọng điệu lịch sự, chủ động.

---

## Prompt (tiếng Việt — dán nguyên văn)

```
Bạn là QA kiểm tra việc tuân thủ SOP chăm sóc khách hàng qua Zalo của trợ lý bác sĩ (DA) tại phòng khám mắt NGT. Khách hàng là phụ huynh của trẻ dùng kính kiểm soát cận thị (MC), kính gọng (KT), Ortho-K (OK) hoặc Atropine (Atr).

KỲ KIỂM TRA: từ 01/09/2026 đến 30/09/2026 (phải trùng với "Khoảng thời gian" trong bộ lọc hội thoại).

BƯỚC 1 – ĐỌC NHÃN ZALO
Tên hội thoại chính là nhãn theo dõi, định dạng: [Sản phẩm][Y/N] [YYMMDD] [phụ huynh] [tên bé].
Ví dụ: "MCY 260720 Mẹ bé An" = MC, đã nhận kính (Y), ngày 20/07/2026. "KTN 260915 Mẹ bé Thiên" = kính gọng, chưa nhận (N), đặt cọc ngày 15/09/2026.
- Sản phẩm: MC = kính MC; KT = kính gọng; OK = Ortho-K; Atr = Atropine. Không phân biệt hoa/thường; dấu "-" hoặc khoảng trắng đều hợp lệ.
- Y = đã nhận kính: ngày trong nhãn là ngày nhận kính (CD). N = chưa nhận: ngày trong nhãn là ngày đặt cọc (D1).
- Nhãn có 2 sản phẩm (ví dụ "KTY MCY 260827 ...") hoặc dấu "&" (2 bé): đánh giá từng sản phẩm/bé thành dòng riêng, cùng ngày.
- Nhãn không đúng định dạng, thiếu Y/N, ngày không đọc được, ngày sau ngày kết thúc kỳ hoặc trước 01/01/2025: KHÔNG chấm điểm, đưa vào mục D kèm lý do.

BƯỚC 2 – XÁC ĐỊNH CÁC MỐC ĐẾN HẠN TRONG KỲ
Ngày đến hạn = ngày neo + số ngày của mốc. Luôn ghi rõ ngày đã tính. Chỉ đánh giá mốc có ngày đến hạn nằm trong KỲ KIỂM TRA. Ngoài ra, nếu trong kỳ có tin nhắn hoàn thành một mốc đến hạn TRƯỚC kỳ, ghi nhận là "trễ" kèm số ngày trễ.
- Nhãn N: chỉ xét D1 và D6-7, với D1 = ngày trong nhãn.
- Nhãn Y: CD = ngày trong nhãn. Nếu CD nằm trong kỳ, xét thêm D1 và D6-7 với D1 = ngày tin nhắn đầu tiên của DA trong hội thoại; nếu không xem được tin nhắn trước CD, ghi "không rõ".
Ví dụ với kỳ 01/09–30/09/2026: "MCY 260820 Mẹ bé An" → CD = 20/08; CD+3-5 = 25/08 (ngoài kỳ, chỉ ghi nếu gửi trễ trong kỳ); CD+14 = 03/09 (trong kỳ); CD+30 = 19/09 (trong kỳ).

Nội dung bắt buộc theo sản phẩm và mốc. Mỗi dấu ";" là một nội dung riêng. "(khi khách trả lời)" = chỉ bắt buộc nếu khách có trả lời trong cửa sổ của mốc; nếu không, ghi "không áp dụng" và không trừ điểm.

MC:
- D1 (ngày cọc): tin nhắn giới thiệu/chào; báo thời gian dự kiến làm kính
- D6-7: báo kính đã về; hẹn ngày lấy kính
- CD: hướng dẫn sử dụng; quyền lợi hội viên (khi khách trả lời); mời giới thiệu
- CD+3-5: hỏi thăm tình trạng; mời giới thiệu (khi khách trả lời)
- CD+14: hỏi thăm tình trạng; nhắc đeo 12 giờ/ngày; quyền lợi hội viên; mời giới thiệu
- CD+30, CD+90, CD+270: hỏi thăm tình trạng; nội dung giáo dục; quyền lợi hội viên; mời giới thiệu
- CD+180, CD+365: mời tái khám; quyền lợi hội viên; mời giới thiệu

KT (kính gọng):
- D1, D6-7, CD: như MC
- CD+3-5: hỏi thăm tình trạng; mời giới thiệu (khi khách trả lời)
- CD+7: hỏi thăm tình trạng; chỉnh gọng miễn phí; quyền lợi hội viên; mời giới thiệu
- CD+30, CD+270: hỏi thăm tình trạng; quyền lợi hội viên; mời giới thiệu
- CD+90: hỏi thăm tình trạng; nội dung giáo dục; quyền lợi hội viên; mời giới thiệu
- CD+180: mời đặt lịch tái khám; quyền lợi hội viên; mời giới thiệu
- CD+365: mời tái khám; quyền lợi hội viên mua lại; chỉnh gọng miễn phí trọn đời

OK (Ortho-K):
- D1, D6-7, CD: như MC
- CDN (tối ngày nhận kính): hỏi lần đeo đầu tiên; hỗ trợ nếu khó chịu
- CD+1: hỏi thăm tình trạng; mời giới thiệu
- CD+3-5: hỏi thăm tình trạng; mời giới thiệu (khi khách trả lời)
- CD+7: mời đặt lịch tái khám; quyền lợi hội viên; mời giới thiệu
- CD+30, CD+90, CD+180, CD+270: mời đặt lịch tái khám; nhắc đeo trên 6 lần/tuần; quyền lợi hội viên; mời giới thiệu
- CD+365: mời tái khám; quyền lợi hội viên; mời giới thiệu

Atr (Atropine):
- D1: tin nhắn giới thiệu; báo thời gian dự kiến có thuốc
- D6-7: báo đã có thuốc; hẹn ngày lấy
- CD (nhận thuốc): hướng dẫn nhỏ thuốc; kích hoạt hội viên; quyền lợi hội viên (khi khách trả lời)
- CD+7: kiểm tra tuân thủ (từ 6 ngày/tuần); nhắc đeo kính chống lóa
- CD+90: mời tái khám lần 1; kê đơn tiếp theo
- CD+180: mời tái khám lần 2; tư vấn nâng cấp Ortho-K/MC
- CD+270: mời tái khám lần 3; mời giới thiệu
- CD+365: mời tái khám lần 4; tổng kết; tư vấn phối hợp điều trị

Cửa sổ chấp nhận (tin nhắn DA gửi trong cửa sổ = đúng hạn):
D1: ngày cọc đến +1 ngày | D6-7: D1+2 đến D1+10 | CD: CD-1 đến CD+2 | CDN: tối ngày CD đến CD+1 | CD+1: CD+1 đến CD+2 | CD+3-5: CD+2 đến CD+6 | CD+7: CD+6 đến CD+10 | CD+14: CD+12 đến CD+18 | CD+30: CD+27 đến CD+37 | CD+90, CD+180, CD+270, CD+365: ±10 ngày.
Gửi sau cửa sổ nhưng trước cửa sổ của mốc kế tiếp = "trễ" (ghi số ngày). Không có tin nhắn nào phù hợp = "chưa gửi".

BƯỚC 3 – ĐỐI CHIẾU TIN NHẮN
- Chỉ tính tin nhắn DO DA GỬI, không tính tin của khách. Dùng ngày gửi thực tế.
- Một tin nhắn có thể đáp ứng nhiều nội dung; các nội dung của một mốc có thể nằm ở nhiều tin nhắn trong cùng cửa sổ.
- Chỉ tính khi nội dung thực sự có trong tin nhắn: "hỏi thăm tình trạng" = DA hỏi bé đeo kính/dùng thuốc thế nào; "quyền lợi hội viên" = DA nêu quyền lợi hoặc ưu đãi hội viên; "mời giới thiệu" = DA đề nghị giới thiệu người quen; "nội dung giáo dục" = DA gửi bài/hình/video kiến thức về mắt. Không suy đoán.
- Điểm mỗi mốc: 1 = đủ tất cả nội dung bắt buộc; 0.5 = thiếu một phần; 0 = chưa gửi gì.

BƯỚC 4 – KẾT QUẢ (trả lời bằng tiếng Việt, dạng bảng)
A. Tổng hợp theo mốc: số mốc đến hạn | đủ (1) | thiếu một phần (0.5) | chưa gửi (0) | % đúng hạn | điểm trung bình. Thêm một dòng tổng và một dòng cho từng tài khoản Zalo.
B. Chi tiết, mỗi dòng = 1 khách × 1 mốc, sắp xếp theo ngày đến hạn, các cột:
Nhãn Zalo (ghi NGUYÊN VĂN tên hội thoại) | Sản phẩm | Y/N | Ngày neo | Mốc | Ngày đến hạn | Nội dung đã gửi (kèm ngày gửi) | Nội dung còn thiếu | Đúng hạn / Trễ (số ngày) / Chưa gửi | Điểm | Bằng chứng (trích tối đa 15 từ của tin nhắn + ngày)
C. Cần xử lý ngay: các dòng điểm 0 hoặc 0.5, nhóm theo mốc, kèm nội dung còn thiếu.
D. Không đánh giá được: hội thoại có tên không đúng định dạng nhãn, nhãn lỗi hoặc ngày bất thường, nhãn "Exam", hoặc không phải khách hàng (đồng nghiệp, nhóm...) — ghi tên hội thoại và lý do.
E. Cảnh báo dữ liệu: nhãn N nhưng đã quá 14 ngày kể từ ngày cọc tính đến cuối kỳ (cần đổi N→Y hoặc kiểm tra); nhãn ghi sản phẩm khác với sản phẩm được trao đổi trong hội thoại.

Nguyên tắc: không bịa tin nhắn, không làm tròn có lợi cho DA. Khi không chắc, ghi "không rõ" và trích bằng chứng để người kiểm tra tự xem.
```

---

## English rendering (for review — not the one to paste)

```
You are QA checking whether the doctor's assistant (DA) at the NGT eye clinic followed the Zalo customer-care SOP. Customers are parents of children on myopia-control lenses (MC), spectacles (KT), Ortho-K (OK) or Atropine (Atr).

PERIOD UNDER REVIEW: 01/09/2026 to 30/09/2026 (must equal the "Time range" in the conversation filter).

STEP 1 – READ THE ZALO TAG
The conversation name is the tracking tag: [Product][Y/N] [YYMMDD] [parent] [child's name].
E.g. "MCY 260720 Mẹ bé An" = MC, collected (Y), 20 Jul 2026. "KTN 260915 Mẹ bé Thiên" = spectacles, not yet collected (N), deposit on 15 Sep 2026.
- Products: MC = MC lenses; KT = spectacles; OK = Ortho-K; Atr = Atropine. Case-insensitive; "-" or spaces both fine.
- Y = collected: the date in the tag is the collection date (CD). N = not collected: the date is the deposit date (D1).
- A tag with two products (e.g. "KTY MCY 260827 ...") or an "&" (two children): score each product/child as its own row, same date.
- A tag that doesn't fit the format, lacks Y/N, has an unreadable date, a date after the period end or before 01/01/2025: do NOT score; list it in section D with the reason.

STEP 2 – WORK OUT WHICH MILESTONES FELL DUE IN THE PERIOD
Due date = anchor date + the milestone's day offset. Always show the computed date. Only score milestones whose due date falls inside the PERIOD. In addition, if a message in the period completes a milestone that was due BEFORE the period, record it as "late" with the number of days.
- N tags: check only D1 and D6-7, with D1 = the date in the tag.
- Y tags: CD = the date in the tag. If CD is inside the period, also check D1 and D6-7 with D1 = the date of the DA's first message in the conversation; if messages before CD are not visible, write "unknown".
Example for the period 01/09–30/09/2026: "MCY 260820 Mẹ bé An" → CD = 20/08; CD+3-5 = 25/08 (outside, record only if sent late inside the period); CD+14 = 03/09 (inside); CD+30 = 19/09 (inside).

Required content per product and milestone. Each ";" is a separate item. "(if the customer replied)" = required only if the customer replied inside that milestone's window; otherwise write "n/a" and don't deduct.

MC:
- D1 (deposit day): intro/greeting message; expected lens-making time
- D6-7: lenses have arrived; pickup appointment
- CD: usage guide; member benefits (if the customer replied); referral invitation
- CD+3-5: check-in; referral invitation (if the customer replied)
- CD+14: check-in; remind 12 h/day wear; member benefits; referral invitation
- CD+30, CD+90, CD+270: check-in; educational content; member benefits; referral invitation
- CD+180, CD+365: recall invitation; member benefits; referral invitation

KT (spectacles):
- D1, D6-7, CD: as MC
- CD+3-5: check-in; referral invitation (if the customer replied)
- CD+7: check-in; free frame adjustment; member benefits; referral invitation
- CD+30, CD+270: check-in; member benefits; referral invitation
- CD+90: check-in; educational content; member benefits; referral invitation
- CD+180: invite to book a recall; member benefits; referral invitation
- CD+365: recall invitation; repurchase member benefit; lifetime free frame adjustment

OK (Ortho-K):
- D1, D6-7, CD: as MC
- CDN (evening of collection day): ask about the first wear; support if uncomfortable
- CD+1: check-in; referral invitation
- CD+3-5: check-in; referral invitation (if the customer replied)
- CD+7: invite to book a recall; member benefits; referral invitation
- CD+30, CD+90, CD+180, CD+270: invite to book a recall; remind >6 wears/week; member benefits; referral invitation
- CD+365: recall invitation; member benefits; referral invitation

Atr (Atropine):
- D1: intro message; expected availability of the drops
- D6-7: drops have arrived; pickup appointment
- CD (drops collected): instillation guide; activate membership; member benefits (if the customer replied)
- CD+7: compliance check (≥6 days/week); remind anti-glare glasses
- CD+90: recall 1 invitation; next prescription
- CD+180: recall 2 invitation; upgrade advice (Ortho-K/MC)
- CD+270: recall 3 invitation; referral invitation
- CD+365: recall 4 invitation; summary; combined-treatment advice

Acceptance windows (a DA message inside the window = on time):
D1: deposit day to +1 | D6-7: D1+2 to D1+10 | CD: CD-1 to CD+2 | CDN: evening of CD to CD+1 | CD+1: CD+1 to CD+2 | CD+3-5: CD+2 to CD+6 | CD+7: CD+6 to CD+10 | CD+14: CD+12 to CD+18 | CD+30: CD+27 to CD+37 | CD+90, CD+180, CD+270, CD+365: ±10 days.
Sent after the window but before the next milestone's window = "late" (give the days). No matching message at all = "not sent".

STEP 3 – MATCH THE MESSAGES
- Count only messages SENT BY THE DA, never the customer's. Use the actual send date.
- One message may satisfy several items; a milestone's items may be spread over several messages inside the window.
- Count an item only when it is actually in the message: "check-in" = the DA asks how the child is getting on with the lenses/drops; "member benefits" = the DA states member benefits or offers; "referral invitation" = the DA asks them to refer someone; "educational content" = the DA sends an article/image/video about eye care. Don't infer.
- Score per milestone: 1 = every required item sent; 0.5 = partly; 0 = nothing sent.

STEP 4 – OUTPUT (in Vietnamese, as tables)
A. Summary by milestone: milestones due | complete (1) | partial (0.5) | not sent (0) | % on time | mean score. Add a total row and one row per Zalo account.
B. Detail, one row per customer × milestone, sorted by due date, columns:
Zalo tag (conversation name VERBATIM) | Product | Y/N | Anchor date | Milestone | Due date | Content sent (with send dates) | Content missing | On time / Late (days) / Not sent | Score | Evidence (≤15 words of the message + date)
C. Fix now: every row scored 0 or 0.5, grouped by milestone, with the missing content.
D. Not assessable: conversations whose name isn't a valid tag, bad tags or odd dates, "Exam" tags, or non-customers (colleagues, groups...) — name and reason.
E. Data warnings: N tags more than 14 days past the deposit date as of the period end (switch N→Y or check); tags whose product differs from what the chat is about.

Rules: never invent a message, never round in the DA's favour. When unsure, write "unclear" and quote the evidence so a reviewer can check.
```

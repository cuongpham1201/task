# V1 PRODUCT BACKLOG — App Giao việc (thay Asana cho BHL)

> Góc nhìn Product Owner. Mục tiêu: hoàn thiện **Task · Action · Project** tới mức
> "người dùng không muốn quay lại Asana". KHÔNG KPI/HRM/OKR/Graph/Teams/redesign DB.
> Nguồn: final-architecture-freeze.md, action-model-freeze.md, uat-polish-report.md,
> action-task-kpi-architecture-audit.md + audit source (A1–A3.6, đã sync HRM dev thật).

---

## 0. Hiện trạng (đã có, chạy được)

Task (tạo/sửa/giao/subtask/comment/review/collaborator/priority/deadline/section/progress) ·
Action Log + Nhật ký điều hành + mini-dashboard · Project (member, tab, board/list) ·
Dashboard theo vai trò · Department page + mini-dashboard · My Tasks (tab+sort+chip ngữ cảnh) ·
Notification in-app (giao/comment/nghiệm thu, poll 20s, badge) · Search (task/dự án/phòng/người) ·
SearchUser autocomplete · Breadcrumb · Visibility server-side 4 tầng · Mobile + PWA ·
HRM dev sync (706 user / 29 phòng / 5 khối).

---

## 1. AUDIT THEO 10 PERSONA (luồng sáng — thay Asana?)

**1. Nhân viên văn phòng** — 08:00 mở → My Tasks: thấy việc hôm nay/quá hạn/bị trả lại + chip
đơn vị/action. Cập nhật %, comment, nộp nghiệm thu. *Thiếu:* đính kèm file, @mention đồng nghiệp,
theo dõi việc liên quan. → Quay lại Asana vì **không đính kèm được file**.

**2. Nhân viên kỹ thuật (phân xưởng/cơ điện)** — nhiều người **không có work_email** → **không
login được**. Việc kỹ thuật cần đính kèm ảnh/biên bản. → Chưa dùng được (chặn login + attachment).

**3. Trưởng phòng** — mở app → Action Log phòng / Trang chủ → badge việc trễ → ai làm → chờ
nghiệm thu → nghiệm thu. <30s đạt. *Thiếu:* nhắc deadline tự động, lọc/nhóm My Tasks nâng cao,
bulk thao tác nhiều việc. → Dùng được (beta) nếu có role thật.

**4. Giám đốc khối** — Action Log khối (Khối>Phòng>Action) + badge → drill. Đủ theo dõi.
*Thiếu:* xuất/in bản họp, so sánh kỳ. → Dùng được để giám sát; báo cáo họp vẫn phải làm tay.

**5. TGĐ** — Action Log toàn công ty, lọc kỳ. Đủ xem. *Thiếu:* bản in "biên bản họp tác nghiệp",
tổng hợp 1 trang. → Xem được, nhưng họp tháng vẫn dùng slide.

**6. Project Owner** — tạo dự án? (chưa có UI tạo Project — chỉ seed/sync). thêm/xóa member OK,
giao task OK. *Thiếu:* **tạo Project từ UI**, đính kèm, timeline dự án. → Vướng ngay bước tạo dự án.

**7. Project Member** — thấy dự án, task, comment. *Thiếu:* follow, @mention, file. → Cộng tác chưa đủ.

**8. Người chỉ dùng điện thoại** — bottom-nav, PWA OK; Action Log/Task Detail responsive.
*Thiếu:* quick-add nhanh, đính kèm ảnh từ camera. → Xem tốt, nhập liệu nhanh còn yếu.

**9. Người rất ít dùng CNTT** — cần cực đơn giản. Hiện form tạo task nhiều trường. *Thiếu:*
quick-add 1 dòng, "việc của tôi hôm nay" nổi bật. → Dễ nản với form dài.

**10. IT Admin** — không có màn Admin (quản user/role/phân quyền, sync HRM) trong app; role phải
sửa DB. *Thiếu:* trang Admin tối thiểu (xem user, gán role, chạy sync). → Vận hành thủ công.

---

## 2. BACKLOG (P0–P4)

Format: **[mã] Tên** — Lý do · Ai dùng · Ảnh hưởng · Effort(S≤2d/M≤1w/L>1w) · Ưu tiên

### P0 — Thiếu là KHÔNG THỂ thay Asana

- **[P0-1] Đính kèm file cho Task/Comment** — Asana dùng cực nhiều; công việc thật luôn kèm
  tài liệu/ảnh. App có sẵn bảng `attachments` (SharePoint) nhưng **chưa có UI upload/xem/tải**.
  · Ai: tất cả · Ảnh hưởng: rất cao · Effort: L · **P0**
- **[P0-2] (Dữ liệu HRM, không phải dev app) work_email @biahalong cho toàn NV** — chỉ 208/706
  login M365 được → phần lớn không vào được app. · Ai: tất cả · Ảnh hưởng: chặn · Effort: HRM ·**P0**
- **[P0-3] (Dữ liệu HRM) điền Trưởng phòng/Giám đốc khối thật** (Department.head/OrgBlock.head)
  → role hiện phần lớn MANUAL_TEST. · Ai: quản lý · Ảnh hưởng: sai phân quyền · Effort: HRM · **P0**
- **[P0-4] Tạo Project từ giao diện** — Project Owner không tự tạo được dự án (chỉ có sẵn qua
  seed/sync). Thay Asana thì phải tạo dự án được. · Ai: PO · Ảnh hưởng: cao · Effort: S · **P0**

### P1 — Thiếu thì dùng được nhưng rất khó chịu

- **[P1-1] @Mention trong comment + thông báo** — kéo đúng người vào việc; hiện comment không
  nhắc được ai. · Ai: tất cả · Ảnh hưởng: cao · Effort: M · **P1**
- **[P1-2] Theo dõi việc (Follow/Watcher) UI** — schema `task_watchers` có sẵn, chưa có nút Theo
  dõi + nhận thông báo. Asana có. · Ai: tất cả · Ảnh hưởng: TB-cao · Effort: S-M · **P1**
- **[P1-3] Nhắc deadline (due-soon/overdue) tự động** — hiện KHÔNG có scheduler → 2 loại thông báo
  này không bao giờ bắn. Người dùng quên hạn. · Ai: tất cả · Ảnh hưởng: cao · Effort: M · **P1**
- **[P1-4] My Tasks: lọc + nhóm + sắp xếp nâng cao** (theo phòng/action/dự án/người giao; nhóm
  theo Action/Project) — hiện chỉ tab + sort hạn. · Ai: NV/TP · Ảnh hưởng: cao · Effort: M · **P1**
- **[P1-5] Search bỏ dấu tiếng Việt** — gõ "huong" phải ra "Hương". Với 706 user, search hiện chỉ
  khớp có dấu/email. · Ai: tất cả · Ảnh hưởng: cao · Effort: S · **P1**
- **[P1-6] Trang Admin tối thiểu** — xem/tìm user, gán role org (TGĐ/GĐ khối/TP), chạy sync HRM,
  vô hiệu user. Không có thì IT phải sửa DB tay. · Ai: IT Admin · Ảnh hưởng: cao · Effort: M · **P1**
- **[P1-7] Quick-add task** (1 dòng, ngay trong list phòng/dự án/My Tasks) — form hiện dài, người
  ít dùng CNTT nản. · Ai: NV/mobile · Ảnh hưởng: cao · Effort: S · **P1**

### P2 — Nâng trải nghiệm rõ rệt

- **[P2-1] Bulk edit** (chọn nhiều task → đổi trạng thái/assignee/deadline/xóa). · TP · cao · M · **P2**
- **[P2-2] Action Log xuất/in (PDF/bản 1 trang) cho họp tác nghiệp** — thay slide tay của BLĐ.
  · GĐ khối/TGĐ · cao · M · **P2**
- **[P2-3] Đính kèm ảnh từ camera trên mobile** — phân xưởng chụp hiện trường. · KT/mobile · TB · S · **P2**
- **[P2-4] Activity timeline gọn/đẹp hơn** (gộp theo ngày, icon rõ) — hiện có nhưng thô. · tất cả · TB · S · **P2**
- **[P2-5] Recurring task** (khóa sổ/chấm công/báo cáo tháng lặp lại) — BHL có việc định kỳ.
  · KT/NS · TB-cao · M · **P2**
- **[P2-6] Bộ lọc + saved view ở trang Phòng/Dự án** (theo section/trạng thái/người). · TP/PO · TB · M · **P2**
- **[P2-7] Trim bootstrap (perf)** — hiện tải 714 user; embed tên vào task payload rồi bỏ list.
  · tất cả (khi scale) · TB · M · **P2**

### P3 — Nice to have

- **[P3-1] Phím tắt cơ bản** (c=tạo, /=search, e=sửa). · power user · thấp · S · **P3**
- **[P3-2] Nhân bản (duplicate) task/checklist template.** · TP · thấp · S · **P3**
- **[P3-3] My Day / "Hôm nay của tôi"** tách khỏi Dashboard. · NV · thấp · S · **P3**
- **[P3-4] Reactions/emoji trên comment.** · tất cả · thấp · S · **P3**
- **[P3-5] Kéo-thả sắp xếp thứ tự task trong list.** · TP · thấp · M · **P3**

### P4 — Future (ngoài V1)

- **[P4-1] Task dependency (chặn/chờ việc khác).** · dự án lớn · M-L · **P4**
- **[P4-2] Timeline/Gantt dự án.** · PO · L · **P4**
- **[P4-3] Email/Teams notification.** · tất cả · M · **P4**
- **[P4-4] KPI evidence + HRM push (A4/A6 — đã có lộ trình riêng).** · quản lý · L · **P4**
- **[P4-5] Báo cáo/biểu đồ nâng cao, OKR.** · BLĐ · L · **P4**

---

## 3. ROADMAP (sprint 2 tuần)

**Sprint 1 — GỠ CHẶN UAT (usable hằng ngày):**
P0-1 Attachments · P0-4 Tạo Project từ UI · P1-5 Search bỏ dấu · P1-3 Nhắc deadline (scheduler tối thiểu)
+ song song (HRM/ops): P0-2 work_email, P0-3 role thật.
→ Kết quả: đăng nhập được, giao việc + đính kèm + không quên hạn.

**Sprint 2 — CỘNG TÁC (đủ giữ chân, bỏ Asana):**
P1-1 @Mention · P1-2 Follow/Watcher · P1-4 My Tasks lọc/nhóm/sort · P1-7 Quick-add · P1-6 Admin tối thiểu.
→ Kết quả: cộng tác + nhập liệu nhanh + IT tự vận hành.

**Sprint 3 — HIỆU SUẤT & LÃNH ĐẠO:**
P2-1 Bulk edit · P2-2 Action Log xuất/in · P2-3 Ảnh từ camera · P2-4 Activity gọn · P2-6 Saved view.
→ Kết quả: quản lý làm việc nhanh + BLĐ họp bằng app.

**Sprint 4 — HOÀN THIỆN V1:**
P2-5 Recurring · P2-7 Trim bootstrap · P3-1 Phím tắt · P3-2 Duplicate/template · P3-3 My Day.
→ Kết quả: V1 hoàn chỉnh, sẵn scale.

**Sau Sprint 1–2** → có thể **bắt đầu A4 KPI song song** (schema đã sẵn), không chặn Sprint 3–4.
**P4** (dependency/Gantt/Teams/OKR) để V2.

---

## 4. GIẢM SỐ CLICK (review Task/Action/Project)

- Tạo task: nút → modal → nhiều trường → tạo. **Giảm:** quick-add 1 dòng (P1-7); form đầy đủ chỉ khi cần.
- Giao chéo phòng: đã tốt (SearchUser). Giữ.
- Action → tạo Task: đã tự điền đơn vị/action (A3.6). Tốt.
- Nghiệm thu: tick/nút trực tiếp. Tốt. **Giảm thêm:** nút Đạt/Trả lại ngay trên bucket "Chờ nghiệm thu" ở Dashboard (P2).
- My Tasks: thêm lọc để bớt cuộn (P1-4).
- Đổi trạng thái Action: qua nhật ký/select — ổn.

---

## 5. TRẢ LỜI 5 CÂU

**① Tắt Asana ngày mai, 50 người dùng app này được chưa?**
CHƯA (đại trà). Chạy được **PILOT 1–2 phòng** có work_email + role thật. Cho 50 người đại trà thì
còn chặn: login (work_email), attachment, nhắc deadline, tạo Project.

**② Nếu chưa — 5 lý do lớn nhất:**
1) Không đính kèm file (P0-1). 2) 498/706 chưa login được do thiếu work_email (P0-2, HRM).
3) Role quản lý phần lớn là giả lập, chưa có head thật (P0-3, HRM). 4) Không nhắc deadline tự động,
dễ quên hạn (P1-3). 5) Không tạo Project từ UI + thiếu @mention/follow → cộng tác yếu (P0-4/P1-1/P1-2).

**③ Nếu chỉ được làm thêm 10 tính năng (đúng thứ tự):**
1. Đính kèm file (P0-1) · 2. work_email toàn NV (P0-2, HRM) · 3. Role head thật (P0-3, HRM) ·
4. Tạo Project từ UI (P0-4) · 5. Search bỏ dấu (P1-5) · 6. Nhắc deadline (P1-3) ·
7. @Mention + notify (P1-1) · 8. Follow/Watcher (P1-2) · 9. My Tasks lọc/nhóm/sort (P1-4) ·
10. Quick-add (P1-7).  *(2–3 là dữ liệu/ops HRM, làm song song không tốn dev.)*

**④ Sau 10 tính năng đó, App đủ V1 chưa?**
ĐỦ V1 để thay Asana đại trà cho BHL. Còn lại (bulk edit, xuất họp, recurring, admin đầy đủ) là
**V1.1** nâng chất, không chặn dùng. Dependency/Gantt/Teams/OKR là V2.

**⑤ Sau backlog này mới được làm KPI + HRM?**
Về kỹ thuật KPI có thể bắt đầu sau **Sprint 1–2** (Task/Action đã STABLE, schema KPI sẵn). Nhưng về
sản phẩm, **nên để adoption Task/Action ổn (hết Sprint 2) rồi mới đẩy KPI/HRM** — vì KPI chỉ đáng tin
khi mọi người đã dùng app thật hằng ngày (dữ liệu nghiệm thu đủ). ⇒ **KPI/HRM chạy song song từ
Sprint 3**, không mở trước khi Task/Action được dùng thật.

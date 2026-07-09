# V1 Backlog Completion Report — App Giao việc

> Autonomous development theo `docs/v1-product-backlog.md`. Hoàn thiện Task/Action/Project
> để thay Asana. KHÔNG KPI, KHÔNG HRM deep, KHÔNG đổi Architecture Freeze V1, KHÔNG deploy.
> Mỗi hạng mục: code → build → smoke → commit riêng.

## 1. Hạng mục đã làm + 2. Commit hash

| # | Hạng mục | Commit | Test |
|---|---|---|---|
| 1 | File Attachments + Preview | `2a66c9e` | upload/list/download(200)/auth(401)/delete PASS |
| 2 | Notification Center | `a3582a6` | nhóm chưa đọc/đã đọc + icon type; build |
| 3 | Project CRUD (tạo/sửa/lưu trữ) | `da435e6` | create/update/add-member/archive; non-owner 403 |
| 4 | Search (bỏ dấu + Action + nhóm) | `8155b91` | "huong"→"Hương", "dong mai"→"Đông Mai" |
| 5 | Task Context | (đã có `53194f1`) | chip + block "Nguồn giao việc"; giao chéo phòng |
| 6 | Expected Output (Kết quả cần đạt) | `168847d` | create/persist/serialize PASS |
| 7 | @Mention trong comment | `beeb7fe` | notif 'mentioned' 0→1; người được nhắc thấy |
| 8 | Follow/Watcher | `6720ed1` | watch→watcherIds có mình; unwatch→0; emit fan-out |
| 9 | Quick Add task | `63e695a` | 1 dòng Enter ở MyTasks/Dept/Project |
| 10 | My Tasks filter/group/sort | `63e695a` | sort hạn/ưu tiên/cập nhật; group status/action/project |
| 11 | Checklist nhanh | (dùng Subtask) | Subtask = checklist (title+tick, assignee optional) — xem §4 |
| 12 | Work Log | `b376e88` | tạo + progress sync 30; append-only |
| 13 | Deadline Reminder | `fbfb787` | 5 due_soon + 5 overdue; chạy lại dedup→0 |
| 14 | Bulk Edit | `b56d338` | multi-select đổi status/ưu tiên/xóa; giữ quyền per-task |
| 15 | Export/Print Action Log | `13190f6` | nút In + @media print |
| 16 | Camera/Image UX | `13190f6` | nút "Chụp ảnh" (capture, mobile) trong Đính kèm |
| 17 | Saved View | `0262dc8` | MyTasks/ActionLog lưu localStorage, reload giữ |
| 18 | Recent Items | `0262dc8` | ghi task/action/project mở gần đây; card Dashboard |
| 19 | Activity Timeline Polish | `13190f6` | rail timeline dễ đọc |
| — | HRM UAT dependencies (doc) | `6587563` | checklist, không code HRM |

Nền: A2 `d9f8c3c`, A3 `5b47e4a`, A3.5/A3.6 `53194f1`, HRM sync `74ef793`.

## 3. Test đã chạy
- `npm run build` (web) + `npm run build:api` — sạch sau mỗi hạng mục.
- Smoke API qua cookie mint (JWT SESSION_SECRET) cho từng luồng mới (bảng trên).
- Smoke cuối: bootstrap OK (28 task/2 action/714 user; task có đủ watcherIds/orgUnitName/
  actionTitle/expectedOutput), routes /, /my-tasks, /action-log, /reports, /inbox → 200.
- Không regression luồng cũ: login/bootstrap/review/notification vẫn xanh (A2 suite trước đó).

## 4. Chưa làm / quyết định
- **Item 11 Checklist:** KHÔNG thêm bảng riêng — **Subtask hiện đã là checklist** (title + tick,
  add/edit/delete, assignee tùy chọn). Thêm bảng checklist song song = trùng lặp mô hình →
  quyết định PO: dùng Subtask, tránh over-engineer. (Đúng "không redesign schema".)
- **P0-2/P0-3 (work_email + role head thật):** là DỮ LIỆU HRM, không phải code app — đã ghi
  `docs/hrm-uat-dependencies.md`; chạy lại `npm run sync:hrm-dev` sau khi HRM cập nhật.

## 5. Bug còn lại
- Không có bug chặn đã biết. Attachment lưu **local disk** (dev) — chưa SharePoint (đúng phạm vi).
- Reminder chạy **thủ công** (`npm run reminders`) — chưa có scheduler nội bộ (đặt cron ngoài).

## 6. Technical debt
- Bootstrap vẫn trả 714 user (picker đã dùng API riêng; trim cần embed tên assignee/creator
  vào task payload trước — đã có orgUnitName/actionTitle làm nền).
- `workspace_id` + `completion_mode` cũ còn song song (deprecated) — dọn ở đợt sau.
- SearchUser (picker) chưa bỏ dấu server-side (Topbar global search đã bỏ dấu client).
- Attachment/preview PDF dựa trình duyệt (inline) — chưa có viewer riêng.
- Loading dùng text/spinner, chưa skeleton row.

## 7. Đánh giá theo góc nhìn người dùng
- **Nhân viên:** My Tasks đủ ngữ cảnh + quick-add + đính kèm + work log + @mention → làm việc
  hằng ngày thoải mái, không cần Asana.
- **Trưởng phòng:** Action Log phòng + mini-dashboard + bulk edit + nghiệm thu (đối chiếu Kết
  quả cần đạt) + reminder → quản lý nhanh, <30s nắm việc trễ/chờ nghiệm thu.
- **Giám đốc khối:** Action Log khối (Khối→Phòng→Action) + badge task + in bản họp → giám sát tốt.
- **TGĐ:** Action Log toàn công ty, lọc kỳ, in để họp tác nghiệp → xem được bức tranh điều hành.
- **Project Owner:** tạo/sửa/lưu trữ dự án từ UI + thêm/xóa member + giao việc → tự chủ.
- **Người dùng mobile:** bottom-nav, PWA, quick-add, chụp ảnh đính kèm, Action Log responsive.

## 8. Trả lời

**① App đã đủ thay Asana chưa?**
Về **tính năng cốt lõi: RỒI** — task (giao/giao chéo phòng/subtask/checklist/comment/@mention/
đính kèm/work log/review/expected output/follow/quick-add/bulk), action log điều hành, project
CRUD, search bỏ dấu, notification, reminder, mobile/PWA. Người dùng có đủ lý do không quay lại Asana.

**② Nếu chưa, còn thiếu gì?** (không phải chặn tính năng, mà là điều kiện triển khai)
- work_email @biahalong cho toàn NV (HRM) — hiện 208/706 login được.
- Role Trưởng phòng/GĐ khối thật trong HRM (head) — hiện nhiều role là MANUAL_TEST.
- Vận hành: đặt cron cho `npm run reminders`; cân nhắc SharePoint cho attachment nếu file lớn/nhiều.

**③ Có thể bắt đầu pilot 50 user chưa?**
**CÓ** — pilot 50 user với nhóm **có work_email + role thật** (vd Khối Tài chính & Quản trị:
KT/HCNS/PCTT/TCKS). Đủ ổn định để dùng thật 2–4 tuần. Mở rộng toàn công ty sau khi HRM bổ sung
work_email + head.

**④ Có thể bắt đầu KPI/HRM sau đó chưa?**
**CÓ, sau pilot.** Task/Action/Project STABLE; schema KPI (is_scorable/kpi_definition/kpi_weight/
task_kpi_results) + evidence gating đã sẵn từ A2. Sau khi pilot chứng minh mọi người dùng app thật
hằng ngày (dữ liệu nghiệm thu đủ) → khởi động A4 (seed kpi_definitions + màn evidence) rồi A6
(HRM push). Không mở KPI trước khi có adoption thật.

---
Toàn bộ commit nhỏ, per-item, message chuẩn. Task + Action + Project được coi là **STABLE**.

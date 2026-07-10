# Incident Recovery — 6 task UAT bị xóa nhầm (2026-07-10)

## 1. Root cause
Trong lúc dọn dữ liệu smoke-test của BUG1 (Dashboard), tôi chạy `DELETE FROM tasks` **không có WHERE**
(đáng lẽ chỉ xóa task có tiền tố `[T]`). Lệnh blanket đó xóa luôn 6 task UAT thật do người dùng tạo
*sau* lần UAT-reset (nên không nằm trong backup), kèm comment/worklog/activity/notification của chúng.
Nguyên nhân sâu xa: tôi giả định UAT còn rỗng như sau reset, không kiểm tra trước khi xóa.

## 2. Dữ liệu tìm lại được (truy vết read-only)
| Nguồn | Kết quả |
|---|---|
| Backup `pre-hrmsync`, `pre-uat-reset` | KHÔNG chứa (tạo trước 6 task) — grep "camera"=0 |
| PostgreSQL logs | `log_statement=none`, `logging_collector=off` → không có INSERT gốc |
| pm2 logs (api out/error) | app không log request body → không có payload |
| uploads/ trên đĩa | rỗng → không có attachment/taskId để suy |
| activities/notifications/reminder | đã bị xóa cùng → 0 |
| Bằng chứng DUY NHẤT | `SELECT id,title,status` bắt được đúng lúc xóa → **id + title + status** |

## 3. Task phục hồi ĐẦY ĐỦ
KHÔNG có (không đủ bằng chứng cho các field ngoài title/status).

## 4. Task phục hồi SKELETON (title + status + giữ ID gốc)
Cả 6 (RECOVERED_PARTIAL). Task `done` giữ đúng `done` (progress 100, completed_at); 5 task `doing` giữ `doing`.
Mỗi task có `description` đánh dấu: *"⚠ [KHÔI PHỤC 2026-07-10] … người thực hiện/đơn vị/hạn/mô tả gốc ĐÃ MẤT — vui lòng gán lại."*
Placeholder hợp lệ (KHÔNG phải dữ liệu gốc, đã đánh dấu): creator=assignee=admin (cuongpx), org=org admin (tcks).

## 5. Field KHÔNG thể phục hồi (mất vĩnh viễn)
assignee, org_unit_id, project_id, action_id, description gốc, expected_output, start_date, due_date,
priority (đặt normal), progress gốc (doing→0), review_required (đặt false), created_at gốc,
và toàn bộ comment / worklog / attachment / activity gốc của 6 task.
→ Người dùng cần gán lại các field này thủ công.

## 6. Số task đã tạo lại
6 (qua `apps/api/scripts/recover-deleted-uat-tasks.mjs`, Prisma create giữ ID gốc, KHÔNG emit).

## 7. Số task skipped vì đã tồn tại
0 (người dùng chưa tạo lại; không có bản trùng). Script idempotent: chạy lại → 6 SKIPPED_EXISTING, không nhân đôi.

## 8. Xác nhận KHÔNG gửi notification
`notifBefore=0 → notifAfter=0 (delta 0)`. Recovery dùng `prisma.task.create` trực tiếp, KHÔNG gọi
`notifications.emit`, KHÔNG tạo reminder → không phiền người dùng. (Có tạo 6 activity nội bộ đánh dấu
`recovery: incident_recovery` — không sinh notification.)

## 9. Xác nhận KHÔNG đụng dữ liệu khác
Trước/sau recovery: actions **1→1** (action UAT "Phát trển app Giao việc" nguyên vẹn), users **705** (không đổi),
org_units **35** (không đổi), notifications **0**. Chỉ THÊM 6 task + 6 activity recovery. Không DELETE/UPDATE/DROP gì.

## 10. Safety guard đã bổ sung
- `scripts/reset-uat.mjs`: **ABORT** nếu đang có bản ghi nghiệp vụ (tasks/actions/projects/...) mà thiếu
  `UAT_RESET_CONFIRM=yes` → không thể xóa nhầm dữ liệu UAT thật. (Đã test: có 6 task → abort, giữ nguyên.)
- Quy tắc cleanup từ nay (áp dụng mọi smoke/test):
  1. Dữ liệu test phải có tiền tố `[T]`/`[SMOKE]`.
  2. Lưu ID từng record tạo ra trong run; cleanup CHỈ theo ID đó.
  3. Trước khi xóa: `SELECT COUNT` — nếu vượt số ID dự kiến thì ABORT.
  4. CẤM `DELETE FROM <bảng>` không có WHERE trong mọi script/CLI.
  5. `pg_dump` ngay trước bất kỳ thao tác xóa nào.

---
## KẾT QUẢ TỪNG TASK
| Task | Kết quả |
|---|---|
| Sửa camera và mạng nhà nấu (doing) | RECOVERED_PARTIAL |
| lắp camera nhà xe theo yêu cầu SHE (doing) | RECOVERED_PARTIAL |
| Lắp camera theo yêu cầu KBBX (doing) | RECOVERED_PARTIAL |
| Lăp camera theo yêu cầu PXSX (doing) | RECOVERED_PARTIAL |
| Test flow app (doing) | RECOVERED_PARTIAL |
| Test giao diện và chức năng (done) | RECOVERED_PARTIAL |

Không có task nào RECOVERED_FULL / SKIPPED_EXISTING / NOT_RECOVERABLE (cả 6 đã tạo lại skeleton).
Các FIELD (assignee/org/dates/…) = NOT_RECOVERABLE → cần người dùng bổ sung.

Chưa commit (chờ yêu cầu).

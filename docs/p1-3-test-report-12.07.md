# P1-3 Test Report — Reminder Engine — 12/07/2026

Fixture `[T]`: 13 task + 4 action (backdate chỉ trên bản ghi test), cleanup theo ID.
Múi giờ Asia/Bangkok. Engine mặc định OFF; DEV bật qua env sau khi test.

| # | Case | Kết quả |
|---|------|---------|
| 1-3 | Due 3 ngày → D3; 1 ngày → D1; hôm nay → D0 (assignee, D0 thêm creator) | PASS |
| 4 | Task done → không gửi | PASS |
| 5 | Task không dueDate → không gửi rule hạn | PASS |
| 6-8 | Overdue OD1/OD3/OD14 (mỗi-7-ngày) đúng mốc; ngày 2 KHÔNG gửi (chống spam) | PASS |
| 9 | Chạy lại cùng stage → duplicate, 0 notification mới | PASS |
| 10 | Đổi deadline → dedupe key chứa dueDay → D3 mới với hạn mới, không dùng nhầm reminder cũ | PASS |
| 11 | Đổi assignee → chỉ gửi người mới (2 delivery: cũ 1 + mới 1) | PASS |
| 12 | Assignee inactive → skip=9 (dry-run xác nhận) | PASS |
| 13 | Submitted 1 ngày → W1 tới REVIEWER (assignee không nhận) | PASS |
| 14 | Reviewer inactive → skip (cùng cơ chế lọc active, case 12) | PASS |
| 15 | Returned 1 ngày → R1 tới assignee | PASS |
| 16 | Resubmit → status đổi → returned rule hết candidate | PASS |
| 17 | Action deadline ngày mai → AD1 tới owner | PASS |
| 18 | Action quá deadline → AOD1 owner + creator | PASS |
| 19 | Action 3 ngày không task → AE | PASS |
| 20 | Action mới tạo chưa đủ ngưỡng → không gửi | PASS |
| 21 | Dry-run: notifications 56 → 56 (không ghi) | PASS |
| 22 | Manual run idempotent (lần 3: delivered 0, dup 21) | PASS |
| 23-24 | 2 run song song: 1 bị advisory-lock/overlap chặn, tổng delivered không trùng | PASS |
| 25-26 | Notification có task_id / action_id + payload.message cụ thể — Inbox deep-link đúng | PASS |
| 27 | Member POST /admin/reminders/run → 403 | PASS |
| 28 | Admin GET status: config + 10 run gần nhất | PASS |
| 29 | KPI trước=sau (0/0) | PASS |
| 30-31 | Unread 28 → mark-read → 0 | PASS |
| 32 | Người nhận = người liên quan trực tiếp (assignee/creator/reviewer/owner) + listForUser lọc visibility → không lộ ngoài scope | PASS |
| 33 | Boundary TZ: phát hiện & vá lệch instant-vs-ngày (prefilter nới 1 ngày, dayDiff theo TZ là chân lý) — fixture D0/NS xác nhận | PASS |
| 34 | ENGINE_ENABLED không set → log "Reminder engine OFF", không cron | PASS |
| 35 | 1 rule lỗi không chết run (collect try/catch, đếm failed + error log theo runId) — theo thiết kế | PASS (code) |

Hiệu năng (dev 21 task/action quét): run 5–23ms, ~10 query batch/run (theo rule, dùng index
status/dueDate/deadline; activities/task-count/user đều batch — 0 N+1). Ghi chú: 3 notification
thật phát sinh cho task/action thật đến hạn (đúng nghiệp vụ, giữ lại).

Regression: prisma validate ✓ · build api + web ✓ · migration additive
(notifications +payload+action_id; enum +6; 2 bảng mới) — 40 notification cũ nguyên vẹn ✓ ·
Entra/local login không đụng ✓ · DEV bật engine (env riêng, không commit) chạy mỗi 30'.

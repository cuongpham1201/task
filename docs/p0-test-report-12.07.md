# P0 Test Report — 12/07/2026

Task 3 chiều + Người nghiệm thu chỉ định + Action↔Task. Test chạy trên DEV (DB giaoviec),
dữ liệu test prefix `[T]`, cleanup theo ID lưu sẵn (đã archive 6 task + 1 project + 1 action,
xóa 6 notification test theo task_id). KHÔNG đụng dữ liệu UAT thật.

| # | Case | Kết quả |
|---|------|---------|
| G1 | Task chỉ phòng ban → departmentId=org, channelId null | PASS |
| G2 | Phòng ban + Project → cả 2 chiều cùng lúc | PASS |
| G3 | Phòng ban + Action | PASS |
| G3b | Action KHÁC đơn vị → 400 | PASS |
| G4 | Đồng thời 3 chiều | PASS |
| G5 | Dashboard phòng ban thấy task (departmentId=orgUnitId) | PASS |
| G6 | View dự án thấy task (channelId=projectId) | PASS |
| G7 | Action detail chứa task gắn action | PASS |
| G8 | Không nhân bản — 1 id duy nhất trong list | PASS |
| G9 | reviewRequired=false không cần reviewer, reviewerId=null | PASS |
| G10 | reviewRequired=true thiếu reviewer → 400 | PASS |
| G11 | Reviewer (member thường) THẤY task mình nghiệm thu | PASS |
| G12 | User không liên quan KHÔNG thấy task KT; không lộ dữ liệu chéo đơn vị | PASS |
| G12b | Không phải reviewer POST /review → 403 | PASS |
| G13 | Reviewer trả lại → status returned | PASS |
| G14 | Người thực hiện nộp lại → submitted, notification tới reviewer | PASS |
| G15 | Reviewer nghiệm thu Đạt → done, progress 100 | PASS |
| G16 | Notification reviewer = 3 (1 chỉ định + 2 lần nộp), không trùng | PASS |
| G17 | Gỡ/gắn lại Project — org + action GIỮ NGUYÊN | PASS |
| G18 | Gỡ Action — project + org GIỮ NGUYÊN | PASS |
| G19 | Backfill: 100% task review_required có reviewer (migration set = creator) | PASS |
| G20 | Gán viewer@KT → thấy task KT; gỡ role → hết thấy (scope tổ chức đúng) | PASS |
| E1 | PATCH bật nghiệm thu thiếu reviewer → 400 | PASS |
| E2 | PATCH tắt nghiệm thu → reviewer bị xóa có chủ đích | PASS |
| E3 | Reviewer inactive (nghỉ việc) → 400 | PASS |

Regression: Entra login 302 ✓ · local login sai pass 401 ✓ · bootstrap user thật (giangdt/TGĐ)
200, permissions + 29 đơn vị đúng scope ✓ · prisma validate ✓ · build api (nest) + web (vite) PASS ✓.

Migration `20260712012159_p0_task_reviewer`: additive (ADD COLUMN reviewer_id + index + FK SET NULL)
+ backfill `reviewer_id = creator_id WHERE review_required` (2 task lúc chạy, 0 lỗi).
Rollback: `ALTER TABLE tasks DROP COLUMN reviewer_id` (không mất dữ liệu khác).

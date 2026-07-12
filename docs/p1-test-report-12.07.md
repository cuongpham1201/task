# P1-1 Test Report — Báo cáo tổng hợp BLĐ — 12/07/2026

Fixture `[T]` đếm tay (9 task KT/MKT + 2 action + 1 dự án, assignee=usertest để cô lập),
cleanup theo ID sau test. Không đụng dữ liệu UAT thật.

| # | Case | Kết quả |
|---|------|---------|
| O1 | Task có cả Project+Action chỉ đếm 1 lần (total=9 đúng) | PASS |
| O2 | Group đúng Task.orgUnitId (KT=8, MKT=1) | PASS |
| O3 | Task không Action = 7 | PASS |
| O4 | Task không Project = 7 | PASS |
| O5 | Chờ nghiệm thu (submitted)=1 | PASS |
| O6 | Returned=1 | PASS |
| O7 | Quá hạn chưa done=1 | PASS |
| O8 | Done-quá-deadline KHÔNG vào overdue hiện tại (vào trend "trễ hạn") | PASS |
| O9 | Action không task: taskTotal=0, withoutTask≥1 | PASS |
| O10 | Action nhiều đơn vị: N/A THEO THIẾT KẾ — server validate task của Action phải cùng đơn vị (P0-1) | N/A |
| O11 | Drill Task khớp summary (all=9, overdue=1) | PASS |
| O12 | Drill Action khớp (AC all=2, overdue=1) | PASS |
| O13 | Drill Phòng ban khớp (KT all=8, done=2) | PASS |
| O14 | Boundary thời gian (hôm nay=9; ngày mai=0) | PASS |
| O15 | Filter Project=2 | PASS |
| O16 | Filter Action=2; action=none=7 | PASS |
| O17 | Filter assignee cô lập đúng | PASS |
| O18 | TGĐ (ceo) scope=35 đơn vị | PASS |
| O19 | GĐ khối scope=6 (khối OFFICE + biên chế), không ngoài khối | PASS |
| O20 | Trưởng đơn vị scope=KT, byOrgUnit chỉ KT | PASS |
| O21 | Member không role → 403; sửa query orgUnitId ngoài quyền → 403 (overview + drill) | PASS |
| O22 | Pagination pageSize=4: total=9 ổn định, page3=1 row | PASS |
| O23 | Empty data (from=ngày mai) trả cấu trúc hợp lệ | PASS |
| O24 | completionRate/overdueRate = số nguyên, total=0 → 0 (không NaN) | PASS |
| O25 | KPI trước=sau: task_kpi_results=0, kpi_definitions=0 — không phát sinh | PASS |

Hiệu năng (dev 27 task/5 action): overview ~10ms · 6.5KB · ~22 query set-based (0 N+1,
0 query-trong-vòng-lặp); drill ~6ms. Index dùng: (orgUnitId,status), (projectId,status),
(actionId), (dueDate), (status), (assigneeId) — KHÔNG cần index/migration mới. Không cache
(khối lượng nhỏ, tránh over-engineer — bổ sung khi dữ liệu lớn).

Regression: Prisma validate ✓ · build api (tsc) ✓ · build web ✓ · /reports/action-log cũ
(trang ActionLog) giữ nguyên ✓ · Entra 302 / local 401 ✓ · smoke DEV web+api 200 ✓.

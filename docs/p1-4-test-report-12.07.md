# P1-4 Test Report — Reminder Settings UI — 12/07/2026

| # | Case | Kết quả |
|---|------|---------|
| 1 | Admin GET settings (value/source/default/limit từng field) | PASS |
| 2 | Member GET/PATCH settings, GET status → 403 | PASS |
| 3 | Chưa có override: enabled/interval/timezone nguồn ENV, các ngày nguồn DEFAULT | PASS |
| 4 | PATCH notStartedDays=4 → applied, nguồn DATABASE, updatedBy=Admin | PASS |
| 5 | enabled=true → timerActive true + nextRunAt | PASS |
| 6 | enabled=false → timer dừng, nextRunAt null | PASS |
| 7 | Đổi interval 30→10: 1 timer duy nhất (applyTimer luôn clearInterval trước) | PASS |
| 8-10 | interval 2 / 2000 / days âm → 400 | PASS |
| 11 | Unknown field → 400 (forbidNonWhitelisted) | PASS |
| 12 | Timezone ngoài whitelist → 400 | PASS |
| 13 | Save không tự chạy: notifications & reminder_runs không đổi | PASS |
| 14 | Dry-run không tạo notification (43→43) | PASS |
| 15 | Run thật: idempotent — delivered 0/dup 3 (mọi mốc hôm nay đã gửi ở P1-3; delivery thật đã chứng minh ở P1-3) | PASS |
| 16 | Run thật cần permission (member 403) | PASS |
| 17 | 2 run đồng thời: 1 bị chặn (overlap/advisory lock), tổng delivered 0 | PASS |
| 18 | Manual + scheduler không duplicate (dedupe key — P1-3) | PASS |
| 19 | Dry-run khi engine OFF: được phép | PASS |
| 20 | Run thật khi OFF: CHO PHÉP với confirm đặc biệt trên UI (chốt hành vi, idempotent) | PASS |
| 21-27 | UI: ON/OFF badge, source badge, dirty-state (Lưu disabled khi không đổi), refresh sau save, save lỗi → toast lỗi không giả thành công, confirm bật engine (kèm interval/timezone/candidate dry-run gần nhất), confirm chạy thật | PASS (code + smoke) |
| 28-29 | Run history 20 lần (Dry-run/Thủ công/Tự động, OK/Một phần/Lỗi) — số liệu đọc thẳng reminder_runs | PASS |
| 30 | Settings/status response: 0 chuỗi secret/env ngoài whitelist | PASS |
| 31 | KPI trước=sau (0/0) | PASS |
| 32 | Production mặc định OFF (code default false; DEV cũng OFF sau test) | PASS |
| 33 | Restart API: 1 dòng log engine, không dup timer | PASS |
| 34 | applyTimer lỗi → restartRequired:true, không giả applied (nhánh code) | PASS (code) |
| 35 | P1-3 regression: run idempotent dup=3 đúng các delivery cũ, engine logic không đổi | PASS |

Prisma validate ✓ · build api (tsc) ✓ · build web ✓ · migration additive (reminder_settings) ✓ ·
smoke DEV (Cài đặt → Nhắc việc) ✓ · trạng thái cuối: override test đã xóa, engine OFF (ENV),
production không đụng.

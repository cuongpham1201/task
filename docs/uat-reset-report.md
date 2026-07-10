# UAT Reset Report — App Giao việc

> Phase UAT-RESET: xóa toàn bộ dữ liệu nghiệp vụ (task/action/project/...) + user MOCK,
> giữ tổ chức/user HRM/role/mapping. KHÔNG đụng HRM, KHÔNG xóa schema/migration, KHÔNG deploy, KHÔNG commit.
> Script: `apps/api/scripts/reset-uat.mjs` (idempotent). Backup: `scratchpad/giaoviec-pre-uat-reset.sql` (276K).

## 1. Số lượng dữ liệu TRƯỚC reset

| Bảng | Trước | | Bảng | Trước |
|---|---|---|---|---|
| users | 714 | | activities | 39 |
| org_units | 35 | | notifications | 26 |
| org_unit_roles | 9 | | attachments | 2 |
| external_user_mappings | 703 | | subtasks | 13 |
| workspaces | 33 (29 org + 4 project) | | comments | 5 |
| actions | 2 | | task_work_logs | 1 |
| action_updates | 3 | | task_reviews | 1 |
| tasks | 29 | | task_kpi_results | 0 |
| kpi_definitions | 0 | | sync_logs | 1 |

**Phân loại (dựa bằng chứng, không đoán):**
- **MOCK:** dữ liệu nghiệp vụ (task/action/project/comment/... — seed t1..t22 + task test từ smoke) + 10 user seed
  (u2–u10, usertest) không có `external_user_mapping`.
- **HRM sync:** 703 user có `external_user_mapping`; 35 org_units (5 khối + 29 phòng có `external_hrm_id`;
  'co' = company root); org_unit_roles HRM_SYNC(2) + MANUAL_TEST(2).
- **UAT thật:** KHÔNG có (UAT chưa bắt đầu) → toàn bộ nghiệp vụ về 0.
- **KHÔNG CHẮC (không xóa, flag):** `admin@biahalong.com` — tài khoản auto-provision (không phải HRM,
  không phải seed id). Đã GIỮ lại, chờ xác nhận (xem §4/§10).

## 2. Đã XÓA (bảng)
notifications, task_kpi_results, activities, comments, task_work_logs, task_reviews,
task_collaborators, task_watchers, subtasks, attachments, action_updates, tasks, actions,
workspace_members, workspaces(type=project), org_unit_roles(của user mock), users(mock).
+ dọn file upload mồ côi trong `apps/api/uploads/`.

## 3. Đã GIỮ (bảng)
users (HRM), org_units, org_unit_roles (HRM_SYNC + MANUAL_TEST), external_user_mappings,
sync_logs, kpi_definitions, workspaces (type=org_unit, 29).

## 4. User còn lại
- **703** user HRM (có `external_user_mapping`) — gồm cuongpx (admin, khớp HRM emp 2036).
- **1** user không mapping được GIỮ CÓ CHỦ ĐÍCH: `admin@biahalong.com` (auto-provision, role member) → flag.
- Tổng: **704 user**.
- **Đã xóa 10 user MOCK:** annv, binhtt, chaulm, dunghd, emvt, huydq, habt, khoanv, lanpt, usertest (@biahalong.com).

## 5. Số user HRM
- 703 user có mapping HRM. (Sync xử lý 706 NV active; **3 NV trùng email** → gộp về cùng user →
  703 user riêng biệt. Đây là đặc thù dữ liệu HRM, không phải lỗi reset.)

## 6. Số user mock đã xóa
10 (danh sách ở §4). Không xóa user HRM nào. Không xóa admin (flag).

## 7. Số org unit
35 = 1 company (root 'co') + 5 khối + 29 phòng/ban (đều từ HRM). Cây tổ chức nguyên vẹn.

## 8. Build
- `npm run build` (web) → OK
- `npm run build:api` → OK

## 9. Smoke test (sau reset + re-sync)
| Kiểm tra | Kết quả |
|---|---|
| 703 HRM user còn | ✅ |
| Không còn user mock (trừ admin@ flag) | ✅ (chỉ admin@biahalong.com) |
| Org tree đúng HRM | ✅ 1+5+29 |
| tasks = 0 | ✅ |
| projects = 0 | ✅ |
| actions = 0 | ✅ |
| notifications = 0 | ✅ |
| reviews = 0 | ✅ |
| activities = 0 | ✅ |
| attachments = 0 | ✅ |
| Login bình thường | ✅ (mint session, bootstrap 200) |
| Bootstrap không lỗi | ✅ (cuongpx/huyentt/hatt1) |
| My Tasks rỗng | ✅ (tasks 0) |
| Action Log rỗng | ✅ (action-log total 0) |
| Empty State đúng | ✅ (Dashboard/My Tasks/Action Log EmptyState hiển thị) |
| Visibility theo role | ✅ admin thấy 29 phòng · GĐ khối OFFICE 5 · NV KT 1 |
| SPA routes | ✅ / /my-tasks /action-log → 200 |

## 10. Kết luận
Database đã **sạch cho UAT**: chỉ còn tổ chức HRM + user HRM + role + mapping; toàn bộ
Action/Project/Task bắt đầu từ **0**. App login + bootstrap + empty state hoạt động đúng.

**Cần xác nhận (1 mục KHÔNG CHẮC, đã giữ lại):**
- `admin@biahalong.com` (auto-provision, không thuộc HRM, role member). Đã GIỮ theo nguyên tắc
  "không chắc → không tự xóa". Nếu muốn xóa (sẽ tự tạo lại khi tài khoản này đăng nhập), báo để xử lý.

Chưa commit (theo yêu cầu). Script `reset-uat.mjs` idempotent — chạy lại chỉ xóa dữ liệu nghiệp vụ
mới phát sinh (nếu có) + user mock mới, không ảnh hưởng dữ liệu HRM.

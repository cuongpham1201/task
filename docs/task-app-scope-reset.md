# Scope Reset — App Giao việc (Task Execution System)

> Ngày: 2026-07-07 · Loại: chốt phạm vi + hướng kiến trúc (không code, không migration, không commit).
> Tài liệu này **chốt** các quyết định còn treo trong `task-app-architecture-review.md` (3 BLOCKER) và **thu hẹp** phạm vi về đúng mục tiêu ban đầu.
> Nguồn chân lý mới cho scope Phase hiện tại. Các docs cũ (`phase3-backend-plan.md`, `m365-admin-guide.md`) đánh dấu **historical**.
>
> **Trạng thái: ĐÃ DUYỆT + đã áp dụng 3 điều chỉnh (2026-07-07). S1 (schema reset) ĐÃ HOÀN THÀNH** — xem §11.

---

## 1. Chốt phạm vi sản phẩm

**App Giao việc = hệ thống thực thi công việc (task execution), thay Asana ở mức nội bộ.** KHÔNG mở rộng thành "Work Hub" lớn ở giai đoạn này.

App làm đúng các việc:
- Nhận việc / giao việc
- Cập nhật tiến độ
- Comment trao đổi
- Theo dõi deadline
- Xem việc theo **cá nhân / phòng ban / project**
- **Nghiệm thu** để lấy dữ liệu tính KPI/OKR bên HRM

**HRM = hệ thống nhân sự & KPI.** Không đụng gì tới vận hành task hằng ngày.

---

## 2. Ranh giới master data (CHỐT)

| Miền | Master | Ghi chú |
|---|---|---|
| Project, Task, Subtask, Comment, Activity, Notification, **Acceptance/nghiệm thu**, tiến độ, deadline | **App Giao việc** | Toàn quyền tạo/sửa/xóa |
| Employee, Department, Position, KPI/OKR, Performance score | **HRM** | App chỉ **đọc** user/department |

Nguyên tắc bất biến:
- App **đọc** user/department từ HRM (qua API, cache vào bảng mapping).
- App **chỉ đẩy task đã nghiệm thu** sang HRM để tính KPI — KHÔNG đẩy task nháp/đang làm.
- **Không dùng chung DB.** **Không ghi trực tiếp DB HRM.**
- Khóa join = **entra_id (↔ HRM ms_oid)**; khóa nghiệp vụ = **emp_code**. Không dùng email làm khóa.

---

## 3. Trả lời 3 BLOCKER trong audit

| BLOCKER (audit §9) | Chốt |
|---|---|
| Master user/dept = HRM hay M365 Graph? | **HRM.** M365/Entra chỉ dùng để **đăng nhập/xác thực danh tính** (đã có). Không kéo department từ Graph. |
| Channel hay Project/Workspace? | **Project.** Đổi `Channel → Project` (chưa có dữ liệu thật, chỉ seed demo → an toàn). Không đổi sang `WorkItem`. |
| Có nghiệm thu trong App + hợp nhất docs? | **Có nghiệm thu** (submitted/returned/done). Tài liệu này là nguồn chân lý scope. |

---

## 4. Mô hình dữ liệu — giữ đơn giản: **Project + Task**

Giữ trục chính **Project → Task → Subtask**. KHÔNG dùng mô hình `WorkItem` rộng.

### 4.1 Đổi thuật ngữ Channel → Project
Hiện tại (`schema.prisma`): `Channel`, `ChannelMember`, `Task.channelId`, `TaskScope = personal/department/channel`.
Đổi thành: `Project`, `ProjectMember`, `Task.projectId`, `TaskScope = personal/department/project`.
- An toàn vì **chưa có dữ liệu thật** (chỉ 3 channel trong seed demo — bỏ được).
- Cập nhật CHECK `chk_scope` tương ứng (project → projectId set, departmentId null; v.v.).

### 4.2 Task lifecycle chuẩn (thêm nghiệm thu) — ĐÃ DUYỆT
```
todo → doing → submitted (chờ nghiệm thu) → done (đã nghiệm thu)
                    │
                    └── returned (trả lại) → doing
```
- `TaskStatus` cuối: **`todo, doing, waiting, submitted, returned, done, paused`** — **GIỮ `waiting`** (theo điều chỉnh của chủ dự án), thêm `submitted`, `returned`.
- **`Task.completionMode` (SELF / REVIEW_REQUIRED)** — phân biệt task tự hoàn thành (assignee đưa thẳng `done`) và task bắt buộc nghiệm thu (phải qua `submitted → done/returned`). Mặc định `SELF`.
- Chỉ khi **`done` + nghiệm thu Đạt** (REVIEW_REQUIRED) mới sinh bản ghi cho `task_kpi_results` (đẩy HRM).

### 4.3 Bản ghi nghiệm thu (TaskReview) — CHỈ ghi nhận nghiệm thu, KHÔNG tính điểm
Điều chỉnh của chủ dự án: **KPI & Rubric thuộc HRM.** App chỉ ghi nhận kết quả nghiệm thu:
- `TaskReview { taskId unique, reviewerId, decision(passed/returned), note, reviewedAt }`.
- **KHÔNG** có `rubricLevel`, **KHÔNG** có `Task.weight`/`isScorable` (đó là việc chấm điểm — thuộc HRM).

→ App đẩy sang HRM **sự kiện "task đã nghiệm thu Đạt"** (định danh + ngày due/completed). **HRM tự chấm rubric/trọng số/điểm KPI** bằng engine của nó (xem `hrm-kpi-analysis-and-api-design.md`).

---

## 5. Bảng tích hợp tối thiểu (chỉ 4 bảng)

Thêm đúng 4 bảng, không hơn:

| Bảng | Vai trò | Trường chính |
|---|---|---|
| `external_user_mappings` | AppUser ↔ HRM Employee | `userId` unique, `entraObjectId` unique, `empCode`, `hrmEmployeeId?`, `syncedAt` |
| `external_department_mappings` | AppDepartment ↔ HRM Department | `departmentId` unique, `hrmEntityCode`, `hrmDeptCode`, `syncedAt` |
| `task_kpi_results` | Feed task đã nghiệm thu để HRM tính KPI (App KHÔNG chấm điểm) | `taskId`, `entraObjectId`, `empCode?`, `dueDate`, `completedAt`, `acceptedAt`, `reviewerEntraId`, `idempotencyKey` unique, `pushStatus`(pending/sent/ack/error) |
| `sync_logs` | Nhật ký đồng bộ (đọc HRM + đẩy KPI) | `direction`(in/out), `entity`, `count`, `status`, `error?`, `startedAt`, `finishedAt` |

**Lưu ý:** KHÔNG cần `external_project_mappings` ở Phase này — **Project là master của App**, không lấy từ HRM.

---

## 6. Notification — chỉ 7 loại

`Notification` thêm trường `type`, phục vụ đúng 7 tình huống:

| # | type | Nguồn |
|---|---|---|
| 1 | `task_assigned` | được giao việc |
| 2 | `comment_added` | comment mới |
| 3 | `mentioned` | được tag trong comment |
| 4 | `due_soon` | gần deadline (job định kỳ) |
| 5 | `overdue` | quá hạn (job định kỳ) |
| 6 | `task_returned` | task bị trả lại |
| 7 | `task_accepted` | task được nghiệm thu |

- Loại 1,2,3,6,7: sinh từ hành động (transaction: mutation → activity → notification).
- Loại 4,5: sinh từ **1 job định kỳ nhỏ** quét deadline (đơn giản, chưa cần `reminder_logs` riêng — dedup bằng cách chỉ tạo 1 lần/ngưỡng, để sau nếu cần).
- Mention (loại 3): parse `@` trong comment ở tầng service — **chưa cần bảng `comment_mentions` riêng** ở Phase này.

---

## 7. Những ý tưởng TẠM DEFER (không làm Phase này)

Ghi rõ để không thiết kế lỡ tay:

- ❌ Mô hình `WorkItem` rộng (piece-rate/khoán như HRM `organization.WorkItem`).
- ❌ "Integration Layer" trừu tượng / adapter đa hệ thống — Phase này chỉ 1 module `integration` gọi HRM.
- ❌ "Business Event Engine" / event bus nội bộ.
- ❌ Meeting / Audit / DMS / 5S / System Event / Work Hub.
- ❌ `external_project_mappings` (Project là App-master).
- ❌ `reminder_logs`, `audit_logs`, `app_settings` (thêm sau nếu cần).
- ❌ Bảng `comment_mentions` riêng (parse inline trước).
- ❌ Teams tab (roadmap sau).
- ❌ OKR/rubric library trong App (thuộc HRM).

---

## 8. Migration/schema tối thiểu tiếp theo (1 migration, làm 1 lần)

Gộp thành **một** migration để không vá vụn:

1. **Rename:** `Channel→Project`, `ChannelMember→ProjectMember`, `Task.channelId→projectId`; enum `TaskScope` `channel→project`; cập nhật CHECK `chk_scope`.
2. **Task lifecycle:** enum `TaskStatus` thêm `submitted`, `returned` (**giữ `waiting`**); thêm enum `CompletionMode(self/review_required)` + `Task.completionMode`.
3. **Nghiệm thu:** thêm bảng `TaskReview` (decision/note — KHÔNG rubric/weight; KPI & rubric thuộc HRM).
4. **Tích hợp (4 bảng):** `external_user_mappings`, `external_department_mappings`, `task_kpi_results`, `sync_logs`.
5. **Notification:** thêm enum `type` (7 loại ở §6).
6. Index bổ sung nếu cần cho filter/report (giữ tối thiểu).

> Giữ nguyên: PK `uuid`/BigInt hiện có; các bảng Subtask/Comment/Activity/Attachment/Collaborator/Watcher. Seed demo (3 channel) chuyển thành 3 project hoặc bỏ.

---

## 9. Lộ trình code tiếp theo (phase nhỏ)

| Phase | Nội dung | Phụ thuộc |
|---|---|---|
| **S0** (không code) | Chủ dự án duyệt scope này | — |
| **S1 — Schema reset** | 1 migration §8 + cập nhật seed | S0 |
| **S2 — Backend write + quyền** | `common/` (ValidationPipe, PolicyGuard, exception filter, logging); write-API: task CRUD + chuyển trạng thái (todo→doing→submitted→done/returned) + comment + subtask + notification (transaction); nghiệm thu (`POST /tasks/:id/review`); PolicyService (admin/manager/member). Chuyển logic controller→service cho projects/departments. | S1 |
| **S3 — Nối frontend, bỏ mock** | TanStack Query; đổi `AppContext` action → API; xóa `data/mock.js`; đổi UI "Channel"→"Project"; quyền UI đọc từ `/me` | S2 |
| **S4 — Tích hợp HRM** | Module `integration`: đọc user/department HRM (cache → `external_*_mappings`); đẩy task nghiệm thu (`task_kpi_results` + `sync_logs`). Cần HRM có API read/ingestion. | S3 + HRM API |

**Nguyên tắc:** App **chạy độc lập hết S3** (không phụ thuộc HRM); S4 mới nối HRM.

---

## 10. Danh sách chốt nhanh (để duyệt)

- ✅ App = task execution; HRM = HR/KPI.
- ✅ Trục dữ liệu: **Project + Task** (không WorkItem).
- ✅ Đổi **Channel → Project**.
- ✅ Nghiệm thu: **submitted / returned / done** + `TaskReview` + `weight`/`isScorable`.
- ✅ Tích hợp: đúng **4 bảng** (user/department mapping, task_kpi_results, sync_logs).
- ✅ Notification: đúng **7 loại**.
- ✅ Đọc user/dept từ **HRM**; đẩy **chỉ task đã nghiệm thu** sang HRM.
- ✅ Không dùng chung DB, không ghi trực tiếp DB HRM.
- ⛔ Defer: WorkItem, Integration Layer, Event Engine, Meeting/Audit/DMS/5S, external_project_mappings, reminder/audit/settings, Teams tab.

---

## Câu hỏi cuối cần chốt trước khi làm S1

1. Enum `TaskStatus`: đồng ý **`todo/doing/submitted/returned/done/paused`** (bỏ `waiting`) chứ?
2. Ai được **nghiệm thu**? (người giao / trưởng phòng / cả hai) — để cấu hình PolicyGuard.
3. Nghiệm thu có bắt buộc chấm **rubricLevel (1–5)** ngay không, hay chỉ Đạt/Trả lại (điểm chất lượng để HRM chấm sau)?
4. Job quét deadline (due_soon/overdue) chạy tần suất nào? (vd mỗi giờ / mỗi sáng)

---

## 11. S1 (Schema reset) — ĐÃ THỰC HIỆN (2026-07-07)

Đã áp dụng trên môi trường dev (DB `giaoviec`), 1 migration `20260707092419_init` (baseline squash, dev disposable). Verify pass.

**Thay đổi schema (`apps/api/prisma/schema.prisma`):**
- Rename `Channel→Project`, `ChannelMember→ProjectMember`, `Task.channelId→projectId`; enum `TaskScope` `channel→project`; CHECK `chk_scope` cập nhật theo `project_id` (đã test chặn scope sai).
- `TaskStatus` = `todo, doing, waiting, submitted, returned, done, paused` (giữ `waiting`).
- Thêm enum `CompletionMode(self/review_required)` + `Task.completionMode` (mặc định `self`).
- Thêm `TaskReview` (decision passed/returned + note; KHÔNG rubric/weight).
- `Notification` thêm `type` (7 loại), `activityId` nullable, `taskId` deep-link; thêm enum `NotificationType`.
- Thêm 4 bảng tích hợp: `external_user_mappings`, `external_department_mappings`, `task_kpi_results`, `sync_logs` (+ enum `SyncDirection`, `PushStatus`). KHÔNG có `external_project_mappings`.
- `ActivityAction` thêm `review`.

**Backend:** đổi module `channels → projects` (`GET /api/v1/projects`); cập nhật `app.module.ts`. `nest build` sạch.
**Seed (`seed.mjs`):** channels→projects (p1–p3), scope/projectId, thêm delete cho bảng mới; 2 task demo `completionMode=review_required`. Seed OK (10 user, 4 dept, 3 project, 28 task).
**Frontend:** CHƯA đụng (vẫn mock + thuật ngữ "channel") — thuộc S3.

**Verify:** migrate+seed OK; `chk_scope` chặn scope sai ✓; `/api/v1/projects` trả p1 ✓; `/api/v1/tasks` ✓; `database: ok` ✓.

**Còn treo cho S2 (không chặn):** Q2 — ai được nghiệm thu (người giao/trưởng phòng/cả hai)?; Q4 — tần suất job quét deadline (due_soon/overdue). Sẽ chốt khi làm PolicyGuard + write API.

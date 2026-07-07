# Architecture Review — App Giao việc (Task Hub) — để chủ dự án duyệt

> Loại: **audit kiến trúc read-only** — không sửa code, không refactor, không migration, không deploy, không restart, không commit.
> Ngày: 2026-07-07 · Repo: `/data/dev/task-app/task` · Đối chiếu HRM: `/data/dev/salary-app`.
> Mọi kết luận dẫn chiếu file cụ thể. Không tìm thấy thì ghi "không tìm thấy".

---

## 1. Executive summary

**Nền tảng SẠCH, KHÔNG cần rewrite lớn.** Repo là npm workspaces monorepo đúng chuẩn, tách frontend/backend rõ, NestJS module gọn, Prisma schema cơ bản tốt, SSO đã chạy. Cảm giác "lằng nhằng" gần đây đến từ **3 thứ, không phải nợ kỹ thuật cấu trúc**:

1. **Đang ở giữa quá trình chuyển tiếp:** auth đã nối API thật (`/me`), nhưng **toàn bộ dữ liệu task/comment vẫn là mock** (frontend), còn **backend mới chỉ có endpoint đọc** → 3 tầng (mock / API thật / thiết kế trong docs) chạy song song.
2. **Hai quyết định kiến trúc chưa chốt** khiến không biết build tiếp theo hướng nào: (a) master của user/phòng ban là **HRM hay M365 Graph**? (b) mô hình dữ liệu giữ **Channel** hay đổi sang **Project/Workspace**?
3. **Docs mâu thuẫn:** kế hoạch cũ (`phase3-backend-plan.md`) định M365-master cho user/dept; audit tích hợp (`hrm-taskhub-integration-audit.md`) chốt HRM-master. Code chưa theo cái nào (chưa có tích hợp).

**Khuyến nghị:** tiếp tục từ code hiện tại. Chốt 3 quyết định (mục 13), rồi build backend theo thứ tự: schema bổ sung → write API + PolicyGuard → nối frontend bỏ mock → tích hợp HRM. **Không rollback.**

---

## 2. Repo structure hiện tại

Monorepo **npm workspaces** đúng chuẩn — `task/package.json:5` (`"workspaces": ["apps/*"]`), script điều phối `dev`/`build`/`dev:api`/`build:api`/`db:migrate`/`db:seed` (`package.json:8-15`).

```
task/
├── package.json            # workspaces + scripts điều phối ✓
├── docker-compose.yml      # postgres dev (creds giaoviec/giaoviec)
├── README.md               # ⚠️ lỗi thời (xem §7)
├── docs/                   # 4 file (xem §7)
├── apps/web/               # React 18 + Vite (SPA)
└── apps/api/               # NestJS 10 + Prisma 6
```

| Câu hỏi | Kết luận |
|---|---|
| Monorepo đúng chưa? | **Đúng** (workspaces, `package.json:5`) |
| FE/BE tách rõ chưa? | **Rõ** — `apps/web` (SPA) vs `apps/api` (NestJS), không lẫn |
| File thừa/lệch đường dẫn? | 1 file lạc: **`/data/dev/task-app/package-lock.json`** (87 byte, NGOÀI repo `task/`) — rác, nên bỏ (P2) |
| Duplicate source? | **Không tìm thấy** |
| Hard-code config? | Cổng có default hard-code trong code (`main.ts`, `authConfig.js`) nhưng **đều override được qua env** — chấp nhận được. `docker-compose.yml:8-10` hard-code creds `giaoviec/giaoviec` **lệch** với DB thật đang dùng (`n8n`) — P1 |
| Code tạm/demo/mock lẫn vào Phase 3? | **Có, nhưng tách lớp sạch:** mock chỉ nằm ở `apps/web/src/data/mock.js` + `store/AppContext.jsx`; backend không dính mock. Vấn đề là FE chưa nối BE (xem §3) |

---

## 3. Frontend audit (`apps/web`)

Cấu trúc: `pages/` (7 trang), `components/{layout,shared,task}`, `store/AppContext.jsx`, `data/{mock,constants}.js`, `utils/{date,activity,permissions}.js`, `auth/` (mới thêm), `api/client.js` (mới thêm). Routing ở `App.jsx:24-31`. State = `useReducer` + Context (`AppContext.jsx:110`).

| Câu hỏi | Kết luận (dẫn chiếu) |
|---|---|
| Còn mock ở đâu? | **Toàn bộ dữ liệu nghiệp vụ** — `AppContext.jsx:3-5` import từ `data/mock.js`; `initialState` nạp mock (`AppContext.jsx:24-37`). Là nguồn dữ liệu DUY NHẤT cho task/subtask/comment/activity/user/dept/channel |
| Đã gọi API thật chưa? | **Chỉ 1 chỗ:** `LoginGate.jsx:19` gọi `apiFetch('/me')`. Grep toàn `apps/web/src`: `apiFetch` chỉ xuất hiện ở `LoginGate.jsx` |
| Vừa mock vừa API? | **Có, nhưng phân lớp rõ:** auth/hồ sơ = API thật; task/comment/... = mock. Không phải trộn hỗn loạn — mock chưa được thay, đúng trạng thái "chưa tới Phase 3 phần data" |
| Permission client còn demo? | **Còn** — `utils/permissions.js` là ma trận client-side; header file ghi rõ phải re-check server-side. Guard trong `AppContext.jsx:123-128` chỉ `console.warn`, không chặn thật |
| Logic nghiệp vụ nằm sai ở FE? | **Có (dự kiến sẽ chuyển):** sinh id/timestamp (`AppContext.jsx:17-22`), chuyển trạng thái + auto complete + sinh activity (`setStatus` `:132-152`), tất cả action creators `:223-353`. Đây là logic phải thuộc backend |
| Component giữ / viết lại? | **Giữ (thuần trình bày):** `components/task/*` (KanbanBoard, TaskTable, CalendarView, TaskDetailPanel, CreateTaskModal), `components/shared/*`, `layout/*`, `utils/date.js`, `utils/activity.js`. **Viết lại tầng data:** `store/AppContext.jsx` (đổi action creators → gọi API), bỏ `data/mock.js`, `utils/permissions.js` (chỉ để ẩn/hiện UI, quyền thật ở server) |
| Nên dùng TanStack Query? | **Nên.** `phase3-backend-plan.md` đã dự kiến. Hiện chưa có (chỉ `fetch` trần trong `api/client.js`). Query giúp cache/refetch/optimistic thay cho reducer thủ công |
| Route/UX lệch vision Task Hub? | Routing hiện: Dashboard, MyTasks, Inbox, Departments/:id, **Channels/:id**, Reports, Settings (`App.jsx:24-31`). "Channel" là cách hiện tại mô hình workspace/dự án — **lệch thuật ngữ** nếu vision chốt là "Project/Workspace" (xem §5, §13) |

**Auth mới thêm (session này):** `auth/AuthProvider.jsx` (login/logout redirect), `auth/LoginGate.jsx` (gate + `/me`), `api/client.js` (fetch kèm cookie). Sạch, nhưng có **1 điểm cần biết:** khi SSO bật mà API không kết nối được, `LoginGate.jsx:29-36` **fallback im lặng về mock** → trông như đã đăng nhập nhưng thực ra là mock (dễ gây nhầm). P1.

---

## 4. Backend audit (`apps/api`)

Module: `auth`, `users`, `tasks`, `channels`, `departments`, `health`, `prisma` (`app.module.ts:9`). NestJS structure chuẩn.

**API hiện có (thật, không placeholder):**

| Method | Path | Nguồn | Ghi/Đọc |
|---|---|---|---|
| GET | `/health` | `health.controller.ts` (ping DB) | đọc |
| GET | `/me` | `users.controller.ts:16` (guard + resolve từ cookie) | đọc |
| GET | `/users`, `/users/:id` | `users.controller.ts` | đọc |
| GET | `/tasks` | `tasks.controller.ts:8` → `tasks.service.ts` | đọc |
| GET | `/channels` | `channels.controller.ts:9` (Prisma trực tiếp) | đọc |
| GET | `/departments` | `departments.controller.ts` (Prisma trực tiếp) | đọc |
| GET | `/auth/login·callback·logout` | `auth.controller.ts` (OAuth server-side) | auth |

| Câu hỏi | Kết luận |
|---|---|
| API nào thật/placeholder? | Tất cả endpoint trên **thật** (đều chạm DB/Entra). Không có placeholder |
| Có endpoint ghi chưa? | **Chưa có endpoint ghi nào** (không POST/PATCH/DELETE cho task/comment/subtask/...) |
| Auth server-side chưa? | **Rồi** — `AuthGuard` (`auth.guard.ts`) xác thực cookie session; luồng OAuth code + secret ở `auth.controller.ts`; chặn domain `@biahalong.com` (`auth.service.ts:isAllowedDomain`) |
| PolicyGuard (phân quyền) chưa? | **Chưa.** Chỉ có xác thực (authentication), **chưa có ủy quyền/role** (authorization). Không tìm thấy role check server-side |
| Transaction cho task update→activity→notification? | **Chưa** (chưa có endpoint ghi) |
| Logic nằm ở controller thay vì service? | **Có ở 2 chỗ:** `channels.controller.ts:9-20` và `departments.controller.ts` query Prisma trực tiếp trong controller (không qua service). `tasks` thì đúng (có `tasks.service.ts`). P1 |
| DTO/validation chưa? | **Chưa** — grep: không có `class-validator`/`class-transformer`/`ValidationPipe`/`useGlobalPipes` (chưa cần vì chưa có input, nhưng phải có TRƯỚC khi làm write API) |
| Thiết kế sync HRM chưa? | **Chưa có code.** Chỉ có comment tham chiếu (`users.service.ts:24,47` nhắc "provisioning do Graph/HRM"). Thiết kế nằm ở docs, chưa hiện thực |

**Thiếu (chuẩn production, chưa có):** global exception filter, request logging/interceptor, pagination/filter, rate limit, Swagger. Chấp nhận được ở giai đoạn này nhưng cần bổ sung khi build write API (P1).

---

## 5. Database / Prisma audit (`apps/api/prisma/schema.prisma`)

12 model: User, Department, Channel, ChannelMember, Task, TaskCollaborator, TaskWatcher, Subtask, Comment, Activity, Notification, Attachment. 1 migration `20260702000000_init`.

| Câu hỏi | Kết luận |
|---|---|
| Còn scope cũ hay workspace model? | **Vẫn scope cũ** — enum `TaskScope = personal/department/channel` (`schema.prisma:23-28`), `Task.scope` (`:155`) + CHECK `chk_scope` trong migration. **Chưa chuyển workspace model** |
| Có project/workspace chưa hay vẫn channel? | **Vẫn `Channel`** (`:122`) + `ChannelMember` (`:137`). **Không có** model Project/Workspace |
| Bảng mapping HRM? | **Không tìm thấy** — không có `external_user_mappings`, `external_department_mappings`, `external_project_mappings` |
| `task_kpi_results`, `sync_logs`? | **Không tìm thấy** |
| Notification/Activity tách đúng? | **Đúng** — `Activity` (`:247`, BigInt autoincrement) và `Notification` (`:263`, fan-out theo user, FK `activityId`) là 2 bảng riêng ✓ |
| `comment_mentions`? | **Không tìm thấy** (Comment chỉ có content/soft-delete, `:231`) |
| `reminder_logs`? | **Không tìm thấy** |
| `audit_logs` / `settings`? | **Không tìm thấy** |
| `source_type`/`source_id` cho Task? | **Không tìm thấy** — Task chưa có trường truy vết nguồn (cần cho sync idempotent) |
| Nghiệm thu (TaskReview) / `weight` / `isScorable`? | **Không tìm thấy** — chưa có tầng nghiệm thu/chấm điểm (dù `hrm-kpi-analysis-and-api-design.md` đã đề xuất) |
| Dùng id tạm t1/u1? | **Không** ở schema — tất cả PK `@default(uuid())` (`:76,108,123,152,216,232,278`); BigInt autoincrement cho Activity/Notification (`:248,264`). Chỉ **seed** (`seed.mjs`) dùng id đọc-được t1/u1 — đây là dữ liệu seed, không phải kiểu id. **Không cần đổi** |
| Constraint chống dữ liệu sai? | **Có mức cơ bản** — CHECK `chk_scope`; unique `entra_id`/`email`/`department.code`; FK `ON DELETE RESTRICT` cho user tham chiếu (không xóa user khi còn task); Cascade cho quan hệ con |
| Index phục vụ filter/report/search? | **Có cơ bản** — `[assigneeId]`, `[departmentId,status]`, `[channelId]`, `[dueDate]` trên Task (`:186-189`); `[taskId,createdAt]` cho comment/activity. **Chưa có** index full-text/search, chưa có index cho report tổng hợp |

**Kết luận DB:** nền tốt cho vận hành nội bộ, nhưng **thiếu toàn bộ tầng tích hợp HRM** (mapping/sync/kpi-result), **thiếu tầng nghiệm thu**, **thiếu source_type/source_id**, và **chưa quyết** channel vs project. Đây là các hạng mục schema phải chốt & thêm trước khi build write API để khỏi migrate lại nhiều lần.

---

## 6. HRM integration audit

| Câu hỏi | Kết luận |
|---|---|
| App đã thêm logic HRM chưa? | **Chưa** — grep `hrm/graph/sync/mapping/kpi/emp_code/ms_oid/salary` trong `apps/api/src`: chỉ ra **comment tham chiếu** (`users.service.ts:24,47`, `auth.types.ts:3`, `entra.config.ts:49`), **không có code tích hợp** |
| Ghi trực tiếp DB HRM không? | **Không** — không có kết nối/DATASOURCE nào tới DB HRM. Đúng ranh giới |
| Đọc HRM qua API chưa? | **Chưa** — HRM cũng chưa có REST API (theo `hrm-taskhub-integration-audit.md`) |
| Mapping entraId/ms_oid/emp_code? | **Chưa có bảng/logic.** Chỉ có `User.entraId` (`schema.prisma:78`) sẵn làm khóa join tương lai |
| Sync log? | **Chưa** |
| Endpoint HRM read-only/ingestion? | **Chưa** (thiết kế ở `hrm-kpi-analysis-and-api-design.md §3`, chưa build) |
| Có kéo department từ M365 thay vì HRM? | **Chưa có code kéo từ đâu cả.** NHƯNG `phase3-backend-plan.md §6` **định** kéo user/dept từ **Graph** — mâu thuẫn với quyết định HRM-master (xem §7). Hiện dept đến từ seed mock |

**Đối chiếu ranh giới đã chốt:** hiện code **chưa vi phạm** ranh giới nào (chưa tích hợp gì). Rủi ro nằm ở **docs mâu thuẫn** → nếu build theo `phase3-backend-plan` sẽ kéo dept từ M365 (sai với HRM-master). Cần chốt trước khi code sync.

---

## 7. Docs consistency audit

| File | Trạng thái | Ghi chú |
|---|---|---|
| `hrm-taskhub-integration-audit.md` | **Nguồn chân lý chiến lược mới nhất** | HRM-master, DB riêng, mapping entra_id/emp_code |
| `hrm-kpi-analysis-and-api-design.md` | **Nguồn chân lý cho KPI + API tích hợp** | Công thức KPI HRM + thiết kế TaskReview/mapping/sync |
| `phase3-backend-plan.md` | **Một phần LỖI THỜI** | ✅ đúng về stack/schema/write-API/PolicyService; ❌ **§6 định kéo user/dept từ M365 Graph** — mâu thuẫn HRM-master; auth mô tả MSAL SPA (đã đổi sang server-side) |
| `m365-admin-guide.md` | **LỖI THỜI phần auth** | Mô tả app registration kiểu **SPA + Expose API scope**; thực tế đã chuyển **Web redirect + client secret** (server-side, giống app văn bản/phê duyệt) |
| `README.md` | **LỖI THỜI** | Ghi "chưa có backend" (`:3`), API cổng **3000** (`:17`, thực tế 4000), liệt kê module thiếu auth/users (`:33`); vision M365-only, không nhắc HRM |
| `product-vision-m365-task-hub.md` | **Không tìm thấy** | Đề bài có nhắc — hiện không tồn tại trong `docs/` |
| SSO server-side (session này) | **Chưa có docs** | Chỉ nằm trong `.env` + code; cần 1 tài liệu auth |

**Mâu thuẫn cốt lõi:** `phase3-backend-plan` (M365-master user/dept) ⟷ `hrm-taskhub-integration-audit` (HRM-master). **Cần hợp nhất** thành 1 tài liệu kiến trúc chính (đề xuất: chính là file review này + 1 "architecture.md" sau khi chốt), và đánh dấu `phase3-backend-plan`/`m365-admin-guide` là "historical".

---

## 8. Build / dev workflow audit

Chạy ở dev, không động production.

| Lệnh | Kết quả |
|---|---|
| `npm run build` (web) | **OK** — vite build sạch (~250KB) |
| `npm run build:api` | **OK** — nest build sạch |
| `npm run dev` (web) | **OK** — vite 5173 (đã cấu hình proxy `/api`→4000) |
| `npm run dev:api` | **OK** — NestJS (đọc `.env`, cổng 4000) |
| `npm run db:migrate` | = `prisma migrate dev` — **đã chạy OK** trên DB `giaoviec` |
| `npm run db:seed` | **OK** — 10 user, 4 dept, 3 channel, 28 task |
| lint / typecheck / test | **Không tìm thấy** script nào (không có ESLint/test trong `package.json`) |

**Lỗi gặp:** ban đầu `/me` lỗi 500 do **thiếu DB** (không phải lỗi code) — đã khắc phục bằng tạo DB + seed. Cổng mặc định 3000/3001 **bị chiếm** bởi open-webui/next-server khác → đã chuyển API sang 4000.

**Script nguy hiểm động production?** **Không** trong repo `task/`. Lưu ý nhỏ: `db:migrate` = `prisma migrate dev` (có thể tạo/sửa migration) — an toàn miễn `DATABASE_URL` trỏ DB dev; production nên dùng `prisma:deploy` (đã có sẵn trong `apps/api/package.json`). `docker-compose.prod.yml` nằm ở **salary-app**, không ở task-app.

---

## 9. Bảng vấn đề cần duyệt

| Mức | Vấn đề | File/vị trí | Ảnh hưởng | Khuyến nghị | Sửa trước khi code tiếp? |
|---|---|---|---|---|---|
| **BLOCKER** | Chưa chốt master user/dept: HRM hay M365 Graph | `phase3-backend-plan.md §6` ⟷ `hrm-taskhub-integration-audit.md` | Quyết định toàn bộ luồng provisioning | Chốt **HRM-master**, Graph chỉ để xác thực danh tính | **Có** |
| **BLOCKER** | Chưa chốt mô hình dữ liệu: Channel (scope) hay Project/Workspace | `schema.prisma:23-28,122` | Đổi sau khi có write-API sẽ tốn migration lớn | Chốt tên + mô hình ngay (xem §13) | **Có** |
| **BLOCKER** | Docs mâu thuẫn, chưa có 1 nguồn chân lý | `docs/*` | Đội build không biết theo tài liệu nào | Hợp nhất thành architecture.md sau khi chốt | **Có** |
| **P0** | Chưa có write API (task/comment/subtask/...) | `apps/api/src/*` | FE không thể bỏ mock | Build write-API theo Task lifecycle (§13.8) | Trước khi nối FE |
| **P0** | Chưa có PolicyGuard/role server-side | `auth.guard.ts` (chỉ authn) | Quyền hiện chỉ ở client (không an toàn) | Thêm PolicyService + guard, port `permissions.js` | Trước khi nối FE |
| **P0** | Chưa có DTO/validation | `apps/api` (không có class-validator) | Write-API không kiểm đầu vào | Thêm class-validator + global ValidationPipe | Cùng lúc write-API |
| **P0** | Thiếu tầng nghiệm thu + mapping/sync/kpi trong schema | `schema.prisma` | Phải migrate lại nhiều lần nếu thêm sau | Thêm TaskReview/weight/isScorable + source_type/source_id + bảng mapping/sync_logs/task_kpi_results **cùng đợt** | Trước khi nối FE |
| **P1** | Logic trong controller (channels/departments) | `channels.controller.ts:9`, `departments.controller.ts` | Khó test/mở rộng | Chuyển sang service | Sprint sau |
| **P1** | LoginGate fallback mock im lặng khi API lỗi | `LoginGate.jsx:29-36` | Nhầm "đã đăng nhập" | Hiện lỗi rõ khi SSO bật mà API chết | Sprint sau |
| **P1** | Docs lỗi thời (README, m365-admin-guide, phase3) | `README.md`, `docs/*` | Gây hiểu sai | Cập nhật/đánh dấu historical | Sprint sau |
| **P1** | Thiếu exception filter/logging/pagination | `apps/api` | Vận hành/quan sát kém | Thêm khi build write-API | Cùng write-API |
| **P1** | docker-compose creds lệch DB thật | `docker-compose.yml:8-10` (giaoviec) vs `.env` (n8n) | Nhầm khi dựng lại | Thống nhất | Sprint sau |
| **P2** | File lạc ngoài repo | `/data/dev/task-app/package-lock.json` | Rác | Xóa | Sau |
| **P2** | `entra.config` load lặp nhiều lần | `auth/*.ts` | Vi mô | Cache config | Sau |

---

## 10. Kiến trúc đề xuất để duyệt

### 10.1 Repo structure (giữ nguyên, đã tốt)
```
task/  (npm workspaces)
├── apps/web   (React SPA)
├── apps/api   (NestJS + Prisma)
└── docs/      (hợp nhất còn 1 architecture.md + các file historical)
```
*(Chưa cần `packages/` chung cho tới khi có type/constant dùng chung FE-BE.)*

### 10.2 Frontend
- Giữ `components/*` + `utils/{date,activity}`.
- Thêm `api/` (client theo domain) + **TanStack Query** cho data-fetching.
- `AppContext` giữ UI state (selectedTask, modal), **bỏ** state dữ liệu (chuyển sang Query cache).
- `permissions.js` chỉ để ẩn/hiện UI; quyền thật ở server.
- Bỏ `data/mock.js` khi write-API sẵn sàng.

### 10.3 Backend module
`auth`(có), `users`, `departments`, `channels|projects`, `tasks`(+review), `comments`, `subtasks`, `activities`, `notifications`, `attachments`, `reports`, **`integration`** (HRM read/ingestion + sync). Mỗi module: controller mỏng → service (logic) → prisma. Thêm `common/` (PolicyGuard, ValidationPipe, exception filter, logging interceptor).

### 10.4 Prisma direction
- **Chốt Channel vs Project** rồi thêm: `Task.source_type/source_id`, `TaskReview`(decision/rubricLevel/weight/reviewer), `Task.weight/isScorable`.
- Thêm bảng tích hợp: `external_user_mappings`, `external_department_mappings`, `external_project_mappings`, `task_kpi_results`, `sync_logs`.
- (Tùy vision) `comment_mentions`, `reminder_logs`, `audit_logs`, `app_settings`.
- Giữ UUID/BigInt như hiện tại (không đổi).

### 10.5 HRM integration boundary
- **HRM master:** employee, department, position, KPI/OKR, review/score. **App master:** task, workspace/project, comment, activity, notification, kanban, attachment.
- App **đọc** master data HRM qua API (cache) → lưu vào bảng mapping. App **đẩy** chỉ task **đã nghiệm thu Đạt** sang HRM (ingestion + `task_kpi_results` + `sync_logs`), **không đẩy** task nháp/đang làm. **Không ghi trực tiếp DB HRM.**
- Khóa join: **entra_id (↔ ms_oid)**; khóa nghiệp vụ: **emp_code**. Không dùng email làm khóa.

### 10.6 Auth/permission
- Giữ SSO server-side hiện tại (Azure AD code + secret + cookie session + domain gate) — đã đúng pattern app văn bản/phê duyệt.
- Thêm **PolicyService** (role admin/manager/member × hành động) + `@Policy()` guard + query scoping (list không trả quá phạm vi).

### 10.7 Notification/activity
- Giữ tách 2 bảng (Activity nguồn sự kiện → fan-out Notification). Mọi mutation nghiệp vụ chạy **transaction**: update → insert Activity → tạo Notification.

### 10.8 Task lifecycle chuẩn (đề xuất)
`todo → doing → (waiting) → submitted(chờ nghiệm thu) → done` · nhánh `returned → doing`. Chỉ khi **done + nghiệm thu Đạt** mới sinh `task_kpi_results` để đẩy HRM. (Cần bổ sung trạng thái submitted/returned nếu chốt có nghiệm thu trong App.)

### 10.9 KPI integration flow
App thu input thô (rubricLevel 1–5, weight, due/completed) → đẩy HRM → HRM tính điểm (0.70·chất lượng + 0.30·đúng hạn) + rollup kỳ + xếp loại → dashboard hiển thị ở HRM. Công thức chỉ ở HRM (xem `hrm-kpi-analysis-and-api-design.md`).

### 10.10 Lộ trình code (phase nhỏ) — xem §11

---

## 11. Lộ trình code tiếp theo

**A0 — Chốt kiến trúc (không code):** duyệt báo cáo này + trả lời §13.

**A1 — Schema hoàn chỉnh (1 migration lớn, làm 1 lần):** chốt Channel/Project → thêm source_type/source_id, TaskReview + weight/isScorable, các bảng mapping/sync_logs/task_kpi_results. → tránh migrate vụn.

**A2 — Backend write + quyền (độc lập HRM):** `common/` (ValidationPipe, PolicyGuard, exception filter, logging) → write-API task/comment/subtask/notification (transaction) → PolicyService. Chuyển logic controller→service cho channels/departments.

**A3 — Nối frontend, bỏ mock:** thêm TanStack Query, đổi AppContext action → API, xóa `data/mock.js`, quyền UI đọc từ `/me`.

**A4 — Tích hợp HRM:** module `integration` (đọc master HRM + ingestion kết quả nghiệm thu), khi HRM đã có API read/ingestion.

---

## 12. Danh sách file đã kiểm tra

**Repo/config:** `task/package.json`, `task/docker-compose.yml`, `task/README.md`, `/data/dev/task-app/package-lock.json`, `apps/api/package.json`, `apps/web/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`, `apps/api/.env(.example)`, `apps/web/.env(.example)`, `apps/web/vite.config.js`.

**Backend:** `apps/api/src/{main.ts, app.module.ts}`, `auth/{auth.controller,auth.guard,auth.service,session.service,entra.config,auth.types,current-user.decorator,auth.module}.ts`, `users/{controller,service,module}.ts`, `tasks/{controller,service,module}.ts`, `channels/*`, `departments/*`, `health/*`, `prisma/*`.

**Prisma:** `apps/api/prisma/schema.prisma`, `migrations/20260702000000_init/migration.sql`, `seed.mjs`.

**Frontend:** `apps/web/src/{main.jsx,App.jsx,styles.css}`, `store/AppContext.jsx`, `data/{mock,constants}.js`, `utils/{date,activity,permissions}.js`, `auth/{authConfig,AuthProvider,LoginGate}.jsx/js`, `api/client.js`, `pages/*`, `components/*` (danh sách đầy đủ trong §2 tree).

**Docs:** `phase3-backend-plan.md`, `m365-admin-guide.md`, `hrm-taskhub-integration-audit.md`, `hrm-kpi-analysis-and-api-design.md`. (`product-vision-m365-task-hub.md`: **không tìm thấy**.)

**Đối chiếu HRM:** `salary-app/webapp/apps/{tasks,employees,organization,accounts,notifications}/models.py` (từ audit trước).

---

## 13. Câu hỏi cần chủ dự án chốt

1. **Master user/phòng ban = HRM hay M365 Graph?** (Khuyến nghị: **HRM**; Graph chỉ để đăng nhập/xác thực danh tính.)
2. **Mô hình dữ liệu: giữ `Channel` hay đổi `Project/Workspace`?** Ảnh hưởng enum scope + đặt tên bảng. (Khuyến nghị: chốt tên ngay; nếu vision là "dự án" thì đổi trước khi có write-API.)
3. **App có bước "nghiệm thu" nội bộ không?** Nếu có → thêm `TaskReview` + `weight`/`isScorable` + trạng thái submitted/returned ngay ở A1. (Khuyến nghị: **có**, để đẩy KPI về HRM.)
4. Có làm **comment @mention / reminder / audit_logs / settings** trong scope gần không? (quyết định thêm bảng ở A1 hay để sau).
5. **Nguồn dashboard KPI cuối** hiển thị ở HRM hay có thêm trên App? (theo `hrm-kpi-analysis...` đề xuất HRM).
6. Có cần **Teams tab** (như app văn bản/phê duyệt) trong roadmap không? (ảnh hưởng cookie SameSite/None + manifest).

---

## Tóm tắt (in ra terminal)

- **Tiếp tục từ code hiện tại?** → **CÓ.** Nền sạch (monorepo chuẩn, Nest module gọn, Prisma base tốt, SSO chạy).
- **Cần rollback/refactor lớn?** → **KHÔNG.** Chỉ cần: chốt 3 quyết định + thêm 1 migration hoàn chỉnh + build write-API/PolicyGuard theo thứ tự. Không có nợ cấu trúc nghiêm trọng.
- **3 việc chốt trước khi build tiếp:**
  1. **Master user/dept = HRM** (Graph chỉ để auth).
  2. **Chốt Channel vs Project/Workspace** (đặt tên + mô hình dữ liệu).
  3. **Chốt có nghiệm thu trong App + hợp nhất docs** thành 1 nguồn chân lý (kèm bổ sung schema tích hợp trong 1 migration).

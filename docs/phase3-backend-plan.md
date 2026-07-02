# Kế hoạch kỹ thuật Phase 3 — Backend app "Giao việc"

> Định hướng chốt: **PostgreSQL là storage chính**. SharePoint (qua Microsoft Graph)
> **chỉ lưu file đính kèm**, không dùng SharePoint List làm database.

## 1. Kiến trúc tổng thể

```
┌──────────────┐   MSAL (OIDC/PKCE)   ┌─────────────┐
│  React SPA   │ ───────────────────► │  Entra ID   │
│  (Vite)      │ ◄─────────────────── │ (M365)      │
└──────┬───────┘   access token       └──────▲──────┘
       │ Bearer JWT                          │ validate JWT (JWKS)
       ▼                                     │
┌──────────────────────────────────────────┴─┐
│              NestJS API (TypeScript)        │
│  AuthGuard → PolicyGuard → Controller       │
│  Services (transaction) → Activity/Notify   │
└───────┬─────────────────────────┬───────────┘
        │ Prisma                  │ Microsoft Graph (Sites.Selected)
        ▼                         ▼
┌───────────────┐        ┌──────────────────────┐
│  PostgreSQL   │        │  SharePoint site      │
│  (nguồn chính │        │  CHỈ file đính kèm    │
│  mọi dữ liệu) │        │  (document library)   │
└───────────────┘        └──────────────────────┘
```

**Stack đề xuất: NestJS + Prisma + PostgreSQL.** Lý do so với Express thuần:
- Guards/Interceptors của NestJS khớp trực tiếp với nhu cầu permission check tập trung.
- Prisma schema là tài liệu sống của data model, migration tự động, type-safe.
- Cấu trúc module (tasks/comments/notifications/attachments) khớp cấu trúc FE hiện tại.
- FE giữ nguyên React/Vite; chỉ thay thân action creators trong `AppContext.jsx` bằng API
  client (khuyến nghị thêm TanStack Query) — kiến trúc reducer thuần từ P0-3 đã chuẩn bị sẵn.

Repo: chuyển thành monorepo `apps/web` (code hiện tại) + `apps/api` (NestJS).

## 2. Schema PostgreSQL

Enums:

```sql
CREATE TYPE user_role      AS ENUM ('admin', 'manager', 'member');
CREATE TYPE task_scope     AS ENUM ('personal', 'department', 'channel');
CREATE TYPE task_status    AS ENUM ('todo', 'doing', 'waiting', 'done', 'paused');
CREATE TYPE task_priority  AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE task_section   AS ENUM ('suvu', 'kehoach', 'hangngay', 'phatsinh');
CREATE TYPE activity_action AS ENUM (
  'create', 'assign', 'status', 'due', 'priority', 'progress',
  'comment', 'complete', 'subtask', 'attachment', 'collaborator'
);
```

Bảng (đầy đủ 12 bảng theo yêu cầu):

```sql
CREATE TABLE departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text NOT NULL UNIQUE,
  color       text,                       -- P1 audit: màu vào data, bỏ hard-code CSS
  manager_id  uuid,                       -- FK thêm sau (vòng với users)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entra_id      text UNIQUE,              -- object id từ Entra ID
  email         text NOT NULL UNIQUE,     -- dùng citext nếu bật extension
  display_name  text NOT NULL,
  department_id uuid REFERENCES departments(id),
  role          user_role NOT NULL DEFAULT 'member',
  job_title     text,
  avatar_url    text,
  active        boolean NOT NULL DEFAULT true,   -- nghỉ việc → false, không xóa
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE departments
  ADD CONSTRAINT fk_departments_manager FOREIGN KEY (manager_id) REFERENCES users(id);

CREATE TABLE channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  owner_id    uuid REFERENCES users(id),
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE channel_members (
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  added_by   uuid REFERENCES users(id),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  scope         task_scope NOT NULL,
  department_id uuid REFERENCES departments(id),
  channel_id    uuid REFERENCES channels(id),
  section       task_section,
  creator_id    uuid NOT NULL REFERENCES users(id),
  assignee_id   uuid NOT NULL REFERENCES users(id),
  status        task_status   NOT NULL DEFAULT 'todo',
  priority      task_priority NOT NULL DEFAULT 'normal',
  start_date    date,
  due_date      date,
  progress      smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  sort_order    double precision NOT NULL DEFAULT 0,  -- thứ tự kéo thả Kanban
  archived      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  completed_by  uuid REFERENCES users(id),
  -- Ràng buộc theo scope: đúng loại thì đúng cột
  CONSTRAINT chk_scope CHECK (
    (scope = 'personal'   AND department_id IS NULL AND channel_id IS NULL) OR
    (scope = 'department' AND department_id IS NOT NULL AND channel_id IS NULL) OR
    (scope = 'channel'    AND channel_id IS NOT NULL AND department_id IS NULL)
  )
);
CREATE INDEX idx_tasks_assignee   ON tasks (assignee_id) WHERE NOT archived;
CREATE INDEX idx_tasks_dept_status ON tasks (department_id, status) WHERE NOT archived;
CREATE INDEX idx_tasks_channel    ON tasks (channel_id) WHERE NOT archived;
CREATE INDEX idx_tasks_due        ON tasks (due_date) WHERE NOT archived AND status <> 'done';

CREATE TABLE task_collaborators (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE task_watchers (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE subtasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title       text NOT NULL,
  done        boolean NOT NULL DEFAULT false,
  assignee_id uuid REFERENCES users(id),
  sort_order  double precision NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subtasks_task ON subtasks (task_id);

CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id),
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  deleted_at timestamptz                      -- soft delete
);
CREATE INDEX idx_comments_task ON comments (task_id, created_at);

CREATE TABLE activities (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id),
  action     activity_action NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}',     -- {from, to, ...} như FE hiện tại
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_task ON activities (task_id, created_at);

-- Notification tách riêng (khác demo hiện suy diễn từ activity):
-- fan-out khi ghi activity, mỗi người nhận 1 dòng, đọc/chưa đọc theo từng dòng
CREATE TABLE notifications (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id bigint NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

-- Metadata file: PostgreSQL. File thật: SharePoint (Graph driveItem)
CREATE TABLE attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by   uuid NOT NULL REFERENCES users(id),
  file_name     text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    bigint NOT NULL,
  drive_id      text NOT NULL,   -- drive của document library
  drive_item_id text NOT NULL,   -- id file trên SharePoint
  web_url       text NOT NULL,   -- link mở trên SharePoint (tham khảo)
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_attachments_task ON attachments (task_id) WHERE deleted_at IS NULL;
```

Ghi chú:
- `due_date`/`start_date` dùng `date` (không giờ) — khớp nghiệp vụ "hạn theo ngày",
  tránh lỗi lệch múi giờ mà FE đang phải né bằng quy ước 17:00.
- Không xóa cứng user; task/comment giữ nguyên khi người nghỉ việc.
- Seed ban đầu convert từ `src/data/mock.js` để demo liền mạch.

## 3. API endpoints

Chuẩn REST, prefix `/api/v1`, tất cả (trừ health) yêu cầu Bearer token.

```
# Auth / profile
GET    /me                          # user hiện tại + role + department
GET    /users?departmentId=&active= # danh sách (lọc theo quyền)

# Departments / Channels
GET    /departments
GET    /departments/:id/tasks?status=&assigneeId=&section=&due=
GET    /channels                    # chỉ channel mình là member (admin: tất cả)
POST   /channels                    # admin
GET    /channels/:id/tasks?...      
POST   /channels/:id/members        # admin/owner
DELETE /channels/:id/members/:userId

# Tasks
GET    /tasks?view=my|today|upcoming|overdue|done&page=&pageSize=
POST   /tasks
GET    /tasks/:id                   # kèm subtasks, collaborators, attachments count
PATCH  /tasks/:id                   # title/description/startDate — field phụ
PATCH  /tasks/:id/status            # {status}
PATCH  /tasks/:id/assignee          # {assigneeId}
PATCH  /tasks/:id/due-date          # {dueDate}
PATCH  /tasks/:id/priority          # {priority}
PATCH  /tasks/:id/progress          # {progress}
PATCH  /tasks/:id/sort-order        # {sortOrder, status} — kéo thả Kanban
DELETE /tasks/:id                   # soft archive

# Subtasks / Comments
POST   /tasks/:id/subtasks          PATCH/DELETE /subtasks/:sid
POST   /tasks/:id/comments          GET /tasks/:id/comments
GET    /tasks/:id/activities

# Notifications
GET    /notifications?unread=true&page=
POST   /notifications/mark-read     # {ids} hoặc {all: true}
GET    /notifications/unread-count  # badge sidebar

# Attachments (file thật ở SharePoint)
POST   /tasks/:id/attachments       # multipart → API đẩy lên Graph → lưu metadata
GET    /tasks/:id/attachments
GET    /attachments/:id/download    # check quyền → trả downloadUrl ngắn hạn từ Graph
DELETE /attachments/:id             # soft delete metadata + xóa driveItem

# Reports
GET    /reports/summary?departmentId=&userId=&from=&to=
GET    /reports/by-department?from=&to=       # admin
GET    /reports/overdue?departmentId=&userId=
```

Mỗi PATCH nghiệp vụ (status/assignee/due/priority/progress) chạy trong **1 transaction**:
cập nhật task → insert activity → fan-out notifications. Đây chính là ánh xạ 1-1 của các
action creators hiện tại (`SET_STATUS`, `ASSIGN_TASK`…) — FE đổi rất ít.

## 4. Permission model

Nguyên tắc: **server là nguồn chân lý** — client chỉ ẩn/disable UI (như hiện tại).
Port nguyên ma trận `src/utils/permissions.js` sang một `PolicyService` duy nhất:

| Hành động | admin | creator | manager (phòng của task) | assignee | collaborator | channel member | khác |
|---|---|---|---|---|---|---|---|
| Xem task | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ (kể cả search) |
| Đổi status/progress/mô tả | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| Đổi assignee/deadline/priority | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Subtask (tick/thêm) | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ |
| Comment | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ |
| Xóa/archive task | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Tạo task phòng ban | ✔ (mọi phòng) | — | ✔ (phòng mình) | — | — | — | ✖ |
| Tạo task channel | ✔ | — | — | — | — | ✔ | ✖ |
| Báo cáo | ✔ toàn bộ | — | ✔ phòng mình | ✔ của mình | — | — | — |
| Quản lý user/phòng/channel | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |

Thực thi 2 lớp trong NestJS:
1. **Guard theo object** — `@Policy('task.updateStatus')` load task, gọi `PolicyService.can(user, action, task)`, trả 403 nếu sai.
2. **Scoping trong query** — mọi danh sách (`GET /tasks`, search, reports) đều có WHERE
   theo visibility của user (admin bỏ qua). Không bao giờ trả về rồi lọc ở client.
   Đây là điểm demo hiện tại chưa làm được (search thấy task người khác).

Role lấy từ bảng `users` (nguồn nội bộ), không tin claims tùy ý từ token; Entra chỉ xác thực danh tính.

## 5. Tích hợp SharePoint (chỉ file)

**Thiết lập:**
- 1 SharePoint site riêng (VD `GiaoViec`) + document library `TaskFiles`; cấu trúc thư mục `/{taskId}/{fileName}`.
- App registration cho backend: quyền application **`Sites.Selected`** trên Graph, admin grant
  đúng site đó (không cấp `Sites.ReadWrite.All` toàn tenant). Backend xác thực bằng client credentials.
- User KHÔNG cần quyền vào site — mọi truy cập file đi qua API để permission check theo task.

**Upload** (`POST /tasks/:id/attachments`):
1. Guard kiểm tra quyền xem/sửa task; validate size (giới hạn VD 50MB) + mime whitelist.
2. ≤ 4MB: `PUT /drives/{driveId}/root:/{taskId}/{fileName}:/content`.
   Lớn hơn: `createUploadSession` upload theo chunk.
3. Nhận `driveItemId`, `webUrl` → insert `attachments` + activity `attachment` + notify — cùng transaction (nếu Graph fail thì không có metadata mồ côi; nếu DB fail thì xóa driveItem đền bù).

**Download** (`GET /attachments/:id/download`):
1. Check quyền xem task → gọi Graph lấy `@microsoft.graph.downloadUrl` (URL ký sẵn, sống ~1h)
2. Trả 302 redirect. Không đưa `webUrl` làm kênh tải chính vì nó đòi user có quyền SharePoint site.

**Delete**: soft delete metadata (`deleted_at`) + `DELETE driveItem` (file vào Recycle Bin của site — khôi phục được 93 ngày).

Antivirus, versioning, retention: dùng sẵn của SharePoint, không phải tự làm.

## 6. Lộ trình triển khai

| Bước | Nội dung | Nghiệm thu |
|---|---|---|
| 0 | Chuẩn bị: tạo App registrations (SPA + API) trên Entra, provision PostgreSQL, chuyển repo thành monorepo `apps/web` + `apps/api` | Đăng nhập MSAL lấy được token; DB kết nối được |
| 1 | Skeleton NestJS + Prisma: schema mục 2, migration, **seed từ mock.js** | `GET /tasks` trả đúng 28 task seed |
| 2 | Auth: validate JWT (JWKS Entra), `GET /me`, job sync user/phòng ban từ Graph `/users` (map `entra_id`, `department`) | Đăng nhập bằng tài khoản @biahalong.com thật, user tự tạo/khớp |
| 3 | Task API core + PolicyService; FE thay action creators trong `AppContext.jsx` bằng API client (TanStack Query), bỏ mock | Toàn bộ flow hiện tại chạy trên DB thật; 5 test phân quyền của P0 pass qua API (403) |
| 4 | Comments + activities + notifications (fan-out, unread-count, mark-read); bỏ suy diễn inbox ở FE | Đổi assignee → người nhận thấy notification riêng, đọc từng item |
| 5 | Reports endpoints (SQL aggregate) + phân trang danh sách | Số liệu khớp màn hình Báo cáo hiện tại |
| 6 | Attachments + SharePoint theo mục 5 | Upload/tải/xóa file trên task, quyền đúng |
| 7 | Hardening & deploy: Docker compose (api + postgres), HTTPS, SPA fallback, backup DB, rate limit, log. Teams tab làm sau cùng | Chạy ổn định môi trường staging |

Thứ tự 3→4→5 giữ app **luôn dùng được** sau mỗi bước (chuyển dần từng nhóm endpoint).

## 7. Quyết định đã chốt / cần chốt

Đã chốt:
- PostgreSQL = nguồn dữ liệu chính; SharePoint chỉ file (không SharePoint List).
- NestJS + Prisma; FE giữ React hiện tại.
- Notification tách bảng riêng, fan-out on write.

Cần chốt trước bước 0:
- Nơi host API + Postgres: Azure (App Service + Azure Database for PostgreSQL) hay server nội bộ?
- Ai là admin tenant M365 để tạo App registration và grant `Sites.Selected`?
- Giới hạn file: dung lượng tối đa, loại file cho phép?

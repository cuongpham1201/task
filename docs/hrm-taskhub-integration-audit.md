# Audit kiến trúc: Kết hợp HRM và App Giao việc (Task Hub)

> Loại tài liệu: **Audit kiến trúc — không sửa code, không migration, không deploy.**
> Ngày: 2026-07-06
> Phạm vi audit source: `/data/dev/salary-app` (HRM, development) và `/data/dev/task-app/task` (App Giao việc, development).
> Nguyên tắc: mọi kết luận đều dẫn chiếu file/dòng cụ thể. Chỗ nào không tìm thấy thì ghi rõ **"không tìm thấy"**, không suy đoán.

---

## 1. Executive summary

**Kết luận ngắn gọn (đọc trước nếu chỉ có 2 phút):**

1. **KHÔNG dùng chung database.** Hai hệ thống dùng hai stack + hai bộ migration hoàn toàn khác nhau (Django ORM/Python vs Prisma/Node). Ép chung một schema → hai công cụ migration ghi đè nhau → vỡ migration. → **Chọn Phương án C: DB riêng + đồng bộ có kiểm soát.**

2. **HRM là master của Nhân sự & Đánh giá:** nhân viên, phòng ban, chức danh, KPI/OKR, rubric nghiệm thu, điểm hiệu suất (`EmployeePeriodScore`). App Giao việc là master của **vận hành công việc hằng ngày:** task, channel/workspace, subtask, comment, activity, notification, attachment, kanban.

3. **Phát hiện quan trọng — chồng lấn lớn:** HRM **đã có sẵn** một module Quản lý Công việc gần như hoàn chỉnh ở tầng dữ liệu (`webapp/apps/tasks/`): Task, Project, Objective (OKR), KeyResult, TaskReview (nghiệm thu + chấm điểm), EmployeePeriodScore, KPIDefinition, QualityRubric, Calibration, Appeal... Đây **không phải** vùng trống — nó trùng chức năng với App Giao việc. Quyết định cốt lõi cần sếp chốt: **App Giao việc thay vai trò "UI vận hành" cho module tasks của HRM, còn HRM giữ vai "engine chấm điểm + KPI".** (Xem §6, §14).

4. **Rào cản kỹ thuật số 1:** HRM **hiện KHÔNG có REST API** cho bên ngoài gọi (không có DRF; xác nhận `requirements.txt:33-34` DRF bị comment, không có `rest_framework` trong `INSTALLED_APPS`). Muốn App Giao việc đọc dữ liệu HRM thì **phải xây một lớp API read-only tối thiểu trong HRM**. Đây là hạng mục bắt buộc của lộ trình.

5. **Khóa mapping:** dùng **M365 Object ID (`entra_id` / `ms_oid`)** làm khóa join chính — cả hai hệ thống đã có sẵn và đều unique, cùng một tenant M365. Dùng **`emp_code`** làm khóa nghiệp vụ bền vững lưu trong bảng mapping. **Không** dùng email làm khóa chính (email đổi được).

6. **App Giao việc KHÔNG được ghi trực tiếp vào DB HRM.** Kết quả task đã nghiệm thu được đẩy về HRM qua **API ingestion + bảng trung gian**, để HRM tự tính KPI/OKR bằng engine sẵn có của nó.

---

## 2. Hiện trạng HRM (`/data/dev/salary-app`)

### 2.1 Stack

| Hạng mục | Kết luận | Dẫn chiếu |
|---|---|---|
| Framework | **Django 5.x** | `requirements.txt:5` (`Django>=5.0,<6.0`) |
| Ngôn ngữ | Python 3.12 | `Dockerfile` (`FROM python:3.12-slim`) |
| Database | **PostgreSQL** (prod, qua `DATABASE_URL`); SQLite chỉ dùng dev/DEBUG | `webapp/config/settings.py:167-183`; nhiều file `db.sqlite3.*` backup ở gốc repo |
| REST API cho bên ngoài | **KHÔNG có** (DRF bị comment) | `requirements.txt:33-34`; `settings.py:85-111` (không có `rest_framework`) |
| Frontend | Django template + Django Admin + portal `/my/` (PWA), **không SPA** | `settings.py:141-159`; `webapp/config/urls.py:62-75` |
| Auth | `django.contrib.auth.User` mặc định (không custom user) + `accounts.UserProfile` (SSO M365/MSAL) | `settings.py:87`, `:260-262`; `accounts/models.py:43-143` |

### 2.2 Model nhân sự / tổ chức (master data HR)

- **`employees.Employee`** — bản ghi nhân viên gốc. `emp_code` **unique** (`employees/models.py:68`); `email` **KHÔNG unique** (`:83`); link tài khoản đăng nhập qua `user = OneToOneField(auth.User)` (`:216-225`). Link phòng ban qua `division`/`sub_unit`, và trường `department` tự suy ra (editable=False) (`:89-110`). Chức danh qua `position` FK (`:112-116`).
- **`organization.Department`** — cây tổ chức 3-4 cấp (DIVISION/SECTION/TEAM), `unique_together (entity, code)` (`organization/models.py:144-313`, unique `:213`). Có `head` (FK Employee) + `deputies` (M2M) để phân quyền (`:197-207`).
- **`organization.Position`** — danh mục chức danh master, `unique_together (division, name)` (`organization/models.py:50-92`).
- **`organization.LegalEntity`** — pháp nhân (Hạ Long/Đông Mai), `code` unique (`:95-112`).
- **`accounts.UserProfile`** — sidecar SSO: `ms_oid` (M365 Object ID) **unique** (`accounts/models.py:66-73`), `ms_upn` (email/UPN M365).

### 2.3 Module Công việc — `webapp/apps/tasks/models.py` (1140 dòng, đầy đủ ở tầng dữ liệu)

| Model | Dòng | Vai trò |
|---|---|---|
| `Objective` | `:43-95` | OKR phân tầng Company→Block→Division→Individual |
| `KeyResult` | `:811-836` | KR thuộc Objective |
| `Project` | `:216-260` | **Có** khái niệm Project (code, department, owner, status) |
| `Task` | `:263-417` | Task lõi: cây `parent`, `project` FK, `goal`(Objective) FK, `assignee`/`assigner`, `weight`, `is_scorable` |
| `TaskReview` | `:489-614` | **Nghiệm thu + chấm điểm**: `task_score = 0.70·quality + 0.30·on_time` (`:600-604`) |
| `QualityRubric`/`Level` | `:420-486` | Rubric chất lượng 1-5 → 0-100 |
| `EmployeePeriodScore` | `:617-803` | Điểm hiệu suất theo kỳ, `unique (employee, period_type, period)` |
| `KPIDefinition` | `:839-861` | Thư viện KPI theo Position |
| `Calibration`/`Appeal`/`CheckIn`/`Kudos` | `:864-1072` | Hiệu chỉnh chéo / phúc khảo / 1-1 / khen thưởng |

**Kanban status của HRM (`Task.status`, `:276-282`):** `NEW / IN_PROGRESS / SUBMITTED (chờ nghiệm thu) / RETURNED / DONE / CANCELLED`.

**Cách tính điểm KPI từ task (chuỗi thực tế trong code):**
1. Mỗi task được nghiệm thu → `TaskReview.task_score = 0.7·quality_score(rubric 1-5) + 0.3·on_time_score` (`tasks/models.py:550-606`).
2. Rollup theo kỳ → `EmployeePeriodScore.weighted_score = Σ(weight·task_score)/Σweight` (mgmt command `rebuild_period_scores.py`).
3. Xếp loại A/B/C/D theo ngưỡng ≥90/≥75/≥60 (`grade_from_score()` `:681-690`).
4. **Chưa nối vào công thức lương** — Phase 1 chỉ lưu điểm tham khảo (`tasks/models.py:13`; `docs/14-Spec-Rubric-va-Cong-Diem-ESS.md`).

### 2.4 Notification, API, tích hợp hiện có

- **`notifications.Notification`** — fan-out mỗi recipient một dòng (`notifications/models.py:21-66`); task gọi `notify.task_status_changed`/`task_assigned` (`tasks/models.py:386-398`).
- **API phục vụ tasks:** chỉ có Django Admin (`tasks/admin.py`, 18 ModelAdmin) + portal `/my/` (`apps/portal/`, session-auth). **KHÔNG có REST API** để bên ngoài đọc. Route `api/` duy nhất là `notifications/api/tom-tat/` (in-app, session).
- **Tích hợp ngoài hiện tại:** HRM chỉ đóng vai **consumer chiều ra** — gọi approval.biahalong.com / vanban.biahalong.com để render widget "Cần xử lý" (`settings.py:283-326`; `apps/portal/integrations.py`). M365 Graph/SharePoint cho upload tài liệu + SSO. → HRM **chưa từng expose API cho ai đọc dữ liệu của nó.**

### 2.5 Điểm yếu cho tích hợp

- `Task`/`Project`/`Objective` có `code` nhưng **`blank=True` và KHÔNG unique** → thiếu khóa nghiệp vụ ổn định cho đồng bộ idempotent (`tasks/models.py:216-260`, `:263-417`).
- Không có model Comment/Attachment gắn Task (activity chỉ có nhờ `simple_history`) — nên UX vận hành hằng ngày còn mỏng so với App Giao việc.

---

## 3. Hiện trạng App Giao việc (`/data/dev/task-app/task`)

### 3.1 Stack

| Hạng mục | Kết luận | Dẫn chiếu |
|---|---|---|
| Backend | **NestJS 10** | `apps/api/package.json:18-20` |
| ORM | **Prisma 6** | `apps/api/package.json:21,29` |
| Database | **PostgreSQL** | `apps/api/prisma/schema.prisma:11` |
| Frontend | React 18 + Vite 6 + react-router 6, state = `useReducer`+Context | `apps/web/package.json`; `apps/web/src/store/AppContext.jsx` |
| Auth | **Chưa có** (dự kiến Entra ID/MSAL) | `docs/phase3-backend-plan.md` §6 |

### 3.2 Prisma schema — 12 model (`apps/api/prisma/schema.prisma`)

`User` (`:75-105`, `entraId` unique, `email` unique, `departmentId`, `role` admin/manager/member), `Department` (`:107-120`, `code` unique, `managerId`, `color`), `Channel` (`:122-135`), `ChannelMember` (`:137-149`), `Task` (`:151-191`), `TaskCollaborator` (`:193-202`), `TaskWatcher` (`:204-213`), `Subtask` (`:215-229`), `Comment` (`:231-245`), `Activity` (`:247-261`), `Notification` (`:263-275`), `Attachment` (`:277-295`, SharePoint/Graph).

**Task (`:151-191`):** `scope` (personal/department/channel), `section` (suvu/kehoach/hangngay/phatsinh), `status` (**todo/doing/waiting/done/paused**), `priority`, `progress`, `sortOrder`, `creator`/`assignee`/`completedBy`. Có CHECK constraint `chk_scope` trong migration (`migrations/20260702000000_init/migration.sql:294-298`).

### 3.3 Phần nào thật / phần nào mock

- **Backend: mới chỉ có 4 endpoint GET read-only** (đều thật, có gọi Prisma): `GET /api/v1/health`, `/tasks`, `/channels`, `/departments`. **Không có auth, không có endpoint ghi (POST/PATCH/DELETE), không có users/comments/subtasks/notifications/attachments/reports.**
- **Frontend: 100% MOCK.** Grep `fetch(`/`axios`/`api/v1`/`VITE_` trong `apps/web/src` → **không có kết quả**. Toàn bộ dữ liệu từ `src/data/mock.js`, mutate in-memory qua reducer (`AppContext.jsx`). Logic quyền nằm client-side (`src/utils/permissions.js`), có ghi chú phải chuyển sang server ở Phase 3.
- **Seed** (`prisma/seed.mjs`): 10 user, 4 phòng ban, 3 channel, 28 task, subtask/comment/activity. **Không seed** watcher/notification/attachment (các bảng này rỗng).

### 3.4 Kế hoạch Phase 3 (theo docs)

- `docs/phase3-backend-plan.md`: **PostgreSQL là single source of truth; SharePoint chỉ chứa file đính kèm.** Auth = Entra ID/MSAL (JWT validate qua JWKS), `role` lấy từ bảng `users` nội bộ (không từ token claim). Kế hoạch có **"Graph `/users` sync job"** map `entra_id` + `department` từ M365.
- `docs/m365-admin-guide.md`: đăng ký app SPA + API, Graph `User.Read.All` để **đồng bộ user/phòng ban từ M365**, SharePoint site `GiaoViec` + `Sites.Selected`.
- **`docs/product-vision-m365-task-hub.md`: KHÔNG tìm thấy** (chỉ có `phase3-backend-plan.md` và `m365-admin-guide.md` trong `docs/`).
- **Tích hợp HRM: KHÔNG tìm thấy bất kỳ nhắc đến HRM/Django nào** trong toàn bộ source + docs của App Giao việc. Seam tích hợp tự nhiên chính là **bảng `users`/`departments` + `entra_id`** — chỗ hiện định kéo từ Graph, có thể thay bằng nguồn HRM.

---

## 4. Bảng so sánh model HRM vs App Giao việc

| Nhóm | HRM (salary-app) | App Giao việc (task-app) | Ghi chú chồng lấn |
|---|---|---|---|
| User/Employee | `Employee` (`emp_code` unique) + `auth.User` + `UserProfile.ms_oid` | `User` (`entraId` unique, `email` unique) | Cùng anchor M365 Object ID |
| Department | `organization.Department` (cây, `(entity,code)` unique, có head/deputies) | `Department` (phẳng, `code` unique, `managerId`) | HRM giàu hơn (phân cấp, pháp nhân) |
| Position/chức danh | `organization.Position` (master) | chỉ `User.jobTitle` (free text) | HRM là master |
| Project | `tasks.Project` (`code` không unique) | **không có** — thay bằng `Channel`/workspace | Khái niệm lệch nhau |
| Channel/Workspace | **không có** | `Channel` + `ChannelMember` | App Giao việc là master |
| Task | `tasks.Task` (cây, weight, is_scorable, project/goal FK) | `Task` (scope/section/sortOrder kanban) | **Chồng lấn nặng** |
| Subtask | `Task.parent` (self-tree) | `Subtask` (bảng riêng, checklist) | Mô hình khác nhau |
| Comment | **không có model** | `Comment` (soft delete) | App Giao việc là master |
| Kanban status | NEW/IN_PROGRESS/SUBMITTED/RETURNED/DONE/CANCELLED | todo/doing/waiting/done/paused | **Cần bảng ánh xạ status** |
| Activity log | qua `simple_history` (implicit) | `Activity` (bảng riêng, enum action) | App Giao việc rõ ràng hơn |
| Notification | `notifications.Notification` (fan-out) | `Notification` (fan-out từ Activity) | Mỗi bên giữ riêng |
| KPI/OKR | `Objective`/`KeyResult`/`KPIDefinition` | **không có** | HRM là master tuyệt đối |
| Score/nghiệm thu | `TaskReview` + `EmployeePeriodScore` + rubric | **không có** | HRM là master tuyệt đối |
| Report/dashboard | Admin + KPI/điểm kỳ | `pages/Reports.jsx` (mock, vận hành) | Tách theo mục đích |
| File attachment | `documents.Attachment` (Graph/SharePoint) | `Attachment` (Graph/SharePoint) | Cùng hướng, khác code |

---

## 5. Chồng lấn và khoảng trống

**Vùng chồng lấn (cùng làm một việc → phải phân vai để tránh ghi loạn):**
- Task, Subtask, Kanban status, Project↔Channel, Activity, Notification, Attachment, Report.

**HRM có mà App Giao việc thiếu (App nên ĐỌC, không tự dựng):**
- OKR/KPI (`Objective`/`KeyResult`/`KPIDefinition`), nghiệm thu chấm điểm (`TaskReview`), điểm hiệu suất kỳ (`EmployeePeriodScore`), rubric, Calibration/Appeal, cây phòng ban đa cấp + pháp nhân, danh mục chức danh (`Position`).

**App Giao việc có mà HRM thiếu (App nên là master):**
- Comment gắn task, Activity log dạng bảng có cấu trúc, Channel/workspace + membership, kanban sortOrder (drag-drop), UX Asana hằng ngày, Attachment gắn trực tiếp task.

**Khoảng trống chung (cả hai đều chưa có / còn yếu):**
- HRM **chưa có REST API** để chia sẻ dữ liệu (bắt buộc phải xây).
- App Giao việc **chưa có auth, chưa có API ghi, frontend chưa nối backend**.
- Cả hai `Task`/`Project` phía HRM **thiếu khóa unique** cho sync idempotent.

---

## 6. Đề xuất ranh giới trách nhiệm (đã kiểm chứng bằng source)

Khuynh hướng ban đầu của đề bài **được xác nhận đúng** — với một bổ sung quan trọng: HRM đã có sẵn engine chấm điểm gắn chặt với `Task`/`TaskReview` của chính nó, nên đường đồng bộ phải "đổ" kết quả vào đúng engine đó.

| Miền dữ liệu | Master | Bên còn lại | Chiều đồng bộ |
|---|---|---|---|
| Nhân viên, phòng ban, chức danh, pháp nhân | **HRM** (`Employee`/`Department`/`Position`) | App đọc read-only | HRM → App (1 chiều) |
| KPI/OKR, rubric, điểm hiệu suất | **HRM** (`Objective`/`EmployeePeriodScore`/`TaskReview`) | App đọc để hiển thị | HRM → App (1 chiều, hiển thị) |
| Task/subtask/comment/activity/kanban/notification/attachment vận hành | **App Giao việc** | HRM không cần biết task nháp | nội bộ App |
| Channel/workspace + membership | **App Giao việc** | — | nội bộ App |
| Project (danh mục KPI) | **HRM** nếu là project tính KPI | App đọc danh mục, tự quản member/kanban | HRM → App (danh mục), App → HRM (kết quả) |
| **Kết quả task đã nghiệm thu** | ghi ở App, **tính điểm ở HRM** | — | App → HRM (1 chiều, có kiểm soát) |

**Nguyên tắc bất biến:** không app nào ghi vào bảng nghiệp vụ của app kia. Chỉ trao đổi qua **API + bảng trung gian**, một chiều rõ ràng cho mỗi loại dữ liệu (tránh đồng bộ 2 chiều gây vòng lặp).

---

## 7. So sánh 3 phương án database

### Phương án A — Dùng chung DB HRM
- **Ưu:** không cần đồng bộ; join trực tiếp user/dept/task; một nguồn sự thật duy nhất.
- **Nhược:** **hai ORM + hai bộ migration trên một schema** (Django migrations vs Prisma migrations) → xung đột nghiêm trọng; App Giao việc (Node) khó dùng model Django; khác quy ước bảng (Django `id` bigint vs Prisma text-UUID).
- **Rủi ro:** Prisma `migrate` có thể drop/alter bảng Django và ngược lại → **vỡ toàn bộ HRM production**. Quyền/khóa/lock chồng chéo.
- **Khi nào nên dùng:** chỉ khi hai app cùng một stack/ORM và cùng team migration. **Không đúng với hiện trạng → loại.**

### Phương án B — App DB riêng, đọc HRM qua API/read-only view
- **Ưu:** tách biệt sạch; HRM an toàn; App tự do tiến hóa schema.
- **Nhược:** **HRM hiện chưa có API** (`requirements.txt:33-34`) → phải xây; đọc realtime phụ thuộc HRM online.
- **Rủi ro:** nếu App query trực tiếp DB HRM (read-only view) sẽ tạo coupling schema + tải lên DB HRM production; nếu qua API thì phải bảo đảm uptime + phân trang.
- **Khi nào nên dùng:** khi dữ liệu HRM cần luôn tươi và HRM đã có API ổn định. **Tốt, nhưng thiếu phần đẩy KPI về.**

### Phương án C — DB riêng + event/API đồng bộ KPI về HRM (KHUYẾN NGHỊ)
- **Ưu:** tách biệt hoàn toàn; HRM master HR/KPI, App master vận hành; đồng bộ một chiều rõ ràng theo từng miền; chịu lỗi tốt (cache + retry qua `sync_logs`).
- **Nhược:** cần xây lớp API read (trong HRM) + API ingestion (trong HRM) + job/bảng mapping ở App; dữ liệu có độ trễ (eventual consistency).
- **Rủi ro:** lệch dữ liệu nếu job sync lỗi (giảm thiểu bằng `sync_logs` + reconcile định kỳ); cần idempotency key vì HRM `Task`/`Project` chưa unique.
- **Khuyến nghị cuối cùng:** **Chọn C.** Đọc master data HR→App theo lịch/cache; đẩy kết quả nghiệm thu App→HRM qua API ingestion + bảng trung gian để HRM tự chạy engine `TaskReview`/`EmployeePeriodScore`.

**Trả lời trực tiếp các câu hỏi bắt buộc:**
- **App có nên ghi trực tiếp DB HRM?** → **Không.** Khác ORM/migration, sẽ vỡ migration HRM.
- **Cần API/view nào từ HRM?** → (đọc) `GET /employees`, `GET /departments`, `GET /positions`, `GET /projects`, `GET /okr`, `GET /period-scores`; (ghi) `POST /task-results` (ingestion). Xem §9.
- **Đồng bộ KPI bằng gì?** → **API ingestion + bảng trung gian `task_kpi_results`**, xử lý bởi **scheduled job** phía HRM (tái dùng cơ chế `rebuild_period_scores.py`). Không cho App ghi thẳng bảng điểm.
- **Có cần dùng chung `employee_id` không?** → Không dùng chung PK nội bộ. Dùng **bảng mapping** với khóa join là **M365 Object ID**, lưu kèm `emp_code`.
- **Email hay employee_code làm khóa mapping?** → **M365 Object ID (`entra_id`/`ms_oid`) làm khóa join chính**, **`emp_code` làm khóa nghiệp vụ bền**. **Email chỉ là fallback hiển thị** (email đổi được, HRM email cũng không unique — `employees/models.py:83`).

---

## 8. Khuyến nghị kiến trúc cuối cùng

```
        ┌────────────────────────────┐         ┌─────────────────────────────┐
        │   HRM (Django, Postgres)   │         │  App Giao việc (Nest/Prisma) │
        │  MASTER: nhân sự, phòng ban│         │  MASTER: task, channel,      │
        │  chức danh, KPI/OKR, điểm  │         │  comment, activity, kanban,  │
        │  hiệu suất, nghiệm thu     │         │  notification, attachment    │
        └────────────┬───────────────┘         └───────────────┬─────────────┘
                     │                                          │
   (1) READ master (job/cache, 1 chiều)  ───────────────────►  │  external_*_mappings
                     │                                          │
   (2) INGEST kết quả nghiệm thu (API + task_kpi_results) ◄──── │  App → HRM
                     │                                          │
        ┌────────────┴───────────────┐                         │
        │ M365 / Entra ID (tenant chung)  ◄── SSO cho cả 2 app │
        │ Object ID = khóa join       │                         │
        └────────────────────────────┘                         │
                     │                                          │
        SharePoint (file) ◄── cả 2 app upload qua Graph, site riêng
```

- **Identity chung:** cả hai đăng nhập bằng **cùng tenant M365**. HRM đã có `UserProfile.ms_oid` (`accounts/models.py:66`), App đã có `User.entraId` (`schema.prisma:78`) → khóa join tự nhiên.
- **HRM** bổ sung lớp API read-only tối thiểu (DRF hoặc plain Django JSON view) + 1 endpoint ingestion.
- **App Giao việc** hoàn thiện Phase 3 như kế hoạch, nhưng **thay nguồn user/department**: thay vì sync từ Graph, ưu tiên **sync từ HRM** (HRM mới là master HR, Graph chỉ là danh bạ M365).

---

## 9. Mapping dữ liệu đề xuất (đặt ở phía App Giao việc)

Các bảng mapping nằm **trong DB App Giao việc** (App là bên phụ thuộc, HRM không cần biết):

```prisma
// external_user_mappings
model ExternalUserMapping {
  id            String   @id @default(uuid())
  userId        String   @unique          // FK -> users.id (App)
  entraObjectId String   @unique          // khóa join chính (== HRM UserProfile.ms_oid)
  empCode       String?  @unique          // khóa nghiệp vụ bền (HRM Employee.emp_code)
  hrmEmployeeId Int?                       // id nội bộ HRM (tham chiếu, không phải khóa)
  emailSnapshot String?                    // chỉ để đối chiếu, KHÔNG dùng làm khóa
  syncedAt      DateTime
}
// external_department_mappings: appDeptId <-> hrmDeptId + (entity,code)
// external_project_mappings:    appChannelOrProjectId <-> hrmProjectId
// task_kpi_results: kết quả nghiệm thu App đẩy về HRM
model TaskKpiResult {
  id            String   @id @default(uuid())
  appTaskId     String                     // task trong App
  entraObjectId String                     // ai được chấm
  empCode       String?
  qualityLevel  Int?                        // rubric 1-5 (khớp HRM QualityRubricLevel)
  onTimeScore   Float?                      // 0-100
  taskScore     Float?                      // nếu App tự tính; hoặc để HRM tính
  acceptedAt    DateTime
  reviewerEntraId String
  idempotencyKey String @unique             // tránh double-count khi retry
  pushStatus    String                      // PENDING/SENT/ACK/ERROR
}
// sync_logs: direction, entity, count, status, error, startedAt/finishedAt
```

**Mapping tối thiểu bắt buộc:**
- `AppUser.entraId` ↔ `HRM UserProfile.ms_oid` → `Employee` (qua `UserProfile.user` → `Employee.user`, `accounts/models.py:52` + `employees/models.py:216`).
- `AppDepartment.code` ↔ `HRM Department.(entity,code)` (`organization/models.py:213`).
- `AppChannel/Project` ↔ `HRM tasks.Project` (chỉ khi cần tính KPI theo project).
- `AppTaskResult` ↔ HRM `TaskReview`/`EmployeePeriodScore` (qua ingestion, HRM tự tạo `Task`+`TaskReview` rồi rollup).

---

## 10. Luồng nghiệp vụ tích hợp

**Luồng 1 — Login & lấy hồ sơ:** User login App bằng M365 (MSAL) → App có `entra_id` từ token → tra `external_user_mappings` → nếu chưa có, gọi HRM API `GET /employees?ms_oid=...` để lấy `emp_code`, phòng ban, chức danh, role → tạo/cập nhật mapping. Role vận hành (admin/manager/member) do App quản; role/chức danh HR do HRM cung cấp.

**Luồng 2 — Tạo task vận hành:** Tạo task trong App → giao người nhận (theo `entra_id`) → comment/kanban/subtask/attachment hoàn toàn trong App. **HRM KHÔNG biết task nháp/đang làm** → tránh KPI bị tính sai khi chưa nghiệm thu.

**Luồng 3 — Nghiệm thu & đóng task (mấu chốt KPI):** Task xong → người giao/manager nghiệm thu trong App → App ghi `task_kpi_results` (qualityLevel rubric 1-5, onTime, evidence, idempotencyKey) → **push sang HRM API `POST /task-results`** → HRM tạo `Task`+`TaskReview` (hoặc cập nhật) → job HRM chạy `rebuild_period_scores` → `EmployeePeriodScore` cập nhật → KPI/OKR phản ánh. Chỉ **task đã nghiệm thu (PASSED)** mới được đẩy.

**Luồng 4 — Project:** Nếu project thuộc diện tính KPI, App đọc danh mục project từ HRM (`GET /projects`); App tự quản member/kanban/execution; kết quả tổng hợp trả về HRM theo Luồng 3.

**Luồng 5 — Báo cáo lãnh đạo:** HRM = nơi hiển thị KPI/OKR/điểm hiệu suất tổng hợp (đã có sẵn). App = dashboard vận hành task/project realtime. Nếu cần một dashboard tổng hợp duy nhất, **đề xuất đặt tại HRM** (vì HRM giữ dữ liệu KPI + có sẵn quyền quản trị), lấy thêm số liệu vận hành từ App qua API.

---

## 11. Rủi ro và biện pháp giảm thiểu

| Rủi ro | Biện pháp |
|---|---|
| Trùng task giữa HRM và App | Chốt App là UI vận hành duy nhất; HRM chỉ nhận task **đã nghiệm thu**. Đóng băng việc tạo task vận hành trực tiếp trong HRM admin/portal. |
| KPI tính sai khi task chưa nghiệm thu | Chỉ push khi `decision=PASSED`; HRM không nhận task nháp (Luồng 2). |
| Lệch phòng ban giữa HRM/M365/App | **HRM là master phòng ban**, không phải Graph. App sync từ HRM; Graph chỉ dùng cho SSO. |
| Ghi trực tiếp DB gây vỡ migration | Cấm App ghi DB HRM. Chỉ qua API. (Xác nhận hai bộ migration độc lập: Django `employees/migrations` 30 file, Prisma 1 migration init.) |
| Hai app permission khác nhau | Tách rõ: role HR (HRM) vs role vận hành (App). Không đồng bộ ma trận quyền; mỗi bên tự enforce. |
| Email đổi làm hỏng khóa | **Không dùng email làm khóa.** Dùng `entra_id`; `emp_code` dự phòng; email chỉ hiển thị. |
| `emp_code` chưa chuẩn | `emp_code` đã `unique` trong HRM (`employees/models.py:68`) — ổn làm khóa nghiệp vụ. Vẫn ưu tiên `entra_id` khi runtime. |
| Đồng bộ 2 chiều gây vòng lặp | Mỗi miền chỉ **1 chiều**: master data HR→App, kết quả nghiệm thu App→HRM. Không có bảng nào 2 chiều. |
| Query trực tiếp DB HRM chậm/tải cao | Không query trực tiếp. Đọc qua API + **cache** ở App (giống cơ chế cache 5 phút HRM đang dùng, `apps/portal/integrations.py`). |
| HRM `Task`/`Project` không unique code | Dùng `idempotencyKey` từ App làm khóa chống double-count; HRM lưu `source`+external id (đã có sẵn trường `Task.source`, `tasks/models.py:343-350`). |

---

## 12. Lộ trình triển khai Phase H1–H4 (ít rủi ro nhất)

**H1 — Nền tảng identity & đọc master data (không đụng KPI):**
- HRM: xây API read-only tối thiểu `GET /api/ext/employees|departments|positions` (auth app-to-app token, giống mẫu Bearer đã dùng ở `settings.py:283-326`).
- App: hoàn thiện Phase 3 auth (MSAL) + bảng `external_user_mappings`/`external_department_mappings`; sync user/phòng ban từ HRM thay vì Graph.
- Kết quả: App có danh bạ + phòng ban chuẩn từ HRM, chưa động tới KPI.

**H2 — Vận hành đầy đủ trong App (độc lập HRM):**
- App: hiện thực hết API ghi Phase 3 (task CRUD, comment, subtask, activity, notification, attachment), bỏ mock, nối frontend↔backend.
- HRM: giữ nguyên, không thay đổi.

**H3 — Đẩy kết quả nghiệm thu về HRM (KPI):**
- HRM: endpoint `POST /api/ext/task-results` (ingestion) + tái dùng `TaskReview`/`rebuild_period_scores`.
- App: bảng `task_kpi_results` + job push có `idempotencyKey` + `sync_logs`.
- Bật cho 1 phòng ban thí điểm trước; reconcile số liệu KPI thủ công vài kỳ.

**H4 — Hợp nhất báo cáo & đóng băng chồng lấn:**
- Đóng băng tạo task vận hành trong HRM (chỉ còn nhận kết quả từ App).
- Dashboard tổng hợp KPI (HRM) + vận hành (App) tại HRM.
- Đọc OKR/period-score từ HRM để hiển thị trong App (read-only).

---

## 13. Danh sách file/model/API đã kiểm tra

**HRM (`/data/dev/salary-app`):**
- `requirements.txt`, `Dockerfile`, `webapp/config/settings.py`, `webapp/config/urls.py`
- `webapp/apps/accounts/models.py` (UserProfile, ms_oid)
- `webapp/apps/employees/models.py` (Employee, emp_code, user OneToOne, employee_for_user)
- `webapp/apps/organization/models.py` (Department, Position, LegalEntity, OrgBlock, WorkItem)
- `webapp/apps/tasks/models.py` (Objective, KeyResult, Project, Task, TaskReview, EmployeePeriodScore, KPIDefinition, QualityRubric, Calibration, Appeal, CheckIn, Kudos), `tasks/admin.py`, `tasks/permissions.py`, `tasks/management/commands/*`
- `webapp/apps/notifications/models.py`, `apps/portal/` (urls/views/integrations)
- `docs/14-Spec-Rubric-va-Cong-Diem-ESS.md`, `docs/15-Tich-hop-...md`
- **Không tìm thấy:** `rest_framework`/DRF viewsets/serializers first-party; REST API cho bên ngoài đọc.

**App Giao việc (`/data/dev/task-app/task`):**
- `apps/api/package.json`, `prisma/schema.prisma`, `prisma/migrations/20260702000000_init/migration.sql`, `prisma/seed.mjs`
- `apps/api/src/main.ts`, `app.module.ts`, `tasks/*`, `channels/*`, `departments/*`, `health/*`, `prisma/*`
- `apps/web/package.json`, `vite.config.js`, `src/data/mock.js`, `src/store/AppContext.jsx`, `src/utils/permissions.js`, `src/pages/*`, `src/components/*`
- `docs/phase3-backend-plan.md`, `docs/m365-admin-guide.md`
- **Không tìm thấy:** `docs/product-vision-m365-task-hub.md`; bất kỳ nhắc đến HRM/Django; endpoint ghi; frontend gọi API thật.

---

## 14. Câu hỏi cần xác nhận với sếp/admin

1. **Chồng lấn module tasks:** HRM đã có module Quản lý Công việc gần hoàn chỉnh. Xác nhận định hướng: **App Giao việc là UI vận hành duy nhất, HRM giữ engine KPI/nghiệm thu** — và **đóng băng** việc dùng module tasks HRM để tạo task vận hành? (Nếu để cả hai cùng tạo task → chắc chắn trùng + KPI sai.)
2. **Ai là tenant admin M365?** Cần để cấp app registration/quyền Graph cho cả hai app (theo `docs/m365-admin-guide.md` còn bỏ trống).
3. **HRM có được phép bổ sung lớp API read-only + ingestion không?** Đây là điều kiện bắt buộc; hiện HRM chưa có API. Ai sở hữu/deploy HRM production?
4. **Nguồn phòng ban chuẩn là HRM hay M365?** (Khuyến nghị: HRM.) Ảnh hưởng luồng sync.
5. **KPI có gắn lương không, và khi nào?** Hiện HRM để điểm ở mức tham khảo (`tasks/models.py:13`). Nếu App đẩy kết quả về mà HRM bật gắn lương thì cần kiểm soát chất lượng dữ liệu chặt hơn.
6. **Project:** danh mục project tính KPI lấy từ HRM `tasks.Project`, hay App tự định nghĩa channel rồi map? (HRM `Project.code` chưa unique — cần chuẩn hóa nếu chọn HRM làm nguồn.)
7. **Rubric/thang điểm:** App có cần thu thập `rubric_level` (1-5) đúng chuẩn HRM tại bước nghiệm thu không, hay chỉ đẩy điểm cuối để HRM tự chấm?

---

## Phụ lục — Trả lời 5 câu hỏi cuối

**1. HRM là master của:** nhân viên (`Employee`/`emp_code`), phòng ban (`Department`), chức danh (`Position`), pháp nhân (`LegalEntity`), KPI/OKR (`Objective`/`KeyResult`/`KPIDefinition`), rubric & nghiệm thu (`QualityRubric`/`TaskReview`), điểm hiệu suất (`EmployeePeriodScore`), Calibration/Appeal.

**2. App Giao việc là master của:** task vận hành, channel/workspace + membership, subtask, comment, activity log, kanban (status + sortOrder), notification, attachment, dashboard vận hành realtime.

**3. Dùng chung DB?** **Không.** Vì hai stack + hai bộ migration độc lập (Django vs Prisma) trên cùng schema sẽ vỡ migration và đe dọa HRM production. Dùng **DB riêng + đồng bộ Phương án C**. Phần "dùng chung" duy nhất là **danh tính M365** (Object ID) làm khóa join, không phải chung bảng.

**4. Module HRM có thể tái sử dụng (giảm thời gian build App):**

| Module | HRM đã có | App đã có | Nên dùng lại | Nên viết mới | Ghi chú |
|---|---|---|---|---|---|
| Authentication | M365/MSAL (session) | chưa (dự kiến MSAL/JWT) | Tái dùng **cấu hình tenant/app registration M365** | Code auth riêng (khác stack) | Không tái dùng được code, tái dùng danh tính |
| User | ✅ `Employee` master | ✅ `User` (mock) | **Dùng làm master, App đọc** | mapping layer | Khóa `entra_id`+`emp_code` |
| Department | ✅ cây đa cấp | ✅ phẳng | **Dùng làm master, App đọc** | — | HRM giàu hơn |
| Position/chức danh | ✅ `Position` | ❌ | **Dùng làm master, App đọc** | — | |
| Permission | ✅ (Django/scope theo head) | ✅ client-side matrix | Không tái dùng (khác stack) | **Viết mới ở App** (PolicyService) | Mỗi bên tự enforce |
| Project | ✅ `tasks.Project` | ❌ (có Channel) | Dùng danh mục nếu tính KPI | Channel là mới của App | Cần chuẩn hóa code unique |
| Task | ✅ đầy đủ | ✅ (mock) | Không dùng làm UI | **App là master vận hành** | HRM chỉ nhận kết quả |
| Comment | ❌ | ✅ | — | **App viết mới** | |
| Activity | qua simple_history | ✅ bảng riêng | — | **App viết mới** | |
| Notification | ✅ | ✅ (derived) | Không tái dùng (khác stack) | **App viết mới** | |
| KPI | ✅ `KPIDefinition` | ❌ | **Dùng lại toàn bộ** | Không | Không rebuild ở App |
| OKR | ✅ `Objective`/`KeyResult` | ❌ | **Dùng lại toàn bộ** | Không | App chỉ đọc hiển thị |
| Nghiệm thu | ✅ `TaskReview`+rubric | ❌ | **Dùng lại engine chấm điểm** | App chỉ thu input + push | |
| Điểm hiệu suất | ✅ `EmployeePeriodScore` | ❌ | **Dùng lại toàn bộ** | Không | |
| Dashboard | ✅ KPI/HR | ✅ vận hành | Tách mục đích | Mỗi bên giữ riêng | Tổng hợp đặt ở HRM |
| File Attachment | ✅ Graph/SharePoint | ✅ Graph/SharePoint | Tái dùng **cách tiếp cận SharePoint** | Code riêng | Site/library riêng |
| Report | ✅ | ✅ (mock) | Tách mục đích | — | |
| Search | Django admin | client-side | — | **App viết mới** | |
| Audit Log | ✅ simple_history | ✅ Activity | — | Mỗi bên giữ riêng | |

**5. Kiến trúc tổng thể tối ưu:** Hai hệ thống độc lập DB, cùng danh tính M365. **HRM = system of record cho nhân sự + KPI/OKR/nghiệm thu** (bổ sung lớp API read + ingestion). **App Giao việc = system of engagement cho vận hành công việc hằng ngày** (hoàn thiện Phase 3, đọc master data từ HRM, đẩy kết quả nghiệm thu về HRM để HRM tính KPI). Đồng bộ một chiều theo từng miền qua API + bảng mapping + `sync_logs`, khóa join = M365 Object ID, khóa nghiệp vụ = `emp_code`. Không app nào ghi vào bảng nghiệp vụ của app kia.

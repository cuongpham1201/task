# Audit kiến trúc: Action + Task + Project + KPI evidence

> Phạm vi: **chỉ audit + đề xuất**. Không code, không migration, không sync HRM, không đụng HRM prod.
> Ngày: 2026-07 · App: /data/dev/task-app · HRM master: nhân sự/phòng ban/khối/pháp nhân/KPI definition.
> Giữ scope ĐÚNG 3 lớp: **Action (quản lý) · Task (thực thi) · KPI evidence (cho HRM)**. Không phình thành Work Hub/PMO.

---

## 1. Executive summary

Hiện trạng: **Task gắn với đúng MỘT `workspace_id`** (org_unit | project | null=cá nhân). Toàn bộ visibility và permission suy ra từ workspace này. Đây là mô hình một-trục loại trừ: một task **không thể vừa thuộc phòng ban vừa thuộc project**.

Mô hình sản phẩm đã chốt cần Task có **nhiều chiều độc lập**: `org_unit_id` (bắt buộc, ai chịu trách nhiệm) + `project_id` (nullable, bối cảnh cộng tác) + `action_id` (nullable, thuộc cam kết quản lý nào). Ngoài ra cần lớp **Action Log** (chưa có) và **KPI evidence** đầy đủ (mới có phôi thai, chưa đúng).

**5 điểm lệch lớn:**
1. Không có `org_unit_id` độc lập trên Task — org unit chỉ có khi task thuộc workspace org_unit; task project/cá nhân **không có đơn vị chịu trách nhiệm**.
2. `project_id` và org_unit **loại trừ nhau** (cùng là `workspace_id`), không song song được.
3. **Không có Action / Action Log** (không model, không API, không UI, không role TGĐ).
4. **KPI chưa đúng**: `task_kpi_results` đã tồn tại nhưng (a) sinh cho **mọi** task được nghiệm thu — không gate theo `is_scorable`; (b) thiếu `kpi_definition_id`, `weight`, `quality_score`, `on_time`; (c) không có bảng `kpi_definitions` cache; (d) Task không có cờ `is_scorable`/`kpi_weight`.
5. **Không có báo cáo/Action Log cấp công ty** (Reports.jsx tính client-side từ bootstrap; không có API tổng hợp; FE chỉ có role admin/manager/member, **không có CEO/TGĐ**).

**Khuyến nghị:** thêm 3 chiều tường minh cho Task + bảng `actions` + `kpi_definitions` cache + nâng cấp `task_kpi_results`, làm **KPI evidence local-first trước**, **HRM sync để sau cùng (A6)**. Migration additive, không phá dữ liệu.

---

## 1.5. ⚠️ ĐỐI CHIẾU VỚI QUYẾT ĐỊNH ĐÃ DUYỆT — mô hình mới ĐẢO 2 điểm

Rà 6 doc cũ cho thấy **`docs/task-app-scope-reset.md` (07-07, ĐÃ DUYỆT, đã thực thi)** là nguồn chân lý gần nhất. Mô hình bạn vừa chốt trong yêu cầu này **đảo ngược 2 quyết định đã duyệt** — cần bạn xác nhận có chủ đích trước khi code:

**Đảo #1 — Chiều dữ liệu của Task (gộp → tách):**
- Đã duyệt (`org-workspace-visibility-design.md`): **cố ý GỘP** department + project vào **một `workspace_id` duy nhất** (task chỉ mang workspace_id). Đây chính là lý do code hiện tại một-trục loại trừ.
- Mô hình mới: **TÁCH** thành `org_unit_id` (bắt buộc) + `project_id` (nullable) + `action_id` (nullable) song song.
- → Đề xuất §5–§8 của báo cáo này đi **ngược** hướng gộp đã duyệt. Hợp lý vì mô hình mới cần task vừa-phòng-vừa-project và cần Action — nhưng **phải chốt là đổi quyết định** (Q9 §13).

**Đảo #2 — Độ "dày" của KPI trong App (mỏng → dày):**
- Đã duyệt (`task-app-scope-reset.md`): App **KHÔNG** lưu `is_scorable`, `weight`, rubric/`quality_score`. KPI & Rubric là của HRM. `TaskReview` chỉ `{decision, note}`. `task_kpi_results` **chỉ** gồm định danh + due/completed/accepted + idempotency + pushStatus (đúng bằng schema hiện tại). App chỉ đẩy **sự kiện "task Đạt"**, HRM tự chấm rubric/trọng số. Công thức HRM đã có: `task_score = 0.70×quality + 0.30×on_time`, rollup theo `weight`, `MIN_SCORABLE_WEIGHT=2`.
- Mô hình mới: App **lưu** `is_scorable`, `kpi_definition_id`, `kpi_weight`; `task_kpi_results` thêm `weight/quality_score/on_time`; App sinh KPI evidence "dày" hơn.
- → Đề xuất §5.2/§5.4/§9 theo mô hình mới, nhưng đây là **thay đổi quyết định scope-reset** (Q5, Q9 §13). Rủi ro: nếu App vừa giữ weight/quality vừa để HRM chấm rubric → **hai nơi giữ trọng số/điểm**, dễ lệch. Cần chốt ranh giới: App chỉ giữ `kpi_definition_id + kpi_weight` (ánh xạ), **HRM vẫn chấm quality_score**? hay App chấm luôn quality?

**Không đảo (khớp với đã duyệt):** Org tree HRM-master; visibility scope server-side; Project là App-master; push 1 chiều App→HRM với idempotency + pushStatus + sync_logs; local-first (nghiệm thu ghi local trước, HRM sync ở A6); giữ scope "thay Asana", không phình Work Hub (danh sách DEFER của scope-reset vẫn giữ).

> Kết luận mục này: Action Log là vùng **mới hoàn toàn** (không đè thiết kế cũ). Nhưng **tách chiều Task** và **KPI dày** là **đảo quyết định đã duyệt** — báo cáo giữ nguyên đề xuất theo mô hình mới của bạn, và đánh dấu 2 điểm này ở §13 để bạn xác nhận chính thức.

---

## 2. Code hiện tại đang quản lý Task như thế nào

**Schema (`apps/api/prisma/schema.prisma`):**
- `Task.workspaceId` nullable → `Workspace`. `Workspace.type ∈ {org_unit, project}`.
  - org_unit workspace: có `orgUnitId` (1-1 với OrgUnit).
  - project workspace: có `ownerId` + `WorkspaceMember[]`.
  - `workspaceId = null` → việc cá nhân.
- Task **không** có: `orgUnitId`, `projectId`, `actionId`, `is_scorable`, `kpiDefinitionId`, `kpiWeight`, `acceptedAt`. Có `completionMode ∈ {self, review_required}` (đây là "review_required").
- `TaskReview`: `decision ∈ {passed, returned}`, `note`, `reviewedAt`. Không có quality_score/evidence.
- `TaskKpiResult` (đã có): `taskId (String, KHÔNG có relation)`, `entraObjectId`, `empCode`, `dueDate`, `completedAt`, `acceptedAt`, `reviewerEntraId`, `idempotencyKey`, `pushStatus`. Hướng **push HRM**, không có kpi_definition/weight/quality.

**Backend:**
- `VisibilityService.taskWhere(me)` (`common/visibility.service.ts:85`): `OR[ creator, assignee, collaborator, watcher, workspaceId ∈ visibleWorkspaceIds ]`. `visibleWorkspaceIds` = workspace org_unit của các org visible (theo cây + org_unit_roles scope self/children) ∪ project mà mình là member.
- `PolicyService` (`common/policy.service.ts`): tất cả quyền suy từ `managesWorkspace` = (project owner/manager) HOẶC (managed org unit qua org_unit_roles ≠ viewer).
- `TasksService` (`tasks/tasks.service.ts`): create nhận `workspaceId`; serialize map workspace → `{scope, departmentId, channelId}` cho FE. Review passed → `taskKpiResult.upsert(pending)` **nếu assignee có entraId** — chạy cho **mọi** task passed (dòng 144-157).
- `BootstrapController` trả toàn bộ dữ liệu FE (tasks đã scope, departments, blocks, channels=project, users, notifications). **Không có** API actions/reports/kpi.
- **Không có module** `actions`, `reports`, `kpi` (đã xác nhận).

**Frontend (agent xác nhận):**
- Task shape: `scope ∈ {personal, department, channel}` + `departmentId`/`channelId` + `workspaceId` + field chuẩn (assignee, collaborators, status, priority, progress, dates, `completionMode`).
- CreateTaskModal: chọn **1 trong 3** loại (radio) — phòng ban HOẶC dự án HOẶC cá nhân, **loại trừ nhau**. Có: assignee, collaborators, "Cần nghiệm thu". **Chưa có**: đơn vị độc lập, action, tính KPI, kpi definition, weight.
- Review UI: Nộp nghiệm thu / Đạt / Trả lại (+note qua prompt). **Không sinh KPI evidence**, không điểm số, không upload evidence.
- Menu: Trang chủ, Việc của tôi, Thông báo, **Báo cáo**, Phòng ban, Dự án, Cài đặt. **Không có Action Log**. Không có role/màn TGĐ. Reports.jsx tính client-side.

---

## 3. Điểm lệch với mô hình đã chốt

| Hạng mục | Kỳ vọng đã chốt | Code hiện tại | Đạt? | File liên quan | Ghi chú |
|---|---|---|---|---|---|
| Org Unit tree | Công ty→Khối→Phòng, HRM master | OrgUnit + parentId + type + legalEntity + source=HRM | ✅ | schema.prisma:181 | Đủ. Chưa sync HRM thật |
| Workspace visibility | Server scope, không lọc FE | VisibilityService.taskWhere/visibleWorkspaceIds | ✅ | visibility.service.ts | Chắc, đã hardening ORG-1.5 |
| Project private/member | Owner add/remove member | Workspace type=project + WorkspaceMember | ✅ | projects.controller.ts | Đã có (UAT Polish) |
| **Task org_unit bắt buộc** | `org_unit_id NOT NULL` | Chỉ gián tiếp qua workspace; project/cá nhân **không có** org unit | ❌ | schema.prisma:258 | **Lệch cốt lõi** |
| **Task project nullable** | `project_id` song song org_unit | project & org_unit **loại trừ** (chung workspace_id) | ❌ | tasks.service.ts:36 | **Lệch cốt lõi** |
| **Task action nullable** | `action_id` | Không tồn tại | ❌ | — | Thiếu hẳn |
| **Action Log** | Bảng + API + UI | Không có (chỉ "activity" audit log — khác) | ❌ | — | Thiếu hẳn lớp quản lý |
| Action visibility cty/khối/phòng | TGĐ xem toàn cty | Không có action; không có role CEO ở FE | ❌ | constants.js:32 | Cần role + API report |
| Task review | Submit → Đạt/Trả lại | completionMode + submit + review passed/returned | ✅ | tasks.service.ts:118 | Đủ ở mức cơ bản |
| **Task tính KPI** | is_scorable + review bắt buộc | Không có cờ is_scorable; review không ràng | ❌ | task.dto.ts | Thiếu |
| KPI definition từ HRM | Cache/read-only ở App | Không có bảng | ❌ | — | Thiếu |
| **Task KPI result/evidence** | Sinh khi accepted, đủ field | Có bảng nhưng sinh cho MỌI task passed, thiếu field | ⚠️ | tasks.service.ts:144 | Có phôi, chưa đúng |
| Notification | Có | NotificationsService, scope theo visibility | ✅ | notifications.service.ts | Đủ |
| Permission server-side | Có | PolicyService | ✅ | policy.service.ts | Đủ, nhưng bám workspace |
| UI dashboard NV/QL/TGĐ | 3 tầng | NV + QL trong 1 trang; **không có TGĐ** | ⚠️ | Dashboard.jsx | Thiếu Action Log/TGĐ |
| Search | Có | Topbar client search (task/dự án/phòng/người) | ✅ | Topbar.jsx | Đủ |
| Mobile/PWA | Có | MobileNav + PWA | ✅ | — | Đủ |

---

## 4. Đề xuất mô hình Action + Task + Project + Org Unit

Bốn khái niệm, trách nhiệm rạch ròi:

```
OrgUnit (HRM master)  ── "ai CHỊU TRÁCH NHIỆM"
   └─ Action (App master, thuộc 1 OrgUnit)  ── "CAM KẾT/MỤC TIÊU quản lý", có owner/deadline/status/progress
         └─ Task (App master)  ── "ĐƠN VỊ THỰC THI", giao cho người làm
                ├─ org_unit_id   NOT NULL  (đơn vị chịu trách nhiệm — bắt buộc với task nghiệp vụ)
                ├─ action_id     nullable  (thuộc cam kết nào)
                └─ project_id    nullable  (bối cảnh cộng tác cắt ngang)

Project (App master)  ── "KHÔNG GIAN CỘNG TÁC cắt ngang phòng ban", owner + members. KHÔNG quyết định KPI.
```

Nguyên tắc:
- **Action không giao cho nhân viên**; chỉ **Task** mới có assignee thực thi. Action tổng hợp tiến độ từ các Task (hoặc nhập tay).
- **Org Unit quyết định trách nhiệm & KPI**; **Project chỉ là bối cảnh** (không tính KPI).
- Task có thể: độc lập (chỉ org_unit) · thuộc Action · thuộc Project · thuộc cả Action + Project.
- **Chỉ Task** sinh KPI evidence, và chỉ khi `is_scorable = true`.

---

## 5. Đề xuất schema (tối thiểu, additive)

Ký hiệu: 🆕 bảng mới · ➕ cột thêm · ✏️ sửa · (HRM) master ở HRM.

### 5.1. Giữ nguyên
`org_units`(HRM cache), `users`(HRM cache), `org_unit_roles`, `comments`, `subtasks`, `activities`, `notifications`, `task_collaborators`, `task_watchers`, `attachments`.

### 5.2. `tasks` ➕ cột
```
+ org_unit_id        String   NOT NULL   (FK org_units)     -- xem Rủi ro §12 về task cá nhân
+ project_id         String?  (FK projects/workspace type=project)
+ action_id          String?  (FK actions)
+ is_scorable        Boolean  @default(false)
+ kpi_definition_id  String?  (FK kpi_definitions_cache)     -- hoặc external_kpi_definition_id
+ kpi_weight         Float?
+ accepted_at        DateTime?                               -- tách khỏi completed_at
  (giữ: completion_mode self/review_required  ≡ review_required)
```
Chỉ mục: `@@index([org_unit_id, status])`, `@@index([action_id])`, `@@index([project_id, status])`.

### 5.3. 🆕 `actions`
```
id, title, description,
org_unit_id  NOT NULL (FK),
owner_id     (FK users),
deadline     Date?,
status       (todo/doing/done/paused...),
priority,
progress_mode  enum(manual | auto_from_tasks) @default(manual),
progress     Int @default(0),
period       String?   -- vd '2026-07' (theo tháng/kỳ)
created_by, archived, created_at, updated_at
@@index([org_unit_id, period])
```

### 5.4. ✏️ `task_kpi_results` (nâng cấp bảng đã có)
```
+ org_unit_id, kpi_definition_id, kpi_weight, review_result(accepted/returned),
+ quality_score Int?, on_time Boolean?, reviewed_by, reviewed_at,
+ external_hrm_id String?  (khi đã push)
  (giữ: entra_object_id, emp_code, due_date, completed_at, accepted_at,
        idempotency_key, push_status)
  ➕ relation task_id → tasks (hiện đang là String rời)
```

### 5.5. 🆕 `kpi_definitions` (cache HRM, read-only)
```
id, external_hrm_id UNIQUE, org_unit_id, name, unit, default_weight?,
period_type?, active, synced_at, source='HRM'
```
Đến A6 mới sync thật; A4 có thể seed tạm vài definition local để test.

### 5.6. Quyết định về Project (2 lựa chọn — cần chốt §13)
- **P1 (ít migration, đề xuất cho A1):** giữ `workspace(type=project)` làm "project" hiện tại; `project_members = workspace_members`. Task tham chiếu `project_id = workspace.id`. **Bỏ dùng** `workspace(type=org_unit)` cho việc scope (thay bằng `task.org_unit_id`). Sau này có thể đổi tên bảng.
- **P2 (sạch):** tách bảng `projects` + `project_members` riêng, bỏ hẳn `workspaces`. Migration nặng hơn.

---

## 6. Đề xuất API

**Actions**
- `GET /actions?scope=my-org|block|company&period=` — scope server theo quyền
- `POST /actions` · `PATCH /actions/:id` · `POST /actions/:id/archive`
- `GET /actions/:id/tasks`

**Tasks** (bổ sung tham số/field)
- `POST /tasks` (thêm org_unit_id, project_id?, action_id?, is_scorable, kpi_definition_id?, kpi_weight?)
- `PATCH /tasks/:id` · `PATCH /tasks/:id/status`
- `POST /tasks/:id/submit-review` (đã có: submit) · `POST /tasks/:id/reviews` (đã có: review)
- `GET /tasks?orgUnitId=&projectId=&actionId=&assigneeId=` (đang chỉ có findAll toàn bộ)

**KPI**
- `GET /kpi-definitions?orgUnitId=` (từ cache)
- `GET /task-kpi-results` (nội bộ/kiểm tra)
- Nội bộ: tạo task_kpi_result khi review accepted **và** is_scorable (fix bug hiện tại)

**Reports / Action Log** (mới hẳn)
- `GET /reports/action-log?orgUnitId=&period=`
- `GET /reports/action-log/company` (CEO)
- `GET /reports/action-log/block/:id`

---

## 7. Đề xuất UI

**Menu bổ sung:** Việc của tôi · Phòng ban · Dự án · **Action Log** (mới) · Báo cáo · Thông báo.

**Action Log** (scope theo role, server-scoped):
- TGĐ: toàn công ty → group Khối → Phòng → Action.
- GĐ khối: khối mình → Phòng → Action. TP: phòng mình → Action. NV: không cần / chỉ action liên quan task mình.

**Task form (thêm field, có RULE):**
- Đơn vị chịu trách nhiệm: **bắt buộc** (task nghiệp vụ).
- Dự án: tùy chọn · Action: tùy chọn (lọc theo org_unit đã chọn) · Người thực hiện · Cần nghiệm thu · Tính KPI · KPI definition · Trọng số.
- **Rule khi "Tính KPI = true":** `review_required` tự bật & khóa true · bắt buộc chọn KPI definition · bắt buộc trọng số · sau khi accepted sinh `task_kpi_result`.

**Task detail** hiển thị rõ: Đơn vị chịu trách nhiệm · Dự án · Action · KPI/không · Review status · KPI evidence (nếu có).

---

## 8. Permission / Visibility model (đề xuất sửa)

Chuyển từ "bám `workspace_id`" sang "đa chiều":

**Task visibility** (`taskWhere`):
```
OR[ creatorId=me, assigneeId=me, collaborator, watcher,
    org_unit_id ∈ visibleOrgUnitIds(me),      -- theo cây + org_unit_roles scope
    project_id  ∈ myProjectIds(me) ]
```
**Task quyền quản lý** (`canManage/canReview`): admin ∨ creator ∨ managed(org_unit_id) ∨ (project owner/manager). Bỏ phụ thuộc `managesWorkspace(workspace)`.

**Action visibility:** `org_unit_id ∈ visibleOrgUnitIds(me)` (GĐ khối/TGĐ có scope include_children → thấy phòng con). Đúng yêu cầu: TP phòng mình, GĐ khối cả khối, TGĐ toàn công ty.

**Role TGĐ/CEO:** hiện FE chỉ admin/manager/member. Cần: hoặc thêm role FE, hoặc suy từ `org_unit_roles.role='ceo'` khi bootstrap để mở Action Log company. (Đề xuất: suy từ org_unit_roles, không đẻ thêm enum.)

**Nguyên tắc giữ nguyên:** scope ở SQL, không lọc FE (đã đúng, phải duy trì khi rewrite).

---

## 9. KPI evidence flow (local-first)

```
Task is_scorable=true  (⇒ review_required=true, kpi_definition_id + kpi_weight bắt buộc)
   │  assignee làm → submit-review
   ▼
Reviewer: Đạt
   ▼
Sinh task_kpi_result:
   task_id, employee(entra/emp_code), org_unit_id, kpi_definition_id, kpi_weight,
   review_result=accepted, quality_score(nếu chấm), on_time = completed_at ≤ due_date,
   completed_at, accepted_at, reviewed_by, reviewed_at, push_status='pending'
   ▼
(A4) DỪNG Ở LOCAL — không push. HRM đọc/pull sau (A6).
```
**Fix bắt buộc so với hiện tại:** chỉ tạo khi `is_scorable` (nay đang tạo cho mọi task passed) + bổ sung kpi_definition/weight/quality/on_time + relation task_id.

**Nguyên tắc:** App **không** tính KPI cuối cùng — chỉ sinh evidence; HRM là master định nghĩa & tính điểm nhân viên.

---

## 10. Migration path (additive, không phá dữ liệu)

1. **A1-a:** thêm cột nullable vào `tasks` (org_unit_id, project_id, action_id, is_scorable, kpi_definition_id, kpi_weight, accepted_at). Tạo `actions`, `kpi_definitions`. Nâng cấp `task_kpi_results` (thêm cột, thêm relation).
2. **A1-b backfill:** với mỗi task:
   - workspace org_unit → `org_unit_id = workspace.orgUnitId`, `project_id = null`.
   - workspace project → `project_id = workspace.id`, `org_unit_id =` (cần quy tắc: org unit của owner? của assignee?) → **câu hỏi §13**.
   - workspace null (cá nhân) → `org_unit_id =` org của assignee, hoặc giữ nullable cho task cá nhân → **câu hỏi §13**.
3. **A1-c:** sau backfill, đặt `org_unit_id NOT NULL` (nếu chốt task cá nhân cũng có org). Chuyển `taskWhere`/policy sang dùng org_unit_id/project_id.
4. **A1-d:** giữ `workspace(type=project)` làm project (P1). Không drop `workspace_id` ngay — để cột cũ tồn tại 1 phase cho an toàn, dọn sau.
5. Không có bước nào phá dữ liệu; rollback = bỏ đọc cột mới.

---

## 11. Phase triển khai đề xuất

| Phase | Nội dung | Rủi ro |
|---|---|---|
| **A0** | Audit report (tài liệu này) — **chỉ đọc** | 0 |
| **A1** | Schema + migration: Action + task dimensions + kpi_definitions + nâng cấp task_kpi_results + backfill | Trung bình (backfill, NOT NULL) |
| **A2** | Backend API: actions CRUD, task nhận org/project/action + KPI fields, taskWhere/policy đa chiều, reports/action-log | Trung bình (rewrite visibility → cần hardening lại) |
| **A3** | UI: Action Log, cập nhật Task form (rule KPI), Task detail hiển thị dimensions, role TGĐ | Thấp–TB |
| **A4** | KPI evidence **local only** (gate is_scorable, sinh result đủ field) — KHÔNG push HRM | Thấp |
| **A5** | UAT nội bộ theo vai trò | Thấp |
| **A6** | HRM sync: pull kpi_definitions + push task_kpi_results | Cao (đụng HRM — làm sau cùng) |

Không nhảy thẳng A6.

---

## 12. Rủi ro

1. **Task cá nhân vs `org_unit_id NOT NULL`:** task cá nhân/personal không có đơn vị nghiệp vụ. Ép NOT NULL sẽ vướng. Cần quy tắc (org của assignee) hoặc cho phép nullable cho loại "cá nhân". → §13.
2. **Rewrite visibility/policy** từ workspace sang đa chiều: rủi ro rò rỉ/ẩn nhầm — phải lặp lại kiểu hardening ORG-1.5 (test đủ vai trò) trước khi tin.
3. **Backfill org_unit cho task project:** project cắt ngang phòng → chọn org unit nào làm "chịu trách nhiệm"? Sai sẽ lệch KPI/báo cáo.
4. **Trùng đếm KPI** nếu cả Action lẫn Task đều tính điểm — đã chốt "Action không KPI, chỉ Task" ⇒ giữ đúng, đừng cho Action sinh result.
5. **Thiếu role TGĐ ở FE** — cần bổ sung suy diễn từ org_unit_roles để mở Action Log company.
6. **Giữ workspace(type=project)** (P1) là nợ kỹ thuật tên gọi — chấp nhận để giảm rủi ro migration; dọn ở phase sau.
7. **KPI definition chưa có nguồn thật** đến A6 — A4 phải chạy với definition local tạm; tránh phụ thuộc HRM sớm.

---

## 13. Câu hỏi cần chủ dự án chốt

1. **Task cá nhân:** còn giữ loại "cá nhân" không? Nếu giữ, `org_unit_id` cho task cá nhân xử lý sao — gán org của assignee hay để nullable (chỉ task nghiệp vụ mới bắt buộc)?
2. **Project:** chọn **P1** (giữ `workspace(type=project)`, ít migration) hay **P2** (tách bảng `projects` riêng, sạch hơn nhưng nặng)?
3. **Backfill org_unit cho task đang thuộc project:** lấy org theo owner dự án, theo assignee, hay bắt nhập tay khi migrate?
4. **Action.progress:** `manual` hay `auto_from_tasks` mặc định? (đề xuất manual trước, auto sau).
5. **Ranh giới KPI App↔HRM (quan trọng, xem §1.5 Đảo #2):** App giữ tới đâu?
   - (a) App chỉ giữ `is_scorable` + `kpi_definition_id` + `kpi_weight` (ánh xạ), **HRM chấm `quality_score`** từ sự kiện App đẩy — *gần scope-reset nhất, ít rủi ro double-source*; hay
   - (b) App chấm luôn `quality_score` (reviewer chọn rubric 1–5) và đẩy điểm — *đảo mạnh scope-reset*.
   - `on_time` định nghĩa = completed_at ≤ due_date?
6. **TGĐ/CEO:** suy từ `org_unit_roles.ceo` (đề xuất) hay thêm role FE riêng?
7. **KPI definition ở A4:** seed vài definition local để test, hay chờ hẳn A6 mới có KPI evidence?
8. **Action có cần nghiệm thu/đính kèm riêng không**, hay Action chỉ là container mục tiêu (đề xuất: container, chỉ Task mới review/KPI)?
9. **XÁC NHẬN ĐẢO QUYẾT ĐỊNH (§1.5):** Chốt chính thức đổi từ (i) `workspace_id` gộp → **tách `org_unit_id`/`project_id`/`action_id`**, và (ii) KPI mỏng → **App giữ `is_scorable`/`kpi_weight`/`kpi_definition_id`**? Đây là điều kiện tiên quyết trước A1 vì nó định hình toàn bộ migration.

---

## Phụ lục — file đã đọc để audit
Backend: `schema.prisma`, `seed.mjs`, `common/visibility.service.ts`, `common/policy.service.ts`, `tasks/tasks.service.ts`, `tasks/task.dto.ts`, `bootstrap/bootstrap.controller.ts`, `projects/projects.controller.ts` · cấu trúc module (không có actions/reports/kpi).
Frontend: `store/AppContext.jsx`, `pages/*` (Dashboard/MyTasks/Department/Channel/Reports), `components/task/CreateTaskModal.jsx`, `TaskDetailPanel.jsx`, `layout/Sidebar.jsx`, `MobileNav.jsx`, `data/constants.js`.
Docs đối chiếu: `task-app-scope-reset.md` (DUYỆT), `org-workspace-visibility-design.md`, `hrm-kpi-analysis-and-api-design.md`, `hrm-taskhub-integration-audit.md`, `bhl-org-structure-analysis.md`, `phase3-backend-plan.md` (historical).

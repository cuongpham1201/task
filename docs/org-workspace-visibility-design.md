# Thiết kế Tổ chức · Workspace · Visibility/Permission — App Giao việc

> Loại: **thiết kế kiến trúc** (không sửa code, không migration, không tích hợp HRM).
> Ngày: 2026-07-07 · App: Giao việc · Domain: task.biahalong.com
> Mục tiêu: **chốt quy tắc "ai nhìn thấy việc gì" theo cơ cấu tổ chức BHL TRƯỚC khi móc HRM.** Nếu phần visibility/privacy chưa rõ thì KHÔNG code tiếp.
> Trạng thái code hiện tại (base `7fd562d`): `departments` (phẳng, 4 phòng seed) · `projects` + `project_members` · `tasks.scope ∈ {personal, department, project}` + `departmentId`/`projectId` · PolicyService role `admin/manager/member`.

---

## 1. Executive summary

**Vấn đề với mô hình hiện tại:** `Department` phẳng (không có Khối/Tổ), `Task` gắn đồng thời `departmentId`/`projectId` + enum `scope`, quyền suy từ `role` phẳng (manager của *đúng phòng* mình). Không biểu diễn được: cây tổ chức nhiều cấp, Giám đốc khối nhìn nhiều phòng, TGĐ nhìn toàn công ty, và ranh giới riêng tư giữa phòng ban.

**Đề xuất cốt lõi (3 quyết định):**
1. **Cây tổ chức** `org_units` tự tham chiếu (COMPANY→DIVISION→DEPARTMENT→TEAM), thay `departments` phẳng.
2. **Workspace là trung tâm visibility**: mọi task thuộc **đúng 1 `workspace_id`**. Workspace có 2 loại: `ORG_UNIT` (việc nội bộ phòng/ban) và `PROJECT` (kiểu Asana, member thủ công). Bỏ cặp `departmentId`/`projectId` + enum `scope` rối.
3. **Quyền xem theo quan hệ, không hard-code chức danh**: `org_unit_roles` (ai xem org unit nào, có gồm cấp con không) + `workspace_members` (chỉ cho PROJECT). Membership ORG_UNIT **suy động** từ cây tổ chức (không lưu dòng).

**Khuyến nghị nhanh (chi tiết ở §14):**
- **CÓ** nên đổi task sang `workspace_id`.
- ORG_UNIT membership **query động** từ `org_units`/`org_unit_roles`; **KHÔNG** materialize thành `workspace_members`. Chỉ PROJECT mới lưu `workspace_members`.
- Visibility phải **scope ở tầng SQL (server)** cho mọi list/search/report/bootstrap — không lấy hết rồi lọc frontend.

---

## 2. Org tree model

Cây tổ chức tự tham chiếu, 1–4 cấp (Tổ/Nhóm tùy chọn).

```sql
org_units (
  id            uuid pk,
  name          text,             -- "Ban CNTT"
  code          text unique,      -- "CNTT"  (đối chiếu HRM)
  type          enum COMPANY|DIVISION|DEPARTMENT|TEAM,
  parent_id     uuid null → org_units.id,   -- COMPANY.parent_id = null
  manager_user_id uuid null → users.id,     -- head hiện tại (tiện hiển thị; quyền thực nằm ở org_unit_roles)
  sort_order    int default 0,
  active        bool default true,
  source        enum HRM|MANUAL default MANUAL,
  hrm_ref       text null         -- id/code bên HRM để sync
)
```

Ví dụ BHL:
```
Công ty Bia Hạ Long                 (COMPANY, parent=null)
├─ Khối Tài chính                    (DIVISION, parent=COMPANY, manager=Giám đốc khối TC)
│   ├─ Phòng Kế toán                 (DEPARTMENT, parent=Khối TC, manager=TP Kế toán)
│   └─ Ban Tài chính                 (DEPARTMENT, parent=Khối TC)
├─ Khối Hành chính                   (DIVISION)
│   ├─ Phòng HCNS                     (DEPARTMENT)
│   └─ Ban Pháp chế                   (DEPARTMENT)
└─ Ban CNTT                           (DEPARTMENT, parent=COMPANY hoặc một Khối)
    └─ Tổ Hạ tầng                     (TEAM, parent=Ban CNTT)  ← tùy chọn
```

Quy ước:
- **Khối = DIVISION** (cấp trên) · **Phòng/Ban = DEPARTMENT** · **Tổ/Nhóm = TEAM**.
- **Manager của DIVISION = Giám đốc khối**; **manager của DEPARTMENT = Trưởng phòng/ban** — nhưng quyền xem **không suy từ `manager_user_id`**, mà từ bảng `org_unit_roles` (§4) để linh hoạt (phó phòng, quyền TGĐ, override).
- **User thuộc 1 org_unit chính** (`users.org_unit_id`). User đặc biệt xem nhiều đơn vị → thêm dòng `org_unit_roles`.

Bổ sung `users`:
```sql
users ( ... , org_unit_id uuid null → org_units.id )   -- phòng/ban chính của user
```

---

## 3. Workspace model

**Workspace = ranh giới visibility.** Mọi task thuộc đúng 1 workspace.

```sql
workspaces (
  id            uuid pk,
  type          enum ORG_UNIT|PROJECT,
  name          text,
  org_unit_id   uuid null → org_units.id,  -- BẮT BUỘC khi type=ORG_UNIT, null khi PROJECT
  owner_user_id uuid null → users.id,      -- BẮT BUỘC khi type=PROJECT
  description   text null,
  archived      bool default false,
  created_at, updated_at
)
```

**Workspace ORG_UNIT**
- Đại diện việc nội bộ của 1 phòng/ban/tổ. Mỗi `org_unit` (cấp DEPARTMENT/TEAM, và DIVISION nếu muốn có việc cấp khối) có **1 workspace ORG_UNIT** tương ứng (`org_unit_id` unique cho type=ORG_UNIT).
- **Không add member thủ công** — thành viên = người thuộc org_unit đó (suy động, §4). `source` của quyền = HRM/SYSTEM.

**Workspace PROJECT**
- Do user tạo, có `owner_user_id`. **Không phụ thuộc org_unit** (liên phòng ban được).
- Owner/Manager add/remove member. Task dự án **chỉ member thấy**.

```sql
workspace_members (          -- CHỈ dùng cho PROJECT (xem §14)
  id            uuid pk,
  workspace_id  uuid → workspaces.id,
  user_id       uuid → users.id,
  role          enum OWNER|MANAGER|MEMBER|VIEWER,
  source        enum MANUAL|SYSTEM default MANUAL,
  active        bool default true,
  unique(workspace_id, user_id)
)
```

**Cá nhân (personal)**: task riêng tư không cần org/project. 2 lựa chọn:
- (a) `tasks.workspace_id = null` + quy ước "personal khi workspace_id null" → chỉ creator/assignee/collaborator thấy.
- (b) Mỗi user có 1 workspace PERSONAL ẩn.
→ **Khuyến nghị (a)**: đơn giản, không sinh workspace rác. (Xem §13-Q4.)

---

## 4. User / Org role model

Quyền xem theo tổ chức lưu bằng **quan hệ**, không hard-code chức danh text.

```sql
org_unit_roles (
  id          uuid pk,
  user_id     uuid → users.id,
  org_unit_id uuid → org_units.id,
  role        enum OWNER|MANAGER|VIEWER,        -- OWNER≈head, MANAGER≈điều hành, VIEWER≈chỉ xem
  scope       enum SELF_ONLY|INCLUDE_CHILDREN,  -- có gồm các đơn vị con không
  source      enum HRM|MANUAL default MANUAL,
  active      bool default true
)
```

Ví dụ ánh xạ:
| Người | org_unit | role | scope |
|---|---|---|---|
| TGĐ | COMPANY | MANAGER (hoặc VIEWER) | INCLUDE_CHILDREN |
| Giám đốc khối Tài chính | Khối Tài chính (DIVISION) | MANAGER | INCLUDE_CHILDREN |
| Trưởng Ban CNTT | Ban CNTT (DEPARTMENT) | MANAGER | SELF_ONLY (hoặc INCLUDE_CHILDREN nếu có Tổ) |
| Phó phòng Kế toán | Phòng Kế toán | MANAGER | SELF_ONLY |
| Nhân viên CNTT | (không cần dòng) — chỉ cần `users.org_unit_id = Ban CNTT` | — | — |

**3 tầng role tách biệt:**
- **A. System role** (`users.role`): `ADMIN` (kỹ thuật, thấy tất cả — không dùng vận hành thường) · `USER`.
- **B. Org role** (`org_unit_roles`): CEO/Giám đốc khối/Trưởng phòng = MANAGER với scope tương ứng; MEMBER = thuộc `users.org_unit_id` (không cần dòng role).
- **C. Project role** (`workspace_members.role`): OWNER/MANAGER/MEMBER/VIEWER.

> Ghi chú: bỏ dần role phẳng `manager/member` hiện tại. "Trưởng phòng" = có `org_unit_roles(MANAGER)`. "Giám đốc khối" = `org_unit_roles(MANAGER, INCLUDE_CHILDREN)` trên DIVISION. Không còn phụ thuộc `users.role='manager'`.

---

## 5. Task visibility rules

Task gắn workspace: `tasks.workspace_id` (thay `departmentId`/`projectId`/`scope`).

**Predicate `canViewTask(user, task)` = TRUE nếu bất kỳ điều kiện:**
1. `user.role = ADMIN` (system).
2. `task.creator_id = user.id`.
3. `task.assignee_id = user.id`.
4. user là collaborator/watcher của task.
5. **Workspace PROJECT**: user là member (`workspace_members`) của `task.workspace_id`.
6. **Workspace ORG_UNIT**: user **thuộc** org_unit đó (`users.org_unit_id = workspace.org_unit_id`) — thành viên phòng.
7. **Workspace ORG_UNIT**: user có `org_unit_roles` phủ org_unit đó:
   - `SELF_ONLY` và `org_unit_id = workspace.org_unit_id`, hoặc
   - `INCLUDE_CHILDREN` và `workspace.org_unit_id` nằm trong cây con của `org_unit_roles.org_unit_id`.
8. Task **personal** (`workspace_id = null`): chỉ điều kiện 1–4.

**Cây con (INCLUDE_CHILDREN):** dùng closure/recursive. Postgres `WITH RECURSIVE` hoặc bảng `org_unit_closure(ancestor_id, descendant_id, depth)` (materialized) để join nhanh. → **Khuyến nghị closure table** (cập nhật khi sync HRM) để scope query O(1) join.

**Query scoping server-side (BẮT BUỘC — không lọc ở frontend):**

Pseudo-SQL cho danh sách task user thấy:
```sql
SELECT t.* FROM tasks t
WHERE t.archived = false AND (
     :isAdmin
  OR t.creator_id = :uid
  OR t.assignee_id = :uid
  OR t.id IN (SELECT task_id FROM task_collaborators WHERE user_id = :uid)
  OR t.id IN (SELECT task_id FROM task_watchers      WHERE user_id = :uid)
  -- PROJECT: member
  OR t.workspace_id IN (
       SELECT workspace_id FROM workspace_members WHERE user_id = :uid AND active)
  -- ORG_UNIT: thuộc phòng của mình
  OR t.workspace_id IN (
       SELECT w.id FROM workspaces w
       WHERE w.type='ORG_UNIT' AND w.org_unit_id = :userOrgUnitId)
  -- ORG_UNIT: quyền quản lý/xem theo org_unit_roles (kèm cây con)
  OR t.workspace_id IN (
       SELECT w.id FROM workspaces w
       JOIN org_unit_closure c ON c.descendant_id = w.org_unit_id
       JOIN org_unit_roles r ON r.org_unit_id = c.ancestor_id
       WHERE w.type='ORG_UNIT' AND r.user_id = :uid AND r.active
         AND (r.scope='INCLUDE_CHILDREN' OR c.depth = 0))
);
```
Áp dụng nguyên tắc này cho: **bootstrap, list, search, report, notification deep-link** — mọi nơi trả task.

---

## 6. Permission matrix

`✔` = được; `∼` = có điều kiện; trống = không.

| Hành động | Admin | TGĐ (COMPANY, INCLUDE_CHILDREN) | Giám đốc khối (DIVISION, INCLUDE_CHILDREN) | Trưởng phòng/ban (DEPT, MANAGER) | Project Owner | Project Member | Assignee | Creator | User ngoài |
|---|---|---|---|---|---|---|---|---|---|
| View task | ✔ | ✔ (toàn cây) | ✔ (khối mình) | ✔ (phòng mình) | ✔ (dự án) | ✔ (dự án) | ✔ | ✔ | |
| Create task | ✔ | ✔ | ✔ | ✔ (phòng mình) | ✔ (dự án) | ∼ (nếu policy cho) | | ✔ (personal) | ∼ (personal) |
| Edit task | ✔ | ∼ (trong phạm vi) | ∼ (khối) | ✔ (phòng) | ✔ | | ∼ (mô tả) | ✔ | |
| Assign task | ✔ | ∼ | ∼ | ✔ (phòng) | ✔ | | | ✔ | |
| Update status/progress | ✔ | ∼ | ∼ | ✔ | ✔ | ∼ (việc mình) | ✔ | ✔ | |
| Comment | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | |
| Submit review (nộp) | | | | | | ∼ | ✔ (assignee) | | |
| Approve/return review | ✔ | ∼ | ∼ (khối) | ✔ (phòng) | ✔ (dự án) | | | ✔ (người giao) | |
| Archive/delete task | ✔ | ∼ | ∼ | ✔ (phòng) | ✔ (dự án) | | | ✔ | |
| Create project | ✔ | ✔ | ✔ | ✔ | — | — | ✔ (mọi user) | ✔ | ✔ |
| Add/remove project member | ✔ | | | | ✔ (owner) | ∼ (nếu MANAGER) | | | |
| View reports | ✔ (toàn cty) | ✔ (toàn cty) | ✔ (khối) | ✔ (phòng) | ∼ (dự án) | | ∼ (cá nhân) | ∼ (cá nhân) | ∼ (cá nhân) |

Nguyên tắc: **quyền quản trị = min(có quyền org/project trên workspace của task)**. Nghiệm thu = người giao (creator) hoặc MANAGER org_unit phủ task, hoặc project OWNER/MANAGER.

---

## 7. Privacy rules

1. **Task phòng ban KHÔNG public toàn công ty.** Chỉ thành viên phòng + chuỗi quản lý phía trên (theo org_unit_roles INCLUDE_CHILDREN) thấy.
2. **Nhân viên phòng A không thấy task phòng B** (khác `org_unit_id`, không có role phủ).
3. **Giám đốc khối chỉ thấy các phòng trong khối mình** (INCLUDE_CHILDREN từ DIVISION của mình) — không thấy khối khác.
4. **Project private theo member** — kể cả admin org không phải member vẫn không thấy task project (trừ system ADMIN). Đây là điểm khác biệt then chốt so với ORG_UNIT.
5. **System ADMIN thấy tất cả** nhưng chỉ dùng cho kỹ thuật/hỗ trợ, **không dùng vận hành thường ngày** (nên có audit log khi admin xem task không thuộc quyền — tùy chọn).
6. **Report cũng scope theo quyền**, không chỉ list task: số liệu tổng hợp chỉ tính trên tập task user được xem (dùng đúng WHERE ở §5). Không có "tổng công ty" cho trưởng phòng.

Xung đột ưu tiên: nếu task ở PROJECT thì **chỉ luật project áp dụng** (org manager KHÔNG tự động thấy task project của nhân viên mình) — bảo vệ tính riêng tư liên phòng ban của dự án. (Xem §13-Q3 để chốt.)

---

## 8. UI navigation theo quyền

| Menu | User thường | Trưởng phòng/ban | Giám đốc khối | TGĐ | Admin |
|---|---|---|---|---|---|
| **Việc của tôi** | task mình là assignee/creator/collaborator/watcher | (như user) | (như user) | (như user) | (như user) |
| **Phòng ban** | chỉ phòng mình (`users.org_unit_id`) | phòng mình | **các phòng trong khối** (cây con DIVISION) | **toàn bộ cây** | toàn bộ cây |
| **Dự án** | project mình là member/owner | (như user) | (như user) | (như user) | tất cả (chỉ admin) |
| **Báo cáo** | cá nhân | phòng mình | khối mình | toàn công ty | toàn công ty |
| **Quản trị tổ chức** | — | — | — | — | ✔ (org_units, roles) |

- Menu "Phòng ban" render từ danh sách org_unit mà user được xem (tính server-side, trả trong bootstrap: `visibleOrgUnits`).
- Menu "Dự án" = workspace PROJECT mà user là member.
- Không hiển thị org_unit ngoài quyền (không lộ tên phòng khác nếu không cần).

---

## 9. HRM mapping design (thiết kế, CHƯA tích hợp)

| HRM | App Giao việc |
|---|---|
| Employee | `users` (khóa `entra_id`↔ms_oid, `emp_code`) |
| Division/Department/Team (cây) | `org_units` (type theo cấp, `parent_id`, `hrm_ref`) |
| Nhân viên thuộc phòng nào | `users.org_unit_id` (suy động membership ORG_UNIT) |
| Head/Trưởng phòng | `org_unit_roles(role=MANAGER, scope=SELF_ONLY)` source=HRM |
| Giám đốc khối/Head DIVISION | `org_unit_roles(MANAGER, INCLUDE_CHILDREN)` source=HRM |
| Deputy/Phó | `org_unit_roles(MANAGER hoặc VIEWER)` |
| TGĐ | `org_unit_roles(COMPANY, MANAGER, INCLUDE_CHILDREN)` |
| active/inactive | `users.active` |

Nguyên tắc khi đã kết nối HRM:
- **App KHÔNG tạo phòng ban/tổ chức thủ công** — `org_units` source=HRM là read-only trong App (chỉ sync job ghi).
- **Thiếu dữ liệu manager ở HRM** → cho phép **gán tay override** trong App (`org_unit_roles.source=MANUAL`); sync không xóa dòng MANUAL.
- **HRM đổi cơ cấu** → sync job cập nhật `org_units`, `users.org_unit_id`, rebuild `org_unit_closure`, cập nhật `org_unit_roles` source=HRM.
- PROJECT + membership project = **thuần App** (source=MANUAL), HRM không đụng.
- Đồng bộ 1 chiều HRM→App cho org/nhân sự; App→HRM chỉ kết quả nghiệm thu (đã thiết kế ở tài liệu KPI). Xem `hrm-taskhub-integration-audit.md`.

---

## 10. Schema đề xuất (tổng hợp)

**Thêm mới:** `org_units`, `org_unit_roles`, `org_unit_closure` (materialized cây), `workspaces`, `workspace_members`.
**Sửa:** `users` +`org_unit_id`; `tasks` +`workspace_id` (bỏ `department_id`, `project_id`, enum `scope`).
**Giữ:** `task_collaborators`, `task_watchers`, `subtasks`, `comments`, `activities`, `notifications`, `task_reviews`, `external_*_mappings`, `task_kpi_results`, `sync_logs`.
**Thay thế:** `departments` → `org_units(type=DEPARTMENT)`; `projects`+`project_members` → `workspaces(type=PROJECT)`+`workspace_members`.

```
org_units(id,name,code,type,parent_id,manager_user_id,sort_order,active,source,hrm_ref)
org_unit_closure(ancestor_id,descendant_id,depth)              -- rebuild khi cây đổi
org_unit_roles(id,user_id,org_unit_id,role,scope,source,active)
workspaces(id,type,name,org_unit_id,owner_user_id,description,archived,created_at,updated_at)
workspace_members(id,workspace_id,user_id,role,source,active)  -- chỉ PROJECT
users(... , org_unit_id)
tasks(... , workspace_id)   -- thay department_id/project_id/scope
```

Ràng buộc: `workspaces` CHECK theo type (ORG_UNIT⇒org_unit_id NOT NULL & owner null; PROJECT⇒owner NOT NULL & org_unit_id null); unique `(org_unit_id)` khi type=ORG_UNIT.

---

## 11. Migration path tương lai (KHÔNG chạy bây giờ)

| Bước | Nội dung | Ghi chú |
|---|---|---|
| **M1** | Thêm `org_units` (+closure) | seed COMPANY + Khối + map 4 phòng hiện có |
| **M2** | Chuyển `departments` → `org_units(type=DEPARTMENT)` | giữ code; gán `parent_id` vào Khối |
| **M3** | Thêm `workspaces`: tạo 1 ORG_UNIT-workspace/phòng + convert mỗi `projects` → PROJECT-workspace | |
| **M4** | Thêm `tasks.workspace_id`; backfill: task `scope=department`→workspace ORG_UNIT của phòng; `scope=project`→workspace PROJECT; `scope=personal`→null. Sau đó bỏ `department_id/project_id/scope` | backfill có kiểm 100% trước khi drop cột |
| **M5** | Thêm `workspace_members` (từ `project_members`), `org_unit_roles` (từ head/manager hiện có + gán tay TGĐ/GĐ khối), `users.org_unit_id` | |
| **M6** | Viết lại **PolicyService + query scoping** theo §5 (predicate + WHERE) | thay canManage/canReview phẳng |
| **M7** | Cập nhật **UI navigation** theo cây (§8): menu Phòng ban đệ quy, bootstrap trả `visibleOrgUnits` | |

Nguyên tắc migration: làm trên dev, dữ liệu hiện là demo → có thể squash; nhưng **thiết kế để idempotent + backfill kiểm chứng** phòng khi đã có dữ liệu thật từ UAT.

---

## 12. Rủi ro

- **Rò rỉ task khi scope sai:** nếu 1 endpoint quên áp WHERE visibility → lộ task phòng khác. Giảm thiểu: 1 hàm `visibleTaskWhere(user)` dùng chung mọi query; test tự động cho từng vai.
- **Hiệu năng closure/recursive:** cây nhỏ (chục đơn vị) → không lo; vẫn nên materialize `org_unit_closure` + index.
- **Nhập nhằng ORG_UNIT vs PROJECT khi task liên phòng:** phải chọn 1 workspace. Quy ước: việc liên phòng → tạo PROJECT.
- **Org manager không thấy task project của nhân viên** (theo §7) — có thể gây tranh cãi quản lý; cần chốt (Q3).
- **Sync HRM ghi đè override tay:** phải phân biệt `source=HRM` vs `MANUAL`, sync không xóa MANUAL.
- **Đổi schema lớn (departments→org_units, scope→workspace_id):** chạm nhiều nơi (PolicyService, bootstrap, mọi trang). Rủi ro regression — cần làm sau khi UAT MVP hiện tại ổn, và có test.
- **Personal task = workspace_id null:** phải nhớ loại khỏi mọi luật org/project (null-safety).

---

## 13. Câu hỏi cần chốt

1. **Cấu trúc Khối thực tế của BHL?** Danh sách Khối và phòng/ban thuộc Khối nào (để dựng cây chuẩn) — hiện chỉ có 4 phòng phẳng.
2. **TGĐ/user đặc biệt** là ai (email) và mức quyền: xem-only hay điều hành (MANAGER)?
3. **Org manager có được thấy task PROJECT** của nhân viên mình không? (Khuyến nghị: **KHÔNG** — project private theo member; chỉ system admin thấy.)
4. **Task cá nhân**: dùng `workspace_id=null` (khuyến nghị) hay tạo workspace PERSONAL riêng mỗi user?
5. **DIVISION (Khối) có workspace việc riêng** không, hay chỉ là tầng tổng hợp (không có task trực tiếp, chỉ cuộn từ phòng con)?
6. **Ai được tạo PROJECT?** Mọi user hay chỉ từ MEMBER trở lên/manager?
7. **Khi nào làm?** Đổi schema này là việc lớn — làm **trước** hay **sau** khi HRM có API? (Khuyến nghị: chốt thiết kế giờ, code sau khi MVP hiện tại qua UAT.)

---

## Tóm tắt (in ra)

- **Có nên đổi task sang `workspace_id`?** → **CÓ.** Gom `department_id`/`project_id`/`scope` rối thành 1 `workspace_id`; workspace là ranh giới visibility thống nhất cho cả ORG_UNIT và PROJECT. Rõ ràng, chống rò rỉ, dễ scope query.
- **Lưu `workspace_members` cho ORG_UNIT hay query động?** → **Query động** từ `org_units`/`users.org_unit_id`/`org_unit_roles` (+`org_unit_closure`). KHÔNG materialize thành viên ORG_UNIT (tránh trùng/drift với HRM). **Chỉ PROJECT** mới lưu `workspace_members` (member thủ công, không có nguồn HRM). → mô hình **HYBRID**.
- **Quyết định chủ dự án cần chốt trước khi code:** (1) cây Khối/phòng thật của BHL; (2) danh tính + mức quyền TGĐ/user đặc biệt; (3) org manager có thấy task project của nhân viên không (khuyến nghị KHÔNG); (4) personal = workspace null hay workspace riêng; (5) DIVISION có task riêng không; (6) ai được tạo project; (7) thời điểm triển khai (khuyến nghị: chốt thiết kế nay, code sau UAT MVP). **Chưa chốt visibility/privacy thì chưa code tiếp.**

# FINAL ARCHITECTURE FREEZE — V1 · App Giao việc

> Tài liệu **chốt kiến trúc cuối cùng**. Sau tài liệu này, A2/A3/A4 **chỉ IMPLEMENT theo đây**, không đổi product model.
> Hợp nhất: `action-task-kpi-architecture-audit.md` + `action-model-freeze.md` (R1) + schema A1 đã migrate.
> Ngày 2026-07. **Không code / không migration / không commit trong tài liệu này.**

---

## 1. PRODUCT PHILOSOPHY

App Giao việc **KHÔNG phải** Jira · KHÔNG phải PMO · KHÔNG phải WorkHub · KHÔNG phải ERP.

App có **đúng 3 mục tiêu**, không hơn:

1. **Thay thế Asana nội bộ** — nhân viên nhận việc, cập nhật tiến độ, cộng tác theo dự án.
2. **Số hóa Action Log điều hành của Ban lãnh đạo** — thay bảng "Kế hoạch hành động" họp tác nghiệp hàng tháng (đầu việc · cập nhật có ngày · deadline · khó khăn/kiến nghị/chỉ đạo).
3. **Sinh KPI Evidence cho HRM** — App ghi bằng chứng nghiệm thu; HRM là engine tính KPI.

**Nguyên tắc bất biến:** mọi tính năng phải phục vụ 1 trong 3 mục tiêu trên. Không thì DEFER. Không phình.

---

## 2. CORE DOMAIN MODEL (business, không schema)

```
Company (Công ty)
│
├── Block (Khối / Giám đốc chức năng)
│     │
│     └── Department (Phòng/Ban/Kênh/Phân xưởng)
│            │
│            ├── Action  ── cam kết/mục tiêu quản lý của phòng
│            │      │
│            │      ├── Action Update  ── nhật ký điều hành (immutable, có ngày)
│            │      │
│            │      └── Task  ── đơn vị thực thi, giao cho người
│            │             │
│            │             ├── Subtask       ── việc con checklist
│            │             ├── Comment        ── thảo luận (sửa/xóa được)
│            │             ├── Review         ── nghiệm thu Đạt/Trả lại
│            │             ├── KPI Evidence   ── bằng chứng đẩy HRM (nếu is_scorable)
│            │             └── Attachment     ── tệp đính kèm
│            │
│            └── (users thuộc department qua org_unit_id)
│
└── Project  ── không gian cộng tác CẮT NGANG phòng ban (owner + members)
```

**Trách nhiệm từng object (business):**

| Object | Trách nhiệm | Trả lời câu hỏi |
|---|---|---|
| **Company/Block/Department** (Org Unit) | Cây trách nhiệm tổ chức, **master từ HRM** | "Đơn vị nào chịu trách nhiệm?" |
| **Action** | Cam kết/mục tiêu quản lý của 1 phòng; có owner/deadline/status/tiến độ; **không giao cá nhân, không KPI, không review** | "Phòng cam kết làm gì, tới hạn nào, tới đâu?" |
| **Action Update** | Nhật ký điều hành theo dòng thời gian (tiến độ/khó khăn/rủi ro/kiến nghị/quyết định/kết quả); **append-only** | "Diễn biến điều hành ra sao?" |
| **Task** | Đơn vị thực thi giao cho 1 người; có review + KPI evidence | "Ai làm gì, khi nào xong?" |
| **Subtask** | Checklist chia nhỏ Task | "Các bước con của việc?" |
| **Comment** | Thảo luận quanh Task/Action (sửa/xóa được) | "Trao đổi gì?" |
| **Review** | Nghiệm thu Task (Đạt/Trả lại) | "Việc đạt yêu cầu chưa?" |
| **KPI Evidence** | Bằng chứng task đã nghiệm thu để HRM chấm | "Có gì feed sang HRM?" |
| **Attachment** | Tệp minh chứng vận hành | "Tài liệu kèm theo?" |
| **Project** | Không gian cộng tác cắt ngang phòng ban; **không chịu trách nhiệm, không KPI** | "Việc phối hợp thuộc dự án nào?" |

---

## 3. DATABASE ERD (nhóm chức năng)

> Trạng thái: [A1] = đã migrate; [A2] = delta phải thêm đầu A2; [A3+] = hoãn.

```
╔═ MASTER (nguồn chân lý; org/user/kpi = cache HRM) ═════════════════╗
  users              [A1]  (HRM cache; role kỹ thuật admin/manager/member)
  org_units          [A1]  (Company→Block→Department; source=HRM)
  org_unit_roles     [A1]  (ceo/block_director/department_manager/viewer + scope)
  projects           [A1]  (= workspace type=project; owner + members)   *P1
  actions            [A1]  (+ đổi enum status [A2]) (+ project_id nullable [A2])
  kpi_definitions    [A1]  (cache HRM | local_seed)
╚════════════════════════════════════════════════════════════════════╝
        │ org_unit_id            │ owner/created_by      │ org_unit_id
        ▼                        ▼                       ▼
╔═ TRANSACTION (App master — dữ liệu vận hành) ══════════════════════╗
  tasks              [A1]  (org_unit_id, action_id?, project_id?, assignee, KPI fields)
  subtasks           [A1]
  task_reviews       [A1]  (decision passed/returned, note)
  action_updates     [A2]  ★ MỚI, IMMUTABLE (enum action_update_type 7 loại)
  comments           [A1]  (task_id; polymorphic action_id? = [A3+])
  attachments        [A1]  (task_id; polymorphic = [A3+])
╚════════════════════════════════════════════════════════════════════╝
        │ task_id/action_id
        ▼
╔═ AUDIT (tự sinh) ══════════════════════════════════════════════════╗
  activities         [A1]  (audit đổi field trên task; action = [A3+])
  notifications      [A1]  (7 loại; scope theo visibility)
╚════════════════════════════════════════════════════════════════════╝

╔═ INTEGRATION (App sinh → HRM tiêu thụ; 1 chiều, A6) ═══════════════╗
  task_kpi_results       [A1]  (evidence + pushStatus pending/sent/ack/error)
  sync_logs              [A1]  (nhật ký đồng bộ)
  external_user_mapping  [A1]  (user ↔ HRM employee)
  external_org_mapping   [A1]  (org_unit ↔ HRM dept)
╚════════════════════════════════════════════════════════════════════╝
```

**Dependency (chiều FK chính):**
`org_units → actions → action_updates` · `org_units → tasks` · `actions → tasks (SET NULL)` · `projects → tasks (nullable, no hard FK)` · `tasks → {subtasks, task_reviews, comments, activities, attachments, task_kpi_results}` · `users → mọi bảng có owner/creator/assignee/author` · `kpi_definitions → tasks (nullable)`.

**Delta A2 (additive, nhỏ — không refactor):** (a) đổi enum `action_status` → `draft/in_progress/on_hold/at_risk/done/cancelled`; (b) bảng `action_updates` + enum `action_update_type`; (c) cột `actions.project_id` nullable. Không đẻ bảng nào khác.

---

## 4. LUỒNG NGHIỆP VỤ (sequence)

**A. Action → Task → Review → KPI Evidence → HRM**
```
TP/GĐ tạo Action (org_unit, owner, deadline, period, project?)   [status: draft→in_progress]
  → viết Action Update (progress/issue/risk/recommendation/decision)   [nhật ký điều hành]
  → sinh Task từ Action: task.action_id, org_unit_id, project?, assignee, is_scorable?
      → Nhân viên làm, cập nhật %  → Submit review
          → Reviewer: Đạt  → task.status=done, accepted_at
              → NẾU is_scorable=true → tạo task_kpi_result(pending)   [evidence]
                  → (A6) push HRM → sent/ack ; HRM tự chấm điểm KPI
          → Reviewer: Trả lại → task.status=returned → nhân viên sửa → submit lại
  → Họp tháng: đọc Action Updates, đổi status; đóng Action = Update(result)+status=done
```

**B. Project → Task → Review** (cộng tác cắt ngang)
```
Project Owner tạo/thêm member  → tạo Task (project_id, org_unit_id=đơn vị assignee, action?=null)
  → Nhân viên làm → Submit → Review Đạt/Trả lại → done
  (KPI: chỉ khi task is_scorable — thường task dự án không tính KPI)
```

**C. Task độc lập** (không Action, không Project)
```
Tạo Task (org_unit_id = org của assignee/creator, action=null, project=null)
  → làm → (self hoặc review_required) → done
```

---

## 5. RELATIONSHIP (cardinality đầy đủ)

| A | quan hệ | B | Ràng buộc |
|---|---|---|---|
| Company | 1:N | Block | parent_id |
| Block | 1:N | Department | parent_id |
| Department | 1:N | User | user.org_unit_id **nullable** |
| Department (Org Unit) | 1:N | Action | action.org_unit_id **NOT NULL** |
| Department (Org Unit) | 1:N | Task | task.org_unit_id **NOT NULL** (nghiệp vụ) |
| User | 1:N | Action (owner) | action.owner_user_id **NOT NULL** |
| Action | 1:N | Action Update | update.action_id **NOT NULL** |
| Action | 1:N | Task | task.action_id **nullable** |
| Action | N:1 | Project | action.project_id **nullable** (chỉ 1) |
| Project | 1:N | Task | task.project_id **nullable** |
| Project | M:N | User | project_members (owner/member) |
| Task | N:1 | User (assignee) | task.assignee_id **NOT NULL** |
| Task | 1:N | Subtask | **nullable** (0..n) |
| Task | 1:1 | Review | **nullable** (0..1) |
| Task | 1:N | Comment | 0..n |
| Task | 1:N | Attachment | 0..n |
| Task | 1:N | KPI Evidence | 0..n (thường 0..1; chỉ khi is_scorable) |
| Task | N:1 | KpiDefinition | **nullable** |
| Task/Action | 1:N | Activity/Notification | tự sinh |

**Bắt buộc:** org_unit_id (task nghiệp vụ + action), assignee (task), owner (action), action_id của update.
**Nullable:** task.action_id, task.project_id, action.project_id, task.kpi_definition_id, user.org_unit_id, review.

---

## 6. ROLE MODEL (business permission)

Hai trục: **role kỹ thuật** (users.role) + **role tổ chức** (org_unit_roles, có scope self_only/include_children). Không hard-code chức danh.

| Vai trò | Nguồn | Quyền business |
|---|---|---|
| **TGĐ** | org_unit_roles `ceo` @ Company, include_children | Xem Action Log + Task **toàn công ty**; không sửa việc từng phòng trừ khi là creator |
| **Giám đốc khối** | `block_director` @ Block, include_children | Xem/quản Action + Task **khối mình** (mọi phòng con); nghiệm thu trong phạm vi |
| **Trưởng phòng** | `department_manager` @ Dept | Tạo/sửa Action + Task **phòng mình**; nghiệm thu; đổi deadline/assignee |
| **Nhân viên** | mặc định (member) | Chỉ việc **được giao/tạo/cộng tác/theo dõi**; cập nhật status/tiến độ việc mình; submit nghiệm thu |
| **Project Owner** | project_members.role=owner | Thêm/xóa member dự án; tạo/quản Task trong dự án |
| **Project Member** | project_members.role=member | Tham gia Task dự án; xem nội dung dự án |
| **Admin** | users.role=admin | Toàn quyền kỹ thuật (vận hành hệ thống) |

Ghi chú: TGĐ/GĐ khối **suy từ org_unit_roles**, không thêm enum FE mới. Nhân viên **không** có quyền quản Action.

---

## 7. VISIBILITY MODEL (business rule — server-side, KHÔNG lọc FE)

> Nguyên tắc bất biến: **mọi phạm vi scope ở SQL**, không bao giờ dựa vào ẩn/hiện FE.

- **Task nhìn thấy khi:** là creator ∨ assignee ∨ collaborator ∨ watcher **∨** `task.org_unit_id ∈ visibleOrgUnitIds(me)` **∨** `task.project_id ∈ myProjectIds(me)`. (admin: tất cả).
- **Action nhìn thấy khi:** `action.org_unit_id ∈ visibleOrgUnitIds(me)` (gồm include_children cho GĐ khối/TGĐ). **`project_id` KHÔNG mở rộng quyền xem Action** (tránh rò rỉ cam kết điều hành cho member dự án ngoài đơn vị). Nhân viên chỉ thấy Action như **bối cảnh read-only trên task mình**, không vào Action Log.
- **Project nhìn thấy khi:** là member (hoặc owner) của project; admin thấy tất cả.
- **Notification nhìn thấy khi:** là người nhận **và** task/action liên quan còn trong phạm vi visibility (lọc lại theo taskWhere để không lộ việc ngoài phạm vi).
- **Search nhìn thấy khi:** kết quả (task/action/project/user/dept) đã qua đúng bộ scope tương ứng ở trên. Danh bạ user (tên/email) là dữ liệu chung.
- **Comment nhìn thấy khi:** thấy được Task/Action chứa nó (kế thừa visibility của parent).
- **Action Update nhìn thấy khi:** thấy được Action chứa nó (kế thừa visibility Action = org-unit-based).

`visibleOrgUnitIds(me)` = phòng mình + phạm vi org_unit_roles (self_only → chính nó; include_children → cả cây con).

---

## 8. KPI MODEL (khóa ranh giới)

**HRM là master KPI. App CHỈ sinh evidence. App KHÔNG tính KPI.**

App **CÓ**: `is_scorable`, `kpi_definition_id`, `kpi_weight`, `review_required`, và khi nghiệm thu Đạt → `task_kpi_result` (org_unit, definition, weight, on_time, review_result, evidence_note, reviewed_by/at, pushStatus).

App **KHÔNG**: tính điểm KPI cuối, lưu KPI tổng/period score, lưu rubric/quality_score (HRM chấm), lưu OKR, lưu thưởng/lương, lưu xếp loại A/B/C/D.

Ranh giới: khi Task `is_scorable=true` **bắt buộc** `review_required=true` + `kpi_definition_id` + `kpi_weight`. Nghiệm thu Đạt → sinh evidence `pushStatus=pending` (local-first). **A6** mới push HRM (1 chiều, idempotencyKey chống double-count). HRM tự tính `task_score = 0.7×quality + 0.3×on_time`, rollup theo weight, xếp loại — App không đụng.

**Action KHÔNG có KPI.** Chỉ Task.

---

## 9. DASHBOARD MODEL (theo vai trò)

| Vai trò | Trọng tâm | Nội dung |
|---|---|---|
| **Nhân viên** | **Task** | "Việc của tôi": Quá hạn/Hôm nay/Tuần này/Bị trả lại/Chờ nghiệm thu/Hoàn thành. Không thấy Action Log. |
| **Trưởng phòng** | **Action → Task** | Action Log phòng mình (đầu việc, deadline, status, update mới); drill xuống Task; việc chờ mình nghiệm thu. |
| **Giám đốc khối** | **Khối → Action → Task** | Action Log khối (group theo Phòng), sắp quá hạn/at_risk lên đầu; drill Phòng→Action→Task. |
| **TGĐ** | **Toàn công ty → Khối → Phòng → Action → Task** | Action Log toàn công ty, lọc theo tháng (period); bức tranh cam kết điều hành — số hóa "Họp Tác nghiệp". |

Nguyên tắc: **lãnh đạo nhìn Action, nhân viên nhìn Task.** Không biểu đồ phức tạp; con số + màu (quá hạn/at_risk đỏ).

---

## 10. MENU MODEL (chốt cuối)

```
Trang chủ      — dashboard theo vai trò (§9)
Việc của tôi   — task cá nhân được giao/tạo
Phòng ban      — task theo phòng (org unit workspace)
Dự án          — project cộng tác
Action Log     — ★ màn điều hành chính của lãnh đạo (Khối→Phòng→Action→Task)
Thống kê       — (Reports cũ hạ cấp) thống kê hoàn thành task; bổ trợ
Thông báo      — inbox
Cài đặt        — tài khoản
```

Vì sao: **Action Log** là cửa chính của BLĐ (đúng nhu cầu số hóa họp tác nghiệp). **Thống kê** giữ lại nhưng phụ (không phải nơi lãnh đạo điều hành). Nhân viên không thấy Action Log trên menu (chỉ thấy Action ở header task). Không thêm menu nào khác → chống phình.

---

## 11. IMPLEMENTATION ROADMAP (chốt — không thêm phase)

| Phase | Nội dung | Điều kiện xong |
|---|---|---|
| **A1** ✅ | Schema: task dimensions + actions + kpi_definitions + task_kpi_results (đã migrate, đã commit `8cbe8b0`) | migrate + backfill xong |
| **A2** | Backend API: delta schema (enum action_status, action_updates, actions.project_id) + Actions CRUD + Action Updates + Task nhận org/project/action + KPI gate (is_scorable) + reports/action-log + visibility/policy đa chiều | API + test đủ vai trò |
| **A3** | Frontend: Action Log, Action Detail (nhật ký điều hành), Task form (org/project/action + KPI rule), Task detail hiển thị dimensions, dashboard theo vai trò | UI khớp §9/§10/§16-freeze |
| **A4** | KPI Evidence local: gate is_scorable, sinh evidence đủ field, seed kpi_definitions mẫu (local_seed) — **KHÔNG push HRM** | evidence local đúng |
| **A5** | UAT nội bộ theo vai trò | checklist pass |
| **A6** | HRM Integration: pull kpi_definitions + push task_kpi_results (1 chiều, idempotent) | sync ổn định |

Không nhảy phase. Không thêm phase.

---

## 12. DESIGN REVIEW (đóng vai Software Architect)

**Điểm mạnh:**
- Tách 3 lớp rõ (OrgUnit trách nhiệm · Action quản lý · Task thực thi) phản ánh đúng nghiệp vụ BHL (họp tác nghiệp) → dễ dùng, đúng kỳ vọng lãnh đạo.
- Visibility server-side, đa chiều nhưng nhất quán (org tree + project membership) → an toàn, đã hardening 1 lần (ORG-1.5).
- Ranh giới KPI sạch (App evidence, HRM engine) → không lệ thuộc HRM để chạy; tránh double-source điểm số.
- Action Update immutable → nhật ký điều hành đáng tin cho audit.
- Scope kỷ luật (danh sách DEFER rõ) → không phình PMO/WorkHub.

**Điểm yếu / technical debt:**
- **Project = workspace(type=project)** (P1) là nợ tên gọi; `task.workspace_id` cũ còn song song `org_unit_id/project_id` tới khi dọn → hai nguồn tạm thời. Cần dọn `workspace_id` sau A3.
- `project_id` là cột thường không FK cứng → mất ràng buộc toàn vẹn (đổi lấy dễ tách bảng sau). Chấp nhận có kiểm soát ở tầng app.
- Comment/Attachment/Activity **task-only**; Action chưa có (hoãn A3+) → nhật ký điều hành gánh tạm phần "ghi chú".
- `completion_mode` (cũ) song song `review_required` (mới) → deprecate, dọn sau.

**Scalability — kịch bản 50 phòng · 3000 user · 200 project · 200.000 task:**
- **Domain model KHÔNG cần đổi.** Postgres xử lý 200k task, quan hệ, index (`org_unit_id,status` / `project_id,status` / `action_id` / `assignee_id` / `due_date`) thoải mái. Cây 50 phòng → `loadTree()` không đáng kể.
- **Chỗ PHẢI đổi = tầng nạp dữ liệu FE (không phải model):**
  1. **Bootstrap trả TẤT CẢ task đang thấy** vào 1 payload + FE giữ toàn bộ trong memory (useReducer) → **không chịu nổi 200k**. Cần chuyển sang **API phân trang + tải theo ngữ cảnh** (task theo phòng/dự án/action, cursor pagination), FE bỏ mô hình "load hết".
  2. **Search & Reports client-side** (lọc trên state.tasks) → phải chuyển **server-side** (indexed query / full-text nếu cần).
  3. **Notification polling 20s** → ở quy mô lớn nên chuyển **SSE/WebSocket** hoặc tăng khoảng + phân trang.
  4. **Action progress auto_from_tasks** nếu bật ở quy mô lớn → cần tính nền (job/materialized) thay vì tính realtime.
- **Kết luận:** kiến trúc **nghiệp vụ/DB đủ dùng tới quy mô đó**; cái cần tiến hóa là **data-loading/pagination + server-side search/report + realtime**, và dọn nợ workspace_id. Không phải refactor domain — đúng mục tiêu freeze.

**Rủi ro 2 năm tới:**
- Kỷ luật cập nhật Action Update (giống hiện tại phòng ban quên cập nhật slide) → cần nhắc/nudge, không phải vấn đề kiến trúc.
- Khi HRM đổi công thức KPI → App an toàn vì chỉ đẩy evidence (đã cách ly).
- Nếu lãnh đạo muốn "biên bản họp tự động" → đã reserve kiến trúc (meeting/period), không refactor.
- Đa pháp nhân (Hạ Long/Đông Mai) đã có `legal_entity` → không phát sinh.

---

## 13. FREEZE

> **ARCHITECTURE FREEZE V1.**
> Sau tài liệu này **KHÔNG thay đổi Product Model nữa.**
> Các phase A2/A3/A4/A5/A6 **chỉ được IMPLEMENT** theo tài liệu này.
> Mọi thay đổi model phải mở phiên freeze V2 riêng, có lý do và review, không sửa ngầm trong lúc code.

Ba lớp bất biến: **Org Unit (trách nhiệm) → Action (quản lý) → Task (thực thi) → KPI Evidence (HRM).** Project là lớp cộng tác cắt ngang. HRM là master KPI. App sinh evidence, không tính KPI.

— Hết —

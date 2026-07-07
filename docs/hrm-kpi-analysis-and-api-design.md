# Phân tích KPI của HRM & Thiết kế API cho App Giao việc

> Ngày: 2026-07-06 · Loại: phân tích + thiết kế (chưa code).
> Nguồn: đọc trực tiếp `/data/dev/salary-app/webapp/apps/tasks/`.
> Mục tiêu triển khai (theo yêu cầu): **(1)** App Giao việc chạy độc lập trước — SSO login + hoàn thiện chức năng hiện có; **(2)** sau đó gắn API để HRM hiển thị dashboard KPI.

---

## Phần 1 — Cách HRM tính KPI (chính xác theo code)

### 1.1 Toàn cảnh chuỗi tính điểm

```
Task (weight, is_scorable, due_date, completed_at, assignee, parent)
   │
   ▼  nghiệm thu (quản lý duyệt 1 cấp)
TaskReview  →  quality_score (từ rubric 1–5)  +  on_time_score  →  task_score
   │
   ▼  rollup (mgmt command rebuild_period_scores)
EmployeePeriodScore  (MONTH → QUARTER → YEAR)  →  weighted_score  →  grade A/B/C/D
```

### 1.2 Điểm từng việc — `TaskReview.save()` (`tasks/models.py:575-611`)

Chỉ tính khi `decision = PASSED` **và** `task.is_scorable = True`.

**a) Điểm chất lượng** `quality_score` (0–100): quy đổi từ **bậc rubric 1–5** (`rubric_level`), KHÔNG nhập số cảm tính.
- Map mặc định (`DEFAULT_RUBRIC_SCORE_MAP`, `models.py:34`): `{1:20, 2:40, 3:60, 4:80, 5:100}`.
- Từng rubric có thể ghi đè điểm theo bậc (`QualityRubricLevel.score`, `models.py:471`).
- Nghiệm thu "Đạt" một việc tính điểm **bắt buộc** có `rubric_level` + `quality_reason` (`clean()`, `models.py:562-573`).

**b) Điểm đúng hạn** `on_time_score` (0–100) — hệ tự tính (`compute_on_time()`, `models.py:550-560`):
- Không có `due_date` → **100**.
- Hoàn thành đúng/sớm hạn → **100**.
- Trễ → `100 − 10 × số_ngày_trễ`, sàn **0** (`ONTIME_PENALTY_PER_DAY = 10`, `models.py:31`).
- Mốc "hoàn thành" = `task.completed_at.date()` (chốt tại thời điểm nghiệm thu Đạt, `models.py:592-593`).

**c) Điểm việc** `task_score` (Hybrid, `models.py:600-604`):
```
task_score = 0.70 × quality_score + 0.30 × on_time_score      (làm tròn 0.01)
```
Trọng số `DEFAULT_QUALITY_WEIGHT=0.70`, `DEFAULT_ONTIME_WEIGHT=0.30` (`models.py:28-29`).
- Nếu PASSED nhưng **chưa** chấm chất lượng → `task_score = None` (bỏ qua ở rollup, không kéo điểm kỳ xuống — `models.py:598-606`).
- Nếu không PASSED → dọn sạch điểm (`on_time_score=None`, `task_score=None`).

### 1.3 Cuộn điểm theo kỳ — `rebuild_period_scores.py`

Lọc review đưa vào rollup (`command lines 44-49`): `decision=PASSED` **&** `task_score IS NOT NULL` **&** `task.is_scorable=True` **&** `task.assignee IS NOT NULL`.

**Loại trừ việc CHA** (chống đếm trùng): task xuất hiện làm `parent` của việc khác thì bỏ (`lines 41-43, 51-52`). Điểm chỉ cuộn từ việc lá.

**Kỳ tính** = `completed_at.date()` (fallback `due_date`), phải thuộc `--year` (`_effective_date`, `lines 17-21, 53-54`).

**Gom nhóm** theo `(assignee_id, tháng)`:
```
num += weight × task_score        # tử số
den += weight                     # mẫu số (tổng trọng số)
weighted_score(tháng) = num / den                    (0–100, làm tròn 0.01)
```
Quý = cộng dồn num/den của 3 tháng; Năm = cộng dồn cả năm (`lines 61-73`). → weighted_score là **bình quân gia quyền theo trọng số**, không phải trung bình cộng.

**Idempotent:** xóa các kỳ **chưa khóa** của năm rồi dựng lại; kỳ `locked=True` giữ nguyên (`lines 86-104`).

### 1.4 Xếp loại — `EmployeePeriodScore` (`models.py:681-751`)

| weighted_score | grade |
|---|---|
| ≥ 90 | A — Xuất sắc |
| ≥ 75 | B — Tốt |
| ≥ 60 | C — Đạt |
| < 60 | D — Chưa đạt |

- Nếu `total_weight < MIN_SCORABLE_WEIGHT = 2` → `insufficient_data=True`, **không xếp loại** (chống thổi hạng từ 1–2 việc nhỏ — `models.py:40, 747-749`).
- Khóa kỳ có cổng thủ tục: cần Calibration CLOSED + không còn Appeal mở + (nếu loại D) phải có Check-in trong kỳ (`models.py:772-799`). **App Giao việc không đụng tới các cổng này** — thuần HRM.

### 1.5 Trọng số việc `weight` (`models.py:324-333`)

`Task.weight` mặc định `1`; chỉ có ý nghĩa khi `is_scorable=True`. Có chuẩn tham chiếu `TaskWeightStandard` theo Position (band min/max, `models.py:98-141`) nhưng **rollup không ép band** — chỉ dùng `Task.weight` thực tế. → nếu mọi việc weight=1 thì KPI = trung bình cộng điểm việc.

### 1.6 Bảng tóm tắt: input tối thiểu để tính 1 điểm KPI

| Trường | Nguồn HRM | Bắt buộc | Ghi chú |
|---|---|---|---|
| assignee (ai) | `Task.assignee` (Employee) | ✅ | khóa join = emp_code/entra_id |
| weight | `Task.weight` | ✅ | mặc định 1 |
| is_scorable | `Task.is_scorable` | ✅ | việc lá mới tính |
| parent | `Task.parent` | ✅ | để loại việc cha |
| decision | `TaskReview.decision` | ✅ | chỉ PASSED |
| rubric_level (1–5) | `TaskReview.rubric_level` | ✅ | → quality_score |
| quality_reason | `TaskReview.quality_reason` | ✅ | bắt buộc khi Đạt |
| due_date | `Task.due_date` | ⭘ | trống → đúng hạn 100 |
| completed_at | `Task.completed_at` | ✅ | mốc tính đúng hạn + kỳ |
| reviewer | `TaskReview.reviewer` | ⭘ | truy vết |
| project/goal(OKR) | `Task.project`/`Task.goal` | ⭘ | quy KPI về OKR/dự án |

---

## Phần 2 — Khoảng trống của App Giao việc so với input KPI

App hiện có (Prisma `schema.prisma`): `Task{ status(todo/doing/waiting/done/paused), priority, progress, dueDate, completedAt, assignee, creator }`. **Thiếu toàn bộ tầng nghiệm thu/chấm điểm:**

| Cần cho KPI | App Giao việc hiện có? | Việc cần làm |
|---|---|---|
| Nghiệm thu (review/decision PASSED-RETURNED) | ❌ | Thêm bảng `TaskReview` (App) hoặc trạng thái nghiệm thu |
| rubric_level 1–5 + reason | ❌ | Thêm field khi nghiệm thu |
| weight | ❌ (chỉ có priority) | Thêm `weight` (hoặc map priority→weight) |
| is_scorable | ❌ | Thêm cờ (mặc định true cho việc lá) |
| parent/child | subtask riêng, không phải Task.parent | Chỉ đẩy task cha (leaf) — subtask không tính KPI |
| completed_at | ✅ có | dùng lại |
| due_date | ✅ có | dùng lại |

**Ánh xạ trạng thái (status mapping) App ↔ HRM:**

| App (`TaskStatus`) | HRM (`Task.Status`) |
|---|---|
| todo | NEW |
| doing | IN_PROGRESS |
| waiting | SUBMITTED (chờ nghiệm thu) |
| done | DONE (Đạt/Đóng) |
| paused | (không có tương đương — giữ nội bộ App) |
| — | RETURNED (khi nghiệm thu trả lại) → App set về `doing` |
| — | CANCELLED → App cần thêm hoặc dùng `archived` |

> **Nguyên tắc:** App chỉ đẩy sang HRM những việc **đã nghiệm thu Đạt** (leaf, is_scorable). Việc nháp/đang làm/subtask KHÔNG đẩy → KPI không bị tính sai (đúng rủi ro đã nêu ở audit tổng thể).

---

## Phần 3 — Thiết kế API cho App Giao việc

API chia **2 tầng tách biệt** để phục vụ đúng lộ trình 2 bước:

### Tầng A — API nội bộ (standalone, Bước 1) — `/api/v1/*`

Đây là API cho chính frontend App, hoàn thiện Phase 3 (`docs/phase3-backend-plan.md`). Chạy độc lập, KHÔNG phụ thuộc HRM.

**Auth (SSO):**
| Method | Path | Mô tả |
|---|---|---|
| — | (MSAL PKCE ở SPA) | SPA lấy access token Entra ID |
| GET | `/api/v1/me` | Validate JWT (JWKS Entra) → trả user nội bộ + role |

**Chức năng hiện có (đưa từ mock → API thật):**
| Nhóm | Endpoint chính |
|---|---|
| Users | `GET /users`, `GET /users/:id` |
| Departments | `GET /departments`, `GET /departments/:id/tasks` |
| Channels | `GET/POST /channels`, `POST/DELETE /channels/:id/members`, `GET /channels/:id/tasks` |
| Tasks | `GET /tasks`, `POST /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id/{status,assignee,due-date,priority,progress,sort-order}`, `DELETE /tasks/:id` (soft archive) |
| Subtasks | `POST /tasks/:id/subtasks`, `PATCH /subtasks/:id`, `DELETE /subtasks/:id` |
| Comments | `GET/POST /tasks/:id/comments`, `PATCH/DELETE /comments/:id` |
| Activities | `GET /tasks/:id/activities` |
| Notifications | `GET /notifications`, `POST /notifications/mark-read`, `GET /notifications/unread-count` |
| Attachments | `POST/GET/DELETE` qua Graph/SharePoint |
| Reports | `GET /reports/summary`, `/by-department`, `/overdue` (vận hành, nội bộ) |

> Mỗi PATCH nghiệp vụ chạy transaction: update task → insert Activity → fan-out Notification (đúng kế hoạch `phase3-backend-plan.md` §3). Quyền enforce server-side (port `src/utils/permissions.js` → `PolicyService`).

**Bổ sung để về sau nối KPI (nên làm ngay ở Bước 1 để không phải migrate lại):**
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/v1/tasks/:id/review` | Nghiệm thu: `{decision: PASSED\|RETURNED, rubricLevel(1-5), qualityReason, weight?}` |
| GET | `/api/v1/tasks/:id/review` | Xem kết quả nghiệm thu |

→ cần thêm vào Prisma schema (xem 3.3).

### Tầng B — API tích hợp KPI (Bước 2) — `/api/v1/integration/*`

Đây là API **HRM sẽ pull** để dựng dashboard KPI. Bảo vệ bằng token app-to-app (giống mẫu Bearer HRM đã dùng ở `settings.py:283-326`), tách hẳn khỏi auth người dùng.

| Method | Path | Trả về |
|---|---|---|
| GET | `/api/v1/integration/kpi-inputs?from=2026-06-01&to=2026-06-30` | Danh sách **việc đã nghiệm thu Đạt** kèm đầy đủ input KPI (xem schema dưới) — để HRM tự chấm bằng engine của nó |
| GET | `/api/v1/integration/operational-stats?period=2026-06` | Số liệu vận hành realtime (tổng việc, quá hạn, theo phòng ban) cho widget dashboard HRM |
| GET | `/api/v1/integration/health` | Trạng thái nguồn (để HRM cache/degrade an toàn) |

**Payload `kpi-inputs` (một phần tử = một việc đã nghiệm thu Đạt, leaf):**
```json
{
  "appTaskId": "t123",
  "idempotencyKey": "taskhub:t123:review:5",   // chống double-count khi HRM pull lại
  "assignee": { "entraId": "…", "email": "…" }, // HRM map → Employee
  "title": "…",
  "weight": 1.5,
  "isScorable": true,
  "isLeaf": true,
  "dueDate": "2026-06-20",
  "completedAt": "2026-06-22T09:00:00+07:00",
  "review": {
    "decision": "PASSED",
    "rubricLevel": 4,            // 1–5, HRM tự quy đổi quality_score
    "qualityReason": "…",
    "reviewer": { "entraId": "…" },
    "reviewedAt": "2026-06-22T10:00:00+07:00"
  },
  "project": { "code": null, "name": "…" },     // để HRM quy KPI về Project/OKR nếu cần
  "source": "taskhub"
}
```

> App **không tự tính `task_score`** — chỉ đẩy `rubricLevel + weight + due/completed`. HRM quy đổi và rollup bằng engine sẵn có (công thức 0.70/0.30, grade A/B/C/D) → **công thức KPI chỉ tồn tại một nơi (HRM)**; đổi trọng số sau này không phải sửa App. (Xem Phần 4.)

### 3.3 Bổ sung Prisma schema (App) để hỗ trợ nghiệm thu/KPI

```prisma
model TaskReview {
  id            String   @id @default(uuid())
  taskId        String   @unique
  reviewerId    String
  decision      ReviewDecision            // PASSED | RETURNED
  rubricLevel   Int?     @db.SmallInt      // 1–5
  qualityReason String   @default("")
  weight        Float    @default(1)       // trọng số việc (mặc định 1)
  reviewedAt    DateTime?
  syncedToHrm   Boolean  @default(false)   // đã được HRM pull chưa
  task          Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  reviewer      User     @relation(fields: [reviewerId], references: [id])
}
enum ReviewDecision { passed returned }

// Task thêm:  weight Float @default(1)   isScorable Boolean @default(true)
```

---

## Phần 4 — Hai mô hình feed KPI & khuyến nghị

| | Mô hình 1 — App feed input thô (KHUYẾN NGHỊ) | Mô hình 2 — App tự tính điểm |
|---|---|---|
| App đẩy | rubricLevel, weight, due/completed | task_score đã tính (0.7/0.3) |
| Ai giữ công thức | **HRM (một nơi duy nhất)** | Cả hai (dễ lệch) |
| Đổi trọng số 0.7/0.3 | chỉ sửa HRM | phải sửa cả App |
| HRM tái dùng engine | 100% (`TaskReview`+`rebuild_period_scores`) | không |
| Rủi ro sai lệch KPI | thấp | cao |

**Khuyến nghị: Mô hình 1.** App chỉ là nguồn dữ liệu nghiệm thu; HRM là engine + nơi hiển thị KPI. Cụ thể luồng Bước 2:
1. HRM chạy job định kỳ (hoặc on-demand) pull `GET /integration/kpi-inputs`.
2. HRM tạo/cập nhật `Task` + `TaskReview` (source=`taskhub`, dùng `idempotencyKey`), map assignee qua entra_id→Employee.
3. HRM chạy `rebuild_period_scores` → `EmployeePeriodScore` cập nhật.
4. **Dashboard KPI hiển thị ngay trên các màn hình HRM sẵn có** (không phải dựng mới).

Song song, HRM có thể pull `GET /integration/operational-stats` để thêm widget "vận hành realtime" nếu lãnh đạo muốn xem trực tiếp trong HRM.

---

## Phần 5 — Lộ trình khớp mục tiêu

**Bước 1 — App Giao việc chạy độc lập (ưu tiên trước):**
1. SSO: MSAL PKCE ở SPA + guard JWT (JWKS Entra) ở NestJS + `GET /me`.
2. Hiện thực Tầng A: task CRUD, comment, subtask, activity, notification, attachment, reports; bỏ mock, nối frontend↔API; PolicyService server-side.
3. **Thêm sẵn** bảng `TaskReview` + field `weight`/`isScorable` + endpoint `/tasks/:id/review` (để Bước 2 không phải migrate lại).
4. Nguồn user/phòng ban: theo audit tổng thể nên lấy từ HRM; nhưng để chạy độc lập trước, tạm sync từ Graph `/users` như kế hoạch hiện tại — đổi nguồn sang HRM ở Bước 2.

**Bước 2 — Gắn API để HRM hiện dashboard:**
1. HRM bổ sung lớp API read + client pull (tái dùng mẫu `apps/portal/integrations.py`).
2. App expose Tầng B `/integration/kpi-inputs` + `/operational-stats` (token app-to-app).
3. HRM pull → tạo Task/TaskReview → `rebuild_period_scores` → dashboard KPI trên HRM.
4. Thí điểm 1 phòng ban, reconcile KPI vài kỳ trước khi mở rộng.

---

## Câu hỏi cần chốt trước khi code

1. **Mô hình feed KPI:** đồng ý Mô hình 1 (App feed input thô, HRM tính) chứ? (khuyến nghị)
2. **Trọng số việc:** App thêm field `weight` cho người giao chọn, hay tự map từ `priority` (low/normal/high/urgent → 0.5/1/2/3)?
3. **Rubric:** App cho người nghiệm thu chọn bậc 1–5 (đúng chuẩn HRM), hay chỉ đánh Đạt/Không rồi HRM chấm chất lượng sau? (khuyến nghị: chọn bậc 1–5 ngay ở App)
4. **Nguồn user/phòng ban ở Bước 1:** tạm Graph rồi đổi HRM (nhanh, chạy độc lập sớm) hay chờ HRM API luôn?
5. **Deliverable kế tiếp:** viết tiếp spec chi tiết từng endpoint, hay bắt tay code (bắt đầu từ SSO + `/me`)?

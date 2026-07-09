# A1.5 — ACTION MODEL FREEZE

> Bước Product Design. **Không code, không migration, không commit.** Khóa nghiệp vụ/UI/DB/workflow để A2 chỉ việc code.
> Ngày 2026-07. Grounded bằng tài liệu quản trị thật của BHL (Họp Tác nghiệp hàng tháng — xem §0).

> **R1 — Cập nhật sau review (2026-07):** 5 điều chỉnh, đã hợp nhất vào các mục dưới:
> (1) làm rõ **Owner ≠ Assignee** (§1a); (2) đổi tên **Action Update = "Nhật ký điều hành"**, enum 7 loại (§8);
> (3) Action Detail bám họp BLĐ, header có Project (§16.2); (4) **ĐIỀU CHỈNH:** Action **bắt buộc** Org Unit
> **+ liên kết 1 Project (nullable)** (§12) — kèm phân tích visibility; (5) khóa **Comment (sửa/xóa được) vs
> Action Update (immutable)** (§8a). Thêm §19 Future Reservation (kỳ họp). Delta A2 cập nhật ở §11/§18.

---

## 0. Thực tế BHL đang quản lý "Action Log" như thế nào (bằng chứng)

Nguồn: SharePoint `BanTaichinhKiemsoatNoibo/.../FPA Báo cáo Tác Nghiệp hàng tháng/` — bộ **"Họp Tác nghiệp"** + **"Biên bản Họp Tác nghiệp"** hàng tháng (202512, 202603…).

Quan sát cốt lõi:
1. **Nhịp quản lý = HỌP TÁC NGHIỆP HÀNG THÁNG.** Cuối buổi chốt lịch tháng sau ("Họp tác nghiệp tháng 1/2026 vào 14h 5/1/2026").
2. **Artifact trung tâm = "KẾ HOẠCH HÀNH ĐỘNG / Kế hoạch thực hiện tháng của các phòng/ban"** — một **bảng theo TỪNG PHÒNG/BAN**, cột: **Đầu việc · Chi tiết · Deadline**.
   - "Đầu việc" = mục tiêu/cam kết cấp quản lý, vd: *"Mở mới NPP bia hơi 2026"*, *"Dự án: Lắp đặt 03 silo malt 500m³ Đông Mai"*, *"Chiến dịch Tết 2026"*, *"Kiểm tra thuế Công ty Đông Mai"*.
   - "Chi tiết" đã chứa sẵn **các dòng cập nhật CÓ NGÀY**: *"06/09/2025 đã chuyển máy nén CO2…"; "03/12/2025 hệ thống CO2 đã vận hành"* → chính là **Progress Update** mà đề bài mô tả.
3. **Phần "Thảo luận"** = ý kiến/đề xuất/kiến nghị từng phòng + chỉ đạo TGĐ (dạng "→"). Đây là lớp **khó khăn / kiến nghị / quyết định**.
4. **TGĐ/CT HĐQT yêu cầu rõ:** *"nội dung công việc có số liệu, thời gian, Deadline rõ ràng"*, *"các phòng ban tuân thủ thời hạn cập nhật kế hoạch, **action log**"*, format *"Kế hoạch – Thực hiện – cùng kỳ năm ngoái"*.
5. **KPI đo riêng ở HCNS** (*"đo KPIs các phòng/ban khối nghiệp vụ; danh mục KPI khối sản xuất"*) → xác nhận KPI ≠ Action, KPI là việc của HRM/HCNS.

**Kết luận nền tảng:** "Action" của BHL = **đầu việc quản lý cấp phòng/ban, có deadline, được cập nhật tiến độ theo dòng thời gian, và review bằng họp tháng** — KHÔNG phải task giao cho cá nhân. App phải mô hình đúng thứ này, đừng bịa PMO.

---

## 1. Action là gì

**Action = Đầu việc quản lý / cam kết (management commitment) của một Org Unit.**

- Trả lời: *"Phòng/ban này CAM KẾT làm gì, tới hạn nào, đang tới đâu?"*
- Thuộc **đúng 1 Org Unit chịu trách nhiệm**. Có **owner** (trưởng phòng/giám đốc), **deadline**, **status**, **progress**, **period (tháng)**.
- Được **cập nhật tiến độ theo dòng thời gian** (Action Updates) và **review bằng họp tác nghiệp tháng** (không phải nghiệm thu hệ thống).
- **KHÔNG giao cho nhân viên.** **KHÔNG tự sinh KPI.** **KHÔNG có luồng submit/accept.**
- Có thể **sinh 0..n Task** để thực thi (nhưng không bắt buộc — nhiều Action chỉ theo dõi bằng update tường thuật).

### 1a. Owner vs Assignee (khóa)

Action **không có assignee**, nhưng **bắt buộc có Owner**.

| | Action Owner | Task Assignee |
|---|---|---|
| Là ai | Người **chịu trách nhiệm báo cáo** Action (trưởng phòng / giám đốc) | Người **thực thi** một Task |
| Trên bảng | `actions.owner_user_id` | `tasks.assignee_id` |
| Số lượng | 1 | 1 / task |

Ví dụ: Action **"Go-live ERP"** → Owner = **Giám đốc CNTT**. Các Task bên dưới: *API → Dũng*, *Deploy → Tuấn*, *Training → Hùng*. Owner (GĐ CNTT) **không** phải assignee của bất kỳ task nào — ông chỉ chịu trách nhiệm báo cáo Action.

Action **bắt buộc** 3 trường người/đơn vị: `owner_user_id`, `org_unit_id`, `created_by`. *(A1 đã có đủ: ownerId, orgUnitId, createdById.)*

## 2. Task là gì

**Task = đơn vị thực thi, giao cho một người.**

- Luôn có: **assignee, creator, org_unit_id** (bắt buộc nghiệp vụ), **action_id (nullable)**, **project_id (nullable)**.
- Có **subtask, review, KPI evidence**. Chỉ Task mới **review** và chỉ Task `is_scorable` mới **sinh task_kpi_result**.

## 3. Khác nhau (chống chồng lớp)

| Tiêu chí | Action | Task |
|---|---|---|
| Bản chất | Cam kết/mục tiêu quản lý | Việc thực thi |
| Giao cho cá nhân? | **KHÔNG** (chỉ có owner phụ trách) | **CÓ** (assignee) |
| Thuộc Org Unit | Bắt buộc | Bắt buộc (nghiệp vụ) |
| Thuộc Project | **Nullable** — liên kết 1 project làm bối cảnh (§12) | Nullable |
| Review/nghiệm thu | **KHÔNG** (review = họp tháng) | **CÓ** (submit → Đạt/Trả lại) |
| Sinh KPI | **KHÔNG** | Có, nếu `is_scorable` |
| Tiến độ | Manual + có thể auto từ task | Manual / theo trạng thái |
| Cập nhật | Action Updates (dòng thời gian) | Comment + Activity |
| Ai xem | BLĐ/khối/phòng (Action Log) | Người liên quan task |

**Không chồng nhau** vì ranh giới cứng: *Action không assignee, không review, không KPI; Task luôn có assignee.* Một câu: **Action là cái báo cáo lên trên; Task là cái làm bên dưới.**

**Lớp dữ liệu ĐANG THIẾU (phát hiện):** hiện app chỉ có Task. Thiếu (a) lớp **Action** (cam kết quản lý) và (b) **Action Update** (nhật ký tiến độ có ngày) — đúng thứ BLĐ đang gõ tay vào ô "Chi tiết" của slide. A1 đã tạo bảng `actions`; **còn thiếu `action_updates`** → bổ sung ở A2 (xem §11).

---

## 4. Action Lifecycle

```
draft ──► in_progress ──► done
   │           │  ▲ │
   │           ▼  │ └────► cancelled
   │        on_hold / at_risk
   └──────────► cancelled
```
- **draft**: mới tạo, chưa cam kết chính thức (chưa vào action log tháng).
- **in_progress**: đang thực hiện.
- **on_hold**: tạm dừng (vd chờ phê duyệt/nguồn lực) — ứng với *"Đang chờ Bravo"* trong ví dụ.
- **at_risk**: có nguy cơ trễ hạn/không đạt (để BLĐ nhìn thấy sớm — đúng nhu cầu "rủi ro không hoàn thành KH" trong biên bản).
- **done**: hoàn thành (có Kết quả).
- **cancelled**: hủy/không làm nữa.

Review Action = **cuộc họp tác nghiệp tháng** đọc các update + đổi status, KHÔNG phải luồng accept/return trong hệ thống.

## 5. Task Lifecycle (đã có, giữ nguyên)

```
todo → doing → (waiting/paused) → [submitted → returned↺ / done]     (review_required)
todo → doing → done                                                   (self)
done → (nếu is_scorable) → sinh task_kpi_result (pushStatus=pending) → HRM (A6)
```

---

## 6. Action Dashboard (theo vai trò)

Nguyên tắc: **BLĐ nhìn ACTION, không nhìn Task.** Dữ liệu scope server-side theo `org_unit_id` + `org_unit_roles`.

- **TGĐ (org_unit_roles.ceo, include_children):** Action Log **toàn công ty**, group **Khối → Phòng → Action**. Bộ lọc **period (tháng)**. Mỗi dòng Action: tên · phòng · owner · deadline · status(màu) · progress% · **update mới nhất**. Đây chính là bản số hóa slide "Kế hoạch thực hiện tháng của các phòng/ban". Nhấn mạnh: quá hạn/at_risk lên đầu.
- **Giám đốc khối (block_director, include_children):** Action Log của **khối mình** → group theo Phòng.
- **Trưởng phòng (department_manager):** Action Log **phòng mình**; drill vào Action xem **Task liên quan**.
- **Nhân viên:** **KHÔNG có dashboard Action Log.** Chỉ thấy Action như **bối cảnh read-only** trên task của mình ("Việc này thuộc mục tiêu: …"). Không cho tạo/sửa Action.

## 7. Action Detail (bố cục các mục 1–10)

Gộp 10 mục đề bài thành cấu trúc thực thi được:

| Mục đề bài | Hiện thực |
|---|---|
| 1. Thông tin chung | Header: title, org_unit, **owner**, **project (nullable)**, priority, period |
| 2. Tiến độ | progress% + progress_mode |
| 3. Timeline | created_at, deadline, (mốc từ Action Updates) |
| 4. Khó khăn | Action Update `type=difficulty` |
| 5. Kiến nghị | Action Update `type=recommendation` |
| 6. Kết quả | Action Update `type=result` (khi done) hoặc field `result` |
| 7. Task liên quan | list Task có `action_id = this` |
| 8. Comment | thảo luận (sửa/xóa được) — TÁCH khỏi Nhật ký điều hành, xem §8a; **tier A3** |
| 9. History | Activity (audit đổi status/owner/deadline) |
| 10. Attachment | Attachment (polymorphic — giai đoạn sau) |

→ **Mục 4/5/6 KHÔNG cần field riêng**; chúng là **Action Update có `type`**. Gọn và khớp thực tế (họ vốn ghi lẫn trong "Chi tiết").

## 8. Action Update = "NHẬT KÝ ĐIỀU HÀNH" — bảng riêng, IMMUTABLE (QUYẾT ĐỊNH)

**Đổi tên chính thức: KHÔNG gọi "Progress Update" — gọi "Action Update" = *Nhật ký điều hành*.**

**Phán quyết: TÁCH BẢNG RIÊNG `action_updates`.** Không dùng `comments`, không dùng `activities`.

Bản chất: **lịch sử báo cáo quản lý** — dòng thời gian có ngày, có người cập nhật, **append-only (immutable)**. Chính là số hóa:
```
05/08  Đã khảo sát.
08/08  Bravo chưa bàn giao API.
12/08  Đề nghị gia hạn 5 ngày.
15/08  TGĐ đồng ý.
```

**enum `ActionUpdateType` (7 loại — chốt):**
| type | nghĩa | ví dụ |
|---|---|---|
| `progress` | tiến độ đã làm | "Đã khảo sát" |
| `issue` | khó khăn/vướng mắc | "Bravo chưa bàn giao API" |
| `risk` | rủi ro trễ hạn/không đạt | "Có thể trễ 30/09" |
| `recommendation` | kiến nghị/đề xuất | "Đề nghị gia hạn 5 ngày" |
| `decision` | quyết định của cấp trên | "TGĐ đồng ý gia hạn" |
| `result` | kết quả khi đóng Action | "Go-live thành công 28/09" |
| `note` | ghi chú điều hành khác | (chung) |

Đánh giá "cần thêm loại nào không": **7 loại là đủ** cho Action Log BHL (khớp progress / khó khăn / rủi ro / kiến nghị / chỉ đạo / kết quả trong biên bản họp). *milestone/blocker* không cần (gộp vào progress/issue). Giữ 7, không phình.

`action_updates`: `id, action_id, author_id, type(ActionUpdateType), content, progress_value?(snapshot), status_from?, status_to?, created_at`. **Không có `updated_at`, không có `deleted_at` → immutable.**

### 8a. Comment vs Action Update (KHÓA ĐỊNH NGHĨA)

| | **Comment** | **Action Update (Nhật ký điều hành)** |
|---|---|---|
| Bản chất | Thảo luận | Lịch sử báo cáo quản lý |
| Sửa? | **Được** | **KHÔNG** |
| Xóa? | **Được** (soft-delete) | **KHÔNG** |
| Có ngày/người | có | có (là cốt lõi) |
| Có type/timeline | không | có |
| Ai đọc để điều hành | tham khảo | **TGĐ/BLĐ đọc chính** |

→ Hai thứ **tách bạch**. Action Update **append-only**; muốn đính chính thì **thêm 1 update mới**, không sửa cái cũ (giữ toàn vẹn nhật ký).
→ **Comment trên Action** (editable, thảo luận) = nâng `comments` thành polymorphic (`task_id?`/`action_id?`). Là **tier A3**, không bắt buộc A2. MUST của A2 chỉ là `action_updates`.

## 9. Action Progress — Hybrid, mặc định MANUAL (QUYẾT ĐỊNH)

| Cách | Ưu | Nhược |
|---|---|---|
| Manual | Đúng cách BLĐ đang làm; owner chủ động; hợp Action không chia task | Phụ thuộc kỷ luật cập nhật |
| Auto từ Task | Khách quan | Nhiều Action **không** chia hết thành task → auto = sai/0% |
| **Hybrid** | Manual là chính; bật Auto khi Action đã chia đủ task | Cần cờ chọn |

**Chốt:** `progress_mode` (đã có ở A1): **default `manual`**. `auto_from_tasks` là opt-in (progress = trung bình progress task con, hoặc % task done) — **triển khai auto ở phase sau**, A2/A3 chỉ làm manual. Đúng doanh nghiệp: hiện họ báo tiến độ bằng lời, không có công thức.

## 10. Action Status (enum chốt)

**Chốt enum:** `draft, in_progress, on_hold, at_risk, done, cancelled`.

⚠️ **Delta so với A1:** A1 đã tạo `action_status = {todo, doing, done, paused}` (tạm). Cần migration NHỎ đầu A2 đổi thành enum trên (chưa có code/dữ liệu dùng nên không phải refactor lớn). *Không đổi bây giờ.*

Map: todo→draft, doing→in_progress, paused→on_hold, +thêm at_risk, cancelled.

---

## 11. Database (đề xuất cuối + quan hệ)

Trạng thái sau A1 + delta cần cho A2:

```
org_units (HRM cache)
  └─1..n actions            [A1 CÓ — cần đổi enum status (§10) + THÊM cột project_id nullable (§12)]
        └─1..n action_updates   ★ THÊM MỚI ở A2 (bảng IMMUTABLE + enum action_update_type 7 loại)
        └─0..n tasks (action_id nullable)   [A1 CÓ cột]
users
  └─ owner_user_id / created_by của actions [A1 CÓ]
  └─ author của action_updates              (mới)
projects (= workspace type=project, P1)
  ├─ 0..n actions (project_id nullable, KHÔNG phải ACL — §12a)  ★ cột mới
  └─0..n tasks (project_id nullable)        [A1 CÓ cột]
tasks  [A1 đã đủ chiều: org_unit_id, project_id, action_id, is_scorable, kpi_*]
  ├─ subtasks
  ├─ task_reviews (1-1)
  ├─ task_kpi_results (evidence → HRM)      [A1 CÓ]
  ├─ comments / activities / attachments
kpi_definitions (cache HRM|local_seed)      [A1 CÓ]
```

**Bảng DUY NHẤT phải thêm ở A2: `action_updates`** (+ enum `action_update_type`). Ngoài ra: đổi enum `action_status` + thêm cột `actions.project_id`. **Không** đẻ thêm bảng nào khác → giữ scope, không thành Work Hub.

Quan hệ khóa:
- `actions.org_unit_id → org_units.id` (RESTRICT, NOT NULL) · `actions.owner_user_id/created_by → users.id`.
- `actions.project_id` → workspace(type=project) — **cột nullable, KHÔNG FK cứng**, KHÔNG dùng cho ACL (§12a).
- `action_updates.action_id → actions.id` (CASCADE) · `action_updates.author_id → users.id`. **Append-only** (không update/delete).
- `tasks.action_id → actions.id` (SET NULL) — đã có ở A1.
- Comment(sửa/xóa được) trên Action + Attachment: **hoãn** (comments polymorphic, tier A3), không chặn A2.

## 12. Action + Project (QUYẾT ĐỊNH — R1 ĐIỀU CHỈNH)

**Action BẮT BUỘC thuộc 1 Org Unit (chịu trách nhiệm) VÀ có thể liên kết 1 Project (nullable, làm bối cảnh).**

- `actions.org_unit_id` **NOT NULL** — *ai chịu trách nhiệm*.
- `actions.project_id` **nullable** — *Action phục vụ dự án nào*.

Ví dụ **"Go-live ERP"**: `org_unit_id = Ban CNTT`, `project_id = ERP`. Task bên dưới (API/Deploy/Training) vẫn mang `org_unit_id` + `project_id` + `action_id` như A1 — **không đổi**.

**Delta schema:** thêm `actions.project_id` (nullable) — cột thường, **không đặt FK cứng** (P1: project = workspace type=project; để dễ tách bảng `projects` sau). Đây là cột additive nhỏ, thêm ở A2.

### 12a. Phân tích mâu thuẫn với visibility hiện tại

Visibility hiện tại (A1): **Task** = `OR[creator, assignee, collaborator, watcher, org_unit_id ∈ visibleOrgUnitIds, project_id ∈ myProjectIds]`.

**Action visibility (đề xuất) = CHỈ theo Org Unit:** `org_unit_id ∈ visibleOrgUnitIds(me)` (gồm include_children cho GĐ khối/TGĐ). **`project_id` KHÔNG mở rộng quyền xem Action.**

Lý do & rủi ro nếu để project_id widen quyền:
- Action là **cam kết quản lý** (deadline, at_risk, kiến nghị, chỉ đạo TGĐ). Nếu cho **mọi member của project** thấy Action chỉ vì cùng project → **rò rỉ thông tin điều hành** cho cộng tác viên ngoài đơn vị (vd 1 dev junior trong project ERP thấy được đánh giá "at_risk" + chỉ đạo TGĐ của Ban CNTT). **Không nên.**
- → **Chốt:** `project_id` trên Action chỉ là **nhãn/bộ lọc**, KHÔNG phải ACL. Quyền xem Action thuần theo cây tổ chức. **Không mâu thuẫn** với visibility Task (Task vẫn có quyền project riêng của nó).
- Nếu tương lai cần "thành viên project xem action liên kết" → làm **opt-in tường minh** (read-only), không mặc định. Ghi chú, **không làm A2**.

Kết luận: thiết kế Action.project_id **nullable + không phải ACL** → an toàn, không phá visibility hiện có.

## 13. Action + KPI (QUYẾT ĐỊNH)

**Action KHÔNG tính KPI.** Chỉ **Task** (`is_scorable=true`) sinh `task_kpi_result`. Action chỉ là container mục tiêu; KPI nhân viên do HRM tính từ evidence task. (Nếu cần "điểm hoàn thành action" sau này → là chỉ số quản trị nội bộ, không phải KPI HRM, và vẫn suy từ task/deadline — không gắn vào Action bảng.)

## 14. Action + Review (QUYẾT ĐỊNH)

**Action KHÔNG có luồng review/nghiệm thu trong hệ thống.** "Review" của Action = **họp tác nghiệp tháng** + đổi `status` + đọc `action_updates`. Chỉ **Task** có submit → Đạt/Trả lại.

---

## 15. Reports vs Action Log (menu)

**Chốt:** **Action Log = màn quản trị CHÍNH** cho BLĐ/khối/phòng. Trang **Báo cáo** hiện tại (thống kê hoàn thành task theo phòng) **giữ lại nhưng hạ cấp** thành "Thống kê công việc" (bổ trợ), không phải cửa chính của lãnh đạo.

Menu freeze:
```
Trang chủ · Việc của tôi · Phòng ban · Dự án · ★Action Log · Thống kê(cũ=Báo cáo) · Thông báo
```
(Không xóa Reports để không phá cái đang chạy; nhưng điều hướng lãnh đạo mặc định vào Action Log.)

---

## 16. UI — wireframe text

**16.1 Action List (Action Log)** — mặc định của TGĐ/GĐ/TP:
```
┌ Action Log ───────────────────────────  [Kỳ: Tháng 7/2026 ▾] [+ Tạo Action]┐
│ ▸ KHỐI TÀI CHÍNH & QUẢN TRỊ                                      12 action  │
│    ▾ Phòng Kế toán                                                          │
│      ● Kiểm tra thuế Đông Mai      TP Châu   31/07  [At Risk] ▓▓▓░ 60%  →3d │
│         "14/07 đã cung cấp chứng từ 2023-2024"           (update mới nhất)  │
│      ● Khóa sổ & BCTC tháng 7      TP Châu   05/08  [In Prog] ▓▓░░ 40%      │
│    ▾ Ban Pháp chế                                                           │
│      ● Rà soát HĐ kênh bán lẻ      TB Em     30/07  [On Hold] ▓░░░ 20%      │
│ ▸ KHỐI KINH DOANH                                                8 action   │
│   …                                                                         │
└─ Sắp xếp: Quá hạn/At-risk lên đầu · lọc: [Trạng thái ▾][Phòng ▾][Owner ▾] ─┘
```

**16.2 Action Detail** — bám cách BLĐ họp Action Log (không theo Jira/Asana):
```
┌ ◀ Go-live ERP                                          [Sửa] [Đổi trạng thái]┐
│ Owner: Nguyễn Văn A   Đơn vị: Ban CNTT   Dự án: ERP                          │
│ Deadline: 30/09/2026  Trạng thái: ● In Progress   Tiến độ: ▓▓▓▓░ 75% (manual)│
├─ Tabs: [Nhật ký điều hành] [Task liên quan (4)] [Bình luận] [Lịch sử] ──────┤
│ NHẬT KÝ ĐIỀU HÀNH (Action Updates — không sửa/xóa)     [+ Thêm cập nhật ▾]  │
│  ● 22/08  [Quyết định]  TGĐ yêu cầu hoàn thành trước 30/09   — A            │
│  ● 18/08  [Khó khăn]    Đang chờ Bravo bàn giao API          — A            │
│  ● 15/08  [Tiến độ]     Đã hoàn thành khảo sát               — A   (→40%)   │
├─ TASK LIÊN QUAN ───────────────────────────────────────────────────────────┤
│  □ API       Dũng   Doing  ▓▓▓ 70%      □ Deploy    Tuấn   Todo             │
│  □ UI        Lan    Doing  ▓▓░ 50%      □ Training  Hùng   Todo             │
│                                                            [+ Tạo Task ở đây]│
└─────────────────────────────────────────────────────────────────────────────┘
```
Ghi chú UI: tab **"Bình luận"** (comment, sửa/xóa được) tách khỏi **"Nhật ký điều hành"** (immutable) — đúng §8a. Tab Bình luận là **tier A3**.

**16.3 → Task Detail:** như hiện tại + hiển thị rõ **Đơn vị · Dự án · Action** + KPI/review status (đã chốt A1/audit trước).

---

## 17. Workflow

```
Quản lý (TP/GĐ)                         Nhân viên                Reviewer            HRM
   │ tạo Action (org_unit, owner,           │                       │                 │
   │            deadline, period)           │                       │                 │
   │──► [Action: draft→in_progress]         │                       │                 │
   │ cập nhật Action Update (tiến độ/        │                       │                 │
   │   khó khăn/kiến nghị)                   │                       │                 │
   │ (tùy chọn) sinh Task từ Action ────────►│ nhận Task             │                 │
   │   task.action_id = Action               │ làm, cập nhật %       │                 │
   │   task.org_unit_id, project_id?         │ submit review ───────►│ Đạt/Trả lại     │
   │                                         │                       │ nếu Đạt & is_scorable
   │                                         │                       │──► task_kpi_result (pending)
   │ Action Update (auto/manual) phản ánh    │                       │        │
   │ tiến độ; họp tháng review Action        │                       │        └──► (A6) push HRM
   │──► [Action: done + Update type=result]  │                       │                 │
```
Ghi chú: Action **không** đi qua reviewer/HRM. Chỉ **Task** sinh evidence sang HRM. Action đóng bằng cập nhật `result` + status `done` tại họp tháng.

---

## 18. Khuyến nghị cuối cùng (để A2 chỉ việc code)

1. **Giữ 3 lớp cứng:** OrgUnit → Action (quản lý) → Task (thực thi) → Subtask/Review/KPI-evidence. Project là lớp cộng tác cắt ngang: gắn vào **Task** (`project_id`) và **liên kết được vào Action** (`project_id` nullable, chỉ là bối cảnh — không phải ACL).
2. **Owner ≠ Assignee:** Action có `owner_user_id` (chịu trách nhiệm báo cáo), không có assignee; Task có `assignee_id`.
3. **Thêm đúng 1 bảng ở A2:** `action_updates` = **Nhật ký điều hành**, IMMUTABLE (+ enum `action_update_type`: progress/issue/risk/recommendation/decision/result/note). Đây là lớp còn thiếu, "linh hồn" Action Log.
4. **Đổi enum `action_status`** → `draft/in_progress/on_hold/at_risk/done/cancelled` (migration nhỏ đầu A2).
5. **Action: không assignee, không review, không KPI, progress mặc định manual** (auto_from_tasks để phase sau).
6. **Comment (sửa/xóa) ≠ Action Update (immutable)** — hai thứ tách bạch (§8a).
7. **Action Log là màn lãnh đạo chính**, group Khối→Phòng→Action→(drill) Task, lọc theo tháng (period). Reports cũ hạ cấp. Nhân viên không thấy Action Log — chỉ thấy Action ở header Task.
8. **Hoãn (không làm A2):** comment/attachment/activity polymorphic cho Action, auto-progress, "điểm hoàn thành action", **kỳ họp/meeting (§19)**. Không phá scope.
9. **Không mở rộng** thành PMO/Work Hub/Jira. Mục tiêu: thay Asana + số hóa Action Log tháng + feed evidence KPI sang HRM.

**Delta phải áp ở đầu A2 (additive, nhỏ):** (a) đổi enum `action_status`; (b) thêm bảng `action_updates` + enum `action_update_type`; (c) thêm cột `actions.project_id` (nullable). Ngoài ra A1 đã đủ. Sau A1.5 kiến trúc ổn định — A2/A3 không phải refactor lớn.

---

## 19. Future Reservation — Kỳ họp / Meeting (KHÔNG làm phase này)

Chỉ **reserve kiến trúc**, không code, không tạo bảng ở A2.

Tương lai, Action có thể được gom vào **một kỳ họp** (đúng nhịp "Họp Tác nghiệp tháng"):
```
Họp tháng 8/2026
   ├─ Action A
   ├─ Action B
   └─ Action C
   → Biên bản họp
```
Hướng mở rộng khi cần (không cam kết): bảng `meetings(id, org_scope, period, held_at, minutes…)` + liên kết `action_meetings(meeting_id, action_id)` (n-n) hoặc `actions.meeting_id`. Biên bản = tổng hợp các Action + update trong kỳ.

**Vì sao reserve, không làm:** `actions.period` (đã có ở A1) tạm đủ để nhóm Action theo tháng cho A2/A3. Thêm `meetings` bây giờ là phình scope. Khi BLĐ muốn xuất "Biên bản họp" tự động thì mới làm — kiến trúc hiện tại (Action + period + action_updates) đã đủ chỗ để bồi thêm không phải refactor.

---

### Phụ lục — nguồn thực tế
SharePoint `BanTaichinhKiemsoatNoibo/…/FPA Báo cáo Tác Nghiệp hàng tháng/`: "Họp tác nghiệp 202512/202603.pptx", "202512 BB Họp Tác nghiệp 12.2025.pdf". Cấu trúc "Đầu việc · Chi tiết(update có ngày) · Deadline" theo phòng/ban + phần Thảo luận (kiến nghị/đề xuất/chỉ đạo TGĐ) là cơ sở của mô hình Action + Action Update ở trên.

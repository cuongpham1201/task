# Phân tích cơ cấu tổ chức BHL (từ SharePoint) → mô hình DB App Giao việc

> Loại: phân tích thực tế + đề xuất DB. **Không sửa code, không migration, không commit.**
> Ngày: 2026-07-07. Người thực hiện đọc: cuongpx@biahalong.com (Nhân viên IT).
> Nguyên tắc: **mọi kết luận dẫn chiếu tài liệu SharePoint đã đọc; không chắc thì ghi rõ.**

---

## 1. Executive Summary

- Cơ cấu tổ chức BHL **là cây có thật**, ban hành chính thức qua **Sơ đồ tổ chức KÝ HIỆU 01/2026/SĐTC-BHL, Lần ban hành 05 (tháng 06/2026)**, TGĐ **Doãn Trường Giang** ký.
- **BHL KHÔNG dùng từ "Khối".** Tầng trung gian dưới TGĐ là **các Giám đốc chức năng** (Kinh doanh / Tài chính & Quản trị / Vận hành & Chuỗi cung ứng / Sản xuất – Kỹ thuật, kèm 2 Phó GĐ). Đây chính là tầng tương đương "DIVISION/Khối" khi thiết kế DB.
- **Có cấp Tổ/Nhóm và cấp Bộ phận** thật (dưới Phân xưởng): Phân xưởng → Bộ phận → Tổ. → cây sâu tới **4–5 cấp**.
- **Hai pháp nhân**: Công ty CP Bia và NGK **Hạ Long** (chính) + Công ty CP Bia và NGK **Đông Mai** (công ty con). Sơ đồ là chung cho cả hai; các phân xưởng tồn tại ở **cả Hạ Long và Đông Mai**.
- **Mô hình `org_units` (cây tự tham chiếu) PHÙ HỢP**, nhưng cần điều chỉnh: (a) thêm cấp **BỘ PHẬN** giữa Phòng/Phân xưởng và Tổ; (b) DIVISION = "mảng theo Giám đốc" (đặt tên theo chức danh GĐ, không phải "Khối"); (c) thêm **chiều pháp nhân** (Hạ Long/Đông Mai).
- **Hạn chế dữ liệu:** danh sách đơn vị + tầng Giám đốc lấy được đầy đủ từ mục lục văn bản; nhưng **cạnh nối chính xác "Phòng/Ban thuộc Giám đốc nào" nằm trong hình vẽ (SmartArt) — trình đọc không trích được thành text**. Phần mapping cha-con cấp Giám đốc→Phòng được đánh dấu **[CẦN XÁC NHẬN]**.

---

## 2. Tài liệu SharePoint đã sử dụng

| # | Tên file | Đường dẫn (webUrl) | Ngày/Phiên bản | Vai trò |
|---|---|---|---|---|
| **A (chính)** | `01.2026.SĐTC-HLB-Sơ đồ tổ chức Công ty cổ phần Bia và Nước giải khát Hạ Long.27-06-2026.docx` | `…/sites/ApprovalCenter/ApprovalFiles/2026/20260629.TT-2026-0324/uploads/…` | Sửa đổi 27/06/2026, **KÝ HIỆU 01/2026/SĐTC-BHL, Lần ban hành 05** | **Sơ đồ tổ chức mới nhất** — đã đọc toàn văn |
| B | `01.2026.SĐTC-HLB-…Hạ Long.15-05-2026.docx` (và bản `-v1`, và `484.2026.QĐ-HCNS-…15.05.2026.docx`) | `…/sites/vanbandieuhanh/DMS Library/[00] Văn Bản Điều Hành Chung/…` và `…/Shared Documents/…/Sơ Đồ Tổ Chức Công Ty/` | Ban hành 15/05/2026 (Lần 04) | Bản trước liền kề (đối chiếu) |
| C | `TT-2026-0324_official.pdf` — Tờ trình "Sửa đổi cơ cấu tổ chức Phòng Marketing" | `…/ApprovalCenter/ApprovalFiles/2026/20260629.TT-2026-0324/cert/` | Duyệt ~29–30/06/2026 | Căn cứ phát sinh Lần ban hành 05 |
| D | Bộ `CNNV CÁC PHÒNG BAN` — quy định chức năng nhiệm vụ & cơ cấu từng phòng (mã CNNV10…27, và Tổ) | `…/vanbandieuhanh/DMS Library/[NN] …/` và OneDrive cuongpx `03. Document/CNNV CÁC PHÒNG BAN/` | 2024–2026 (nhiều lần ban hành) | Xác nhận cấp Bộ phận/Tổ trong từng đơn vị |

**Lịch sử sửa đổi Sơ đồ (trích từ file A):** Lần 01 (02/01/2024) · Lần 02 (21/07/2025) · Lần 03 (15/03/2026, bổ sung Phó GĐ Công nghệ) · Lần 04 (14/05/2026, đổi Phó GĐ CN→Phó GĐ SX-KT; chuyển Tổ Bếp ăn/Môi trường-Đời sống về HCNS; chuyển bộ phận Điều độ TTĐH→KHVT; sửa cơ cấu các phân xưởng, KHVT, Ban SHE) · **Lần 05 (…/06/2026, sửa cơ cấu Phòng Marketing)** — bản đang dùng.

> Có nhiều bản trùng tên ở các site khác nhau (DMS Library, ApprovalCenter, OneDrive cá nhân). **Bản mới nhất = file A (27/06/2026, Lần ban hành 05).**

---

## 3. Cây tổ chức thực tế (theo file A)

**Cấp pháp nhân:**
```
Tổng Công ty (nhóm)
├── Công ty CP Bia và NGK Hạ Long        (pháp nhân chính)
└── Công ty CP Bia và NGK Đông Mai       (công ty con)
```

**Cấp điều hành & chức năng (Mục II — "Các vị trí/phòng/ban"):**
```
[01] Tổng Giám đốc  (Doãn Trường Giang)
 ├── [02] Giám đốc Kinh Doanh
 ├── [03] Giám đốc Tài chính và Quản trị (TC&QT)      (Nguyễn Quang Dũng)
 ├── [04] Giám đốc Vận hành và Chuỗi cung ứng
 └── [05] Giám đốc Sản xuất – Kỹ thuật
      ├── [06.01] Phó Giám đốc phụ trách Thiết bị
      └── [06.02] Phó Giám đốc Sản xuất – Kỹ thuật
```

**Các Ban/Phòng/Kênh/Trung tâm (đơn vị cấp "phòng ban"):**
```
[07] Ban Pháp chế Tuân thủ
[08] Ban Tài chính – Kiểm soát Nội bộ
[09] Ban S-H-E
[10] Phòng Kỹ thuật, Công nghệ, và Cải tiến Sản xuất
[11] Phòng Vận hành Kinh doanh
[12] Phòng Marketing
[13] Phòng Kinh doanh Bia hơi
[14] Phòng Kế toán
[15] Phòng Kế hoạch – Vật tư
[16] Phòng Hành chính – Nhân sự
[17] Phòng Kiểm soát Chất lượng – KCS
[18] Phòng Cơ điện
[19] Kênh Phân phối
[20] Kênh Khách hàng Tổ chức
[22] Trung tâm Điều hành
```

**Khối sản xuất — có cấp Bộ phận & Tổ (4 phân xưởng, 2 nhà máy):**
```
[24] Phân xưởng Sản xuất Đông Mai
     ├── [24.1] Bộ phận Công nghệ → [24.1.1] Tổ nấu · [24.1.2] Tổ lọc · [24.1.3] Tổ lên men
     ├── [24.2] Bộ phận Đóng gói → Tổ DC Bia lon · Tổ DC Bia chai · Tổ DC Chiết Keg
     ├── [24.3] Tổ vệ sinh công nghiệp
     └── [24.4] Thống kê
[25] Phân xưởng Cơ điện – Động lực Đông Mai
     ├── [25.1] Bộ phận Cơ điện Xây dựng → Tổ Bảo trì-SC-XD đóng gói · Tổ Bảo trì-SC-XD-Công nghệ phụ trợ · Tổ trực điện
     ├── [25.2] Bộ phận Động lực → Tổ Máy lạnh CO2 Khí nén · Tổ Vận hành Lò hơi · Tổ Xử lý nước cấp-nước thải
     └── [25.3] Nhân viên hỗ trợ kỹ thuật
[26] Phân xưởng Sản xuất Hạ Long
     ├── [26.1] Bộ phận Công nghệ → Tổ xay nghiền-nấu · Tổ lên men-lọc
     ├── [26.2] Bộ phận Đóng gói → Tổ đóng gói 1 · 2 · 3
     ├── [26.3] Tổ vệ sinh công nghiệp
     └── [26.4] Nhân viên thống kê
[27] Phân xưởng Cơ điện – Động lực Hạ Long
     ├── [27.1] Bộ phận Cơ điện – Xây dựng → Tổ Bảo trì-SC-XD đóng gói · Tổ Bảo trì-SC-XD-CN phụ trợ · Tổ trực điện
     └── [27.2] Bộ phận Động lực → Tổ Vận hành Máy lạnh-CO2-Khí nén · Tổ Vận hành Lò hơi · Tổ Xử lý nước cấp-thải · NV hỗ trợ kỹ thuật
```

### 3b. Cạnh cha-con ĐÃ XÁC NHẬN (nguồn: dữ liệu HRM `salary-app`)

Cạnh nối "Phòng/Ban → Khối" không trích được từ SmartArt, nhưng **lấy chính xác từ HRM** (`organization_orgblock` + `organization_department.block`, kind=DIVISION — bản dev `db.sqlite3.pre-admin-hr-20260626`). HRM có **5 block**: **BDH** (Ban Điều Hành = cấp TGĐ, KHÔNG phải khối chức năng) + **4 khối chức năng** khớp đúng 4 Giám đốc:

| Khối (block HRM) = Giám đốc | Đơn vị trực thuộc (kind=DIVISION) |
|---|---|
| **BDH** — Ban Điều Hành (TGĐ) | Ban Điều Hành (Hạ Long, Đông Mai) |
| **OFFICE** — Khối Tài chính & Quản trị (GĐ TC&QT) | Ban Pháp chế–Tuân thủ · Ban Tài chính–KSNB · Phòng HCNS · Phòng Kế toán |
| **SALES** — Khối Kinh Doanh (GĐ Kinh doanh) | Kênh Bán Lẻ · Kênh KHTC · Kênh Phân phối · Phòng KD Bia hơi · Phòng Marketing · Phòng Vận hành KD |
| **SX** — Khối Sản Xuất (GĐ Sản xuất–Kỹ thuật) | PX Sản xuất Hạ Long · PX Sản xuất Đông Mai · PX Cơ điện-ĐL Hạ Long · PX Cơ điện-ĐL Đông Mai · Phòng Cơ điện · Phòng KCS · Phòng KTCN&CTSX |
| **TRANSPORT** — Khối Vận hành & Chuỗi cung ứng (GĐ VH&CCƯ) | Ban ISO · Ban S-H-E · Phòng KH–Vật tư · Trung tâm Điều hành |

HRM đếm: **27 DIVISION** (gồm bản Hạ Long/Đông Mai riêng cho các đơn vị 2 nhà máy), 79 SECTION (Bộ phận), 41 TEAM (Tổ).

**Khác biệt so với sơ đồ SharePoint (file A) cần chốt bản chuẩn:**
- HRM có **Kênh Bán Lẻ** và **Ban ISO** mà Mục II file A không liệt kê rõ (khác phiên bản).
- **Ban S-H-E** thuộc **TRANSPORT** (VH&CCƯ) theo HRM (không phải SX).
- Chiều **pháp nhân**: một số phân xưởng tên "Hạ Long" gắn `entity=DONGMAI` — **đã xác nhận là ĐÚNG theo HRM** (chủ đích), App lấy y theo HRM.

---

## 4. Phân tích cơ cấu

- **Tầng nhóm trên = Giám đốc chức năng** (4 GĐ + 2 Phó GĐ), KHÔNG gọi là "Khối". Khi thiết kế DB, tầng này = `DIVISION` nhưng **đặt tên theo mảng/chức danh GĐ**.
- **Đơn vị ngang cấp phòng/ban:** ngoài "Phòng" và "Ban", còn có **"Kênh"** (Kênh Phân phối, Kênh KHTC) và **"Trung tâm"** (Trung tâm Điều hành). → cùng cấp DEPARTMENT nhưng khác nhãn loại.
- **Có cấp Bộ phận (sub-department)** và **cấp Tổ (TEAM)** thật — chủ yếu ở khối sản xuất. Văn phòng (Kế toán/HCNS/…) hầu như phẳng (phòng → nhân viên), một số có bộ phận nội bộ.
- **Đơn vị trực thuộc TGĐ:** một số Ban báo cáo thẳng TGĐ (Pháp chế Tuân thủ, Tài chính-KSNB, S-H-E thường trực thuộc cấp cao) — **[CẦN XÁC NHẬN từ sơ đồ]**.
- **Đa pháp nhân:** phân xưởng SX & CĐ-ĐL tồn tại ở **cả Hạ Long lẫn Đông Mai**; phòng ban văn phòng dùng chung cấp Tổng Công ty. → cây phải mang chiều pháp nhân.
- **Cơ cấu thay đổi thường xuyên** (5 lần ban hành trong ~18 tháng) → mô hình DB phải **dễ sync/chỉnh**, không hard-code.

---

## 5. Ảnh hưởng tới App Giao việc

| Yêu cầu App | Ánh xạ từ cơ cấu thực tế |
|---|---|
| Nhân viên thấy task phòng mình | `user.org_unit_id` = Phòng/Ban/Tổ đang thuộc |
| Trưởng phòng thấy toàn phòng | `org_unit_roles(MANAGER, SELF_ONLY)` tại Phòng đó |
| Giám đốc Khối thấy các phòng trong mảng | `org_unit_roles(MANAGER, INCLUDE_CHILDREN)` tại node **Giám đốc chức năng** (DIVISION) |
| TGĐ thấy toàn công ty | `org_unit_roles(MANAGER, INCLUDE_CHILDREN)` tại **COMPANY** |
| Project độc lập như Asana | workspace `PROJECT`, member thủ công |

→ Mô hình đã đề xuất ở `org-workspace-visibility-design.md` **áp dụng được**, với 2 lưu ý từ thực tế: (1) tầng DIVISION là **Giám đốc chức năng**; (2) cây sâu 4–5 cấp (có Bộ phận + Tổ) → visibility cha-con phải dùng **closure/đệ quy** (đã đề xuất). Nhân sự sản xuất có Tổ trưởng → có thể cần role MANAGER ở cấp Tổ.

---

## 6. Database đề xuất (theo cơ cấu thực tế)

```sql
org_units (
  id           uuid pk,
  parent_id    uuid null → org_units.id,
  name         text,            -- "Phòng Kế toán", "Tổ nấu"
  code         text,            -- đối chiếu HRM/số hiệu [14], CNNV14…
  type         enum,            -- xem dưới
  legal_entity enum HALONG|DONGMAI|GROUP,   -- chiều pháp nhân (mới, từ thực tế 2 công ty)
  manager_user_id uuid null,
  sort_order   int,
  active       bool,
  source       enum HRM|MANUAL, hrm_ref text null
)
```

**`type` mở rộng theo thực tế** (thay vì chỉ 4 mức):
`COMPANY` (Hạ Long/Đông Mai) · `DIVISION` (mảng Giám đốc: KD / TC&QT / VH&CCƯ / SX-KT) · `DEPARTMENT` (Phòng/Ban/Kênh/Trung tâm/Phân xưởng) · `SUB_DEPT` (Bộ phận — vd Bộ phận Công nghệ/Đóng gói/Động lực) · `TEAM` (Tổ).

> Vì `parent_id` là cây tự tham chiếu **đa cấp tùy ý**, `type` chỉ là NHÃN hiển thị/lọc — không giới hạn số cấp. Đây là điểm mạnh: cơ cấu đổi (thêm/bớt cấp) không phải đổi schema.

Giữ nguyên đề xuất `workspaces` / `workspace_members` / `org_unit_roles` / `org_unit_closure` như `org-workspace-visibility-design.md`.

---

## 7. Permission model (áp cơ cấu BHL)

- **System:** ADMIN (IT) / USER.
- **Org (qua `org_unit_roles`):**
  - TGĐ → COMPANY, MANAGER, INCLUDE_CHILDREN.
  - Giám đốc chức năng (KD/TC&QT/VH&CCƯ/SX-KT) → node DIVISION tương ứng, MANAGER, INCLUDE_CHILDREN.
  - Phó GĐ → DIVISION hoặc DEPARTMENT, MANAGER (tùy phân công).
  - Trưởng Phòng/Ban/Kênh/Trung tâm → DEPARTMENT, MANAGER, SELF_ONLY (INCLUDE_CHILDREN nếu phòng có Bộ phận/Tổ).
  - Quản đốc phân xưởng → DEPARTMENT(Phân xưởng), MANAGER, INCLUDE_CHILDREN (phủ Bộ phận/Tổ).
  - Tổ trưởng → TEAM, MANAGER, SELF_ONLY.
  - Nhân viên → chỉ `user.org_unit_id` (không cần dòng role).
- **Project:** OWNER/MANAGER/MEMBER/VIEWER (thuần App).

Ma trận hành động (View/Create/Edit/Assign/Status/Comment/Review/Delete/Report) theo nhóm: dùng đúng bảng ở `org-workspace-visibility-design.md §6`.

---

## 8. Visibility model (query)

```
TGĐ            → COMPANY + toàn bộ cây con (INCLUDE_CHILDREN)
Giám đốc mảng  → node DIVISION của mình + mọi org_unit con (các Phòng/Ban trong mảng)
Trưởng phòng   → org_unit của mình (+ Bộ phận/Tổ con nếu có)
Tổ trưởng      → Tổ của mình
Nhân viên      → task thuộc workspace ORG_UNIT của org_unit mình + project mình tham gia
```
Thực thi: predicate `canViewTask` + query `WHERE` dùng `org_unit_closure` (đã đặc tả ở `org-workspace-visibility-design.md §5`). **Report cũng scope y hệt.**

---

## 9. Workspace model

- **ORG_UNIT workspace:** 1 workspace/đơn vị có việc riêng (Phòng/Ban/Kênh/Trung tâm/Phân xưởng/Tổ). Member **suy động** từ `user.org_unit_id` + `org_unit_roles` (nguồn HRM). Không add tay.
- **PROJECT workspace:** owner tạo, add member thủ công, độc lập pháp nhân/phòng ban (liên phòng, liên nhà máy được).
- **Task luôn thuộc đúng 1 workspace.**

---

## 10. Migration đề xuất (KHÔNG chạy)

| Bước | Cần làm | Ghi chú thực tế |
|---|---|---|
| M1 | Tạo `org_units` + `org_unit_closure`; seed **2 COMPANY** (Hạ Long, Đông Mai) + **4 DIVISION** (theo 4 Giám đốc) | tên DIVISION theo chức danh GĐ |
| M2 | Nhập 19 đơn vị cấp DEPARTMENT ([07]–[27]) + Bộ phận (SUB_DEPT) + Tổ (TEAM) từ file A | gắn `legal_entity` cho phân xưởng HL/ĐM |
| M3 | Chốt cạnh cha-con **Phòng→Giám đốc** (đọc sơ đồ SmartArt file A / từng CNNV) | **[CẦN XÁC NHẬN]** trước khi seed |
| M4 | `workspaces`: tạo ORG_UNIT-workspace cho đơn vị có việc; convert `projects` → PROJECT | |
| M5 | `tasks.workspace_id` + backfill từ `department_id/project_id/scope` | dữ liệu hiện là demo |
| M6 | `org_unit_roles` (TGĐ, 4 GĐ, trưởng phòng, quản đốc, tổ trưởng) + `users.org_unit_id` | |
| M7 | Viết lại PolicyService + query scoping + UI menu đệ quy | |

**Giữ nguyên:** tasks/subtasks/comments/activities/notifications/task_reviews/external_*_mappings.
**Chưa nên đổi:** giữ MVP hiện tại (departments phẳng) chạy UAT; chỉ đổi sang org_units sau khi (a) chốt cạnh cha-con, (b) MVP qua UAT.

---

## 11. Kiểm tra tính tương thích HRM

- **Thuận lợi:** HRM (`salary-app`) đã có sẵn `organization.Department` (cây, có `parent`, `kind` DIVISION/SECTION/TEAM, `head`+`deputies`), `LegalEntity` (Hạ Long/Đông Mai), và **`OrgBlock`** (5 khối: BĐH/SX/Sales/Vận tải/Văn phòng). → HRM **đã mô hình cây + khối + pháp nhân**, map thẳng vào `org_units`/`org_unit_roles` rất khớp. (Xem `hrm-taskhub-integration-audit.md`.)
- **Mapping:** HRM `Department.kind` → `org_units.type`; HRM `LegalEntity` → `legal_entity`; HRM `head`/`deputies` → `org_unit_roles`; HRM `Employee.division/sub_unit` → `users.org_unit_id`; HRM `OrgBlock` → tầng DIVISION (nếu dùng khối thay vì Giám đốc).
- ⚠️ **Khác biệt cần chốt:** Sơ đồ SharePoint nhóm theo **Giám đốc chức năng**; HRM `OrgBlock` nhóm theo **5 khối**. Hai cách nhóm có thể **không trùng nhau** → phải chọn 1 chuẩn cho tầng DIVISION (khuyến nghị: theo HRM khi đã sync, vì HRM là nguồn master).
- **Khi HRM đổi cơ cấu:** sync job cập nhật `org_units` (source=HRM), rebuild `org_unit_closure`, cập nhật `users.org_unit_id` + `org_unit_roles(source=HRM)`; giữ nguyên dòng `source=MANUAL` (override tay) và toàn bộ PROJECT.

---

## 11b. QUYẾT ĐỊNH ĐÃ CHỐT (2026-07-07)

**HRM (`salary-app`) là NGUỒN MASTER cho cơ cấu tổ chức.** Hệ quả:
- `org_units` của App = sync từ HRM `organization_department` (kind=DIVISION lấy tới cấp phòng/ban/kênh/phân xưởng; SECTION/TEAM lấy sau nếu cần).
- Tầng khối (DIVISION) = **`organization_orgblock`**: BDH (cấp TGĐ) + 4 khối chức năng (OFFICE=TC&QT, SALES=Kinh doanh, SX=Sản xuất-KT, TRANSPORT=VH&CCƯ) — cạnh Phòng→Khối lấy từ `department.block` (đã liệt kê §3b).
- `legal_entity` cũng lấy từ HRM (`organization_legalentity`). **Đã xác nhận: gán pháp nhân trong HRM là ĐÚNG** — kể cả một số phân xưởng tên "Hạ Long" thuộc pháp nhân Đông Mai (chủ đích, không phải lỗi). App lấy y theo HRM.
- App **không tạo/sửa phòng ban thủ công** khi đã sync HRM; chỉ override role (manager) tay khi HRM thiếu, `source=MANUAL`.

→ Đã giải quyết câu hỏi "nguồn chuẩn" và "cạnh cha-con". Danh sách đơn vị theo HRM (gồm Kênh Bán Lẻ, Ban ISO) là chuẩn; sơ đồ SharePoint chỉ để tham chiếu trực quan.

## 12. Các điểm còn cần xác nhận

1. **[Quan trọng nhất] Cạnh cha-con Phòng/Ban → Giám đốc chức năng** (không trích được từ SmartArt). Cần: mở file A xem sơ đồ, hoặc HCNS xác nhận, hoặc đọc từng CNNV.
2. Tầng DIVISION theo **Giám đốc chức năng** hay theo **OrgBlock (5 khối) của HRM**? (khuyến nghị: HRM khi sync).
3. Đơn vị nào **trực thuộc thẳng TGĐ** (Pháp chế/Tài chính-KSNB/S-H-E?).
4. Task có tách theo **pháp nhân Hạ Long/Đông Mai** không, hay dùng chung? (ảnh hưởng `legal_entity`).
5. Cấp **Tổ (TEAM)** có cần workspace việc riêng + Tổ trưởng nghiệm thu không, hay gộp vào Phân xưởng?
6. "Kênh" và "Trung tâm Điều hành" xử lý như DEPARTMENT bình thường?
7. Thời điểm triển khai (khuyến nghị: sau UAT MVP).

---

## Tóm tắt (in ra)

- **Số "Khối":** BHL **không dùng "Khối"** trong sơ đồ; tầng trên = **4 Giám đốc chức năng** (Kinh doanh / Tài chính & Quản trị / Vận hành & Chuỗi cung ứng / Sản xuất – Kỹ thuật) + 2 Phó GĐ, dưới TGĐ. (HRM riêng có 5 OrgBlock — cần chốt dùng cái nào cho tầng DIVISION.)
- **Số Phòng/Ban:** ~**19 đơn vị cấp phòng ban**: 3 Ban [07–09] + 9 Phòng [10,11,12,13,14,15,16,17,18] + 2 Kênh [19,20] + 1 Trung tâm [22] + 4 Phân xưởng [24–27].
- **Có Tổ/Nhóm không?** **CÓ** — nhiều Tổ (Tổ nấu/lọc/lên men/đóng gói/máy lạnh/lò hơi/trực điện/xử lý nước/vệ sinh CN…) và cả cấp **Bộ phận** dưới Phân xưởng. Cây sâu 4–5 cấp, ở 2 pháp nhân (Hạ Long + Đông Mai).
- **DB đề xuất có phù hợp không?** **Phù hợp nhưng phải điều chỉnh:** (1) `org_units` cây tự tham chiếu đa cấp (giữ) + `type` thêm **SUB_DEPT (Bộ phận)** ngoài COMPANY/DIVISION/DEPARTMENT/TEAM; (2) DIVISION = mảng theo **Giám đốc chức năng** (không phải "Khối"); (3) thêm chiều **`legal_entity` (Hạ Long/Đông Mai)**. **Chưa seed cây được cho tới khi chốt cạnh cha-con Phòng→Giám đốc [CẦN XÁC NHẬN].**

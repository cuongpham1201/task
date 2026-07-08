# Báo cáo Phase UAT Polish — App Giao việc

> Mục tiêu phase: đưa app lên mức đủ ổn định để 10–20 người dùng thực tế 2–4 tuần **trước** khi tích hợp HRM.
> Ràng buộc: không làm HRM, không sync, không KPI, không đổi schema, không thêm module, không đổi kiến trúc.

## 1. Đã làm

| # | Hạng mục | Kết quả |
|---|---|---|
| 1 | **Dashboard** "Việc của tôi" theo nhóm | Buckets: Quá hạn / Hôm nay / Tuần này / Bị trả lại / Chờ nghiệm thu / Hoàn thành gần đây + 4 stat card + card "Tổng quan quản lý" (không KPI, không biểu đồ). |
| 2 | **MyTasks** UX | Tab lọc (Tất cả/Hôm nay/Sắp đến hạn/Quá hạn/Nghiệm thu/Đã hoàn thành) + đếm số, sort chưa-xong-lên-trước & gần-hạn-lên-trước, badge trạng thái, cột hạn. |
| 3 | **Project** hoàn thiện | Tabs Tổng quan / Công việc / Thành viên / Hoạt động; toggle Danh sách ↔ Bảng; chủ dự án (hoặc admin) thêm/xóa thành viên; không xóa được chủ dự án. |
| 4 | **Notification** | Bấm thông báo → mở đúng task, panel mặc định tab Bình luận; badge chưa đọc đồng bộ sidebar + bottom-nav (poll 20s). |
| 5 | **Search** | Gộp nhóm Công việc / Dự án / Phòng ban / Người; client-side ưu tiên tốc độ (giới hạn số kết quả mỗi nhóm). |
| 6 | **UX review** | Toast nhẹ thay `alert` (lỗi/cảnh báo/thành công, tự ẩn); thêm CSS spacing/typography cho các thành phần mới; empty state ở các tab. Không đổi phong cách sẵn có. |
| 7 | **UAT checklist** | `docs/uat-checklist.md`: bổ sung Phần B kiểm thử theo 7 vai trò (Admin/TGĐ/Giám đốc khối/Trưởng phòng/Nhân viên/Project Owner/Project Member). |
| 8 | **Bug review** | Xem mục 2. |
| 9 | **Build + smoke test** | `npm run build` ✅, `npm run build:api` ✅. Smoke: `/api/v1/health` 200, web `/` 200, endpoint bảo vệ trả 401 khi không cookie. |

## 2. Bug review (phân loại BLOCKER / P0 / P1 / P2)

Quy trình: build cả 2 phía + rà thủ công vùng đã sửa + 1 agent rà độc lập 8 file thay đổi.

**BLOCKER / P0:** không phát hiện.

**P1 — ĐÃ FIX (là lỗi đúng-đắn của chính tính năng đầu bảng phase này nên fix luôn dù rẻ):**
- **Dashboard: 1 task hiện trùng nhiều bucket.** `notDone` cũ gồm cả `returned`/`submitted`, nên task bị trả lại & quá hạn xuất hiện đồng thời ở "Quá hạn" và "Bị trả lại" (tương tự với "Chờ nghiệm thu"), làm sai cảm nhận số liệu. Sửa: bucket theo thời gian chỉ tính task còn xử lý được (loại `done`/`returned`/`submitted`) → mỗi task đúng một nhóm. (`Dashboard.jsx`)

**P2 — ĐÃ FIX (rẻ, cùng vùng đang sửa):**
- Deref `currentUser` không nhất quán ở Dashboard (chỗ dùng `?.`, chỗ không) → thêm optional-chaining phòng thủ. (`Dashboard.jsx`)
- Nghiệm thu "Đạt" không ép `progress: 100` (task `done` nhưng thanh tiến độ tạm <100% tới khi server ghi đè) → set `progress: 100` khi passed. (`AppContext.jsx reviewTask`)

**P1 — BACKLOG (đúng chỉ thị "backlog P1", cần dữ liệu từ server nên không sửa vội):**
- **"Tổng quan quản lý" hiện cho cả nhân viên thường** khi `managed.length > 0` (chỉ cần thấy 1 task đồng nghiệp qua visibility). Nhãn "quản lý" gây hiểu nhầm thẩm quyền nhưng **không rò rỉ dữ liệu** (task vốn đã trong phạm vi nhìn). Hướng sửa: gate theo `managedOrgUnitIds` do server cấp trong bootstrap.

**P2 — BACKLOG (không ảnh hưởng chức năng):**
- Search "Người dùng" tra trên toàn danh bạ (tên/email, không phải dữ liệu công việc) — chấp nhận được.
- Bucket "Chờ tôi nghiệm thu" có điều kiện `t.creatorId === me ||` thừa (đã bao trong `canReview`).

## 3. Đánh giá trải nghiệm theo 6 vai trò

> Chỉ đánh giá trải nghiệm — không thêm tính năng lớn. Mỗi vai trò tối đa 3 đề xuất cải thiện.

### 3.1. Nhân viên văn phòng
- **Mở app buổi sáng để:** xem hôm nay/tuần này phải làm gì, việc nào quá hạn, việc nào bị trả lại cần sửa.
- **Màn hình đầu tiên:** Dashboard — nhóm "Quá hạn"/"Hôm nay"/"Bị trả lại" nằm ngay trên cùng là đúng nhu cầu.
- **Quá nhiều click?** Không — từ Dashboard bấm 1 lần vào task là mở panel. Ổn.
- **Thiếu thông tin?** Trên thẻ task ở Dashboard đã có tên + trạng thái + hạn. Đủ để quyết định mở hay không.
- **Thao tác gây bối rối?** "Nộp nghiệm thu" vs "Đánh dấu hoàn thành" — người mới dễ nhầm khi task cần nghiệm thu (chỉ có "Nộp nghiệm thu").
- **3 cải thiện:** (1) Trên nút "Nộp nghiệm thu" thêm tooltip 1 dòng giải thích; (2) Nhóm "Bị trả lại" nên hiện luôn lý do trả lại ngay trên thẻ; (3) Cho phép đánh dấu đã đọc từng thông báo bằng cách hover (đỡ phải mở task).

### 3.2. Trưởng phòng
- **Mở app buổi sáng để:** xem phòng có gì quá hạn, ai đang chờ mình nghiệm thu, tiến độ chung của phòng.
- **Màn hình đầu tiên:** Dashboard — card "Tổng quan quản lý" cho thấy phòng mình (mở/quá hạn/chờ nghiệm thu/tiến độ) là hợp lý.
- **Quá nhiều click?** Để duyệt việc chờ nghiệm thu phải vào từng task. Có thể gộp thành 1 luồng.
- **Thiếu thông tin?** Card phòng chưa cho biết **ai** đang trễ, chỉ có tổng số quá hạn.
- **Thao tác gây bối rối?** Không rõ khác biệt giữa "Trả lại" và chỉ comment nhắc.
- **3 cải thiện:** (1) Bucket "Chờ tôi nghiệm thu" gom sẵn ở Dashboard — thêm nút duyệt nhanh Đạt/Trả lại ngay trên thẻ; (2) Trong trang phòng, tab Công việc mặc định sắp theo "quá hạn trước"; (3) Card phòng cho bấm xổ ra danh sách người có việc quá hạn.

### 3.3. Giám đốc khối
- **Mở app buổi sáng để:** nắm nhanh khối mình — phòng nào đang "nóng" (nhiều quá hạn), có gì cần mình can thiệp.
- **Màn hình đầu tiên:** Dashboard — "Tổng quan quản lý" liệt kê các phòng thuộc khối.
- **Quá nhiều click?** Muốn so sánh giữa các phòng phải bấm vào từng phòng.
- **Thiếu thông tin?** Chưa có mức độ ưu tiên/độ "nóng" — các phòng hiển thị ngang nhau.
- **Thao tác gây bối rối?** Ranh giới "khối của tôi" không hiển thị rõ tên khối ở đầu Dashboard.
- **3 cải thiện:** (1) Sắp các phòng trong "Tổng quan quản lý" theo số quá hạn giảm dần (phòng nóng lên đầu); (2) Hiển thị tên khối mình phụ trách ở tiêu đề card; (3) Thêm màu cảnh báo (đỏ) trên card phòng khi quá hạn vượt ngưỡng.

### 3.4. Tổng giám đốc (TGĐ)
- **Mở app buổi sáng để:** cái nhìn tổng thể toàn công ty — không đi vào chi tiết, chỉ muốn biết "có gì bất thường".
- **Màn hình đầu tiên:** Dashboard, nhưng danh sách phòng dài (toàn công ty) → dễ loãng.
- **Quá nhiều click?** Ngược lại — quá nhiều thông tin trên 1 màn.
- **Thiếu thông tin?** Thiếu tổng hợp cấp khối (hiện đang là danh sách phẳng theo phòng).
- **Thao tác gây bối rối?** Không có; nhưng cuộn nhiều.
- **3 cải thiện:** (1) Ở Dashboard cấp TGĐ, gom "Tổng quan quản lý" theo **khối** (mặc định thu gọn, bấm để xổ phòng); (2) Đưa 3–5 việc/phòng "nóng nhất toàn công ty" lên đầu; (3) Giữ nguyên — không thêm biểu đồ (đúng ràng buộc), chỉ dùng con số + màu.

### 3.5. Project Owner (chủ dự án)
- **Mở app buổi sáng để:** xem dự án của mình tiến tới đâu, ai chưa làm, cần thêm ai vào không.
- **Màn hình đầu tiên:** vào thẳng dự án (sidebar) → tab Tổng quan.
- **Quá nhiều click?** Thêm thành viên đang là: vào dự án → tab Thành viên → chọn → Thêm. Chấp nhận được.
- **Thiếu thông tin?** Tab Thành viên chưa cho biết mỗi người đang gánh bao nhiêu việc trong dự án.
- **Thao tác gây bối rối?** Không rõ người vừa thêm có được thông báo tự động không.
- **3 cải thiện:** (1) Tab Thành viên hiện số việc đang mở của mỗi người; (2) Sau khi thêm thành viên, toast nói rõ "đã thêm + đã gửi thông báo" (nếu có); (3) Tab Tổng quan thêm 1 dòng "cập nhật gần nhất" để owner biết dự án còn "sống".

### 3.6. Người chỉ dùng điện thoại
- **Mở app buổi sáng để:** xem nhanh việc hôm nay, nộp nghiệm thu, trả lời comment — làm mọi thứ 1 tay khi di chuyển.
- **Màn hình đầu tiên:** Dashboard qua bottom-nav; PWA mở như app riêng.
- **Quá nhiều click?** Bottom-nav 5 mục là hợp lý. Panel chi tiết full màn hình ổn.
- **Thiếu thông tin?** Trên mobile, các bucket dài phải cuộn nhiều.
- **Thao tác gây bối rối?** Toggle Danh sách/Bảng (Kanban) trên điện thoại — Kanban kéo ngang khó thao tác.
- **3 cải thiện:** (1) Trên mobile mặc định ẩn chế độ Bảng (Kanban), chỉ để Danh sách; (2) Bucket ở Dashboard mobile cho thu gọn/mở rộng để bớt cuộn; (3) Ô nhập comment giữ dính đáy khi bàn phím bật (đã cơ bản ổn — cần kiểm trên máy thật ở checklist mục 10).

## 4. Kết luận

App đã đủ ổn định cho UAT nội bộ: 2 build sạch, smoke test qua, phân quyền/visibility do server đảm bảo, không còn BLOCKER/P0 ở vùng đã sửa. Các đề xuất UX ở trên là **cải thiện nhỏ**, không cản trở việc đưa vào dùng thử; gom vào backlog sau UAT. Bước tiếp theo: người dùng chạy `docs/uat-checklist.md` (Phần A theo luồng + Phần B theo vai trò) trên tài khoản thật.

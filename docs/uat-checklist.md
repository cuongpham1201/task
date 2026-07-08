# UAT Checklist — App Giao việc (MVP nội bộ)

> Môi trường: https://task.biahalong.com (dev qua Cloudflare Tunnel).
> Cần 2 tài khoản M365 nội bộ (@biahalong.com) để test luồng giao việc/nghiệm thu — gọi là **A** (người giao) và **B** (người nhận).
> Mỗi mục tick ✅/❌ + ghi chú. Mục nào ❌ ghi rõ bước tái hiện.

## 1. Đăng nhập / Đăng xuất
- [ ] Mở app khi chưa đăng nhập → hiện trang đăng nhập, bấm "Đăng nhập với Microsoft 365" → login → vào app đúng tên/avatar.
- [ ] Tài khoản mới lần đầu đăng nhập → tự vào được (role Nhân viên).
- [ ] Đăng xuất (menu avatar hoặc Cài đặt) → về trang đăng nhập; bấm Back không lọt vào lại.
- [ ] Tài khoản ngoài @biahalong.com → bị chặn.

## 2. Tạo task thường
- [ ] A tạo task Cá nhân (không tick nghiệm thu) → hiện ngay đầu danh sách, panel chi tiết tự mở.
- [ ] A tạo task Phòng ban (chọn phòng + section) → xuất hiện trong trang phòng ban đúng section.
- [ ] Refresh trang (F5) → task vẫn còn (đã lưu DB).
- [ ] Việc con nhập lúc tạo → hiện ngay trong panel, không cần refresh.

## 3. Tạo task cần nghiệm thu + giao người khác
- [ ] A tạo task, tick **"Cần nghiệm thu khi hoàn thành"**, giao cho **B**.
- [ ] B đăng nhập → thấy badge Thông báo +1, nội dung "đã giao việc".
- [ ] B mở task → nút **"Nộp nghiệm thu"** (không có "Đánh dấu hoàn thành").
- [ ] B thử đổi trạng thái → không đưa thẳng lên "Hoàn thành" được khi cần nghiệm thu.

## 4. Comment
- [ ] B comment vào task → A nhận thông báo "đã bình luận".
- [ ] B sửa comment của mình (icon bút) → nội dung đổi, có nhãn "đã sửa".
- [ ] B xóa comment của mình → biến mất; A không xóa được comment của B (trừ admin).
- [ ] Refresh → comment đúng như đã sửa/xóa.

## 5. Cập nhật tiến độ & trạng thái
- [ ] B kéo thanh tiến độ → % lưu lại sau refresh.
- [ ] B đổi trạng thái todo→doing bằng dropdown và bằng kéo thả Kanban (desktop).
- [ ] Kéo thả Kanban KHÔNG kéo được vào cột "Chờ nghiệm thu"/"Bị trả lại".

## 6. Nghiệm thu (submit → approve/reject)
- [ ] B bấm **Nộp nghiệm thu** → trạng thái "Chờ nghiệm thu"; A nhận thông báo.
- [ ] Task chờ nghiệm thu vẫn thấy trên Kanban (cột riêng) và tab "Nghiệm thu" ở Việc của tôi.
- [ ] Khi chờ nghiệm thu: B không đổi tay được trạng thái (dropdown khóa).
- [ ] A mở task → **Trả lại** (nhập lý do) → trạng thái "Bị trả lại"; B nhận thông báo "đã trả lại".
- [ ] B sửa rồi **Nộp nghiệm thu** lại → A **Nghiệm thu Đạt** → trạng thái "Hoàn thành"; B nhận thông báo "đã nghiệm thu".
- [ ] Lịch sử (tab Hoạt động) ghi đủ: nộp / trả lại / đạt.

## 7. Sửa / Xóa
- [ ] A sửa tên task (icon bút cạnh tiêu đề) → đổi ngay + giữ sau refresh.
- [ ] A xóa task (icon thùng rác) → biến mất khỏi mọi danh sách (xóa mềm).
- [ ] Sửa/xóa việc con trong panel → đúng + giữ sau refresh.
- [ ] B (không phải người tạo/quản lý) KHÔNG thấy nút xóa task của A.

## 8. Thông báo read/unread
- [ ] Badge đỏ ở sidebar/bottom-nav đếm đúng số chưa đọc.
- [ ] Bấm 1 thông báo → mở đúng task + thông báo đó chuyển sang đã đọc.
- [ ] "Đánh dấu đã đọc" → toàn bộ hết chấm xanh, badge về 0, giữ sau refresh.

## 9. Phân quyền nhanh
- [ ] Nhân viên (B) chỉ sửa được trạng thái/tiến độ việc mình nhận; không đổi được deadline/người phụ trách task người khác tạo.
- [ ] Nhân viên không tạo được task Phòng ban cho phòng khác.
- [ ] Admin thấy tất cả phòng ban/dự án.

## 10. Mobile / PWA (điện thoại thật)
- [ ] Mở https://task.biahalong.com trên điện thoại → không tràn ngang, kéo mượt.
- [ ] Bottom nav hoạt động: Trang chủ / Việc của tôi / Dự án / Thông báo / Thêm.
- [ ] Menu ☰ mở drawer, bấm mục thì đóng.
- [ ] Chi tiết task full màn hình; comment gõ được, bàn phím không che input.
- [ ] Tạo task full màn hình, nút Hủy/Tạo bấm được ở footer.
- [ ] "Thêm vào màn hình chính" (Add to Home Screen) → mở như app riêng (standalone, có icon sao đỏ).

---

# Phần B — Kiểm thử theo VAI TRÒ

> Mục tiêu: mỗi vai trò đăng nhập bằng 1 tài khoản thật, kiểm tra **thấy đúng phạm vi** và **làm được đúng quyền**.
> Nguyên tắc chung: phạm vi nhìn (visibility) do **server** quyết định — không bao giờ dựa vào ẩn/hiện ở giao diện.

## B1. Admin
- [ ] Sidebar thấy **tất cả** khối / phòng ban / dự án.
- [ ] Dashboard: mở được mọi phòng ban trong "Tổng quan quản lý".
- [ ] Search ra được task/dự án/phòng ban/người của bất kỳ đơn vị nào.
- [ ] Vào bất kỳ dự án nào cũng thêm/xóa được thành viên (kể cả dự án không phải mình tạo).
- [ ] Nghiệm thu / trả lại được task của bất kỳ ai.
- [ ] Xóa được comment của người khác.

## B2. Tổng giám đốc (TGĐ)
- [ ] Thấy **toàn bộ 4 khối** và các phòng/ban/phân xưởng trực thuộc.
- [ ] Dashboard "Tổng quan quản lý" liệt kê các phòng thuộc phạm vi (mở/quá hạn/chờ nghiệm thu/tiến độ).
- [ ] Mở 1 phòng bất kỳ → thấy task của phòng đó.
- [ ] KHÔNG thấy task cá nhân riêng tư ngoài phạm vi tổ chức (task cá nhân của người khác không liên quan).
- [ ] Không phải chủ dự án → không thêm/xóa được thành viên dự án đó (trừ khi là admin).

## B3. Giám đốc khối
- [ ] Chỉ thấy **khối của mình** + các phòng/ban/phân xưởng con (include_children), KHÔNG thấy khối khác.
- [ ] Dashboard "Tổng quan quản lý" chỉ gồm phòng thuộc khối mình.
- [ ] Mở phòng thuộc khối khác qua URL trực tiếp (`/departments/:id`) → không có dữ liệu / không lọt task.
- [ ] Nghiệm thu được task ở phòng thuộc khối mình (nếu là người giao/trưởng phòng liên quan).

## B4. Trưởng phòng
- [ ] Thấy **phòng mình** (và phòng con nếu có cấu hình include_children), không thấy phòng ngang cấp khác.
- [ ] Tạo được task Phòng ban cho **phòng mình**; KHÔNG tạo được cho phòng khác (nút/thao tác bị chặn + server chặn).
- [ ] Nghiệm thu / trả lại task của nhân viên trong phòng.
- [ ] Đổi được deadline / người phụ trách task thuộc phòng mình.
- [ ] Dashboard hiện phòng mình trong "Tổng quan quản lý".

## B5. Nhân viên
- [ ] Dashboard hiện đúng các nhóm "Việc của tôi": Quá hạn / Hôm nay / Tuần này / Bị trả lại / Chờ nghiệm thu / Hoàn thành gần đây.
- [ ] Chỉ đổi được trạng thái/tiến độ **việc mình nhận**; KHÔNG đổi được deadline/người phụ trách task người khác tạo.
- [ ] KHÔNG tạo được task cho phòng khác; KHÔNG thấy task riêng tư của người ngoài phạm vi.
- [ ] Nhận thông báo khi được giao việc / bị nhắc / có bình luận / kết quả nghiệm thu; bấm mở đúng task.
- [ ] Không có nút xóa task của người khác.

## B6. Project Owner (chủ dự án)
- [ ] Trong dự án mình sở hữu: tab **Thành viên** có ô "+ Chọn người để thêm…" và nút Thêm.
- [ ] Thêm 1 người → người đó xuất hiện ngay trong danh sách + toast "Đã thêm thành viên"; refresh vẫn còn.
- [ ] Xóa 1 thành viên → biến mất + toast "Đã xóa thành viên"; **không** xóa được chính chủ dự án (không có nút X ở dòng "Chủ dự án").
- [ ] Người vừa được thêm đăng nhập → thấy dự án đó trong sidebar và task của dự án.
- [ ] Tạo được công việc trong dự án; đổi qua lại chế độ Danh sách / Bảng (Kanban).

## B7. Project Member (thành viên dự án)
- [ ] Thấy dự án được thêm vào trong sidebar; mở được tab Tổng quan/Công việc/Thành viên/Hoạt động.
- [ ] Tab Thành viên: **không** có ô thêm/nút xóa (chỉ chủ dự án/admin mới có).
- [ ] Tạo/cập nhật được công việc trong dự án theo quyền; nhận thông báo liên quan.
- [ ] Bị chủ dự án xóa khỏi dự án → sau khi đồng bộ (refresh) không còn thấy dự án đó.

## Ghi chú lỗi phát hiện
| # | Bước | Kết quả mong đợi | Kết quả thực tế | Mức |
|---|---|---|---|---|
| | | | | |

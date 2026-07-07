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

## Ghi chú lỗi phát hiện
| # | Bước | Kết quả mong đợi | Kết quả thực tế | Mức |
|---|---|---|---|---|
| | | | | |

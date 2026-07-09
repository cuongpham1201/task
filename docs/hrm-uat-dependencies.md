# HRM Dependencies cho UAT — App Giao việc

> Đây là các việc **phía HRM (dữ liệu/cấu hình)** cần hoàn tất để App Giao việc UAT thật.
> KHÔNG code HRM ở phase này. Chỉ checklist để đội HRM/HCNS thực hiện, rồi chạy lại
> `npm run sync:hrm-dev` để App cập nhật.

## Bắt buộc (chặn UAT đại trà)

- [ ] **work_email @biahalong.com cho toàn bộ NV cần dùng app** — hiện chỉ 208/706 active có
      work_email → 498 người KHÔNG đăng nhập M365 được. Login map theo work_email.
      *Nguồn:* `employees_employee.work_email`.
- [ ] **Trưởng phòng thật cho mỗi Phòng/Ban** (`organization_department.head` với `kind='DIVISION'`)
      — hiện chỉ 2/29 phòng có head → role `department_manager` phần lớn đang là MANUAL_TEST.
- [ ] **Giám đốc khối cho 5 khối** (`organization_orgblock.head`) — hiện tất cả NULL → không có
      `block_director` thật.
- [ ] **TGĐ/CEO** — xác định người + gán (App suy `ceo` từ org_unit_roles; hiện seed thủ công).

## Nên có

- [ ] Rà `status='ACTIVE'` đúng thực tế (nghỉ việc → `LEFT` → App tự `active=false`).
- [ ] `division_id` đúng cho mọi NV (đã 706/706 có — kiểm tra lại vài ca đặc biệt).
- [ ] Chuẩn hóa `short_name` phòng/ban (App dùng làm mã hiển thị; trùng across pháp nhân
      được App tự thêm hậu tố `-DONGMAI`).

## Sau khi HRM cập nhật

1. Chạy `npm run sync:hrm-dev` (read-only, idempotent).
2. Kiểm tra: số user login được, role quản lý theo phòng/khối, cây tổ chức.
3. Không cần sửa code App (sync tự cập nhật users/org_units/roles).

## KHÔNG làm ở phase này
KPI push, HRM deep integration, sửa HRM production, sync 2 chiều — thuộc A6 (lộ trình riêng).

# BACKLOG — App Giao Việc

> File backlog CHÍNH THỨC (thay thế vai trò theo dõi của `v1-product-backlog.md` — file cũ giữ làm lịch sử V1).
> Cập nhật: 12/07/2026 · Trạng thái đối chiếu TRỰC TIẾP code/schema/API/UI, không suy đoán theo mô tả cũ.
> Quy ước trạng thái: DONE / PARTIAL / READY / IN PROGRESS / BLOCKED / ICEBOX.

---

## P0-1 — Mô hình Task 3 chiều (org_unit / project / action)

- **Mục tiêu**: Task luôn xác định đơn vị chịu trách nhiệm; đồng thời có thể thuộc Project và/hoặc Action (2 chiều phân loại độc lập). Dashboard Phòng ban / Project / Action cùng nhìn thấy MỘT task, không nhân bản.
- **Trạng thái**: **DONE** (12/07/2026 — hoàn thiện nốt phần FE/serialize trong phiên này; nền tảng đã làm từ phase A1/A2).
- **Bằng chứng code**:
  - Schema: `apps/api/prisma/schema.prisma` Task có `orgUnitId` (đơn vị chịu trách nhiệm), `projectId` nullable, `actionId` nullable; `workspaceId` đánh dấu DEPRECATED (giữ làm container tương thích, KHÔNG còn là nguồn xác định 3 chiều).
  - Backend: `tasks.service.ts#resolveDims` — task cá nhân/dự án tự suy org từ người thực hiện→người tạo (freeze §Q1/Q3); `taskWhere` (visibility.service) lọc theo `orgUnitId`/`projectId` ở SQL.
  - Serialize: `departmentId = task.orgUnitId`, `channelId = task.projectId` → dashboard phòng ban thấy cả task dự án/cá nhân thuộc đơn vị mình (phiên 12/07).
  - API: create nhận đủ 3 chiều; PATCH `:id/org-unit` (chuyển đơn vị, kiểm quyền đích); PATCH `:id` đổi/gỡ `projectId`, `actionId` (phiên 12/07); validate Action phải cùng đơn vị với Task.
  - UI: CreateTaskModal chọn độc lập Đơn vị chịu trách nhiệm (bắt buộc, mặc định phòng mình) + Dự án (tùy chọn) + Action (tùy chọn); TaskDetailPanel sửa được cả 3 chiều.
- **Vai trò còn lại của workspace**: container tương thích (project = workspace type=project để quản membership; org_unit workspace giữ cho dữ liệu cũ). Không được dùng làm nguồn phân loại — đã ghi chú trong schema.
- **Tiêu chí hoàn thành**: 20 test G (xem `docs/p0-test-report-12.07.md`) — tạo task 1/2/3 chiều, 3 dashboard cùng thấy 1 task, đổi project không mất org, đổi action không mất project, backfill an toàn. ✔

## P0-2 — Người nghiệm thu chỉ định (reviewer)

- **Mục tiêu**: bật "Cần nghiệm thu" thì phải chọn người nghiệm thu; reviewer thấy task trong tab "Cần nghiệm thu"; chỉ reviewer/quản trị phù hợp được nghiệm thu; notification + activity đầy đủ.
- **Trạng thái**: **DONE** (12/07/2026).
- **Lựa chọn mô hình**: MỘT reviewer (`tasks.reviewer_id`) — vì `TaskReview` hiện là quan hệ 1-1 (quyết định nghiệm thu đơn), nhiều reviewer làm phức tạp không cần thiết (đúng hướng dẫn spec). Nâng cấp lên bảng `task_reviewers` khi có nghiệp vụ đồng duyệt.
- **Bằng chứng code**:
  - Schema: `Task.reviewerId` nullable + index; migration backfill `reviewer_id = creator_id` cho task cũ có `review_required` (an toàn, đúng người duyệt mặc định trước đây).
  - Validation server: `reviewRequired=true` mà thiếu reviewer → 400; `=false` → tự xóa reviewer; reviewer phải là user active; đổi reviewer ghi activity + báo người mới.
  - Quyền: `policy.canReview` = admin ∨ reviewer chỉ định ∨ (task cũ chưa có reviewer → rule cũ: creator/quản lý đơn vị/quản lý dự án); `taskWhere`/`canView` thêm reviewer → reviewer thấy task dù ngoài My Tasks, KHÔNG được cấp thêm quyền xem cả dự án/phòng.
  - Tab "Cần nghiệm thu": MyTasks tab `review` = task đang `submitted` mà TÔI là người nghiệm thu (+ fallback dữ liệu cũ); Dashboard bucket "Chờ tôi nghiệm thu" cùng nguồn.
  - Notification: chỉ định reviewer (tạo/sửa), nộp nghiệm thu → reviewer, trả lại → người thực hiện, nộp lại → reviewer, nghiệm thu Đạt → người thực hiện. Không trùng (emit gom recipients theo Set).
- **Tiêu chí hoàn thành**: test 9–16 trong G ✔

## P0-3 — Action Log hoạt động đúng với Task 3 chiều

- **Mục tiêu**: Action (cam kết điều hành theo đơn vị/kỳ) liên kết đúng task 3 chiều; lọc kỳ/đơn vị/trạng thái; quyền theo vai trò tổ chức.
- **Trạng thái**: **DONE** (nền từ phase A2/A3; phiên 12/07 bổ sung đổi/gỡ action trên task + validate cùng đơn vị).
- **Bằng chứng code**: bảng `Action` + `ActionUpdate` (nhật ký điều hành 7 loại, append-only); API `/actions` CRUD + log; UI ActionLog (nhóm khối→phòng, lọc kỳ, in), ActionDetail (BUG2 refetch), dashboard biểu đồ Action (12/07 phase trước); `actionWhere` theo cây tổ chức; task gắn action qua `actionId` — tạo + sửa đều validate action cùng đơn vị chịu trách nhiệm.
- **Phần còn lại (không thuộc P0)**: giao diện tổng hợp riêng cho Ban lãnh đạo (drill-down toàn công ty) — xem P1-1.

## P1-1 — Màn hình tổng hợp Action toàn công ty cho Ban lãnh đạo

- **Mục tiêu**: TGĐ/GĐ khối xem Action Log toàn công ty → khối → phòng → Action → Task, lọc theo kỳ (số hóa "Họp Tác nghiệp" — freeze §"Giám đốc khối/TGĐ").
- **Trạng thái**: **PARTIAL** — Action Log hiện nhóm theo khối/phòng + dashboard biểu đồ; CHƯA có drill-down chuyên biệt + so sánh kỳ.
- **Đã có**: ActionLog group by khối/phòng, lọc kỳ, quyền theo scope; ActionDashboard (theo trạng thái/đơn vị/owner).
- **Còn thiếu**: view so sánh kỳ trước/sau, tỷ lệ hoàn thành action theo khối, export.
- **Dependency**: P0-3 (done). **Ưu tiên**: P1.

## P2-1 — Biên bản bàn giao / nghiệm thu PDF

- **Mục tiêu**: task đã nghiệm thu → "Lập biên bản bàn giao/nghiệm thu": biểu mẫu tự điền từ task, người dùng bổ sung, xác nhận, xuất PDF, lưu file + lịch sử, tải/in.
- **Trạng thái**: **READY** (đủ dependency — task/nghiệm thu/attachment đã có; CHƯA triển khai theo chỉ đạo).
- **Dependency**: P0-2 (done), hạ tầng attachment local (done).
- **Tiêu chí hoàn thành**: nút trên task done+accepted; form prefill (tên việc, người giao/nhận, đơn vị, kết quả cần đạt, nhật ký); PDF tiếng Việt; bảng `handover_documents` lưu file + người tạo + thời điểm; quyền: người giao/nhận/quản lý đơn vị.

## ICEBOX — Nhóm KPI (DEFERRED — giai đoạn sau, tuyệt đối chưa triển khai thêm)

> Theo Architecture Freeze: App chỉ giữ EVIDENCE, HRM tính điểm. Hiện trạng: schema `KpiDefinition`/`TaskKpiResult` + flow evidence khi nghiệm thu task isScorable ĐÃ TỒN TẠI từ phase A2 (không gỡ); mọi hạng mục mở rộng dưới đây ICEBOX:

| ID | Hạng mục | Trạng thái |
|---|---|---|
| KPI-1 | KPI Framework / KPI Definition quản trị UI | ICEBOX |
| KPI-2 | KPI weight / quality score / on-time score | ICEBOX (schema evidence đã có, không mở rộng) |
| KPI-3 | KPI Result dashboard | ICEBOX |
| KPI-4 | KPI Export | ICEBOX |
| KPI-5 | KPI theo phòng ban / Project / Action | ICEBOX |
| KPI-6 | Tích hợp KPI với HRM (push evidence, HRM chấm) | ICEBOX — chờ HRM sẵn sàng |

## Các hạng mục KHÁC đã DONE (đối chiếu code, ghi nhận để khỏi trùng)

| ID | Hạng mục | Bằng chứng |
|---|---|---|
| D-1 | SSO Entra ID + local login + admin cấp TK | auth/*, admin.controller, FEATURE-001 |
| D-2 | Phân quyền tổ chức (ceo/block_director/department_manager/viewer + scope) + admin UI + preview | FEATURE-003, OrgRolesModal |
| D-3 | HRM sync một chiều idempotent, không phá role manual | scripts/sync-hrm-dev.mjs |
| D-4 | Teams App + Activity Feed + deep link | teams/*, TeamsActivityService |
| D-5 | Nhật ký thực hiện + tiến độ cộng dồn ≤100% + activity | tasks.service#addWorkLog |
| D-6 | Dashboard biểu đồ Phòng ban/Dự án/Action | components/shared/charts.jsx |
| D-7 | Lịch thanh thời gian start→deadline | CalendarView.jsx |
| D-8 | Đính kèm tệp local + camera | attachments/* |
| D-9 | Thông báo in-app + reminder deadline | notifications/*, scripts/deadline-reminders.mjs |

## Không làm trong phiên hiện tại (ghi nhận phạm vi)

KPI (toàn bộ) · Biên bản PDF · Gantt · Workload/Capacity · Time tracking · Teams feature mới · Redesign UI diện rộng · Deploy production.

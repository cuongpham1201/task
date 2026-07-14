# P1-6 — App Giao Việc · Asana JSON Import (Báo cáo hoàn thành)

> Ngày: 14/07/2026 · Trạng thái: **DONE (MVP dùng thật)** · Không push, không deploy production.

## 1. AUDIT
- **Task schema**: `creatorId`/`assigneeId` BẮT BUỘC (NOT NULL); `orgUnitId`/`projectId`/`actionId`/`section` NULLABLE; `status` default `todo`; `startDate`/`dueDate` = `@db.Date`; `completedAt` nullable; `createdAt` `@default(now())` (Prisma cho set khi ghi trực tiếp). `create()` của TasksService KHÔNG set được `createdAt`/`completedAt` và KHÔNG validate assignee → **import ghi thẳng qua Prisma, không tái dùng `create()`**.
- **Subtask schema**: rất rút gọn — `title`, `done`, `assigneeId?`, `sortOrder`, `createdAt`, 1 cấp (không đệ quy). Field khác của Asana → cảnh báo mất.
- **Project model**: KHÔNG có bảng riêng — Project = `Workspace{type:'project'}` + `WorkspaceMember`. Tạo: `workspace.create`.
- **Required fields**: creator/assignee (task). org/project/action optional.
- **Migration**: cần 2 bảng mới (đã làm, additive).
- **Package mới**: KHÔNG (dùng `express.json` sẵn có, `node:test` built-in cho test).

## 2. INPUT/PARSER
- **Input**: dán JSON hoặc tải `.json` (đọc client `file.text()` → gửi chuỗi). DTO nhận `rawJson:string`, server `JSON.parse` an toàn.
- **Size limit**: 8MB chuỗi thô; ≤5000 entity; độ sâu cây ≤20. Body limit nới RIÊNG path `/api/v1/admin/import` = 12mb; route khác 1mb.
- **Entity count**: đếm root/subtask/unique(gid)/project/user/completed/thiếu-assignee/tên-rỗng/trùng-gid.
- **Dedupe**: theo Asana `gid` (KHÔNG title/date/assignee). Root+nested cùng gid → 1 entity.
- **Merge rule**: chọn payload "đầy đủ" nhất (điểm theo số field có dữ liệu; hoà → nhiều subtask hơn); nội dung khác nhau → cờ `conflict` + warning.
- **Invalid handling**: JSON sai/`data` thiếu/không object/quá lớn → 400 mã lỗi rõ; ngày sai → null + warning; tên rỗng/thiếu assignee → đánh dấu ở planner.

## 3. MAPPING
- **Project**: chọn 1 Asana project nguồn (từ `projects[]`+`memberships[].project`); chỉ import task thuộc nguồn + subtask hợp lệ.
- **OrgUnit**: chọn 1 đơn vị mặc định (không tự map section→org; section chỉ map thủ công khi user chọn).
- **User**: bảng ghép tay (export không có email). Gợi ý: tên chuẩn hoá khớp DUY NHẤT → tự chọn (an toàn); khác → gợi ý MỜ, KHÔNG auto-confirm. Không có saved-mapping ở MVP (xem P1-6D).
- **Creator**: = người import (KHÔNG lấy từ JSON).
- **Assignee**: qua userMap; thiếu → policy `default`(người mặc định)/`skip`; map tới user inactive → lỗi (không gán). KHÔNG âm thầm gán người import.
- **Status**: `completed=true→done` (giữ `completedAt`), `false→todo`. Không suy doing/waiting/... Cho override từng task.
- **Priority**: chọn custom field nguồn (group theo gid, chỉ field có dữ liệu). Low→low/Medium→normal/High→high/Khẩn→urgent; lạ→normal+warning.
- **Section**: bỏ / gán 1 nhóm / map thủ công từng section (enum app suvu/kehoach/hangngay/phatsinh). Không tự map tên lạ.
- **Tags**: bỏ (mặc định) hoặc nối mô tả. Không tạo module tag.
- **Watchers**: `followers[]` qua userMap (chỉ user active).
- **Subtask**: chỉ `title`+`done`+`assignee`; lồng sâu >1 cấp → đưa lên task gốc + warning; cha ngoài dự án/thiếu → skip (không orphan).
- **Review/Action**: reviewRequired=false, reviewerId=null, actionId=null.

## 4. IDEMPOTENCY
- **Mapping table**: `ExternalEntityMapping(source,entityType,externalId,internalId,importBatchId,sourceUrl,sourceCreatedAt,payloadHash)`.
- **Unique key**: `(source, entityType, externalId)` + backstop DB unique (P2002 → item existing/lỗi).
- **Re-import**: gid đã có → SKIP (existing); mới → CREATE. MVP chưa update task cũ.
- **Existing behavior**: preview/execute nạp `existingGids` từ DB → không tạo lại; smoke xác nhận import lại tạo 0 bản sao.

## 5. DRY-RUN
- **Endpoint**: `POST /admin/import/asana/preview`.
- **Preview**: kế hoạch từng mục (kind/action/tiêu đề/assignee/status/priority/hạn/parent/warning/lý do) + tổng hợp.
- **Errors/Warnings**: tên rỗng, thiếu/inactive assignee, orphan, priority lạ, field subtask mất, gid conflict…
- **DB writes**: KHÔNG ghi Task/Subtask/mapping/notification/project (chỉ cập nhật metadata batch). Smoke xác nhận task count không đổi sau dry-run.

## 6. EXECUTE
- **Transaction**: mỗi mục 1 `$transaction` (task + watchers + activity + mapping) → cô lập lỗi từng mục, mapping+task nguyên tử (idempotent).
- **Chunking**: theo từng mục (phù hợp batch admin; hằng số `EXECUTE_CHUNK` để mở rộng).
- **Created/Skipped/Failed**: đếm chính xác; status `completed`/`partial`/`failed`.
- **Notification**: **SUPPRESS mặc định** — KHÔNG gọi fan-out notification/Teams khi import.
- **Activity**: mỗi task 1 Activity `create` metadata `{source:'asana-import',batchId,sourceGid}` + `admin_audit_log` action `asana_import`.
- **Mốc thời gian**: `createdAt`/`completedAt` = gốc Asana; `sourceCreatedAt` lưu ở mapping.
- **Reminder Engine**: KHÔNG kích hoạt trong request (chạy theo lịch riêng; task done bị loại khỏi reminder).

## 7. UI
- **Route**: `/admin/import/asana` (admin, guard in-page) + tab "Nhập Asana" trong Cài đặt.
- **Wizard**: 4 bước (Nhập JSON/tải file → Ghép người-dự án-đơn vị → Ánh xạ trường → Xem trước & nhập).
- **User mapping**: `SearchUser` từng dòng + trạng thái matched/gợi-ý-khớp/gợi-ý-mờ/chưa-ghép; policy thiếu assignee.
- **Field mapping**: toggle notes/start/due/followers; priority từ custom field; tags bỏ/nối; section bỏ/1-nhóm/thủ công.
- **Preview**: lọc all/create/existing/skip/error/warn; override skip/assignee/status/priority; "Chạy thử" rồi "Nhập thật" (confirm). Giới hạn render 500 dòng (chống freeze).
- **Result**: tổng hợp + link mở dự án đích + lịch sử batch.
- **Responsive**: tái dùng `.table-wrap` scroll ngang, style hiện có, KHÔNG thêm framework.

## 8. PERMISSION/SECURITY
- **Admin**: bắt buộc (kiểm server-side `this.admin(c)` như RemindersController). **Project owner**: MVP chưa (ghi P1-6 mở rộng). **Member**: chặn (403).
- **Payload validation**: DTO whitelist + giới hạn kích thước; `JSON.parse` an toàn (không eval); chặn prototype-pollution (bỏ `__proto__/constructor/prototype`); không dùng key JSON làm object-path; không fetch URL trong JSON.
- **Sanitization**: notes/tiêu đề render dạng text (React escape); cắt độ dài.
- **Logging**: KHÔNG log toàn bộ JSON; audit người import + batchId; không expose raw payload cho member.

## 9. PERFORMANCE
- **File test**: fixture smoke nhỏ; giới hạn 8MB/5000 mục cho thật.
- **Parse/Preview**: nạp gộp (batch) user/mapping/project/org — KHÔNG N+1; preview không ghi DB.
- **Import**: query theo tập (users active, existing gids) 1 lần; ghi từng mục transaction ngắn.
- **N+1**: không (context nạp sẵn Set).

## 10. DATABASE
- **Tables**: `external_entity_mappings`, `external_import_batches` (mới).
- **Index**: unique `(source,entity_type,external_id)`; index `import_batch_id`, `internal_id`, `imported_by_id+created_at`, `status`.
- **Migration**: `20260714020558_p1_6_asana_import` — additive (chỉ CREATE TABLE/INDEX/FK), KHÔNG ALTER bảng cũ, KHÔNG đổi KPI.
- **Rollback**: drop 2 bảng (không ảnh hưởng dữ liệu hiện có).

## 11. TEST
- **Prisma**: validate ✔ · migrate applied ✔
- **Typecheck API**: `tsc --noEmit` ✔ · **Build API**: `nest build` ✔ · **Build Web**: `vite build` ✔
- **Lint**: repo KHÔNG cấu hình lint (không có script) — bỏ qua.
- **Parser/Normalizer/Mapping**: 31 unit `node:test` PASS (`npm run test -w api`).
- **Dry-run/Execute/Re-import/Suppress-notif/Activity-audit**: smoke DEV `test/smoke-import.mjs` — 30 assert PASS; cleanup chính xác theo batchId, task count trở về ban đầu.
- **Permission**: kiểm server-side ở controller (mẫu giống các admin endpoint đã prod); member 403.
- **Security**: test prototype-pollution + giới hạn kích thước + JSON sai (PASS trong unit).
- **KPI trước/sau**: KHÔNG đụng bảng KPI (import không tạo/sửa KpiResult/KpiDefinition).

## 12. BACKLOG
- **P1-6**: DONE. **P1-6A** (comment/attachment): READY. **P1-6B** (update từ Asana): READY. **P1-6C** (Asana API): ICEBOX. **P1-6D** (section/tag nâng cao + lưu user-mapping): READY.

## 13. GIT/VẬN HÀNH
- **Branch**: `feat/p1-6-asana-import` (tách từ main; KHÔNG commit thẳng main).
- **Commits**: 4 (schema+core · API preview/execute · wizard UI · tests+docs) — stage theo path chính xác.
- **Working tree**: sạch sau commit (không đụng file người khác).
- **Push**: KHÔNG. **DEV**: đã chạy smoke (không restart pm2 production). **Production**: KHÔNG deploy.

## 14. PHẦN CHƯA LÀM
- Import comment/attachment/activity history; đồng bộ lại/2 chiều; Asana API trực tiếp; Teams/email; module tag mới; workflow mapping nâng cao; KPI; PDF; redesign Project.
- Opt-in gửi notification khi import (MVP luôn suppress); Project-owner được import (MVP chỉ Admin); lưu user-mapping tái dùng (P1-6D).

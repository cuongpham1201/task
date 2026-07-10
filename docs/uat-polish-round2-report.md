# UAT Polish Round 2 Report — BUG1/BUG2/BUG3

> Mode: SAFE DEVELOPMENT — dữ liệu hiện có coi là UAT thật. Không feature mới, không đổi
> architecture/schema (BUG3 chỉ dùng cột `avatarUrl` sẵn có). Không deploy/reset/reseed.

## 1. Root cause

**BUG1 — Dashboard "Việc của tôi" không đồng bộ** (commit `aa593d0`)
Counter đếm `mine.length` (gồm cả done + task không hạn/hạn xa) nhưng widget chỉ có bucket
theo hạn ≤7 ngày → task active **không có dueDate / hạn >7 ngày / submitted** rơi ngoài mọi
bucket → "Counter=4, List=0". Fix: phân hoạch TOÀN BỘ việc chưa xong vào đúng 1 bucket
(thêm "Sắp tới / chưa đặt hạn" catch-all + "Đã nộp — chờ nghiệm thu"), counter = việc chưa
xong. Cùng nguồn `state.tasks` với My Tasks — không duplicate logic, không thêm API.

**BUG2 — Drawer/Panel không refresh sau Save** (commit `5a8f12e`)
`ActionDetail`/`ActionLog` giữ **snapshot cục bộ** (fetch→useState) và chỉ reload theo
`[id]`/`[period]`. Tạo Task từ Action, sửa task trong panel, review, đổi status... dispatch
vào `state.tasks/actions` nhưng snapshot không nghe → phải F5. (Các list khác — Dashboard/
My Tasks/Department/Project/Kanban — đọc thẳng `state.tasks` nên vốn reactive; Attachment/
Worklog tự reload sau thao tác; Comment/Bulk dispatch; Notification poll 20s+focus.)
Fix: 2 page snapshot refetch khi `state.tasks`/`state.actions` đổi identity (fetch không
dispatch → không vòng lặp). Không reload SPA, không stale.

**BUG3 — Avatar M365** (commit `0f3d2df`)
Avatar chỉ là initials (giống demo). Scope OAuth hiện tại đã có `User.Read` → access_token
lúc callback dùng được Graph. Fix: Login → `AvatarService.fetchAndCache` (fire-and-forget,
timeout 5s, fail-safe) → Graph `/me/photos/96x96/$value` → cache disk (TTL 7 ngày) →
`user.avatarUrl` → serve `GET /users/:id/avatar` (AuthGuard + `Cache-Control: private,
max-age=86400`). FE: `Avatar.jsx` (component dùng chung DUY NHẤT, mọi bề mặt đều qua nó)
render `<img>` khi có avatarUrl, onError/không có → initials. KHÔNG đổi auth/app registration,
KHÔNG gọi Graph mỗi render (browser cache + disk cache).

## 2. File sửa
- BUG1: `apps/web/src/pages/Dashboard.jsx`
- BUG2: `apps/web/src/pages/ActionDetail.jsx`, `apps/web/src/pages/ActionLog.jsx`
- BUG3: `apps/api/src/auth/auth.service.ts` (+accessToken), `auth.controller.ts` (hook login),
  `apps/api/src/users/avatar.service.ts` (mới), `users.controller.ts` (endpoint),
  `users.module.ts`, `apps/web/src/components/shared/Avatar.jsx`, `styles.css`

## 3. Test
- Build web + api: sạch sau từng bug.
- BUG1: tạo 5 task `[T]` (no-due/overdue/today/submitted/done) → counter(nonDone)==buckets_sum,
  widget không rỗng; overdue/today/review/done đồng bộ. Cleanup theo ID.
- BUG2: tạo `[T]` action + `[T]` task thuộc action → GET /actions/:id trả task ngay,
  report có action (server fresh; FE effect gọi đúng các endpoint này khi state đổi).
  Cleanup theo ID + SELECT COUNT trước (1/1) — đúng RULE 3/6.
- BUG3: không ảnh→404 (FE fallback) · đặt file `[SMOKE]` (tự tạo)→200 + Cache-Control
  private max-age=86400 · không cookie→401 · xóa file test→404 · route `/users/:id` không
  bị nuốt. Graph timeout: AbortSignal 5s + catch (không chặn login).

## 4. Regression (sau cả 3 bug)
bootstrap 200 (6 task/1 action/705 user, users có avatarUrl field) · action-log 200 ·
notifications 200 · routes /, /my-tasks, /action-log, /inbox, /reports → 200 ·
**UAT data nguyên vẹn: 6 task + 1 action + 705 user, 0 notification phát sinh.**

## 5. Risk còn lại
- BUG3 chưa test được với login M365 THẬT (headless không có code flow) — cần 1 người đăng
  nhập thật để xác nhận ảnh về (nếu Graph lỗi thì chỉ mất ảnh, không ảnh hưởng login).
- Ảnh Graph chỉ được nạp KHI LOGIN → user chưa đăng nhập lại sẽ vẫn initials tới lần login sau.
- ActionDetail/ActionLog refetch theo mọi thay đổi task (kể cả không liên quan action đang xem)
  — chấp nhận ở quy mô UAT; tối ưu selective sau nếu cần.
- 1 lần `git add -A` suýt gộp file recovery vào commit BUG3 — đã reset và commit lại sạch
  (`0f3d2df`); file recovery/incident vẫn CHƯA commit (đúng yêu cầu chờ).

## 6. Safety Contract — tuân thủ
- KHÔNG DELETE/TRUNCATE/DROP/UPDATE blanket; không reset DB/seed.
- Test data đều `[T]`/`[SMOKE]`, lưu ID từng record, cleanup CHỈ theo ID, SELECT COUNT
  trước khi xóa (abort nếu lệch).
- Không đụng dữ liệu UAT: 6 task camera/test + action "Phát trển app Giao việc" nguyên vẹn
  (đối chiếu count trước/sau từng smoke).
- Guard `UAT_RESET_CONFIRM` trong reset-uat giữ nguyên (file chưa commit, chờ yêu cầu).
- Thao tác dữ liệu qua API/service (không UPDATE SQL tay).

## Commits
- `aa593d0` fix: synchronize dashboard task widgets
- `5a8f12e` fix: synchronize drawer state after task updates
- `0f3d2df` feat: integrate microsoft 365 avatars

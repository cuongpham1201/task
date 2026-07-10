# Teams App + Activity Feed — Hướng dẫn cài đặt & vận hành (App Giao việc)

> Kiến trúc theo pattern ĐANG CHẠY PRODUCTION của Phê duyệt (`/data/homelab/apps/approval-bhl`)
> và Văn bản (`/data/homelab/apps/vanban`). KHÔNG dùng chung App ID/secret với 2 app đó.

## 1. Kiến trúc đã chọn

```
Người dùng thao tác (giao việc / comment / nghiệm thu / reminder)
   → API Giao việc (sau khi COMMIT nghiệp vụ, fire-and-forget)
   → TeamsActivityService
       1. gate: TEAMS_ACTIVITY_ENABLED=true + đủ AZURE_AD_*
       2. idempotency: teams_activity_deliveries.event_key UNIQUE
       3. resolve Entra Object ID (user.entra_id → external_user_mappings; bỏ placeholder)
       4. Graph (app-only client_credentials, token cache):
          POST /users/{aadObjectId}/teamwork/sendActivityNotification
          payload: topic(text + deep link l/entity) · activityType · previewText
                   · templateParameters[{name:"taskInfo"}]
       5. 204 → sent · 4xx → error (không retry) · 429/5xx/timeout → retry 1 lần
   → Teams Activity tab của người nhận; click mở tab Giao việc đúng task (subEntityId)
```
- Manifest/staticTab/deeplink/teams-js: theo approval (đầy đủ + có ghi chú fix production).
- Mọi lỗi Graph chỉ log + ghi delivery — **KHÔNG bao giờ fail nghiệp vụ**.

## 2. App Registration (Azure AD) — dùng app "giaoviec" HIỆN CÓ
1. Azure Portal → App registrations → app giaoviec (AZURE_AD_CLIENT_ID hiện tại).
2. **API permissions → Add → Microsoft Graph → Application permissions →
   `TeamsActivity.Send`** → **Grant admin consent** (bắt buộc).
3. **Expose an API**: Application ID URI = `api://task.biahalong.com/<AZURE_AD_CLIENT_ID>`
   (khớp manifest `webApplicationInfo.resource`). Thêm scope `access_as_user` (chuẩn Teams).
4. Không tạo secret mới nếu secret hiện tại còn hạn (Graph app-only dùng cùng secret).

## 3. Teams App ID / Catalog App ID
- **Teams App ID** (manifest `id`): `8ff868b3-844b-4006-b932-db7db82d9f05` — cố định,
  đã đặt trong `teams/manifest.json` + env `TEAMS_APP_ID`. KHÔNG trùng Phê duyệt/Văn bản.
- **Catalog App ID**: SAU khi upload vào Teams Admin Center → Manage apps → app "Giao việc"
  → cột App ID (external) — điền vào `TEAMS_CATALOG_APP_ID` nếu khác (thường deep link
  dùng chính Teams App ID như approval đang làm).

## 4. Đóng gói & upload
```bash
npm run teams:package
# → dist/teams/giao-viec-teams-v1.0.0.zip (manifest đã inject AZURE_AD_CLIENT_ID từ apps/api/.env)
```
Upload: **Teams Admin Center → Teams apps → Manage apps → Upload new app** → chọn zip
→ duyệt (Allow) → (khuyến nghị) **Setup policies**: thêm app vào Installed apps + Pinned apps
cho nhóm pilot → app tự cài & ghim cho user (bắt buộc app phải được CÀI cho user thì
Activity Feed mới hiện).

## 5. Bật Activity Feed
```
# apps/api/.env
TEAMS_ACTIVITY_ENABLED=true      # mặc định false
TEAMS_APP_ID=8ff868b3-844b-4006-b932-db7db82d9f05
TASK_APP_BASE_URL=https://task.biahalong.com
# AZURE_AD_TENANT_ID / AZURE_AD_CLIENT_ID / AZURE_AD_CLIENT_SECRET: dùng sẵn của SSO
```
`pm2 restart giaoviec-api`. Tắt = đặt lại `false` + restart (rollback tức thì, không đổi code).

## 6. Activity types (khớp manifest — đổi là phải bump version manifest + re-upload)
| type | Khi nào | templateText |
|---|---|---|
| taskAssigned | giao việc / đổi người thực hiện | Bạn được giao việc: {taskInfo} |
| taskMentioned | @nhắc trong bình luận | Bạn được nhắc đến trong: {taskInfo} |
| taskCommented | bình luận mới (stakeholders) | Bình luận mới: {taskInfo} |
| taskDueSoon | reminder sắp đến hạn (script) | Sắp đến hạn: {taskInfo} |
| taskOverdue | reminder quá hạn (script) | Quá hạn: {taskInfo} |
| taskReturned | nghiệm thu trả lại | Bị trả lại: {taskInfo} |
| taskAccepted | nghiệm thu Đạt | Đã nghiệm thu: {taskInfo} |
| projectMemberAdded | thêm vào dự án | Bạn được thêm vào dự án: {taskInfo} |
KHÔNG gửi: đổi progress, sửa mô tả, thao tác của chính mình.

## 7. Deep link
- Format (pattern approval): `https://teams.microsoft.com/l/entity/<TEAMS_APP_ID>/giaoviec-home?webUrl=<url>&context={"subEntityId":"<path>"}`
- Task: path `/my-tasks?task=<taskId>` → FE mở TaskDetailPanel (đã hỗ trợ ?task=).
- Project: `/channels/<id>` · Action: `/actions/<id>`.
- Thiếu TEAMS_APP_ID → gửi webUrl thường (mở browser) — fallback an toàn.
- User mất quyền xem task → app báo không thấy công việc (API đã scope), không lộ nội dung.

## 8. Test sau khi bật
1. Admin test nhanh: giao 1 task cho chính admin từ tài khoản khác → Activity tab Teams
   phải hiện "Bạn được giao việc: …" trong ~5s; click mở đúng task trong tab Giao việc.
2. Kiểm tra bảng `teams_activity_deliveries`: status `sent`.
3. `skipped_missing_entra_id` = người nhận chưa từng đăng nhập app (chưa có entra_id GUID)
   → sẽ tự có sau lần đăng nhập M365 đầu tiên.

## 9. Troubleshooting
| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| status=error 401 (token) | secret sai/hết hạn |
| status=error 403 Forbidden | thiếu TeamsActivity.Send HOẶC chưa admin consent |
| error "app not installed for user" | app chưa cài cho user → dùng Setup policy cài hàng loạt |
| error activityType invalid | manifest chưa upload version có type đó / type không khớp |
| gửi OK nhưng không hiện | user tắt notification của app trong Teams settings |
| click mở browser thay vì tab | thiếu TEAMS_APP_ID (fallback) hoặc app chưa cài |
Xem lỗi chi tiết: cột `last_error` trong `teams_activity_deliveries` + log pm2 `[TeamsActivity]`.

## 10. Rollback
`TEAMS_ACTIVITY_ENABLED=false` + `pm2 restart giaoviec-api` — dừng gửi ngay, không ảnh hưởng
nghiệp vụ/in-app notification. Gỡ app khỏi Teams: Admin Center → Manage apps → Block/Delete.

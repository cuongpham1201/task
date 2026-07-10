# Teams Integration Implementation Report — App Giao việc

> Feature: Teams App package + Teams Activity Feed. KHÔNG deploy, KHÔNG upload tenant,
> KHÔNG bật Activity thật, KHÔNG sửa Phê duyệt/Văn bản, KHÔNG đụng dữ liệu UAT.

## 1. Pattern đã audit (Phê duyệt + Văn bản — chỉ đọc)

| Hạng mục | Phê duyệt (approval-bhl) | Văn bản (vanban) | Chọn cho Giao việc |
|---|---|---|---|
| Manifest | v1.16, staticTab personal `approval-home`, activityTypes templateText `{requestInfo}` (`teams-app/manifest.json`) | v1.16, staticTab entityId=GUID, `{documentInfo}`-style (`teams/manifest.json`) | Approval-style: entityId đặt tên (`giaoviec-home`), 8 activityTypes `{taskInfo}` |
| webApplicationInfo | App Registration RIÊNG của approval | App RIÊNG của vanban (comment: "PHẢI khớp AZURE_AD_CLIENT_ID, lệch → 403") | App Registration RIÊNG của Giao việc (placeholder, inject lúc package) |
| Graph auth | client_credentials `.default`, token cache, timeout 10/15s (`src/lib/graph.ts`) | như approval (`lib/graph/appToken`) — reuse AZURE_AD_* | Y hệt (GraphAppTokenService, reuse AZURE_AD_*) |
| Send | `POST /users/{aad}/teamwork/sendActivityNotification`, 204, payload topic(text+webUrl)/activityType/previewText/templateParameters (`teams-activity-feed-service.ts:417-424`) | giống, tự ghi "Pattern theo Approval BHL" (`teamsActivityChannel.ts:1-10`) | Y hệt |
| Deep link | `l/entity/<APP_ID>/<entityId>?webUrl=&context={subEntityId}` fallback webUrl (`teams-deeplink.ts`) | giống hệt (`dms/teams/deepLinks.ts`) | Y hệt (TAB_ENTITY_ID=giaoviec-home) |
| FE in-Teams | teams-js v2 dynamic import, init timeout 3s, heuristic iframe/param/UA + Teams SSO (`teams-client.ts`) | heuristic only (`isTeamsContext.ts`), không SDK bắt buộc | Dynamic import + heuristic + getContext subEntityId; KHÔNG Teams SSO ở V1 |
| Gating/an toàn | `TEAMS_ACTIVITY_FEED_ENABLED` (default off), dev→mock, best-effort không fail nghiệp vụ | `DMS_TEAMS_ACTIVITY_ENABLED` + dryRun (dev auto) + testRecipient + maxRecipients | `TEAMS_ACTIVITY_ENABLED=false` default; skip an toàn; best-effort |
| Idempotency/log | eventKey + reminder-logs-store | `eventKey` trong TeamsActivityEvent | Bảng `teams_activity_deliveries` (event_key UNIQUE + status/attempt/error) |
| Package | `scripts/package-teams-app.js` (pizzip, zip 3 file root, validate GUID, inject env) | thư mục teams/ | `scripts/package-teams-app.mjs` (python3 zipfile — không thêm dep, validate + inject) |

**Kết luận audit:** 2 app dùng CÙNG một pattern (vanban clone approval, có ghi chú tường minh).
Chọn approval làm chuẩn (đầy đủ nhất, có ghi chú fix production first-run), bổ sung eventKey
idempotency dạng bảng (chặt hơn cả 2). Không trộn cơ chế lạ.

## 2. Pattern được chọn
Graph app-only `sendActivityNotification` + manifest activityTypes + deep link `l/entity` +
teams-js v2 dynamic import + feature flag OFF mặc định + delivery log idempotent + best-effort.

## 3. File đã thêm/sửa
**Mới:** `teams/{manifest.json,color.png,outline.png,README.md}` · `scripts/package-teams-app.mjs` ·
`apps/api/src/teams/{teams.module,graph-app-token.service,teams-activity.service}.ts` ·
migration `20260710160000_teams_activity_deliveries` · `apps/web/src/utils/teams.js` ·
`docs/teams-app-and-activity-guide.md` · doc này.
**Sửa:** schema.prisma (+TeamsActivityDelivery) · app.module.ts · tasks.service.ts ·
comments.service.ts · projects.controller.ts · deadline-reminders.mjs · .env.example ·
App.jsx (DeepLinkHandler) · web package.json (+@microsoft/teams-js) · root package.json (teams:package).

## 4. Teams package
`npm run teams:package` → `dist/teams/giao-viec-teams-v1.0.0.zip` (3 file ở root; client id
inject từ env; dist/ ignored). Validate: GUID id ✅ · version ✅ · icons 192/32 ✅ ·
templateText đúng 1 placeholder {taskInfo} ✅.

## 5. Manifest
Schema 1.16 · version 1.0.0 · **Teams App ID `8ff868b3-844b-4006-b932-db7db82d9f05`** (riêng
Giao việc) · packageName com.biahalong.giaoviec · tab "Việc của tôi" → `/my-tasks?source=teams` ·
validDomains task.biahalong.com · accentColor #6B5CE7.

## 6. Activity types (8)
taskAssigned · taskMentioned · taskCommented · taskDueSoon · taskOverdue · taskReturned ·
taskAccepted · projectMemberAdded — templateText tiếng Việt, đúng 1 param `{taskInfo}` khớp payload.
KHÔNG gửi: progress/edit nhỏ/chính actor.

## 7. Deep link
Task `/my-tasks?task=<id>` (FE đã hỗ trợ ?task= mở TaskDetailPanel) · Action `/actions/<id>` ·
Project `/channels/<id>`. Bọc `l/entity/<TEAMS_APP_ID>/giaoviec-home?webUrl=..&context={"subEntityId":path}`;
thiếu App ID → webUrl thường (mở browser). Trong Teams: subEntityId → navigate. Mất quyền →
API scope sẵn, không lộ nội dung.

## 8. Env vars
`TEAMS_ACTIVITY_ENABLED=false` (default) · `TEAMS_APP_ID` · `TEAMS_CATALOG_APP_ID` ·
`TASK_APP_BASE_URL` · Graph reuse `AZURE_AD_TENANT_ID/CLIENT_ID/CLIENT_SECRET` (không nhân đôi).

## 9. Graph permissions cần (admin)
Application permission **TeamsActivity.Send** + **admin consent** (app registration giaoviec
hiện chỉ có delegated User.Read). Expose API `api://task.biahalong.com/<client-id>`.

## 10. Test (test data [T]/[SMOKE], cleanup theo ID + COUNT; UAT nguyên vẹn 6 task/1 action)
| # | Test | Kết quả |
|---|---|---|
| 1-2 | build web + api | ✅ |
| 3-4 | manifest validate + zip 3 file root + inject id | ✅ |
| 5 | teams-js lazy chunk — browser/PWA không tải; routes 200 | ✅ |
| 6 | flag OFF → 0 delivery | ✅ (3→3) |
| 7 | thiếu config → skip an toàn (enabled() check) | ✅ |
| 8 | recipient thiếu entra GUID → `skipped_missing_entra_id` | ✅ |
| 9 | actor == recipient → không gửi | ✅ (0 delivery) |
| 10 | duplicate (add member 2 lần) → 1 delivery | ✅ |
| 11-12 | Graph fail (instance test :4009, secret GIẢ → token 401) → status=error, attempt=2, task/comment vẫn thành công | ✅ |
| 13 | deep link format l/entity + subEntityId + webUrl | ✅ |
| 14 | permission giữ nguyên (403 non-owner v.v. không đổi policy) | ✅ |
| 15 | reminders flag off → 0 Teams; suffix ngày chống trùng | ✅ |
| 16 | in-app notification vẫn hoạt động (comment→notif) | ✅ |

## 11. Chưa verify tenant thật (ghi rõ — KHÔNG tuyên bố PASS tenant)
- Gửi Activity Feed THẬT (cần TeamsActivity.Send + consent + app đã cài cho user).
- Click deep link trong Teams desktop/web/mobile mở tab thật.
- Graph mock chỉ ở mức token-fail (401) + logic; chưa mock 429/500 từng mã riêng (nhánh retry
  đã code theo status; đã verify nhánh error/retry qua 401×2 attempts).
- Đăng nhập trong Teams iframe: cookie hiện `SameSite=Lax` — trong iframe Teams cookie có thể
  không gửi → user phải login lần đầu qua browser, hoặc phase sau thêm Teams SSO/popup auth
  (pattern approval có sẵn). Đã ghi risk, KHÔNG đổi auth flow theo yêu cầu.

## 12. Việc admin cần làm trước khi bật
1. App registration giaoviec: thêm Application permission TeamsActivity.Send → admin consent;
   Expose API `api://task.biahalong.com/<client-id>`.
2. `npm run teams:package` → upload zip vào Teams Admin Center → Allow → Setup policy
   (cài + ghim cho nhóm pilot).
3. `TEAMS_ACTIVITY_ENABLED=true` trong apps/api/.env → `pm2 restart giaoviec-api`.
4. Test theo guide §8. Rollback: flag=false + restart.

## 13. Rủi ro còn lại
- Cookie SameSite=Lax trong Teams iframe (mục 11) — trải nghiệm login lần đầu trong Teams
  có thể phải mở browser; các phiên đã login qua browser trước đó dùng bình thường trên
  Teams desktop (webview chia sẻ). Giải quyết triệt để = Teams SSO (V2).
- User chưa từng đăng nhập app → chưa có entra_id GUID → skipped (tự hết sau lần login đầu).
- Reminders script có bản port Graph tối giản (standalone, không DI) — 2 nơi cần sửa nếu
  đổi payload (đã chú thích chéo).

## 14. Commits
- `167aed5` feat: add teams app package for task app
- `961ddf1` feat: add teams activity feed notifications
- (docs commit — xem git log)

## Kết luận
- **Đủ điều kiện upload vào Teams chưa?** ĐỦ về package (zip validate, app id riêng, icon,
  tab, activityTypes). Chỉ chờ admin consent + upload.
- **Activity Feed code sẵn sàng chưa?** SẴN SÀNG — flag OFF an toàn; bật là chạy sau khi
  admin hoàn tất mục 12; mọi nhánh lỗi đã best-effort.
- **Admin cần làm gì trước khi bật thật?** Mục 12 (permission + consent + upload + policy + flag).
- **Có ảnh hưởng browser/PWA không?** KHÔNG — teams-js lazy chunk chỉ load khi heuristic
  trong Teams; routes/login/PWA giữ nguyên (đã smoke 200).

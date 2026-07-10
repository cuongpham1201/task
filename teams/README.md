# Teams App Package — Giao việc

Đóng gói: `npm run teams:package` → `dist/teams/giao-viec-teams-v<version>.zip`

- `manifest.json` — Teams App ID cố định `8ff868b3-844b-4006-b932-db7db82d9f05` (riêng Giao việc,
  KHÔNG dùng chung với Phê duyệt/Văn bản). `webApplicationInfo.id` là placeholder
  `__AZURE_CLIENT_ID__` — script inject từ `AZURE_AD_CLIENT_ID` (apps/api/.env) lúc đóng gói.
- `color.png` 192×192 (icon app hiện tại) · `outline.png` 32×32 trắng/trong suốt.
- Zip KHÔNG commit (dist/ ignored) vì chứa client id đã resolve.
- Hướng dẫn upload/publish/consent: xem `docs/teams-app-and-activity-guide.md`.

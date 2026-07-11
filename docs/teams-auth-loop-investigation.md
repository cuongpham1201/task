# Teams Auth Loop — Điều tra & Fix

## 1. Root cause (ĐÃ XÁC ĐỊNH, có bằng chứng)
Cookie session `giaoviec_session` đặt **`SameSite=Lax`**. Teams tab = **iframe** của
`teams.microsoft.com` → theo spec SameSite, "site" của request được so với **TOP-LEVEL**
(teams.microsoft.com), không phải document iframe → mọi request từ app trong Teams là
**cross-site** → cookie Lax **KHÔNG được đính kèm** → `/api/v1/auth/me` luôn 401 →
LoginGate hiện màn "Đăng nhập với Microsoft 365" vĩnh viễn (loop). Kèm theo: bấm login
trong iframe → OAuth redirect bị Entra chặn frame → không thể hoàn tất trong iframe.

## 2. Bằng chứng
- Code Giao việc: `auth.controller.ts:32,67` — `sameSite: 'lax'` (state + session).
- **Phê duyệt (production, đã fix đúng lỗi này)** — `approval-bhl/src/lib/auth.ts:255-262`:
  *"cookie SameSite=Lax KHÔNG được gửi trong cross-site iframe → sau signIn() session không
  persist → UI quay mãi. Fix: production HTTPS dùng sameSite 'none' + secure true"*.
- **Văn bản (production)** — `vanban/next-preview/lib/auth/options.ts:143-145,182`:
  `crossSiteSameSite = useSecureCookies ? 'none' : 'lax'` (ghi chú #31K Teams iframe).
- Verify sau fix: `Set-Cookie: …; HttpOnly; Secure; SameSite=None` (đã curl xác nhận,
  không in giá trị cookie).

## 3. Vì sao Redirect URI KHÔNG phải lỗi
Cùng Redirect URI `https://task.biahalong.com/api/v1/auth/callback`, đăng nhập ở browser
ngoài Teams hoạt động bình thường → authorize/callback/token exchange/URI đều đúng.
Lỗi chỉ xuất hiện trong ngữ cảnh iframe → thuộc về cookie context, không phải cấu hình Azure.
**Không cần sửa App Registration / manifest / tenant.**

## 4. So sánh pattern
| Hạng mục | Giao việc (trước) | Phê duyệt | Văn bản | Khác biệt gây lỗi? |
|---|---|---|---|---|
| Session cookie SameSite | **Lax** | None+Secure (https) | None+Secure (https) | **CÓ — root cause** |
| First-login trong Teams | redirect trong iframe (bị chặn) | Teams auth POPUP + `/teams/auth-end` verify session | tương tự | CÓ — cần popup |
| API credentials | fetch `credentials:'include'` | ✓ | ✓ | không |
| CORS | whitelist origin + credentials | ✓ | ✓ | không |
| webApplicationInfo | client id Giao việc (inject) | client id riêng | client id riêng | không |

## 5. File đã sửa (tối thiểu — không refactor auth, không Teams SSO)
- `apps/api/src/auth/auth.controller.ts` — `sameSite: secure() ? 'none' : 'lax'` (session +
  state); `/auth/login?teams=1` set cookie flow nội bộ; callback từ Teams flow → redirect
  `${webOrigin}/auth/teams-complete` (đích HARDCODE nội bộ — không nhận URL ngoài, không open redirect).
- `apps/web/src/utils/teams.js` — `authenticateInTeams()` (Teams auth popup, pattern approval)
  + `notifyTeamsAuthResult()`.
- `apps/web/src/auth/TeamsAuthComplete.jsx` (mới) — trang popup: VERIFY `/me` (6×400ms như
  approval auth-end) rồi mới notifySuccess/Failure; ngoài Teams → tự về `/`.
- `apps/web/src/auth/LoginGate.jsx` — trong Teams: nút login mở popup thay vì redirect iframe;
  fail → hướng dẫn mở browser. Ngoài Teams: giữ nguyên redirect cũ.
- `apps/web/src/App.jsx` — render `/auth/teams-complete` độc lập trước LoginGate.

## 6. Cookie trước/sau
| | Trước | Sau |
|---|---|---|
| giaoviec_session | HttpOnly; Secure; **SameSite=Lax** | HttpOnly; Secure; **SameSite=None** (https) / Lax (dev http) |
| giaoviec_oauth_state | như trên | như trên |
| giaoviec_oauth_teams (mới) | — | HttpOnly; Secure; SameSite=None; Max-Age 10m; giá trị '1' |

## 7. Redirect trước/sau
| | Trước | Sau |
|---|---|---|
| callback thành công | → webOrigin | → webOrigin (browser) · → webOrigin/auth/teams-complete (Teams flow) |
| login trong Teams | redirect iframe (bị Entra chặn) | Teams popup → callback → teams-complete → notifySuccess → reload |

## 8. Test browser (regression)
- Set-Cookie đúng attribute (HttpOnly; Secure; SameSite=None) ✅
- `/me` không cookie → 401; bootstrap với session → 200 (SameSite=None vẫn gửi first-party) ✅
- Routes `/`, `/my-tasks`, `/my-tasks?task=<id>`, `/auth/teams-complete` → 200 ✅
- Build web + api sạch ✅ · UAT data nguyên vẹn (6 task/1 action) ✅
- Login/logout flow browser không đổi logic (chỉ attribute cookie).

## 9. Test Teams — CẦN NGƯỜI DÙNG XÁC NHẬN (không tuyên bố tenant PASS)
Không có Teams client trong môi trường dev. Cần user thật xác nhận:
1. Mở app trong Teams → nếu đã từng login browser: vào thẳng (cookie giờ được gửi).
2. Nếu chưa: bấm "Đăng nhập với Microsoft 365" → popup → login → popup tự đóng → vào app.
3. Refresh tab Teams → không quay lại login.
4. Teams desktop + web + mobile.

## 10. Rủi ro bảo mật (SameSite=None)
- Cookie giờ gửi ở mọi cross-site request → CSRF surface tăng. Mitigation hiện có:
  (1) cookie HttpOnly (không đọc được từ JS); (2) CORS whitelist origin + credentials —
  origin lạ bị chặn đọc response và bị preflight chặn JSON mutation; (3) mọi mutation là
  JSON body + ValidationPipe (form cross-site không gửi được `application/json`);
  (4) OAuth state cookie vẫn validate chống CSRF trên callback.
- Cùng trade-off mà Phê duyệt/Văn bản đã chấp nhận và chạy production.
- Không tắt Secure, không wildcard domain, không open redirect (đích teams-complete hardcode).

## 11. Commit
`fix: resolve microsoft teams authentication loop` — xem git log.

## 12. Việc admin còn phải làm
- KHÔNG cần sửa Azure/App Registration/manifest cho lỗi này.
- Chỉ cần user Teams thử lại theo mục 9 sau khi API restart (đã restart pm2 dev).

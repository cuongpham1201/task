# Hướng dẫn Admin tenant M365 — chuẩn bị cho app "Giao việc"

Tài liệu cho quản trị viên Microsoft 365 của công ty. Gồm 3 việc, làm theo thứ tự.
Việc 1–2 cần cho **Phase 3B (đăng nhập Entra ID)**; việc 3 chỉ cần khi làm **file đính kèm SharePoint** (phase sau).

## 1. Tạo App registration cho Frontend (SPA)

Entra admin center → Identity → Applications → App registrations → **New registration**:

- Name: `GiaoViec-Web`
- Supported account types: **Accounts in this organizational directory only** (single tenant)
- Redirect URI: chọn platform **Single-page application (SPA)**, URI: `http://localhost:5173`
  (sau thêm URL staging nội bộ, VD `https://giaoviec.congty.local`)

Sau khi tạo, ghi lại: **Application (client) ID** và **Directory (tenant) ID**.

## 2. Tạo App registration cho Backend (API)

Tạo registration thứ hai:

- Name: `GiaoViec-API`
- Single tenant, không cần Redirect URI
- Vào **Expose an API** → Set Application ID URI (chấp nhận mặc định `api://<client-id>`)
  → **Add a scope**:
  - Scope name: `access_as_user`
  - Who can consent: Admins and users
  - Display name/description: "Truy cập API Giao việc"
- Quay lại app `GiaoViec-Web` → **API permissions** → Add a permission → My APIs →
  chọn `GiaoViec-API` → Delegated → tick `access_as_user` → **Grant admin consent**.

Ghi lại **Application (client) ID** của GiaoViec-API (dùng làm `audience` khi backend validate token).

### Quyền Graph cho đồng bộ user/phòng ban (backend)

Trong `GiaoViec-API` → API permissions → Add a permission → Microsoft Graph → **Application permissions**:

- `User.Read.All` (đọc danh sách user, thuộc tính department/jobTitle)

→ **Grant admin consent**. Tạo **client secret** (Certificates & secrets → New client secret,
hạn 12–24 tháng) và gửi cho đội dev qua kênh an toàn (không gửi chat/email thường).

## 3. SharePoint cho file đính kèm (làm sau, khi đội dev báo)

1. Tạo SharePoint site riêng (Team site, không gắn Teams): tên `GiaoViec`,
   URL dạng `https://<tenant>.sharepoint.com/sites/GiaoViec`.
2. Trong site tạo document library tên `TaskFiles`.
3. Cấp quyền app lên **đúng site này** (nguyên tắc least-privilege, KHÔNG cấp Sites.ReadWrite.All toàn tenant):
   - Trong `GiaoViec-API` → API permissions → Microsoft Graph → Application permissions →
     thêm **`Sites.Selected`** → Grant admin consent.
   - Grant quyền write cho app trên site (chạy bằng tài khoản SharePoint admin,
     dùng PnP PowerShell hoặc Graph):

```powershell
# PnP PowerShell
Connect-PnPOnline -Url https://<tenant>.sharepoint.com/sites/GiaoViec -Interactive
Grant-PnPAzureADAppSitePermission `
  -AppId "<client-id của GiaoViec-API>" `
  -DisplayName "GiaoViec-API" `
  -Permissions Write
```

4. Gửi cho đội dev: URL site + tên library.

## Thông tin cần bàn giao cho đội dev

| Mục | Giá trị |
|---|---|
| Tenant ID | … |
| Client ID `GiaoViec-Web` | … |
| Client ID `GiaoViec-API` | … |
| Client secret `GiaoViec-API` | gửi kênh an toàn |
| URL SharePoint site + library (bước 3) | … |

## Chính sách file đính kèm đã chốt (để cấu hình backend)

- Tối đa **50MB/file**
- Cho phép: `pdf, doc, docx, xls, xlsx, ppt, pptx, txt, jpg, jpeg, png`
- Chặn: `exe, bat, cmd, js, msi, zip, rar` (mở thêm khi có nhu cầu rõ ràng)

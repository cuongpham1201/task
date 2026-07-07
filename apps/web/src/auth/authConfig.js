// SSO do BACKEND điều phối (giống app văn bản/phê duyệt): frontend KHÔNG giữ
// client id/secret. Đăng nhập = điều hướng tới endpoint của API; phiên nằm ở
// cookie httpOnly do API set.
export const apiBase =
  (import.meta.env.VITE_API_BASE || '').trim() || 'http://localhost:3001/api/v1'

// Dev-only: gửi kèm email này khi backend đang ở chế độ dev (chưa bật SSO).
export const devUserEmail = (import.meta.env.VITE_DEV_USER_EMAIL || '').trim()

export const loginUrl = `${apiBase}/auth/login`
export const logoutUrl = `${apiBase}/auth/logout`

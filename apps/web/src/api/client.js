import { apiBase, devUserEmail } from '../auth/authConfig'

/**
 * Gọi API kèm cookie session (credentials: include). Ở chế độ dev, gửi thêm
 * x-dev-user-email để backend phân giải danh tính khi chưa bật SSO.
 * Lỗi 401 → gắn err.status = 401 để LoginGate hiện màn đăng nhập.
 */
export async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (devUserEmail) headers['x-dev-user-email'] = devUserEmail

  const res = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })
  if (res.status === 401) {
    const err = new Error('unauthorized')
    err.status = 401
    throw err
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${path} lỗi ${res.status}: ${body}`)
  }
  return res.status === 204 ? null : res.json()
}

/** Upload 1 tệp qua multipart (không set Content-Type để browser tự gắn boundary). */
export async function uploadFile(path, file) {
  const fd = new FormData()
  fd.append('file', file)
  const headers = {}
  if (devUserEmail) headers['x-dev-user-email'] = devUserEmail
  const res = await fetch(`${apiBase}${path}`, { method: 'POST', credentials: 'include', headers, body: fd })
  if (res.status === 401) { const e = new Error('unauthorized'); e.status = 401; throw e }
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`Upload lỗi ${res.status}: ${b}`) }
  return res.json()
}

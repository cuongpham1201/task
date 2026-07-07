// Danh tính phân giải từ token (Entra) hoặc header (dev), gắn vào request.
export interface AuthClaims {
  /** Entra Object ID (oid) — khóa join sang HRM (UserProfile.ms_oid). */
  oid: string | null
  /** Email/UPN — khóa fallback. */
  email: string | null
  name: string | null
  raw: Record<string, unknown>
}

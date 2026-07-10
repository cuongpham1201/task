import { Injectable, Logger } from '@nestjs/common'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'

const AVATAR_DIR = resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'), 'avatars')
const TTL_MS = 7 * 24 * 3600 * 1000 // 7 ngày — không gọi Graph mỗi lần login lại

/**
 * BUG3: Avatar M365 — lấy ảnh từ Graph ĐÚNG LÚC LOGIN (delegated User.Read, token sẵn có
 * từ authorization code — không đổi auth/app registration), cache ra disk + user.avatarUrl.
 * Fail-safe tuyệt đối: mọi lỗi Graph/timeout chỉ log, không chặn đăng nhập.
 */
@Injectable()
export class AvatarService {
  private readonly log = new Logger('Avatar')
  constructor(private readonly prisma: PrismaService) {}

  pathFor(userId: string) {
    return join(AVATAR_DIR, `${userId}.jpg`)
  }

  /** Gọi sau khi login OK (fire-and-forget). accessToken = token Graph từ code exchange. */
  async fetchAndCache(userId: string, accessToken: string | null | undefined) {
    try {
      if (!accessToken) return
      const file = this.pathFor(userId)
      // Cache TTL: còn tươi → bỏ qua, không gọi Graph
      if (existsSync(file) && Date.now() - statSync(file).mtimeMs < TTL_MS) return

      const res = await fetch('https://graph.microsoft.com/v1.0/me/photos/96x96/$value', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return // 404 = user không có ảnh → giữ fallback initials
      const buf = Buffer.from(await res.arrayBuffer())
      if (!buf.length) return
      mkdirSync(AVATAR_DIR, { recursive: true })
      writeFileSync(file, buf)
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: `/api/v1/users/${userId}/avatar` },
      })
    } catch (e: any) {
      this.log.warn(`Bỏ qua avatar Graph cho ${userId}: ${e?.message || e}`)
    }
  }
}

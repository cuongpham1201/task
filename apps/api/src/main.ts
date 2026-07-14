// Nạp .env cho runtime (Node >= 20.12). Production dùng env thật thì bỏ qua.
try {
  process.loadEnvFile()
} catch {
  /* .env không bắt buộc */
}

import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { json, urlencoded } from 'express'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { loadAzureAdConfig } from './auth/entra.config'

async function bootstrap() {
  // Tự quản body parser để nới giới hạn RIÊNG cho route import (JSON Asana lớn),
  // các route khác giữ giới hạn nhỏ (an toàn). Multipart (attachments) do multer xử lý riêng.
  const app = await NestFactory.create(AppModule, { bodyParser: false })
  app.setGlobalPrefix('api/v1')
  app.use(cookieParser())
  app.use('/api/v1/admin/import', json({ limit: '30mb' })) // P1-6: chỉ path import (JSON Asana lớn)
  app.use(json({ limit: '1mb' }))
  app.use(urlencoded({ extended: true, limit: '1mb' }))
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )

  // Cookie session → CORS phải cho credentials + origin cụ thể (không dùng '*').
  const webOrigin = loadAzureAdConfig().webOrigin
  app.enableCors({
    origin: [webOrigin, /^http:\/\/localhost:\d+$/],
    credentials: true,
  })

  const port = Number(process.env.PORT) || 3000
  await app.listen(port)
  console.log(`API Giao việc chạy tại http://localhost:${port}/api/v1`)
}
bootstrap()

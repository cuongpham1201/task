// Nạp .env cho runtime (Node >= 20.12). Production dùng env thật thì bỏ qua.
try {
  process.loadEnvFile()
} catch {
  /* .env không bắt buộc */
}

import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api/v1')
  app.enableCors({
    origin: [/^http:\/\/localhost:\d+$/],
  })
  const port = Number(process.env.PORT) || 3000
  await app.listen(port)
  console.log(`API Giao việc chạy tại http://localhost:${port}/api/v1`)
}
bootstrap()

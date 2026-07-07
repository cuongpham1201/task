// Sinh icon PWA từ logo sao đỏ Bia Hạ Long (SVG có sẵn trong project — BrandLogo).
// Chạy: node scripts/make-icons.mjs  → ghi public/icons/*.png
import sharp from 'sharp'
import { mkdirSync } from 'fs'

const PETAL = '24,23 18.5,13 24,3 29.5,13'
const ANGLES = [0, 60, 120, 180, 240, 300]
const star = (color) =>
  ANGLES.map((a) => `<polygon points="${PETAL}" fill="${color}" transform="rotate(${a} 24 24)"/>`).join('')

// Icon thường: nền trắng bo góc + sao đỏ
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10" fill="#ffffff"/>
  ${star('#e31e24')}
</svg>`

// Maskable: safe-zone 80% giữa — nền trắng phủ kín, sao thu nhỏ vào giữa
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" fill="#ffffff"/>
  <g transform="translate(24 24) scale(0.72) translate(-24 -24)">${star('#e31e24')}</g>
</svg>`

mkdirSync('public/icons', { recursive: true })
const jobs = [
  [iconSvg, 192, 'public/icons/icon-192.png'],
  [iconSvg, 512, 'public/icons/icon-512.png'],
  [maskableSvg, 512, 'public/icons/icon-maskable-512.png'],
  [iconSvg, 180, 'public/icons/apple-touch-icon.png'],
]
for (const [svg, size, out] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out)
  console.log('✓', out)
}

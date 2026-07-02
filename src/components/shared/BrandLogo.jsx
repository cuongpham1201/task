// Logo Bia Hạ Long: ngôi sao 6 cánh hình thoi màu đỏ
const PETAL = '24,23 18.5,13 24,3 29.5,13'
const ANGLES = [0, 60, 120, 180, 240, 300]

export default function BrandLogo({ size = 18, color = '#e31e24' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      {ANGLES.map((a) => (
        <polygon key={a} points={PETAL} fill={color} transform={`rotate(${a} 24 24)`} />
      ))}
    </svg>
  )
}

// Màu chấm phòng ban ỔN ĐỊNH theo code (hash → hue), thay vì hard-code vài mã.
// Cùng một code luôn ra cùng màu.
export function deptColor(code = '') {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360
  return `hsl(${h}, 55%, 55%)`
}

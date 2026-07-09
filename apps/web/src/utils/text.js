// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu ("huong" khớp "Hương").
export function deaccent(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

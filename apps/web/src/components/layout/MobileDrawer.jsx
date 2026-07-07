import Sidebar from './Sidebar'

/**
 * Drawer trái cho mobile: bọc nguyên Sidebar hiện có, thêm overlay.
 * Bấm vào link điều hướng (thẻ <a>) hoặc overlay thì tự đóng.
 */
export default function MobileDrawer({ open, onClose }) {
  if (!open) return null
  return (
    <div className="mobile-drawer-root">
      <div className="mobile-drawer-overlay" onClick={onClose} />
      <div
        className="mobile-drawer"
        onClick={(e) => {
          if (e.target.closest('a')) onClose()
        }}
      >
        <Sidebar />
      </div>
    </div>
  )
}

export default function ProgressBar({ value, width = 72, showLabel = true }) {
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <span className="progress-wrap">
      <span className="progress-track" style={{ width }}>
        <span
          className={`progress-fill ${v === 100 ? 'complete' : ''}`}
          style={{ width: `${v}%` }}
        />
      </span>
      {showLabel && <span className="progress-label">{v}%</span>}
    </span>
  )
}

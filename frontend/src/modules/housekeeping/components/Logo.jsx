// Grand Horizon Hotel mark: a gold skyline under an arch.
export default function Logo({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="hk-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#c8901a" />
        </linearGradient>
      </defs>
      <path d="M8 40 A24 24 0 0 1 56 40" fill="none" stroke="url(#hk-gold)" strokeWidth="2.5" />
      <rect x="15" y="30" width="6" height="16" fill="url(#hk-gold)" />
      <rect x="23" y="20" width="6" height="26" fill="url(#hk-gold)" />
      <rect x="31" y="14" width="6" height="32" fill="url(#hk-gold)" />
      <rect x="39" y="22" width="6" height="24" fill="url(#hk-gold)" />
      <rect x="47" y="32" width="4" height="14" fill="url(#hk-gold)" />
      <path d="M8 48 Q32 42 56 48" fill="none" stroke="url(#hk-gold)" strokeWidth="2.5" />
    </svg>
  )
}

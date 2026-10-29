import { useState } from 'react'

// Small SVG charts for the Housekeeping Dashboard.

// Vertical bar chart, one series. data: [{ label, value }]
export function BarChart({ data, color = '#2a23c9', height = 220, label }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const W = 520
  const H = height
  const pad = { l: 32, r: 8, t: 14, b: 34 }
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const step = plotW / data.length
  const barW = Math.min(44, step * 0.56)
  const y = (v) => pad.t + plotH - (v / top) * plotH

  return (
    <div className="hk-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e3e1ec" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="hk-chart__axis">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + step * i + (step - barW) / 2
          const h = Math.max((d.value / top) * plotH, d.value ? 2 : 0)
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + step * i} y={pad.t} width={step} height={plotH} fill="transparent" />
              <path d={roundedTop(x, y(0) - h, barW, h, 4)} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />
              <text x={x + barW / 2} y={y(0) - h - 5} textAnchor="middle" className="hk-chart__value">{d.value}</text>
              <text x={x + barW / 2} y={H - pad.b + 16} textAnchor="middle" className="hk-chart__axis">{d.label}</text>
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="hk-chart__tip" style={{ left: `${((pad.l + step * hover + step / 2) / W) * 100}%` }}>
          <strong>{data[hover].value}</strong> {data[hover].label.toLowerCase()}
        </div>
      )}
    </div>
  )
}

// Donut with a legend that lists every slice and its count.
// data: [{ label, value, color }]
export function DonutChart({ data, total, centerLabel, label }) {
  const [hover, setHover] = useState(null)
  const sum = data.reduce((a, d) => a + d.value, 0) || 1
  const R = 70
  const r = 46
  const gap = data.filter((d) => d.value).length > 1 ? 0.03 : 0
  const starts = data.map((_, i) => data.slice(0, i).reduce((a, d) => a + d.value, 0))
  const arcs = data.map((d, i) => {
    const start = -Math.PI / 2 + (starts[i] / sum) * Math.PI * 2
    const sweep = (d.value / sum) * Math.PI * 2
    return { ...d, path: d.value ? arcPath(start + gap / 2, start + sweep - gap / 2, R, r) : null }
  })
  const shown = hover !== null ? data[hover] : null

  return (
    <div className="hk-donut">
      <svg viewBox="-80 -80 160 160" role="img" aria-label={label}>
        {arcs.map((a, i) =>
          a.path ? (
            <path
              key={a.label}
              d={a.path}
              fill={a.color}
              opacity={hover === null || hover === i ? 1 : 0.4}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ) : null
        )}
        <text y="-2" textAnchor="middle" className="hk-donut__total">{shown ? shown.value : total ?? sum}</text>
        <text y="16" textAnchor="middle" className="hk-donut__label">{shown ? shown.label : centerLabel}</text>
      </svg>
      <ul className="hk-legend">
        {data.map((d, i) => (
          <li key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="hk-legend__swatch" style={{ background: d.color }} />
            <span>{d.label}</span>
            <strong>{d.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

function niceTicks(max) {
  const step = max <= 5 ? 1 : max <= 10 ? 2 : Math.ceil(max / 5)
  const ticks = []
  for (let v = 0; v <= max + step - 1 && ticks.length < 7; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

function roundedTop(x, y, w, h, rad) {
  if (h <= 0) return ''
  const k = Math.min(rad, h, w / 2)
  return `M${x},${y + h}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + h}Z`
}

function arcPath(a0, a1, R, r) {
  const p = (rad, a) => `${(rad * Math.cos(a)).toFixed(2)},${(rad * Math.sin(a)).toFixed(2)}`
  const large = a1 - a0 > Math.PI ? 1 : 0
  if (a1 - a0 >= Math.PI * 2 - 0.001) {
    return `M${p(R, 0)}A${R},${R} 0 1 1 ${p(R, Math.PI)}A${R},${R} 0 1 1 ${p(R, 0)}ZM${p(r, 0)}A${r},${r} 0 1 0 ${p(r, Math.PI)}A${r},${r} 0 1 0 ${p(r, 0)}Z`
  }
  return `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`
}

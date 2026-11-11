import { useEffect, useState, type ReactNode } from 'react'
import { brl, brlSigned, pct } from '../lib/format'
import { mesAno, mesCurto } from '../lib/dates'
import { addMonths, ymOf } from '../lib/dates'
import type { Periodo } from '../lib/engine'

/* ---------------------------------------------------------------- roteador */
let current = '/'
const stack: string[] = []
const subs = new Set<() => void>()
const notify = () => { window.scrollTo(0, 0); subs.forEach(f => f()) }
export const go = (p: string) => { stack.push(current); current = p; notify() }
export const back = () => { current = stack.pop() ?? '/'; notify() }
// Roteamento em memória: funciona dentro de iframes (artifact) e como PWA.
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest?.('a[href^="#/"]') as HTMLAnchorElement | null
    if (!a) return
    e.preventDefault()
    go(a.getAttribute('href')!.slice(1))
  })
}
export const usePath = () => {
  const [p, setP] = useState(current)
  useEffect(() => {
    const f = () => setP(current)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [])
  return p
}

/* -------------------------------------------------------------- componentes */
export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section className={`card ${className}`}>{children}</section>
)
export const Title = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="row between"><h3>{children}</h3>{right}</div>
)

export function Chips<T extends string>({ value, onChange, options, small }: {
  value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; small?: boolean
}) {
  return (
    <div className={`chips ${small ? 'small' : ''}`} role="tablist">
      {options.map(o => (
        <button key={o.id} role="tab" aria-selected={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Toggle({ value, onChange }: { value: 'pct' | 'brl'; onChange: (v: 'pct' | 'brl') => void }) {
  return <Chips small value={value} onChange={onChange} options={[{ id: 'pct', label: '%' }, { id: 'brl', label: 'R$' }]} />
}

export const Header = ({ title, sub, right, onBack }: { title: string; sub?: string; right?: ReactNode; onBack?: boolean }) => (
  <header className="hdr">
    <div className="row">
      {onBack && <button className="icon" aria-label="Voltar" onClick={back}>‹</button>}
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
    </div>
    {right}
  </header>
)

export const Money = ({ v, className = '' }: { v: number; className?: string }) => <span className={className}>{brl(v)}</span>
export const Delta = ({ v, mode, d = 2 }: { v: number; mode: 'pct' | 'brl'; d?: number }) => (
  <span className={v < -1e-9 ? 'neg' : v > 1e-9 ? 'pos' : ''}>{mode === 'pct' ? pct(v, d) : brlSigned(v)}</span>
)

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>

/* ------------------------------------------------------ seletor de período */
export function periodOptions(today: string): { id: Periodo; label: string }[] {
  const nowYm = ymOf(today)
  const last3 = [-2, -1, 0].map(n => addMonths(nowYm, n))
  return [
    { id: 'ano', label: 'Ano' }, { id: '3m', label: '3 meses' }, { id: '6m', label: '6 meses' },
    { id: '12m', label: '12 meses' }, { id: 'all', label: 'Desde o início' },
    ...last3.map(m => ({ id: m, label: mesCurto(m) })),
  ]
}
export const periodLabel = (p: Periodo, today: string) =>
  ({ ano: `Ano de ${today.slice(0, 4)}`, '3m': 'Últimos 3 meses', '6m': 'Últimos 6 meses', '12m': 'Últimos 12 meses', all: 'Desde o início' } as Record<string, string>)[p] ?? mesAno(p)

/* ----------------------------------------------------------------- gráficos */
export function Bars({ items, selected, onSelect, mode }: {
  items: { key: string; label: string; v: number; cdi?: number }[]
  selected?: string | null; onSelect?: (k: string | null) => void; mode: 'pct' | 'brl'
}) {
  const W = 340, H = 150, top = 14, bot = 22
  const vals = items.flatMap(i => [i.v, i.cdi ?? 0, 0])
  const max = Math.max(...vals), min = Math.min(...vals)
  const span = max - min || 1
  const y = (v: number) => top + ((max - v) / span) * (H - top - bot)
  const bw = W / Math.max(items.length, 1)
  const fmt = (v: number) => (mode === 'pct' ? pct(v, 1) : brlSigned(Math.round(v)).replace('R$ ', ''))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Gráfico de barras">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" />
      {items.map((it, i) => {
        const x = i * bw + bw * 0.18, w = bw * 0.64
        const y0 = y(0), y1 = y(it.v)
        const on = selected === it.key
        return (
          <g key={it.key} onClick={() => onSelect?.(on ? null : it.key)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
            <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
            <rect x={x} y={Math.min(y0, y1)} width={w} height={Math.max(2, Math.abs(y1 - y0))} rx="3"
              fill={it.v >= 0 ? 'var(--brand)' : 'var(--neg)'} opacity={selected && !on ? 0.35 : 1} />
            {it.cdi !== undefined && <line x1={x - 2} x2={x + w + 2} y1={y(it.cdi)} y2={y(it.cdi)} stroke="var(--accent)" strokeWidth="2" strokeDasharray="3 2" />}
            {(items.length <= 8 || on) && <text x={i * bw + bw / 2} y={Math.min(y0, y1) - 3} textAnchor="middle" className="bl">{fmt(it.v)}</text>}
            <text x={i * bw + bw / 2} y={H - 6} textAnchor="middle" className="bx">{it.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function Lines({ labels, a, b, aName, bName }: { labels: string[]; a: number[]; b?: number[]; aName: string; bName?: string }) {
  const W = 340, H = 150, px = 4, top = 10, bot = 22
  const all = [...a, ...(b ?? [])]
  const lo = Math.min(...all), hi = Math.max(...all)
  const span = hi - lo || 1
  const n = a.length
  const X = (i: number) => px + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * px))
  const Y = (v: number) => top + ((hi - v) / span) * (H - top - bot)
  const path = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const idxs = labels.length > 6 ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1] : labels.map((_, i) => i)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Gráfico: ${aName}${bName ? ' e ' + bName : ''}`}>
        {b && <path d={path(b)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 4" />}
        <path d={path(a)} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />
        {idxs.map(i => <text key={i} x={X(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} className="bx">{labels[i]}</text>)}
      </svg>
      <div className="legend"><span><i style={{ background: 'var(--brand)' }} />{aName}</span>{bName && <span><i style={{ background: 'var(--accent)' }} />{bName}</span>}</div>
    </div>
  )
}

export function Donut({ parts }: { parts: { nome: string; v: number; cor: string }[] }) {
  const tot = parts.reduce((s, p) => s + p.v, 0) || 1
  const r = 52, C = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Distribuição por classe">
        <g transform="rotate(-90 70 70)">
          {parts.map(p => {
            const len = (p.v / tot) * C
            const el = <circle key={p.nome} cx="70" cy="70" r={r} fill="none" stroke={p.cor} strokeWidth="22" strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-acc} />
            acc += len
            return el
          })}
        </g>
      </svg>
      <ul>{parts.map(p => <li key={p.nome}><i style={{ background: p.cor }} />{p.nome}<b>{((p.v / tot) * 100).toFixed(1).replace('.', ',')}%</b></li>)}</ul>
    </div>
  )
}

/* ---------------------------------------------------------------- navegação */
export function Nav({ path }: { path: string }) {
  const items: [string, string, string][] = [['/', 'Visão geral', '◔'], ['/rent', 'Rentabilidade', '↗'], ['/carteira', 'Carteira', '▤'], ['/proventos', 'Proventos', '$'], ['/mais', 'Mais', '⋯']]
  const active = (p: string) => (p === '/' ? path === '/' : path.startsWith(p)) || (p === '/mais' && /^\/(tesouro|mov|config|novo)/.test(path)) || (p === '/carteira' && /^\/(ativo|aporte|resgate|provento|editar)/.test(path))
  return (
    <nav className="nav">
      {items.map(([p, l, ic]) => (
        <a key={p} href={`#${p}`} className={active(p) ? 'on' : ''}><span>{ic}</span>{l}</a>
      ))}
    </nav>
  )
}

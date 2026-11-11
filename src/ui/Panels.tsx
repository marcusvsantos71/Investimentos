import { useMemo, useState } from 'react'
import { CLASSES, classeInfo, type Classe, type Position } from '../types'
import { aggregate, periodMonths, saldoByClasse, valueAt, type Agg, type Periodo } from '../lib/engine'
import { brl, pct } from '../lib/format'
import { mesAno } from '../lib/dates'
import { useStore } from '../store'
import { Bars, Card, Chips, Delta, Empty, Header, Title, Toggle, go, periodLabel, periodOptions } from './kit'

export function SemDados() {
  const { loadSample } = useStore()
  return (
    <Card>
      <Empty>
        <b>Nenhum investimento cadastrado</b>
        <span>Cadastre seu primeiro investimento ou carregue uma carteira fictícia para conhecer o app.</span>
        <a className="btn" href="#/novo">Cadastrar investimento</a>
        <button className="btn sec" onClick={loadSample}>Carregar carteira de exemplo</button>
      </Empty>
    </Card>
  )
}

export function StatusPill() {
  const { ctx, atualizando, refresh, data } = useStore()
  const m = ctx.market
  const txt = atualizando ? 'Atualizando…' : data.config.modo === 'simulado' ? 'Dados simulados' : m.source === 'ao-vivo' ? `Cotações de ${m.updatedAt?.split('-').reverse().slice(0, 2).join('/')}` : 'Sem cotações'
  return (
    <button className={`pill ${data.config.modo === 'simulado' || m.avisos.length ? 'warn' : ''}`} onClick={() => (data.config.modo === 'ao-vivo' ? refresh() : go('/config'))} title="Atualizar cotações">
      ● {txt}
    </button>
  )
}

export function Avisos() {
  const { ctx, data } = useStore()
  if (data.config.modo === 'simulado') return <div className="banner">Modo simulado: cotações e índices são fictícios. Mude para “ao vivo” em Mais › Configurações.</div>
  if (!ctx.market.avisos.length) return null
  return (
    <div className="banner">
      Algumas fontes não responderam e o app usou o que tinha (ou o valor aplicado):
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{ctx.market.avisos.map(a => <li key={a}>{a}</li>)}</ul>
    </div>
  )
}

/** Agrupa linhas mensais (para "desde o início" com muitos meses). */
function group(agg: Agg, size: number) {
  const out: { key: string; label: string; v: number; cdi: number; abs: number; cdiAbs: number }[] = []
  for (let i = 0; i < agg.rows.length; i += size) {
    const part = agg.rows.slice(i, i + size)
    const p = part.reduce((f, r) => f * (1 + r.pct), 1) - 1
    const c = part.reduce((f, r) => f * (1 + r.cdiPct), 1) - 1
    out.push({
      key: part[0].ym, abs: part.reduce((s, r) => s + r.abs, 0), cdiAbs: part.reduce((s, r) => s + r.cdiAbs, 0), v: p, cdi: c,
      label: size === 1 ? mesAno(part[0].ym).slice(0, 3) : `${mesAno(part[0].ym)}`,
    })
  }
  return out
}

/** Card "Rendimento" com toggle %/R$, períodos e barras. Controlado pelo pai para o filtro valer também na tabela. */
export function PerfCard({ title, posIds, mode, setMode, periodo, setPeriodo }: {
  title: string; posIds: Set<string> | null; mode: 'pct' | 'brl'; setMode: (m: 'pct' | 'brl') => void; periodo: Periodo; setPeriodo: (p: Periodo) => void
}) {
  const { ctx, perf } = useStore()
  const months = periodMonths(perf, periodo, ctx.today)
  const agg = useMemo(() => aggregate(perf, posIds, months), [perf, posIds, months])
  const [sel, setSel] = useState<string | null>(null)
  const size = months.length > 18 ? 6 : 1
  const items = group(agg, size)
  const bars = items.map(i => ({ key: i.key, label: i.label, v: mode === 'pct' ? i.v : i.abs, cdi: mode === 'pct' ? i.cdi : i.cdiAbs }))
  const s = items.find(i => i.key === sel)
  const shown = s ? { abs: s.abs, pct: s.v, cdiAbs: s.cdiAbs, cdiPct: s.cdi, name: size === 1 ? mesAno(s.key) : `a partir de ${mesAno(s.key)}` } : { ...agg, name: periodLabel(periodo, ctx.today) }
  return (
    <Card>
      <Title right={<Toggle value={mode} onChange={setMode} />}>{title}</Title>
      <Chips value={periodo} onChange={p => { setPeriodo(p); setSel(null) }} options={periodOptions(ctx.today)} small />
      <div>
        <p className="muted">{shown.name}</p>
        <div className="big"><Delta v={mode === 'pct' ? shown.pct : shown.abs} mode={mode} /></div>
        <p className="muted">CDI no período: {mode === 'pct' ? pct(shown.cdiPct) : brl(shown.cdiAbs)}{shown.cdiPct > 0 && mode === 'pct' ? ` · ${Math.round((shown.pct / shown.cdiPct) * 100)}% do CDI` : ''}</p>
      </div>
      {bars.length ? <Bars items={bars} selected={sel} onSelect={setSel} mode={mode} /> : <Empty>Sem dados no período.</Empty>}
      <div className="legend"><span><i style={{ background: 'var(--brand)' }} />Carteira</span><span><i style={{ background: 'var(--accent)' }} />CDI</span></div>
    </Card>
  )
}

/** Tabela por classe ou por posição, com o mesmo filtro (%/R$ e período) do card acima. */
export function PerfTable({ rows, mode, periodo, title }: {
  rows: { key: string; nome: string; cor?: string; saldo: number; ids: Set<string>; href?: string }[]
  mode: 'pct' | 'brl'; periodo: Periodo; title: string
}) {
  const { ctx, perf } = useStore()
  const months = periodMonths(perf, periodo, ctx.today)
  const all = new Set(rows.flatMap(r => [...r.ids]))
  const tot = aggregate(perf, all, months)
  const totSaldo = rows.reduce((s, r) => s + r.saldo, 0)
  const cell = (a: Agg) => (mode === 'pct' ? [pct(a.pct), pct(a.cdiPct)] : [null, null])
  return (
    <Card>
      <Title>{title}</Title>
      <div className="tbl">
        <div className="h">{periodLabel(periodo, ctx.today)}</div><div className="h r">Rendimento</div><div className="h r">CDI</div>
        {rows.map(r => {
          const a = aggregate(perf, r.ids, months)
          const [, c] = cell(a)
          const nome = <><span>{r.cor && <i className="dot" style={{ background: r.cor }} />}{r.nome}</span><small>{brl(r.saldo)}</small></>
          return (
            <Row key={r.key}>
              <div>{r.href ? <a href={r.href}>{nome}</a> : nome}</div>
              <div className="r"><Delta v={mode === 'pct' ? a.pct : a.abs} mode={mode} /></div>
              <div className="r">{mode === 'pct' ? c : brl(a.cdiAbs)}</div>
            </Row>
          )
        })}
        <div className="tot">Total<small>{brl(totSaldo)}</small></div>
        <div className="r tot"><Delta v={mode === 'pct' ? tot.pct : tot.abs} mode={mode} /></div>
        <div className="r tot">{mode === 'pct' ? pct(tot.cdiPct) : brl(tot.cdiAbs)}</div>
      </div>
    </Card>
  )
}
const Row = ({ children }: { children: React.ReactNode }) => <>{children}</>

export function Rentabilidade() {
  const { ctx, perf, data } = useStore()
  const [mode, setMode] = useState<'pct' | 'brl'>('pct')
  const [periodo, setPeriodo] = useState<Periodo>('12m')
  const k = aggregate(perf, null, periodMonths(perf, '12m', ctx.today))
  const saldos = saldoByClasse(ctx)
  const rows = CLASSES.map(c => ({ key: c.id, nome: c.nome, cor: c.cor, saldo: saldos[c.id], ids: new Set(ctx.positions.filter(p => p.classe === c.id).map(p => p.id)) })).filter(r => r.ids.size)
  return (
    <>
      <Header title="Rentabilidade" right={<StatusPill />} />
      <Avisos />
      {!data.positions.length ? <SemDados /> : (
        <>
          <Card>
            <p className="muted">Rentabilidade 12 meses</p>
            <div className="big"><Delta v={k.pct} mode="pct" /></div>
            <p className="muted">{k.cdiPct > 0 ? `${Math.round((k.pct / k.cdiPct) * 100)}% do CDI (${pct(k.cdiPct)})` : 'CDI indisponível'}</p>
          </Card>
          <PerfCard title="Rendimento da carteira" posIds={null} mode={mode} setMode={setMode} periodo={periodo} setPeriodo={setPeriodo} />
          <PerfTable title="Rendimento por classe" rows={rows} mode={mode} periodo={periodo} />
          <p className="note">Rendimento = variação do patrimônio descontados aportes e resgates (método de Dietz modificado). Dividendos, JCP e cupons ficam em Proventos e não entram aqui. Valores antes do IR.</p>
        </>
      )}
    </>
  )
}

export function Carteira() {
  const { ctx, data } = useStore()
  const [classe, setClasse] = useState<Classe | 'todos'>('todos')
  const [mode, setMode] = useState<'pct' | 'brl'>('pct')
  const [periodo, setPeriodo] = useState<Periodo>('12m')
  const list: Position[] = ctx.positions.filter(p => classe === 'todos' || p.classe === classe)
  const ids = useMemo(() => new Set(list.map(p => p.id)), [list.map(p => p.id).join()])
  const total = list.reduce((s, p) => s + valueAt(ctx, p, ctx.today), 0)
  const rows = list.map(p => ({ key: p.id, nome: p.nome, cor: classeInfo(p.classe).cor, saldo: valueAt(ctx, p, ctx.today), ids: new Set([p.id]), href: `#/ativo/${p.id}` }))
    .sort((a, b) => b.saldo - a.saldo)
  return (
    <>
      <Header title="Carteira" right={<div className="row"><StatusPill /><a className="plus" href="#/novo" aria-label="Novo investimento">+</a></div>} />
      <Avisos />
      {!data.positions.length ? <SemDados /> : (
        <>
          <Card>
            <p className="muted">{classe === 'todos' ? 'Total da carteira' : classeInfo(classe).nome}</p>
            <div className="big">{brl(total)}</div>
            <Chips value={classe} onChange={setClasse} small options={[{ id: 'todos', label: 'Todos' }, ...CLASSES.map(c => ({ id: c.id as Classe | 'todos', label: c.nome }))]} />
          </Card>
          <PerfCard title="Rendimento no período" posIds={ids} mode={mode} setMode={setMode} periodo={periodo} setPeriodo={setPeriodo} />
          {rows.length ? <PerfTable title="Rendimento por posição" rows={rows} mode={mode} periodo={periodo} /> : <Card><Empty>Nenhum ativo nesta classe.</Empty></Card>}
        </>
      )}
    </>
  )
}

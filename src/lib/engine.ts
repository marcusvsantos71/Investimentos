import type { Classe, Market, Movement, Position, Quote } from '../types.js'
import { PROVENTOS } from '../types.js'
import { DAY, addDays, addMonths, daysInMonth, diffDays, iso, monthEnd, monthRange, toT, ymOf } from './dates.js'

export interface Ctx {
  positions: Position[]
  movements: Movement[]
  market: Market
  today: string
}

/* ------------------------------------------------------------------ índices */

/** Fator acumulado de uma série mensal (fração) entre duas datas, capitalizando pró-rata por dia dentro do mês. */
export function seriesFactor(series: Record<string, number>, from: string, to: string, scale = 1): number {
  if (to <= from) return 1
  const keys = Object.keys(series).sort()
  const rateFor = (ym: string) => {
    if (!keys.length) return 0
    if (series[ym] !== undefined) return series[ym]
    let best = keys[keys.length - 1]
    for (const k of keys) if (k <= ym) best = k
    return series[best]
  }
  let f = 1
  const t0 = toT(from), t1 = toT(to), endYm = ymOf(to)
  for (let ym = ymOf(from); ym <= endYm; ym = addMonths(ym, 1)) {
    const dim = daysInMonth(ym)
    const ms = toT(ym + '-01')
    const a = Math.max(t0, ms), b = Math.min(t1, ms + dim * DAY)
    const frac = (b - a) / DAY / dim
    if (frac > 0) f *= Math.pow(1 + rateFor(ym) * scale, frac)
  }
  return f
}

/** Crescimento de R$ 1 aplicado em `from` até `to` conforme o indexador do ativo. */
export function growth(pos: Position, from: string, to: string, m: Market): number {
  const days = diffDays(from, to)
  if (days <= 0) return 1
  const fixo = Math.pow(1 + (pos.taxa ?? 0) / 100, days / 365)
  switch (pos.indexador ?? 'CDI') {
    case 'CDI': return seriesFactor(m.cdi, from, to, (pos.pctCdi ?? 100) / 100)
    case 'SELIC': return seriesFactor(m.cdi, from, to, 1) * fixo
    case 'IPCA': return seriesFactor(m.ipca, from, to, 1) * fixo
    case 'PRE': return fixo
  }
}

/* --------------------------------------------------------------- movimentos */

const isFlow = (mv: Movement) => mv.tipo === 'aporte' || mv.tipo === 'resgate'
const sign = (mv: Movement) => (mv.tipo === 'aporte' ? 1 : -1)
export const movsOf = (ctx: Ctx, posId: string) => ctx.movements.filter(m => m.posId === posId)
const flowsOf = (ctx: Ctx, posId: string) => ctx.movements.filter(m => m.posId === posId && isFlow(m))

export function netInvested(ctx: Ctx, pos: Position, date = ctx.today): number {
  return flowsOf(ctx, pos.id).filter(m => m.data <= date).reduce((s, m) => s + sign(m) * m.valor, 0)
}

/* ------------------------------------------------------------------- preços */

const quoteOf = (ctx: Ctx, pos: Position): Quote | undefined =>
  pos.classe === 'tes' ? ctx.market.tesouro[normNome(pos.nome)] : ctx.market.quotes[pos.ticker ? pos.ticker.toUpperCase() : normNome(pos.nome)]

export const normNome = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Há cotação externa ou informada à mão (não só o preço pago)? */
export function hasMarketPrice(ctx: Ctx, pos: Position): boolean {
  return !!quoteOf(ctx, pos) || !!pos.cotacoes?.length
}

export function priceAt(ctx: Ctx, pos: Position, date: string): number | undefined {
  const cand: { data: string; preco: number }[] = []
  for (const c of pos.cotacoes ?? []) cand.push(c)
  const q = quoteOf(ctx, pos)
  if (q) {
    cand.push({ data: q.at, preco: q.price })
    for (const [ym, p] of Object.entries(q.hist ?? {})) cand.push({ data: monthEnd(ym), preco: p })
  }
  for (const mv of ctx.movements) if (mv.posId === pos.id && isFlow(mv) && mv.preco) cand.push({ data: mv.data, preco: mv.preco })
  if (!cand.length) return undefined
  cand.sort((a, b) => a.data.localeCompare(b.data))
  let best = cand[0]
  for (const c of cand) if (c.data <= date) best = c
  return best.preco
}

/* ------------------------------------------------------------------ valores */

const cotizado = (c: Classe) => c === 'rv' || c === 'fun' || c === 'prev'

function qtyAt(ctx: Ctx, pos: Position, date: string): number | undefined {
  const fl = flowsOf(ctx, pos.id).filter(m => m.data <= date)
  if (fl.some(m => !m.qtd)) return undefined
  return fl.reduce((s, m) => s + sign(m) * (m.qtd ?? 0), 0)
}

/** Valor "na curva": cada aporte rende pelo indexador contratado; resgates retiram valor já corrigido. */
export function curveValue(ctx: Ctx, pos: Position, date: string): number {
  let v = 0
  for (const m of flowsOf(ctx, pos.id)) if (m.data <= date) v += sign(m) * m.valor * growth(pos, m.data, date, ctx.market)
  return Math.max(0, v)
}

function marketNow(ctx: Ctx, pos: Position): number | undefined {
  if (!hasMarketPrice(ctx, pos)) return undefined
  const q = qtyAt(ctx, pos, ctx.today)
  const p = priceAt(ctx, pos, ctx.today)
  return q === undefined || p === undefined ? undefined : Math.max(0, q * p)
}

function firstFlow(ctx: Ctx, pos: Position): string | undefined {
  return flowsOf(ctx, pos.id).map(m => m.data).sort()[0]
}

export function valueAt(ctx: Ctx, pos: Position, date: string): number {
  if (!firstFlow(ctx, pos) || firstFlow(ctx, pos)! > date) return 0
  if (cotizado(pos.classe)) {
    const q = qtyAt(ctx, pos, date), p = priceAt(ctx, pos, date)
    return q !== undefined && p !== undefined ? Math.max(0, q * p) : netInvested(ctx, pos, date)
  }
  const curva = curveValue(ctx, pos, date)
  if (pos.classe === 'tes') {
    const mk = marketNow(ctx, pos)
    const curNow = curveValue(ctx, pos, ctx.today)
    if (mk === undefined || curNow <= 0) return curva
    // Histórico de PU não é público por título no app: a diferença mercado × curva de hoje é diluída linearmente
    // desde a 1ª compra. No dia de hoje o valor é exatamente o de mercado.
    const f0 = firstFlow(ctx, pos)!
    const span = Math.max(1, diffDays(f0, ctx.today))
    const frac = Math.min(1, Math.max(0, diffDays(f0, date) / span))
    return curva * (1 + (mk / curNow - 1) * frac)
  }
  return curva
}

export const totalAt = (ctx: Ctx, date: string, posIds?: Set<string>) =>
  ctx.positions.reduce((s, p) => (posIds && !posIds.has(p.id) ? s : s + valueAt(ctx, p, date)), 0)

export const saldoByClasse = (ctx: Ctx) => {
  const r: Record<Classe, number> = { fun: 0, tes: 0, prev: 0, rv: 0, rf: 0 }
  for (const p of ctx.positions) r[p.classe] += valueAt(ctx, p, ctx.today)
  return r
}

/* ----------------------------------------------------------------------- IR */

export const aliquotaIR = (dias: number) => (dias <= 180 ? 0.225 : dias <= 360 ? 0.2 : dias <= 720 ? 0.175 : 0.15)

/** IR estimado (tabela regressiva sobre o ganho, idade média ponderada dos aportes). Renda variável e previdência: não estimado. */
export function irEstimado(ctx: Ctx, pos: Position): { aliquota: number; ir: number } {
  if (pos.isento || pos.classe === 'rv' || pos.classe === 'prev') return { aliquota: 0, ir: 0 }
  const v = valueAt(ctx, pos, ctx.today)
  const ganho = v - netInvested(ctx, pos)
  const ap = flowsOf(ctx, pos.id).filter(m => m.tipo === 'aporte')
  const tot = ap.reduce((s, m) => s + m.valor, 0)
  if (ganho <= 0 || tot <= 0) return { aliquota: aliquotaIR(0), ir: 0 }
  const idade = ap.reduce((s, m) => s + m.valor * diffDays(m.data, ctx.today), 0) / tot
  const aliquota = aliquotaIR(idade)
  return { aliquota, ir: ganho * aliquota }
}

/* ------------------------------------------------------------- rentabilidade */

export interface PosMonth { abs: number; base: number; cdi: number }
export interface Perf {
  months: string[]
  data: Record<string, Record<string, PosMonth>> // ym -> posId -> ...
}

/** Rentabilidade mensal por ativo (Dietz modificado): ganho = V1 − V0 − fluxos; base = V0 + fluxos ponderados pelo tempo. */
export function buildPerf(ctx: Ctx): Perf {
  const firsts = ctx.positions.map(p => firstFlow(ctx, p)).filter(Boolean) as string[]
  if (!firsts.length) return { months: [], data: {} }
  const months = monthRange(ymOf(firsts.sort()[0]), ymOf(ctx.today))
  const data: Perf['data'] = {}
  for (const ym of months) {
    const end = monthEnd(ym) < ctx.today ? monthEnd(ym) : ctx.today
    const prev = addDays(ym + '-01', -1)
    const span = Math.max(1, diffDays(prev, end))
    const cdiFac = seriesFactor(ctx.market.cdi, prev, end, 1) - 1
    data[ym] = {}
    for (const p of ctx.positions) {
      const v0 = valueAt(ctx, p, prev), v1 = valueAt(ctx, p, end)
      const fl = flowsOf(ctx, p.id).filter(m => m.data > prev && m.data <= end)
      const net = fl.reduce((s, m) => s + sign(m) * m.valor, 0)
      const w = fl.reduce((s, m) => s + sign(m) * m.valor * (diffDays(m.data, end) / span), 0)
      const base = v0 + w
      if (v0 === 0 && !fl.length) { data[ym][p.id] = { abs: 0, base: 0, cdi: 0 }; continue }
      data[ym][p.id] = { abs: v1 - v0 - net, base: Math.max(0, base), cdi: Math.max(0, base) * cdiFac }
    }
  }
  return { months, data }
}

export type Periodo = 'ano' | '3m' | '6m' | '12m' | 'all' | string // string = YYYY-MM

export function periodMonths(perf: Perf, periodo: Periodo, today: string): string[] {
  const nowYm = ymOf(today)
  const all = perf.months
  if (!all.length) return []
  let from: string
  if (periodo === 'all') from = all[0]
  else if (periodo === 'ano') from = `${nowYm.slice(0, 4)}-01`
  else if (periodo === '3m') from = addMonths(nowYm, -2)
  else if (periodo === '6m') from = addMonths(nowYm, -5)
  else if (periodo === '12m') from = addMonths(nowYm, -11)
  else return all.includes(periodo) ? [periodo] : []
  return all.filter(m => m >= from)
}

export interface AggRow { ym: string; abs: number; pct: number; cdiAbs: number; cdiPct: number }
export interface Agg { abs: number; pct: number; cdiAbs: number; cdiPct: number; rows: AggRow[] }

export function aggregate(perf: Perf, posIds: Set<string> | null, months: string[]): Agg {
  const rows: AggRow[] = months.map(ym => {
    let abs = 0, base = 0, cdi = 0
    for (const [id, v] of Object.entries(perf.data[ym] ?? {})) {
      if (posIds && !posIds.has(id)) continue
      abs += v.abs; base += v.base; cdi += v.cdi
    }
    return { ym, abs, pct: base > 0 ? abs / base : 0, cdiAbs: cdi, cdiPct: base > 0 ? cdi / base : 0 }
  })
  return {
    abs: rows.reduce((s, r) => s + r.abs, 0),
    cdiAbs: rows.reduce((s, r) => s + r.cdiAbs, 0),
    pct: rows.reduce((f, r) => f * (1 + r.pct), 1) - 1,
    cdiPct: rows.reduce((f, r) => f * (1 + r.cdiPct), 1) - 1,
    rows,
  }
}

/* -------------------------------------------------------- evolução e CDI */

export function seriesDates(range: '1m' | '6m' | '12m' | 'all', ctx: Ctx): string[] {
  const t = ctx.today
  const first = ctx.movements.map(m => m.data).sort()[0] ?? t
  if (range === '1m') {
    const out: string[] = []
    for (let d = 30; d >= 0; d -= 5) out.push(addDays(t, -d))
    return out
  }
  const nowYm = ymOf(t)
  const from = range === 'all' ? ymOf(first) : addMonths(nowYm, range === '6m' ? -6 : -12)
  const ends = monthRange(from, addMonths(nowYm, -1)).map(monthEnd)
  return [...ends, t].filter(d => d >= first || d === t)
}

/** Patrimônio e "mesma carteira rendendo 100% do CDI" (benchmark) nas datas dadas. */
export function evolution(ctx: Ctx, dates: string[]) {
  const mv = ctx.movements.filter(isFlow)
  const pat: number[] = [], bench: number[] = []
  let prev = '', b = 0
  dates.forEach((d, i) => {
    const v = totalAt(ctx, d)
    pat.push(v)
    if (i === 0) b = v
    else {
      b *= seriesFactor(ctx.market.cdi, prev, d, 1)
      for (const m of mv) if (m.data > prev && m.data <= d) b += sign(m) * m.valor
    }
    bench.push(b)
    prev = d
  })
  return { pat, bench }
}

/* --------------------------------------------------------------- proventos */

export interface ProventoRow { mv: Movement; pos: Position }
export function proventos(ctx: Ctx): ProventoRow[] {
  const byId = new Map(ctx.positions.map(p => [p.id, p]))
  return ctx.movements
    .filter(m => PROVENTOS.includes(m.tipo) && byId.has(m.posId))
    .map(mv => ({ mv, pos: byId.get(mv.posId)! }))
}

/* ----------------------------------------------------------------- tesouro */

export interface TesouroInfo {
  pos: Position
  investido: number
  mercado: number
  curva: number
  diferenca: number
  diferencaPct: number
  temMercado: boolean
  ir: number
  aliquota: number
  liquido: number
  taxaMercado?: number
}
export function tesouroInfo(ctx: Ctx, pos: Position): TesouroInfo {
  const curva = curveValue(ctx, pos, ctx.today)
  const mk = marketNow(ctx, pos)
  const mercado = mk ?? curva
  const investido = netInvested(ctx, pos)
  const { aliquota } = irEstimado(ctx, pos)
  const ir = Math.max(0, mercado - investido) * aliquota
  return {
    pos, investido, mercado, curva, temMercado: mk !== undefined,
    diferenca: mercado - curva, diferencaPct: curva > 0 ? mercado / curva - 1 : 0,
    ir, aliquota, liquido: mercado - ir,
  }
}

/** Série de 12 meses: valor de mercado (estimado) × na curva. */
export function tesouroSerie(ctx: Ctx, posList: Position[]) {
  const dates = seriesDates('12m', ctx)
  return {
    dates,
    mercado: dates.map(d => posList.reduce((s, p) => s + valueAt(ctx, p, d), 0)),
    curva: dates.map(d => posList.reduce((s, p) => s + curveValue(ctx, p, d), 0)),
  }
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
export { iso }

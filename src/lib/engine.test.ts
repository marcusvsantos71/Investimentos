import { describe, expect, it } from 'vitest'
import { aggregate, aliquotaIR, buildPerf, curveValue, evolution, irEstimado, periodMonths, saldoByClasse, seriesFactor, tesouroInfo, totalAt, valueAt, type Ctx } from './engine'
import { emptyMarket, type Movement, type Position } from '../types'
import { parseBCB, parseBrapi, parseTesouroCSV, parseTesouroJSON, simMarket } from './providers'
import { sampleData } from './sample'
import { parseNum } from './format'
import { parseDataBR } from './dates'

const flatCdi = (r: number): Record<string, number> => {
  const o: Record<string, number> = {}
  for (let y = 2024; y <= 2026; y++) for (let m = 1; m <= 12; m++) o[`${y}-${String(m).padStart(2, '0')}`] = r
  return o
}
const mk = (positions: Position[], movements: Movement[], today = '2026-03-01', cdi = 0.01): Ctx => ({
  positions, movements, today, market: { ...emptyMarket(), source: 'simulado', cdi: flatCdi(cdi), ipca: flatCdi(0.004) },
})
const cdb = (o: Partial<Position> = {}): Position => ({ id: 'a', classe: 'rf', nome: 'CDB', indexador: 'CDI', pctCdi: 100, criadoEm: '2025-01-01', ...o })
const ap = (data: string, valor: number, extra: Partial<Movement> = {}): Movement => ({ id: data + valor, posId: 'a', data, tipo: 'aporte', valor, ...extra })

describe('índices', () => {
  it('capitaliza meses cheios', () => {
    expect(seriesFactor(flatCdi(0.01), '2025-01-01', '2025-03-01')).toBeCloseTo(1.01 ** 2, 10)
  })
  it('pró-rata dentro do mês', () => {
    expect(seriesFactor(flatCdi(0.01), '2025-01-01', '2025-01-16')).toBeCloseTo(1.01 ** (15 / 31), 10)
  })
  it('aplica % do CDI', () => {
    expect(seriesFactor(flatCdi(0.01), '2025-01-01', '2025-02-01', 1.1)).toBeCloseTo(1.011, 10)
  })
  it('usa o último mês conhecido quando falta dado', () => {
    expect(seriesFactor({ '2025-01': 0.02 }, '2025-03-01', '2025-04-01')).toBeCloseTo(1.02, 10)
  })
})

describe('valorização', () => {
  it('renda fixa pós-fixada rende % do CDI', () => {
    const c = mk([cdb({ pctCdi: 110 })], [ap('2025-01-01', 1000)], '2025-03-01')
    expect(valueAt(c, c.positions[0], '2025-03-01')).toBeCloseTo(1000 * 1.011 ** 2, 6)
  })
  it('resgate retira valor corrigido', () => {
    const c = mk([cdb()], [ap('2025-01-01', 1000), { ...ap('2025-02-01', 500), tipo: 'resgate' }], '2025-03-01')
    expect(valueAt(c, c.positions[0], '2025-03-01')).toBeCloseTo(1000 * 1.01 ** 2 - 500 * 1.01, 6)
  })
  it('IPCA+ usa índice mais taxa fixa', () => {
    const p = cdb({ indexador: 'IPCA', taxa: 6 })
    const c = mk([p], [ap('2025-01-01', 1000)], '2026-01-01')
    expect(curveValue(c, p, '2026-01-01')).toBeCloseTo(1000 * 1.004 ** 12 * 1.06, 6)
  })
  it('ações: quantidade × cotação mais recente', () => {
    const p: Position = { id: 'a', classe: 'rv', nome: 'X', ticker: 'XPTO3', criadoEm: '' }
    const c = mk([p], [ap('2025-01-10', 1000, { qtd: 100, preco: 10 })])
    c.market.quotes.XPTO3 = { price: 12, at: '2026-03-01' }
    expect(valueAt(c, p, '2026-03-01')).toBe(1200)
    expect(valueAt(c, p, '2025-02-10')).toBe(1000) // só o preço pago, sem histórico
  })
  it('tesouro: mercado hoje, curva separada', () => {
    const p: Position = { id: 'a', classe: 'tes', nome: 'Tesouro IPCA+ 2035', indexador: 'IPCA', taxa: 6, criadoEm: '' }
    const c = mk([p], [ap('2025-01-01', 1000, { qtd: 1, preco: 1000 })])
    c.market.tesouro['tesouro ipca+ 2035'] = { price: 1050, at: '2026-03-01' }
    const t = tesouroInfo(c, p)
    expect(t.mercado).toBe(1050)
    expect(t.curva).toBeGreaterThan(1050)
    expect(t.diferenca).toBeLessThan(0)
    expect(valueAt(c, p, '2026-03-01')).toBe(1050)
  })
  it('tesouro sem cotação cai para a curva', () => {
    const p: Position = { id: 'a', classe: 'tes', nome: 'Tesouro Selic 2027', indexador: 'SELIC', criadoEm: '' }
    const c = mk([p], [ap('2025-01-01', 1000, { qtd: 1, preco: 1000 })])
    expect(tesouroInfo(c, p).temMercado).toBe(false)
    expect(tesouroInfo(c, p).diferenca).toBe(0)
  })
})

describe('IR', () => {
  it('tabela regressiva', () => {
    expect([aliquotaIR(100), aliquotaIR(200), aliquotaIR(500), aliquotaIR(900)]).toEqual([0.225, 0.2, 0.175, 0.15])
  })
  it('isentos não pagam', () => {
    const c = mk([cdb({ isento: true })], [ap('2025-01-01', 1000)])
    expect(irEstimado(c, c.positions[0]).ir).toBe(0)
  })
  it('15% sobre o ganho após 2 anos', () => {
    const c = mk([cdb()], [ap('2024-01-01', 1000)], '2026-03-01')
    const g = valueAt(c, c.positions[0], '2026-03-01') - 1000
    expect(irEstimado(c, c.positions[0]).ir).toBeCloseTo(g * 0.15, 6)
  })
})

describe('rentabilidade', () => {
  it('100% do CDI rende exatamente o CDI (pct e R$)', () => {
    const c = mk([cdb()], [ap('2024-12-31', 1000)], '2025-03-31')
    const perf = buildPerf(c)
    const a = aggregate(perf, null, periodMonths(perf, 'all', c.today))
    expect(a.abs).toBeCloseTo(1000 * (1.01 ** 3 - 1), 6)
    expect(a.pct).toBeCloseTo(1.01 ** 3 - 1, 8)
    expect(a.cdiPct).toBeCloseTo(a.pct, 8)
    expect(a.cdiAbs).toBeCloseTo(a.abs, 6)
  })
  it('aporte no meio do mês não conta como rendimento', () => {
    const c = mk([cdb()], [ap('2025-01-01', 1000), ap('2025-02-16', 5000)], '2025-03-01')
    const perf = buildPerf(c)
    const a = aggregate(perf, null, ['2025-02'])
    // ~ R$ 1.000 rendendo o mês (≈10) + R$ 5.000 por 12 dias (≈21); os R$ 5.000 do aporte não entram
    expect(a.abs).toBeGreaterThan(30)
    expect(a.abs).toBeLessThan(33)
  })
  it('períodos', () => {
    const c = mk([cdb()], [ap('2024-01-10', 1000)], '2026-03-05')
    const perf = buildPerf(c)
    expect(periodMonths(perf, 'ano', c.today)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(periodMonths(perf, '3m', c.today)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(periodMonths(perf, '12m', c.today)).toHaveLength(12)
    expect(periodMonths(perf, 'all', c.today)).toHaveLength(27)
    expect(periodMonths(perf, '2026-02', c.today)).toEqual(['2026-02'])
  })
  it('evolução e benchmark partem do mesmo valor', () => {
    const c = mk([cdb({ pctCdi: 120 })], [ap('2025-01-01', 1000)], '2025-04-01')
    const e = evolution(c, ['2025-02-01', '2025-03-01', '2025-04-01'])
    expect(e.bench[0]).toBe(e.pat[0])
    expect(e.pat[2]).toBeGreaterThan(e.bench[2])
  })
})

describe('exemplo + mercado simulado', () => {
  const d = sampleData()
  const c: Ctx = { positions: d.positions, movements: d.movements, today: new Date().toISOString().slice(0, 10), market: emptyMarket() }
  c.market = simMarket(c.positions, c.movements, c.today)
  it('fecha a soma das classes com o total', () => {
    const s = saldoByClasse(c)
    const total = totalAt(c, c.today)
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBeCloseTo(total, 6)
    expect(total).toBeGreaterThan(0)
    for (const v of Object.values(s)) expect(v).toBeGreaterThan(0)
  })
  it('rendimento total = patrimônio − líquido aportado (sem proventos)', () => {
    const perf = buildPerf(c)
    const a = aggregate(perf, null, periodMonths(perf, 'all', c.today))
    const aportado = d.movements.reduce((s, m) => s + (m.tipo === 'aporte' ? m.valor : m.tipo === 'resgate' ? -m.valor : 0), 0)
    expect(a.abs).toBeCloseTo(totalAt(c, c.today) - aportado, 4)
  })
  it('fecha rendimento por classe com o total', () => {
    const perf = buildPerf(c)
    const ms = periodMonths(perf, '12m', c.today)
    const tot = aggregate(perf, null, ms).abs
    const soma = (['fun', 'tes', 'prev', 'rv', 'rf'] as const)
      .map(k => aggregate(perf, new Set(c.positions.filter(p => p.classe === k).map(p => p.id)), ms).abs)
      .reduce((a, b) => a + b, 0)
    expect(soma).toBeCloseTo(tot, 6)
  })
})

describe('parsers de APIs', () => {
  it('BCB', () => {
    expect(parseBCB([{ data: '01/10/2025', valor: '0.97' }, { data: '01/11/2025', valor: '1.05' }])).toEqual({ '2025-10': 0.0097, '2025-11': 0.0105 })
  })
  it('brapi', () => {
    const q = parseBrapi({ results: [{ regularMarketPrice: 10.5, historicalDataPrice: [{ date: 1735689600, close: 9 }, { date: 1738368000, close: 9.5 }] }] })
    expect(q?.price).toBe(10.5)
    expect(q?.hist?.['2025-01']).toBe(9)
  })
  it('Tesouro JSON', () => {
    const r = parseTesouroJSON({ response: { TrsrBdTradg: [{ TrsrBd: { nm: 'Tesouro Selic 2027', untrRedVal: 15234.5 } }] } })
    expect(r['tesouro selic 2027'].price).toBe(15234.5)
  })
  it('Tesouro CSV pega o PU mais recente', () => {
    const csv = ['Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha',
      'Tesouro Selic;01/03/2027;03/11/2025;0,1;0,1;15.000,00;14.990,10;14.990,10',
      'Tesouro Selic;01/03/2027;04/11/2025;0,1;0,1;15.010,00;15.000,55;15.000,55'].join('\n')
    expect(parseTesouroCSV(csv)['tesouro selic 2027']).toEqual({ price: 15000.55, at: '2025-11-04' })
  })
  it('números e datas BR', () => {
    expect(parseNum('1.234,56')).toBe(1234.56)
    expect(parseNum('12.5')).toBe(12.5)
    expect(parseNum('abc')).toBeNull()
    expect(parseDataBR('31/02/2025')).toBeNull()
    expect(parseDataBR('08/04/2024')).toBe('2024-04-08')
  })
})

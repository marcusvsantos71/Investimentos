import type { AppData, Movement, Position } from '../types.js'
import { addMonths, todayISO, ymOf } from './dates.js'
import { simPx } from './providers.js'

/** Carteira de exemplo (fictícia) para conhecer o app. Datas relativas ao mês atual. */
export function sampleData(): AppData {
  const nowYm = ymOf(todayISO())
  const d = (back: number, day = 10) => `${addMonths(nowYm, -back)}-${String(day).padStart(2, '0')}`
  const positions: Position[] = []
  const movements: Movement[] = []
  let n = 0
  const pfx = Math.random().toString(36).slice(2, 6)
  const pos = (p: Omit<Position, 'id' | 'criadoEm'>) => {
    const id = `ex${pfx}${++n}`
    positions.push({ ...p, id, criadoEm: d(24) })
    return id
  }
  const mv = (posId: string, data: string, tipo: Movement['tipo'], valor: number, qtd?: number, preco?: number) =>
    movements.push({ id: `m${pfx}${movements.length + 1}`, posId, data, tipo, valor: Math.round(valor * 100) / 100, qtd, preco })
  const acao = (posId: string, ticker: string, base: number, back: number, qtd: number, tipo: 'aporte' | 'resgate' = 'aporte', first = 22) => {
    const preco = Math.round(simPx({ classe: 'rv', nome: ticker, ticker }, base, addMonths(nowYm, -first), addMonths(nowYm, -back)) * 100) / 100
    mv(posId, d(back, 8), tipo, qtd * preco, qtd, preco)
  }

  const itsa = pos({ classe: 'rv', nome: 'Itaúsa PN', ticker: 'ITSA4' })
  acao(itsa, 'ITSA4', 10.2, 22, 3000); acao(itsa, 'ITSA4', 10.2, 14, 2000); acao(itsa, 'ITSA4', 10.2, 5, 1500)
  const vale = pos({ classe: 'rv', nome: 'Vale ON', ticker: 'VALE3' })
  acao(vale, 'VALE3', 63, 20, 600); acao(vale, 'VALE3', 63, 9, 400)
  const wege = pos({ classe: 'rv', nome: 'WEG ON', ticker: 'WEGE3' })
  acao(wege, 'WEGE3', 41, 18, 800); acao(wege, 'WEGE3', 41, 3, 500)

  const ipcaT = pos({ classe: 'tes', nome: 'Tesouro IPCA+ 2035', indexador: 'IPCA', taxa: 6.15, vencimento: '2035-05-15' })
  const pu = (back: number, first: number) => Math.round(simPx(positions.find(x => x.id === ipcaT)!, 1850, addMonths(nowYm, -first), addMonths(nowYm, -back)) * 100) / 100
  for (const [b, v] of [[22, 30000], [16, 20000], [8, 15000], [2, 10000]] as const) mv(ipcaT, d(b, 12), 'aporte', v, Math.round((v / pu(b, 22)) * 10000) / 10000, pu(b, 22))
  const selic = pos({ classe: 'tes', nome: 'Tesouro Selic 2027', indexador: 'SELIC', taxa: 0.05, vencimento: '2027-03-01' })
  const pus = (back: number) => Math.round(simPx(positions.find(x => x.id === selic)!, 15000, addMonths(nowYm, -14), addMonths(nowYm, -back)) * 100) / 100
  for (const [b, v] of [[14, 35000], [6, 25000]] as const) mv(selic, d(b, 5), 'aporte', v, Math.round((v / pus(b)) * 10000) / 10000, pus(b))

  const cdb = pos({ classe: 'rf', nome: 'CDB Banco Alfa 108% CDI', indexador: 'CDI', pctCdi: 108, vencimento: '2028-06-20' })
  mv(cdb, d(20), 'aporte', 40000); mv(cdb, d(10), 'aporte', 30000); mv(cdb, d(3), 'resgate', 8000)
  const lca = pos({ classe: 'rf', nome: 'LCA Banco Beta 95% CDI', indexador: 'CDI', pctCdi: 95, isento: true, vencimento: '2027-09-10' })
  mv(lca, d(12), 'aporte', 35000); mv(lca, d(4), 'aporte', 20000)
  const deb = pos({ classe: 'rf', nome: 'Debênture incentivada IPCA+', indexador: 'IPCA', taxa: 7.1, isento: true, vencimento: '2034-12-15' })
  mv(deb, d(19), 'aporte', 90000); mv(deb, d(7), 'aporte', 40000)

  const alfa = pos({ classe: 'fun', nome: 'Fundo Multimercado Alfa' })
  const cota = (back: number) => Math.round(simPx(positions.find(x => x.id === alfa)!, 2.1, addMonths(nowYm, -21), addMonths(nowYm, -back)) * 100) / 100
  for (const [b, v] of [[21, 50000], [11, 30000], [2, 15000]] as const) mv(alfa, d(b, 15), 'aporte', v, Math.round((v / cota(b)) * 100) / 100, cota(b))
  const pgbl = pos({ classe: 'prev', nome: 'PGBL Renda Fixa' })
  const cotaP = (back: number) => Math.round(simPx(positions.find(x => x.id === pgbl)!, 3.4, addMonths(nowYm, -23), addMonths(nowYm, -back)) * 100) / 100
  for (const b of [23, 17, 11, 5, 1]) mv(pgbl, d(b, 5), 'aporte', 12000, Math.round((12000 / cotaP(b)) * 100) / 100, cotaP(b))

  // proventos (alguns futuros -> "próximos pagamentos")
  for (let b = 12; b >= -1; b--) {
    mv(itsa, d(b, 1), 'dividendo', 0.04 * 4500)
    if (b % 3 === 0) mv(itsa, d(b, 12), 'jcp', 0.1 * 6500)
    if (b % 6 === 3) { mv(vale, d(b, 14), "dividendo", 1100); mv(vale, d(b, 14), "jcp", 400) }
    if (b % 6 === 0) mv(deb, d(b, 15), 'cupom', 3900)
  }
  mv(wege, d(-1, 15), 'jcp', 330)
  return { v: 1, positions, movements, config: { modo: 'simulado', brapiToken: '' } }
}

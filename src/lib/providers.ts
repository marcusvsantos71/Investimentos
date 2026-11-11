import type { Config, Market, Movement, Position, Quote } from '../types.js'
import { addMonths, monthEnd, monthRange, parseDataBR, todayISO, ymOf } from './dates.js'
import { normNome } from './engine.js'

/* ================================================================ SIMULADO */
// Dados determinísticos para testar o app sem internet/APIs. Nada aqui é cotação real.

function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}
const EPOCH = '2022-01'
const idx = (ym: string) => monthRange(EPOCH, ym).length - 1

/** Passeio aleatório determinístico ancorado no preço `base` do mês `anchorYm`. */
export function simPrice(key: string, base: number, anchorYm: string, ym: string, vol = 0.045, drift = 0.006): number {
  const r = rng(key)
  const cum: number[] = [0]
  for (let i = 1; i <= 200; i++) cum.push(cum[i - 1] + (r() - 0.5) * 2 * vol + drift)
  return base * Math.exp(cum[Math.max(0, idx(ym))] - cum[Math.max(0, idx(anchorYm))])
}

type SimPos = Pick<Position, 'classe' | 'nome' | 'ticker'>
/** Volatilidade/deriva do preço simulado conforme o tipo de ativo. */
export function simPx(p: SimPos, base: number, anchorYm: string, ym: string): number {
  const n = p.nome.toLowerCase()
  let vol = 0.045, drift = 0.006
  if (p.classe === 'tes') { vol = n.includes('selic') ? 0.001 : 0.012; drift = n.includes('selic') ? 0.0095 : 0.008 }
  else if (p.classe === 'fun') { vol = 0.006; drift = 0.0085 }
  else if (p.classe === 'prev') { vol = 0.003; drift = 0.0085 }
  return simPrice(p.ticker ?? p.nome, base, anchorYm, ym, vol, drift)
}

export function simMarket(positions: Position[], movements: Movement[], today = todayISO()): Market {
  const nowYm = ymOf(today)
  const cdi: Record<string, number> = {}, ipca: Record<string, number> = {}
  for (const ym of monthRange('2021-01', nowYm)) {
    const i = idx(ym)
    cdi[ym] = 0.0102 + 0.0012 * Math.sin(i / 4)
    ipca[ym] = 0.0042 + 0.0025 * Math.sin(i / 3 + 1)
  }
  const quotes: Record<string, Quote> = {}, tesouro: Record<string, Quote> = {}
  for (const p of positions) {
    const trades = movements.filter(m => m.posId === p.id && m.preco).sort((a, b) => a.data.localeCompare(b.data))
    if (!trades.length) continue
    const first = trades[0]
    const anchor = ymOf(first.data)
    const cota = p.classe === 'tes' || p.classe === 'fun' || p.classe === 'prev'
    if (!cota && !p.ticker) continue
    const hist: Record<string, number> = {}
    for (const ym of monthRange(anchor, addMonths(nowYm, -1))) hist[ym] = round(simPx(p, first.preco!, anchor, ym))
    const q: Quote = { price: round(simPx(p, first.preco!, anchor, nowYm)), at: today, hist }
    if (p.classe === 'tes') tesouro[normNome(p.nome)] = q
    else if (p.ticker) quotes[p.ticker.toUpperCase()] = q
    else quotes[normNome(p.nome)] = q
  }
  return { source: 'simulado', updatedAt: today, cdi, ipca, quotes, tesouro, avisos: [] }
}
const round = (n: number) => Math.round(n * 100) / 100

/* ================================================================ AO VIVO */

export const parseBCB = (rows: { data: string; valor: string }[]): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const d = parseDataBR(r.data)
    const v = Number(r.valor)
    if (d && Number.isFinite(v)) out[ymOf(d)] = v / 100
  }
  return out
}

/** Banco Central (SGS). 4391 = CDI acumulado no mês; 433 = IPCA mensal. */
async function fetchBCB(code: number, desde: string): Promise<Record<string, number>> {
  const [y, m] = desde.split('-')
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=01/${m}/${y}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`BCB ${code}: HTTP ${res.status}`)
  return parseBCB(await res.json())
}

/** brapi.dev — ações, FIIs e ETFs da B3. */
export function parseBrapi(json: any): Quote | null {
  const r = json?.results?.[0]
  if (!r || typeof r.regularMarketPrice !== 'number') return null
  const hist: Record<string, number> = {}
  for (const h of r.historicalDataPrice ?? []) {
    if (typeof h.close !== 'number') continue
    hist[new Date(h.date * 1000).toISOString().slice(0, 7)] = h.close
  }
  // o mês corrente fica por conta do preço atual
  delete hist[ymOf(todayISO())]
  return { price: r.regularMarketPrice, at: todayISO(), hist }
}
async function fetchBrapi(ticker: string, token: string): Promise<Quote> {
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?range=5y&interval=1mo${token ? `&token=${encodeURIComponent(token)}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`brapi ${ticker}: HTTP ${res.status}`)
  const q = parseBrapi(await res.json())
  if (!q) throw new Error(`brapi ${ticker}: resposta sem preço`)
  return q
}

/** Tesouro Direto — JSON público do site (preço unitário de resgate). */
export function parseTesouroJSON(json: any): Record<string, Quote> {
  const out: Record<string, Quote> = {}
  const at = todayISO()
  for (const it of json?.response?.TrsrBdTradg ?? []) {
    const b = it?.TrsrBd
    if (b?.nm && typeof b.untrRedVal === 'number' && b.untrRedVal > 0) out[normNome(b.nm)] = { price: b.untrRedVal, at }
  }
  return out
}

/** Tesouro Transparente — CSV "PrecoTaxaTesouroDireto". Usa o PU de venda mais recente de cada título. */
export function parseTesouroCSV(csv: string): Record<string, Quote> {
  const out: Record<string, Quote & { _d: string }> = {}
  const lines = csv.split(/\r?\n/)
  const head = lines[0]?.split(';').map(s => s.trim()) ?? []
  const iT = head.indexOf('Tipo Titulo'), iV = head.indexOf('Data Vencimento'), iB = head.indexOf('Data Base'), iP = head.indexOf('PU Venda Manha')
  if ([iT, iV, iB, iP].some(i => i < 0)) return {}
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k].split(';')
    if (c.length <= iP) continue
    const base = parseDataBR(c[iB]), venc = parseDataBR(c[iV])
    const pu = Number(c[iP].replace(/\./g, '').replace(',', '.'))
    if (!base || !venc || !(pu > 0)) continue
    const key = normNome(`${c[iT]} ${venc.slice(0, 4)}`)
    if (!out[key] || out[key]._d < base) out[key] = { price: pu, at: base, _d: base }
  }
  return Object.fromEntries(Object.entries(out).map(([k, { _d, ...q }]) => [k, q]))
}
const TESOURO_JSON = 'https://www.tesourodireto.com.br/json/br/com/b3/tesourodireto/service/api/treasurybondsinfo.json'
const TESOURO_CSV = 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580e81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv'

async function fetchTesouro(): Promise<Record<string, Quote>> {
  try {
    const res = await fetch(TESOURO_JSON)
    if (res.ok) {
      const r = parseTesouroJSON(await res.json())
      if (Object.keys(r).length) return r
    }
  } catch { /* tenta o CSV */ }
  const res = await fetch(TESOURO_CSV)
  if (!res.ok) throw new Error(`Tesouro Transparente: HTTP ${res.status}`)
  return parseTesouroCSV(await res.text())
}

export interface Pedido { tickers: string[]; tesouro: boolean; desde: string; token: string }

/** Busca tudo que der; o que falhar vira aviso e segue com o que tiver. Roda no navegador (modo local) ou na função /api/market. */
export async function fetchMarketCore(req: Pedido, anterior?: Market): Promise<Market> {
  const avisos: string[] = []
  const m: Market = {
    source: 'ao-vivo', updatedAt: todayISO(), avisos,
    cdi: anterior?.cdi ?? {}, ipca: anterior?.ipca ?? {},
    quotes: { ...(anterior?.quotes ?? {}) }, tesouro: { ...(anterior?.tesouro ?? {}) },
  }
  const tasks: Promise<void>[] = []
  const task = (nome: string, f: () => Promise<void>) =>
    tasks.push(f().catch(e => { avisos.push(`${nome}: ${e?.message ?? 'falhou'}`) }))
  task('CDI (Banco Central)', async () => { m.cdi = await fetchBCB(4391, req.desde) })
  task('IPCA (Banco Central)', async () => { m.ipca = await fetchBCB(433, req.desde) })
  for (const t of req.tickers) task(`Cotação ${t}`, async () => { m.quotes[t] = await fetchBrapi(t, req.token) })
  if (req.tesouro) task('Tesouro Direto', async () => { m.tesouro = { ...m.tesouro, ...(await fetchTesouro()) } })
  await Promise.all(tasks)
  return m
}

export function pedidoDe(positions: Position[], movements: Movement[], token: string): Pedido {
  const first = movements.map(m => m.data).sort()[0] ?? todayISO()
  return {
    tickers: [...new Set(positions.filter(p => p.ticker).map(p => p.ticker!.toUpperCase()))],
    tesouro: positions.some(p => p.classe === 'tes'),
    desde: addMonths(ymOf(first), -1), token,
  }
}

/** Modo local: busca direto do navegador (sujeito a CORS). */
export const liveMarket = (positions: Position[], movements: Movement[], cfg: Config, anterior?: Market) =>
  fetchMarketCore(pedidoDe(positions, movements, cfg.brapiToken), anterior)

/** Modo Supabase: pede à função serverless do Vercel (sem CORS, token do brapi fica no servidor). */
export async function apiMarket(jwt: string, positions: Position[], movements: Movement[], anterior?: Market): Promise<Market> {
  const { tickers, tesouro, desde } = pedidoDe(positions, movements, '')
  const res = await fetch('/api/market', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ tickers, tesouro, desde }),
  })
  if (!res.ok) throw new Error(`Servidor de cotações: HTTP ${res.status}`)
  const m = (await res.json()) as Market
  return { ...m, quotes: { ...(anterior?.quotes ?? {}), ...m.quotes }, tesouro: { ...(anterior?.tesouro ?? {}), ...m.tesouro } }
}

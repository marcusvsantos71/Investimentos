import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { emptyMarket, type AppData, type Market, type Movement, type Position } from './types'
import { buildPerf, newId, type Ctx, type Perf } from './lib/engine'
import { apiMarket, liveMarket, simMarket } from './lib/providers'
import { defaultData, type Repo } from './lib/repo'
import { BACKEND } from './lib/backend'
import { todayISO } from './lib/dates'
import { sampleData } from './lib/sample'

const KEY_MKT = 'inv.market.v1'

function loadMkt(): Market {
  try { const s = localStorage.getItem(KEY_MKT); return s ? (JSON.parse(s) as Market) : emptyMarket() } catch { return emptyMarket() }
}

/** Valida um backup importado. Lança erro com mensagem em português. */
export function parseBackup(text: string): AppData {
  let j: any
  try { j = JSON.parse(text) } catch { throw new Error('O arquivo não é um JSON válido.') }
  if (!j || j.v !== 1 || !Array.isArray(j.positions) || !Array.isArray(j.movements)) throw new Error('Arquivo não reconhecido como backup do app.')
  const ids = new Set<string>()
  for (const p of j.positions) {
    if (!p.id || !p.nome || !['fun', 'tes', 'prev', 'rv', 'rf'].includes(p.classe)) throw new Error('Backup com ativo inválido.')
    ids.add(p.id)
  }
  for (const m of j.movements) {
    if (!ids.has(m.posId) || !/^\d{4}-\d{2}-\d{2}$/.test(m.data) || typeof m.valor !== 'number' || !['aporte', 'resgate', 'dividendo', 'jcp', 'cupom'].includes(m.tipo))
      throw new Error('Backup com movimentação inválida.')
  }
  return { v: 1, positions: j.positions, movements: j.movements, config: { modo: j.config?.modo === 'simulado' ? 'simulado' : 'ao-vivo', brapiToken: j.config?.brapiToken ?? '' } }
}

interface Store {
  data: AppData
  ctx: Ctx
  perf: Perf
  atualizando: boolean
  usuario?: string
  sair?: () => void
  erro: string
  limparErro(): void
  addPosition(p: Omit<Position, 'id' | 'criadoEm'>, first?: Omit<Movement, 'id' | 'posId'>): string
  updatePosition(id: string, patch: Partial<Position>): void
  deletePosition(id: string): void
  addMovement(m: Omit<Movement, 'id'>): void
  updateMovement(id: string, patch: Partial<Movement>): void
  deleteMovement(id: string): void
  setModo(m: 'simulado' | 'ao-vivo'): void
  setToken(t: string): void
  refresh(): Promise<void>
  loadSample(): void
  importData(d: AppData): void
  reset(): void
}
const Ctx_ = createContext<Store | null>(null)
export const useStore = () => useContext(Ctx_)!

export function StoreProvider({ repo, usuario, sair, children }: { repo: Repo; usuario?: string; sair?: () => void; children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null)
  const [live, setLive] = useState<Market>(loadMkt)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState('')
  const today = todayISO()

  useEffect(() => {
    let vivo = true
    repo.load().then(d => vivo && setData(d)).catch(e => vivo && (setErro(`Não foi possível carregar seus dados: ${e.message}`), setData(defaultData())))
    return () => { vivo = false }
  }, [repo])
  useEffect(() => { try { localStorage.setItem(KEY_MKT, JSON.stringify(live)) } catch { /* ignore */ } }, [live])

  const d = data ?? defaultData()
  const market = useMemo<Market>(
    () => (d.config.modo === 'simulado' ? simMarket(d.positions, d.movements, today) : live),
    [d.config.modo, d.positions, d.movements, live, today],
  )
  const ctx = useMemo<Ctx>(() => ({ positions: d.positions, movements: d.movements, market, today }), [d.positions, d.movements, market, today])
  const perf = useMemo(() => buildPerf(ctx), [ctx])

  const dataRef = useRef(d); dataRef.current = d
  const liveRef = useRef(live); liveRef.current = live

  const persist = useCallback((p: Promise<void>) => { p.catch(e => setErro(`Não foi possível salvar: ${e?.message ?? e}. Tente de novo.`)) }, [])

  const refresh = useCallback(async () => {
    const cur = dataRef.current
    if (cur.config.modo !== 'ao-vivo' || !cur.positions.length) return
    setAtualizando(true)
    try {
      const m = BACKEND === 'supabase' && repo.token
        ? await apiMarket(await repo.token(), cur.positions, cur.movements, liveRef.current)
        : await liveMarket(cur.positions, cur.movements, cur.config, liveRef.current)
      setLive(m)
    } catch (e: any) {
      setLive(l => ({ ...l, avisos: [`Cotações: ${e?.message ?? 'falhou'}`] }))
    } finally { setAtualizando(false) }
  }, [repo])

  const sig = d.positions.map(p => p.ticker ?? p.nome).join('|')
  useEffect(() => {
    if (data && d.config.modo === 'ao-vivo' && d.positions.length && (live.updatedAt !== today || live.source !== 'ao-vivo')) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, d.config.modo, !!data])

  if (!data) return <div className="empty" style={{ paddingTop: 80 }}>Carregando seus investimentos…</div>

  const mut = (f: (x: AppData) => AppData) => setData(x => f(x ?? d))
  const saveCfg = (c: AppData['config']) => persist(repo.saveConfig(c))
  const store: Store = {
    data, ctx, perf, atualizando, usuario, sair, erro, limparErro: () => setErro(''),
    addPosition(p, first) {
      const np: Position = { ...p, id: newId(), criadoEm: todayISO() }
      const nm: Movement | undefined = first ? { ...first, id: newId(), posId: np.id } : undefined
      mut(x => ({ ...x, positions: [...x.positions, np], movements: nm ? [...x.movements, nm] : x.movements }))
      persist(repo.upsertPosition(np).then(() => (nm ? repo.upsertMovement(nm) : undefined)))
      return np.id
    },
    updatePosition(id, patch) {
      const cur = dataRef.current.positions.find(p => p.id === id)
      if (!cur) return
      const np = { ...cur, ...patch }
      mut(x => ({ ...x, positions: x.positions.map(p => (p.id === id ? np : p)) }))
      persist(repo.upsertPosition(np))
    },
    deletePosition(id) {
      mut(x => ({ ...x, positions: x.positions.filter(p => p.id !== id), movements: x.movements.filter(m => m.posId !== id) }))
      persist(repo.deletePosition(id))
    },
    addMovement(m) {
      const nm: Movement = { ...m, id: newId() }
      mut(x => ({ ...x, movements: [...x.movements, nm] }))
      persist(repo.upsertMovement(nm))
    },
    updateMovement(id, patch) {
      const cur = dataRef.current.movements.find(m => m.id === id)
      if (!cur) return
      const nm = { ...cur, ...patch }
      mut(x => ({ ...x, movements: x.movements.map(m => (m.id === id ? nm : m)) }))
      persist(repo.upsertMovement(nm))
    },
    deleteMovement(id) {
      mut(x => ({ ...x, movements: x.movements.filter(m => m.id !== id) }))
      persist(repo.deleteMovement(id))
    },
    setModo(modo) { const c = { ...d.config, modo }; mut(x => ({ ...x, config: c })); saveCfg(c) },
    setToken(brapiToken) { const c = { ...d.config, brapiToken }; mut(x => ({ ...x, config: c })); saveCfg(c) },
    refresh,
    loadSample() { const n = sampleData(); setData(n); persist(repo.replaceAll(n)) },
    importData(n) { setData(n); setLive(emptyMarket()); persist(repo.replaceAll(n)) },
    reset() { const n = defaultData(); setData(n); setLive(emptyMarket()); persist(repo.replaceAll(n)) },
  }
  return <Ctx_.Provider value={store}>{children}</Ctx_.Provider>
}

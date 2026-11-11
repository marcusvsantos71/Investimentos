import type { AppData, Config, Movement, Position } from '../types.js'

/** Onde os dados ficam guardados. Duas implementações: navegador (localStorage) e Supabase. */
export interface Repo {
  load(): Promise<AppData>
  upsertPosition(p: Position): Promise<void>
  deletePosition(id: string): Promise<void>
  upsertMovement(m: Movement): Promise<void>
  deleteMovement(id: string): Promise<void>
  saveConfig(c: Config): Promise<void>
  replaceAll(d: AppData): Promise<void>
  /** JWT para chamar /api/market (só no modo Supabase). */
  token?(): Promise<string>
}

export const defaultData = (): AppData => ({ v: 1, positions: [], movements: [], config: { modo: 'ao-vivo', brapiToken: '' } })

/* ------------------------------------------------------------ navegador */
const KEY = 'inv.data.v1'

export function localRepo(): Repo {
  let d: AppData
  const read = (): AppData => {
    try { const s = localStorage.getItem(KEY); return s ? (JSON.parse(s) as AppData) : defaultData() } catch { return defaultData() }
  }
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* cheio/bloqueado */ } }
  const init = () => (d ??= read())
  return {
    async load() { return init() },
    async upsertPosition(p) { init(); d.positions = d.positions.some(x => x.id === p.id) ? d.positions.map(x => (x.id === p.id ? p : x)) : [...d.positions, p]; write() },
    async deletePosition(id) { init(); d.positions = d.positions.filter(p => p.id !== id); d.movements = d.movements.filter(m => m.posId !== id); write() },
    async upsertMovement(m) { init(); d.movements = d.movements.some(x => x.id === m.id) ? d.movements.map(x => (x.id === m.id ? m : x)) : [...d.movements, m]; write() },
    async deleteMovement(id) { init(); d.movements = d.movements.filter(m => m.id !== id); write() },
    async saveConfig(c) { init(); d.config = c; write() },
    async replaceAll(n) { d = n; write() },
  }
}

/* ------------------------------------------------------------- Supabase */
// Tabelas (veja supabase/schema.sql): positions, movements, settings — cada linha tem user_id e RLS por usuário.
export function supabaseRepo(sb: any, userId: string): Repo {
  const ok = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message) }
  const chunks = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
  const posRow = (p: Position) => ({ user_id: userId, id: p.id, payload: p })
  const movRow = (m: Movement) => ({ user_id: userId, id: m.id, pos_id: m.posId, payload: m })
  return {
    async load() {
      const [p, m, s] = await Promise.all([
        sb.from('positions').select('payload').eq('user_id', userId).limit(5000),
        sb.from('movements').select('payload').eq('user_id', userId).limit(50000),
        sb.from('settings').select('payload').eq('user_id', userId).maybeSingle(),
      ])
      ok(p); ok(m); ok(s)
      const cfg = s.data?.payload ?? {}
      return {
        v: 1,
        positions: (p.data ?? []).map((r: any) => r.payload as Position),
        movements: (m.data ?? []).map((r: any) => r.payload as Movement),
        config: { modo: cfg.modo === 'simulado' ? 'simulado' : 'ao-vivo', brapiToken: '' },
      }
    },
    async upsertPosition(p) { ok(await sb.from('positions').upsert(posRow(p), { onConflict: 'user_id,id' })) },
    async deletePosition(id) { ok(await sb.from('positions').delete().eq('user_id', userId).eq('id', id)) }, // movimentações caem em cascata
    async upsertMovement(m) { ok(await sb.from('movements').upsert(movRow(m), { onConflict: 'user_id,id' })) },
    async deleteMovement(id) { ok(await sb.from('movements').delete().eq('user_id', userId).eq('id', id)) },
    async saveConfig(c) { ok(await sb.from('settings').upsert({ user_id: userId, payload: { modo: c.modo } }, { onConflict: 'user_id' })) },
    async replaceAll(d) {
      ok(await sb.from('positions').delete().eq('user_id', userId))
      for (const c of chunks(d.positions)) ok(await sb.from('positions').insert(c.map(posRow)))
      for (const c of chunks(d.movements)) ok(await sb.from('movements').insert(c.map(movRow)))
      await this.saveConfig(d.config)
    },
    async token() {
      const { data } = await sb.auth.getSession()
      return data.session?.access_token ?? ''
    },
  }
}

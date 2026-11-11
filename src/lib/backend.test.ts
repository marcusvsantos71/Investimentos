import { describe, expect, it, vi } from 'vitest'
import { supabaseRepo, localRepo } from './repo'
import { sampleData } from './sample'
import { usuarioParaEmail, usuarioValido, emailParaUsuario } from './backend'

/** Banco falso em memória que imita o suficiente do cliente do Supabase (com RLS por user_id). */
function fakeSb(owner: string) {
  const tables: Record<string, any[]> = { positions: [], movements: [], settings: [] }
  const from = (t: string) => {
    let filters: [string, any][] = []
    const q: any = {
      select: () => q, limit: () => q,
      eq: (k: string, v: any) => { filters.push([k, v]); return q },
      maybeSingle: async () => ({ data: tables[t].find(r => filters.every(([k, v]) => r[k] === v)) ?? null, error: null }),
      upsert: async (row: any, o: { onConflict: string }) => {
        const keys = o.onConflict.split(',')
        const i = tables[t].findIndex(r => keys.every(k => r[k] === row[k]))
        if (i >= 0) tables[t][i] = row; else tables[t].push(row)
        return { error: null }
      },
      insert: async (rows: any[]) => { tables[t].push(...rows); return { error: null } },
      delete: () => {
        const d: any = { eq: (k: string, v: any) => { filters.push([k, v]); return d }, then: (res: any) => {
          const del = tables[t].filter(r => filters.every(([k, v]) => r[k] === v))
          tables[t] = tables[t].filter(r => !del.includes(r))
          if (t === 'positions') tables.movements = tables.movements.filter(m => tables.positions.some(p => p.user_id === m.user_id && p.id === m.pos_id))
          res({ error: null })
        } }
        return d
      },
      then: (res: any) => res({ data: tables[t].filter(r => filters.every(([k, v]) => r[k] === v)), error: null }),
    }
    return q
  }
  return { from, tables, auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-' + owner } } }) } }
}

describe('repositório Supabase', () => {
  it('salva, recarrega e isola por usuário', async () => {
    const sb = fakeSb('a')
    const a = supabaseRepo(sb, 'a'), b = supabaseRepo(sb, 'b')
    const d = sampleData()
    await a.replaceAll(d)
    const back = await a.load()
    expect(back.positions).toHaveLength(d.positions.length)
    expect(back.movements).toHaveLength(d.movements.length)
    expect((await b.load()).positions).toHaveLength(0) // outro usuário não vê nada
    // mesmo id em usuários diferentes não conflita
    await b.upsertPosition(d.positions[0])
    expect((await b.load()).positions).toHaveLength(1)
    expect((await a.load()).positions).toHaveLength(d.positions.length)
  })
  it('edita, exclui movimentação e apaga ativo em cascata', async () => {
    const sb = fakeSb('a'); const a = supabaseRepo(sb, 'a'); const d = sampleData()
    await a.replaceAll(d)
    const m = d.movements[0]
    await a.upsertMovement({ ...m, valor: 123.45 })
    expect((await a.load()).movements.find(x => x.id === m.id)!.valor).toBe(123.45)
    await a.deleteMovement(m.id)
    expect((await a.load()).movements.some(x => x.id === m.id)).toBe(false)
    const pid = d.positions[1].id
    await a.deletePosition(pid)
    const r = await a.load()
    expect(r.positions.some(p => p.id === pid)).toBe(false)
    expect(r.movements.some(x => x.posId === pid)).toBe(false)
  })
  it('config guarda só o modo (token do brapi nunca vai ao banco)', async () => {
    const sb = fakeSb('a'); const a = supabaseRepo(sb, 'a')
    await a.saveConfig({ modo: 'simulado', brapiToken: 'segredo' })
    expect(JSON.stringify(sb.tables.settings)).not.toContain('segredo')
    expect((await a.load()).config.modo).toBe('simulado')
    expect(await a.token!()).toBe('jwt-a')
  })
  it('ids do exemplo são únicos entre cargas', () => {
    expect(sampleData().positions[0].id).not.toBe(sampleData().positions[0].id)
  })
})

describe('repositório local', () => {
  it('persiste em localStorage', async () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } })
    const r = localRepo(); const d = sampleData(); const n = d.positions.length; const first = d.positions[0].id
    await r.replaceAll(d)
    expect((await localRepo().load()).positions).toHaveLength(n)
    await r.deletePosition(first)
    expect((await localRepo().load()).positions).toHaveLength(n - 1)
  })
})

describe('login por usuário', () => {
  it('converte usuário em e-mail interno', () => {
    expect(usuarioParaEmail(' Marcus ')).toBe('marcus@meusinvest.app')
    expect(emailParaUsuario('marcus@meusinvest.app')).toBe('marcus')
    expect(usuarioValido('ab')).toBe(false)
    expect(usuarioValido('maria.silva')).toBe(true)
    expect(usuarioValido('a b c')).toBe(false)
  })
})

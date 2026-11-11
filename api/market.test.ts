import { beforeEach, describe, expect, it, vi } from 'vitest'

let userOk = true
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: async () => (userOk ? { data: { user: { id: 'u' } }, error: null } : { data: { user: null }, error: { message: 'x' } }) } }),
}))
const { default: handler } = await import('./market.js')

const res = () => { const r: any = { code: 0, body: null, headers: {}, status(c: number) { r.code = c; return r }, json(b: any) { r.body = b; return r }, setHeader(k: string, v: string) { r.headers[k] = v } }; return r }
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_ANON_KEY = 'k'; process.env.BRAPI_TOKEN = 'tok'
  userOk = true
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('sgs.4391')) return { ok: true, json: async () => [{ data: '01/10/2026', valor: '1.00' }] }
    if (url.includes('sgs.433')) return { ok: true, json: async () => [{ data: '01/10/2026', valor: '0.40' }] }
    if (url.includes('brapi.dev')) { expect(url).toContain('token=tok'); return { ok: true, json: async () => ({ results: [{ regularMarketPrice: 11.5 }] }) } }
    return { ok: false, status: 403 }
  }))
})
const call = async (body: any, auth = 'Bearer jwt', method = 'POST') => { const r = res(); await handler({ method, headers: { authorization: auth }, body } as any, r); return r }

describe('/api/market', () => {
  it('exige autenticação', async () => { expect((await call({}, '')).code).toBe(401) })
  it('rejeita sessão inválida', async () => { userOk = false; expect((await call({})).code).toBe(401) })
  it('rejeita tickers malformados', async () => { expect((await call({ tickers: ['ab;drop'] })).code).toBe(400) })
  it('devolve mercado; falha do Tesouro vira aviso, não erro', async () => {
    const r = await call({ tickers: ['itsa4'], tesouro: true, desde: '2026-01' })
    expect(r.code).toBe(200)
    expect(r.body.cdi['2026-10']).toBe(0.01)
    expect(r.body.quotes.ITSA4.price).toBe(11.5)
    expect(r.body.avisos.some((a: string) => a.startsWith('Tesouro'))).toBe(true)
  })
  it('só aceita POST', async () => { expect((await call({}, 'Bearer x', 'GET')).code).toBe(405) })
})

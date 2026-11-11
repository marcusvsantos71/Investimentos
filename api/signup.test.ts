import { beforeEach, describe, expect, it, vi } from 'vitest'

let createUser = vi.fn()
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: { createUser: (a: any) => createUser(a) } } }) }))
const { default: handler } = await import('./signup.js')

const res = () => { const r: any = { code: 0, body: null, status(c: number) { r.code = c; return r }, json(b: any) { r.body = b; return r } }; return r }
const call = async (body: any, method = 'POST') => { const r = res(); await handler({ method, body } as any, r); return r }
const ok = { usuario: 'Maria.Silva', senha: 'senha-forte-1', codigo: 'abc123' }

beforeEach(() => {
  vi.useRealTimers()
  process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'; process.env.INVITE_CODE = 'abc123, outro-codigo'
  createUser = vi.fn(async () => ({ error: null }))
})

describe('/api/signup', () => {
  it('cria a conta com código válido (usuário em minúsculas, e-mail confirmado)', async () => {
    const r = await call(ok)
    expect(r.code).toBe(201)
    expect(createUser).toHaveBeenCalledWith({ email: 'maria.silva@meusinvest.app', password: 'senha-forte-1', email_confirm: true })
  })
  it('aceita qualquer um dos códigos configurados', async () => { expect((await call({ ...ok, codigo: 'outro-codigo' })).code).toBe(201) })
  it('recusa código errado sem criar nada', async () => {
    const r = await call({ ...ok, codigo: 'errado' })
    expect(r.code).toBe(403); expect(createUser).not.toHaveBeenCalled()
  }, 5000)
  it('recusa código vazio', async () => { expect((await call({ ...ok, codigo: '' })).code).toBe(403) }, 5000)
  it('valida usuário e senha', async () => {
    expect((await call({ ...ok, usuario: 'a b' })).code).toBe(400)
    expect((await call({ ...ok, senha: 'curta' })).code).toBe(400)
    expect(createUser).not.toHaveBeenCalled()
  })
  it('usuário repetido -> 409', async () => {
    createUser = vi.fn(async () => ({ error: { message: 'User already registered' } }))
    expect((await call(ok)).code).toBe(409)
  })
  it('sem configuração no servidor -> 500; só POST', async () => {
    delete process.env.INVITE_CODE
    expect((await call(ok)).code).toBe(500)
    expect((await call(ok, 'GET')).code).toBe(405)
  })
})

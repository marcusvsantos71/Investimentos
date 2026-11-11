import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import { senhaValida, usuarioParaEmailCom, usuarioValido } from '../src/lib/usuario.js'

/**
 * POST /api/signup  { usuario, senha, codigo }
 * Cria a conta só se o código de convite (variável INVITE_CODE, aceita vários separados por vírgula) estiver correto.
 * Usa a chave service_role, que existe SOMENTE no servidor. O cadastro público do Supabase fica desligado.
 */
const igual = (a: string, b: string) => {
  const x = new Uint8Array(Buffer.from(a)), y = new Uint8Array(Buffer.from(b))
  return x.length === y.length && timingSafeEqual(x, y)
}
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms))

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' })
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const convites = (process.env.INVITE_CODE ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (!url || !service || !convites.length) return res.status(500).json({ erro: 'Cadastro não configurado no servidor' })

  const b = (typeof req.body === 'string' ? safeJson(req.body) : req.body) ?? {}
  const usuario = String(b.usuario ?? ''), senha = String(b.senha ?? ''), codigo = String(b.codigo ?? '').trim()

  if (!convites.some(c => igual(c, codigo))) {
    await pausa(1000) // freia tentativas em série
    return res.status(403).json({ erro: 'Código de convite inválido.' })
  }
  if (!usuarioValido(usuario)) return res.status(400).json({ erro: 'Usuário: 3 a 30 caracteres (letras, números, ponto, hífen ou _).' })
  if (!senhaValida(senha)) return res.status(400).json({ erro: 'A senha precisa ter de 8 a 72 caracteres.' })

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  const email = usuarioParaEmailCom(usuario, process.env.VITE_LOGIN_DOMAIN ?? 'meusinvest.app')
  const { error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true })
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return res.status(409).json({ erro: 'Esse usuário já existe. Escolha outro.' })
    console.error('signup: createUser falhou', error.message)
    return res.status(500).json({ erro: 'Nao foi possível criar a conta (${error.message}).' })
  }
  return res.status(201).json({ ok: true })
}

function safeJson(s: string) { try { return JSON.parse(s) } catch { return null } }

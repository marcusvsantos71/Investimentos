import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { fetchMarketCore } from '../src/lib/providers.js'

/**
 * POST /api/market  { tickers: string[], tesouro: boolean, desde: "YYYY-MM" }
 * Exige o JWT do usuário logado (Authorization: Bearer ...). Busca CDI/IPCA, ações e Tesouro no servidor,
 * sem CORS e sem expor o token do brapi (variável BRAPI_TOKEN).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' })

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(500).json({ erro: 'Servidor sem configuração do Supabase' })

  const jwt = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return res.status(401).json({ erro: 'Não autenticado' })
  const { data, error } = await createClient(url, key).auth.getUser(jwt)
  if (error || !data.user) return res.status(401).json({ erro: 'Sessão inválida' })

  const b = (typeof req.body === 'string' ? safeJson(req.body) : req.body) ?? {}
  const tickers: string[] = Array.isArray(b.tickers) ? b.tickers.map((t: unknown) => String(t).toUpperCase()) : []
  if (tickers.length > 60 || tickers.some(t => !/^[A-Z0-9]{4,8}$/.test(t))) return res.status(400).json({ erro: 'Tickers inválidos' })
  const desde = typeof b.desde === 'string' && /^\d{4}-\d{2}$/.test(b.desde) ? b.desde : '2020-01'

  const m = await fetchMarketCore({ tickers, tesouro: !!b.tesouro, desde, token: process.env.BRAPI_TOKEN ?? '' })
  res.setHeader('Cache-Control', 'private, max-age=300')
  return res.status(200).json(m)
}

function safeJson(s: string) { try { return JSON.parse(s) } catch { return null } }

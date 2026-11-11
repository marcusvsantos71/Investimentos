import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { StoreProvider } from './store'
import { Login } from './ui/Login'
import { BACKEND, SUPABASE_ANON_KEY, SUPABASE_URL, emailParaUsuario, usuarioParaEmail } from './lib/backend'
import { localRepo, supabaseRepo } from './lib/repo'
import './styles.css'

const Carregando = () => <div className="empty" style={{ paddingTop: 80 }}>Carregando…</div>

/** Modo local: sem login, dados no navegador. */
function Local() {
  const repo = useMemo(() => localRepo(), [])
  return <StoreProvider repo={repo}><App /></StoreProvider>
}

/** Modo Supabase: exige login; cada pessoa só enxerga a própria carteira (RLS no banco). */
function Autenticado() {
  const [sb, setSb] = useState<any>(null)
  const [sessao, setSessao] = useState<any | undefined>(undefined) // undefined = verificando
  const [falha, setFalha] = useState('')

  useEffect(() => {
    let sub: { unsubscribe(): void } | undefined
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { setFalha('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY na configuração do deploy.'); return }
    import('@supabase/supabase-js').then(async ({ createClient }) => {
      const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      setSb(c)
      const { data } = await c.auth.getSession()
      setSessao(data.session)
      sub = c.auth.onAuthStateChange((_e, s) => setSessao(s)).data.subscription
    }).catch(e => setFalha(String(e?.message ?? e)))
    return () => sub?.unsubscribe()
  }, [])

  const repo = useMemo(() => (sb && sessao ? supabaseRepo(sb, sessao.user.id) : null), [sb, sessao?.user?.id])

  if (falha) return <div className="banner" style={{ marginTop: 24 }}>{falha}</div>
  if (!sb || sessao === undefined) return <Carregando />
  if (!sessao || !repo) {
    return <Login entrar={async (email, senha) => {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha })
      return error ? (error.message === 'Invalid login credentials' ? 'Usuário ou senha incorretos.' : `Não foi possível entrar: ${error.message}`) : null
    }} cadastrar={async (usuario, senha, codigo) => {
      let r: Response
      try { r = await fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, senha, codigo }) }) }
      catch { return 'Sem conexão com o servidor. Tente novamente.' }
      if (!r.ok) return (await r.json().catch(() => ({})))?.erro ?? `Não foi possível criar a conta (HTTP ${r.status}).`
      const { error } = await sb.auth.signInWithPassword({ email: usuarioParaEmail(usuario), password: senha })
      return error ? 'Conta criada, mas não foi possível entrar. Use "Já tenho conta".' : null
    }} />
  }
  return (
    <StoreProvider key={sessao.user.id} repo={repo} usuario={emailParaUsuario(sessao.user.email ?? '')} sair={() => sb.auth.signOut()}>
      <App />
    </StoreProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{BACKEND === 'supabase' ? <Autenticado /> : <Local />}</StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}) })
}

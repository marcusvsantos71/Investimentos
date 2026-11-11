import { useState } from 'react'
import { SENHA_MIN, senhaValida, usuarioParaEmail, usuarioValido } from '../lib/backend'

export function Login({ entrar, cadastrar }: {
  entrar: (email: string, senha: string) => Promise<string | null>
  cadastrar: (usuario: string, senha: string, codigo: string) => Promise<string | null>
}) {
  const [novo, setNovo] = useState(false)
  const [s2, setS2] = useState('')
  const [cod, setCod] = useState('')
  const [u, setU] = useState('')
  const [s, setS] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!usuarioValido(u)) return setErro('Usuário: 3 a 30 caracteres (letras, números, ponto, hífen ou _).')
    if (!s) return setErro('Informe a senha.')
    if (novo) {
      if (!senhaValida(s)) return setErro(`A senha precisa ter de ${SENHA_MIN} a 72 caracteres.`)
      if (s !== s2) return setErro('As senhas não conferem.')
      if (!cod.trim()) return setErro('Informe o código de convite.')
    }
    setErro(''); setCarregando(true)
    const r = novo ? await cadastrar(u.trim().toLowerCase(), s, cod.trim()) : await entrar(usuarioParaEmail(u), s)
    setCarregando(false)
    if (r) setErro(r)
  }

  return (
    <main className="login">
      <div className="logo" aria-hidden>▮▮▮</div>
      <h1>Meus Investimentos</h1>
      <p className="muted">{novo ? 'Crie sua conta com o código de convite.' : 'Entre com seu usuário e senha.'}</p>
      <form onSubmit={enviar} noValidate className="card">
        <div className="field"><label htmlFor="usr">Usuário</label>
          <input id="usr" value={u} onChange={e => setU(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus /></div>
        <div className="field"><label htmlFor="pwd">Senha</label>
          <input id="pwd" type="password" value={s} onChange={e => setS(e.target.value)} autoComplete={novo ? 'new-password' : 'current-password'} /></div>
        {novo && <>
          <div className="field"><label htmlFor="pwd2">Repita a senha</label>
            <input id="pwd2" type="password" value={s2} onChange={e => setS2(e.target.value)} autoComplete="new-password" /></div>
          <div className="field"><label htmlFor="cod">Código de convite</label>
            <input id="cod" value={cod} onChange={e => setCod(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} /></div>
        </>}
        {erro && <p className="err" role="alert" style={{ color: 'var(--neg)', fontSize: 13 }}>{erro}</p>}
        <button className="btn" type="submit" disabled={carregando}>{carregando ? (novo ? 'Criando conta…' : 'Entrando…') : novo ? 'Criar conta' : 'Entrar'}</button>
      </form>
      <button type="button" className="btn sec" onClick={() => { setNovo(n => !n); setErro('') }}>{novo ? 'Já tenho conta' : 'Criar conta com código de convite'}</button>
    </main>
  )
}

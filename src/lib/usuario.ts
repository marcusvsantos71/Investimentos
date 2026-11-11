/** Regras de usuário/senha compartilhadas entre o app e a função de cadastro (sem dependência de ambiente). */
export const usuarioValido = (u: string) => /^[a-z0-9._-]{3,30}$/.test(u.trim().toLowerCase())
export const usuarioParaEmailCom = (u: string, dominio: string) => `${u.trim().toLowerCase()}@${dominio}`
export const emailParaUsuario = (e: string) => e.split('@')[0]
export const SENHA_MIN = 8
export const senhaValida = (s: string) => s.length >= SENHA_MIN && s.length <= 72

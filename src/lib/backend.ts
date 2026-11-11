/** Em produção (Vercel) o build usa VITE_BACKEND=supabase; sem isso o app guarda tudo no navegador. */
export const BACKEND: 'supabase' | 'local' = import.meta.env.VITE_BACKEND === 'supabase' ? 'supabase' : 'local'
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
/** O Supabase autentica por e-mail; o login por "usuário" usa um e-mail interno derivado dele (nenhum e-mail é enviado). */
export const LOGIN_DOMAIN: string = import.meta.env.VITE_LOGIN_DOMAIN ?? 'meusinvest.app'
import { usuarioParaEmailCom } from './usuario.js'
export { emailParaUsuario, usuarioValido, senhaValida, SENHA_MIN } from './usuario.js'
export const usuarioParaEmail = (u: string) => usuarioParaEmailCom(u, LOGIN_DOMAIN)

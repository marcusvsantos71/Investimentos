export const DAY = 86400000
const pad = (n: number) => String(n).padStart(2, '0')

export const toT = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const todayISO = () => {
  const n = new Date()
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
}
export const ymOf = (s: string) => s.slice(0, 7)
export const daysInMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export const monthEnd = (ym: string) => `${ym}-${pad(daysInMonth(ym))}`
export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`
}
export const diffDays = (a: string, b: string) => Math.round((toT(b) - toT(a)) / DAY)
export const addDays = (s: string, n: number) => iso(toT(s) + n * DAY)
export const monthRange = (from: string, to: string) => {
  const out: string[] = []
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m)
  return out
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
export const mesCurto = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1]
export const mesAno = (ym: string) => `${mesCurto(ym)}/${ym.slice(2, 4)}`
export const dataBR = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`
/** "dd/mm/aaaa" -> "aaaa-mm-dd" (ou null se inválida) */
export const parseDataBR = (s: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const r = `${m[3]}-${m[2]}-${m[1]}`
  return iso(toT(r)) === r ? r : null
}

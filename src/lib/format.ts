const nf = (min: number, max: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })
const f2 = nf(2, 2)

export const brl = (v: number) => `${v < 0 ? '− ' : ''}R$ ${f2.format(Math.abs(v))}`
export const brlSigned = (v: number) => `${v < 0 ? '−' : '+'} R$ ${f2.format(Math.abs(v))}`
export const num = (v: number, d = 2) => nf(0, d).format(v)
/** v em fração (0.0773 -> "+7,73%") */
export const pct = (v: number, d = 2, sign = true) =>
  `${sign ? (v < 0 ? '−' : '+') : v < 0 ? '−' : ''}${nf(d, d).format(Math.abs(v) * 100)}%`
export const pctPlain = (v: number, d = 2) => `${nf(d, d).format(v)}%`

/** Aceita "1.234,56", "1234,56" ou "1234.56". */
export const parseNum = (s: string): number | null => {
  let t = s.trim().replace(/[R$\s]/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export type Classe = 'fun' | 'tes' | 'prev' | 'rv' | 'rf'

/** Ordem de exibição igual à do protótipo. */
export const CLASSES: { id: Classe; nome: string; curto: string; cor: string }[] = [
  { id: 'fun', nome: 'Fundos de investimento', curto: 'Fundos', cor: '#2E6FB7' },
  { id: 'tes', nome: 'Tesouro Direto', curto: 'Tesouro', cor: '#D9822B' },
  { id: 'prev', nome: 'Previdência', curto: 'Previdência', cor: '#7B5EA7' },
  { id: 'rv', nome: 'Renda variável', curto: 'Renda variável', cor: '#0B3D33' },
  { id: 'rf', nome: 'Renda fixa', curto: 'Renda fixa', cor: '#3E9B7A' },
]
export const classeInfo = (c: Classe) => CLASSES.find(x => x.id === c)!

export type Indexador = 'CDI' | 'IPCA' | 'PRE' | 'SELIC'

export interface Position {
  id: string
  classe: Classe
  nome: string
  /** Código na B3 (ações/FIIs/ETFs) */
  ticker?: string
  indexador?: Indexador
  /** Taxa a.a. (%) — parte fixa de IPCA+ / prefixado / spread sobre Selic */
  taxa?: number
  /** % do CDI (para indexador CDI) */
  pctCdi?: number
  vencimento?: string
  /** Isento de IR (LCA, LCI, CRA, debêntures incentivadas) */
  isento?: boolean
  /** Preços/cotas informados manualmente (ex.: saldo atualizado de fundo) */
  cotacoes?: { data: string; preco: number }[]
  criadoEm: string
}

export type MovTipo = 'aporte' | 'resgate' | 'dividendo' | 'jcp' | 'cupom'
export const PROVENTOS: MovTipo[] = ['dividendo', 'jcp', 'cupom']

export interface Movement {
  id: string
  posId: string
  data: string // YYYY-MM-DD
  tipo: MovTipo
  valor: number
  /** quantidade de ações / cotas / títulos (aporte positivo, resgate positivo — o sinal vem do tipo) */
  qtd?: number
  /** preço unitário / cota / PU */
  preco?: number
  obs?: string
}

export interface Quote {
  price: number
  at: string // YYYY-MM-DD
  hist?: Record<string, number> // fechamento de fim de mês, chave YYYY-MM
}

export interface Market {
  source: 'simulado' | 'ao-vivo' | 'nenhum'
  updatedAt?: string
  cdi: Record<string, number> // fração mensal, ex.: 0.0105
  ipca: Record<string, number>
  quotes: Record<string, Quote> // por ticker
  tesouro: Record<string, Quote> // por nome normalizado
  avisos: string[]
}

export interface Config {
  modo: 'simulado' | 'ao-vivo'
  brapiToken: string
}

export interface AppData {
  v: 1
  positions: Position[]
  movements: Movement[]
  config: Config
}

export const emptyMarket = (): Market => ({
  source: 'nenhum', cdi: {}, ipca: {}, quotes: {}, tesouro: {}, avisos: [],
})

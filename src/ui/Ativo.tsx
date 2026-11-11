import { useState } from 'react'
import { CLASSES, classeInfo, PROVENTOS, type Classe, type MovTipo, type Movement } from '../types'
import { aggregate, curveValue, irEstimado, netInvested, periodMonths, priceAt, valueAt } from '../lib/engine'
import { brl, brlSigned, num, pct } from '../lib/format'
import { dataBR } from '../lib/dates'
import { useStore } from '../store'
import { SaldoForm } from './Forms'
import { Card, Chips, Delta, Empty, Header, Title, go } from './kit'

export const TIPO_LABEL: Record<MovTipo, string> = { aporte: 'Aporte', resgate: 'Resgate', dividendo: 'Dividendo', jcp: 'JCP', cupom: 'Cupom' }
export const Tag = ({ t }: { t: MovTipo }) => <span className={`tag ${t === 'aporte' ? 'aporte' : t === 'resgate' ? 'resgate' : 'prov'}`}>{TIPO_LABEL[t]}</span>

export function MovRow({ m, nome, link }: { m: Movement; nome?: string; link?: boolean }) {
  const sinal = m.tipo === 'resgate' ? '−' : PROVENTOS.includes(m.tipo) ? '+' : ''
  return (
    <a className="mv" href={`#/editar/${m.id}`} aria-label={`Editar ${TIPO_LABEL[m.tipo]} de ${dataBR(m.data)}`}>
      <span><Tag t={m.tipo} />{dataBR(m.data)}{link && nome ? ` · ${nome}` : ''}</span>
      <b>{sinal}{sinal ? ' ' : ''}{brl(m.valor).replace('− ', '')}</b>
      <small>{m.qtd && m.preco ? `${num(m.qtd, 4)} × ${brl(m.preco)}` : m.obs ?? ''}</small><small style={{ textAlign: 'right' }}>Editar ›</small>
    </a>
  )
}

export function Ativo({ id }: { id: string }) {
  const { ctx, perf, deletePosition } = useStore()
  const pos = ctx.positions.find(p => p.id === id)
  const [saldo, setSaldo] = useState(false)
  if (!pos) return <><Header title="Ativo" onBack /><Card><Empty>Ativo não encontrado.</Empty></Card></>
  const info = classeInfo(pos.classe)
  const valor = valueAt(ctx, pos, ctx.today)
  const investido = netInvested(ctx, pos)
  const ganho = valor - investido
  const movs = ctx.movements.filter(m => m.posId === pos.id).sort((a, b) => b.data.localeCompare(a.data))
  const proventosTotal = movs.filter(m => PROVENTOS.includes(m.tipo) && m.data <= ctx.today).reduce((s, m) => s + m.valor, 0)
  const ir = irEstimado(ctx, pos)
  const a12 = aggregate(perf, new Set([pos.id]), periodMonths(perf, '12m', ctx.today))
  const manual = pos.classe === 'fun' || pos.classe === 'prev' || pos.classe === 'tes' || pos.classe === 'rv'
  const idxTxt = pos.indexador === 'CDI' ? `${num(pos.pctCdi ?? 100)}% do CDI` : pos.indexador === 'IPCA' ? `IPCA + ${num(pos.taxa ?? 0)}% a.a.` : pos.indexador === 'PRE' ? `${num(pos.taxa ?? 0)}% a.a. prefixado` : pos.indexador === 'SELIC' ? `Selic + ${num(pos.taxa ?? 0, 4)}%` : null
  const qtdAtual = movs.filter(m => m.tipo === 'aporte' || m.tipo === 'resgate').reduce((s, m) => s + (m.tipo === 'aporte' ? 1 : -1) * (m.qtd ?? 0), 0)
  const preco = priceAt(ctx, pos, ctx.today)
  const rows: [string, React.ReactNode][] = [
    ['Classe', info.nome],
    ...(pos.ticker ? [['Código', pos.ticker] as [string, string]] : []),
    ...(idxTxt ? [['Rentabilidade', idxTxt] as [string, string]] : []),
    ...(pos.vencimento ? [['Vencimento', dataBR(pos.vencimento)] as [string, string]] : []),
    ...(qtdAtual > 0 && preco ? [['Quantidade × preço', `${num(qtdAtual, 4)} × ${brl(preco)}`] as [string, string]] : []),
    ['Investido (líquido)', brl(investido)],
    ['Rendimento 12 meses', <Delta key="r" v={a12.pct} mode="pct" />],
    ...(pos.classe !== 'rv' && pos.classe !== 'prev' ? [[`IR estimado${ir.aliquota ? ` (${num(ir.aliquota * 100, 1)}%)` : ''}`, brl(ir.ir)] as [string, string]] : []),
    ...(proventosTotal ? [['Proventos recebidos', brl(proventosTotal)] as [string, string]] : []),
  ]
  return (
    <>
      <Header title={pos.nome} sub={info.nome} onBack />
      <Card>
        <p className="muted">Saldo atual</p>
        <div className="big">{brl(valor)}</div>
        <p className="muted">Ganho desde a compra: <Delta v={ganho} mode="brl" /> ({pct(investido > 0 ? ganho / investido : 0)})</p>
        <div className="two">
          <a className="btn" href={`#/aporte/${pos.id}`}>Aportar</a>
          <a className="btn sec" href={`#/resgate/${pos.id}`}>Resgatar</a>
        </div>
        <div className="two">
          {(pos.classe === 'rv' || pos.classe === 'rf' || pos.classe === 'fun') && <a className="btn sec" href={`#/provento/${pos.id}`}>Registrar provento</a>}
          {manual && <button className="btn sec" onClick={() => setSaldo(s => !s)}>{pos.classe === 'fun' || pos.classe === 'prev' ? 'Atualizar saldo' : 'Informar preço'}</button>}
        </div>
      </Card>
      {saldo && <SaldoForm pos={pos} onDone={() => setSaldo(false)} />}
      <Card>
        <Title>Detalhes</Title>
        <div className="tbl" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {rows.map(([k, v]) => <Pair key={k} k={k} v={v} />)}
        </div>
        {pos.classe === 'tes' && <p className="note">Valor na curva: {brl(curveValue(ctx, pos, ctx.today))}. Veja a comparação completa em Mais › Tesouro Direto.</p>}
      </Card>
      <Card>
        <Title right={<span className="muted">{movs.length}</span>}>Movimentações</Title>
        {movs.length ? movs.map(m => <MovRow key={m.id} m={m} />) : <Empty>Sem movimentações.</Empty>}
      </Card>
      <button className="btn danger" onClick={() => { if (confirm(`Excluir “${pos.nome}” e suas ${movs.length} movimentações? Isso não pode ser desfeito.`)) { deletePosition(pos.id); go('/carteira') } }}>Excluir ativo</button>
    </>
  )
}
const Pair = ({ k, v }: { k: string; v: React.ReactNode }) => <><div>{k}</div><div className="r">{v}</div></>

/* ============================================================ EXTRATO GERAL */
export function Movimentacoes() {
  const { ctx } = useStore()
  const [cl, setCl] = useState<Classe | 'todos'>('todos')
  const [tp, setTp] = useState<'todos' | 'aporte' | 'resgate' | 'prov'>('todos')
  const byId = new Map(ctx.positions.map(p => [p.id, p]))
  const list = ctx.movements.filter(m => byId.has(m.posId) && (cl === 'todos' || byId.get(m.posId)!.classe === cl) &&
    (tp === 'todos' || (tp === 'prov' ? PROVENTOS.includes(m.tipo) : m.tipo === tp))).sort((a, b) => b.data.localeCompare(a.data))
  const apor = list.filter(m => m.tipo === 'aporte').reduce((s, m) => s + m.valor, 0)
  const resg = list.filter(m => m.tipo === 'resgate').reduce((s, m) => s + m.valor, 0)
  return (
    <>
      <Header title="Movimentações" onBack />
      <Card>
        <div className="row">
          <div className="tile"><span className="muted">Aportado</span><b>{brl(apor)}</b></div>
          <div className="tile"><span className="muted">Resgatado</span><b>{brl(resg)}</b></div>
        </div>
        <p className="muted">Líquido: {brlSigned(apor - resg)}</p>
        <Chips small value={cl} onChange={setCl} options={[{ id: 'todos', label: 'Todas as classes' }, ...CLASSES.map(c => ({ id: c.id as Classe | 'todos', label: c.curto }))]} />
        <Chips small value={tp} onChange={setTp} options={[{ id: 'todos', label: 'Todos' }, { id: 'aporte', label: 'Aportes' }, { id: 'resgate', label: 'Resgates' }, { id: 'prov', label: 'Proventos' }]} />
      </Card>
      <Card>
        {list.length ? list.map(m => <MovRow key={m.id} m={m} nome={byId.get(m.posId)?.nome} link />) : <Empty>Nenhuma movimentação.</Empty>}
      </Card>
      <p className="note">Toque em uma linha para editar ou excluir.</p>
    </>
  )
}

/** Tela de edição de uma movimentação já existente tem exclusão própria. */
export function ExcluirMov({ id }: { id: string }) {
  const { ctx, deleteMovement } = useStore()
  const m = ctx.movements.find(x => x.id === id)
  if (!m) return null
  return (
    <button className="btn danger" style={{ marginTop: 8 }} onClick={() => { if (confirm(`Excluir este ${TIPO_LABEL[m.tipo].toLowerCase()} de ${brl(m.valor)}?`)) { deleteMovement(id); go(`/ativo/${m.posId}`) } }}>Excluir movimentação</button>
  )
}

import { useState } from 'react'
import { CLASSES, classeInfo, PROVENTOS, type Classe, type Indexador, type MovTipo, type Position } from '../types'
import { priceAt, valueAt } from '../lib/engine'
import { brl, num, parseNum } from '../lib/format'
import { dataBR, parseDataBR, todayISO } from '../lib/dates'
import { useStore } from '../store'
import { Card, Empty, Header, Title, back, go } from './kit'

const Field = ({ label, id, error, children }: { label: string; id: string; error?: string; children: React.ReactNode }) => (
  <div className="field"><label htmlFor={id}>{label}</label>{children}{error && <span className="err" role="alert">{error}</span>}</div>
)
const hoje = () => dataBR(todayISO())

/* ============================================================ NOVO */
export function Novo({ classe }: { classe?: Classe }) {
  if (!classe) {
    return (
      <>
        <Header title="Novo investimento" onBack />
        <Card><Title>Que tipo de investimento?</Title>
          <div className="list">
            {CLASSES.map(c => <a key={c.id} href={`#/novo/${c.id}`}><span><i className="dot" style={{ background: c.cor }} />{c.nome}</span><span className="muted">›</span></a>)}
          </div></Card>
      </>
    )
  }
  return <NovoForm classe={classe} />
}

const INDEXADORES: { id: Indexador; label: string }[] = [
  { id: 'CDI', label: '% do CDI (pós-fixado)' }, { id: 'IPCA', label: 'IPCA + taxa' }, { id: 'PRE', label: 'Prefixado' },
]

function NovoForm({ classe }: { classe: Classe }) {
  const { addPosition } = useStore()
  const info = classeInfo(classe)
  const [f, setF] = useState({ nome: '', ticker: '', indexador: classe === 'tes' ? 'IPCA' : 'CDI', taxa: '', pctCdi: '100', venc: '', isento: false, data: hoje(), valor: '', qtd: '', preco: '' })
  const [err, setErr] = useState<Record<string, string>>({})
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(s => ({ ...s, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))
  const rv = classe === 'rv', tes = classe === 'tes', rf = classe === 'rf'
  const cota = classe === 'fun' || classe === 'prev'

  function salvar(e: React.FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    const data = parseDataBR(f.data)
    if (!f.nome.trim()) er.nome = 'Informe o nome.'
    if (rv && !f.ticker.trim()) er.ticker = 'Informe o código (ex.: ITSA4).'
    if (!data) er.data = 'Data inválida (dd/mm/aaaa).'
    else if (data > todayISO()) er.data = 'A data não pode ser futura.'
    let valor: number | null | undefined = parseNum(f.valor), qtd: number | null | undefined = parseNum(f.qtd), preco: number | null | undefined = parseNum(f.preco)
    if (rv) {
      if (!qtd || qtd <= 0) er.qtd = 'Informe a quantidade.'
      if (!preco || preco <= 0) er.preco = 'Informe o preço pago.'
      if (qtd && preco) valor = qtd * preco
    } else {
      if (!valor || valor <= 0) er.valor = 'Informe o valor aplicado.'
      if (tes && (!qtd || qtd <= 0)) er.qtd = 'Informe a quantidade de títulos (aparece no extrato da B3/corretora). Ela permite o cálculo a mercado.'
      if (tes && valor && qtd) preco = valor / qtd
      if (cota) { if (qtd && !preco) preco = (valor ?? 0) / qtd; if (preco && !qtd && valor) qtd = valor / preco; if (!qtd) { qtd = valor ?? undefined; preco = 1 } }
    }
    let taxa = parseNum(f.taxa), pctCdi = parseNum(f.pctCdi)
    if ((rf || tes) && f.indexador === 'CDI' && (!pctCdi || pctCdi <= 0)) er.pctCdi = 'Informe o % do CDI.'
    if ((rf || tes) && f.indexador !== 'CDI' && taxa === null) er.taxa = 'Informe a taxa (% a.a.).'
    if (f.venc && !parseDataBR(f.venc)) er.venc = 'Data inválida.'
    setErr(er)
    if (Object.keys(er).length) return
    const pos: Omit<Position, 'id' | 'criadoEm'> = {
      classe, nome: f.nome.trim(),
      ...(rv ? { ticker: f.ticker.trim().toUpperCase() } : {}),
      ...(rf || tes ? { indexador: (tes && f.indexador === 'CDI' ? 'SELIC' : f.indexador) as Indexador, taxa: taxa ?? 0, pctCdi: pctCdi ?? 100 } : {}),
      ...(f.venc ? { vencimento: parseDataBR(f.venc)! } : {}),
      ...(rf && f.isento ? { isento: true } : {}),
    }
    const id = addPosition(pos, { data: data!, tipo: 'aporte', valor: valor!, qtd: qtd ?? undefined, preco: preco ?? undefined })
    go(`/ativo/${id}`)
  }

  return (
    <>
      <Header title={info.nome} sub="Novo investimento" onBack />
      <form onSubmit={salvar} noValidate>
        <Card>
          <Field label="Nome" id="nome" error={err.nome}><input id="nome" value={f.nome} onChange={set('nome')} placeholder={rv ? 'Ex.: Itaúsa PN' : tes ? 'Ex.: Tesouro IPCA+ 2035' : rf ? 'Ex.: CDB Banco X 110% CDI' : 'Ex.: Fundo Multimercado Alfa'} /></Field>
          {tes && <p className="note">Use o nome oficial do título (ex.: “Tesouro Selic 2027”, “Tesouro IPCA+ 2035”) para o app achar o PU de mercado.</p>}
          {rv && <Field label="Código na B3" id="ticker" error={err.ticker}><input id="ticker" value={f.ticker} onChange={set('ticker')} placeholder="ITSA4" autoCapitalize="characters" /></Field>}
          {(rf || tes) && (
            <>
              {rf ? <Field label="Rentabilidade" id="idx"><select id="idx" value={f.indexador} onChange={set('indexador')}>{INDEXADORES.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}</select></Field>
                : <Field label="Tipo do título" id="idx"><select id="idx" value={f.indexador} onChange={set('indexador')}><option value="IPCA">IPCA+ (inflação + taxa)</option><option value="CDI">Selic (pós-fixado)</option><option value="PRE">Prefixado</option></select></Field>}
              {f.indexador === 'CDI'
                ? (rf ? <Field label="% do CDI" id="pc" error={err.pctCdi}><input id="pc" inputMode="decimal" value={f.pctCdi} onChange={set('pctCdi')} /></Field>
                  : <Field label="Spread sobre a Selic (% a.a.)" id="tx"><input id="tx" inputMode="decimal" value={f.taxa} onChange={set('taxa')} placeholder="0,05" /></Field>)
                : <Field label={f.indexador === 'IPCA' ? 'Taxa fixa acima do IPCA (% a.a.)' : 'Taxa prefixada (% a.a.)'} id="tx" error={err.taxa}><input id="tx" inputMode="decimal" value={f.taxa} onChange={set('taxa')} placeholder="6,15" /></Field>}
              <Field label="Vencimento (opcional)" id="venc" error={err.venc}><input id="venc" inputMode="numeric" value={f.venc} onChange={set('venc')} placeholder="dd/mm/aaaa" /></Field>
            </>
          )}
          {rf && <label className="row"><input type="checkbox" checked={f.isento} onChange={set('isento')} /> Isento de IR (LCA, LCI, CRA, debênture incentivada)</label>}
        </Card>
        <Card>
          <Title>Primeiro aporte</Title>
          <div className="two">
            <Field label="Data" id="data" error={err.data}><input id="data" inputMode="numeric" value={f.data} onChange={set('data')} /></Field>
            {rv ? <Field label="Quantidade" id="qtd" error={err.qtd}><input id="qtd" inputMode="decimal" value={f.qtd} onChange={set('qtd')} /></Field>
              : <Field label="Valor aplicado (R$)" id="valor" error={err.valor}><input id="valor" inputMode="decimal" value={f.valor} onChange={set('valor')} /></Field>}
          </div>
          {rv && <Field label="Preço por ação (R$)" id="preco" error={err.preco}><input id="preco" inputMode="decimal" value={f.preco} onChange={set('preco')} /></Field>}
          {tes && <Field label="Quantidade de títulos" id="qtd" error={err.qtd}><input id="qtd" inputMode="decimal" value={f.qtd} onChange={set('qtd')} placeholder="0,35" /></Field>}
          {cota && <div className="two">
            <Field label="Cotas (opcional)" id="qtd"><input id="qtd" inputMode="decimal" value={f.qtd} onChange={set('qtd')} /></Field>
            <Field label="Valor da cota (opcional)" id="preco"><input id="preco" inputMode="decimal" value={f.preco} onChange={set('preco')} /></Field></div>}
          {cota && <p className="note">Sem cotas, o app trata cada R$ 1 como uma cota; depois use “Atualizar saldo” no ativo para informar o saldo do extrato.</p>}
          {rv && f.qtd && f.preco && parseNum(f.qtd) && parseNum(f.preco) && <p className="note">Total: {brl(parseNum(f.qtd)! * parseNum(f.preco)!)}</p>}
        </Card>
        <button className="btn" type="submit">Salvar investimento</button>
      </form>
    </>
  )
}

/* ================================================= APORTE / RESGATE / PROVENTO / EDIÇÃO */
export function MovForm({ posId, tipo: tipoIni, movId }: { posId?: string; tipo?: MovTipo; movId?: string }) {
  const { ctx, addMovement, updateMovement } = useStore()
  const existing = movId ? ctx.movements.find(m => m.id === movId) : undefined
  const pos = ctx.positions.find(p => p.id === (existing?.posId ?? posId))
  const [tipo, setTipo] = useState<MovTipo>(existing?.tipo ?? tipoIni ?? 'aporte')
  const [f, setF] = useState({
    data: existing ? dataBR(existing.data) : hoje(), valor: existing ? String(existing.valor).replace('.', ',') : '',
    qtd: existing?.qtd ? String(existing.qtd).replace('.', ',') : '', preco: existing?.preco ? String(existing.preco).replace('.', ',') : '', obs: existing?.obs ?? '',
  })
  const [err, setErr] = useState<Record<string, string>>({})
  if (!pos) return <><Header title="Movimentação" onBack /><Card><Empty>Ativo ou movimentação não encontrado.</Empty></Card></>
  const flow = tipo === 'aporte' || tipo === 'resgate'
  const unit = pos.classe === 'rv' || pos.classe === 'tes' || pos.classe === 'fun' || pos.classe === 'prev'
  const needQtd = pos.classe === 'rv' || pos.classe === 'tes'
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(s => ({ ...s, [k]: e.target.value }))
  const sugest = pos.classe === 'rv' || pos.classe === 'tes' ? priceAt(ctx, pos, todayISO()) : undefined

  const others = ctx.movements.filter(m => m.id !== existing?.id)
  function salvar(e: React.FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    const data = parseDataBR(f.data)
    if (!data) er.data = 'Data inválida (dd/mm/aaaa).'
    if (data && flow && data > todayISO()) er.data = 'Aportes e resgates não podem ter data futura.'
    let valor: number | null | undefined = parseNum(f.valor), qtd: number | null | undefined = parseNum(f.qtd), preco: number | null | undefined = parseNum(f.preco)
    if (pos!.classe === 'rv' && flow) {
      if (!qtd || qtd <= 0) er.qtd = 'Informe a quantidade.'
      if (!preco || preco <= 0) er.preco = 'Informe o preço.'
      if (qtd && preco) valor = qtd * preco
    } else {
      if (!valor || valor <= 0) er.valor = 'Informe um valor maior que zero.'
      if (flow && pos!.classe === 'tes') {
        if (!qtd || qtd <= 0) er.qtd = 'Informe a quantidade de títulos.'
        if (qtd && valor) preco = valor / qtd
      }
      if (flow && (pos!.classe === 'fun' || pos!.classe === 'prev')) {
        if (!qtd && !preco) { const p = priceAt({ ...ctx, movements: others }, pos!, data ?? todayISO()) ?? 1; preco = p; qtd = valor ? valor / p : undefined }
        else if (qtd && !preco && valor) preco = valor / qtd
        else if (preco && !qtd && valor) qtd = valor / preco
      }
    }
    if (tipo === 'resgate' && valor && !er.valor) {
      const saldo = valueAt({ ...ctx, movements: others }, pos!, todayISO())
      if (valor > saldo + 0.005) er.valor = `Maior que o saldo atual (${brl(saldo)}).`
    }
    setErr(er)
    if (Object.keys(er).length) return
    const mv = { posId: pos!.id, data: data!, tipo, valor: valor!, qtd: qtd ?? undefined, preco: preco ?? undefined, obs: f.obs.trim() || undefined }
    if (existing) updateMovement(existing.id, flow ? mv : { ...mv, qtd: undefined, preco: undefined })
    else addMovement(flow ? mv : { ...mv, qtd: undefined, preco: undefined })
    go(`/ativo/${pos!.id}`)
  }

  const titulo = existing ? 'Editar movimentação' : tipo === 'aporte' ? 'Aportar' : tipo === 'resgate' ? 'Resgatar' : 'Registrar provento'
  return (
    <>
      <Header title={titulo} sub={pos.nome} onBack />
      <form onSubmit={salvar} noValidate>
        <Card>
          {(existing || PROVENTOS.includes(tipo)) && (
            <Field label="Tipo" id="tipo"><select id="tipo" value={tipo} onChange={e => setTipo(e.target.value as MovTipo)}>
              {(['aporte', 'resgate', 'dividendo', 'jcp', 'cupom'] as MovTipo[]).map(t => <option key={t} value={t}>{{ aporte: 'Aporte', resgate: 'Resgate', dividendo: 'Dividendo', jcp: 'JCP', cupom: 'Cupom' }[t]}</option>)}
            </select></Field>
          )}
          <Field label={flow ? 'Data' : 'Data do pagamento (pode ser futura)'} id="data" error={err.data}><input id="data" inputMode="numeric" value={f.data} onChange={set('data')} /></Field>
          {pos.classe === 'rv' && flow ? (
            <div className="two">
              <Field label="Quantidade" id="qtd" error={err.qtd}><input id="qtd" inputMode="decimal" value={f.qtd} onChange={set('qtd')} /></Field>
              <Field label="Preço (R$)" id="preco" error={err.preco}><input id="preco" inputMode="decimal" value={f.preco} onChange={set('preco')} placeholder={sugest ? num(sugest) : ''} /></Field>
            </div>
          ) : (
            <Field label="Valor (R$)" id="valor" error={err.valor}><input id="valor" inputMode="decimal" value={f.valor} onChange={set('valor')} /></Field>
          )}
          {flow && pos.classe === 'tes' && <Field label="Quantidade de títulos" id="qtd" error={err.qtd}><input id="qtd" inputMode="decimal" value={f.qtd} onChange={set('qtd')} /></Field>}
          {flow && (pos.classe === 'fun' || pos.classe === 'prev') && <div className="two">
            <Field label="Cotas (opcional)" id="qtd"><input id="qtd" inputMode="decimal" value={f.qtd} onChange={set('qtd')} /></Field>
            <Field label="Valor da cota (opcional)" id="preco"><input id="preco" inputMode="decimal" value={f.preco} onChange={set('preco')} /></Field></div>}
          <Field label="Observação (opcional)" id="obs"><input id="obs" value={f.obs} onChange={set('obs')} /></Field>
          {!unit && flow && <p className="note">O valor passa a render a partir da data informada.</p>}
        </Card>
        <button className="btn" type="submit">Salvar</button>
        <button className="btn sec" type="button" style={{ marginTop: 8 }} onClick={back}>Cancelar</button>
      </form>
    </>
  )
}

/** "Atualizar saldo" de fundos/previdência (ou PU/preço manual): grava uma cotação manual com data. */
export function SaldoForm({ pos, onDone }: { pos: Position; onDone: () => void }) {
  const { ctx, updatePosition } = useStore()
  const [v, setV] = useState('')
  const [d, setD] = useState(hoje())
  const [er, setEr] = useState('')
  const fl = ctx.movements.filter(m => m.posId === pos.id && (m.tipo === 'aporte' || m.tipo === 'resgate'))
  const qtd = fl.reduce((s, m) => s + (m.tipo === 'aporte' ? 1 : -1) * (m.qtd ?? 0), 0)
  const porSaldo = pos.classe === 'fun' || pos.classe === 'prev'
  function ok(e: React.FormEvent) {
    e.preventDefault()
    const n = parseNum(v), data = parseDataBR(d)
    if (!n || n <= 0) return setEr('Informe um valor maior que zero.')
    if (!data) return setEr('Data inválida.')
    if (porSaldo && qtd <= 0) return setEr('Sem cotas em carteira.')
    const preco = porSaldo ? n / qtd : n
    updatePosition(pos.id, { cotacoes: [...(pos.cotacoes ?? []).filter(c => c.data !== data), { data, preco }] })
    onDone()
  }
  return (
    <form onSubmit={ok} noValidate>
      <Card>
        <Title>{porSaldo ? 'Atualizar saldo' : pos.classe === 'tes' ? 'Informar PU de venda' : 'Informar preço'}</Title>
        <div className="two">
          <Field label="Data" id="sd"><input id="sd" inputMode="numeric" value={d} onChange={e => setD(e.target.value)} /></Field>
          <Field label={porSaldo ? 'Saldo atual (R$)' : 'Preço unitário (R$)'} id="sv" error={er}><input id="sv" inputMode="decimal" value={v} onChange={e => setV(e.target.value)} /></Field>
        </div>
        <div className="two"><button className="btn" type="submit">Salvar</button><button className="btn sec" type="button" onClick={onDone}>Cancelar</button></div>
      </Card>
    </form>
  )
}

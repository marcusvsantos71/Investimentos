import { useMemo, useState } from 'react'
import { CLASSES, PROVENTOS } from '../types'
import { evolution, proventos, saldoByClasse, seriesDates, tesouroInfo, tesouroSerie, valueAt } from '../lib/engine'
import { brl, brlSigned, num, pct } from '../lib/format'
import { addMonths, dataBR, mesAno, mesCurto, ymOf } from '../lib/dates'
import { useStore, parseBackup } from '../store'
import { BACKEND } from '../lib/backend'
import { Avisos, SemDados, StatusPill } from './Panels'
import { Card, Chips, Delta, Donut, Empty, Header, Lines, Title } from './kit'

/* ============================================================ VISÃO GERAL */
export function Visao() {
  const { ctx, data } = useStore()
  const [range, setRange] = useState<'1m' | '6m' | '12m' | 'all'>('12m')
  const saldos = saldoByClasse(ctx)
  const total = Object.values(saldos).reduce((a, b) => a + b, 0)
  const ev = useMemo(() => {
    const dates = seriesDates(range, ctx)
    return { dates, ...evolution(ctx, dates) }
  }, [ctx, range])
  const labels = ev.dates.map(d => (range === '1m' ? dataBR(d).slice(0, 5) : mesAno(ymOf(d))))
  const delta = ev.pat.length ? ev.pat[ev.pat.length - 1] - ev.pat[0] : 0
  return (
    <>
      <Header title="Visão geral" sub="Patrimônio consolidado" right={<StatusPill />} />
      <Avisos />
      {!data.positions.length ? <SemDados /> : (
        <>
          <Card>
            <p className="muted">Patrimônio total</p>
            <div className="big">{brl(total)}</div>
          </Card>
          <Card>
            <Title>Evolução do patrimônio</Title>
            <Chips small value={range} onChange={setRange} options={[{ id: '1m', label: '1M' }, { id: '6m', label: '6M' }, { id: '12m', label: '12M' }, { id: 'all', label: 'Total' }]} />
            <Lines labels={labels} a={ev.pat} b={ev.bench} aName="Patrimônio" bName="Mesma carteira a 100% do CDI" />
            <p className="note">Variação no período inclui aportes e resgates: {brlSigned(delta)}.</p>
          </Card>
          <Card>
            <Title>Distribuição por classe</Title>
            <Donut parts={CLASSES.map(c => ({ nome: c.nome, v: saldos[c.id], cor: c.cor })).filter(p => p.v > 0)} />
          </Card>
          <Card>
            <Title>Valor por classe</Title>
            <div className="list">
              {CLASSES.map(c => (
                <div key={c.id} className="row between" style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                  <span><i className="dot" style={{ background: c.cor }} />{c.nome}</span><b>{brl(saldos[c.id])}</b>
                </div>
              ))}
              <div className="row between" style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}><b>Total</b><b>{brl(total)}</b></div>
            </div>
          </Card>
          <p className="note">Informação para acompanhamento pessoal; não é recomendação de investimento. Cotações podem ter atraso.</p>
        </>
      )}
    </>
  )
}

/* ================================================================ PROVENTOS */
const TIPO_NOME: Record<string, string> = { dividendo: 'Dividendos', jcp: 'JCP', cupom: 'Cupons' }
const TIPO_COR: Record<string, string> = { dividendo: '#0B3D33', jcp: '#2E6FB7', cupom: '#D9822B' }

export function Proventos() {
  const { ctx, data } = useStore()
  const [per, setPer] = useState<'ano' | '6m' | '12m' | 'all'>('12m')
  const nowYm = ymOf(ctx.today)
  const from = per === 'all' ? '0000-00' : per === 'ano' ? `${nowYm.slice(0, 4)}-01` : addMonths(nowYm, per === '6m' ? -5 : -11)
  const todos = proventos(ctx)
  const recebidos = todos.filter(p => p.mv.data <= ctx.today && ymOf(p.mv.data) >= from)
  const futuros = todos.filter(p => p.mv.data > ctx.today).sort((a, b) => a.mv.data.localeCompare(b.mv.data))
  const total = recebidos.reduce((s, p) => s + p.mv.valor, 0)
  const patr = Object.values(saldoByClasse(ctx)).reduce((a, b) => a + b, 0)
  const last12 = todos.filter(p => p.mv.data <= ctx.today && ymOf(p.mv.data) >= addMonths(nowYm, -11)).reduce((s, p) => s + p.mv.valor, 0)
  const meses = [...new Set(recebidos.map(p => ymOf(p.mv.data)))].sort()
  const first = meses[0] ?? nowYm
  const rng: string[] = []
  for (let m = first; m <= nowYm; m = addMonths(m, 1)) rng.push(m)
  const [sel, setSel] = useState<string | null>(null)
  const porAtivo = ctx.positions.map(pos => {
    const v = recebidos.filter(p => p.pos.id === pos.id).reduce((s, p) => s + p.mv.valor, 0)
    return { pos, v, y: valueAt(ctx, pos, ctx.today) > 0 ? last12Of(pos.id) / valueAt(ctx, pos, ctx.today) : 0 }
  }).filter(r => r.v > 0).sort((a, b) => b.v - a.v)
  function last12Of(id: string) {
    return todos.filter(p => p.pos.id === id && p.mv.data <= ctx.today && ymOf(p.mv.data) >= addMonths(nowYm, -11)).reduce((s, p) => s + p.mv.valor, 0)
  }
  const selRows = sel ? recebidos.filter(p => ymOf(p.mv.data) === sel) : []
  return (
    <>
      <Header title="Proventos" right={<StatusPill />} />
      {!data.positions.length ? <SemDados /> : (
        <>
          <Card>
            <Chips small value={per} onChange={setPer} options={[{ id: 'ano', label: 'Ano' }, { id: '6m', label: '6 meses' }, { id: '12m', label: '12 meses' }, { id: 'all', label: 'Desde o início' }]} />
            <div><p className="muted">Recebido no período</p><div className="big">{brl(total)}</div>
              <p className="muted">Últimos 12 meses: {brl(last12)}{patr > 0 ? ` · ${num((last12 / patr) * 100)}% do patrimônio` : ''}</p></div>
            {recebidos.length ? (
              <>
                <StackBars meses={rng.length > 14 ? rng.filter((_, i) => i % Math.ceil(rng.length / 14) === 0) : rng} all={rng} recebidos={recebidos.map(p => ({ ym: ymOf(p.mv.data), t: p.mv.tipo, v: p.mv.valor }))} sel={sel} setSel={setSel} />
                <div className="legend">{PROVENTOS.map(t => <span key={t}><i style={{ background: TIPO_COR[t] }} />{TIPO_NOME[t]}</span>)}</div>
                {sel && <div className="note"><b>{mesAno(sel)}</b>: {selRows.map(p => `${p.pos.nome} ${TIPO_NOME[p.mv.tipo]} ${brl(p.mv.valor)}`).join(' · ')}</div>}
              </>
            ) : <Empty>Nenhum provento no período. Registre em um ativo (Carteira › ativo › Provento).</Empty>}
          </Card>
          {porAtivo.length > 0 && (
            <Card>
              <Title>Por ativo</Title>
              <div className="tbl">
                <div className="h">Ativo</div><div className="h r">Recebido</div><div className="h r">Yield 12m</div>
                {porAtivo.map(r => (
                  <Fragment3 key={r.pos.id}>
                    <div><a href={`#/ativo/${r.pos.id}`}>{r.pos.nome}</a></div><div className="r">{brl(r.v)}</div><div className="r">{pct(r.y, 2, false)}</div>
                  </Fragment3>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <Title>Próximos pagamentos</Title>
            {futuros.length ? (
              <>
                {futuros.map(p => (
                  <div key={p.mv.id} className="row between"><span>{dataBR(p.mv.data).slice(0, 5)} · {p.pos.nome} <small className="muted">{TIPO_NOME[p.mv.tipo]}</small></span><b>{brl(p.mv.valor)}</b></div>
                ))}
                <div className="row between"><span className="muted">Total previsto</span><b>{brl(futuros.reduce((s, p) => s + p.mv.valor, 0))}</b></div>
              </>
            ) : <Empty>Nada agendado. Proventos com data futura registrados aparecem aqui.</Empty>}
          </Card>
          <p className="note">JCP é mostrado pelo valor bruto (há 15% de IR retido na fonte). Os valores vêm do que você registra; o app não consulta agendas de pagamento.</p>
        </>
      )}
    </>
  )
}
const Fragment3 = ({ children }: { children: React.ReactNode }) => <>{children}</>

function StackBars({ meses, all, recebidos, sel, setSel }: { meses: string[]; all: string[]; recebidos: { ym: string; t: string; v: number }[]; sel: string | null; setSel: (s: string | null) => void }) {
  const W = 340, H = 140, bot = 20
  const step = all.length > meses.length ? Math.ceil(all.length / 14) : 1
  const groups = meses.map(m => {
    const span = all.filter(a => a >= m && a < (addMonths(m, step)))
    const sums: Record<string, number> = {}
    for (const r of recebidos) if (span.includes(r.ym)) sums[r.t] = (sums[r.t] ?? 0) + r.v
    return { m, sums, tot: Object.values(sums).reduce((a, b) => a + b, 0) }
  })
  const max = Math.max(1, ...groups.map(g => g.tot))
  const bw = W / groups.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Proventos por mês">
      {groups.map((g, i) => {
        let y = H - bot
        const on = sel === g.m
        return (
          <g key={g.m} onClick={() => setSel(on ? null : g.m)} style={{ cursor: 'pointer' }} opacity={sel && !on ? 0.4 : 1}>
            <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
            {PROVENTOS.map(t => {
              const h = ((g.sums[t] ?? 0) / max) * (H - bot - 8)
              y -= h
              return h > 0 ? <rect key={t} x={i * bw + bw * 0.15} y={y} width={bw * 0.7} height={h} fill={TIPO_COR[t]} rx="2" /> : null
            })}
            <text x={i * bw + bw / 2} y={H - 6} textAnchor="middle" className="bx">{mesCurto(g.m)}</text>
          </g>
        )
      })}
    </svg>
  )
}

/* ================================================================== TESOURO */
export function Tesouro() {
  const { ctx } = useStore()
  const list = ctx.positions.filter(p => p.classe === 'tes')
  const infos = list.map(p => tesouroInfo(ctx, p))
  const sum = (f: (i: typeof infos[0]) => number) => infos.reduce((s, i) => s + f(i), 0)
  const mercado = sum(i => i.mercado), curva = sum(i => i.curva)
  const serie = useMemo(() => tesouroSerie(ctx, list), [ctx])
  return (
    <>
      <Header title="Tesouro Direto" sub="Marcação a mercado × na curva" onBack right={<StatusPill />} />
      {!list.length ? <Card><Empty><span>Nenhum título cadastrado.</span><a className="btn" href="#/novo/tes">Cadastrar título</a></Empty></Card> : (
        <>
          <Card>
            <div className="row">
              <div className="tile"><span className="muted">A mercado</span><b>{brl(mercado)}</b></div>
              <div className="tile"><span className="muted">Na curva</span><b>{brl(curva)}</b></div>
            </div>
            <div className="row between"><span className="muted">Diferença (mercado − curva)</span><b><Delta v={mercado - curva} mode="brl" /> <small>({pct(curva > 0 ? mercado / curva - 1 : 0)})</small></b></div>
            <Lines labels={serie.dates.map(d => mesAno(ymOf(d)))} a={serie.mercado} b={serie.curva} aName="A mercado (estimado no histórico)" bName="Na curva" />
          </Card>
          {infos.map(i => (
            <Card key={i.pos.id}>
              <div className="row between"><a href={`#/ativo/${i.pos.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><h3>{i.pos.nome} ›</h3></a>
                {!i.temMercado && <span className="pill warn">sem PU de mercado</span>}</div>
              <div className="tbl c4" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div>Investido</div><div className="r">{brl(i.investido)}</div>
                <div>A mercado</div><div className="r">{brl(i.mercado)}</div>
                <div>Na curva</div><div className="r">{brl(i.curva)}</div>
                <div>Diferença</div><div className="r"><Delta v={i.diferenca} mode="brl" /> ({pct(i.diferencaPct)})</div>
                <div>Rendimento (mercado)</div><div className="r"><Delta v={i.mercado - i.investido} mode="brl" /></div>
                <div>Taxa contratada</div><div className="r">{i.pos.indexador === 'IPCA' ? `IPCA + ${num(i.pos.taxa ?? 0)}%` : i.pos.indexador === 'PRE' ? `${num(i.pos.taxa ?? 0)}% a.a.` : `Selic + ${num(i.pos.taxa ?? 0, 4)}%`}</div>
                <div>IR estimado ({num(i.aliquota * 100, 1)}%)</div><div className="r">{brl(i.ir)}</div>
                <div className="tot">Líquido de IR</div><div className="r tot">{brl(i.liquido)}</div>
              </div>
            </Card>
          ))}
          <Card>
            <h3>Como ler</h3>
            <p className="note"><b>A mercado</b> é quanto você receberia se vendesse hoje (quantidade × PU de venda). <b>Na curva</b> é o valor se mantiver até o vencimento, corrigido pela taxa contratada — é o que importa se você não pretende vender antes. A diferença oscila com os juros de mercado e some no vencimento. No histórico, a diferença de hoje é diluída linearmente desde a primeira compra (o app não guarda PUs passados). IR pela tabela regressiva sobre o ganho; não inclui a taxa de custódia da B3.</p>
          </Card>
        </>
      )}
    </>
  )
}

/* ====================================================================== MAIS */
export function Mais() {
  const L = ({ to, children, sub }: { to: string; children: React.ReactNode; sub?: string }) => (
    <a href={`#${to}`}><span>{children}{sub && <small className="muted" style={{ display: 'block' }}>{sub}</small>}</span><span className="muted">›</span></a>
  )
  return (
    <>
      <Header title="Mais" />
      <Card><Title>Classes de ativos</Title><div className="list"><L to="/tesouro" sub="Marcação a mercado e na curva">Tesouro Direto</L></div></Card>
      <Card><Title>Cadastro</Title><div className="list">
        <L to="/novo" sub="Ações, Tesouro, renda fixa, fundos, previdência">Novo investimento</L>
        <L to="/mov" sub="Todos os aportes, resgates e proventos">Movimentações</L>
      </div></Card>
      <Card><Title>Aplicativo</Title><div className="list">
        <L to="/config" sub="Cotações, backup e dados">Configurações</L>
      </div></Card>
    </>
  )
}

/* ================================================================ CONFIG */
export function Config() {
  const { data, ctx, setModo, setToken, refresh, atualizando, importData, reset, loadSample, usuario, sair } = useStore()
  const [msg, setMsg] = useState('')
  const [tok, setTok] = useState(data.config.brapiToken)
  const exportar = () => {
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `investimentos-backup-${ctx.today}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const importar = async (f?: File) => {
    if (!f) return
    try {
      const d = parseBackup(await f.text())
      if (confirm(`Substituir os dados atuais por ${d.positions.length} ativos e ${d.movements.length} movimentações do backup?`)) { importData(d); setMsg('Backup importado.') }
    } catch (e: any) { setMsg(e.message) }
  }
  return (
    <>
      <Header title="Configurações" onBack />
      {sair && <Card><div className="row between"><span>Conectado como <b>{usuario}</b></span><button className="btn sec" style={{ padding: '8px 14px' }} onClick={sair}>Sair</button></div></Card>}
      <Card>
        <Title>Cotações e índices</Title>
        <Chips value={data.config.modo} onChange={setModo} options={[{ id: 'ao-vivo', label: 'Ao vivo' }, { id: 'simulado', label: 'Simulado (teste)' }]} />
        <p className="note">Ao vivo: CDI e IPCA do Banco Central; ações/FIIs via brapi.dev; Tesouro Direto pelo site do Tesouro/Tesouro Transparente. Quando uma fonte falha o app avisa e usa o valor aplicado, e você pode informar o saldo/PU manualmente em cada ativo. Simulado: dados fictícios, só para testar.</p>
        {BACKEND === 'local' && <div className="field"><label htmlFor="tok">Token brapi.dev (opcional — sem token a cota gratuita é limitada)</label>
          <input id="tok" value={tok} onChange={e => setTok(e.target.value)} onBlur={() => setToken(tok.trim())} autoComplete="off" /></div>}
        <button className="btn sec" disabled={atualizando || data.config.modo !== 'ao-vivo'} onClick={refresh}>{atualizando ? 'Atualizando…' : 'Atualizar cotações agora'}</button>
        {ctx.market.avisos.length > 0 && <ul className="note">{ctx.market.avisos.map(a => <li key={a}>{a}</li>)}</ul>}
      </Card>
      <Card>
        <Title>Seus dados</Title>
        <p className="note">{BACKEND === 'supabase' ? 'Seus dados ficam na sua conta (banco Supabase), separados dos de outros usuários. O backup em arquivo é opcional, mas recomendado.' : 'Tudo fica salvo neste aparelho (navegador). Não há servidor nem login. Faça backup com frequência: limpar os dados do navegador apaga tudo.'}</p>
        <button className="btn" onClick={exportar}>Exportar backup (.json)</button>
        <label className="btn sec" style={{ cursor: 'pointer' }}>Importar backup<input type="file" accept="application/json,.json" hidden onChange={e => { importar(e.target.files?.[0]); e.target.value = '' }} /></label>
        <button className="btn sec" onClick={() => { if (confirm('Substituir os dados atuais pela carteira de exemplo?')) loadSample() }}>Carregar carteira de exemplo</button>
        <button className="btn danger" onClick={() => { if (confirm('Apagar TODOS os dados deste aparelho? Isso não pode ser desfeito.')) reset() }}>Apagar todos os dados</button>
        {msg && <p className="note" role="status">{msg}</p>}
      </Card>
    </>
  )
}

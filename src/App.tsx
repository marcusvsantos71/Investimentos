import { Carteira, Rentabilidade } from './ui/Panels'
import { Config, Mais, Proventos, Tesouro, Visao } from './ui/Screens'
import { Novo, MovForm } from './ui/Forms'
import { Ativo, ExcluirMov, Movimentacoes } from './ui/Ativo'
import { Nav, usePath } from './ui/kit'
import type { Classe } from './types'
import { useStore } from './store'

export default function App() {
  const path = usePath()
  const { erro, limparErro } = useStore()
  const [, a, b] = path.split('/')
  let screen
  switch (a) {
    case '': screen = <Visao />; break
    case 'rent': screen = <Rentabilidade />; break
    case 'carteira': screen = <Carteira />; break
    case 'proventos': screen = <Proventos />; break
    case 'mais': screen = <Mais />; break
    case 'tesouro': screen = <Tesouro />; break
    case 'config': screen = <Config />; break
    case 'mov': screen = <Movimentacoes />; break
    case 'novo': screen = <Novo classe={b as Classe | undefined} />; break
    case 'ativo': screen = <Ativo id={b} />; break
    case 'aporte': screen = <MovForm key={path} posId={b} tipo="aporte" />; break
    case 'resgate': screen = <MovForm key={path} posId={b} tipo="resgate" />; break
    case 'provento': screen = <MovForm key={path} posId={b} tipo="dividendo" />; break
    case 'editar': screen = <><MovForm key={path} movId={b} /><ExcluirMov id={b} /></>; break
    default: screen = <Visao />
  }
  return <>{erro && <div className="banner" role="alert" style={{ marginTop: 12 }}>{erro} <button className="pill" onClick={limparErro}>Fechar</button></div>}{screen}<Nav path={path} /></>
}

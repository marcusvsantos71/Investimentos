# Meus Investimentos (PWA)

App web instalável para acompanhar renda fixa, fundos, Tesouro Direto, previdência e renda variável.
**Os dados ficam só no seu aparelho** (localStorage do navegador). Não há servidor nem login.

## Rodar
```bash
npm install
npm run dev        # desenvolvimento em http://localhost:5173
npm test           # testes do motor de cálculo
npm run build      # gera dist/ (estático)
npm run preview    # serve dist/
```

## Duas versões do mesmo código
| | Artifact / modo local | Site no Vercel (Supabase) |
|---|---|---|
| Build | `npm run build` sem variáveis | `VITE_BACKEND=supabase` (configurado no Vercel) |
| Login | não tem | usuário e senha, cada pessoa com sua carteira |
| Dados | no navegador | no Supabase (protegidos por RLS) |
| Cotações | simuladas ou manuais (o artifact bloqueia chamadas externas) | função `/api/market` no servidor |

## Deploy: Supabase + Vercel (passo a passo)

### 1. Supabase
1. Crie um projeto em supabase.com (plano gratuito serve).
2. **SQL Editor** > cole o conteúdo de `supabase/schema.sql` > Run. Cria as tabelas e as regras de acesso (RLS).
3. **Authentication > Sign In / Providers > Email**: deixe "Enable email provider" ligado, **desligue "Confirm email"** e **desligue "Allow new users to sign up"** (ninguém se cadastra sozinho).
4. **Project Settings > API**: copie a *Project URL*, a chave *anon public* e a chave *service_role* (esta só vai para as variáveis do Vercel, nunca para o código nem para o navegador).
5. Contas novas: a tela inicial tem **Criar conta com código de convite**. Você define o código em `INVITE_CODE` no Vercel e o passa a quem quiser convidar; trocar o código bloqueia novos cadastros com o antigo. Alternativa manual: Authentication > Users > Add user com e-mail `usuario@meusinvest.app` e "Auto Confirm User".

### 2. Vercel
1. Suba esta pasta para um repositório no GitHub (o `.gitignore` já exclui `node_modules`, `dist` e `.env`).
2. Vercel > Add New > Project > importe o repositório (preset Vite).
3. **Environment Variables**: copie as de `.env.example` com seus valores (`VITE_BACKEND=supabase`, as de URL/chave, `BRAPI_TOKEN`).
4. Deploy. Cada `git push` publica uma nova versão.

### 3. No celular
Abra o endereço (HTTPS) e use "Adicionar à tela inicial".

### Segurança
- RLS: cada linha tem `user_id`, e as políticas só liberam linhas do próprio usuário. Não existe acesso anônimo.
- O cadastro passa por `/api/signup`, que confere o código de convite no servidor (comparação em tempo constante, pausa de 1 s a cada código errado) e só então cria o usuário com a chave `service_role`. Escolha um código longo; para revogar, troque `INVITE_CODE` e faça novo deploy.
- A chave `anon` é pública por desenho; quem protege os dados é o RLS e o login.
- `/api/market` exige sessão válida e só aceita tickers no formato esperado; o token do brapi fica só no servidor.
- Troque as senhas em Authentication > Users sempre que quiser.

### Rotina de atualização
Teste mudanças no artifact (modo local), depois `git push` para atualizar o site. Dados dos usuários não são afetados por deploys.

## Telas
Visão geral · Rentabilidade · Carteira · Proventos · Mais → Tesouro Direto (mercado × curva), Novo investimento,
Movimentações (extrato com edição/exclusão), Configurações (cotações, backup). Ativo: aportar, resgatar, registrar provento,
atualizar saldo/preço, editar cada movimentação.

## Como os números são calculados (src/lib/engine.ts)
- **Renda fixa / Tesouro na curva**: cada aporte rende pelo indexador (% do CDI, IPCA+taxa, prefixado, Selic+spread); resgates retiram valor já corrigido.
- **Ações, fundos, previdência**: quantidade × preço (cotação externa, saldo informado por você, ou último preço pago).
- **Tesouro a mercado**: quantidade × PU de venda do dia. Histórico: diferença mercado×curva diluída linearmente desde a 1ª compra (não há PU histórico por título).
- **Rendimento do período**: Dietz modificado por mês (ganho = V1 − V0 − fluxos; base = V0 + fluxos ponderados pelo tempo); períodos compostos mês a mês. Comparação com o CDI usa a mesma base de capital. Proventos ficam fora do rendimento.
- **IR estimado**: tabela regressiva sobre o ganho (idade média ponderada dos aportes); isentos = 0; renda variável e previdência não estimados.

## Cotações (src/lib/providers.ts, api/market.ts)
| Dado | Fonte | Observação |
|---|---|---|
| CDI, IPCA | Banco Central (SGS 4391 e 433) | |
| Ações, FIIs, ETFs | brapi.dev | token opcional em Configurações; sem token a cota é limitada |
| Tesouro Direto (PU) | JSON do site do Tesouro; alternativa: CSV do Tesouro Transparente | pode haver bloqueio de CORS no navegador |
| Fundos / previdência | informado por você ("Atualizar saldo") | o informe diário da CVM é um arquivo grande demais para o navegador |

Se uma fonte falhar, o app avisa e continua com o que tem. O modo **Simulado** gera dados fictícios determinísticos para testar sem internet.
Se o CORS bloquear alguma fonte em produção, o caminho é um pequeno proxy (ex.: Cloudflare Worker) — a camada está isolada em `providers.ts`.

## Limites conhecidos
- Sem eventos corporativos (desdobramento, bonificação) — ajuste quantidade/preço pelas movimentações.
- IR de renda variável (swing trade/day trade) e de previdência não é calculado.
- Dias corridos/365 nas taxas prefixadas e IPCA+ (não dias úteis/252).
- Backup manual: limpar dados do navegador apaga tudo.

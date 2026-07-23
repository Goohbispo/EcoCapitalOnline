# EcoCapital — Lucro ou Legado?

Jogo de simulação e estratégia baseado no GDD "EcoCapital", sobre capitalismo
verde, greenwashing e decisões éticas. Roda **100% em localhost**, com
banco de dados **SQLite local** (nenhum serviço externo, nenhuma conta,
nenhuma internet necessária depois de instalado) e interface **responsiva
para celular**.

## Atualizações desta versão

- **Página de ranking completo**: agora existe uma tela separada
  ("🏆 Ranking dos jogadores", acessível pela tela inicial ou pelo fim de
  jogo) que lista **todos os jogadores e partidas já iniciadas** — não só
  as finalizadas. Partidas em andamento aparecem com pontuação calculada
  "ao vivo" a partir do estado atual dos indicadores, e o status
  (Em andamento / Finalizado) fica visível em cada linha.
- **Acesso pelo celular corrigido**: o servidor agora escuta em `0.0.0.0`
  explicitamente e filtra endereços de rede virtuais (VPN, Docker etc.) ao
  montar o QR code, priorizando o IP real de Wi‑Fi/Ethernet da máquina. O
  modal de acesso também lista endereços alternativos, caso o principal
  não funcione no celular.
- **Decisões e consequências mais ricas**: cada papel agora tem 12
  decisões possíveis (antes eram 8), todas com uma frase de consequência
  narrativa exibida logo depois de escolhidas — para deixar claro o que
  aquela escolha realmente significou, e não só o número que mudou.
- **Nenhum indicador pode ser zerado**: existe um piso mínimo (6 pontos)
  em todos os indicadores. Uma sequência ruim de decisões/eventos ainda
  pode levar ao colapso, mas nunca de forma instantânea ou "travada" em
  zero — a queda é sempre gradual.
- **Finais de fracasso mais impactantes**: cada final agora vem com um
  parágrafo de epílogo. Os finais ruins (Colapso climático, Falência
  econômica, Ditadura corporativa, Fachada verde) têm um tom
  deliberadamente mais pesado, coerente com a crítica que o jogo propõe.

## Como rodar

Pré-requisito: [Node.js](https://nodejs.org) 18 ou superior instalado.

```bash
# 1. Entre na pasta do projeto
cd ecocapital

# 2. Instale as dependências (Express + better-sqlite3)
npm install

# 3. Suba o servidor
npm start
```

Depois abra **http://localhost:3000** no navegador (no computador ou no
celular, se estiver na mesma rede Wi‑Fi — nesse caso use o IP local do
computador em vez de `localhost`, ex.: `http://192.168.0.10:3000`).

O banco de dados é criado automaticamente na primeira execução, no arquivo
`ecocapital.db` (SQLite), dentro da própria pasta do projeto. Todo o
progresso, jogadores e ranking ficam salvos ali — não é preciso configurar
nenhum banco externo.

## Como jogar

1. Na tela inicial, escolha um **nome de usuário** e um **papel**: Empresa,
   Governo ou ONG Ambiental.
2. A cada turno (15 no total), você recebe **3 decisões** possíveis para o
   seu papel. Cada uma mostra o efeito esperado nos indicadores antes de
   você escolher.
3. Eventos aleatórios (secas, escândalos, vazamentos, conferências
   climáticas etc.) podem acontecer entre os turnos e alteram o cenário
   global.
4. O **Medidor de Greenwashing**, no topo da tela, mostra a distância entre
   a **sustentabilidade real** (dado concreto) e a **reputação pública**
   (discurso/marketing) — o coração temático do jogo.
5. Ao final dos 15 turnos (ou antes, se a economia colapsar ou a poluição/
   temperatura atingirem o limite), você recebe um dos finais possíveis:
   **Utopia sustentável**, **Colapso climático**, **Ditadura corporativa**,
   **Fachada verde** ou **Equilíbrio ecológico moderado** — junto de uma
   pontuação final e o ranking local das melhores partidas.

## Acesso pelo celular (QR code)

Na tela inicial há um botão **"📱 Acessar no celular"**. Ele abre um QR code
que aponta para o endereço do computador na rede local — basta escanear com
a câmera do celular.

Requisitos para isso funcionar:
- O celular precisa estar conectado à **mesma rede Wi‑Fi** do computador
  que está rodando `npm start` (não funciona com o celular na rede de
  dados móveis).
- O firewall do computador precisa permitir conexões na porta 3000 (no
  Windows, o Defender às vezes pergunta na primeira vez — escolha
  "Permitir acesso").
- Se o QR mostrar "nenhum IP de rede local detectado", o computador
  provavelmente está sem Wi‑Fi/Ethernet ativo — conecte-o à rede primeiro.

O mesmo endereço também aparece no terminal assim que você roda
`npm start`.

## Solução de problemas

**A tela trava na página inicial (nome + papel) e nada acontece ao clicar em
"Iniciar simulação":**
1. Abra o console do navegador (tecla `F12` → aba "Console") e veja se
   aparece alguma mensagem de erro em vermelho.
2. Olhe também o terminal onde `npm start` está rodando — qualquer erro do
   servidor aparece lá agora (a versão atual trata todos os erros e nunca
   falha silenciosamente).
3. Confirme que `npm install` rodou sem erros. Se `better-sqlite3` falhar
   ao instalar (comum em máquinas sem as ferramentas de build do sistema),
   tente:
   ```bash
   npm rebuild better-sqlite3
   ```
   ou, em último caso, apague `node_modules` e `package-lock.json` e rode
   `npm install` novamente.
4. Teste `http://localhost:3000/api/health` diretamente no navegador — deve
   responder algo como `{"ok":true,"db":"conectado",...}`. Se isso falhar,
   o problema está no banco de dados/servidor, não na interface.

## Estrutura do projeto

```
ecocapital/
├── server.js            # Servidor Express + regras do jogo + API REST
├── package.json
├── ecocapital.db         # criado automaticamente (SQLite)
└── public/
    ├── index.html
    ├── css/style.css     # visual do "painel de controle ambiental"
    └── js/app.js         # lógica de tela, chamadas de API, medidor SVG
```

## API (para referência / extensão)

| Método | Rota                              | Descrição                              |
|--------|------------------------------------|-----------------------------------------|
| POST   | `/api/players`                     | Cria jogador + nova partida             |
| GET    | `/api/game/:gameId`                 | Estado atual da partida                 |
| POST   | `/api/game/:gameId/decision`        | Aplica uma decisão e avança o turno     |
| GET    | `/api/game/:gameId/history`         | Histórico de turnos da partida          |
| GET    | `/api/leaderboard`                  | Ranking das 20 melhores partidas finalizadas |
| GET    | `/api/ranking`                      | Ranking completo (todas as partidas, inclusive em andamento) |

## Personalizando o jogo

Todo o conteúdo de regras (decisões por papel, eventos aleatórios, valores
iniciais dos indicadores, condições de final e fórmula de pontuação) está
concentrado no topo de `server.js`, nos objetos `DECISIONS`, `EVENTS` e nas
funções `computeEnding` / `computeScore` — dá para ajustar o equilíbrio do
jogo sem mexer no resto do código.

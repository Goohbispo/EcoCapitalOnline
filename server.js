// EcoCapital — Lucro ou Legado?
// Servidor local (Express + SQLite) — roda inteiramente em localhost.

const path = require('path');
const os = require('os');
const express = require('express');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'ecocapital.db');
const MAX_TURNS = 15;

// Descobre o IP da máquina na rede local (para acesso via celular / QR code).
// Filtra adaptadores virtuais comuns (VPN, Docker, VirtualBox, etc.) e prioriza
// interfaces "normais" de Wi-Fi/Ethernet, para reduzir a chance de o QR code
// apontar para um endereço que o celular não consegue alcançar.
const VIRTUAL_IFACE_HINTS = ['vmware', 'virtualbox', 'vbox', 'docker', 'veth', 'vethernet', 'hyper-v', 'tailscale', 'zerotier', 'wsl', 'loopback', 'utun', 'tun', 'tap', 'radmin'];

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const nameLower = name.toLowerCase();
        const looksVirtual = VIRTUAL_IFACE_HINTS.some((hint) => nameLower.includes(hint));
        candidates.push({ address: iface.address, looksVirtual });
      }
    }
  }
  // interfaces "normais" primeiro, virtuais/VPN por último (ainda inclusas, como alternativa)
  candidates.sort((a, b) => (a.looksVirtual === b.looksVirtual ? 0 : a.looksVirtual ? 1 : -1));
  return candidates.map((c) => c.address);
}

// ---------------------------------------------------------------------------
// Banco de dados local (arquivo ecocapital.db criado automaticamente)
// ---------------------------------------------------------------------------
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('empresa','governo','ong')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  turn INTEGER NOT NULL DEFAULT 1,
  economia REAL NOT NULL,
  temperatura REAL NOT NULL,
  poluicao REAL NOT NULL,
  reputacao REAL NOT NULL,
  confianca REAL NOT NULL,
  sustentabilidade REAL NOT NULL,
  greenwashing REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','finalizado')),
  ending TEXT,
  score REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS turn_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  turn INTEGER NOT NULL,
  decision_title TEXT,
  event_title TEXT,
  effects_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---------------------------------------------------------------------------
// Conteúdo do jogo (baseado no GDD "EcoCapital — Lucro ou Legado?")
// ---------------------------------------------------------------------------
const START_STATE = {
  economia: 50,
  temperatura: 30,
  poluicao: 40,
  reputacao: 50,
  confianca: 50,
  sustentabilidade: 40,
  greenwashing: 0,
};

const INDICATORS = ['economia', 'temperatura', 'poluicao', 'reputacao', 'confianca', 'sustentabilidade', 'greenwashing'];

const ROLE_LABELS = {
  empresa: { economia: 'Caixa corporativo' },
  governo: { economia: 'Orçamento público' },
  ong: { economia: 'Recursos / doações' },
};

// Cada decisão: id, título, descrição curta, efeitos (delta nos indicadores)
// e uma "consequência" narrativa exibida depois que o jogador escolhe.
// Toda decisão tem pelo menos um custo real — não existe opção sem contrapartida.
const DECISIONS = {
  empresa: [
    { id: 'e1', title: 'Investir pesado em energia renovável', desc: 'Substitui a matriz energética da produção por fontes limpas, com custo alto agora.', effects: { economia: -12, poluicao: -12, sustentabilidade: +14, reputacao: +3 }, consequence: 'A transição custa caro agora, mas a fábrica deixa de depender de combustíveis fósseis.' },
    { id: 'e2', title: 'Comprar créditos de carbono', desc: 'Compensa emissões no papel, sem alterar a produção real.', effects: { economia: -5, reputacao: +7, greenwashing: +14 }, consequence: 'Nos relatórios, as emissões da empresa "zeraram". Na fábrica, nada mudou.' },
    { id: 'e3', title: 'Expandir produção com combustíveis fósseis', desc: 'Aumenta a produção rapidamente para ganhar mercado.', effects: { economia: +14, poluicao: +14, temperatura: +4, sustentabilidade: -10, reputacao: -7 }, consequence: 'O lucro trimestral bate recorde. Os primeiros relatos de problemas respiratórios na região, também.' },
    { id: 'e4', title: 'Campanha publicitária "verde"', desc: 'Marketing sustentável sem reduzir impactos reais (greenwashing).', effects: { economia: -4, reputacao: +11, greenwashing: +18, confianca: -4 }, consequence: 'As redes sociais elogiam a nova identidade visual "verde". Ninguém pergunta sobre a fábrica.' },
    { id: 'e5', title: 'Melhorar salários e condições de trabalho', desc: 'Investe no bem-estar dos trabalhadores.', effects: { economia: -9, confianca: +12, reputacao: +3 }, consequence: 'Os funcionários finalmente respiram aliviados. O CFO, nem tanto.' },
    { id: 'e6', title: 'Terceirizar produção para reduzir custos', desc: 'Transfere produção para fornecedores com legislação ambiental mais frouxa.', effects: { economia: +9, confianca: -8, poluicao: +7, reputacao: -5 }, consequence: 'Os custos caem. As condições de trabalho na nova fábrica terceirizada, também.' },
    { id: 'e7', title: 'Patrocinar ONG ambiental com auditoria', desc: 'Financia projetos ambientais externos com resultados verificáveis.', effects: { economia: -7, reputacao: +6, sustentabilidade: +7 }, consequence: 'A parceria gera resultado real, mas nenhum efeito imediato no preço da ação.' },
    { id: 'e8', title: 'Demissão em massa para cortar custos', desc: 'Reduz drasticamente o quadro de funcionários.', effects: { economia: +13, confianca: -15, reputacao: -9 }, consequence: 'O balanço fecha no azul. Centenas de famílias entram no vermelho.' },
    { id: 'e9', title: 'Automatizar a produção com IA e robótica', desc: 'Ganha eficiência trocando mão de obra por automação.', effects: { economia: +8, sustentabilidade: +4, poluicao: -3, confianca: -7 }, consequence: 'A produção fica mais limpa e eficiente. As vagas também somem.' },
    { id: 'e10', title: 'Publicar relatório de impacto auditado por terceiros', desc: 'Divulga dados reais e verificados, mesmo que incômodos.', effects: { economia: -6, reputacao: +8, confianca: +6, greenwashing: -10 }, consequence: 'Os números não são bonitos, mas são verdadeiros — e isso, hoje em dia, já é notícia.' },
    { id: 'e11', title: 'Processar jornalistas e ativistas críticos', desc: 'Usa ações judiciais para silenciar denúncias, mesmo sem provar os fatos errados.', effects: { economia: -3, confianca: -10, reputacao: -4, greenwashing: +6 }, consequence: 'As matérias saem do ar por um tempo. O caso vira símbolo de perseguição — e volta a circular, maior.' },
    { id: 'e12', title: 'Redesenhar o produto para durar menos (obsolescência programada)', desc: 'Reduz custos de engenharia encurtando a vida útil dos produtos.', effects: { economia: +10, poluicao: +8, confianca: -9, sustentabilidade: -6 }, consequence: 'As vendas de reposição disparam. Os aterros sanitários também.' },
  ],
  governo: [
    { id: 'g1', title: 'Criar imposto verde', desc: 'Taxa emissões poluentes para financiar a transição ecológica.', effects: { economia: -7, poluicao: -9, sustentabilidade: +10, confianca: -4 }, consequence: 'As empresas ameaçam ir embora. Duas ficam. As contas do país melhoram aos poucos.' },
    { id: 'g2', title: 'Subsidiar energia limpa', desc: 'Investe recursos públicos em energias renováveis.', effects: { economia: -10, poluicao: -7, sustentabilidade: +11, reputacao: +5 }, consequence: 'O painel solar chega às escolas públicas antes das metas prometidas.' },
    { id: 'g3', title: 'Flexibilizar fiscalização ambiental', desc: 'Reduz exigências para atrair investimentos rapidamente.', effects: { economia: +13, poluicao: +11, sustentabilidade: -10, reputacao: -6 }, consequence: 'Os investimentos chegam rápido. Os rios da região começam, devagar, a mudar de cor.' },
    { id: 'g4', title: 'Assinar acordo climático internacional', desc: 'Compromete o país com metas globais de emissão.', effects: { economia: -3, sustentabilidade: +9, reputacao: +9, temperatura: -3 }, consequence: 'O discurso na ONU é aplaudido de pé. Cumprir a meta em casa será o desafio real.' },
    { id: 'g5', title: 'Fiscalizar e punir greenwashing corporativo', desc: 'Cria órgão de controle contra propaganda ambiental enganosa.', effects: { economia: -5, reputacao: +7, sustentabilidade: +6, greenwashing: -14 }, consequence: 'Três grandes marcas são multadas. Os departamentos de marketing entram em pânico.' },
    { id: 'g6', title: 'Cortar gastos sociais para equilibrar as contas', desc: 'Reduz investimento social em nome do ajuste fiscal.', effects: { economia: +11, confianca: -16, reputacao: -6 }, consequence: 'O superávit fiscal vira manchete. As filas nos postos de saúde, também.' },
    { id: 'g7', title: 'Concentrar poder e reduzir fiscalização independente', desc: 'Centraliza decisões e enfraquece órgãos de controle.', effects: { economia: +6, confianca: -14, sustentabilidade: -5, reputacao: +2 }, consequence: 'As decisões ficam mais rápidas. As vozes contrárias, mais silenciosas.' },
    { id: 'g8', title: 'Investir em educação ambiental pública', desc: 'Programas escolares e públicos sobre sustentabilidade.', effects: { economia: -7, sustentabilidade: +8, confianca: +8 }, consequence: 'Uma geração inteira aprende a diferença entre reciclável e discurso reciclado.' },
    { id: 'g9', title: 'Estatizar parte da matriz energética', desc: 'Acelera a transição energética assumindo o risco do investimento.', effects: { economia: -13, sustentabilidade: +13, poluicao: -9, reputacao: -2 }, consequence: 'O Estado assume o risco que o mercado não quis assumir. A dívida pública sente o peso.' },
    { id: 'g10', title: 'Negociar acordo comercial que troca floresta por exportação', desc: 'Amplia exportações do agronegócio flexibilizando proteção ambiental.', effects: { economia: +15, poluicao: +9, temperatura: +3, sustentabilidade: -13, reputacao: -8 }, consequence: 'O superávit comercial impressiona os mercados. Os satélites registram o desmatamento no mesmo trimestre.' },
    { id: 'g11', title: 'Criar renda básica emergencial para famílias afetadas pela crise climática', desc: 'Transferência direta de renda para quem perdeu emprego ou moradia em eventos extremos.', effects: { economia: -11, confianca: +14, reputacao: +5 }, consequence: 'As famílias atingidas voltam a respirar. O ministro da Fazenda perde o sono.' },
    { id: 'g12', title: 'Vazar dados de opositores políticos para desviar a atenção pública', desc: 'Usa serviços de inteligência para enfraquecer críticos em vez de responder às denúncias.', effects: { confianca: -13, reputacao: -6, economia: +3 }, consequence: 'O escândalo original desaparece da manchete. Um escândalo maior nasce no lugar dele.' },
  ],
  ong: [
    { id: 'o1', title: 'Denunciar greenwashing corporativo com provas', desc: 'Expõe publicamente campanhas de marketing verde enganosas.', effects: { economia: -6, confianca: +9, reputacao: +6, greenwashing: -16 }, consequence: 'A denúncia viraliza. A empresa aciona os advogados antes de corrigir qualquer coisa.' },
    { id: 'o2', title: 'Aceitar financiamento de uma grande corporação poluente', desc: 'Troca recursos financeiros por proximidade com uma empresa questionada.', effects: { economia: +13, reputacao: -9, confianca: -4 }, consequence: 'As contas fecham este trimestre. Nos bastidores, já chamam vocês de "braço verde" da empresa.' },
    { id: 'o3', title: 'Campanha pública de conscientização', desc: 'Mobiliza a população sobre consumo consciente.', effects: { economia: -6, sustentabilidade: +7, confianca: +8 }, consequence: 'As redes sociais engajam. Difícil saber quantas pessoas realmente mudam de hábito.' },
    { id: 'o4', title: 'Fazer lobby por novas leis ambientais', desc: 'Pressiona parlamentares e governo por regulação mais dura.', effects: { economia: -5, sustentabilidade: +8, poluicao: -5 }, consequence: 'O projeto de lei avança uma comissão. Faltam só mais onze.' },
    { id: 'o5', title: 'Investigar e expor crimes ambientais', desc: 'Documenta vazamentos e infrações para denúncia pública.', effects: { economia: -9, poluicao: -7, reputacao: +8 }, consequence: 'As fotos do vazamento chegam à imprensa internacional antes que a empresa consiga apagar o rastro.' },
    { id: 'o6', title: 'Buscar financiamento internacional sem condicionantes', desc: 'Capta recursos com fundos e ONGs globais.', effects: { economia: +10, reputacao: +1 }, consequence: 'O repasse chega em dólares. As condições do doador, por sorte, não vêm anexadas desta vez.' },
    { id: 'o7', title: 'Organizar boicote de consumidores', desc: 'Mobiliza boicote contra marcas poluentes.', effects: { economia: -4, poluicao: -6, reputacao: +7, confianca: +5 }, consequence: 'As vendas da marca-alvo despencam. O departamento jurídico da empresa liga no dia seguinte.' },
    { id: 'o8', title: 'Ocupar e protestar em sede corporativa', desc: 'Ação direta de protesto contra uma corporação específica.', effects: { economia: -8, reputacao: +10, confianca: +6, poluicao: -3 }, consequence: 'As câmeras registram tudo. Alguns ativistas passam a noite na delegacia.' },
    { id: 'o9', title: 'Criar parceria técnica para auditar métricas ambientais', desc: 'Desenvolve padrões independentes de medição de impacto.', effects: { economia: -6, sustentabilidade: +7, greenwashing: -9 }, consequence: 'Agora existe um número por trás do discurso — e nem todo mundo vai gostar dele.' },
    { id: 'o10', title: 'Vender relatório exclusivo de dados ambientais', desc: 'Negocia dados de campo com uma empresa interessada, em troca de recursos.', effects: { economia: +11, reputacao: -7, confianca: -6 }, consequence: 'O caixa da ONG respira. A independência editorial, nem tanto.' },
    { id: 'o11', title: 'Infiltrar uma assembleia de acionistas para expor dados internos', desc: 'Ação de risco para trazer a público documentos que a empresa nega possuir.', effects: { economia: -7, reputacao: +9, confianca: +5, greenwashing: -8 }, consequence: 'Os documentos confirmam a suspeita. A empresa aciona a justiça contra quem os divulgou.' },
    { id: 'o12', title: 'Aceitar silêncio em troca de doação vitalícia', desc: 'Um grande doador oferece financiamento permanente em troca de "moderação" nas críticas.', effects: { economia: +16, reputacao: -12, confianca: -8, greenwashing: +5 }, consequence: 'A ONG nunca mais vai precisar se preocupar com orçamento. Também nunca mais vai incomodar ninguém.' },
  ],
};

// Eventos aleatórios globais (afetam todos os modos)
const EVENTS = [
  { title: 'Seca severa', desc: 'Uma seca prolongada compromete a produção agrícola.', effects: { economia: -8, temperatura: +3, poluicao: +2 } },
  { title: 'Enchente urbana', desc: 'Chuvas extremas alagam centros urbanos e industriais.', effects: { economia: -10, confianca: -4, poluicao: +2 } },
  { title: 'Escândalo corporativo', desc: 'Uma investigação expõe práticas ambientais fraudulentas.', effects: { reputacao: -12, confianca: -6, greenwashing: -8 } },
  { title: 'Vazamento de petróleo', desc: 'Um acidente ambiental de grandes proporções vem à tona.', effects: { poluicao: +14, reputacao: -8, temperatura: +2 } },
  { title: 'Greve geral', desc: 'Trabalhadores param atividades exigindo melhores condições.', effects: { economia: -8, confianca: +3, reputacao: -3 } },
  { title: 'Conferência ambiental global', desc: 'Um acordo internacional pressiona por metas mais ambiciosas.', effects: { sustentabilidade: +8, reputacao: +4 } },
  { title: 'Boicote global', desc: 'Consumidores organizam boicote contra setores poluentes.', effects: { economia: -9, reputacao: -6 } },
  { title: 'Crise energética', desc: 'A oferta de energia cai e os custos disparam.', effects: { economia: -8, poluicao: +4, temperatura: +2 } },
  { title: 'Avanço tecnológico verde', desc: 'Uma nova tecnologia barateia soluções sustentáveis.', effects: { sustentabilidade: +9, economia: +3 } },
];

// Nenhum indicador pode ser "zerado": por mais que as decisões sejam ruins,
// sempre sobra um resíduo mínimo (nunca fica em 0). Isso evita que uma
// sequência infeliz de eventos aleatórios encerre o jogo de forma abrupta
// e sem chance de reação — a queda é sempre gradual, nunca instantânea.
const FLOOR = 6;
const CEILING = 100;

function clamp(v) {
  return Math.max(FLOOR, Math.min(CEILING, v));
}

// Epílogos narrativos exibidos na tela final. Os finais de fracasso são
// propositalmente "pesados": o jogo não suaviza a consequência de decisões
// negligentes, movido pela crítica proposta pelo GDD ao capitalismo verde.
const ENDING_EPILOGUES = {
  'Utopia sustentável': {
    tone: 'good',
    epilogue: 'A transição custou caro, mas aconteceu de verdade. Os indicadores de 2040 mostram menos carbono no ar e mais confiança nas instituições — não porque a crise acabou, mas porque, pela primeira vez em décadas, alguém decidiu pagar o preço certo na hora certa. A vigilância, no entanto, nunca pode parar: o mesmo sistema que se corrigiu agora pode se corromper de novo.'
  },
  'Equilíbrio ecológico moderado': {
    tone: 'neutral',
    epilogue: 'Nada desabou, mas nada se resolveu de fato. O planeta segue aquecendo, só que mais devagar. As desigualdades seguem existindo, só que mais toleradas. Os relatórios de sustentabilidade da década de 2040 vão chamar isso de "progresso responsável" — e não estarão totalmente errados, nem totalmente certos.'
  },
  'Fachada verde (greenwashing dominante)': {
    tone: 'bad',
    epilogue: 'Os prêmios de sustentabilidade se acumulam na parede. Os números reais, escondidos nos anexos técnicos que ninguém lê, contam outra história. Por um tempo, o discurso segura a reputação — até o dia em que um vazamento de dados, uma investigação ou uma nova geração de consumidores mais cética expõe a distância entre a vitrine e o depósito. Quando isso acontece, a queda de confiança é mais rápida do que qualquer subida de reputação jamais foi.'
  },
  'Ditadura corporativa': {
    tone: 'bad',
    epilogue: 'O poder se concentrou rápido demais para que alguém percebesse a tempo. Fiscalização virou papel. Oposição virou risco. Em nome da "estabilidade" e da "eficiência", decisões deixaram de ser discutidas e passaram a ser apenas anunciadas. A economia até funciona, nos números — mas funciona para cada vez menos gente, e cada vez menos gente tem como reclamar disso em voz alta.'
  },
  'Colapso climático': {
    tone: 'bad',
    epilogue: 'Não houve um único dia da catástrofe — houve centenas de pequenos adiamentos que, somados, se tornaram irreversíveis. Colheitas perdidas, cidades costeiras alagadas, deslocamento em massa de populações inteiras: nada disso era inevitável fisicamente, mas se tornou inevitável politicamente, decisão após decisão. A conta chegou para todos, mas não chegou igual para todos.'
  },
  'Falência econômica': {
    tone: 'bad',
    epilogue: 'O caixa não fechou por causa da natureza — fechou por causa de escolhas. Cortes que pareciam necessários no curto prazo drenaram a confiança que sustentava tudo o mais. Sem crédito, sem reputação e sem apoio popular, não sobrou fôlego para atravessar a próxima crise. O que resta agora é reconstruir — desta vez, sem os mesmos atalhos.'
  },
};

function endingDetails(endingName) {
  return ENDING_EPILOGUES[endingName] || { tone: 'neutral', epilogue: '' };
}

function applyEffects(state, effects) {
  const next = { ...state };
  for (const key of Object.keys(effects)) {
    if (INDICATORS.includes(key)) {
      next[key] = clamp((next[key] ?? 0) + effects[key]);
    }
  }
  return next;
}

function pickDecisions(role, count = 3) {
  const pool = [...DECISIONS[role]];
  const chosen = [];
  while (chosen.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen;
}

function maybeEvent(chance = 0.45) {
  if (Math.random() > chance) return null;
  return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}

function computeScore(state) {
  const s =
    (100 - state.poluicao) * 0.2 +
    state.sustentabilidade * 0.25 +
    state.confianca * 0.2 +
    state.reputacao * 0.15 +
    state.economia * 0.1 +
    (100 - state.temperatura) * 0.1;
  return Math.round(s * 10) / 10;
}

function computeEnding(state) {
  if (state.economia <= FLOOR + 2) return 'Falência econômica';
  if (state.poluicao >= 90 || state.temperatura >= 90) return 'Colapso climático';
  if (state.sustentabilidade >= 70 && state.reputacao >= 60 && state.confianca >= 60) return 'Utopia sustentável';
  if (state.confianca <= 30 && state.economia >= 60 && state.reputacao <= 45) return 'Ditadura corporativa';
  if (state.greenwashing >= 70 && state.reputacao >= 55) return 'Fachada verde (greenwashing dominante)';
  return 'Equilíbrio ecológico moderado';
}

function checkEarlyEnd(state) {
  if (state.economia <= FLOOR + 1) return 'Falência econômica';
  if (state.poluicao >= 98 || state.temperatura >= 98) return 'Colapso climático';
  return null;
}

function gameStateOut(game) {
  const ending = game.ending || null;
  const details = ending ? endingDetails(ending) : null;
  return {
    id: game.id,
    turn: game.turn,
    maxTurns: MAX_TURNS,
    status: game.status,
    ending: game.ending,
    epilogue: details ? details.epilogue : null,
    endingTone: details ? details.tone : null,
    score: game.score,
    indicators: {
      economia: game.economia,
      temperatura: game.temperatura,
      poluicao: game.poluicao,
      reputacao: game.reputacao,
      confianca: game.confianca,
      sustentabilidade: game.sustentabilidade,
      greenwashing: game.greenwashing,
    },
  };
}

// ---------------------------------------------------------------------------
// App Express
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Diagnóstico rápido: confirma que o servidor e o banco de dados estão de pé,
// e informa os endereços de rede local (usados pelo QR code de acesso móvel).
app.get('/api/health', (req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) AS n FROM players').get();
    res.json({ ok: true, db: 'conectado', players: row.n, port: PORT, lanAddresses: getLanAddresses() });
  } catch (err) {
    console.error('[health] erro:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endereço para acesso via celular na mesma rede (usado para gerar o QR code)
app.get('/api/server-info', (req, res) => {
  const addresses = getLanAddresses();
  res.json({
    port: PORT,
    localUrl: `http://localhost:${PORT}`,
    lanUrl: addresses.length ? `http://${addresses[0]}:${PORT}` : null,
    lanAddresses: addresses.map((a) => `http://${a}:${PORT}`),
  });
});

// Cria jogador + nova partida
app.post('/api/players', (req, res) => {
  try {
    const { username, role } = req.body || {};
    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ error: 'Informe um nome de usuário.' });
    }
    if (!['empresa', 'governo', 'ong'].includes(role)) {
      return res.status(400).json({ error: 'Escolha um papel válido: empresa, governo ou ong.' });
    }

    const insertPlayer = db.prepare('INSERT INTO players (username, role) VALUES (?, ?)');
    const playerInfo = insertPlayer.run(username.trim().slice(0, 40), role);
    const playerId = playerInfo.lastInsertRowid;

    const insertGame = db.prepare(`
      INSERT INTO games (player_id, turn, economia, temperatura, poluicao, reputacao, confianca, sustentabilidade, greenwashing)
      VALUES (@player_id, 1, @economia, @temperatura, @poluicao, @reputacao, @confianca, @sustentabilidade, @greenwashing)
    `);
    const gameInfo = insertGame.run({ player_id: playerId, ...START_STATE });

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameInfo.lastInsertRowid);

    res.json({
      player: { id: playerId, username: username.trim(), role, labels: ROLE_LABELS[role] },
      game: gameStateOut(game),
      decisions: pickDecisions(role, 3),
    });
  } catch (err) {
    console.error('[POST /api/players] erro:', err);
    res.status(500).json({ error: 'Erro interno ao criar jogador: ' + err.message });
  }
});

// Busca estado atual de uma partida + decisões da rodada (regeneradas se necessário)
app.get('/api/game/:gameId', (req, res) => {
  try {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Partida não encontrada.' });
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(game.player_id);
    res.json({
      player: { id: player.id, username: player.username, role: player.role, labels: ROLE_LABELS[player.role] },
      game: gameStateOut(game),
      decisions: game.status === 'ativo' ? pickDecisions(player.role, 3) : [],
    });
  } catch (err) {
    console.error('[GET /api/game/:gameId] erro:', err);
    res.status(500).json({ error: 'Erro interno ao buscar partida: ' + err.message });
  }
});

// Aplica decisão da rodada e avança o turno
app.post('/api/game/:gameId/decision', (req, res) => {
  try {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Partida não encontrada.' });
    if (game.status !== 'ativo') return res.status(400).json({ error: 'Esta partida já foi encerrada.' });

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(game.player_id);
    const { decision } = req.body || {};
    if (!decision || !decision.effects) {
      return res.status(400).json({ error: 'Decisão inválida.' });
    }

    let state = {
      economia: game.economia, temperatura: game.temperatura, poluicao: game.poluicao,
      reputacao: game.reputacao, confianca: game.confianca, sustentabilidade: game.sustentabilidade,
      greenwashing: game.greenwashing,
    };

    state = applyEffects(state, decision.effects);

    let event = null;
    const earlyAfterDecision = checkEarlyEnd(state);
    if (!earlyAfterDecision) {
      event = maybeEvent();
      if (event) state = applyEffects(state, event.effects);
    }

    const nextTurn = game.turn + 1;
    let status = 'ativo';
    let ending = null;
    let score = null;
    const earlyEnd = checkEarlyEnd(state);

    if (earlyEnd) {
      status = 'finalizado';
      ending = earlyEnd;
      score = computeScore(state);
    } else if (nextTurn > MAX_TURNS) {
      status = 'finalizado';
      ending = computeEnding(state);
      score = computeScore(state);
    }

    db.prepare(`
      UPDATE games SET turn = ?, economia = ?, temperatura = ?, poluicao = ?, reputacao = ?, confianca = ?,
        sustentabilidade = ?, greenwashing = ?, status = ?, ending = ?, score = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      status === 'finalizado' ? game.turn : nextTurn,
      state.economia, state.temperatura, state.poluicao, state.reputacao, state.confianca,
      state.sustentabilidade, state.greenwashing, status, ending, score, game.id
    );

    db.prepare(`
      INSERT INTO turn_log (game_id, turn, decision_title, event_title, effects_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(game.id, game.turn, decision.title, event ? event.title : null, JSON.stringify({ decision: decision.effects, event: event ? event.effects : null }));

    const updated = db.prepare('SELECT * FROM games WHERE id = ?').get(game.id);

    res.json({
      game: gameStateOut(updated),
      appliedDecision: { title: decision.title, effects: decision.effects, consequence: decision.consequence || null },
      event: event ? { title: event.title, desc: event.desc, effects: event.effects } : null,
      decisions: updated.status === 'ativo' ? pickDecisions(player.role, 3) : [],
    });
  } catch (err) {
    console.error('[POST /api/game/:gameId/decision] erro:', err);
    res.status(500).json({ error: 'Erro interno ao aplicar decisão: ' + err.message });
  }
});

// Histórico de rodadas de uma partida
app.get('/api/game/:gameId/history', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM turn_log WHERE game_id = ? ORDER BY turn ASC').all(req.params.gameId);
    res.json({ history: rows });
  } catch (err) {
    console.error('[GET /api/game/:gameId/history] erro:', err);
    res.status(500).json({ error: 'Erro interno ao buscar histórico: ' + err.message });
  }
});

// Ranking das melhores partidas finalizadas
app.get('/api/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT g.id, g.ending, g.score, g.updated_at, p.username, p.role
      FROM games g JOIN players p ON p.id = g.player_id
      WHERE g.status = 'finalizado'
      ORDER BY g.score DESC
      LIMIT 20
    `).all();
    res.json({ leaderboard: rows });
  } catch (err) {
    console.error('[GET /api/leaderboard] erro:', err);
    res.status(500).json({ error: 'Erro interno ao buscar ranking: ' + err.message });
  }
});

// Ranking completo: TODOS os jogadores/partidas, inclusive as que ainda
// estão em andamento (para essas, calcula a pontuação "ao vivo" com base
// no estado atual dos indicadores, já que a coluna score só é fixada no fim).
app.get('/api/ranking', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT g.*, p.username, p.role
      FROM games g JOIN players p ON p.id = g.player_id
      ORDER BY g.updated_at DESC
    `).all();

    const ranking = rows.map((g) => {
      const state = {
        economia: g.economia, temperatura: g.temperatura, poluicao: g.poluicao,
        reputacao: g.reputacao, confianca: g.confianca, sustentabilidade: g.sustentabilidade,
        greenwashing: g.greenwashing,
      };
      const score = g.status === 'finalizado' ? g.score : computeScore(state);
      return {
        gameId: g.id,
        username: g.username,
        role: g.role,
        status: g.status,
        turn: g.turn,
        maxTurns: MAX_TURNS,
        score,
        ending: g.status === 'finalizado' ? g.ending : null,
        updatedAt: g.updated_at,
      };
    });

    ranking.sort((a, b) => b.score - a.score);
    res.json({ ranking });
  } catch (err) {
    console.error('[GET /api/ranking] erro:', err);
    res.status(500).json({ error: 'Erro interno ao buscar ranking completo: ' + err.message });
  }
});

// Rede de segurança: qualquer erro não tratado vira JSON, nunca uma página HTML crua
app.use((err, req, res, next) => {
  console.error('[erro não tratado]', err);
  res.status(500).json({ error: 'Erro interno do servidor: ' + (err && err.message ? err.message : 'desconhecido') });
});

app.listen(PORT, '0.0.0.0', () => {
  const lan = getLanAddresses();
  console.log('');
  console.log('  EcoCapital — Lucro ou Legado?');
  console.log(`  Servidor rodando em http://localhost:${PORT}`);
  if (lan.length) {
    console.log('  Acesso pelo celular (mesma rede Wi-Fi):');
    lan.forEach((ip) => console.log(`    → http://${ip}:${PORT}`));
  } else {
    console.log('  Nenhum endereço de rede local detectado para acesso via celular.');
  }
  console.log(`  Banco de dados local: ${DB_PATH}`);
  console.log('');
});

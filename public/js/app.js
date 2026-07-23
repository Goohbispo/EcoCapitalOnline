(function () {
  'use strict';

  const state = {
    player: null,
    gameId: null,
    selectedRole: null,
  };

  const $ = (sel) => document.querySelector(sel);

  // fetch que sempre retorna JSON (ou lança um erro com mensagem legível),
  // mesmo se o servidor responder com HTML de erro ou cair no meio do caminho.
  async function apiFetch(url, options) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (networkErr) {
      throw new Error('Não foi possível conectar ao servidor. Confira se "npm start" ainda está rodando no terminal.');
    }
    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error(`O servidor respondeu de forma inesperada (status ${res.status}). Veja o terminal onde "npm start" está rodando para o erro completo.`);
    }
    if (!res.ok) throw new Error(data.error || `Erro do servidor (status ${res.status}).`);
    return data;
  }
  const screens = {
    onboarding: $('#screen-onboarding'),
    game: $('#screen-game'),
    end: $('#screen-end'),
    ranking: $('#screen-ranking'),
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function currentScreenName() {
    return Object.keys(screens).find((key) => screens[key].classList.contains('active')) || 'onboarding';
  }

  const INDICATOR_META = {
    economia:          { label: null, color: 'var(--gold)' },
    temperatura:       { label: 'Temperatura global', color: 'var(--alert)' },
    poluicao:          { label: 'Poluição', color: 'var(--alert)' },
    reputacao:         { label: 'Reputação pública', color: 'var(--toxic)' },
    confianca:         { label: 'Confiança social', color: 'var(--confid)' },
    sustentabilidade:  { label: 'Sustentabilidade real', color: 'var(--real)' },
  };

  const ROLE_ECONOMIA_LABEL = {
    empresa: 'Caixa corporativo',
    governo: 'Orçamento público',
    ong: 'Recursos / doações',
  };

  const ROLE_NAMES = { empresa: 'Empresa', governo: 'Governo', ong: 'ONG Ambiental' };

  // -----------------------------------------------------------------
  // Persistência local de sessão (retomar partida ao recarregar a página)
  // -----------------------------------------------------------------
  function saveSession() {
    if (state.player && state.gameId) {
      localStorage.setItem('ecocapital_session', JSON.stringify({ player: state.player, gameId: state.gameId }));
    }
  }
  function clearSession() {
    localStorage.removeItem('ecocapital_session');
  }
  function loadSession() {
    try {
      const raw = localStorage.getItem('ecocapital_session');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // -----------------------------------------------------------------
  // Onboarding
  // -----------------------------------------------------------------
  const usernameInput = $('#input-username');
  const startBtn = $('#btn-start');
  const roleCards = document.querySelectorAll('.role-card');
  const onboardingError = $('#onboarding-error');

  roleCards.forEach((card) => {
    card.addEventListener('click', () => {
      roleCards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedRole = card.dataset.role;
      validateOnboarding();
    });
  });
  usernameInput.addEventListener('input', validateOnboarding);

  function validateOnboarding() {
    const ok = usernameInput.value.trim().length > 0 && !!state.selectedRole;
    startBtn.disabled = !ok;
  }

  startBtn.addEventListener('click', async () => {
    onboardingError.hidden = true;
    startBtn.disabled = true;
    startBtn.textContent = 'Iniciando...';
    try {
      const data = await apiFetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput.value.trim(), role: state.selectedRole }),
      });

      state.player = data.player;
      state.gameId = data.game.id;
      saveSession();
      renderGame(data.game, data.decisions, null, null);
      showScreen('game');
    } catch (err) {
      onboardingError.textContent = err.message;
      onboardingError.hidden = false;
      startBtn.disabled = false;
      startBtn.textContent = 'Iniciar simulação';
    }
  });

  // -----------------------------------------------------------------
  // Tela de jogo
  // -----------------------------------------------------------------
  function renderGame(game, decisions, event, appliedDecision) {
    $('#hud-username').textContent = state.player.username;
    $('#hud-role').textContent = ROLE_NAMES[state.player.role];
    $('#hud-turn').textContent = game.turn;
    $('#hud-maxturn').textContent = game.maxTurns;

    renderIndicators(game.indicators);
    renderGauge(game.indicators);
    renderNewsflash(appliedDecision, event);
    renderDecisions(decisions);
  }

  function renderIndicators(ind) {
    const grid = $('#indicator-grid');
    grid.innerHTML = '';

    const economiaLabel = ROLE_ECONOMIA_LABEL[state.player.role];
    const order = ['economia', 'sustentabilidade', 'reputacao', 'confianca', 'poluicao', 'temperatura'];

    order.forEach((key) => {
      const meta = INDICATOR_META[key];
      const label = key === 'economia' ? economiaLabel : meta.label;
      const value = Math.round(ind[key]);
      const el = document.createElement('div');
      el.className = 'indicator';
      el.innerHTML = `
        <div class="indicator-top">
          <span class="indicator-name">${label}</span>
          <span class="indicator-value">${value}</span>
        </div>
        <div class="indicator-bar-track">
          <div class="indicator-bar-fill" style="width:${value}%; background:${meta.color}"></div>
        </div>
      `;
      grid.appendChild(el);
    });
  }

  // Medidor assinatura: dois arcos (real x discurso) + leitura numérica do gap
  function renderGauge(ind) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = $('#gauge-svg');
    svg.innerHTML = '';

    const cx = 120, cy = 120, r = 90;
    const startAngle = 180, endAngle = 0; // semicírculo superior

    function arcPoint(angleDeg, radius) {
      const rad = (Math.PI / 180) * angleDeg;
      return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
    }

    function describeArc(pct, radius) {
      const angle = startAngle - (startAngle - endAngle) * (pct / 100);
      const p0 = arcPoint(startAngle, radius);
      const p1 = arcPoint(angle, radius);
      const largeArc = (startAngle - angle) > 180 ? 1 : 0;
      return `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;
    }

    // trilho de fundo
    const track = document.createElementNS(svgNS, 'path');
    track.setAttribute('d', describeArc(100, r));
    track.setAttribute('stroke', '#2A3D35');
    track.setAttribute('stroke-width', '14');
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke-linecap', 'round');
    svg.appendChild(track);

    // arco real (sustentabilidade)
    const realArc = document.createElementNS(svgNS, 'path');
    realArc.setAttribute('d', describeArc(ind.sustentabilidade, r));
    realArc.setAttribute('stroke', '#2FA8A0');
    realArc.setAttribute('stroke-width', '14');
    realArc.setAttribute('fill', 'none');
    realArc.setAttribute('stroke-linecap', 'round');
    svg.appendChild(realArc);

    // arco discurso (reputação), raio menor para não sobrepor
    const toxicArc = document.createElementNS(svgNS, 'path');
    toxicArc.setAttribute('d', describeArc(ind.reputacao, r - 20));
    toxicArc.setAttribute('stroke', '#B4FF3D');
    toxicArc.setAttribute('stroke-width', '14');
    toxicArc.setAttribute('fill', 'none');
    toxicArc.setAttribute('stroke-linecap', 'round');
    svg.appendChild(toxicArc);

    const gap = Math.round(ind.greenwashing);
    $('#gauge-value').textContent = gap;
  }

  function renderNewsflash(appliedDecision, event) {
    const box = $('#newsflash');
    if (!appliedDecision && !event) { box.hidden = true; box.innerHTML = ''; return; }

    let html = '';
    if (appliedDecision && appliedDecision.consequence) {
      html += `
        <div class="result-block">
          <span class="newsflash-tag tag-result">RESULTADO</span>
          <span class="newsflash-title">${appliedDecision.title}</span>
          <p class="newsflash-desc">${appliedDecision.consequence}</p>
        </div>
      `;
    }
    if (event) {
      html += `
        <div class="result-block">
          <span class="newsflash-tag">BOLETIM</span>
          <span class="newsflash-title">${event.title}</span>
          <p class="newsflash-desc">${event.desc}</p>
        </div>
      `;
    }
    box.innerHTML = html;
    box.hidden = html === '';
  }

  function effectChips(effects) {
    const labels = {
      economia: 'caixa', temperatura: 'temp.', poluicao: 'poluição',
      reputacao: 'reputação', confianca: 'confiança', sustentabilidade: 'sustent.', greenwashing: 'greenwashing',
    };
    return Object.entries(effects).map(([k, v]) => {
      const cls = v >= 0 ? 'pos' : 'neg';
      const sign = v >= 0 ? '+' : '';
      return `<span class="effect-chip ${cls}">${labels[k] || k} ${sign}${v}</span>`;
    }).join('');
  }

  function renderDecisions(decisions) {
    const list = $('#decision-list');
    list.innerHTML = '';
    decisions.forEach((d) => {
      const btn = document.createElement('button');
      btn.className = 'decision-card';
      btn.innerHTML = `
        <div class="decision-title">${d.title}</div>
        <div class="decision-desc">${d.desc}</div>
        <div class="decision-effects">${effectChips(d.effects)}</div>
      `;
      btn.addEventListener('click', () => applyDecision(d, list));
      list.appendChild(btn);
    });
  }

  async function applyDecision(decision, listEl) {
    Array.from(listEl.children).forEach((c) => (c.disabled = true));
    try {
      const data = await apiFetch(`/api/game/${state.gameId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });

      if (data.game.status === 'finalizado') {
        clearSession();
        renderEnd(data.game);
        showScreen('end');
      } else {
        renderGame(data.game, data.decisions, data.event, data.appliedDecision);
      }
    } catch (err) {
      alert(err.message);
      Array.from(listEl.children).forEach((c) => (c.disabled = false));
    }
  }

  // -----------------------------------------------------------------
  // Tela de fim de jogo
  // -----------------------------------------------------------------
  function renderEnd(game) {
    $('#end-ending').textContent = game.ending;
    $('#end-score').textContent = game.score;
    $('#end-epilogue').textContent = game.epilogue || '';

    const endCard = document.querySelector('.end-card');
    endCard.classList.remove('tone-good', 'tone-neutral', 'tone-bad');
    if (game.endingTone) endCard.classList.add(`tone-${game.endingTone}`);

    const box = $('#end-indicators');
    box.innerHTML = '';
    Object.entries(game.indicators).forEach(([key, value]) => {
      const meta = INDICATOR_META[key];
      const label = key === 'economia' ? ROLE_ECONOMIA_LABEL[state.player.role] : (meta ? meta.label : key);
      const el = document.createElement('div');
      el.className = 'indicator';
      el.innerHTML = `
        <div class="indicator-top">
          <span class="indicator-name">${label}</span>
          <span class="indicator-value">${Math.round(value)}</span>
        </div>
        <div class="indicator-bar-track">
          <div class="indicator-bar-fill" style="width:${Math.round(value)}%; background:${meta ? meta.color : 'var(--muted)'}"></div>
        </div>
      `;
      box.appendChild(el);
    });

    loadLeaderboard();
  }

  async function loadLeaderboard() {
    const list = $('#leaderboard-list');
    list.innerHTML = '<li>Carregando...</li>';
    try {
      const data = await apiFetch('/api/leaderboard');
      list.innerHTML = '';
      if (!data.leaderboard.length) {
        list.innerHTML = '<li>Nenhuma partida registrada ainda.</li>';
        return;
      }
      data.leaderboard.forEach((row, i) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="lb-name">${i + 1}. ${row.username} <span class="lb-meta">(${ROLE_NAMES[row.role] || row.role})</span></span>
          <span class="lb-meta">${row.score} · ${row.ending}</span>
        `;
        list.appendChild(li);
      });
    } catch (e) {
      list.innerHTML = '<li>Não foi possível carregar o ranking.</li>';
    }
  }

  // -----------------------------------------------------------------
  // Ranking completo de jogadores (tela separada)
  // -----------------------------------------------------------------
  let screenBeforeRanking = 'onboarding';

  async function openRankingScreen() {
    screenBeforeRanking = currentScreenName();
    showScreen('ranking');
    const tbody = $('#ranking-tbody');
    tbody.innerHTML = `<tr><td colspan="7">Carregando...</td></tr>`;
    try {
      const data = await apiFetch('/api/ranking');
      tbody.innerHTML = '';
      if (!data.ranking.length) {
        tbody.innerHTML = `<tr><td colspan="7">Nenhuma partida registrada ainda. Seja o primeiro a jogar!</td></tr>`;
        return;
      }
      data.ranking.forEach((row, i) => {
        const tr = document.createElement('tr');
        const statusLabel = row.status === 'finalizado' ? 'Finalizado' : 'Em andamento';
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${row.username}</td>
          <td>${ROLE_NAMES[row.role] || row.role}</td>
          <td><span class="status-pill status-${row.status}">${statusLabel}</span></td>
          <td>${row.turn}/${row.maxTurns}</td>
          <td class="col-score">${row.score}</td>
          <td>${row.ending || '—'}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7">Não foi possível carregar o ranking: ${err.message}</td></tr>`;
    }
  }

  $('#btn-open-ranking').addEventListener('click', openRankingScreen);
  $('#btn-view-full-ranking').addEventListener('click', openRankingScreen);
  $('#btn-ranking-back').addEventListener('click', () => showScreen(screenBeforeRanking));

  // -----------------------------------------------------------------
  // Acesso via celular (QR code)
  // -----------------------------------------------------------------
  const mobileModal = $('#modal-mobile');
  const qrContainer = $('#qr-container');
  let qrRendered = false;

  $('#btn-mobile-access').addEventListener('click', async () => {
    mobileModal.hidden = false;
    $('#modal-url').innerHTML = 'detectando endereço...';
    qrContainer.innerHTML = '';
    qrRendered = false;
    try {
      const info = await apiFetch('/api/server-info');
      const url = info.lanUrl || info.localUrl;

      if (window.QRCode && info.lanUrl) {
        new QRCode(qrContainer, { text: url, width: 172, height: 172, colorDark: '#0F1A17', colorLight: '#ffffff' });
        qrRendered = true;
      } else if (!info.lanUrl) {
        qrContainer.textContent = 'Nenhum IP de rede local detectado. Conecte este computador ao Wi‑Fi e tente de novo.';
      } else {
        qrContainer.textContent = 'Biblioteca de QR code não carregou (sem internet neste computador?). Digite o endereço abaixo no navegador do celular.';
      }

      let html = `<strong>${url}</strong>`;
      if (info.lanAddresses && info.lanAddresses.length > 1) {
        const alternatives = info.lanAddresses.filter((a) => a !== url);
        html += `<br><span class="modal-alt-label">Se não funcionar, tente:</span><br>` +
          alternatives.map((a) => `<span class="modal-alt">${a}</span>`).join('<br>');
      }
      $('#modal-url').innerHTML = html;
    } catch (err) {
      $('#modal-url').textContent = err.message;
    }
  });

  $('#modal-mobile-close').addEventListener('click', () => { mobileModal.hidden = true; });
  mobileModal.addEventListener('click', (e) => { if (e.target === mobileModal) mobileModal.hidden = true; });

  $('#btn-restart').addEventListener('click', () => {
    state.player = null;
    state.gameId = null;
    state.selectedRole = null;
    usernameInput.value = '';
    roleCards.forEach((c) => c.classList.remove('selected'));
    startBtn.disabled = true;
    startBtn.textContent = 'Iniciar simulação';
    showScreen('onboarding');
  });

  // -----------------------------------------------------------------
  // Retomar sessão existente, se houver
  // -----------------------------------------------------------------
  (async function init() {
    const session = loadSession();
    if (!session) { showScreen('onboarding'); return; }
    try {
      const data = await apiFetch(`/api/game/${session.gameId}`);
      if (data.game.status === 'finalizado') {
        state.player = session.player;
        clearSession();
        renderEnd(data.game);
        showScreen('end');
        return;
      }
      state.player = data.player;
      state.gameId = data.game.id;
      renderGame(data.game, data.decisions, null, null);
      showScreen('game');
    } catch (e) {
      clearSession();
      showScreen('onboarding');
    }
  })();
})();

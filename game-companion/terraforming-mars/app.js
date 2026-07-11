const STORAGE_KEY = 'gc_tm_state';

const RESOURCES = [
  { id: 'mc',       label: 'MegaCredits', icon: '💰', color: '#c8a832', minProd: -5 },
  { id: 'steel',    label: 'Steel',       icon: '🔩', color: '#8b5e3c', minProd: 0 },
  { id: 'titanium', label: 'Titanium',    icon: '⬡',  color: '#6a8ca8', minProd: 0 },
  { id: 'plants',   label: 'Plants',      icon: '🌿', color: '#4a8c2e', minProd: 0 },
  { id: 'energy',   label: 'Energy',      icon: '⚡', color: '#8844cc', minProd: 0 },
  { id: 'heat',     label: 'Heat',        icon: '🔥', color: '#c85520', minProd: 0 },
];

const PARAMS = {
  temperature: {
    label: 'Temperature',
    min: -30, max: 8, step: 2,
    displayFn: v => `${v > 0 ? '+' : ''}${v}`,
    unit: '°C',
    color: '#5b9bd5',
  },
  oxygen: {
    label: 'Oxygen',
    min: 0, max: 14, step: 1,
    displayFn: v => String(v),
    unit: '%',
    color: '#4a9e6e',
  },
  oceans: {
    label: 'Oceans',
    min: 0, max: 9, step: 1,
    displayFn: v => String(v),
    unit: '/ 9',
    color: '#2980b9',
  },
};

let state = null;
let toastTimer = null;

// ---- State helpers ----

function newPlayerState(name) {
  const resources = {};
  RESOURCES.forEach(r => { resources[r.id] = { production: 0, amount: 0 }; });
  return { name, tr: 20, resources };
}

function newGameState(playerNames) {
  return {
    generation: 1,
    params: { temperature: -30, oxygen: 0, oceans: 0 },
    players: playerNames.map(n => newPlayerState(n)),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
  state = null;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// ---- Toast ----

function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

// ---- Setup screen ----

function showSetup() {
  document.getElementById('setup-overlay').classList.remove('hidden');
  document.getElementById('main-game').classList.add('hidden');
  renderPlayerInputs(2);

  document.querySelectorAll('.player-count-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.count === '2');
  });
}

function hideSetup() {
  document.getElementById('setup-overlay').classList.add('hidden');
  document.getElementById('main-game').classList.remove('hidden');
}

function renderPlayerInputs(count) {
  const container = document.getElementById('player-inputs');
  container.innerHTML = Array.from({ length: count }, (_, i) => `
    <div class="player-input-row">
      <label class="player-input-label">Player ${i + 1}</label>
      <input
        class="player-name-input"
        type="text"
        placeholder="Enter name"
        id="pname-${i}"
        maxlength="20"
        autocomplete="off"
      />
    </div>
  `).join('');

  const first = document.getElementById('pname-0');
  if (first) first.focus();
}

function startGame() {
  const activeBtn = document.querySelector('.player-count-btn.active');
  const count = parseInt(activeBtn?.dataset.count || '2', 10);
  const names = Array.from({ length: count }, (_, i) => {
    const val = document.getElementById(`pname-${i}`)?.value.trim();
    return val || `Player ${i + 1}`;
  });
  state = newGameState(names);
  saveState();
  hideSetup();
  render();
}

// ---- Render ----

function render() {
  renderHeader();
  renderParams();
  renderPlayers();
}

function renderHeader() {
  document.getElementById('generation-display').textContent =
    `Generation ${state.generation}`;
}

function renderParams() {
  const container = document.getElementById('params-container');
  container.innerHTML = Object.entries(PARAMS).map(([key, def]) => {
    const val = state.params[key];
    const range = def.max - def.min;
    const pct = ((val - def.min) / range) * 100;
    const isMaxed = val >= def.max;
    const displayVal = def.displayFn(val);

    return `
      <div class="param-card${isMaxed ? ' maxed' : ''}">
        <div class="param-name">${def.label}</div>
        <div class="param-value-row">
          <span class="param-value">${escHtml(displayVal)}</span>
          <span class="param-unit">${def.unit}</span>
          ${isMaxed ? '<span class="param-maxed-badge">Maxed</span>' : ''}
        </div>
        <div class="param-track">
          <div class="param-fill" style="width:${pct}%; background:${def.color}"></div>
        </div>
        <div class="param-range">
          <span>${def.min}${def.unit === '°C' ? '°C' : def.unit === '%' ? '%' : ''}</span>
          <span>${def.max}${def.unit === '°C' ? '°C' : def.unit === '%' ? '%' : ''}</span>
        </div>
        <div class="param-controls">
          <button class="param-btn"
            onclick="adjustParam('${key}', -1)"
            ${val <= def.min ? 'disabled' : ''}>−</button>
          <button class="param-btn"
            onclick="adjustParam('${key}', 1)"
            ${isMaxed ? 'disabled' : ''}>+</button>
        </div>
      </div>`;
  }).join('');
}

function renderPlayers() {
  const container = document.getElementById('players-container');
  container.innerHTML = state.players.map((p, i) => renderPlayerCard(p, i)).join('');
}

function renderPlayerCard(player, idx) {
  const resourcesHtml = RESOURCES.map(r => {
    const res = player.resources[r.id];
    return `
      <div class="resource-block" style="--res-color: ${r.color}">
        <div class="resource-header">
          <span class="resource-icon">${r.icon}</span>
          <span class="resource-name">${r.label}</span>
        </div>
        <div class="resource-row">
          <span class="resource-row-label">Prod</span>
          <div class="resource-ctrl">
            <button class="res-btn"
              onclick="adjustResource(${idx},'${r.id}','production',-1)">−</button>
            <span class="resource-val val-prod">${res.production}</span>
            <button class="res-btn"
              onclick="adjustResource(${idx},'${r.id}','production',1)">+</button>
          </div>
        </div>
        <div class="resource-row">
          <span class="resource-row-label">Amt</span>
          <div class="resource-ctrl">
            <button class="res-btn"
              onclick="adjustResource(${idx},'${r.id}','amount',-1)">−</button>
            <span class="resource-val val-amt">${res.amount}</span>
            <button class="res-btn"
              onclick="adjustResource(${idx},'${r.id}','amount',1)">+</button>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="player-card">
      <div class="player-header">
        <span class="player-name">${escHtml(player.name)}</span>
        <div class="tr-group">
          <span class="tr-label">TR</span>
          <button class="ctrl-btn" onclick="adjustTR(${idx}, -1)">−</button>
          <span class="tr-value">${player.tr}</span>
          <button class="ctrl-btn" onclick="adjustTR(${idx}, 1)">+</button>
        </div>
      </div>
      <div class="resources-grid">
        ${resourcesHtml}
      </div>
    </div>`;
}

// ---- Game actions ----

function adjustParam(param, direction) {
  const def = PARAMS[param];
  state.params[param] = clamp(
    state.params[param] + direction * def.step,
    def.min,
    def.max
  );
  saveState();
  renderParams();
}

function adjustTR(playerIdx, delta) {
  state.players[playerIdx].tr = clamp(state.players[playerIdx].tr + delta, 0, 63);
  saveState();
  renderPlayers();
}

function adjustResource(playerIdx, resourceId, field, delta) {
  const rDef = RESOURCES.find(r => r.id === resourceId);
  const res = state.players[playerIdx].resources[resourceId];
  if (field === 'production') {
    res.production = clamp(res.production + delta, rDef.minProd, 99);
  } else {
    res.amount = clamp(res.amount + delta, 0, 9999);
  }
  saveState();
  renderPlayers();
}

// Production phase order per TM rules:
//   1. Existing Energy → Heat
//   2. MC income  = TR + MC production
//   3. Steel      += steel production
//   4. Titanium   += titanium production
//   5. Plants     += plants production
//   6. Energy     = energy production (fresh)
//   7. Heat       += heat production
function endGeneration() {
  state.players.forEach(p => {
    const r = p.resources;
    r.heat.amount += r.energy.amount;        // old energy → heat
    r.mc.amount   += p.tr + r.mc.production; // collect MC (can add negatives)
    r.steel.amount    += r.steel.production;
    r.titanium.amount += r.titanium.production;
    r.plants.amount   += r.plants.production;
    r.energy.amount    = r.energy.production; // fresh energy from production
    r.heat.amount     += r.heat.production;

    // amounts can't go below 0 (except MC can theoretically; TM says floor 0)
    Object.values(r).forEach(res => { res.amount = Math.max(0, res.amount); });
  });

  state.generation += 1;
  saveState();
  render();

  const genDone = state.generation - 1;
  const allMaxed =
    state.params.temperature >= PARAMS.temperature.max &&
    state.params.oxygen >= PARAMS.oxygen.max &&
    state.params.oceans >= PARAMS.oceans.max;

  if (allMaxed) {
    toast(`Generation ${genDone} complete! All parameters maxed — game over!`, 4000);
  } else {
    toast(`Generation ${genDone} complete! Resources collected.`);
  }
}

function newGame() {
  if (!confirm('Start a new game? All current progress will be lost.')) return;
  clearState();
  showSetup();
}

// ---- Init ----

function init() {
  // Player count buttons
  document.querySelectorAll('.player-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-count-btn')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPlayerInputs(parseInt(btn.dataset.count, 10));
    });
  });

  // Setup form
  document.getElementById('start-game-btn').addEventListener('click', startGame);
  document.getElementById('player-inputs').addEventListener('keydown', e => {
    if (e.key === 'Enter') startGame();
  });

  // Game controls
  document.getElementById('end-gen-btn').addEventListener('click', endGeneration);
  document.getElementById('new-game-btn').addEventListener('click', newGame);

  // Restore or show setup
  state = loadState();
  if (state && state.players && state.players.length > 0) {
    hideSetup();
    render();
  } else {
    showSetup();
  }
}

document.addEventListener('DOMContentLoaded', init);

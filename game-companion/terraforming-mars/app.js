const STORAGE_KEY = 'gc_tm_state';

const RESOURCES = [
  { id: 'mc',       label: 'MegaCredits', icon: '💰', color: '#c8a832', minProd: -5 },
  { id: 'steel',    label: 'Steel',       icon: '🔩', color: '#8b5e3c', minProd: 0  },
  { id: 'titanium', label: 'Titanium',    icon: '⬡',  color: '#6a8ca8', minProd: 0  },
  { id: 'plants',   label: 'Plants',      icon: '🌿', color: '#4a8c2e', minProd: 0  },
  { id: 'energy',   label: 'Energy',      icon: '⚡', color: '#8844cc', minProd: 0  },
  { id: 'heat',     label: 'Heat',        icon: '🔥', color: '#c85520', minProd: 0  },
];

let state = null;
let toastTimer = null;

// In-memory undo stack (not persisted — cleared on page reload)
const MAX_UNDO = 40;
let undoStack = [];

// ---- State helpers ----

function newState() {
  const resources = {};
  RESOURCES.forEach(r => { resources[r.id] = { production: 0, amount: 0 }; });
  return { generation: 1, tr: 20, resources, log: [] };
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

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Undo ----

function snapshot() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function undo() {
  if (undoStack.length === 0) { toast('Nothing to undo'); return; }
  state = JSON.parse(undoStack.pop());
  saveState();
  render();
  toast('Undone');
}

// ---- Log ----

function addLog(msg) {
  if (!Array.isArray(state.log)) state.log = [];
  state.log.push({ gen: state.generation, msg });
}

function openLog() {
  const list = document.getElementById('log-list');
  const entries = state.log || [];
  if (entries.length === 0) {
    list.innerHTML = '<p class="log-empty">No changes recorded yet.</p>';
  } else {
    // Newest first
    list.innerHTML = [...entries].reverse().map(e =>
      `<div class="log-entry">
        <span class="log-gen">Gen ${e.gen}</span>
        <span class="log-msg">${escHtml(e.msg)}</span>
      </div>`
    ).join('');
  }
  document.getElementById('log-modal').classList.remove('hidden');
}

function closeLog() {
  document.getElementById('log-modal').classList.add('hidden');
}

function clearLog() {
  if (!confirm('Clear the entire change log?')) return;
  state.log = [];
  saveState();
  closeLog();
}

// ---- Toast ----

function toast(msg, duration = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

// ---- Render ----

function render() {
  document.getElementById('gen-value').textContent = state.generation;
  document.getElementById('tr-value').textContent  = state.tr;
  renderResources();
}

function renderResources() {
  const grid = document.getElementById('resources-grid');
  grid.innerHTML = RESOURCES.map(r => {
    const res = state.resources[r.id];

    let actionBtn = '';
    if (r.id === 'plants') {
      const canBuy = res.amount >= 8;
      actionBtn = `<button class="action-btn" onclick="buyGreenery()" ${canBuy ? '' : 'disabled'}>
        🌱 Greenery &nbsp;−8 plants &nbsp;TR +1
      </button>`;
    } else if (r.id === 'heat') {
      const canRaise = res.amount >= 8;
      actionBtn = `<button class="action-btn" onclick="raiseTemperature()" ${canRaise ? '' : 'disabled'}>
        🌡 Raise Temp &nbsp;−8 heat &nbsp;TR +1
      </button>`;
    }

    return `
      <div class="resource-card" style="--res-color: ${r.color}">
        <div class="resource-header">
          <span class="resource-icon">${r.icon}</span>
          <span class="resource-name">${r.label}</span>
        </div>
        <div class="res-section">
          <span class="res-section-label">Production</span>
          <div class="res-controls">
            <button class="res-btn res-sm" onclick="adjustResource('${r.id}','production',-5)">−5</button>
            <button class="res-btn"        onclick="adjustResource('${r.id}','production',-1)">−</button>
            <span class="res-val res-val-prod">${res.production}</span>
            <button class="res-btn"        onclick="adjustResource('${r.id}','production',1)">+</button>
            <button class="res-btn res-sm" onclick="adjustResource('${r.id}','production',5)">+5</button>
          </div>
        </div>
        <div class="res-section">
          <span class="res-section-label">Amount</span>
          <div class="res-controls">
            <button class="res-btn res-sm" onclick="adjustResource('${r.id}','amount',-5)">−5</button>
            <button class="res-btn"        onclick="adjustResource('${r.id}','amount',-1)">−</button>
            <span class="res-val res-val-amt">${res.amount}</span>
            <button class="res-btn"        onclick="adjustResource('${r.id}','amount',1)">+</button>
            <button class="res-btn res-sm" onclick="adjustResource('${r.id}','amount',5)">+5</button>
          </div>
        </div>
        ${actionBtn}
      </div>`;
  }).join('');
}

// ---- Actions ----

function adjustGeneration(delta) {
  const prev = state.generation;
  snapshot();
  state.generation = clamp(state.generation + delta, 1, 99);
  if (state.generation !== prev) addLog(`Generation → ${state.generation}`);
  saveState();
  document.getElementById('gen-value').textContent = state.generation;
}

function adjustTR(delta) {
  const prev = state.tr;
  snapshot();
  state.tr = clamp(state.tr + delta, 0, 63);
  if (state.tr !== prev) addLog(`TR ${delta > 0 ? '+' : ''}${delta} → ${state.tr}`);
  saveState();
  document.getElementById('tr-value').textContent = state.tr;
}

function adjustResource(resourceId, field, delta) {
  const rDef = RESOURCES.find(r => r.id === resourceId);
  const res = state.resources[resourceId];
  const prev = res[field];
  snapshot();
  if (field === 'production') {
    res.production = clamp(res.production + delta, rDef.minProd, 99);
  } else {
    res.amount = clamp(res.amount + delta, 0, 9999);
  }
  const next = res[field];
  if (next !== prev) {
    const sign = (next - prev) > 0 ? '+' : '';
    addLog(`${rDef.label} ${field} ${sign}${next - prev} → ${next}`);
  }
  saveState();
  renderResources();
}

// TM production phase order:
//   1. Existing energy converts to heat
//   2. Gain MC = TR + MC production
//   3. Gain steel/titanium/plants from production
//   4. Energy resets to energy production
//   5. Gain heat from heat production
function endGeneration() {
  snapshot();
  const r = state.resources;
  r.heat.amount  += r.energy.amount;
  r.mc.amount    += state.tr + r.mc.production;
  r.steel.amount    += r.steel.production;
  r.titanium.amount += r.titanium.production;
  r.plants.amount   += r.plants.production;
  r.energy.amount    = r.energy.production;
  r.heat.amount     += r.heat.production;
  Object.values(r).forEach(res => { res.amount = Math.max(0, res.amount); });
  const gen = state.generation;
  state.generation += 1;
  addLog(`End Generation ${gen} — resources collected`);
  saveState();
  render();
  toast(`Gen ${gen} complete — resources collected!`);
}

// Place a greenery tile: costs 8 plants, raises TR by 1
function buyGreenery() {
  if (state.resources.plants.amount < 8) {
    toast('Need at least 8 plants');
    return;
  }
  snapshot();
  state.resources.plants.amount -= 8;
  state.tr = clamp(state.tr + 1, 0, 63);
  addLog(`Greenery placed — −8 Plants, TR → ${state.tr}`);
  saveState();
  render();
  toast('Greenery placed! TR +1 🌱');
}

// Raise temperature: costs 8 heat, raises TR by 1
function raiseTemperature() {
  if (state.resources.heat.amount < 8) {
    toast('Need at least 8 heat');
    return;
  }
  snapshot();
  state.resources.heat.amount -= 8;
  state.tr = clamp(state.tr + 1, 0, 63);
  addLog(`Temperature raised — −8 Heat, TR → ${state.tr}`);
  saveState();
  render();
  toast('Temperature raised! TR +1 🌡');
}

function newGame() {
  if (!confirm('Start a new game? All progress will be lost.')) return;
  clearState();
  undoStack = [];
  state = newState();
  saveState();
  render();
}

// ---- iOS install hint ----

function initIosHint() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const dismissed = localStorage.getItem('gc_tm_ios_hint');

  if (isStandalone) {
    localStorage.removeItem('gc_tm_ios_hint');
    return;
  }
  if (!isIos || dismissed) return;

  const hint = document.getElementById('ios-hint');
  hint.classList.remove('hidden');
  document.getElementById('ios-hint-close').addEventListener('click', () => {
    hint.classList.add('hidden');
    localStorage.setItem('gc_tm_ios_hint', '1');
  });
}

// ---- Fullscreen ----

const ICON_EXPAND   = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
const ICON_COMPRESS = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>`;

function initFullscreen() {
  const btn = document.getElementById('fullscreen-btn');
  if (!document.documentElement.requestFullscreen) {
    btn.style.display = 'none';
    return;
  }
  btn.innerHTML = ICON_EXPAND;
  btn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const full = !!document.fullscreenElement;
    btn.innerHTML = full ? ICON_COMPRESS : ICON_EXPAND;
    btn.setAttribute('aria-label', full ? 'Exit fullscreen' : 'Enter fullscreen');
  });
}

// ---- Init ----

function init() {
  // Stats actions
  document.getElementById('end-gen-btn').addEventListener('click', endGeneration);
  document.getElementById('undo-btn').addEventListener('click', undo);
  document.getElementById('new-game-btn').addEventListener('click', newGame);

  // Log modal
  document.getElementById('log-btn').addEventListener('click', openLog);
  document.getElementById('log-close').addEventListener('click', closeLog);
  document.getElementById('log-clear').addEventListener('click', clearLog);
  document.getElementById('log-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLog();  // click outside panel
  });

  initFullscreen();
  initIosHint();

  // Restore or start fresh
  state = loadState();
  if (!state || !state.resources) {
    state = newState();
    saveState();
  }
  if (!Array.isArray(state.log)) state.log = [];
  render();
}

document.addEventListener('DOMContentLoaded', init);

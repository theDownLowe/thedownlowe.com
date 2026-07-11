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

// ---- State ----

function newState(name) {
  const resources = {};
  RESOURCES.forEach(r => { resources[r.id] = { production: 0, amount: 0 }; });
  return { name: name || 'Player', generation: 1, tr: 20, resources };
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Toast ----

function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

// ---- Setup ----

function showSetup() {
  document.getElementById('setup-overlay').classList.remove('hidden');
  document.getElementById('main-game').classList.add('hidden');
  setTimeout(() => document.getElementById('player-name')?.focus(), 100);
}

function hideSetup() {
  document.getElementById('setup-overlay').classList.add('hidden');
  document.getElementById('main-game').classList.remove('hidden');
}

function startGame() {
  const name = document.getElementById('player-name')?.value.trim() || 'Player';
  state = newState(name);
  saveState();
  hideSetup();
  render();
}

// ---- Render ----

function render() {
  document.getElementById('gen-value').textContent = state.generation;
  document.getElementById('tr-value').textContent = state.tr;
  renderResources();
}

function renderResources() {
  const grid = document.getElementById('resources-grid');
  grid.innerHTML = RESOURCES.map(r => {
    const res = state.resources[r.id];
    return `
      <div class="resource-card" style="--res-color: ${r.color}">
        <div class="resource-header">
          <span class="resource-icon">${r.icon}</span>
          <span class="resource-name">${r.label}</span>
        </div>
        <div class="res-row">
          <span class="res-row-label">Production</span>
          <div class="res-controls">
            <button class="res-btn" onclick="adjustResource('${r.id}','production',-1)">−</button>
            <span class="res-val res-val-prod">${res.production}</span>
            <button class="res-btn" onclick="adjustResource('${r.id}','production',1)">+</button>
          </div>
        </div>
        <div class="res-row">
          <span class="res-row-label">Amount</span>
          <div class="res-controls">
            <button class="res-btn" onclick="adjustResource('${r.id}','amount',-1)">−</button>
            <span class="res-val res-val-amt">${res.amount}</span>
            <button class="res-btn" onclick="adjustResource('${r.id}','amount',1)">+</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ---- Actions ----

function adjustGeneration(delta) {
  state.generation = clamp(state.generation + delta, 1, 99);
  saveState();
  document.getElementById('gen-value').textContent = state.generation;
}

function adjustTR(delta) {
  state.tr = clamp(state.tr + delta, 0, 63);
  saveState();
  document.getElementById('tr-value').textContent = state.tr;
}

function adjustResource(resourceId, field, delta) {
  const rDef = RESOURCES.find(r => r.id === resourceId);
  const res = state.resources[resourceId];
  if (field === 'production') {
    res.production = clamp(res.production + delta, rDef.minProd, 99);
  } else {
    res.amount = clamp(res.amount + delta, 0, 9999);
  }
  saveState();
  renderResources();
}

// TM production phase order:
//   1. Existing energy → heat
//   2. Gain MC = TR + MC production
//   3. Gain steel, titanium, plants from their productions
//   4. Energy resets to energy production (not additive)
//   5. Gain heat from heat production
function endGeneration() {
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
  saveState();
  render();
  toast(`Gen ${gen} done — resources collected!`);
}

function newGame() {
  if (!confirm('Start a new game? All progress will be lost.')) return;
  clearState();
  showSetup();
}

// ---- Init ----

function init() {
  document.getElementById('start-game-btn').addEventListener('click', startGame);
  document.getElementById('player-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') startGame();
  });
  document.getElementById('end-gen-btn').addEventListener('click', endGeneration);
  document.getElementById('new-game-btn').addEventListener('click', newGame);

  state = loadState();
  if (state && state.resources) {
    hideSetup();
    render();
  } else {
    showSetup();
  }
}

document.addEventListener('DOMContentLoaded', init);

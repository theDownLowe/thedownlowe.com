const GAMES = [
  {
    id: 'terraforming-mars',
    name: 'Terraforming Mars',
    description: 'Track global parameters, resources, and production for 1–5 players across every generation.',
    players: '1–5 players',
    duration: '2–3 hours',
    icon: '🚀',
    color: '#c1440e',
    url: 'terraforming-mars/'
  }
];

function renderGames() {
  const grid = document.getElementById('game-grid');
  grid.innerHTML = GAMES.map(game => `
    <a class="game-card" href="${game.url}" style="--card-accent: ${game.color}">
      <div class="game-card-icon">${game.icon}</div>
      <div class="game-card-body">
        <h3 class="game-card-title">${game.name}</h3>
        <p class="game-card-desc">${game.description}</p>
        <div class="game-card-meta">
          <span class="meta-badge">${game.players}</span>
          <span class="meta-badge">${game.duration}</span>
        </div>
      </div>
      <div class="game-card-arrow">→</div>
    </a>
  `).join('');
}

renderGames();

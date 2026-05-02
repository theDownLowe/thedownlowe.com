const API      = "https://cafxsaev4i.execute-api.us-west-2.amazonaws.com/prod";
const OMDB_KEY = "fee9427d";
const OMDB_URL = "https://www.omdbapi.com/";

// ── OMDB Cache ────────────────────────────────────────────────────────────────
const CACHE_SEARCH_TTL = 1000 * 60 * 60 * 24;     // search results: 24 hours
const CACHE_DETAIL_TTL = 1000 * 60 * 60 * 24 * 7; // movie details:  7 days

function cacheSet(key, data, ttl) {
  try {
    localStorage.setItem("omdb_" + key, JSON.stringify({ data, expires: Date.now() + ttl }));
  } catch (e) {} // ignore if localStorage is full
}

function cacheGet(key) {
  try {
    const entry = JSON.parse(localStorage.getItem("omdb_" + key));
    if (entry && Date.now() < entry.expires) return entry.data;
    localStorage.removeItem("omdb_" + key);
  } catch (e) {}
  return null;
}

// ── Voter ID ──────────────────────────────────────────────────────────────────
function getVoterId() {
  let id = localStorage.getItem("downlowe_voter_id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("downlowe_voter_id", id); }
  return id;
}

// ── State ─────────────────────────────────────────────────────────────────────
let movies   = [];
let myVotes  = JSON.parse(localStorage.getItem("downlowe_votes") || "{}");
let sortMode = "score";
let selected = null; // the OMDB result the user picked from the dropdown
let searchTimer = null;

function saveVotes() { localStorage.setItem("downlowe_votes", JSON.stringify(myVotes)); }

// ── OMDB search ───────────────────────────────────────────────────────────────
async function searchOMDB(query) {
  const res  = await fetch(`${OMDB_URL}?s=${encodeURIComponent(query)}&type=movie&apikey=${OMDB_KEY}`);
  const data = await res.json();
  return data.Search || [];
}

async function fetchOMDBDetails(imdbId) {
  const res  = await fetch(`${OMDB_URL}?i=${imdbId}&apikey=${OMDB_KEY}`);
  return await res.json();
}

// ── Search input handler ──────────────────────────────────────────────────────
document.getElementById("movieInput").addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);

  if (selected) clearSelected(); // clear selection if user types again

  if (q.length < 2) { closeDropdown(); return; }

  showSearching();
  searchTimer = setTimeout(async () => {
    const results = await searchOMDB(q);
    renderDropdown(results);
  }, 350);
});

document.getElementById("movieInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { closeDropdown(); addMovie(); }
  if (e.key === "Escape") closeDropdown();
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) closeDropdown();
});

// ── Dropdown UI ───────────────────────────────────────────────────────────────
function showSearching() {
  const dd = document.getElementById("dropdown");
  dd.innerHTML = '<div class="dropdown-searching">Searching...</div>';
  dd.classList.add("open");
}

function renderDropdown(results) {
  const dd = document.getElementById("dropdown");
  if (!results.length) { dd.innerHTML = '<div class="dropdown-searching">No results found</div>'; return; }

  dd.innerHTML = results.slice(0, 6).map(r => `
    <div class="dropdown-item" onclick="selectMovie('${r.imdbID}', '${escHtml(r.Title)}')">
      <img src="${r.Poster !== "N/A" ? r.Poster : ""}" alt="" onerror="this.style.display='none'" />
      <div class="di-info">
        <div class="di-title">${escHtml(r.Title)}</div>
        <div class="di-year">${r.Year}</div>
      </div>
    </div>`).join("");
  dd.classList.add("open");
}

function closeDropdown() {
  const dd = document.getElementById("dropdown");
  dd.classList.remove("open");
  dd.innerHTML = "";
}

// ── Select a movie from dropdown ──────────────────────────────────────────────
async function selectMovie(imdbId, title) {
  closeDropdown();
  document.getElementById("movieInput").value = title;

  // Show a loading preview
  const preview = document.getElementById("preview");
  preview.innerHTML = `<div class="dropdown-searching">Loading details...</div>`;
  preview.classList.add("show");

  const details = await fetchOMDBDetails(imdbId);

  selected = {
    title:       details.Title,
    posterUrl:   details.Poster !== "N/A" ? details.Poster : null,
    year:        details.Year   !== "N/A" ? details.Year   : null,
    imdbRating:  details.imdbRating !== "N/A" ? details.imdbRating : null,
    runtime:     details.Runtime    !== "N/A" ? details.Runtime    : null,
    imdbId:      details.imdbID,
  };

  document.getElementById("movieInput").value = selected.title;

  const meta = [selected.year, selected.runtime, selected.imdbRating ? `★ ${selected.imdbRating}` : null]
    .filter(Boolean).join(" · ");

  preview.innerHTML = `
    ${selected.posterUrl ? `<img src="${selected.posterUrl}" alt="${escHtml(selected.title)}" />` : ""}
    <div class="preview-info">
      <div class="preview-title">${escHtml(selected.title)}</div>
      <div class="preview-meta">${meta}</div>
    </div>
    <button class="preview-clear" onclick="clearSelected()" title="Clear">✕</button>`;
}

function clearSelected() {
  selected = null;
  document.getElementById("movieInput").value = "";
  document.getElementById("preview").classList.remove("show");
  document.getElementById("preview").innerHTML = "";
  document.getElementById("movieInput").focus();
}

// ── Add movie ─────────────────────────────────────────────────────────────────
async function addMovie() {
  const titleInput = document.getElementById("movieInput");
  const nameInput  = document.getElementById("nameInput");
  const title      = selected ? selected.title : titleInput.value.trim();
  if (!title) return;

  const btn = document.getElementById("addBtn");
  btn.disabled = true;
  btn.textContent = "Adding...";

  const body = {
    title,
    addedBy:    nameInput.value.trim() || "anonymous",
    posterUrl:  selected?.posterUrl  || null,
    year:       selected?.year       || null,
    imdbRating: selected?.imdbRating || null,
    runtime:    selected?.runtime    || null,
    imdbId:     selected?.imdbId     || null,
  };

  try {
    const res   = await fetch(`${API}/movies`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const movie = await res.json();
    movies.push(movie);
    titleInput.value = "";
    nameInput.value  = "";
    clearSelected();
    render();
  } catch (e) {
    alert("Failed to add movie. Please try again.");
  } finally {
    btn.disabled    = false;
    btn.textContent = "+ Add";
  }
}

// ── Vote ──────────────────────────────────────────────────────────────────────
async function vote(movieId, direction) {
  const voterId = getVoterId();
  const movie   = movies.find(m => m.movieId === movieId);
  if (!movie) return;

  const prev = myVotes[movieId] || 0;
  if (prev === direction) {
    if (direction === 1) movie.upvotes--; else movie.downvotes--;
    myVotes[movieId] = 0;
  } else {
    if (prev === 1) movie.upvotes--;   if (prev === -1) movie.downvotes--;
    if (direction === 1) movie.upvotes++; else movie.downvotes++;
    myVotes[movieId] = direction;
  }
  saveVotes();
  render();

  try {
    await fetch(`${API}/vote`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ movieId, direction, voterId }),
    });
  } catch (e) { console.error("Vote failed:", e); }
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteMovie(movieId) {
  if (!confirm("Remove this movie?")) return;
  movies = movies.filter(m => m.movieId !== movieId);
  render();
  try {
    await fetch(`${API}/movies/${movieId}`, { method: "DELETE" });
  } catch (e) { console.error("Delete failed:", e); }
}

// ── Sort ──────────────────────────────────────────────────────────────────────
function setSort(mode, el) {
  sortMode = mode;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("sortLabel").textContent =
    mode === "score" ? "sorted by score" : "sorted by newest";
  render();
}

function sorted() {
  const list = [...movies];
  return sortMode === "score"
    ? list.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))
    : list.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const list  = document.getElementById("movieList");
  const items = sorted();

  if (!items.length) {
    list.innerHTML = '<div class="empty">No movies yet — be the first to suggest one!</div>';
    return;
  }

  list.innerHTML = items.map((m, i) => {
    const s      = m.upvotes - m.downvotes;
    const cls    = s > 0 ? "pos" : s < 0 ? "neg" : "zero";
    const myVote = myVotes[m.movieId] || 0;
    const title  = (m.title || "").length > 50 ? m.title.slice(0, 50) + "…" : m.title;
    const adder  = (m.addedBy || "anonymous").split("@")[0];

    const poster = m.posterUrl
      ? `<img class="poster" src="${m.posterUrl}" alt="${escHtml(m.title)}" loading="lazy" />`
      : `<div class="poster-placeholder">🎬</div>`;

    const metaParts = [
      m.year,
      m.runtime,
      m.imdbRating ? `<span class="imdb-badge">★ ${m.imdbRating}</span>` : null,
      `added by ${escHtml(adder)}`,
    ].filter(Boolean).join(" · ");

    return `
      <div class="movie-card">
        <span class="rank">${i + 1}</span>
        ${poster}
        <div class="movie-info">
          <div class="movie-title">${escHtml(title)}</div>
          <div class="movie-meta">${metaParts}</div>
        </div>
        <div class="vote-area">
          <button class="vote-btn up ${myVote === 1 ? "active" : ""}"
            onclick="vote('${m.movieId}', 1)" title="Thumbs up">▲</button>
          <span class="score ${cls}">${s > 0 ? "+" : ""}${s}</span>
          <button class="vote-btn down ${myVote === -1 ? "active" : ""}"
            onclick="vote('${m.movieId}', -1)" title="Thumbs down">▼</button>
          <button class="delete-btn" onclick="deleteMovie('${m.movieId}')" title="Remove">✕</button>
        </div>
      </div>`;
  }).join("");
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadMovies() {
  try {
    const res = await fetch(`${API}/movies`);
    movies = await res.json();
    render();
  } catch (e) {
    document.getElementById("movieList").innerHTML =
      '<div class="empty">Could not load movies. Try refreshing.</div>';
  }
}

function escHtml(str = "") {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

loadMovies();
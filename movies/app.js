const API = "https://cafxsaev4i.execute-api.us-west-2.amazonaws.com/prod";

// ── Voter ID ──────────────────────────────────────────────────────────────────
// A random UUID stored in localStorage — identifies this browser for voting.
function getVoterId() {
  let id = localStorage.getItem("downlowe_voter_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("downlowe_voter_id", id);
  }
  return id;
}

// ── State ─────────────────────────────────────────────────────────────────────
let movies   = [];
let myVotes  = JSON.parse(localStorage.getItem("downlowe_votes") || "{}");
let sortMode = "score";

function saveVotes() {
  localStorage.setItem("downlowe_votes", JSON.stringify(myVotes));
}

// ── Fetch movies from API ─────────────────────────────────────────────────────
async function loadMovies() {
  try {
    const res  = await fetch(`${API}/movies`);
    const data = await res.json();
    movies = data;
    render();
  } catch (e) {
    document.getElementById("movieList").innerHTML =
      '<div class="empty">Could not load movies. Try refreshing.</div>';
  }
}

// ── Add a movie ───────────────────────────────────────────────────────────────
async function addMovie() {
  const titleInput = document.getElementById("movieInput");
  const nameInput  = document.getElementById("nameInput");
  const title      = titleInput.value.trim();
  if (!title) return;

  const btn = document.getElementById("addBtn");
  btn.disabled = true;
  btn.textContent = "Adding...";

  try {
    const res = await fetch(`${API}/movies`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ title, addedBy: nameInput.value.trim() || "anonymous" }),
    });
    const movie = await res.json();
    movies.push(movie);
    titleInput.value = "";
    render();
  } catch (e) {
    alert("Failed to add movie. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Add";
  }
}

// ── Vote ──────────────────────────────────────────────────────────────────────
async function vote(movieId, direction) {
  const voterId = getVoterId();
  const prev    = myVotes[movieId] || 0;

  // Optimistic UI update
  const movie = movies.find(m => m.movieId === movieId);
  if (!movie) return;

  if (prev === direction) {
    // Toggle off
    if (direction === 1) movie.upvotes--; else movie.downvotes--;
    myVotes[movieId] = 0;
  } else {
    if (prev === 1)  movie.upvotes--;
    if (prev === -1) movie.downvotes--;
    if (direction === 1) movie.upvotes++; else movie.downvotes++;
    myVotes[movieId] = direction;
  }
  saveVotes();
  render();

  // Send to API
  try {
    await fetch(`${API}/vote`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ movieId, direction, voterId }),
    });
  } catch (e) {
    // Silently fail — optimistic update already showed the change.
    console.error("Vote failed:", e);
  }
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
  if (sortMode === "score") {
    list.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
  } else {
    list.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  }
  return list;
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const list = document.getElementById("movieList");
  const items = sorted();

  if (!items.length) {
    list.innerHTML = '<div class="empty">No movies yet — be the first to suggest one!</div>';
    return;
  }

  list.innerHTML = items.map((m, i) => {
    const s       = m.upvotes - m.downvotes;
    const cls     = s > 0 ? "pos" : s < 0 ? "neg" : "zero";
    const myVote  = myVotes[m.movieId] || 0;
    const title   = m.title.length > 50 ? m.title.slice(0, 50) + "…" : m.title;
    const adder   = (m.addedBy || "anonymous").split("@")[0];

    return `
      <div class="movie-card">
        <span class="rank">${i + 1}</span>
        <div class="movie-info">
          <div class="movie-title">${escHtml(title)}</div>
          <div class="movie-meta">added by ${escHtml(adder)}</div>
        </div>
        <div class="vote-area">
          <button class="vote-btn up ${myVote === 1 ? "active" : ""}"
            onclick="vote('${m.movieId}', 1)" title="Thumbs up">▲</button>
          <span class="score ${cls}">${s > 0 ? "+" : ""}${s}</span>
          <button class="vote-btn down ${myVote === -1 ? "active" : ""}"
            onclick="vote('${m.movieId}', -1)" title="Thumbs down">▼</button>
        </div>
      </div>`;
  }).join("");
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.getElementById("movieInput").addEventListener("keydown", e => {
  if (e.key === "Enter") addMovie();
});

loadMovies();
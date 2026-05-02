const API      = "https://pujum14h27.execute-api.us-west-2.amazonaws.com";
const OMDB_KEY = "fee9427d";
const OMDB_URL = "https://www.omdbapi.com/";

// ── OMDB Cache ────────────────────────────────────────────────────────────────
const CACHE_SEARCH_TTL = 1000 * 60 * 60 * 24;
const CACHE_DETAIL_TTL = 1000 * 60 * 60 * 24 * 7;

function cacheSet(key, data, ttl) {
  try { localStorage.setItem("omdb_" + key, JSON.stringify({ data, expires: Date.now() + ttl })); } catch (e) {}
}
function cacheGet(key) {
  try {
    const entry = JSON.parse(localStorage.getItem("omdb_" + key));
    if (entry && Date.now() < entry.expires) return entry.data;
    localStorage.removeItem("omdb_" + key);
  } catch (e) {}
  return null;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
let auth = JSON.parse(localStorage.getItem("downlowe_auth") || "null");
function saveAuth(data) { auth = data; localStorage.setItem("downlowe_auth", JSON.stringify(data)); }
function clearAuth()    { auth = null; localStorage.removeItem("downlowe_auth"); }
function jsonHeaders() {
  const h = { "Content-Type": "application/json" };
  if (auth) h["Authorization"] = `Bearer ${auth.token}`;
  return h;
}

// ── State ─────────────────────────────────────────────────────────────────────
let movies        = [];
let queueIds      = [];      // ordered movieIds in the queue
let activeTab     = "rankings";
let sortMode      = "score";
let selected      = null;
let searchTimer   = null;
let authModalMode = "login";
let dragSrcId     = null;    // movieId being dragged

const pendingDeletes = new Set();
const pendingVotes   = new Map();
const pendingSeen    = new Set();
const pendingQueue   = new Set();
const expandedCards  = new Set();
const cardComments   = {};
const editingComment = {};

// ── OMDB ──────────────────────────────────────────────────────────────────────
async function searchOMDB(query) {
  const key    = "search_" + query.toLowerCase();
  const cached = cacheGet(key);
  if (cached) return cached;
  const res     = await fetch(`${OMDB_URL}?s=${encodeURIComponent(query)}&type=movie&apikey=${OMDB_KEY}`);
  const data    = await res.json();
  const results = data.Search || [];
  if (results.length) cacheSet(key, results, CACHE_SEARCH_TTL);
  return results;
}

async function fetchOMDBDetails(imdbId) {
  const key    = "detail_" + imdbId;
  const cached = cacheGet(key);
  if (cached) return cached;
  const res     = await fetch(`${OMDB_URL}?i=${imdbId}&apikey=${OMDB_KEY}`);
  const details = await res.json();
  cacheSet(key, details, CACHE_DETAIL_TTL);
  return details;
}

// ── Search input ──────────────────────────────────────────────────────────────
document.getElementById("movieInput").addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (selected) clearSelected();
  if (q.length < 2) { closeDropdown(); return; }
  showSearching();
  searchTimer = setTimeout(async () => renderDropdown(await searchOMDB(q)), 350);
});
document.getElementById("movieInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter")  { closeDropdown(); addMovie(); }
  if (e.key === "Escape") closeDropdown();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) closeDropdown();
  const path      = e.composedPath();
  const inModal   = path.some(el => el.classList?.contains("auth-modal"));
  const inAuthBtn = path.some(el => el.classList?.contains("auth-btn"));
  if (!inModal && !inAuthBtn) closeAuthModal();
});

// ── Dropdown ──────────────────────────────────────────────────────────────────
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
async function selectMovie(imdbId, title) {
  closeDropdown();
  document.getElementById("movieInput").value = title;
  const preview = document.getElementById("preview");
  preview.innerHTML = `<div class="dropdown-searching">Loading details...</div>`;
  preview.classList.add("show");
  const details = await fetchOMDBDetails(imdbId);
  selected = {
    title:      details.Title,
    posterUrl:  details.Poster     !== "N/A" ? details.Poster     : null,
    year:       details.Year       !== "N/A" ? details.Year       : null,
    imdbRating: details.imdbRating !== "N/A" ? details.imdbRating : null,
    runtime:    details.Runtime    !== "N/A" ? details.Runtime    : null,
    imdbId:     details.imdbID,
  };
  document.getElementById("movieInput").value = selected.title;
  const meta = [selected.year, selected.runtime, selected.imdbRating ? `★ ${selected.imdbRating}` : null].filter(Boolean).join(" · ");
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

// ── Auth modal ────────────────────────────────────────────────────────────────
function openAuthModal(mode = "login") {
  document.getElementById("authModal").classList.add("open");
  setAuthMode(mode);
}
function closeAuthModal() {
  const modal = document.getElementById("authModal");
  if (!modal.classList.contains("open")) return;
  modal.classList.remove("open");
  document.getElementById("authError").textContent = "";
}
function setAuthMode(mode) {
  authModalMode = mode;
  const isRegister = mode === "register";
  document.getElementById("authModalTitle").textContent     = isRegister ? "Create account" : "Sign in";
  document.getElementById("authSubmitBtn").textContent      = isRegister ? "Create account" : "Sign in";
  document.getElementById("authWarning").style.display      = isRegister ? "block" : "none";
  document.getElementById("toggleToRegister").style.display = isRegister ? "none"  : "block";
  document.getElementById("toggleToLogin").style.display    = isRegister ? "block" : "none";
  document.getElementById("authError").textContent          = "";
}
async function submitAuth() {
  const username = document.getElementById("authUsername").value.trim().toLowerCase();
  const password = document.getElementById("authPassword").value;
  const errorEl  = document.getElementById("authError");
  if (!username || !password) { errorEl.textContent = "Please fill in all fields."; return; }
  const btn = document.getElementById("authSubmitBtn");
  btn.disabled    = true;
  btn.textContent = authModalMode === "login" ? "Signing in..." : "Creating account...";
  try {
    const endpoint = authModalMode === "login" ? "login" : "register";
    const res  = await fetch(`${API}/auth/${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || "Something went wrong."; return; }
    saveAuth({ username: data.username, token: data.token });
    document.getElementById("authUsername").value = "";
    document.getElementById("authPassword").value = "";
    closeAuthModal();
    updateAuthUI();
    render();
  } catch (e) {
    errorEl.textContent = "Connection error. Please try again.";
  } finally {
    btn.disabled    = false;
    btn.textContent = authModalMode === "login" ? "Sign in" : "Create account";
  }
}
function logout() { clearAuth(); updateAuthUI(); render(); }
function updateAuthUI() {
  const btn     = document.getElementById("authBtn");
  const section = document.getElementById("suggestSection");
  if (auth) {
    btn.textContent = `${auth.username} · sign out`;
    btn.classList.add("logged-in");
    section.classList.remove("locked");
  } else {
    btn.textContent = "Sign in";
    btn.classList.remove("logged-in");
    section.classList.add("locked");
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.getElementById("tab-rankings").classList.toggle("active", tab === "rankings");
  document.getElementById("tab-queue").classList.toggle("active", tab === "queue");
  document.getElementById("rankingsControls").style.display = tab === "rankings" ? "" : "none";
  document.getElementById("queueControls").style.display    = tab === "queue"    ? "" : "none";
  render();
}

// ── Add movie ─────────────────────────────────────────────────────────────────
async function addMovie() {
  if (!auth) { openAuthModal(); return; }
  const titleInput = document.getElementById("movieInput");
  const title      = selected ? selected.title : titleInput.value.trim();
  if (!title) return;

  const isDuplicate = movies.some(m => m.title.toLowerCase() === title.toLowerCase());
  if (isDuplicate) { alert(`"${title}" is already on the list!`); return; }

  const btn = document.getElementById("addBtn");
  btn.disabled = true; btn.textContent = "Adding...";
  const body = {
    title,
    posterUrl:  selected?.posterUrl  || null,
    year:       selected?.year       || null,
    imdbRating: selected?.imdbRating || null,
    runtime:    selected?.runtime    || null,
    imdbId:     selected?.imdbId     || null,
  };
  try {
    const res   = await fetch(`${API}/movies`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) });
    const movie = await res.json();
    movies.push(movie);
    titleInput.value = "";
    clearSelected();
    render();
  } catch (e) { alert("Failed to add movie. Please try again."); }
  finally     { btn.disabled = false; btn.textContent = "+ Add"; }
}

// ── Vote ──────────────────────────────────────────────────────────────────────
async function vote(movieId, direction) {
  if (!auth) { openAuthModal(); return; }
  const movie    = movies.find(m => m.movieId === movieId);
  if (!movie) return;
  const username = auth.username;
  const wasUp    = (movie.upvoters   || []).includes(username);
  const wasDown  = (movie.downvoters || []).includes(username);
  if (wasUp)   { movie.upvotes--;   movie.upvoters   = movie.upvoters.filter(u => u !== username); }
  if (wasDown) { movie.downvotes--; movie.downvoters = movie.downvoters.filter(u => u !== username); }
  const toggling = (wasUp && direction === 1) || (wasDown && direction === -1);
  if (!toggling) {
    if (direction ===  1) { movie.upvotes++;   movie.upvoters   = [...(movie.upvoters   || []), username]; }
    if (direction === -1) { movie.downvotes++; movie.downvoters = [...(movie.downvoters || []), username]; }
  }
  pendingVotes.set(movieId, direction);
  render();
  try {
    await fetch(`${API}/vote`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ movieId, direction }) });
  } catch (e) { console.error("Vote failed:", e); }
  finally     { pendingVotes.delete(movieId); }
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteMovie(movieId) {
  if (!auth) { openAuthModal(); return; }
  if (!confirm("Remove this movie?")) return;
  pendingDeletes.add(movieId);
  movies   = movies.filter(m => m.movieId !== movieId);
  queueIds = queueIds.filter(id => id !== movieId);
  render();
  try {
    await fetch(`${API}/movies/${movieId}`, { method: "DELETE", headers: jsonHeaders() });
  } catch (e) { console.error("Delete failed:", e); }
  finally   { pendingDeletes.delete(movieId); }
}

// ── Seen ──────────────────────────────────────────────────────────────────────
async function toggleSeen(movieId) {
  if (!auth) { openAuthModal(); return; }
  const movie    = movies.find(m => m.movieId === movieId);
  if (!movie) return;
  const username = auth.username;
  const seen     = (movie.seenBy || []).includes(username);
  movie.seenBy   = seen
    ? (movie.seenBy || []).filter(u => u !== username)
    : [...(movie.seenBy || []), username];
  pendingSeen.add(movieId);
  render();
  try {
    await fetch(`${API}/seen`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ movieId }) });
  } catch (e) { console.error("Seen toggle failed:", e); }
  finally   { pendingSeen.delete(movieId); }
}

// ── Queue actions ─────────────────────────────────────────────────────────────
async function addToQueue(movieId) {
  if (!auth) { openAuthModal(); return; }
  if (queueIds.includes(movieId)) return;
  queueIds = [...queueIds, movieId];
  pendingQueue.add(movieId);
  render();
  try {
    await fetch(`${API}/queue`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ movieId }) });
  } catch (e) { console.error("Add to queue failed:", e); queueIds = queueIds.filter(id => id !== movieId); render(); }
  finally   { pendingQueue.delete(movieId); }
}

async function removeFromQueue(movieId) {
  if (!auth) { openAuthModal(); return; }
  queueIds = queueIds.filter(id => id !== movieId);
  pendingQueue.add(movieId);
  render();
  try {
    await fetch(`${API}/queue/${movieId}`, { method: "DELETE", headers: jsonHeaders() });
  } catch (e) { console.error("Remove from queue failed:", e); }
  finally   { pendingQueue.delete(movieId); }
}

// ── Drag and drop ─────────────────────────────────────────────────────────────
function onDragStart(e, movieId) {
  dragSrcId = movieId;
  e.dataTransfer.effectAllowed = "move";
  setTimeout(() => {
    const el = document.querySelector(`.queue-card-wrapper[data-id="${movieId}"]`);
    if (el) el.classList.add("dragging");
  }, 0);
}

function onDragOver(e, movieId) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".queue-card-wrapper.drag-over").forEach(el => el.classList.remove("drag-over"));
  if (movieId !== dragSrcId) {
    const el = document.querySelector(`.queue-card-wrapper[data-id="${movieId}"]`);
    if (el) el.classList.add("drag-over");
  }
}

function onDragEnd() {
  dragSrcId = null;
  document.querySelectorAll(".queue-card-wrapper.dragging, .queue-card-wrapper.drag-over")
    .forEach(el => el.classList.remove("dragging", "drag-over"));
}

async function onDrop(e, targetId) {
  e.preventDefault();
  if (!dragSrcId || dragSrcId === targetId) return;
  const srcIdx = queueIds.indexOf(dragSrcId);
  const tgtIdx = queueIds.indexOf(targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;
  const newOrder = [...queueIds];
  newOrder.splice(srcIdx, 1);
  newOrder.splice(tgtIdx, 0, dragSrcId);
  queueIds = newOrder;
  render();
  try {
    await fetch(`${API}/queue`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ movieIds: queueIds }) });
  } catch (e) { console.error("Reorder failed:", e); }
}

// ── Comments ──────────────────────────────────────────────────────────────────
async function toggleComments(movieId) {
  if (expandedCards.has(movieId)) { expandedCards.delete(movieId); render(); return; }
  expandedCards.add(movieId);
  render();
  if (!cardComments[movieId]) await fetchComments(movieId);
  else renderCommentsSection(movieId);
}
async function fetchComments(movieId) {
  try {
    const res = await fetch(`${API}/comments/${movieId}`);
    cardComments[movieId] = await res.json();
    renderCommentsSection(movieId);
  } catch (e) { console.error("Failed to load comments:", e); }
}
function renderCommentsSection(movieId) {
  const section = document.getElementById(`comments-section-${movieId}`);
  if (!section) return;
  const comments = cardComments[movieId];
  if (!comments) { section.innerHTML = '<div class="comments-loading">Loading...</div>'; return; }
  const items = comments.map(c => {
    const isOwn     = auth?.username === c.username;
    const isEditing = editingComment[c.commentId];
    if (isEditing) {
      return `<div class="comment-item editing">
        <span class="comment-username">${escHtml(c.username)}</span>
        <textarea id="edit-input-${c.commentId}" class="comment-edit-input">${escHtml(c.text)}</textarea>
        <div class="comment-edit-btns">
          <button class="comment-action-btn save" onclick="saveEditComment('${movieId}','${c.commentId}')">Save</button>
          <button class="comment-action-btn" onclick="cancelEdit('${c.commentId}','${movieId}')">Cancel</button>
        </div>
      </div>`;
    }
    return `<div class="comment-item">
      <div class="comment-header">
        <span class="comment-username">${escHtml(c.username)}</span>
        <span class="comment-time">${timeAgo(c.createdAt)}${c.editedAt ? " · edited" : ""}</span>
        ${isOwn ? `<div class="comment-actions">
          <button class="comment-action-btn" onclick="startEdit('${c.commentId}','${movieId}')">edit</button>
          <button class="comment-action-btn danger" onclick="deleteComment('${movieId}','${c.commentId}')">delete</button>
        </div>` : ""}
      </div>
      <div class="comment-text">${escHtml(c.text)}</div>
    </div>`;
  }).join("");
  const addForm = auth
    ? `<div class="add-comment-row">
        <textarea id="comment-input-${movieId}" class="comment-input" placeholder="Add a comment..." rows="2"></textarea>
        <button id="comment-submit-${movieId}" class="comment-submit-btn" onclick="addComment('${movieId}')">Post</button>
       </div>`
    : `<p class="comments-login-prompt"><a href="#" onclick="openAuthModal(); return false;">Sign in</a> to comment</p>`;
  section.innerHTML = `
    <div class="comments-list">${items || '<div class="no-comments">No comments yet — be the first!</div>'}</div>
    ${addForm}`;
}
async function addComment(movieId) {
  if (!auth) { openAuthModal(); return; }
  const input = document.getElementById(`comment-input-${movieId}`);
  const text  = input?.value?.trim();
  if (!text) return;
  const btn = document.getElementById(`comment-submit-${movieId}`);
  if (btn) { btn.disabled = true; btn.textContent = "Posting..."; }
  try {
    const res     = await fetch(`${API}/comments/${movieId}`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ text }) });
    const comment = await res.json();
    cardComments[movieId] = [...(cardComments[movieId] || []), comment];
    input.value = "";
    renderCommentsSection(movieId);
    refreshCommentCount(movieId);
  } catch (e) { alert("Failed to post comment."); }
  finally    { if (btn) { btn.disabled = false; btn.textContent = "Post"; } }
}
function startEdit(commentId, movieId) { editingComment[commentId] = true; renderCommentsSection(movieId); }
function cancelEdit(commentId, movieId) { delete editingComment[commentId]; renderCommentsSection(movieId); }
async function saveEditComment(movieId, commentId) {
  const input = document.getElementById(`edit-input-${commentId}`);
  const text  = input?.value?.trim();
  if (!text) return;
  try {
    const res     = await fetch(`${API}/comments/${movieId}/${commentId}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ text }) });
    const updated = await res.json();
    cardComments[movieId] = cardComments[movieId].map(c => c.commentId === commentId ? updated : c);
    delete editingComment[commentId];
    renderCommentsSection(movieId);
  } catch (e) { alert("Failed to save edit."); }
}
async function deleteComment(movieId, commentId) {
  if (!confirm("Delete this comment?")) return;
  try {
    await fetch(`${API}/comments/${movieId}/${commentId}`, { method: "DELETE", headers: jsonHeaders() });
    cardComments[movieId] = cardComments[movieId].filter(c => c.commentId !== commentId);
    renderCommentsSection(movieId);
    refreshCommentCount(movieId);
  } catch (e) { alert("Failed to delete comment."); }
}
function refreshCommentCount(movieId) {
  document.querySelectorAll(`[id="comment-count-${movieId}"]`).forEach(el => {
    if (cardComments[movieId]) el.textContent = cardComments[movieId].length;
  });
}

// ── Time ago ──────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso);
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Sort ──────────────────────────────────────────────────────────────────────
function setSort(mode, el) {
  sortMode = mode;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("sortLabel").textContent = mode === "score" ? "sorted by score" : "sorted by newest";
  render();
}
function sorted() {
  const list = [...movies];
  return sortMode === "score"
    ? list.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))
    : list.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
}

// ── Card HTML builder ─────────────────────────────────────────────────────────
function buildCard(m, rank, mode) {
  const s        = m.upvotes - m.downvotes;
  const cls      = s > 0 ? "pos" : s < 0 ? "neg" : "zero";
  const title    = (m.title || "").length > 50 ? m.title.slice(0, 50) + "…" : m.title;
  const hasImdb  = !!m.imdbId;
  const username = auth?.username;

  const hasVotedUp   = !!username && (m.upvoters   || []).includes(username);
  const hasVotedDown = !!username && (m.downvoters  || []).includes(username);
  const hasSeen      = !!username && (m.seenBy      || []).includes(username);
  const inQueue      = queueIds.includes(m.movieId);

  const poster = m.posterUrl
    ? `<img class="poster" src="${m.posterUrl}" alt="${escHtml(m.title)}" loading="lazy" />`
    : `<div class="poster-placeholder">🎬</div>`;

  const titleEl = hasImdb
    ? `<a class="movie-title imdb-link" href="https://www.imdb.com/title/${m.imdbId}/" target="_blank" rel="noopener">${escHtml(title)}</a>`
    : `<div class="movie-title">${escHtml(title)}</div>`;

  const metaParts = [m.year, m.runtime, m.imdbRating ? `<span class="imdb-badge">★ ${m.imdbRating}</span>` : null, `by ${escHtml(m.addedBy || "?")}`].filter(Boolean).join(" · ");

  const upNames   = (m.upvoters   || []).map(u => u === username ? "you" : u);
  const downNames = (m.downvoters || []).map(u => u === username ? "you" : u);
  const voterRow  = (upNames.length || downNames.length) ? `
    <div class="voter-row">
      ${upNames.length   ? `<span class="voter-names up">▲ ${upNames.join(", ")}</span>`   : ""}
      ${downNames.length ? `<span class="voter-names down">▼ ${downNames.join(", ")}</span>` : ""}
    </div>` : "";

  const seenNames = (m.seenBy || []).map(u => u === username ? "you" : u);
  const seenNamesRow = seenNames.length ? `<div class="seen-names-row"><span class="seen-names">seen by ${seenNames.join(", ")}</span></div>` : "";

  const count    = cardComments[m.movieId]?.length;
  const countStr = count !== undefined ? `${count} ` : "";
  const expanded = expandedCards.has(m.movieId);
  const commentsToggle = `
    <button class="comments-toggle-btn" onclick="toggleComments('${m.movieId}')">
      💬 <span id="comment-count-${m.movieId}">${countStr}</span>comment${count !== 1 ? "s" : ""} ${expanded ? "▲" : "▼"}
    </button>`;
  const commentsSection = expanded
    ? `<div class="comments-section" id="comments-section-${m.movieId}"><div class="comments-loading">Loading...</div></div>`
    : "";

  // Queue side button
  const queueBtn = mode === "queue"
    ? `<button class="queue-side-btn remove" onclick="removeFromQueue('${m.movieId}')" title="Remove from Queue">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" y1="3.5" x2="10" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="1" y1="7.5" x2="10" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="1" y1="11.5" x2="6"  y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="9"  y1="11.5" x2="14" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>`
    : `<button class="queue-side-btn${inQueue ? " in-queue" : ""}" onclick="${inQueue ? `removeFromQueue` : `addToQueue`}('${m.movieId}')" title="${inQueue ? "Remove from Queue" : "Add to Queue"}">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" y1="3.5" x2="10" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="1" y1="7.5" x2="10" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="1" y1="11.5" x2="6"  y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          ${inQueue ? "" : `<line x1="12" y1="9.5" x2="12" y2="13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="10" y1="11.5" x2="14" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`}
        </svg>
      </button>`;

  // Drag handle (queue mode only)
  const dragHandle = mode === "queue"
    ? `<div class="drag-handle" title="Drag to reorder">
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="3" cy="3"  r="1.5"/><circle cx="7" cy="3"  r="1.5"/>
          <circle cx="3" cy="8"  r="1.5"/><circle cx="7" cy="8"  r="1.5"/>
          <circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/>
        </svg>
      </div>` : "";

  const cardInner = `
    ${mode === "queue" ? "" : `<button class="delete-btn-corner" onclick="deleteMovie('${m.movieId}')" title="Remove">✕</button>`}
    <div class="card-main">
      <span class="rank">${rank}</span>
      ${poster}
      <div class="movie-info">
        ${titleEl}
        <div class="movie-meta">${metaParts}</div>
      </div>
      <div class="vote-area">
        <button class="vote-btn up${hasVotedUp ? " active" : ""}" onclick="vote('${m.movieId}', 1)" title="Thumbs up">▲</button>
        <span class="score ${cls}">${s > 0 ? "+" : ""}${s}</span>
        <button class="vote-btn down${hasVotedDown ? " active" : ""}" onclick="vote('${m.movieId}', -1)" title="Thumbs down">▼</button>
        <button class="vote-btn seen-vote-btn${hasSeen ? " active" : ""}" onclick="toggleSeen('${m.movieId}')" title="${hasSeen ? "Unmark as seen" : "Mark as seen"}">👁</button>
      </div>
    </div>
    <div class="card-footer">
      ${voterRow}
      ${seenNamesRow}
      <div class="comments-toggle-row">${commentsToggle}</div>
    </div>
    ${commentsSection}`;

  if (mode === "queue") {
    return `<div class="queue-card-wrapper" data-id="${m.movieId}"
        draggable="true"
        ondragstart="onDragStart(event,'${m.movieId}')"
        ondragover="onDragOver(event,'${m.movieId}')"
        ondrop="onDrop(event,'${m.movieId}')"
        ondragend="onDragEnd()">
      ${dragHandle}
      <div class="movie-card${hasImdb ? " has-imdb" : ""}">
        <div class="card-content">${cardInner}</div>
        ${queueBtn}
      </div>
    </div>`;
  }

  return `<div class="movie-card${hasImdb ? " has-imdb" : ""}">
    <div class="card-content">${cardInner}</div>
    ${queueBtn}
  </div>`;
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  updateAuthUI();
  if (activeTab === "rankings") renderRankings();
  else renderQueue();
}

function renderRankings() {
  const list  = document.getElementById("movieList");
  const items = sorted();
  if (!items.length) {
    list.innerHTML = '<div class="empty">No movies yet — sign in and suggest one!</div>';
    return;
  }
  list.innerHTML = items.map((m, i) => buildCard(m, i + 1, "rankings")).join("");
  reattachComments();
}

function renderQueue() {
  const list = document.getElementById("movieList");
  if (!queueIds.length) {
    list.innerHTML = '<div class="empty">The queue is empty — add movies from the Rankings tab!</div>';
    return;
  }
  const queueMovies = queueIds.map(id => movies.find(m => m.movieId === id)).filter(Boolean);
  if (!queueMovies.length) {
    list.innerHTML = '<div class="empty">No movies found — they may have been deleted.</div>';
    return;
  }
  list.innerHTML = queueMovies.map((m, i) => buildCard(m, i + 1, "queue")).join("");
  reattachComments();
}

function reattachComments() {
  expandedCards.forEach(movieId => {
    if (cardComments[movieId] !== undefined) renderCommentsSection(movieId);
    else fetchComments(movieId);
  });
}

// ── Load & Poll ───────────────────────────────────────────────────────────────
async function loadMovies() {
  try {
    const res = await fetch(`${API}/movies`);
    let data  = await res.json();
    data = data.filter(m => !pendingDeletes.has(m.movieId));
    data = data.map(m => {
      if (pendingVotes.has(m.movieId) || pendingSeen.has(m.movieId))
        return movies.find(l => l.movieId === m.movieId) || m;
      return m;
    });
    if (JSON.stringify(data) !== JSON.stringify(movies)) { movies = data; render(); }
  } catch (e) {
    document.getElementById("movieList").innerHTML = '<div class="empty">Could not load movies. Try refreshing.</div>';
  }
}

async function loadQueue() {
  try {
    const res  = await fetch(`${API}/queue`);
    const data = await res.json();
    const ids  = data.movieIds || [];
    // Don't overwrite queue if we have pending operations
    const hasPending = [...pendingQueue].length > 0;
    if (!hasPending && JSON.stringify(ids) !== JSON.stringify(queueIds)) {
      queueIds = ids;
      render();
    }
  } catch (e) { console.error("Failed to load queue:", e); }
}

async function loadAll() {
  await Promise.all([loadMovies(), loadQueue()]);
}

function startPolling() {
  let interval = setInterval(loadAll, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clearInterval(interval); }
    else { loadAll(); interval = setInterval(loadAll, 5000); }
  });
}

function escHtml(str = "") {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

// ── Init ──────────────────────────────────────────────────────────────────────
updateAuthUI();
loadAll().then(startPolling);
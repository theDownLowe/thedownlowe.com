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
let movies             = [];
let queueIds           = [];
let watchedIds         = [];
let lists              = [];   // array of list objects
let listOrder          = [];   // ordered listIds
let activeTab          = "rankings";
const nowWatching      = new Set();
let sortMode           = "score";
let selected           = null;
let searchTimer        = null;
let authModalMode      = "login";
let openDropdownMovieId = null;  // which movie has its list-dropdown open
let createListForMovieId = null; // movieId that triggered create modal
let editingListId      = null;   // listId being edited inline
let dragSrcId          = null;   // queue drag
let dragListSrcId      = null;   // list-panel drag
let dragListMovieSrcId = null;   // movie-within-list drag
let currentDragListId  = null;   // which list the movie drag is in
let rankingsPage = 1;
const PAGE_SIZE  = 20;
let chatMessages      = [];
let olderMessages     = [];   // pages loaded via "Load earlier"
let chatHasMore       = false; // server has messages older than current view
let chatReachedStart  = false; // no more pages to load
let chatLoadingEarlier = false;
const _savedChat = localStorage.getItem("chatMinimized");
let chatMinimized = _savedChat !== null ? _savedChat === "true" : window.innerWidth <= 900;
let chatUnread    = 0;
let chatVisible   = true; // tracks if user is scrolled to bottom
let chatInitialized = false;
const chatLastSeenAt = localStorage.getItem("chatLastSeenAt") || "";

const pendingDeletes = new Set();
const pendingVotes   = new Map();
const pendingSeen    = new Set();
const pendingQueue   = new Set();
const expandedCards  = new Set();
const expandedLists  = new Set();
const cardComments   = {};
const editingComment = {};

// ── OMDB ──────────────────────────────────────────────────────────────────────
async function searchOMDB(query) {
  const key = "search_" + query.toLowerCase(), cached = cacheGet(key);
  if (cached) return cached;
  const res = await fetch(`${OMDB_URL}?s=${encodeURIComponent(query)}&type=movie&apikey=${OMDB_KEY}`);
  const data = await res.json();
  const results = data.Search || [];
  if (results.length) cacheSet(key, results, CACHE_SEARCH_TTL);
  return results;
}
async function fetchOMDBDetails(imdbId) {
  const key = "detail_" + imdbId, cached = cacheGet(key);
  if (cached) return cached;
  const res = await fetch(`${OMDB_URL}?i=${imdbId}&apikey=${OMDB_KEY}`);
  const details = await res.json();
  cacheSet(key, details, CACHE_DETAIL_TTL);
  return details;
}

// ── Search UI ─────────────────────────────────────────────────────────────────
document.getElementById("movieInput").addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (selected) clearSelected();
  if (q.length < 2) { closeDropdown(); return; }
  showSearching();
  searchTimer = setTimeout(async () => renderDropdown(await searchOMDB(q)), 350);
});
document.getElementById("movieInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { closeDropdown(); addMovie(); }
  if (e.key === "Escape") closeDropdown();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) closeDropdown();
  const path = e.composedPath();
  if (!path.some(el => el.classList?.contains("auth-modal")) && !path.some(el => el.classList?.contains("auth-btn"))) closeAuthModal();
  if (!path.some(el => el.classList?.contains("list-dropdown")) && !path.some(el => el.classList?.contains("queue-side-btn"))) closeListDropdown();
});

function showSearching() { const dd = document.getElementById("dropdown"); dd.innerHTML = '<div class="dropdown-searching">Searching...</div>'; dd.classList.add("open"); }
function renderDropdown(results) {
  const dd = document.getElementById("dropdown");
  if (!results.length) { dd.innerHTML = '<div class="dropdown-searching">No results found</div>'; return; }
  dd.innerHTML = results.slice(0, 6).map(r => `
    <div class="dropdown-item" onclick="selectMovie('${r.imdbID}','${escHtml(r.Title)}')">
      <img src="${r.Poster !== "N/A" ? r.Poster : ""}" alt="" onerror="this.style.display='none'" />
      <div class="di-info"><div class="di-title">${escHtml(r.Title)}</div><div class="di-year">${r.Year}</div></div>
    </div>`).join("");
  dd.classList.add("open");
}
function closeDropdown() { const dd = document.getElementById("dropdown"); dd.classList.remove("open"); dd.innerHTML = ""; }
async function selectMovie(imdbId, title) {
  closeDropdown();
  document.getElementById("movieInput").value = title;
  const preview = document.getElementById("preview");
  preview.innerHTML = `<div class="dropdown-searching">Loading details...</div>`;
  preview.classList.add("show");
  const details = await fetchOMDBDetails(imdbId);
  selected = { title: details.Title, posterUrl: details.Poster !== "N/A" ? details.Poster : null, year: details.Year !== "N/A" ? details.Year : null, imdbRating: details.imdbRating !== "N/A" ? details.imdbRating : null, runtime: details.Runtime !== "N/A" ? details.Runtime : null, imdbId: details.imdbID };
  document.getElementById("movieInput").value = selected.title;
  const meta = [selected.year, selected.runtime, selected.imdbRating ? `★ ${selected.imdbRating}` : null].filter(Boolean).join(" · ");
  preview.innerHTML = `${selected.posterUrl ? `<img src="${selected.posterUrl}" alt="${escHtml(selected.title)}" />` : ""}<div class="preview-info"><div class="preview-title">${escHtml(selected.title)}</div><div class="preview-meta">${meta}</div></div><button class="preview-clear" onclick="clearSelected()">✕</button>`;
}
function clearSelected() { selected = null; document.getElementById("movieInput").value = ""; document.getElementById("preview").classList.remove("show"); document.getElementById("preview").innerHTML = ""; document.getElementById("movieInput").focus(); }

// ── Auth modal ────────────────────────────────────────────────────────────────
function openAuthModal(mode = "login") { document.getElementById("authModal").classList.add("open"); setAuthMode(mode); }
function closeAuthModal() { const m = document.getElementById("authModal"); if (!m.classList.contains("open")) return; m.classList.remove("open"); document.getElementById("authError").textContent = ""; }
function setAuthMode(mode) {
  authModalMode = mode;
  const r = mode === "register";
  document.getElementById("authModalTitle").textContent     = r ? "Create account" : "Sign in";
  document.getElementById("authSubmitBtn").textContent      = r ? "Create account" : "Sign in";
  document.getElementById("authWarning").style.display      = r ? "block" : "none";
  document.getElementById("toggleToRegister").style.display = r ? "none" : "block";
  document.getElementById("toggleToLogin").style.display    = r ? "block" : "none";
  document.getElementById("authError").textContent          = "";
}
async function submitAuth() {
  const username = document.getElementById("authUsername").value.trim().toLowerCase();
  const password = document.getElementById("authPassword").value;
  const errorEl  = document.getElementById("authError");
  if (!username || !password) { errorEl.textContent = "Please fill in all fields."; return; }
  const btn = document.getElementById("authSubmitBtn");
  btn.disabled = true; btn.textContent = authModalMode === "login" ? "Signing in..." : "Creating account...";
  try {
    const res  = await fetch(`${API}/auth/${authModalMode === "login" ? "login" : "register"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || "Something went wrong."; return; }
    saveAuth({ username: data.username, token: data.token });
    document.getElementById("authUsername").value = "";
    document.getElementById("authPassword").value = "";
    closeAuthModal(); updateAuthUI(); render();
  } catch (e) { errorEl.textContent = "Connection error. Please try again."; }
  finally { btn.disabled = false; btn.textContent = authModalMode === "login" ? "Sign in" : "Create account"; }
}
function logout() { clearAuth(); updateAuthUI(); render(); }
function updateAuthUI() {
  const btn = document.getElementById("authBtn"), sec = document.getElementById("suggestSection");
  if (auth) { btn.textContent = `${auth.username} · sign out`; btn.classList.add("logged-in"); sec.classList.remove("locked"); }
  else { btn.textContent = "Sign in"; btn.classList.remove("logged-in"); sec.classList.add("locked"); }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  ["rankings","lists","queue","watched"].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle("active", t === tab);
    document.getElementById(`${t}Controls`).style.display = t === tab ? "" : "none";
  });
  render();
}

// ── List dropdown portal ──────────────────────────────────────────────────────
function toggleListDropdown(movieId, btnEl) {
  if (openDropdownMovieId === movieId) { closeListDropdown(); return; }
  openDropdownMovieId = movieId;
  renderListDropdown(movieId, btnEl);
}

function renderListDropdown(movieId, btnEl) {
  const portal = document.getElementById("list-dropdown-portal");
  const rect   = btnEl.getBoundingClientRect();
  portal.style.top     = `${rect.bottom + 4}px`;
  portal.style.right   = `${window.innerWidth - rect.right}px`;
  portal.style.left    = "auto";
  portal.style.display = "block";

  const inQueue = queueIds.includes(movieId);
  const listItems = lists.map(l => {
    const inList = (l.movieIds || []).includes(movieId);
    const full   = !inList && (l.movieIds || []).length >= 50;
    return `<label class="dd-item${full ? " dd-disabled" : ""}">
      <input type="checkbox" ${inList ? "checked" : ""} ${full ? "disabled" : ""}
        onchange="onDropdownCheckChange('${l.listId}','${movieId}',this.checked,this)" />
      <span class="dd-label">${escHtml(l.title)}</span>
      ${full ? '<span class="dd-full">full</span>' : ""}
    </label>`;
  }).join("");

  portal.innerHTML = `<div class="list-dropdown">
    <label class="dd-item dd-queue-item">
      <input type="checkbox" ${inQueue ? "checked" : ""}
        onchange="onDropdownQueueChange('${movieId}',this.checked,this)" />
      <span class="dd-label dd-queue-label">Theater Queue</span>
    </label>
    ${lists.length ? `<div class="dd-divider"></div>${listItems}` : ""}
    <div class="dd-divider"></div>
    <button class="dd-create-btn" onclick="openCreateListModal('${movieId}')">+ Create new list</button>
  </div>`;
}

function closeListDropdown() {
  openDropdownMovieId = null;
  const portal = document.getElementById("list-dropdown-portal");
  portal.style.display = "none";
  portal.innerHTML = "";
}

async function onDropdownQueueChange(movieId, checked, cbEl) {
  cbEl.disabled = true;
  try {
    if (checked) await addToQueue(movieId);
    else         await removeFromQueue(movieId);
    updateCollectionBtnState(movieId);
  } finally { cbEl.disabled = false; }
}

async function onDropdownCheckChange(listId, movieId, checked, cbEl) {
  cbEl.disabled = true;
  try {
    if (checked) await addMovieToList(listId, movieId);
    else         await removeMovieFromList(listId, movieId);
    updateCollectionBtnState(movieId);
  } finally { cbEl.disabled = false; }
}

function updateCollectionBtnState(movieId) {
  const inAny = movieInAnyCollection(movieId);
  document.querySelectorAll(`.queue-side-btn[data-movie-id="${movieId}"]`).forEach(btn => {
    btn.classList.toggle("in-queue", inAny);
  });
}

function movieInAnyCollection(movieId) {
  return queueIds.includes(movieId) || lists.some(l => (l.movieIds || []).includes(movieId));
}

// ── Create list modal ─────────────────────────────────────────────────────────
function openCreateListModal(movieId) {
  createListForMovieId = movieId;
  closeListDropdown();
  document.getElementById("newListTitle").value = "";
  document.getElementById("newListDesc").value  = "";
  document.getElementById("createListError").textContent = "";
  document.getElementById("createListModal").classList.add("open");
  setTimeout(() => document.getElementById("newListTitle").focus(), 50);
}
function closeCreateListModal() {
  document.getElementById("createListModal").classList.remove("open");
  createListForMovieId = null;
}
async function submitCreateList() {
  if (!auth) { closeCreateListModal(); openAuthModal(); return; }
  const title = document.getElementById("newListTitle").value.trim();
  const desc  = document.getElementById("newListDesc").value.trim();
  const errorEl = document.getElementById("createListError");
  if (!title) { errorEl.textContent = "Please enter a list name."; return; }
  try {
    const res  = await fetch(`${API}/lists`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ title, description: desc, movieId: createListForMovieId || undefined }) });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || "Failed to create list."; return; }
    lists     = [data.list, ...lists];
    listOrder = data.listOrder;
    closeCreateListModal();
    if (activeTab === "lists") render();
  } catch (e) { errorEl.textContent = "Connection error."; }
}

// ── Add movie ─────────────────────────────────────────────────────────────────
async function addMovie() {
  if (!auth) { openAuthModal(); return; }
  const titleInput = document.getElementById("movieInput");
  const title      = selected ? selected.title : titleInput.value.trim();
  if (!title) return;
  if (movies.some(m => m.title.toLowerCase() === title.toLowerCase())) { alert(`"${title}" is already on the list!`); return; }
  const btn = document.getElementById("addBtn");
  btn.disabled = true; btn.textContent = "Adding...";
  try {
    const res   = await fetch(`${API}/movies`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ title, posterUrl: selected?.posterUrl || null, year: selected?.year || null, imdbRating: selected?.imdbRating || null, runtime: selected?.runtime || null, imdbId: selected?.imdbId || null }) });
    const movie = await res.json();
    movies.push(movie);
    titleInput.value = ""; clearSelected(); render();
  } catch (e) { alert("Failed to add movie."); }
  finally { btn.disabled = false; btn.textContent = "+ Add"; }
}

// ── Vote ──────────────────────────────────────────────────────────────────────
async function vote(movieId, direction) {
  if (!auth) { openAuthModal(); return; }
  const movie = movies.find(m => m.movieId === movieId); if (!movie) return;
  const username = auth.username;
  const wasUp = (movie.upvoters || []).includes(username), wasDown = (movie.downvoters || []).includes(username);
  if (wasUp)   { movie.upvotes--;   movie.upvoters   = movie.upvoters.filter(u => u !== username); }
  if (wasDown) { movie.downvotes--; movie.downvoters = movie.downvoters.filter(u => u !== username); }
  const toggling = (wasUp && direction === 1) || (wasDown && direction === -1);
  if (!toggling) {
    if (direction === 1)  { movie.upvotes++;   movie.upvoters   = [...(movie.upvoters   || []), username]; }
    if (direction === -1) { movie.downvotes++; movie.downvoters = [...(movie.downvoters || []), username]; }
  }
  pendingVotes.set(movieId, direction); render();
  try { await fetch(`${API}/vote`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ movieId, direction }) }); }
  catch (e) { console.error("Vote failed:", e); } finally { pendingVotes.delete(movieId); }
}

// ── Delete movie ──────────────────────────────────────────────────────────────
async function deleteMovie(movieId) {
  if (!auth) { openAuthModal(); return; }
  if (!confirm("Remove this movie?")) return;
  pendingDeletes.add(movieId);
  movies     = movies.filter(m => m.movieId !== movieId);
  queueIds   = queueIds.filter(id => id !== movieId);
  watchedIds = watchedIds.filter(id => id !== movieId);
  nowWatching.delete(movieId);
  lists      = lists.map(l => ({ ...l, movieIds: (l.movieIds || []).filter(id => id !== movieId) }));
  render();
  try { await fetch(`${API}/movies/${movieId}`, { method: "DELETE", headers: jsonHeaders() }); }
  catch (e) { console.error("Delete failed:", e); } finally { pendingDeletes.delete(movieId); }
}

// ── Seen ──────────────────────────────────────────────────────────────────────
async function toggleSeen(movieId) {
  if (!auth) { openAuthModal(); return; }
  const movie = movies.find(m => m.movieId === movieId); if (!movie) return;
  const username = auth.username, seen = (movie.seenBy || []).includes(username);
  movie.seenBy = seen ? (movie.seenBy || []).filter(u => u !== username) : [...(movie.seenBy || []), username];
  pendingSeen.add(movieId); render();
  try { await fetch(`${API}/seen`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ movieId }) }); }
  catch (e) { console.error("Seen toggle failed:", e); } finally { pendingSeen.delete(movieId); }
}

// ── Queue ─────────────────────────────────────────────────────────────────────
async function addToQueue(movieId) {
  if (!auth) { openAuthModal(); return; }
  if (queueIds.includes(movieId)) return;
  queueIds = [...queueIds, movieId];
  pendingQueue.add(movieId); render();
  try { await fetch(`${API}/queue`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ movieId }) }); }
  catch (e) { queueIds = queueIds.filter(id => id !== movieId); render(); }
  finally { pendingQueue.delete(movieId); }
}
async function removeFromQueue(movieId) {
  if (!auth) { openAuthModal(); return; }
  queueIds = queueIds.filter(id => id !== movieId);
  pendingQueue.add(movieId); render();
  try { await fetch(`${API}/queue/${movieId}`, { method: "DELETE", headers: jsonHeaders() }); }
  catch (e) { console.error("Remove from queue failed:", e); } finally { pendingQueue.delete(movieId); }
}

// ── Watched ───────────────────────────────────────────────────────────────────
function toggleNowWatching(movieId) {
  if (nowWatching.has(movieId)) nowWatching.delete(movieId);
  else nowWatching.add(movieId);
  render();
}

async function moveToWatched(movieId) {
  if (!auth) { openAuthModal(); return; }
  nowWatching.delete(movieId);
  queueIds   = queueIds.filter(id => id !== movieId);
  watchedIds = [movieId, ...watchedIds.filter(id => id !== movieId)];
  render();
  try { await fetch(`${API}/watched`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ movieId }) }); }
  catch (e) { console.error("Move to watched failed:", e); }
}

async function removeFromWatched(movieId) {
  if (!auth) { openAuthModal(); return; }
  watchedIds = watchedIds.filter(id => id !== movieId);
  render();
  try { await fetch(`${API}/watched/${movieId}`, { method: "DELETE", headers: jsonHeaders() }); }
  catch (e) { console.error("Remove from watched failed:", e); }
}

// ── Queue drag ────────────────────────────────────────────────────────────────
function onDragStart(e, movieId) {
  dragSrcId = movieId; e.dataTransfer.effectAllowed = "move";
  setTimeout(() => document.querySelector(`.queue-card-wrapper[data-id="${movieId}"]`)?.classList.add("dragging"), 0);
}
function onDragOver(e, movieId) {
  e.preventDefault(); e.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".queue-card-wrapper.drag-over").forEach(el => el.classList.remove("drag-over"));
  if (movieId !== dragSrcId) document.querySelector(`.queue-card-wrapper[data-id="${movieId}"]`)?.classList.add("drag-over");
}
function onDragEnd() {
  dragSrcId = null;
  document.querySelectorAll(".queue-card-wrapper.dragging,.queue-card-wrapper.drag-over").forEach(el => el.classList.remove("dragging","drag-over"));
}
async function onDrop(e, targetId) {
  e.preventDefault();
  if (!dragSrcId || dragSrcId === targetId) return;
  const si = queueIds.indexOf(dragSrcId), ti = queueIds.indexOf(targetId);
  if (si === -1 || ti === -1) return;
  const newOrder = [...queueIds]; newOrder.splice(si, 1); newOrder.splice(ti, 0, dragSrcId);
  queueIds = newOrder; render();
  try { await fetch(`${API}/queue`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ movieIds: queueIds }) }); }
  catch (e) { console.error("Reorder failed:", e); }
}

// ── List panel drag (reorder lists) ──────────────────────────────────────────
function onListDragStart(e, listId) {
  dragListSrcId = listId; e.dataTransfer.effectAllowed = "move"; e.stopPropagation();
  setTimeout(() => document.querySelector(`.list-panel[data-list-id="${listId}"]`)?.classList.add("dragging"), 0);
}
function onListDragOver(e, listId) {
  e.preventDefault(); e.stopPropagation();
  document.querySelectorAll(".list-panel.drag-over").forEach(el => el.classList.remove("drag-over"));
  if (listId !== dragListSrcId) document.querySelector(`.list-panel[data-list-id="${listId}"]`)?.classList.add("drag-over");
}
function onListDragEnd() {
  dragListSrcId = null;
  document.querySelectorAll(".list-panel.dragging,.list-panel.drag-over").forEach(el => el.classList.remove("dragging","drag-over"));
}
async function onListDrop(e, targetId) {
  e.preventDefault(); e.stopPropagation();
  if (!dragListSrcId || dragListSrcId === targetId) return;
  const si = listOrder.indexOf(dragListSrcId), ti = listOrder.indexOf(targetId);
  if (si === -1 || ti === -1) return;
  const newOrder = [...listOrder]; newOrder.splice(si, 1); newOrder.splice(ti, 0, dragListSrcId);
  listOrder = newOrder; render();
  try { await fetch(`${API}/listorder`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ listIds: listOrder }) }); }
  catch (e) { console.error("List reorder failed:", e); }
}

// ── List movie drag (reorder movies within a list) ────────────────────────────
function onListMovieDragStart(e, listId, movieId) {
  dragListMovieSrcId = movieId; currentDragListId = listId; e.dataTransfer.effectAllowed = "move"; e.stopPropagation();
  setTimeout(() => document.querySelector(`.list-movie-wrapper[data-id="${movieId}"][data-list="${listId}"]`)?.classList.add("dragging"), 0);
}
function onListMovieDragOver(e, listId, movieId) {
  e.preventDefault(); e.stopPropagation();
  document.querySelectorAll(".list-movie-wrapper.drag-over").forEach(el => el.classList.remove("drag-over"));
  if (movieId !== dragListMovieSrcId) document.querySelector(`.list-movie-wrapper[data-id="${movieId}"][data-list="${listId}"]`)?.classList.add("drag-over");
}
function onListMovieDragEnd() {
  dragListMovieSrcId = null; currentDragListId = null;
  document.querySelectorAll(".list-movie-wrapper.dragging,.list-movie-wrapper.drag-over").forEach(el => el.classList.remove("dragging","drag-over"));
}
async function onListMovieDrop(e, listId, targetId) {
  e.preventDefault(); e.stopPropagation();
  if (!dragListMovieSrcId || dragListMovieSrcId === targetId || listId !== currentDragListId) return;
  const list = lists.find(l => l.listId === listId); if (!list) return;
  const ids = [...(list.movieIds || [])];
  const si = ids.indexOf(dragListMovieSrcId), ti = ids.indexOf(targetId);
  if (si === -1 || ti === -1) return;
  ids.splice(si, 1); ids.splice(ti, 0, dragListMovieSrcId);
  list.movieIds = ids; render();
  try { await fetch(`${API}/lists/${listId}/order`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ movieIds: ids }) }); }
  catch (e) { console.error("List movie reorder failed:", e); }
}

// ── Touch drag-and-drop (all three drag systems) ─────────────────────────────
let touchDrag = null;

function initTouchDrag() {
  document.addEventListener("touchstart",  handleTouchStart,  { passive: false });
  document.addEventListener("touchmove",   handleTouchMove,   { passive: false });
  document.addEventListener("touchend",    handleTouchEnd);
  document.addEventListener("touchcancel", handleTouchCancel);
}

// Identify which draggable element and system a touch target belongs to.
// Check list-movie before queue-card since list-movie wrappers carry both classes.
function getTouchDraggable(target) {
  const handle = target.closest(".drag-handle, .list-drag-grip");
  if (!handle) return null;
  const listMovie = handle.closest(".list-movie-wrapper");
  if (listMovie) return { el: listMovie, type: "listMovie", id: listMovie.dataset.id, listId: listMovie.dataset.list };
  const queueCard = handle.closest(".queue-card-wrapper");
  if (queueCard) return { el: queueCard, type: "queue", id: queueCard.dataset.id };
  const listPanel = handle.closest(".list-panel");
  if (listPanel) return { el: listPanel, type: "list", id: listPanel.dataset.listId };
  return null;
}

function getDragSelector(type) {
  if (type === "listMovie") return ".list-movie-wrapper";
  if (type === "list")      return ".list-panel";
  return ".queue-card-wrapper:not(.list-movie-wrapper)";
}

function handleTouchStart(e) {
  const draggable = getTouchDraggable(e.touches[0].target);
  if (!draggable) return;
  e.preventDefault(); // prevent scroll while dragging from a handle
  const touch = e.touches[0];
  const rect  = draggable.el.getBoundingClientRect();
  const clone = draggable.el.cloneNode(true);
  Object.assign(clone.style, {
    position: "fixed", top: rect.top + "px", left: rect.left + "px",
    width: rect.width + "px", opacity: "0.82", pointerEvents: "none",
    zIndex: "9999", boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
    transform: "scale(1.02)", transition: "none",
  });
  document.body.appendChild(clone);
  draggable.el.classList.add("dragging");
  touchDrag = {
    ...draggable, clone,
    offsetX: touch.clientX - rect.left,
    offsetY: touch.clientY - rect.top,
    targetEl: null,
  };
}

function handleTouchMove(e) {
  if (!touchDrag) return;
  e.preventDefault();
  const touch = e.touches[0];
  touchDrag.clone.style.top  = (touch.clientY - touchDrag.offsetY) + "px";
  touchDrag.clone.style.left = (touch.clientX - touchDrag.offsetX) + "px";
  // Briefly hide clone so elementFromPoint finds the real element beneath
  touchDrag.clone.style.visibility = "hidden";
  const under = document.elementFromPoint(touch.clientX, touch.clientY);
  touchDrag.clone.style.visibility = "";
  const sel = getDragSelector(touchDrag.type);
  document.querySelectorAll(`${sel}.drag-over`).forEach(el => el.classList.remove("drag-over"));
  let target = under?.closest(sel);
  if (touchDrag.type === "listMovie" && target?.dataset.list !== touchDrag.listId) target = null;
  if (target && target !== touchDrag.el) { target.classList.add("drag-over"); touchDrag.targetEl = target; }
  else touchDrag.targetEl = null;
}

function cleanupTouchDrag() {
  if (!touchDrag) return;
  touchDrag.clone.remove();
  touchDrag.el.classList.remove("dragging");
  document.querySelectorAll(`${getDragSelector(touchDrag.type)}.drag-over`).forEach(el => el.classList.remove("drag-over"));
}

function handleTouchCancel() {
  cleanupTouchDrag();
  touchDrag = null;
}

async function handleTouchEnd() {
  if (!touchDrag) return;
  const { type, id, listId, targetEl } = touchDrag;
  cleanupTouchDrag();
  touchDrag = null;
  if (!targetEl) return;
  const targetId = type === "list" ? targetEl.dataset.listId : targetEl.dataset.id;
  if (id === targetId) return;
  if (type === "queue") {
    const si = queueIds.indexOf(id), ti = queueIds.indexOf(targetId);
    if (si === -1 || ti === -1) return;
    const newOrder = [...queueIds]; newOrder.splice(si, 1); newOrder.splice(ti, 0, id);
    queueIds = newOrder; render();
    try { await fetch(`${API}/queue`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ movieIds: queueIds }) }); }
    catch (err) { console.error("Touch queue reorder failed:", err); }
  } else if (type === "listMovie") {
    const list = lists.find(l => l.listId === listId); if (!list) return;
    const ids = [...(list.movieIds || [])];
    const si = ids.indexOf(id), ti = ids.indexOf(targetId);
    if (si === -1 || ti === -1) return;
    ids.splice(si, 1); ids.splice(ti, 0, id);
    list.movieIds = ids; render();
    try { await fetch(`${API}/lists/${listId}/order`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ movieIds: ids }) }); }
    catch (err) { console.error("Touch list movie reorder failed:", err); }
  } else if (type === "list") {
    const si = listOrder.indexOf(id), ti = listOrder.indexOf(targetId);
    if (si === -1 || ti === -1) return;
    const newOrder = [...listOrder]; newOrder.splice(si, 1); newOrder.splice(ti, 0, id);
    listOrder = newOrder; render();
    try { await fetch(`${API}/listorder`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ listIds: listOrder }) }); }
    catch (err) { console.error("Touch list reorder failed:", err); }
  }
}

// ── List CRUD ─────────────────────────────────────────────────────────────────
function toggleListExpanded(listId) {
  if (expandedLists.has(listId)) expandedLists.delete(listId);
  else expandedLists.add(listId);
  render();
}
function startEditList(listId) { editingListId = listId; render(); }
function cancelEditList() { editingListId = null; render(); }
async function saveEditList(listId) {
  const title = document.getElementById(`edit-list-title-${listId}`)?.value.trim();
  const desc  = document.getElementById(`edit-list-desc-${listId}`)?.value.trim();
  if (!title) return;
  try {
    await fetch(`${API}/lists/${listId}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ title, description: desc || "" }) });
    const list = lists.find(l => l.listId === listId);
    if (list) { list.title = title; list.description = desc || ""; }
    editingListId = null; render();
  } catch (e) { alert("Failed to save."); }
}
async function deleteList(listId) {
  if (!confirm("Delete this list?")) return;
  lists     = lists.filter(l => l.listId !== listId);
  listOrder = listOrder.filter(id => id !== listId);
  render();
  try { await fetch(`${API}/lists/${listId}`, { method: "DELETE", headers: jsonHeaders() }); }
  catch (e) { console.error("Delete list failed:", e); }
}
async function addMovieToList(listId, movieId) {
  const list = lists.find(l => l.listId === listId); if (!list) return;
  if ((list.movieIds || []).includes(movieId)) return;
  list.movieIds = [...(list.movieIds || []), movieId];
  try { await fetch(`${API}/lists/${listId}/movies`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ movieId }) }); }
  catch (e) { list.movieIds = (list.movieIds || []).filter(id => id !== movieId); console.error(e); }
  render();
}
async function removeMovieFromList(listId, movieId) {
  const list = lists.find(l => l.listId === listId); if (!list) return;
  list.movieIds = (list.movieIds || []).filter(id => id !== movieId);
  render();
  try { await fetch(`${API}/lists/${listId}/movies/${movieId}`, { method: "DELETE", headers: jsonHeaders() }); }
  catch (e) { console.error("Remove from list failed:", e); }
}

// ── Comments ──────────────────────────────────────────────────────────────────
async function toggleComments(movieId) {
  if (expandedCards.has(movieId)) { expandedCards.delete(movieId); render(); return; }
  expandedCards.add(movieId); render();
  if (!cardComments[movieId]) await fetchComments(movieId);
  else renderCommentsSection(movieId);
}
async function fetchComments(movieId) {
  try {
    const res = await fetch(`${API}/comments/${movieId}`);
    cardComments[movieId] = await res.json();
    refreshCommentCount(movieId);
    if (expandedCards.has(movieId)) renderCommentsSection(movieId);
  } catch (e) { console.error("Failed to load comments:", e); }
}
function renderCommentsSection(movieId) {
  document.querySelectorAll(`#comments-section-${movieId}`).forEach(section => {
    const comments = cardComments[movieId];
    if (!comments) { section.innerHTML = '<div class="comments-loading">Loading...</div>'; return; }
    const items = comments.map(c => {
      const isOwn = auth?.username === c.username, isEditing = editingComment[c.commentId];
      if (isEditing) return `<div class="comment-item editing"><span class="comment-username">${escHtml(c.username)}</span><textarea id="edit-input-${c.commentId}" class="comment-edit-input">${escHtml(c.text)}</textarea><div class="comment-edit-btns"><button class="comment-action-btn save" onclick="saveEditComment('${movieId}','${c.commentId}')">Save</button><button class="comment-action-btn" onclick="cancelEdit('${c.commentId}','${movieId}')">Cancel</button></div></div>`;
      return `<div class="comment-item"><div class="comment-header"><span class="comment-username">${escHtml(c.username)}</span><span class="comment-time">${timeAgo(c.createdAt)}${c.editedAt ? " · edited" : ""}</span>${isOwn ? `<div class="comment-actions"><button class="comment-action-btn" onclick="startEdit('${c.commentId}','${movieId}')">edit</button><button class="comment-action-btn danger" onclick="deleteComment('${movieId}','${c.commentId}')">delete</button></div>` : ""}</div><div class="comment-text">${escHtml(c.text)}</div></div>`;
    }).join("");
    const addForm = auth ? `<div class="add-comment-row"><textarea id="comment-input-${movieId}" class="comment-input" placeholder="Add a comment..." rows="2"></textarea><button id="comment-submit-${movieId}" class="comment-submit-btn" onclick="addComment('${movieId}')">Post</button></div>` : `<p class="comments-login-prompt"><a href="#" onclick="openAuthModal(); return false;">Sign in</a> to comment</p>`;
    section.innerHTML = `<div class="comments-list">${items || '<div class="no-comments">No comments yet — be the first!</div>'}</div>${addForm}`;
  });
}
async function addComment(movieId) {
  if (!auth) { openAuthModal(); return; }
  const input = document.getElementById(`comment-input-${movieId}`);
  const text = input?.value?.trim(); if (!text) return;
  const btn = document.getElementById(`comment-submit-${movieId}`);
  if (btn) { btn.disabled = true; btn.textContent = "Posting..."; }
  try {
    const res = await fetch(`${API}/comments/${movieId}`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ text }) });
    const comment = await res.json();
    cardComments[movieId] = [...(cardComments[movieId] || []), comment];
    input.value = ""; renderCommentsSection(movieId); refreshCommentCount(movieId);
  } catch (e) { alert("Failed to post comment."); }
  finally { if (btn) { btn.disabled = false; btn.textContent = "Post"; } }
}
function startEdit(commentId, movieId) { editingComment[commentId] = true; renderCommentsSection(movieId); }
function cancelEdit(commentId, movieId) { delete editingComment[commentId]; renderCommentsSection(movieId); }
async function saveEditComment(movieId, commentId) {
  const input = document.getElementById(`edit-input-${commentId}`);
  const text = input?.value?.trim(); if (!text) return;
  try {
    const res = await fetch(`${API}/comments/${movieId}/${commentId}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ text }) });
    const updated = await res.json();
    cardComments[movieId] = cardComments[movieId].map(c => c.commentId === commentId ? updated : c);
    delete editingComment[commentId]; renderCommentsSection(movieId);
  } catch (e) { alert("Failed to save edit."); }
}
async function deleteComment(movieId, commentId) {
  if (!confirm("Delete this comment?")) return;
  try {
    await fetch(`${API}/comments/${movieId}/${commentId}`, { method: "DELETE", headers: jsonHeaders() });
    cardComments[movieId] = cardComments[movieId].filter(c => c.commentId !== commentId);
    renderCommentsSection(movieId); refreshCommentCount(movieId);
  } catch (e) { alert("Failed to delete comment."); }
}
function refreshCommentCount(movieId) {
  const count = cardComments[movieId]?.length ?? 0;
  document.querySelectorAll(`#comment-count-${movieId}`).forEach(el => { el.textContent = `${count} `; });
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso), mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now"; if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Chat ──────────────────────────────────────────────────────────────────────
async function loadChat() {
  try {
    const res = await fetch(`${API}/chat`);
    const { messages, hasMore } = await res.json();
    if (JSON.stringify(messages) === JSON.stringify(chatMessages)) return;
    const wasAtBottom  = isChatAtBottom();
    const latestKnown  = chatMessages.length ? chatMessages[chatMessages.length - 1].createdAt : null;
    if (!chatInitialized) {
      // First load: badge messages that arrived since user last had chat open
      const missed = chatLastSeenAt ? messages.filter(m => m.createdAt > chatLastSeenAt).length : 0;
      if (missed > 0 && chatMinimized) {
        chatUnread = missed;
        const badge = document.getElementById("chatBadge");
        badge.textContent = missed;
        badge.style.display = "inline";
      }
      chatInitialized = true;
      if (olderMessages.length === 0) chatHasMore = hasMore;
    } else {
      // Subsequent polls: count genuinely new messages
      const newCount = latestKnown ? messages.filter(m => m.createdAt > latestKnown).length : 0;
      if (newCount > 0 && chatMinimized) {
        chatUnread += newCount;
        const badge = document.getElementById("chatBadge");
        badge.textContent = chatUnread;
        badge.style.display = "inline";
      }
      if (olderMessages.length === 0) chatHasMore = hasMore;
    }
    chatMessages = messages;
    renderChat();
    if (wasAtBottom) scrollChatToBottom();
  } catch (e) { console.error("Chat load failed:", e); }
}

async function loadEarlierChat() {
  if (chatLoadingEarlier || chatReachedStart) return;
  chatLoadingEarlier = true;
  const btn = document.querySelector(".load-earlier-btn");
  if (btn) btn.textContent = "Loading…";
  const oldest = olderMessages.length ? olderMessages[0].createdAt
                                      : chatMessages.length ? chatMessages[0].createdAt : null;
  if (!oldest) { chatLoadingEarlier = false; return; }
  try {
    const res = await fetch(`${API}/chat?before=${encodeURIComponent(oldest)}`);
    const { messages, hasMore } = await res.json();
    const container = document.getElementById("chatMessages");
    const prevScrollHeight = container.scrollHeight;
    // Deduplicate by messageId then prepend
    const existingIds = new Set([...olderMessages, ...chatMessages].map(m => m.messageId));
    olderMessages = [...messages.filter(m => !existingIds.has(m.messageId)), ...olderMessages];
    chatHasMore = hasMore;
    if (!hasMore) chatReachedStart = true;
    renderChat();
    container.scrollTop = container.scrollHeight - prevScrollHeight;
  } catch (e) { console.error("Load earlier failed:", e); }
  finally { chatLoadingEarlier = false; }
}

function renderChat() {
  const container = document.getElementById("chatMessages");
  const seen    = new Set();
  const allMsgs = [...olderMessages, ...chatMessages]
    .filter(m => seen.has(m.messageId) ? false : (seen.add(m.messageId), true));

  const loadEarlierHtml = (chatHasMore && !chatReachedStart)
    ? `<button class="load-earlier-btn" onclick="loadEarlierChat()">Load earlier messages</button>`
    : "";

  if (!allMsgs.length) {
    container.innerHTML = loadEarlierHtml || '<div class="chat-empty">No messages yet. Say hi!</div>';
    return;
  }
  container.innerHTML = loadEarlierHtml + allMsgs.map(m => {
    const isOwn = auth?.username === m.username;
    const time  = formatChatTime(m.createdAt);
    return `<div class="chat-msg${isOwn ? " own" : ""}">
      ${!isOwn ? `<div class="chat-msg-name">${escHtml(m.username)}</div>` : ""}
      <div class="chat-bubble">${escHtml(m.text)}</div>
      <div class="chat-msg-time">${time}</div>
    </div>`;
  }).join("");
}

async function sendChatMessage() {
  if (!auth) { openAuthModal(); return; }
  const input = document.getElementById("chatInput");
  const text  = input.value.trim();
  if (!text) return;

  const btn = document.querySelector(".chat-send-btn");
  btn.disabled = true;
  input.value  = "";

  try {
    const res = await fetch(`${API}/chat`, {
      method:  "POST",
      headers: jsonHeaders(),
      body:    JSON.stringify({ text }),
    });
    const msg = await res.json();
    chatMessages.push(msg);
    renderChat();
    scrollChatToBottom();
  } catch (e) { console.error("Send failed:", e); input.value = text; }
  finally { btn.disabled = false; }
}

function toggleChat() {
  chatMinimized = !chatMinimized;
  localStorage.setItem("chatMinimized", chatMinimized);
  document.getElementById("chatPanel").classList.toggle("minimized", chatMinimized);
  document.getElementById("chatToggleBtn").textContent = chatMinimized ? "◀" : "▶";
  if (window.innerWidth > 900) {
    document.querySelector(".page-wrapper").style.marginRight = chatMinimized ? "0" : "310px";
  }
  const fab = document.getElementById("chatFab");
  if (fab) fab.style.display = chatMinimized ? "" : "none";
  if (!chatMinimized) {
    chatUnread = 0;
    document.getElementById("chatBadge").style.display = "none";
    const _allMsgs = [...olderMessages, ...chatMessages];
    if (_allMsgs.length) localStorage.setItem("chatLastSeenAt", _allMsgs[_allMsgs.length - 1].createdAt);
    setTimeout(scrollChatToBottom, 50);
  }
}

function isChatAtBottom() {
  const el = document.getElementById("chatMessages");
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}

function scrollChatToBottom() {
  const el = document.getElementById("chatMessages");
  if (el) el.scrollTop = el.scrollHeight;
}

function formatChatTime(iso) {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = now - d;
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 86400000 && sameDay) return time;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
}

document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
});

// ── Sort ──────────────────────────────────────────────────────────────────────
function setSort(mode, el) {
  sortMode = mode;
  rankingsPage = 1;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active")); el.classList.add("active");
  document.getElementById("sortLabel").textContent = mode === "score" ? "sorted by score" : "sorted by newest";
  render();
}
function sorted() {
  const list = [...movies];
  return sortMode === "score" ? list.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes)) : list.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
}

// ── Card builder ──────────────────────────────────────────────────────────────
function buildCard(m, rank, mode, listId = null) {
  const s = m.upvotes - m.downvotes, cls = s > 0 ? "pos" : s < 0 ? "neg" : "zero";
  const title = (m.title || "").length > 50 ? m.title.slice(0, 50) + "…" : m.title;
  const hasImdb = !!m.imdbId, username = auth?.username;
  const hasVotedUp   = !!username && (m.upvoters   || []).includes(username);
  const hasVotedDown = !!username && (m.downvoters  || []).includes(username);
  const hasSeen      = !!username && (m.seenBy      || []).includes(username);
  const inAnyCollection = movieInAnyCollection(m.movieId);

  const poster  = m.posterUrl ? `<img class="poster" src="${m.posterUrl}" alt="${escHtml(m.title)}" loading="lazy" />` : `<div class="poster-placeholder">🎬</div>`;
  const titleEl = hasImdb ? `<a class="movie-title imdb-link" href="https://www.imdb.com/title/${m.imdbId}/" target="_blank" rel="noopener">${escHtml(title)}</a>` : `<div class="movie-title">${escHtml(title)}</div>`;
  const metaParts = [m.year, m.runtime, m.imdbRating ? `<span class="imdb-badge">★ ${m.imdbRating}</span>` : null, `by ${escHtml(m.addedBy || "?")}`].filter(Boolean).join(" · ");

  const upNames   = (m.upvoters   || []).map(u => u === username ? "you" : u);
  const downNames = (m.downvoters || []).map(u => u === username ? "you" : u);
  const seenNames = (m.seenBy     || []).map(u => u === username ? "you" : u);

  const count = cardComments[m.movieId]?.length, countStr = count !== undefined ? `${count} ` : "", expanded = expandedCards.has(m.movieId);
  const commentsToggle = `<button class="comments-toggle-btn" data-movie-id="${m.movieId}" onclick="toggleComments('${m.movieId}')">💬 <span id="comment-count-${m.movieId}">${countStr}</span>comment${count !== 1 ? "s" : ""} ${expanded ? "▲" : "▼"}</button>`;
  const commentsSection = expanded ? `<div class="comments-section" id="comments-section-${m.movieId}"><div class="comments-loading">Loading...</div></div>` : "";

  const footerContent = [
    upNames.length   ? `<span class="voter-names up">▲ ${upNames.join(", ")}</span>`     : "",
    downNames.length ? `<span class="voter-names down">▼ ${downNames.join(", ")}</span>` : "",
    seenNames.length ? `<span class="voter-names seen">👁 ${seenNames.join(", ")}</span>` : "",
  ].filter(Boolean).join("");

  const isNowWatching = mode === "queue" && nowWatching.has(m.movieId);

  // Right-side button(s)
  let sideBtn = "";
  if (mode === "rankings") {
    sideBtn = `<button class="queue-side-btn${inAnyCollection ? " in-queue" : ""}" data-movie-id="${m.movieId}" onclick="toggleListDropdown('${m.movieId}', this)" title="Add to list">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <line x1="1" y1="3.5" x2="10" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="1" y1="7.5" x2="10" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="1" y1="11.5" x2="6" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="10" y1="9.5" x2="10" y2="13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="8" y1="11.5" x2="12" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>`;
  } else if (mode === "queue") {
    sideBtn = `<div class="queue-side-panel">
      <button class="queue-action-btn now-watching-btn${isNowWatching ? " active" : ""}" onclick="toggleNowWatching('${m.movieId}')" title="Now Watching">Now<br>Watching</button>
      <button class="queue-action-btn move-watched-btn" onclick="moveToWatched('${m.movieId}')" title="Move to Watched">Move to<br>Watched</button>
      <button class="queue-action-btn remove-queue-btn" onclick="removeFromQueue('${m.movieId}')" title="Remove from Queue">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <line x1="1" y1="3.5" x2="10" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="1" y1="7.5" x2="10" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="1" y1="11.5" x2="6" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="9" y1="11.5" x2="14" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>`;
  } else if (mode === "list" && listId) {
    sideBtn = `<button class="queue-side-btn remove" onclick="removeMovieFromList('${listId}','${m.movieId}')" title="Remove from List">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <line x1="1" y1="3.5" x2="10" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="1" y1="7.5" x2="10" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="1" y1="11.5" x2="6" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="9" y1="11.5" x2="14" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>`;
  } else if (mode === "watched") {
    sideBtn = `<button class="queue-side-btn remove" onclick="removeFromWatched('${m.movieId}')" title="Remove from Watched">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <line x1="1" y1="3.5" x2="10" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="1" y1="7.5" x2="10" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="1" y1="11.5" x2="6" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="9" y1="11.5" x2="14" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>`;
  }

  const dragHandle = (mode === "queue")
    ? `<div class="drag-handle"><svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg></div>`
    : (mode === "list")
    ? `<div class="drag-handle"><svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg></div>`
    : "";

  const cardInner = `
    ${mode === "rankings" ? `<button class="delete-btn-corner" onclick="deleteMovie('${m.movieId}')" title="Remove">✕</button>` : ""}
    <div class="card-main">
      <span class="rank">${rank}</span>
      ${poster}
      <div class="movie-info">${titleEl}<div class="movie-meta">${metaParts}</div></div>
      <div class="vote-area">
        <button class="vote-btn down${hasVotedDown ? " active" : ""}" onclick="vote('${m.movieId}',-1)" title="Thumbs down">▼</button>
        <span class="score ${cls}">${s > 0 ? "+" : ""}${s}</span>
        <button class="vote-btn up${hasVotedUp ? " active" : ""}" onclick="vote('${m.movieId}',1)" title="Thumbs up">▲</button>
        <button class="vote-btn seen-vote-btn${hasSeen ? " active" : ""}" onclick="toggleSeen('${m.movieId}')" title="${hasSeen ? "Unmark as seen" : "Mark as seen"}">👁</button>
      </div>
    </div>
    <div class="card-footer">
      ${footerContent}
      <div class="comments-toggle-row">${commentsToggle}</div>
    </div>
    ${commentsSection}`;

  const cardEl = `<div class="movie-card${hasImdb ? " has-imdb" : ""}${isNowWatching ? " now-watching" : ""}"><div class="card-content">${cardInner}</div>${sideBtn}</div>`;

  if (mode === "queue") {
    return `<div class="queue-card-wrapper" data-id="${m.movieId}" draggable="true"
        ondragstart="onDragStart(event,'${m.movieId}')" ondragover="onDragOver(event,'${m.movieId}')"
        ondrop="onDrop(event,'${m.movieId}')" ondragend="onDragEnd()">
      ${dragHandle}${cardEl}
    </div>`;
  }
  if (mode === "list" && listId) {
    return `<div class="list-movie-wrapper queue-card-wrapper" data-id="${m.movieId}" data-list="${listId}" draggable="true"
        ondragstart="onListMovieDragStart(event,'${listId}','${m.movieId}')"
        ondragover="onListMovieDragOver(event,'${listId}','${m.movieId}')"
        ondrop="onListMovieDrop(event,'${listId}','${m.movieId}')"
        ondragend="onListMovieDragEnd()">
      ${dragHandle}${cardEl}
    </div>`;
  }
  return cardEl;
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  updateAuthUI();
  if (activeTab === "rankings")   renderRankings();
  else if (activeTab === "queue") renderQueue();
  else if (activeTab === "watched") renderWatched();
  else renderListsTab();
}

function renderWatched() {
  const list = document.getElementById("movieList");
  if (!watchedIds.length) {
    list.innerHTML = '<div class="empty">Nothing watched yet — move movies here from the Queue!</div>';
    return;
  }
  const watchedMovies = watchedIds.map(id => movies.find(m => m.movieId === id)).filter(Boolean);
  list.innerHTML = watchedMovies.map((m, i) => buildCard(m, i + 1, "watched")).join("");
  reattachComments();
}

function renderRankings() {
  const list  = document.getElementById("movieList");
  const all   = sorted();
  const total = all.length;
  const pages = Math.ceil(total / PAGE_SIZE);

  rankingsPage  = Math.min(rankingsPage, Math.max(1, pages));
  const start   = (rankingsPage - 1) * PAGE_SIZE;
  const items   = all.slice(start, start + PAGE_SIZE);

  if (!items.length) {
    list.innerHTML = '<div class="empty">No movies yet — sign in and suggest one!</div>';
    return;
  }

  list.innerHTML = items.map((m, i) => buildCard(m, start + i + 1, "rankings")).join("")
    + (pages > 1 ? buildPagination(rankingsPage, pages) : "");
  reattachComments();
}

function renderQueue() {
  const list = document.getElementById("movieList");
  if (!queueIds.length) { list.innerHTML = '<div class="empty">The queue is empty — add movies from Rankings!</div>'; return; }
  const queueMovies = queueIds.map(id => movies.find(m => m.movieId === id)).filter(Boolean);
  list.innerHTML = queueMovies.map((m, i) => buildCard(m, i + 1, "queue")).join("");
  reattachComments();
}

function orderedLists() {
  const byId = Object.fromEntries(lists.map(l => [l.listId, l]));
  return [
    ...listOrder.map(id => byId[id]).filter(Boolean),
    ...lists.filter(l => !listOrder.includes(l.listId)),
  ];
}

function renderListsTab() {
  const container = document.getElementById("movieList");
  const ordered   = orderedLists();

  const newListBtn = auth ? `<button class="new-list-btn" onclick="openCreateListModal(null)">+ New list</button>` : "";

  if (!ordered.length) {
    container.innerHTML = `<div class="empty">No lists yet.</div>${newListBtn}`;
    return;
  }

  container.innerHTML = newListBtn + ordered.map(l => renderListPanel(l)).join("");
  reattachComments();
}

function renderListPanel(l) {
  const isExpanded = expandedLists.has(l.listId);
  const isEditing  = editingListId === l.listId;
  const movieCount = (l.movieIds || []).length;

  const headerContent = isEditing ? `
    <div class="list-edit-form">
      <input id="edit-list-title-${l.listId}" class="list-title-input" value="${escHtml(l.title)}" placeholder="List name" maxlength="60" />
      <textarea id="edit-list-desc-${l.listId}" class="list-desc-input" placeholder="Description (optional)">${escHtml(l.description || "")}</textarea>
      <div class="list-edit-actions">
        <button class="list-save-btn" onclick="saveEditList('${l.listId}')">Save</button>
        <button class="list-cancel-btn" onclick="cancelEditList()">Cancel</button>
      </div>
    </div>` : `
    <div class="list-header-info" onclick="toggleListExpanded('${l.listId}')">
      <div class="list-title-row">
        <span class="list-title-text">${escHtml(l.title)}</span>
        <span class="list-count">${movieCount} film${movieCount !== 1 ? "s" : ""}</span>
      </div>
      ${l.description ? `<div class="list-desc-text">${escHtml(l.description)}</div>` : ""}
      <div class="list-creator">by ${escHtml(l.createdBy)}</div>
    </div>
    <div class="list-header-actions">
      ${auth ? `<button class="list-action-btn" onclick="event.stopPropagation(); startEditList('${l.listId}')" title="Edit">✏️</button>
               <button class="list-action-btn danger" onclick="event.stopPropagation(); deleteList('${l.listId}')" title="Delete">🗑</button>` : ""}
      <button class="list-expand-btn" onclick="toggleListExpanded('${l.listId}')">${isExpanded ? "▲" : "▼"}</button>
    </div>`;

  const body = isExpanded ? `
    <div class="list-body">
      ${movieCount === 0
        ? `<div class="empty" style="padding:1rem">No movies in this list yet — add some from Rankings!</div>`
        : (l.movieIds || []).map((mid, i) => {
            const movie = movies.find(m => m.movieId === mid);
            return movie ? buildCard(movie, i + 1, "list", l.listId) : "";
          }).join("")
      }
    </div>` : "";

  return `<div class="list-panel" data-list-id="${l.listId}"
      draggable="true"
      ondragstart="onListDragStart(event,'${l.listId}')"
      ondragover="onListDragOver(event,'${l.listId}')"
      ondrop="onListDrop(event,'${l.listId}')"
      ondragend="onListDragEnd()">
    <div class="list-header${isEditing ? " editing" : ""}">
      <div class="list-drag-grip" title="Drag to reorder" onclick="event.stopPropagation()">
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg>
      </div>
      ${headerContent}
    </div>
    ${body}
  </div>`;
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
    data = data.map(m => (pendingVotes.has(m.movieId) || pendingSeen.has(m.movieId)) ? (movies.find(l => l.movieId === m.movieId) || m) : m);
    if (JSON.stringify(data) !== JSON.stringify(movies)) { movies = data; render(); }
  } catch (e) { document.getElementById("movieList").innerHTML = '<div class="empty">Could not load movies. Try refreshing.</div>'; }
}
async function loadQueue() {
  try {
    const res = await fetch(`${API}/queue`), data = await res.json();
    const ids = data.movieIds || [];
    if (!pendingQueue.size && JSON.stringify(ids) !== JSON.stringify(queueIds)) { queueIds = ids; render(); }
  } catch (e) { console.error("Failed to load queue:", e); }
}
async function loadLists() {
  try {
    const res  = await fetch(`${API}/lists`), data = await res.json();
    if (JSON.stringify(data.lists) !== JSON.stringify(lists)) { lists = data.lists || []; listOrder = data.listOrder || []; render(); }
  } catch (e) { console.error("Failed to load lists:", e); }
}
async function loadWatched() {
  try {
    const res = await fetch(`${API}/watched`), data = await res.json();
    const ids = data.movieIds || [];
    if (JSON.stringify(ids) !== JSON.stringify(watchedIds)) { watchedIds = ids; render(); }
  } catch (e) { console.error("Failed to load watched:", e); }
}
async function loadAll() {
  await Promise.all([loadMovies(), loadQueue(), loadLists(), loadWatched(), loadChat()]);
  movies.forEach(m => { if (cardComments[m.movieId] === undefined) fetchComments(m.movieId); });
}
function startPolling() {
  let interval = setInterval(loadAll, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearInterval(interval);
    else { loadAll(); interval = setInterval(loadAll, 5000); }
  });
}

function escHtml(str = "") {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function buildPagination(current, total) {
  const btn = (label, page, disabled = false, active = false) =>
    `<button class="page-btn${active ? " active" : ""}" ${disabled ? "disabled" : `onclick="goToPage(${page})"`}>${label}</button>`;

  let nums = "";
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
      nums += btn(i, i, false, i === current);
    } else if (i === current - 3 || i === current + 3) {
      nums += `<span class="page-ellipsis">…</span>`;
    }
  }

  return `<div class="pagination">
    ${btn("← Prev", current - 1, current === 1)}
    ${nums}
    ${btn("Next →", current + 1, current === total)}
  </div>`;
}

function goToPage(page) {
  rankingsPage = page;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

updateAuthUI();
initTouchDrag();

// Apply saved chat state on load
if (chatMinimized) {
  document.getElementById("chatPanel").classList.add("minimized");
  document.getElementById("chatToggleBtn").textContent = "◀";
  if (window.innerWidth > 900) {
    document.querySelector(".page-wrapper").style.marginRight = "0";
  }
}

loadAll().then(() => {
  startPolling();
  if (!chatMinimized) {
    const _allMsgs = [...olderMessages, ...chatMessages];
    if (_allMsgs.length) localStorage.setItem("chatLastSeenAt", _allMsgs[_allMsgs.length - 1].createdAt);
    scrollChatToBottom();
  }
});

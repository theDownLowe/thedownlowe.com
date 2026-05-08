/* ── Config ───────────────────────────────────────────────────────────────── */
// Update API_BASE to match your API Gateway URL (same as the movies app endpoint)
const API_BASE = "https://pujum14h27.execute-api.us-west-2.amazonaws.com/jaxons-treasures";

/* ── State ────────────────────────────────────────────────────────────────── */
let token       = localStorage.getItem("jt_token");
let activeView  = "dashboard";
let itemsCache  = [];
let dealsCache  = [];
let inventoryState = { filter: "", categories: [], onlyInStock: false, onlyOutOfStock: false, sort: "name-asc" };
let settingsState  = { categoryOrder: JSON.parse(localStorage.getItem("jt_category_order") || "[]") };

/* ── API Client ───────────────────────────────────────────────────────────── */
async function apiFetch(method, path, data) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (token) opts.headers["Authorization"] = `Bearer ${token}`;
  if (data)  opts.body = JSON.stringify(data);
  const res  = await fetch(`${API_BASE}${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

const api = {
  login:           (pw)        => apiFetch("POST", "/auth/login", { password: pw }),

  getItems:        ()          => apiFetch("GET",  "/items"),
  getItem:         (id)        => apiFetch("GET",  `/items/${id}`),
  createItem:      (d)         => apiFetch("POST", "/items", d),
  updateItem:      (id, d)     => apiFetch("PUT",  `/items/${id}`, d),
  deleteItem:      (id)        => apiFetch("DELETE",`/items/${id}`),
  sellItem:        (id, d)     => apiFetch("POST", `/items/${id}/sell`, d),
  getImageUrl:     (id)        => apiFetch("POST", `/items/${id}/image-url`),

  getCarts:        ()          => apiFetch("GET",  "/carts"),
  createCart:      (d)         => apiFetch("POST", "/carts", d),
  getCart:         (id)        => apiFetch("GET",  `/carts/${id}`),
  updateCart:      (id, d)     => apiFetch("PUT",  `/carts/${id}`, d),
  checkoutCart:    (id)        => apiFetch("POST", `/carts/${id}/checkout`),
  deleteCart:      (id)        => apiFetch("DELETE",`/carts/${id}`),

  getTransactions: (params)    => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch("GET", `/transactions${qs}`);
  },
  updateTransaction: (id, d)   => apiFetch("PUT",  `/transactions/${id}`, d),
  deleteTransaction: (id)      => apiFetch("DELETE",`/transactions/${id}`),

  getRevenueToday: ()          => apiFetch("GET",  "/revenue/today"),
  getRevenue:      ()          => apiFetch("GET",  "/revenue"),

  getDeals:        ()          => apiFetch("GET",  "/deals"),
  createDeal:      (d)         => apiFetch("POST", "/deals", d),
  updateDeal:      (id, d)     => apiFetch("PUT",  `/deals/${id}`, d),
  deleteDeal:      (id)        => apiFetch("DELETE",`/deals/${id}`),
};

/* ── Toast ────────────────────────────────────────────────────────────────── */
let toastTimer;
function toast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className   = type ? `toast-${type}` : "";
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
}

/* ── Modal ────────────────────────────────────────────────────────────────── */
function openModal(title, bodyHtml, { onClose } = {}) {
  document.getElementById("modal-content").innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <h2>${title}</h2>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>
  `;
  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-close-btn").onclick = closeModal;
  document.getElementById("modal-overlay").onclick = (e) => {
    if (e.target === document.getElementById("modal-overlay")) closeModal();
  };
  if (onClose) document.getElementById("modal-overlay")._onClose = onClose;
}

function closeModal() {
  const overlay = document.getElementById("modal-overlay");
  overlay.classList.add("hidden");
  if (overlay._onClose) { overlay._onClose(); overlay._onClose = null; }
}

/* ── Navigation ───────────────────────────────────────────────────────────── */
function navigate(view, params = {}) {
  activeView = view;
  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  const views = { dashboard, inventory, carts, history, settings };
  if (views[view]) views[view](params);
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmt(n) {
  return "$" + Number(n || 0).toFixed(2);
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit" });
}

function fmtShortDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function setView(html) {
  document.getElementById("view-root").innerHTML = html;
}

function itemThumbHtml(item) {
  if (item.imageUrl) {
    return `<div class="item-thumb"><img src="${item.imageUrl}" alt="" /></div>`;
  }
  return `<div class="item-thumb">📦</div>`;
}

function stockClass(qty) {
  if (qty === 0) return "item-stock-low";
  if (qty <= 3)  return "item-stock-low";
  return "item-stock-ok";
}

function stockLabel(qty) {
  if (qty === 0)  return "Out of stock";
  if (qty === 1)  return "1 left";
  return `${qty} in stock`;
}

function spinnerHtml() {
  return `<div class="spinner-wrap"><div class="spinner"></div></div>`;
}

/* ── Login View ───────────────────────────────────────────────────────────── */
function showLogin() {
  document.getElementById("bottom-nav").classList.add("hidden");
  document.getElementById("logout-btn").classList.add("hidden");
  document.getElementById("settings-btn").classList.add("hidden");
  setView(`
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-logo">💎</div>
        <div class="login-title">Jaxon's Treasures</div>
        <div class="login-sub">Owner access only</div>
        <div class="form-group">
          <label for="pw-input">Password</label>
          <input type="password" id="pw-input" placeholder="Enter password" autocomplete="current-password" />
        </div>
        <button class="btn btn-primary btn-full btn-lg" id="login-btn">Sign In</button>
        <p id="login-error" style="color:var(--danger);font-size:.85rem;margin-top:12px;text-align:center;"></p>
      </div>
    </div>
  `);

  const pw  = document.getElementById("pw-input");
  const btn = document.getElementById("login-btn");

  async function doLogin() {
    const password = pw.value.trim();
    if (!password) return;
    btn.disabled = true;
    btn.textContent = "Signing in…";
    try {
      const { token: t } = await api.login(password);
      token = t;
      localStorage.setItem("jt_token", t);
      showApp();
    } catch (e) {
      document.getElementById("login-error").textContent = e.message;
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
  }

  btn.onclick = doLogin;
  pw.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  pw.focus();
}

function showApp() {
  document.getElementById("bottom-nav").classList.remove("hidden");
  document.getElementById("logout-btn").classList.remove("hidden");
  document.getElementById("settings-btn").classList.remove("hidden");

  const params = new URLSearchParams(window.location.search);
  const scanId = params.get("scan");
  if (scanId) {
    // Navigate to inventory and open the sell modal for the scanned item
    navigate("inventory");
    api.getItem(scanId)
      .then(({ item }) => openSellModal(item))
      .catch(() => toast("Item not found", "error"));
  } else {
    navigate("dashboard");
  }
}

/* ── Dashboard View ───────────────────────────────────────────────────────── */
async function dashboard() {
  setView(spinnerHtml());
  try {
    const [todayData, itemsData] = await Promise.all([
      api.getRevenueToday(),
      api.getItems(),
    ]);
    itemsCache = itemsData.items;

    const lowStock = itemsCache.filter(i => i.quantity <= 3 && i.quantity > 0);
    const outStock = itemsCache.filter(i => i.quantity === 0);
    const recent   = (todayData.transactions || []).slice(0, 5);

    setView(`
      <div class="stat-grid">
        <div class="stat-card">
          <div class="label">Today's Revenue</div>
          <div class="value">${fmt(todayData.totalRevenue)}</div>
          <div class="sub">${todayData.unitsSold} item${todayData.unitsSold !== 1 ? "s" : ""} sold</div>
        </div>
        <div class="stat-card">
          <div class="label">Inventory</div>
          <div class="value">${itemsCache.reduce((s, i) => s + (Number(i.quantity) || 0), 0)}</div>
          <div class="sub">${outStock.length} type${outStock.length !== 1 ? "s" : ""} out of stock</div>
        </div>
      </div>

      ${outStock.length || lowStock.length ? `
        <div class="section" style="padding-bottom:4px">
          <button class="stock-alert-header" id="stock-alert-toggle" aria-expanded="false">
            <span>⚠️ Stock Alerts</span>
            <span class="stock-alert-summary">
              ${outStock.length ? `<span class="stock-chip stock-chip-out">${outStock.length} out of stock</span>` : ""}
              ${lowStock.length ? `<span class="stock-chip stock-chip-low">${lowStock.length} low stock</span>` : ""}
            </span>
            <span class="stock-alert-chevron">▾</span>
          </button>
          <div class="stock-alert-body" id="stock-alert-body" hidden>
            <div class="stock-chip-grid">
              ${outStock.map(i => `<span class="stock-chip stock-chip-out" title="Out of stock">🔴 ${i.name}</span>`).join("")}
              ${lowStock.map(i => `<span class="stock-chip stock-chip-low" title="${i.quantity} left">🟡 ${i.name} (${i.quantity})</span>`).join("")}
            </div>
          </div>
        </div>` : ""}

      <div class="section-header">
        <h2>Today's Sales</h2>
      </div>
      ${recent.length ? `
        <div class="tx-list">
          ${recent.map(tx => `
            <div class="tx-row">
              <div class="tx-row-info">
                <div class="tx-row-name">${tx.itemName}</div>
                <div class="tx-row-meta">×${tx.quantity} · ${fmtDate(tx.soldAt)}</div>
              </div>
              <div class="tx-row-amount">${fmt(tx.total)}</div>
            </div>`).join("")}
        </div>` : `
        <div class="empty-state">
          <div class="empty-state-icon">📊</div>
          <p>No sales today yet. Tap any item in Inventory to record a sale.</p>
        </div>`}
    `);

    document.getElementById("stock-alert-toggle")?.addEventListener("click", () => {
      const body    = document.getElementById("stock-alert-body");
      const toggle  = document.getElementById("stock-alert-toggle");
      const open    = body.hidden;
      body.hidden   = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.querySelector(".stock-alert-chevron").textContent = open ? "▴" : "▾";
    });
  } catch (e) {
    setView(`<div class="empty-state"><p>Error loading dashboard: ${e.message}</p></div>`);
  }
}

/* ── Sell / Scan View ─────────────────────────────────────────────────────── */
/* ── Sell Modal (opened from inventory card tap or QR scan) ───────────────── */
function openSellModal(item) {
  let current = { ...item };

  function bodyHtml() {
    return `
      <div style="display:flex;gap:14px;align-items:flex-start;padding:0 0 16px;border-bottom:1px solid var(--border);margin-bottom:16px">
        ${current.imageUrl
          ? `<div class="selected-item-img"><img src="${current.imageUrl}" alt="" /></div>`
          : `<div class="selected-item-img">📦</div>`}
        <div style="flex:1;min-width:0">
          <div class="selected-item-price">${fmt(current.price)}</div>
          <div class="selected-item-stock ${stockClass(current.quantity)}">${stockLabel(current.quantity)}</div>
          ${current.category ? current.category.split(",").map(c=>c.trim()).filter(Boolean).map(c=>`<span class="badge badge-ocean" style="margin-right:4px">${c}</span>`).join("") : ""}
        </div>
      </div>

      <div class="form-group">
        <label>Quantity</label>
        <div class="qty-control">
          <button class="qty-btn" id="sm-minus">−</button>
          <input type="number" class="qty-value" id="sm-qty" value="1" min="1" max="${current.quantity}" />
          <button class="qty-btn" id="sm-plus">+</button>
        </div>
      </div>
      <div class="form-group">
        <label>Sale Price <span style="font-weight:400;color:var(--text-muted)">(default: ${fmt(current.price)})</span></label>
        <input type="number" id="sm-price" value="${current.price}" step="0.01" min="0" />
      </div>
      <div class="form-group">
        <label>Note <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
        <input type="text" id="sm-note" placeholder="e.g. discount applied" />
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
        <button class="btn btn-primary btn-full btn-lg" id="sm-sell-btn" ${current.quantity === 0 ? "disabled" : ""}>
          ⚡ Quick Sell
        </button>
        <button class="btn btn-secondary btn-full" id="sm-cart-btn" ${current.quantity === 0 ? "disabled" : ""}>
          🧾 Add to Cart
        </button>
      </div>
    `;
  }

  function rebind() {
    document.getElementById("sm-minus").onclick = () => {
      const inp = document.getElementById("sm-qty");
      inp.value = Math.max(1, Number(inp.value) - 1);
    };
    document.getElementById("sm-plus").onclick = () => {
      const inp = document.getElementById("sm-qty");
      inp.value = Math.min(current.quantity, Number(inp.value) + 1);
    };
    document.getElementById("sm-sell-btn").onclick = async () => {
      const qty   = Number(document.getElementById("sm-qty").value);
      const price = Number(document.getElementById("sm-price").value);
      const note  = document.getElementById("sm-note").value;
      const btn   = document.getElementById("sm-sell-btn");
      btn.disabled = true; btn.textContent = "Recording…";
      try {
        const { transaction, remainingStock } = await api.sellItem(current.itemId, {
          quantity: qty, priceOverride: price, note,
        });
        const idx = itemsCache.findIndex(i => i.itemId === current.itemId);
        if (idx > -1) itemsCache[idx] = { ...itemsCache[idx], quantity: remainingStock };
        toast(`Sold ${qty}× ${current.name} for ${fmt(transaction.total)}`, "success");
        closeModal();
      } catch (e) {
        toast(e.message, "error");
        btn.disabled = false; btn.textContent = "⚡ Quick Sell";
      }
    };
    document.getElementById("sm-cart-btn").onclick = async () => {
      const qty   = Number(document.getElementById("sm-qty").value);
      const price = Number(document.getElementById("sm-price").value);
      const line  = { itemId: current.itemId, name: current.name, quantity: qty, price };
      let cartsData;
      try { cartsData = await api.getCarts(); } catch { cartsData = { carts: [] }; }
      const openCarts = cartsData.carts;

      openModal("Add to Cart", `
        ${openCarts.length ? `
          <p style="font-size:.9rem;color:var(--text-muted);margin-bottom:12px">Choose a cart or create a new one:</p>
          ${openCarts.map(c => `
            <button class="btn btn-secondary btn-full" style="margin-bottom:8px;justify-content:space-between" data-cart-id="${c.cartId}">
              <span>${c.customerName || "Unnamed Cart"}</span>
              <span style="color:var(--text-muted)">${fmt(c.total)} · ${c.lines.reduce((s,l)=>s+Number(l.quantity),0)} items</span>
            </button>`).join("")}
          <div class="divider" style="margin:12px 0"></div>` : ""}
        <button class="btn btn-primary btn-full" id="new-cart-btn">+ Create New Cart</button>
      `);

      document.querySelectorAll("[data-cart-id]").forEach(b => {
        b.onclick = async () => { await addLineToCart(b.dataset.cartId, line); closeModal(); };
      });
      document.getElementById("new-cart-btn").onclick = async () => {
        try {
          const { cart } = await api.createCart({});
          await addLineToCart(cart.cartId, line);
          closeModal();
          toast("Added to new cart", "success");
        } catch (e) { toast(e.message, "error"); }
      };
    };
  }

  openModal(current.name, bodyHtml());
  rebind();
}

async function addLineToCart(cartId, line) {
  try {
    const { cart } = await api.getCart(cartId);
    const lines    = [...(cart.lines || [])];
    const existing = lines.find(l => l.itemId === line.itemId && l.price === line.price);
    if (existing) existing.quantity += line.quantity;
    else          lines.push(line);
    await api.updateCart(cartId, { lines });
    toast("Added to cart", "success");
  } catch (e) { toast(e.message, "error"); }
}

/* ── Inventory View ───────────────────────────────────────────────────────── */
async function inventory() {
  inventoryState = { filter: "", categories: [], onlyInStock: false, onlyOutOfStock: false, sort: "name-asc" };
  setView(spinnerHtml());
  try {
    const { items } = await api.getItems();
    itemsCache = items;
    renderInventoryList(items);
  } catch (e) {
    setView(`<div class="empty-state"><p>Error: ${e.message}</p></div>`);
  }
}

/* ── Inventory helpers ────────────────────────────────────────────────────── */

function getInventoryCategories() {
  const cats = new Set();
  itemsCache.forEach(i => {
    (i.category || "").split(",").map(c => c.trim()).filter(Boolean).forEach(c => cats.add(c));
  });
  const allCats = [...cats];
  const ordered = settingsState.categoryOrder.filter(c => allCats.includes(c));
  const rest    = allCats.filter(c => !ordered.includes(c)).sort();
  return [...ordered, ...rest];
}

function applyInventoryFilters(items) {
  const { filter, categories, onlyInStock, onlyOutOfStock } = inventoryState;
  let result = [...items];

  if (filter) {
    const q = filter.toLowerCase();
    result = result.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.category || "").toLowerCase().includes(q));
  }
  if (categories.length) {
    result = result.filter(i => {
      const itemCats = (i.category || "").split(",").map(c => c.trim().toLowerCase());
      return categories.some(c => itemCats.includes(c.toLowerCase()));
    });
  }
  if (onlyInStock)     result = result.filter(i => i.quantity > 0);
  if (onlyOutOfStock)  result = result.filter(i => i.quantity === 0);

  result.sort((a, b) => {
    switch (inventoryState.sort) {
      case "name-asc":   return (a.name ?? "").localeCompare(b.name ?? "");
      case "name-desc":  return (b.name ?? "").localeCompare(a.name ?? "");
      case "price-asc":  return (a.price ?? 0) - (b.price ?? 0);
      case "price-desc": return (b.price ?? 0) - (a.price ?? 0);
      case "stock-asc":  return (a.quantity ?? 0) - (b.quantity ?? 0);
      case "stock-desc": return (b.quantity ?? 0) - (a.quantity ?? 0);
      default:           return 0;
    }
  });

  return result;
}

function categoryPillsHtml() {
  const allCats = getInventoryCategories();
  return allCats.map(c =>
    `<button class="filter-pill-btn${inventoryState.categories.includes(c) ? " active" : ""}" data-cat="${c}">${c}</button>`
  ).join("");
}

function bindCategoryPills() {
  document.querySelectorAll("[data-cat]").forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.cat;
      const idx = inventoryState.categories.indexOf(cat);
      if (idx === -1) inventoryState.categories.push(cat);
      else            inventoryState.categories.splice(idx, 1);
      btn.classList.toggle("active", inventoryState.categories.includes(cat));
      renderInventoryList(itemsCache);
    });
  });
}

function inventoryFilterBarHtml() {
  const { onlyInStock, onlyOutOfStock, sort } = inventoryState;
  return `
    <div class="inv-filter-bar" id="inv-filter-bar">
      <select id="inv-sort-select" class="filter-pill-select">
        <option value="name-asc"  ${sort === "name-asc"   ? "selected" : ""}>Name A→Z</option>
        <option value="name-desc" ${sort === "name-desc"  ? "selected" : ""}>Name Z→A</option>
        <option value="price-asc" ${sort === "price-asc"  ? "selected" : ""}>Price ↑</option>
        <option value="price-desc"${sort === "price-desc" ? "selected" : ""}>Price ↓</option>
        <option value="stock-asc" ${sort === "stock-asc"  ? "selected" : ""}>Stock ↑</option>
        <option value="stock-desc"${sort === "stock-desc" ? "selected" : ""}>Stock ↓</option>
      </select>
      <button id="inv-stock-btn" class="filter-pill-btn${onlyInStock ? " active" : ""}">In stock</button>
      <button id="inv-oos-btn" class="filter-pill-btn${onlyOutOfStock ? " active" : ""}">Out of stock</button>
      <div id="inv-cat-pills" style="display:contents">${categoryPillsHtml()}</div>
    </div>`;
}

function inventoryItemsHtml(filtered) {
  const hasFilters = inventoryState.filter || inventoryState.categories.length || inventoryState.onlyInStock || inventoryState.onlyOutOfStock;
  return filtered.length ? `
    <div class="item-list" style="padding-top:4px;padding-bottom:80px">
      ${filtered.map(item => `
        <div class="item-card" data-item-id="${item.itemId}">
          ${itemThumbHtml(item)}
          <div class="item-info">
            <div class="item-name">${item.name}</div>
            <div class="item-meta">
              <span class="item-price">${fmt(item.price)}</span>
              <span style="margin:0 6px">·</span>
              <span class="${stockClass(item.quantity)}">${stockLabel(item.quantity)}</span>
            </div>
            ${item.category ? `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">${item.category.split(",").map(c=>c.trim()).filter(Boolean).map(c=>`<span class="badge badge-ocean">${c}</span>`).join("")}</div>` : ""}
          </div>
          <div class="item-actions" onclick="event.stopPropagation()">
            <button class="btn btn-ghost" style="padding:4px 8px" data-edit="${item.itemId}">Edit</button>
            <button class="btn btn-ghost" style="padding:4px 8px;color:var(--text-muted)" data-qr="${item.itemId}">QR</button>
          </div>
        </div>`).join("")}
    </div>` : `
    <div class="empty-state">
      <div class="empty-state-icon">📦</div>
      <p>${hasFilters ? "No items match your filters." : "No items yet. Tap + to add your first product."}</p>
    </div>`;
}

function bindInventoryCards() {
  document.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => {
      const item = itemsCache.find(i => i.itemId === btn.dataset.edit);
      if (item) openItemModal(item);
    };
  });
  document.querySelectorAll("[data-qr]").forEach(btn => {
    btn.onclick = () => {
      const item = itemsCache.find(i => i.itemId === btn.dataset.qr);
      if (item) openQrModal(item);
    };
  });
  document.querySelectorAll(".item-card[data-item-id]").forEach(card => {
    card.onclick = () => {
      const item = itemsCache.find(i => i.itemId === card.dataset.itemId);
      if (item) openSellModal(item);
    };
  });
}

function renderInventoryList(items) {
  const filtered = applyInventoryFilters(items);

  // Partial update: only replace results so the mobile keyboard stays open
  // while the user is typing, and all filter controls keep their state.
  if (document.getElementById("inv-search")) {
    document.getElementById("inv-results").innerHTML = inventoryItemsHtml(filtered);
    bindInventoryCards();
    // Refresh category pills in case items were added or removed
    const catPills = document.getElementById("inv-cat-pills");
    if (catPills) {
      catPills.innerHTML = categoryPillsHtml();
      bindCategoryPills();
    }
    return;
  }

  // Full render on initial load
  setView(`
    <div style="display:flex;gap:8px;padding:16px 16px 8px">
      <button class="btn btn-secondary" style="flex:1;min-height:38px;font-size:.82rem" id="inv-import-btn">📥 Bulk Import</button>
      <button class="btn btn-secondary" style="flex:1;min-height:38px;font-size:.82rem" id="inv-deals-btn">🏷️ Deals</button>
    </div>
    <div class="section" style="padding-top:0;padding-bottom:4px">
      <input type="text" id="inv-search" placeholder="Search inventory…"
             value="${inventoryState.filter}" />
    </div>
    ${inventoryFilterBarHtml()}
    <div id="inv-results">${inventoryItemsHtml(filtered)}</div>

    <button class="fab" id="inv-add-btn" title="Add item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  `);

  document.getElementById("inv-search").addEventListener("input", (e) => {
    inventoryState.filter = e.target.value;
    renderInventoryList(itemsCache);
  });

  bindCategoryPills();

  document.getElementById("inv-stock-btn").addEventListener("click", () => {
    inventoryState.onlyInStock = !inventoryState.onlyInStock;
    if (inventoryState.onlyInStock) inventoryState.onlyOutOfStock = false;
    document.getElementById("inv-stock-btn").classList.toggle("active", inventoryState.onlyInStock);
    document.getElementById("inv-oos-btn").classList.toggle("active", false);
    renderInventoryList(itemsCache);
  });

  document.getElementById("inv-oos-btn").addEventListener("click", () => {
    inventoryState.onlyOutOfStock = !inventoryState.onlyOutOfStock;
    if (inventoryState.onlyOutOfStock) inventoryState.onlyInStock = false;
    document.getElementById("inv-oos-btn").classList.toggle("active", inventoryState.onlyOutOfStock);
    document.getElementById("inv-stock-btn").classList.toggle("active", false);
    renderInventoryList(itemsCache);
  });

  document.getElementById("inv-sort-select").addEventListener("change", (e) => {
    inventoryState.sort = e.target.value;
    renderInventoryList(itemsCache);
  });

  document.getElementById("inv-add-btn").onclick    = () => openItemModal(null);
  document.getElementById("inv-import-btn").onclick = () => openBulkUploadModal();
  document.getElementById("inv-deals-btn").onclick  = () => openDealsManagerModal();

  bindInventoryCards();
}

function openItemModal(item) {
  const isNew = !item;
  let pendingImageFile = null; // holds file for new items until after creation

  const uploadSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>`;

  openModal(isNew ? "Add Item" : "Edit Item", `
    <div class="form-group">
      <label>Name *</label>
      <input type="text" id="f-name" value="${item?.name || ""}" placeholder="Product name" />
    </div>
    <div class="form-group">
      <label>Price ($)</label>
      <input type="number" id="f-price" value="${item?.price != null ? Number(item.price).toFixed(2) : ""}" step="0.01" min="0" placeholder="0.00" />
    </div>
    <div class="form-group">
      <label>Quantity</label>
      <input type="number" id="f-qty" value="${item?.quantity ?? 0}" min="0" step="1" />
    </div>
    <div class="form-group">
      <label>Categories <span style="font-weight:400;color:var(--text-muted)">(comma-separated)</span></label>
      <input type="text" id="f-cat" value="${item?.category || ""}" placeholder="e.g. jumbo, hair-clips, accessories" />
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="f-desc" placeholder="Optional description">${item?.description || ""}</textarea>
    </div>
    <div class="form-group">
      <label>Product Image</label>
      ${item?.imageUrl
        ? `<img id="f-img-preview" src="${item.imageUrl}" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:8px" />`
        : `<img id="f-img-preview" style="display:none;width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:8px" />`}
      <label class="img-upload-label">
        ${uploadSvg}
        <span id="f-img-label">${item?.imageUrl ? "Replace image" : "Upload image"}</span>
        <input type="file" id="f-image" accept="image/*" />
      </label>
      <p id="upload-status" style="font-size:.8rem;color:var(--text-muted);margin-top:4px"></p>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
      <button class="btn btn-primary btn-full" id="save-item-btn">${isNew ? "Add Item" : "Save Changes"}</button>
      ${!isNew ? `<button class="btn btn-danger btn-full" id="delete-item-btn">Delete Item</button>` : ""}
    </div>
  `);

  const fileInput = document.getElementById("f-image");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const preview = document.getElementById("f-img-preview");
    // Show local preview immediately
    preview.src   = URL.createObjectURL(file);
    preview.style.display = "";
    document.getElementById("f-img-label").textContent = "Replace image";

    if (!isNew) {
      // Existing item — upload now
      const status = document.getElementById("upload-status");
      status.textContent = "Uploading…"; status.style.color = "var(--text-muted)";
      try {
        const { uploadUrl, imageUrl } = await api.getImageUrl(item.itemId);
        await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": "image/jpeg" } });
        await api.updateItem(item.itemId, { imageUrl });
        const idx = itemsCache.findIndex(i => i.itemId === item.itemId);
        if (idx > -1) itemsCache[idx] = { ...itemsCache[idx], imageUrl };
        status.textContent = "✓ Uploaded"; status.style.color = "var(--success)";
      } catch (e) {
        status.textContent = "Upload failed: " + e.message; status.style.color = "var(--danger)";
      }
    } else {
      // New item — hold file until after item is created
      pendingImageFile = file;
      document.getElementById("upload-status").textContent = "Image will upload after saving.";
    }
  });

  document.getElementById("save-item-btn").onclick = async () => {
    const name  = document.getElementById("f-name").value.trim();
    const price = Math.round(Number(document.getElementById("f-price").value) * 100) / 100;
    const qty   = Number(document.getElementById("f-qty").value);
    const cat   = document.getElementById("f-cat").value.trim();
    const desc  = document.getElementById("f-desc").value.trim();
    if (!name) { toast("Name is required", "error"); return; }

    const btn = document.getElementById("save-item-btn");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      if (isNew) {
        const { item: newItem } = await api.createItem({ name, price, quantity: qty, category: cat, description: desc });
        // Upload pending image if one was selected
        if (pendingImageFile) {
          try {
            btn.textContent = "Uploading image…";
            const { uploadUrl, imageUrl } = await api.getImageUrl(newItem.itemId);
            await fetch(uploadUrl, { method: "PUT", body: pendingImageFile, headers: { "Content-Type": "image/jpeg" } });
            await api.updateItem(newItem.itemId, { imageUrl });
            newItem.imageUrl = imageUrl;
          } catch { /* image upload failure is non-fatal */ }
        }
        itemsCache.push(newItem);
        itemsCache.sort((a, b) => a.name.localeCompare(b.name));
        toast(`"${name}" added`, "success");
      } else {
        const { item: updated } = await api.updateItem(item.itemId, { name, price, quantity: qty, category: cat, description: desc });
        const idx = itemsCache.findIndex(i => i.itemId === item.itemId);
        if (idx > -1) itemsCache[idx] = updated;
        toast("Saved", "success");
      }
      closeModal();
      renderInventoryList(itemsCache);
    } catch (e) {
      toast(e.message, "error");
      btn.disabled = false;
      btn.textContent = isNew ? "Add Item" : "Save Changes";
    }
  };

  if (!isNew) {
    document.getElementById("delete-item-btn").onclick = () => {
      openModal("Delete Item", `
        <p style="text-align:center;margin-bottom:20px;color:var(--text-muted)">
          Delete <strong>${item.name}</strong>? This cannot be undone.
        </p>
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" style="flex:1" onclick="closeModal()">Cancel</button>
          <button class="btn btn-danger" style="flex:1" id="confirm-delete-btn">Delete</button>
        </div>
      `);
      document.getElementById("confirm-delete-btn").onclick = async () => {
        try {
          await api.deleteItem(item.itemId);
          itemsCache = itemsCache.filter(i => i.itemId !== item.itemId);
          toast(`"${item.name}" deleted`, "success");
          closeModal();
          renderInventoryList(itemsCache);
        } catch (e) { toast(e.message, "error"); }
      };
    };
  }
}

function openQrModal(item) {
  const qrUrl    = `${window.location.origin}${window.location.pathname}?scan=${item.itemId}`;
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(qrUrl)}`;

  openModal(`QR — ${item.name}`, `
    <div class="qr-wrap">
      <img id="qr-img" src="${qrImgSrc}" width="220" height="220"
           style="border-radius:8px;border:1px solid var(--border)" alt="QR Code" />
      <p style="font-size:.75rem;color:var(--text-muted);text-align:center;word-break:break-all;max-width:260px">${qrUrl}</p>
      <button class="btn btn-primary" id="print-qr-btn">🖨️ Print QR Code</button>
    </div>
    <p style="font-size:.85rem;color:var(--text-muted);text-align:center;padding:0 8px 8px">
      Print and attach to your product. Scanning opens the sell screen directly.
    </p>
  `);

  document.getElementById("print-qr-btn").onclick = () => {
    const win = window.open("", "_blank");
    win.document.write(`
      <!DOCTYPE html><html><head><title>QR — ${item.name}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:32px}
      img{border-radius:8px}h2{margin:16px 0 4px}p{color:#777;font-size:12px}</style>
      </head><body>
      <h2>${item.name}</h2>
      <p>${fmt(item.price)}</p>
      <img src="${qrImgSrc}" width="220" height="220" />
      <p style="margin-top:12px;font-size:10px;word-break:break-all">${qrUrl}</p>
      <script>window.onload=()=>window.print()<\/script>
      </body></html>
    `);
    win.document.close();
  };
}

/* ── Carts View ───────────────────────────────────────────────────────────── */
async function carts() {
  setView(spinnerHtml());
  try {
    const { carts: openCarts } = await api.getCarts();
    renderCartsList(openCarts);
  } catch (e) {
    setView(`<div class="empty-state"><p>Error: ${e.message}</p></div>`);
  }
}

function renderCartsList(cartList) {
  setView(`
    <div class="section-header" style="padding-top:20px">
      <h2>Open Carts</h2>
    </div>
    ${cartList.length ? `
      ${cartList.map(cart => cartCardHtml(cart)).join("")}
      <div style="padding-bottom:80px"></div>` : `
      <div class="empty-state">
        <div class="empty-state-icon">🧾</div>
        <p>No open carts. Tap + to start building a customer order.</p>
      </div>`}

    <button class="fab" id="carts-fab">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  `);

  async function createNewCart() {
    try {
      const { cart } = await api.createCart({});
      openCartDetail(cart);
    } catch (e) { toast(e.message, "error"); }
  }

  document.getElementById("carts-fab").onclick = createNewCart;

  document.querySelectorAll("[data-open-cart]").forEach(btn => {
    btn.onclick = async () => {
      const cartId = btn.dataset.openCart;
      try {
        const { cart } = await api.getCart(cartId);
        openCartDetail(cart);
      } catch (e) { toast(e.message, "error"); }
    };
  });
}

function cartCardHtml(cart) {
  return `
    <div class="cart-card">
      <div class="cart-header" data-open-cart="${cart.cartId}">
        <div>
          <h3>${cart.customerName || "Unnamed Cart"}</h3>
          ${cart.customerEmail ? `<div class="cart-customer">${cart.customerEmail}</div>` : ""}
          <div class="cart-customer">${cart.lines.reduce((s, l) => s + Number(l.quantity), 0)} item${cart.lines.reduce((s, l) => s + Number(l.quantity), 0) !== 1 ? "s" : ""} · created ${fmtShortDate(cart.createdAt)}</div>
        </div>
        <div class="cart-total">${fmt(cart.total)}</div>
      </div>
    </div>`;
}

function openCartDetail(cart) {
  openModal(cart.customerName ? `Cart — ${cart.customerName}` : "Cart", `
    <div class="receipt-wrap" style="padding:0 0 8px">
      <div id="cart-lines-area">
        ${renderCartLinesHtml(cart)}
      </div>

      <div style="margin:12px 0">
        <div class="form-group">
          <label>Add item to cart</label>
          <input type="text" id="cart-item-search" placeholder="Search by name…" style="width:100%" autocomplete="off"/>
        </div>
        <div id="cart-search-results"></div>
      </div>

      <div id="cart-deals-area"></div>

      <div style="border-top:1px solid var(--border);padding-top:14px;margin-bottom:12px">
        <div class="form-group" style="margin-bottom:10px">
          <label>Customer Name <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
          <input type="text" id="cart-cust-name" value="${cart.customerName || ""}" placeholder="e.g. Jane" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>Customer Email <span style="font-weight:400;color:var(--text-muted)">(for emailing receipt)</span></label>
          <input type="email" id="cart-cust-email" value="${cart.customerEmail || ""}" placeholder="jane@example.com" />
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
        <button class="btn btn-success btn-full btn-lg" id="checkout-btn"
          ${!cart.lines.length ? "disabled" : ""}>
          ✓ Checkout — ${fmt(cart.total)}
        </button>
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" style="flex:1" id="receipt-btn">🖨️ Receipt</button>
          <button class="btn btn-secondary" style="flex:1" id="email-btn"
            ${!cart.customerEmail ? "disabled title=\"Enter a customer email above\"" : ""}>📧 Email</button>
          <button class="btn btn-danger" style="flex:1" id="cancel-cart-btn">Cancel</button>
        </div>
      </div>
    </div>
  `);

  let currentCart = { ...cart };

  function rebindLines() {
    document.getElementById("cart-lines-area").innerHTML = renderCartLinesHtml(currentCart);
    const checkout = document.getElementById("checkout-btn");
    if (checkout) {
      checkout.disabled = !currentCart.lines.length;
      checkout.textContent = `✓ Checkout — ${fmt(currentCart.total)}`;
    }

    document.querySelectorAll("[data-remove-line]").forEach(btn => {
      btn.onclick = async () => {
        const idx   = Number(btn.dataset.removeLine);
        const lines = currentCart.lines.filter((_, i) => i !== idx);
        try {
          const { cart: updated } = await api.updateCart(currentCart.cartId, { lines });
          currentCart = updated;
          rebindLines();
        } catch (e) { toast(e.message, "error"); }
      };
    });

    async function changeLineQty(idx, delta) {
      const line     = currentCart.lines[idx];
      const stock    = itemsCache.find(i => i.itemId === line.itemId)?.quantity ?? Infinity;
      const newQty   = Math.min(stock, Math.max(1, line.quantity + delta));
      if (newQty === line.quantity) {
        if (delta > 0) toast(`Only ${stock} in stock`, "error");
        return;
      }
      const lines = currentCart.lines.map((l, i) => i === idx ? { ...l, quantity: newQty } : l);
      try {
        const { cart: updated } = await api.updateCart(currentCart.cartId, { lines });
        currentCart = updated;
        rebindLines();
      } catch (e) { toast(e.message, "error"); }
    }

    document.querySelectorAll("[data-qty-down]").forEach(btn => {
      btn.onclick = () => changeLineQty(Number(btn.dataset.qtyDown), -1);
    });
    document.querySelectorAll("[data-qty-up]").forEach(btn => {
      btn.onclick = () => changeLineQty(Number(btn.dataset.qtyUp), +1);
    });

    rebindDeals();
  }

  async function rebindDeals() {
    const area = document.getElementById("cart-deals-area");
    if (!area) return;
    if (!dealsCache.length) {
      try { const { deals } = await api.getDeals(); dealsCache = deals; } catch { return; }
    }
    const applicable = getApplicableDeals(currentCart);
    if (!applicable.length) { area.innerHTML = ""; return; }

    area.innerHTML = `
      <div style="border-top:1px solid var(--border);padding:12px 0 4px">
        <div style="font-weight:700;font-size:.88rem;margin-bottom:8px;color:var(--primary)">🏷️ Available Deals</div>
        ${applicable.map((info, idx) => `
          <div class="deal-suggestion" data-deal-idx="${idx}">
            <div style="flex:1">
              <div style="font-weight:600;font-size:.88rem">${info.deal.name}</div>
              <div style="font-size:.8rem;color:var(--text-muted)">
                ${info.totalQty} items · ${fmt(info.curTotal)} → <strong style="color:var(--success)">${fmt(info.dealTotal)}</strong>
                <span style="color:var(--danger);margin-left:4px">Save ${fmt(info.savings)}</span>
              </div>
            </div>
            <button class="btn btn-primary" style="min-height:32px;padding:0 12px;font-size:.82rem" data-apply-deal="${idx}">Apply</button>
          </div>`).join("")}
      </div>`;

    area.querySelectorAll("[data-apply-deal]").forEach(btn => {
      btn.onclick = async () => {
        const info = applicable[Number(btn.dataset.applyDeal)];
        const matchIds = new Set(info.matchingLines.map(l => `${l.itemId}|${l.price}`));
        const lines = currentCart.lines.map(l =>
          matchIds.has(`${l.itemId}|${l.price}`) ? { ...l, price: Number(info.bestTier.pricePerItem) } : l
        );
        try {
          const { cart: updated } = await api.updateCart(currentCart.cartId, { lines });
          currentCart = updated;
          toast(`Deal applied — ${fmt(info.savings)} saved!`, "success");
          rebindLines();
        } catch (e) { toast(e.message, "error"); }
      };
    });
  }

  // Cart item search
  let cartSearchTimer;
  document.getElementById("cart-item-search").addEventListener("input", async (e) => {
    clearTimeout(cartSearchTimer);
    const q = e.target.value.trim().toLowerCase();
    if (!q) { document.getElementById("cart-search-results").innerHTML = ""; return; }
    cartSearchTimer = setTimeout(async () => {
      if (!itemsCache.length) {
        try { const d = await api.getItems(); itemsCache = d.items; } catch {}
      }
      const results = itemsCache.filter(i => i.name.toLowerCase().includes(q)).slice(0, 5);
      document.getElementById("cart-search-results").innerHTML = results.length ? `
        <div class="search-results" style="margin:0;border-radius:var(--radius-sm)">
          ${results.map(item => `
            <div class="search-result-item" data-add-item="${item.itemId}">
              <div style="flex:1">
                <div style="font-weight:600;font-size:.9rem">${item.name}</div>
                <div style="font-size:.8rem;color:var(--text-muted)">${fmt(item.price)} · ${stockLabel(item.quantity)}</div>
              </div>
              <button class="btn btn-ghost" style="min-height:32px">Add</button>
            </div>`).join("")}
        </div>` : "";

      document.querySelectorAll("[data-add-item]").forEach(el => {
        el.onclick = async () => {
          const item  = itemsCache.find(i => i.itemId === el.dataset.addItem);
          if (!item) return;
          const lines = [...currentCart.lines];
          const existing = lines.find(l => l.itemId === item.itemId && l.price === item.price);
          if (existing) { existing.quantity += 1; }
          else          { lines.push({ itemId: item.itemId, name: item.name, quantity: 1, price: item.price }); }
          try {
            const { cart: updated } = await api.updateCart(currentCart.cartId, { lines });
            currentCart = updated;
            rebindLines();
            document.getElementById("cart-item-search").value = "";
            document.getElementById("cart-search-results").innerHTML = "";
          } catch (e) { toast(e.message, "error"); }
        };
      });
    }, 200);
  });

  rebindLines();

  document.getElementById("checkout-btn").onclick = async () => {
    const btn = document.getElementById("checkout-btn");
    btn.disabled = true; btn.textContent = "Processing…";
    try {
      const { total } = await api.checkoutCart(currentCart.cartId);
      toast(`Checkout complete — ${fmt(total)}`, "success");
      closeModal();
      carts();
    } catch (e) {
      toast(e.message, "error");
      btn.disabled = false;
      btn.textContent = `✓ Checkout — ${fmt(currentCart.total)}`;
    }
  };

  // Name/email: save on blur, enable email button live
  const nameInput  = document.getElementById("cart-cust-name");
  const emailInput = document.getElementById("cart-cust-email");
  const emailBtn   = document.getElementById("email-btn");

  async function saveCustomerInfo() {
    const customerName  = nameInput.value.trim();
    const customerEmail = emailInput.value.trim();
    if (customerName === (currentCart.customerName || "") &&
        customerEmail === (currentCart.customerEmail || "")) return;
    try {
      const { cart: updated } = await api.updateCart(currentCart.cartId, { customerName, customerEmail });
      currentCart = updated;
      emailBtn.disabled = !customerEmail;
      emailBtn.title    = customerEmail ? "" : "Enter a customer email above";
    } catch (e) { toast(e.message, "error"); }
  }

  nameInput.addEventListener("blur",  saveCustomerInfo);
  emailInput.addEventListener("blur", saveCustomerInfo);
  emailInput.addEventListener("input", () => {
    emailBtn.disabled = !emailInput.value.trim();
    emailBtn.title    = emailInput.value.trim() ? "" : "Enter a customer email above";
  });

  document.getElementById("receipt-btn").onclick = () => printReceipt(currentCart);
  emailBtn.onclick = () => {
    if (currentCart.customerEmail) emailReceipt(currentCart);
  };

  document.getElementById("cancel-cart-btn").onclick = async () => {
    if (!confirm("Cancel this cart?")) return;
    try {
      await api.deleteCart(currentCart.cartId);
      toast("Cart cancelled");
      closeModal();
      carts();
    } catch (e) { toast(e.message, "error"); }
  };
}

function renderCartLinesHtml(cart) {
  if (!cart.lines.length) {
    return `<p style="text-align:center;color:var(--text-muted);padding:12px 0;font-size:.9rem">Cart is empty</p>`;
  }
  return `
    <div class="cart-lines">
      ${cart.lines.map((l, i) => `
        <div class="cart-line">
          <span class="cart-line-name">${l.name}<br>
            <span style="font-size:.78rem;color:var(--text-muted)">${fmt(l.price)} each</span>
          </span>
          <div class="cart-line-qty-ctrl">
            <button class="cart-qty-btn" data-qty-down="${i}">−</button>
            <span class="cart-line-qty-val">${l.quantity}</span>
            <button class="cart-qty-btn" data-qty-up="${i}">+</button>
          </div>
          <span class="cart-line-price">${fmt(l.price * l.quantity)}</span>
          <button class="cart-line-del" data-remove-line="${i}" title="Remove">×</button>
        </div>`).join("")}
      <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-weight:700">
        <span>Total</span>
        <span style="color:var(--primary)">${fmt(cart.total)}</span>
      </div>
    </div>`;
}

function printReceipt(cart) {
  const now = new Date().toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  const win = window.open("", "_blank");
  win.document.write(`
    <!DOCTYPE html><html><head><title>Receipt</title>
    <style>
      body { font-family: sans-serif; max-width: 320px; margin: 0 auto; padding: 24px; }
      h2 { text-align: center; font-size: 1.2rem; }
      p  { text-align: center; font-size: .85rem; color: #666; margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: .9rem; }
      th, td { padding: 6px 4px; text-align: left; }
      th { border-bottom: 2px solid #000; font-size: .75rem; text-transform: uppercase; }
      td { border-bottom: 1px solid #DDD; }
      td:last-child, th:last-child { text-align: right; }
      .total { display: flex; justify-content: space-between; font-weight: 700;
               font-size: 1rem; border-top: 2px solid #000; padding-top: 10px; margin-top: 8px; }
      .footer { text-align: center; font-size: .75rem; color: #999; margin-top: 20px; }
    </style>
    </head><body>
    <h2>Jaxon's Treasures</h2>
    <p>${now}</p>
    ${cart.customerName ? `<p><strong>${cart.customerName}</strong></p>` : ""}
    ${cart.customerEmail ? `<p>${cart.customerEmail}</p>` : ""}
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
      <tbody>
        ${cart.lines.map(l => `
          <tr>
            <td>${l.name}</td>
            <td>×${l.quantity}</td>
            <td>$${(l.price * l.quantity).toFixed(2)}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    <div class="total"><span>Total</span><span>$${Number(cart.total).toFixed(2)}</span></div>
    <div class="footer">Thank you for shopping with us!</div>
    <script>window.onload = () => window.print()<\/script>
    </body></html>
  `);
  win.document.close();
}

function emailReceipt(cart) {
  const lines = cart.lines.map(l =>
    `${l.name} ×${l.quantity} — $${(l.price * l.quantity).toFixed(2)}`
  ).join("\n");
  const body = encodeURIComponent(
    `Hi ${cart.customerName || "there"},\n\nHere is your receipt from Jaxon's Treasures:\n\n${lines}\n\nTotal: $${Number(cart.total).toFixed(2)}\n\nThank you!`
  );
  const subject = encodeURIComponent("Your Receipt from Jaxon's Treasures");
  window.open(`mailto:${cart.customerEmail}?subject=${subject}&body=${body}`);
}

/* ── History View ─────────────────────────────────────────────────────────── */
async function history({ date } = {}) {
  setView(`
    <div class="section-header" style="padding-top:20px">
      <h2>Transaction History</h2>
    </div>
    <div class="filter-bar">
      <input type="date" id="hist-date" value="${date || todayISO()}" />
      <button class="btn btn-secondary" id="hist-clear-btn">All Time</button>
    </div>
    <div id="hist-list">${spinnerHtml()}</div>
  `);

  document.getElementById("hist-date").addEventListener("change", (e) => {
    loadHistory(e.target.value);
  });

  document.getElementById("hist-clear-btn").onclick = () => {
    document.getElementById("hist-date").value = "";
    loadHistory(null);
  };

  loadHistory(date || todayISO());
}

async function loadHistory(date) {
  const list = document.getElementById("hist-list");
  if (!list) return;
  list.innerHTML = spinnerHtml();
  try {
    const params = date ? { date } : {};
    const { transactions } = await api.getTransactions(params);

    if (!transactions.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📊</div>
          <p>No transactions ${date ? "on this date" : "yet"}.</p>
        </div>`;
      return;
    }

    const total = transactions.reduce((s, t) => s + (t.total || 0), 0);
    const units = transactions.reduce((s, t) => s + (t.quantity || 0), 0);

    list.innerHTML = `
      <div style="padding:0 16px 8px;display:flex;gap:12px">
        <div class="stat-card" style="flex:1">
          <div class="label">Revenue</div>
          <div class="value" style="font-size:1.3rem">${fmt(total)}</div>
        </div>
        <div class="stat-card" style="flex:1">
          <div class="label">Units Sold</div>
          <div class="value" style="font-size:1.3rem">${units}</div>
        </div>
      </div>
      <div class="tx-list">
        ${transactions.map(tx => `
          <div class="tx-row" data-tx-id="${tx.transactionId}">
            <div class="tx-row-info">
              <div class="tx-row-name">${tx.itemName}</div>
              <div class="tx-row-meta">
                ×${tx.quantity} @ ${fmt(tx.salePrice)}
                · ${fmtDate(tx.soldAt)}
                ${tx.note ? `<br><em>${tx.note}</em>` : ""}
                ${tx.cartId ? `<br><span class="badge badge-purple">Cart</span>` : ""}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <div class="tx-row-amount">${fmt(tx.total)}</div>
              <button class="btn btn-ghost" style="padding:2px 6px;font-size:.78rem;min-height:28px"
                data-edit-tx="${tx.transactionId}">Edit</button>
            </div>
          </div>`).join("")}
      </div>`;

    document.querySelectorAll("[data-edit-tx]").forEach(btn => {
      btn.onclick = () => {
        const txId = btn.dataset.editTx;
        const tx   = transactions.find(t => t.transactionId === txId);
        if (tx) openEditTxModal(tx, date);
      };
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
  }
}

function openEditTxModal(tx, date) {
  openModal("Edit Transaction", `
    <p style="margin-bottom:12px;font-size:.9rem">
      <strong>${tx.itemName}</strong> · ${fmtDate(tx.soldAt)}
    </p>
    <div class="form-group">
      <label>Quantity</label>
      <input type="number" id="tx-qty" value="${tx.quantity}" min="1" step="1" />
    </div>
    <div class="form-group">
      <label>Sale Price ($)</label>
      <input type="number" id="tx-price" value="${tx.salePrice}" step="0.01" min="0" />
    </div>
    <div class="form-group">
      <label>Note</label>
      <input type="text" id="tx-note" value="${tx.note || ""}" placeholder="Optional note" />
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
      <button class="btn btn-primary btn-full" id="save-tx-btn">Save Changes</button>
      <button class="btn btn-danger btn-full" id="delete-tx-btn">Delete Transaction</button>
    </div>
  `);

  document.getElementById("save-tx-btn").onclick = async () => {
    const btn = document.getElementById("save-tx-btn");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await api.updateTransaction(tx.transactionId, {
        quantity:   Number(document.getElementById("tx-qty").value),
        salePrice:  Number(document.getElementById("tx-price").value),
        note:       document.getElementById("tx-note").value,
      });
      toast("Transaction updated", "success");
      closeModal();
      loadHistory(date);
    } catch (e) { toast(e.message, "error"); btn.disabled = false; btn.textContent = "Save Changes"; }
  };

  document.getElementById("delete-tx-btn").onclick = async () => {
    if (!confirm("Delete this transaction? The sold quantity will be returned to inventory.")) return;
    try {
      await api.deleteTransaction(tx.transactionId);
      toast("Deleted", "success");
      closeModal();
      loadHistory(date);
    } catch (e) { toast(e.message, "error"); }
  };
}

/* ── Deals utilities ──────────────────────────────────────────────────────── */
function getApplicableDeals(cart) {
  const applicable = [];
  for (const deal of dealsCache) {
    if (!deal.active) continue;
    const matchingLines = cart.lines.filter(l => {
      const item = itemsCache.find(i => i.itemId === l.itemId);
      const cats = (item?.category || "").split(",").map(c => c.trim().toLowerCase()).filter(Boolean);
      return cats.includes((deal.category || "").trim().toLowerCase());
    });
    if (!matchingLines.length) continue;
    const totalQty  = matchingLines.reduce((s, l) => s + Number(l.quantity), 0);
    const tiers     = [...(deal.tiers || [])].sort((a, b) => Number(b.minQty) - Number(a.minQty));
    const bestTier  = tiers.find(t => totalQty >= Number(t.minQty));
    if (!bestTier) continue;
    const curTotal  = matchingLines.reduce((s, l) => s + Number(l.price) * Number(l.quantity), 0);
    const dealTotal = totalQty * Number(bestTier.pricePerItem);
    const savings   = curTotal - dealTotal;
    if (savings < 0.005) continue;
    applicable.push({ deal, matchingLines, totalQty, bestTier, curTotal, dealTotal, savings });
  }
  return applicable;
}

/* ── Deals manager ────────────────────────────────────────────────────────── */
async function openDealsManagerModal() {
  if (!dealsCache.length) {
    try { const { deals } = await api.getDeals(); dealsCache = deals; } catch {}
  }
  openModal("Deals", `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${dealsCache.length ? dealsCache.map(deal => `
        <div class="deal-card">
          <div style="flex:1">
            <div style="font-weight:700">${deal.name}</div>
            <div style="font-size:.82rem;color:var(--text-muted)">
              Category: <strong>${deal.category}</strong>
              · ${(deal.tiers || []).length} tier${(deal.tiers || []).length !== 1 ? "s" : ""}
            </div>
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:2px">
              ${(deal.tiers || []).sort((a,b)=>Number(a.minQty)-Number(b.minQty)).map(t=>`${t.minQty}+: ${fmt(t.pricePerItem)}/ea`).join(" · ")}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge ${deal.active ? "badge-green" : ""}" style="${deal.active ? "" : "background:var(--danger);color:#fff"}">${deal.active ? "Active" : "Off"}</span>
            <button class="btn btn-ghost" style="min-height:32px;padding:2px 10px" data-edit-deal="${deal.dealId}">Edit</button>
          </div>
        </div>`).join("") : `
      <div class="empty-state" style="padding:32px 0">
        <div class="empty-state-icon">🏷️</div>
        <p>No deals yet. Create one to set category-based bundle pricing.</p>
      </div>`}
    </div>
    <button class="btn btn-primary btn-full" style="margin-top:16px" id="deals-new-btn">+ New Deal</button>
  `);

  document.getElementById("deals-new-btn").onclick = () => openDealModal(null);
  document.querySelectorAll("[data-edit-deal]").forEach(btn => {
    btn.onclick = () => {
      const deal = dealsCache.find(d => d.dealId === btn.dataset.editDeal);
      if (deal) openDealModal(deal);
    };
  });
}

function openDealModal(deal) {
  const isNew = !deal;
  const existingTiers = deal?.tiers?.length ? deal.tiers : [{ minQty: 1, pricePerItem: "" }];

  function tierRowHtml(t, i) {
    return `
      <div class="deal-tier-row" style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px">
        <div style="flex:1">
          <label style="font-size:.76rem;color:var(--text-muted)">Min Qty</label>
          <input type="number" class="tier-minqty" value="${t.minQty ?? 1}" min="1" step="1" />
        </div>
        <div style="flex:1">
          <label style="font-size:.76rem;color:var(--text-muted)">Price Each ($)</label>
          <input type="number" class="tier-price" value="${t.pricePerItem ?? ""}" min="0" step="0.01" placeholder="0.00" />
        </div>
        <button class="btn btn-ghost" style="color:var(--danger);padding:0 8px;min-height:40px;margin-bottom:0" data-rm-tier>✕</button>
      </div>`;
  }

  openModal(isNew ? "New Deal" : "Edit Deal", `
    <div class="form-group">
      <label>Deal Name *</label>
      <input type="text" id="d-name" value="${deal?.name || ""}" placeholder="e.g. 3 Jumbo Clips for $30" />
    </div>
    <div class="form-group">
      <label>Category Tag * <span style="font-weight:400;color:var(--text-muted)">(single tag)</span></label>
      <input type="text" id="d-cat" value="${deal?.category || ""}" placeholder="e.g. jumbo" />
      <p style="font-size:.78rem;color:var(--text-muted);margin-top:4px">Matches items whose categories include this tag (case-insensitive)</p>
    </div>
    <div class="form-group">
      <label>Pricing Tiers</label>
      <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:8px">When cart quantity of matching items ≥ Min Qty, that price per item applies.</p>
      <div id="d-tiers">${existingTiers.map((t, i) => tierRowHtml(t, i)).join("")}</div>
      <button class="btn btn-ghost" id="d-add-tier" style="margin-top:4px;min-height:36px">+ Add Tier</button>
    </div>
    ${!isNew ? `
    <div class="form-group" style="display:flex;align-items:center;gap:12px;margin-bottom:0">
      <label style="flex:1;margin:0">Active</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="d-active" ${deal.active ? "checked" : ""} style="width:18px;height:18px" />
        <span id="d-active-lbl">${deal.active ? "On" : "Off"}</span>
      </label>
    </div>` : ""}
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">
      <button class="btn btn-primary btn-full" id="d-save-btn">${isNew ? "Create Deal" : "Save Changes"}</button>
      ${!isNew ? `<button class="btn btn-danger btn-full" id="d-del-btn">Delete Deal</button>` : ""}
    </div>
  `);

  function bindRmTier() {
    document.querySelectorAll("[data-rm-tier]").forEach(btn => {
      btn.onclick = () => {
        if (document.querySelectorAll(".deal-tier-row").length > 1) btn.closest(".deal-tier-row").remove();
        else toast("A deal needs at least one tier", "error");
      };
    });
  }
  bindRmTier();

  document.getElementById("d-add-tier").onclick = () => {
    const div = document.getElementById("d-tiers");
    const idx = div.querySelectorAll(".deal-tier-row").length;
    div.insertAdjacentHTML("beforeend", tierRowHtml({ minQty: 1, pricePerItem: "" }, idx));
    bindRmTier();
  };

  if (!isNew) {
    const cb = document.getElementById("d-active");
    cb.onchange = () => { document.getElementById("d-active-lbl").textContent = cb.checked ? "On" : "Off"; };
  }

  document.getElementById("d-save-btn").onclick = async () => {
    const name     = document.getElementById("d-name").value.trim();
    const category = document.getElementById("d-cat").value.trim();
    if (!name || !category) { toast("Name and category are required", "error"); return; }

    const tierRows = [...document.querySelectorAll(".deal-tier-row")];
    const tiers = tierRows.map(row => ({
      minQty:      Number(row.querySelector(".tier-minqty").value),
      pricePerItem: Number(row.querySelector(".tier-price").value),
    })).filter(t => t.minQty >= 1);
    if (!tiers.length) { toast("Add at least one pricing tier", "error"); return; }

    const active = isNew ? true : document.getElementById("d-active").checked;
    const btn = document.getElementById("d-save-btn");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      if (isNew) {
        const { deal: created } = await api.createDeal({ name, category, tiers });
        dealsCache.push(created);
        toast("Deal created", "success");
      } else {
        const { deal: updated } = await api.updateDeal(deal.dealId, { name, category, tiers, active });
        const idx = dealsCache.findIndex(d => d.dealId === deal.dealId);
        if (idx > -1) dealsCache[idx] = updated;
        toast("Deal saved", "success");
      }
      closeModal();
      openDealsManagerModal();
    } catch (e) {
      toast(e.message, "error");
      btn.disabled = false; btn.textContent = isNew ? "Create Deal" : "Save Changes";
    }
  };

  if (!isNew) {
    document.getElementById("d-del-btn").onclick = async () => {
      if (!confirm(`Delete "${deal.name}"?`)) return;
      try {
        await api.deleteDeal(deal.dealId);
        dealsCache = dealsCache.filter(d => d.dealId !== deal.dealId);
        toast("Deal deleted", "success");
        closeModal();
        openDealsManagerModal();
      } catch (e) { toast(e.message, "error"); }
    };
  }
}

/* ── Bulk upload ──────────────────────────────────────────────────────────── */
function parseBulkData(raw) {
  const lines = raw.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep      = lines[0].includes("\t") ? "\t" : ",";
  const cols     = lines[0].split(sep).map(c => c.trim().toLowerCase().replace(/['"]/g, ""));
  const hasHdr   = cols.some(c => ["name","price","quantity","qty","category"].includes(c));
  const dataLines = hasHdr ? lines.slice(1) : lines;
  const colMap    = hasHdr ? cols : ["name","price","quantity","category","description"];
  return dataLines.map(line => {
    const v = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ""));
    const row = {};
    colMap.forEach((col, i) => row[col] = v[i] || "");
    return {
      name:        row.name || "",
      price:       parseFloat(row.price) || 0,
      quantity:    parseInt(row.quantity || row.qty) || 0,
      category:    row.category || row.categories || "",
      description: row.description || row.desc || "",
    };
  }).filter(r => r.name.trim());
}

function openBulkUploadModal() {
  openModal("Bulk Import", `
    <p style="font-size:.86rem;color:var(--text-muted);margin-bottom:12px">
      Upload a <strong>.csv</strong> file or paste rows directly.<br/>
      Columns: <code style="font-size:.8rem;background:var(--bg);padding:2px 6px;border-radius:4px">name, price, quantity, category, description</code>
    </p>
    <div class="form-group">
      <label>Upload .csv / .tsv file</label>
      <label class="img-upload-label" style="cursor:pointer">
        📄 Choose file
        <input type="file" id="bulk-file" accept=".csv,.tsv,.txt" style="display:none" />
      </label>
    </div>
    <div class="form-group">
      <label>— or paste from spreadsheet —</label>
      <textarea id="bulk-paste" rows="6" style="width:100%;font-size:.82rem;padding:8px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);color:var(--text);resize:vertical"
        placeholder="name,price,quantity,category&#10;Big Jumbo Clip,15.00,10,jumbo&#10;Mini Clip,5.00,20,mini"></textarea>
    </div>
    <div id="bulk-preview"></div>
    <div id="bulk-actions" style="display:none;margin-top:12px">
      <button class="btn btn-primary btn-full" id="bulk-import-btn">Import</button>
    </div>
  `);

  let parsedRows = [];

  function showPreview(rows) {
    parsedRows = rows;
    const preview = document.getElementById("bulk-preview");
    const actions = document.getElementById("bulk-actions");
    if (!rows.length) { preview.innerHTML = ""; actions.style.display = "none"; return; }

    preview.innerHTML = `
      <p style="font-size:.85rem;font-weight:600;margin-bottom:8px">${rows.length} item${rows.length !== 1 ? "s" : ""} to import:</p>
      <div style="overflow-x:auto;border-radius:var(--radius-sm);border:1px solid var(--border)">
        <table style="width:100%;font-size:.79rem;border-collapse:collapse">
          <thead>
            <tr style="background:var(--bg)">
              <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border)">Name</th>
              <th style="text-align:right;padding:6px 8px;border-bottom:1px solid var(--border)">Price</th>
              <th style="text-align:right;padding:6px 8px;border-bottom:1px solid var(--border)">Qty</th>
              <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border)">Category</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr style="border-bottom:${i < rows.length - 1 ? "1px solid var(--border)" : "none"}">
                <td style="padding:5px 8px">${r.name}</td>
                <td style="text-align:right;padding:5px 8px">${fmt(r.price)}</td>
                <td style="text-align:right;padding:5px 8px">${r.quantity}</td>
                <td style="padding:5px 8px;color:var(--text-muted)">${r.category || "—"}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    actions.style.display = "";
    document.getElementById("bulk-import-btn").textContent = `Import ${rows.length} Item${rows.length !== 1 ? "s" : ""}`;
  }

  document.getElementById("bulk-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById("bulk-paste").value = ev.target.result;
      showPreview(parseBulkData(ev.target.result));
    };
    reader.readAsText(file);
  });

  let pasteTimer;
  document.getElementById("bulk-paste").addEventListener("input", (e) => {
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(() => showPreview(parseBulkData(e.target.value)), 400);
  });

  document.getElementById("bulk-actions").addEventListener("click", async (e) => {
    if (e.target.id !== "bulk-import-btn") return;
    const btn = e.target;
    btn.disabled = true; btn.textContent = "Importing…";
    let ok = 0, fail = 0;
    for (const row of parsedRows) {
      try {
        const { item } = await api.createItem(row);
        itemsCache.push(item);
        ok++;
      } catch { fail++; }
    }
    itemsCache.sort((a, b) => a.name.localeCompare(b.name));
    toast(`Imported ${ok} item${ok !== 1 ? "s" : ""}${fail ? `, ${fail} failed` : ""}`, fail ? "error" : "success");
    closeModal();
    renderInventoryList(itemsCache);
  });
}

/* ── Settings View ────────────────────────────────────────────────────────── */
async function settings() {
  if (!itemsCache.length) {
    setView(spinnerHtml());
    try {
      const { items } = await api.getItems();
      itemsCache = items;
    } catch { /* render with empty cache */ }
  }
  renderSettingsView();
}

function renderSettingsView() {
  const allCats = getInventoryCategories();

  setView(`
    <div class="section-header" style="padding-top:20px">
      <h2>Settings</h2>
    </div>
    <div class="settings-page">
      <div class="settings-section">
        <div class="settings-section-title">Category Filter Order</div>
        <div class="settings-section-desc">
          Set the order categories appear in the inventory filter row.
          Categories not listed here will follow alphabetically.
        </div>
        ${allCats.length ? `
          <div id="settings-cat-list">
            ${allCats.map((cat, i) => `
              <div class="settings-cat-row" data-cat="${cat}">
                <span class="settings-cat-drag">⠿</span>
                <span class="settings-cat-label">${cat}</span>
                <div class="settings-cat-btns">
                  <button class="settings-order-btn" data-cat-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
                  <button class="settings-order-btn" data-cat-down="${i}" ${i === allCats.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
                </div>
              </div>
            `).join("")}
          </div>
        ` : `
          <p class="settings-empty">No categories yet. Add items with categories in Inventory.</p>
        `}
      </div>
    </div>
  `);

  document.querySelectorAll("[data-cat-up]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.dataset.catUp);
      if (i === 0) return;
      const arr = [...allCats];
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      settingsState.categoryOrder = arr;
      localStorage.setItem("jt_category_order", JSON.stringify(arr));
      renderSettingsView();
    };
  });

  document.querySelectorAll("[data-cat-down]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.dataset.catDown);
      if (i === allCats.length - 1) return;
      const arr = [...allCats];
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      settingsState.categoryOrder = arr;
      localStorage.setItem("jt_category_order", JSON.stringify(arr));
      renderSettingsView();
    };
  });
}

/* ── Boot ─────────────────────────────────────────────────────────────────── */
function init() {
  // Wire bottom nav
  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.onclick = () => navigate(btn.dataset.view);
  });

  // Settings
  document.getElementById("settings-btn").onclick = () => navigate("settings");

  // Logout
  document.getElementById("logout-btn").onclick = () => {
    if (!confirm("Log out?")) return;
    token = null;
    localStorage.removeItem("jt_token");
    showLogin();
  };

  if (token) {
    showApp();
  } else {
    showLogin();
  }
}

window.addEventListener("DOMContentLoaded", init);

// Expose closeModal globally so inline onclick handlers can call it
window.closeModal   = closeModal;
window.navigate     = navigate;

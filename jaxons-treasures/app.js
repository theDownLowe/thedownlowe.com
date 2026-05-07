/* ── Config ───────────────────────────────────────────────────────────────── */
// Update API_BASE to match your API Gateway URL (same as the movies app endpoint)
const API_BASE = "https://pujum14h27.execute-api.us-west-2.amazonaws.com/jaxons-treasures";

/* ── State ────────────────────────────────────────────────────────────────── */
let token       = localStorage.getItem("jt_token");
let activeView  = "dashboard";
let itemsCache  = [];

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
  const views = { dashboard, inventory, carts, history };
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
          <div class="value">${itemsCache.length}</div>
          <div class="sub">${outStock.length} out of stock</div>
        </div>
      </div>

      ${outStock.length || lowStock.length ? `
        <div class="section">
          <div class="page-title" style="font-size:.95rem">⚠️ Stock Alerts</div>
          ${outStock.map(i => `
            <div class="alert alert-warning">
              <span class="alert-icon">🔴</span>
              <span><strong>${i.name}</strong> — out of stock</span>
            </div>`).join("")}
          ${lowStock.map(i => `
            <div class="alert alert-warning">
              <span class="alert-icon">🟡</span>
              <span><strong>${i.name}</strong> — only ${i.quantity} left</span>
            </div>`).join("")}
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
          <p>No sales today yet. Scan a QR code or tap Sell to record a sale.</p>
        </div>`}

      <div class="section" style="padding-bottom:80px">
        <button class="btn btn-primary btn-full btn-lg" onclick="navigate('sell')">
          Quick Sell
        </button>
      </div>
    `);
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
          ${current.category ? `<span class="badge badge-ocean">${current.category}</span>` : ""}
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
        current = { ...current, quantity: remainingStock };
        toast(`Sold ${qty}× ${current.name} for ${fmt(transaction.total)}`, "success");
        // Re-render modal body with updated stock
        document.querySelector("#modal-content .modal-body").innerHTML = bodyHtml();
        rebind();
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
      document.getElementById("new-cart-btn").onclick = () => {
        closeModal();
        openModal("New Cart", `
          <div class="form-group">
            <label>Customer Name <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
            <input type="text" id="nc-name" placeholder="e.g. Jane" />
          </div>
          <div class="form-group">
            <label>Customer Email <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
            <input type="email" id="nc-email" placeholder="jane@example.com" />
          </div>
          <button class="btn btn-primary btn-full" id="nc-create">Create Cart</button>
        `);
        document.getElementById("nc-create").onclick = async () => {
          try {
            const { cart } = await api.createCart({
              customerName:  document.getElementById("nc-name").value,
              customerEmail: document.getElementById("nc-email").value,
            });
            await addLineToCart(cart.cartId, line);
            closeModal();
          } catch (e) { toast(e.message, "error"); }
        };
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
  setView(spinnerHtml());
  try {
    const { items } = await api.getItems();
    itemsCache = items;
    renderInventoryList(items);
  } catch (e) {
    setView(`<div class="empty-state"><p>Error: ${e.message}</p></div>`);
  }
}

function renderInventoryList(items, filter = "") {
  const filtered = filter
    ? items.filter(i =>
        i.name.toLowerCase().includes(filter.toLowerCase()) ||
        (i.category || "").toLowerCase().includes(filter.toLowerCase()))
    : items;

  setView(`
    <div class="section" style="padding-bottom:8px">
      <input type="text" id="inv-search" placeholder="Search inventory…" value="${filter}" />
    </div>
    ${filtered.length ? `
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
              ${item.category ? `<div style="margin-top:4px"><span class="badge badge-amber">${item.category}</span></div>` : ""}
            </div>
            <div class="item-actions" onclick="event.stopPropagation()">
              <button class="btn btn-ghost" style="padding:4px 8px" data-edit="${item.itemId}">Edit</button>
              <button class="btn btn-ghost" style="padding:4px 8px;color:var(--text-muted)" data-qr="${item.itemId}">QR</button>
            </div>
          </div>`).join("")}
      </div>` : `
      <div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <p>${filter ? "No items match your search." : "No items yet. Tap + to add your first product."}</p>
      </div>`}

    <button class="fab" id="inv-add-btn" title="Add item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  `);

  document.getElementById("inv-search").addEventListener("input", (e) => {
    renderInventoryList(itemsCache, e.target.value);
  });

  document.getElementById("inv-add-btn").onclick = () => openItemModal(null);

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

function openItemModal(item) {
  const isNew = !item;
  openModal(isNew ? "Add Item" : "Edit Item", `
    <div class="form-group">
      <label>Name *</label>
      <input type="text" id="f-name" value="${item?.name || ""}" placeholder="Product name" />
    </div>
    <div class="form-group">
      <label>Price ($)</label>
      <input type="number" id="f-price" value="${item?.price ?? ""}" step="0.01" min="0" placeholder="0.00" />
    </div>
    <div class="form-group">
      <label>Quantity</label>
      <input type="number" id="f-qty" value="${item?.quantity ?? 0}" min="0" step="1" />
    </div>
    <div class="form-group">
      <label>Category</label>
      <input type="text" id="f-cat" value="${item?.category || ""}" placeholder="e.g. Jewelry, Candles" />
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="f-desc" placeholder="Optional description">${item?.description || ""}</textarea>
    </div>
    ${item ? `
      <div class="form-group">
        <label>Product Image</label>
        ${item.imageUrl
          ? `<img src="${item.imageUrl}" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:8px" />`
          : ""}
        <label class="img-upload-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          ${item.imageUrl ? "Replace image" : "Upload image"}
          <input type="file" id="f-image" accept="image/*" />
        </label>
        <p id="upload-status" style="font-size:.8rem;color:var(--text-muted);margin-top:4px"></p>
      </div>` : ""}
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
      <button class="btn btn-primary btn-full" id="save-item-btn">${isNew ? "Add Item" : "Save Changes"}</button>
      ${!isNew ? `<button class="btn btn-danger btn-full" id="delete-item-btn">Delete Item</button>` : ""}
    </div>
  `);

  if (item) {
    const fileInput = document.getElementById("f-image");
    if (fileInput) {
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) return;
        const status = document.getElementById("upload-status");
        status.textContent = "Uploading…";
        try {
          const { uploadUrl, imageUrl } = await api.getImageUrl(item.itemId);
          await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": "image/jpeg" } });
          await api.updateItem(item.itemId, { imageUrl });
          const idx = itemsCache.findIndex(i => i.itemId === item.itemId);
          if (idx > -1) itemsCache[idx] = { ...itemsCache[idx], imageUrl };
          status.textContent = "✓ Image uploaded";
          status.style.color = "var(--success)";
        } catch (e) {
          status.textContent = "Upload failed: " + e.message;
          status.style.color = "var(--danger)";
        }
      });
    }
  }

  document.getElementById("save-item-btn").onclick = async () => {
    const name  = document.getElementById("f-name").value.trim();
    const price = Number(document.getElementById("f-price").value);
    const qty   = Number(document.getElementById("f-qty").value);
    const cat   = document.getElementById("f-cat").value.trim();
    const desc  = document.getElementById("f-desc").value.trim();
    if (!name) { toast("Name is required", "error"); return; }

    const btn = document.getElementById("save-item-btn");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      if (isNew) {
        const { item: newItem } = await api.createItem({ name, price, quantity: qty, category: cat, description: desc });
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
    ${cartList.length ? cartList.map(cart => cartCardHtml(cart)).join("") : `
      <div class="empty-state">
        <div class="empty-state-icon">🧾</div>
        <p>No open carts. Create one to start building a customer order.</p>
      </div>`}

    <div class="section" style="padding-bottom:80px">
      <button class="btn btn-primary btn-full" id="new-cart-top-btn">+ New Cart</button>
    </div>

    <button class="fab" style="bottom:calc(var(--nav-h) + env(safe-area-inset-bottom) + 80px)" id="carts-fab">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  `);

  function bindNewCart() {
    const handler = async () => {
      openModal("New Cart", `
        <div class="form-group">
          <label>Customer Name <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
          <input type="text" id="nc-name" placeholder="e.g. Jane" />
        </div>
        <div class="form-group">
          <label>Customer Email <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
          <input type="email" id="nc-email" placeholder="jane@example.com" />
        </div>
        <button class="btn btn-primary btn-full" id="nc-create-btn">Create Cart</button>
      `);
      document.getElementById("nc-create-btn").onclick = async () => {
        try {
          const { cart } = await api.createCart({
            customerName:  document.getElementById("nc-name").value,
            customerEmail: document.getElementById("nc-email").value,
          });
          closeModal();
          openCartDetail(cart);
        } catch (e) { toast(e.message, "error"); }
      };
    };
    document.getElementById("new-cart-top-btn").onclick = handler;
    document.getElementById("carts-fab").onclick = handler;
  }

  bindNewCart();

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
  const hasEmail = !!cart.customerEmail;

  openModal(cart.customerName ? `Cart — ${cart.customerName}` : "Cart", `
    <div class="receipt-wrap" style="padding:0 0 8px">
      ${cart.customerName || cart.customerEmail ? `
        <p style="font-size:.9rem;color:var(--text-muted);margin-bottom:12px">
          ${cart.customerName ? `<strong>${cart.customerName}</strong>` : ""}
          ${cart.customerEmail ? ` &lt;${cart.customerEmail}&gt;` : ""}
        </p>` : ""}

      <div id="cart-lines-area">
        ${renderCartLinesHtml(cart)}
      </div>

      <div style="margin:12px 0">
        <div class="form-group">
          <label>Add item to cart</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="cart-item-search" placeholder="Search by name…" style="flex:1" autocomplete="off"/>
          </div>
        </div>
        <div id="cart-search-results"></div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
        <button class="btn btn-success btn-full btn-lg" id="checkout-btn"
          ${!cart.lines.length ? "disabled" : ""}>
          ✓ Checkout — ${fmt(cart.total)}
        </button>
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" style="flex:1" id="receipt-btn">🖨️ Receipt</button>
          ${hasEmail ? `<button class="btn btn-secondary" style="flex:1" id="email-btn">📧 Email</button>` : ""}
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

  document.getElementById("receipt-btn").onclick = () => printReceipt(currentCart);

  if (hasEmail) {
    document.getElementById("email-btn").onclick = () => emailReceipt(currentCart);
  }

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
          <span class="cart-line-name">${l.name}</span>
          <span class="cart-line-qty">×${l.quantity}</span>
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
    if (!confirm("Delete this transaction? (Inventory count is NOT automatically restored)")) return;
    try {
      await api.deleteTransaction(tx.transactionId);
      toast("Deleted", "success");
      closeModal();
      loadHistory(date);
    } catch (e) { toast(e.message, "error"); }
  };
}

/* ── Boot ─────────────────────────────────────────────────────────────────── */
function init() {
  // Wire bottom nav
  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.onclick = () => navigate(btn.dataset.view);
  });

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

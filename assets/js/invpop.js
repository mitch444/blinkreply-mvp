import { createDealerSocketService } from "../../services/dealersocketService.js";

// LotPop / LotWalk lens notes:
// - Replace 260208_full.xls in the project root with a new vAuto export.
// - Update bucket constants below to tune aging/price segmentation.
// - DealerSocket hooks are stubbed in services/dealersocketService.js.

const dealerSocket = createDealerSocketService({ logger: console });

const CONFIG = {
  dataFile: "260208_full.xls",
  agingBuckets: [
    { label: "0-15", min: 0, max: 15 },
    { label: "16-30", min: 16, max: 30 },
    { label: "31-45", min: 31, max: 45 },
    { label: "46-60", min: 46, max: 60 },
    { label: "60+", min: 61, max: Infinity }
  ],
  priceBuckets: [
    { label: "< $10k", min: 0, max: 9999 },
    { label: "$10-15k", min: 10000, max: 14999 },
    { label: "$15-20k", min: 15000, max: 19999 },
    { label: "$20-30k", min: 20000, max: 29999 },
    { label: "$30k+", min: 30000, max: Infinity }
  ]
};

const state = {
  inventory: [],
  filtered: [],
  view: "retail",
  bucketMode: "aging",
  sort: "days_desc",
  search: "",
  mode: "cards",
  filters: {
    make: null,
    model: null,
    tag: null,
    daysBucket: null,
    priceBucket: null,
    outletOnly: false,
    wholesaleOnly: false
  },
  tableColumns: ["stock", "vehicle", "price", "miles", "days", "vin", "type", "tags"],
  suggestions: { makes: [], models: [], tags: [] },
  lastUpdated: null,
  autoOutletAvailable: false,
  hasTags: false
};

const els = {
  kpiCount: document.getElementById("kpiCount"),
  kpiRetail: document.getElementById("kpiRetail"),
  kpiWholesale: document.getElementById("kpiWholesale"),
  kpiOutlet: document.getElementById("kpiOutlet"),
  kpiAvgDays: document.getElementById("kpiAvgDays"),
  kpiAvgPrice: document.getElementById("kpiAvgPrice"),
  lensBadge: document.getElementById("invpopLensBadge"),
  lastUpdated: document.getElementById("invpopLastUpdated"),
  notice: document.getElementById("invpopNotice"),
  buckets: document.getElementById("invpopBuckets"),
  search: document.getElementById("invpopSearch"),
  sort: document.getElementById("invpopSort"),
  chipRow: document.getElementById("chipRow"),
  viewButtons: document.querySelectorAll(".lens-btn[data-view]"),
  bucketButtons: document.querySelectorAll(".lens-btn[data-bucket]"),
  modeButtons: document.querySelectorAll(".lens-btn[data-mode]"),
  columnChooser: document.getElementById("columnChooser")
};

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseVehicleField(value) {
  const text = String(value || "").trim();
  if (!text) return { year: 0, make: "", model: "", trim: "" };
  const parts = text.split(/\s+/);
  const year = /^\d{4}$/.test(parts[0]) ? Number(parts[0]) : 0;
  if (!year) return { year: 0, make: "", model: text, trim: "" };
  const make = parts[1] || "";
  const model = parts[2] || "";
  const trim = parts.slice(3).join(" ");
  return { year, make, model, trim };
}

function splitTags(raw) {
  if (!raw) return [];
  const parts = String(raw)
    .split(/[;,|]/)
    .map(tag => tag.trim())
    .filter(Boolean);
  return parts.length ? parts : [String(raw).trim()];
}

function isAutoOutlet(item) {
  return /\b(blot|autooutlet)\b/i.test(item.tags.join(" "));
}

function setNotice(message) {
  if (!els.notice) return;
  if (!message) {
    els.notice.hidden = true;
    els.notice.textContent = "";
    return;
  }
  els.notice.hidden = false;
  els.notice.textContent = message;
}

function getXLSX() {
  return window.XLSX;
}

function sheetToMatrix(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
}

function pickBestSheet(workbook) {
  let bestName = workbook.SheetNames[0] || "";
  let bestCount = 0;
  workbook.SheetNames.forEach(name => {
    const sheet = workbook.Sheets[name];
    const matrix = sheetToMatrix(sheet);
    const dataRows = matrix.filter(r => (r || []).some(v => String(v || "").trim() !== ""));
    if (dataRows.length > bestCount) {
      bestCount = dataRows.length;
      bestName = name;
    }
  });
  return bestName;
}

function scoreRow(row) {
  const cells = (row || []).map(v => String(v || "").trim()).filter(Boolean);
  if (cells.length < 4) return 0;
  const joined = cells.join(" ").toLowerCase();
  let score = cells.length;
  if (joined.includes("vin")) score += 10;
  if (joined.includes("stock")) score += 6;
  if (joined.includes("year")) score += 4;
  if (joined.includes("make")) score += 4;
  if (joined.includes("model")) score += 4;
  if (joined.includes("price")) score += 4;
  if (joined.includes("age") || joined.includes("days")) score += 3;
  return score;
}

function findHeaderRow(matrix) {
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const score = scoreRow(matrix[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function matrixToObjects(matrix, headerIdx) {
  if (headerIdx < 0 || !matrix[headerIdx]) return [];
  const rawHeaders = matrix[headerIdx].map(h => String(h || "").trim());
  const headers = rawHeaders.map((h, i) => (h ? h : `__col_${i}`));
  const out = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const isEmpty = row.every(v => String(v || "").trim() === "");
    if (isEmpty) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = row[c] ?? "";
    out.push(obj);
  }
  return out;
}

function findKey(headers, candidates) {
  const normalized = headers.map(h => String(h).toLowerCase().replace(/\s+/g, " ").trim());
  for (const candidate of candidates) {
    const idx = normalized.findIndex(h => h === candidate);
    if (idx >= 0) return headers[idx];
  }
  for (const candidate of candidates) {
    const idx = normalized.findIndex(h => h.includes(candidate));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function detectWholesaleKey(headers, rows) {
  const candidates = ["wholesale", "wholesaleflag", "wholesaleindicator", "retail/wholesale", "disp", "wholesale status", "type"];
  const normalized = headers.map(h => String(h).toLowerCase().replace(/\s+/g, ""));
  let idx = -1;
  for (const c of candidates) {
    idx = normalized.findIndex(h => h.includes(c.replace(/\s+/g, "")));
    if (idx >= 0) return headers[idx];
  }
  for (const header of headers) {
    const values = rows.slice(0, 50).map(r => String(r[header] || "").toLowerCase());
    if (values.some(v => v.includes("wholesale") || v === "w")) {
      console.warn("[invPop] Wholesale indicator inferred from column", header);
      return header;
    }
  }
  console.warn("[invPop] Wholesale indicator column not found. Defaulting to retail.");
  return null;
}

function detectTagsKey(headers) {
  const candidates = ["tags", "tag", "tag_list", "tag list"];
  return findKey(headers, candidates);
}

function normalizeRow(row, headers, wholesaleKey, tagsKey) {
  const get = key => row[key] ?? "";
  const vehicleKey = findKey(headers, ["vehicle"]);
  const yearKey = findKey(headers, ["year"]);
  const makeKey = findKey(headers, ["make"]);
  const modelKey = findKey(headers, ["model"]);
  const trimKey = findKey(headers, ["trim", "series"]);
  const stockKey = findKey(headers, ["stock", "stock#", "stock number"]);
  const vinKey = findKey(headers, ["vin"]);
  const priceKey = findKey(headers, ["price", "askingprice", "asking price", "list price", "internet price", "msrp"]);
  const milesKey = findKey(headers, ["miles", "odometer"]);
  const daysKey = findKey(headers, ["daysinstock", "days in stock", "age", "agedays"]);
  const dateKey = findKey(headers, ["inventory date", "date in stock", "stock date"]);
  const classKey = findKey(headers, ["class", "condition", "new/used", "used/new"]);
  const locationKey = findKey(headers, ["location", "lot", "store"]);
  const statusKey = findKey(headers, ["status", "hq status"]);

  const vehicleParsed = vehicleKey ? parseVehicleField(get(vehicleKey)) : { year: 0, make: "", model: "", trim: "" };
  const year = yearKey ? parseNumber(get(yearKey)) : vehicleParsed.year;
  const make = makeKey ? String(get(makeKey) || "") : vehicleParsed.make;
  const model = modelKey ? String(get(modelKey) || "") : vehicleParsed.model;
  const trim = trimKey ? String(get(trimKey) || "") : vehicleParsed.trim;
  const stockNumber = stockKey ? String(get(stockKey) || "") : "";
  const vin = vinKey ? String(get(vinKey) || "") : "";
  const price = priceKey ? parseNumber(get(priceKey)) : 0;
  const miles = milesKey ? parseNumber(get(milesKey)) : 0;
  let daysInStock = daysKey ? parseNumber(get(daysKey)) : 0;
  if (!daysInStock && dateKey) {
    const rawDate = get(dateKey);
    const dt = rawDate ? new Date(rawDate) : null;
    if (dt && !Number.isNaN(dt.getTime())) {
      daysInStock = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 86400000));
    }
  }

  const tags = tagsKey ? splitTags(get(tagsKey)) : [];
  const location = isAutoOutlet({ tags }) ? "outlet" : "main";
  const store = locationKey ? String(get(locationKey) || "") : "default";

  let type = "retail";
  if (wholesaleKey) {
    const raw = String(get(wholesaleKey)).toLowerCase();
    if (raw.includes("wholesale") || raw === "w" || raw.includes("whs")) type = "wholesale";
    if (raw.includes("retail") || raw === "r") type = "retail";
  }

  let isUsed = true;
  if (classKey) {
    const raw = String(get(classKey)).toLowerCase();
    if (raw.includes("new")) isUsed = false;
    if (raw.includes("used") || raw.includes("pre-owned") || raw.includes("preowned")) isUsed = true;
  }

  return {
    id: vin || stockNumber || `${year}-${make}-${model}-${Math.random().toString(36).slice(2, 7)}`,
    stockNumber,
    vin,
    year,
    make,
    model,
    trim,
    price,
    miles,
    daysInStock,
    tags,
    type,
    store,
    location,
    isUsed,
    status: statusKey ? String(get(statusKey) || "") : "",
    raw: row
  };
}

function loadInventory() {
  if (location.protocol === "file:") {
    setNotice("invPop can’t load from file://. Start a local server (e.g. `python3 -m http.server`) and open http://localhost:8000/invpop.html.");
    return;
  }
  if (!getXLSX()) {
    setNotice("SheetJS (XLSX) not found. Ensure assets/js/vendor/xlsx.full.min.js is loading.");
    return;
  }

  setNotice("Loading 260208_full.xls…");

  setTimeout(async () => {
    try {
      const res = await fetch(CONFIG.dataFile, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch ${CONFIG.dataFile} (${res.status})`);
      const buffer = await res.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = pickBestSheet(workbook);
      const sheet = workbook.Sheets[sheetName];
      const matrix = sheetToMatrix(sheet);
      const headerIdx = findHeaderRow(matrix);
      const rows = matrixToObjects(matrix, headerIdx);
      const headers = rows.length ? Object.keys(rows[0]) : [];
      if (!rows.length) {
        setNotice("No rows detected in 260208_full.xls. Ensure the export has a header row and data.");
        return;
      }

      const wholesaleKey = detectWholesaleKey(headers, rows);
      const tagsKey = detectTagsKey(headers);
      if (!tagsKey) {
        console.warn("[invPop] Tags column not found. Auto Outlet lens requires tags like 'Blot'.");
      }

      state.inventory = rows.map(row => normalizeRow(row, headers, wholesaleKey, tagsKey));
      state.lastUpdated = new Date();
      state.autoOutletAvailable = state.inventory.some(item => item.location === "outlet");
      state.hasTags = Boolean(tagsKey);
      buildSuggestions();
      renderChips();
      setNotice("");
      updateView();
    } catch (err) {
      console.error(err);
      setNotice(`Load failed: ${err.message}`);
    }
  }, 0);
}

function buildSuggestions() {
  const makeCounts = new Map();
  const modelCounts = new Map();
  const tagCounts = new Map();

  state.inventory.forEach(item => {
    if (item.make) makeCounts.set(item.make, (makeCounts.get(item.make) || 0) + 1);
    if (item.model) modelCounts.set(item.model, (modelCounts.get(item.model) || 0) + 1);
    item.tags.forEach(tag => {
      const key = tag.toLowerCase();
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });

  state.suggestions.makes = [...makeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
  state.suggestions.models = [...modelCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
  state.suggestions.tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
}

function renderChips() {
  if (!els.chipRow) return;
  els.chipRow.innerHTML = "";

  const chips = [
    { type: "prefix", value: "vin:", label: "VIN" },
    { type: "prefix", value: "stock:", label: "Stock" },
    { type: "toggle", value: "wholesale", label: "Wholesale" },
    { type: "toggle", value: "outlet", label: "Outlet" },
    { type: "days", value: "60+", label: "60+ days" },
    { type: "price", value: "<10k", label: "< $10k" }
  ];

  state.suggestions.makes.forEach(make => chips.push({ type: "make", value: make, label: make }));
  state.suggestions.models.forEach(model => chips.push({ type: "model", value: model, label: model }));
  if (state.hasTags) state.suggestions.tags.forEach(tag => chips.push({ type: "tag", value: tag, label: tag }));

  chips.forEach(chip => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "chip";
    el.textContent = chip.label;
    el.dataset.type = chip.type;
    el.dataset.value = chip.value;
    if (isChipActive(chip)) el.classList.add("is-active");
    el.addEventListener("click", () => handleChipClick(chip));
    els.chipRow.appendChild(el);
  });
}

function isChipActive(chip) {
  if (chip.type === "make") return state.filters.make === chip.value;
  if (chip.type === "model") return state.filters.model === chip.value;
  if (chip.type === "tag") return state.filters.tag === chip.value;
  if (chip.type === "days") return state.filters.daysBucket === chip.value;
  if (chip.type === "price") return state.filters.priceBucket === chip.value;
  if (chip.type === "toggle") {
    if (chip.value === "wholesale") return state.filters.wholesaleOnly;
    if (chip.value === "outlet") return state.filters.outletOnly;
  }
  return false;
}

function handleChipClick(chip) {
  if (chip.type === "prefix") {
    if (els.search) {
      els.search.value = chip.value;
      els.search.focus();
      state.search = chip.value;
      updateView();
    }
    return;
  }

  if (chip.type === "toggle") {
    if (chip.value === "wholesale") {
      state.filters.wholesaleOnly = !state.filters.wholesaleOnly;
      if (state.filters.wholesaleOnly && state.view === "retail") state.view = "all";
    }
    if (chip.value === "outlet") {
      state.filters.outletOnly = !state.filters.outletOnly;
      if (state.filters.outletOnly && state.view === "retail") state.view = "all";
    }
  }

  if (chip.type === "make") state.filters.make = state.filters.make === chip.value ? null : chip.value;
  if (chip.type === "model") state.filters.model = state.filters.model === chip.value ? null : chip.value;
  if (chip.type === "tag") state.filters.tag = state.filters.tag === chip.value ? null : chip.value;
  if (chip.type === "days") state.filters.daysBucket = state.filters.daysBucket === chip.value ? null : chip.value;
  if (chip.type === "price") state.filters.priceBucket = state.filters.priceBucket === chip.value ? null : chip.value;

  renderChips();
  updateView();
}

function parseSearch(query) {
  const tokens = query.split(/\s+/).filter(Boolean);
  const filters = {};
  const free = [];
  tokens.forEach(token => {
    const parts = token.split(":");
    if (parts.length === 2) {
      const key = parts[0].toLowerCase();
      const value = parts[1];
      if (["vin", "stock", "tag", "make", "model"].includes(key)) {
        filters[key] = value.toLowerCase();
        return;
      }
    }
    free.push(token.toLowerCase());
  });
  return { filters, free };
}

function applyFilters() {
  const { filters: searchFilters, free } = parseSearch(state.search.trim());
  let list = [...state.inventory];

  if (state.view === "retail") list = list.filter(item => item.type === "retail");
  if (state.view === "wholesale") list = list.filter(item => item.type === "wholesale");
  if (state.view === "outlet") list = list.filter(item => item.location === "outlet");

  if (state.filters.wholesaleOnly) list = list.filter(item => item.type === "wholesale");
  if (state.filters.outletOnly) list = list.filter(item => item.location === "outlet");

  const makeFilter = searchFilters.make || state.filters.make;
  const modelFilter = searchFilters.model || state.filters.model;
  const tagFilter = searchFilters.tag || state.filters.tag;

  if (makeFilter) list = list.filter(item => item.make.toLowerCase().includes(makeFilter));
  if (modelFilter) list = list.filter(item => item.model.toLowerCase().includes(modelFilter));
  if (tagFilter) list = list.filter(item => item.tags.join(" ").toLowerCase().includes(tagFilter));

  if (searchFilters.vin) list = list.filter(item => item.vin.toLowerCase().includes(searchFilters.vin));
  if (searchFilters.stock) list = list.filter(item => item.stockNumber.toLowerCase().includes(searchFilters.stock));

  if (state.filters.daysBucket) {
    const bucket = CONFIG.agingBuckets.find(b => b.label === state.filters.daysBucket || (state.filters.daysBucket === "60+" && b.max === Infinity));
    if (bucket) list = list.filter(item => item.daysInStock >= bucket.min && item.daysInStock <= bucket.max);
  }

  if (state.filters.priceBucket) {
    const bucket = CONFIG.priceBuckets.find(b => b.label.startsWith(state.filters.priceBucket) || (state.filters.priceBucket === "<10k" && b.max === 9999));
    if (bucket) list = list.filter(item => item.price >= bucket.min && item.price <= bucket.max);
  }

  if (free.length) {
    list = list.filter(item => {
      const haystack = `${item.stockNumber} ${item.vin} ${item.year} ${item.make} ${item.model} ${item.trim} ${item.tags.join(" ")}`.toLowerCase();
      return free.every(token => haystack.includes(token));
    });
  }

  list = sortList(list, state.sort);
  state.filtered = list;
}

function sortList(list, sortKey) {
  const sorted = [...list];
  switch (sortKey) {
    case "days_asc":
      sorted.sort((a, b) => a.daysInStock - b.daysInStock);
      break;
    case "price_desc":
      sorted.sort((a, b) => b.price - a.price);
      break;
    case "price_asc":
      sorted.sort((a, b) => a.price - b.price);
      break;
    case "year_desc":
      sorted.sort((a, b) => b.year - a.year);
      break;
    case "miles_asc":
      sorted.sort((a, b) => a.miles - b.miles);
      break;
    default:
      sorted.sort((a, b) => b.daysInStock - a.daysInStock);
  }
  return sorted;
}

function updateKpis() {
  const total = state.filtered.length;
  const retailCount = state.filtered.filter(i => i.type === "retail").length;
  const wholesaleCount = state.filtered.filter(i => i.type === "wholesale").length;
  const outletCount = state.filtered.filter(i => i.location === "outlet").length;
  const avgDays = total ? Math.round(state.filtered.reduce((sum, item) => sum + item.daysInStock, 0) / total) : 0;
  const avgPrice = total ? Math.round(state.filtered.reduce((sum, item) => sum + item.price, 0) / total) : 0;

  if (els.kpiCount) els.kpiCount.textContent = total.toLocaleString();
  if (els.kpiRetail) els.kpiRetail.textContent = `Retail: ${retailCount}`;
  if (els.kpiWholesale) els.kpiWholesale.textContent = `Wholesale: ${wholesaleCount}`;
  if (els.kpiOutlet) els.kpiOutlet.textContent = `Outlet: ${outletCount}`;
  if (els.kpiAvgDays) els.kpiAvgDays.textContent = avgDays ? `${avgDays} days` : "—";
  if (els.kpiAvgPrice) els.kpiAvgPrice.textContent = avgPrice ? formatCurrency(avgPrice) : "—";
}

function updateBuckets() {
  if (!els.buckets) return;
  els.buckets.innerHTML = "";

  const buckets = state.bucketMode === "price" ? CONFIG.priceBuckets : CONFIG.agingBuckets;

  buckets.forEach((bucket, index) => {
    const items = state.filtered.filter(item => itemValueInBucket(item, bucket));
    if (!items.length) return;

    const section = document.createElement("div");
    section.className = "bucket-section";

    const header = document.createElement("div");
    header.className = "bucket-header";
    const label = state.bucketMode === "price" ? `${bucket.label}` : `${bucket.label} days`;
    header.innerHTML = `<div class="bucket-title">${label}</div><div class="bucket-meta">${items.length} units</div>`;
    section.appendChild(header);

    if (state.mode === "table") {
      section.appendChild(renderTable(items));
    } else {
      section.appendChild(renderCards(items, index));
    }

    els.buckets.appendChild(section);
  });
}

function itemValueInBucket(item, bucket) {
  const value = state.bucketMode === "price" ? item.price : item.daysInStock;
  return value >= bucket.min && value <= bucket.max;
}

function renderCards(items, bucketIndex) {
  const grid = document.createElement("div");
  grid.className = "vehicle-grid";
  items.forEach(item => {
    const stockLabel = item.stockNumber ? `Stock #${item.stockNumber}` : "Stock #—";
    const vehicleName = formatVehicleName(item);
    const daysLabel = `${item.daysInStock} days`;
    const badgeClass = state.bucketMode === "aging" ? `age-${Math.min(bucketIndex, 4)}` : "";
    const tagsLabel = item.tags.slice(0, 3).join(", ");

    const card = document.createElement("div");
    card.className = `vehicle-card ${item.type === "wholesale" ? "wholesale" : ""}`;
    card.innerHTML = `
      <div class="vehicle-title">${stockLabel}</div>
      <div class="vehicle-meta">${vehicleName}</div>
      <div class="vehicle-badges">
        <span class="vehicle-badge ${badgeClass}">${daysLabel}</span>
        <span class="vehicle-badge">${item.type}</span>
        ${item.location === "outlet" ? '<span class="vehicle-badge">Outlet</span>' : ""}
        <span class="crm-pill" title="DealerSocket hooks ready (stub)">CRM ready</span>
      </div>
      <div class="vehicle-row"><span>Price</span><span>${formatCurrency(item.price)}</span></div>
      <div class="vehicle-row"><span>Miles</span><span>${item.miles.toLocaleString()}</span></div>
      <div class="vehicle-row"><span>VIN</span><span>${shortVin(item.vin)}</span></div>
      <div class="vehicle-row"><span>Tags</span><span>${tagsLabel || "—"}</span></div>
      <div class="vehicle-actions">
        <button type="button" data-copy="${item.vin}">Copy VIN</button>
        <button type="button" data-copy="${item.stockNumber}">Copy Stock</button>
        <button type="button" data-toggle="${item.id}">Details</button>
      </div>
      <div class="details-row" id="details-${item.id}" hidden>
        <span>Status: ${item.status || "—"}</span>
        <span>Store: ${item.store || "default"}</span>
        <span>Tags: ${item.tags.join(", ") || "—"}</span>
      </div>
    `;
    grid.appendChild(card);
  });
  return grid;
}

function renderTable(items) {
  const table = document.createElement("table");
  table.className = "inventory-table";
  const columns = state.tableColumns;

  const headCells = [];
  if (columns.includes("stock")) headCells.push("Stock #");
  if (columns.includes("vehicle")) headCells.push("Vehicle");
  if (columns.includes("price")) headCells.push("Price");
  if (columns.includes("miles")) headCells.push("Miles");
  if (columns.includes("days")) headCells.push("Days");
  if (columns.includes("vin")) headCells.push("VIN");
  if (columns.includes("type")) headCells.push("Type");
  if (columns.includes("tags")) headCells.push("Tags");

  table.innerHTML = `
    <thead><tr>${headCells.map(h => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  items.forEach(item => {
    const cells = [];
    if (columns.includes("stock")) cells.push(`<td>${item.stockNumber || "—"}</td>`);
    if (columns.includes("vehicle")) cells.push(`<td>${formatVehicleName(item)}</td>`);
    if (columns.includes("price")) cells.push(`<td>${formatCurrency(item.price)}</td>`);
    if (columns.includes("miles")) cells.push(`<td>${item.miles.toLocaleString()}</td>`);
    if (columns.includes("days")) cells.push(`<td>${item.daysInStock}</td>`);
    if (columns.includes("vin")) cells.push(`<td>${shortVin(item.vin)}</td>`);
    if (columns.includes("type")) cells.push(`<td>${item.type}${item.location === "outlet" ? " • Outlet" : ""}</td>`);
    if (columns.includes("tags")) cells.push(`<td>${item.tags.join(", ") || "—"}</td>`);

    const row = document.createElement("tr");
    row.innerHTML = cells.join("");
    tbody.appendChild(row);
  });

  return table;
}

function updateLensBadge() {
  if (!els.lensBadge) return;
  const viewMap = { retail: "Retail lens", wholesale: "Wholesale lens", all: "All inventory", outlet: "Auto Outlet" };
  const bucketMap = { aging: "Aging buckets", price: "Price buckets" };
  els.lensBadge.textContent = `${viewMap[state.view]} • ${bucketMap[state.bucketMode]}`;
}

function updateLastUpdated() {
  if (!els.lastUpdated || !state.lastUpdated) return;
  els.lastUpdated.textContent = `Last updated: ${state.lastUpdated.toLocaleString()}`;
}

function updateColumnChooser() {
  if (!els.columnChooser) return;
  if (state.mode !== "table") {
    els.columnChooser.hidden = true;
    return;
  }
  els.columnChooser.hidden = false;
  const columns = [
    { id: "stock", label: "Stock" },
    { id: "vehicle", label: "Vehicle" },
    { id: "price", label: "Price" },
    { id: "miles", label: "Miles" },
    { id: "days", label: "Days" },
    { id: "vin", label: "VIN" },
    { id: "type", label: "Type" },
    { id: "tags", label: "Tags" }
  ];
  els.columnChooser.innerHTML = "";
  columns.forEach(col => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = state.tableColumns.includes(col.id);
    input.addEventListener("change", () => {
      if (input.checked) {
        state.tableColumns.push(col.id);
      } else {
        state.tableColumns = state.tableColumns.filter(id => id !== col.id);
      }
      updateView();
    });
    label.appendChild(input);
    label.append(` ${col.label}`);
    els.columnChooser.appendChild(label);
  });
}

function updateView() {
  applyFilters();
  updateKpis();
  updateBuckets();
  updateLensBadge();
  updateLastUpdated();
  updateColumnChooser();
  updateNotice();
}

function formatVehicleName(item) {
  const parts = [item.year, item.make, item.model, item.trim].filter(Boolean);
  if (parts.length) return parts.join(" ").replace(/\s+/g, " ").trim();
  return item.raw?.Vehicle || "Vehicle";
}

function shortVin(vin) {
  if (!vin) return "—";
  const str = String(vin);
  return str.length > 8 ? `…${str.slice(-8)}` : str;
}

function formatCurrency(value) {
  return value
    ? value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function bindControls() {
  els.viewButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      els.viewButtons.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.view = btn.dataset.view;
      updateView();
    });
  });

  els.bucketButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      els.bucketButtons.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.bucketMode = btn.dataset.bucket;
      updateView();
    });
  });

  els.modeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      els.modeButtons.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.mode = btn.dataset.mode;
      updateView();
    });
  });

  if (els.sort) {
    els.sort.addEventListener("change", () => {
      state.sort = els.sort.value;
      updateView();
    });
  }

  if (els.search) {
    const debounced = debounce(event => {
      state.search = event.target.value;
      updateView();
    }, 300);
    els.search.addEventListener("input", debounced);
  }

  document.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.copy) {
      copyToClipboard(target.dataset.copy);
    }
    if (target.dataset.toggle) {
      const details = document.getElementById(`details-${target.dataset.toggle}`);
      if (details) details.hidden = !details.hidden;
    }
  });
}

function copyToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
  }
}

bindControls();
loadInventory();

function updateNotice() {
  let message = "";
  if (!state.hasTags && (state.view === "outlet" || state.filters.outletOnly)) {
    message = "Tags column not found. Auto Outlet lens needs a Tags column with values like 'Blot'.";
  } else if (state.view === "outlet" && state.hasTags && !state.autoOutletAvailable) {
    message = "No Auto Outlet tags found in this export. Add the 'Blot' tag to outlet units.";
  }
  setNotice(message);
}

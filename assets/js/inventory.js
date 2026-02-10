import { createDealerSocketService } from "../../services/dealersocketService.js";

// Inventory data source:
// - Replace seedInventory.xls in the project root with a new vAuto export.
// - Keep the header row intact for best field matching.
// Wholesale visibility:
// - Default view is retail-only. Use the view toggle to include wholesale or show all.
// DealerSocket hooks:
// - services/dealersocketService.js defines stubs for syncVehicle, pushLead, fetchCRMNotes.
// - inventory.js uses dependency injection for future API wiring.

const dealerSocket = createDealerSocketService({
  logger: console
});

const state = {
  inventory: [],
  filtered: [],
  view: "retail",
  sort: "days_desc",
  search: "",
  mode: "cards",
  wholesaleDetected: false,
  autoOutletAvailable: false,
  lastUpdated: null
};

const bucketDefs = [
  { label: "0-15 days", min: 0, max: 15 },
  { label: "16-30 days", min: 16, max: 30 },
  { label: "31-60 days", min: 31, max: 60 },
  { label: "61-90 days", min: 61, max: 90 },
  { label: "91+ days", min: 91, max: Infinity }
];

const els = {
  kpiTotal: document.getElementById("kpiTotal"),
  kpiRetail: document.getElementById("kpiRetail"),
  kpiAvgDays: document.getElementById("kpiAvgDays"),
  kpiStale: document.getElementById("kpiStale"),
  kpiValue: document.getElementById("kpiValue"),
  kpiValueAvg: document.getElementById("kpiValueAvg"),
  buckets: document.getElementById("inventoryBuckets"),
  search: document.getElementById("inventorySearch"),
  sort: document.getElementById("inventorySort"),
  viewButtons: document.querySelectorAll(".control-btn[data-view]"),
  modeButtons: document.querySelectorAll(".control-btn[data-mode]"),
  wholesaleBadge: document.getElementById("inventoryWholesaleBadge"),
  wholesaleBanner: document.getElementById("wholesaleBanner"),
  oldestUnits: document.getElementById("oldestUnits"),
  priceOutliers: document.getElementById("priceOutliers"),
  staleSummary: document.getElementById("staleSummary"),
  lastUpdated: document.getElementById("inventoryLastUpdated"),
  notice: document.getElementById("inventoryNotice")
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
  if (joined.includes("days")) score += 3;
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

function normalizeRow(row, headers, wholesaleKey) {
  const get = key => row[key] ?? "";
  const yearKey = findKey(headers, ["year"]);
  const makeKey = findKey(headers, ["make"]);
  const modelKey = findKey(headers, ["model"]);
  const trimKey = findKey(headers, ["trim", "series"]);
  const stockKey = findKey(headers, ["stock", "stock#", "stock number"]);
  const vinKey = findKey(headers, ["vin"]);
  const priceKey = findKey(headers, ["price", "internet price", "list price", "msrp", "advertised price", "askingprice", "asking price"]);
  const milesKey = findKey(headers, ["miles", "odometer"]);
  const daysKey = findKey(headers, ["days in stock", "daysinstock", "age", "days"]);
  const dateKey = findKey(headers, ["date in stock", "stock date", "in stock date"]);
  const photoKey = findKey(headers, ["photo", "photo url", "image"]);
  const notesKey = findKey(headers, ["notes", "comments"]);
  const vehicleKey = findKey(headers, ["vehicle"]);
  const tagsKey = findKey(headers, ["tags", "tag"]);

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
    const raw = get(dateKey);
    const dt = raw ? new Date(raw) : null;
    if (dt && !Number.isNaN(dt.getTime())) {
      daysInStock = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 86400000));
    }
  }
  const photoUrl = photoKey ? String(get(photoKey) || "") : "";
  const notes = notesKey ? String(get(notesKey) || "") : "";
  const tags = tagsKey ? String(get(tagsKey) || "") : "";

  let type = "retail";
  if (wholesaleKey) {
    const raw = String(get(wholesaleKey)).toLowerCase();
    if (raw.includes("wholesale") || raw === "w" || raw === "whs") type = "wholesale";
    if (raw.includes("retail") || raw === "r") type = "retail";
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
    type,
    photoUrl,
    notes,
    tags,
    raw: row
  };
}

function isAutoOutlet(item) {
  return /\\b(autooutlet|blot)\\b/i.test(item.tags || "");
}

function findKey(headers, candidates) {
  const normalized = headers.map(h => String(h).toLowerCase().trim());
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
  const candidates = ["wholesale", "wholesaleflag", "wholesaleindicator", "retail/wholesale"];
  const normalized = headers.map(h => String(h).toLowerCase().replace(/\s+/g, ""));
  let idx = -1;
  for (const c of candidates) {
    idx = normalized.findIndex(h => h.includes(c.replace(/\s+/g, "")));
    if (idx >= 0) return headers[idx];
  }

  // Infer from values
  for (const header of headers) {
    const values = rows.slice(0, 50).map(r => String(r[header] || "").toLowerCase());
    if (values.some(v => v.includes("wholesale") || v === "w")) {
      console.warn("[Inventory] Wholesale indicator inferred from column", header);
      return header;
    }
  }

  console.warn("[Inventory] Wholesale indicator column not found. Defaulting to retail.");
  return null;
}

function loadInventory() {
  if (location.protocol === "file:") {
    setNotice("Inventory can’t load from file://. Start a local server (e.g. `python3 -m http.server`) and open http://localhost:8000/inventory.html.");
    return;
  }

  if (!getXLSX()) {
    setNotice("Inventory load failed: XLSX library not available. Ensure assets/js/vendor/xlsx.full.min.js is loading.");
    return;
  }

  setNotice("Loading seedInventory.xls…");

  setTimeout(async () => {
    try {
      const res = await fetch("seedInventory.xls", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch seedInventory.xls (${res.status})`);
      const buffer = await res.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });

      const sheetName = pickBestSheet(workbook);
      const sheet = workbook.Sheets[sheetName];
      const matrix = sheetToMatrix(sheet);
      const headerIdx = findHeaderRow(matrix);
      const rows = matrixToObjects(matrix, headerIdx);
      const headers = rows.length ? Object.keys(rows[0]) : [];

      if (!rows.length) {
        setNotice("No rows detected in seedInventory.xls. Confirm the export has a header row and data on the first populated sheet.");
        state.inventory = [];
        updateView();
        return;
      }

      const wholesaleKey = detectWholesaleKey(headers, rows);
      state.wholesaleDetected = Boolean(wholesaleKey);

      state.inventory = rows.map(row => normalizeRow(row, headers, wholesaleKey));
      state.autoOutletAvailable = state.inventory.some(item => isAutoOutlet(item));
      state.lastUpdated = new Date();
      setNotice("");
      updateView();
    } catch (err) {
      console.error(err);
      setNotice(`Inventory load failed: ${err.message}`);
    }
  }, 0);
}

function applyFilters() {
  const query = state.search.trim().toLowerCase();
  let list = [...state.inventory];

  if (state.view === "retail") list = list.filter(item => item.type === "retail" && !isAutoOutlet(item));
  if (state.view === "wholesale") list = list.filter(item => item.type === "wholesale");
  if (state.view === "autooutlet") list = list.filter(item => isAutoOutlet(item));

  if (query) {
    list = list.filter(item => {
      const haystack = `${item.stockNumber} ${item.vin} ${item.year} ${item.make} ${item.model} ${item.trim}`.toLowerCase();
      return haystack.includes(query);
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
    default:
      sorted.sort((a, b) => b.daysInStock - a.daysInStock);
  }
  return sorted;
}

function updateKpis() {
  const total = state.filtered.length;
  const retailCount = state.inventory.filter(i => i.type === "retail").length;
  const wholesaleCount = state.inventory.filter(i => i.type === "wholesale").length;
  const avgDays = total ? Math.round(state.filtered.reduce((sum, item) => sum + item.daysInStock, 0) / total) : 0;
  const staleCount = state.filtered.filter(item => item.daysInStock >= 90).length;
  const totalValue = state.filtered.reduce((sum, item) => sum + item.price, 0);
  const avgValue = total ? Math.round(totalValue / total) : 0;

  if (els.kpiTotal) els.kpiTotal.textContent = total.toLocaleString();
  if (els.kpiRetail) {
    const wholesaleText = wholesaleCount ? ` • Wholesale: ${wholesaleCount}` : "";
    els.kpiRetail.textContent = `Retail: ${retailCount}${wholesaleText}`;
  }
  if (els.kpiAvgDays) els.kpiAvgDays.textContent = avgDays ? `${avgDays} days` : "—";
  if (els.kpiStale) els.kpiStale.textContent = `${staleCount} units`;
  if (els.kpiValue) els.kpiValue.textContent = formatCurrency(totalValue);
  if (els.kpiValueAvg) els.kpiValueAvg.textContent = avgValue ? `${formatCurrency(avgValue)} avg` : "—";

  if (els.staleSummary) els.staleSummary.textContent = `${staleCount} units`;
}

function updateOpportunities() {
  const oldest = [...state.filtered].sort((a, b) => b.daysInStock - a.daysInStock).slice(0, 5);
  const priced = [...state.filtered].filter(v => v.price > 0);
  const highest = [...priced].sort((a, b) => b.price - a.price).slice(0, 2);
  const lowest = [...priced].sort((a, b) => a.price - b.price).slice(0, 2);

  if (els.oldestUnits) {
    els.oldestUnits.innerHTML = "";
    oldest.forEach(item => {
      const row = document.createElement("div");
      row.className = "opportunity-item";
      row.innerHTML = `<span>${item.year} ${item.make} ${item.model}</span><span>${item.daysInStock}d</span>`;
      els.oldestUnits.appendChild(row);
    });
  }

  if (els.priceOutliers) {
    els.priceOutliers.innerHTML = "";
    highest.concat(lowest).forEach(item => {
      const row = document.createElement("div");
      row.className = "opportunity-item";
      row.innerHTML = `<span>${item.year} ${item.make} ${item.model}</span><span>${formatCurrency(item.price)}</span>`;
      els.priceOutliers.appendChild(row);
    });
  }
}

function updateBuckets() {
  if (!els.buckets) return;
  els.buckets.innerHTML = "";
  const hasWholesale = state.inventory.some(item => item.type === "wholesale");
  const showWholesale = (state.view === "wholesale" || state.view === "all") && hasWholesale;
  const showAutoOutlet = state.view === "autooutlet" || (state.view === "all" && state.autoOutletAvailable);
  const showBanner = showWholesale || showAutoOutlet;

  if (els.wholesaleBanner) {
    els.wholesaleBanner.hidden = !showBanner;
    if (showAutoOutlet && state.view === "autooutlet") {
      els.wholesaleBanner.textContent = "AutoOutlet tagged units are visible.";
    } else if (showWholesale && state.view === "wholesale") {
      els.wholesaleBanner.textContent = "Wholesale units are visible. Retail decisions should remain retail-first.";
    } else if (state.view === "all") {
      const parts = [];
      if (showWholesale) parts.push("Wholesale");
      if (showAutoOutlet) parts.push("AutoOutlet");
      els.wholesaleBanner.textContent = `${parts.join(" + ")} units are visible.`;
    }
  }

  if (els.wholesaleBadge) {
    if (showBanner) {
      els.wholesaleBadge.hidden = false;
      if (state.view === "autooutlet") {
        els.wholesaleBadge.textContent = "AutoOutlet view enabled";
      } else if (state.view === "wholesale") {
        els.wholesaleBadge.textContent = "Wholesale view enabled";
      } else if (state.view === "all") {
        els.wholesaleBadge.textContent = "All inventory view";
      }
    } else {
      els.wholesaleBadge.hidden = true;
    }
  }

  if (state.inventory.length) {
    if (state.view === "autooutlet" && !state.autoOutletAvailable) {
      setNotice("No AutoOutlet / BLOT tags detected in this export. Update the vAuto export tags when ready.");
    } else {
      setNotice("");
    }
  }

  bucketDefs.forEach(bucket => {
    const items = state.filtered.filter(item => item.daysInStock >= bucket.min && item.daysInStock <= bucket.max);
    if (!items.length) return;

    const section = document.createElement("div");
    section.className = "bucket-section";

    const header = document.createElement("div");
    header.className = "bucket-header";
    header.innerHTML = `<div class="bucket-title">${bucket.label}</div><div class="bucket-meta">${items.length} units</div>`;

    section.appendChild(header);

    if (state.mode === "table") {
      section.appendChild(renderTable(items));
    } else {
      section.appendChild(renderCards(items));
    }

    els.buckets.appendChild(section);
  });
}

function renderCards(items) {
  const grid = document.createElement("div");
  grid.className = "vehicle-grid";
  items.forEach(item => {
    const vehicleName = formatVehicleName(item);
    const stockLabel = item.stockNumber ? `Stock #${item.stockNumber}` : "Stock #—";
    const card = document.createElement("div");
    card.className = "vehicle-card";
    card.innerHTML = `
      <div class="vehicle-title">${stockLabel}</div>
      <div class="vehicle-meta">${vehicleName}</div>
      <div class="vehicle-meta">${item.type === "wholesale" ? "Wholesale" : "Retail"} • ${item.daysInStock} days in stock</div>
      <div class="vehicle-row"><span>Price</span><span>${formatCurrency(item.price)}</span></div>
      <div class="vehicle-row"><span>Miles</span><span>${item.miles.toLocaleString()}</span></div>
      <div class="vehicle-row"><span>VIN</span><span>${item.vin || "—"}</span></div>
      <div class="vehicle-actions">
        <button type="button" data-copy="${item.vin}">Copy VIN</button>
        <button type="button" data-copy="${item.stockNumber}">Copy Stock</button>
        <button type="button" data-note="${item.id}">Add note</button>
      </div>
    `;
    grid.appendChild(card);
  });
  return grid;
}

function renderTable(items) {
  const table = document.createElement("table");
  table.className = "inventory-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Stock #</th>
        <th>Vehicle</th>
        <th>Price</th>
        <th>Miles</th>
        <th>Days</th>
        <th>VIN</th>
        <th>Type</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  items.forEach(item => {
    const vehicleName = formatVehicleName(item);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.stockNumber || "—"}</td>
      <td>${vehicleName}</td>
      <td>${formatCurrency(item.price)}</td>
      <td>${item.miles.toLocaleString()}</td>
      <td>${item.daysInStock}</td>
      <td>${item.vin || "—"}</td>
      <td>${item.type}</td>
    `;
    tbody.appendChild(row);
  });
  return table;
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
    if (target.dataset.note) {
      alert("Notes integration stub. This will connect to DealerSocket later.");
    }
  });
}

function updateView() {
  applyFilters();
  updateKpis();
  updateOpportunities();
  updateBuckets();
  updateLastUpdated();
}

function updateLastUpdated() {
  if (!els.lastUpdated || !state.lastUpdated) return;
  els.lastUpdated.textContent = `Last updated: ${state.lastUpdated.toLocaleString()}`;
}

function formatVehicleName(item) {
  const parts = [item.year, item.make, item.model, item.trim].filter(Boolean);
  if (parts.length) return parts.join(" ").replace(/\s+/g, " ").trim();
  const fallback = item?.raw?.Vehicle || item?.raw?.vehicle;
  return fallback ? String(fallback) : "Vehicle";
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

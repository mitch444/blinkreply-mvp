let activeLead = null;
let audioContext = null;

const reps = [
  { id: 1, name: "Eric", wins: 0 },
  { id: 2, name: "Brady", wins: 0 },
  { id: 3, name: "Sumit", wins: 0 },
  { id: 4, name: "Vlad", wins: 0 },
  { id: 5, name: "Doug", wins: 0 },
  { id: 6, name: "Bob", wins: 0 },
  { id: 7, name: "Sonny", wins: 0 },
  { id: 8, name: "Marcus", wins: 0 }
];

const managers = ["Jaiden", "Kaelen", "Mitch"];

let leads = [];
let contests = [];
let contestTickInterval = null;
let toastTimeout = null;
let phoneTimer = null;
let phoneStartTime = null;
let phoneActive = false;
let realityTimer = null;
let phoneHistory = [];
let adfParseTimer = null;

function ingestLead() {
  const xml = document.getElementById("adfInput").value;

  if (!isValidXmlPayload(xml)) {
    showToast("Couldn’t parse payload — check XML formatting.", true);
    return;
  }

  runAdfExperience(xml);
  activeLead = createLead("ADF/XML");
  trackLead(activeLead);
  startContest(activeLead);
  showToast("Lead ingested. Contest started.");
}

function ingestLeadFromSource(source) {
  activeLead = createLead(source);
  trackLead(activeLead);
  startContest(activeLead);
  showToast("Lead ingested. Contest started.");
  updatePhoneMock(activeLead.source);
}

function seedDemoLeads() {
  const sources = ["AutoTrader", "Website", "Optimy", "DrivingIt", "CarGurus"];
  const count = 4;
  for (let i = 0; i < count; i++) {
    const source = sources[i % sources.length];
    const lead = createLead(source);
    trackLead(lead);
    startContest(lead);
  }
  showToast("Lead ingested. Contest started.");
}

function createLead(source) {
  const firstNames = [
    "Ava",
    "Liam",
    "Noah",
    "Mia",
    "Olivia",
    "Ethan",
    "Sophia",
    "Lucas",
    "Isabella",
    "Mason",
    "Charlotte",
    "Logan"
  ];
  const lastInitials = ["K", "P", "R", "T", "J", "S", "D", "W", "M", "H", "B", "C"];
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last = lastInitials[Math.floor(Math.random() * lastInitials.length)];
  const randomName = `${first} ${last}`;
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    customer: randomName,
    vehicle: "2024 Elantra Hybrid",
    source,
    receivedAt: new Date(),
    state: "OPEN",
    escalatedAt: null,
    escalatedEver: false,
    claimedAt: null,
    winningRep: null
  };
}

function trackLead(lead) {
  leads.push(lead);
}

function startContest(lead) {
  const contest = {
    id: lead.id,
    leadId: lead.id,
    startTime: Date.now(),
    state: "OPEN",
    escalated: false,
    claimedAt: null,
    claimedElapsedMs: null,
    winningRep: null,
    winnerShownUntil: null
  };

  contests.unshift(contest);

  renderContests();
  updateCustomerMessage();
  updateStats();
  playSound("start");
  ensureContestTick();
  startPhoneTimer(lead.source);
}

function ensureContestTick() {
  if (contestTickInterval) return;
  contestTickInterval = setInterval(tickContests, 1000);
}

function tickContests() {
  const now = Date.now();
  let hasActive = false;

  contests.forEach(contest => {
    if (contest.state === "CLAIMED") return;
    hasActive = true;

    const elapsed = now - contest.startTime;
    if (!contest.escalated && elapsed >= 180000) {
      contest.escalated = true;
      contest.state = "ESCALATED";
      const lead = findLead(contest.leadId);
      if (lead) {
        lead.state = "ESCALATED";
        lead.escalatedAt = new Date();
        lead.escalatedEver = true;
      }
      notifyManagerUnclaimed(contest);
    }
  });

  renderContests();
  refreshRelativeTimes();
  updateStats();
  updateCustomerMessage();

  if (!hasActive) {
    clearInterval(contestTickInterval);
    contestTickInterval = null;
  }
}

function claimLead(contestId, repId) {
  const contest = contests.find(c => c.id === contestId);
  if (!contest || contest.state === "CLAIMED") return alert("Lead already claimed");

  contest.state = "CLAIMED";
  contest.claimedAt = Date.now();
  contest.claimedElapsedMs = contest.claimedAt - contest.startTime;
  contest.winnerShownUntil = contest.claimedAt + 2000;
  const rep = reps.find(r => r.id === repId);
  contest.winningRep = rep;

  const lead = findLead(contest.leadId);
  if (lead) {
    lead.state = "CLAIMED";
    lead.claimedAt = new Date();
    lead.winningRep = rep;
  }

  if (contest.escalated) {
    notifyManagerResolved(contest, rep);
  }

  playSound("claim");
  sendCustomerMessage(rep);
  renderContests();
  updateCustomerMessage();
  updateStats();
  markPhoneClaimed(rep.name);
}

function renderContests() {
  const list = document.getElementById("contestList");
  if (!list) return;
  list.innerHTML = "";

  if (!contests.length) {
    list.innerText = "No active contests yet.";
    return;
  }

  const now = Date.now();
  contests.forEach(contest => {
    const lead = findLead(contest.leadId);
    const card = document.createElement("div");
    const stateClass = contest.state.toLowerCase();
    card.className = `contest-card ${stateClass}`;

    const header = document.createElement("div");
    header.className = "contest-header";
    header.innerText = `${lead?.customer || "Customer"} • ${lead?.source || "Unknown source"}`;

    const meta = document.createElement("div");
    meta.className = "contest-meta";
    const elapsedMs = contest.state === "CLAIMED" ? contest.claimedElapsedMs : now - contest.startTime;
    const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const statusLabel = contest.state === "ESCALATED" ? "Escalated" : contest.state === "CLAIMED" ? "Claimed" : "Open";
    meta.innerText = `Status: ${statusLabel} • Elapsed: ${elapsedSeconds}s`;

    const bar = document.createElement("div");
    bar.className = "urgency-bar";
    const fill = document.createElement("div");
    fill.className = "urgency-fill";
    updateUrgencyBar(elapsedMs, fill);
    bar.appendChild(fill);

    const winner = document.createElement("div");
    winner.className = "winner-message";
    if (contest.state === "CLAIMED" && contest.winningRep) {
      winner.innerText = `Lead Claimed by ${contest.winningRep.name} — ${elapsedSeconds}s`;
      if (contest.winnerShownUntil && now < contest.winnerShownUntil) {
        winner.classList.add("show");
      }
    }

    const repList = document.createElement("div");
    reps.forEach(rep => {
      const btn = document.createElement("button");
      btn.innerText = `Claim as ${rep.name}`;
      btn.disabled = contest.state === "CLAIMED";
      btn.onclick = () => claimLead(contest.id, rep.id);
      repList.appendChild(btn);
    });

    const jumpBtn = document.createElement("button");
    jumpBtn.innerText = "Jump to 109s (Test)";
    jumpBtn.onclick = () => jumpToEscalation(contest.id);

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(bar);
    card.appendChild(winner);
    card.appendChild(repList);
    card.appendChild(jumpBtn);
    list.appendChild(card);
  });
}

function updateUrgencyBar(elapsedMs, fill) {
  const capped = Math.min(elapsedMs, 180000);
  const pct = Math.min((capped / 180000) * 100, 100);
  fill.style.width = `${pct}%`;

  if (elapsedMs < 45000) {
    fill.style.background = "#26a269";
  } else if (elapsedMs < 90000) {
    fill.style.background = "#e07a2d";
  } else if (elapsedMs < 135000) {
    fill.style.background = "#d9a441";
  } else if (elapsedMs < 180000) {
    fill.style.background = "#c62828";
  } else {
    fill.style.background = "#8e1b1b";
  }

  if (elapsedMs >= 170000 && elapsedMs < 180000) {
    fill.classList.add("urgency-last");
  } else {
    fill.classList.remove("urgency-last");
  }

  if (elapsedMs >= 180000) {
    fill.classList.add("urgency-past");
  } else {
    fill.classList.remove("urgency-past");
  }
}

function sendCustomerMessage(rep) {
  const messageEl = document.getElementById("customerMessage");
  if (!messageEl) return;
  messageEl.innerText =
    `Hi Sarah! This is ${rep.name} from the dealership — I just received your request and wanted to reach out right away 🙂`;
}

function notifyManagerUnclaimed(contest) {
  const lead = findLead(contest.leadId);
  const source = lead?.source || "Unknown source";
  const message = `Escalation sent to managers: ${managers.join(", ")} (unclaimed after 180s) — ${source}`;
  console.log(`Manager alert: ${message}`);
  setLeadAlert(lead, "ESCALATED");
  playSound("escalate");
}

function notifyManagerResolved(contest, rep) {
  const lead = findLead(contest.leadId);
  const source = lead?.source || "Unknown source";
  const message = `Resolution sent to managers: Lead claimed by ${rep.name} — ${source}`;
  console.log(`Manager update: ${message}. Managers notified: ${managers.join(", ")}`);
  setLeadAlert(lead, "CLAIMED", rep);
}

function setLeadAlert(lead, state, rep) {
  if (!lead) return;
  if (state === "ESCALATED") {
    lead.managerAlert = "Escalation sent after 180s.";
    lead.managerAlertState = "ESCALATED";
    lead.escalatedEver = true;
  } else if (state === "CLAIMED" && rep) {
    const prior = lead.managerAlert ? `${lead.managerAlert} → ` : "";
    lead.managerAlert = `${prior}Resolved: claimed by ${rep.name}.`;
    lead.managerAlertState = "CLAIMED";
  }
}

function jumpToEscalation(contestId) {
  let contest = null;
  if (contestId) {
    contest = contests.find(c => c.id === contestId && c.state !== "CLAIMED");
  } else {
    contest = contests.find(c => c.state !== "CLAIMED");
  }
  if (!contest) return alert("No open contest found.");
  contest.startTime = Date.now() - 11000;
  renderContests();
}

function formatRelative(timestamp) {
  const delta = Math.floor((Date.now() - timestamp) / 1000);
  if (delta < 5) return "Just now";
  if (delta < 60) return `${delta}s ago`;
  const minutes = Math.floor(delta / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function refreshRelativeTimes() {
  const leadMeta = document.querySelectorAll("#leadPreviewList .lead-meta");
  leadMeta.forEach(meta => {
    const ts = Number(meta.dataset.received);
    if (ts) {
      const statusText = meta.dataset.status || "OPEN";
      const escalated = meta.dataset.escalated === "true";
      meta.innerText = `Received ${formatRelative(ts)} • Status: ${statusText}${escalated ? " • Escalated" : ""}`;
    }
  });
}

function playSound(type) {
  const toggle = document.getElementById("soundToggle");
  if (!toggle || !toggle.checked) return;

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  const configs = {
    start: { freq: 520, duration: 0.08 },
    escalate: { freq: 360, duration: 0.12 },
    claim: { freq: 720, duration: 0.1 }
  };
  const cfg = configs[type] || configs.start;

  osc.frequency.value = cfg.freq;
  osc.type = "sine";
  gain.gain.value = 0.08;

  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + cfg.duration);
}

function updateCustomerMessage() {
  renderLeadPreviews();
}

function runAdfExperience(xml) {
  const raw = document.getElementById("adfRaw");
  const state = document.getElementById("adfParsingState");
  const signals = document.getElementById("adfSignals");
  if (!raw || !state || !signals) return;

  raw.textContent = xml.trim();
  state.innerText = "Parsing ADF/XML…";
  signals.innerHTML = "";

  if (adfParseTimer) clearTimeout(adfParseTimer);
  adfParseTimer = setTimeout(() => {
    const data = parseAdfXml(xml);
    state.innerText = "Signals detected";
    renderSignals(signals, data);
    renderLeadCard(data);
  }, 500);
}

function parseAdfXml(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  function get(path) {
    const el = doc.querySelector(path);
    return el ? el.textContent.trim() : "";
  }

  function getByAttr(path, attr, value) {
    const el = doc.querySelector(`${path}[${attr}="${value}"]`);
    return el ? el.textContent.trim() : "";
  }

  const source =
    get("source") ||
    get("provider name") ||
    get("provider > name") ||
    getByAttr("provider name", "type", "business") ||
    getByAttr("provider name", "part", "full") ||
    getByAttr("id", "source", "CarGurus") ||
    "ADF/XML";

  const year = get("vehicle year");
  const make = get("vehicle make");
  const model = get("vehicle model");
  const trim = get("vehicle trim");
  const stock = get("vehicle stock");
  const vin = get("vehicle vin");
  const price = get("vehicle price");
  const currency = get("vehicle price")
    ? (doc.querySelector("vehicle price")?.getAttribute("currency") || "USD")
    : "";
  const odo = get("vehicle odometer");
  const odoUnits = doc.querySelector("vehicle odometer")?.getAttribute("units") || "";

  const first =
    get("customer name first") ||
    getByAttr("customer contact name", "part", "first") ||
    getByAttr("customer contact name", "type", "individual");
  const last =
    get("customer name last") ||
    getByAttr("customer contact name", "part", "last");
  const phone = get("customer contact phone") || get("customer phone");
  const email = get("customer contact email") || get("customer email");
  const city = get("customer address city") || get("customer contact address city");
  const region =
    get("customer address region") ||
    get("customer address state") ||
    get("customer address regioncode") ||
    get("customer contact address regioncode");
  const timeframe = get("timeframe description") || get("customer timeframe description");
  const financing = get("finance method") || get("vehicle finance method") || get("finance");
  const comments = get("comments") || get("customer comments");

  return {
    source,
    vehicle: { year, make, model, trim, stock, vin, price, currency, odo, odoUnits },
    customer: { first, last, phone, email, city, region },
    timeframe,
    financing,
    comments
  };
}

function renderSignals(container, data) {
  const items = [
    { label: "Source", value: data.source || "—" },
    { label: "Vehicle", value: [data.vehicle.year, data.vehicle.make, data.vehicle.model, data.vehicle.trim].filter(Boolean).join(" ") || "—" },
    { label: "Stock / VIN", value: [data.vehicle.stock, data.vehicle.vin].filter(Boolean).join(" • ") || "—" },
    { label: "Price", value: data.vehicle.price ? `${data.vehicle.price} ${data.vehicle.currency || ""}` : "—" },
    { label: "Odometer", value: data.vehicle.odo ? `${data.vehicle.odo} ${data.vehicle.odoUnits || ""}` : "—" },
    { label: "Customer", value: [data.customer.first, data.customer.last].filter(Boolean).join(" ") || "—" },
    { label: "Phone", value: data.customer.phone || "—" },
    { label: "Email", value: data.customer.email || "—" },
    { label: "City / Region", value: [data.customer.city, data.customer.region].filter(Boolean).join(", ") || "—" },
    { label: "Timeframe", value: data.timeframe || "—" },
    { label: "Financing", value: data.financing || "—" },
    { label: "Market Context", value: data.comments || "—" }
  ];

  items.forEach((item, idx) => {
    const el = document.createElement("div");
    el.className = "signal-item";
    el.innerHTML = `<div class="signal-label">${item.label}</div><div class="signal-value">${item.value}</div>`;
    container.appendChild(el);
    setTimeout(() => el.classList.add("show"), 200 + idx * 220);
  });
}

function renderLeadCard(data) {
  const card = document.getElementById("adfLeadCard");
  if (!card) return;
  const name = [data.customer.first, data.customer.last].filter(Boolean).join(" ") || "Guest";
  const location = [data.customer.city, data.customer.region].filter(Boolean).join(", ") || "Location";
  const vehicle = [data.vehicle.year, data.vehicle.make, data.vehicle.model, data.vehicle.trim].filter(Boolean).join(" ") || "Vehicle";
  const intentBadges = [];
  if (data.timeframe) intentBadges.push(data.timeframe);
  if (data.financing) intentBadges.push(data.financing);
  if (data.comments) intentBadges.push(data.comments);

  card.querySelector(".rep-name").innerText = name;
  card.querySelector(".rep-contact").innerText = `${data.customer.phone || "Phone"} • ${data.customer.email || "Email"}`;
  card.querySelector(".rep-location").innerText = location;
  card.querySelector(".rep-vehicle").innerText = vehicle;
  card.querySelector(".rep-source").innerText = `Source: ${data.source || "ADF/XML"}`;

  const badges = card.querySelector(".rep-badges");
  badges.innerHTML = "";
  intentBadges.slice(0, 3).forEach(text => {
    const badge = document.createElement("div");
    badge.className = "rep-badge";
    badge.innerText = text;
    badges.appendChild(badge);
  });
}

function toggleRawLead() {
  const details = document.getElementById("adfRawDetails");
  if (details) details.open = !details.open;
}

function startPhoneTimer(source) {
  phoneStartTime = Date.now();
  phoneActive = true;
  updatePhoneMock(source);
  if (phoneTimer) clearInterval(phoneTimer);
  phoneTimer = setInterval(() => {
    if (!phoneActive) return;
    updatePhoneMock(source);
  }, 1000);
}

function updatePhoneMock(source) {
  const title = document.getElementById("smsTitle");
  const body = document.getElementById("smsBody");
  const meta = document.getElementById("smsMeta");
  const card = document.getElementById("smsCard");
  const claimed = document.getElementById("smsClaimed");
  const stack = document.getElementById("smsStack");
  if (!title || !body || !meta || !card || !claimed) return;

  const elapsed = phoneStartTime ? Math.max(0, Math.floor((Date.now() - phoneStartTime) / 1000)) : 0;
  title.innerText = `⚡ New Lead (${elapsed}s old)`;
  body.innerText = `${source || "Lead Source"} – Tap to Claim`;
  meta.innerText = "Reps notified in real time.";
  card.style.display = "block";
  claimed.style.display = "none";

  if (stack && source) {
    const exists = phoneHistory.find(item => item.source === source);
    if (!exists) {
      phoneHistory.unshift({ source, time: Date.now() });
      phoneHistory = phoneHistory.slice(0, 3);
      stack.innerHTML = "";
      phoneHistory.forEach(item => {
        const row = document.createElement("div");
        row.className = "sms-mini";
        row.innerText = `${item.source} • ${formatRelative(item.time)}`;
        stack.appendChild(row);
      });
    }
  }
}

function markPhoneClaimed(repName) {
  const card = document.getElementById("smsCard");
  const claimed = document.getElementById("smsClaimed");
  const body = document.getElementById("smsClaimedBody");
  if (!card || !claimed || !body) return;
  phoneActive = false;
  if (phoneTimer) clearInterval(phoneTimer);
  body.innerText = `Claimed by ${repName}`;
  card.style.display = "none";
  claimed.style.display = "block";
}

function initRealityTimeline() {
  const clock = document.getElementById("delayClock");
  const clockSub = document.getElementById("clockSub");
  const card = document.getElementById("behaviorCard");
  const title = document.getElementById("behaviorTitle");
  const body = document.getElementById("behaviorBody");
  const meta = document.getElementById("behaviorMeta");
  const guest = document.getElementById("realityGuest");
  const vehicle = document.getElementById("realityVehicle");
  const source = document.getElementById("realitySource");
  const reality = document.getElementById("reality");
  const showroomScene = document.getElementById("showroomScene");
  const showroomNarration = document.getElementById("showroomNarration");
  const showroomOverlay = document.getElementById("showroomOverlay");
  if (!clock || !clockSub || !card || !title || !body || !meta || !guest || !vehicle || !source || !reality) return;

  const total = 120;
  const ranges = [
    { from: 0, to: 20, headline: "Guest just walked in.", subtext: "They’re looking around. Expectations are high.", narration: "A guest just walked in." },
    { from: 21, to: 40, headline: "They’re still waiting.", subtext: "They assume someone will be right with them.", narration: "They’re waiting near the desk." },
    { from: 41, to: 60, headline: "This is starting to feel uncomfortable.", subtext: "No greeting. No acknowledgment.", narration: "No one has acknowledged them yet." },
    { from: 61, to: 80, headline: "A manager would notice this.", subtext: "This wouldn’t be acceptable on the floor.", narration: "This would feel uncomfortable in person." },
    { from: 81, to: 105, headline: "They’re questioning the store.", subtext: "Professionalism. Care. Attention.", narration: "A manager would step in by now." },
    { from: 106, to: 119, headline: "They’re about to leave.", subtext: "And they won’t tell you why.", narration: "They’re deciding whether to leave." }
  ];

  let startTime = Date.now();
  let frozen = false;

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function updateNarrative(elapsed) {
    const range = ranges.find(r => elapsed >= r.from && elapsed <= r.to);
    if (range) {
      title.innerText = range.headline;
      body.innerText = range.subtext;
      meta.innerText = `${formatTime(range.from)}–${formatTime(range.to)}`;
      if (showroomNarration) {
        showroomNarration.style.opacity = "0";
        showroomNarration.style.transform = "translateY(4px)";
        setTimeout(() => {
          showroomNarration.innerText = range.narration;
          showroomNarration.style.opacity = "1";
          showroomNarration.style.transform = "translateY(0)";
        }, 200);
      }
    }
  }

  function updateVisuals(elapsed, remaining) {
    const dimLevel = Math.min(6, Math.floor((elapsed / total) * 6) + 1);
    const classes = ["reality-dim-1", "reality-dim-2", "reality-dim-3", "reality-dim-4", "reality-dim-5", "reality-dim-6"];
    reality.classList.remove(...classes);
    reality.classList.add(classes[dimLevel - 1]);

    if (elapsed >= 75) {
      reality.classList.add("reality-emphasis");
    } else {
      reality.classList.remove("reality-emphasis");
    }

    if (remaining <= 10) {
      reality.classList.add("reality-last10");
    } else {
      reality.classList.remove("reality-last10");
    }

    if (showroomScene) {
      const brightness = elapsed <= 75 ? 1 - (elapsed / 75) * 0.4 : 0.6 - ((elapsed - 75) / 45) * 0.2;
      const saturation = elapsed <= 75 ? 1 - (elapsed / 75) * 0.25 : 0.75 - ((elapsed - 75) / 45) * 0.25;
      showroomScene.style.filter = `brightness(${Math.max(0.4, brightness)}) saturate(${Math.max(0.4, saturation)})`;
    }
  }

  function tick() {
    if (frozen) return;
    const elapsed = Math.min(total, Math.floor((Date.now() - startTime) / 1000));
    const remaining = Math.max(0, total - elapsed);
    clock.innerText = formatTime(remaining);
    clockSub.innerText = remaining === 0 ? "Escalation reached" : "Countdown to escalation";
    card.classList.remove("escalated");
    updateNarrative(elapsed);
    updateVisuals(elapsed, remaining);

    if (activeLead) {
      guest.innerText = activeLead.customer || "New guest";
      vehicle.innerText = activeLead.vehicle || "Vehicle interest";
      source.innerText = activeLead.source || "Inbound lead";
    }

    if (remaining === 0) {
      frozen = true;
      title.innerText = "BlinkReply escalates before this moment.";
      body.innerText = "Because online guests deserve the same respect as in-store guests.";
      meta.innerText = "Escalation / manager visibility";
      card.classList.add("escalated");
      if (showroomOverlay) showroomOverlay.classList.add("show");
      setTimeout(() => {
        frozen = false;
        if (showroomOverlay) showroomOverlay.classList.remove("show");
        startTime = Date.now();
      }, 2500);
    }
  }

  setInterval(tick, 1000);
  tick();
}

function renderLeadPreviews() {
  const list = document.getElementById("leadPreviewList");
  if (!list) return;
  list.innerHTML = "";

  if (!leads.length) {
    list.innerText = "No leads yet. Click a lead source above or paste ADF/XML to begin.";
    return;
  }

  const ordered = [...leads].sort((a, b) => b.id - a.id);
  ordered.forEach(lead => {
    const card = document.createElement("div");
    const state = lead.state || "OPEN";
    const statusClass = state.toLowerCase();
    card.className = `lead-card ${statusClass}`;

    const header = document.createElement("div");
    header.className = "lead-header";
    header.innerText = `${lead.customer || "Customer"} • ${lead.source || "Unknown source"}`;

    const meta = document.createElement("div");
    meta.className = "lead-meta";
    const receivedAt = lead.receivedAt ? new Date(lead.receivedAt).getTime() : Date.now();
    meta.dataset.received = String(receivedAt);
    meta.dataset.status = state;
    meta.dataset.escalated = lead.escalatedEver ? "true" : "false";
    meta.innerText = `Received ${formatRelative(receivedAt)} • Status: ${state}${lead.escalatedEver ? " • Escalated" : ""}`;

    const body = document.createElement("div");
    body.className = "lead-body";
    body.appendChild(buildLeadNarrative(lead));

    if (lead.managerAlert) {
      const alert = document.createElement("div");
      alert.className = `lead-alert${lead.managerAlertState === "CLAIMED" ? " resolved" : ""}`;
      alert.innerText = lead.managerAlert;
      body.appendChild(alert);
    }

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(body);
    list.appendChild(card);
  });
}

function buildLeadNarrative(lead) {
  const source = lead.source || "Unknown source";
  const wrapper = document.createElement("div");
  const title = document.createElement("div");
  title.innerText = "What just happened";
  title.style.fontWeight = "bold";

  const list = document.createElement("ul");
  const item1 = document.createElement("li");
  item1.innerText = `A new lead was ingested from ${source} and the claim timer started.`;
  const item2 = document.createElement("li");
  item2.innerText = "Reps were notified immediately. The first rep to claim becomes the owner.";
  const item3 = document.createElement("li");
  if (lead.state === "CLAIMED" && lead.winningRep) {
    item3.innerText = `${lead.winningRep.name} claimed this lead and is reviewing the request now.`;
  } else if (lead.state === "ESCALATED") {
    item3.innerText = "This lead is still open, and a manager has been alerted to ensure coverage.";
  } else {
    item3.innerText = "Once claimed, this lead will be created/updated in DealerSocket with the correct identifiers.";
  }
  const itemEscalation = document.createElement("li");
  if (lead.escalatedEver && lead.managerAlertState === "CLAIMED" && lead.winningRep) {
    itemEscalation.innerText = `Escalation was triggered at 180s and resolved when ${lead.winningRep.name} claimed the lead.`;
  } else if (lead.escalatedEver) {
    itemEscalation.innerText = "Escalation was triggered at 180s to ensure manager visibility.";
  }
  const item4 = document.createElement("li");
  item4.innerText = "From there, normal DealerSocket workflows apply (tasks, follow-up, templates, reporting).";

  list.appendChild(item1);
  list.appendChild(item2);
  list.appendChild(item3);
  if (itemEscalation.innerText) list.appendChild(itemEscalation);
  list.appendChild(item4);

  wrapper.appendChild(title);
  wrapper.appendChild(list);
  return wrapper;
}

function updateStats() {
  const total = leads.length;
  let open = 0;
  let escalated = 0;
  let claimed = 0;
  let claimTimes = [];

  leads.forEach(lead => {
    if (lead.escalatedEver || lead.state === "ESCALATED") escalated++;
    if (lead.state === "CLAIMED") claimed++;
    else open++;

    if (lead.claimedAt && lead.receivedAt) {
      const diff = new Date(lead.claimedAt).getTime() - new Date(lead.receivedAt).getTime();
      if (diff >= 0) claimTimes.push(diff);
    }
  });

  const avg = claimTimes.length
    ? Math.round(claimTimes.reduce((a, b) => a + b, 0) / claimTimes.length / 1000)
    : null;

  const totalEl = document.getElementById("statTotal");
  const openEl = document.getElementById("statOpen");
  const escalatedEl = document.getElementById("statEscalated");
  const claimedEl = document.getElementById("statClaimed");
  const avgEl = document.getElementById("statAvgClaim");

  if (totalEl) totalEl.innerText = total;
  if (openEl) openEl.innerText = open;
  if (escalatedEl) escalatedEl.innerText = escalated;
  if (claimedEl) claimedEl.innerText = claimed;
  if (avgEl) avgEl.innerText = avg ? `${avg}s` : "—";
}

function isValidXmlPayload(xml) {
  if (!xml) return false;
  const trimmed = xml.trim().toLowerCase();
  return (
    (trimmed.includes("<adf") && trimmed.includes("</adf>")) ||
    (trimmed.includes("<prospect") && trimmed.includes("</prospect>"))
  );
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

function findLead(leadId) {
  return leads.find(lead => lead.id === leadId);
}

function initAccordion() {
  const toggles = document.querySelectorAll(".accordion-toggle");
  toggles.forEach(toggle => {
    toggle.addEventListener("click", () => {
      const item = toggle.parentElement;
      if (!item) return;
      item.classList.toggle("open");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initRealityTimeline();
  initAccordion();
});

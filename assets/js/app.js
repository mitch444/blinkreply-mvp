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
const VIDPING_WAIT_MS = 2 * 60 * 1000;
const VIDPING_STORAGE_KEY = "blink_vidping_leads";

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
    winningRep: null,
    vidPingSent: false,
    vidPingSentAt: null,
    vidPingStatus: "NONE",
    vidPingDeadlineAt: null,
    vidPingEscalated: false,
    vidPingRepId: null,
    vidPingRepName: null
  };
}

function trackLead(lead) {
  leads.push(lead);
  persistVidPingLead(lead);
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
  checkVidPingEscalations(now);

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
  startVidPingTimer(lead, rep, contest);
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
    const vidMeta = document.createElement("div");
    vidMeta.className = "contest-meta";
    vidMeta.innerText = `Vid: ${getVidPingLabel(lead, contest)}`;

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
    jumpBtn.onclick = () => jumpToSeconds(contest.id, 109);

    const jumpBtnAlt = document.createElement("button");
    jumpBtnAlt.innerText = "Jump to 100s (Test)";
    jumpBtnAlt.onclick = () => jumpToSeconds(contest.id, 100);

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(bar);
    card.appendChild(winner);
    card.appendChild(repList);
    card.appendChild(jumpBtn);
    card.appendChild(jumpBtnAlt);
    card.appendChild(vidMeta);
    list.appendChild(card);
  });
}

function updateUrgencyBar(elapsedMs, fill) {
  const capped = Math.min(elapsedMs, 180000);
  const pct = Math.min((capped / 180000) * 100, 100);
  fill.style.width = `${pct}%`;

  fill.style.background = "#FACC15";

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

function notifyManagerVidPingMissing(lead) {
  if (!lead) return;
  const repName = lead.vidPingRepName || lead.winningRep?.name || "Rep";
  const message = `No Vid Sent — Escalation Armed. ${repName} did not send VidPing within ${Math.round(VIDPING_WAIT_MS / 60000)}m.`;
  lead.managerAlert = message;
  lead.managerAlertState = "VIDPING";
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

function startVidPingTimer(lead, rep, contest) {
  if (!lead || !rep) return;
  lead.vidPingStatus = "PENDING";
  lead.vidPingSent = false;
  lead.vidPingSentAt = null;
  lead.vidPingRepId = rep.id;
  lead.vidPingRepName = rep.name;
  lead.vidPingDeadlineAt = Date.now() + VIDPING_WAIT_MS;
  lead.vidPingEscalated = false;
  persistVidPingLead(lead);
  promptVidPing(lead, rep, contest);
}

function promptVidPing(lead, rep, contest) {
  const confirmSend = window.confirm("Send a VidPing now?");
  if (!confirmSend) return;
  const payload = {
    leadId: lead.id,
    customer: lead.customer,
    vehicle: lead.vehicle,
    source: lead.source,
    repId: rep.id,
    repName: rep.name,
    startTime: contest?.startTime || Date.now(),
    receivedAt: lead.receivedAt
  };
  localStorage.setItem("vidping_context", JSON.stringify(payload));
  window.location.href = `vidping.html?leadId=${lead.id}`;
}

function checkVidPingEscalations(now) {
  leads.forEach(lead => {
    if (lead.state !== "CLAIMED") return;
    if (lead.vidPingSent) return;
    if (!lead.vidPingDeadlineAt) return;
    if (lead.vidPingEscalated) return;
    if (now >= lead.vidPingDeadlineAt) {
      lead.vidPingStatus = "NO_VID";
      lead.vidPingEscalated = true;
      notifyManagerVidPingMissing(lead);
      persistVidPingLead(lead);
    }
  });
}

function getVidPingLabel(lead, contest) {
  if (!lead || contest?.state !== "CLAIMED") return "Awaiting Claim";
  if (lead.vidPingSent) return "Vid Sent";
  if (lead.vidPingStatus === "NO_VID") return "No Vid Sent — Escalation Armed";
  return "Awaiting Vid";
}

function persistVidPingLead(lead) {
  if (!lead || !localStorage) return;
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(VIDPING_STORAGE_KEY)) || {};
  } catch (err) {
    stored = {};
  }
  const record = stored[lead.id] || {};
  stored[lead.id] = {
    ...record,
    leadId: lead.id,
    source: lead.source,
    customer: lead.customer,
    vehicle: lead.vehicle,
    receivedAt: lead.receivedAt,
    claimedAt: lead.claimedAt,
    vidPingSent: lead.vidPingSent,
    vidPingSentAt: lead.vidPingSentAt,
    vidPingStatus: lead.vidPingStatus,
    vidPingDeadlineAt: lead.vidPingDeadlineAt,
    vidPingRepId: lead.vidPingRepId,
    vidPingRepName: lead.vidPingRepName
  };
  localStorage.setItem(VIDPING_STORAGE_KEY, JSON.stringify(stored));
}

function jumpToSeconds(contestId, seconds) {
  let contest = null;
  if (contestId) {
    contest = contests.find(c => c.id === contestId && c.state !== "CLAIMED");
  } else {
    contest = contests.find(c => c.state !== "CLAIMED");
  }
  if (!contest) return alert("No open contest found.");
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  contest.startTime = Date.now() - safeSeconds * 1000;
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
  const thoughtLine = document.getElementById("thoughtLine");
  const patienceFill = document.getElementById("patienceFill");
  const patienceCopy = document.getElementById("patienceCopy");
  const attentionYour = document.getElementById("attentionYour");
  const attentionBirchwood = document.getElementById("attentionBirchwood");
  const attentionFocus = document.getElementById("attentionFocus");
  const attentionMurray = document.getElementById("attentionMurray");
  const finalOverlay = document.getElementById("realityFinalOverlay");
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

  const patienceStates = [
    { from: 0, to: 30, text: "Engaged. Expecting a response." },
    { from: 31, to: 60, text: "Waiting politely." },
    { from: 61, to: 90, text: "Confidence slipping." },
    { from: 91, to: 110, text: "Reconsidering the store." },
    { from: 111, to: 120, text: "About to move on." }
  ];

  const thoughtLines = [
    "Did my message even go through?",
    "Maybe Birchwood will reply faster.",
    "This is a big purchase — I don’t want to regret it.",
    "If they’re slow now, what about service later?",
    "Winter’s coming. I need confidence in the store.",
    "I don’t want to make the wrong choice."
  ];

  const thoughtDurations = [10, 9, 11, 8, 10, 9];
  let lastThoughtIndex = -1;
  let lastPatienceText = "";

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

  function mixColor(start, end, ratio) {
    const mix = (a, b) => Math.round(a + (b - a) * ratio);
    return `rgb(${mix(start[0], end[0])}, ${mix(start[1], end[1])}, ${mix(start[2], end[2])})`;
  }

  function updatePatience(elapsed) {
    if (!patienceFill || !patienceCopy) return;
    const baseRemaining = 1 - elapsed / total;
    const accel = elapsed > 90 ? Math.pow((elapsed - 90) / 30, 2) * 0.08 : 0;
    const remaining = Math.max(0.02, baseRemaining - accel);
    patienceFill.style.width = `${Math.max(0, Math.min(1, remaining)) * 100}%`;

    const progress = 1 - remaining;
    const startColor = [120, 176, 208];
    const midColor = [184, 192, 201];
    const endColor = [214, 170, 120];
    let color = "";
    if (progress < 0.6) {
      color = mixColor(startColor, midColor, progress / 0.6);
    } else {
      color = mixColor(midColor, endColor, (progress - 0.6) / 0.4);
    }
    patienceFill.style.backgroundColor = color;

    const state = patienceStates.find(s => elapsed >= s.from && elapsed <= s.to);
    if (state && state.text !== lastPatienceText) {
      lastPatienceText = state.text;
      patienceCopy.style.opacity = "0";
      setTimeout(() => {
        patienceCopy.textContent = state.text;
        patienceCopy.style.opacity = "1";
      }, 220);
    }
  }

  function updateAttentionSplit(elapsed) {
    if (!attentionYour || !attentionBirchwood || !attentionFocus || !attentionMurray) return;
    const t = Math.min(1, elapsed / total);
    const drift = Math.min(1, t + Math.max(0, (t - 0.75)) * 0.2);
    let yourShare = 0.68 - drift * 0.18;
    yourShare = Math.max(0.46, Math.min(0.7, yourShare));
    const competitorTotal = 1 - yourShare;
    const weights = [0.36, 0.34, 0.30];
    const birchwood = competitorTotal * weights[0];
    const focus = competitorTotal * weights[1];
    const murray = competitorTotal * weights[2];

    attentionYour.style.width = `${yourShare * 100}%`;
    attentionBirchwood.style.width = `${birchwood * 100}%`;
    attentionFocus.style.width = `${focus * 100}%`;
    attentionMurray.style.width = `${murray * 100}%`;
  }

  function updateThoughts(elapsed) {
    if (!thoughtLine) return;
    const totalCycle = thoughtDurations.reduce((sum, value) => sum + value, 0);
    const position = elapsed % totalCycle;
    let index = 0;
    let cursor = 0;
    for (let i = 0; i < thoughtDurations.length; i++) {
      cursor += thoughtDurations[i];
      if (position < cursor) {
        index = i;
        break;
      }
    }
    if (index !== lastThoughtIndex) {
      lastThoughtIndex = index;
      thoughtLine.style.opacity = "0";
      setTimeout(() => {
        thoughtLine.textContent = thoughtLines[index % thoughtLines.length];
        thoughtLine.style.opacity = "1";
      }, 240);
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
    updatePatience(elapsed);
    updateAttentionSplit(elapsed);
    updateThoughts(elapsed);

    if (activeLead) {
      guest.innerText = activeLead.customer || "New guest";
      vehicle.innerText = activeLead.vehicle || "Vehicle interest";
      source.innerText = activeLead.source || "Inbound lead";
    }

    if (remaining === 0) {
      frozen = true;
      title.innerText = "Blink escalates before this moment.";
      body.innerText = "Digital and in-store response standards are aligned.";
      meta.innerText = "Escalation / manager visibility";
      card.classList.add("escalated");
      if (finalOverlay) {
        finalOverlay.classList.add("show");
        finalOverlay.setAttribute("aria-hidden", "false");
      }
      setTimeout(() => {
        frozen = false;
        if (finalOverlay) {
          finalOverlay.classList.remove("show");
          finalOverlay.setAttribute("aria-hidden", "true");
        }
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
    if (lead.vidPingSent) {
      meta.innerText += " • Vid Sent";
    } else if (lead.vidPingStatus === "NO_VID") {
      meta.innerText += " • No Vid Sent";
    } else if (lead.state === "CLAIMED") {
      meta.innerText += " • Vid Pending";
    }

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
  const itemVid = document.createElement("li");
  if (lead.state === "CLAIMED") {
    if (lead.vidPingSent && lead.vidPingSentAt) {
      itemVid.innerText = `VidPing sent at ${new Date(lead.vidPingSentAt).toLocaleTimeString()}.`;
    } else if (lead.vidPingStatus === "NO_VID") {
      itemVid.innerText = "No Vid Sent — escalation armed for manager visibility.";
    } else {
      itemVid.innerText = "VidPing pending — prompt the rep to send a video follow-up.";
    }
  }

  list.appendChild(item1);
  list.appendChild(item2);
  list.appendChild(item3);
  if (itemEscalation.innerText) list.appendChild(itemEscalation);
  if (itemVid.innerText) list.appendChild(itemVid);
  list.appendChild(item4);

  wrapper.appendChild(title);
  wrapper.appendChild(list);
  return wrapper;
}

function updateStats() {
  syncVidPingFromStorage();
  const total = leads.length;
  let open = 0;
  let escalated = 0;
  let claimed = 0;
  let claimTimes = [];
  let vidSentCount = 0;
  let vidTimes = [];
  const repStats = {};
  const sourceStats = {};

  leads.forEach(lead => {
    if (lead.escalatedEver || lead.state === "ESCALATED") escalated++;
    if (lead.state === "CLAIMED") claimed++;
    else open++;

    if (lead.claimedAt && lead.receivedAt) {
      const diff = new Date(lead.claimedAt).getTime() - new Date(lead.receivedAt).getTime();
      if (diff >= 0) claimTimes.push(diff);
    }

    if (lead.vidPingSent) {
      vidSentCount++;
      if (lead.vidPingSentAt && lead.receivedAt) {
        const vidDiff = new Date(lead.vidPingSentAt).getTime() - new Date(lead.receivedAt).getTime();
        if (vidDiff >= 0) vidTimes.push(vidDiff);
      }
    }

    if (lead.winningRep) {
      const repKey = lead.winningRep.name;
      if (!repStats[repKey]) repStats[repKey] = { total: 0, sent: 0 };
      repStats[repKey].total += 1;
      if (lead.vidPingSent) repStats[repKey].sent += 1;
    }

    if (lead.source) {
      if (!sourceStats[lead.source]) sourceStats[lead.source] = { total: 0, sent: 0 };
      sourceStats[lead.source].total += 1;
      if (lead.vidPingSent) sourceStats[lead.source].sent += 1;
    }
  });

  const avg = claimTimes.length
    ? Math.round(claimTimes.reduce((a, b) => a + b, 0) / claimTimes.length / 1000)
    : null;
  const avgVid = vidTimes.length
    ? Math.round(vidTimes.reduce((a, b) => a + b, 0) / vidTimes.length / 1000)
    : null;

  const totalEl = document.getElementById("statTotal");
  const openEl = document.getElementById("statOpen");
  const escalatedEl = document.getElementById("statEscalated");
  const claimedEl = document.getElementById("statClaimed");
  const avgEl = document.getElementById("statAvgClaim");
  const vidSentEl = document.getElementById("statVidSent");
  const avgVidEl = document.getElementById("statAvgVid");

  if (totalEl) totalEl.innerText = total;
  if (openEl) openEl.innerText = open;
  if (escalatedEl) escalatedEl.innerText = escalated;
  if (claimedEl) claimedEl.innerText = claimed;
  if (avgEl) avgEl.innerText = avg ? `${avg}s` : "—";
  if (vidSentEl) vidSentEl.innerText = vidSentCount;
  if (avgVidEl) avgVidEl.innerText = avgVid ? `${avgVid}s` : "—";

  const vidRepEl = document.getElementById("vidpingByRep");
  const vidSourceEl = document.getElementById("vidpingBySource");
  if (vidRepEl) {
    vidRepEl.innerHTML = "";
    const entries = Object.entries(repStats);
    if (!entries.length) {
      vidRepEl.innerHTML = "<div class=\"metric-row\"><span>—</span><span>—</span></div>";
    } else {
      entries.forEach(([name, stats]) => {
        const pct = stats.total ? Math.round((stats.sent / stats.total) * 100) : 0;
        const row = document.createElement("div");
        row.className = "metric-row";
        row.innerHTML = `<span>${name}</span><span>${pct}% (${stats.sent}/${stats.total})</span>`;
        vidRepEl.appendChild(row);
      });
    }
  }

  if (vidSourceEl) {
    vidSourceEl.innerHTML = "";
    const entries = Object.entries(sourceStats);
    if (!entries.length) {
      vidSourceEl.innerHTML = "<div class=\"metric-row\"><span>—</span><span>—</span></div>";
    } else {
      entries.forEach(([source, stats]) => {
        const pct = stats.total ? Math.round((stats.sent / stats.total) * 100) : 0;
        const row = document.createElement("div");
        row.className = "metric-row";
        row.innerHTML = `<span>${source}</span><span>${pct}% (${stats.sent}/${stats.total})</span>`;
        vidSourceEl.appendChild(row);
      });
    }
  }
}

function syncVidPingFromStorage() {
  if (!localStorage) return;
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(VIDPING_STORAGE_KEY)) || {};
  } catch (err) {
    stored = {};
  }
  leads.forEach(lead => {
    const record = stored[lead.id];
    if (!record) return;
    lead.vidPingSent = Boolean(record.vidPingSent);
    lead.vidPingSentAt = record.vidPingSentAt || lead.vidPingSentAt;
    lead.vidPingStatus = record.vidPingStatus || lead.vidPingStatus;
    lead.vidPingDeadlineAt = record.vidPingDeadlineAt || lead.vidPingDeadlineAt;
    lead.vidPingRepId = record.vidPingRepId || lead.vidPingRepId;
    lead.vidPingRepName = record.vidPingRepName || lead.vidPingRepName;
  });
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

function initDsqPayoffs() {
  const groups = document.querySelectorAll(".dsq-group");
  groups.forEach(group => {
    const toggle = group.querySelector(".dsq-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", () => {
      group.classList.toggle("open");
    });
  });
}

let goalLightTimeout = null;

function setGoalLightState(stateName) {
  const light = document.getElementById("goalLight");
  const title = document.getElementById("stateTitle");
  const rep = document.getElementById("stateRep");
  const manager = document.getElementById("stateManager");
  if (!light) return;

  const states = {
    IDLE: {
      classes: [],
      title: "System idle",
      rep: "No lead is active yet. You are waiting on a real customer moment.",
      manager: "Nothing to chase. No noise, no fake urgency."
    },
    GAME_ON: {
      classes: ["light--blue", "light--pulse"],
      title: "Game on",
      rep: "A lead arrived. You are the first human who can win it.",
      manager: "You see the moment instantly without opening a dashboard."
    },
    PUCK_DROPPED: {
      classes: ["light--amber", "light--pulse"],
      title: "Puck dropped",
      rep: "The clock started. Speed matters more than perfect.",
      manager: "The response window is visible to everyone in the store."
    },
    RACE_ON: {
      classes: ["light--race"],
      title: "Race on",
      rep: "Multiple reps are moving. The first response wins ownership.",
      manager: "Competition is visible. You don’t have to assign manually."
    },
    GOOD_PLAY: {
      classes: ["light--green", "light--pulse"],
      title: "Good play",
      rep: "You moved quickly. The customer feels it.",
      manager: "You can see clean response behavior in real time."
    },
    MISSED_SLA: {
      classes: ["light--red-soft", "light--pulse"],
      title: "Missed SLA",
      rep: "The response window slipped. The deal is at risk.",
      manager: "You know where the process broke without chasing people."
    },
    GOAL_SCORED: {
      classes: ["light--blue", "light--goal"],
      title: "Goal scored",
      rep: "A real response happened. The lead is claimed and moving.",
      manager: "You can trust the process without hovering."
    }
  };

  const next = states[stateName] || states.IDLE;
  const allClasses = ["light--blue", "light--amber", "light--race", "light--green", "light--red-soft", "light--goal", "light--pulse"];
  light.classList.remove(...allClasses);
  if (goalLightTimeout) {
    clearTimeout(goalLightTimeout);
    goalLightTimeout = null;
  }

  next.classes.forEach(cls => light.classList.add(cls));

  if (stateName === "GOAL_SCORED") {
    goalLightTimeout = setTimeout(() => {
      light.classList.remove("light--goal");
      light.classList.add("light--blue");
    }, 1200);
  }

  if (title) title.textContent = next.title;
  if (rep) rep.textContent = `For reps: ${next.rep}`;
  if (manager) manager.textContent = `For managers: ${next.manager}`;
}

function initGoalLight() {
  const light = document.getElementById("goalLight");
  if (!light) return;
  setGoalLightState("IDLE");
}

document.addEventListener("DOMContentLoaded", () => {
  initRealityTimeline();
  initAccordion();
  initDsqPayoffs();
  initGoalLight();
});

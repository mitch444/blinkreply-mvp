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

function ingestLead() {
  const xml = document.getElementById("adfInput").value;

  if (!isValidXmlPayload(xml)) {
    showToast("Couldn’t parse payload — check XML formatting.", true);
    return;
  }

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
  const names = [
    "Ava K",
    "Liam P",
    "Noah R",
    "Mia T",
    "Olivia J",
    "Ethan S",
    "Sophia D",
    "Lucas W",
    "Isabella M",
    "Mason H",
    "Charlotte B",
    "Logan C"
  ];
  const randomName = names[Math.floor(Math.random() * names.length)];
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
    jumpBtn.innerText = "Jump to 179s (Test)";
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
  contest.startTime = Date.now() - 179000;
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
      const statusText = meta.innerText.split(" • Status: ")[1] || "OPEN";
      meta.innerText = `Received ${formatRelative(ts)} • Status: ${statusText}`;
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
    meta.innerText = `Received ${formatRelative(receivedAt)} • Status: ${state}`;

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
  return xml.includes("<adf") && xml.includes("</adf>");
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

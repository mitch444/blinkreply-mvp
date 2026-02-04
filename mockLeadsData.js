const reps = ["Eric", "Brady", "Sumit", "Vlad", "Doug", "Bob", "Sonny", "Marcus"];
const sources = [
  "CarGurus",
  "AutoTrader",
  "HyundaiCanada.com",
  "Click to Buy",
  "Digital Media",
  "Optimy",
  "DrivingIt",
  "Unhaggle",
  "Other"
];

const stages = [
  "Uncontacted",
  "Contacted",
  "Appointed",
  "Show",
  "Closed",
  "Delivered"
];

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => (value = (value * 16807) % 2147483647) / 2147483647;
}

const rand = seededRandom(20260201);

function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function addMinutes(base, minutes) {
  const dt = new Date(base);
  dt.setMinutes(dt.getMinutes() + minutes);
  return dt.toISOString();
}

function responseSeconds() {
  const ranges = [15, 25, 35, 45, 60, 75, 90, 120, 150, 210];
  return ranges[Math.floor(rand() * ranges.length)];
}

const mockLeadsData = [];
const startDate = new Date("2026-01-01T08:15:00");
const totalLeads = 420;

for (let i = 0; i < totalLeads; i++) {
  const createdAt = addMinutes(startDate, i * 18 + Math.floor(rand() * 25));
  const isClaimed = rand() > 0.08;
  const claimedBy = isClaimed ? pick(reps) : null;
  const claimedAt = isClaimed ? addMinutes(createdAt, Math.ceil(responseSeconds() / 60)) : null;

  const stageRoll = rand();
  let stage = "Uncontacted";
  if (stageRoll > 0.15) stage = "Contacted";
  if (stageRoll > 0.4) stage = "Appointed";
  if (stageRoll > 0.65) stage = "Show";
  if (stageRoll > 0.78) stage = "Closed";
  if (stageRoll > 0.9) stage = "Delivered";

  mockLeadsData.push({
    id: 2000 + i,
    source: pick(sources),
    vehicle: pick([
      "2024 Elantra Hybrid",
      "2025 Tucson",
      "2024 Santa Fe",
      "2023 Kona",
      "2024 Ioniq 5",
      "2025 Ioniq 6",
      "2023 Palisade",
      "2024 Venue"
    ]),
    createdAt,
    claimedAt,
    claimedBy,
    status: isClaimed ? "CLAIMED" : "OPEN",
    stage
  });
}

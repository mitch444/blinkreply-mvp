const mockLeadsData = [
  {
    id: 101,
    source: "CarGurus",
    vehicle: "2023 Tucson",
    createdAt: "2026-01-06T09:14:00",
    claimedAt: "2026-01-06T09:14:42",
    claimedBy: "Eric",
    status: "CLAIMED",
    stage: "Contacted"
  },
  {
    id: 102,
    source: "AutoTrader",
    vehicle: "2024 Elantra Hybrid",
    createdAt: "2026-01-06T10:02:00",
    claimedAt: "2026-01-06T10:03:18",
    claimedBy: "Brady",
    status: "CLAIMED",
    stage: "Engaged"
  },
  {
    id: 103,
    source: "HyundaiCanada.com",
    vehicle: "2024 Santa Fe",
    createdAt: "2026-01-07T11:20:00",
    claimedAt: "2026-01-07T11:24:30",
    claimedBy: "Sumit",
    status: "CLAIMED",
    stage: "Appointments"
  },
  {
    id: 104,
    source: "Click to Buy",
    vehicle: "2023 Kona",
    createdAt: "2026-01-07T12:41:00",
    claimedAt: null,
    claimedBy: null,
    status: "OPEN",
    stage: "Contacted"
  },
  {
    id: 105,
    source: "Digital Media",
    vehicle: "2022 Palisade",
    createdAt: "2026-01-08T09:05:00",
    claimedAt: "2026-01-08T09:07:11",
    claimedBy: "Vlad",
    status: "CLAIMED",
    stage: "Shows"
  },
  {
    id: 106,
    source: "Optimy",
    vehicle: "2025 Ioniq 5",
    createdAt: "2026-01-08T14:12:00",
    claimedAt: "2026-01-08T14:13:02",
    claimedBy: "Doug",
    status: "CLAIMED",
    stage: "Engaged"
  },
  {
    id: 107,
    source: "DrivingIt",
    vehicle: "2024 Venue",
    createdAt: "2026-01-09T15:50:00",
    claimedAt: "2026-01-09T15:52:10",
    claimedBy: "Bob",
    status: "CLAIMED",
    stage: "Contacted"
  },
  {
    id: 108,
    source: "Unhaggle",
    vehicle: "2023 Sonata",
    createdAt: "2026-01-09T16:22:00",
    claimedAt: null,
    claimedBy: null,
    status: "ESCALATED",
    stage: "Contacted"
  },
  {
    id: 109,
    source: "Other",
    vehicle: "2025 Ioniq 6",
    createdAt: "2026-01-10T09:03:00",
    claimedAt: "2026-01-10T09:04:05",
    claimedBy: "Sonny",
    status: "CLAIMED",
    stage: "Appointments"
  },
  {
    id: 110,
    source: "CarGurus",
    vehicle: "2024 Kona",
    createdAt: "2026-01-10T10:18:00",
    claimedAt: "2026-01-10T10:19:10",
    claimedBy: "Marcus",
    status: "CLAIMED",
    stage: "Shows"
  },
  {
    id: 111,
    source: "AutoTrader",
    vehicle: "2023 Elantra",
    createdAt: "2026-01-11T08:45:00",
    claimedAt: "2026-01-11T08:46:12",
    claimedBy: "Eric",
    status: "CLAIMED",
    stage: "Engaged"
  },
  {
    id: 112,
    source: "HyundaiCanada.com",
    vehicle: "2024 Palisade",
    createdAt: "2026-01-11T13:22:00",
    claimedAt: "2026-01-11T13:23:55",
    claimedBy: "Brady",
    status: "CLAIMED",
    stage: "Shows"
  },
  {
    id: 113,
    source: "Click to Buy",
    vehicle: "2025 Tucson",
    createdAt: "2026-01-12T09:30:00",
    claimedAt: null,
    claimedBy: null,
    status: "OPEN",
    stage: "Contacted"
  },
  {
    id: 114,
    source: "Digital Media",
    vehicle: "2024 Ioniq 5",
    createdAt: "2026-01-12T11:02:00",
    claimedAt: "2026-01-12T11:04:10",
    claimedBy: "Sumit",
    status: "CLAIMED",
    stage: "Appointments"
  },
  {
    id: 115,
    source: "Optimy",
    vehicle: "2023 Venue",
    createdAt: "2026-01-13T14:44:00",
    claimedAt: "2026-01-13T14:45:05",
    claimedBy: "Vlad",
    status: "CLAIMED",
    stage: "Engaged"
  },
  {
    id: 116,
    source: "DrivingIt",
    vehicle: "2022 Elantra",
    createdAt: "2026-01-13T16:15:00",
    claimedAt: "2026-01-13T16:18:50",
    claimedBy: "Doug",
    status: "CLAIMED",
    stage: "Appointments"
  },
  {
    id: 117,
    source: "Unhaggle",
    vehicle: "2024 Santa Fe",
    createdAt: "2026-01-14T09:12:00",
    claimedAt: "2026-01-14T09:13:40",
    claimedBy: "Bob",
    status: "CLAIMED",
    stage: "Shows"
  },
  {
    id: 118,
    source: "Other",
    vehicle: "2025 Kona",
    createdAt: "2026-01-14T10:05:00",
    claimedAt: "2026-01-14T10:06:15",
    claimedBy: "Sonny",
    status: "CLAIMED",
    stage: "Sold"
  },
  {
    id: 119,
    source: "CarGurus",
    vehicle: "2024 Ioniq 6",
    createdAt: "2026-01-15T08:50:00",
    claimedAt: "2026-01-15T08:52:00",
    claimedBy: "Marcus",
    status: "CLAIMED",
    stage: "Engaged"
  },
  {
    id: 120,
    source: "AutoTrader",
    vehicle: "2023 Palisade",
    createdAt: "2026-01-15T12:10:00",
    claimedAt: "2026-01-15T12:12:30",
    claimedBy: "Eric",
    status: "CLAIMED",
    stage: "Sold"
  }
];

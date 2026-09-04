const STORAGE_KEY = "ocbc-one-demo-state-v4";
const POLICY_VERSION = "ONE-DEMO-2026-09";

const defaultState = {
  view: "home",
  currentISO: "2026-01-10",
  stage: 0,
  netWorth: 4000,
  cashAvailable: 1200,
  savingsPocket: 0,
  homeSavings: 0,
  investmentBalance: 300,
  cpfBalance: 2000,
  otherAssets: 500,
  monthlyIncome: 0,
  recurringExpenses: 2300,
  planScore: 42,
  homeGoalTarget: 60000,
  currentInsight: "welcome",
  activityExpanded: false,
  selectedActionTab: "all",
  jobTransferUndone: false,
  consent: {
    completed: false,
    policyVersion: "",
    acceptedAt: "",
    connectedPolicies: true,
    contextualSignals: true,
    personalisedInsights: true
  },
  settings: {
    idleSweep: true,
    cashThreshold: 3000,
    transferCap: 1000
  },
  travel: {
    covered: false,
    selectedPlan: "essential",
    provider: "Great Eastern",
    premium: 0,
    calendarAdded: false
  },
  investment: {
    draftMonthly: 100,
    plannedMonthly: 0,
    riskProfileComplete: false,
    riskLevel: ""
  },
  advisorBooking: null,
  calendarMonth: "2026-01",
  actions: [],
  activity: [
    { id: "opening", icon: "$", tone: "neutral", title: "Opening balance", subtitle: "OCBC 360 Account · 10 Jan", amount: "S$1,200", note: "Starting point" }
  ],
  chat: [
    { from: "one", text: "Hi Tom. I can explain your plan, the data used and the limit on every ONE action.", time: "09:42" }
  ],
  notifications: [],
  audit: [
    { date: "10 Jan 2026, 09:42", title: "Plan created", detail: "Required OCBC demo data loaded. No action taken." }
  ]
};

const scenarios = [
  { id: "job", title: "First full-time salary", description: "S$3,600 take-home pay credited", tier: 1, requiredStage: 0, icon: "$" },
  { id: "trip", title: "Trip to Dubai", description: "Flight booked for 2 to 8 August", tier: 2, requiredStage: 1, icon: "✈" },
  { id: "mortgage", title: "Planning a first home", description: "Prepare for an affordability review", tier: 3, requiredStage: 2, icon: "⌂" }
];

const travelPlans = {
  essential: {
    name: "Essential",
    premium: 48,
    summary: "Core protection for this S$1,250 trip",
    coverage: [
      ["Overseas medical", "Up to S$250,000"],
      ["Emergency evacuation", "Included"],
      ["Trip cancellation", "Up to S$5,000"],
      ["Baggage and belongings", "Up to S$2,000"]
    ]
  },
  plus: {
    name: "Plus",
    premium: 72,
    summary: "Higher limits for an additional S$24",
    coverage: [
      ["Overseas medical", "Up to S$500,000"],
      ["Emergency evacuation", "Included"],
      ["Trip cancellation", "Up to S$10,000"],
      ["Baggage and belongings", "Up to S$5,000"],
      ["Travel delay", "Included after qualifying delay"]
    ]
  }
};

let state = loadState();
let toastTimer;
let aiModelPromise;

const content = document.querySelector("#app-content");
const pageTitle = document.querySelector("#page-title");
const pageEyebrow = document.querySelector("#page-eyebrow");
const actionCount = document.querySelector("#action-count");
const consentOverlay = document.querySelector("#consent-overlay");
const demoOverlay = document.querySelector("#demo-overlay");
const detailOverlay = document.querySelector("#detail-overlay");
const detailTitle = document.querySelector("#detail-title");
const detailEyebrow = document.querySelector("#detail-eyebrow");
const detailContent = document.querySelector("#detail-content");
const detailActions = document.querySelector("#detail-actions");
const notificationPopover = document.querySelector("#notification-popover");
const notificationDot = document.querySelector(".notification-dot");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return clone(defaultState);
    return {
      ...clone(defaultState),
      ...saved,
      consent: { ...defaultState.consent, ...(saved.consent || {}) },
      settings: { ...defaultState.settings, ...(saved.settings || {}) },
      travel: { ...defaultState.travel, ...(saved.travel || {}) },
      investment: { ...defaultState.investment, ...(saved.investment || {}) }
    };
  } catch {
    return clone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character];
  });
}

function money(value) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0
  }).format(value).replace("SGD", "S$");
}

function formatDate(iso, options) {
  return new Intl.DateTimeFormat("en-SG", options || {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(iso + "T12:00:00"));
}

function shortDate(iso) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" }).format(new Date(iso + "T12:00:00"));
}

function cashTotal() {
  return state.cashAvailable + state.savingsPocket + state.homeSavings;
}

function bufferMonths() {
  return state.recurringExpenses ? state.savingsPocket / state.recurringExpenses : 0;
}

function percentage(value, total) {
  const base = total === undefined ? state.netWorth : total;
  return base > 0 ? Math.max(0, Math.round((value / base) * 100)) : 0;
}

function loadAIModel() {
  if (!aiModelPromise) {
    aiModelPromise = fetch("ai/deep-kmeans-model.json", { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("AI model could not be loaded");
      return response.json();
    });
  }
  return aiModelPromise;
}

function currentAIFeatures() {
  const income = state.monthlyIncome;
  return [
    income,
    bufferMonths(),
    state.stage >= 3 ? 0.18 : 0.05,
    state.stage >= 2 && !state.travel.covered ? 1 : 0,
    Math.max(0, income - state.recurringExpenses),
    state.homeGoalTarget ? state.homeSavings / state.homeGoalTarget : 0
  ];
}

function encodeAIFeatures(model, rawFeatures) {
  let values = rawFeatures.map(function (value, index) {
    return (value - model.scaler.mean[index]) / model.scaler.scale[index];
  });
  model.encoder.layers.forEach(function (layer) {
    values = layer.biases.map(function (bias, outputIndex) {
      const total = values.reduce(function (sum, value, inputIndex) {
        return sum + value * layer.weights[inputIndex][outputIndex];
      }, bias);
      return Math.tanh(total);
    });
  });
  return values;
}

function inferAIState(model, rawFeatures) {
  const point = encodeAIFeatures(model, rawFeatures);
  const ranked = model.clusters.map(function (cluster) {
    const distance = Math.hypot(point[0] - cluster.centroid[0], point[1] - cluster.centroid[1]);
    return { cluster: cluster, distance: distance };
  }).sort(function (a, b) { return a.distance - b.distance; });
  return { point: point, cluster: ranked[0].cluster, distance: ranked[0].distance };
}

function aiJourneySnapshots() {
  const snapshots = [];
  if (state.stage >= 1) {
    snapshots.push({
      label: "First salary",
      features: [3600, 1000 / 2300, 0.05, 0, 1300, 0]
    });
  }
  if (state.stage >= 2) {
    snapshots.push({
      label: "Dubai gap",
      features: [3600, 3500 / 2300, 0.05, 1, 1300, 1000 / 60000]
    });
    if (state.travel.covered) {
      snapshots.push({
        label: "Cover confirmed",
        features: [3600, 3500 / 2300, 0.05, 0, 1300, 1000 / 60000]
      });
    }
  }
  if (state.stage >= 3) {
    snapshots.push({
      label: "First-home plan",
      features: [3600, 7300 / 2300, 0.18, state.travel.covered ? 0 : 1, 1300, 10000 / 60000]
    });
  }
  return snapshots;
}

function formatAIFeature(feature, value) {
  if (feature.format === "currency") return money(value);
  if (feature.format === "months") return value.toFixed(1) + " months";
  if (feature.format === "percent") return Math.round(value * 100) + "%";
  if (feature.key === "protection_gap") return value >= 0.75 ? "Gap detected" : "No active gap";
  return value.toFixed(2);
}

function aiPlotMarkup(model, currentInference, journey) {
  const width = 760;
  const height = 300;
  const padding = 42;
  const bounds = model.plot.bounds;
  const colors = Object.fromEntries(model.clusters.map(function (cluster) { return [cluster.id, cluster.color]; }));
  const x = function (value) { return padding + ((value - bounds.xMin) / (bounds.xMax - bounds.xMin)) * (width - padding * 2); };
  const y = function (value) { return height - padding - ((value - bounds.yMin) / (bounds.yMax - bounds.yMin)) * (height - padding * 2); };
  const samples = model.plot.samples.map(function (sample) {
    return "<circle cx='" + x(sample.x).toFixed(1) + "' cy='" + y(sample.y).toFixed(1) + "' r='2.3' fill='" + colors[sample.state] + "' opacity='.28' />";
  }).join("");
  const centroids = model.clusters.map(function (cluster) {
    return "<circle cx='" + x(cluster.centroid[0]).toFixed(1) + "' cy='" + y(cluster.centroid[1]).toFixed(1) + "' r='7' fill='white' stroke='" + cluster.color + "' stroke-width='3' />";
  }).join("");
  const journeyPoints = journey.map(function (item) { return [x(item.inference.point[0]), y(item.inference.point[1])]; });
  const journeyLine = journeyPoints.length > 1 ? "<polyline points='" + journeyPoints.map(function (point) { return point[0].toFixed(1) + "," + point[1].toFixed(1); }).join(" ") + "' fill='none' stroke='#242124' stroke-width='2' stroke-dasharray='5 5' opacity='.55' />" : "";
  const historyDots = journeyPoints.map(function (point, index) {
    const latest = index === journeyPoints.length - 1;
    return "<circle cx='" + point[0].toFixed(1) + "' cy='" + point[1].toFixed(1) + "' r='" + (latest ? 5 : 3.5) + "' fill='" + (latest ? "#242124" : "white") + "' stroke='#242124' stroke-width='2' />";
  }).join("");
  let currentDot = "";
  if (currentInference) {
    const currentX = x(currentInference.point[0]);
    const currentY = y(currentInference.point[1]);
    const labelX = Math.min(width - 54, Math.max(54, currentX + 34));
    const labelY = Math.min(height - 24, Math.max(26, currentY - 18));
    currentDot =
      "<circle class='ai-current-ring' cx='" + currentX.toFixed(1) + "' cy='" + currentY.toFixed(1) + "' r='13' fill='none' stroke='" + currentInference.cluster.color + "' stroke-width='3' />" +
      "<circle cx='" + currentX.toFixed(1) + "' cy='" + currentY.toFixed(1) + "' r='6' fill='" + currentInference.cluster.color + "' stroke='white' stroke-width='2' />" +
      "<text class='ai-point-label' x='" + labelX.toFixed(1) + "' y='" + labelY.toFixed(1) + "' text-anchor='middle'>Tom now</text>";
  }
  return "<div class='ai-chart'><svg viewBox='0 0 " + width + " " + height + "' role='img' aria-label='Two-dimensional autoencoder fingerprint with three K-means clusters'>" +
    "<rect x='1' y='1' width='758' height='298' rx='14' fill='#faf8f7' stroke='#e5e0dd' />" + samples + journeyLine + centroids + historyDots + currentDot +
    "<text class='ai-axis-label' x='380' y='283' text-anchor='middle'>Financial profile: dimension 1</text>" +
    "<text class='ai-axis-label' x='18' y='150' text-anchor='middle' transform='rotate(-90 18 150)'>Dimension 2</text>" +
    "</svg></div>";
}

function aiStateContent(model) {
  const rawFeatures = currentAIFeatures();
  const currentInference = state.stage ? inferAIState(model, rawFeatures) : null;
  const journey = aiJourneySnapshots().map(function (snapshot) {
    return { label: snapshot.label, inference: inferAIState(model, snapshot.features) };
  });
  const previous = journey.length > 1 ? journey[journey.length - 2].inference.cluster : null;
  const currentCluster = currentInference ? currentInference.cluster : null;
  const transition = currentCluster ?
    (previous && previous.id !== currentCluster.id ? previous.label + " → " + currentCluster.label : "Current state · " + currentCluster.label) :
    "Waiting for a meaningful income event";
  const featureCards = model.features.map(function (feature, index) {
    return "<div><span>" + feature.label + "</span><strong>" + formatAIFeature(feature, rawFeatures[index]) + "</strong></div>";
  }).join("");
  const legend = model.clusters.map(function (cluster) {
    return "<span><i style='background:" + cluster.color + "'></i>" + cluster.label + "</span>";
  }).join("");
  const stateCards = model.clusters.map(function (cluster) {
    return "<div class='ai-cluster-card " + (currentCluster && currentCluster.id === cluster.id ? "active" : "") + "' style='--cluster-color:" + cluster.color + "'><strong>" + cluster.label + "</strong><span>" + cluster.short + "</span></div>";
  }).join("");
  return "<div class='ai-engine'>" +
    "<div class='ai-model-note'><span>LIVE MODEL</span><p>A trained autoencoder compresses six consented features. K-means identifies the nearest planning state.</p></div>" +
    "<div class='ai-pipeline'><span><b>1</b> Consented data</span><i>→</i><span><b>2</b> Six features</span><i>→</i><span><b>3</b> Change checked</span><i>→</i><span><b>4</b> Deep state</span><i>→</i><span><b>5</b> Plan + trust</span></div>" +
    "<section class='ai-current-state' style='--cluster-color:" + (currentCluster ? currentCluster.color : "#777") + "'><div><small>MODEL RESULT</small><strong>" + (currentCluster ? currentCluster.label : "Not assigned") + "</strong><p>" + (currentCluster ? currentCluster.description : "ONE needs a meaningful change before assigning a planning state.") + "</p></div><span>" + transition + "</span></section>" +
    aiPlotMarkup(model, currentInference, journey) +
    "<div class='ai-legend'>" + legend + "<em>Tom's path is dashed</em></div>" +
    "<div class='ai-cluster-cards'>" + stateCards + "</div>" +
    "<div class='ai-feature-heading'><strong>Current consented snapshot</strong><span>Simulated connected data</span></div>" +
    "<div class='ai-feature-grid'>" + featureCards + "</div>" +
    "<div class='ai-authority-note'><strong>AI identifies the state. It does not authorise the action.</strong><p>Deterministic planning rules calculate the next step; customer permissions and the Trust Ladder decide what may happen.</p></div>" +
    "<p class='ai-model-meta'>" + model.model.syntheticTrainingSnapshots + " seeded synthetic snapshots · " + model.model.method + " · separation score " + model.model.silhouetteScore.toFixed(2) + "</p>" +
  "</div>";
}

async function openAIStateEngine() {
  openDetail({
    eyebrow: "AI STATE ENGINE",
    title: "Mapping Tom's financial state",
    content: "<div class='ai-loading'><span class='one-orb small'><span></span></span><p>Loading the trained state model…</p></div>",
    actions: button("Done", "close-detail", "primary")
  });
  try {
    const model = await loadAIModel();
    if (detailOverlay.hidden) return;
    openDetail({
      eyebrow: "AI STATE ENGINE · AUTOENCODER + K-MEANS",
      title: state.stage ? "Tom is " + inferAIState(model, currentAIFeatures()).cluster.label : "Waiting for the first change",
      content: aiStateContent(model),
      actions: button("Done", "close-detail", "primary")
    });
  } catch (error) {
    if (detailOverlay.hidden) return;
    openDetail({
      eyebrow: "AI STATE ENGINE",
      title: "Model unavailable",
      content: "<p class='detail-summary'>The trained demo model could not be loaded. Restart the local server and try again.</p>",
      actions: button("Done", "close-detail", "primary")
    });
  }
}

function addAudit(title, detail) {
  state.audit.unshift({ date: formatDate(state.currentISO, { day: "numeric", month: "short", year: "numeric" }) + ", 09:41", title: title, detail: detail });
}

function addNotification(config) {
  state.notifications.unshift({
    id: "notification-" + Date.now() + "-" + Math.random().toString(16).slice(2),
    icon: config.icon || "1",
    tone: config.tone || "green",
    title: config.title,
    body: config.body,
    destination: config.destination || "home",
    scenario: config.scenario || "",
    read: false,
    time: "Now"
  });
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2600);
}

function pendingActions() {
  return state.actions.filter(function (action) { return action.status === "pending"; });
}

function getAction(id) {
  return state.actions.find(function (action) { return action.id === id; });
}

function updateNavigation() {
  document.querySelectorAll("[data-view]").forEach(function (button) {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
  const count = pendingActions().length;
  actionCount.textContent = String(count);
  actionCount.hidden = count === 0;
}

function updateHeader() {
  const titles = {
    home: "Good morning, Tom",
    protection: "Protection",
    investments: "Investments",
    actions: "ONE decisions",
    controls: "Trust & permissions",
    assistant: "Ask ONE"
  };
  pageTitle.textContent = titles[state.view] || titles.home;
  pageEyebrow.textContent = formatDate(state.currentISO).toUpperCase();
}

function setView(view, focus) {
  if (view === "plan") view = "home";
  if (view === "calendar") view = "actions";
  state.view = view;
  saveState();
  render();
  if (focus !== false) content.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function render() {
  if (state.view === "plan") state.view = "home";
  if (state.view === "calendar") state.view = "actions";
  updateNavigation();
  updateHeader();
  renderNotifications();
  if (state.view === "protection") renderProtection();
  else if (state.view === "investments") renderInvestments();
  else if (state.view === "actions") renderActions();
  else if (state.view === "controls") renderControls();
  else if (state.view === "assistant") renderAssistant();
  else renderHome();
}

function statusPill(text, tone) {
  return "<span class='status-pill " + (tone || "") + "'>" + text + "</span>";
}

function button(text, command, kind) {
  return "<button class='button " + (kind || "secondary") + "' data-command='" + command + "'>" + text + "</button>";
}

function planPillar(title, value, copy, tone, command) {
  return "<button class='plan-pillar' data-command='" + command + "'><span class='pillar-icon " + tone + "'></span><span><small>" + title + "</small><strong>" + value + "</strong><p>" + copy + "</p></span><b aria-hidden='true'>&rsaquo;</b></button>";
}

function getHero() {
  if (state.currentInsight === "job") {
    const action = getAction("job");
    if (state.jobTransferUndone) {
      return {
        label: "TRANSFER REVERSED",
        tier: "CUSTOMER CONTROL",
        title: "Your S$1,000 is back in your main account.",
        body: "The salary remains credited. Only the savings transfer was reversed.",
        reason: "You reversed a Tier 1 action",
        primary: ["Review goals", "edit-goal"],
        secondary: null
      };
    }
    if (!action) {
      return {
        label: "FIRST SALARY RECEIVED",
        tier: "NO ONE ACTION",
        title: "Your finances updated, but ONE moved nothing.",
        body: "Idle-cash automation was off or your selected cash floor left no eligible amount.",
        reason: "Your boundary prevented the transfer",
        primary: ["Review Trust controls", "view-controls"],
        secondary: null
      };
    }
    return {
      label: "FIRST SALARY RECEIVED",
      tier: "TIER 1 · ACTED",
      title: "S$1,000 moved to emergency savings.",
      body: "Your cash after salary was S$4,800. ONE protected your S$3,000 cash floor and applied your S$1,000 transfer cap.",
      reason: "Saved instruction, same-name accounts, reversible",
      primary: ["See the calculation", "explain-job"],
      secondary: ["Undo transfer", "undo-job"]
    };
  }
  if (state.currentInsight === "trip") {
    if (state.travel.covered) {
      return {
        label: "TRAVEL COVER ACTIVE",
        tier: "TIER 2 · CONFIRMED",
        title: state.travel.selectedPlan === "plus" ? "Plus cover is ready for Dubai." : "Essential cover is ready for Dubai.",
        body: state.travel.provider + " cover runs from 2 to 8 August 2026. The certificate and limits are available under Protection.",
        reason: "Purchased only after your confirmation",
        primary: ["View coverage", "view-protection"],
        secondary: state.travel.selectedPlan === "essential" ? ["Review upgrade", "compare-cover"] : null
      };
    }
    if (!getAction("trip")) {
      return {
        label: "DUBAI BOOKING RECORDED",
        tier: "DATA PERMISSION PAUSED",
        title: "ONE did not analyse the trip for a protection gap.",
        body: "Contextual signals or connected-policy access is off. The booking remains in activity, but no insurance action was created.",
        reason: "Optional data permission blocked the analysis",
        primary: ["Review data choices", "view-controls"],
        secondary: null
      };
    }
    return {
      label: "UPCOMING TRIP IDENTIFIED",
      tier: "TIER 2 · CONFIRM",
      title: "No matching travel cover was found.",
      body: "ONE matched your Emirates booking for 2 to 8 August against recognised connected policies. It has not purchased anything.",
      reason: "Booking evidence plus connected-policy check",
      primary: ["Compare cover", "compare-cover"],
      secondary: ["How ONE decided", "explain-trip"]
    };
  }
  if (state.currentInsight === "mortgage") {
    return {
      label: state.advisorBooking ? "MEETING SCHEDULED" : "FIRST-HOME PLANNING",
      tier: "TIER 3 · HUMAN REVIEW",
      title: state.advisorBooking ? "Your affordability review is booked." : "Your first-home brief is ready.",
      body: state.advisorBooking ? "An OCBC advisor will review the information on " + formatDate(state.advisorBooking.date, { weekday: "long", day: "numeric", month: "long" }) + " at " + state.advisorBooking.time + "." : "ONE organised your income, savings and goal progress. It did not assess eligibility or approve a loan.",
      reason: "Long-term borrowing always requires the bank's approved process",
      primary: [state.advisorBooking ? "View meeting" : "Review prepared brief", "advisor-brief"],
      secondary: state.advisorBooking ? null : ["Book a review", "book-advisor"]
    };
  }
  return {
    label: "YOUR CONNECTED PLAN",
    tier: "NO ACTION NEEDED",
    title: "Start with the full picture.",
    body: "Your balances, protection and goals are connected. ONE will explain the evidence and ask only when a decision is needed.",
    reason: "No meaningful change has happened yet",
    primary: ["Review my goals", "edit-goal"],
    secondary: ["Review data choices", "view-controls"]
  };
}

function renderHome() {
  const hero = getHero();
  const activity = state.activityExpanded ? state.activity : state.activity.slice(0, 3);
  const homePct = Math.min(100, percentage(state.homeSavings, state.homeGoalTarget));
  content.innerHTML =
    "<div class='home-view'>" +
      "<div class='home-hero-grid'>" +
        "<section class='insight-hero'>" +
          "<div class='insight-top'><span class='hero-label'>" + hero.label + "</span><span class='trust-chip'>" + hero.tier + "</span></div>" +
          "<h2>" + hero.title + "</h2><p>" + hero.body + "</p>" +
          "<div class='reason-line'><span class='one-orb tiny'><span></span></span><div><small>Why ONE responded</small><strong>" + hero.reason + "</strong></div></div>" +
          "<div class='hero-actions'>" + button(hero.primary[0], hero.primary[1], "primary") + (hero.secondary ? button(hero.secondary[0], hero.secondary[1], "secondary") : "") + "</div>" +
        "</section>" +
        "<aside class='card plan-pulse'>" +
          "<div class='pulse-heading'><span class='one-orb small'><span></span></span><div><small>YOUR LIVING PLAN</small><strong>Continuously monitored</strong></div><i></i></div>" +
          "<div class='score-ring' style='--score:" + state.planScore + "'><strong>" + state.planScore + "</strong><small>plan score</small></div>" +
          "<p>ONE keeps banking, protection and investments aligned as your life changes.</p>" +
          "<div class='monitoring-list'><span><i></i>Cash flow</span><span><i></i>Protection gaps</span><span><i></i>Investment readiness</span></div>" +
          "<button class='pulse-link ai-pulse-link' data-command='ai-state-engine'><span><i>AI</i>View state engine</span><b>&rsaquo;</b></button>" +
        "</aside>" +
      "</div>" +
      "<section class='connected-plan-section'>" +
        "<div class='section-title-row'><div><p class='eyebrow'>ONE CONNECTED PLAN</p><h2>Your financial life, in one view</h2></div><span class='connected-chip'><i></i>4 sources live</span></div>" +
        "<div class='plan-pillars'>" +
          planPillar("Banking", money(cashTotal()), "Cash and goals working together", "banking", "view-home") +
          planPillar("Protection", state.travel.covered ? "Trip covered" : (state.stage >= 2 ? "1 gap to review" : "1 policy found"), protectionStatus(), "protection", "view-protection") +
          planPillar("Investments", money(state.investmentBalance), investmentStatusCopy(), "investment", "view-investments") +
        "</div>" +
      "</section>" +
      "<div class='overview-grid'>" +
        "<section class='card financial-card'>" +
          "<div class='card-heading'><div><p class='eyebrow'>FINANCIAL POSITION</p><h2>Where you stand</h2></div><span class='as-of'>As of " + shortDate(state.currentISO) + "</span></div>" +
          "<div class='net-worth'><span>Estimated net worth</span><strong>" + money(state.netWorth) + "</strong></div>" +
          "<div class='financial-bars'>" +
            miniBar("Available cash", state.cashAvailable, "#b72d34") +
            miniBar("Emergency savings", state.savingsPocket, "#3a7d62") +
            miniBar("First-home savings", state.homeSavings, "#c4a66a") +
            miniBar("Investments", state.investmentBalance, "#252326") +
          "</div>" +
        "</section>" +
        "<section class='card goals-card compact-goals'>" +
          "<div class='card-heading compact'><div><p class='eyebrow'>LIFE GOALS</p><h2>What you are building</h2></div><button class='text-button red' data-command='edit-goal'>Edit</button></div>" +
          goalRow("Emergency buffer", money(state.savingsPocket) + " / " + money(state.recurringExpenses * 3), Math.min(100, percentage(state.savingsPocket, state.recurringExpenses * 3)), "green") +
          goalRow("First home", money(state.homeSavings) + " / " + money(state.homeGoalTarget), homePct, "red") +
        "</section>" +
      "</div>" +
      "<section class='card compact-activity'>" +
        "<div class='card-heading compact'><div><p class='eyebrow'>CLOSED-LOOP PLAN</p><h2>What ONE noticed and changed</h2></div><button class='text-button' data-command='toggle-activity'>" + (state.activityExpanded ? "Show less" : "See all") + "</button></div>" +
        "<div class='activity-list'>" + activity.map(activityMarkup).join("") + "</div>" +
      "</section>" +
    "</div>";
}

function miniBar(label, value, color) {
  const max = Math.max(cashTotal(), state.investmentBalance, 1);
  return "<div class='mini-bar-row'><span>" + label + "</span><div class='mini-bar'><i style='width:" + Math.max(3, percentage(value, max)) + "%;background:" + color + "'></i></div><strong>" + money(value) + "</strong></div>";
}

function activityMarkup(item) {
  return "<div class='activity-row'><span class='activity-icon " + (item.tone || "") + "'>" + item.icon + "</span><div class='activity-copy'><strong>" + item.title + "</strong><small>" + item.subtitle + "</small></div><div class='activity-amount'>" + item.amount + "<small>" + (item.note || "") + "</small></div></div>";
}

function protectionStatus() {
  if (state.travel.covered) return "Trip cover active";
  if (state.stage >= 2) return "Travel gap found";
  return "1 area connected";
}

function investmentStatusCopy() {
  const months = bufferMonths();
  return months >= 3 ? "Emergency buffer is ready for a suitability review" : months.toFixed(1) + " months of expenses in emergency savings";
}

function goalRow(title, value, pct, tone) {
  return "<div class='goal-row'><div class='goal-top'><strong>" + title + "</strong><span>" + value + "</span></div><div class='goal-track'><i class='" + tone + "' style='width:" + Math.max(2, pct) + "%'></i></div></div>";
}

function consentSourceCount() {
  return 1 + (state.consent.connectedPolicies ? 1 : 0) + (state.consent.contextualSignals ? 1 : 0) + (state.consent.personalisedInsights ? 1 : 0);
}

function renderProtection() {
  const tripState = state.travel.covered ? "Active" : state.stage >= 2 ? "Gap identified" : "No upcoming trip";
  const tripTone = state.travel.covered ? "green" : state.stage >= 2 ? "red" : "grey";
  content.innerHTML =
    "<div class='page-view'>" +
      "<section class='protection-compact-grid'>" +
        "<div class='card policy-list-card'><div class='card-heading'><div><h2>Your policies</h2></div>" + statusPill((state.travel.covered ? "2" : "1") + " connected", "green") + "</div>" +
          policyRow("Hospital and surgical", "Connected health policy", "Core hospital cover recognised", "Connected insurer · Updated 10 Jan", "green", "policy-hospital") +
          policyRow("Dubai travel, 2 to 8 Aug", state.travel.covered ? state.travel.provider + " " + travelPlans[state.travel.selectedPlan].name : "No matching active policy", state.travel.covered ? "Certificate and limits available" : "No cover found in connected sources", state.travel.covered ? "Purchased " + shortDate(state.currentISO) : "Checked 18 Jul 2026", tripTone, state.travel.covered ? "policy-travel" : "compare-cover") +
        "</div>" +
        "<div class='card priority-card compact-priority'><div class='card-heading'><div><p class='eyebrow'>NEXT PRIORITIES</p><h2>Protect first</h2></div><button class='text-button' data-command='protection-method'>Why</button></div>" +
          priorityItem("Hospital expenses", "Check limits and exclusions.", "Connected", "green") +
          priorityItem("Income interruption", "Review while income is new.", "Next", "red") +
          priorityItem("Life cover", state.stage >= 3 ? "Review with the mortgage." : "Revisit with dependants or debt.", state.stage >= 3 ? "Review" : "Later", state.stage >= 3 ? "sand" : "grey") +
        "</div>" +
      "</section>" +
      "<section class='card travel-choice-card'>" +
        "<div class='travel-choice-copy'><p class='eyebrow'>UPCOMING DUBAI TRIP</p><h2>" + tripState + "</h2><p>" + travelProtectionCopy() + "</p><div class='coverage-chips'><span>2 to 8 Aug 2026</span><span>Trip cost S$1,250</span><span>No location tracking</span></div></div>" +
        "<div class='travel-choice-action'>" + (state.stage < 2 ? "<span class='muted-box'>A cover comparison appears after the booking event.</span>" : button(state.travel.covered ? "Review or upgrade cover" : "Compare cover options", "compare-cover", "primary")) + "</div>" +
      "</section>" +
    "</div>";
}

function policyRow(title, provider, status, source, tone, command) {
  return "<button class='policy-row' data-command='" + command + "'><span class='policy-symbol " + tone + "'>✓</span><span><strong>" + title + "</strong><small>" + provider + "</small></span><span><strong>" + status + "</strong><small>" + source + "</small></span><b>›</b></button>";
}

function priorityItem(title, copy, status, tone) {
  return "<div class='priority-item'><span class='priority-dot " + tone + "'></span><div><strong>" + title + "</strong><p>" + copy + "</p></div>" + statusPill(status, tone) + "</div>";
}

function travelProtectionCopy() {
  if (state.travel.covered) return travelPlans[state.travel.selectedPlan].name + " cover is active through " + state.travel.provider + ". Review the exact limits and exclusions before travel.";
  if (state.stage >= 2) return "ONE found no policy matching the destination and dates in connected sources. Compare core cover with an optional higher-limit plan.";
  return "No travel cover action is needed until a dated booking is identified.";
}

function renderInvestments() {
  const months = bufferMonths();
  const ready = state.monthlyIncome > 0 && months >= 3;
  const amount = state.investment.draftMonthly;
  const projectionValue = investmentProjection(amount);
  const contributed = state.investmentBalance + amount * 120;
  const growth = Math.max(0, projectionValue - contributed);
  content.innerHTML =
    "<div class='page-view'>" +
      "<section class='card readiness-card compact-readiness'><div class='card-heading'><div><p class='eyebrow'>" + money(state.investmentBalance) + " CONNECTED · READINESS CHECK</p><h2>" + (ready ? "Financial buffer ready" : "Not ready to increase risk yet") + "</h2></div><div class='card-heading-actions'>" + statusPill(ready ? "Ready to review" : "Build buffer first", ready ? "green" : "sand") + "<button class='text-button' data-command='ai-state-engine'>View AI state</button><button class='text-button' data-command='investment-method'>How this works</button></div></div>" +
          readinessRow("Recurring income", state.monthlyIncome > 0, state.monthlyIncome > 0 ? money(state.monthlyIncome) + " take-home" : "Not established") +
          readinessRow("Emergency savings", months >= 3, months.toFixed(1) + " of 3 months") +
          readinessRow("Risk and time horizon", state.investment.riskProfileComplete, state.investment.riskProfileComplete ? state.investment.riskLevel : "Questions not completed") +
          readinessRow("Product suitability", false, "Required before recommendation") +
          "<div class='inline-actions'>" + button(state.investment.riskProfileComplete ? "Review my answers" : "Complete planning questions", "risk-check", ready ? "primary" : "secondary") + "</div>" +
      "</section>" +
      "<section class='card simulator-card'>" +
        "<div class='card-heading'><div><p class='eyebrow'>PLANNING SIMULATOR</p><h2>Test a monthly amount</h2><p>This changes a projection only. It does not create an investment instruction.</p></div></div>" +
        "<div class='simulator-layout'><div class='simulator-control'><label for='investment-range'>Monthly amount <strong id='investment-amount-label'>" + money(amount) + "</strong></label><input id='investment-range' data-investment-range type='range' min='0' max='500' step='50' value='" + amount + "' />" +
          "<div class='range-labels'><span>S$0</span><span>S$500</span></div>" +
          "<div class='cash-impact'><span>Monthly surplus after regular expenses</span><strong>" + money(Math.max(0, state.monthlyIncome - state.recurringExpenses)) + "</strong><span>Cash left after planned amount</span><strong id='cash-after-plan'>" + money(Math.max(0, state.monthlyIncome - state.recurringExpenses - amount)) + "</strong></div>" +
        "</div><div class='projection-panel'><small>Illustrative value after 10 years</small><strong id='projection-value'>" + money(projectionValue) + "</strong><div class='projection-bar'><i id='contribution-bar' style='width:" + percentage(contributed, projectionValue) + "%'></i></div><div class='projection-legend'><span>Contributions <b id='projection-contributions'>" + money(contributed) + "</b></span><span>Illustrative growth <b id='projection-growth'>" + money(growth) + "</b></span></div><p>Assumes 4% annual return before fees, with monthly contributions. Returns are not guaranteed and losses are possible.</p></div></div>" +
        "<div class='simulator-footer'><div><strong>" + (ready ? "This amount can be reviewed after suitability." : "ONE would prioritise the emergency buffer first.") + "</strong><p>" + (ready ? "The selected amount still requires confirmation and a suitable product." : "Saving the plan records an intention only. It will not move money.") + "</p></div>" + button("Save as a planning amount", "save-investment-plan", "primary") + "</div>" +
      "</section>" +
    "</div>";
}

function investmentProjection(monthly) {
  const monthlyRate = 0.04 / 12;
  const periods = 120;
  const existing = state.investmentBalance * Math.pow(1 + monthlyRate, periods);
  const contributions = monthly ? monthly * ((Math.pow(1 + monthlyRate, periods) - 1) / monthlyRate) : 0;
  return Math.round(existing + contributions);
}

function readinessRow(label, passed, detail) {
  return "<div class='readiness-row'><span class='" + (passed ? "passed" : "waiting") + "'>" + (passed ? "✓" : "•") + "</span><strong>" + label + "</strong><small>" + detail + "</small></div>";
}

function calendarItems() {
  const items = [
    { date: "2026-01-10", title: "Plan started", detail: "Connected financial starting point", tone: "grey" }
  ];
  if (state.stage >= 1) items.push({ date: "2026-02-28", title: "First salary received", detail: "S$3,600 take-home credit", tone: "green" });
  if (state.stage >= 2) {
    items.push({ date: "2026-07-18", title: "Dubai booking identified", detail: "Emirates · S$1,250", tone: "red" });
    if (state.travel.calendarAdded) items.push({ date: "2026-08-02", endDate: "2026-08-08", title: "Trip to Dubai", detail: state.travel.covered ? travelPlans[state.travel.selectedPlan].name + " cover active" : "Travel cover not confirmed", tone: state.travel.covered ? "green" : "sand" });
  }
  if (state.stage >= 3) items.push({ date: "2027-11-09", title: "First-home planning", detail: "Affordability brief prepared", tone: "red" });
  if (state.advisorBooking) items.push({ date: state.advisorBooking.date, title: "OCBC advisor review", detail: state.advisorBooking.time + " · First-home affordability", tone: "green" });
  return items.sort(function (a, b) { return a.date.localeCompare(b.date); });
}

function calendarPanelMarkup() {
  const parts = state.calendarMonth.split("-").map(Number);
  const year = parts[0];
  const month = parts[1] - 1;
  const first = new Date(year, month, 1);
  const firstDay = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const previousDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    let cellDay;
    let cellMonth = month;
    let cellYear = year;
    let muted = false;
    if (index < firstDay) {
      cellDay = previousDays - firstDay + index + 1;
      cellMonth = month - 1;
      muted = true;
    } else if (index >= firstDay + days) {
      cellDay = index - firstDay - days + 1;
      cellMonth = month + 1;
      muted = true;
    } else {
      cellDay = index - firstDay + 1;
    }
    if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
    if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
    const iso = cellYear + "-" + String(cellMonth + 1).padStart(2, "0") + "-" + String(cellDay).padStart(2, "0");
    const events = calendarItems().filter(function (item) { return item.date === iso || (item.endDate && iso >= item.date && iso <= item.endDate); });
    cells.push("<div class='calendar-day " + (muted ? "muted" : "") + (iso === state.currentISO ? " today" : "") + "'><span>" + cellDay + "</span>" + events.map(function (event) { return "<button class='day-event " + event.tone + "' data-command='calendar-event' data-event-date='" + event.date + "' title='" + escapeHTML(event.title) + "'>" + event.title + "</button>"; }).join("") + "</div>");
  }
  const monthTitle = new Intl.DateTimeFormat("en-SG", { month: "long", year: "numeric" }).format(first);
  return "<section class='card calendar-card combined-calendar'><div class='calendar-title-row'><div><p class='eyebrow'>CALENDAR</p><h2>" + monthTitle + "</h2></div><div class='calendar-tools'>" + (state.stage >= 2 ? button(state.travel.calendarAdded ? "Trip added" : "Add trip", "add-trip-calendar", state.travel.calendarAdded ? "secondary" : "primary") : "") + "<button class='icon-button subtle' data-command='calendar-prev' aria-label='Previous month'>‹</button><button class='icon-button subtle' data-command='calendar-next' aria-label='Next month'>›</button></div></div><div class='weekdays'><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class='calendar-grid'>" + cells.join("") + "</div><p class='calendar-note'>Dates organise the plan. They do not give ONE permission to act.</p></section>";
}

function renderActions() {
  const tabs = [
    ["all", "All"],
    ["1", "Tier 1 · Act"],
    ["2", "Tier 2 · Confirm"],
    ["3", "Tier 3 · Human"]
  ];
  const visible = state.actions.filter(function (action) { return state.selectedActionTab === "all" || String(action.tier) === state.selectedActionTab; });
  content.innerHTML =
    "<div class='page-view compact-actions-view'>" +
      "<section class='decision-page-intro'><div><p class='eyebrow'>DECISION HISTORY</p><h2>Every decision has a clear owner.</h2></div><div class='decision-page-status'><strong>" + pendingActions().length + "</strong><span>waiting for you</span></div></section>" +
      "<div class='compact-page-bar'><div class='tier-key'><span><b>1</b> ONE acts</span><span><b>2</b> You confirm</span><span><b>3</b> Human steps in</span></div><button class='text-button red' data-command='view-controls'>Manage authority</button></div>" +
      "<div class='actions-calendar-layout'><div class='actions-main'>" +
        "<div class='actions-heading'><div><h2>Activity and approvals</h2><p>What ONE did, and what it left for you.</p></div></div>" +
        "<div class='action-tabs'>" + tabs.map(function (tab) { return "<button class='" + (state.selectedActionTab === tab[0] ? "active" : "") + "' data-action-tab='" + tab[0] + "'>" + tab[1] + "</button>"; }).join("") + "</div>" +
        "<div class='action-list'>" + (visible.length ? visible.map(actionMarkup).join("") : "<div class='card empty-state compact'><span class='one-orb small'><span></span></span><h2>No decisions yet</h2><p>Use the life event simulator in the top bar to see ONE respond within Tom's limits.</p></div>") + "</div>" +
      "</div>" + calendarPanelMarkup() + "</div>" +
    "</div>";
}

function actionMarkup(action) {
  const data = action.id === "job" ? {
    label: "ACTED WITHIN YOUR LIMIT",
    why: "A recognised salary credit left cash above your protected floor.",
    used: "OCBC salary credit and saved transfer instruction",
    did: state.jobTransferUndone ? "Transfer reversed by Tom" : "Moved " + money(action.amount) + " to emergency savings",
    limit: "Maximum S$1,000, same-name accounts, reversible",
    primary: state.jobTransferUndone ? ["Review goals", "edit-goal"] : ["View calculation", "explain-job"],
    secondary: state.jobTransferUndone ? null : ["Undo", "undo-job"]
  } : action.id === "trip" ? {
    label: state.travel.covered ? "CONFIRMED BY TOM" : "WAITING FOR TOM",
    why: "A dated Emirates booking did not match active cover in connected policies.",
    used: "Merchant, amount, travel dates and connected policy status",
    did: state.travel.covered ? "Purchased " + travelPlans[state.travel.selectedPlan].name + " cover after confirmation" : "Prepared two illustrative cover levels",
    limit: "No purchase until Tom confirms price, limits and terms",
    primary: state.travel.covered ? ["View policy", "policy-travel"] : ["Compare cover", "compare-cover"],
    secondary: ["How ONE decided", "explain-trip"]
  } : {
    label: state.advisorBooking ? "HUMAN REVIEW BOOKED" : "HUMAN REVIEW REQUIRED",
    why: "Tom opened a first-home goal that may create a long-term liability.",
    used: "Income, connected debts, cash and first-home savings",
    did: state.advisorBooking ? "Shared a prepared brief with Tom's consent" : "Prepared a brief, no eligibility decision",
    limit: "OCBC underwriting and affordability checks remain mandatory",
    primary: ["View brief", "advisor-brief"],
    secondary: state.advisorBooking ? null : ["Book review", "book-advisor"]
  };
  return "<article class='card action-card tier-" + action.tier + "'><div class='action-card-top'><span class='tier-badge'><b>" + action.tier + "</b><span>Tier " + action.tier + "<small>" + (action.tier === 1 ? "Act" : action.tier === 2 ? "Confirm" : "Human") + "</small></span></span><span class='action-state " + action.status + "'>" + data.label + "</span></div><h2>" + action.title + "</h2><p class='action-why'>" + data.why + "</p><div class='action-card-footer'><small>" + formatDate(action.date, { day: "numeric", month: "long", year: "numeric" }) + "</small><div>" + button(data.primary[0], data.primary[1], "primary") + (data.secondary ? button(data.secondary[0], data.secondary[1], "secondary") : "") + "</div></div></article>";
}

function renderControls() {
  content.innerHTML =
    "<div class='page-view trust-centre'>" +
      "<div class='controls-simple-grid'>" +
          "<section class='card setting-group'><div class='card-heading'><div><p class='eyebrow'>DATA PERMISSIONS</p><h2>What ONE can understand</h2><p>Optional access never gives ONE permission to transact.</p></div><button class='text-button red' data-command='privacy-notice'>Full details</button></div>" +
            consentControl("required", "OCBC account and plan data", "Balances, transactions and goals needed for the service.", true, true) +
            consentControl("connectedPolicies", "Connected policies and external accounts", "Check recognised cover and include balances you authorise.", state.consent.connectedPolicies, false) +
            consentControl("contextualSignals", "Contextual transaction signals", "Use merchant, amount and dates to identify relevant events. No location tracking.", state.consent.contextualSignals, false) +
            consentControl("personalisedInsights", "Personalised planning insights", "Explain gaps and next steps. This never permits a purchase.", state.consent.personalisedInsights, false) +
            "<div class='setting-footer'><span>Consent notice " + escapeHTML(state.consent.policyVersion || POLICY_VERSION) + (state.consent.acceptedAt ? " · saved " + new Date(state.consent.acceptedAt).toLocaleDateString("en-SG") : "") + "</span><button class='text-button' data-command='withdraw-optional'>Withdraw all optional permissions</button></div>" +
          "</section>" +
          "<section class='card setting-group action-boundaries'><div class='card-heading'><div><p class='eyebrow'>ACTION BOUNDARIES</p><h2>What ONE may do</h2><p>Automatic authority applies only when every saved rule is met.</p></div>" + statusPill("Reversible only", "green") + "</div>" +
            "<div class='setting-row'><div class='setting-copy'><span class='setting-tier t1'>1</span><div><strong>Move idle cash to emergency savings</strong><small>Only between Tom's own OCBC accounts. Reversible.</small></div></div><button class='toggle " + (state.settings.idleSweep ? "on" : "") + "' role='switch' aria-checked='" + state.settings.idleSweep + "' data-setting-toggle='idleSweep'><i></i></button></div>" +
            "<div class='boundary-box'><label>Keep at least <span class='input-money'>S$ <input data-cash-threshold type='number' min='1000' max='10000' step='500' value='" + state.settings.cashThreshold + "' /></span></label><label>Move no more than <span class='input-money'>S$ <input data-transfer-cap type='number' min='100' max='2000' step='100' value='" + state.settings.transferCap + "' /></span></label><p>Both conditions must be met. The lower eligible amount is used.</p></div>" +
            lockedSetting("2", "Insurance and investment confirmations", "ONE prepares the choice and explains the impact. Tom must approve it.", "You always confirm") +
            lockedSetting("3", "Mortgage, new product or action above S$10,000", "ONE stops and prepares context for an OCBC Relationship Manager.", "Human review locked") +
          "</section>" +
      "</div>" +
      "<div class='control-tools'><button class='text-button' data-command='audit-log'>View audit trail</button><button class='text-button' data-command='privacy-notice'>Privacy and authority details</button><button class='text-button red' data-command='reset-all'>Reset app and consent</button></div>" +
    "</div>";
}

function consentControl(key, title, copy, checked, locked) {
  return "<div class='setting-row'><div class='setting-copy'><span class='data-icon'>D</span><div><strong>" + title + "</strong><small>" + copy + "</small></div></div>" + (locked ? "<span class='required-label'>Required</span>" : "<button class='toggle " + (checked ? "on" : "") + "' role='switch' aria-checked='" + checked + "' data-consent-toggle='" + key + "'><i></i></button>") + "</div>";
}

function lockedSetting(tier, title, copy, label) {
  return "<div class='setting-row locked'><div class='setting-copy'><span class='setting-tier t" + tier + "'>" + tier + "</span><div><strong>" + title + "</strong><small>" + copy + "</small></div></div><span class='locked-label'>▣ " + label + "</span></div>";
}

function renderAssistant() {
  const suggestions = [
    "Why did you move my money?",
    "What data can ONE see?",
    "Why does a mortgage need a person?",
    "How does the AI state engine work?"
  ];
  content.innerHTML =
    "<div class='assistant-view'>" +
      "<section class='card chat-card'><div class='chat-header'><span class='one-orb small'><span></span></span><div><strong>ONE</strong><small>Explains your connected plan</small></div><span class='assistant-scope'>Cannot approve transactions</span></div>" +
        "<div class='message-list'>" + state.chat.map(function (message) { return "<div class='message " + message.from + "'><p>" + escapeHTML(message.text) + "</p><small>" + message.time + "</small></div>"; }).join("") + "</div>" +
        "<div class='suggestion-row'>" + suggestions.map(function (text) { return "<button data-chat-suggestion='" + escapeHTML(text) + "'>" + text + "</button>"; }).join("") + "</div>" +
        "<form class='chat-form' id='chat-form'><input id='chat-input' autocomplete='off' placeholder='Ask about an action, data source or safety limit' /><button class='button primary' type='submit'>Send</button></form>" +
        "<p class='assistant-disclaimer'>ONE explains recorded plan logic. It does not replace product terms, regulated advice or OCBC's approval process.</p>" +
      "</section>" +
    "</div>";
  requestAnimationFrame(function () {
    const list = content.querySelector(".message-list");
    if (list) list.scrollTop = list.scrollHeight;
  });
}

function assistantReply(question) {
  const lower = question.toLowerCase();
  if (lower.includes("move") || lower.includes("salary")) {
    const eligible = Math.max(0, 4800 - state.settings.cashThreshold);
    return "The salary raised available cash to S$4,800. Your instruction protects " + money(state.settings.cashThreshold) + ", leaving " + money(eligible) + " eligible. ONE could move only the lower of that amount and your " + money(state.settings.transferCap) + " cap. The transfer stayed between your accounts and can be reversed.";
  }
  if (lower.includes("data") || lower.includes("see") || lower.includes("consent")) {
    return "Required OCBC plan data is active. Connected policies are " + (state.consent.connectedPolicies ? "on" : "off") + ", contextual transaction signals are " + (state.consent.contextualSignals ? "on" : "off") + ", and personalised insights are " + (state.consent.personalisedInsights ? "on" : "off") + ". You can change each optional permission in Trust controls.";
  }
  if (lower.includes("protect") || lower.includes("insurance") || lower.includes("cover")) {
    return "The current order is: verify core hospital coverage, build emergency cash, then assess income interruption. Life and higher critical-illness cover become more relevant when Tom has dependants or a mortgage. The Dubai plan is trip-specific and still needs confirmation.";
  }
  if (lower.includes("invest")) {
    return "Your emergency savings cover " + bufferMonths().toFixed(1) + " months of regular expenses. ONE uses three months as the planning gate in this demo. Even after that, risk, time horizon, financial situation, fees and product suitability must be reviewed before any recommendation or order.";
  }
  if (lower.includes("cluster") || lower.includes("autoencoder") || lower.includes("state engine") || lower.includes("ai state")) {
    return "The autoencoder compresses six consented financial features into a two-number fingerprint. K-means assigns the nearest planning state. That label can prioritise an explanation, but transaction authority still comes from deterministic rules, customer permissions and the Trust Ladder.";
  }
  if (lower.includes("mortgage") || lower.includes("person") || lower.includes("human")) {
    return "A mortgage creates a long-term liability. ONE can organise income, debt and savings data, but OCBC must verify affordability, apply current property-loan rules and complete underwriting. Relationship status is not used to decide eligibility.";
  }
  return "I can explain the evidence, calculation, data permission and safety limit behind each ONE action. Try asking what data I used, why an action was allowed or what still needs human review.";
}

function openDetail(config) {
  detailEyebrow.textContent = config.eyebrow || "DETAILS";
  detailTitle.textContent = config.title;
  detailContent.innerHTML = config.content || "";
  detailActions.innerHTML = config.actions || button("Done", "close-detail", "primary");
  detailOverlay.hidden = false;
  document.body.classList.add("modal-open");
  document.querySelector("#close-detail").focus();
}

function closeDetail() {
  detailOverlay.hidden = true;
  detailContent.innerHTML = "";
  detailActions.innerHTML = "";
  if (demoOverlay.hidden && consentOverlay.hidden) document.body.classList.remove("modal-open");
}

function openActionExplanation(id) {
  if (id === "job") {
    const action = getAction("job");
    const afterSalary = 4800;
    const eligible = Math.max(0, afterSalary - state.settings.cashThreshold);
    const moved = action ? action.amount : 0;
    openDetail({
      eyebrow: "TIER 1 · DECISION RECORD",
      title: "Why ONE moved " + money(moved),
      content:
        "<p class='detail-summary'>This was a deterministic standing instruction, not an open-ended AI decision.</p>" +
        "<div class='calculation-card'><div><span>Cash after salary</span><strong>" + money(afterSalary) + "</strong></div><b>−</b><div><span>Protected cash floor</span><strong>" + money(state.settings.cashThreshold) + "</strong></div><b>=</b><div><span>Eligible idle cash</span><strong>" + money(eligible) + "</strong></div></div>" +
        "<div class='decision-box'><span>Applied cap</span><strong>Lower of " + money(eligible) + " and " + money(state.settings.transferCap) + " = " + money(moved) + "</strong></div>" +
        detailSections([
          ["Evidence used", "OCBC salary credit of S$3,600 on 28 February 2026. No external data was needed."],
          ["Authority", "Tom enabled transfers between his own OCBC 360 Account and emergency savings pocket."],
          ["Safety checks", "Same customer, liquid destination, cash floor preserved, per-transfer cap applied and reversal available."],
          ["Not allowed", "ONE could not send money to another person, invest it or increase the cap."]
        ]),
      actions: (state.jobTransferUndone ? "" : button("Undo transfer", "undo-job", "secondary")) + button("View AI state", "ai-state-engine", "secondary") + button("Done", "close-detail", "primary")
    });
    return;
  }
  openDetail({
    eyebrow: "TIER 2 · DECISION RECORD",
    title: "Why the Dubai cover action appeared",
    content:
      "<p class='detail-summary'>ONE found a possible protection gap. It did not decide that Tom must buy a policy.</p>" +
      "<div class='evidence-timeline'><div><span>1</span><strong>Booking evidence</strong><p>Emirates card payment of S$1,250 with travel dates 2 to 8 August.</p></div><div><span>2</span><strong>Coverage check</strong><p>No policy matching those dates and destination was found in connected sources checked on 18 July.</p></div><div><span>3</span><strong>Limited result</strong><p>ONE prepared two illustrative cover levels and waits for Tom to compare the full terms.</p></div></div>" +
      detailSections([
        ["Data used", "Merchant, amount, booking dates and authorised connected-policy records."],
        ["Data not used", "Continuous location, private messages, relationship status or medical assumptions."],
        ["Why Essential appears first", "The S$48 option covers the main trip risks at the lower premium. Plus is shown separately for higher limits."],
        ["Safety limit", "No policy can be purchased until Tom chooses a provider and plan, sees limits and exclusions, and confirms."]
      ]),
    actions: button("Compare cover", "compare-cover", "primary") + button("View AI state", "ai-state-engine", "secondary") + button("Not now", "close-detail", "secondary")
  });
}

function detailSections(items) {
  return "<div class='detail-sections'>" + items.map(function (item) { return "<section><strong>" + item[0] + "</strong><p>" + item[1] + "</p></section>"; }).join("") + "</div>";
}

function openTravelCompare() {
  if (state.stage < 2) {
    showToast("Run the Dubai booking event first");
    return;
  }
  const selected = travelPlans[state.travel.selectedPlan];
  const difference = state.travel.covered ? Math.max(0, selected.premium - state.travel.premium) : selected.premium;
  openDetail({
    eyebrow: "TIER 2 · YOUR CONFIRMATION",
    title: state.travel.covered ? "Review or upgrade travel cover" : "Compare cover for Dubai",
    content:
      "<div class='comparison-context'><div><span>Trip</span><strong>Dubai · 2 to 8 Aug</strong></div><div><span>Booking value</span><strong>S$1,250</strong></div><div><span>Current travel cover</span><strong>" + (state.travel.covered ? travelPlans[state.travel.selectedPlan].name : "None found") + "</strong></div></div>" +
      "<div class='recommendation-note'><span class='one-orb tiny'><span></span></span><div><strong>ONE's planning view</strong><p>Essential covers the main trip risks at the lower price. Plus is optional if higher cancellation, baggage and medical limits are worth S$24 more to you.</p></div></div>" +
      "<div class='plan-options'>" + Object.keys(travelPlans).map(function (key) {
        const plan = travelPlans[key];
        const active = state.travel.selectedPlan === key;
        return "<label class='plan-option " + (active ? "selected" : "") + "'><input type='radio' name='travel-plan' data-travel-plan value='" + key + "' " + (active ? "checked" : "") + " /><span class='plan-radio'></span><span class='plan-copy'><span><strong>" + plan.name + "</strong>" + (key === "essential" ? "<em>Suggested starting point</em>" : "<em>Optional higher limits</em>") + "</span><small>" + plan.summary + "</small><b>S$" + plan.premium + "</b></span></label>";
      }).join("") + "</div>" +
      "<div class='provider-choice'><div><strong>Choose where to continue</strong><small>Great Eastern is easier to connect, but it is not pre-selected as the only provider.</small></div><label><input type='radio' name='travel-provider' data-travel-provider value='Great Eastern' " + (state.travel.provider === "Great Eastern" ? "checked" : "") + " /><span><b>Great Eastern</b><small>Connected Group provider · policy can appear in ONE</small></span></label><label><input type='radio' name='travel-provider' data-travel-provider value='Other eligible insurer' " + (state.travel.provider !== "Great Eastern" ? "checked" : "") + " /><span><b>Compare other eligible insurers</b><small>Continue to an approved comparison journey</small></span></label></div>" +
      "<div id='coverage-details'>" + coverageDetailsMarkup(selected) + "</div>" +
      "<div class='exclusion-box'><strong>Review before confirming</strong><p>Pre-existing conditions, high-risk activities, alcohol-related events, unattended belongings and other exclusions may apply. The policy wording and eligibility questions take priority over this summary.</p></div>",
    actions: button(state.travel.covered ? (difference ? "Confirm upgrade · " + money(difference) : "Keep current cover") : "Confirm cover · " + money(selected.premium), "confirm-cover", "primary") + button("Cancel", "close-detail", "secondary")
  });
}

function coverageDetailsMarkup(plan) {
  return "<div class='coverage-details'><div><span>Selected cover</span><strong>" + plan.name + " · S$" + plan.premium + "</strong></div>" + plan.coverage.map(function (row) { return "<div><span>" + row[0] + "</span><strong>" + row[1] + "</strong></div>"; }).join("") + "</div>";
}

function openPolicyDetail(type) {
  if (type === "hospital") {
    openDetail({
      eyebrow: "CONNECTED POLICY",
      title: "Hospital and surgical cover",
      content: "<p class='detail-summary'>A connected policy record indicates core hospital cover. ONE has not assessed whether the limits are sufficient.</p>" + detailSections([
        ["Recognised", "Hospitalisation and surgical benefits are present in the connected record."],
        ["Still verify", "Ward class, deductible, co-insurance, panel restrictions, annual limit and exclusions."],
        ["Source", "Connected insurer record, simulated for this prototype."],
        ["Next review", "Review after a major income, health, dependant or housing change."]
      ])
    });
    return;
  }
  if (!state.travel.covered) {
    openTravelCompare();
    return;
  }
  const plan = travelPlans[state.travel.selectedPlan];
  openDetail({
    eyebrow: "ACTIVE TRAVEL POLICY",
    title: state.travel.provider + " " + plan.name,
    content: "<div class='policy-certificate'><span>Coverage dates</span><strong>2 to 8 August 2026</strong><small>Certificate ONE-DXB-260802</small></div>" + coverageDetailsMarkup(plan) + "<div class='exclusion-box'><strong>Policy wording applies</strong><p>This screen is a summary. Claims remain subject to eligibility, definitions, limits, exclusions and supporting documents in the issued policy.</p></div>",
    actions: (state.travel.selectedPlan === "essential" ? button("Review Plus upgrade", "compare-cover", "secondary") : "") + button("Done", "close-detail", "primary")
  });
}

function openAdvisorBrief() {
  openDetail({
    eyebrow: "TIER 3 · PREPARED FOR REVIEW",
    title: "First-home affordability brief",
    content:
      "<p class='detail-summary'>ONE organised available facts. The figures below are not a loan offer or eligibility result.</p>" +
      "<div class='brief-grid'><div><span>Take-home income</span><strong>" + money(state.monthlyIncome) + " monthly</strong></div><div><span>Available cash</span><strong>" + money(state.cashAvailable) + "</strong></div><div><span>First-home savings</span><strong>" + money(state.homeSavings) + "</strong></div><div><span>Emergency savings</span><strong>" + money(state.savingsPocket) + "</strong></div></div>" +
      detailSections([
        ["Included", "Verified income history, known debts, cash, first-home savings and stated goal."],
        ["Not used for eligibility", "Tom's relationship status. It only explains the stated shared goal."],
        ["Advisor must verify", "Gross income, all debt obligations, property details, tenure, TDSR, any applicable MSR and LTV, credit policy and required documents."],
        ["ONE cannot do", "Approve the mortgage, promise a rate, set the final loan amount or replace the bank's approved process."]
      ]) +
      (state.advisorBooking ? "<div class='meeting-confirmation'><strong>Review booked</strong><p>" + formatDate(state.advisorBooking.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " at " + state.advisorBooking.time + "</p></div>" : ""),
    actions: state.advisorBooking ? button("View actions & dates", "view-calendar", "primary") : button("Choose a review time", "book-advisor", "primary") + button("Not now", "close-detail", "secondary")
  });
}

function openAdvisorBooking() {
  openDetail({
    eyebrow: "HUMAN REVIEW",
    title: "Choose an advisor appointment",
    content:
      "<p class='detail-summary'>Tom chooses the time and sees exactly what will be shared before booking.</p>" +
      "<div class='appointment-options'><label class='selected'><input type='radio' name='appointment' data-appointment value='2027-11-13|11:30' checked /><span><strong>Friday, 13 November</strong><small>11:30 · Video call · 30 minutes</small></span></label><label><input type='radio' name='appointment' data-appointment value='2027-11-16|15:00' /><span><strong>Monday, 16 November</strong><small>15:00 · OCBC branch · 45 minutes</small></span></label></div>" +
      "<div class='share-box'><strong>Shared for this review</strong><div><span>✓ Income and known debts</span><span>✓ Cash and goal savings</span><span>✓ Existing connected protection</span><span>✓ Questions Tom adds</span></div><p>Relationship status is not shared as an eligibility input.</p></div>",
    actions: button("Book review", "confirm-advisor", "primary") + button("Cancel", "close-detail", "secondary")
  });
}

function openGoalEditor() {
  openDetail({
    eyebrow: "GOAL SETTINGS",
    title: "First-home goal",
    content: "<p class='detail-summary'>Changing a goal updates planning progress. It does not create a loan application.</p><label class='detail-field'><span>Target amount</span><span class='input-money wide'>S$ <input id='home-goal-input' type='number' min='10000' max='300000' step='5000' value='" + state.homeGoalTarget + "' /></span></label>",
    actions: button("Save goal", "save-goal", "primary") + button("Cancel", "close-detail", "secondary")
  });
}

function openRiskCheck() {
  openDetail({
    eyebrow: "INVESTMENT PLANNING",
    title: "Record your starting preferences",
    content:
      "<p class='detail-summary'>These three questions help explain readiness. They are not a complete regulatory suitability assessment.</p>" +
      "<fieldset class='question-block'><legend>When might you need most of this money?</legend><label><input type='radio' name='horizon' value='short' /> Within 3 years</label><label><input type='radio' name='horizon' value='medium' checked /> 5 to 10 years</label><label><input type='radio' name='horizon' value='long' /> More than 10 years</label></fieldset>" +
      "<fieldset class='question-block'><legend>If the investment fell 15%, what would you most likely do?</legend><label><input type='radio' name='loss' value='sell' /> Sell to prevent further loss</label><label><input type='radio' name='loss' value='hold' checked /> Hold and review the plan</label><label><input type='radio' name='loss' value='buy' /> Invest more if my finances allow</label></fieldset>" +
      "<fieldset class='question-block'><legend>What is the main objective?</legend><label><input type='radio' name='objective' value='preserve' /> Preserve capital</label><label><input type='radio' name='objective' value='growth' checked /> Long-term growth</label><label><input type='radio' name='objective' value='income' /> Regular investment income</label></fieldset>" +
      "<div class='exclusion-box'><strong>Important</strong><p>A production assessment would also cover knowledge, experience, complete finances, liabilities, capacity for loss and product-specific suitability.</p></div>",
    actions: button("Save planning answers", "save-risk-check", "primary") + button("Cancel", "close-detail", "secondary")
  });
}

function openPrivacyNotice() {
  openDetail({
    eyebrow: "DATA PERMISSION RECORD",
    title: "How ONE uses each data source",
    content:
      detailSections([
        ["OCBC account and plan data", "Required to provide balances, transaction history, goals and plan calculations. This is not an optional marketing permission."],
        ["Connected policies and external accounts", "Optional. Used to recognise cover and include balances. Source, authorisation and freshness should be shown."],
        ["Contextual transaction signals", "Optional. Uses merchant, amount and booking fields for relevant planning events. The Dubai flow does not use continuous location."],
        ["Personalised insights", "Optional. Uses the connected financial state to rank explanations and next steps. It does not create transaction authority."],
        ["Withdrawal", "Stops future optional processing after the withdrawal takes effect, subject to applicable legal grounds and required record retention. Existing contracts are not cancelled by withdrawing analytics consent."],
        ["Production record", "OCBC would retain the notice version, purpose, selected sources, time, channel and later changes as evidence of the permission state."]
      ]),
    actions: button("Manage choices", "close-detail", "primary")
  });
}

function openAuditLog() {
  openDetail({
    eyebrow: "CONTROL HISTORY",
    title: "ONE audit trail",
    content: "<div class='full-audit-list'>" + state.audit.map(function (entry) { return "<div><i></i><span><strong>" + entry.title + "</strong><small>" + entry.date + "</small><p>" + entry.detail + "</p></span></div>"; }).join("") + "</div><p class='legal-copy'>A production audit record would use trusted server time and immutable transaction or model-decision identifiers.</p>"
  });
}

function openProtectionMethod() {
  openDetail({
    eyebrow: "PLANNING METHOD",
    title: "How protection priorities are ordered",
    content: detailSections([
      ["1. Protect essential medical exposure", "Verify hospital cover and material limits before adding optional policies."],
      ["2. Keep emergency cash", "Cash is not insurance, but it reduces the chance that a short disruption creates debt."],
      ["3. Protect earning capacity", "Income interruption matters more once Tom depends on a salary for regular bills."],
      ["4. Add needs created by dependants or debt", "Life and mortgage-related protection become more relevant when another person relies on Tom or a long-term liability begins."],
      ["5. Compare affordability and trade-offs", "Higher limits are optional. ONE should show the extra protection, extra premium and exclusions rather than simply label a plan better."]
    ])
  });
}

function openInvestmentMethod() {
  openDetail({
    eyebrow: "PLANNING METHOD",
    title: "What ONE considered for investing",
    content: detailSections([
      ["Cash-flow capacity", "Take-home income less regular expenses and existing planned commitments."],
      ["Emergency resilience", "The demo uses three months of regular expenses as a planning gate, not a universal legal rule."],
      ["Time and loss capacity", "How soon the money is needed and whether a fall would disrupt essential goals."],
      ["Suitability still required", "Knowledge, experience, objectives, complete financial situation, fees, risks and product features must be assessed before a recommendation."],
      ["Authority", "The simulator changes assumptions only. It cannot place an order or select a product."]
    ])
  });
}

function renderNotifications() {
  const unread = state.notifications.filter(function (item) { return !item.read; }).length;
  notificationDot.hidden = unread === 0;
  document.querySelector("#notification-button").setAttribute("aria-label", unread ? "Notifications, " + unread + " unread" : "Notifications");
  notificationPopover.innerHTML =
    "<div class='popover-heading'><div><strong>Updates</strong><span>" + (unread ? unread + " unread" : "You're up to date") + "</span></div>" + (unread ? "<button class='text-button red' data-command='mark-read'>Mark all read</button>" : "") + "</div>" +
    (state.notifications.length ? "<p class='notification-group-label'>LATEST</p>" : "") +
    "<div class='notification-list'>" + (state.notifications.length ? state.notifications.map(function (item) {
      const destination = item.destination === "controls" ? "authority settings" : item.destination === "actions" ? "decision" : item.destination === "protection" ? "protection" : item.destination === "investments" ? "investments" : "details";
      return "<button class='notification-item " + (item.read ? "" : "unread") + "' data-notification='" + item.id + "'><span class='notif-icon " + item.tone + "'>" + item.icon + "</span><span class='notification-copy'><span class='notification-meta'><small>" + item.time + "</small>" + (!item.read ? "<i>New</i>" : "") + "</span><strong>" + item.title + "</strong><p>" + item.body + "</p><em>View " + destination + " <b>&rsaquo;</b></em></span></button>";
    }).join("") : "<div class='notification-empty'><span class='empty-bell'><i></i></span><strong>You're all caught up</strong><p>New decisions and plan updates will appear here.</p></div>") + "</div>";
}

function setNotificationPanel(open) {
  notificationPopover.hidden = !open;
  document.querySelector("#notification-button").setAttribute("aria-expanded", String(open));
}

function openDemo() {
  renderScenarioList();
  demoOverlay.hidden = false;
  document.body.classList.add("modal-open");
}

function closeDemo() {
  demoOverlay.hidden = true;
  if (detailOverlay.hidden && consentOverlay.hidden) document.body.classList.remove("modal-open");
}

function renderScenarioList() {
  const list = document.querySelector("#scenario-list");
  list.innerHTML = scenarios.map(function (scenario) {
    const complete = state.stage > scenario.requiredStage;
    const locked = state.stage < scenario.requiredStage;
    let note = "Tier " + scenario.tier;
    if (scenario.id === "trip" && (!state.consent.contextualSignals || !state.consent.connectedPolicies)) note = "Data permission will prevent the insight";
    return "<button class='scenario-card " + (complete ? "complete" : "") + "' data-scenario='" + scenario.id + "' " + (locked || complete ? "disabled" : "") + "><span class='scenario-icon'>" + scenario.icon + "</span><span class='scenario-copy'><strong>" + scenario.title + "</strong><small>" + scenario.description + "</small><em>" + note + "</em></span><span class='scenario-status'>" + (complete ? "Completed" : locked ? "Locked" : "Run event") + "</span></button>";
  }).join("");
}

function triggerScenario(id) {
  const scenario = scenarios.find(function (item) { return item.id === id; });
  if (!scenario || state.stage !== scenario.requiredStage) return;
  if (id === "job") {
    state.currentISO = "2026-02-28";
    state.calendarMonth = "2026-02";
    state.stage = 1;
    state.monthlyIncome = 3600;
    state.cashAvailable += 3600;
    state.netWorth += 3600;
    state.currentInsight = "job";
    state.activity.unshift({ id: "salary", icon: "$", tone: "green", title: "Salary credit", subtitle: "Employer payroll · 28 Feb", amount: "+S$3,600", note: "Take-home pay" });
    const eligible = Math.max(0, state.cashAvailable - state.settings.cashThreshold);
    const amount = state.settings.idleSweep ? Math.min(eligible, state.settings.transferCap) : 0;
    if (amount > 0) {
      state.cashAvailable -= amount;
      state.savingsPocket += amount;
      state.actions.push({ id: "job", tier: 1, status: "completed", title: "First-salary savings transfer", amount: amount, date: state.currentISO });
      state.activity.unshift({ id: "sweep", icon: "↗", tone: "red", title: "Emergency savings transfer", subtitle: "ONE instruction · 28 Feb", amount: "-" + money(amount), note: "Reversible" });
      state.planScore = 54;
      addNotification({ icon: "1", title: money(amount) + " moved to emergency savings", body: "Your S$3,000 cash floor and S$1,000 cap were applied.", destination: "actions", scenario: "job" });
      addAudit("Tier 1 transfer executed", money(amount) + " moved under the saved idle-cash instruction. Cash floor and cap checked.");
    } else {
      addNotification({ icon: "1", tone: "grey", title: "Salary received, no ONE transfer", body: "Your automation setting or cash floor prevented the action.", destination: "controls", scenario: "job" });
      addAudit("Tier 1 action blocked", "Salary updated the plan, but no amount was eligible under Tom's boundary.");
    }
  } else if (id === "trip") {
    state.currentISO = "2026-07-18";
    state.calendarMonth = "2026-07";
    state.stage = 2;
    state.cashAvailable += 1750;
    state.savingsPocket += 2500;
    state.homeSavings += 1000;
    state.netWorth += 5250;
    state.planScore = 67;
    state.currentInsight = "trip";
    state.activity.unshift({ id: "flight", icon: "✈", tone: "red", title: "Emirates", subtitle: "Card payment · 18 Jul", amount: "-S$1,250", note: "Dubai booking" });
    state.activity.unshift({ id: "progress-july", icon: "+", tone: "green", title: "Five months of progress", subtitle: "Salary and regular spending · Mar to Jul", amount: "+S$6,500", note: "Net cash flow" });
    if (state.consent.contextualSignals && state.consent.connectedPolicies) {
      state.actions.push({ id: "trip", tier: 2, status: "pending", title: "Review travel protection for Dubai", amount: 48, date: state.currentISO });
      addNotification({ icon: "2", tone: "red", title: "Dubai protection gap found", body: "No matching active cover was found for 2 to 8 August. Nothing has been purchased.", destination: "actions", scenario: "trip" });
      addAudit("Tier 2 action prepared", "Booking fields and authorised connected policies produced a travel-cover review. No purchase executed.");
    } else {
      addNotification({ icon: "D", tone: "grey", title: "Dubai booking recorded without analysis", body: "Optional contextual or policy permission is off, so ONE created no insurance action.", destination: "controls", scenario: "trip" });
      addAudit("Travel analysis not performed", "Optional data permission was off when the Dubai booking event occurred.");
    }
  } else {
    state.currentISO = "2027-11-09";
    state.calendarMonth = "2027-11";
    state.stage = 3;
    state.cashAvailable += 8000;
    state.savingsPocket += 3800;
    state.homeSavings += 9000;
    state.netWorth += 20800;
    state.planScore = Math.max(82, state.planScore);
    state.currentInsight = "mortgage";
    state.actions.push({ id: "mortgage", tier: 3, status: "pending", title: "First-home affordability review", amount: 0, date: state.currentISO });
    state.activity.unshift({ id: "home-progress", icon: "⌂", tone: "sand", title: "First-home savings progress", subtitle: "Regular saving · Aug 2026 to Nov 2027", amount: "+S$9,000", note: "Goal update" });
    state.activity.unshift({ id: "long-progress", icon: "+", tone: "green", title: "Sixteen months of progress", subtitle: "Income and regular spending", amount: "+S$11,800", note: "Net cash flow" });
    addNotification({ icon: "3", tone: "red", title: "First-home brief ready", body: "Income and savings context is prepared. OCBC review is still required.", destination: "actions", scenario: "mortgage" });
    addAudit("Tier 3 escalation prepared", "Financial context organised for human review. No credit decision or eligibility result created.");
  }
  saveState();
  closeDemo();
  setView("home", false);
}

function makeJourneyReset() {
  const consent = clone(state.consent);
  const settings = clone(state.settings);
  state = clone(defaultState);
  state.consent = consent;
  state.settings = settings;
  state.view = "home";
  saveState();
  closeDemo();
  render();
  showToast("Tom's journey reset. Data and Trust choices were kept.");
}

function saveConsent(requiredOnly) {
  state.consent.completed = true;
  state.consent.policyVersion = POLICY_VERSION;
  state.consent.acceptedAt = new Date().toISOString();
  state.consent.connectedPolicies = requiredOnly ? false : document.querySelector("#consent-policies").checked;
  state.consent.contextualSignals = requiredOnly ? false : document.querySelector("#consent-signals").checked;
  state.consent.personalisedInsights = requiredOnly ? false : document.querySelector("#consent-insights").checked;
  addAudit("Data choices saved", "Required OCBC data active. " + (consentSourceCount() - 1) + " of 3 optional permissions enabled.");
  saveState();
  consentOverlay.hidden = true;
  document.body.classList.remove("modal-open");
  render();
  showToast(requiredOnly ? "Required data only. Optional analysis is off." : "Data choices saved");
}

function updateConsent(key) {
  state.consent[key] = !state.consent[key];
  state.consent.acceptedAt = new Date().toISOString();
  if ((key === "contextualSignals" || key === "connectedPolicies") && !state.consent[key]) {
    const trip = getAction("trip");
    if (trip && trip.status === "pending") {
      state.actions = state.actions.filter(function (action) { return action.id !== "trip"; });
      addNotification({ icon: "D", tone: "grey", title: "Travel analysis paused", body: "The pending insight was removed after optional data permission changed.", destination: "controls" });
    }
  }
  addAudit("Optional data permission changed", key + " set to " + (state.consent[key] ? "on" : "off") + ".");
  saveState();
  renderControls();
  renderNotifications();
  showToast("Data permission " + (state.consent[key] ? "enabled" : "withdrawn"));
}

function withdrawOptional() {
  state.consent.connectedPolicies = false;
  state.consent.contextualSignals = false;
  state.consent.personalisedInsights = false;
  state.consent.acceptedAt = new Date().toISOString();
  const trip = getAction("trip");
  if (trip && trip.status === "pending") state.actions = state.actions.filter(function (action) { return action.id !== "trip"; });
  addAudit("All optional permissions withdrawn", "Future optional policy, contextual and personalised processing paused.");
  saveState();
  render();
  showToast("All optional data permissions withdrawn");
}

function undoJob() {
  const action = getAction("job");
  if (!action || state.jobTransferUndone) return;
  state.cashAvailable += action.amount;
  state.savingsPocket -= action.amount;
  state.jobTransferUndone = true;
  action.status = "reversed";
  state.activity.unshift({ id: "undo-" + Date.now(), icon: "↙", tone: "neutral", title: "Savings transfer reversed", subtitle: "Customer request · " + shortDate(state.currentISO), amount: "+" + money(action.amount), note: "Returned to cash" });
  addNotification({ icon: "↙", tone: "grey", title: "Transfer reversed", body: money(action.amount) + " returned to your OCBC 360 Account.", destination: "actions", scenario: "job" });
  addAudit("Tier 1 transfer reversed", "Tom returned " + money(action.amount) + " from emergency savings to available cash.");
  saveState();
  closeDetail();
  render();
  showToast("Transfer reversed");
}

function confirmTravelCover() {
  const plan = travelPlans[state.travel.selectedPlan];
  const action = getAction("trip");
  if (!action) return;
  const wasCovered = state.travel.covered;
  const cost = wasCovered ? Math.max(0, plan.premium - state.travel.premium) : plan.premium;
  if (cost > state.cashAvailable) {
    showToast("Not enough available cash");
    return;
  }
  if (cost > 0) {
    state.cashAvailable -= cost;
    state.netWorth -= cost;
    state.activity.unshift({ id: "travel-policy-" + Date.now(), icon: "✓", tone: "green", title: state.travel.covered ? "Travel cover upgraded" : "Dubai travel cover", subtitle: state.travel.provider + " · " + shortDate(state.currentISO), amount: "-" + money(cost), note: plan.name });
  }
  state.travel.covered = true;
  state.travel.premium = plan.premium;
  state.planScore = Math.max(76, state.planScore);
  action.status = "completed";
  action.amount = plan.premium;
  addNotification({ icon: "✓", tone: "green", title: plan.name + " travel cover active", body: "Coverage is recorded for 2 to 8 August through " + state.travel.provider + ".", destination: "protection", scenario: "trip" });
  addAudit("Tier 2 purchase confirmed", "Tom chose " + state.travel.provider + " " + plan.name + " and confirmed " + money(plan.premium) + " after reviewing the summary.");
  saveState();
  closeDetail();
  render();
  showToast(wasCovered ? "Travel cover updated" : "Travel cover confirmed");
}

function confirmAdvisor() {
  const selected = detailContent.querySelector("[name='appointment']:checked");
  if (!selected) return;
  const parts = selected.value.split("|");
  state.advisorBooking = { date: parts[0], time: parts[1] };
  state.calendarMonth = parts[0].slice(0, 7);
  const action = getAction("mortgage");
  if (action) action.status = "completed";
  addNotification({ icon: "✓", tone: "green", title: "Advisor review booked", body: formatDate(parts[0], { weekday: "long", day: "numeric", month: "long" }) + " at " + parts[1] + ".", destination: "calendar", scenario: "mortgage" });
  addAudit("Tier 3 human review booked", "Tom selected " + parts[0] + " at " + parts[1] + " and approved the prepared brief for the review.");
  saveState();
  closeDetail();
  render();
  showToast("Advisor review booked");
}

function saveGoal() {
  const input = detailContent.querySelector("#home-goal-input");
  const value = Math.max(10000, Math.min(300000, Math.round(Number(input.value) / 5000) * 5000));
  if (!Number.isFinite(value)) return;
  state.homeGoalTarget = value;
  addAudit("First-home goal updated", "Target changed to " + money(value) + ". No credit application created.");
  saveState();
  closeDetail();
  render();
  showToast("First-home goal updated");
}

function saveRiskCheck() {
  const horizon = detailContent.querySelector("[name='horizon']:checked").value;
  const loss = detailContent.querySelector("[name='loss']:checked").value;
  const objective = detailContent.querySelector("[name='objective']:checked").value;
  state.investment.riskProfileComplete = true;
  if (horizon === "short" || loss === "sell" || objective === "preserve") state.investment.riskLevel = "Capital preservation";
  else if (horizon === "long" && loss === "buy" && objective === "growth") state.investment.riskLevel = "Long-term growth";
  else state.investment.riskLevel = "Cautious growth";
  addAudit("Investment planning answers saved", "Preliminary planning label: " + state.investment.riskLevel + ". Full suitability still required.");
  saveState();
  closeDetail();
  renderInvestments();
  showToast("Planning answers saved");
}

function saveInvestmentPlan() {
  state.investment.plannedMonthly = state.investment.draftMonthly;
  addAudit("Investment planning amount saved", money(state.investment.plannedMonthly) + " monthly recorded as an intention. No instruction or order created.");
  addNotification({ icon: "i", tone: "green", title: "Investment planning amount saved", body: money(state.investment.plannedMonthly) + " monthly is a projection only. No money moved.", destination: "investments" });
  saveState();
  renderInvestments();
  renderNotifications();
  showToast("Planning amount saved. No money moved.");
}

function shiftCalendar(delta) {
  const parts = state.calendarMonth.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1 + delta, 1);
  state.calendarMonth = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  saveState();
  renderActions();
}

function addTripCalendar() {
  if (state.stage < 2) return;
  state.travel.calendarAdded = true;
  state.calendarMonth = "2026-08";
  addAudit("Dubai trip added to calendar", "Travel dates and current protection status added to Tom's ONE calendar.");
  saveState();
  renderActions();
  showToast("Dubai trip added to ONE calendar");
}

function openCalendarEvent(date) {
  const item = calendarItems().find(function (event) { return event.date === date; });
  if (!item) return;
  openDetail({
    eyebrow: "PLAN DATE",
    title: item.title,
    content:
      "<p class='detail-summary'>" + item.detail + "</p>" +
      detailSections([
        ["Date", formatDate(item.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + (item.endDate ? " to " + formatDate(item.endDate, { day: "numeric", month: "long", year: "numeric" }) : "")],
        ["What this means", "This date keeps the plan and ONE action together. It does not give ONE extra permission to act."]
      ]),
    actions: button("Done", "close-detail", "primary")
  });
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  state = clone(defaultState);
  saveState();
  render();
  consentOverlay.hidden = false;
  document.body.classList.add("modal-open");
  showToast("App reset");
}

function commandHandler(command, target) {
  const views = {
    "view-home": "home",
    "view-plan": "home",
    "view-protection": "protection",
    "view-investments": "investments",
    "view-calendar": "actions",
    "view-actions": "actions",
    "view-controls": "controls"
  };
  if (views[command]) { closeDetail(); setView(views[command]); return; }
  if (command === "open-demo") openDemo();
  else if (command === "close-detail") closeDetail();
  else if (command === "toggle-activity") { state.activityExpanded = !state.activityExpanded; saveState(); renderHome(); }
  else if (command === "explain-job") openActionExplanation("job");
  else if (command === "explain-trip") openActionExplanation("trip");
  else if (command === "undo-job") undoJob();
  else if (command === "compare-cover") openTravelCompare();
  else if (command === "confirm-cover") confirmTravelCover();
  else if (command === "policy-hospital") openPolicyDetail("hospital");
  else if (command === "policy-travel") openPolicyDetail("travel");
  else if (command === "advisor-brief") openAdvisorBrief();
  else if (command === "book-advisor") openAdvisorBooking();
  else if (command === "confirm-advisor") confirmAdvisor();
  else if (command === "edit-goal") openGoalEditor();
  else if (command === "save-goal") saveGoal();
  else if (command === "risk-check") openRiskCheck();
  else if (command === "save-risk-check") saveRiskCheck();
  else if (command === "save-investment-plan") saveInvestmentPlan();
  else if (command === "investment-method") openInvestmentMethod();
  else if (command === "ai-state-engine") openAIStateEngine();
  else if (command === "protection-method") openProtectionMethod();
  else if (command === "privacy-notice") openPrivacyNotice();
  else if (command === "audit-log") openAuditLog();
  else if (command === "withdraw-optional") withdrawOptional();
  else if (command === "calendar-prev") shiftCalendar(-1);
  else if (command === "calendar-next") shiftCalendar(1);
  else if (command === "add-trip-calendar") addTripCalendar();
  else if (command === "jump-calendar") {
    const date = target.dataset.eventDate;
    if (date) { state.calendarMonth = date.slice(0, 7); saveState(); setView("actions"); }
  }
  else if (command === "calendar-event") openCalendarEvent(target.dataset.eventDate);
  else if (command === "mark-read") {
    state.notifications.forEach(function (item) { item.read = true; });
    saveState();
    renderNotifications();
  }
  else if (command === "reset-all") resetAll();
}

document.addEventListener("click", function (event) {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    setView(viewButton.dataset.view);
    return;
  }
  const commandButton = event.target.closest("[data-command]");
  if (commandButton) {
    commandHandler(commandButton.dataset.command, commandButton);
    return;
  }
  const scenarioButton = event.target.closest("[data-scenario]");
  if (scenarioButton) {
    triggerScenario(scenarioButton.dataset.scenario);
    return;
  }
  const tab = event.target.closest("[data-action-tab]");
  if (tab) {
    state.selectedActionTab = tab.dataset.actionTab;
    saveState();
    renderActions();
    return;
  }
  const consentToggle = event.target.closest("[data-consent-toggle]");
  if (consentToggle) {
    updateConsent(consentToggle.dataset.consentToggle);
    return;
  }
  const settingToggle = event.target.closest("[data-setting-toggle]");
  if (settingToggle) {
    const key = settingToggle.dataset.settingToggle;
    state.settings[key] = !state.settings[key];
    addAudit("Action boundary changed", key + " set to " + (state.settings[key] ? "on" : "off") + ".");
    saveState();
    renderControls();
    showToast("Action boundary updated");
    return;
  }
  const suggestion = event.target.closest("[data-chat-suggestion]");
  if (suggestion) {
    sendChat(suggestion.dataset.chatSuggestion);
    return;
  }
  const notification = event.target.closest("[data-notification]");
  if (notification) {
    const item = state.notifications.find(function (entry) { return entry.id === notification.dataset.notification; });
    if (item) {
      item.read = true;
      if (item.scenario) state.currentInsight = item.scenario;
      saveState();
      setNotificationPanel(false);
      setView(item.destination);
    }
  }
});

document.addEventListener("change", function (event) {
  if (event.target.matches("[data-cash-threshold]")) {
    state.settings.cashThreshold = Math.max(1000, Math.min(10000, Number(event.target.value) || 3000));
    addAudit("Cash floor changed", "Protected available cash set to " + money(state.settings.cashThreshold) + ".");
    saveState();
    renderControls();
    showToast("Cash floor updated");
  }
  if (event.target.matches("[data-transfer-cap]")) {
    state.settings.transferCap = Math.max(100, Math.min(2000, Number(event.target.value) || 1000));
    addAudit("Transfer cap changed", "Tier 1 per-transfer cap set to " + money(state.settings.transferCap) + ".");
    saveState();
    renderControls();
    showToast("Transfer cap updated");
  }
  if (event.target.matches("[data-travel-plan]")) {
    state.travel.selectedPlan = event.target.value;
    saveState();
    openTravelCompare();
  }
  if (event.target.matches("[data-travel-provider]")) {
    state.travel.provider = event.target.value;
    saveState();
  }
  if (event.target.matches("[data-appointment]")) {
    detailContent.querySelectorAll(".appointment-options label").forEach(function (label) { label.classList.toggle("selected", label.contains(event.target)); });
  }
});

document.addEventListener("input", function (event) {
  if (!event.target.matches("[data-investment-range]")) return;
  const amount = Number(event.target.value);
  state.investment.draftMonthly = amount;
  const projectionValue = investmentProjection(amount);
  const contributed = state.investmentBalance + amount * 120;
  const growth = Math.max(0, projectionValue - contributed);
  document.querySelector("#investment-amount-label").textContent = money(amount);
  document.querySelector("#cash-after-plan").textContent = money(Math.max(0, state.monthlyIncome - state.recurringExpenses - amount));
  document.querySelector("#projection-value").textContent = money(projectionValue);
  document.querySelector("#projection-contributions").textContent = money(contributed);
  document.querySelector("#projection-growth").textContent = money(growth);
  document.querySelector("#contribution-bar").style.width = percentage(contributed, projectionValue) + "%";
  saveState();
});

function sendChat(text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  state.chat.push({ from: "user", text: clean, time: "Now" });
  state.chat.push({ from: "one", text: assistantReply(clean), time: "Now" });
  saveState();
  renderAssistant();
}

document.addEventListener("submit", function (event) {
  if (event.target.id !== "chat-form") return;
  event.preventDefault();
  const input = document.querySelector("#chat-input");
  sendChat(input.value);
});

document.querySelector("#open-demo").addEventListener("click", openDemo);
document.querySelector("#mobile-menu").addEventListener("click", openDemo);
document.querySelector("#close-demo").addEventListener("click", closeDemo);
document.querySelector("#close-detail").addEventListener("click", closeDetail);
document.querySelector("#start-story").addEventListener("click", makeJourneyReset);
document.querySelector("#accept-consent").addEventListener("click", function () { saveConsent(false); });
document.querySelector("#required-only").addEventListener("click", function () { saveConsent(true); });
document.querySelector("#notification-button").addEventListener("click", function (event) {
  event.stopPropagation();
  renderNotifications();
  setNotificationPanel(notificationPopover.hidden);
});

document.addEventListener("click", function (event) {
  if (!notificationPopover.contains(event.target) && !event.target.closest("#notification-button")) setNotificationPanel(false);
});

document.addEventListener("keydown", function (event) {
  if (event.key !== "Escape") return;
  if (!detailOverlay.hidden) closeDetail();
  else if (!demoOverlay.hidden) closeDemo();
  setNotificationPanel(false);
});

renderScenarioList();
render();
if (!state.consent.completed) {
  consentOverlay.hidden = false;
  document.body.classList.add("modal-open");
}

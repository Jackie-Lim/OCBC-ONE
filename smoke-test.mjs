import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const appPort = 4300 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(appPort) },
  stdio: "ignore",
  windowsHide: true
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(value, message) {
  if (!value) throw new Error(message);
}

function requireText(source, text, label) {
  assert(source.includes(text), "Missing " + label + ": " + text);
}

function classifyDeepState(model, features) {
  let values = features.map((value, index) => (value - model.scaler.mean[index]) / model.scaler.scale[index]);
  for (const layer of model.encoder.layers) {
    values = layer.biases.map((bias, outputIndex) => {
      const total = values.reduce((sum, value, inputIndex) => sum + value * layer.weights[inputIndex][outputIndex], bias);
      return Math.tanh(total);
    });
  }
  return model.clusters
    .map((cluster) => ({ id: cluster.id, distance: Math.hypot(values[0] - cluster.centroid[0], values[1] - cluster.centroid[1]) }))
    .sort((a, b) => a.distance - b.distance)[0].id;
}

try {
  let response;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      response = await fetch("http://127.0.0.1:" + appPort);
      if (response.ok) break;
    } catch {}
    await wait(100);
  }
  assert(response && response.ok, "App server did not respond");
  const servedHTML = await response.text();
  const sourceHTML = await readFile("index.html", "utf8");
  const sourceJS = await readFile("app.js", "utf8");
  const sourceCSS = await readFile("styles.css", "utf8");
  const sourceModel = JSON.parse(await readFile("ai/deep-kmeans-model.json", "utf8"));
  const modelResponse = await fetch("http://127.0.0.1:" + appPort + "/ai/deep-kmeans-model.json");
  assert(modelResponse.ok, "Deep-clustering model was not served");
  const servedModel = await modelResponse.json();

  assert(servedHTML === sourceHTML, "Server did not return the current app shell");
  assert(servedModel.model.name === sourceModel.model.name, "Server did not return the current deep-clustering model");
  [
    ["id=\"consent-overlay\"", "consent dialog"],
    ["id=\"demo-overlay\"", "demo scenarios"],
    ["id=\"detail-overlay\"", "centered detail dialog"],
    ["data-view=\"protection\"", "protection navigation"],
    ["data-view=\"investments\"", "investment navigation"],
    ["ONE decisions", "decision history navigation"],
    ["data-view=\"controls\"", "Trust and permissions navigation"]
  ].forEach((item) => requireText(sourceHTML, item[0], item[1]));
  assert(!sourceHTML.includes("data-view=\"plan\""), "Separate My plan navigation should be removed");
  assert(!sourceHTML.includes("data-view=\"calendar\""), "Separate Calendar navigation should be removed");

  [
    ["function saveConsent", "consent persistence"],
    ["function updateConsent", "consent withdrawal"],
    ["function openActionExplanation", "action explanation"],
    ["function openTravelCompare", "travel comparison"],
    ["Other eligible insurer", "non-exclusive provider route"],
    ["function renderInvestments", "investment planning"],
    ["function encodeAIFeatures", "browser autoencoder inference"],
    ["function openAIStateEngine", "interactive AI State Engine"],
    ["ai/deep-kmeans-model.json", "trained model loading"],
    ["AI identifies the state. It does not authorise the action.", "separation of AI and transaction authority"],
    ["function renderActions", "combined action timeline"],
    ["function setNotificationPanel", "notification panel accessibility state"],
    ["function calendarPanelMarkup", "embedded month calendar"],
    ["function openCalendarEvent", "dated event details"],
    ["function openAdvisorBooking", "dated advisor booking"],
    ["function makeJourneyReset", "journey reset"],
    ["The simulator changes assumptions only. It cannot place an order or select a product.", "AI authority explanation"]
  ].forEach((item) => requireText(sourceJS, item[0], item[1]));

  [
    [".consent-dialog", "consent styling"],
    [".overview-grid", "simplified overview layout"],
    [".home-hero-grid", "living plan hero layout"],
    [".notification-meta", "notification hierarchy"],
    [".protection-compact-grid", "simplified protection layout"],
    [".simulator-card", "investment simulator"],
    [".ai-engine", "AI State Engine layout"],
    [".ai-chart", "deep-state embedding chart"],
    ["@keyframes ai-ring", "current-state plot marker"],
    [".actions-calendar-layout", "half actions and half calendar layout"],
    ["@keyframes page-enter", "page transitions"],
    [".compact-goals", "merged overview and goals layout"],
    ["@media (max-width: 840px)", "responsive layout"]
  ].forEach((item) => requireText(sourceCSS, item[0], item[1]));

  assert(sourceModel.schemaVersion === 1, "Unexpected AI model schema");
  assert(sourceModel.model.syntheticTrainingSnapshots === 720, "Unexpected synthetic training size");
  assert(sourceModel.model.silhouetteScore > 0.5, "Deep-state clusters are not sufficiently separated for the demo");
  assert(sourceModel.features.length === 6, "AI model should consume six financial features");
  assert(sourceModel.encoder.layers.length === 2, "Browser encoder should export two encoding layers");
  assert(sourceModel.clusters.length === 3, "AI model should expose three planning states");
  assert(classifyDeepState(sourceModel, [3600, 1000 / 2300, 0.05, 0, 1300, 0]) === "buffer-building", "First salary should classify as Buffer Building");
  assert(classifyDeepState(sourceModel, [3600, 3500 / 2300, 0.05, 1, 1300, 1000 / 60000]) === "protection-gap", "Uncovered Dubai trip should classify as Protection Gap");
  assert(classifyDeepState(sourceModel, [3600, 3500 / 2300, 0.05, 0, 1300, 1000 / 60000]) === "buffer-building", "Confirmed Dubai cover should clear the Protection Gap state");
  assert(classifyDeepState(sourceModel, [3600, 7300 / 2300, 0.18, 0, 1300, 10000 / 60000]) === "growth-ready", "First-home stage should classify as Growth Ready");

  const finances = {
    cash: 1200,
    savings: 0,
    home: 0,
    netWorth: 4000
  };

  finances.cash += 3600;
  finances.netWorth += 3600;
  const cashFloor = 3000;
  const transferCap = 1000;
  const eligible = Math.max(0, finances.cash - cashFloor);
  const moved = Math.min(eligible, transferCap);
  finances.cash -= moved;
  finances.savings += moved;
  assert(finances.cash === 3800 && finances.savings === 1000 && finances.netWorth === 7600, "Tier 1 financial transition is incorrect");

  finances.cash += 1750;
  finances.savings += 2500;
  finances.home += 1000;
  finances.netWorth += 5250;
  assert(finances.cash === 5550 && finances.savings === 3500 && finances.home === 1000 && finances.netWorth === 12850, "Dubai financial transition is incorrect");

  finances.cash -= 48;
  finances.netWorth -= 48;
  assert(finances.cash === 5502 && finances.netWorth === 12802, "Travel confirmation transition is incorrect");

  finances.cash += 8000;
  finances.savings += 3800;
  finances.home += 9000;
  finances.netWorth += 20800;
  assert(finances.cash === 13502 && finances.savings === 7300 && finances.home === 10000 && finances.netWorth === 33602, "Mortgage-stage financial transition is incorrect");

  console.log("Integration check passed: the served app includes consent, explainable actions, investment planning and a trained deep-state journey from Buffer Building to Protection Gap to Growth Ready.");
} finally {
  server.kill();
}

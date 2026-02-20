const DATA_VERSION = 3;

let studyData = JSON.parse(localStorage.getItem("studyData")) || {};

// ─── Migrations ───────────────────────────────────────────────
function migrateData(data) {
  if (!data.version || data.version < 2) {
    // v2: add qbankStats to all topics
    Object.values(data.subjects || {}).forEach(subject => {
      subject.topics.forEach(topic => {
        if (!topic.qbankStats) topic.qbankStats = { total: 0, correct: 0 };
        if (!topic.qbankDone) topic.qbankDone = false;
      });
    });
    data.version = 2;
  }
  if (data.version < 3) {
    // v3: add adaptive revision fields
    Object.values(data.subjects || {}).forEach(subject => {
      subject.topics.forEach(topic => {
        if (!topic.difficultyFactor) topic.difficultyFactor = 2.5; // SM-2 EF
        if (!topic.missedRevisions) topic.missedRevisions = 0;
        if (!topic.lastReviewedOn) topic.lastReviewedOn = null;
      });
    });
    data.version = 3;
  }
  return data;
}

// ─── Init / Defaults ──────────────────────────────────────────
studyData = migrateData(studyData);
if (!studyData.setupComplete) studyData.setupComplete = false;
if (!studyData.subjects) studyData.subjects = {};
if (!studyData.dailyHistory) studyData.dailyHistory = {};
if (!studyData.uiState) studyData.uiState = {};
if (!studyData.uiState.qbankCollapsed) studyData.uiState.qbankCollapsed = {};
if (!studyData.uiState.editorCollapsed) studyData.uiState.editorCollapsed = {};
if (!studyData.examDate) studyData.examDate = "2026-12-01";
if (!studyData.startDate) studyData.startDate = today();
if (!studyData.version) studyData.version = DATA_VERSION;

// ─── Save ─────────────────────────────────────────────────────
async function saveData() {
  studyData.updatedAt = new Date().toISOString();
  localStorage.setItem("studyData", JSON.stringify(studyData));
  if (typeof saveToCloud === "function") {
    await saveToCloud();
  }
}

// ─── Conflict-safe merge ──────────────────────────────────────
function mergeData(local, cloud) {
  if (!local.updatedAt) return cloud;
  if (!cloud.updatedAt) return local;
  // Last-write-wins with timestamp
  return new Date(local.updatedAt) >= new Date(cloud.updatedAt) ? local : cloud;
}

// ─── Subject setup (index.html wizard) ───────────────────────
function addSubject() {
  let name = document.getElementById("subjectName").value.trim();
  let size = document.getElementById("subjectSize").value;
  let topicsRaw = document.getElementById("topicsInput").value.trim();

  if (!name || !topicsRaw) { alert("Enter subject and topics."); return; }

  let topicsArray = topicsRaw.split("\n").filter(t => t.trim()).map(t => makeTopicObj(t.trim()));

  studyData.subjects[name] = {
    size: size,
    topics: topicsArray,
    pointer: 0,
    qbank: { total: 0, correct: 0 }
  };

  saveData();
  document.getElementById("subjectName").value = "";
  document.getElementById("topicsInput").value = "";
  alert("Subject Added.");
}

function makeTopicObj(name) {
  return {
    name: name,
    status: "not-started",
    completedOn: null,
    revisionDates: [],
    revisionIndex: 0,
    nextRevision: null,
    qbankDone: false,
    qbankStats: { total: 0, correct: 0 },
    difficultyFactor: 2.5,
    missedRevisions: 0,
    lastReviewedOn: null
  };
}

function finishSetup() {
  if (Object.keys(studyData.subjects).length === 0) {
    alert("Add at least one subject."); return;
  }
  studyData.setupComplete = true;
  saveData();
  renderStatus();
}

function renderStatus() {
  if (!studyData.setupComplete) return;
  let setupSection = document.getElementById("setupSection");
  let statusSection = document.getElementById("statusSection");
  if (setupSection) setupSection.style.display = "none";
  if (statusSection) statusSection.style.display = "block";
}

function fixPointer(subjectName) {
  let subject = studyData.subjects[subjectName];
  subject.pointer = subject.topics.findIndex(t => t.status !== "completed");
  if (subject.pointer === -1) subject.pointer = subject.topics.length;
}

// ─── Phase Tracking ───────────────────────────────────────────
function getGlobalPhaseStats() {
  let total = 0, p1 = 0, p2 = 0, p3 = 0, qbankDone = 0;

  Object.values(studyData.subjects).forEach(subject => {
    subject.topics.forEach(topic => {
      total++;
      if (topic.status === "completed") p1++;
      if (topic.revisionIndex >= 2) p2++;
      if (topic.revisionIndex >= 3) p3++;
      if (topic.qbankDone) qbankDone++;
    });
  });

  return {
    total,
    phase1: { count: p1, pct: total ? (p1/total*100).toFixed(1) : 0 },
    phase2: { count: p2, pct: total ? (p2/total*100).toFixed(1) : 0 },
    phase3: { count: p3, pct: total ? (p3/total*100).toFixed(1) : 0 },
    qbank:  { count: qbankDone, pct: total ? (qbankDone/total*100).toFixed(1) : 0 }
  };
}

// ─── Analytics helpers ────────────────────────────────────────
function calculateRetention() {
  let totalTopics = 0, revisedOnTime = 0;
  Object.values(studyData.subjects).forEach(subject => {
    subject.topics.forEach(topic => {
      totalTopics++;
      if (topic.revisionIndex > 0) revisedOnTime++;
    });
  });
  let revisionCompliance = (revisedOnTime / (totalTopics || 1)) * 100;

  let accuracySum = 0, count = 0;
  Object.values(studyData.subjects).forEach(subject => {
    accuracySum += subjectAccuracy(subject);
    count++;
  });
  let avgAccuracy = count > 0 ? accuracySum / count : 0;

  let retention = revisionCompliance * 0.4 + avgAccuracy * 0.4 + (revisionCompliance > 80 ? 20 : 10);
  return retention.toFixed(1);
}

function calculateConsistencyForDays(days) {
  if (!studyData.dailyHistory) return 0;
  let totalScore = 0, maxScore = days * 3;
  for (let i = 0; i < days; i++) {
    let d = new Date();
    d.setDate(d.getDate() - i);
    let key = d.toISOString().split("T")[0];
    if (studyData.dailyHistory[key]) {
      let e = studyData.dailyHistory[key];
      totalScore += (e.study?1:0) + (e.qbank?1:0) + (e.revision?1:0);
    }
  }
  return (totalScore / maxScore) * 100;
}

function calculateWeeklyConsistency() { return calculateConsistencyForDays(7); }
function calculateMonthlyConsistency() { return calculateConsistencyForDays(30); }

function calculateAverageDailyCompletion() {
  if (!studyData.dailyHistory) return 0;
  let days = Object.keys(studyData.dailyHistory).length;
  if (days === 0) return 0;
  let completedCount = 0;
  Object.keys(studyData.dailyHistory).forEach(date => {
    if (studyData.dailyHistory[date].study) completedCount++;
  });
  return completedCount / days;
}

function getBurnoutIndex() {
  let weekly = calculateWeeklyConsistency();
  let monthly = calculateMonthlyConsistency();
  // Burnout score 0-100: higher = worse
  let drop = Math.max(0, monthly - weekly);
  return clamp(drop * 1.5, 0, 100).toFixed(0);
}

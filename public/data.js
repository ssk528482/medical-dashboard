// data.js — Medical Study OS
// Tasks fixed: #1 (smart merge), #2 (debounced save), #3 (localStorage size guard),
//              #18 (addSubject uses smart parser), #20 (revisionDates trimmed)

const DATA_VERSION = 5;

let studyData = JSON.parse(localStorage.getItem("studyData")) || {};

// ─── Object Factories ─────────────────────────────────────────
function makeUnitObj(name, questionCount) {
  return {
    name,
    collapsed: false,
    qbankStats: { total: 0, correct: 0 },
    qbankDone: false,
    questionCount: questionCount || 0,
    chapters: []
  };
}

function makeChapterObj(name, startPage, endPage) {
  let sp = parseInt(startPage) || 0;
  let ep = parseInt(endPage)   || 0;
  return {
    name,
    status: "not-started",
    completedOn: null,
    revisionDates: [],
    revisionIndex: 0,
    nextRevision: null,
    difficultyFactor: 2.5,
    difficulty: "medium",
    missedRevisions: 0,
    lastReviewedOn: null,
    startPage: sp,
    endPage:   ep,
    pageCount: (sp > 0 && ep >= sp) ? (ep - sp + 1) : 0
  };
}

// ─── Smart Line Parser ────────────────────────────────────────
function parseUnitLine(line) {
  line = line.trim();
  if (!line) return null;

  let [unitRaw, topicsPart] = line.split("|").map(s => s ? s.trim() : "");

  let questionCount = 0;
  let unitName = unitRaw.replace(/\[(\d+)\]/, (_, n) => { questionCount = parseInt(n); return ""; }).trim();

  let unit = makeUnitObj(unitName, questionCount);

  if (topicsPart) {
    unit.chapters = topicsPart.split(",").map(raw => {
      raw = raw.trim();
      if (!raw) return null;
      let pageMatch = raw.match(/^(.+?)\((\d+)(?:-(\d+))?\)\s*$/);
      if (pageMatch) {
        let name  = pageMatch[1].trim();
        let start = parseInt(pageMatch[2]);
        let end   = pageMatch[3] ? parseInt(pageMatch[3]) : start;
        return makeChapterObj(name, start, end);
      }
      return makeChapterObj(raw);
    }).filter(Boolean);
  }

  return unit;
}

function parseUnitsText(text) {
  return text.split("\n").map(l => parseUnitLine(l)).filter(Boolean);
}

// ─── Migrations ───────────────────────────────────────────────
function migrateData(data) {
  if (!data.version || data.version < 2) {
    Object.values(data.subjects || {}).forEach(subject => {
      subject.topics = subject.topics || [];
      subject.topics.forEach(topic => {
        if (!topic.qbankStats) topic.qbankStats = { total: 0, correct: 0 };
        if (topic.qbankDone === undefined) topic.qbankDone = false;
      });
    });
    data.version = 2;
  }

  if (data.version < 3) {
    Object.values(data.subjects || {}).forEach(subject => {
      subject.topics.forEach(topic => {
        if (!topic.difficultyFactor) topic.difficultyFactor = 2.5;
        if (!topic.missedRevisions) topic.missedRevisions = 0;
        if (!topic.lastReviewedOn) topic.lastReviewedOn = null;
      });
    });
    data.version = 3;
  }

  if (data.version < 4) {
    Object.values(data.subjects || {}).forEach(subject => {
      if (subject.topics !== undefined) {
        let oldPointer = typeof subject.pointer === "number" ? subject.pointer : 0;
        subject.units = [{
          name: "General",
          collapsed: false,
          qbankStats: subject.qbank || { total: 0, correct: 0 },
          qbankDone: false,
          chapters: (subject.topics || []).map(t => ({
            name: t.name,
            status: t.status || "not-started",
            completedOn: t.completedOn || null,
            revisionDates: t.revisionDates || [],
            revisionIndex: t.revisionIndex || 0,
            nextRevision: t.nextRevision || null,
            difficultyFactor: t.difficultyFactor || 2.5,
            missedRevisions: t.missedRevisions || 0,
            lastReviewedOn: t.lastReviewedOn || null
          }))
        }];
        delete subject.topics;
        delete subject.qbank;
        subject.pointer = { unit: 0, chapter: oldPointer };
      }

      if (typeof subject.pointer === "number") {
        subject.pointer = { unit: 0, chapter: subject.pointer };
      }
      if (!subject.pointer || typeof subject.pointer !== "object") {
        subject.pointer = { unit: 0, chapter: 0 };
      }
      if (!subject.units) subject.units = [];
    });
    data.version = 4;
  }

  if (!data.version || data.version < 5) {
    Object.values(data.subjects || {}).forEach(subject => {
      (subject.units || []).forEach(unit => {
        if (unit.questionCount === undefined) unit.questionCount = 0;
        if (unit.qbankLocked   === undefined) unit.qbankLocked   = false;
        (unit.chapters || []).forEach(ch => {
          if (ch.startPage  === undefined) ch.startPage  = 0;
          if (ch.endPage    === undefined) ch.endPage    = 0;
          if (ch.pageCount  === undefined) ch.pageCount  = 0;
        });
      });
    });
    if (!data.readingSpeed) data.readingSpeed = 25;
    if (!data.qbankSpeed)   data.qbankSpeed   = 30;
    data.version = 5;
  }

  return data;
}

// ─── Init / Defaults ──────────────────────────────────────────
studyData = migrateData(studyData);

if (!studyData.setupComplete)   studyData.setupComplete = false;
if (!studyData.subjects)        studyData.subjects = {};
if (!studyData.dailyHistory)    studyData.dailyHistory = {};
if (!studyData.uiState)         studyData.uiState = {};
if (!studyData.uiState.editorCollapsed) studyData.uiState.editorCollapsed = {};
if (!studyData.uiState.unitCollapsed)   studyData.uiState.unitCollapsed = {};
if (!studyData.examDate)        studyData.examDate = "2026-12-01";
if (!studyData.startDate)       studyData.startDate = today();
if (!studyData.version)         studyData.version = DATA_VERSION;
if (!studyData.readingSpeed)    studyData.readingSpeed = 25;
if (!studyData.qbankSpeed)      studyData.qbankSpeed   = 30;
// Dismissed alerts cache: { alertKey: snoozedUntil|"permanent" }
if (!studyData.dismissedAlerts) studyData.dismissedAlerts = {};

// ─── Save (immediate cloud sync) ──────────────────────────────
async function saveData() {
  // Task #20: keep revisionDates arrays trimmed before saving
  trimRevisionDates(10);

  studyData.updatedAt = new Date().toISOString();
  localStorage.setItem("studyData", JSON.stringify(studyData));

  // Task #3: check localStorage size after save
  if (typeof checkLocalStorageSize === "function" && checkLocalStorageSize()) {
    // Auto-trim history > 180 days old when approaching limit
    if (typeof trimOldDailyHistory === "function") trimOldDailyHistory(180);
    localStorage.setItem("studyData", JSON.stringify(studyData));
  }

  // IMMEDIATE cloud save (no debouncing)
  if (typeof saveToCloud === "function") {
    await saveToCloud();
  }
}

// ─── Conflict-safe SMART merge ────────────────────────────────
// Task #1: Instead of last-write-wins, this unions dailyHistory,
// accumulates qbankStats, and merges revisionDates properly.
function mergeData(local, cloud) {
  if (!local || !local.updatedAt) return cloud || {};
  if (!cloud || !cloud.updatedAt) return local || {};

  // Pick the "base" (newer overall) and "other" (older)
  let base  = new Date(local.updatedAt) >= new Date(cloud.updatedAt) ? local : cloud;
  let other = base === local ? cloud : local;

  // Deep clone the base so we don't mutate it
  let merged = JSON.parse(JSON.stringify(base));

  // ── Union dailyHistory ──
  // Each day entry from the "other" side is merged in if missing or richer.
  let otherHistory = other.dailyHistory || {};
  if (!merged.dailyHistory) merged.dailyHistory = {};
  Object.keys(otherHistory).forEach(date => {
    let oEntry = otherHistory[date];
    let mEntry = merged.dailyHistory[date];
    if (!mEntry) {
      merged.dailyHistory[date] = oEntry;
    } else {
      // Merge flags (OR) and union arrays
      merged.dailyHistory[date] = {
        ...mEntry,
        study:    mEntry.study    || oEntry.study,
        qbank:    mEntry.qbank    || oEntry.qbank,
        revision: mEntry.revision || oEntry.revision,
        eveningSubmitted: mEntry.eveningSubmitted || oEntry.eveningSubmitted,
        studyEntries:  _mergeArrayById(mEntry.studyEntries  || [], oEntry.studyEntries  || [], "unit"),
        qbankEntries:  _mergeArrayById(mEntry.qbankEntries  || [], oEntry.qbankEntries  || [], "unit"),
        revisedItems:  _mergeArrayById(mEntry.revisedItems  || [], oEntry.revisedItems  || [], "chapterIndex"),
        timeTracking:  mEntry.timeTracking || oEntry.timeTracking,
        submittedAt:   mEntry.submittedAt  || oEntry.submittedAt,
      };
    }
  });

  // ── Union subject/unit qbankStats ──
  // Accumulate from other side if not already reflected in base.
  let otherSubjects = other.subjects || {};
  Object.keys(otherSubjects).forEach(sName => {
    if (!merged.subjects[sName]) {
      merged.subjects[sName] = otherSubjects[sName];
      return;
    }
    let oSubj = otherSubjects[sName];
    let mSubj = merged.subjects[sName];
    (oSubj.units || []).forEach((oUnit, ui) => {
      let mUnit = mSubj.units[ui];
      if (!mUnit) return;
      // Take max of cumulative qbank stats (prevents double-counting)
      mUnit.qbankStats = {
        total:   Math.max(mUnit.qbankStats?.total   || 0, oUnit.qbankStats?.total   || 0),
        correct: Math.max(mUnit.qbankStats?.correct || 0, oUnit.qbankStats?.correct || 0),
      };
      mUnit.qbankDone = mUnit.qbankDone || oUnit.qbankDone;
      // Merge chapter statuses: completed wins over not-started
      (oUnit.chapters || []).forEach((oCh, ci) => {
        let mCh = mUnit.chapters[ci];
        if (!mCh) return;
        if (oCh.status === "completed" && mCh.status !== "completed") {
          mCh.status = oCh.status;
          mCh.completedOn = oCh.completedOn;
          mCh.revisionDates = oCh.revisionDates;
          mCh.revisionIndex = oCh.revisionIndex;
          mCh.nextRevision  = oCh.nextRevision;
        } else if (mCh.status === "completed" && oCh.revisionIndex > mCh.revisionIndex) {
          // Other side has more revisions done
          mCh.revisionIndex  = oCh.revisionIndex;
          mCh.nextRevision   = oCh.nextRevision;
          mCh.lastReviewedOn = oCh.lastReviewedOn;
        }
      });
    });
  });

  return merged;
}

// Helper: merge two arrays keeping unique entries by a key field
function _mergeArrayById(arrA, arrB, keyField) {
  let seen = new Set(arrA.map(e => JSON.stringify(e[keyField])));
  let extra = arrB.filter(e => !seen.has(JSON.stringify(e[keyField])));
  return [...arrA, ...extra];
}

// ─── Pointer ──────────────────────────────────────────────────
function fixPointer(subjectName) {
  let subject = studyData.subjects[subjectName];
  for (let ui = 0; ui < subject.units.length; ui++) {
    for (let ci = 0; ci < subject.units[ui].chapters.length; ci++) {
      if (subject.units[ui].chapters[ci].status !== "completed") {
        subject.pointer = { unit: ui, chapter: ci };
        return;
      }
    }
  }
  let lastUi = Math.max(0, subject.units.length - 1);
  subject.pointer = {
    unit: lastUi,
    chapter: subject.units[lastUi] ? subject.units[lastUi].chapters.length : 0
  };
}

// ─── Subject setup ────────────────────────────────────────────
// Task #18: addSubject() now uses the smart parseUnitLine() parser
// so the "Unit [200] | Chapter(1-30), Chapter(31-60)" syntax works
// when adding subjects post-setup, not just during initial setup.
function addSubject() {
  let name = document.getElementById("subjectName")?.value.trim();
  let size = document.getElementById("subjectSize")?.value || "medium";
  let topicsRaw = document.getElementById("topicsInput")?.value.trim();
  if (!name || !topicsRaw) { alert("Enter subject and units."); return; }

  // FIX: use smart parser instead of plain makeUnitObj
  let units = topicsRaw.split("\n").filter(t => t.trim()).map(t => parseUnitLine(t));
  units = units.filter(Boolean);
  if (!units.length) { alert("Could not parse any units. Check format."); return; }

  studyData.subjects[name] = { size, units, pointer: { unit: 0, chapter: 0 } };
  saveData();
  if (document.getElementById("subjectName")) document.getElementById("subjectName").value = "";
  if (document.getElementById("topicsInput")) document.getElementById("topicsInput").value = "";
  alert(`Subject "${name}" added with ${units.length} unit(s).`);
}

function finishSetup() {
  if (Object.keys(studyData.subjects).length === 0) { alert("Add at least one subject."); return; }
  studyData.setupComplete = true;
  saveData();
  renderStatus();
}

function renderStatus() {
  if (!studyData.setupComplete) return;
  let setup = document.getElementById("setupSection");
  let status = document.getElementById("statusSection");
  if (setup) setup.style.display = "none";
  if (status) status.style.display = "block";
}

// ─── Phase Tracking ───────────────────────────────────────────
function getGlobalPhaseStats() {
  let totalChapters = 0, completed = 0, r1 = 0, r2 = 0, r3 = 0;
  let totalUnits = 0, qbankUnits = 0;

  Object.values(studyData.subjects).forEach(subject => {
    subject.units.forEach(unit => {
      totalUnits++;
      if (unit.qbankDone) qbankUnits++;
      unit.chapters.forEach(ch => {
        totalChapters++;
        if (ch.status === "completed")  completed++;
        if (ch.revisionIndex >= 1)      r1++;
        if (ch.revisionIndex >= 2)      r2++;
        if (ch.revisionIndex >= 3)      r3++;
      });
    });
  });

  let tc = totalChapters || 1;
  let tu = totalUnits    || 1;
  return {
    total:      totalChapters,
    totalUnits,
    completed:  { count: completed, pct: (completed/tc*100).toFixed(1) },
    r1:         { count: r1,        pct: (r1/tc*100).toFixed(1) },
    r2:         { count: r2,        pct: (r2/tc*100).toFixed(1) },
    r3:         { count: r3,        pct: (r3/tc*100).toFixed(1) },
    qbank:      { count: qbankUnits,pct: (qbankUnits/tu*100).toFixed(1) },
    phase1:     { count: completed, pct: (completed/tc*100).toFixed(1) },
    phase2:     { count: r1,        pct: (r1/tc*100).toFixed(1) },
    phase3:     { count: r2,        pct: (r2/tc*100).toFixed(1) },
  };
}

// ─── Analytics Helpers ────────────────────────────────────────

function calculateRetention() {
  let totalChapters = 0, revisedOnce = 0;
  let totalQ = 0, totalCorrect = 0;

  Object.values(studyData.subjects).forEach(subject => {
    subject.units.forEach(unit => {
      totalQ += unit.qbankStats?.total || 0;
      totalCorrect += unit.qbankStats?.correct || 0;
      unit.chapters.forEach(ch => {
        totalChapters++;
        if (ch.revisionIndex > 0) revisedOnce++;
      });
    });
  });

  if (totalChapters === 0) return "0.0";

  let revisionCompliance = (revisedOnce / totalChapters) * 100;
  let avgAccuracy = totalQ > 0 ? (totalCorrect / totalQ) * 100 : 0;

  return (revisionCompliance * 0.6 + avgAccuracy * 0.4).toFixed(1);
}

function calculateConsistencyForDays(days) {
  if (!studyData.dailyHistory) return 0;
  let total = 0, max = days * 3;
  for (let i = 0; i < days; i++) {
    let d = new Date(); d.setDate(d.getDate() - i);
    let key = d.toISOString().split("T")[0];
    let e = studyData.dailyHistory[key];
    if (e) total += (e.study?1:0) + (e.qbank?1:0) + (e.revision?1:0);
  }
  return (total / max) * 100;
}

function calculateWeeklyConsistency()  { return calculateConsistencyForDays(7);  }
function calculateMonthlyConsistency() { return calculateConsistencyForDays(30); }

function calculateAverageDailyCompletion() {
  let weighted = 0, totalWeight = 0;
  for (let i = 1; i <= 7; i++) {
    let d = addDays(today(), -i);
    let hist = studyData.dailyHistory?.[d];
    let topics = 0;
    if (hist) {
      (hist.studyEntries || []).forEach(e => { topics += (e.topics || []).length || 1; });
      if (!hist.studyEntries && hist.study) topics = 1;
    }
    let w = 8 - i;
    weighted    += topics * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? weighted / totalWeight : 0;
}

function getBurnoutIndex() {
  let weekly = calculateWeeklyConsistency();
  let monthly = calculateMonthlyConsistency();
  return clamp((Math.max(0, monthly - weekly)) * 1.5, 0, 100).toFixed(0);
}

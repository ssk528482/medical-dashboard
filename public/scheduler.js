// ─── Smart Scheduler 2.0 ─────────────────────────────────────

// FIX: was returning 50 when no qbank data — caused phantom accuracy
function subjectAccuracy(subject) {
  let total = 0, correct = 0;
  subject.units.forEach(unit => {
    total   += unit.qbankStats?.total   || 0;
    correct += unit.qbankStats?.correct || 0;
  });
  if (total === 0) return 0;
  return (correct / total) * 100;
}

function subjectPriority(subjectName) {
  let subject = studyData.subjects[subjectName];
  let accuracy = subjectAccuracy(subject);

  let incomplete = 0;
  subject.units.forEach(u => u.chapters.forEach(ch => { if (ch.status !== "completed") incomplete++; }));

  let overdue = getOverdueCount(subjectName);
  let sizeWeight = { large: 12, medium: 6, small: 0 };

  let phase = detectPhaseStatus(subjectName);
  let phaseBoost = phase.phase1 ? 0 : 5;
  phaseBoost += phase.phase2 ? 0 : (examProximityFactor() * 15);

  let proximityMult = 1 + examProximityFactor() * 0.5;

  let consecutivePenalty = 0;
  let yesterday  = addDays(today(), -1);
  let dayBefore  = addDays(today(), -2);
  let ySubject   = studyData.dailyHistory?.[yesterday]?.studySubject;
  let dbSubject  = studyData.dailyHistory?.[dayBefore]?.studySubject;
  if (ySubject === subjectName && dbSubject === subjectName) consecutivePenalty = 15;
  else if (ySubject === subjectName) consecutivePenalty = 5;

  // Hard chapter boost: count hard chapters not yet completed
  let hardPending = 0;
  subject.units.forEach(u => u.chapters.forEach(ch => {
    if (ch.difficulty === "hard" && ch.status !== "completed") hardPending++;
  }));

  return (
    ((100 - accuracy) * 0.35 +
    incomplete * 0.25 +
    overdue * 12 +
    (sizeWeight[subject.size] || 0) +
    phaseBoost +
    hardPending * 3) * proximityMult
  ) - consecutivePenalty;
}

function getBurnoutAdjustment() {
  let burnout = parseFloat(getBurnoutIndex());
  return burnout > 50 ? Math.max(0.7, 1 - (burnout - 50) / 100) : 1.0;
}

function generatePlan() {
  let hours = parseFloat(document.getElementById("dailyHours").value);
  if (!hours || hours <= 0) { alert("Enter valid hours."); return; }

  if (studyData.dailyPlan?.date === today()) {
    renderSavedPlan();
    document.getElementById("generateButton").disabled = true;
    return;
  }

  let revisionDue = getRevisionsDueToday();
  let overdueCount = revisionDue.filter(r => r.isOverdue).length;

  let subjectsSorted = Object.keys(studyData.subjects)
    .sort((a, b) => subjectPriority(b) - subjectPriority(a));

  if (!subjectsSorted.length) { alert("Add subjects first."); return; }

  let topSubject = subjectsSorted[0];

  // Carry forward unfinished plan
  let prev = studyData.dailyPlan;
  if (prev && prev.date !== today() && !prev.completed && studyData.subjects[prev.study.subject]) {
    topSubject = prev.study.subject;
  }

  let subjectObj = studyData.subjects[topSubject];
  let ptr = subjectObj.pointer || { unit: 0, chapter: 0 };
  let nextUnit    = subjectObj.units[ptr.unit];
  let nextChapter = nextUnit?.chapters[ptr.chapter];
  let nextText    = nextChapter
    ? `${nextUnit.name} → ${nextChapter.name}`
    : "All chapters completed";

  let burnoutAdj   = getBurnoutAdjustment();
  let adjHours     = hours * burnoutAdj;
  let revisionRatio = Math.min(0.4, 0.2 + overdueCount * 0.02);
  let qbankRatio   = 0.3;
  let studyRatio   = 1 - revisionRatio - qbankRatio;

  let studyTime    = (adjHours * studyRatio).toFixed(1);
  let qbankTime    = (adjHours * qbankRatio).toFixed(1);
  let revisionTime = (adjHours * revisionRatio).toFixed(1);

  let daysLeft = daysUntilExam();
  let examCountdownMode = daysLeft > 0 && daysLeft <= 30;

  let burnoutWarn = burnoutAdj < 1.0
    ? `<div style="color:#ef4444;font-size:12px;margin-top:6px;">⚠ Burnout detected — load reduced ${((1-burnoutAdj)*100).toFixed(0)}%</div>` : "";

  let examAlert = daysLeft <= 30
    ? `<div style="color:#f59e0b;font-size:12px;margin-top:4px;">🔔 ${daysLeft} days to exam — revision priority elevated</div>` : "";

  // ── EXAM COUNTDOWN MODE ──────────────────────────────────────
  if (examCountdownMode) {
    let revisionDue   = getRevisionsDueToday();
    let overdueCount  = revisionDue.filter(r => r.isOverdue).length;
    let adjHours      = hours * burnoutAdj;
    let revisionTime  = (adjHours * 0.5).toFixed(1);
    let qbankTime     = (adjHours * 0.5).toFixed(1);

    document.getElementById("planOutput").innerHTML = `
      <div style="background:#450a0a;border:1px solid #ef4444;border-radius:10px;padding:10px;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:800;color:#fca5a5;margin-bottom:4px;">🚨 EXAM COUNTDOWN MODE — ${daysLeft} days left</div>
        <div style="font-size:12px;color:#fca5a5;opacity:0.85;">New study paused. Focus 100% on revision and Qbank mastery.</div>
      </div>
      <div style="padding:4px 0;font-size:14px;line-height:1.9;">
        <strong>🔁 Revision:</strong> ${revisionTime} hrs — ${revisionDue.length} chapters due${overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}<br>
        <strong>🧪 Qbank:</strong> ${qbankTime} hrs — weak units first
        ${burnoutWarn}${examAlert}
      </div>`;

    studyData.dailyPlan = {
      date: today(),
      study: { subject: null },
      qbank: { subject: topSubject },
      revisionCount: revisionDue.length,
      hours, adjustedHours: parseFloat(adjHours.toFixed(1)),
      completed: false,
      examCountdownMode: true
    };
    saveData();
    document.getElementById("generateButton").disabled = true;
    return;
  }

  document.getElementById("planOutput").innerHTML = `
    <div style="padding:8px 0;font-size:14px;line-height:1.8;">
      <strong>📖 Study:</strong> ${studyTime} hrs — ${topSubject} — <em>${nextText}</em><br>
      <strong>🧪 Qbank:</strong> ${qbankTime} hrs — ${topSubject}<br>
      <strong>🔁 Revision:</strong> ${revisionTime} hrs — ${revisionDue.length} chapters due${overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}
      ${burnoutWarn}${examAlert}
    </div>`;

  studyData.dailyPlan = {
    date: today(),
    study: { subject: topSubject, unitIndex: ptr.unit, chapterIndex: ptr.chapter },
    qbank: { subject: topSubject },
    revisionCount: revisionDue.length,
    hours, adjustedHours: parseFloat(adjHours.toFixed(1)),
    completed: false
  };

  saveData();
  document.getElementById("generateButton").disabled = true;
}

function resetTodayPlan() {
  if (studyData.dailyPlan?.date === today()) delete studyData.dailyPlan;
  saveData();
  document.getElementById("planOutput").innerHTML = "";
  document.getElementById("generateButton").disabled = false;
  alert("Today's plan reset.");
}

function submitEvening() {
  let todayKey = today();
  let studyEntries = [];
  let qbankEntries = [];
  let revisedItems = [];
  let anyStudy = false, anyQbank = false, anyRevision = false;

  // ── STUDY ENTRIES (multi-entry form) ──
  let studyDivs = document.querySelectorAll("[id^='studyEntry-']");
  studyDivs.forEach(div => {
    let id = div.id.replace("studyEntry-", "");
    let subjectName = document.getElementById(`sSub-${id}`)?.value;
    let unitIndex   = parseInt(document.getElementById(`sUnit-${id}`)?.value) || 0;
    if (!subjectName || !studyData.subjects[subjectName]) return;

    // Get selected topic indices from custom chip UI
    let selectedIndices = [];
    let chipButtons = div.querySelectorAll(".topic-chip.selected");
    chipButtons.forEach(btn => {
      let ci = parseInt(btn.dataset.ci);
      if (!isNaN(ci)) selectedIndices.push(ci);
    });
    // Fallback: native multi-select
    if (selectedIndices.length === 0) {
      let sel = document.getElementById(`sTopics-${id}`);
      if (sel) {
        Array.from(sel.selectedOptions).forEach(opt => {
          let ci = parseInt(opt.value);
          if (!isNaN(ci)) selectedIndices.push(ci);
        });
      }
    }
    if (selectedIndices.length === 0) return;

    let unit = studyData.subjects[subjectName].units[unitIndex];
    if (!unit) return;

    let topicNames = [];
    selectedIndices.forEach(ci => {
      let chapter = unit.chapters[ci];
      if (!chapter) return;
      topicNames.push(chapter.name);
      // Mark chapter as completed and schedule revisions
      chapter.status = "completed";
      chapter.completedOn = today();
      chapter.lastReviewedOn = today();
      let dates = [], cursor = today();
      for (let i = 0; i < BASE_INTERVALS.length; i++) {
        cursor = addDays(cursor, computeNextInterval(chapter, i));
        dates.push(cursor);
      }
      chapter.revisionDates = dates;
      chapter.nextRevision = dates[0];
      chapter.revisionIndex = 0;
      chapter.missedRevisions = 0;
    });
    fixPointer(subjectName);

    studyEntries.push({
      subject: subjectName,
      unit: unit.name,
      unitIndex,
      topics: topicNames,
      topicIndices: selectedIndices
    });
    anyStudy = true;
  });

  // ── QBANK ENTRIES (multi-entry form) ──
  let qbankDivs = document.querySelectorAll("[id^='qbankEntry-']");
  qbankDivs.forEach(div => {
    let id = div.id.replace("qbankEntry-", "");
    let subjectName = document.getElementById(`qSub-${id}`)?.value;
    let unitIndex   = parseInt(document.getElementById(`qUnit-${id}`)?.value) || 0;
    let total       = parseInt(document.getElementById(`qTotal-${id}`)?.value) || 0;
    let correct     = parseInt(document.getElementById(`qCorrect-${id}`)?.value) || 0;
    if (!subjectName || !studyData.subjects[subjectName]) return;
    if (total <= 0) return;

    let unit = studyData.subjects[subjectName].units[unitIndex];
    if (!unit) return;

    unit.qbankStats.total   = (unit.qbankStats.total   || 0) + total;
    unit.qbankStats.correct = (unit.qbankStats.correct || 0) + correct;
    unit.qbankDone = true;
    // Update difficulty factors
    let q = Math.round((correct / total) * 5);
    unit.chapters.forEach(ch => {
      let ef = ch.difficultyFactor || 2.5;
      ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      ch.difficultyFactor = clamp(ef, 1.3, 3.0);
    });

    qbankEntries.push({
      subject: subjectName,
      unit: unit.name,
      unitIndex,
      total,
      correct
    });
    anyQbank = true;
  });

  // ── REVISION ──
  let revBoxes = document.querySelectorAll("#revisionCheckboxList input[type='checkbox']:checked");
  revBoxes.forEach(box => {
    let [subjectName, ui, ci] = box.value.split("|");
    markRevisionDone(subjectName, parseInt(ui), parseInt(ci));
    revisedItems.push({ subjectName, unitIndex: parseInt(ui), chapterIndex: parseInt(ci) });
    anyRevision = true;
  });

  // ── Log daily history ──
  studyData.dailyHistory[todayKey] = {
    study: anyStudy,
    qbank: anyQbank,
    revision: anyRevision,
    eveningSubmitted: true,
    studyEntries,
    qbankEntries,
    revisedItems,
    submittedAt: new Date().toISOString()
  };

  if (studyData.dailyPlan?.date === todayKey && anyStudy) {
    studyData.dailyPlan.completed = true;
  }

  saveData();
  if (typeof renderSubjects === "function") renderSubjects();
  if (typeof renderEveningUpdate === "function") renderEveningUpdate();
}

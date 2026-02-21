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

  return (
    ((100 - accuracy) * 0.35 +
    incomplete * 0.25 +
    overdue * 12 +
    (sizeWeight[subject.size] || 0) +
    phaseBoost) * proximityMult
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

  let burnoutWarn = burnoutAdj < 1.0
    ? `<div style="color:#ef4444;font-size:12px;margin-top:6px;">⚠ Burnout detected — load reduced ${((1-burnoutAdj)*100).toFixed(0)}%</div>` : "";

  let daysLeft = daysUntilExam();
  let examAlert = daysLeft <= 30
    ? `<div style="color:#f59e0b;font-size:12px;margin-top:4px;">🔔 ${daysLeft} days to exam — revision priority elevated</div>` : "";

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

  // Guard: once per day
  if (studyData.dailyHistory?.[todayKey]?.eveningSubmitted) {
    alert("Already submitted today. Delete and resubmit if you need to change.");
    return;
  }

  if (!studyData.dailyHistory[todayKey]) {
    studyData.dailyHistory[todayKey] = { study: false, qbank: false, revision: false, studySubject: null };
  }

  let hist = studyData.dailyHistory[todayKey];
  hist.studyEntries  = [];
  hist.qbankEntries  = [];
  hist.revisedItems  = [];

  // ── STUDY ENTRIES ──
  let studyContainer = document.getElementById("studyEntries");
  if (studyContainer) {
    studyContainer.querySelectorAll("[id^='studyEntry-']").forEach(entryDiv => {
      let id = entryDiv.id.replace("studyEntry-", "");
      let subjectName = document.getElementById(`sSub-${id}`)?.value;
      let ui          = parseInt(document.getElementById(`sUnit-${id}`)?.value) || 0;
      let topicSel    = document.getElementById(`sTopics-${id}`);
      if (!subjectName || !topicSel) return;

      let selectedOpts = Array.from(topicSel.selectedOptions);
      if (!selectedOpts.length) return;

      let unit     = studyData.subjects[subjectName]?.units[ui];
      let unitName = unit?.name || "";
      let topicNames   = [];
      let topicIndices = [];

      selectedOpts.forEach(opt => {
        let ci = parseInt(opt.value);
        let ch = unit?.chapters[ci];
        if (!ch) return;
        topicNames.push(ch.name);
        topicIndices.push(ci);

        ch.status = "completed";
        ch.completedOn = today();
        ch.lastReviewedOn = today();
        let dates = [], cursor = today();
        for (let i = 0; i < BASE_INTERVALS.length; i++) {
          cursor = addDays(cursor, computeNextInterval(ch, i));
          dates.push(cursor);
        }
        ch.revisionDates = dates;
        ch.nextRevision  = dates[0];
        ch.revisionIndex = 0;
        ch.missedRevisions = 0;
      });

      if (topicNames.length) {
        fixPointer(subjectName);
        hist.study = true;
        hist.studySubject = subjectName;
        hist.studyEntries.push({ subject: subjectName, unit: unitName, topics: topicNames, topicIndices });
      }
    });
  }

  // ── QBANK ENTRIES ──
  let qbankContainer = document.getElementById("qbankEntries");
  if (qbankContainer) {
    qbankContainer.querySelectorAll("[id^='qbankEntry-']").forEach(entryDiv => {
      let id = entryDiv.id.replace("qbankEntry-", "");
      let subjectName = document.getElementById(`qSub-${id}`)?.value;
      let ui          = parseInt(document.getElementById(`qUnit-${id}`)?.value) || 0;
      let total       = parseInt(document.getElementById(`qTotal-${id}`)?.value) || 0;
      let correct     = parseInt(document.getElementById(`qCorrect-${id}`)?.value) || 0;
      if (!subjectName || total <= 0) return;

      let unit     = studyData.subjects[subjectName]?.units[ui];
      let unitName = unit?.name || "";
      if (!unit) return;

      unit.qbankStats.total   += total;
      unit.qbankStats.correct += correct;
      unit.qbankDone = true;

      let q = Math.round((correct / total) * 5);
      unit.chapters.forEach(ch => {
        let ef = ch.difficultyFactor || 2.5;
        ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
        ch.difficultyFactor = clamp(ef, 1.3, 3.0);
      });

      hist.qbank = true;
      hist.qbankEntries.push({ subject: subjectName, unit: unitName, unitIndex: ui, total, correct });
    });
  }

  // ── REVISION ──
  let revBoxes = document.querySelectorAll("#revisionCheckboxList input[type='checkbox']:checked");
  revBoxes.forEach(box => {
    let [subjectName, ui, ci] = box.value.split("|");
    markRevisionDone(subjectName, parseInt(ui), parseInt(ci));
    hist.revisedItems.push({ subjectName, ui, ci });
  });
  if (revBoxes.length > 0) hist.revision = true;

  if (studyData.dailyPlan?.date === today() && hist.study) {
    studyData.dailyPlan.completed = true;
  }

  hist.eveningSubmitted = true;
  saveData();
  renderSubjects();
  renderEveningUpdate();
  alert("Evening update saved ✓");
}

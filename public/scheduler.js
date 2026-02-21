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
  let studiedSubject = null;

  // ── STUDY ──
  if (document.getElementById("studyDone")?.checked) {
    let subjectName  = document.getElementById("studySubject")?.value;
    let unitIndex    = parseInt(document.getElementById("studyUnit")?.value) || 0;
    let chapterIndex = parseInt(document.getElementById("studyChapter")?.value) || 0;
    studiedSubject   = subjectName;

    let chapter = studyData.subjects[subjectName]?.units[unitIndex]?.chapters[chapterIndex];
    if (chapter) {
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
      fixPointer(subjectName);
    }
  }

  // ── QBANK ──
  if (document.getElementById("qbankDone")?.checked) {
    let subjectName = document.getElementById("qbankSubject")?.value;
    let unitIndex   = parseInt(document.getElementById("qbankUnit")?.value) || 0;
    let total       = parseInt(document.getElementById("qbankTotal")?.value) || 0;
    let correct     = parseInt(document.getElementById("qbankCorrect")?.value) || 0;

    let unit = studyData.subjects[subjectName]?.units[unitIndex];
    if (unit && total > 0) {
      unit.qbankStats.total   += total;
      unit.qbankStats.correct += correct;
      unit.qbankDone = true;
      // Update difficulty factors for all chapters in this unit
      let q = Math.round((correct / total) * 5);
      unit.chapters.forEach(ch => {
        let ef = ch.difficultyFactor || 2.5;
        ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
        ch.difficultyFactor = clamp(ef, 1.3, 3.0);
      });
    }
  }

  // ── REVISION ──
  let revBoxes = document.querySelectorAll("#revisionCheckboxList input[type='checkbox']:checked");
  revBoxes.forEach(box => {
    let [subjectName, ui, ci] = box.value.split("|");
    markRevisionDone(subjectName, parseInt(ui), parseInt(ci));
  });

  // ── Log daily history ──
  let todayKey = today();
  if (!studyData.dailyHistory[todayKey]) {
    studyData.dailyHistory[todayKey] = { study: false, qbank: false, revision: false, studySubject: null };
  }
  if (document.getElementById("studyDone")?.checked) {
    studyData.dailyHistory[todayKey].study = true;
    studyData.dailyHistory[todayKey].studySubject = studiedSubject;
  }
  if (document.getElementById("qbankDone")?.checked) {
    studyData.dailyHistory[todayKey].qbank = true;
  }
  if (revBoxes.length > 0) {
    studyData.dailyHistory[todayKey].revision = true;
  }

  if (studyData.dailyPlan?.date === today() && document.getElementById("studyDone")?.checked) {
    studyData.dailyPlan.completed = true;
  }

  saveData();
  renderSubjects();
  alert("Evening update saved ✓");
}

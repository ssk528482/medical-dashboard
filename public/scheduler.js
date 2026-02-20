// ─── Smart Scheduler 2.0 ─────────────────────────────────────

function subjectAccuracy(subject) {
  let total = 0, correct = 0;
  subject.topics.forEach(t => {
    if (t.qbankStats) { total += t.qbankStats.total; correct += t.qbankStats.correct; }
  });
  if (total === 0) return 50;
  return (correct / total) * 100;
}

function subjectPriority(subjectName) {
  let subject = studyData.subjects[subjectName];
  let accuracy = subjectAccuracy(subject);
  let incomplete = subject.topics.filter(t => t.status !== "completed").length;
  let overdue = getOverdueCount(subjectName);
  let sizeWeight = { large: 12, medium: 6, small: 0 };

  let phase = detectPhaseStatus(subjectName);
  let phaseBoost = phase.phase1 ? 0 : 5;
  phaseBoost += phase.phase2 ? 0 : (examProximityFactor() * 15);

  let proximityMultiplier = 1 + examProximityFactor() * 0.5;

  // FIX: Check actual studySubject stored in dailyHistory
  let consecutivePenalty = 0;
  let yesterday = addDays(today(), -1);
  let dayBefore = addDays(today(), -2);
  let ySubject = studyData.dailyHistory?.[yesterday]?.studySubject;
  let dbSubject = studyData.dailyHistory?.[dayBefore]?.studySubject;
  if (ySubject === subjectName && dbSubject === subjectName) {
    consecutivePenalty = 15; // studied 2+ days in a row
  } else if (ySubject === subjectName) {
    consecutivePenalty = 5;
  }

  return (
    ((100 - accuracy) * 0.35 +
    incomplete * 0.25 +
    overdue * 12 +
    sizeWeight[subject.size] +
    phaseBoost) * proximityMultiplier
  ) - consecutivePenalty;
}

function getBurnoutAdjustment() {
  let burnout = parseFloat(getBurnoutIndex());
  if (burnout > 50) return Math.max(0.7, 1 - (burnout - 50) / 100);
  return 1.0;
}

function generatePlan() {
  let hours = parseFloat(document.getElementById("dailyHours").value);
  if (!hours || hours <= 0) { alert("Enter valid hours."); return; }

  if (studyData.dailyPlan && studyData.dailyPlan.date === today()) {
    renderSavedPlan();
    document.getElementById("generateButton").disabled = true;
    return;
  }

  let revisionDue = getRevisionsDueToday();
  let overdueCount = revisionDue.filter(r => r.isOverdue).length;

  let subjectsSorted = Object.keys(studyData.subjects).sort(
    (a, b) => subjectPriority(b) - subjectPriority(a)
  );

  if (subjectsSorted.length === 0) { alert("Add subjects first."); return; }

  let topSubject = subjectsSorted[0];

  // Carry forward unfinished plan from yesterday
  if (
    studyData.dailyPlan &&
    studyData.dailyPlan.date !== today() &&
    studyData.dailyPlan.completed === false &&
    studyData.subjects[studyData.dailyPlan.study.subject]
  ) {
    topSubject = studyData.dailyPlan.study.subject;
  }

  let subjectObj = studyData.subjects[topSubject];
  let nextTopic = subjectObj.pointer < subjectObj.topics.length
    ? subjectObj.topics[subjectObj.pointer].name
    : "All topics completed";

  let burnoutAdj = getBurnoutAdjustment();
  let adjustedHours = hours * burnoutAdj;

  let revisionRatio = Math.min(0.4, 0.2 + (overdueCount * 0.02));
  let qbankRatio = 0.3;
  let studyRatio = 1 - revisionRatio - qbankRatio;

  let studyTime = (adjustedHours * studyRatio).toFixed(1);
  let qbankTime = (adjustedHours * qbankRatio).toFixed(1);
  let revisionTime = (adjustedHours * revisionRatio).toFixed(1);

  let burnoutWarning = burnoutAdj < 1.0
    ? `<div style="color:#ef4444;font-size:12px;margin-top:6px;">⚠ Burnout detected — load reduced ${((1-burnoutAdj)*100).toFixed(0)}%</div>` : "";

  let daysLeft = daysUntilExam();
  let examAlert = daysLeft <= 30
    ? `<div style="color:#f59e0b;font-size:12px;margin-top:4px;">🔔 ${daysLeft} days to exam — revision priority elevated</div>` : "";

  let output = `
    <div style="padding:8px 0;">
      <strong>📖 Study:</strong> ${studyTime} hrs — ${topSubject} — <em>${nextTopic}</em><br>
      <strong>🧪 Qbank:</strong> ${qbankTime} hrs — ${topSubject}<br>
      <strong>🔁 Revision:</strong> ${revisionTime} hrs — ${revisionDue.length} topics due${overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}
      ${burnoutWarning}
      ${examAlert}
    </div>
  `;

  document.getElementById("planOutput").innerHTML = output;

  studyData.dailyPlan = {
    date: today(),
    study: { subject: topSubject, topicIndex: subjectObj.pointer },
    qbank: { subject: topSubject, topicIndex: subjectObj.pointer },
    revisionCount: revisionDue.length,
    hours: hours,
    adjustedHours: parseFloat(adjustedHours.toFixed(1)),
    completed: false
  };

  saveData();
  document.getElementById("generateButton").disabled = true;
}

function resetTodayPlan() {
  if (studyData.dailyPlan && studyData.dailyPlan.date === today()) {
    delete studyData.dailyPlan;
    saveData();
  }
  document.getElementById("planOutput").innerHTML = "";
  document.getElementById("generateButton").disabled = false;
  alert("Today's plan has been reset.");
}

function submitEvening() {
  let studiedSubject = null;

  // STUDY
  if (document.getElementById("studyDone").checked) {
    let subjectName = document.getElementById("studySubject").value;
    let topicIndex = parseInt(document.getElementById("studyTopic").value);
    studiedSubject = subjectName;

    if (studyData.subjects[subjectName]?.topics[topicIndex]) {
      let topic = studyData.subjects[subjectName].topics[topicIndex];
      topic.status = "completed";
      topic.completedOn = today();
      topic.lastReviewedOn = today();

      let dates = [], cursor = today();
      for (let i = 0; i < BASE_INTERVALS.length; i++) {
        let interval = computeNextInterval(topic, i);
        cursor = addDays(cursor, interval);
        dates.push(cursor);
      }
      topic.revisionDates = dates;
      topic.revisionIndex = 0;
      topic.nextRevision = dates[0];
      topic.missedRevisions = 0;
      fixPointer(subjectName);
    }
  }

  // QBANK
  if (document.getElementById("qbankDone").checked) {
    let subjectName = document.getElementById("qbankSubject").value;
    let topicIndex = parseInt(document.getElementById("qbankTopic").value);
    let total = parseInt(document.getElementById("qbankTotal").value) || 0;
    let correct = parseInt(document.getElementById("qbankCorrect").value) || 0;

    if (studyData.subjects[subjectName]?.topics[topicIndex]) {
      let topic = studyData.subjects[subjectName].topics[topicIndex];
      if (!topic.qbankStats) topic.qbankStats = { total: 0, correct: 0 };
      topic.qbankStats.total += total;
      topic.qbankStats.correct += correct;
      topic.qbankDone = true;
      topic.lastReviewedOn = today();

      if (total > 0) {
        let acc = correct / total;
        let q = Math.round(acc * 5);
        let ef = topic.difficultyFactor || 2.5;
        ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
        topic.difficultyFactor = clamp(ef, 1.3, 3.0);
      }
    }
  }

  // REVISION
  let revisionCheckboxes = document.querySelectorAll(
    "#revisionCheckboxList input[type='checkbox']:checked"
  );
  revisionCheckboxes.forEach(box => {
    let [subjectName, topicIndex] = box.value.split("|");
    markRevisionDone(subjectName, parseInt(topicIndex));
  });

  if (studyData.dailyPlan?.date === today() && document.getElementById("studyDone").checked) {
    studyData.dailyPlan.completed = true;
  }

  // ── FIX: Store studySubject in dailyHistory for rotation tracking ──
  let todayDate = today();
  if (!studyData.dailyHistory[todayDate]) {
    studyData.dailyHistory[todayDate] = { study: false, qbank: false, revision: false, studySubject: null };
  }

  if (document.getElementById("studyDone").checked) {
    studyData.dailyHistory[todayDate].study = true;
    studyData.dailyHistory[todayDate].studySubject = studiedSubject; // FIX
  }
  if (document.getElementById("qbankDone").checked) {
    studyData.dailyHistory[todayDate].qbank = true;
  }
  if (revisionCheckboxes.length > 0) {
    studyData.dailyHistory[todayDate].revision = true;
  }

  saveData();
  renderSubjects();
  alert("Evening update saved ✓");
}

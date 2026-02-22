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

  let revisionDue  = getRevisionsDueToday();
  let overdueCount = revisionDue.filter(r => r.isOverdue).length;

  let subjectsSorted = Object.keys(studyData.subjects)
    .sort((a, b) => subjectPriority(b) - subjectPriority(a));

  if (!subjectsSorted.length) { alert("Add subjects first."); return; }

  let topSubject = subjectsSorted[0];

  // Carry forward unfinished plan
  let prev = studyData.dailyPlan;
  if (prev && prev.date !== today() && !prev.completed && studyData.subjects[prev.study?.subject]) {
    topSubject = prev.study.subject;
  }

  let subjectObj   = studyData.subjects[topSubject];
  let burnoutAdj   = getBurnoutAdjustment();
  let adjHours     = hours * burnoutAdj;
  let revisionRatio = Math.min(0.4, 0.2 + overdueCount * 0.02);
  let qbankRatio   = 0.3;
  let studyRatio   = 1 - revisionRatio - qbankRatio;

  let studyMins    = Math.round(adjHours * studyRatio * 60);
  let qbankMins    = Math.round(adjHours * qbankRatio * 60);
  let revisionMins = Math.round(adjHours * revisionRatio * 60);

  let studyTime    = (studyMins / 60).toFixed(1);
  let qbankTime    = (qbankMins / 60).toFixed(1);
  let revisionTime = (revisionMins / 60).toFixed(1);

  let daysLeft          = daysUntilExam();
  let examCountdownMode = daysLeft > 0 && daysLeft <= 30;

  let burnoutWarn = burnoutAdj < 1.0
    ? `<div style="color:#ef4444;font-size:12px;margin-top:6px;">⚠ Burnout detected — load reduced ${((1-burnoutAdj)*100).toFixed(0)}%</div>` : "";
  let examAlert = daysLeft <= 30
    ? `<div style="color:#f59e0b;font-size:12px;margin-top:4px;">🔔 ${daysLeft} days to exam — revision priority elevated</div>` : "";

  // ── EXAM COUNTDOWN MODE ──────────────────────────────────────
  if (examCountdownMode) {
    let revTime2 = (adjHours * 0.5).toFixed(1);
    let qbTime2  = (adjHours * 0.5).toFixed(1);

    document.getElementById("planOutput").innerHTML = `
      <div style="background:#450a0a;border:1px solid #ef4444;border-radius:10px;padding:10px;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:800;color:#fca5a5;margin-bottom:4px;">🚨 EXAM COUNTDOWN MODE — ${daysLeft} days left</div>
        <div style="font-size:12px;color:#fca5a5;opacity:0.85;">New study paused. Focus 100% on revision and Qbank mastery.</div>
      </div>
      <div style="padding:4px 0;font-size:14px;line-height:1.9;">
        <strong>🔁 Revision:</strong> ${revTime2} hrs — ${revisionDue.length} chapters due${overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}<br>
        <strong>🧪 Qbank:</strong> ${qbTime2} hrs — weak units first
        ${burnoutWarn}${examAlert}
      </div>`;

    studyData.dailyPlan = {
      date: today(),
      study: { subject: null },
      qbank: { subject: topSubject },
      revisionCount: revisionDue.length, overdueCount,
      hours, adjustedHours: parseFloat(adjHours.toFixed(1)),
      studyTime: "0", qbankTime: qbTime2, revisionTime: revTime2,
      burnoutAdj: parseFloat(burnoutAdj.toFixed(3)),
      completed: false, examCountdownMode: true
    };
    saveData();
    document.getElementById("generateButton").disabled = true;
    return;
  }

  // ── SMART STUDY BLOCK ─────────────────────────────────────────
  // Walk from pointer forward, slice chapters by pages budget
  let readingSpeed = studyData.readingSpeed || 25; // pages per hour
  let pagesBudget  = Math.round(studyMins / 60 * readingSpeed);
  let ptr          = subjectObj.pointer || { unit: 0, chapter: 0 };

  let studyLines   = [];  // array of display strings
  let pagesLeft    = pagesBudget;
  let chaptersDone = 0;
  let planChapters = []; // for saving to dailyPlan

  // Find next incomplete chapter from pointer
  let startUi = ptr.unit, startCi = ptr.chapter;
  let foundStart = false;

  outerLoop:
  for (let ui = 0; ui < subjectObj.units.length; ui++) {
    let unit = subjectObj.units[ui];
    let ciStart = (ui === startUi && !foundStart) ? startCi : 0;
    for (let ci = ciStart; ci < unit.chapters.length; ci++) {
      let ch = unit.chapters[ci];
      if (ch.status === "completed") continue;
      foundStart = true;

      if (ch.pageCount > 0) {
        // Page-aware slicing
        if (pagesLeft <= 0) break outerLoop;

        let alreadyRead = planChapters
          .filter(p => p.unitIndex === ui && p.chapterIndex === ci)
          .reduce((s, p) => s + (p.pgEnd - p.pgStart + 1), 0);

        let chStart = ch.startPage + alreadyRead;
        let chEnd   = ch.endPage;

        if (chStart > chEnd) continue; // already fully covered in plan

        let pagesToRead = Math.min(pagesLeft, chEnd - chStart + 1);
        let pgEnd       = chStart + pagesToRead - 1;
        let hrs         = (pagesToRead / readingSpeed).toFixed(1);

        let phaseLabel = _getChapterPhaseLabel(ch);
        studyLines.push(
          `📖 <strong>${topSubject}</strong> → ${unit.name} → <em>${ch.name}</em>` +
          ` <span style="color:#94a3b8;">pg ${chStart}–${pgEnd} (${pagesToRead}p · ${hrs}h)</span>` +
          (phaseLabel ? ` <span style="font-size:11px;background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:4px;">${phaseLabel}</span>` : "")
        );
        planChapters.push({ unitIndex: ui, chapterIndex: ci, pgStart: chStart, pgEnd });
        pagesLeft -= pagesToRead;
        chaptersDone++;

        if (pgEnd < chEnd) break outerLoop; // chapter spans into tomorrow
      } else {
        // No page data — estimate time: assume 1 chapter = 1.5 hrs for large subjects
        let chapterHrs = subjectObj.size === "large" ? 1.5 : subjectObj.size === "medium" ? 1.0 : 0.75;
        let chapterMins = chapterHrs * 60;
        if (pagesLeft <= 0) break outerLoop;

        let phaseLabel = _getChapterPhaseLabel(ch);
        studyLines.push(
          `📖 <strong>${topSubject}</strong> → ${unit.name} → <em>${ch.name}</em>` +
          ` <span style="color:#94a3b8;">(~${chapterHrs}h est.)</span>` +
          (phaseLabel ? ` <span style="font-size:11px;background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:4px;">${phaseLabel}</span>` : "")
        );
        planChapters.push({ unitIndex: ui, chapterIndex: ci });
        pagesLeft -= chapterMins / 60 * readingSpeed; // treat as pages
        chaptersDone++;
        if (pagesLeft <= 0) break outerLoop;
      }
    }
  }

  if (studyLines.length === 0) {
    studyLines.push(`📖 <strong>${topSubject}</strong> — All chapters completed 🎉`);
  }

  // ── SMART QBANK BLOCK ─────────────────────────────────────────
  let qbankSpeed = studyData.qbankSpeed || 30; // questions per hour
  let qTotal     = Math.round(qbankMins / 60 * qbankSpeed);

  // Pick qbank subject: weakest accuracy among subjects with pending Qs
  let qSubject = topSubject;
  let worstAcc = Infinity;
  subjectsSorted.forEach(sn => {
    let s = studyData.subjects[sn];
    let hasPendingUnits = s.units.some(u => !u.qbankDone);
    if (!hasPendingUnits) return;
    let acc = subjectAccuracy(s);
    if (acc < worstAcc) { worstAcc = acc; qSubject = sn; }
  });

  let qSubjectObj = studyData.subjects[qSubject];
  // Find best unit to qbank: not done, lowest accuracy
  let qbankLines = [];
  let qRemaining = qTotal;

  qSubjectObj.units.forEach((unit, ui) => {
    if (qRemaining <= 0) return;
    // Find chapters in this unit with known question counts or incomplete qbank
    let unitQsTotal = unit.questionCount || 0;
    let unitQsDone  = unit.qbankStats.total || 0;
    let unitQsLeft  = unitQsTotal > 0 ? Math.max(0, unitQsTotal - unitQsDone) : null;
    let unitAcc     = unit.qbankStats.total > 0
      ? (unit.qbankStats.correct / unit.qbankStats.total * 100).toFixed(0) + "%" : null;

    let qForUnit    = unitQsLeft !== null
      ? Math.min(qRemaining, Math.min(qTotal, unitQsLeft))  // don't exceed budget or remaining
      : qRemaining;

    if (unit.qbankDone && unitQsLeft === 0) return; // fully done

    let accTag = unitAcc ? ` <span style="color:${parseFloat(unitAcc)>=75?"#10b981":parseFloat(unitAcc)>=50?"#eab308":"#ef4444"}">${unitAcc} acc</span>` : "";
    let leftTag = unitQsLeft !== null
      ? ` <span style="color:#94a3b8;">· ${unitQsLeft} Qs left in unit</span>`
      : "";

    qbankLines.push(
      `🧪 <strong>${qSubject}</strong> → ${unit.name}` +
      ` <span style="color:#94a3b8;">~${qForUnit} questions (${(qForUnit/qbankSpeed).toFixed(1)}h)</span>` +
      accTag + leftTag
    );
    qRemaining -= qForUnit;
  });

  if (qbankLines.length === 0) {
    qbankLines.push(`🧪 <strong>${qSubject}</strong> — <span style="color:#94a3b8;">~${qTotal} questions (${qbankTime}h)</span>`);
  }

  // ── REVISION BLOCK ─────────────────────────────────────────────
  let revLines = [];
  if (revisionDue.length === 0) {
    revLines.push(`🔁 No revisions due today`);
  } else {
    revisionDue.slice(0, 6).forEach(r => {
      let ch = studyData.subjects[r.subjectName]?.units[r.unitIndex]?.chapters[r.chapterIndex];
      if (!ch) return;
      let nextR = `R${(ch.revisionIndex || 0) + 1}`;
      let overdueTag = r.isOverdue ? ` <span style="color:#ef4444;font-size:11px;">overdue</span>` : "";
      let pageTag = ch.pageCount > 0 ? ` <span style="color:#64748b;font-size:11px;">(${ch.pageCount}p)</span>` : "";
      revLines.push(
        `🔁 <strong>${r.subjectName}</strong> → ${studyData.subjects[r.subjectName].units[r.unitIndex]?.name} → <em>${ch.name}</em>` +
        ` <span style="font-size:11px;background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:4px;">${nextR}</span>` +
        pageTag + overdueTag
      );
    });
    if (revisionDue.length > 6) {
      revLines.push(`<span style="color:#64748b;font-size:12px;">+ ${revisionDue.length - 6} more chapters due</span>`);
    }
  }

  // ── RENDER ───────────────────────────────────────────────────
  let studyHtml    = studyLines.map(l => `<div style="margin-bottom:6px;line-height:1.5;">${l}</div>`).join("");
  let qbankHtml    = qbankLines.map(l => `<div style="margin-bottom:4px;line-height:1.5;">${l}</div>`).join("");
  let revisionHtml = revLines.map(l => `<div style="margin-bottom:4px;line-height:1.5;">${l}</div>`).join("");

  document.getElementById("planOutput").innerHTML = `
    <div style="font-size:13px;line-height:1.6;">
      <div style="background:#0f172a;border-radius:10px;padding:10px;margin-bottom:8px;border:1px solid #1e293b;">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">
          📖 STUDY — ${studyTime} hrs total${pagesBudget > 0 ? " · ~" + pagesBudget + " pages" : ""}
        </div>
        ${studyHtml}
      </div>
      <div style="background:#0f172a;border-radius:10px;padding:10px;margin-bottom:8px;border:1px solid #1e293b;">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">
          🧪 QBANK — ${qbankTime} hrs · ~${qTotal} questions
        </div>
        ${qbankHtml}
      </div>
      <div style="background:#0f172a;border-radius:10px;padding:10px;border:1px solid #1e293b;">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">
          🔁 REVISION — ${revisionTime} hrs · ${revisionDue.length} due${overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}
        </div>
        ${revisionHtml}
      </div>
      ${burnoutWarn}${examAlert}
    </div>`;

  studyData.dailyPlan = {
    date: today(),
    study: { subject: topSubject, unitIndex: ptr.unit, chapterIndex: ptr.chapter, planChapters },
    qbank: { subject: qSubject },
    revisionCount: revisionDue.length, overdueCount,
    hours, adjustedHours: parseFloat(adjHours.toFixed(1)),
    studyTime, qbankTime, revisionTime,
    burnoutAdj: parseFloat(burnoutAdj.toFixed(3)),
    completed: false
  };

  saveData();
  document.getElementById("generateButton").disabled = true;
}

// Helper: get phase label for a chapter
function _getChapterPhaseLabel(ch) {
  if (!ch || ch.status !== "completed") return "";
  if (ch.revisionIndex >= 3) return "R3 ✓";
  if (ch.revisionIndex >= 2) return "R2 ✓";
  if (ch.revisionIndex >= 1) return "R1 ✓";
  return "Read ✓";
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

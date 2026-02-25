// ─── Smart Scheduler 2.0 ─────────────────────────────────────

// Returns null when no qbank data at all (prevents phantom accuracy boost)
function subjectAccuracy(subject) {
  let total = 0, correct = 0;
  subject.units.forEach(unit => {
    total   += unit.qbankStats?.total   || 0;
    correct += unit.qbankStats?.correct || 0;
  });
  if (total === 0) return null; // #1 fix: null = no data, not 0%
  return (correct / total) * 100;
}

function subjectPriority(subjectName) {
  let subject  = studyData.subjects[subjectName];
  let accuracy = subjectAccuracy(subject);

  // #1 fix: null accuracy (no data) → 0 accuracy-weight, not (100-0)*0.35=35 pts
  let accuracyScore = (accuracy === null) ? 0 : (100 - accuracy) * 0.35;

  let incomplete = 0;
  subject.units.forEach(u => u.chapters.forEach(ch => { if (ch.status !== "completed") incomplete++; }));

  let overdue = getOverdueCount(subjectName);
  let sizeWeight = { large: 12, medium: 6, small: 0 };

  let phase = detectPhaseStatus(subjectName);
  let phaseBoost = phase.phase1 ? 0 : 5;
  phaseBoost += phase.phase2 ? 0 : (examProximityFactor() * 15);

  let proximityMult = 1 + examProximityFactor() * 0.5;

  // #2 fix: raise consecutive penalty enough to actually force rotation.
  // Previous 15-pt cap was always beaten by large subjects (80 ch * 0.25 = 20 pts).
  // New penalty scales with subject size so rotation actually fires.
  let consecutivePenalty = 0;
  let yesterday = addDays(today(), -1);
  let dayBefore = addDays(today(), -2);
  let ySubject  = studyData.dailyHistory?.[yesterday]?.studyEntries?.[0]?.subject
                  || studyData.dailyHistory?.[yesterday]?.studySubject;
  let dbSubject = studyData.dailyHistory?.[dayBefore]?.studyEntries?.[0]?.subject
                  || studyData.dailyHistory?.[dayBefore]?.studySubject;
  let sizePenaltyBase = { large: 30, medium: 25, small: 20 }[subject.size] || 25;
  if (ySubject === subjectName && dbSubject === subjectName) consecutivePenalty = sizePenaltyBase * 1.5;
  else if (ySubject === subjectName)                         consecutivePenalty = sizePenaltyBase * 0.6;

  // Hard chapter boost
  let hardPending = 0;
  subject.units.forEach(u => u.chapters.forEach(ch => {
    if (ch.difficulty === "hard" && ch.status !== "completed") hardPending++;
  }));

  return (
    (accuracyScore +
    incomplete * 0.25 +
    overdue * 12 +
    (sizeWeight[subject.size] || 0) +
    phaseBoost +
    hardPending * 3) * proximityMult
  ) - consecutivePenalty;
}

function getBurnoutAdjustment() {
  let burnout = parseFloat(getBurnoutIndex());
  if (burnout > 50) return Math.max(0.7, 1 - (burnout - 50) / 100); // reduce on fatigue
  if (burnout < 20) return Math.min(1.15, 1 + (20 - burnout) / 100); // #10: boost up to 15% on great days
  return 1.0;
}

// ─── Auto-calibrate reading/qbank speed from history (#13, #18) ──────────
function _autoCalibrateSpeeds() {
  let history     = studyData.dailyHistory || {};
  let recentDates = Object.keys(history).sort().slice(-14);
  let totalPages = 0, totalStudyHrs = 0, totalQs = 0, totalQbankHrs = 0;
  recentDates.forEach(date => {
    let e = history[date];
    if (!e) return;
    (e.studyEntries || []).forEach(se => {
      let unit = studyData.subjects[se.subject]?.units?.[se.unitIndex];
      if (!unit || !se.topics) return;
      se.topics.forEach(name => {
        let ch = unit.chapters.find(c => c.name === name);
        if (ch?.pageCount > 0) totalPages += ch.pageCount;
      });
    });
    if (e.timeTracking?.study?.accumulated) totalStudyHrs += e.timeTracking.study.accumulated / 3600;
    (e.qbankEntries || []).forEach(qe => { totalQs += qe.total || 0; });
    if (e.timeTracking?.qbank?.accumulated) totalQbankHrs += e.timeTracking.qbank.accumulated / 3600;
  });
  if (totalStudyHrs >= 2 && totalPages >= 20) {
    let s = Math.round(totalPages / totalStudyHrs);
    if (s >= 8 && s <= 80) studyData.readingSpeed = s;
  }
  if (totalQbankHrs >= 1 && totalQs >= 10) {
    let s = Math.round(totalQs / totalQbankHrs);
    if (s >= 10 && s <= 120) studyData.qbankSpeed = s;
  }
}

// ─── Dynamic ratios: qbank grows with exam proximity, revision 0% when nothing due (#7, #8) ─
function _computeDynamicRatios(overdueCount, dueCount) {
  let daysLeft     = daysUntilExam();
  let examProgress = (daysLeft > 0 && daysLeft <= 180)
    ? Math.max(0, Math.min(1, (180 - daysLeft) / 180)) : 0;
  let baseQbankRatio = 0.15 + examProgress * 0.30; // 15% early → 45% near exam
  // #8: no 20% floor when there is nothing to revise
  let revisionRatio  = dueCount === 0
    ? 0 : Math.min(0.45, 0.10 + dueCount * 0.015 + overdueCount * 0.025);
  let qbankRatio = Math.min(baseQbankRatio, 1 - revisionRatio - 0.10);
  let studyRatio = Math.max(0.10, 1 - revisionRatio - qbankRatio);
  return { studyRatio, qbankRatio, revisionRatio };
}

// ─── Time-of-day study profile (#12) ─────────────────────────────────────
function _getTimeOfDayProfile() {
  let h = new Date().getHours();
  if (h >= 22 || h < 5)  return { studyBoost: 0.60, hint: '🌙 Night session — light revision only, avoid new chapters.' };
  if (h >= 19)           return { studyBoost: 0.85, hint: '🌆 Evening — revision & flashcards recommended.' };
  if (h >= 14)           return { studyBoost: 0.95, hint: null };
  return                        { studyBoost: 1.00, hint: null };
}

function generatePlan() {
  let hours = parseFloat(document.getElementById("dailyHours").value);
  if (!hours || hours <= 0) { alert("Enter valid hours."); return; }

  if (studyData.dailyPlan?.date === today()) {
    renderSavedPlan();
    document.getElementById("generateButton").disabled = true;
    return;
  }

  // #13, #18 — auto-calibrate reading/qbank speed from history before computing plan
  _autoCalibrateSpeeds();

  let revisionDue  = getRevisionsDueToday();
  let overdueCount = revisionDue.filter(r => r.isOverdue).length;

  let subjectsSorted = Object.keys(studyData.subjects)
    .sort((a, b) => subjectPriority(b) - subjectPriority(a));

  if (!subjectsSorted.length) { alert("Add subjects first."); return; }

  // #16 — pinned subject override
  let pinnedSubject = (studyData.pinnedSubjectDate === today() && studyData.pinnedSubject)
    ? studyData.pinnedSubject : null;
  let topSubject = (pinnedSubject && studyData.subjects[pinnedSubject])
    ? pinnedSubject : subjectsSorted[0];

  // #20 — carry-forward indicator
  let carriedForward = false;
  let prev = studyData.dailyPlan;
  if (!pinnedSubject && prev && prev.date !== today() && !prev.completed && studyData.subjects[prev.study?.subject]) {
    topSubject     = prev.study.subject;
    carriedForward = true;
  }

  let subjectObj = studyData.subjects[topSubject];
  let burnoutAdj = getBurnoutAdjustment();
  // #12 — time-of-day profile (only reduces, never inflates beyond user input)
  let todProfile = _getTimeOfDayProfile();
  // Cap at hours: burnout boost never gives more time than the user entered
  let adjHours   = burnoutAdj >= 1.0
    ? hours * todProfile.studyBoost          // on good days: only time-of-day governs (≤ hours)
    : Math.max(hours * 0.5, hours * burnoutAdj * todProfile.studyBoost); // on bad days: reduce

  // #7, #8 — dynamic ratios based on exam proximity and due load
  let { studyRatio, qbankRatio, revisionRatio } = _computeDynamicRatios(overdueCount, revisionDue.length);

  let studyMins    = Math.round(adjHours * studyRatio    * 60);
  let qbankMins    = Math.round(adjHours * qbankRatio    * 60);
  let revisionMins = Math.round(adjHours * revisionRatio * 60);

  let studyTime    = (studyMins    / 60).toFixed(1);
  let qbankTime    = (qbankMins    / 60).toFixed(1);
  let revisionTime = (revisionMins / 60).toFixed(1);

  let daysLeft = daysUntilExam();

  // #9 — gradual 4-level exam phase instead of binary 30-day cutoff
  let examPhase = 0;
  if (daysLeft > 0) {
    if      (daysLeft <=  7) examPhase = 4;
    else if (daysLeft <= 14) examPhase = 3;
    else if (daysLeft <= 30) examPhase = 2;
    else if (daysLeft <= 60) examPhase = 1;
  }
  let examCountdownMode = examPhase >= 3;

  // #10 — burnout message: warn on fatigue AND celebrate on great-streak days
  let burnoutWarn = "";
  if (burnoutAdj < 1.0) {
    burnoutWarn = `<div style="color:#ef4444;font-size:12px;margin-top:6px;">⚠ Burnout detected — load reduced ${((1-burnoutAdj)*100).toFixed(0)}%</div>`;
  } else if (burnoutAdj > 1.0) {
    burnoutWarn = `<div style="color:#10b981;font-size:12px;margin-top:6px;">✨ Great consistency — capacity boosted ${((burnoutAdj-1)*100).toFixed(0)}%</div>`;
  }
  let examAlert = daysLeft > 0 && daysLeft <= 60
    ? `<div style="color:${daysLeft<=14?"#ef4444":daysLeft<=30?"#f97316":"#f59e0b"};font-size:12px;margin-top:4px;">🔔 ${daysLeft} days to exam — ${daysLeft<=14?"FINAL SPRINT — revision only":daysLeft<=30?"heavy revision push":"accelerate revision pace"}</div>` : "";
  let todHint = todProfile.hint
    ? `<div style="color:#64748b;font-size:11px;margin-top:4px;">${todProfile.hint}</div>` : "";

  // ── EXAM COUNTDOWN MODE (#9 gradual) ─────────────────────────
  if (examCountdownMode) {
    let revPct   = examPhase >= 4 ? 0.55 : 0.50;
    let revTime2 = (adjHours * revPct).toFixed(1);
    let qbTime2  = (adjHours * (1 - revPct)).toFixed(1);
    let label    = examPhase >= 4 ? "🚨 FINAL SPRINT" : "🚨 EXAM COUNTDOWN";
    let msg      = examPhase >= 4
      ? "7 days out — maximum revision intensity. No new chapters."
      : "New study paused. Focus 100% on revision and Qbank mastery.";
    let cdSummary = `
      <div style="background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #334155;
        border-radius:10px;padding:10px 14px;margin-bottom:10px;display:flex;
        align-items:center;gap:14px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:800;color:#f1f5f9;">⏱ ${adjHours.toFixed(1)}h plan</span>
        <span style="font-size:12px;color:#8b5cf6;">🔁 ${revTime2}h revision</span>
        <span style="font-size:12px;color:#10b981;">🧪 ${qbTime2}h qbank</span>
        <span style="font-size:11px;color:#ef4444;margin-left:auto;">${daysLeft} days left</span>
      </div>`;
    document.getElementById("planOutput").innerHTML = cdSummary + `
      <div style="background:#450a0a;border:1px solid #ef4444;border-radius:10px;padding:10px;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:800;color:#fca5a5;margin-bottom:4px;">${label} — ${daysLeft} days left</div>
        <div style="font-size:12px;color:#fca5a5;opacity:0.85;">${msg}</div>
      </div>
      <div style="padding:4px 0;font-size:14px;line-height:1.9;">
        <strong>🔁 Revision:</strong> ${revTime2} hrs — ${revisionDue.length} chapters due${overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}<br>
        <strong>🧪 Qbank:</strong> ${qbTime2} hrs — weak units first
        ${burnoutWarn}${examAlert}
      </div>`;
    studyData.dailyPlan = {
      date: today(), study: { subject: null }, qbank: { subject: topSubject },
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
  let readingSpeed = studyData.readingSpeed || 25;
  let pagesBudget  = Math.round(studyMins / 60 * readingSpeed);
  let ptr          = subjectObj.pointer || { unit: 0, chapter: 0 };

  let studyLines      = [];
  let pagesLeft       = pagesBudget;
  let timeMinsLeft    = studyMins; // #6 fix: separate time budget for no-page chapters
  let chaptersDone    = 0;
  let planChapters    = [];
  let foundStart      = false;
  let timeBudgetExhausted = false; // true = broke out because budget ran out

  outerLoop:
  for (let ui = 0; ui < subjectObj.units.length; ui++) {
    let unit    = subjectObj.units[ui];
    let ciStart = (ui === ptr.unit && !foundStart) ? ptr.chapter : 0;
    for (let ci = ciStart; ci < unit.chapters.length; ci++) {
      let ch = unit.chapters[ci];
      if (ch.status === "completed") continue;
      foundStart = true;

      if (ch.pageCount > 0) {
        if (pagesLeft <= 0) { timeBudgetExhausted = true; break outerLoop; }
        let alreadyRead = planChapters
          .filter(p => p.unitIndex === ui && p.chapterIndex === ci)
          .reduce((s, p) => s + (p.pgEnd - p.pgStart + 1), 0);
        let chStart = ch.startPage + alreadyRead;
        let chEnd   = ch.endPage;
        if (chStart > chEnd) continue;

        let pagesToRead = Math.min(pagesLeft, chEnd - chStart + 1);
        let pgEnd       = chStart + pagesToRead - 1;
        let hrs         = (pagesToRead / readingSpeed).toFixed(1);
        let phaseLabel  = _getChapterPhaseLabel(ch);

        studyLines.push(
          `📖 <strong>${topSubject}</strong> → ${unit.name} → <em>${ch.name}</em>` +
          ` <span style="color:#94a3b8;">pg ${chStart}–${pgEnd} (${pagesToRead}p · ${hrs}h)</span>` +
          (phaseLabel ? ` <span style="font-size:11px;background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:4px;">${phaseLabel}</span>` : "")
        );
        planChapters.push({ unitIndex: ui, chapterIndex: ci, pgStart: chStart, pgEnd });
        pagesLeft    -= pagesToRead;
        timeMinsLeft -= (pagesToRead / readingSpeed) * 60;
        chaptersDone++;

        if (pgEnd < chEnd) { timeBudgetExhausted = true; break outerLoop; }
      } else {
        // #6 fix: use timeMinsLeft for no-page chapters (no longer contaminates pages budget)
        let chapterHrs  = subjectObj.size === "large" ? 1.5 : subjectObj.size === "medium" ? 1.0 : 0.75;
        let chapterMins = chapterHrs * 60;
        if (timeMinsLeft <= 0) { timeBudgetExhausted = true; break outerLoop; }

        let phaseLabel = _getChapterPhaseLabel(ch);
        studyLines.push(
          `📖 <strong>${topSubject}</strong> → ${unit.name} → <em>${ch.name}</em>` +
          ` <span style="color:#94a3b8;">(~${chapterHrs}h est.)</span>` +
          (phaseLabel ? ` <span style="font-size:11px;background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:4px;">${phaseLabel}</span>` : "")
        );
        planChapters.push({ unitIndex: ui, chapterIndex: ci });
        timeMinsLeft -= chapterMins;
        chaptersDone++;
        if (timeMinsLeft <= 0) { timeBudgetExhausted = true; break outerLoop; }
      }
    }
  }

  // #11 — if primary chapters exhausted before budget ran out, fill with next subject
  let secondarySubject = null;
  let secondaryLines   = [];
  if (!timeBudgetExhausted && (pagesLeft > 5 || timeMinsLeft > 10)) {
    for (let si = 0; si < subjectsSorted.length; si++) {
      let sn = subjectsSorted[si];
      if (sn === topSubject) continue;
      let so = studyData.subjects[sn];
      if (!so.units.some(u => u.chapters.some(c => c.status !== "completed"))) continue;
      secondarySubject = sn;
      let sPtr       = so.pointer || { unit: 0, chapter: 0 };
      let sPagesLeft = pagesLeft > 5 ? pagesLeft : Math.round(timeMinsLeft / 60 * readingSpeed);
      let sTimeMins  = timeMinsLeft;
      secLoop:
      for (let ui = 0; ui < so.units.length; ui++) {
        let unit    = so.units[ui];
        let ciStart = ui === sPtr.unit ? sPtr.chapter : 0;
        for (let ci = ciStart; ci < unit.chapters.length; ci++) {
          let ch = unit.chapters[ci];
          if (ch.status === "completed") continue;
          if (ch.pageCount > 0) {
            if (sPagesLeft <= 0) break secLoop;
            let pages = Math.min(sPagesLeft, ch.endPage - ch.startPage + 1);
            let hrs   = (pages / readingSpeed).toFixed(1);
            secondaryLines.push(
              `📖 <strong>${sn}</strong> → ${unit.name} → <em>${ch.name}</em>` +
              ` <span style="color:#94a3b8;">pg ${ch.startPage}–${ch.startPage+pages-1} (${pages}p · ${hrs}h)</span>`
            );
            sPagesLeft -= pages;
          } else {
            let chHrs = so.size === "large" ? 1.5 : so.size === "medium" ? 1.0 : 0.75;
            if (sTimeMins <= 0) break secLoop;
            secondaryLines.push(
              `📖 <strong>${sn}</strong> → ${unit.name} → <em>${ch.name}</em>` +
              ` <span style="color:#94a3b8;">(~${chHrs}h est.)</span>`
            );
            sTimeMins -= chHrs * 60;
            sPagesLeft -= chHrs * readingSpeed;
          }
        }
      }
      break;
    }
  }

  if (studyLines.length === 0 && secondaryLines.length === 0) {
    studyLines.push(`📖 <strong>${topSubject}</strong> — All chapters completed 🎉`);
  }

  // ── SMART QBANK BLOCK ─────────────────────────────────────────
  let qbankSpeed = studyData.qbankSpeed || 30;
  let qTotal     = Math.round(qbankMins / 60 * qbankSpeed);

  // Pick qbank subject: weakest accuracy; null (no data) treated as worst (#1)
  let qSubject = topSubject;
  let worstAcc = Infinity;
  subjectsSorted.forEach(sn => {
    let s = studyData.subjects[sn];
    if (!s.units.some(u => !u.qbankDone)) return;
    let acc    = subjectAccuracy(s);
    let effAcc = (acc === null) ? -1 : acc;
    if (effAcc < worstAcc) { worstAcc = effAcc; qSubject = sn; }
  });

  let qSubjectObj = studyData.subjects[qSubject];
  let qbankLines  = [];
  let qRemaining  = qTotal;

  qSubjectObj.units.forEach((unit, ui) => {
    if (qRemaining <= 0) return;
    let unitQsTotal = unit.questionCount || 0;
    let unitQsDone  = unit.qbankStats.total || 0;
    let unitQsLeft  = unitQsTotal > 0 ? Math.max(0, unitQsTotal - unitQsDone) : null;
    let unitAcc     = unit.qbankStats.total > 0
      ? (unit.qbankStats.correct / unit.qbankStats.total * 100).toFixed(0) + "%" : null;
    let qForUnit    = unitQsLeft !== null
      ? Math.min(qRemaining, Math.min(qTotal, unitQsLeft))
      : qRemaining;
    if (unit.qbankDone && unitQsLeft === 0) return;
    let accTag  = unitAcc ? ` <span style="color:${parseFloat(unitAcc)>=75?"#10b981":parseFloat(unitAcc)>=50?"#eab308":"#ef4444"}">${unitAcc} acc</span>` : "";
    let leftTag = unitQsLeft !== null ? ` <span style="color:#94a3b8;">· ${unitQsLeft} Qs left</span>` : "";
    qbankLines.push(
      `🧪 <strong>${qSubject}</strong> → ${unit.name}` +
      ` <span style="color:#94a3b8;">~${qForUnit} Qs (${(qForUnit/qbankSpeed).toFixed(1)}h)</span>` +
      accTag + leftTag
    );
    qRemaining -= qForUnit;
  });

  if (qbankLines.length === 0) {
    qbankLines.push(`🧪 <strong>${qSubject}</strong> — <span style="color:#94a3b8;">~${qTotal} questions (${qbankTime}h)</span>`);
  }

  // ── REVISION BLOCK — urgency-aware, quality-score buttons ────
  let revLines = [];
  if (revisionDue.length === 0) {
    revLines.push(`🔁 No revisions due today`);
  } else {
    let showCount = Math.min(revisionDue.length, 10);
    revisionDue.slice(0, showCount).forEach(r => {
      let ch = studyData.subjects[r.subjectName]?.units[r.unitIndex]?.chapters[r.chapterIndex];
      if (!ch) return;
      let nextR     = `R${(ch.revisionIndex || 0) + 1}`;
      let urgency   = r.urgency || (r.isOverdue ? 'moderate' : 'due');
      let urgColor  = urgency === 'critical' ? '#ef4444'
                    : urgency === 'high'     ? '#f97316'
                    : urgency === 'moderate' ? '#eab308'
                    : '#3b82f6';
      let urgBg     = urgency === 'critical' ? '#450a0a'
                    : urgency === 'high'     ? '#431407'
                    : urgency === 'moderate' ? '#422006'
                    : '#1e3a5f';
      let overdueTag = r.isOverdue
        ? ` <span style="background:${urgBg};color:${urgColor};font-size:10px;padding:1px 6px;border-radius:4px;font-weight:700;">${r.overdueDays}d overdue</span>` : "";
      let pageTag   = ch.pageCount > 0 ? ` <span style="color:#64748b;font-size:11px;">(${ch.pageCount}p)</span>` : "";
      let diffTag   = ch.difficulty ? ` <span style="font-size:10px;color:${ch.difficulty==='hard'?'#ef4444':ch.difficulty==='easy'?'#10b981':'#64748b'};">${ch.difficulty}</span>` : "";
      // Inline quality-score buttons to record recall right from the plan
      let qualBtns  = `<span style="display:inline-flex;gap:3px;margin-left:6px;vertical-align:middle;">` +
        [['1','#450a0a','#fca5a5','✗'],['2','#3b1515','#f87171','△'],['3','#422006','#fb923c','~'],['4','#0f3a1a','#4ade80','✓'],['5','#0f2a3a','#60a5fa','★']]
        .map(([q, bg, fc, lbl]) =>
          `<button onclick="markRevisionDone('${r.subjectName.replace(/'/g,"\\'")}',${r.unitIndex},${r.chapterIndex},${q});this.closest('.rev-row').style.opacity='.35';this.closest('.rev-row').style.pointerEvents='none';"
            style="background:${bg};color:${fc};border:1px solid ${fc}33;border-radius:4px;font-size:10px;padding:2px 5px;cursor:pointer;min-height:unset;line-height:1;" title="Quality ${q}">${lbl}</button>`
        ).join('') + `</span>`;
      revLines.push(
        `<div class="rev-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px 0;border-bottom:1px solid #0f172a;">` +
        `<span>🔁 <strong>${r.subjectName}</strong> → ${studyData.subjects[r.subjectName].units[r.unitIndex]?.name} → <em>${ch.name}</em></span>` +
        ` <span style="font-size:11px;background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:4px;">${nextR}</span>` +
        pageTag + diffTag + overdueTag + qualBtns +
        ` <span class="rev-meta" data-key="${r.subjectName}||${studyData.subjects[r.subjectName].units[r.unitIndex]?.name}||${ch.name}"></span>` +
        `</div>`
      );
    });
    if (revisionDue.length > showCount) {
      revLines.push(`<span style="color:#64748b;font-size:12px;">+ ${revisionDue.length - showCount} more chapters due</span>`);
    }
  }

  // ── RENDER ────────────────────────────────────────────────────
  // #20 — carry-forward / pinned badge
  let carryTag = carriedForward
    ? `<span style="font-size:11px;background:#1a3a1a;color:#4ade80;border:1px solid #166534;padding:1px 7px;border-radius:10px;margin-left:6px;">⏩ Continued from yesterday</span>` : "";
  if (pinnedSubject) carryTag = `<span style="font-size:11px;background:#1e3a5f;color:#93c5fd;border:1px solid #2a4f80;padding:1px 7px;border-radius:10px;margin-left:6px;">📌 Pinned</span>`;

  // #15 — secondary subject continuation label
  let secondaryHtml = secondaryLines.length > 0
    ? `<div style="font-size:11px;color:#f59e0b;margin:6px 0 3px;font-weight:700;border-top:1px solid #1e293b;padding-top:6px;">⏩ Continuing with ${secondarySubject}:</div>` +
      secondaryLines.map(l => `<div style="margin-bottom:6px;line-height:1.5;">${l}</div>`).join("") : "";

  let studyHtml    = studyLines.map(l => `<div style="margin-bottom:6px;line-height:1.5;">${l}</div>`).join("") + secondaryHtml;
  let qbankHtml    = qbankLines.map(l => `<div style="margin-bottom:4px;line-height:1.5;">${l}</div>`).join("");
  let revisionHtml = revLines.map(l   => `<div style="margin-bottom:4px;line-height:1.5;">${l}</div>`).join("");

  // #14 — recommended session order
  let orderItems = revisionDue.length > 0
    ? ["🔁 Revision (memory first)", "📖 New study", "🧪 Qbank practice", "🃏 Flashcards"]
    : ["📖 New study", "🧪 Qbank practice", "🃏 Flashcards"];

  // #17 — Pomodoro session suggestion
  let totalBlocks25 = Math.ceil((adjHours * 60) / 30);

  // #19 — Plan summary header bar
  let summaryBar = `
    <div style="background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #334155;
      border-radius:10px;padding:10px 14px;margin-bottom:10px;display:flex;
      align-items:center;gap:10px;flex-wrap:wrap;">
      <span style="font-size:13px;font-weight:800;color:#f1f5f9;">⏱ ${adjHours.toFixed(1)}h plan</span>
      <span style="font-size:12px;color:#3b82f6;">📖 ${studyTime}h</span>
      <span style="font-size:12px;color:#10b981;">🧪 ${qbankTime}h</span>
      <span style="font-size:12px;color:#8b5cf6;">🔁 ${revisionTime}h</span>
      <span id="plan-card-summary" style="font-size:12px;color:#f59e0b;">🃏 …</span>
      <span style="margin-left:auto;font-size:11px;color:#475569;">🍅 ${totalBlocks25} Pomodoros</span>
    </div>`;

  let orderBar = `
    <div style="background:#0a1628;border:1px solid #1e293b;border-radius:10px;
      padding:9px 14px;margin-bottom:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
      <span style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.05em;margin-right:2px;">Recommended:</span>
      ${orderItems.map((item, i) => `<span style="font-size:12px;background:#1e293b;color:#94a3b8;padding:3px 10px;border-radius:8px;border:1px solid #334155;">${i+1}. ${item}</span>`).join("")}
    </div>`;

  let _planHTML = `<div style="font-size:13px;line-height:1.6;">
    ${summaryBar}
    ${orderBar}
    <div style="background:#0f172a;border-radius:10px 10px 0 0;padding:10px;border:1px solid #1e293b;border-bottom:none;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
        📖 STUDY — ${studyTime} hrs total${pagesBudget > 0 ? " · ~" + pagesBudget + " pages" : ""}${carryTag}
      </div>
      ${studyHtml}
    </div>
    <div id="sw-slot-study"></div>

    <div style="background:#0f172a;border-radius:10px 10px 0 0;padding:10px;margin-top:8px;border:1px solid #1e293b;border-bottom:none;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">
        🧪 QBANK — ${qbankTime} hrs · ~${qTotal} questions
      </div>
      ${qbankHtml}
    </div>
    <div id="sw-slot-qbank"></div>

    <div style="background:#0f172a;border-radius:10px 10px 0 0;padding:10px;margin-top:8px;border:1px solid #1e293b;border-bottom:none;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">
        🔁 REVISION — ${revisionTime} hrs · ${revisionDue.length} due${overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}
      </div>
      ${revisionHtml}
    </div>
    <div id="sw-slot-revision"></div>

    ${burnoutWarn}${examAlert}${todHint}
  </div>`;

  document.getElementById("planOutput").innerHTML = _planHTML;

  studyData.dailyPlan = {
    date: today(),
    study: { subject: topSubject, unitIndex: ptr.unit, chapterIndex: ptr.chapter, planChapters },
    qbank: { subject: qSubject },
    revisionCount: revisionDue.length, overdueCount,
    hours, adjustedHours: parseFloat(adjHours.toFixed(1)),
    studyTime, qbankTime, revisionTime,
    burnoutAdj: parseFloat(burnoutAdj.toFixed(3)),
    carriedForward, pinnedSubject: pinnedSubject || null,
    completed: false,
    renderedHTML: _planHTML,
    stopwatches: {
      study:    { accumulated:0, startedAt:null, running:false, targetSecs: Math.round(parseFloat(studyTime)*3600) },
      qbank:    { accumulated:0, startedAt:null, running:false, targetSecs: Math.round(parseFloat(qbankTime)*3600) },
      revision: { accumulated:0, startedAt:null, running:false, targetSecs: Math.round(parseFloat(revisionTime)*3600) },
      cards:    { accumulated:0, startedAt:null, running:false, targetSecs: 0 }
    }
  };

  saveData();

  if (typeof swInject === "function") {
    swInject("study",    parseFloat(studyTime));
    swInject("qbank",    parseFloat(qbankTime));
    swInject("revision", parseFloat(revisionTime));
  }

  document.getElementById("generateButton").disabled = true;
  _appendFlashcardsPlanBlock();
  _enrichRevisionBlock();
}

// ─── Flashcards Due block — appended async to plan output ─────────────────
// Called after generatePlan() renders HTML and after renderSavedPlan()
// replays saved HTML. Fetches live due count, never stored in savedHTML.
async function _appendFlashcardsPlanBlock() {
  let planEl = document.getElementById("planOutput");
  if (!planEl) return;
  if (typeof getDueCardCount !== "function") return;

  // Remove stale block if re-appending
  let old = document.getElementById("fc-plan-block");
  if (old) old.remove();

  try {
    let dueCount = await getDueCardCount();
    // #18 — use history-calibrated mins/card if available (stored by _autoCalibrateSpeeds future hook)
    let minsPerCard = studyData.reviewMinsPerCard || 1.5;
    let estMins  = Math.max(5, Math.round(dueCount * minsPerCard));
    let estHrs   = (estMins / 60).toFixed(1);

    // Update #19 summary bar card slot
    let summaryCardEl = document.getElementById('plan-card-summary');
    if (summaryCardEl) {
      summaryCardEl.textContent = dueCount === 0 ? '🃏 none due' : `🃏 ${estHrs}h (${dueCount})`;
      summaryCardEl.style.color = dueCount === 0 ? '#10b981' : '#f59e0b';
    }

    let block = document.createElement("div");
    block.id = "fc-plan-block";
    block.style.marginTop = "8px";

    if (dueCount === 0) {
      block.innerHTML = `
        <div style="background:#0f172a;border-radius:10px;padding:10px;border:1px solid #1e293b;
          display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;
              letter-spacing:.06em;margin-bottom:4px;">🃏 FLASHCARDS</div>
            <div style="font-size:13px;color:#10b981;font-weight:600;">✓ No cards due today</div>
          </div>
          <a href="browse.html" style="background:#1e293b;color:#64748b;
            padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;
            text-decoration:none;white-space:nowrap;flex-shrink:0;">Browse →</a>
        </div>`;
    } else {
      let urgencyColor  = dueCount >= 50 ? "#ef4444" : dueCount >= 20 ? "#f59e0b" : "#3b82f6";
      let urgencyLabel  = dueCount >= 50 ? "High priority" : dueCount >= 20 ? "Moderate" : "On track";
      block.innerHTML = `
        <div style="background:#0f172a;border-radius:10px 10px 0 0;padding:10px;
          border:1px solid #1e293b;border-bottom:none;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;
            letter-spacing:.06em;margin-bottom:6px;">
            🃏 FLASHCARDS — ~${estHrs} hrs · ${dueCount} due
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="flex:1;">
              <span style="font-size:22px;font-weight:900;color:${urgencyColor};">${dueCount}</span>
              <span style="font-size:13px;color:#94a3b8;margin-left:6px;">cards due today</span>
            </div>
            <span style="background:${urgencyColor}22;color:${urgencyColor};
              padding:3px 10px;border-radius:8px;font-size:11px;font-weight:700;">${urgencyLabel}</span>
          </div>
          <div style="font-size:12px;color:#475569;margin-top:6px;">
            Estimated ${estMins} min · ${dueCount >= 50 ? "Do this before new study" : "Fits alongside your plan"}
          </div>
        </div>
        <div style="padding:8px;background:#0f172a;border-radius:0 0 10px 10px;
          border:1px solid #1e293b;border-top:none;">
          <a href="review.html" style="display:block;text-align:center;
            background:linear-gradient(135deg,#1e3a5f,#1e3060);color:#93c5fd;
            padding:10px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">
            Start Review Session →
          </a>
        </div>
        <div id="sw-slot-cards"></div>`;

    }

    planEl.appendChild(block);

    // Inject cards stopwatch into the slot (only when cards are due)
    if (dueCount > 0 && typeof swInject === "function") {
      // Ensure cards stopwatch state exists in dailyPlan
      if (studyData.dailyPlan && studyData.dailyPlan.stopwatches) {
        if (!studyData.dailyPlan.stopwatches.cards) {
          studyData.dailyPlan.stopwatches.cards = {
            accumulated: 0, startedAt: null, running: false,
            targetSecs: Math.round(parseFloat(estHrs) * 3600)
          };
          saveData();
        }
      }
      swInject("cards", parseFloat(estHrs));
    }
  } catch (e) {
    console.warn("_appendFlashcardsPlanBlock:", e);
  }
}

// ─── Revision block enrichment — async card/note metadata ────────────────
// Finds all .rev-meta spans in planOutput and fills them with card + note info
async function _enrichRevisionBlock() {
  let spans = document.querySelectorAll(".rev-meta[data-key]");
  if (!spans.length) return;

  try {
    let [cardResult, noteResult] = await Promise.all([
      typeof getCardCounts        === "function" ? getCardCounts()        : Promise.resolve({ data: {} }),
      typeof getNotesCoverageMap  === "function" ? getNotesCoverageMap()  : Promise.resolve({ data: {} })
    ]);

    let cardMap = cardResult?.data  || {};
    let noteMap = noteResult?.data  || {};

    spans.forEach(span => {
      let key      = span.dataset.key;
      let cardData = cardMap[key];
      let hasNote  = noteMap[key];
      let parts    = [];

      if (hasNote) {
        let sub  = encodeURIComponent(key.split("||")[0]);
        let unit = encodeURIComponent(key.split("||")[1]);
        let ch   = encodeURIComponent(key.split("||")[2]);
        parts.push(`<a href="notes.html?subject=${sub}&unit=${unit}&chapter=${ch}" style="font-size:10px;text-decoration:none;margin-left:4px;" title="Open note">📝</a>`);
      }

      if (cardData && cardData.total > 0) {
        let color = cardData.due > 0 ? "#f87171" : "#60a5fa";
        let label = cardData.due > 0 ? `${cardData.due} cards due` : `${cardData.total} cards`;
        let sub   = encodeURIComponent(key.split("||")[0]);
        let tab   = cardData.due > 0 ? "review" : "browse";
        parts.push(`<a href="${tab === 'review' ? 'review' : 'browse'}.html?subject=${sub}" style="font-size:10px;color:${color};text-decoration:none;margin-left:4px;" title="Open flashcards">🃏 ${label}</a>`);
      }

      span.innerHTML = parts.join("");
    });
  } catch (e) {
    console.warn("_enrichRevisionBlock:", e);
  }
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
  // ── Bug fix #3: Duplicate-submit guard ──
  let submitBtn = document.querySelector('[onclick="submitEvening()"]');
  if (submitBtn) {
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
  }

  let todayKey = today();
  let studyEntries = [];
  let qbankEntries = [];
  let revisedItems = [];
  let anyStudy = false, anyQbank = false, anyRevision = false;

  // ── STUDY ENTRIES (multi-entry form) ──
  let skipStudy = document.getElementById('skipStudy')?.checked;
  let studyDivs = skipStudy ? [] : Array.from(document.querySelectorAll("[id^='studyEntry-']"));
  studyDivs.forEach(div => {
    let id = div.id.replace("studyEntry-", "");
    let subjectName = document.getElementById(`sSub-${id}`)?.value;
    let unitIndex   = parseInt(document.getElementById(`sUnit-${id}`)?.value) || 0;
    if (!subjectName || !studyData.subjects[subjectName]) return;

    let selectedIndices = [];
    let chipButtons = div.querySelectorAll(".topic-chip.selected");
    chipButtons.forEach(btn => {
      let ci = parseInt(btn.dataset.ci);
      if (!isNaN(ci)) selectedIndices.push(ci);
    });
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

    let topicNames  = [];
    let validIndices = []; // only indices that were actually NOT already completed
    selectedIndices.forEach(ci => {
      let chapter = unit.chapters[ci];
      if (!chapter) return;
      // Safety: skip chapters already completed on a previous day
      if (chapter.status === "completed" && chapter.completedOn !== today()) return;
      topicNames.push(chapter.name);
      validIndices.push(ci);
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
    if (validIndices.length === 0) return; // nothing new to log
    fixPointer(subjectName);

    studyEntries.push({
      subject: subjectName,
      unit: unit.name,
      unitIndex,
      topics: topicNames,
      topicIndices: validIndices   // only non-already-done indices
    });
    anyStudy = true;
  });

  // ── QBANK ENTRIES (multi-entry form) ──
  let skipQbank = document.getElementById('skipQbank')?.checked;
  let qbankDivs = skipQbank ? [] : Array.from(document.querySelectorAll("[id^='qbankEntry-']"));
  qbankDivs.forEach(div => {
    let id = div.id.replace("qbankEntry-", "");
    let subjectName = document.getElementById(`qSub-${id}`)?.value;
    let unitIndex   = parseInt(document.getElementById(`qUnit-${id}`)?.value) || 0;
    let total       = parseInt(document.getElementById(`qTotal-${id}`)?.value) || 0;
    // Bug fix #2: clamp correct ≤ total
    let correct     = Math.min(parseInt(document.getElementById(`qCorrect-${id}`)?.value) || 0, total);
    if (!subjectName || !studyData.subjects[subjectName]) return;
    if (total <= 0) return;

    let unit = studyData.subjects[subjectName].units[unitIndex];
    if (!unit) return;

    unit.qbankStats.total   = (unit.qbankStats.total   || 0) + total;
    unit.qbankStats.correct = (unit.qbankStats.correct || 0) + correct;
    unit.qbankDone = true;
    let q = Math.round((correct / total) * 5);
    unit.chapters.forEach(ch => {
      let ef = ch.difficultyFactor || 2.5;
      ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      ch.difficultyFactor = clamp(ef, 1.3, 3.0);
    });

    qbankEntries.push({ subject: subjectName, unit: unit.name, unitIndex, total, correct });
    anyQbank = true;
  });

  // ── REVISION ──
  let skipRevision = document.getElementById('skipRevision')?.checked;
  let revBoxes = skipRevision ? [] : Array.from(document.querySelectorAll("#revisionCheckboxList input[type='checkbox']:checked"));
  revBoxes.forEach(box => {
    let [subjectName, ui, ci] = box.value.split("|");
    let chapter = studyData.subjects[subjectName]?.units[parseInt(ui)]?.chapters[parseInt(ci)];
    let topicName = chapter?.name || "?";
    // Snapshot pre-revision state so deleteEveningUpdate can fully restore it
    let prevState = chapter ? {
      revisionIndex:    chapter.revisionIndex,
      nextRevision:     chapter.nextRevision,
      difficultyFactor: chapter.difficultyFactor,
      missedRevisions:  chapter.missedRevisions,
      lastReviewedOn:   chapter.lastReviewedOn
    } : null;
    markRevisionDone(subjectName, parseInt(ui), parseInt(ci));
    revisedItems.push({ subjectName, unitIndex: parseInt(ui), chapterIndex: parseInt(ci), topicName, prevState });
    anyRevision = true;
  });

  // ── Bug fix #4: Empty form validation ──
  if (!anyStudy && !anyQbank && !anyRevision) {
    let warn = document.getElementById("eveningSubmitWarn");
    if (warn) warn.style.display = "block";
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit Evening Update ✓"; }
    return;
  }

  // ── Improvement #10: Mood & improvement #11: Reflection note ──
  let mood = document.querySelector("#eveningMoodRow [data-selected='1']")?.dataset.mood || null;
  let note = (document.getElementById("eveningNote")?.value || "").trim() || null;

  // ── Improvement #12: Streak calculation ──
  let streak = 1;
  for (let i = 1; i <= 365; i++) {
    let prev = addDays(today(), -i);
    if (studyData.dailyHistory?.[prev]?.eveningSubmitted) streak++;
    else break;
  }

  // ── Log daily history ──
  let timeTracking = (typeof swGetTodaySummary === "function") ? swGetTodaySummary() : null;

  studyData.dailyHistory[todayKey] = {
    study: anyStudy,
    qbank: anyQbank,
    revision: anyRevision,
    eveningSubmitted: true,
    studySubject: studyEntries[0]?.subject || null,  // Bug fix #1: write studySubject for intelligence.js
    studyEntries,
    qbankEntries,
    revisedItems,
    submittedAt: new Date().toISOString(),
    timeTracking,
    mood,
    note,
    streak
  };

  if (studyData.dailyPlan?.date === todayKey && anyStudy) {
    studyData.dailyPlan.completed = true;
  }

  saveData();
  // Force immediate cloud sync for submit — don't wait for debounce
  if (typeof _doSaveToCloud === "function") _doSaveToCloud();
  if (typeof renderSubjects === "function") renderSubjects();
  if (typeof renderEveningUpdate === "function") renderEveningUpdate();

  // ── Improvement #12: Streak toast ──
  let toastMsg = streak >= 30 ? `🏆 ${streak}-day streak — legendary!`
    : streak >= 14 ? `🔥 ${streak}-day streak — on fire!`
    : streak >= 7  ? `🔥 ${streak}-day streak — keep it up!`
    : streak >= 3  ? `⚡ ${streak}-day streak!`
    : `✅ Day logged — keep it up!`;
  let toast = document.createElement("div");
  toast.style.cssText = "position:fixed;bottom:84px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;padding:10px 24px;border-radius:22px;font-size:14px;font-weight:700;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.45);pointer-events:none;";
  toast.textContent = toastMsg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

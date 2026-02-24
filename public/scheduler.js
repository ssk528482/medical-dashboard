// scheduler.js — Medical Study OS
// Tasks fixed: #4 (plan re-generation / adjust), #9 (difficultyFactor in subjectPriority),
//              #13 (stopwatch state validated on carry-forward)

// ─── Subject Accuracy ─────────────────────────────────────────
function subjectAccuracy(subject) {
  let total = 0, correct = 0;
  subject.units.forEach(unit => {
    total   += unit.qbankStats?.total   || 0;
    correct += unit.qbankStats?.correct || 0;
  });
  if (total === 0) return 0;
  return (correct / total) * 100;
}

// ─── Subject Priority ─────────────────────────────────────────
// Task #9: now incorporates per-chapter difficultyFactor (SM-2 ease)
// to weight revision urgency more accurately.
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

  // Task #9: use average difficultyFactor of overdue chapters —
  // chapters with high ease factors (easier) need less urgency boost
  // while low ease factors (hard chapters being missed) need more urgency.
  let overdueEfPenalty = 0;
  subject.units.forEach(u => u.chapters.forEach(ch => {
    if (ch.nextRevision && ch.nextRevision < today()) {
      let ef = ch.difficultyFactor || 2.5;
      // ef < 2.0 means the chapter is being repeatedly missed/failed
      overdueEfPenalty += ef < 2.0 ? 8 : 3;
    }
  }));

  return (
    ((100 - accuracy) * 0.35 +
    incomplete * 0.25 +
    overdue * 12 +
    overdueEfPenalty +        // Task #9: difficulty-weighted overdue penalty
    (sizeWeight[subject.size] || 0) +
    phaseBoost +
    hardPending * 3) * proximityMult
  ) - consecutivePenalty;
}

function getBurnoutAdjustment() {
  let burnout = parseFloat(getBurnoutIndex());
  return burnout > 50 ? Math.max(0.7, 1 - (burnout - 50) / 100) : 1.0;
}

// ─── Generate Plan ────────────────────────────────────────────
// Task #4: can now be called with forceRegenerate=true to adjust today's plan
// even if one already exists. Also validates stopwatch state on carry-forward.
function generatePlan(forceRegenerate = false) {
  let hours = parseFloat(document.getElementById("dailyHours").value);
  if (!hours || hours <= 0) { alert("Enter valid hours."); return; }

  // Task #4: if plan exists for today and not forcing, show existing plan
  if (studyData.dailyPlan?.date === today() && !forceRegenerate) {
    renderSavedPlan();
    document.getElementById("generateButton").disabled = true;
    document.getElementById("adjustPlanBtn")?.style && (document.getElementById("adjustPlanBtn").style.display = "inline-block");
    return;
  }

  let revisionDue  = getRevisionsDueToday();
  let overdueCount = revisionDue.filter(r => r.isOverdue).length;

  let subjectsSorted = Object.keys(studyData.subjects)
    .sort((a, b) => subjectPriority(b) - subjectPriority(a));

  if (!subjectsSorted.length) { alert("Add subjects first."); return; }

  let topSubject = subjectsSorted[0];

  // Carry forward unfinished plan (but validate stopwatches — task #13)
  let prev = studyData.dailyPlan;
  if (!forceRegenerate && prev && prev.date !== today() && !prev.completed && studyData.subjects[prev.study?.subject]) {
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
      date: today(), hours,
      study: { subject: null },
      qbank: { subject: topSubject },
      revisionCount: revisionDue.length, overdueCount,
      adjustedHours: parseFloat(adjHours.toFixed(1)),
      studyTime: "0", qbankTime: qbTime2, revisionTime: revTime2,
      burnoutAdj: parseFloat(burnoutAdj.toFixed(3)),
      completed: false, examCountdownMode: true
    };
    saveData();
    document.getElementById("generateButton").disabled = true;
    _showAdjustButton();
    return;
  }

  // ── SMART STUDY BLOCK ─────────────────────────────────────────
  let readingSpeed = studyData.readingSpeed || 25;
  let pagesBudget  = Math.round(studyMins / 60 * readingSpeed);
  let ptr          = subjectObj.pointer || { unit: 0, chapter: 0 };

  let studyLines   = [];
  let pagesLeft    = pagesBudget;
  let chaptersDone = 0;
  let planChapters = [];

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
        if (pagesLeft <= 0) break outerLoop;

        let alreadyRead = planChapters
          .filter(p => p.unitIndex === ui && p.chapterIndex === ci)
          .reduce((s, p) => s + (p.pgEnd - p.pgStart + 1), 0);

        let chStart = ch.startPage + alreadyRead;
        let chEnd   = ch.endPage;

        if (chStart > chEnd) continue;

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

        if (pgEnd < chEnd) break outerLoop;
      } else {
        let chapterHrs = subjectObj.size === "large" ? 1.5 : subjectObj.size === "medium" ? 1.0 : 0.75;
        if (pagesLeft <= 0) break outerLoop;

        let phaseLabel = _getChapterPhaseLabel(ch);
        studyLines.push(
          `📖 <strong>${topSubject}</strong> → ${unit.name} → <em>${ch.name}</em>` +
          ` <span style="color:#94a3b8;">(~${chapterHrs}h est.)</span>` +
          (phaseLabel ? ` <span style="font-size:11px;background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:4px;">${phaseLabel}</span>` : "")
        );
        planChapters.push({ unitIndex: ui, chapterIndex: ci });
        pagesLeft -= chapterHrs * readingSpeed;
        chaptersDone++;
        if (pagesLeft <= 0) break outerLoop;
      }
    }
  }

  if (studyLines.length === 0) {
    studyLines.push(`📖 <strong>${topSubject}</strong> — All chapters completed 🎉`);
  }

  // ── SMART QBANK BLOCK ─────────────────────────────────────────
  let qbankSpeed = studyData.qbankSpeed || 30;
  let qTotal     = Math.round(qbankMins / 60 * qbankSpeed);

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
  let qbankLines = [];
  let qRemaining = qTotal;

  qSubjectObj.units.forEach((unit) => {
    if (qRemaining <= 0) return;
    let unitQsTotal = unit.questionCount || 0;
    let unitQsDone  = unit.qbankStats.total || 0;
    let unitQsLeft  = unitQsTotal > 0 ? Math.max(0, unitQsTotal - unitQsDone) : null;
    let unitAcc     = unit.qbankStats.total > 0
      ? (unit.qbankStats.correct / unit.qbankStats.total * 100).toFixed(0) + "%" : null;

    let qForUnit = unitQsLeft !== null
      ? Math.min(qRemaining, Math.min(qTotal, unitQsLeft))
      : qRemaining;

    if (unit.qbankDone && unitQsLeft === 0) return;

    let accTag = unitAcc ? ` <span style="color:${parseFloat(unitAcc)>=75?"#10b981":parseFloat(unitAcc)>=50?"#eab308":"#ef4444"}">${unitAcc} acc</span>` : "";
    let leftTag = unitQsLeft !== null
      ? ` <span style="color:#94a3b8;">· ${unitQsLeft} Qs left in unit</span>` : "";

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
      // Task #9: show difficulty factor indicator
      let efTag = ch.difficultyFactor < 2.0
        ? ` <span style="color:#f87171;font-size:10px;">⚡ hard</span>`
        : "";
      revLines.push(
        `🔁 <strong>${r.subjectName}</strong> → ${studyData.subjects[r.subjectName].units[r.unitIndex]?.name} → <em>${ch.name}</em>` +
        ` <span style="font-size:11px;background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:4px;">${nextR}</span>` +
        pageTag + overdueTag + efTag +
        ` <span class="rev-meta" data-key="${r.subjectName}||${studyData.subjects[r.subjectName].units[r.unitIndex]?.name}||${ch.name}"></span>`
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

  let _planHTML = `<div style="font-size:13px;line-height:1.6;">
    <div style="background:#0f172a;border-radius:10px 10px 0 0;padding:10px;border:1px solid #1e293b;border-bottom:none;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">
        📖 STUDY — ${studyTime} hrs total${pagesBudget > 0 ? " · ~" + pagesBudget + " pages" : ""}
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

    ${burnoutWarn}${examAlert}
  </div>`;

  document.getElementById("planOutput").innerHTML = _planHTML;

  // Task #13: always reset stopwatches fresh for a new/adjusted plan
  studyData.dailyPlan = {
    date: today(), hours,
    study: { subject: topSubject, unitIndex: ptr.unit, chapterIndex: ptr.chapter, planChapters },
    qbank: { subject: qSubject },
    revisionCount: revisionDue.length, overdueCount,
    adjustedHours: parseFloat(adjHours.toFixed(1)),
    studyTime, qbankTime, revisionTime,
    burnoutAdj: parseFloat(burnoutAdj.toFixed(3)),
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
  _showAdjustButton();

  _appendFlashcardsPlanBlock();
  _enrichRevisionBlock();
}

// Task #4: show an "Adjust Plan" button after plan is locked
function _showAdjustButton() {
  let existing = document.getElementById("adjustPlanBtn");
  if (existing) { existing.style.display = "inline-block"; return; }

  let btn = document.createElement("button");
  btn.id = "adjustPlanBtn";
  btn.textContent = "✏ Adjust Today's Plan";
  btn.style.cssText = `
    width:100%;background:#1e293b;color:#94a3b8;border:1px solid #334155;
    border-radius:8px;padding:9px;font-size:12px;margin-top:8px;cursor:pointer;
  `;
  btn.onclick = () => {
    if (!confirm("Regenerate today's plan with the current hours? Running stopwatch time will be reset.")) return;
    generatePlan(true); // force regenerate
  };
  let planEl = document.getElementById("planOutput");
  if (planEl) planEl.parentNode.insertBefore(btn, planEl.nextSibling);
}

// ─── Flashcards block ─────────────────────────────────────────
async function _appendFlashcardsPlanBlock() {
  let planEl = document.getElementById("planOutput");
  if (!planEl) return;
  if (typeof getDueCardCount !== "function") return;

  let old = document.getElementById("fc-plan-block");
  if (old) old.remove();

  try {
    let dueCount = await getDueCardCount();
    let estMins  = Math.max(5, Math.round(dueCount * 1.5));
    let estHrs   = (estMins / 60).toFixed(1);

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

    if (dueCount > 0 && typeof swInject === "function") {
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

// ─── Revision enrichment ──────────────────────────────────────
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
        let [sub, unit, ch] = key.split("||").map(encodeURIComponent);
        parts.push(`<a href="notes.html?subject=${sub}&unit=${unit}&chapter=${ch}" style="font-size:10px;text-decoration:none;margin-left:4px;" title="Open note">📝</a>`);
      }

      if (cardData && cardData.total > 0) {
        let color = cardData.due > 0 ? "#f87171" : "#60a5fa";
        let label = cardData.due > 0 ? `${cardData.due} cards due` : `${cardData.total} cards`;
        let sub   = encodeURIComponent(key.split("||")[0]);
        let tab   = cardData.due > 0 ? "review" : "browse";
        parts.push(`<a href="${tab}.html?subject=${sub}" style="font-size:10px;color:${color};text-decoration:none;margin-left:4px;">🃏 ${label}</a>`);
      }

      span.innerHTML = parts.join("");
    });
  } catch (e) {
    console.warn("_enrichRevisionBlock:", e);
  }
}

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
  let adjBtn = document.getElementById("adjustPlanBtn");
  if (adjBtn) adjBtn.remove();
}

// ─── submitEvening ────────────────────────────────────────────
// (unchanged from original — kept here for completeness)
function submitEvening() {
  let todayKey = today();
  let studyEntries = [];
  let qbankEntries = [];
  let revisedItems = [];
  let anyStudy = false, anyQbank = false, anyRevision = false;

  let studyDivs = document.querySelectorAll("[id^='studyEntry-']");
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

    let topicNames = [];
    selectedIndices.forEach(ci => {
      let chapter = unit.chapters[ci];
      if (!chapter) return;
      topicNames.push(chapter.name);
      chapter.status = "completed";
      chapter.completedOn = today();
      chapter.lastReviewedOn = today();
      let dates = [], cursor = today();
      for (let i = 0; i < BASE_INTERVALS.length; i++) {
        cursor = addDays(cursor, computeNextInterval(chapter, i));
        dates.push(cursor);
      }
      // Task #20: cap at 10 entries
      chapter.revisionDates = dates.slice(0, 10);
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
    let q = Math.round((correct / total) * 5);
    unit.chapters.forEach(ch => {
      let ef = ch.difficultyFactor || 2.5;
      ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      ch.difficultyFactor = clamp(ef, 1.3, 3.0);
    });

    qbankEntries.push({ subject: subjectName, unit: unit.name, unitIndex, total, correct });
    anyQbank = true;
  });

  let revBoxes = document.querySelectorAll("#revisionCheckboxList input[type='checkbox']:checked");
  revBoxes.forEach(box => {
    let [subjectName, ui, ci] = box.value.split("|");
    markRevisionDone(subjectName, parseInt(ui), parseInt(ci));
    revisedItems.push({ subjectName, unitIndex: parseInt(ui), chapterIndex: parseInt(ci) });
    anyRevision = true;
  });

  let timeTracking = (typeof swGetTodaySummary === "function") ? swGetTodaySummary() : null;

  studyData.dailyHistory[todayKey] = {
    study: anyStudy,
    qbank: anyQbank,
    revision: anyRevision,
    eveningSubmitted: true,
    studySubject: anyStudy && studyEntries[0] ? studyEntries[0].subject : null,
    studyEntries,
    qbankEntries,
    revisedItems,
    submittedAt: new Date().toISOString(),
    timeTracking
  };

  if (studyData.dailyPlan?.date === todayKey && anyStudy) {
    studyData.dailyPlan.completed = true;
  }

  saveData();
  if (typeof renderSubjects === "function") renderSubjects();
  if (typeof renderEveningUpdate === "function") renderEveningUpdate();
}

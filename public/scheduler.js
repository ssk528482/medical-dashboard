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

  // FC5 — calibrate minsPerCard from actual review history
  let totalCards = 0, totalReviewHrs = 0;
  recentDates.forEach(date => {
    let e = history[date];
    if (!e) return;
    if (e.timeTracking?.cards?.accumulated) totalReviewHrs += e.timeTracking.cards.accumulated / 3600;
    if (e.cardsReviewed) totalCards += e.cardsReviewed;
  });
  if (totalReviewHrs >= 0.5 && totalCards >= 10) {
    let m = (totalReviewHrs * 60) / totalCards;
    if (m >= 0.5 && m <= 5) studyData.reviewMinsPerCard = parseFloat(m.toFixed(2));
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

// ─── Intelligent QBank Planner: 9-signal multi-unit scoring (IQ engine) ────
// Scores every unit across ALL subjects using accuracy, revision alignment,
// EF decay, consolidation window, missed reviews, difficulty, exam proximity,
// remaining question count and early-revision stage weighting.
// Returns an array of { line, qs, subjectName, unitName } for plan rendering.
function _computeSmartQbankPlan(totalQs, qbankSpeed, todayStudySubject) {
  let candidates = [];
  let revDueKeys = new Set(
    getRevisionsDueToday().map(r => `${r.subjectName}||${r.unitIndex}`)
  );
  let recentWindow = Array.from({ length: 7 }, (_, i) => addDays(today(), -i));
  let proximity = examProximityFactor();

  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];
    subject.units.forEach((unit, ui) => {
      let unitQsTotal = unit.questionCount || 0;
      let unitQsDone  = unit.qbankStats?.total || 0;
      let unitQsLeft  = unitQsTotal > 0 ? Math.max(0, unitQsTotal - unitQsDone) : null;
      // Skip if explicitly done AND question bank fully exhausted
      if (unit.qbankDone && unitQsLeft === 0) return;
      // Skip units with no completed chapters — can't do qbank on unread content
      let completedCount = unit.chapters.filter(ch => ch.status === 'completed').length;
      if (completedCount === 0) return;

      let score = 0;
      let tags  = [];

      // ── Signal 1: Accuracy (inverse — lower = higher priority) ─────────
      let acc = unit.qbankStats?.total > 0
        ? (unit.qbankStats.correct / unit.qbankStats.total) * 100 : null;
      if (acc === null) {
        score += 28; tags.push({ t: 'No baseline yet', c: '#8b5cf6' });
      } else if (acc < 50) {
        score += 65; tags.push({ t: `${acc.toFixed(0)}% — critical`, c: '#ef4444' });
      } else if (acc < 65) {
        score += 42; tags.push({ t: `${acc.toFixed(0)}% — weak`, c: '#f97316' });
      } else if (acc < 80) {
        score += 20; tags.push({ t: `${acc.toFixed(0)}% — needs work`, c: '#eab308' });
      } else {
        score += 4;  tags.push({ t: `${acc.toFixed(0)}% ✓`, c: '#10b981' });
      }

      // ── Signal 2: Consolidation window — completed within 7 days ───────
      let recentDone = unit.chapters.filter(ch =>
        ch.status === 'completed' && ch.completedOn && recentWindow.includes(ch.completedOn)
      ).length;
      if (recentDone > 0) {
        score += Math.min(38, recentDone * 11);
        tags.push({ t: `${recentDone} ch this week — consolidate`, c: '#3b82f6' });
      }

      // ── Signal 3: Revision due today — qbank reinforces same content ───
      if (revDueKeys.has(`${subjectName}||${ui}`)) {
        score += 38; tags.push({ t: 'Revision due — reinforce', c: '#a78bfa' });
      }

      // ── Signal 4: Weak EF (< 1.9) = struggling with long-term recall ───
      let lowEF = unit.chapters.filter(ch =>
        ch.status === 'completed' && (ch.difficultyFactor || 2.5) < 1.9
      ).length;
      if (lowEF > 0) {
        score += Math.min(28, lowEF * 7);
        tags.push({ t: `${lowEF} struggling ch`, c: '#f87171' });
      }

      // ── Signal 5: Missed revisions → active recall urgently needed ─────
      let missed = unit.chapters.reduce((s, ch) => s + (ch.missedRevisions || 0), 0);
      if (missed > 0) {
        score += Math.min(32, missed * 6);
        tags.push({ t: `${missed} missed reviews`, c: '#ef4444' });
      }

      // ── Signal 6: Today's primary study subject — same-session boost ───
      if (subjectName === todayStudySubject) {
        score += 18; tags.push({ t: "Today's subject", c: '#10b981' });
      }

      // ── Signal 7: Hard chapters at early revision, scaled by exam proximity
      let hardDone = unit.chapters.filter(ch =>
        ch.difficulty === 'hard' && ch.status === 'completed' && (ch.revisionIndex || 0) < 4
      ).length;
      if (hardDone > 0) {
        score += Math.min(22, hardDone * 4) * (1 + proximity * 0.8);
        tags.push({ t: `${hardDone} hard ch`, c: '#f59e0b' });
      }

      // ── Signal 8: Remaining question proportion ─────────────────────────
      if (unitQsLeft === null) {
        score += 6;
      } else if (unitQsLeft > 0) {
        score += Math.min(14, (unitQsLeft / (unitQsTotal || 1)) * 18);
      }

      // ── Signal 9: Early revision stage (R1/R2) benefits most from qbank ─
      let earlyRev = unit.chapters.filter(ch =>
        ch.status === 'completed' && (ch.revisionIndex || 0) <= 2
      ).length;
      if (earlyRev > 0) score += Math.min(16, earlyRev * 2);

      candidates.push({ subjectName, unit, ui, score, tags, acc, unitQsLeft });
    });
  });

  if (!candidates.length) return [];
  candidates.sort((a, b) => b.score - a.score);

  // Allocate questions to top 4 candidates proportional to their score
  let topN       = Math.min(4, candidates.length);
  let top        = candidates.slice(0, topN);
  let totalScore = top.reduce((s, c) => s + c.score, 0);
  let allocations = [];
  let qLeft = totalQs;

  top.forEach((c, idx) => {
    if (qLeft <= 0) return;
    let rawProp  = totalScore > 0 ? c.score / totalScore : 1 / topN;
    // First unit ≥ 40% of questions; subsequent units have no forced floor
    let prop     = idx === 0 ? Math.max(0.40, rawProp) : rawProp;
    let qForUnit = idx === top.length - 1
      ? qLeft
      : Math.max(5, Math.round(totalQs * prop));
    qForUnit = Math.min(qForUnit, qLeft);
    if (c.unitQsLeft !== null) qForUnit = Math.min(qForUnit, c.unitQsLeft);
    if (qForUnit <= 0) return;

    let accVal  = c.acc;
    let accTag  = accVal !== null
      ? ` <span style="color:${accVal>=75?'#10b981':accVal>=50?'#eab308':'#ef4444'}">${accVal.toFixed(0)}%</span>`
      : ` <span style="color:#8b5cf6">no data</span>`;
    let leftTag = c.unitQsLeft !== null
      ? ` <span style="color:#94a3b8">· ${c.unitQsLeft} left</span>` : "";
    let tagHTML = c.tags.slice(0, 3)
      .map(t => `<span style="font-size:10px;background:${t.c}22;color:${t.c};padding:1px 5px;border-radius:4px;border:1px solid ${t.c}44">${t.t}</span>`)
      .join(" ");

    let line =
      `🧪 <strong>${c.subjectName}</strong> → ${c.unit.name}` +
      ` <span style="color:#94a3b8">~${qForUnit} Qs (${(qForUnit/qbankSpeed).toFixed(1)}h)</span>` +
      accTag + leftTag +
      (tagHTML ? `<div style="margin-top:3px;margin-left:20px">${tagHTML}</div>` : "");

    allocations.push({ line, qs: qForUnit, subjectName: c.subjectName, unitName: c.unit.name });
    qLeft -= qForUnit;
  });

  return allocations;
}

// ─── S1+S6: Difficulty-weighted chapter time estimate ────────────────────
// Hard chapters take ~1.7× longer per page; easy ~0.85×
// Returns effective minutes for this chapter
function _getChapterEffectiveMins(ch, subjectSize, readingSpeed) {
  let diffMult = ch.difficulty === 'hard' ? 1.7 : ch.difficulty === 'easy' ? 0.85 : 1.0;
  if (ch.pageCount > 0) {
    return (ch.pageCount / readingSpeed) * 60 * diffMult;
  }
  let base = { large: 90, medium: 60, small: 45 }[subjectSize] || 60;
  return base * diffMult;
}

// ─── S3: Count revisions due tomorrow ────────────────────────────────────
function _getTomorrowRevisionCount() {
  let tomorrow = addDays(today(), 1);
  let count = 0;
  Object.values(studyData.subjects || {}).forEach(subj => {
    subj.units.forEach(u => u.chapters.forEach(ch => {
      if (ch.nextRevision && ch.nextRevision <= tomorrow) count++;
    }));
  });
  return count;
}

// ─── S4: Momentum — avg completed chapters/day over last 7 logged days ───
function _getMomentumChaptersPerDay() {
  let history = studyData.dailyHistory || {};
  let days = 0, total = 0;
  for (let i = 1; i <= 7; i++) {
    let d = addDays(today(), -i);
    let e = history[d];
    if (!e) continue;
    total += (e.studyEntries || []).reduce((s, se) => s + (se.topics?.length || 0), 0);
    days++;
  }
  return days >= 3 ? total / days : null;
}

// ─── R1–R8: Smart Revision Planner ───────────────────────────────────────
// R1: time-budget fitting   R2: EF-first sort     R3: subject grouping
// R4: qbank-pair advice     R5: depth labels      R6: batch split
// R7: first-recall flag     R8: memory-at-risk badge
function _computeRevisionPlan(revisionDue, revisionMins, todayStudySubject) {
  // R5: depth info — minutes per stage
  const DEPTH = [
    { label: 'First recall',  short: 'R1', color: '#ef4444', mins: 15 },
    { label: 'Consolidation', short: 'R2', color: '#f97316', mins: 10 },
    { label: 'Deep retention',short: 'R3', color: '#eab308', mins:  7 },
    { label: 'Maintenance',   short: 'R4+',color: '#10b981', mins:  4 }
  ];
  function depthOf(revIdx) {
    return revIdx < 3 ? DEPTH[revIdx] : DEPTH[3];
  }

  let yesterday = addDays(today(), -1);

  // R2: sort — EF < 1.8 first, then overdue days, then urgency
  let sorted = [...revisionDue].sort((a, b) => {
    let chA = studyData.subjects[a.subjectName]?.units[a.unitIndex]?.chapters[a.chapterIndex];
    let chB = studyData.subjects[b.subjectName]?.units[b.unitIndex]?.chapters[b.chapterIndex];
    let efA = chA?.difficultyFactor ?? 2.5;
    let efB = chB?.difficultyFactor ?? 2.5;
    let aStr = efA < 1.8 ? 1 : 0, bStr = efB < 1.8 ? 1 : 0;
    if (bStr !== aStr) return bStr - aStr;
    return (b.overdueDays || 0) - (a.overdueDays || 0);
  });

  // R1: fit into time budget (always show at least 1)
  let minsLeft = revisionMins;
  let fitted = [], overflow = [];
  sorted.forEach(r => {
    let ch = studyData.subjects[r.subjectName]?.units[r.unitIndex]?.chapters[r.chapterIndex];
    if (!ch) return;
    let d = depthOf(ch.revisionIndex || 0);
    if (minsLeft >= d.mins || fitted.length === 0) {
      fitted.push({ r, ch, d });
      minsLeft -= d.mins;
    } else {
      overflow.push({ r, ch, d });
    }
  });

  // R3: group fitted items by subject||unitIndex for context-switching reduction
  let groups = {};
  fitted.forEach(item => {
    let key = `${item.r.subjectName}||${item.r.unitIndex}`;
    if (!groups[key]) groups[key] = { sub: item.r.subjectName, ui: item.r.unitIndex, items: [] };
    groups[key].items.push(item);
  });

  let lines = [];

  // R4: qbank pairing recommendation — shown once per unit needing it
  let qbankPairAdvice = new Set();
  fitted.forEach(({ r, ch, d }) => {
    if ((ch.revisionIndex || 0) <= 1) {
      let unit = studyData.subjects[r.subjectName]?.units[r.unitIndex];
      let unitAcc = unit?.qbankStats?.total > 0
        ? (unit.qbankStats.correct / unit.qbankStats.total) * 100 : null;
      if (unitAcc !== null && unitAcc < 60) {
        qbankPairAdvice.add(`${r.subjectName}||${r.unitIndex}`);
      }
    }
  });

  // qbank pairing banner
  if (qbankPairAdvice.size > 0) {
    let pairNames = [...qbankPairAdvice].map(k => {
      let [sn, ui] = k.split('||');
      return `${sn} → ${studyData.subjects[sn]?.units[parseInt(ui)]?.name || 'unit'}`;
    }).join(', ');
    lines.push(
      `<div style="background:#1e1a3a;border:1px solid #6d28d9;border-radius:8px;padding:7px 10px;`+
      `margin-bottom:8px;font-size:11px;color:#c4b5fd;">` +
      `⚡ <strong>Do Qbank FIRST</strong> for: ${pairNames} — active recall before passive review ↑ retention</div>`
    );
  }

  // R6: batch split recommendation
  if (overflow.length > 0) {
    lines.push(
      `<div style="background:#1a1a2e;border:1px solid #334155;border-radius:8px;padding:7px 10px;`+
      `margin-bottom:8px;font-size:11px;color:#94a3b8;">` +
      `📦 <strong>Split suggested:</strong> ${fitted.length} items fit now · ${overflow.length} more for Batch 2 after new study</div>`
    );
  }

  // Render grouped items
  Object.values(groups).forEach(group => {
    // Group header if multiple groups exist
    if (Object.keys(groups).length > 1) {
      let unitName = studyData.subjects[group.sub]?.units[group.ui]?.name || '';
      let sameAsStudy = group.sub === todayStudySubject;
      lines.push(
        `<div style="font-size:11px;font-weight:700;color:${sameAsStudy?'#10b981':'#64748b'};`+
        `margin:8px 0 3px;border-top:1px solid #0f172a;padding-top:6px;">`+
        `${sameAsStudy ? '✦ ' : ''}${group.sub} — ${unitName}</div>`
      );
    }

    group.items.forEach(({ r, ch, d }) => {
      let nextR      = d.short;
      let urgency    = r.urgency || (r.isOverdue ? 'moderate' : 'due');
      let urgColor   = urgency === 'critical' ? '#ef4444' : urgency === 'high' ? '#f97316'
                     : urgency === 'moderate' ? '#eab308' : '#3b82f6';
      let urgBg      = urgency === 'critical' ? '#450a0a' : urgency === 'high' ? '#431407'
                     : urgency === 'moderate' ? '#422006' : '#1e3a5f';
      let overdueTag = r.isOverdue
        ? ` <span style="background:${urgBg};color:${urgColor};font-size:10px;padding:1px 6px;border-radius:4px;font-weight:700;">${r.overdueDays}d overdue</span>` : "";
      let pageTag    = ch.pageCount > 0 ? ` <span style="color:#64748b;font-size:11px;">(${ch.pageCount}p)</span>` : "";
      let diffTag    = ch.difficulty ? ` <span style="font-size:10px;color:${ch.difficulty==='hard'?'#ef4444':ch.difficulty==='easy'?'#10b981':'#64748b'};">${ch.difficulty}</span>` : "";

      // R5: depth label tag
      let depthTag = `<span style="font-size:10px;background:${d.color}22;color:${d.color};padding:1px 6px;border-radius:4px;border:1px solid ${d.color}44;">${d.label} · ~${d.mins}m</span>`;

      // R7: first recall flag — completed yesterday → highest urgency
      let firstRecallTag = '';
      if (ch.completedOn === yesterday && (ch.revisionIndex || 0) === 0) {
        firstRecallTag = ` <span style="background:#1a3a1a;color:#4ade80;font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid #166534;">🆕 First recall</span>`;
      }

      // R8: memory at risk badge — 3+ missed revisions
      let memRiskTag = '';
      if ((ch.missedRevisions || 0) >= 3) {
        let ef = (ch.difficultyFactor || 2.5).toFixed(1);
        memRiskTag = ` <span style="background:#450a0a;color:#fca5a5;font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid #ef444433;">⚠ Memory at risk · EF ${ef}</span>`;
      } else if ((ch.difficultyFactor || 2.5) < 1.8) {
        memRiskTag = ` <span style="background:#3b1515;color:#f87171;font-size:10px;padding:1px 5px;border-radius:4px;">EF low</span>`;
      }

      // Quality-score buttons (unchanged)
      let qualBtns = `<span style="display:inline-flex;gap:3px;margin-left:6px;vertical-align:middle;">` +
        [['1','#450a0a','#fca5a5','✗'],['2','#3b1515','#f87171','△'],['3','#422006','#fb923c','~'],['4','#0f3a1a','#4ade80','✓'],['5','#0f2a3a','#60a5fa','★']]
        .map(([q, bg, fc, lbl]) =>
          `<button onclick="markRevisionDone('${r.subjectName.replace(/'/g,"\\'")}',${r.unitIndex},${r.chapterIndex},${q});this.closest('.rev-row').style.opacity='.35';this.closest('.rev-row').style.pointerEvents='none';"
            style="background:${bg};color:${fc};border:1px solid ${fc}33;border-radius:4px;font-size:10px;padding:2px 5px;cursor:pointer;min-height:unset;line-height:1;" title="Quality ${q}">${lbl}</button>`
        ).join('') + `</span>`;

      let unitName2 = studyData.subjects[r.subjectName].units[r.unitIndex]?.name;
      lines.push(
        `<div class="rev-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px 0;border-bottom:1px solid #0f172a;">` +
        `<span>🔁 <strong>${r.subjectName}</strong> → ${unitName2} → <em>${ch.name}</em></span>` +
        ` <span style="font-size:11px;background:#1e293b;color:#93c5fd;padding:1px 5px;border-radius:4px;">${nextR}</span>` +
        ` ${depthTag}` + pageTag + diffTag + firstRecallTag + memRiskTag + overdueTag + qualBtns +
        ` <span class="rev-meta" data-key="${r.subjectName}||${unitName2}||${ch.name}"></span>` +
        `</div>`
      );
    });
  });

  // Batch 2 summary
  if (overflow.length > 0) {
    let batch2Subjects = [...new Set(overflow.map(x => x.r.subjectName))].join(', ');
    lines.push(
      `<div style="margin-top:6px;padding:6px 10px;background:#0a0f1a;border:1px dashed #334155;border-radius:8px;">` +
      `<span style="font-size:11px;color:#64748b;font-weight:700;">📋 Batch 2 (${overflow.length} items after study):</span> ` +
      `<span style="font-size:11px;color:#475569;">${batch2Subjects}</span></div>`
    );
  }

  if (lines.length === 0) {
    lines.push(`🔁 No revisions due today`);
  }

  return { lines, fittedCount: fitted.length, overflowCount: overflow.length };
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
  if (!hours || hours <= 0) { showToast("Enter valid hours.", 'warn'); return; }

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

  if (!subjectsSorted.length) { showToast("Add subjects first.", 'warn'); return; }

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

  // ── FC4: Reserve flashcard time FROM total (not extra) ───────────────────
  // Use last-session due estimate × calibrated mins/card, capped at 20% of total
  let minsPerCard     = studyData.reviewMinsPerCard || 1.5;
  let fcEstimate      = studyData.fcDueEstimate || 0;
  let cardsMinsReserve = Math.min(
    Math.max(0, Math.round(fcEstimate * minsPerCard)),
    Math.round(adjHours * 0.20 * 60)
  );
  let cardsHrsReserve = parseFloat((cardsMinsReserve / 60).toFixed(1));
  // planHours = budget available for study/qbank/revision after cards are carved out
  let planHours = Math.max(adjHours * 0.5, adjHours - cardsHrsReserve);

  // ── S3: Tomorrow's revision load warning ─────────────────────────────────
  let tomorrowRevCount = _getTomorrowRevisionCount();
  let tomorrowHeavy    = tomorrowRevCount >= 10;
  // Reduce today's study block slightly to avoid double-loading
  let tomorrowWarnHTML = '';
  if (tomorrowHeavy) {
    tomorrowWarnHTML = `<div style="background:#422006;border:1px solid #f97316;border-radius:8px;padding:6px 10px;margin-top:6px;font-size:11px;color:#fed7aa;">📅 Heavy revision day tomorrow (${tomorrowRevCount} due) — study load lightened by 15% today</div>`;
  }

  // ── S4: Momentum hint ────────────────────────────────────────────────────
  let momentum = _getMomentumChaptersPerDay();
  let momentumHint = '';
  if (momentum !== null) {
    momentumHint = `<div style="font-size:11px;color:#475569;margin-top:3px;">📈 Your 7-day avg: ${momentum.toFixed(1)} chapters/day</div>`;
  }

  // ── S5: Interleaving — detect 3+ consecutive days same subject ───────────
  let consecutiveSameDays = 0;
  for (let i = 1; i <= 5; i++) {
    let d = addDays(today(), -i);
    let hist = studyData.dailyHistory?.[d];
    if (!hist) break;
    let subj = hist.studyEntries?.[0]?.subject || hist.studySubject;
    if (subj === topSubject) consecutiveSameDays++;
    else break;
  }
  let shouldInterleave = consecutiveSameDays >= 3 && daysLeft > 60;

  // #7, #8 — dynamic ratios based on exam proximity and due load
  let { studyRatio, qbankRatio, revisionRatio } = _computeDynamicRatios(overdueCount, revisionDue.length);

  // Apply S3 adjustment to study ratio if tomorrow is heavy
  if (tomorrowHeavy) studyRatio = Math.max(0.10, studyRatio * 0.85);

  let studyMins    = Math.round(planHours * studyRatio    * 60);
  let qbankMins    = Math.round(planHours * qbankRatio    * 60);
  let revisionMins = Math.round(planHours * revisionRatio * 60);

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
        <strong>🧪 Qbank:</strong> ${qbTime2} hrs — ${(() => { let iq = _computeSmartQbankPlan(Math.round(parseFloat(qbTime2)*60*(studyData.qbankSpeed||30)), studyData.qbankSpeed||30, topSubject); return iq.length > 0 ? iq.map(a => `<strong>${a.subjectName}</strong> → ${a.unitName} ~${a.qs}Q`).join(', ') : 'intelligent priority order'; })()}
        ${burnoutWarn}${examAlert}
      </div>`;
    studyData.dailyPlan = {
      date: today(), study: { subject: null }, qbank: { subject: topSubject },
      revisionCount: revisionDue.length, overdueCount,
      hours, adjustedHours: parseFloat(adjHours.toFixed(1)),
      studyTime: "0", qbankTime: qbTime2, revisionTime: revTime2,
      burnoutAdj: parseFloat(burnoutAdj.toFixed(3)),
      completed: false, examCountdownMode: true,
      stopwatches: (function() {
        let savedSW = (studyData._savedStopwatches?.date === today()) ? studyData._savedStopwatches : null;
        return {
          study:    { accumulated: savedSW?.study    || 0, startedAt:null, running:false, targetSecs: 0 },
          qbank:    { accumulated: savedSW?.qbank    || 0, startedAt:null, running:false, targetSecs: Math.round(parseFloat(qbTime2)*3600) },
          revision: { accumulated: savedSW?.revision || 0, startedAt:null, running:false, targetSecs: Math.round(parseFloat(revTime2)*3600) },
          cards:    { accumulated: savedSW?.cards    || 0, startedAt:null, running:false, targetSecs: 0 }
        };
      })()
    };
    delete studyData._savedStopwatches;
    saveData();
    document.getElementById("generateButton").disabled = true;
    return;
  }

  // ── SMART STUDY BLOCK ─────────────────────────────────────────
  let readingSpeed = studyData.readingSpeed || 25;
  // S1: difficulty-adjusted budget
  let pagesBudget  = Math.round(studyMins / 60 * readingSpeed);
  let ptr          = subjectObj.pointer || { unit: 0, chapter: 0 };

  // S2: time-of-day cognitive load flag
  let h24 = new Date().getHours();
  let isEveningSession = h24 >= 19;

  // S7: detect mid-chapter carry-forward (chapter-level, not just subject-level)
  let prevPlan = studyData.dailyPlan; // still the OLD plan since we haven't saved yet
  let carryChapterKey = null; // "unitIndex||chapterIndex" → resumeFromPage
  if (carriedForward && prevPlan?.study?.planChapters?.length > 0) {
    let lastEntry = prevPlan.study.planChapters[prevPlan.study.planChapters.length - 1];
    if (lastEntry && lastEntry.pgEnd !== undefined) {
      let prevUnit = subjectObj.units[lastEntry.unitIndex];
      let prevCh   = prevUnit?.chapters[lastEntry.chapterIndex];
      if (prevCh && prevCh.status !== 'completed' && prevCh.endPage && lastEntry.pgEnd < prevCh.endPage) {
        carryChapterKey = `${lastEntry.unitIndex}||${lastEntry.chapterIndex}`;
      }
    }
  }

  let studyLines      = [];
  let timeMinsLeft    = studyMins;
  let pagesLeft       = pagesBudget;
  let chaptersDone    = 0;
  let planChapters    = [];
  let foundStart      = false;
  let timeBudgetExhausted = false;
  let eveningHardFlagged  = false;   // S2: at most one evening warning

  outerLoop:
  for (let ui = 0; ui < subjectObj.units.length; ui++) {
    let unit    = subjectObj.units[ui];
    let ciStart = (ui === ptr.unit && !foundStart) ? ptr.chapter : 0;
    for (let ci = ciStart; ci < unit.chapters.length; ci++) {
      let ch = unit.chapters[ci];
      if (ch.status === "completed") continue;
      foundStart = true;

      // S1: difficulty multiplier
      let diffMult      = ch.difficulty === 'hard' ? 1.7 : ch.difficulty === 'easy' ? 0.85 : 1.0;
      let effectiveSpeed = readingSpeed / diffMult; // pages per hour at this difficulty

      // S2: evening hard-chapter soft-warning (flag but still include)
      let eveningTag = '';
      if (isEveningSession && ch.difficulty === 'hard' && !eveningHardFlagged) {
        eveningTag = ` <span style="font-size:10px;background:#422006;color:#fed7aa;padding:1px 6px;border-radius:4px;">🌆 heavy evening</span>`;
        eveningHardFlagged = true;
      }

      if (ch.pageCount > 0) {
        // S1: use effective speed for time constraint Check
        let minsPerPage  = 60 / effectiveSpeed;
        let maxPagesByTime = timeMinsLeft > 0 ? Math.floor(timeMinsLeft / minsPerPage) : 0;
        if (maxPagesByTime <= 0 && chaptersDone > 0) { timeBudgetExhausted = true; break outerLoop; }

        // S7: resume from mid-chapter carry position if applicable
        let ckKey = `${ui}||${ci}`;
        let resumeFrom = (carryChapterKey === ckKey && prevPlan?.study?.planChapters)
          ? (() => {
              let le = prevPlan.study.planChapters.find(p => p.unitIndex === ui && p.chapterIndex === ci);
              return le?.pgEnd !== undefined ? le.pgEnd + 1 : null;
            })()
          : null;

        let alreadyRead = planChapters
          .filter(p => p.unitIndex === ui && p.chapterIndex === ci)
          .reduce((s, p) => s + (p.pgEnd - p.pgStart + 1), 0);
        let chStart = resumeFrom !== null ? resumeFrom : ch.startPage + alreadyRead;
        let chEnd   = ch.endPage;
        if (chStart > chEnd) continue;

        let pagesToRead = Math.min(maxPagesByTime, pagesLeft, chEnd - chStart + 1);
        if (pagesToRead <= 0) { timeBudgetExhausted = true; break outerLoop; }
        let pgEnd       = chStart + pagesToRead - 1;
        let hrs         = (pagesToRead / effectiveSpeed).toFixed(1); // S1: show actual time
        let phaseLabel  = _getChapterPhaseLabel(ch);

        // S7: resume badge
        let resumeTag = resumeFrom !== null
          ? ` <span style="font-size:10px;background:#1a3a1a;color:#4ade80;padding:1px 5px;border-radius:4px;">↩ Resume</span>` : '';

        studyLines.push(
          `📖 <strong>${topSubject}</strong> → ${unit.name} → <em>${ch.name}</em>` +
          ` <span style="color:#94a3b8;">pg ${chStart}–${pgEnd} (${pagesToRead}p · ${hrs}h)</span>` +
          (phaseLabel ? ` <span style="font-size:11px;background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:4px;">${phaseLabel}</span>` : "") +
          resumeTag + eveningTag
        );
        planChapters.push({ unitIndex: ui, chapterIndex: ci, pgStart: chStart, pgEnd });
        pagesLeft    -= pagesToRead;
        timeMinsLeft -= pagesToRead * minsPerPage; // S1: consume actual time
        chaptersDone++;

        if (pgEnd < chEnd) { timeBudgetExhausted = true; break outerLoop; }
      } else {
        // No-page chapter: use difficulty-weighted estimate
        let chapterHrs  = subjectObj.size === "large" ? 1.5 : subjectObj.size === "medium" ? 1.0 : 0.75;
        chapterHrs      = chapterHrs * diffMult; // S1: weight by difficulty
        let chapterMins = chapterHrs * 60;
        if (timeMinsLeft <= 0 && chaptersDone > 0) { timeBudgetExhausted = true; break outerLoop; }

        let phaseLabel = _getChapterPhaseLabel(ch);
        studyLines.push(
          `📖 <strong>${topSubject}</strong> → ${unit.name} → <em>${ch.name}</em>` +
          ` <span style="color:#94a3b8;">(~${chapterHrs.toFixed(1)}h est.)</span>` +
          (phaseLabel ? ` <span style="font-size:11px;background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:4px;">${phaseLabel}</span>` : "") +
          eveningTag
        );
        planChapters.push({ unitIndex: ui, chapterIndex: ci });
        timeMinsLeft -= chapterMins;
        chaptersDone++;
        if (timeMinsLeft <= 0) { timeBudgetExhausted = true; break outerLoop; }
      }
    }
  }

  // S5: Interleaving injection — after 3+ consecutive days same subject AND exam > 60d
  let interleaveLines = [];
  let interleaveSubject = null;
  if (shouldInterleave && timeMinsLeft > 15) {
    for (let si = 0; si < subjectsSorted.length; si++) {
      let sn = subjectsSorted[si];
      if (sn === topSubject) continue;
      let so = studyData.subjects[sn];
      let sPtr = so.pointer || { unit: 0, chapter: 0 };
      let foundInterleave = false;
      for (let ui = 0; ui < so.units.length && !foundInterleave; ui++) {
        let unit    = so.units[ui];
        let ciStart = ui === sPtr.unit ? sPtr.chapter : 0;
        for (let ci = ciStart; ci < unit.chapters.length && !foundInterleave; ci++) {
          let ch = unit.chapters[ci];
          if (ch.status === 'completed') continue;
          let dm   = ch.difficulty === 'hard' ? 1.7 : ch.difficulty === 'easy' ? 0.85 : 1.0;
          let es   = readingSpeed / dm;
          let pagesToRead = ch.pageCount > 0 ? Math.min(Math.floor(timeMinsLeft / (60 / es)), ch.endPage - ch.startPage + 1) : 0;
          if (ch.pageCount > 0 && pagesToRead > 0) {
            let hrs = (pagesToRead / es).toFixed(1);
            interleaveLines.push(
              `📖 <strong>${sn}</strong> → ${unit.name} → <em>${ch.name}</em>` +
              ` <span style="color:#94a3b8;">pg ${ch.startPage}–${ch.startPage+pagesToRead-1} (${pagesToRead}p · ${hrs}h)</span>`
            );
          } else if (ch.pageCount === 0) {
            let chrs = (so.size === 'large' ? 1.5 : so.size === 'medium' ? 1.0 : 0.75) * dm;
            interleaveLines.push(
              `📖 <strong>${sn}</strong> → ${unit.name} → <em>${ch.name}</em>` +
              ` <span style="color:#94a3b8;">(~${chrs.toFixed(1)}h est.)</span>`
            );
          }
          interleaveSubject = sn;
          foundInterleave = true;
        }
      }
      if (foundInterleave) break;
    }
  }

  // #11 — if primary chapters exhausted before budget ran out, fill with next subject
  let secondarySubject = null;
  let secondaryLines   = [];
  if (!timeBudgetExhausted && !shouldInterleave && (pagesLeft > 5 || timeMinsLeft > 10)) {
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
          let dm  = ch.difficulty === 'hard' ? 1.7 : ch.difficulty === 'easy' ? 0.85 : 1.0;
          let es  = readingSpeed / dm;
          if (ch.pageCount > 0) {
            if (sPagesLeft <= 0) break secLoop;
            let pages = Math.min(Math.floor(sTimeMins / (60 / es)), sPagesLeft, ch.endPage - ch.startPage + 1);
            if (pages <= 0) break secLoop;
            let hrs   = (pages / es).toFixed(1);
            secondaryLines.push(
              `📖 <strong>${sn}</strong> → ${unit.name} → <em>${ch.name}</em>` +
              ` <span style="color:#94a3b8;">pg ${ch.startPage}–${ch.startPage+pages-1} (${pages}p · ${hrs}h)</span>`
            );
            sPagesLeft -= pages;
            sTimeMins  -= pages * (60 / es);
          } else {
            let chHrs = (so.size === "large" ? 1.5 : so.size === "medium" ? 1.0 : 0.75) * dm;
            if (sTimeMins <= 0) break secLoop;
            secondaryLines.push(
              `📖 <strong>${sn}</strong> → ${unit.name} → <em>${ch.name}</em>` +
              ` <span style="color:#94a3b8;">(~${chHrs.toFixed(1)}h est.)</span>`
            );
            sTimeMins -= chHrs * 60;
            sPagesLeft -= chHrs * readingSpeed;
          }
        }
      }
      break;
    }
  }

  if (studyLines.length === 0 && secondaryLines.length === 0 && interleaveLines.length === 0) {
    studyLines.push(`📖 <strong>${topSubject}</strong> — All chapters completed 🎉`);
  }

  // ── INTELLIGENT QBANK BLOCK (IQ engine) ──────────────────────────────────
  // Uses 9 signals: accuracy, consolidation window, revision alignment, EF decay,
  // missed reviews, today's subject boost, hard chapters × exam proximity,
  // remaining question proportion, and early-revision stage weighting.
  let qbankSpeed    = studyData.qbankSpeed || 30;
  let qTotal        = Math.round(qbankMins / 60 * qbankSpeed);
  let iqAllocations = _computeSmartQbankPlan(qTotal, qbankSpeed, topSubject);

  // Primary subject for backward-compatible save (top-scored unit's subject)
  let qSubject   = iqAllocations.length > 0 ? iqAllocations[0].subjectName : topSubject;
  let qbankLines = iqAllocations.map(a => a.line);
  if (qbankLines.length === 0) {
    qbankLines.push(`🧪 <span style="color:#94a3b8">~${qTotal} questions (${qbankTime}h) — add qbank data to enable smart selection</span>`);
  }

  // ── INTELLIGENT REVISION BLOCK (R1–R8) ──────────────────────────────────
  let revPlan      = _computeRevisionPlan(revisionDue, revisionMins, topSubject);
  let revisionHtml = revPlan.lines.map(l => `<div style="margin-bottom:4px;line-height:1.5;">${l}</div>`).join("");
  // ── RENDER ────────────────────────────────────────────────────
  // #20 — carry-forward / pinned badge
  let carryTag = carriedForward
    ? `<span style="font-size:11px;background:#1a3a1a;color:#4ade80;border:1px solid #166534;padding:1px 7px;border-radius:10px;margin-left:6px;">⏩ Continued from yesterday</span>` : "";
  if (pinnedSubject) carryTag = `<span style="font-size:11px;background:#1e3a5f;color:#93c5fd;border:1px solid #2a4f80;padding:1px 7px;border-radius:10px;margin-left:6px;">📌 Pinned</span>`;

  // #15 — secondary subject continuation label
  let secondaryHtml = secondaryLines.length > 0
    ? `<div style="font-size:11px;color:#f59e0b;margin:6px 0 3px;font-weight:700;border-top:1px solid #1e293b;padding-top:6px;">⏩ Continuing with ${secondarySubject}:</div>` +
      secondaryLines.map(l => `<div style="margin-bottom:6px;line-height:1.5;">${l}</div>`).join("") : "";

  // S5: interleaving html
  let interleaveHtml = interleaveLines.length > 0
    ? `<div style="margin:6px 0 3px;padding:5px 10px;background:#1a1a2e;border:1px solid #4f46e5;border-radius:8px;">` +
      `<div style="font-size:11px;color:#a5b4fc;font-weight:700;margin-bottom:3px;">🔀 Interleave — ${interleaveSubject}` +
      ` <span style="font-weight:400;color:#6366f1;">${consecutiveSameDays}d streak on ${topSubject} → inserting 1 chapter from different subject</span></div>` +
      interleaveLines.map(l => `<div style="line-height:1.5;">${l}</div>`).join("") + `</div>` : "";

  let studyHtml = studyLines.map(l => `<div style="margin-bottom:6px;line-height:1.5;">${l}</div>`).join("") + secondaryHtml + interleaveHtml;
  let qbankHtml = qbankLines.map(l => `<div style="margin-bottom:4px;line-height:1.5;">${l}</div>`).join("");

  // #14 — recommended session order (R6-batch-aware, flashcards AFTER revision)
  let orderItems = revisionDue.length > 0
    ? (revPlan.overflowCount > 0
        ? ["🔁 Revision Batch 1", "🃏 Flashcards", "📖 New study", "🧪 Qbank", "🔁 Revision Batch 2"]
        : ["🔁 Revision (memory first)", "🃏 Flashcards", "📖 New study", "🧪 Qbank"])
    : ["🃏 Flashcards", "📖 New study", "🧪 Qbank"];

  // #17 — Pomodoro session suggestion
  let totalBlocks25 = Math.ceil((adjHours * 60) / 30);

  // FC4: reserved cards label in summary
  let cardsLabel = cardsHrsReserve > 0
    ? `<span style="font-size:12px;color:#f59e0b;" id="plan-card-summary">🃏 ~${cardsHrsReserve}h</span>`
    : `<span style="font-size:12px;color:#475569;" id="plan-card-summary">🃏 …</span>`;

  // S4 momentum + S3 tomorrow warning hints
  let contextHints = [momentumHint, tomorrowWarnHTML].filter(Boolean).join('');

  let revisionHeader = revisionDue.length === 0
    ? `🔁 REVISION — nothing due today`
    : `🔁 REVISION — ${revisionTime} hrs · ${revPlan.fittedCount} of ${revisionDue.length} fit${overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}${revPlan.overflowCount > 0 ? ` · ${revPlan.overflowCount} → Batch 2` : ""}`;

  // #19 — Plan summary header bar (FC4: cards included in total)
  let summaryBar = `
    <div style="background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #334155;
      border-radius:10px;padding:10px 14px;margin-bottom:10px;display:flex;
      align-items:center;gap:10px;flex-wrap:wrap;">
      <span style="font-size:13px;font-weight:800;color:#f1f5f9;">⏱ ${adjHours.toFixed(1)}h</span>
      <span style="font-size:12px;color:#3b82f6;">📖 ${studyTime}h</span>
      <span style="font-size:12px;color:#10b981;">🧪 ${qbankTime}h</span>
      <span style="font-size:12px;color:#8b5cf6;">🔁 ${revisionTime}h</span>
      ${cardsLabel}
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
      ${contextHints}
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
        ${revisionHeader}
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
    qbank: {
      subject: qSubject,
      iqAllocations: iqAllocations.map(a => ({ subjectName: a.subjectName, unitName: a.unitName, qs: a.qs }))
    },
    revisionCount: revisionDue.length, overdueCount,
    hours, adjustedHours: parseFloat(adjHours.toFixed(1)),
    studyTime, qbankTime, revisionTime,
    cardsHrsReserve: parseFloat(cardsHrsReserve.toFixed(1)),
    burnoutAdj: parseFloat(burnoutAdj.toFixed(3)),
    carriedForward, pinnedSubject: pinnedSubject || null,
    completed: false,
    renderedHTML: _planHTML,
    stopwatches: (function() {
      // Restore any accumulated time saved before a same-day plan reset
      let savedSW = (studyData._savedStopwatches?.date === today()) ? studyData._savedStopwatches : null;
      return {
        study:    { accumulated: savedSW?.study    || 0, startedAt:null, running:false, targetSecs: Math.round(parseFloat(studyTime)*3600) },
        qbank:    { accumulated: savedSW?.qbank    || 0, startedAt:null, running:false, targetSecs: Math.round(parseFloat(qbankTime)*3600) },
        revision: { accumulated: savedSW?.revision || 0, startedAt:null, running:false, targetSecs: Math.round(parseFloat(revisionTime)*3600) },
        cards:    { accumulated: savedSW?.cards    || 0, startedAt:null, running:false, targetSecs: Math.round(cardsHrsReserve*3600) }
      };
    })()
  };

  delete studyData._savedStopwatches; // clean up after restore
  saveData();
  checkHoursChange(); // sync regen button after fresh plan is saved

  if (typeof swInject === "function") {
    swInject("study",    parseFloat(studyTime));
    swInject("qbank",    parseFloat(qbankTime));
    swInject("revision", parseFloat(revisionTime));
  }

  document.getElementById("generateButton").disabled = true;
  _appendFlashcardsPlanBlock();
  _enrichRevisionBlock();
}

// ─── Flashcards Due block — FC1–FC5 smart version ────────────────────────
// FC1: per-subject breakdown  FC2: same-session subject first
// FC3: split warning if >60   FC4: cards from total hours (not extra)
// FC5: calibrated minsPerCard from history
async function _appendFlashcardsPlanBlock() {
  let planEl = document.getElementById("planOutput");
  if (!planEl) return;
  if (typeof getDueCardCount !== "function") return;

  // Remove stale block if re-appending
  let old = document.getElementById("fc-plan-block");
  if (old) old.remove();

  try {
    let dueCount = await getDueCardCount();

    // FC5: use calibrated minsPerCard
    let minsPerCard = studyData.reviewMinsPerCard || 1.5;
    let estMins     = Math.max(5, Math.round(dueCount * minsPerCard));
    let estHrs      = parseFloat((estMins / 60).toFixed(1));

    // Store fcDueEstimate for next session's FC4 card-time reservation
    studyData.fcDueEstimate = dueCount;
    saveData();

    // FC4: Update summary bar — reflect actual cards time as part of total
    let summaryCardEl = document.getElementById('plan-card-summary');
    if (summaryCardEl) {
      if (dueCount === 0) {
        summaryCardEl.textContent = '🃏 none due';
        summaryCardEl.style.color = '#10b981';
      } else {
        summaryCardEl.textContent = `🃏 ${estHrs}h (${dueCount})`;
        summaryCardEl.style.color = '#f59e0b';
      }
      // Also update the cards stopwatch target with actual time
      if (studyData.dailyPlan?.stopwatches?.cards) {
        studyData.dailyPlan.stopwatches.cards.targetSecs = Math.round(estHrs * 3600);
        saveData();
      }
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
      let urgencyColor = dueCount >= 50 ? "#ef4444" : dueCount >= 20 ? "#f59e0b" : "#3b82f6";
      let urgencyLabel = dueCount >= 50 ? "High priority" : dueCount >= 20 ? "Moderate" : "On track";

      // FC3: split recommendation if > 60
      let splitHtml = '';
      if (dueCount > 60) {
        splitHtml = `<div style="background:#422006;border:1px solid #f97316;border-radius:6px;padding:5px 9px;margin-top:6px;font-size:11px;color:#fed7aa;">` +
          `⚡ ${dueCount} cards — <strong>split session:</strong> ~30 before study, rest after new study</div>`;
      }

      // FC1+FC2: per-subject breakdown with same-session subject first
      let subjectBreakdownHtml = '';
      let todaySubject = studyData.dailyPlan?.study?.subject || null;
      try {
        let cardResult = typeof getCardCounts === "function" ? await getCardCounts() : null;
        let cardMap    = cardResult?.data || {};

        // Aggregate by subject
        let subjTotals = {};
        Object.entries(cardMap).forEach(([key, val]) => {
          let sn = key.split('||')[0];
          if (!subjTotals[sn]) subjTotals[sn] = { total: 0, due: 0 };
          subjTotals[sn].total += val.total || 0;
          subjTotals[sn].due   += val.due   || 0;
        });

        // FC2: sort — same-session subject first, then by due count desc
        let subjEntries = Object.entries(subjTotals)
          .filter(([, v]) => v.due > 0)
          .sort((a, b) => {
            let aFirst = a[0] === todaySubject ? 1 : 0;
            let bFirst = b[0] === todaySubject ? 1 : 0;
            if (bFirst !== aFirst) return bFirst - aFirst;
            return b[1].due - a[1].due;
          });

        if (subjEntries.length > 0) {
          subjectBreakdownHtml = `<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:5px;">` +
            subjEntries.map(([sn, v]) => {
              let sameSession = sn === todaySubject;
              let bg  = sameSession ? '#0f2a1a' : '#0a1628';
              let bdr = sameSession ? '#16a34a' : '#1e293b';
              let clr = sameSession ? '#4ade80' : '#93c5fd';
              let lbl = sameSession ? `🔥 ${sn}` : sn;
              let mins = Math.round(v.due * minsPerCard);
              return `<span style="background:${bg};border:1px solid ${bdr};color:${clr};` +
                `font-size:11px;padding:3px 9px;border-radius:8px;">${lbl}: ${v.due} due (~${mins}m)</span>`;
            }).join('') +
          `</div>`;

          // FC2: same-session label
          if (todaySubject && subjTotals[todaySubject]?.due > 0) {
            subjectBreakdownHtml += `<div style="font-size:11px;color:#16a34a;margin-top:5px;">🔥 <strong>${todaySubject} cards first</strong> — same-session consolidation ↑ retention</div>`;
          }
        }
      } catch (_) { /* subject breakdown is optional */ }

      block.innerHTML = `
        <div style="background:#0f172a;border-radius:10px 10px 0 0;padding:10px;
          border:1px solid #1e293b;border-bottom:none;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;
            letter-spacing:.06em;margin-bottom:6px;">
            🃏 FLASHCARDS — ~${estHrs} hrs · ${dueCount} due
            <span style="font-weight:400;color:#475569;font-size:10px;margin-left:6px;">(included in today's total)</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="flex:1;">
              <span style="font-size:22px;font-weight:900;color:${urgencyColor};">${dueCount}</span>
              <span style="font-size:13px;color:#94a3b8;margin-left:6px;">cards due today</span>
            </div>
            <span style="background:${urgencyColor}22;color:${urgencyColor};
              padding:3px 10px;border-radius:8px;font-size:11px;font-weight:700;">${urgencyLabel}</span>
          </div>
          ${subjectBreakdownHtml}
          ${splitHtml}
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

    // Inject cards stopwatch (only when cards are due)
    if (dueCount > 0 && typeof swInject === "function") {
      if (studyData.dailyPlan?.stopwatches) {
        if (!studyData.dailyPlan.stopwatches.cards) {
          studyData.dailyPlan.stopwatches.cards = {
            accumulated: 0, startedAt: null, running: false,
            targetSecs: Math.round(estHrs * 3600)
          };
          saveData();
        }
      }
      swInject("cards", estHrs);
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

// ── Capture real elapsed stopwatch times (running or paused) ────
function _captureStopwatches() {
  // swElapsed() returns accumulated + live running delta, so it's correct
  // whether the timer is currently ticking or paused.
  return {
    date:     today(),
    study:    (typeof swElapsed === 'function' ? swElapsed('study')    : 0),
    qbank:    (typeof swElapsed === 'function' ? swElapsed('qbank')    : 0),
    revision: (typeof swElapsed === 'function' ? swElapsed('revision') : 0),
    cards:    (typeof swElapsed === 'function' ? swElapsed('cards')    : 0)
  };
}

// ── Reset confirmation popup ─────────────────────────────────────
function confirmResetPlan() {
  let plan = studyData.dailyPlan;
  let sw   = plan?.stopwatches;
  let fmtH = s => s > 0 ? (s/3600).toFixed(1)+'h' : '—';

  let keepHTML = '';
  if (sw) {
    // Use swElapsed so running timers are read correctly
    let sAcc = (typeof swElapsed === 'function' ? swElapsed('study')    : sw.study?.accumulated    || 0);
    let qAcc = (typeof swElapsed === 'function' ? swElapsed('qbank')    : sw.qbank?.accumulated    || 0);
    let rAcc = (typeof swElapsed === 'function' ? swElapsed('revision') : sw.revision?.accumulated || 0);
    let cAcc = (typeof swElapsed === 'function' ? swElapsed('cards')    : sw.cards?.accumulated    || 0);
    let totalSecs = sAcc + qAcc + rAcc + cAcc;
    keepHTML =
      `<div style="background:rgba(16,185,129,0.09);border:1px solid rgba(16,185,129,0.28);
         border-radius:8px;padding:8px 12px;margin:10px 0 6px;font-size:12px;">
         <div style="font-weight:700;color:#10b981;margin-bottom:5px;">⏱ Stopwatch times preserved:</div>
         <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 14px;">
           <span style="color:var(--text-muted);">📖 Study</span>
           <span style="font-weight:700;color:var(--text);">${fmtH(sAcc)}</span>
           <span style="color:var(--text-muted);">🧪 QBank</span>
           <span style="font-weight:700;color:var(--text);">${fmtH(qAcc)}</span>
           <span style="color:var(--text-muted);">🔁 Revision</span>
           <span style="font-weight:700;color:var(--text);">${fmtH(rAcc)}</span>
           <span style="color:var(--text-muted);">🃏 Cards</span>
           <span style="font-weight:700;color:var(--text);">${fmtH(cAcc)}</span>
         </div>
         ${totalSecs > 0 ? `<div style="margin-top:5px;font-size:11px;color:var(--text-dim);">Total tracked today: ${(totalSecs/3600).toFixed(1)}h — will auto-restore on next generate.</div>` : ''}
       </div>
       <div style="font-size:12px;color:var(--text-dim);line-height:1.6;">
         ✖ The scheduled chapter list will be wiped.<br>
         ✔ Your evening log &amp; daily history are unaffected.
       </div>`;
  }

  showConfirm(
    'Reset Today\'s Plan?',
    'The plan will be cleared so you can regenerate it with new hours or syllabus changes.' + keepHTML,
    resetTodayPlan,
    'Reset & Preserve Times',
    true
  );
}

// ── Regenerate with new hours (preserves stopwatches) ────────────
function regeneratePlan() {
  let plan = studyData.dailyPlan;
  if (plan?.date === today()) {
    // Capture BEFORE deleting the plan (swElapsed reads from dailyPlan)
    studyData._savedStopwatches = _captureStopwatches();
    // Pause any running timer so startedAt doesn't linger
    if (plan.stopwatches) {
      ['study','qbank','revision','cards'].forEach(k => {
        let s = plan.stopwatches[k];
        if (s?.running) { s.accumulated = studyData._savedStopwatches[k]; s.running = false; s.startedAt = null; }
      });
    }
    delete studyData.dailyPlan;
    saveData();
  }
  let regenBtn = document.getElementById('regenButton');
  if (regenBtn) regenBtn.style.display = 'none';
  document.getElementById('generateButton').disabled = false;
  generatePlan();
}

// ── Show/hide Regenerate button based on hours change ────────────
function checkHoursChange() {
  let plan    = studyData?.dailyPlan;
  let regenBtn = document.getElementById('regenButton');
  if (!regenBtn) return;

  if (!plan || plan.date !== today()) {
    regenBtn.style.display = 'none';
    return;
  }

  let newVal    = parseFloat(document.getElementById('dailyHours')?.value);
  let savedHrs  = plan.hours;
  if (!newVal || !savedHrs || newVal === savedHrs) {
    regenBtn.style.display = 'none';
  } else {
    let diff = (newVal - savedHrs).toFixed(1);
    let sign = diff > 0 ? '+' : '';
    regenBtn.textContent  = `↺ Regen ${newVal}h (${sign}${diff}h)`;
    regenBtn.style.display = '';
  }
}

function resetTodayPlan() {
  if (studyData.dailyPlan?.date === today()) {
    // Capture real elapsed time (swElapsed handles running timers correctly)
    studyData._savedStopwatches = _captureStopwatches();
    delete studyData.dailyPlan;
  }
  saveData();
  document.getElementById('planOutput').innerHTML = '';
  document.getElementById('generateButton').disabled = false;
  let regenBtn = document.getElementById('regenButton');
  if (regenBtn) regenBtn.style.display = 'none';
  showToast('Today\'s plan reset. Stopwatch times preserved.', 'info');
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

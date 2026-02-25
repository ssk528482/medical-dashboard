// ─── Adaptive Revision Engine v2 (SM-2 + difficulty-aware + exam compression) ────
//
// Per-difficulty base intervals (days):
//   easy   → generous spacing, long retention assumed
//   medium → standard SM-2-like spacing
//   hard   → tight spacing, frequent repetition needed
//
// After all scheduled revisions complete, a maintenance review is added
// at (90 × compressionFactor) days so nothing ever fully "expires".

const DIFF_INTERVALS = {
  easy:   [5, 12, 25, 55, 90],
  medium: [3,  7, 14, 30, 60],
  hard:   [1,  4, 10, 21, 45],
};

// Normalised intervals for backward-compat fallback (no difficulty set)
const BASE_INTERVALS = DIFF_INTERVALS.medium;

function computeNextInterval(chapter, revIndex) {
  let diff      = chapter.difficulty || 'medium';
  let table     = DIFF_INTERVALS[diff] || DIFF_INTERVALS.medium;
  // Beyond the table: extend geometrically (×1.6 each step)
  let base      = revIndex < table.length
    ? table[revIndex]
    : Math.round(table[table.length - 1] * Math.pow(1.6, revIndex - table.length + 1));

  let ef        = chapter.difficultyFactor || 2.5;
  // ef/2.5 = normalized: 1.0 at default, >1 for easy retention, <1 for hard
  let efMult    = ef / 2.5;

  let proximity = examProximityFactor();                    // 0 (far) → 1 (exam day)
  // Compression: at 0 proximity = no compression, at 1 = max 70% compression
  let compressionFactor = Math.max(0.30, 1 - proximity * 0.70);

  // Penalty for repeated missed revisions (each miss shaves up to 10%, max 45%)
  let penalty   = 1 - Math.min(0.45, (chapter.missedRevisions || 0) * 0.10);

  return Math.max(1, Math.round(base * efMult * compressionFactor * penalty));
}

// Mark the pointer's chapter as complete and schedule revisions
function completeTopic(subjectName) {
  let subject = studyData.subjects[subjectName];
  let ptr = subject.pointer || { unit: 0, chapter: 0 };
  let unit = subject.units[ptr.unit];
  if (!unit) return;
  let chapter = unit.chapters[ptr.chapter];
  if (!chapter) return;

  chapter.status        = "completed";
  chapter.completedOn    = today();
  chapter.lastReviewedOn = today();
  chapter.missedRevisions = 0;
  // Initialise difficultyFactor based on declared difficulty if not already set
  if (!chapter.difficultyFactor) {
    chapter.difficultyFactor = chapter.difficulty === 'easy' ? 3.0
                             : chapter.difficulty === 'hard' ? 1.8
                             : 2.5;
  }

  let diff  = chapter.difficulty || 'medium';
  let table = DIFF_INTERVALS[diff] || DIFF_INTERVALS.medium;

  let dates = [], cursor = today();
  for (let i = 0; i < table.length; i++) {
    cursor = addDays(cursor, computeNextInterval(chapter, i));
    dates.push(cursor);
  }
  // Maintenance review: after all scheduled revisions, schedule one final
  // consolidation check at ~90 compressed days so nothing ever goes stale.
  chapter.revisionDates  = dates;
  chapter.revisionIndex  = 0;
  chapter.nextRevision   = dates[0];

  fixPointer(subjectName);
  saveData();
}

// Called with unit + chapter indices
// qualityScore: 1=blackout, 2=wrong, 3=hard, 4=good, 5=easy
function markRevisionDone(subjectName, unitIndex, chapterIndex, qualityScore) {
  let chapter = studyData.subjects[subjectName]?.units[unitIndex]?.chapters[chapterIndex];
  if (!chapter || !chapter.revisionDates?.length) return;

  let q  = qualityScore !== undefined ? qualityScore : 4;
  let ef = chapter.difficultyFactor || 2.5;

  // SM-2 EF update: good recall increases EF (easier future spacing),
  // poor recall decreases it (tighter spacing required).
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  chapter.difficultyFactor = clamp(ef, 1.3, 3.2);

  // Missed-revision tracking
  if (chapter.nextRevision && chapter.nextRevision < addDays(today(), -1)) {
    chapter.missedRevisions = (chapter.missedRevisions || 0) + 1;
  } else {
    chapter.missedRevisions = Math.max(0, (chapter.missedRevisions || 0) - 1);
  }

  chapter.lastReviewedOn = today();

  // ── Quality-aware step: poor recall → replay sooner ───────────────────
  if (q <= 2) {
    // Blackout / wrong answer: step back one revision level, schedule soon
    chapter.revisionIndex = Math.max(0, chapter.revisionIndex - 1);
    let resetDays = chapter.difficulty === 'hard' ? 1 : 2;
    chapter.nextRevision = addDays(today(), resetDays);
    chapter.revisionDates[chapter.revisionIndex] = chapter.nextRevision;
    saveData();
    return;
  }

  chapter.revisionIndex++;

  let diff  = chapter.difficulty || 'medium';
  let table = DIFF_INTERVALS[diff] || DIFF_INTERVALS.medium;

  if (chapter.revisionIndex < table.length) {
    // Normal scheduled revision — recalculate with updated EF
    let interval = computeNextInterval(chapter, chapter.revisionIndex);
    chapter.nextRevision = addDays(today(), interval);
    chapter.revisionDates[chapter.revisionIndex] = chapter.nextRevision;
  } else {
    // All scheduled revisions done — add maintenance review.
    // Far from exam → 90-day maintenance. Near exam → 14-day high-frequency.
    let proximity   = examProximityFactor();
    let maintDays   = Math.max(14, Math.round(90 * Math.max(0.15, 1 - proximity * 0.85)));
    chapter.nextRevision = addDays(today(), maintDays);
    // Keep extending revisionDates array for history
    chapter.revisionDates.push(chapter.nextRevision);
  }

  saveData();
}

function getRevisionsDueToday() {
  let due = [];
  Object.keys(studyData.subjects).forEach(subjectName => {
    studyData.subjects[subjectName].units.forEach((unit, ui) => {
      unit.chapters.forEach((ch, ci) => {
        if (ch.nextRevision && ch.nextRevision <= today()) {
          let overdueDays = daysBetween(ch.nextRevision, today());
          // Grace-period: 1 day past due date is still "due today", not "overdue".
          // This prevents the flood of red badges from a single missed day.
          due.push({
            subjectName,
            unitIndex: ui,
            chapterIndex: ci,
            unitName: unit.name,
            topicName: ch.name,
            overdueDays,
            isOverdue: overdueDays > 1,          // >1 day late = truly overdue
            urgency: overdueDays > 7 ? 'critical'
                   : overdueDays > 3 ? 'high'
                   : overdueDays > 1 ? 'moderate'
                   : 'due',
            // Card + note metadata — populated async by enrichRevisionsDue()
            cardCount: null,
            cardsDue: null,
            hasNote: null
          });
        }
      });
    });
  });
  // Sort: most overdue first, then by difficulty (hard first within same overdue days)
  return due.sort((a, b) => {
    if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
    let diffRank = { hard: 0, medium: 1, easy: 2 };
    let aCh = studyData.subjects[a.subjectName]?.units[a.unitIndex]?.chapters[a.chapterIndex];
    let bCh = studyData.subjects[b.subjectName]?.units[b.unitIndex]?.chapters[b.chapterIndex];
    return (diffRank[aCh?.difficulty] ?? 1) - (diffRank[bCh?.difficulty] ?? 1);
  });
}

// Async version: enriches revision items with live card counts + note flags
// Callers that can await should use this for richer planner display
async function getRevisionsDueTodayEnriched() {
  let due = getRevisionsDueToday();
  if (!due.length) return due;

  try {
    // Fetch card counts map and notes coverage map in parallel
    let [cardResult, noteResult] = await Promise.all([
      typeof getCardCounts === "function" ? getCardCounts() : Promise.resolve({ data: {} }),
      typeof getNotesCoverageMap === "function" ? getNotesCoverageMap() : Promise.resolve({ data: {} })
    ]);

    let cardMap = cardResult?.data || {};
    let noteMap = noteResult?.data || {};

    due.forEach(item => {
      let key = `${item.subjectName}||${studyData.subjects[item.subjectName]?.units[item.unitIndex]?.name}||${item.topicName}`;
      let cardData = cardMap[key];
      item.cardCount = cardData?.total ?? 0;
      item.cardsDue  = cardData?.due   ?? 0;
      item.hasNote   = noteMap[key]    ?? false;
    });
  } catch (e) {
    // Non-fatal: enrichment failed, plain revision data still returned
    console.warn("getRevisionsDueTodayEnriched:", e);
  }

  return due;
}

function getOverdueCount(subjectName) {
  // Consistent with getRevisionsDueToday: grace period of 1 day,
  // so "overdue" means more than 1 day past the scheduled revision date.
  let count = 0;
  let graceDate = addDays(today(), -1);
  studyData.subjects[subjectName].units.forEach(unit => {
    unit.chapters.forEach(ch => {
      if (ch.nextRevision && ch.nextRevision < graceDate) count++;
    });
  });
  return count;
}

function detectPhaseStatus(subjectName) {
  let subject = studyData.subjects[subjectName];
  let total = 0, completed = 0, rev1 = 0, rev2 = 0, rev3 = 0;
  subject.units.forEach(unit => {
    unit.chapters.forEach(ch => {
      total++;
      if (ch.status === "completed")  completed++;
      if (ch.revisionIndex >= 1)      rev1++;
      if (ch.revisionIndex >= 2)      rev2++;
      if (ch.revisionIndex >= 3)      rev3++;
    });
  });
  if (total === 0) return { completed: false, r1: false, r2: false, r3: false, phase1: false, phase2: false, phase3: false };
  return {
    completed: completed === total,
    r1:        rev1 === total,
    r2:        rev2 === total,
    r3:        rev3 === total,
    // legacy aliases
    phase1:    completed === total,
    phase2:    rev1 === total,
    phase3:    rev2 === total,
  };
}

function getCriticalSubjects() {
  return Object.keys(studyData.subjects).filter(n => getOverdueCount(n) >= 3);
}

function topicRetentionEstimate(chapter) {
  if (!chapter.lastReviewedOn) return 0;
  let daysSince = daysBetween(chapter.lastReviewedOn, today());
  let ef = chapter.difficultyFactor || 2.5;
  return Math.max(0, Math.min(100, Math.exp(-daysSince / (ef * 10)) * 100));
}

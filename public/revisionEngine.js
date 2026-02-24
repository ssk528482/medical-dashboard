// ─── Adaptive Revision Engine (SM-2 + exam compression) ──────

const BASE_INTERVALS = [1, 3, 7, 21, 45];

function computeNextInterval(chapter, revIndex) {
  let base = BASE_INTERVALS[revIndex] || 60;
  let ef = chapter.difficultyFactor || 2.5;
  let proximity = examProximityFactor();
  let compressionFactor = Math.max(0.3, 1 - proximity * 0.5);
  let penalty = 1 - Math.min(0.4, (chapter.missedRevisions || 0) * 0.1);
  return Math.max(1, Math.round(base * ef * compressionFactor * penalty / 2.5));
}

// Mark the pointer's chapter as complete and schedule revisions
function completeTopic(subjectName) {
  let subject = studyData.subjects[subjectName];
  let ptr = subject.pointer || { unit: 0, chapter: 0 };
  let unit = subject.units[ptr.unit];
  if (!unit) return;
  let chapter = unit.chapters[ptr.chapter];
  if (!chapter) return;

  chapter.status = "completed";
  chapter.completedOn = today();
  chapter.lastReviewedOn = today();

  let dates = [], cursor = today();
  for (let i = 0; i < BASE_INTERVALS.length; i++) {
    cursor = addDays(cursor, computeNextInterval(chapter, i));
    dates.push(cursor);
  }
  chapter.revisionDates = dates;
  chapter.revisionIndex = 0;
  chapter.nextRevision = dates[0];
  chapter.missedRevisions = 0;

  fixPointer(subjectName);
  saveData();
}

// Called with unit + chapter indices
function markRevisionDone(subjectName, unitIndex, chapterIndex, qualityScore) {
  let chapter = studyData.subjects[subjectName]?.units[unitIndex]?.chapters[chapterIndex];
  if (!chapter || !chapter.revisionDates?.length) return;

  let q = qualityScore !== undefined ? qualityScore : 4;
  let ef = chapter.difficultyFactor || 2.5;
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  chapter.difficultyFactor = clamp(ef, 1.3, 3.0);

  if (chapter.nextRevision && chapter.nextRevision < today()) {
    chapter.missedRevisions = (chapter.missedRevisions || 0) + 1;
  } else {
    chapter.missedRevisions = Math.max(0, (chapter.missedRevisions || 0) - 1);
  }

  chapter.lastReviewedOn = today();
  chapter.revisionIndex++;

  if (chapter.revisionIndex < chapter.revisionDates.length) {
    let interval = computeNextInterval(chapter, chapter.revisionIndex);
    chapter.nextRevision = addDays(today(), interval);
    chapter.revisionDates[chapter.revisionIndex] = chapter.nextRevision;
  } else {
    chapter.nextRevision = null;
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
          due.push({
            subjectName,
            unitIndex: ui,
            chapterIndex: ci,
            unitName: unit.name,
            topicName: ch.name,
            overdueDays,
            isOverdue: overdueDays > 0,
            // Card + note metadata — populated async by enrichRevisionsDue()
            cardCount: null,
            cardsDue: null,
            hasNote: null
          });
        }
      });
    });
  });
  return due.sort((a, b) => b.overdueDays - a.overdueDays);
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
  let count = 0;
  studyData.subjects[subjectName].units.forEach(unit => {
    unit.chapters.forEach(ch => {
      if (ch.nextRevision && ch.nextRevision < today()) count++;
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

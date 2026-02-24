// revisionEngine.js — Medical Study OS
// Tasks fixed: #5 (undo chapter complete), #9 (difficultyFactor in scheduler),
//              #20 (revisionDates trimmed to last 10)

const BASE_INTERVALS = [1, 3, 7, 21, 45];

function computeNextInterval(chapter, revIndex) {
  let base = BASE_INTERVALS[revIndex] || 60;
  let ef = chapter.difficultyFactor || 2.5;
  let proximity = examProximityFactor();
  let compressionFactor = Math.max(0.3, 1 - proximity * 0.5);
  let penalty = 1 - Math.min(0.4, (chapter.missedRevisions || 0) * 0.1);
  return Math.max(1, Math.round(base * ef * compressionFactor * penalty / 2.5));
}

// ─── Complete Topic (with undo support) ──────────────────────
// Task #5: shows a brief undo toast after completing a chapter.
// The undo window is 10 seconds. After that, changes are permanent.
let _lastCompletedSnapshot = null; // { subjectName, pointer, chapter } snapshot for undo

function completeTopic(subjectName) {
  let subject = studyData.subjects[subjectName];
  let ptr = subject.pointer || { unit: 0, chapter: 0 };
  let unit = subject.units[ptr.unit];
  if (!unit) return;
  let chapter = unit.chapters[ptr.chapter];
  if (!chapter) return;
  if (chapter.status === "completed") return; // already done

  // Save snapshot for undo
  _lastCompletedSnapshot = {
    subjectName,
    ptrUnit: ptr.unit,
    ptrChapter: ptr.chapter,
    prevStatus: chapter.status,
    prevCompletedOn: chapter.completedOn,
    prevRevisionDates: [...(chapter.revisionDates || [])],
    prevNextRevision: chapter.nextRevision,
    prevRevisionIndex: chapter.revisionIndex,
    prevMissedRevisions: chapter.missedRevisions,
    prevPointer: { ...subject.pointer }
  };

  chapter.status = "completed";
  chapter.completedOn = today();
  chapter.lastReviewedOn = today();

  let dates = [], cursor = today();
  for (let i = 0; i < BASE_INTERVALS.length; i++) {
    cursor = addDays(cursor, computeNextInterval(chapter, i));
    dates.push(cursor);
  }
  // Task #20: cap revisionDates at 10
  chapter.revisionDates = dates.slice(0, 10);
  chapter.revisionIndex = 0;
  chapter.nextRevision = dates[0];
  chapter.missedRevisions = 0;

  fixPointer(subjectName);
  saveData();

  // Show undo toast
  _showUndoToast(
    `✓ "${chapter.name}" marked complete`,
    () => _undoCompleteChapter()
  );
}

function _undoCompleteChapter() {
  let snap = _lastCompletedSnapshot;
  if (!snap) return;

  let subject = studyData.subjects[snap.subjectName];
  if (!subject) return;
  let unit = subject.units[snap.ptrUnit];
  if (!unit) return;
  let chapter = unit.chapters[snap.ptrChapter];
  if (!chapter) return;

  chapter.status          = snap.prevStatus;
  chapter.completedOn     = snap.prevCompletedOn;
  chapter.revisionDates   = snap.prevRevisionDates;
  chapter.nextRevision    = snap.prevNextRevision;
  chapter.revisionIndex   = snap.prevRevisionIndex;
  chapter.missedRevisions = snap.prevMissedRevisions;
  subject.pointer         = snap.prevPointer;

  _lastCompletedSnapshot = null;
  saveData();
  if (typeof renderSubjects === "function") renderSubjects();
}

// ─── Mark Revision Done ───────────────────────────────────────
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

  // Task #20: trim revisionDates to last 10
  if (chapter.revisionDates.length > 10) {
    chapter.revisionDates = chapter.revisionDates.slice(-10);
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
            // Task #9: include difficultyFactor for scheduler priority
            difficultyFactor: ch.difficultyFactor || 2.5,
            revisionIndex: ch.revisionIndex || 0,
            cardCount: null,
            cardsDue: null,
            hasNote: null
          });
        }
      });
    });
  });
  // Task #9: sort by overdue days first, then by difficulty (harder = earlier)
  return due.sort((a, b) => {
    if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
    return b.difficultyFactor - a.difficultyFactor;
  });
}

async function getRevisionsDueTodayEnriched() {
  let due = getRevisionsDueToday();
  if (!due.length) return due;

  try {
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

// ─── Undo Toast ───────────────────────────────────────────────
// Task #5: generic undo toast used by completeTopic().
// Also used by the flashcard review undo (task #6).
let _undoTimer = null;

function _showUndoToast(message, undoFn, timeoutMs = 10000) {
  // Remove any existing toast
  let old = document.getElementById("undo-toast");
  if (old) old.remove();
  clearTimeout(_undoTimer);

  let toast = document.createElement("div");
  toast.id = "undo-toast";
  toast.style.cssText = `
    position:fixed;bottom:72px;left:50%;transform:translateX(-50%);
    background:#1e293b;border:1px solid #334155;border-radius:12px;
    padding:10px 16px;display:flex;align-items:center;gap:12px;
    font-size:13px;color:#e2e8f0;z-index:9990;
    box-shadow:0 4px 24px rgba(0,0,0,0.5);
    animation:toastIn 0.2s ease;
  `;

  if (!document.getElementById("toast-style")) {
    let s = document.createElement("style");
    s.id = "toast-style";
    s.textContent = `
      @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      @keyframes toastOut { to { opacity:0; transform:translateX(-50%) translateY(8px); } }
    `;
    document.head.appendChild(s);
  }

  toast.innerHTML = `
    <span>${message}</span>
    <button id="undo-btn" style="background:#3b82f6;color:white;border:none;padding:5px 12px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;">Undo</button>
    <div id="undo-progress" style="position:absolute;bottom:0;left:0;height:2px;background:#3b82f6;border-radius:0 0 12px 12px;width:100%;transition:width ${timeoutMs}ms linear;"></div>
  `;
  document.body.appendChild(toast);

  // Animate progress bar
  requestAnimationFrame(() => {
    let bar = document.getElementById("undo-progress");
    if (bar) bar.style.width = "0%";
  });

  document.getElementById("undo-btn").addEventListener("click", () => {
    clearTimeout(_undoTimer);
    toast.remove();
    undoFn();
  });

  _undoTimer = setTimeout(() => {
    toast.style.animation = "toastOut 0.2s ease forwards";
    setTimeout(() => toast.remove(), 200);
  }, timeoutMs);
}

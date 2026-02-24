// utils.js — Medical Study OS

function today() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr, days) {
  let d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function isPast(dateStr) {
  return dateStr < today();
}

function daysBetween(dateStr1, dateStr2) {
  let d1 = new Date(dateStr1);
  let d2 = new Date(dateStr2);
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function daysUntilExam() {
  let examDate = new Date(studyData.examDate || "2026-12-01");
  let now = new Date();
  return Math.max(0, Math.ceil((examDate - now) / (1000 * 60 * 60 * 24)));
}

function percentage(part, total) {
  if (total === 0) return 0;
  return ((part / total) * 100).toFixed(1);
}

// Exam proximity factor: returns 0.0 (far) → 1.0 (exam day)
function examProximityFactor() {
  let total = daysBetween(studyData.startDate || today(), studyData.examDate || "2026-12-01");
  let remaining = daysUntilExam();
  if (total <= 0) return 1;
  return Math.min(1, 1 - (remaining / total));
}

// Clamp a number between min and max
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Safe HTML escape for use in inline onclick/attribute strings
function esc(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// ── Debounce factory ──────────────────────────────────────────────────
// Returns a debounced version of fn that fires after `wait` ms of silence.
// Usage: const debouncedSave = debounce(saveToCloud, 2500);
function debounce(fn, wait) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

// ── localStorage size guard ───────────────────────────────────────────
// Returns approximate size of the studyData JSON in bytes.
// Warns if > 4MB (approaching the ~5MB localStorage limit).
function checkLocalStorageSize() {
  try {
    let raw = localStorage.getItem("studyData") || "";
    let sizeKB = Math.round(raw.length / 1024);
    if (sizeKB > 4000) {
      console.warn(`[StudyOS] localStorage is ${sizeKB}KB — approaching 5MB limit. Consider clearing old history.`);
      // Show a non-blocking banner if the warning element exists
      let el = document.getElementById("ls-size-warning");
      if (el) {
        el.style.display = "block";
        el.textContent = `⚠ Local storage is ${sizeKB}KB — close to limit. Old daily history may be trimmed automatically.`;
      }
      return true; // over threshold
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Trim dailyHistory entries older than `keepDays` to prevent localStorage overflow.
// Safe: never deletes today's entry.
function trimOldDailyHistory(keepDays = 180) {
  if (!studyData.dailyHistory) return;
  let cutoff = addDays(today(), -keepDays);
  let before = Object.keys(studyData.dailyHistory).length;
  Object.keys(studyData.dailyHistory).forEach(d => {
    if (d < cutoff) delete studyData.dailyHistory[d];
  });
  let after = Object.keys(studyData.dailyHistory).length;
  if (before !== after) {
    console.log(`[StudyOS] Trimmed ${before - after} old daily history entries.`);
  }
}

// Trim revisionDates arrays to keep only last N entries per chapter
// (fixes unbounded growth — task #20)
function trimRevisionDates(keepLast = 10) {
  Object.values(studyData.subjects || {}).forEach(subject => {
    (subject.units || []).forEach(unit => {
      (unit.chapters || []).forEach(ch => {
        if (ch.revisionDates && ch.revisionDates.length > keepLast) {
          ch.revisionDates = ch.revisionDates.slice(-keepLast);
        }
      });
    });
  });
}

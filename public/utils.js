function today() {
  let d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

function today() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr, days) {
  let d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function isPast(dateStr) {
  return new Date(dateStr) < new Date();
}

function percentage(part, total) {
  if (total === 0) return 0;
  return ((part / total) * 100).toFixed(1);
}

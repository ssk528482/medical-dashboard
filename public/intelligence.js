// ─── Intelligence Layer ───────────────────────────────────────

function getIntelligenceAlerts() {
  let alerts = [];
  let subjects = studyData.subjects;
  let history  = studyData.dailyHistory || {};
  let todayStr = today();

  // 1. Subject neglected > 5 days
  Object.keys(subjects).forEach(name => {
    let lastStudied = null;
    let dates = Object.keys(history).sort().reverse();
    for (let d of dates) { if (history[d].studySubject === name) { lastStudied = d; break; } }
    if (lastStudied) {
      let days = daysBetween(lastStudied, todayStr);
      if (days >= 5) alerts.push({
        severity: days >= 10 ? "high" : "medium", icon: "😴",
        title: `${name} neglected`,
        message: `Not studied for ${days} days.`
      });
    }
  });

  // 2. Accuracy dropped
  Object.keys(subjects).forEach(name => {
    let recentAcc  = _recentSubjectAccuracy(name, 7);
    let overallAcc = subjectAccuracy(subjects[name]);
    if (recentAcc !== null && overallAcc > 0 && overallAcc - recentAcc >= 15) {
      alerts.push({
        severity: "high", icon: "📉",
        title: `${name} accuracy dropping`,
        message: `Down ${(overallAcc - recentAcc).toFixed(0)}% this week.`
      });
    }
  });

  // 3. Overdue revisions
  let totalOverdue = 0;
  Object.keys(subjects).forEach(n => { totalOverdue += getOverdueCount(n); });
  if (totalOverdue >= 5) alerts.push({
    severity: totalOverdue >= 10 ? "high" : "medium", icon: "⏰",
    title: `${totalOverdue} revisions overdue`,
    message: "Memory decay risk is high. Prioritize revision today."
  });

  // 4. Burnout
  let burnout = parseFloat(getBurnoutIndex());
  if (burnout >= 50) alerts.push({
    severity: "high", icon: "🔥",
    title: "Burnout risk detected",
    message: "Consistency dropped significantly. Consider a lighter day."
  });
  else if (burnout >= 25) alerts.push({
    severity: "medium", icon: "⚡",
    title: "Consistency slipping",
    message: "Weekly pace is below your monthly average."
  });

  // 5. Rotation
  let last3 = Object.keys(history).sort().reverse().slice(0, 3).map(d => history[d].studySubject).filter(Boolean);
  if (last3.length >= 3 && last3.every(s => s === last3[0])) alerts.push({
    severity: "medium", icon: "🔄",
    title: "Subject rotation needed",
    message: `Studied ${last3[0]} 3 days in a row.`
  });

  // 6. Exam proximity
  let daysLeft = daysUntilExam();
  if (daysLeft > 0 && daysLeft <= 30) alerts.push({
    severity: "high", icon: "🎯",
    title: `${daysLeft} days to exam!`,
    message: "Shift focus to revision and Qbank."
  });
  else if (daysLeft > 0 && daysLeft <= 60) alerts.push({
    severity: "medium", icon: "📅",
    title: `${daysLeft} days to exam`,
    message: "Accelerate Phase 2 revision."
  });

  // 7. Pace
  let phases = getGlobalPhaseStats();
  let avgDaily = calculateAverageDailyCompletion();
  let remaining = phases.total - phases.phase1.count;
  let reqPace  = daysLeft > 0 ? remaining / daysLeft : 0;
  if (reqPace > 0 && avgDaily < reqPace * 0.6) alerts.push({
    severity: "high", icon: "🚨",
    title: "Falling behind pace",
    message: `Need ${reqPace.toFixed(1)} chapters/day, averaging ${avgDaily.toFixed(1)}.`
  });

  // 8. Backlog alert: skipped evening update 2+ consecutive days
  let missedDays = 0;
  for (let i = 1; i <= 7; i++) {
    let d = addDays(today(), -i);
    if (!studyData.dailyHistory?.[d]?.eveningSubmitted) missedDays++;
    else break;
  }
  if (missedDays >= 2) alerts.push({
    severity: missedDays >= 4 ? "high" : "medium", icon: "📋",
    title: `${missedDays}-day study gap`,
    message: `No evening update for ${missedDays} days. Log a catch-up session today to recover your streak.`
  });

  alerts.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]));
  return alerts;
}

function _recentSubjectAccuracy(subjectName, days) {
  // Use per-session dailyHistory entries for recency
  let subject = studyData.subjects[subjectName];
  if (!subject) return null;
  let cutoff = addDays(today(), -days);
  let total = 0, correct = 0;
  Object.keys(studyData.dailyHistory || {}).forEach(dateStr => {
    if (dateStr < cutoff) return;
    (studyData.dailyHistory[dateStr].qbankEntries || []).forEach(e => {
      if (e.subject === subjectName) { total += e.total || 0; correct += e.correct || 0; }
    });
  });
  return total === 0 ? null : (correct / total) * 100;
}

function renderIntelligenceAlerts(containerId) {
  let container = document.getElementById(containerId);
  if (!container) return;
  let alerts = getIntelligenceAlerts();
  if (alerts.length === 0) {
    container.innerHTML = `
      <div style="background:#052e16;border:1px solid #16a34a;border-radius:12px;padding:12px 14px;font-size:13px;color:#86efac;display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">✅</span><span>All systems good. Keep going!</span>
      </div>`;
    return;
  }
  let colors = {
    high:   { bg: "#450a0a", border: "#ef4444", text: "#fca5a5" },
    medium: { bg: "#451a03", border: "#f59e0b", text: "#fcd34d" },
    low:    { bg: "#0c1a2e", border: "#3b82f6", text: "#93c5fd" }
  };
  container.innerHTML = alerts.slice(0, 4).map(a => {
    let c = colors[a.severity];
    return `
      <div style="background:${c.bg};border:1px solid ${c.border};border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:20px;flex-shrink:0;">${a.icon}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:${c.text};margin-bottom:2px;">${a.title}</div>
          <div style="font-size:12px;color:${c.text};opacity:0.85;">${a.message}</div>
        </div>
      </div>`;
  }).join("") + (alerts.length > 4 ? `<div style="text-align:center;font-size:12px;color:#64748b;padding:4px 0;">+${alerts.length - 4} more in <a href="analytics.html" style="color:#3b82f6;">Analytics</a></div>` : "");
}

// ─── Streak ───────────────────────────────────────────────────
function calculateStreak() {
  let streak = 0, d = new Date();
  while (true) {
    let key = d.toISOString().split("T")[0];
    if (studyData.dailyHistory[key]?.study) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function calculateLongestStreak() {
  let dates = Object.keys(studyData.dailyHistory).sort();
  let max = 0, cur = 0;
  dates.forEach(d => { if (studyData.dailyHistory[d].study) { cur++; max = Math.max(max, cur); } else cur = 0; });
  return max;
}

// ─── Prediction Engine ────────────────────────────────────────
function getPrediction() {
  let phases    = getGlobalPhaseStats();
  let daysLeft  = daysUntilExam();
  let avgDaily  = calculateAverageDailyCompletion();
  let remaining = phases.total - phases.phase1.count;

  let phase1Date = remaining > 0 && avgDaily > 0
    ? addDays(today(), Math.ceil(remaining / avgDaily))
    : "Already complete";

  let totalQ = 0, totalCorrect = 0;
  Object.values(studyData.subjects).forEach(sub => {
    sub.units.forEach(u => {
      totalQ       += u.qbankStats?.total   || 0;
      totalCorrect += u.qbankStats?.correct || 0;
    });
  });
  let overallAcc = totalQ > 0 ? (totalCorrect / totalQ) * 100 : 0;

  let completionPct    = phases.total > 0 ? (phases.phase1.count / phases.total) * 100 : 0;
  let revCompliance    = parseFloat(phases.phase2.pct);
  let weeklyConsistency = calculateWeeklyConsistency();

  let predictedScore = overallAcc * 0.40 + revCompliance * 0.30 + completionPct * 0.20 + weeklyConsistency * 0.10;

  let avgRetention = 0, topicCount = 0;
  Object.values(studyData.subjects).forEach(sub => {
    sub.units.forEach(u => {
      u.chapters.forEach(ch => {
        if (ch.status === "completed") { avgRetention += topicRetentionEstimate(ch); topicCount++; }
      });
    });
  });
  avgRetention = topicCount > 0 ? avgRetention / topicCount : 0;

  let riskColor = predictedScore >= 70 ? "#16a34a" : predictedScore >= 55 ? "#eab308" : "#ef4444";
  let riskLevel = predictedScore >= 70 ? "Low"     : predictedScore >= 55 ? "Moderate" : "High";

  return {
    predictedScore: predictedScore.toFixed(1),
    phase1CompletionDate: phase1Date,
    overallAccuracy: overallAcc.toFixed(1),
    avgRetention: avgRetention.toFixed(1),
    daysLeft, riskLevel, riskColor
  };
}

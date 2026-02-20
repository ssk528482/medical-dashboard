// ─── Intelligence Layer ───────────────────────────────────────
// Detects problems and generates proactive alerts for the user.

function getIntelligenceAlerts() {
  let alerts = [];

  let subjects = studyData.subjects;
  let history = studyData.dailyHistory || {};
  let todayStr = today();

  // ── 1. Subject neglected (studied > 5 days ago) ──
  Object.keys(subjects).forEach(name => {
    let lastStudied = null;
    // Find most recent day this subject was the study subject
    let dates = Object.keys(history).sort().reverse();
    for (let d of dates) {
      if (history[d].studySubject === name) { lastStudied = d; break; }
    }
    if (lastStudied) {
      let days = daysBetween(lastStudied, todayStr);
      if (days >= 5) {
        alerts.push({
          type: "neglect",
          severity: days >= 10 ? "high" : "medium",
          icon: "😴",
          title: `${name} neglected`,
          message: `Not studied for ${days} days. Priority may be low but don't let it slip.`,
          subject: name
        });
      }
    }
  });

  // ── 2. Accuracy dropped significantly ──
  Object.keys(subjects).forEach(name => {
    let subject = subjects[name];
    let recentAccuracy = getRecentSubjectAccuracy(name, 7);
    let overallAccuracy = subjectAccuracy(subject);
    if (recentAccuracy !== null && overallAccuracy > 0) {
      let drop = overallAccuracy - recentAccuracy;
      if (drop >= 15) {
        alerts.push({
          type: "accuracy_drop",
          severity: "high",
          icon: "📉",
          title: `${name} accuracy dropping`,
          message: `Down ${drop.toFixed(0)}% this week (${recentAccuracy.toFixed(0)}% recent vs ${overallAccuracy.toFixed(0)}% overall).`,
          subject: name
        });
      }
    }
  });

  // ── 3. Critical overdue topics ──
  let totalOverdue = 0;
  Object.keys(subjects).forEach(name => { totalOverdue += getOverdueCount(name); });
  if (totalOverdue >= 5) {
    alerts.push({
      type: "overdue",
      severity: totalOverdue >= 10 ? "high" : "medium",
      icon: "⏰",
      title: `${totalOverdue} revisions overdue`,
      message: `Memory decay risk is high. Prioritize revision today.`,
    });
  }

  // ── 4. Burnout warning ──
  let burnout = parseFloat(getBurnoutIndex());
  if (burnout >= 50) {
    alerts.push({
      type: "burnout",
      severity: "high",
      icon: "🔥",
      title: "Burnout risk detected",
      message: `Consistency dropped ${burnout.toFixed(0)} points below your 30-day average. Consider a lighter day.`,
    });
  } else if (burnout >= 25) {
    alerts.push({
      type: "burnout",
      severity: "medium",
      icon: "⚡",
      title: "Consistency slipping",
      message: "Your weekly pace is below your monthly average. Rebuild momentum.",
    });
  }

  // ── 5. Same subject repeated plan (rotation alert) ──
  let last3Subjects = [];
  let sortedDates = Object.keys(history).sort().reverse().slice(0, 3);
  sortedDates.forEach(d => {
    if (history[d].studySubject) last3Subjects.push(history[d].studySubject);
  });
  if (last3Subjects.length >= 3 && last3Subjects.every(s => s === last3Subjects[0])) {
    alerts.push({
      type: "rotation",
      severity: "medium",
      icon: "🔄",
      title: "Subject rotation needed",
      message: `You've studied ${last3Subjects[0]} 3 days in a row. Try rotating to another subject.`,
    });
  }

  // ── 6. Exam proximity alert ──
  let daysLeft = daysUntilExam();
  if (daysLeft <= 30 && daysLeft > 0) {
    alerts.push({
      type: "exam",
      severity: "high",
      icon: "🎯",
      title: `${daysLeft} days to exam!`,
      message: "Shift focus to revision and Qbank. Minimize new topics.",
    });
  } else if (daysLeft <= 60) {
    alerts.push({
      type: "exam",
      severity: "medium",
      icon: "📅",
      title: `${daysLeft} days to exam`,
      message: "Accelerate Phase 2 revision. Make sure Phase 1 is complete.",
    });
  }

  // ── 7. Incomplete plan from yesterday ──
  let yesterday = addDays(todayStr, -1);
  if (studyData.dailyPlan && studyData.dailyPlan.date === yesterday && !studyData.dailyPlan.completed) {
    alerts.push({
      type: "missed_plan",
      severity: "medium",
      icon: "📋",
      title: "Yesterday's plan incomplete",
      message: `${studyData.dailyPlan.study.subject} study was not marked done yesterday.`,
    });
  }

  // ── 8. Pace alert ──
  let avgDailyCompletion = calculateAverageDailyCompletion();
  let phases = getGlobalPhaseStats();
  let remaining = phases.total - phases.phase1.count;
  let requiredPace = daysLeft > 0 ? remaining / daysLeft : 0;
  if (requiredPace > 0 && avgDailyCompletion < requiredPace * 0.6) {
    alerts.push({
      type: "pace",
      severity: "high",
      icon: "🚨",
      title: "Falling behind pace",
      message: `You need ${requiredPace.toFixed(1)} topics/day but averaging ${avgDailyCompletion.toFixed(1)}. Increase study hours.`,
    });
  }

  // Sort by severity: high first
  let order = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return alerts;
}

// Get accuracy for a subject based on last N days of qbank entries
function getRecentSubjectAccuracy(subjectName, days) {
  let subject = studyData.subjects[subjectName];
  if (!subject) return null;

  let cutoff = addDays(today(), -days);
  let total = 0, correct = 0;

  subject.topics.forEach(topic => {
    if (topic.qbankStats && topic.lastReviewedOn && topic.lastReviewedOn >= cutoff) {
      total += topic.qbankStats.total;
      correct += topic.qbankStats.correct;
    }
  });

  if (total === 0) return null;
  return (correct / total) * 100;
}

// ── Streak calculations ───────────────────────────────────────
function calculateStreak() {
  let streak = 0;
  let d = new Date();
  while (true) {
    let key = d.toISOString().split("T")[0];
    if (studyData.dailyHistory[key]?.study) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function calculateLongestStreak() {
  let dates = Object.keys(studyData.dailyHistory).sort();
  let max = 0, current = 0;
  for (let i = 0; i < dates.length; i++) {
    if (studyData.dailyHistory[dates[i]].study) {
      current++;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max;
}

// ── Render alerts ─────────────────────────────────────────────
function renderIntelligenceAlerts(containerId) {
  let container = document.getElementById(containerId);
  if (!container) return;

  let alerts = getIntelligenceAlerts();
  if (alerts.length === 0) {
    container.innerHTML = `
      <div style="background:#052e16;border:1px solid #16a34a;border-radius:12px;padding:14px;font-size:13px;color:#86efac;display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">✅</span>
        <span>All systems good. Keep going!</span>
      </div>
    `;
    return;
  }

  let colors = {
    high:   { bg: "#450a0a", border: "#ef4444", text: "#fca5a5" },
    medium: { bg: "#451a03", border: "#f59e0b", text: "#fcd34d" },
    low:    { bg: "#0c1a2e", border: "#3b82f6", text: "#93c5fd" }
  };

  // Show max 4 alerts on home page
  let toShow = alerts.slice(0, 4);

  container.innerHTML = toShow.map(a => {
    let c = colors[a.severity];
    return `
      <div style="background:${c.bg};border:1px solid ${c.border};border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:20px;flex-shrink:0;">${a.icon}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:${c.text};margin-bottom:2px;">${a.title}</div>
          <div style="font-size:12px;color:${c.text};opacity:0.85;">${a.message}</div>
        </div>
      </div>
    `;
  }).join("");

  if (alerts.length > 4) {
    container.innerHTML += `
      <div style="text-align:center;font-size:12px;color:#64748b;padding:4px 0;">
        +${alerts.length - 4} more alerts in <a href="analytics.html" style="color:#3b82f6;">Analytics</a>
      </div>
    `;
  }
}

// ── Prediction Engine ─────────────────────────────────────────
function getPrediction() {
  let phases = getGlobalPhaseStats();
  let daysLeft = daysUntilExam();
  let avgDailyCompletion = calculateAverageDailyCompletion();

  // Phase 1 projection
  let remaining1 = phases.total - phases.phase1.count;
  let phase1CompletionDate = remaining1 > 0 && avgDailyCompletion > 0
    ? addDays(today(), Math.ceil(remaining1 / avgDailyCompletion))
    : "Already complete";

  // Revision compliance
  let weeklyConsistency = calculateWeeklyConsistency();

  // Accuracy trend
  let totalQ = 0, totalCorrect = 0;
  Object.values(studyData.subjects).forEach(sub => {
    sub.topics.forEach(t => {
      if (t.qbankStats) { totalQ += t.qbankStats.total; totalCorrect += t.qbankStats.correct; }
    });
  });
  let overallAccuracy = totalQ > 0 ? (totalCorrect / totalQ) * 100 : 0;

  // Predicted exam score (composite model)
  // Weights: accuracy 40%, revision compliance 30%, completion 20%, consistency 10%
  let completionPct = phases.total > 0 ? (phases.phase1.count / phases.total) * 100 : 0;
  let revCompliance = parseFloat(phases.phase2.pct);

  let predictedScore = (
    overallAccuracy * 0.40 +
    revCompliance   * 0.30 +
    completionPct   * 0.20 +
    weeklyConsistency * 0.10
  );

  // Retention estimate
  let avgRetention = 0, topicCount = 0;
  Object.values(studyData.subjects).forEach(sub => {
    sub.topics.forEach(t => {
      if (t.status === "completed") {
        avgRetention += topicRetentionEstimate(t);
        topicCount++;
      }
    });
  });
  avgRetention = topicCount > 0 ? avgRetention / topicCount : 0;

  return {
    predictedScore: predictedScore.toFixed(1),
    phase1CompletionDate,
    overallAccuracy: overallAccuracy.toFixed(1),
    avgRetention: avgRetention.toFixed(1),
    daysLeft,
    riskLevel: predictedScore >= 70 ? "Low" : predictedScore >= 55 ? "Moderate" : "High",
    riskColor: predictedScore >= 70 ? "#16a34a" : predictedScore >= 55 ? "#eab308" : "#ef4444"
  };
}

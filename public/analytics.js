function renderAnalytics() {
  let container = document.getElementById("analyticsContainer");
  if (!container) return;
  container.innerHTML = "";

  // ── Collect stats ──
  let totalTopics = 0, completedTopics = 0, totalOverdue = 0;
  let subjectStats = [], weakTopics = [], accuracyTrend = [];

  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];
    let subjectTotal = 0, subjectCorrect = 0, overdueCount = 0;

    subject.topics.forEach(topic => {
      totalTopics++;
      if (topic.status === "completed") completedTopics++;
      if (topic.nextRevision && topic.nextRevision < today()) { overdueCount++; totalOverdue++; }
      if (topic.qbankStats) {
        subjectTotal += topic.qbankStats.total;
        subjectCorrect += topic.qbankStats.correct;
        if (topic.qbankStats.total > 0 && topic.qbankStats.correct / topic.qbankStats.total < 0.6) {
          weakTopics.push({
            subject: subjectName, topic: topic.name,
            accuracy: (topic.qbankStats.correct / topic.qbankStats.total) * 100,
            revIndex: topic.revisionIndex,
            ef: (topic.difficultyFactor || 2.5).toFixed(2)
          });
        }
      }
    });

    let accuracy = subjectTotal > 0 ? (subjectCorrect / subjectTotal) * 100 : 0;
    let phase = detectPhaseStatus(subjectName);
    subjectStats.push({ name: subjectName, accuracy, overdue: overdueCount, phase, size: subject.size });
  });

  let completionPct = totalTopics > 0 ? (completedTopics / totalTopics * 100) : 0;
  let retention = calculateRetention();
  let daysLeft = daysUntilExam();
  let avgDailyCompletion = calculateAverageDailyCompletion();
  let remainingTopics = totalTopics - completedTopics;
  let requiredPace = daysLeft > 0 ? (remainingTopics / daysLeft) : 0;
  let weeklyConsistency = calculateWeeklyConsistency();
  let monthlyConsistency = calculateMonthlyConsistency();
  let burnout = getBurnoutIndex();
  let phases = getGlobalPhaseStats();
  let proximity = (examProximityFactor() * 100).toFixed(0);

  let riskLevel = "Low", riskColor = "#16a34a";
  if (avgDailyCompletion < requiredPace * 0.6) { riskLevel = "Critical"; riskColor = "#ef4444"; }
  else if (avgDailyCompletion < requiredPace) { riskLevel = "High"; riskColor = "#f97316"; }
  else if (avgDailyCompletion - requiredPace < 0.5) { riskLevel = "Moderate"; riskColor = "#eab308"; }

  subjectStats.sort((a, b) => a.accuracy - b.accuracy);
  weakTopics.sort((a, b) => a.accuracy - b.accuracy);

  // ── Build last-30-day accuracy trend (from qbank daily history) ──
  let trendDays = [];
  for (let i = 29; i >= 0; i--) {
    let d = new Date(); d.setDate(d.getDate() - i);
    trendDays.push(d.toISOString().split("T")[0]);
  }

  container.innerHTML = `

    <!-- Command Summary -->
    <div class="card">
      <div class="section-title">🎯 Command Summary</div>
      <div class="analytics-grid">
        <div class="stat-box">
          <div class="stat-big" style="color:#3b82f6">${completionPct.toFixed(1)}%</div>
          <div class="stat-label">Completion</div>
        </div>
        <div class="stat-box">
          <div class="stat-big" style="color:#10b981">${retention}%</div>
          <div class="stat-label">Retention Est.</div>
        </div>
        <div class="stat-box">
          <div class="stat-big" style="color:${riskColor}">${riskLevel}</div>
          <div class="stat-label">Risk Level</div>
        </div>
        <div class="stat-box">
          <div class="stat-big" style="color:#f59e0b">${daysLeft}</div>
          <div class="stat-label">Days to Exam</div>
        </div>
      </div>

      <div style="margin-top:14px;">
        <div style="font-size:13px;margin-bottom:4px;color:#9ca3af;">Overall Completion</div>
        <div class="stat-bar" style="height:14px;"><div class="stat-fill ${completionPct>=75?"green":completionPct>=40?"yellow":"red"}" style="width:${completionPct}%"></div></div>

        <div style="font-size:13px;margin:10px 0 4px;color:#9ca3af;">Exam Proximity</div>
        <div class="stat-bar" style="height:14px;"><div class="stat-fill" style="width:${proximity}%;background:#8b5cf6;"></div></div>
        <div style="font-size:11px;color:#6b7280;margin-top:3px;">${proximity}% through study timeline</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
        <div style="background:#111827;padding:10px;border-radius:8px;">
          <div style="font-size:11px;color:#9ca3af;">Required Pace</div>
          <div style="font-size:18px;font-weight:700;color:#f59e0b;">${requiredPace.toFixed(2)}</div>
          <div style="font-size:10px;color:#6b7280;">topics/day</div>
        </div>
        <div style="background:#111827;padding:10px;border-radius:8px;">
          <div style="font-size:11px;color:#9ca3af;">Your Pace</div>
          <div style="font-size:18px;font-weight:700;color:${avgDailyCompletion >= requiredPace ? "#10b981" : "#ef4444"};">${avgDailyCompletion.toFixed(2)}</div>
          <div style="font-size:10px;color:#6b7280;">topics/day</div>
        </div>
      </div>
    </div>

    <!-- Phase Tracker -->
    <div class="card">
      <div class="section-title">📈 Phase Tracker</div>
      ${renderPhaseRow("Phase 1 — Study Complete", phases.phase1, "#3b82f6")}
      ${renderPhaseRow("Phase 2 — Rev 2+ (All topics)", phases.phase2, "#8b5cf6")}
      ${renderPhaseRow("Phase 3 — Rev 3+ (All topics)", phases.phase3, "#f59e0b")}
      ${renderPhaseRow("Qbank — Done (All topics)", phases.qbank, "#10b981")}
    </div>

    <!-- Consistency & Burnout -->
    <div class="card">
      <div class="section-title">🔥 Consistency & Burnout</div>
      <div class="analytics-grid" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="stat-box">
          <div class="stat-big" style="color:#3b82f6">${weeklyConsistency.toFixed(0)}%</div>
          <div class="stat-label">7-Day</div>
        </div>
        <div class="stat-box">
          <div class="stat-big" style="color:#8b5cf6">${monthlyConsistency.toFixed(0)}%</div>
          <div class="stat-label">30-Day</div>
        </div>
        <div class="stat-box">
          <div class="stat-big" style="color:${burnout>50?"#ef4444":burnout>25?"#f59e0b":"#10b981"}">${burnout}</div>
          <div class="stat-label">Burnout Index</div>
        </div>
      </div>
      ${parseFloat(burnout) > 50 ? `<div style="background:#450a0a;border:1px solid #ef4444;border-radius:8px;padding:10px;margin-top:10px;font-size:13px;color:#fca5a5;">⚠️ Burnout detected — consistency dropping. Consider reducing today's load or taking a lighter day.</div>` : ""}
      ${parseFloat(burnout) > 25 && parseFloat(burnout) <= 50 ? `<div style="background:#451a03;border:1px solid #f59e0b;border-radius:8px;padding:10px;margin-top:10px;font-size:13px;color:#fcd34d;">⚡ Consistency slipping slightly. Keep your streak going!</div>` : ""}
    </div>

    <!-- Subject Weakness Ranking -->
    <div class="card">
      <div class="section-title">📉 Subject Ranking (Weakest First)</div>
      ${subjectStats.map(s => `
        <div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong style="font-size:14px;">${s.name}</strong>
            <div style="display:flex;gap:6px;align-items:center;">
              ${s.overdue > 0 ? `<span class="badge-overdue">⚠ ${s.overdue}</span>` : ""}
              <span class="accuracy-badge ${s.accuracy>=75?"accuracy-high":s.accuracy>=50?"accuracy-mid":"accuracy-low"}">${s.accuracy.toFixed(1)}%</span>
            </div>
          </div>
          <div class="stat-bar">
            <div class="stat-fill ${s.accuracy>=75?"green":s.accuracy>=50?"yellow":"red"}" style="width:${s.accuracy}%"></div>
          </div>
          <div style="font-size:11px;color:#6b7280;margin-top:3px;">
            ${s.phase.phase1?"✓P1 ":""}${s.phase.phase2?"✓P2 ":""}${s.phase.phase3?"✓P3 ":" "}
            <span style="margin-left:4px;">${s.size}</span>
          </div>
        </div>
      `).join("")}
    </div>

    <!-- Weak Topics -->
    <div class="card">
      <div class="section-title">🎯 Top Weak Topics (< 60% accuracy)</div>
      ${weakTopics.length === 0
        ? '<div style="color:#9ca3af;font-size:13px;">No weak topics detected. Keep going! ✓</div>'
        : weakTopics.slice(0, 8).map(t => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1f2937;">
            <div>
              <div style="font-size:13px;"><strong>${t.topic}</strong></div>
              <div style="font-size:11px;color:#9ca3af;">${t.subject} · Rev ${t.revIndex} · EF ${t.ef}</div>
            </div>
            <span class="accuracy-badge accuracy-low">${t.accuracy.toFixed(1)}%</span>
          </div>
        `).join("")
      }
    </div>

    <!-- Overdue Summary -->
    <div class="card">
      <div class="section-title">⏰ Overdue Revisions</div>
      ${totalOverdue === 0
        ? '<div style="color:#10b981;font-size:13px;">No overdue revisions ✓</div>'
        : `<div style="font-size:24px;font-weight:700;color:#ef4444;">${totalOverdue} topics overdue</div>
           <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Complete these in your next sessions to prevent memory decay.</div>`
      }
    </div>

    <!-- Exam Date Setting -->
    <div class="card">
      <div class="section-title">⚙️ Settings</div>
      <label style="font-size:13px;color:#9ca3af;">Exam Date</label><br>
      <input type="date" id="examDateInput" value="${studyData.examDate || '2026-12-01'}" style="margin:6px 0;">
      <button onclick="updateExamDate()" style="font-size:12px;padding:6px 12px;">Save</button>
    </div>
  `;
}

function renderPhaseRow(label, phaseData, color) {
  return `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
        <span>${label}</span>
        <span style="color:${color};font-weight:600;">${phaseData.pct}% (${phaseData.count}/${phaseData.total})</span>
      </div>
      <div class="stat-bar" style="height:12px;">
        <div class="stat-fill" style="width:${phaseData.pct}%;background:${color};"></div>
      </div>
    </div>
  `;
}

function updateExamDate() {
  let val = document.getElementById("examDateInput").value;
  if (val) {
    studyData.examDate = val;
    saveData();
    alert("Exam date saved ✓");
    renderAnalytics();
  }
}

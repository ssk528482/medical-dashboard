function renderAnalytics() {
  let container = document.getElementById("analyticsContainer");
  if (!container) return;
  container.innerHTML = "";

  let totalCh = 0, doneCh = 0, totalOverdue = 0;
  let subjectStats = [], weakUnits = [];

  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];
    let subjectQ = 0, subjectCorrect = 0, overdueCount = 0;

    subject.units.forEach(unit => {
      subjectQ       += unit.qbankStats.total;
      subjectCorrect += unit.qbankStats.correct;

      // Weak unit detection
      if (unit.qbankStats.total > 0) {
        let uAcc = (unit.qbankStats.correct / unit.qbankStats.total) * 100;
        if (uAcc < 60) {
          weakUnits.push({
            subject: subjectName,
            unit: unit.name,
            accuracy: uAcc,
            chapters: unit.chapters.length
          });
        }
      }

      unit.chapters.forEach(ch => {
        totalCh++;
        if (ch.status === "completed") doneCh++;
        if (ch.nextRevision && ch.nextRevision < today()) { overdueCount++; totalOverdue++; }
      });
    });

    let accuracy = subjectQ > 0 ? (subjectCorrect / subjectQ) * 100 : 0;
    let phase = detectPhaseStatus(subjectName);
    subjectStats.push({ name: subjectName, accuracy, overdue: overdueCount, phase, size: subject.size });
  });

  let completionPct = totalCh > 0 ? (doneCh / totalCh * 100) : 0;
  let retention     = calculateRetention();
  let daysLeft      = daysUntilExam();
  let avgDaily      = calculateAverageDailyCompletion();
  let remaining     = totalCh - doneCh;
  let reqPace       = daysLeft > 0 ? remaining / daysLeft : 0;
  let weekly        = calculateWeeklyConsistency();
  let monthly       = calculateMonthlyConsistency();
  let burnout       = getBurnoutIndex();
  let phases        = getGlobalPhaseStats();
  let proximity     = (examProximityFactor() * 100).toFixed(0);
  let streak        = calculateStreak();
  let longestStreak = calculateLongestStreak();

  let riskLevel = "Low", riskColor = "#16a34a";
  if (avgDaily < reqPace * 0.6)                    { riskLevel = "Critical"; riskColor = "#ef4444"; }
  else if (reqPace > 0 && avgDaily < reqPace)       { riskLevel = "High";     riskColor = "#f97316"; }
  else if (reqPace > 0 && avgDaily - reqPace < 0.5) { riskLevel = "Moderate"; riskColor = "#eab308"; }

  subjectStats.sort((a, b) => a.accuracy - b.accuracy);
  weakUnits.sort((a, b) => a.accuracy - b.accuracy);

  let prediction         = getPrediction();
  let accuracyTrendData  = buildGlobalAccuracyTrend(30);
  let consistencyBarData = buildConsistencyBarData(30);
  let retentionData      = buildRetentionProjection(14);

  container.innerHTML = `

    <!-- Intelligence Alerts -->
    <div class="card">
      <div class="section-title">🧠 Intelligence Alerts</div>
      <div id="analyticsAlerts"></div>
    </div>

    <!-- Command Summary -->
    <div class="card">
      <div class="section-title">🎯 Command Summary</div>
      <div class="analytics-grid">
        <div class="stat-box"><div class="stat-big" style="color:#3b82f6">${completionPct.toFixed(1)}%</div><div class="stat-label">Completion</div></div>
        <div class="stat-box"><div class="stat-big" style="color:#10b981">${retention}%</div><div class="stat-label">Retention</div></div>
        <div class="stat-box"><div class="stat-big" style="color:${riskColor}">${riskLevel}</div><div class="stat-label">Risk Level</div></div>
        <div class="stat-box"><div class="stat-big" style="color:#f59e0b">${daysLeft}</div><div class="stat-label">Days to Exam</div></div>
      </div>
      <div style="margin-top:12px;">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Overall Completion</div>
        <div class="stat-bar" style="height:12px;"><div class="stat-fill ${completionPct>=75?"green":completionPct>=40?"yellow":"red"}" style="width:${completionPct}%"></div></div>
        <div style="font-size:12px;color:#94a3b8;margin:8px 0 4px;">Exam Timeline (${proximity}% elapsed)</div>
        <div class="stat-bar" style="height:12px;"><div class="stat-fill" style="width:${proximity}%;background:#8b5cf6;"></div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px;">
        <div style="background:#0f172a;padding:10px;border-radius:8px;text-align:center;">
          <div style="font-size:14px;font-weight:700;color:#f59e0b;">${reqPace.toFixed(2)}</div>
          <div style="font-size:10px;color:#64748b;">Req. Pace</div>
        </div>
        <div style="background:#0f172a;padding:10px;border-radius:8px;text-align:center;">
          <div style="font-size:14px;font-weight:700;color:${avgDaily>=reqPace?"#10b981":"#ef4444"};">${avgDaily.toFixed(2)}</div>
          <div style="font-size:10px;color:#64748b;">Your Pace</div>
        </div>
        <div style="background:#0f172a;padding:10px;border-radius:8px;text-align:center;">
          <div style="font-size:14px;font-weight:700;color:#f97316;">🔥 ${streak}</div>
          <div style="font-size:10px;color:#64748b;">Streak</div>
        </div>
      </div>
    </div>

    <!-- Prediction -->
    <div class="card">
      <div class="section-title">🔮 Exam Prediction</div>
      <div style="text-align:center;padding:8px 0 14px;">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Predicted Exam Score</div>
        <div style="font-size:52px;font-weight:900;color:${prediction.riskColor};line-height:1;">${prediction.predictedScore}%</div>
        <div style="font-size:13px;color:${prediction.riskColor};margin-top:4px;font-weight:600;">Risk: ${prediction.riskLevel}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="background:#0f172a;border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:#3b82f6;">${prediction.overallAccuracy}%</div>
          <div style="font-size:10px;color:#64748b;">Qbank Accuracy</div>
        </div>
        <div style="background:#0f172a;border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:#10b981;">${prediction.avgRetention}%</div>
          <div style="font-size:10px;color:#64748b;">Avg Retention</div>
        </div>
      </div>
      <div style="font-size:12px;color:#64748b;margin-top:10px;padding:10px;background:#0f172a;border-radius:8px;">
        📅 Phase 1 est. completion: <strong style="color:#e2e8f0;">${prediction.phase1CompletionDate}</strong>
      </div>
      <div style="font-size:11px;color:#475569;margin-top:6px;">Model: Accuracy 40% · Rev compliance 30% · Completion 20% · Consistency 10%</div>
    </div>

    <!-- Phase Tracker -->
    <div class="card">
      <div class="section-title">📈 Phase Tracker</div>
      ${_phaseRow("Completed — Chapters Studied", phases.completed, "#3b82f6")}
      ${_phaseRow("R1 — First Revision Done",     phases.r1,        "#8b5cf6")}
      ${_phaseRow("R2 — Second Revision Done",    phases.r2,        "#f59e0b")}
      ${_phaseRow("R3 — Third Revision Done",     phases.r3,        "#f97316")}
      ${_phaseRowUnits("Qbank — Units Done",      phases.qbank,     "#10b981")}
    </div>

    <!-- Weekly Report Card -->
    <div class="card">
      <div class="section-title">📋 Weekly Report Card</div>
      ${buildWeeklyReportCard()}
    </div>

    <!-- Per-Subject Qbank Sparklines -->
    <div class="card">
      <div class="section-title">📈 Qbank Accuracy Per Subject</div>
      ${buildSubjectQbankSparklines()}
    </div>

    <!-- Accuracy Trend Chart -->
    <div class="card">
      <div class="section-title">📊 Qbank Accuracy Trend (30 days)</div>
      ${accuracyTrendData.length >= 2
        ? buildLineChart(accuracyTrendData, { color: "#3b82f6", unit: "%" })
        : '<div style="color:#64748b;font-size:13px;text-align:center;padding:20px;">Log some Qbank sessions to see your trend.</div>'
      }
    </div>

    <!-- Retention Projection -->
    <div class="card">
      <div class="section-title">🧠 Retention Projection (14 days)</div>
      ${retentionData.length >= 2
        ? buildLineChart(retentionData, { color: "#10b981", unit: "%" })
        : '<div style="color:#64748b;font-size:13px;text-align:center;padding:20px;">Complete chapters to see your retention curve.</div>'
      }
      <div style="font-size:11px;color:#475569;margin-top:6px;">Ebbinghaus curve based on your topic difficulty factors.</div>
    </div>

    <!-- Daily Consistency Bars -->
    <div class="card">
      <div class="section-title">📅 Daily Consistency (30 days)</div>
      ${buildBarChart(consistencyBarData, { height: 70 })}
      <div style="display:flex;gap:12px;margin-top:8px;font-size:11px;color:#9ca3af;flex-wrap:wrap;">
        <span><span style="display:inline-block;width:10px;height:10px;background:#1f2937;border-radius:2px;margin-right:3px;"></span>None</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#f97316;border-radius:2px;margin-right:3px;"></span>1/3</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#eab308;border-radius:2px;margin-right:3px;"></span>2/3</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#16a34a;border-radius:2px;margin-right:3px;"></span>Full</span>
      </div>
    </div>

    <!-- Consistency & Burnout -->
    <div class="card">
      <div class="section-title">🔥 Consistency & Burnout</div>
      <div class="analytics-grid" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="stat-box"><div class="stat-big" style="color:#3b82f6">${weekly.toFixed(0)}%</div><div class="stat-label">7-Day</div></div>
        <div class="stat-box"><div class="stat-big" style="color:#8b5cf6">${monthly.toFixed(0)}%</div><div class="stat-label">30-Day</div></div>
        <div class="stat-box"><div class="stat-big" style="color:${burnout>50?"#ef4444":burnout>25?"#f59e0b":"#10b981"}">${burnout}</div><div class="stat-label">Burnout</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
        <div style="background:#0f172a;border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:#f97316;">🔥 ${streak}</div>
          <div style="font-size:10px;color:#64748b;">Current Streak</div>
        </div>
        <div style="background:#0f172a;border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:#eab308;">${longestStreak}</div>
          <div style="font-size:10px;color:#64748b;">Best Streak</div>
        </div>
      </div>
    </div>

    <!-- Subject Ranking -->
    <div class="card">
      <div class="section-title">📉 Subject Ranking (Weakest First)</div>
      ${subjectStats.map(s => `
        <div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong>${s.name}</strong>
            <div style="display:flex;gap:6px;align-items:center;">
              ${s.overdue > 0 ? `<span class="badge-overdue">⚠ ${s.overdue}</span>` : ""}
              <span class="accuracy-badge ${s.accuracy>=75?"accuracy-high":s.accuracy>=50?"accuracy-mid":"accuracy-low"}">${s.accuracy.toFixed(1)}%</span>
            </div>
          </div>
          <div class="stat-bar"><div class="stat-fill ${s.accuracy>=75?"green":s.accuracy>=50?"yellow":"red"}" style="width:${Math.max(s.accuracy,0)}%"></div></div>
          <div style="font-size:11px;color:#64748b;margin-top:3px;">
            ${s.phase.phase1?"✓P1 ":""}${s.phase.phase2?"✓P2 ":""}${s.phase.phase3?"✓P3":""}· ${s.size}
          </div>
        </div>
      `).join("")}
    </div>

    <!-- Weak Units -->
    <div class="card">
      <div class="section-title">🎯 Weak Units (< 60% accuracy)</div>
      ${weakUnits.length === 0
        ? '<div style="color:#9ca3af;font-size:13px;">No weak units ✓</div>'
        : weakUnits.slice(0, 8).map(u => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #0f172a;">
            <div>
              <div style="font-size:13px;font-weight:600;">${u.unit}</div>
              <div style="font-size:11px;color:#9ca3af;">${u.subject} · ${u.chapters} chapters</div>
            </div>
            <span class="accuracy-badge accuracy-low">${u.accuracy.toFixed(1)}%</span>
          </div>`).join("")
      }
    </div>

    <!-- Overdue -->
    <div class="card">
      <div class="section-title">⏰ Overdue Revisions</div>
      ${totalOverdue === 0
        ? '<div style="color:#10b981;font-size:13px;">No overdue revisions ✓</div>'
        : `<div style="font-size:28px;font-weight:700;color:#ef4444;">${totalOverdue} chapters overdue</div>
           <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Memory decay is accelerating. Revise today.</div>`
      }
    </div>

    <!-- Settings -->
    <div class="card">
      <div class="section-title">⚙️ Exam Date</div>
      <input type="date" id="examDateInput" value="${studyData.examDate || "2026-12-01"}" style="width:100%;margin:6px 0;">
      <button onclick="updateExamDate()" style="width:100%;">Save ✓</button>
    </div>
  `;

  renderIntelligenceAlerts("analyticsAlerts");
}

function _phaseRow(label, phaseData, color) {
  let phases = getGlobalPhaseStats();
  return `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
        <span>${label}</span>
        <span style="color:${color};font-weight:600;">${phaseData.pct}% (${phaseData.count}/${phases.total} ch)</span>
      </div>
      <div class="stat-bar" style="height:10px;"><div class="stat-fill" style="width:${phaseData.pct}%;background:${color};"></div></div>
    </div>`;
}

// Separate row for qbank (units denominator shown)
function _phaseRowUnits(label, phaseData, color) {
  return `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
        <span>${label}</span>
        <span style="color:${color};font-weight:600;">${phaseData.pct}% (${phaseData.count} units)</span>
      </div>
      <div class="stat-bar" style="height:10px;"><div class="stat-fill" style="width:${phaseData.pct}%;background:${color};"></div></div>
    </div>`;
}

function buildWeeklyReportCard() {
  // Last 7 completed days (Mon–Sun of most recent week)
  let days = [], totalStudy = 0, totalQbank = 0, totalRevision = 0;
  let subjectsCovered = new Set();
  let totalQ = 0, totalCorrect = 0;
  let missedDays = 0, topicsCompleted = 0;

  for (let i = 6; i >= 0; i--) {
    let d = addDays(today(), -i);
    days.push(d);
    let hist = studyData.dailyHistory?.[d];
    if (!hist || !hist.eveningSubmitted) { missedDays++; continue; }
    if (hist.study)    totalStudy++;
    if (hist.qbank)    totalQbank++;
    if (hist.revision) totalRevision++;
    (hist.studyEntries || []).forEach(e => {
      subjectsCovered.add(e.subject);
      topicsCompleted += (e.topics || []).length;
    });
    (hist.qbankEntries || []).forEach(e => {
      totalQ       += e.total   || 0;
      totalCorrect += e.correct || 0;
    });
  }

  let consistency = Math.round(((7 - missedDays) / 7) * 100);
  let accuracy    = totalQ > 0 ? ((totalCorrect / totalQ) * 100).toFixed(1) : null;
  let grade = consistency >= 85 ? "A" : consistency >= 70 ? "B" : consistency >= 55 ? "C" : "D";
  let gradeColor = { A: "#10b981", B: "#3b82f6", C: "#eab308", D: "#ef4444" }[grade];
  let dayNames = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  // day-by-day dots
  let dotRow = days.map((d, idx) => {
    let hist = studyData.dailyHistory?.[d];
    let score = 0;
    if (hist?.eveningSubmitted) score = (hist.study?1:0) + (hist.qbank?1:0) + (hist.revision?1:0);
    let dotC = score === 3 ? "#16a34a" : score === 2 ? "#eab308" : score === 1 ? "#f97316" : "#1f2937";
    let dayLabel = dayNames[(new Date(d).getDay() + 6) % 7]; // Mon=0
    return `<div style="text-align:center;">
      <div style="width:28px;height:28px;border-radius:50%;background:${dotC};margin:0 auto 2px;display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:700;">${score||""}</div>
      <div style="font-size:9px;color:#64748b;">${dayLabel}</div>
    </div>`;
  }).join("");

  // Feedback message
  let feedback = "";
  if (consistency === 100) feedback = "🏆 Perfect week! Outstanding discipline.";
  else if (consistency >= 85) feedback = "🌟 Excellent consistency. Keep the momentum.";
  else if (consistency >= 70) feedback = "👍 Good week. A couple of missed days — stay on track.";
  else if (consistency >= 50) feedback = "⚠️ Below average. Focus on daily habits.";
  else feedback = "🔴 Difficult week. Restart with a small, achievable goal today.";

  // Overdue revisions this week
  let overdueCount = 0;
  Object.keys(studyData.subjects).forEach(n => { overdueCount += getOverdueCount(n); });

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Week of ${days[0].slice(5)} – ${days[6].slice(5)}</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:3px;">Consistency: ${consistency}%</div>
      </div>
      <div style="width:56px;height:56px;border-radius:50%;background:${gradeColor}22;border:3px solid ${gradeColor};
        display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:${gradeColor};">${grade}</div>
    </div>

    <!-- Day Dots -->
    <div style="display:flex;justify-content:space-between;margin-bottom:14px;">${dotRow}</div>

    <!-- Stats Row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px;">
      <div style="background:#0f172a;border-radius:8px;padding:8px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:#3b82f6;">${topicsCompleted}</div>
        <div style="font-size:9px;color:#64748b;margin-top:1px;">Topics</div>
      </div>
      <div style="background:#0f172a;border-radius:8px;padding:8px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:#10b981;">${totalRevision}</div>
        <div style="font-size:9px;color:#64748b;margin-top:1px;">Rev. Days</div>
      </div>
      <div style="background:#0f172a;border-radius:8px;padding:8px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:${accuracy ? (accuracy>=75?"#10b981":accuracy>=50?"#eab308":"#ef4444") : "#475569"};">${accuracy || "—"}${accuracy?"%":""}</div>
        <div style="font-size:9px;color:#64748b;margin-top:1px;">Qbank Acc</div>
      </div>
      <div style="background:#0f172a;border-radius:8px;padding:8px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:${missedDays>0?"#ef4444":"#10b981"};">${missedDays}</div>
        <div style="font-size:9px;color:#64748b;margin-top:1px;">Missed</div>
      </div>
    </div>

    <!-- Subjects covered -->
    <div style="margin-bottom:10px;">
      <div style="font-size:11px;color:#64748b;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em;">Subjects covered</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${subjectsCovered.size > 0
          ? [...subjectsCovered].map(s => `<span style="background:#1e3a5f;color:#93c5fd;padding:3px 8px;border-radius:6px;font-size:11px;">${s}</span>`).join("")
          : `<span style="color:#475569;font-size:12px;">None logged this week</span>`}
      </div>
    </div>

    <!-- Feedback -->
    <div style="background:#0f172a;border-radius:8px;padding:10px;font-size:13px;color:#cbd5e1;line-height:1.5;">
      ${feedback}
      ${overdueCount > 0 ? `<br><span style="color:#ef4444;font-size:12px;">⚠ ${overdueCount} revisions still overdue — tackle these first.</span>` : ""}
    </div>
  `;
}

function renderPhaseRow(label, phaseData, color) { return _phaseRow(label, phaseData, color); }

function updateExamDate() {
  let val = document.getElementById("examDateInput").value;
  if (val) { studyData.examDate = val; saveData(); alert("Saved ✓"); renderAnalytics(); }
}

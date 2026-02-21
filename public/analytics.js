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
      ${_phaseRow("Phase 1 — Chapters Studied", phases.phase1, "#3b82f6")}
      ${_phaseRow("Phase 2 — Revision 2+ (chapters)", phases.phase2, "#8b5cf6")}
      ${_phaseRow("Phase 3 — Revision 3+ (chapters)", phases.phase3, "#f59e0b")}
      ${_phaseRowUnits("Qbank — Units Done", phases.qbank, "#10b981")}
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
  return `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
        <span>${label}</span>
        <span style="color:${color};font-weight:600;">${phaseData.pct}% (${phaseData.count}/${phaseData.count + (parseInt(phaseData.pct) < 100 ? "…" : phaseData.count)})</span>
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

function renderPhaseRow(label, phaseData, color) { return _phaseRow(label, phaseData, color); }

function updateExamDate() {
  let val = document.getElementById("examDateInput").value;
  if (val) { studyData.examDate = val; saveData(); alert("Saved ✓"); renderAnalytics(); }
}

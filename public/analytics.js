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
      subjectQ       += unit.qbankStats?.total   ?? 0;
      subjectCorrect += unit.qbankStats?.correct ?? 0;

      // Weak unit detection
      if ((unit.qbankStats?.total ?? 0) > 0) {
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

    <!-- Today's Priority -->
    <div class="card">
      <div class="section-title">🎯 Today's Priority</div>
      ${buildTodayPriority(reqPace, avgDaily, totalOverdue, remaining, daysLeft)}
    </div>

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

      ${!prediction.willFinishBeforeExam ? `
        <div style="background:#450a0a;border:1px solid #ef4444;border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;color:#fca5a5;">
          ⚠ At current pace, study won't complete before exam day. Accelerate.
        </div>` : ""}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:#0f172a;border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:#3b82f6;">${prediction.overallAccuracy}%</div>
          <div style="font-size:10px;color:#64748b;">Qbank Accuracy</div>
        </div>
        <div style="background:#0f172a;border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:#10b981;">${prediction.avgRetention}%</div>
          <div style="font-size:10px;color:#64748b;">Avg Retention</div>
        </div>
        <div style="background:#0f172a;border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:#8b5cf6;">${prediction.r1Pct}%</div>
          <div style="font-size:10px;color:#64748b;">R1 Coverage</div>
        </div>
        <div style="background:#0f172a;border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:#f59e0b;">${prediction.r2Pct}%</div>
          <div style="font-size:10px;color:#64748b;">R2 Coverage</div>
        </div>
      </div>

      <!-- Score breakdown -->
      <div style="background:#0f172a;border-radius:8px;padding:10px;margin-bottom:10px;">
        <div style="font-size:11px;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Score Breakdown</div>
        ${[
          ["Qbank accuracy ×40%",    prediction.breakdown.qbankAcc,    "#3b82f6"],
          ["Revision coverage ×30%", prediction.breakdown.revScore,    "#8b5cf6"],
          ["Completion ×15%",        prediction.breakdown.completion,  "#10b981"],
          ["Consistency ×10%",       prediction.breakdown.consistency, "#eab308"],
          ["Time pressure −",        `-${prediction.breakdown.timePenalty}`, "#ef4444"],
        ].map(([label, val, color]) => `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;padding:2px 0;">
            <span>${label}</span><span style="color:${color};font-weight:700;">${val}</span>
          </div>`).join("")}
      </div>

      <div style="font-size:12px;color:#64748b;padding:10px;background:#0f172a;border-radius:8px;">
        📅 Study est. completion: <strong style="color:#e2e8f0;">${prediction.studyCompletionDate}</strong>
      </div>
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

    <!-- Chapter Completion Velocity -->
    <div class="card">
      <div class="section-title">📈 Chapter Completion Velocity (12 Weeks)</div>
      ${(() => {
        let vData = buildCompletionVelocity();
        let hasData = vData.some(w => w.value > 0);
        if (!hasData) return '<div style="color:#64748b;font-size:13px;text-align:center;padding:20px;">Log study sessions to see weekly velocity.</div>';
        return buildLineChart(vData, { color: '#10b981', unit: ' ch' });
      })()}
      <div style="font-size:11px;color:#475569;margin-top:6px;">Topics/chapters completed per week — rising line means accelerating pace</div>
    </div>

    <!-- Week-over-week delta -->
    <div class="card">
      <div class="section-title">📊 This Week vs Last Week</div>
      ${buildWeekDeltaPanel()}
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

    <!-- Per-Subject Qbank Accuracy Trend -->
    <div class="card">
      <div class="section-title">📊 Qbank Accuracy — Per Subject</div>
      ${(() => {
        let subjectNames = Object.keys(studyData.subjects);
        if (!subjectNames.length) return '<div style="color:#64748b;font-size:13px;">No subjects yet.</div>';

        // Build per-subject session arrays
        let allSubjectData = {};
        subjectNames.forEach(name => {
          let sessions = [];
          Object.keys(studyData.dailyHistory || {}).sort().forEach(day => {
            let hist = studyData.dailyHistory[day];
            (hist.qbankEntries || []).forEach(e => {
              if (e.subject === name && e.total > 0)
                sessions.push({ label: day.slice(5), value: (e.correct / e.total) * 100 });
            });
          });
          allSubjectData[name] = sessions;
        });

        // Render tabs + charts via inline JS rendered at display time
        let _isLightTab = document.body.classList.contains('light');
        let tabButtons = subjectNames.map((name, i) => {
          let sessions = allSubjectData[name];
          let lastAcc  = sessions.length ? sessions[sessions.length-1].value : null;
          let trend    = sessions.length >= 2
            ? (sessions[sessions.length-1].value >= sessions[0].value ? "↑" : "↓") : "";
          let trendC   = trend === "↑" ? "#10b981" : trend === "↓" ? "#ef4444" : "#64748b";
          let tabBg    = i === 0
            ? (_isLightTab ? "rgba(59,130,246,0.15)" : "#1e3a5f")
            : (_isLightTab ? "" : "#0f172a");
          let tabColor = i === 0
            ? (_isLightTab ? "#1d4ed8" : "#93c5fd")
            : (_isLightTab ? "" : "#64748b");
          return `<div onclick="showSubjectChart('${name.replace(/'/g,"\\'")}',this)"
            style="cursor:pointer;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:600;
              background:${tabBg};color:${tabColor};
              display:flex;flex-direction:column;align-items:center;gap:2px;min-width:70px;text-align:center;">
            <span>${name}</span>
            <span style="font-size:11px;color:${trendC};">${lastAcc !== null ? lastAcc.toFixed(1)+"%" : "—"} ${trend}</span>
          </div>`;
        }).join("");

        // Embed session data as JSON for JS to read
        let dataJson = JSON.stringify(allSubjectData).replace(/</g,"\\x3c");
        let firstSubject = subjectNames[0];
        let firstData    = allSubjectData[firstSubject];

        return `
          <div style="overflow-x:auto;display:flex;gap:6px;padding-bottom:8px;margin-bottom:10px;" id="subjectAccTabs">
            ${tabButtons}
          </div>
          <div id="subjectAccChart">
            ${firstData.length >= 2
              ? buildLineChart(firstData, { color: "#3b82f6", unit: "%" })
              : `<div style="color:#64748b;font-size:13px;text-align:center;padding:24px;">
                  ${firstData.length === 0 ? "No Qbank sessions logged for " + firstSubject + " yet." : "Need at least 2 sessions to show trend."}
                </div>`}
          </div>
          <script>
            var _sAccData = ${dataJson};
            function showSubjectChart(name, el) {
              var isLight = document.body.classList.contains('light');
              document.querySelectorAll('#subjectAccTabs > div').forEach(d => {
                d.style.background = isLight ? '' : '#0f172a';
                d.style.color      = isLight ? '' : '#64748b';
              });
              el.style.background = isLight ? '' : '#1e3a5f';
              el.style.color      = isLight ? '' : '#93c5fd';
              var container = document.getElementById('subjectAccChart');
              var sessions = _sAccData[name] || [];
              if (sessions.length < 2) {
                container.innerHTML = '<div style="color:#64748b;font-size:13px;text-align:center;padding:24px;">'
                  + (sessions.length === 0 ? 'No Qbank sessions logged for '+name+' yet.' : 'Need at least 2 sessions to show trend.')
                  + '</div>';
                return;
              }
              container.innerHTML = buildLineChart(sessions, { color: '#3b82f6', unit: '%' });
            }
          <\/script>
        `;
      })()}
    </div>

    <!-- Global Accuracy Trend (all subjects combined) -->
    <div class="card">
      <div class="section-title">📊 Global Qbank Trend (30 days)</div>
      ${accuracyTrendData.length >= 2
        ? buildLineChart(accuracyTrendData, { color: "#8b5cf6", unit: "%" })
        : '<div style="color:#64748b;font-size:13px;text-align:center;padding:20px;">Log Qbank sessions to see your global trend.</div>'
      }
    </div>

    <!-- Qbank Volume Trend -->
    <div class="card">
      <div class="section-title">📊 Qbank Volume — Qs Per Day (30 Days)</div>
      ${(() => {
        let volData = buildQbankVolumeTrend(30);
        let hasData = volData.some(d => d.value > 0);
        if (!hasData) return '<div style="color:#64748b;font-size:13px;text-align:center;padding:20px;">Log Qbank sessions to see volume trend.</div>';
        return buildLineChart(volData, { color: '#f59e0b', unit: ' Qs' });
      })()}
      <div style="font-size:11px;color:#475569;margin-top:6px;">Questions attempted per day — tracks practice volume independently of accuracy</div>
    </div>

    <!-- Retention Projection -->
    <div class="card">
      <div class="section-title">🧠 Retention Forecast (14 days)</div>
      ${retentionData.length >= 2
        ? buildLineChart(retentionData, { color: "#10b981", unit: "%" })
        : '<div style="color:#64748b;font-size:13px;text-align:center;padding:20px;">Complete and review chapters to see your retention forecast.</div>'
      }
      <div style="font-size:11px;color:#475569;margin-top:6px;">
        Average across ${(() => { let n=0; Object.values(studyData.subjects).forEach(s=>s.units.forEach(u=>u.chapters.forEach(ch=>{if(ch.status==="completed"&&ch.lastReviewedOn)n++;}))); return n; })()} reviewed chapters · SM-2 decay model · accounts for revision depth
      </div>
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
      ${subjectStats.map(s => {
        let phaseChips = [
          s.phase.completed ? `<span style="background:#1e3a5f;color:#60a5fa;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:600;">Done✓</span>` : "",
          s.phase.r1        ? `<span style="background:#2e1a5e;color:#a78bfa;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:600;">R1✓</span>` : "",
          s.phase.r2        ? `<span style="background:#3b2200;color:#fbbf24;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:600;">R2✓</span>` : "",
          s.phase.r3        ? `<span style="background:#431407;color:#fb923c;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:600;">R3✓</span>` : "",
        ].filter(Boolean).join("");
        let hardCount = 0, easyCount = 0, medCount = 0, totalSubjCh = 0;
        studyData.subjects[s.name]?.units.forEach(u => u.chapters.forEach(ch => {
          totalSubjCh++;
          if (ch.difficulty === "hard") hardCount++;
          else if (ch.difficulty === "easy") easyCount++;
          else medCount++;
        }));
        let diffBar = totalSubjCh > 0 ? `
          <div style="display:flex;height:5px;border-radius:3px;overflow:hidden;margin-top:7px;gap:1px;">
            ${easyCount > 0 ? `<div style="flex:${easyCount};background:#10b981;" title="${easyCount} easy"></div>` : ''}
            ${medCount   > 0 ? `<div style="flex:${medCount};background:#64748b;" title="${medCount} medium"></div>` : ''}
            ${hardCount  > 0 ? `<div style="flex:${hardCount};background:#ef4444;" title="${hardCount} hard"></div>` : ''}
          </div>
          <div style="display:flex;gap:10px;margin-top:4px;font-size:10px;flex-wrap:wrap;">
            ${easyCount > 0 ? `<span style="color:#10b981;">● ${easyCount} easy</span>` : ''}
            ${medCount   > 0 ? `<span style="color:#64748b;">● ${medCount} med</span>` : ''}
            ${hardCount  > 0 ? `<span style="color:#ef4444;">● ${hardCount} hard</span>` : ''}
          </div>` : '';
        return `
        <div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #1e293b;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <strong style="font-size:14px;">${s.name}</strong>
            <div style="display:flex;gap:6px;align-items:center;">
              ${s.overdue > 0 ? `<span class="badge-overdue">⚠ ${s.overdue} overdue</span>` : ""}
              <span class="accuracy-badge ${s.accuracy>=75?"accuracy-high":s.accuracy>=50?"accuracy-mid":"accuracy-low"}">${s.accuracy.toFixed(1)}%</span>
            </div>
          </div>
          <div class="stat-bar" style="height:8px;margin-bottom:6px;">
            <div class="stat-fill ${s.accuracy>=75?"green":s.accuracy>=50?"yellow":"red"}" style="width:${Math.max(s.accuracy,0)}%"></div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
            ${phaseChips || `<span style="color:#475569;font-size:11px;">No phases completed</span>`}
            <span style="margin-left:auto;font-size:10px;color:#475569;">${s.size}</span>
          </div>
          ${diffBar}
        </div>`;
      }).join("")}
    </div>

    <!-- Weak Units + Hard Topics -->
    <div class="card">
      <div class="section-title">🎯 Needs Attention</div>
      ${(() => {
        // Weak qbank units
        let weakHtml = weakUnits.length === 0 ? "" : `
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Weak Qbank Units (&lt;60%)</div>
          ${weakUnits.slice(0, 6).map(u => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #0f172a;">
              <div>
                <div style="font-size:13px;font-weight:600;">${u.unit}</div>
                <div style="font-size:11px;color:#9ca3af;">${u.subject} · ${u.chapters} chapters</div>
              </div>
              <span class="accuracy-badge accuracy-low">${u.accuracy.toFixed(1)}%</span>
            </div>`).join("")}`;
        // Hard chapters not yet revised (revisionIndex = 0 but completed)
        let hardUnrevised = [];
        Object.keys(studyData.subjects).forEach(subName => {
          studyData.subjects[subName].units.forEach(unit => {
            unit.chapters.forEach(ch => {
              if (ch.difficulty === "hard" && ch.status === "completed" && ch.revisionIndex === 0) {
                hardUnrevised.push({ subName, unitName: unit.name, chName: ch.name });
              }
            });
          });
        });
        let hardHtml = hardUnrevised.length === 0 ? "" : `
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin:${weakUnits.length>0?"14px":0} 0 8px;">Hard Topics — Not Yet Revised</div>
          ${hardUnrevised.slice(0, 6).map(h => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #0f172a;">
              <div>
                <div style="font-size:13px;font-weight:600;">${h.chName}</div>
                <div style="font-size:11px;color:#9ca3af;">${h.subName} · ${h.unitName}</div>
              </div>
              <span style="background:#450a0a;color:#fca5a5;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;">Hard</span>
            </div>`).join("")}`;
        if (!weakHtml && !hardHtml) return '<div style="color:#9ca3af;font-size:13px;">No weak units or unrevised hard topics ✓</div>';
        return weakHtml + hardHtml;
      })()}
    </div>

    <!-- Overdue -->
    <div class="card">
      <div class="section-title">⏰ Overdue Revisions</div>
      ${(() => {
        if (totalOverdue === 0) return '<div style="color:#10b981;font-size:13px;">No overdue revisions ✓</div>';
        // Build per-subject overdue list
        let rows = [];
        Object.keys(studyData.subjects).forEach(subName => {
          let items = [];
          studyData.subjects[subName].units.forEach((unit, ui) => {
            unit.chapters.forEach((ch, ci) => {
              if (ch.nextRevision && ch.nextRevision < today()) {
                let daysLate = daysBetween(ch.nextRevision, today());
                items.push({ chName: ch.name, unitName: unit.name, daysLate });
              }
            });
          });
          if (!items.length) return;
          items.sort((a, b) => b.daysLate - a.daysLate);
          rows.push(`
            <div style="margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <strong style="font-size:13px;">${subName}</strong>
                <span class="badge-overdue">⚠ ${items.length}</span>
              </div>
              ${items.slice(0, 3).map(it => `
                <div style="display:flex;justify-content:space-between;padding:4px 0 4px 10px;border-left:2px solid #ef4444;margin-bottom:2px;">
                  <span style="font-size:11px;color:#94a3b8;">${it.unitName} → ${it.chName}</span>
                  <span style="font-size:11px;color:#ef4444;font-weight:600;">${it.daysLate}d late</span>
                </div>`).join("")}
              ${items.length > 3 ? `<div style="font-size:11px;color:#64748b;padding-left:10px;">+${items.length-3} more…</div>` : ""}
            </div>`);
        });
        return `<div style="font-size:12px;color:#9ca3af;margin-bottom:10px;">Memory decay is accelerating for <strong style="color:#ef4444;">${totalOverdue}</strong> chapters. Revise today.</div>` + rows.join("");
      })()}
    </div>

    <!-- Upcoming Revision Calendar (7-day) -->
    <div class="card">
      <div class="section-title">📅 Revision Load — Next 7 Days</div>
      ${buildUpcomingRevisionCalendar()}
    </div>

    <!-- Revision Load Forecast (14-day bar chart) -->
    <div class="card">
      <div class="section-title">📆 Revision Forecast — Next 14 Days</div>
      ${(() => {
        let fData = buildRevisionLoadForecast();
        let max   = Math.max(...fData.map(d => d.value), 1);
        let bars  = fData.map(d => {
          let h     = d.value > 0 ? Math.max(4, Math.round((d.value / max) * 70)) : 0;
          let color = d.value > 10 ? '#ef4444' : d.value > 6 ? '#f97316' : d.value > 3 ? '#eab308' : '#10b981';
          return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;gap:2px;">
            <div style="font-size:9px;color:#94a3b8;font-weight:600;min-height:12px;">${d.value || ''}</div>
            <div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:72px;">
              ${d.value > 0 ? `<div style="background:${color};height:${h}px;border-radius:3px 3px 0 0;"></div>` : ''}
            </div>
            <div style="font-size:9px;color:${d.label === 'Today' ? '#3b82f6' : '#475569'};text-align:center;overflow:hidden;white-space:nowrap;max-width:100%;font-weight:${d.label==='Today'?700:400};">${d.label}</div>
          </div>`;
        }).join('');
        let totalForecast = fData.reduce((s, d) => s + d.value, 0);
        return `<div style="display:flex;gap:3px;align-items:flex-end;padding:4px 2px 0;">${bars}</div>
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-top:10px;font-size:11px;color:#475569;">
            <span>${totalForecast} revisions scheduled over next 14 days</span>
            <div style="display:flex;gap:10px;">
              <span><span style="display:inline-block;width:9px;height:9px;background:#10b981;border-radius:2px;margin-right:3px;"></span>Light</span>
              <span><span style="display:inline-block;width:9px;height:9px;background:#eab308;border-radius:2px;margin-right:3px;"></span>Mod</span>
              <span><span style="display:inline-block;width:9px;height:9px;background:#f97316;border-radius:2px;margin-right:3px;"></span>Heavy</span>
              <span><span style="display:inline-block;width:9px;height:9px;background:#ef4444;border-radius:2px;margin-right:3px;"></span>Max</span>
            </div>
          </div>`;
      })()}
    </div>

    <!-- Settings -->
    <div class="card">
      <div class="section-title">⚙️ Exam Date</div>
      <input type="date" id="examDateInput" value="${studyData.examDate || "2026-12-01"}" style="width:100%;margin:6px 0;">
      <button onclick="updateExamDate()" style="width:100%;">Save ✓</button>
    </div>

    <!-- Time Tracking -->
    <div class="card">
      <div class="section-title">⏱ Time Tracking (Last 14 Days)</div>
      <div id="timeTrackingChart"></div>
    </div>

    <!-- Subject Topics Allocation -->
    <div class="card">
      <div class="section-title">📚 Study Allocation by Subject (14 Days)</div>
      ${buildSubjectTopicsAllocation(14)}
    </div>
  `;

  renderTimeTrackingChart();
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
  if (val) { studyData.examDate = val; saveData(); showToast("Saved ✓", 'success'); renderAnalytics(); }
}

// ── Time Tracking Chart ───────────────────────────────────────
function renderTimeTrackingChart() {
  let el = document.getElementById("timeTrackingChart");
  if (!el) return;

  // Collect last 14 days of time tracking data
  let days = [];
  for (let i = 13; i >= 0; i--) {
    let d   = addDays(today(), -i);
    let hist = studyData.dailyHistory?.[d];
    let tt   = hist?.timeTracking;
    days.push({
      date:  d,
      label: new Date(d + "T00:00:00").toLocaleDateString([], {month:"short",day:"numeric"}),
      study:    tt?.study?.actualMins    || 0,
      qbank:    tt?.qbank?.actualMins    || 0,
      revision: tt?.revision?.actualMins || 0,
      studyTarget:    tt?.study?.targetMins    || 0,
      qbankTarget:    tt?.qbank?.targetMins    || 0,
      revisionTarget: tt?.revision?.targetMins || 0,
    });
  }

  let hasAny = days.some(d => d.study > 0 || d.qbank > 0 || d.revision > 0);
  if (!hasAny) {
    el.innerHTML = `<div style="color:#475569;font-size:13px;text-align:center;padding:16px;">No time data yet — start a stopwatch after generating your plan.</div>`;
    return;
  }

  let maxMins = Math.max(...days.map(d => d.study + d.qbank + d.revision), 1);

  // Summary stats
  let trackedDays  = days.filter(d => d.study + d.qbank + d.revision > 0).length;
  let avgTotal     = trackedDays > 0 ? Math.round(days.reduce((s,d)=>s+d.study+d.qbank+d.revision,0)/trackedDays) : 0;
  let avgStudy     = trackedDays > 0 ? Math.round(days.reduce((s,d)=>s+d.study,0)/trackedDays) : 0;
  let totalStudyH  = (days.reduce((s,d)=>s+d.study,0)/60).toFixed(1);
  let totalQbankH  = (days.reduce((s,d)=>s+d.qbank,0)/60).toFixed(1);
  let onTargetDays = days.filter(d => {
    if (!d.studyTarget) return false;
    let actual = d.study + d.qbank + d.revision;
    let target = d.studyTarget + d.qbankTarget + d.revisionTarget;
    return target > 0 && Math.abs(actual - target) <= 20;
  }).length;

  // Stacked bar chart
  let bars = days.map(d => {
    let total  = d.study + d.qbank + d.revision;
    let target = d.studyTarget + d.qbankTarget + d.revisionTarget;
    let studyH  = (d.study/60).toFixed(1);
    let qbankH  = (d.qbank/60).toFixed(1);
    let revH    = (d.revision/60).toFixed(1);
    let overFlag = target > 0 && total > target + 15 ? `<div style="font-size:8px;color:#f87171;text-align:center;">+${total-target}m</div>` : "";
    return `
      <div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;gap:2px;">
        <div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:80px;gap:1px;" title="Study:${studyH}h Qbank:${qbankH}h Rev:${revH}h">
          ${d.study    > 0 ? `<div style="background:#3b82f6;height:${Math.round(d.study/maxMins*76)}px;border-radius:2px 2px 0 0;" title="Study ${studyH}h"></div>` : ""}
          ${d.qbank    > 0 ? `<div style="background:#8b5cf6;height:${Math.round(d.qbank/maxMins*76)}px;" title="Qbank ${qbankH}h"></div>` : ""}
          ${d.revision > 0 ? `<div style="background:#10b981;height:${Math.round(d.revision/maxMins*76)}px;border-radius:0;" title="Rev ${revH}h"></div>` : ""}
        </div>
        ${overFlag}
        <div style="font-size:9px;color:#475569;text-align:center;overflow:hidden;white-space:nowrap;max-width:100%;">${d.label.split(" ")[1]}</div>
      </div>`;
  }).join("");

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <div style="flex:1;min-width:70px;background:#0f172a;border-radius:8px;padding:9px;text-align:center;border:1px solid #1e293b;">
        <div style="font-size:17px;font-weight:700;color:#3b82f6;">${totalStudyH}h</div>
        <div style="font-size:10px;color:#475569;margin-top:2px;">📖 Study</div>
      </div>
      <div style="flex:1;min-width:70px;background:#0f172a;border-radius:8px;padding:9px;text-align:center;border:1px solid #1e293b;">
        <div style="font-size:17px;font-weight:700;color:#8b5cf6;">${totalQbankH}h</div>
        <div style="font-size:10px;color:#475569;margin-top:2px;">🧪 Qbank</div>
      </div>
      <div style="flex:1;min-width:70px;background:#0f172a;border-radius:8px;padding:9px;text-align:center;border:1px solid #1e293b;">
        <div style="font-size:17px;font-weight:700;color:#10b981;">${onTargetDays}</div>
        <div style="font-size:10px;color:#475569;margin-top:2px;">✓ On-target days</div>
      </div>
      <div style="flex:1;min-width:70px;background:#0f172a;border-radius:8px;padding:9px;text-align:center;border:1px solid #1e293b;">
        <div style="font-size:17px;font-weight:700;color:#f1f5f9;">${avgTotal}m</div>
        <div style="font-size:10px;color:#475569;margin-top:2px;">Avg/day</div>
      </div>
    </div>

    <div style="display:flex;gap:3px;align-items:flex-end;padding:0 2px;">${bars}</div>

    <div style="display:flex;gap:12px;margin-top:8px;font-size:11px;flex-wrap:wrap;">
      <span><span style="display:inline-block;width:10px;height:10px;background:#3b82f6;border-radius:2px;margin-right:4px;"></span>Study</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#8b5cf6;border-radius:2px;margin-right:4px;"></span>Qbank</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#10b981;border-radius:2px;margin-right:4px;"></span>Revision</span>
    </div>
  `;
}


// ─────────────────────────────────────────────────────────────────────────────
// FLASHCARD & NOTES ANALYTICS (async — loaded after main render)
// ─────────────────────────────────────────────────────────────────────────────

async function renderFlashcardAnalytics() {
  let container = document.getElementById("analyticsContainer");
  if (!container) return;

  // Fetch data from cardSync.js
  let dueCount = 0, totalCards = 0, retentionRate = 0;
  let reviewsByDay = {};
  let subjectCardMap = {};

  if (typeof getDueCardCount === "function") dueCount = await getDueCardCount();

  if (typeof fetchCards === "function") {
    let { data: allCards } = await fetchCards({ suspended: "all" });
    totalCards = allCards?.length || 0;

    // Build per-subject card counts
    (allCards || []).forEach(c => {
      let key = c.subject || "Unknown";
      subjectCardMap[key] = (subjectCardMap[key] || 0) + 1;
    });

    // Retention: % of cards with rating >= 3 in last 30 days
    if (typeof fetchReviews === "function") {
      let { data: reviews } = await fetchReviews({ days: 30 });
      if (reviews?.length) {
        let good = reviews.filter(r => r.rating >= 3).length;
        retentionRate = Math.round((good / reviews.length) * 100);

        // Reviews per day (last 14 days)
        reviews.forEach(r => {
          let day = (r.reviewed_at || "").substring(0, 10);
          if (day) reviewsByDay[day] = (reviewsByDay[day] || 0) + 1;
        });
      }
    }
  }

  // Build last-14-days review bar data
  let reviewBars = [];
  for (let i = 13; i >= 0; i--) {
    let d     = addDays(today(), -i);
    let count = reviewsByDay[d] || 0;
    let label = new Date(d + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" });
    reviewBars.push({ label: label.split(" ")[1], count });
  }
  let maxReviews = Math.max(...reviewBars.map(b => b.count), 1);

  let barsHtml = reviewBars.map(b => {
    let h = b.count > 0 ? Math.max(4, Math.round(b.count / maxReviews * 70)) : 0;
    return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;gap:2px;">
      <div style="background:#8b5cf6;height:${h}px;width:100%;border-radius:3px 3px 0 0;min-height:${b.count>0?4:0}px;" title="${b.count} reviews"></div>
      <div style="font-size:9px;color:#475569;">${b.label}</div>
    </div>`;
  }).join("");

  // Per-subject breakdown
  let subjRows = Object.entries(subjectCardMap)
    .sort((a, b) => b[1] - a[1])
    .map(([subj, cnt]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #0f172a;">
        <span style="font-size:12px;color:#cbd5e1;">${subj}</span>
        <span style="background:#2e1a5e;color:#a78bfa;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;">${cnt} cards</span>
      </div>`).join("") || '<div style="color:#475569;font-size:12px;">No cards yet.</div>';

  let cardSection = document.createElement("div");
  cardSection.className = "card";
  cardSection.innerHTML = `
    <div class="section-title">🃏 Flashcard Analytics</div>
    <div class="analytics-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px;">
      <div class="stat-box">
        <div class="stat-big" style="color:#ef4444;">${dueCount}</div>
        <div class="stat-label">Due Now</div>
      </div>
      <div class="stat-box">
        <div class="stat-big" style="color:#8b5cf6;">${totalCards}</div>
        <div class="stat-label">Total Cards</div>
      </div>
      <div class="stat-box">
        <div class="stat-big" style="color:#10b981;">${retentionRate}%</div>
        <div class="stat-label">30d Retention</div>
      </div>
    </div>

    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Reviews — Last 14 Days</div>
    <div style="display:flex;gap:3px;align-items:flex-end;height:80px;padding:0 2px;margin-bottom:14px;">
      ${barsHtml}
    </div>

    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Cards by Subject</div>
    ${subjRows}

    <a href="browse.html" style="display:block;text-align:center;margin-top:12px;padding:10px;background:#1e293b;border-radius:10px;color:#a78bfa;font-size:13px;font-weight:600;text-decoration:none;">
      Go to Flashcards →
    </a>
  `;

  container.appendChild(cardSection);
}


async function renderNotesAnalytics() {
  let container = document.getElementById("analyticsContainer");
  if (!container) return;

  if (typeof getNotesCoverageStats === "function" === false) return;

  let { data: stats } = await getNotesCoverageStats();
  if (!stats || !Object.keys(stats).length) return;

  let totalChapters = 0, withNote = 0;
  Object.values(stats).forEach(s => { totalChapters += s.total; withNote += s.withNote; });
  let overallPct = totalChapters > 0 ? Math.round((withNote / totalChapters) * 100) : 0;

  let subjectRows = Object.entries(stats)
    .sort((a, b) => a[1].pct - b[1].pct)
    .map(([subj, s]) => {
      let color = s.pct >= 75 ? "#10b981" : s.pct >= 40 ? "#eab308" : "#ef4444";
      return `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:12px;color:#cbd5e1;">${subj}</span>
            <span style="font-size:12px;font-weight:700;color:${color};">${s.pct}%
              <span style="color:#475569;font-weight:400;">(${s.withNote}/${s.total})</span>
            </span>
          </div>
          <div class="stat-bar" style="height:6px;">
            <div class="stat-fill" style="width:${s.pct}%;background:${color};"></div>
          </div>
        </div>`;
    }).join("");

  let notesSection = document.createElement("div");
  notesSection.className = "card";
  notesSection.innerHTML = `
    <div class="section-title">📝 Notes Coverage</div>
    <div style="text-align:center;padding:10px 0 16px;">
      <div style="font-size:42px;font-weight:900;color:${overallPct>=75?"#10b981":overallPct>=40?"#eab308":"#ef4444"};">${overallPct}%</div>
      <div style="font-size:12px;color:#64748b;">${withNote} of ${totalChapters} chapters have notes</div>
    </div>
    <div class="stat-bar" style="height:10px;margin-bottom:16px;">
      <div class="stat-fill ${overallPct>=75?"green":overallPct>=40?"yellow":"red"}" style="width:${overallPct}%;"></div>
    </div>

    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Coverage by Subject</div>
    ${subjectRows}

    <a href="notes.html" style="display:block;text-align:center;margin-top:12px;padding:10px;background:#1e293b;border-radius:10px;color:#34d399;font-size:13px;font-weight:600;text-decoration:none;">
      Go to Notes →
    </a>
  `;

  container.appendChild(notesSection);
}


// ─── 365-Day Study Heatmap ───────────────────────────────────────────────────
function renderStudyHeatmap365(container) {
  const DAYS = 365;
  const today_ = new Date();
  // Build ordered list of date strings, oldest first
  let dates = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    let d = new Date(today_); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }

  // Score each day: 0-3 (none / light / moderate / full)
  const score = d => {
    let e = studyData.dailyHistory?.[d];
    if (!e) return 0;
    return Math.min(3, (e.study ? 1 : 0) + (e.qbank ? 1 : 0) + (e.revision || e.eveningSubmitted ? 1 : 0));
  };
  const colors = ["#1e293b", "#1d4ed8", "#3b82f6", "#10b981"]; // none, light, med, full

  // Week-column layout (like GitHub): 52 weeks × 7 rows
  // Pad start so first date falls on correct week-day column
  let firstDow = new Date(dates[0]).getDay(); // 0=Sun
  let cells = []; // flatten to 52*7 with nulls for padding
  for (let i = 0; i < firstDow; i++) cells.push(null);
  dates.forEach(d => cells.push(d));
  // Pad end to full week
  while (cells.length % 7 !== 0) cells.push(null);

  let weeks = [];
  for (let w = 0; w < cells.length / 7; w++) weeks.push(cells.slice(w*7, w*7+7));

  // Month labels
  let monthLabels = [];
  weeks.forEach((wk, wi) => {
    let firstDate = wk.find(Boolean);
    if (!firstDate) return;
    let mn = new Date(firstDate).toLocaleString('default',{month:'short'});
    let prevFirst = wi > 0 ? weeks[wi-1].find(Boolean) : null;
    let prevMn    = prevFirst ? new Date(prevFirst).toLocaleString('default',{month:'short'}) : '';
    if (mn !== prevMn) monthLabels[wi] = mn;
  });

  let wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = `<div class="section-title">🗓 365-Day Study Heatmap</div>`;

  let scroll = document.createElement('div');
  scroll.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;';

  let inner = document.createElement('div');
  inner.style.cssText = 'display:inline-flex;flex-direction:column;gap:0;min-width:max-content;';

  // Month row
  let mRow = document.createElement('div');
  mRow.style.cssText = 'display:flex;gap:3px;margin-bottom:2px;padding-left:0;';
  weeks.forEach((_, wi) => {
    let lbl = document.createElement('div');
    lbl.style.cssText = 'width:13px;font-size:9px;color:#475569;text-align:center;flex-shrink:0;';
    if (monthLabels[wi]) lbl.textContent = monthLabels[wi];
    mRow.appendChild(lbl);
  });
  inner.appendChild(mRow);

  // Day-of-week labels + grid
  let gridRow = document.createElement('div');
  gridRow.style.cssText = 'display:flex;gap:2px;';

  // Day labels column
  let dayLabels = document.createElement('div');
  dayLabels.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-right:4px;';
  ['S','M','T','W','T','F','S'].forEach((d,i) => {
    let l = document.createElement('div');
    l.style.cssText = 'font-size:9px;color:#475569;height:13px;line-height:13px;';
    l.textContent = i % 2 === 1 ? d : '';
    dayLabels.appendChild(l);
  });
  gridRow.appendChild(dayLabels);

  // Week columns
  weeks.forEach(wk => {
    let col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    wk.forEach(d => {
      let cell = document.createElement('div');
      cell.style.cssText = 'width:13px;height:13px;border-radius:2px;flex-shrink:0;';
      if (!d) { cell.style.background = 'transparent'; }
      else {
        let s = score(d); cell.style.background = colors[s];
        cell.title = d + ' — ' + ['No activity','Light','Moderate','Full session'][s];
      }
      col.appendChild(cell);
    });
    gridRow.appendChild(col);
  });
  inner.appendChild(gridRow);
  scroll.appendChild(inner);
  wrap.appendChild(scroll);

  // Legend + stats
  let activeDays = dates.filter(d => score(d) > 0).length;
  let fullDays   = dates.filter(d => score(d) === 3).length;
  let legend = document.createElement('div');
  legend.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:6px;';
  legend.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;font-size:11px;color:#64748b;">
      <span>Less</span>
      ${colors.map(c=>`<div style="width:12px;height:12px;border-radius:2px;background:${c};"></div>`).join('')}
      <span>More</span>
    </div>
    <div style="font-size:11px;color:#64748b;">
      <span style="color:#10b981;font-weight:700;">${activeDays}</span> active days &nbsp;·&nbsp;
      <span style="color:#3b82f6;font-weight:700;">${fullDays}</span> full sessions
    </div>`;
  wrap.appendChild(legend);
  container.appendChild(wrap);
}

// ── NEW HELPER FUNCTIONS (improvements 1-8) ─────────────────────────────────

// #2 — Today's Priority Card
function buildTodayPriority(reqPace, avgDaily, totalOverdue, remaining, daysLeft) {
  let todayTarget = Math.ceil(reqPace);
  let hist      = studyData.dailyHistory?.[today()];
  let todayDone = (hist?.studyEntries || []).reduce((s, e) => s + (e.topics || []).length, 0);
  let qToday    = (hist?.qbankEntries || []).reduce((s, e) => s + (e.total || 0), 0);
  let allDayVals = Object.values(studyData.dailyHistory || {});
  let qDayVals  = allDayVals.filter(h => (h.qbankEntries || []).reduce((s, e) => s + (e.total || 0), 0) > 0);
  let avgQDay   = qDayVals.length > 0
    ? Math.round(qDayVals.reduce((s, h) => s + (h.qbankEntries || []).reduce((ss, e) => ss + (e.total || 0), 0), 0) / qDayVals.length)
    : 20;
  let overdueColor = totalOverdue > 10 ? '#ef4444' : totalOverdue > 0 ? '#f97316' : '#10b981';
  let paceOk    = reqPace === 0 || avgDaily >= reqPace;
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;">
      <div style="background:${totalOverdue > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'};border:1px solid ${overdueColor}44;border-radius:10px;padding:12px 10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">⏰ Overdue</div>
        <div style="font-size:26px;font-weight:800;color:${overdueColor};line-height:1;">${totalOverdue}</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">${totalOverdue > 0 ? 'Revise first' : 'All clear ✓'}</div>
      </div>
      <div style="background:${paceOk ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'};border:1px solid ${paceOk ? '#10b98144' : '#ef444444'};border-radius:10px;padding:12px 10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">📖 Chapters</div>
        <div style="font-size:26px;font-weight:800;color:${paceOk ? '#10b981' : '#ef4444'};line-height:1;">${todayDone}<span style="font-size:13px;color:#64748b;"> /${todayTarget}</span></div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">${paceOk ? 'On pace ✓' : 'Behind pace'}</div>
      </div>
      <div style="background:rgba(139,92,246,0.1);border:1px solid #8b5cf644;border-radius:10px;padding:12px 10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">🧪 Qbank</div>
        <div style="font-size:26px;font-weight:800;color:#8b5cf6;line-height:1;">${qToday}<span style="font-size:13px;color:#64748b;"> /${avgQDay}</span></div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">target today</div>
      </div>
      <div style="background:rgba(245,158,11,0.1);border:1px solid #f59e0b44;border-radius:10px;padding:12px 10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">📚 Left</div>
        <div style="font-size:26px;font-weight:800;color:#f59e0b;line-height:1;">${remaining}</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">${daysLeft} days left</div>
      </div>
    </div>`;
}

// #6 — Week-over-week delta panel
function buildWeekDeltaPanel() {
  function weekStats(offsetStart, offsetEnd) {
    let chapters = 0, qTotal = 0, qCorrect = 0, revDays = 0;
    for (let i = offsetStart; i < offsetEnd; i++) {
      let h = studyData.dailyHistory?.[addDays(today(), -i)];
      if (!h || !h.eveningSubmitted) continue;
      if (h.revision) revDays++;
      chapters += (h.studyEntries || []).reduce((s, e) => s + (e.topics || []).length, 0);
      (h.qbankEntries || []).forEach(e => { qTotal += e.total || 0; qCorrect += e.correct || 0; });
    }
    return { chapters, qAcc: qTotal > 0 ? (qCorrect / qTotal) * 100 : null, revDays, qTotal };
  }
  let tw = weekStats(0, 7), lw = weekStats(7, 14);
  function fmtDelta(a, b, decimals) {
    if (a === null || b === null) return '<span style="color:#64748b;">—</span>';
    let d = a - b;
    let color = d > 0 ? '#10b981' : d < 0 ? '#ef4444' : '#64748b';
    let sign  = d > 0 ? '↑' : d < 0 ? '↓' : '→';
    return `<span style="font-size:12px;color:${color};font-weight:700;">${sign}${Math.abs(decimals ? +d.toFixed(decimals) : d)}${decimals ? '%' : ''}</span>`;
  }
  let rows = [
    ['📖 Chapters done',  tw.chapters,                        lw.chapters,                        false],
    ['🧪 Qbank Qs',       tw.qTotal,                          lw.qTotal,                          false],
    ['🎯 Qbank accuracy', tw.qAcc !== null ? tw.qAcc.toFixed(1) + '%' : '—', lw.qAcc !== null ? lw.qAcc.toFixed(1) + '%' : '—', true],
    ['🔄 Revision days',  tw.revDays,                         lw.revDays,                         false],
  ];
  return `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:260px;">
    <thead><tr>
      <th style="text-align:left;padding:5px 8px;color:#64748b;font-size:10px;text-transform:uppercase;border-bottom:1px solid #1e293b;">Metric</th>
      <th style="text-align:center;padding:5px 8px;color:#3b82f6;font-size:10px;text-transform:uppercase;border-bottom:1px solid #1e293b;">This Week</th>
      <th style="text-align:center;padding:5px 8px;color:#64748b;font-size:10px;text-transform:uppercase;border-bottom:1px solid #1e293b;">Last Week</th>
      <th style="text-align:center;padding:5px 8px;color:#64748b;font-size:10px;text-transform:uppercase;border-bottom:1px solid #1e293b;">Δ</th>
    </tr></thead>
    <tbody>${rows.map(([label, tw_, lw_, isPct]) => `
      <tr>
        <td style="padding:7px 8px;color:#94a3b8;border-bottom:1px solid #0f172a;">${label}</td>
        <td style="padding:7px 8px;text-align:center;color:#e2e8f0;font-weight:700;border-bottom:1px solid #0f172a;">${tw_}</td>
        <td style="padding:7px 8px;text-align:center;color:#64748b;border-bottom:1px solid #0f172a;">${lw_}</td>
        <td style="padding:7px 8px;text-align:center;border-bottom:1px solid #0f172a;">${isPct
          ? fmtDelta(tw_.endsWith('%') ? parseFloat(tw_) : null, lw_.endsWith('%') ? parseFloat(lw_) : null, 1)
          : fmtDelta(tw_, lw_, 0)}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

// #4 — Qbank Volume trend (data builder)
function buildQbankVolumeTrend(days) {
  let bars = [];
  for (let i = days - 1; i >= 0; i--) {
    let d    = addDays(today(), -i);
    let hist = studyData.dailyHistory?.[d];
    let q    = (hist?.qbankEntries || []).reduce((s, e) => s + (e.total || 0), 0);
    bars.push({ label: d.slice(8), value: q });
  }
  return bars;
}

// #5 — Chapter Completion Velocity (by week)
function buildCompletionVelocity() {
  let weeks = [];
  for (let w = 11; w >= 0; w--) {
    let count = 0;
    for (let i = 0; i < 7; i++) {
      let hist = studyData.dailyHistory?.[addDays(today(), -(w * 7 + i))];
      count += (hist?.studyEntries || []).reduce((s, e) => s + (e.topics || []).length, 0);
    }
    let startDate = addDays(today(), -(w * 7 + 6));
    weeks.push({ label: startDate.slice(5), value: count });
  }
  return weeks;
}

// #1 — Revision Load Forecast (next 14 days)
function buildRevisionLoadForecast() {
  let days = [];
  for (let i = 0; i <= 13; i++) {
    let d = addDays(today(), i);
    let count = 0;
    Object.values(studyData.subjects).forEach(s => s.units.forEach(u => u.chapters.forEach(ch => {
      if (ch.nextRevision === d) count++;
    })));
    days.push({ label: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.slice(5), value: count, date: d });
  }
  return days;
}

// #8 — Upcoming Revision Calendar (7-day grid)
function buildUpcomingRevisionCalendar() {
  let days = [];
  for (let i = 0; i <= 6; i++) {
    let d = addDays(today(), i);
    let due = 0, overdue = 0;
    Object.values(studyData.subjects).forEach(s => s.units.forEach(u => u.chapters.forEach(ch => {
      if (i === 0 && ch.nextRevision && ch.nextRevision < d) overdue++;
      if (ch.nextRevision === d) due++;
    })));
    let dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d + 'T00:00:00').getDay()];
    days.push({ d, due, overdue, label: d.slice(8), dayName, isToday: i === 0 });
  }
  let maxLoad = Math.max(...days.map(dy => dy.due + dy.overdue), 1);
  return `
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">
      ${days.map(dy => {
        let total  = dy.due + dy.overdue;
        let fillH  = total > 0 ? Math.max(6, Math.round((total / maxLoad) * 48)) : 0;
        let color  = dy.overdue > 0 ? '#ef4444' : total > 8 ? '#f97316' : total > 4 ? '#eab308' : '#10b981';
        return `<div style="text-align:center;">
          <div style="font-size:9px;color:${dy.isToday ? '#3b82f6' : '#64748b'};font-weight:${dy.isToday ? 700 : 400};margin-bottom:3px;">${dy.dayName}</div>
          <div style="height:60px;background:#0f172a;border-radius:6px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding:3px;
            border:1px solid ${dy.isToday ? '#3b82f6' : '#1e293b'};">
            ${total > 0 ? `<div style="width:90%;background:${color};height:${fillH}px;border-radius:3px;margin-bottom:2px;"></div>` : ''}
            <div style="font-size:11px;font-weight:700;color:${total > 0 ? color : '#334155'};">${total || '·'}</div>
          </div>
          <div style="font-size:9px;color:#475569;margin-top:3px;">${dy.label}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:10px;margin-top:9px;font-size:11px;color:#64748b;flex-wrap:wrap;">
      <span><span style="display:inline-block;width:9px;height:9px;background:#10b981;border-radius:2px;margin-right:3px;"></span>Light ≤4</span>
      <span><span style="display:inline-block;width:9px;height:9px;background:#eab308;border-radius:2px;margin-right:3px;"></span>Moderate</span>
      <span><span style="display:inline-block;width:9px;height:9px;background:#f97316;border-radius:2px;margin-right:3px;"></span>Heavy</span>
      <span><span style="display:inline-block;width:9px;height:9px;background:#ef4444;border-radius:2px;margin-right:3px;"></span>Overdue</span>
    </div>`;
}

// #3 — Subject Topics Allocation
function buildSubjectTopicsAllocation(lookbackDays) {
  let map = {};
  for (let i = 0; i < lookbackDays; i++) {
    let hist = studyData.dailyHistory?.[addDays(today(), -i)];
    (hist?.studyEntries || []).forEach(e => {
      let key = e.subject || 'Unknown';
      map[key] = (map[key] || 0) + (e.topics || []).length;
    });
  }
  let total = Object.values(map).reduce((s, v) => s + v, 0);
  if (total === 0) return `<div style="color:#475569;font-size:13px;text-align:center;padding:16px;">No study sessions logged in last ${lookbackDays} days.</div>`;
  let sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  let max    = sorted[0][1];
  let colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#f97316','#06b6d4','#ec4899'];
  return sorted.map(([subj, cnt], i) => {
    let pct  = Math.round((cnt / total) * 100);
    let barW = Math.round((cnt / max) * 100);
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-wrap:wrap;gap:4px;">
          <span style="font-size:12px;color:#cbd5e1;font-weight:600;">${subj}</span>
          <span style="font-size:12px;color:${colors[i % colors.length]};font-weight:700;">${cnt} topics <span style="color:#64748b;font-weight:400;">(${pct}%)</span></span>
        </div>
        <div class="stat-bar" style="height:8px;"><div style="height:100%;border-radius:3px;width:${barW}%;background:${colors[i % colors.length]};transition:width .3s;"></div></div>
      </div>`;
  }).join('');
}

// ─── Boot: run main renderAnalytics then async card/notes sections ────────
document.addEventListener("DOMContentLoaded", function () {
  renderAnalytics();

  let container = document.getElementById("analyticsContainer");

  // 365-day heatmap (sync, uses studyData)
  if (container) renderStudyHeatmap365(container);

  // After main render, inject async flashcard + notes sections
  Promise.all([
    renderFlashcardAnalytics(),
    renderNotesAnalytics(),
  ]).then(() => {
    // Also run the time tracking chart (needs DOM to exist first)
    renderTimeTrackingChart();
    renderIntelligenceAlerts("analyticsAlerts");
  }).catch(e => console.warn("analytics async sections:", e));
});

function renderSubjects() {
  let container = document.getElementById("subjectsContainer");
  if (!container) return;
  container.innerHTML = "";

  // ── Exam Countdown Banner ──
  let daysLeft = daysUntilExam();
  if (daysLeft > 0 && daysLeft <= 30) {
    let cdBanner = document.createElement("div");
    cdBanner.style.cssText = "background:linear-gradient(135deg,#450a0a,#7f1d1d);border:1px solid #ef4444;border-radius:12px;padding:14px 16px;margin:0 14px 12px;";
    cdBanner.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:16px;font-weight:800;color:#fca5a5;">🚨 EXAM COUNTDOWN MODE</div>
          <div style="font-size:12px;color:#fca5a5;opacity:0.85;margin-top:3px;">New study paused — revisions & Qbank only</div>
        </div>
        <div style="text-align:center;background:rgba(0,0,0,0.3);border-radius:10px;padding:8px 14px;">
          <div style="font-size:28px;font-weight:900;color:#ef4444;">${daysLeft}</div>
          <div style="font-size:10px;color:#fca5a5;text-transform:uppercase;letter-spacing:.05em;">days left</div>
        </div>
      </div>
    `;
    container.appendChild(cdBanner);
  }

  // ── Streak Banner ──
  let streak = calculateStreak();
  if (streak > 0) {
    let banner = document.createElement("div");
    banner.style.cssText = "background:linear-gradient(135deg,#7c2d12,#c2410c);border-radius:12px;padding:12px 16px;margin:0 14px 12px;display:flex;align-items:center;justify-content:space-between;";
    banner.innerHTML = `
      <div>
        <div style="font-size:22px;font-weight:800;color:white;">🔥 ${streak} Day Streak</div>
        <div style="font-size:12px;color:#fed7aa;margin-top:2px;">Keep it going!</div>
      </div>
      <div style="font-size:36px;">🏆</div>
    `;
    container.appendChild(banner);
  }

  // ── Intelligence Alerts ──
  let alertsWrap = document.createElement("div");
  alertsWrap.style.cssText = "margin:0 14px 12px;";
  alertsWrap.innerHTML = `<div id="homeAlerts"></div>`;
  container.appendChild(alertsWrap);

  // ── Phase Banner ──
  let phases = getGlobalPhaseStats();
  let phaseBanner = document.createElement("div");
  phaseBanner.className = "card";
  phaseBanner.innerHTML = `
    <div class="section-title">📊 Phase Progress</div>
    <div class="phase-grid">
      <div class="phase-item">
        <div class="phase-label">Completed</div>
        <div class="phase-pct" style="color:#3b82f6">${phases.completed.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.completed.pct}%;background:#3b82f6"></div></div>
        <div class="phase-count">${phases.completed.count}/${phases.total} ch</div>
      </div>
      <div class="phase-item">
        <div class="phase-label">R1</div>
        <div class="phase-pct" style="color:#8b5cf6">${phases.r1.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.r1.pct}%;background:#8b5cf6"></div></div>
        <div class="phase-count">${phases.r1.count}/${phases.total} ch</div>
      </div>
      <div class="phase-item">
        <div class="phase-label">R2</div>
        <div class="phase-pct" style="color:#f59e0b">${phases.r2.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.r2.pct}%;background:#f59e0b"></div></div>
        <div class="phase-count">${phases.r2.count}/${phases.total} ch</div>
      </div>
      <div class="phase-item">
        <div class="phase-label">R3</div>
        <div class="phase-pct" style="color:#f97316">${phases.r3.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.r3.pct}%;background:#f97316"></div></div>
        <div class="phase-count">${phases.r3.count}/${phases.total} ch</div>
      </div>
      <div class="phase-item">
        <div class="phase-label">Qbank</div>
        <div class="phase-pct" style="color:#10b981">${phases.qbank.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.qbank.pct}%;background:#10b981"></div></div>
        <div class="phase-count">${phases.qbank.count}/${phases.totalUnits} un</div>
      </div>
    </div>
  `;
  container.appendChild(phaseBanner);

  // ── Weekly Report Teaser (Sundays or grade C/D) ──
  let todayDate = new Date();
  let isSunday  = todayDate.getDay() === 0;
  let weekMissed = 0;
  for (let i = 1; i <= 7; i++) {
    let d = addDays(today(), -i);
    if (!studyData.dailyHistory?.[d]?.eveningSubmitted) weekMissed++;
  }
  let weekConsistency = Math.round(((7 - weekMissed) / 7) * 100);

  if (isSunday || weekConsistency < 70) {
    let wGrade = weekConsistency >= 85 ? "A" : weekConsistency >= 70 ? "B" : weekConsistency >= 55 ? "C" : "D";
    let wColor = { A:"#10b981", B:"#3b82f6", C:"#eab308", D:"#ef4444" }[wGrade];
    let wEl = document.createElement("div");
    wEl.className = "card";
    wEl.style.cssText = `border-color:${wColor};`;
    wEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div class="section-title" style="margin-bottom:2px;">📋 Weekly Report</div>
          <div style="font-size:12px;color:#94a3b8;">This week's consistency: <strong style="color:${wColor};">${weekConsistency}%</strong></div>
        </div>
        <div style="width:44px;height:44px;border-radius:50%;background:${wColor}22;border:2px solid ${wColor};
          display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:${wColor};">${wGrade}</div>
      </div>
      <a href="analytics.html" style="display:block;margin-top:10px;text-align:center;background:#1e293b;color:#93c5fd;border-radius:8px;padding:7px;font-size:12px;text-decoration:none;">View Full Report →</a>
    `;
    container.appendChild(wEl);
  }

  // ── Subject Cards ──
  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];
    let totalCh = 0, doneCh = 0;
    subject.units.forEach(u => {
      totalCh += u.chapters.length;
      u.chapters.forEach(ch => { if (ch.status === "completed") doneCh++; });
    });
    let pct = percentage(doneCh, totalCh);
    let overdue = getOverdueCount(subjectName);
    let acc = subjectAccuracy(subject);
    let phase = detectPhaseStatus(subjectName);

    let ptr = subject.pointer || { unit: 0, chapter: 0 };
    let nextUnit    = subject.units[ptr.unit];
    let nextChapter = nextUnit?.chapters[ptr.chapter];
    let nextText    = nextChapter
      ? `${nextUnit.name} → ${nextChapter.name}`
      : "✅ All chapters completed";

    let card = document.createElement("div");
    card.className = "subject-summary-card";
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <strong style="font-size:14px;">${subjectName}</strong>
        <div style="display:flex;gap:6px;align-items:center;">
          ${overdue > 0 ? `<span class="badge-overdue">⚠ ${overdue}</span>` : ""}
          ${acc > 0 ? `<span class="accuracy-badge ${acc>=75?"accuracy-high":acc>=50?"accuracy-mid":"accuracy-low"}">${acc.toFixed(1)}%</span>` : ""}
        </div>
      </div>
      <div style="font-size:11px;color:#64748b;margin-bottom:4px;">Next: ${nextText}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:5px;">
        ${phase.completed ? '<span class="phase-pill p1">Done✓</span>' : ""}
        ${phase.r1        ? '<span class="phase-pill p2">R1✓</span>'   : ""}
        ${phase.r2        ? '<span class="phase-pill p3">R2✓</span>'   : ""}
        ${phase.r3        ? '<span class="phase-pill" style="background:#f97316;color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">R3✓</span>' : ""}
      </div>
      <div class="stat-bar">
        <div class="stat-fill ${pct>=75?"green":pct>=40?"yellow":"red"}" style="width:${pct}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
        <span style="font-size:11px;color:#6b7280;">${pct}% (${doneCh}/${totalCh} chapters)</span>
        <button style="font-size:11px;padding:5px 10px;margin:0;"
          onclick="completeTopic('${subjectName}'); renderSubjects();">✓ Complete Next</button>
      </div>
    `;
    container.appendChild(card);
  });

  // ── Retention ──
  let retDiv = document.createElement("div");
  retDiv.className = "card";
  retDiv.style.textAlign = "center";
  retDiv.innerHTML = `
    <div class="section-title">Projected Retention</div>
    <div style="font-size:36px;font-weight:800;color:#3b82f6;">${calculateRetention()}%</div>
    <div style="font-size:12px;color:#9ca3af;margin-top:4px;">${daysUntilExam()} days until exam</div>
  `;
  container.appendChild(retDiv);

  renderRevisionSection();
  renderIntelligenceAlerts("homeAlerts");
  renderPlannerQuickStatus();
}

function renderRevisionSection() {
  let due = getRevisionsDueToday();
  if (!due.length) return;
  let container = document.getElementById("subjectsContainer");
  if (!container) return;

  const SHOW_LIMIT = 5;
  let overdueCount = due.filter(r => r.isOverdue).length;

  let revDiv = document.createElement("div");
  revDiv.className = "card";
  revDiv.style.borderColor = overdueCount > 0 ? "#ef4444" : "#f59e0b";
  revDiv.id = "revisionSectionCard";

  // Header row with count + collapse toggle
  revDiv.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <div class="section-title" style="margin-bottom:0;">
        🔁 Revisions Due
        <span style="font-size:12px;font-weight:700;background:${overdueCount > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'};color:${overdueCount > 0 ? '#ef4444' : '#f59e0b'};padding:2px 8px;border-radius:10px;margin-left:6px;">${due.length}</span>
        ${overdueCount > 0 ? `<span style="font-size:11px;color:#ef4444;margin-left:6px;">(${overdueCount} overdue)</span>` : ''}
      </div>
      <a href="planner.html" style="font-size:11px;color:#3b82f6;text-decoration:none;flex-shrink:0;">View in Planner →</a>
    </div>`;

  // Scrollable list container — shows SHOW_LIMIT items, rest hidden
  let listWrap = document.createElement("div");
  listWrap.id = "revListWrap";
  listWrap.style.cssText = "max-height:270px;overflow-y:auto;border-radius:8px;border:1px solid #1e3350;";

  due.forEach((item, i) => {
    let row = document.createElement("div");
    row.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:8px 10px;gap:8px;border-top:${i===0?'none':'1px solid #1e3350'};${item.isOverdue ? 'background:rgba(239,68,68,0.04);' : ''}`;
    let overdueTag = item.isOverdue
      ? `<span style="color:#ef4444;font-size:10px;font-weight:700;background:rgba(239,68,68,0.12);padding:1px 5px;border-radius:4px;">${item.overdueDays}d overdue</span>`
      : "";
    row.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.subjectName}</div>
        <div style="font-size:11px;color:#7a90b0;display:flex;align-items:center;gap:6px;margin-top:1px;">
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.unitName} → ${item.topicName}</span>
          ${overdueTag}
        </div>
      </div>
      <button style="font-size:11px;padding:4px 10px;margin:0;flex-shrink:0;background:#1e3a5f;color:#93c5fd;border:1px solid #2a4f80;border-radius:6px;min-height:unset;"
        onclick="markRevisionDone('${item.subjectName}',${item.unitIndex},${item.chapterIndex}); renderSubjects();">Done</button>
    `;
    listWrap.appendChild(row);
  });

  revDiv.appendChild(listWrap);

  // Footer: count + link to planner if many
  if (due.length > SHOW_LIMIT) {
    let footer = document.createElement("div");
    footer.style.cssText = "text-align:center;padding:8px 0 0;font-size:11px;color:#64748b;";
    footer.innerHTML = `Scroll to see all ${due.length} chapters · <a href="planner.html" style="color:#3b82f6;text-decoration:none;">Open Planner →</a>`;
    revDiv.appendChild(footer);
  }

  container.appendChild(revDiv);
}

// ── Planner Quick Status (shown on Home page) ────────────────
function renderPlannerQuickStatus() {
  let el = document.getElementById("plannerQuickStatus");
  if (!el) return;
  let todayKey = today();
  let hist = studyData.dailyHistory?.[todayKey];
  let submitted = hist?.eveningSubmitted;

  if (submitted) {
    let studyCount = (hist.studyEntries || []).reduce((s, e) => s + (e.topics || []).length, 0);
    let qCount = (hist.qbankEntries || []).reduce((s, e) => s + (e.total || 0), 0);
    let revCount = (hist.revisedItems || []).length;
    el.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;">
        <span style="background:#0f2b1a;color:#4ade80;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;">✅ Evening Submitted</span>
        ${studyCount > 0 ? `<span style="background:#1e293b;color:#93c5fd;padding:4px 10px;border-radius:6px;font-size:11px;">📖 ${studyCount} topic${studyCount>1?"s":""}</span>` : ""}
        ${qCount > 0 ? `<span style="background:#1e293b;color:#86efac;padding:4px 10px;border-radius:6px;font-size:11px;">🧪 ${qCount}Q done</span>` : ""}
        ${revCount > 0 ? `<span style="background:#1e293b;color:#c4b5fd;padding:4px 10px;border-radius:6px;font-size:11px;">🔁 ${revCount} revised</span>` : ""}
      </div>`;
  } else {
    el.innerHTML = `<div style="font-size:11px;color:#ef4444;margin-top:4px;">🌙 Evening update pending — log your progress!</div>`;
  }
}



function renderEveningUpdate() {
  let inner = document.getElementById("eveningUpdateInner");
  if (!inner) return;
  _studyEntryCount = 0;
  _qbankEntryCount = 0;

  let todayKey = today();
  let submitted = studyData.dailyHistory?.[todayKey]?.eveningSubmitted;

  if (submitted) {
    let hist = studyData.dailyHistory[todayKey];

    let studyLines = (hist.studyEntries || []).map(e => {
      let topicsStr = (e.topics || []).join(", ") || "—";
      return `<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #1a3a1a;">
        <span style="font-size:15px;flex-shrink:0;">📖</span>
        <div>
          <div style="font-weight:600;font-size:13px;">${e.subject} — ${e.unit}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">${topicsStr}</div>
        </div>
      </div>`;
    }).join("");

    let qbankLines = (hist.qbankEntries || []).map(e => {
      let acc = e.total > 0 ? ((e.correct / e.total) * 100).toFixed(0) : 0;
      let accColor = acc >= 75 ? "#4ade80" : acc >= 50 ? "#fbbf24" : "#f87171";
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #1a3a1a;">
        <span style="font-size:15px;flex-shrink:0;">🧪</span>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:13px;">${e.subject} — ${e.unit}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">${e.total} questions</div>
        </div>
        <span style="font-weight:700;font-size:14px;color:${accColor};">${acc}% (${e.correct}/${e.total})</span>
      </div>`;
    }).join("");

    let revCount = (hist.revisedItems || []).length;
    let submittedTime = hist.submittedAt ? new Date(hist.submittedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : "";
    let topicsCount   = (hist.studyEntries||[]).reduce((s,e)=>s+(e.topics||[]).length,0);
    let questionsCount = (hist.qbankEntries||[]).reduce((s,e)=>s+(e.total||0),0);

    // ── Time tracking summary ──
    let tt = hist.timeTracking;
    let timeHtml = "";
    if (tt) {
      const _row = (label, icon, data) => {
        if (!data) return "";
        let overUnder = data.overUnder;
        let badge = overUnder > 5
          ? `<span style="color:#f87171;font-size:11px;">+${overUnder}m over</span>`
          : overUnder < -5
            ? `<span style="color:#93c5fd;font-size:11px;">${overUnder}m under</span>`
            : `<span style="color:#4ade80;font-size:11px;">on target</span>`;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;">
          <span style="color:#94a3b8;">${icon} ${label}</span>
          <span style="color:#f1f5f9;font-weight:600;">${data.actualMins}m <span style="color:#475569;font-weight:400;">/ ${data.targetMins}m target</span> ${badge}</span>
        </div>`;
      };
      timeHtml = `
        <div style="background:#0f172a;border-radius:10px;padding:10px;margin-bottom:12px;border:1px solid #1e293b;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">⏱ Time Tracked</div>
          ${_row("Study",    "📖", tt.study)}
          ${_row("Qbank",    "🧪", tt.qbank)}
          ${_row("Revision", "🔁", tt.revision)}
        </div>`;
    }

    inner.innerHTML = `
      <div style="background:linear-gradient(135deg,#0f2b1a,#0a1f12);border:1px solid #16a34a;border-radius:14px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-size:14px;font-weight:800;color:#4ade80;">✅ Evening Update Submitted</div>
          ${submittedTime ? `<div style="font-size:11px;color:#64748b;">at ${submittedTime}</div>` : ""}
        </div>
        ${timeHtml}
        ${studyLines || '<div style="font-size:12px;color:#475569;padding:7px 0;">No study logged</div>'}
        ${qbankLines || '<div style="font-size:12px;color:#475569;padding:7px 0;">No Qbank logged</div>'}
        ${revCount > 0 ? `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;"><span style="font-size:15px;">🔁</span><div style="font-size:13px;">${revCount} revision${revCount>1?"s":""} completed</div></div>` : ""}
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
          <div style="flex:1;min-width:70px;background:#0a2b15;border-radius:8px;padding:9px;text-align:center;">
            <div style="font-size:18px;font-weight:700;color:#4ade80;">${topicsCount}</div>
            <div style="font-size:10px;color:#475569;margin-top:2px;">Topics</div>
          </div>
          <div style="flex:1;min-width:70px;background:#0a2b15;border-radius:8px;padding:9px;text-align:center;">
            <div style="font-size:18px;font-weight:700;color:#60a5fa;">${questionsCount}</div>
            <div style="font-size:10px;color:#475569;margin-top:2px;">Questions</div>
          </div>
          <div style="flex:1;min-width:70px;background:#0a2b15;border-radius:8px;padding:9px;text-align:center;">
            <div style="font-size:18px;font-weight:700;color:#c4b5fd;">${revCount}</div>
            <div style="font-size:10px;color:#475569;margin-top:2px;">Revisions</div>
          </div>
        </div>
      </div>
      <button onclick="deleteEveningUpdate()"
        style="width:100%;background:#1a0a0a;border:1px solid #450a0a;color:#fca5a5;padding:10px;font-size:12px;font-weight:600;border-radius:10px;">
        🗑 Reset &amp; Resubmit Today's Evening Update
      </button>
    `;
    return;
  }

  // Build form
  // ── Live time summary from stopwatches ──
  let liveTT = (typeof swGetTodaySummary === "function") ? swGetTodaySummary() : null;
  let liveTimeHtml = "";
  if (liveTT) {
    const _row = (label, icon, data) => {
      if (!data || data.actualMins === 0) return "";
      let badge = data.overUnder > 5
        ? `<span style="color:#f87171;">+${data.overUnder}m</span>`
        : data.overUnder < -5
          ? `<span style="color:#93c5fd;">${data.overUnder}m</span>`
          : `<span style="color:#4ade80;">✓</span>`;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px;">
        <span style="color:#94a3b8;">${icon} ${label}</span>
        <span style="color:#f1f5f9;font-weight:600;">${data.actualMins}m / ${data.targetMins}m ${badge}</span>
      </div>`;
    };
    let rows = [_row("Study","📖",liveTT.study), _row("Qbank","🧪",liveTT.qbank), _row("Revision","🔁",liveTT.revision)].filter(Boolean).join("");
    if (rows) {
      liveTimeHtml = `
        <div style="background:#0f172a;border-radius:10px;padding:10px;margin-bottom:12px;border:1px solid #1e3a5f;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">⏱ Today's Tracked Time</div>
          ${rows}
          <div style="font-size:10px;color:#334155;margin-top:6px;">Auto-submitted with your evening report</div>
        </div>`;
    }
  }

  inner.innerHTML = `
    ${liveTimeHtml}
    <div style="background:#0f172a;border-radius:12px;padding:14px;margin-bottom:10px;border:1px solid #1e293b;">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;display:flex;align-items:center;gap:6px;">📖 Study Log</div>
      <div id="studyEntries"></div>
      <button onclick="addStudyEntry()"
        style="width:100%;background:#1e3a5f;color:#93c5fd;font-size:12px;padding:9px;margin-top:4px;border-radius:8px;">
        + Add Another Subject
      </button>
    </div>

    <div style="background:#0f172a;border-radius:12px;padding:14px;margin-bottom:10px;border:1px solid #1e293b;">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;display:flex;align-items:center;gap:6px;">🧪 Qbank Log</div>
      <div id="qbankEntries"></div>
      <button onclick="addQbankEntry()"
        style="width:100%;background:#1a2e1a;color:#86efac;font-size:12px;padding:9px;margin-top:4px;border-radius:8px;">
        + Add Another Subject
      </button>
    </div>

    <div style="background:#0f172a;border-radius:12px;padding:14px;margin-bottom:14px;border:1px solid #1e293b;">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;display:flex;align-items:center;gap:6px;">🔁 Revision Log</div>
      <div id="revisionCheckboxList"></div>
    </div>

    <button onclick="submitEvening()"
      style="width:100%;background:linear-gradient(135deg,#16a34a,#15803d);padding:14px;font-size:15px;font-weight:700;border-radius:12px;">
      Submit Evening Update ✓
    </button>
  `;

  addStudyEntry();
  addQbankEntry();
  renderRevisionCheckboxList();
}

let _studyEntryCount = 0;
let _qbankEntryCount = 0;

function addStudyEntry() {
  let container = document.getElementById("studyEntries");
  if (!container) return;
  let id = _studyEntryCount++;
  let subjectNames = Object.keys(studyData.subjects);

  let div = document.createElement("div");
  div.id = `studyEntry-${id}`;
  div.style.cssText = "border:1px solid #1e293b;border-radius:10px;padding:12px;margin-bottom:10px;background:#0a1628;";

  let options = subjectNames.map(n => `<option value="${n}">${n}</option>`).join("");

  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">📖 Subject ${id + 1}</span>
      ${id > 0 ? `<button onclick="removeStudyEntry(${id})" style="background:transparent;color:#ef4444;padding:2px 8px;font-size:12px;margin:0;border:1px solid #450a0a;border-radius:6px;">✕ Remove</button>` : ""}
    </div>
    <select id="sSub-${id}" style="width:100%;margin-bottom:8px;" onchange="_studyFillUnits(${id})">${options}</select>
    <select id="sUnit-${id}" style="width:100%;margin-bottom:10px;" onchange="_studyFillTopics(${id})"></select>
    <div id="sTopicsWrap-${id}">
      <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Topics Completed — tap to select</label>
      <div id="sTopicsChips-${id}" style="display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow-y:auto;padding:2px;"></div>
    </div>
  `;
  container.appendChild(div);
  _studyFillUnits(id);
}

function removeStudyEntry(id) {
  let el = document.getElementById(`studyEntry-${id}`);
  if (el) el.remove();
}

function _studyFillUnits(id) {
  let subj = document.getElementById(`sSub-${id}`)?.value;
  let unitSel = document.getElementById(`sUnit-${id}`);
  if (!unitSel || !subj || !studyData.subjects[subj]) return;
  unitSel.innerHTML = studyData.subjects[subj].units.map((u, i) =>
    `<option value="${i}">${u.name}</option>`
  ).join("");
  _studyFillTopics(id);
}

function _studyFillTopics(id) {
  let subj = document.getElementById(`sSub-${id}`)?.value;
  let ui   = parseInt(document.getElementById(`sUnit-${id}`)?.value) || 0;
  let chipsContainer = document.getElementById(`sTopicsChips-${id}`);
  if (!chipsContainer || !subj || !studyData.subjects[subj]) return;
  let chapters = studyData.subjects[subj].units[ui]?.chapters || [];
  chipsContainer.innerHTML = chapters.length === 0
    ? `<span style="color:#64748b;font-size:12px;">No chapters in this unit</span>`
    : chapters.map((ch, ci) => {
        let completed = ch.status === "completed";
        return `<button type="button" class="topic-chip${completed ? " already-done" : ""}" data-ci="${ci}"
          onclick="toggleTopicChip(this)"
          style="padding:5px 12px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;
            background:${completed ? "#1a3a1a" : "#1e293b"};
            color:${completed ? "#4ade80" : "#94a3b8"};
            border:1px solid ${completed ? "#166534" : "#334155"};
            transition:all 0.15s;white-space:nowrap;">
          ${completed ? "✓ " : ""}${ch.name}
        </button>`;
      }).join("");
}

function toggleTopicChip(btn) {
  if (btn.classList.contains("selected")) {
    btn.classList.remove("selected");
    btn.style.background = btn.classList.contains("already-done") ? "#1a3a1a" : "#1e293b";
    btn.style.color = btn.classList.contains("already-done") ? "#4ade80" : "#94a3b8";
    btn.style.border = `1px solid ${btn.classList.contains("already-done") ? "#166534" : "#334155"}`;
  } else {
    btn.classList.add("selected");
    btn.style.background = "#1e3a5f";
    btn.style.color = "#93c5fd";
    btn.style.border = "1px solid #3b82f6";
  }
}

function addQbankEntry() {
  let container = document.getElementById("qbankEntries");
  if (!container) return;
  let id = _qbankEntryCount++;
  let subjectNames = Object.keys(studyData.subjects);

  let div = document.createElement("div");
  div.id = `qbankEntry-${id}`;
  div.style.cssText = "border:1px solid #1e293b;border-radius:8px;padding:10px;margin-bottom:8px;";

  let options = subjectNames.map(n => `<option value="${n}">${n}</option>`).join("");

  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:12px;color:#94a3b8;font-weight:600;">Qbank ${id + 1}</span>
      ${id > 0 ? `<button onclick="removeQbankEntry(${id})" style="background:transparent;color:#ef4444;padding:2px 6px;font-size:12px;margin:0;border:1px solid #450a0a;border-radius:5px;">✕</button>` : ""}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <select id="qSub-${id}" style="flex:1;min-width:100px;" onchange="_qbankFillUnits(${id})">${options}</select>
      <select id="qUnit-${id}" style="flex:1;min-width:100px;"></select>
    </div>
    <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;">
      <div>
        <label style="font-size:11px;color:#94a3b8;display:block;">Total Qs</label>
        <input type="number" id="qTotal-${id}" style="width:70px;" min="0" placeholder="0">
      </div>
      <div>
        <label style="font-size:11px;color:#94a3b8;display:block;">Correct</label>
        <input type="number" id="qCorrect-${id}" style="width:70px;" min="0" placeholder="0">
      </div>
    </div>
  `;
  container.appendChild(div);
  _qbankFillUnits(id);
}

function removeQbankEntry(id) {
  let el = document.getElementById(`qbankEntry-${id}`);
  if (el) el.remove();
}

function _qbankFillUnits(id) {
  let subj = document.getElementById(`qSub-${id}`)?.value;
  let sel  = document.getElementById(`qUnit-${id}`);
  if (!sel || !subj || !studyData.subjects[subj]) return;
  sel.innerHTML = studyData.subjects[subj].units.map((u, i) =>
    `<option value="${i}">${u.name}</option>`
  ).join("");
}

function renderRevisionCheckboxList() {
  let container = document.getElementById("revisionCheckboxList");
  if (!container) return;
  container.innerHTML = "";
  let due = getRevisionsDueToday();
  if (!due.length) {
    container.innerHTML = `<span style="color:#9ca3af;font-size:13px;">No revisions due today ✓</span>`;
    return;
  }
  // Scrollable wrapper after 5 items
  let wrapper = document.createElement("div");
  if (due.length > 5) {
    wrapper.style.cssText = "max-height:220px;overflow-y:auto;border:1px solid #1e293b;border-radius:8px;padding:4px 0;";
  }
  due.forEach(item => {
    let label = document.createElement("label");
    label.style.cssText = "display:block;padding:6px 8px;font-size:13px;cursor:pointer;border-bottom:1px solid #1e293b;";
    label.innerHTML = `
      <input type="checkbox" value="${item.subjectName}|${item.unitIndex}|${item.chapterIndex}" style="margin-right:8px;">
      ${item.subjectName} — ${item.unitName} → ${item.topicName}
      ${item.isOverdue ? `<span style="color:#ef4444;font-size:11px;"> (${item.overdueDays}d overdue)</span>` : ""}
    `;
    wrapper.appendChild(label);
  });
  container.appendChild(wrapper);
}

function deleteEveningUpdate() {
  if (!confirm("Delete today's evening update and resubmit?")) return;
  let todayKey = today();
  if (studyData.dailyHistory?.[todayKey]) {
    // Reverse study entries
    (studyData.dailyHistory[todayKey].studyEntries || []).forEach(entry => {
      let subject = studyData.subjects[entry.subject];
      if (!subject) return;
      let unit = subject.units.find(u => u.name === entry.unit);
      if (!unit) return;
      entry.topicIndices.forEach(ci => {
        let ch = unit.chapters[ci];
        if (ch) {
          ch.status = "not-started";
          ch.revisionDates = [];
          ch.nextRevision = null;
          ch.revisionIndex = 0;
          ch.completedOn = null;
        }
      });
      fixPointer(entry.subject);
    });
    // Reverse qbank entries
    (studyData.dailyHistory[todayKey].qbankEntries || []).forEach(entry => {
      let subject = studyData.subjects[entry.subject];
      if (!subject) return;
      let ui = subject.units.findIndex(u => u.name === entry.unit);
      if (ui < 0) return;
      let unit = subject.units[ui];
      unit.qbankStats.total   = Math.max(0, (unit.qbankStats.total || 0) - entry.total);
      unit.qbankStats.correct = Math.max(0, (unit.qbankStats.correct || 0) - entry.correct);
    });
    delete studyData.dailyHistory[todayKey];
  }
  _studyEntryCount = 0;
  _qbankEntryCount = 0;
  saveData();
  renderEveningUpdate();
  renderSubjects();
}

// Keep backward compatibility: old populateAllEveningSelectors calls now just render the form
function populateAllEveningSelectors() {
  renderEveningUpdate();
}

function renderSavedPlan() {
  let plan = studyData.dailyPlan;
  let planEl = document.getElementById("planOutput");
  if (!plan || !planEl) return;
  if (plan.date !== today()) return;

  let hoursInput = document.getElementById("dailyHours");
  if (hoursInput && plan.hours) hoursInput.value = plan.hours;

  let daysLeft   = daysUntilExam();
  let burnoutWarn = (plan.burnoutAdj && plan.burnoutAdj < 1.0)
    ? `<div style="color:#ef4444;font-size:12px;margin-top:6px;">⚠ Burnout detected — load reduced ${((1-plan.burnoutAdj)*100).toFixed(0)}%</div>` : "";
  let examAlert = daysLeft <= 30
    ? `<div style="color:#f59e0b;font-size:12px;margin-top:4px;">🔔 ${daysLeft} days to exam — revision priority elevated</div>` : "";

  // ── Replay saved HTML ──
  if (plan.renderedHTML) {
    planEl.innerHTML = plan.renderedHTML;
    document.getElementById("generateButton").disabled = true;
    _swAttach(plan);
    // Append live flashcard block (async, fresh due count)
    if (typeof _appendFlashcardsPlanBlock === "function") _appendFlashcardsPlanBlock();
    // Enrich revision rows with card + note badges (async)
    if (typeof _enrichRevisionBlock === "function") _enrichRevisionBlock();
    return;
  }

  // ── Exam countdown mode (legacy) ──
  if (plan.examCountdownMode) {
    planEl.innerHTML = `
      <div style="background:#450a0a;border:1px solid #ef4444;border-radius:10px;padding:10px;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:800;color:#fca5a5;margin-bottom:4px;">🚨 EXAM COUNTDOWN MODE — ${daysLeft} days left</div>
        <div style="font-size:12px;color:#fca5a5;opacity:0.85;">New study paused. Focus 100% on revision and Qbank mastery.</div>
      </div>
      <div style="padding:4px 0;font-size:14px;line-height:1.9;">
        <strong>🔁 Revision:</strong> ${plan.revisionTime} hrs — ${plan.revisionCount} chapters due${(plan.overdueCount||0)>0?` (${plan.overdueCount} overdue)`:""}<br>
        <strong>🧪 Qbank:</strong> ${plan.qbankTime} hrs — weak units first
        ${burnoutWarn}${examAlert}
      </div>`;
    document.getElementById("generateButton").disabled = true;
    if (typeof _appendFlashcardsPlanBlock === "function") _appendFlashcardsPlanBlock();
    if (typeof _enrichRevisionBlock === "function") _enrichRevisionBlock();
    return;
  }

  // ── Legacy fallback ──
  let subjectObj = studyData.subjects[plan.study?.subject];
  if (!subjectObj) { planEl.innerHTML = "<strong>Plan subject was deleted.</strong>"; return; }
  let nextText = plan.nextText || (() => {
    let ptr = subjectObj.pointer || { unit:0, chapter:0 };
    let nu = subjectObj.units[ptr.unit], nc = nu?.chapters[ptr.chapter];
    return nc ? `${nu.name} → ${nc.name}` : "All done";
  })();
  planEl.innerHTML = `
    <div style="padding:8px 0;font-size:14px;line-height:1.8;">
      <strong>📖 Study:</strong> ${plan.studyTime} hrs — ${plan.study.subject} — <em>${nextText}</em><br>
      <strong>🧪 Qbank:</strong> ${plan.qbankTime} hrs — ${plan.qbank.subject}<br>
      <strong>🔁 Revision:</strong> ${plan.revisionTime} hrs — ${plan.revisionCount} chapters due${(plan.overdueCount||0)>0?` (${plan.overdueCount} overdue)`:""}
      ${burnoutWarn}${examAlert}
    </div>`;
  document.getElementById("generateButton").disabled = true;
  _swAttach(plan);
}

// Attach stopwatches after any plan HTML is rendered.
// If sw-slot-* divs exist (new HTML) → inject there.
// If not (old saved HTML) → append stopwatch blocks directly to planOutput.
function _swAttach(plan) {
  if (typeof swInject !== "function") return;

  let types = [
    { key: "study",    hrs: parseFloat(plan.studyTime    || 0) },
    { key: "qbank",    hrs: parseFloat(plan.qbankTime    || 0) },
    { key: "revision", hrs: parseFloat(plan.revisionTime || 0) }
  ];

  // Ensure stopwatches object exists with correct targets
  if (!plan.stopwatches) {
    plan.stopwatches = {};
    types.forEach(t => {
      plan.stopwatches[t.key] = {
        accumulated: 0, startedAt: null, running: false,
        targetSecs: Math.round(t.hrs * 3600)
      };
    });
    saveData();
  }

  let planEl = document.getElementById("planOutput");

  types.forEach(({ key, hrs }) => {
    // Try slot first (new HTML)
    let slot = document.getElementById(`sw-slot-${key}`);
    if (slot) {
      swInject(key, hrs);
      return;
    }
    // No slot — append a labelled block directly
    let labels = { study:"📖 Study", qbank:"🧪 Qbank", revision:"🔁 Revision" };
    let wrapper = document.createElement("div");
    wrapper.style.cssText = "margin-top:8px;";
    wrapper.innerHTML = `
      <div style="background:#0f172a;border-radius:10px 10px 0 0;padding:8px 12px;border:1px solid #1e293b;border-bottom:none;">
        <span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">${labels[key]}</span>
      </div>
      <div id="sw-slot-${key}"></div>`;
    planEl.appendChild(wrapper);
    swInject(key, hrs);
  });
}

function renderHeatmap() {
  let container = document.getElementById("heatmapContainer");
  if (!container) return;
  container.innerHTML = "";

  let last60 = [];
  for (let i = 59; i >= 0; i--) {
    let d = new Date(); d.setDate(d.getDate() - i);
    last60.push(d.toISOString().split("T")[0]);
  }

  let grid = document.createElement("div");
  grid.style.cssText = "display:flex;flex-wrap:wrap;gap:3px;";
  const colors = ["#1f2937", "#f97316", "#eab308", "#16a34a"];

  last60.forEach(date => {
    let box = document.createElement("div");
    box.style.cssText = "width:16px;height:16px;border-radius:3px;";
    box.title = date;
    let score = 0;
    let e = studyData.dailyHistory[date];
    if (e) score = (e.study?1:0) + (e.qbank?1:0) + (e.revision?1:0);
    box.style.background = colors[score] || colors[0];
    grid.appendChild(box);
  });

  container.appendChild(grid);

  let legend = document.createElement("div");
  legend.style.cssText = "display:flex;gap:10px;margin-top:8px;font-size:11px;color:#9ca3af;flex-wrap:wrap;";
  legend.innerHTML = [
    ["#1f2937","None"], ["#f97316","1/3"], ["#eab308","2/3"], ["#16a34a","Full"]
  ].map(([c,l]) => `<span><span style="display:inline-block;width:10px;height:10px;background:${c};border-radius:2px;margin-right:3px;"></span>${l}</span>`).join("");
  container.appendChild(legend);
}

// ═══════════════════════════════════════════════════════════
// CARDS DUE — nav badge + home page widget
// ═══════════════════════════════════════════════════════════

async function updateCardsBadge() {
  if (typeof getDueCardCount !== "function") return;
  try {
    let count = await getDueCardCount();
    let badge = document.getElementById("nav-cards-badge");
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = "inline-block";
      } else {
        badge.style.display = "none";
      }
    }
    // Also update home page card-due widget if present
    let homeCount = document.getElementById("home-cards-due-count");
    if (homeCount) homeCount.textContent = count;
  } catch (e) {
    console.warn("updateCardsBadge:", e);
  }
}

// Render a "Cards Due Today" quick-action card on the home page
// Called from renderSubjects() after the phase banner
function renderCardsDueWidget(container) {
  if (typeof getDueCardCount !== "function") return;
  getDueCardCount().then(count => {
    let el = document.createElement("div");
    el.className = "card";
    el.style.cssText = "background:linear-gradient(135deg,#0f2040,#1a2f52);border-color:#3b4f7a;";
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-weight:700;font-size:15px;color:#93c5fd;margin-bottom:3px;">🃏 Flashcards</div>
          <div style="font-size:13px;color:#e2e8f0;">
            <span id="home-cards-due-count" style="font-weight:800;color:${count>0?"#f87171":"#10b981"};">${count}</span>
            ${count === 1 ? "card due" : "cards due"} today
          </div>
        </div>
        <a href="${count > 0 ? 'review.html' : 'browse.html'}" style="background:#3b82f6;color:white;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;">
          ${count > 0 ? "Review →" : "Browse →"}
        </a>
      </div>`;
    container.appendChild(el);
  });
}

// Hook into renderSubjects — append widget after phase banner renders
let _origRenderSubjects = renderSubjects;
renderSubjects = function() {
  _origRenderSubjects.apply(this, arguments);
  let container = document.getElementById("subjectsContainer");
  if (container) renderCardsDueWidget(container);
};

// Run badge update on every page load
document.addEventListener("DOMContentLoaded", function() {
  updateCardsBadge();
});

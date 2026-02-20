function renderSubjects() {
  let container = document.getElementById("subjectsContainer");
  if (!container) return;
  container.innerHTML = "";

  // ── Streak Banner ──
  let streak = calculateStreak();
  if (streak > 0) {
    let streakBanner = document.createElement("div");
    streakBanner.style.cssText = "background:linear-gradient(135deg,#7c2d12,#c2410c);border-radius:12px;padding:12px 16px;margin:0 14px 12px;display:flex;align-items:center;justify-content:space-between;";
    streakBanner.innerHTML = `
      <div>
        <div style="font-size:22px;font-weight:800;color:white;">🔥 ${streak} Day Streak</div>
        <div style="font-size:12px;color:#fed7aa;margin-top:2px;">Keep it going! Study today to maintain your streak.</div>
      </div>
      <div style="font-size:36px;">🏆</div>
    `;
    container.appendChild(streakBanner);
  }

  // ── Intelligence Alerts ──
  let alertsDiv = document.createElement("div");
  alertsDiv.style.cssText = "margin: 0 14px 12px;";
  alertsDiv.innerHTML = `<div id="homeAlerts"></div>`;
  container.appendChild(alertsDiv);

  // ── Phase Summary Banner ──
  let phases = getGlobalPhaseStats();
  let phaseBanner = document.createElement("div");
  phaseBanner.className = "card";
  phaseBanner.innerHTML = `
    <div class="section-title">📊 Phase Progress</div>
    <div class="phase-grid">
      <div class="phase-item">
        <div class="phase-label">Phase 1<br><small>Study</small></div>
        <div class="phase-pct" style="color:#3b82f6">${phases.phase1.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.phase1.pct}%;background:#3b82f6"></div></div>
        <div class="phase-count">${phases.phase1.count}/${phases.total}</div>
      </div>
      <div class="phase-item">
        <div class="phase-label">Phase 2<br><small>Rev 2+</small></div>
        <div class="phase-pct" style="color:#8b5cf6">${phases.phase2.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.phase2.pct}%;background:#8b5cf6"></div></div>
        <div class="phase-count">${phases.phase2.count}/${phases.total}</div>
      </div>
      <div class="phase-item">
        <div class="phase-label">Phase 3<br><small>Rev 3+</small></div>
        <div class="phase-pct" style="color:#f59e0b">${phases.phase3.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.phase3.pct}%;background:#f59e0b"></div></div>
        <div class="phase-count">${phases.phase3.count}/${phases.total}</div>
      </div>
      <div class="phase-item">
        <div class="phase-label">Qbank<br><small>Done</small></div>
        <div class="phase-pct" style="color:#10b981">${phases.qbank.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.qbank.pct}%;background:#10b981"></div></div>
        <div class="phase-count">${phases.qbank.count}/${phases.total}</div>
      </div>
    </div>
  `;
  container.appendChild(phaseBanner);

  // ── Subject Cards ──
  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];
    let div = document.createElement("div");
    div.className = "subject-summary-card";

    let completedCount = subject.topics.filter(t => t.status === "completed").length;
    let totalTopics = subject.topics.length;
    let pct = percentage(completedCount, totalTopics);
    let overdue = getOverdueCount(subjectName);
    let acc = subjectAccuracy(subject).toFixed(1);
    let phase = detectPhaseStatus(subjectName);

    let nextTopic = subject.pointer < totalTopics
      ? subject.topics[subject.pointer].name
      : "✅ All topics completed";

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <strong>${subjectName}</strong>
        <div style="display:flex;gap:6px;align-items:center;">
          ${overdue > 0 ? `<span class="badge-overdue">⚠ ${overdue}</span>` : ""}
          <span class="accuracy-badge ${acc>=75?"accuracy-high":acc>=50?"accuracy-mid":"accuracy-low"}">${acc}%</span>
        </div>
      </div>
      <div style="font-size:12px;color:#9ca3af;margin-bottom:4px;">Next: ${nextTopic}</div>
      <div style="display:flex;gap:5px;font-size:11px;margin-bottom:6px;flex-wrap:wrap;">
        ${phase.phase1 ? '<span class="phase-pill p1">P1✓</span>' : ""}
        ${phase.phase2 ? '<span class="phase-pill p2">P2✓</span>' : ""}
        ${phase.phase3 ? '<span class="phase-pill p3">P3✓</span>' : ""}
      </div>
      <div class="stat-bar">
        <div class="stat-fill ${pct>=75?"green":pct>=40?"yellow":"red"}" style="width:${pct}%"></div>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">${pct}% (${completedCount}/${totalTopics})</div>
      <button style="margin-top:8px;font-size:12px;padding:6px 10px;"
        onclick="completeTopic('${subjectName}'); renderSubjects();">
        ✓ Mark Next Topic Complete
      </button>
    `;
    container.appendChild(div);
  });

  // ── Retention Card ──
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

  // Render intelligence alerts after layout
  renderIntelligenceAlerts("homeAlerts");
}

function renderRevisionSection() {
  let due = getRevisionsDueToday();
  if (due.length === 0) return;
  let container = document.getElementById("subjectsContainer");
  if (!container) return;

  let revDiv = document.createElement("div");
  revDiv.className = "card";
  revDiv.style.borderColor = "#ef4444";
  revDiv.style.borderWidth = "2px";

  revDiv.innerHTML = `<div class="section-title">🔁 Revisions Due (${due.length})</div>`;

  due.forEach(item => {
    let row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #334155;";
    row.innerHTML = `
      <div>
        <strong>${item.subjectName}</strong> — ${item.topicName}
        ${item.isOverdue ? `<span style="color:#ef4444;font-size:11px;"> (${item.overdueDays}d overdue)</span>` : ""}
      </div>
      <button style="font-size:12px;padding:4px 10px;margin-top:0;"
        onclick="markRevisionDone('${item.subjectName}', ${item.topicIndex}); renderSubjects();">Done</button>
    `;
    revDiv.appendChild(row);
  });

  container.appendChild(revDiv);
}

function populateAllEveningSelectors() {
  if (!document.getElementById("studySubject")) return;
  populateSelector("studySubject", "studyTopic");
  populateSelector("qbankSubject", "qbankTopic");
  renderRevisionCheckboxList();
}

function populateSelector(subjectId, topicId) {
  let subjectSelect = document.getElementById(subjectId);
  if (!subjectSelect) return;
  subjectSelect.innerHTML = "";
  Object.keys(studyData.subjects).forEach(subjectName => {
    let opt = document.createElement("option");
    opt.value = subjectName; opt.text = subjectName;
    subjectSelect.appendChild(opt);
  });
  subjectSelect.onchange = function () { populateTopicDropdown(subjectId, topicId); };
  populateTopicDropdown(subjectId, topicId);
}

function populateTopicDropdown(subjectId, topicId) {
  let subjectName = document.getElementById(subjectId).value;
  let topicSelect = document.getElementById(topicId);
  if (!topicSelect) return;
  topicSelect.innerHTML = "";
  if (!subjectName || !studyData.subjects[subjectName]) return;
  studyData.subjects[subjectName].topics.forEach((topic, index) => {
    let opt = document.createElement("option");
    opt.value = index; opt.text = topic.name;
    topicSelect.appendChild(opt);
  });
}

function renderSavedPlan() {
  let plan = studyData.dailyPlan;
  if (!plan) return;
  let planEl = document.getElementById("planOutput");
  if (!planEl) return;

  if (!studyData.subjects[plan.study.subject]) {
    planEl.innerHTML = "<strong>Plan subject was deleted.</strong>"; return;
  }

  let subjectObj = studyData.subjects[plan.study.subject];
  let topicName = subjectObj.topics[plan.study.topicIndex]?.name || "Completed";

  planEl.innerHTML = `
    <div style="padding:8px 0;">
      <strong>📖 Study:</strong> ${plan.study.subject} — <em>${topicName}</em><br>
      <strong>🧪 Qbank:</strong> ${plan.qbank.subject}<br>
      <strong>🔁 Revision:</strong> ${plan.revisionCount} topics
      <div style="font-size:12px;color:#9ca3af;margin-top:4px;">⏱ ${daysUntilExam()} days to exam</div>
    </div>
  `;
  document.getElementById("generateButton").disabled = true;
}

function renderRevisionCheckboxList() {
  let container = document.getElementById("revisionCheckboxList");
  if (!container) return;
  container.innerHTML = "";
  let due = getRevisionsDueToday();
  due.forEach(item => {
    let label = document.createElement("label");
    label.style.cssText = "display:block;padding:4px 0;font-size:13px;";
    label.innerHTML = `
      <input type="checkbox" value="${item.subjectName}|${item.topicIndex}" style="margin-right:8px;">
      ${item.subjectName} — ${item.topicName}
      ${item.isOverdue ? `<span style="color:#ef4444;font-size:11px;">(${item.overdueDays}d overdue)</span>` : ""}
    `;
    container.appendChild(label);
  });
  if (due.length === 0) {
    container.innerHTML = '<span style="color:#9ca3af;font-size:13px;">No revisions due today ✓</span>';
  }
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

  last60.forEach(date => {
    let box = document.createElement("div");
    box.style.cssText = "width:16px;height:16px;border-radius:3px;cursor:default;";
    box.title = date;
    let score = 0;
    if (studyData.dailyHistory[date]) {
      let d = studyData.dailyHistory[date];
      score = (d.study?1:0) + (d.qbank?1:0) + (d.revision?1:0);
    }
    const colors = ["#1f2937", "#f97316", "#eab308", "#16a34a"];
    box.style.background = colors[score] || "#1f2937";
    grid.appendChild(box);
  });

  container.appendChild(grid);

  let legend = document.createElement("div");
  legend.style.cssText = "display:flex;gap:10px;margin-top:8px;font-size:11px;color:#9ca3af;";
  legend.innerHTML = `
    <span><span style="display:inline-block;width:10px;height:10px;background:#1f2937;border-radius:2px;margin-right:3px;"></span>None</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:#f97316;border-radius:2px;margin-right:3px;"></span>1/3</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:#eab308;border-radius:2px;margin-right:3px;"></span>2/3</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:#16a34a;border-radius:2px;margin-right:3px;"></span>Full</span>
  `;
  container.appendChild(legend);
}

function renderSubjects() {
  let container = document.getElementById("subjectsContainer");
  if (!container) return;
  container.innerHTML = "";

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
        <div class="phase-label">Phase 1<br><small>Study</small></div>
        <div class="phase-pct" style="color:#3b82f6">${phases.phase1.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.phase1.pct}%;background:#3b82f6"></div></div>
        <div class="phase-count">${phases.phase1.count}/${phases.total} ch</div>
      </div>
      <div class="phase-item">
        <div class="phase-label">Phase 2<br><small>Rev 2+</small></div>
        <div class="phase-pct" style="color:#8b5cf6">${phases.phase2.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.phase2.pct}%;background:#8b5cf6"></div></div>
        <div class="phase-count">${phases.phase2.count}/${phases.total} ch</div>
      </div>
      <div class="phase-item">
        <div class="phase-label">Phase 3<br><small>Rev 3+</small></div>
        <div class="phase-pct" style="color:#f59e0b">${phases.phase3.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.phase3.pct}%;background:#f59e0b"></div></div>
        <div class="phase-count">${phases.phase3.count}/${phases.total} ch</div>
      </div>
      <div class="phase-item">
        <div class="phase-label">Qbank<br><small>Units</small></div>
        <div class="phase-pct" style="color:#10b981">${phases.qbank.pct}%</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${phases.qbank.pct}%;background:#10b981"></div></div>
        <div class="phase-count">${phases.qbank.count}/${phases.totalUnits} un</div>
      </div>
    </div>
  `;
  container.appendChild(phaseBanner);

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
        ${phase.phase1 ? '<span class="phase-pill p1">P1✓</span>' : ""}
        ${phase.phase2 ? '<span class="phase-pill p2">P2✓</span>' : ""}
        ${phase.phase3 ? '<span class="phase-pill p3">P3✓</span>' : ""}
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
}

function renderRevisionSection() {
  let due = getRevisionsDueToday();
  if (!due.length) return;
  let container = document.getElementById("subjectsContainer");
  if (!container) return;

  let revDiv = document.createElement("div");
  revDiv.className = "card";
  revDiv.style.borderColor = "#ef4444";
  revDiv.innerHTML = `<div class="section-title">🔁 Revisions Due (${due.length})</div>`;

  due.forEach(item => {
    let row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-top:1px solid #334155;gap:8px;";
    row.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;">${item.subjectName}</div>
        <div style="font-size:11px;color:#94a3b8;">${item.unitName} → ${item.topicName}
          ${item.isOverdue ? `<span style="color:#ef4444;">(${item.overdueDays}d overdue)</span>` : ""}
        </div>
      </div>
      <button style="font-size:12px;padding:5px 12px;margin:0;flex-shrink:0;"
        onclick="markRevisionDone('${item.subjectName}',${item.unitIndex},${item.chapterIndex}); renderSubjects();">Done</button>
    `;
    revDiv.appendChild(row);
  });

  container.appendChild(revDiv);
}

// ── Evening Update Selectors ──────────────────────────────────

function populateAllEveningSelectors() {
  _fillSubjectSelector("studySubject", () => {
    _fillUnitSelector("studySubject", "studyUnit", () => {
      _fillChapterSelector("studySubject", "studyUnit", "studyChapter");
    });
  });
  _fillSubjectSelector("qbankSubject", () => {
    _fillUnitSelector("qbankSubject", "qbankUnit", null);
  });
  renderRevisionCheckboxList();
}

function _fillSubjectSelector(selectId, onChange) {
  let sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = "";
  Object.keys(studyData.subjects).forEach(name => {
    let opt = document.createElement("option");
    opt.value = name; opt.text = name;
    sel.appendChild(opt);
  });
  sel.onchange = () => onChange && onChange();
  if (onChange) onChange();
}

function _fillUnitSelector(subjectSelectId, unitSelectId, onChange) {
  let subj = document.getElementById(subjectSelectId)?.value;
  let sel  = document.getElementById(unitSelectId);
  if (!sel || !subj || !studyData.subjects[subj]) return;
  sel.innerHTML = "";
  studyData.subjects[subj].units.forEach((u, i) => {
    let opt = document.createElement("option");
    opt.value = i; opt.text = u.name;
    sel.appendChild(opt);
  });
  sel.onchange = () => onChange && onChange();
  if (onChange) onChange();
}

function _fillChapterSelector(subjectSelectId, unitSelectId, chapterSelectId) {
  let subj = document.getElementById(subjectSelectId)?.value;
  let ui   = parseInt(document.getElementById(unitSelectId)?.value) || 0;
  let sel  = document.getElementById(chapterSelectId);
  if (!sel || !subj || !studyData.subjects[subj]) return;
  sel.innerHTML = "";
  studyData.subjects[subj].units[ui]?.chapters.forEach((ch, i) => {
    let opt = document.createElement("option");
    opt.value = i; opt.text = ch.name;
    sel.appendChild(opt);
  });
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
  due.forEach(item => {
    let label = document.createElement("label");
    label.style.cssText = "display:block;padding:5px 0;font-size:13px;cursor:pointer;";
    label.innerHTML = `
      <input type="checkbox" value="${item.subjectName}|${item.unitIndex}|${item.chapterIndex}" style="margin-right:8px;">
      ${item.subjectName} — ${item.unitName} → ${item.topicName}
      ${item.isOverdue ? `<span style="color:#ef4444;font-size:11px;"> (${item.overdueDays}d overdue)</span>` : ""}
    `;
    container.appendChild(label);
  });
}

function renderSavedPlan() {
  let plan = studyData.dailyPlan;
  let planEl = document.getElementById("planOutput");
  if (!plan || !planEl) return;

  let subjectObj = studyData.subjects[plan.study.subject];
  if (!subjectObj) { planEl.innerHTML = "<strong>Plan subject was deleted.</strong>"; return; }

  let ptr = subjectObj.pointer || { unit: 0, chapter: 0 };
  let nextUnit    = subjectObj.units[ptr.unit];
  let nextChapter = nextUnit?.chapters[ptr.chapter];
  let nextText    = nextChapter ? `${nextUnit.name} → ${nextChapter.name}` : "All done";

  planEl.innerHTML = `
    <div style="padding:8px 0;font-size:14px;line-height:1.8;">
      <strong>📖 Study:</strong> ${plan.study.subject} — <em>${nextText}</em><br>
      <strong>🧪 Qbank:</strong> ${plan.qbank.subject}<br>
      <strong>🔁 Revision:</strong> ${plan.revisionCount} chapters
      <div style="font-size:12px;color:#9ca3af;margin-top:4px;">⏱ ${daysUntilExam()} days to exam</div>
    </div>
  `;
  document.getElementById("generateButton").disabled = true;
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

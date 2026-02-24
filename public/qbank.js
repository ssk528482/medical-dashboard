// qbank.js — Medical Study OS
// Task #12: Full Qbank session interface — browse by subject/unit,
// log questions as you go, track per-session accuracy, mark units done.
// Replaces the old broken stub that still referenced subject.topics[].

'use strict';

// ─── State ────────────────────────────────────────────────────
let _qbSession = null; // active session: { subject, unitIndex, total, correct }

// ─── Main Render ──────────────────────────────────────────────
function renderQbank() {
  let container = document.getElementById("qbankContainer");
  if (!container) return;
  container.innerHTML = "";

  let subjects = studyData.subjects || {};
  if (!Object.keys(subjects).length) {
    container.innerHTML = `<div class="card" style="text-align:center;color:#64748b;padding:24px;">No subjects yet. Add one in the Syllabus.</div>`;
    return;
  }

  // ── Overall Qbank Stats summary ──────────────────────────────
  let globalTotal = 0, globalCorrect = 0, totalUnits = 0, doneUnits = 0;
  Object.values(subjects).forEach(s => s.units.forEach(u => {
    globalTotal   += u.qbankStats?.total   || 0;
    globalCorrect += u.qbankStats?.correct || 0;
    totalUnits++;
    if (u.qbankDone) doneUnits++;
  }));
  let globalAcc = globalTotal > 0 ? (globalCorrect / globalTotal * 100) : 0;
  let accColor = globalAcc >= 75 ? "#10b981" : globalAcc >= 50 ? "#eab308" : "#ef4444";

  let summaryEl = document.createElement("div");
  summaryEl.className = "card";
  summaryEl.innerHTML = `
    <div class="section-title">🧪 Qbank Overview</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">
      <div style="flex:1;min-width:80px;background:#0f172a;border-radius:10px;padding:12px;text-align:center;border:1px solid #1e293b;">
        <div style="font-size:26px;font-weight:900;color:${accColor};">${globalAcc.toFixed(1)}%</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px;">Overall Accuracy</div>
      </div>
      <div style="flex:1;min-width:80px;background:#0f172a;border-radius:10px;padding:12px;text-align:center;border:1px solid #1e293b;">
        <div style="font-size:26px;font-weight:900;color:#3b82f6;">${globalTotal}</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px;">Questions Done</div>
      </div>
      <div style="flex:1;min-width:80px;background:#0f172a;border-radius:10px;padding:12px;text-align:center;border:1px solid #1e293b;">
        <div style="font-size:26px;font-weight:900;color:#8b5cf6;">${doneUnits}/${totalUnits}</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px;">Units Done</div>
      </div>
    </div>
    <div class="stat-bar" style="margin-top:10px;">
      <div class="stat-fill ${globalAcc>=75?"green":globalAcc>=50?"yellow":"red"}" style="width:${Math.min(100,globalAcc)}%"></div>
    </div>
  `;
  container.appendChild(summaryEl);

  // ── Quick Session Entry ──────────────────────────────────────
  let sessionEl = document.createElement("div");
  sessionEl.className = "card";
  sessionEl.id = "qbSessionCard";
  sessionEl.innerHTML = `
    <div class="section-title">📝 Log Qbank Session</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
      <select id="qb-sess-subject" onchange="_qbFillUnits()" style="width:100%;">
        ${Object.keys(subjects).map(s => `<option value="${esc(s)}">${s}</option>`).join("")}
      </select>
      <select id="qb-sess-unit" style="width:100%;"></select>
      <div style="display:flex;gap:8px;">
        <div style="flex:1;">
          <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px;">Total Qs</label>
          <input type="number" id="qb-sess-total" min="0" placeholder="0" style="width:100%;">
        </div>
        <div style="flex:1;">
          <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px;">Correct</label>
          <input type="number" id="qb-sess-correct" min="0" placeholder="0" style="width:100%;">
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:2px;">
        <input type="checkbox" id="qb-sess-done" style="width:16px;height:16px;">
        <label for="qb-sess-done" style="font-size:12px;color:#94a3b8;cursor:pointer;">Mark this unit as Qbank complete</label>
      </div>
      <button onclick="_submitQbSession()" style="width:100%;background:linear-gradient(135deg,#16a34a,#15803d);color:white;padding:11px;font-size:13px;font-weight:700;border-radius:10px;margin-top:2px;">
        Submit Session ✓
      </button>
    </div>
  `;
  container.appendChild(sessionEl);
  _qbFillUnits(); // populate units for default subject

  // ── Per-Subject Breakdown ────────────────────────────────────
  Object.keys(subjects).forEach(subjectName => {
    let subject = subjects[subjectName];
    let subTotal = 0, subCorrect = 0;
    subject.units.forEach(u => {
      subTotal   += u.qbankStats?.total   || 0;
      subCorrect += u.qbankStats?.correct || 0;
    });
    let subAcc = subTotal > 0 ? (subCorrect / subTotal * 100) : 0;
    let isCollapsed = studyData.uiState?.qbankCollapsed?.[subjectName] ?? true;

    let card = document.createElement("div");
    card.className = "subject-card";
    card.id = `qb-subj-${esc(subjectName)}`;

    let headerHtml = `
      <div class="subject-header" style="cursor:pointer;" onclick="toggleQbankCollapse('${esc(subjectName)}')">
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="collapse-btn" style="background:transparent;border:none;color:#64748b;cursor:pointer;">${isCollapsed ? "▶" : "▼"}</button>
          <strong>${subjectName}</strong>
          <span style="font-size:11px;color:#64748b;">${subject.size}</span>
        </div>
        <span class="accuracy-badge ${subAcc>=75?"accuracy-high":subAcc>=50?"accuracy-mid":"accuracy-low"}">
          ${subTotal > 0 ? subAcc.toFixed(1) + "%" : "—"}
        </span>
      </div>
      <div class="stat-bar" style="margin-top:6px;">
        <div class="stat-fill ${subAcc>=75?"green":subAcc>=50?"yellow":"red"}" style="width:${Math.min(100,subAcc)}%"></div>
      </div>
    `;

    let unitsHtml = subject.units.map((unit, ui) => {
      let uAcc = unit.qbankStats?.total > 0
        ? (unit.qbankStats.correct / unit.qbankStats.total * 100) : 0;
      let uTotal = unit.qbankStats?.total || 0;
      let uCorrect = unit.qbankStats?.correct || 0;
      let qLeft = unit.questionCount > 0 ? Math.max(0, unit.questionCount - uTotal) : null;

      return `
        <div style="border:1px solid #1e293b;border-radius:10px;padding:10px 12px;margin-top:8px;background:#0a1628;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:#e2e8f0;">${unit.name}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px;">
                ${uTotal > 0 ? `${uTotal} done · ${uCorrect} correct` : "No questions logged yet"}
                ${qLeft !== null ? ` · <span style="color:#f59e0b;">${qLeft} remaining</span>` : ""}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              ${unit.qbankDone
                ? `<span style="background:#052e16;color:#4ade80;border:1px solid #16a34a;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;">✓ Done</span>`
                : `<span style="background:#1e293b;color:#64748b;border:1px solid #334155;padding:3px 8px;border-radius:6px;font-size:11px;">Pending</span>`
              }
              ${uTotal > 0
                ? `<span class="accuracy-badge ${uAcc>=75?"accuracy-high":uAcc>=50?"accuracy-mid":"accuracy-low"}">${uAcc.toFixed(1)}%</span>`
                : ""}
            </div>
          </div>
          ${uTotal > 0 ? `<div class="stat-bar" style="margin-top:8px;"><div class="stat-fill ${uAcc>=75?"green":uAcc>=50?"yellow":"red"}" style="width:${Math.min(100,uAcc)}%"></div></div>` : ""}
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
            <button onclick="_prefillSession('${esc(subjectName)}',${ui})"
              style="flex:1;background:#1e3a5f;color:#93c5fd;border:1px solid #2a4f80;font-size:11px;padding:6px;border-radius:7px;cursor:pointer;">
              📝 Log Session
            </button>
            <button onclick="toggleUnitQbankDone('${esc(subjectName)}',${ui})"
              style="flex:1;background:${unit.qbankDone?"#1a0a0a":"#052e16"};color:${unit.qbankDone?"#fca5a5":"#4ade80"};border:1px solid ${unit.qbankDone?"#450a0a":"#16a34a"};font-size:11px;padding:6px;border-radius:7px;cursor:pointer;">
              ${unit.qbankDone ? "✕ Unmark Done" : "✓ Mark Done"}
            </button>
          </div>
        </div>`;
    }).join("");

    card.innerHTML = headerHtml + `<div id="qb-units-${esc(subjectName)}" style="${isCollapsed?"display:none":""}">` + unitsHtml + `</div>`;
    container.appendChild(card);
  });
}

// ─── Unit Prefill ─────────────────────────────────────────────
function _prefillSession(subjectName, unitIndex) {
  let subjSel = document.getElementById("qb-sess-subject");
  let unitSel = document.getElementById("qb-sess-unit");
  if (subjSel) { subjSel.value = subjectName; _qbFillUnits(); }
  if (unitSel) unitSel.value = unitIndex;
  document.getElementById("qbSessionCard")?.scrollIntoView({ behavior: "smooth" });
}

function _qbFillUnits() {
  let subj = document.getElementById("qb-sess-subject")?.value;
  let sel  = document.getElementById("qb-sess-unit");
  if (!sel || !subj || !studyData.subjects[subj]) return;
  sel.innerHTML = studyData.subjects[subj].units.map((u, i) =>
    `<option value="${i}">${u.name}</option>`
  ).join("");
}

// ─── Submit Session ───────────────────────────────────────────
function _submitQbSession() {
  let subjectName = document.getElementById("qb-sess-subject")?.value;
  let unitIndex   = parseInt(document.getElementById("qb-sess-unit")?.value) || 0;
  let total       = parseInt(document.getElementById("qb-sess-total")?.value) || 0;
  let correct     = parseInt(document.getElementById("qb-sess-correct")?.value) || 0;
  let markDone    = document.getElementById("qb-sess-done")?.checked;

  if (!subjectName || !studyData.subjects[subjectName]) { alert("Select a subject."); return; }
  if (total <= 0) { alert("Enter number of questions done."); return; }
  if (correct > total) { alert("Correct cannot exceed total questions."); return; }

  let unit = studyData.subjects[subjectName].units[unitIndex];
  if (!unit) { alert("Unit not found."); return; }

  unit.qbankStats = unit.qbankStats || { total: 0, correct: 0 };
  unit.qbankStats.total   += total;
  unit.qbankStats.correct += correct;
  if (markDone) unit.qbankDone = true;

  // Update difficulty factors for chapters in this unit
  let q = Math.round((correct / total) * 5);
  unit.chapters.forEach(ch => {
    let ef = ch.difficultyFactor || 2.5;
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    ch.difficultyFactor = clamp(ef, 1.3, 3.0);
  });

  // Also log to today's dailyHistory qbankEntries
  let todayKey = today();
  if (!studyData.dailyHistory[todayKey]) studyData.dailyHistory[todayKey] = {};
  if (!studyData.dailyHistory[todayKey].qbankEntries) studyData.dailyHistory[todayKey].qbankEntries = [];
  studyData.dailyHistory[todayKey].qbankEntries.push({ subject: subjectName, unit: unit.name, unitIndex, total, correct });
  studyData.dailyHistory[todayKey].qbank = true;

  saveData();

  let acc = (correct / total * 100).toFixed(1);
  let accColor = parseFloat(acc) >= 75 ? "#4ade80" : parseFloat(acc) >= 50 ? "#fbbf24" : "#f87171";

  // Clear form
  document.getElementById("qb-sess-total").value = "";
  document.getElementById("qb-sess-correct").value = "";
  document.getElementById("qb-sess-done").checked = false;

  // Show flash success
  let btn = document.querySelector("#qbSessionCard button");
  if (btn) {
    let origText = btn.textContent;
    btn.textContent = `✅ Logged! ${acc}% accuracy`;
    btn.style.color = accColor;
    setTimeout(() => { btn.textContent = origText; btn.style.color = ""; }, 2000);
  }

  renderQbank();
}

// ─── Toggle Done ──────────────────────────────────────────────
function toggleUnitQbankDone(subjectName, unitIndex) {
  let unit = studyData.subjects[subjectName]?.units[unitIndex];
  if (!unit) return;
  unit.qbankDone = !unit.qbankDone;
  saveData();
  renderQbank();
}

// ─── Collapse ─────────────────────────────────────────────────
function toggleQbankCollapse(subjectName) {
  if (!studyData.uiState.qbankCollapsed) studyData.uiState.qbankCollapsed = {};
  studyData.uiState.qbankCollapsed[subjectName] = !studyData.uiState.qbankCollapsed[subjectName];
  saveData();
  renderQbank();
}

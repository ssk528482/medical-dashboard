// ─── Editor Tab ───────────────────────────────────────────────

function renderEditor() {
  let container = document.getElementById("editorContainer");
  if (!container) return;
  container.innerHTML = "";

  let names = Object.keys(studyData.subjects);
  if (!names.length) {
    container.innerHTML = `<div class="card" style="color:#64748b;text-align:center;padding:24px;">No subjects yet. Add one above.</div>`;
    return;
  }

  names.forEach(subjectName => {
    let subject = studyData.subjects[subjectName];
    let isCollapsed = studyData.uiState?.editorCollapsed?.[subjectName];
    if (isCollapsed === undefined) isCollapsed = true; // default collapsed

    let totalCh = 0, doneCh = 0;
    subject.units.forEach(u => { totalCh += u.chapters.length; u.chapters.forEach(ch => { if (ch.status === "completed") doneCh++; }); });
    let pct = totalCh > 0 ? ((doneCh / totalCh) * 100).toFixed(0) : 0;

    let subjectEl = document.createElement("div");
    subjectEl.className = "subject-card";
    subjectEl.style.marginBottom = "14px";

    subjectEl.innerHTML = `
      <div class="subject-header">
        <div class="subject-title" style="display:flex;align-items:center;gap:8px;cursor:default;">
          <button class="collapse-btn" onclick="toggleSubjectCollapse(event,'${esc(subjectName)}')">${isCollapsed ? "▶" : "▼"}</button>
          <span>${subjectName}</span>
          <span style="font-size:11px;color:#64748b;font-weight:400;">${pct}% (${doneCh}/${totalCh} ch)</span>
        </div>
        <button class="delete-btn" onclick="deleteSubject('${esc(subjectName)}')">Delete</button>
      </div>
      <div class="stat-bar" style="margin-top:8px;">
        <div class="stat-fill ${pct>=75?"green":pct>=40?"yellow":"red"}" style="width:${pct}%"></div>
      </div>
    `;

    if (!isCollapsed) {
      // Add unit row
      let addUnitRow = document.createElement("div");
      addUnitRow.className = "add-topic-row";
      addUnitRow.style.marginTop = "12px";
      addUnitRow.innerHTML = `
        <input id="addUnit-${esc(subjectName)}" placeholder="New Unit Name" style="flex:2;">
        <input id="addUnitQ-${esc(subjectName)}" type="number" placeholder="Total Qs" min="0" style="width:80px;flex:none;" title="Total questions in this unit (for plan estimation)">
        <button onclick="addUnit('${esc(subjectName)}')">+ Unit</button>
      `;
      subjectEl.appendChild(addUnitRow);

      if (!subject.units.length) {
        let empty = document.createElement("div");
        empty.style.cssText = "color:#64748b;font-size:13px;padding:10px 0;";
        empty.textContent = "No units yet.";
        subjectEl.appendChild(empty);
      }

      // Units
      subject.units.forEach((unit, ui) => {
        let isUnitCollapsed = studyData.uiState?.unitCollapsed?.[subjectName]?.[ui];
        if (isUnitCollapsed === undefined) isUnitCollapsed = true; // default collapsed
        let unitDone = unit.chapters.filter(c => c.status === "completed").length;
        let unitPct  = unit.chapters.length > 0 ? ((unitDone / unit.chapters.length) * 100).toFixed(0) : 0;

        // Unit-level pill states — active only when ALL chapters meet the threshold
        let unitAllDone = unit.chapters.length > 0 && unit.chapters.every(c => c.status === "completed");
        let unitAllR1   = unit.chapters.length > 0 && unit.chapters.every(c => c.revisionIndex >= 1);
        let unitAllR2   = unit.chapters.length > 0 && unit.chapters.every(c => c.revisionIndex >= 2);
        let unitAllR3   = unit.chapters.length > 0 && unit.chapters.every(c => c.revisionIndex >= 3);

        let unitEl = document.createElement("div");
        unitEl.className = "unit-block";

        unitEl.innerHTML = `
          <div class="unit-header" style="flex-wrap:wrap;row-gap:6px;">
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
              <button class="collapse-btn" onclick="toggleUnitCollapse(event,'${esc(subjectName)}',${ui})" style="font-size:12px;padding:2px 5px;">${isUnitCollapsed ? "▶" : "▼"}</button>
              <span class="unit-title">${unit.name}</span>
              <span style="font-size:10px;color:#475569;flex-shrink:0;">${unitPct}% (${unitDone}/${unit.chapters.length})</span>
              ${unit.questionCount > 0 ? `<span style="font-size:10px;color:#8b5cf6;flex-shrink:0;">· ${unit.questionCount}Q</span>` : ""}
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
              <span class="pill completed ${unitAllDone ? "active" : ""}" style="font-size:10px;padding:2px 6px;" onclick="toggleUnitCompleted('${esc(subjectName)}',${ui})" title="Mark all chapters complete">✓</span>
              <span class="pill rev ${unitAllR1 ? "active" : ""}" style="font-size:10px;padding:2px 6px;" onclick="markUnitRevised('${esc(subjectName)}',${ui},1)" title="Mark all chapters R1">R1</span>
              <span class="pill rev ${unitAllR2 ? "active" : ""}" style="font-size:10px;padding:2px 6px;" onclick="markUnitRevised('${esc(subjectName)}',${ui},2)" title="Mark all chapters R2">R2</span>
              <span class="pill rev ${unitAllR3 ? "active" : ""}" style="font-size:10px;padding:2px 6px;" onclick="markUnitRevised('${esc(subjectName)}',${ui},3)" title="Mark all chapters R3">R3</span>
              <button onclick="editUnitQuestionCount('${esc(subjectName)}',${ui})" style="background:transparent;color:#8b5cf6;padding:3px 7px;font-size:11px;margin:0;border:1px solid #4c1d95;border-radius:6px;" title="Set total questions">Qs</button>
              <button onclick="deleteUnit('${esc(subjectName)}',${ui})" style="background:transparent;color:#ef4444;padding:3px 7px;font-size:12px;margin:0;border:1px solid #450a0a;border-radius:6px;">✕</button>
            </div>
          </div>
          <div class="stat-bar" style="margin:5px 0 4px;height:4px;">
            <div class="stat-fill ${unitPct>=75?"green":unitPct>=40?"yellow":"red"}" style="width:${unitPct}%"></div>
          </div>
        `;

        if (!isUnitCollapsed) {
          // Add chapter row
          let addChRow = document.createElement("div");
          addChRow.style.cssText = "display:flex;gap:6px;margin:6px 0 4px;flex-wrap:wrap;";
          addChRow.innerHTML = `
            <input id="addCh-${esc(subjectName)}-${ui}" placeholder="Chapter Name" style="flex:2;min-width:100px;font-size:12px;padding:6px 8px;">
            <input id="addChS-${esc(subjectName)}-${ui}" type="number" placeholder="Pg start" min="1" style="width:68px;flex:none;font-size:12px;padding:6px 8px;" title="Start page">
            <input id="addChE-${esc(subjectName)}-${ui}" type="number" placeholder="Pg end" min="1" style="width:68px;flex:none;font-size:12px;padding:6px 8px;" title="End page">
            <button onclick="addChapter('${esc(subjectName)}',${ui})" style="font-size:12px;padding:6px 10px;margin:0;white-space:nowrap;">+ Ch</button>
          `;
          unitEl.appendChild(addChRow);

          // Chapters
          if (!unit.chapters.length) {
            let emptyMsg = document.createElement("div");
            emptyMsg.style.cssText = "color:#475569;font-size:12px;padding:4px 0;";
            emptyMsg.textContent = "No chapters yet.";
            unitEl.appendChild(emptyMsg);
          }

          unit.chapters.forEach((ch, ci) => {
            let chRow = document.createElement("div");
            chRow.className = "chapter-row";
            let compActive = ch.status === "completed";
            let r1Active   = ch.revisionIndex >= 1;
            let r2Active   = ch.revisionIndex >= 2;
            let r3Active   = ch.revisionIndex >= 3;
            let diff = ch.difficulty || "medium";
            let diffColors = { easy: "#10b981", medium: "#eab308", hard: "#ef4444" };
            let pageInfo = ch.pageCount > 0
              ? `<span style="font-size:10px;color:#475569;margin-left:4px;">pg ${ch.startPage}–${ch.endPage} (${ch.pageCount}p)</span>`
              : "";
            let phaseTag = "";
            if (r3Active)      phaseTag = `<span style="font-size:9px;background:#7c3aed;color:white;padding:1px 5px;border-radius:4px;margin-left:4px;">R3</span>`;
            else if (r2Active) phaseTag = `<span style="font-size:9px;background:#d97706;color:white;padding:1px 5px;border-radius:4px;margin-left:4px;">R2</span>`;
            else if (r1Active) phaseTag = `<span style="font-size:9px;background:#1d4ed8;color:white;padding:1px 5px;border-radius:4px;margin-left:4px;">R1</span>`;
            else if (compActive) phaseTag = `<span style="font-size:9px;background:#15803d;color:white;padding:1px 5px;border-radius:4px;margin-left:4px;">Done</span>`;
            chRow.innerHTML = `
              <div class="topic-left" style="flex:1;min-width:0;">
                <span class="topic-name" style="font-size:12px;" title="${ch.name}">${ci + 1}. ${ch.name}</span>${pageInfo}${phaseTag}
              </div>
              <div class="topic-actions" style="gap:3px;">
                <select onchange="setChapterDifficulty('${esc(subjectName)}',${ui},${ci},this.value)"
                  style="font-size:10px;padding:2px 4px;width:52px;background:#1e293b;border:1px solid ${diffColors[diff]};color:${diffColors[diff]};border-radius:5px;">
                  <option value="easy"  ${diff==="easy" ?"selected":""}>Easy</option>
                  <option value="medium"${diff==="medium"?"selected":""}>Med</option>
                  <option value="hard"  ${diff==="hard" ?"selected":""}>Hard</option>
                </select>
                <span class="pill completed ${compActive ? "active" : ""}" onclick="toggleChapterCompleted('${esc(subjectName)}',${ui},${ci})">✓</span>
                <span class="pill rev ${r1Active ? "active" : ""}" onclick="markChapterRevised('${esc(subjectName)}',${ui},${ci},1)">R1</span>
                <span class="pill rev ${r2Active ? "active" : ""}" onclick="markChapterRevised('${esc(subjectName)}',${ui},${ci},2)">R2</span>
                <span class="pill rev ${r3Active ? "active" : ""}" onclick="markChapterRevised('${esc(subjectName)}',${ui},${ci},3)">R3</span>
                <button class="icon-btn" onclick="deleteChapter('${esc(subjectName)}',${ui},${ci})">✕</button>
              </div>
            `;
            unitEl.appendChild(chRow);
          });
        }

        subjectEl.appendChild(unitEl);
      });
    }

    container.appendChild(subjectEl);
  });
}

// ─── Editor Actions ───────────────────────────────────────────

function esc(s) { return s.replace(/'/g, "\\'"); }

function toggleSubjectCollapse(event, name) {
  event.stopPropagation();
  if (!studyData.uiState) studyData.uiState = {};
  if (!studyData.uiState.editorCollapsed) studyData.uiState.editorCollapsed = {};
  // Read current stored value; treat undefined as true (default collapsed)
  let current = studyData.uiState.editorCollapsed[name];
  if (current === undefined) current = true;
  studyData.uiState.editorCollapsed[name] = !current;
  saveData(); renderEditor();
}

function toggleUnitCollapse(event, subjectName, ui) {
  event.stopPropagation();
  if (!studyData.uiState.unitCollapsed) studyData.uiState.unitCollapsed = {};
  if (!studyData.uiState.unitCollapsed[subjectName]) studyData.uiState.unitCollapsed[subjectName] = {};
  // Read current stored value; treat undefined as true (default collapsed)
  let current = studyData.uiState.unitCollapsed[subjectName][ui];
  if (current === undefined) current = true;
  studyData.uiState.unitCollapsed[subjectName][ui] = !current;
  saveData(); renderEditor();
}

function addNewSubject() {
  let name = document.getElementById("newSubjectName")?.value.trim();
  let size = document.getElementById("newSubjectSize")?.value || "medium";
  if (!name) return;
  if (!studyData.subjects[name]) {
    studyData.subjects[name] = { size, units: [], pointer: { unit: 0, chapter: 0 } };
  }
  document.getElementById("newSubjectName").value = "";
  saveData(); renderEditor();
}

function deleteSubject(name) {
  if (!confirm(`Delete "${name}" and all its units/chapters?`)) return;
  delete studyData.subjects[name];
  saveData(); renderEditor();
}

function addUnit(subjectName) {
  let input = document.getElementById(`addUnit-${subjectName}`);
  let qInput = document.getElementById(`addUnitQ-${subjectName}`);
  let name = input?.value.trim();
  if (!name) return;
  let qCount = parseInt(qInput?.value) || 0;
  let unit = makeUnitObj(name, qCount);
  studyData.subjects[subjectName].units.push(unit);
  input.value = "";
  if (qInput) qInput.value = "";
  saveData(); renderEditor();
}

function deleteUnit(subjectName, ui) {
  if (!confirm("Delete this unit and all its chapters?")) return;
  studyData.subjects[subjectName].units.splice(ui, 1);
  fixPointer(subjectName);
  saveData(); renderEditor();
}

function editUnitQuestionCount(subjectName, ui) {
  let unit = studyData.subjects[subjectName].units[ui];
  let current = unit.questionCount || 0;

  // Build popup
  let overlay = document.createElement("div");
  overlay.id = "qcountOverlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;";

  overlay.innerHTML = `
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:24px;width:100%;max-width:320px;">
      <div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">📚 Total Questions</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:16px;">${unit.name}</div>
      <input id="qcountInput" type="number" min="0" value="${current}"
        placeholder="e.g. 180"
        style="width:100%;font-size:18px;padding:10px 14px;border-radius:10px;border:2px solid #3b82f6;background:#0f172a;color:#f1f5f9;margin-bottom:16px;text-align:center;">
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('qcountOverlay').remove()"
          style="flex:1;background:#334155;margin:0;padding:10px;">Cancel</button>
        <button onclick="_saveQcount('${subjectName.replace(/'/g,"\\'")}',${ui})"
          style="flex:1;background:#8b5cf6;margin:0;padding:10px;font-weight:700;">Save</button>
      </div>
    </div>`;

  // Close on backdrop click
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  // Focus & select input
  setTimeout(() => {
    let inp = document.getElementById("qcountInput");
    if (inp) {
      inp.focus();
      inp.select();
      inp.addEventListener("keydown", e => {
        if (e.key === "Enter") _saveQcount(subjectName, ui);
        if (e.key === "Escape") document.getElementById("qcountOverlay")?.remove();
      });
    }
  }, 50);
}

function _saveQcount(subjectName, ui) {
  let val = parseInt(document.getElementById("qcountInput")?.value) || 0;
  studyData.subjects[subjectName].units[ui].questionCount = val;
  document.getElementById("qcountOverlay")?.remove();
  saveData();
  renderQbank();  // re-render the qbank tab instantly — no full page refresh needed
}

// ─── Unit-level Bulk Actions ──────────────────────────────────

function toggleUnitCompleted(subjectName, ui) {
  let unit = studyData.subjects[subjectName].units[ui];
  if (!unit || !unit.chapters.length) return;

  let allDone = unit.chapters.every(c => c.status === "completed");

  unit.chapters.forEach(ch => {
    if (allDone) {
      // Toggle OFF — reset all chapters to not-started
      ch.status = "not-started";
      ch.revisionIndex = 0;
      ch.nextRevision = null;
      ch.revisionDates = [];
    } else {
      // Toggle ON — mark any incomplete chapter as completed
      if (ch.status !== "completed") {
        ch.status = "completed";
        ch.completedOn = today();
        ch.lastReviewedOn = today();
        let dates = [], cursor = today();
        for (let i = 0; i < BASE_INTERVALS.length; i++) {
          cursor = addDays(cursor, computeNextInterval(ch, i));
          dates.push(cursor);
        }
        ch.revisionDates = dates;
        ch.nextRevision = dates[0];
        ch.revisionIndex = 0;
      }
    }
  });

  fixPointer(subjectName);
  saveData();
  renderEditor();
}

function markUnitRevised(subjectName, ui, level) {
  let unit = studyData.subjects[subjectName].units[ui];
  if (!unit || !unit.chapters.length) return;

  // Guard checks — same logic as individual chapter buttons
  if (level === 2) {
    let notReady = unit.chapters.filter(c => c.revisionIndex < 1);
    if (notReady.length) {
      alert(`${notReady.length} chapter(s) haven't completed R1 yet. Mark all chapters R1 first.`);
      return;
    }
  }
  if (level === 3) {
    let notReady = unit.chapters.filter(c => c.revisionIndex < 2);
    if (notReady.length) {
      alert(`${notReady.length} chapter(s) haven't completed R2 yet. Mark all chapters R2 first.`);
      return;
    }
  }
  if (level === 1) {
    // Auto-complete any chapter not yet marked completed (same as individual R1 behavior)
    unit.chapters.forEach(ch => {
      if (ch.status !== "completed") {
        ch.status = "completed";
        ch.completedOn = today();
        ch.lastReviewedOn = today();
        let dates = [], cursor = today();
        for (let i = 0; i < BASE_INTERVALS.length; i++) {
          cursor = addDays(cursor, computeNextInterval(ch, i));
          dates.push(cursor);
        }
        ch.revisionDates = dates;
        ch.nextRevision = dates[0];
        ch.revisionIndex = 0;
      }
    });
  }

  let allAtLevel = unit.chapters.every(c => c.revisionIndex >= level);

  unit.chapters.forEach(ch => {
    if (allAtLevel) {
      // Toggle OFF — drop all chapters back one level
      if (ch.revisionIndex >= level) ch.revisionIndex = level - 1;
    } else {
      // Toggle ON — bring all chapters up to this level
      if (ch.revisionIndex < level) ch.revisionIndex = level;
      ch.lastReviewedOn = today();
    }
  });

  fixPointer(subjectName);
  saveData();
  renderEditor();
}

// ─── Chapter Actions ──────────────────────────────────────────

function addChapter(subjectName, ui) {
  let input  = document.getElementById(`addCh-${subjectName}-${ui}`);
  let sInput = document.getElementById(`addChS-${subjectName}-${ui}`);
  let eInput = document.getElementById(`addChE-${subjectName}-${ui}`);
  let name = input?.value.trim();
  if (!name) return;
  let startPage = parseInt(sInput?.value) || 0;
  let endPage   = parseInt(eInput?.value) || 0;
  studyData.subjects[subjectName].units[ui].chapters.push(makeChapterObj(name, startPage, endPage));
  input.value = "";
  if (sInput) sInput.value = "";
  if (eInput) eInput.value = "";
  saveData(); renderEditor();
}

function deleteChapter(subjectName, ui, ci) {
  studyData.subjects[subjectName].units[ui].chapters.splice(ci, 1);
  fixPointer(subjectName);
  saveData(); renderEditor();
}

function setChapterDifficulty(subjectName, ui, ci, level) {
  let ch = studyData.subjects[subjectName].units[ui].chapters[ci];
  if (!ch) return;
  ch.difficulty = level;
  const factorMap = { easy: 3.5, medium: 2.5, hard: 1.5 };
  ch.difficultyFactor = factorMap[level] || 2.5;
  saveData(); renderEditor();
}

function toggleChapterCompleted(subjectName, ui, ci) {
  let ch = studyData.subjects[subjectName].units[ui].chapters[ci];
  if (ch.status === "completed") {
    ch.status = "not-started";
    ch.revisionIndex = 0;
    ch.nextRevision = null;
    ch.revisionDates = [];
  } else {
    ch.status = "completed";
    ch.completedOn = today();
    ch.lastReviewedOn = today();
    let dates = [], cursor = today();
    for (let i = 0; i < BASE_INTERVALS.length; i++) {
      cursor = addDays(cursor, computeNextInterval(ch, i));
      dates.push(cursor);
    }
    ch.revisionDates = dates;
    ch.nextRevision = dates[0];
    ch.revisionIndex = 0;
  }
  fixPointer(subjectName);
  saveData(); renderEditor();
}

function markChapterRevised(subjectName, ui, ci, level) {
  let ch = studyData.subjects[subjectName].units[ui].chapters[ci];

  // Require previous level: R2 needs R1, R3 needs R2
  if (level === 2 && ch.revisionIndex < 1 && ch.status !== "completed") {
    alert("Complete R1 first before marking R2.");
    return;
  }
  if (level === 3 && ch.revisionIndex < 2) {
    alert("Complete R2 first before marking R3.");
    return;
  }
  // R1 requires completed
  if (level === 1 && ch.status !== "completed") {
    alert("Mark chapter as completed (✓) first before marking R1.");
    return;
  }

  // Auto-mark completed when any revision is marked
  if (ch.status !== "completed") {
    ch.status = "completed";
    ch.completedOn = today();
    ch.lastReviewedOn = today();
    let dates = [], cursor = today();
    for (let i = 0; i < BASE_INTERVALS.length; i++) {
      cursor = addDays(cursor, computeNextInterval(ch, i));
      dates.push(cursor);
    }
    ch.revisionDates = dates;
    ch.nextRevision  = dates[0];
    ch.missedRevisions = 0;
    fixPointer(subjectName);
  }

  // Toggle off if clicking same level
  if (ch.revisionIndex === level) {
    ch.revisionIndex = level - 1;
  } else {
    ch.revisionIndex = level;
  }
  ch.lastReviewedOn = today();
  saveData(); renderEditor();
}

// ─── Qbank Tab ────────────────────────────────────────────────

function renderQbank() {
  let container = document.getElementById("qbankContainer");
  if (!container) return;
  container.innerHTML = "";

  let names = Object.keys(studyData.subjects);
  if (!names.length) {
    container.innerHTML = `<div class="card" style="color:#64748b;text-align:center;padding:24px;">No subjects yet.</div>`;
    return;
  }

  names.forEach(subjectName => {
    let subject = studyData.subjects[subjectName];
    let totalQ = 0, totalCorrect = 0;
    subject.units.forEach(u => { totalQ += u.qbankStats.total; totalCorrect += u.qbankStats.correct; });
    let overallAcc = totalQ > 0 ? (totalCorrect / totalQ * 100).toFixed(1) : null;
    let doneUnits  = subject.units.filter(u => u.qbankDone).length;

    let subjectEl = document.createElement("div");
    subjectEl.className = "subject-card";
    subjectEl.style.marginBottom = "14px";

    // FIX: use explicit true/false check — undefined means "not set yet" → default collapsed (true)
    let isQbCollapsed = studyData.uiState?.qbankCollapsed?.[subjectName];
    if (isQbCollapsed === undefined) isQbCollapsed = true;

    subjectEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${isQbCollapsed ? 0 : 10}px;">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
          <button class="collapse-btn" onclick="toggleQbankCollapse(event,'${esc(subjectName)}')" style="font-size:12px;padding:2px 5px;">${isQbCollapsed ? "▶" : "▼"}</button>
          <div>
            <strong style="font-size:15px;">${subjectName}</strong>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">${doneUnits}/${subject.units.length} units done</div>
          </div>
        </div>
        <span style="padding:4px 10px;border-radius:8px;font-size:12px;font-weight:600;color:white;
          background:${overallAcc===null?"#334155":overallAcc>=75?"#16a34a":overallAcc>=50?"#eab308":"#ef4444"};">
          ${overallAcc !== null ? overallAcc + "%" : "No data"}
        </span>
      </div>
    `;

    if (!isQbCollapsed) {
      subject.units.forEach((unit, ui) => {
        let uTotal   = unit.qbankStats.total;
        let uCorrect = unit.qbankStats.correct;
        let uAcc     = uTotal > 0 ? (uCorrect / uTotal * 100).toFixed(1) : null;

        let unitEl = document.createElement("div");
        unitEl.style.cssText = "background:#0f172a;border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid #1e293b;";

        unitEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;">
                <strong style="font-size:13px;">${unit.name}</strong>
                ${uAcc !== null ? `<span style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;color:white;
                  background:${uAcc>=75?"#16a34a":uAcc>=50?"#eab308":"#ef4444"};">${uAcc}%</span>` : ""}
              </div>
              <div style="font-size:11px;color:#64748b;margin-top:4px;">${uTotal} questions • ${uCorrect} correct
                ${unit.questionCount > 0 ? ` • <span style="color:#8b5cf6;">📚 ${unit.questionCount} total in syllabus</span>` : ""}
              </div>
              ${unit.questionCount > 0 ? (() => {
                let remaining = Math.max(0, unit.questionCount - uTotal);
                let pct = Math.min(100, Math.round(uTotal / unit.questionCount * 100));
                return `<div style="font-size:11px;color:#64748b;margin-top:2px;">
                  ${pct}% done · ${remaining} Qs remaining to attempt
                  <div class="stat-bar" style="margin-top:4px;height:4px;"><div class="stat-fill ${pct>=75?"green":pct>=40?"yellow":"red"}" style="width:${pct}%"></div></div>
                </div>`;
              })() : ""}
            </div>
            <div style="display:flex;gap:4px;align-items:center;">
              <span class="pill completed ${unit.qbankDone ? "active" : ""}" style="cursor:pointer;flex-shrink:0;"
                onclick="toggleUnitQbankDone('${esc(subjectName)}',${ui},${!unit.qbankDone})">✓</span>
              <button onclick="editUnitQuestionCount('${esc(subjectName)}',${ui})"
                style="padding:4px 8px;font-size:11px;margin:0;background:#4c1d95;border-radius:6px;"
                title="Set total Qs in this unit">${unit.questionCount > 0 ? unit.questionCount + "Q" : "Set Qs"}</button>
            </div>
          </div>
          <div style="display:flex;gap:6px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <input id="qb-total-${subjectName}-${ui}" type="number" placeholder="Total Qs done" min="0"
              style="width:110px;font-size:12px;padding:6px 8px;">
            <input id="qb-correct-${subjectName}-${ui}" type="number" placeholder="Correct" min="0"
              style="width:90px;font-size:12px;padding:6px 8px;">
            <button onclick="logUnitQbank('${esc(subjectName)}',${ui})"
              style="padding:8px 10px;font-size:11px;margin:0;background:#1d4ed8;">Log</button>
            ${uTotal > 0 ? `<button onclick="clearUnitQbank('${esc(subjectName)}',${ui})"
              style="padding:8px 10px;font-size:11px;margin:0;background:#334155;">Clear</button>` : ""}
          </div>

          ${uAcc !== null ? `
            <div class="stat-bar" style="margin-top:8px;height:6px;">
              <div class="stat-fill ${uAcc>=75?"green":uAcc>=50?"yellow":"red"}" style="width:${uAcc}%"></div>
            </div>` : ""}
        `;
        subjectEl.appendChild(unitEl);
      }); // end units forEach
    } // end if !isQbCollapsed

    container.appendChild(subjectEl);
  });
}

// FIX: toggleQbankCollapse — previous logic `(current === false) ? true : false`
// was broken: when current=undefined (first click), it returned false (expand),
// but the default rendering was already treating undefined as collapsed=true.
// This mismatch caused "no visual change on first click" → double-press needed.
// Fix: store explicit true/false, treat undefined as true, then negate.
function toggleQbankCollapse(event, subjectName) {
  event.stopPropagation();
  if (!studyData.uiState) studyData.uiState = {};
  if (!studyData.uiState.qbankCollapsed) studyData.uiState.qbankCollapsed = {};
  let current = studyData.uiState.qbankCollapsed[subjectName];
  if (current === undefined) current = true; // default is collapsed
  studyData.uiState.qbankCollapsed[subjectName] = !current;
  saveData(); renderQbank();
}

function toggleUnitQbankDone(subjectName, ui, checked) {
  studyData.subjects[subjectName].units[ui].qbankDone = checked;
  saveData(); renderQbank();
}

function setQbankRevision(subjectName, ui, level) {
  let unit = studyData.subjects[subjectName].units[ui];
  // Toggle off if same level clicked
  if (unit.qbankRevision === level) {
    unit.qbankRevision = 0;
    unit.qbankDone = false;
  } else {
    unit.qbankRevision = level;
    unit.qbankDone = true;
  }
  saveData(); renderQbank();
}

function logUnitQbank(subjectName, ui) {
  let total   = parseInt(document.getElementById(`qb-total-${subjectName}-${ui}`)?.value) || 0;
  let correct = parseInt(document.getElementById(`qb-correct-${subjectName}-${ui}`)?.value) || 0;
  if (total <= 0) { alert("Enter total questions."); return; }
  if (correct > total) { alert("Correct cannot exceed total."); return; }

  let unit = studyData.subjects[subjectName].units[ui];
  unit.qbankStats.total   += total;
  unit.qbankStats.correct += correct;

  // Adjust difficulty factor for all chapters in this unit
  let q = Math.round((correct / total) * 5);
  unit.chapters.forEach(ch => {
    let ef = ch.difficultyFactor || 2.5;
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    ch.difficultyFactor = clamp(ef, 1.3, 3.0);
  });

  saveData(); renderQbank();
}

function clearUnitQbank(subjectName, ui) {
  if (!confirm("Clear qbank stats for this unit?")) return;
  let unit = studyData.subjects[subjectName].units[ui];
  unit.qbankStats = { total: 0, correct: 0 };
  unit.qbankDone = false;
  saveData(); renderQbank();
}

// ─── Tab Switching ────────────────────────────────────────────

function switchTab(tab) {
  document.getElementById("editorTab").style.display = tab === "editor" ? "block" : "none";
  document.getElementById("qbankTab").style.display  = tab === "qbank"  ? "block" : "none";
  document.getElementById("tabEditor").classList.toggle("active", tab === "editor");
  document.getElementById("tabQbank").classList.toggle("active",  tab === "qbank");
  if (tab === "editor") renderEditor();
  if (tab === "qbank")  renderQbank();
}

// ─── Bulk Import ──────────────────────────────────────────────

let _bulkSubjects = {};

function openBulkModal() {
  _bulkSubjects = {};
  document.getElementById("bulkModal").style.display = "block";
  document.body.style.overflow = "hidden";
  bulkGoStep1();
}

function closeBulkModal() {
  document.getElementById("bulkModal").style.display = "none";
  document.body.style.overflow = "";
  _bulkSubjects = {};
}

function bulkAddSubject() {
  let name     = document.getElementById("bulkSubjectName").value.trim();
  let size     = document.getElementById("bulkSubjectSize").value;
  let rawUnits = document.getElementById("bulkTopicsInput").value.trim();
  if (!name) { alert("Enter subject name."); return; }
  if (!rawUnits) { alert("Enter at least one unit."); return; }

  // Use smart parser: supports "Unit [Qs] | Chapter(start-end), ..."
  let units = parseUnitsText(rawUnits);
  if (!units.length) { alert("Could not parse any units."); return; }

  _bulkSubjects[name] = { size, units, pointer: { unit: 0, chapter: 0 } };
  document.getElementById("bulkSubjectName").value = "";
  document.getElementById("bulkTopicsInput").value = "";
  _renderBulkPreview();
}

function _renderBulkPreview() {
  let keys    = Object.keys(_bulkSubjects);
  let preview = document.getElementById("bulkPreview");
  let list    = document.getElementById("bulkPreviewList");
  let nextBtn = document.getElementById("bulkNextBtn");
  if (!keys.length) { preview.style.display = "none"; nextBtn.style.display = "none"; return; }

  preview.style.display = "block";
  nextBtn.style.display = "block";
  let sizeColors = { large: "#3b82f6", medium: "#8b5cf6", small: "#64748b" };

  list.innerHTML = keys.map(name => {
    let s = _bulkSubjects[name];
    let totalTopics = s.units.reduce((acc, u) => acc + u.chapters.length, 0);
    let totalPages  = s.units.reduce((acc, u) => acc + u.chapters.reduce((a, ch) => a + (ch.pageCount||0), 0), 0);
    let totalQs     = s.units.reduce((acc, u) => acc + (u.questionCount||0), 0);
    let meta = `${s.units.length} units, ${totalTopics} chapters`;
    if (totalPages > 0) meta += `, ${totalPages} pages`;
    if (totalQs > 0)    meta += `, ${totalQs} Qs`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1e293b;font-size:13px;">
        <span>${name} <span style="color:#64748b;font-size:11px;">(${meta})</span></span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span style="background:${sizeColors[s.size]};color:white;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:600;">${s.size}</span>
          <span onclick="bulkRemoveSubject('${esc(name)}')" style="color:#ef4444;cursor:pointer;font-size:18px;line-height:1;">×</span>
        </div>
      </div>`;
  }).join("");
}

function bulkRemoveSubject(name) {
  delete _bulkSubjects[name];
  _renderBulkPreview();
}

function bulkGoStep2() {
  let keys = Object.keys(_bulkSubjects);
  if (!keys.length) { alert("Add at least one subject first."); return; }

  let totalUnits = Object.values(_bulkSubjects).reduce((a, s) => a + s.units.length, 0);
  document.getElementById("bulkSummarySubjects").textContent = keys.length;
  document.getElementById("bulkSummaryTopics").textContent   = totalUnits;

  let sizeColors = { large: "#3b82f6", medium: "#8b5cf6", small: "#64748b" };
  document.getElementById("bulkReviewList").innerHTML = keys.map(name => {
    let s = _bulkSubjects[name];
    return `
      <div style="padding:6px 0;border-bottom:1px solid #1e293b;">
        <div style="display:flex;justify-content:space-between;font-size:13px;">
          <strong>${name}</strong>
          <span style="background:${sizeColors[s.size]};color:white;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:600;">${s.size}</span>
        </div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${s.units.length} units</div>
      </div>`;
  }).join("");

  document.getElementById("bulkStep1").style.display = "none";
  document.getElementById("bulkStep2").style.display = "block";
  let d1 = document.getElementById("bDot1"), d2 = document.getElementById("bDot2"), l1 = document.getElementById("bLine1");
  d1.style.cssText += ";background:#16a34a;border-color:#16a34a;color:white;"; d1.textContent = "✓";
  d2.style.cssText += ";background:#3b82f6;border-color:#3b82f6;color:white;";
  l1.style.background = "#16a34a";
}

function bulkGoStep1() {
  document.getElementById("bulkStep1").style.display = "block";
  document.getElementById("bulkStep2").style.display = "none";
  let d1 = document.getElementById("bDot1"), d2 = document.getElementById("bDot2"), l1 = document.getElementById("bLine1");
  d1.style.background = "#3b82f6"; d1.style.borderColor = "#3b82f6"; d1.style.color = "white"; d1.textContent = "1";
  d2.style.background = "#1e293b"; d2.style.borderColor = "#334155"; d2.style.color = "#64748b";
  l1.style.background = "#334155";
}

function bulkConfirmImport() {
  let keys = Object.keys(_bulkSubjects);
  if (!keys.length) return;
  keys.forEach(name => {
    if (studyData.subjects[name]) {
      // Merge units
      _bulkSubjects[name].units.forEach(u => studyData.subjects[name].units.push(u));
    } else {
      studyData.subjects[name] = _bulkSubjects[name];
    }
  });
  saveData();
  closeBulkModal();
  renderEditor();
  alert(`✓ Imported ${keys.length} subject${keys.length > 1 ? "s" : ""} successfully.`);
}

function toggleaddSubjectCollapse(buttonElement, contentId) {
  const contentDiv = document.getElementById(contentId);
  if (contentDiv.style.display === "none") {
    contentDiv.style.display = "block";
    buttonElement.innerHTML = "▼";
  } else {
    contentDiv.style.display = "none";
    buttonElement.innerHTML = "▶";
  }
}

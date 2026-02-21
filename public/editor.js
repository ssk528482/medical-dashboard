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
          <button class="collapse-btn" onclick="toggleSubjectCollapse('${esc(subjectName)}')">${isCollapsed ? "▶" : "▼"}</button>
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
        <input id="addUnit-${esc(subjectName)}" placeholder="New Unit Name">
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

        let unitEl = document.createElement("div");
        unitEl.className = "unit-block";

        unitEl.innerHTML = `
          <div class="unit-header">
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
              <button class="collapse-btn" onclick="toggleUnitCollapse('${esc(subjectName)}',${ui})" style="font-size:12px;padding:2px 5px;">${isUnitCollapsed ? "▶" : "▼"}</button>
              <span class="unit-title">${unit.name}</span>
              <span style="font-size:10px;color:#475569;flex-shrink:0;">${unitPct}% (${unitDone}/${unit.chapters.length})</span>
            </div>
            <button onclick="deleteUnit('${esc(subjectName)}',${ui})" style="background:transparent;color:#ef4444;padding:3px 7px;font-size:12px;margin:0;border:1px solid #450a0a;border-radius:6px;">✕</button>
          </div>
          <div class="stat-bar" style="margin:5px 0 4px;height:4px;">
            <div class="stat-fill ${unitPct>=75?"green":unitPct>=40?"yellow":"red"}" style="width:${unitPct}%"></div>
          </div>
        `;

        if (!isUnitCollapsed) {
          // Add chapter row
          let addChRow = document.createElement("div");
          addChRow.style.cssText = "display:flex;gap:6px;margin:6px 0 4px;";
          addChRow.innerHTML = `
            <input id="addCh-${esc(subjectName)}-${ui}" placeholder="New Chapter" style="flex:1;font-size:12px;padding:6px 8px;">
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
            // Completed = green if status completed
            // R1 green if revisionIndex >= 1, R2 green if >=2, R3 green if >=3
            // But only show current active level highlighted; all previous are also green
            let compActive = ch.status === "completed";
            let r1Active   = ch.revisionIndex >= 1;
            let r2Active   = ch.revisionIndex >= 2;
            let r3Active   = ch.revisionIndex >= 3;
            chRow.innerHTML = `
              <div class="topic-left">
                <span class="topic-name" style="font-size:12px;" title="${ch.name}">${ci + 1}. ${ch.name}</span>
              </div>
              <div class="topic-actions">
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

function toggleSubjectCollapse(name) {
  if (!studyData.uiState) studyData.uiState = {};
  if (!studyData.uiState.editorCollapsed) studyData.uiState.editorCollapsed = {};
  studyData.uiState.editorCollapsed[name] = !studyData.uiState.editorCollapsed[name];
  saveData(); renderEditor();
}

function toggleUnitCollapse(subjectName, ui) {
  if (!studyData.uiState.unitCollapsed) studyData.uiState.unitCollapsed = {};
  if (!studyData.uiState.unitCollapsed[subjectName]) studyData.uiState.unitCollapsed[subjectName] = {};
  studyData.uiState.unitCollapsed[subjectName][ui] = !studyData.uiState.unitCollapsed[subjectName][ui];
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
  let name = input?.value.trim();
  if (!name) return;
  studyData.subjects[subjectName].units.push(makeUnitObj(name));
  input.value = "";
  saveData(); renderEditor();
}

function deleteUnit(subjectName, ui) {
  if (!confirm("Delete this unit and all its chapters?")) return;
  studyData.subjects[subjectName].units.splice(ui, 1);
  fixPointer(subjectName);
  saveData(); renderEditor();
}

function addChapter(subjectName, ui) {
  let input = document.getElementById(`addCh-${subjectName}-${ui}`);
  let name = input?.value.trim();
  if (!name) return;
  studyData.subjects[subjectName].units[ui].chapters.push(makeChapterObj(name));
  input.value = "";
  saveData(); renderEditor();
}

function deleteChapter(subjectName, ui, ci) {
  studyData.subjects[subjectName].units[ui].chapters.splice(ci, 1);
  fixPointer(subjectName);
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

    let isQbCollapsed = studyData.uiState?.qbankCollapsed?.[subjectName];
    if (isQbCollapsed === undefined) isQbCollapsed = true;

    subjectEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${isQbCollapsed ? 0 : 10}px;">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
          <button class="collapse-btn" onclick="toggleQbankCollapse('${esc(subjectName)}')" style="font-size:12px;padding:2px 5px;">${isQbCollapsed ? "▶" : "▼"}</button>
          <div>
            <strong style="font-size:15px;">${subjectName}</strong>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">${doneUnits}/${subject.units.length} units done</div>
          </div>
        </div>
        <span style="padding:4px 10px;border-radius:8px;font-size:12px;font-weight:600;color:white;
          background:${overallAcc===null?"#334155":overallAcc>=75?"#16a34a":overallAcc>=50?"#eab308":"#ef4444"};">
          ${overallAcc !== null ? overallAcc + "%" : "—"}
        </span>
      </div>
      ${!isQbCollapsed && totalQ > 0 ? `
        <div class="stat-bar" style="margin-bottom:12px;height:6px;">
          <div class="stat-fill ${overallAcc>=75?"green":overallAcc>=50?"yellow":"red"}" style="width:${overallAcc}%"></div>
        </div>` : ""}
    `;

    if (!isQbCollapsed) {
      if (!subject.units.length) {
        let empty = document.createElement("div");
        empty.style.cssText = "color:#64748b;font-size:13px;padding:6px 0;";
        empty.textContent = "No units — add them in the Syllabus tab.";
        subjectEl.appendChild(empty);
      }

      subject.units.forEach((unit, ui) => {
      let uTotal   = unit.qbankStats.total;
      let uCorrect = unit.qbankStats.correct;
      let uAcc     = uTotal > 0 ? (uCorrect / uTotal * 100).toFixed(1) : null;

      let unitEl = document.createElement("div");
      unitEl.className = "qbank-unit-row";
      unitEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:#cbd5e1;">${unit.name}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">
              ${uAcc !== null ? `${uCorrect}/${uTotal} correct · ${uAcc}%` : "Not logged yet"}
            </div>
          </div>
          <div style="display:flex;gap:5px;align-items:center;flex-shrink:0;margin-left:8px;">
            <span class="pill rev ${unit.qbankRevision >= 1 ? "active" : ""}" style="cursor:pointer;font-size:11px;padding:3px 8px;"
              onclick="setQbankRevision('${esc(subjectName)}',${ui},1)">R1</span>
            <span class="pill rev ${unit.qbankRevision >= 2 ? "active" : ""}" style="cursor:pointer;font-size:11px;padding:3px 8px;"
              onclick="setQbankRevision('${esc(subjectName)}',${ui},2)">R2</span>
            <span class="pill rev ${unit.qbankRevision >= 3 ? "active" : ""}" style="cursor:pointer;font-size:11px;padding:3px 8px;"
              onclick="setQbankRevision('${esc(subjectName)}',${ui},3)">R3</span>
          </div>
        </div>

        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
          <div>
            <label style="font-size:10px;color:#64748b;display:block;margin-bottom:2px;">Total Qs</label>
            <input type="number" id="qb-total-${esc(subjectName)}-${ui}" placeholder="0" min="0"
              style="width:72px;font-size:13px;padding:6px 8px;" value="">
          </div>
          <div>
            <label style="font-size:10px;color:#64748b;display:block;margin-bottom:2px;">Correct</label>
            <input type="number" id="qb-correct-${esc(subjectName)}-${ui}" placeholder="0" min="0"
              style="width:72px;font-size:13px;padding:6px 8px;" value="">
          </div>
          <button onclick="logUnitQbank('${esc(subjectName)}',${ui})"
            style="padding:8px 14px;font-size:12px;margin:0;">Log ✓</button>
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

function toggleQbankCollapse(subjectName) {
  if (!studyData.uiState) studyData.uiState = {};
  if (!studyData.uiState.qbankCollapsed) studyData.uiState.qbankCollapsed = {};
  let current = studyData.uiState.qbankCollapsed[subjectName];
  studyData.uiState.qbankCollapsed[subjectName] = (current === false) ? true : false;
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

  // Parse "Unit Name | Topic1, Topic2" format
  let units = rawUnits.split("\n").filter(t => t.trim()).map(line => {
    let [unitPart, topicsPart] = line.split("|").map(s => s.trim());
    let unit = makeUnitObj(unitPart || line.trim());
    if (topicsPart) {
      unit.chapters = topicsPart.split(",").map(t => t.trim()).filter(Boolean).map(t => makeChapterObj(t));
    }
    return unit;
  });

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
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1e293b;font-size:13px;">
        <span>${name} <span style="color:#64748b;font-size:11px;">(${s.units.length} units, ${totalTopics} topics)</span></span>
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
  // Find the div we want to collapse/expand
  const contentDiv = document.getElementById(contentId);
  
  // Check its current display status
  if (contentDiv.style.display === "none") {
    // If hidden, show it and change arrow to down
    contentDiv.style.display = "block"; 
    buttonElement.innerHTML = "▼";
  } else {
    // If showing, hide it and change arrow to right
    contentDiv.style.display = "none";
    buttonElement.innerHTML = "▶";
  }
}

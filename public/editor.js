// ─── Flashcard + Note Badge Cache ─────────────────────────────────────────
// Loaded async on DOMContentLoaded; renderEditor() reads from these maps.
let _cardCountMap  = {};  // "Subject||Unit||Chapter" → { total, due }
let _noteCoverMap  = {};  // "Subject||Unit||Chapter" → true
let _badgesLoaded  = false;

async function _loadBadges() {
  try {
    if (typeof getCardCounts   === "function") { let r = await getCardCounts();   _cardCountMap = r.data || {}; }
    if (typeof getNotesCoverageMap === "function") { let r = await getNotesCoverageMap(); _noteCoverMap = r.data || {}; }
    _badgesLoaded = true;
  } catch(e) { console.warn("_loadBadges:", e); }
}

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
                <span class="topic-name" style="font-size:12px;" title="${ch.name}">${ci + 1}. ${ch.name}</span>${pageInfo}${phaseTag}${_getBadgeHtml(subjectName, unit.name, ch.name)}
              </div>
              <div class="topic-actions" style="gap:3px;flex-wrap:wrap;justify-content:flex-end;">
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


// ─── Badge Helpers ───────────────────────────────────────────────────────

function _getBadgeHtml(subject, unit, chapter) {
  let key    = subject + "||" + unit + "||" + chapter;
  let cards  = _cardCountMap[key];
  let hasNote = _noteCoverMap[key];
  let html   = "";

  // Note icon — links to notes.html with deep-link params
  let noteHref = "notes.html?subject=" + encodeURIComponent(subject)
               + "&unit="    + encodeURIComponent(unit)
               + "&chapter=" + encodeURIComponent(chapter);
  if (hasNote) {
    html += '<a href="' + noteHref + '" onclick="event.stopPropagation()" '
          + 'style="font-size:10px;margin-left:5px;text-decoration:none;" title="Open note">📝</a>';
  } else {
    html += '<a href="' + noteHref + '" onclick="event.stopPropagation()" '
          + 'style="font-size:10px;margin-left:5px;text-decoration:none;opacity:0.35;" title="Create note">📄</a>';
  }

  // Card badge — uses sessionStorage approach like browse.js
  if (cards) {
    let badgeStyle = cards.due > 0
      ? "background:#ef4444;color:#fff;"
      : "background:#1e3a5f;color:#93c5fd;";
    let onClick = cards.due > 0
      ? `_goToReviewChapter('${esc(subject)}','${esc(unit)}','${esc(chapter)}')`
      : `_goToBrowseChapter('${esc(subject)}','${esc(unit)}','${esc(chapter)}')`;
    html += '<a href="#" onclick="event.stopPropagation();event.preventDefault();' + onClick + ';return false;" '
          + 'style="font-size:9px;margin-left:3px;padding:1px 5px;border-radius:8px;'
          + badgeStyle + 'text-decoration:none;font-weight:700;" title="'
          + (cards.due > 0 ? cards.due + " due" : cards.total + " cards") + '">'
          + (cards.due > 0 ? cards.due + "🃏" : cards.total + "🃏") + '</a>';
  } else {
    // No cards yet — link to create page with pre-filled fields
    let createHref = "create.html?subject=" + encodeURIComponent(subject)
                   + "&unit=" + encodeURIComponent(unit)
                   + "&chapter=" + encodeURIComponent(chapter);
    html += '<a href="' + createHref + '" onclick="event.stopPropagation()" '
          + 'style="font-size:9px;margin-left:3px;padding:1px 5px;border-radius:8px;'
          + 'background:#0f172a;color:#334155;text-decoration:none;" title="Add flashcards">+🃏</a>';
  }

  return html;
}

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

async function addNewSubject() {
  let name = document.getElementById("newSubjectName")?.value.trim();
  let size = document.getElementById("newSubjectSize")?.value || "medium";
  if (!name) return;
  
  // Use direct Supabase function
  const success = await addSubjectDirect(name, size);
  if (success) {
    document.getElementById("newSubjectName").value = "";
    await loadEditorDataDirect(); // Reload from Supabase
    renderEditor();
  }
}

async function deleteSubject(name) {
  const success = await deleteSubjectDirect(name);
  if (success) {
    await loadEditorDataDirect();
    renderEditor();
  }
}

async function addUnit(subjectName) {
  let input = document.getElementById(`addUnit-${subjectName}`);
  let qInput = document.getElementById(`addUnitQ-${subjectName}`);
  let name = input?.value.trim();
  if (!name) return;
  let qCount = parseInt(qInput?.value) || 0;
  
  const success = await addUnitDirect(subjectName, name, qCount);
  if (success) {
    input.value = "";
    if (qInput) qInput.value = "";
    await loadEditorDataDirect();
    renderEditor();
  }
}

async function deleteUnit(subjectName, ui) {
  const success = await deleteUnitDirect(subjectName, ui);
  if (success) {
    await loadEditorDataDirect();
    renderEditor();
  }
}

function editUnitQuestionCount(subjectName, ui) {
  let unit = studyData.subjects[subjectName].units[ui];
  let current = unit.questionCount || 0;

  // Remove any existing overlay
  document.getElementById("qcountOverlay")?.remove();

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

  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  setTimeout(() => {
    let inp = document.getElementById("qcountInput");
    if (inp) {
      inp.focus(); inp.select();
      inp.addEventListener("keydown", e => {
        if (e.key === "Enter")  _saveQcount(subjectName, ui);
        if (e.key === "Escape") document.getElementById("qcountOverlay")?.remove();
      });
    }
  }, 50);
}

async function _saveQcount(subjectName, ui) {
  let val = parseInt(document.getElementById("qcountInput")?.value) || 0;
  document.getElementById("qcountOverlay")?.remove();
  
  const success = await updateUnitQuestionCountDirect(subjectName, ui, val);
  if (success) {
    renderQbank();
  }
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

async function addChapter(subjectName, ui) {
  let input  = document.getElementById(`addCh-${subjectName}-${ui}`);
  let sInput = document.getElementById(`addChS-${subjectName}-${ui}`);
  let eInput = document.getElementById(`addChE-${subjectName}-${ui}`);
  let name = input?.value.trim();
  if (!name) return;
  let startPage = parseInt(sInput?.value) || 0;
  let endPage   = parseInt(eInput?.value) || 0;
  
  const success = await addChapterDirect(subjectName, ui, name, startPage, endPage);
  if (success) {
    input.value = "";
    if (sInput) sInput.value = "";
    if (eInput) eInput.value = "";
    await loadEditorDataDirect();
    renderEditor();
  }
}

async function deleteChapter(subjectName, ui, ci) {
  const success = await deleteChapterDirect(subjectName, ui, ci);
  if (success) {
    await loadEditorDataDirect();
    renderEditor();
  }
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
    let totalQ = 0, totalCorrect = 0, totalSyllabus = 0;
    subject.units.forEach(u => {
      totalQ       += u.qbankStats.total;
      totalCorrect += u.qbankStats.correct;
      totalSyllabus += u.questionCount || 0;
    });
    let overallAcc     = totalQ > 0 ? (totalCorrect / totalQ * 100).toFixed(1) : null;
    let overallAttempt = totalSyllabus > 0 ? Math.min(100, Math.round(totalQ / totalSyllabus * 100)) : null;
    let doneUnits  = subject.units.filter(u => u.qbankDone).length;

    let subjectEl = document.createElement("div");
    subjectEl.className = "subject-card";
    subjectEl.style.marginBottom = "14px";

    // FIX: use explicit true/false check — undefined means "not set yet" → default collapsed (true)
    let isQbCollapsed = studyData.uiState?.qbankCollapsed?.[subjectName];
    if (isQbCollapsed === undefined) isQbCollapsed = true;

    subjectEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${isQbCollapsed ? 0 : 10}px;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
          <button class="collapse-btn" onclick="toggleQbankCollapse(event,'${esc(subjectName)}')" style="font-size:12px;padding:2px 5px;">${isQbCollapsed ? "▶" : "▼"}</button>
          <div>
            <strong style="font-size:15px;">${subjectName}</strong>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">${doneUnits}/${subject.units.length} units done</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
          ${overallAttempt !== null ? `<span style="padding:3px 8px;border-radius:7px;font-size:11px;font-weight:600;color:white;background:#1d4ed8;" title="Attempted">
            📝 ${overallAttempt}%</span>` : ""}
          <span style="padding:3px 8px;border-radius:7px;font-size:11px;font-weight:600;color:white;
            background:${overallAcc===null?"#334155":overallAcc>=75?"#16a34a":overallAcc>=50?"#eab308":"#ef4444"};"
            title="Accuracy">
            ${overallAcc !== null ? "🎯 " + overallAcc + "%" : "No data"}
          </span>
        </div>
      </div>
    `;

    if (!isQbCollapsed) {
      subject.units.forEach((unit, ui) => {
        let uTotal   = unit.qbankStats.total;
        let uCorrect = unit.qbankStats.correct;
        let uAcc     = uTotal > 0 ? (uCorrect / uTotal * 100).toFixed(1) : null;

        let unitEl = document.createElement("div");
        let isLocked = !!unit.qbankLocked;
        let isFullyAttempted = unit.questionCount > 0 && uTotal >= unit.questionCount;

        unitEl.style.cssText = `background:#0f172a;border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid ${unit.qbankDone ? "#16a34a" : "#1e293b"};`;

        // Attempted % — how much of the syllabus has been attempted
        let attemptPct = unit.questionCount > 0 ? Math.min(100, Math.round(uTotal / unit.questionCount * 100)) : null;
        let remaining  = unit.questionCount > 0 ? Math.max(0, unit.questionCount - uTotal) : null;
        // Accuracy % — correct out of attempted
        let accPct     = uTotal > 0 ? parseFloat((uCorrect / uTotal * 100).toFixed(1)) : null;

        // Lock button — unlocked = editable + logging ON; locked = both OFF
        let lockBtn = isLocked
          ? `<button onclick="unlockUnitQbank('${esc(subjectName)}',${ui})"
               style="padding:4px 8px;font-size:11px;margin:0;background:#064e3b;border:1px solid #10b981;border-radius:6px;white-space:nowrap;color:#10b981;" title="Locked — click to unlock and re-enable editing/logging">🔒 Locked</button>`
          : `<button onclick="lockUnitQbank('${esc(subjectName)}',${ui})"
               style="padding:4px 8px;font-size:11px;margin:0;background:#1e293b;border:1px solid #475569;border-radius:6px;white-space:nowrap;color:#94a3b8;" title="Lock to disable editing and logging">🔓 Lock</button>`;

        // Set Qs button — only editable when NOT locked
        let setQsBtn = !isLocked
          ? `<button onclick="editUnitQuestionCount('${esc(subjectName)}',${ui})"
               style="padding:4px 8px;font-size:11px;margin:0;background:#4c1d95;border-radius:6px;white-space:nowrap;"
               title="Set total Qs in this unit">${unit.questionCount > 0 ? unit.questionCount + "Q" : "Set Qs"}</button>`
          : `<span style="font-size:11px;color:#8b5cf6;font-weight:600;">${unit.questionCount > 0 ? unit.questionCount + "Q" : ""}</span>`;

        // Complete button
        let completeBtn = `<span class="pill completed ${unit.qbankDone ? "active" : ""}" style="cursor:pointer;"
          onclick="markUnitQbankComplete('${esc(subjectName)}',${ui})" title="${unit.qbankDone ? "Mark incomplete" : "Mark complete — enter score"}">✓</span>`;

        // Logging section — ENABLED when unlocked, DISABLED when locked
        let logSection = "";
        if (isLocked) {
          // Locked: no editing, no logging
          logSection = `<div style="margin-top:10px;background:#0a1628;border-radius:8px;padding:8px 10px;border:1px dashed #334155;">
            <div style="font-size:11px;color:#475569;text-align:center;">🔒 Locked — unlock to edit total Qs or log more</div>
            ${uTotal > 0 ? `<div style="display:flex;justify-content:center;margin-top:8px;">
              <button onclick="clearUnitQbank('${esc(subjectName)}',${ui})"
                style="padding:6px 14px;font-size:11px;margin:0;background:#334155;">Clear All</button>
            </div>` : ""}
          </div>`;
        } else if (unit.qbankDone && isFullyAttempted) {
          // Unlocked but complete — show clear option
          logSection = `<div style="margin-top:10px;background:#052e16;border-radius:8px;padding:8px 10px;border:1px solid #16a34a;">
            <div style="font-size:11px;color:#4ade80;text-align:center;">✅ Unit complete — use Clear to reset</div>
            <div style="display:flex;justify-content:center;margin-top:8px;">
              <button onclick="clearUnitQbank('${esc(subjectName)}',${ui})"
                style="padding:6px 14px;font-size:11px;margin:0;background:#334155;">Clear All</button>
            </div>
          </div>`;
        } else {
          // Unlocked — full logging available
          logSection = `<div style="display:flex;gap:6px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <input id="qb-total-${subjectName}-${ui}" type="number" placeholder="Attempted" min="0"
              style="width:100px;font-size:12px;padding:6px 8px;">
            <input id="qb-correct-${subjectName}-${ui}" type="number" placeholder="Correct" min="0"
              style="width:90px;font-size:12px;padding:6px 8px;">
            <button onclick="logUnitQbank('${esc(subjectName)}',${ui})"
              style="padding:8px 10px;font-size:11px;margin:0;background:#1d4ed8;">Log</button>
            ${uTotal > 0 ? `<button onclick="clearUnitQbank('${esc(subjectName)}',${ui})"
              style="padding:8px 10px;font-size:11px;margin:0;background:#334155;">Clear</button>` : ""}
          </div>`;
        }

        unitEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <strong style="font-size:13px;">${unit.name}</strong>
                ${unit.questionCount > 0 ? `<span style="font-size:11px;color:#8b5cf6;">📚 ${unit.questionCount}Q</span>` : ""}
                ${unit.qbankDone ? `<span style="font-size:10px;background:#052e16;color:#4ade80;padding:1px 6px;border-radius:4px;border:1px solid #16a34a;">DONE ✓</span>` : ""}
              </div>

              <div style="margin-top:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                  <span style="font-size:11px;color:#94a3b8;font-weight:600;">ATTEMPTED</span>
                  <span style="font-size:11px;font-weight:700;color:${attemptPct===null?"#475569":attemptPct>=75?"#10b981":attemptPct>=40?"#eab308":"#ef4444"};">
                    ${attemptPct !== null ? `${uTotal} / ${unit.questionCount} (${attemptPct}%)` : `${uTotal} done`}
                  </span>
                </div>
                <div class="stat-bar" style="height:5px;">
                  <div class="stat-fill ${attemptPct===null?"":attemptPct>=75?"green":attemptPct>=40?"yellow":"red"}"
                    style="width:${attemptPct ?? (uTotal > 0 ? 100 : 0)}%"></div>
                </div>
                ${remaining !== null && remaining > 0 ? `<div style="font-size:10px;color:#475569;margin-top:2px;">${remaining} Qs remaining</div>` : ""}
              </div>

              <div style="margin-top:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                  <span style="font-size:11px;color:#94a3b8;font-weight:600;">ACCURACY</span>
                  <span style="font-size:11px;font-weight:700;color:${accPct===null?"#475569":accPct>=75?"#10b981":accPct>=50?"#eab308":"#ef4444"};">
                    ${accPct !== null ? `${uCorrect} / ${uTotal} correct (${accPct}%)` : "No data yet"}
                  </span>
                </div>
                <div class="stat-bar" style="height:5px;">
                  <div class="stat-fill ${accPct===null?"":accPct>=75?"green":accPct>=50?"yellow":"red"}"
                    style="width:${accPct ?? 0}%"></div>
                </div>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;">
              ${completeBtn}
              ${setQsBtn}
              ${lockBtn}
            </div>
          </div>
          ${logSection}
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

// ── Mark unit complete via popup (asks for correct count) ──────
function markUnitQbankComplete(subjectName, ui) {
  let unit = studyData.subjects[subjectName].units[ui];

  // If already done → toggle off
  if (unit.qbankDone) {
    unit.qbankDone = false;
    saveData(); renderQbank();
    return;
  }

  let totalQs = unit.questionCount || unit.qbankStats.total || 0;

  // Build popup
  document.getElementById("qcountOverlay")?.remove();
  let overlay = document.createElement("div");
  overlay.id = "qcountOverlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;";

  overlay.innerHTML = `
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:24px;width:100%;max-width:340px;">
      <div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">✅ Mark Qbank Complete</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:16px;">${unit.name}</div>
      ${totalQs > 0 ? `<div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">Total questions: <strong style="color:#f1f5f9;">${totalQs}</strong></div>` : ""}
      <label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px;">How many did you get correct?</label>
      <input id="qCompleteCorrect" type="number" min="0" max="${totalQs || 99999}" placeholder="e.g. 72"
        style="width:100%;font-size:20px;padding:10px 14px;border-radius:10px;border:2px solid #16a34a;background:#0f172a;color:#f1f5f9;margin-bottom:6px;text-align:center;">
      ${totalQs > 0 ? `<div style="font-size:11px;color:#475569;margin-bottom:14px;text-align:center;">out of ${totalQs}</div>` : `<div style="font-size:11px;color:#475569;margin-bottom:14px;text-align:center;">Enter your score</div>`}
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('qcountOverlay').remove()"
          style="flex:1;background:#334155;margin:0;padding:10px;">Cancel</button>
        <button onclick="_confirmUnitComplete('${subjectName.replace(/'/g,"\\'")}',${ui},${totalQs})"
          style="flex:1;background:#16a34a;margin:0;padding:10px;font-weight:700;">✓ Mark Done</button>
      </div>
    </div>`;

  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => {
    let inp = document.getElementById("qCompleteCorrect");
    if (inp) {
      inp.focus();
      inp.addEventListener("keydown", e => {
        if (e.key === "Enter")  _confirmUnitComplete(subjectName, ui, totalQs);
        if (e.key === "Escape") document.getElementById("qcountOverlay")?.remove();
      });
    }
  }, 50);
}

async function _confirmUnitComplete(subjectName, ui, totalQs) {
  let correct = parseInt(document.getElementById("qCompleteCorrect")?.value) || 0;
  let unit = studyData.subjects[subjectName].units[ui];

  // Use questionCount as total if set, else use what was entered
  let total = totalQs > 0 ? totalQs : correct;
  if (correct > total) { alert("Correct cannot exceed total."); return; }

  // Adjust difficulty
  let q = Math.round((correct / total) * 5);
  unit.chapters.forEach(ch => {
    let ef = ch.difficultyFactor || 2.5;
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    ch.difficultyFactor = clamp(ef, 1.3, 3.0);
  });

  const newQuestionCount = unit.questionCount > 0 ? unit.questionCount : total;

  // Save to Supabase directly
  const success = await updateUnitQbankStatsDirect(
    subjectName,
    ui,
    { total: total, correct: correct },
    true, // qbankDone
    newQuestionCount
  );
  
  if (success) {
    document.getElementById("qcountOverlay")?.remove();
    renderQbank();
  }
}

// ── Lock / Unlock ──────────────────────────────────────────────
function lockUnitQbank(subjectName, ui) {
  let unit = studyData.subjects[subjectName].units[ui];
  unit.qbankLocked = true;
  saveData(); renderQbank();
}

function unlockUnitQbank(subjectName, ui) {
  let unit = studyData.subjects[subjectName].units[ui];
  unit.qbankLocked = false;
  saveData(); renderQbank();
}

function toggleUnitQbankDone(subjectName, ui, checked) {
  studyData.subjects[subjectName].units[ui].qbankDone = checked;
  saveData(); renderQbank();
}

function setQbankRevision(subjectName, ui, level) {
  let unit = studyData.subjects[subjectName].units[ui];
  if (unit.qbankRevision === level) {
    unit.qbankRevision = 0;
    unit.qbankDone = false;
  } else {
    unit.qbankRevision = level;
    unit.qbankDone = true;
  }
  saveData(); renderQbank();
}

async function logUnitQbank(subjectName, ui) {
  let total   = parseInt(document.getElementById(`qb-total-${subjectName}-${ui}`)?.value) || 0;
  let correct = parseInt(document.getElementById(`qb-correct-${subjectName}-${ui}`)?.value) || 0;
  if (total <= 0) { alert("Enter attempted questions."); return; }
  if (correct > total) { alert("Correct cannot exceed attempted."); return; }

  let unit = studyData.subjects[subjectName].units[ui];

  // Auto-expand questionCount if logging exceeds it
  let newTotal = unit.qbankStats.total + total;
  let newCorrect = unit.qbankStats.correct + correct;
  let newQuestionCount = unit.questionCount;
  
  if (unit.questionCount > 0 && newTotal > unit.questionCount) {
    newQuestionCount = newTotal;
  }

  // Check if auto-complete
  let isDone = unit.qbankDone;
  if (newQuestionCount > 0 && newTotal >= newQuestionCount) {
    isDone = true;
  }

  // Adjust difficulty
  let q = Math.round((correct / total) * 5);
  unit.chapters.forEach(ch => {
    let ef = ch.difficultyFactor || 2.5;
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    ch.difficultyFactor = clamp(ef, 1.3, 3.0);
  });

  // Save to Supabase directly
  const success = await updateUnitQbankStatsDirect(
    subjectName, 
    ui, 
    { total: newTotal, correct: newCorrect },
    isDone,
    newQuestionCount !== unit.questionCount ? newQuestionCount : null
  );
  
  if (success) {
    // Clear inputs
    let totalInput = document.getElementById(`qb-total-${subjectName}-${ui}`);
    let correctInput = document.getElementById(`qb-correct-${subjectName}-${ui}`);
    if (totalInput) totalInput.value = "";
    if (correctInput) correctInput.value = "";
    
    renderQbank();
  }
}

async function clearUnitQbank(subjectName, ui) {
  if (!confirm("Clear all qbank data for this unit? This resets attempts, accuracy, lock and completion.")) return;
  
  const success = await updateUnitQbankStatsDirect(
    subjectName,
    ui,
    { total: 0, correct: 0 },
    false, // qbankDone
    null // keep questionCount as is
  );
  
  if (success) {
    renderQbank();
  }
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


// ─── Flashcard Navigation Helpers ─────────────────────────────────────────
// These functions filter cards by subject/unit/chapter and navigate to review/browse
// using the same sessionStorage approach as browse.js

async function _goToReviewChapter(subject, unit, chapter) {
  try {
    // Fetch due cards using the proper function
    let { data: dueCards } = await fetchDueCards(today());
    if (!dueCards || !dueCards.length) {
      alert('No cards due for review');
      return;
    }

    // Filter by subject/unit/chapter
    let filtered = dueCards.filter(c => {
      if (c.subject !== subject) return false;
      if (c.unit !== unit) return false;
      if (c.chapter !== chapter) return false;
      return true;
    });

    if (!filtered.length) {
      alert('No cards due for review in this chapter');
      return;
    }

    // Store card IDs in sessionStorage and navigate
    let cardIds = filtered.map(c => c.id);
    sessionStorage.setItem('reviewCardIds', JSON.stringify(cardIds));
    window.location.href = 'review.html?mode=filtered';
  } catch (err) {
    console.error('Error navigating to review:', err);
    alert('Error loading cards. Please try again.');
  }
}

async function _goToBrowseChapter(subject, unit, chapter) {
  try {
    // Fetch all cards
    let { data } = await fetchCards({ suspended: false });
    if (!data || !data.length) {
      alert('No cards found');
      return;
    }

    // Filter by subject/unit/chapter
    let filtered = data.filter(c => {
      if (c.subject !== subject) return false;
      if (c.unit !== unit) return false;
      if (c.chapter !== chapter) return false;
      return true;
    });

    if (!filtered.length) {
      alert('No cards found in this chapter');
      return;
    }

    // Store card IDs in sessionStorage and navigate
    let cardIds = filtered.map(c => c.id);
    sessionStorage.setItem('reviewCardIds', JSON.stringify(cardIds));
    window.location.href = 'review.html?mode=filtered';
  } catch (err) {
    console.error('Error navigating to browse:', err);
    alert('Error loading cards. Please try again.');
  }
}


// ─── Flashcard + Note Badge Boot ──────────────────────────────────────────
// Load badge data and re-render once available. Runs on every page load.
document.addEventListener("DOMContentLoaded", async function() {
  await _loadBadges();
  // Re-render the active tab so badges appear
  let tab = new URLSearchParams(window.location.search).get("tab") || "editor";
  if (tab === "editor") renderEditor();
});

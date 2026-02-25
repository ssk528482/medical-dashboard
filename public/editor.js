
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

// ─── Editor Search ───────────────────────────────────────────────────────
let _editorSearchQuery = "";

function renderEditor() {
  let container = document.getElementById("editorContainer");
  if (!container) return;
  container.innerHTML = "";

  let names = Object.keys(studyData.subjects);
  if (!names.length) {
    container.innerHTML = `<div class="card" style="color:#64748b;text-align:center;padding:24px;">No subjects yet. Add one above.</div>`;
    return;
  }

  // ── #8 Search bar ──
  let searchWrap = document.createElement("div");
  searchWrap.style.cssText = "margin-bottom:12px;position:relative;";
  searchWrap.innerHTML = `
    <input id="editorSearch" type="search" placeholder="🔍 Search chapters…"
      value="${_editorSearchQuery.replace(/"/g,'&quot;')}"
      oninput="_editorSearchQuery=this.value;renderEditor()"
      style="width:100%;padding:8px 36px 8px 12px;font-size:13px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#f1f5f9;">
    ${_editorSearchQuery ? `<button onclick="_editorSearchQuery='';renderEditor()" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:transparent;padding:0;font-size:16px;color:#64748b;margin:0;">✕</button>` : ""}
  `;
  container.appendChild(searchWrap);

  let q = _editorSearchQuery.trim().toLowerCase();

  names.forEach((subjectName, subjectIdx) => {
    let subject = studyData.subjects[subjectName];
    let isCollapsed = studyData.uiState?.editorCollapsed?.[subjectName];
    if (isCollapsed === undefined) isCollapsed = true;
    // If searching, force expand all
    if (q) isCollapsed = false;

    let totalCh = 0, doneCh = 0, r1Ch = 0, r2Ch = 0, r3Ch = 0;
    subject.units.forEach(u => {
      totalCh += u.chapters.length;
      u.chapters.forEach(ch => {
        if (ch.status === "completed") doneCh++;
        if (ch.revisionIndex >= 1) r1Ch++;
        if (ch.revisionIndex >= 2) r2Ch++;
        if (ch.revisionIndex >= 3) r3Ch++;
      });
    });
    let pct   = totalCh > 0 ? ((doneCh / totalCh) * 100).toFixed(0) : 0;
    let r1pct = totalCh > 0 ? ((r1Ch  / totalCh) * 100).toFixed(0) : 0;
    let r2pct = totalCh > 0 ? ((r2Ch  / totalCh) * 100).toFixed(0) : 0;
    let r3pct = totalCh > 0 ? ((r3Ch  / totalCh) * 100).toFixed(0) : 0;

    // #4 Size badge color
    let sizeColor = { large: "#3b82f6", medium: "#8b5cf6", small: "#64748b" }[subject.size] || "#64748b";

    let subjectEl = document.createElement("div");
    subjectEl.className = "subject-card";
    subjectEl.style.marginBottom = "14px";

    // #7 Summary counts line
    let summaryLine = `<span style="font-size:10px;color:#64748b;">✓${doneCh} R1:${r1Ch} R2:${r2Ch} R3:${r3Ch} / ${totalCh}ch</span>`;

    subjectEl.innerHTML = `
      <div class="subject-header">
        <div class="subject-title" style="display:flex;align-items:center;gap:8px;cursor:default;flex-wrap:wrap;">
          <button class="collapse-btn" onclick="toggleSubjectCollapse(event,'${esc(subjectName)}')">${isCollapsed ? "▶" : "▼"}</button>
          <span id="subj-label-${esc(subjectName)}" style="cursor:pointer;" ondblclick="startRenameSubject('${esc(subjectName)}')"
            title="Double-click to rename">${subjectName}</span>
          <button onclick="startRenameSubject('${esc(subjectName)}')" class="edit-name-btn" title="Rename subject">✏</button>
          ${summaryLine}
          <span class="size-badge" style="background:${sizeColor};" onclick="cycleSubjectSize('${esc(subjectName)}')" title="Click to change size">${subject.size}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button onclick="moveSubject('${esc(subjectName)}',-1)" class="reorder-btn" title="Move up">↑</button>
          <button onclick="moveSubject('${esc(subjectName)}',1)"  class="reorder-btn" title="Move down">↓</button>
          <button class="delete-btn" onclick="deleteSubject('${esc(subjectName)}')">Delete</button>
        </div>
      </div>
      <div style="margin-top:6px;">
        <div class="rev-bar-row">
          <span class="rev-bar-label" style="color:#3b82f6;">Done</span>
          <div class="rev-bar-track"><div class="rev-bar-fill" style="width:${pct}%;background:#3b82f6;"></div></div>
          <span class="rev-bar-pct">${pct}%</span>
        </div>
        <div class="rev-bar-row">
          <span class="rev-bar-label" style="color:#8b5cf6;">R1</span>
          <div class="rev-bar-track"><div class="rev-bar-fill" style="width:${r1pct}%;background:#8b5cf6;"></div></div>
          <span class="rev-bar-pct">${r1pct}%</span>
        </div>
        <div class="rev-bar-row">
          <span class="rev-bar-label" style="color:#f59e0b;">R2</span>
          <div class="rev-bar-track"><div class="rev-bar-fill" style="width:${r2pct}%;background:#f59e0b;"></div></div>
          <span class="rev-bar-pct">${r2pct}%</span>
        </div>
        <div class="rev-bar-row">
          <span class="rev-bar-label" style="color:#f97316;">R3</span>
          <div class="rev-bar-track"><div class="rev-bar-fill" style="width:${r3pct}%;background:#f97316;"></div></div>
          <span class="rev-bar-pct">${r3pct}%</span>
        </div>
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
        if (isUnitCollapsed === undefined) isUnitCollapsed = true;
        if (q) isUnitCollapsed = false; // expand all when searching

        let unitDone = unit.chapters.filter(c => c.status === "completed").length;
        let unitR1   = unit.chapters.filter(c => c.revisionIndex >= 1).length;
        let unitR2   = unit.chapters.filter(c => c.revisionIndex >= 2).length;
        let unitR3   = unit.chapters.filter(c => c.revisionIndex >= 3).length;
        let unitTotal = unit.chapters.length;
        let unitPct  = unitTotal > 0 ? ((unitDone / unitTotal) * 100).toFixed(0) : 0;
        let uR1pct   = unitTotal > 0 ? ((unitR1   / unitTotal) * 100).toFixed(0) : 0;
        let uR2pct   = unitTotal > 0 ? ((unitR2   / unitTotal) * 100).toFixed(0) : 0;
        let uR3pct   = unitTotal > 0 ? ((unitR3   / unitTotal) * 100).toFixed(0) : 0;

        // Unit-level pill states
        let unitAllDone = unitTotal > 0 && unit.chapters.every(c => c.status === "completed");
        let unitAllR1   = unitTotal > 0 && unit.chapters.every(c => c.revisionIndex >= 1);
        let unitAllR2   = unitTotal > 0 && unit.chapters.every(c => c.revisionIndex >= 2);
        let unitAllR3   = unitTotal > 0 && unit.chapters.every(c => c.revisionIndex >= 3);

        // #10 Qbank % badge
        let uQbankBadge = "";
        if (unit.qbankStats?.total > 0) {
          let qpct = (unit.qbankStats.correct / unit.qbankStats.total * 100).toFixed(0);
          let qcol = qpct >= 75 ? "#10b981" : qpct >= 50 ? "#eab308" : "#ef4444";
          uQbankBadge = `<span style="font-size:10px;color:${qcol};flex-shrink:0;" title="Qbank accuracy">·QB${qpct}%</span>`;
        }

        let unitEl = document.createElement("div");
        unitEl.className = "unit-block";

        unitEl.innerHTML = `
          <div class="unit-header" style="flex-wrap:wrap;row-gap:6px;">
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
              <button class="collapse-btn" onclick="toggleUnitCollapse(event,'${esc(subjectName)}',${ui})" style="font-size:12px;padding:2px 5px;">${isUnitCollapsed ? "▶" : "▼"}</button>
              <span id="unit-label-${esc(subjectName)}-${ui}" style="font-weight:600;font-size:13px;cursor:pointer;" ondblclick="startRenameUnit('${esc(subjectName)}',${ui})" title="Double-click to rename">${unit.name}</span>
              <button onclick="startRenameUnit('${esc(subjectName)}',${ui})" class="edit-name-btn" title="Rename unit">✏</button>
              <span style="font-size:10px;color:#475569;flex-shrink:0;">${unitPct}% (${unitDone}/${unitTotal})</span>
              ${unit.questionCount > 0 ? `<span style="font-size:10px;color:#8b5cf6;flex-shrink:0;">·${unit.questionCount}Q</span>` : ""}
              ${uQbankBadge}
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
              <span class="pill completed ${unitAllDone ? "active" : ""}" style="font-size:10px;padding:2px 6px;" onclick="toggleUnitCompleted('${esc(subjectName)}',${ui})" title="Mark all chapters complete">✓</span>
              <span class="pill rev ${unitAllR1 ? "active" : ""}" style="font-size:10px;padding:2px 6px;" onclick="markUnitRevised('${esc(subjectName)}',${ui},1)" title="Mark all chapters R1">R1</span>
              <span class="pill rev ${unitAllR2 ? "active" : ""}" style="font-size:10px;padding:2px 6px;" onclick="markUnitRevised('${esc(subjectName)}',${ui},2)" title="Mark all chapters R2">R2</span>
              <span class="pill rev ${unitAllR3 ? "active" : ""}" style="font-size:10px;padding:2px 6px;" onclick="markUnitRevised('${esc(subjectName)}',${ui},3)" title="Mark all chapters R3">R3</span>
              <button onclick="editUnitQuestionCount('${esc(subjectName)}',${ui})" style="background:transparent;color:#8b5cf6;padding:3px 7px;font-size:11px;margin:0;border:1px solid #4c1d95;border-radius:6px;" title="Set total questions">Qs</button>
              <button onclick="moveUnit('${esc(subjectName)}',${ui},-1)" class="reorder-btn" title="Move unit up">↑</button>
              <button onclick="moveUnit('${esc(subjectName)}',${ui},1)"  class="reorder-btn" title="Move unit down">↓</button>
              <button onclick="deleteUnit('${esc(subjectName)}',${ui})" style="background:transparent;color:#ef4444;padding:3px 7px;font-size:12px;margin:0;border:1px solid #450a0a;border-radius:6px;">✕</button>
            </div>
          </div>
          <div style="margin:4px 0 2px;">
            <div class="rev-bar-row" style="margin-bottom:2px;">
              <span class="rev-bar-label" style="color:#3b82f6;">D</span>
              <div class="rev-bar-track"><div class="rev-bar-fill" style="width:${unitPct}%;background:#3b82f6;"></div></div>
              <span class="rev-bar-pct">${unitPct}%</span>
            </div>
            <div class="rev-bar-row" style="margin-bottom:2px;">
              <span class="rev-bar-label" style="color:#8b5cf6;">R1</span>
              <div class="rev-bar-track"><div class="rev-bar-fill" style="width:${uR1pct}%;background:#8b5cf6;"></div></div>
              <span class="rev-bar-pct">${uR1pct}%</span>
            </div>
            <div class="rev-bar-row" style="margin-bottom:2px;">
              <span class="rev-bar-label" style="color:#f59e0b;">R2</span>
              <div class="rev-bar-track"><div class="rev-bar-fill" style="width:${uR2pct}%;background:#f59e0b;"></div></div>
              <span class="rev-bar-pct">${uR2pct}%</span>
            </div>
            <div class="rev-bar-row">
              <span class="rev-bar-label" style="color:#f97316;">R3</span>
              <div class="rev-bar-track"><div class="rev-bar-fill" style="width:${uR3pct}%;background:#f97316;"></div></div>
              <span class="rev-bar-pct">${uR3pct}%</span>
            </div>
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

          // ── #9 Bulk chapter paste row ──
          let bulkRow = document.createElement("div");
          bulkRow.style.cssText = "margin:4px 0 6px;";
          bulkRow.innerHTML = `
            <details style="font-size:12px;">
              <summary style="cursor:pointer;color:#64748b;padding:2px 0;">📋 Bulk paste chapters</summary>
              <div style="margin-top:6px;">
                <textarea id="bulkCh-${esc(subjectName)}-${ui}" placeholder="Chapter Name&#10;Another Chapter | 10-25&#10;Third Chapter | 26-40" rows="4"
                  style="width:100%;font-size:12px;padding:6px 8px;background:#0f172a;color:#f1f5f9;border:1px solid #334155;border-radius:6px;resize:vertical;"></textarea>
                <div style="font-size:10px;color:#475569;margin:3px 0 5px;">Format: <code style="color:#64748b;">Chapter Name</code> or <code style="color:#64748b;">Chapter Name | startPg-endPg</code></div>
                <button onclick="bulkAddChapters('${esc(subjectName)}',${ui})" style="margin-top:4px;padding:5px 14px;font-size:12px;">Add All</button>
              </div>
            </details>
          `;
          unitEl.appendChild(bulkRow);

          // Chapters
          if (!unit.chapters.length) {
            let emptyMsg = document.createElement("div");
            emptyMsg.style.cssText = "color:#475569;font-size:12px;padding:4px 0;";
            emptyMsg.textContent = "No chapters yet.";
            unitEl.appendChild(emptyMsg);
          }

          unit.chapters.forEach((ch, ci) => {
            // #8 Search filter — skip chapters that don't match
            if (q && !ch.name.toLowerCase().includes(q) &&
                !unit.name.toLowerCase().includes(q) &&
                !subjectName.toLowerCase().includes(q)) return;

            let chRow = document.createElement("div");
            let compActive = ch.status === "completed";
            let r1Active   = ch.revisionIndex >= 1;
            let r2Active   = ch.revisionIndex >= 2;
            let r3Active   = ch.revisionIndex >= 3;
            let diff = ch.difficulty || "medium";
            let diffColors = { easy: "#10b981", medium: "#eab308", hard: "#ef4444" };

            // #6 Overdue highlight
            let isOverdue = ch.nextRevision && ch.nextRevision < today();
            chRow.className = "chapter-row" + (isOverdue ? " chapter-overdue" : "");

            let pageInfo = ch.pageCount > 0
              ? `<span style="font-size:10px;color:#475569;margin-left:4px;">pg ${ch.startPage}–${ch.endPage} (${ch.pageCount}p)</span>`
              : "";
            let phaseTag = "";
            if (r3Active)      phaseTag = `<span style="font-size:9px;background:#7c3aed;color:white;padding:1px 5px;border-radius:4px;margin-left:4px;">R3</span>`;
            else if (r2Active) phaseTag = `<span style="font-size:9px;background:#d97706;color:white;padding:1px 5px;border-radius:4px;margin-left:4px;">R2</span>`;
            else if (r1Active) phaseTag = `<span style="font-size:9px;background:#1d4ed8;color:white;padding:1px 5px;border-radius:4px;margin-left:4px;">R1</span>`;
            else if (compActive) phaseTag = `<span style="font-size:9px;background:#15803d;color:white;padding:1px 5px;border-radius:4px;margin-left:4px;">Done</span>`;

            // #5 Next revision date
            let revDateTag = "";
            if (ch.nextRevision) {
              let d = new Date(ch.nextRevision + "T12:00:00");
              let label = d.toLocaleDateString(undefined, { month:"short", day:"numeric" });
              let overdueStyle = isOverdue ? "color:#ef4444;font-weight:700;" : "color:#475569;";
              revDateTag = `<span style="font-size:10px;${overdueStyle}margin-left:4px;" title="Next revision">📅${label}</span>`;
            }

            // #2 Rename button for chapter
            let chNameHtml = `<span id="ch-label-${esc(subjectName)}-${ui}-${ci}" style="cursor:pointer;" ondblclick="startRenameChapter('${esc(subjectName)}',${ui},${ci})" title="Double-click to rename">${ci + 1}. ${ch.name}</span>
              <button onclick="startRenameChapter('${esc(subjectName)}',${ui},${ci})" class="edit-name-btn" title="Rename chapter">✏</button>`;

            chRow.innerHTML = `
              <div class="topic-left" style="flex:1;min-width:0;flex-wrap:wrap;">
                <span class="topic-name" style="font-size:12px;display:flex;align-items:center;gap:2px;flex-wrap:wrap;">${chNameHtml}${pageInfo}${phaseTag}${revDateTag}${_getBadgeHtml(subjectName, unit.name, ch.name)}</span>
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
                <button onclick="moveChapter('${esc(subjectName)}',${ui},${ci},-1)" class="reorder-btn" title="Move up">↑</button>
                <button onclick="moveChapter('${esc(subjectName)}',${ui},${ci},1)"  class="reorder-btn" title="Move down">↓</button>
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

// ── #2 Inline rename ─────────────────────────────────────────
function startRenameSubject(name) {
  let span = document.getElementById("subj-label-" + name);
  if (!span) return;
  let old = name;
  span.outerHTML = `<input id="subj-input-${esc(name)}" class="inline-rename-input" value="${old.replace(/"/g,'&quot;')}"
    onblur="commitRenameSubject('${esc(name)}',this.value)"
    onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value='${esc(old)}';this.blur();}"
    style="font-size:14px;font-weight:700;min-width:80px;width:${Math.max(old.length,8)}ch;">`;
  setTimeout(() => { let inp = document.getElementById("subj-input-" + name); if (inp) { inp.focus(); inp.select(); } }, 10);
}

function commitRenameSubject(oldName, newName) {
  newName = newName.trim();
  if (!newName || newName === oldName) { renderEditor(); return; }
  if (studyData.subjects[newName]) { alert("A subject with that name already exists."); renderEditor(); return; }
  let obj = studyData.subjects[oldName];
  studyData.subjects[newName] = obj;
  delete studyData.subjects[oldName];
  // Update uiState keys
  if (studyData.uiState?.editorCollapsed) {
    studyData.uiState.editorCollapsed[newName] = studyData.uiState.editorCollapsed[oldName];
    delete studyData.uiState.editorCollapsed[oldName];
  }
  if (studyData.uiState?.unitCollapsed?.[oldName]) {
    studyData.uiState.unitCollapsed[newName] = studyData.uiState.unitCollapsed[oldName];
    delete studyData.uiState.unitCollapsed[oldName];
  }
  saveData(); renderEditor();
}

function startRenameUnit(subjectName, ui) {
  let span = document.getElementById(`unit-label-${subjectName}-${ui}`);
  if (!span) return;
  let old = studyData.subjects[subjectName].units[ui].name;
  span.outerHTML = `<input id="unit-input-${esc(subjectName)}-${ui}" class="inline-rename-input" value="${old.replace(/"/g,'&quot;')}"
    onblur="commitRenameUnit('${esc(subjectName)}',${ui},this.value)"
    onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value='${esc(old)}';this.blur();}"
    style="font-size:13px;font-weight:600;min-width:60px;width:${Math.max(old.length,6)}ch;">`;
  setTimeout(() => { let inp = document.getElementById(`unit-input-${subjectName}-${ui}`); if (inp) { inp.focus(); inp.select(); } }, 10);
}

function commitRenameUnit(subjectName, ui, newName) {
  newName = newName.trim();
  if (!newName) { renderEditor(); return; }
  studyData.subjects[subjectName].units[ui].name = newName;
  saveData(); renderEditor();
}

function startRenameChapter(subjectName, ui, ci) {
  let span = document.getElementById(`ch-label-${subjectName}-${ui}-${ci}`);
  if (!span) return;
  let old = studyData.subjects[subjectName].units[ui].chapters[ci].name;
  span.outerHTML = `<input id="ch-input-${esc(subjectName)}-${ui}-${ci}" class="inline-rename-input" value="${old.replace(/"/g,'&quot;')}"
    onblur="commitRenameChapter('${esc(subjectName)}',${ui},${ci},this.value)"
    onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value='${esc(old)}';this.blur();}"
    style="font-size:12px;min-width:60px;width:${Math.max(old.length,6)}ch;">`;
  setTimeout(() => { let inp = document.getElementById(`ch-input-${subjectName}-${ui}-${ci}`); if (inp) { inp.focus(); inp.select(); } }, 10);
}

function commitRenameChapter(subjectName, ui, ci, newName) {
  newName = newName.trim();
  if (!newName) { renderEditor(); return; }
  studyData.subjects[subjectName].units[ui].chapters[ci].name = newName;
  saveData(); renderEditor();
}

// ── #3 Reorder ────────────────────────────────────────────────
function moveSubject(name, dir) {
  let keys = Object.keys(studyData.subjects);
  let idx = keys.indexOf(name);
  let target = idx + dir;
  if (target < 0 || target >= keys.length) return;
  // Rebuild subjects object in new order
  let entries = Object.entries(studyData.subjects);
  let tmp = entries[idx]; entries[idx] = entries[target]; entries[target] = tmp;
  studyData.subjects = Object.fromEntries(entries);
  saveData(); renderEditor();
}

function moveUnit(subjectName, ui, dir) {
  let units = studyData.subjects[subjectName].units;
  let target = ui + dir;
  if (target < 0 || target >= units.length) return;
  [units[ui], units[target]] = [units[target], units[ui]];
  fixPointer(subjectName);
  saveData(); renderEditor();
}

function moveChapter(subjectName, ui, ci, dir) {
  let chapters = studyData.subjects[subjectName].units[ui].chapters;
  let target = ci + dir;
  if (target < 0 || target >= chapters.length) return;
  [chapters[ci], chapters[target]] = [chapters[target], chapters[ci]];
  fixPointer(subjectName);
  saveData(); renderEditor();
}

// ── #4 Cycle subject size ─────────────────────────────────────
function cycleSubjectSize(name) {
  let sizes = ["small", "medium", "large"];
  let cur = studyData.subjects[name].size || "medium";
  let next = sizes[(sizes.indexOf(cur) + 1) % sizes.length];
  studyData.subjects[name].size = next;
  saveData(); renderEditor();
}

// ── #9 Bulk add chapters ──────────────────────────────────────
function bulkAddChapters(subjectName, ui) {
  let ta = document.getElementById(`bulkCh-${subjectName}-${ui}`);
  if (!ta) return;
  let lines = ta.value.split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return;
  lines.forEach(line => {
    // Parse optional page range: "Chapter Name | 10-25" or "Chapter Name|10-25"
    let name, startPage = 0, endPage = 0;
    let pipeIdx = line.lastIndexOf("|");
    if (pipeIdx !== -1) {
      name = line.slice(0, pipeIdx).trim();
      let pagesPart = line.slice(pipeIdx + 1).trim(); // e.g. "10-25"
      let dashIdx = pagesPart.indexOf("-");
      if (dashIdx !== -1) {
        startPage = parseInt(pagesPart.slice(0, dashIdx)) || 0;
        endPage   = parseInt(pagesPart.slice(dashIdx + 1)) || 0;
      } else {
        startPage = parseInt(pagesPart) || 0;
        endPage   = startPage;
      }
    } else {
      name = line;
    }
    if (!name) return;
    studyData.subjects[subjectName].units[ui].chapters.push(makeChapterObj(name, startPage, endPage));
  });
  ta.value = "";
  saveData(); renderEditor();
}


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

// Card badge — links to separate review / browse / create pages
  if (cards) {
    let cardHref = cards.due > 0
      ? "review.html?subject="  + encodeURIComponent(subject)
          + "&unit="    + encodeURIComponent(unit)
          + "&chapter=" + encodeURIComponent(chapter)
      : "browse.html?subject=" + encodeURIComponent(subject)
          + "&unit="    + encodeURIComponent(unit)
          + "&chapter=" + encodeURIComponent(chapter);
    let badgeStyle = cards.due > 0
      ? "background:#ef4444;color:#fff;"
      : "background:#1e3a5f;color:#93c5fd;";
    html += '<a href="' + cardHref + '" onclick="event.stopPropagation()" '
          + 'style="font-size:9px;margin-left:3px;padding:1px 5px;border-radius:8px;'
          + badgeStyle + 'text-decoration:none;font-weight:700;" title="'
          + (cards.due > 0 ? cards.due + " due" : cards.total + " cards") + '">'  
          + (cards.due > 0 ? cards.due + "🃏" : cards.total + "🃏") + '</a>';
  } else {
    // No cards yet — quick-add link
    let createHref = "create.html"
                   + "?subject=" + encodeURIComponent(subject)
                   + "&unit="    + encodeURIComponent(unit)
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

function _saveQcount(subjectName, ui) {
  let val = parseInt(document.getElementById("qcountInput")?.value) || 0;
  studyData.subjects[subjectName].units[ui].questionCount = val;
  document.getElementById("qcountOverlay")?.remove();
  saveData();
  renderQbank();
}

// ─── Unit-level Bulk Actions ──────────────────────────────────

// Helper: after manually setting ch.revisionIndex = idx,
// compute the correct nextRevision from revisionDates or freshly from today.
function _resolveNextRevision(ch, idx) {
  if (idx >= BASE_INTERVALS.length) return null; // all revisions complete
  // Re-use the stored date if it exists and is in the future (or today)
  if (ch.revisionDates?.[idx] && ch.revisionDates[idx] >= today()) return ch.revisionDates[idx];
  // Otherwise calculate from today
  return addDays(today(), computeNextInterval(ch, idx));
}

// Ensure revisionDates has entries at indices 0 .. level (inclusive).
// Missing slots are filled by computing forward from today.
function _ensureRevisionDates(ch, level) {
  if (!ch.revisionDates) ch.revisionDates = [];
  for (let i = 0; i <= level; i++) {
    if (!ch.revisionDates[i]) {
      let prev = i === 0 ? today() : (ch.revisionDates[i - 1] || today());
      ch.revisionDates[i] = addDays(prev, computeNextInterval(ch, i));
    }
  }
}

function toggleUnitCompleted(subjectName, ui) {
  let unit = studyData.subjects[subjectName].units[ui];
  if (!unit || !unit.chapters.length) return;

  let allDone = unit.chapters.every(c => c.status === "completed");

  unit.chapters.forEach(ch => {
    if (allDone) {
      // Toggle OFF — reset all chapters to not-started
      ch.status = "not-started";
      ch.completedOn = null;   // fix: was never cleared before
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
      if (ch.revisionIndex >= level) {
        ch.revisionIndex = level - 1;
        // Update nextRevision to match the rolled-back level
        ch.nextRevision = level - 1 === 0
          ? (ch.revisionDates?.[0] || addDays(today(), computeNextInterval(ch, 0)))
          : _resolveNextRevision(ch, level - 1);
      }
    } else {
      // Toggle ON — bring all chapters up to this level
      if (ch.revisionIndex < level) {
        _ensureRevisionDates(ch, level);
        ch.revisionIndex = level;
        ch.lastReviewedOn = today();
        // nextRevision = the date AFTER this level (i.e. the next one to do)
        ch.nextRevision = _resolveNextRevision(ch, level);
      }
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
    // Toggle OFF
    ch.status = "not-started";
    ch.completedOn = null;     // fix: was never cleared before
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
  if (!ch) return;

  // ── Guards ──
  if (level === 1 && ch.status !== "completed") {
    alert("Mark chapter as completed (✓) first before marking R1.");
    return;
  }
  if (level === 2 && ch.revisionIndex < 1) {   // fix: removed wrong && condition
    alert("Complete R1 first before marking R2.");
    return;
  }
  if (level === 3 && ch.revisionIndex < 2) {
    alert("Complete R2 first before marking R3.");
    return;
  }

  // ── Auto-mark completed when any revision is manually set ──
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

  // ── Toggle off if clicking the same level ──
  if (ch.revisionIndex === level) {
    ch.revisionIndex = level - 1;
    // nextRevision rolls back to the date for the level we just unchecked
    ch.nextRevision = level - 1 === 0
      ? (ch.revisionDates?.[0] || addDays(today(), computeNextInterval(ch, 0)))
      : _resolveNextRevision(ch, level - 1);
    saveData(); renderEditor();
    return;
  }

  // ── Set to this level ──
  _ensureRevisionDates(ch, level);  // fill any missing slots in revisionDates
  ch.revisionIndex = level;
  ch.lastReviewedOn = today();
  // nextRevision = the NEXT revision after this level
  ch.nextRevision = _resolveNextRevision(ch, level);

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

function _confirmUnitComplete(subjectName, ui, totalQs) {
  let correct = parseInt(document.getElementById("qCompleteCorrect")?.value) || 0;
  let unit = studyData.subjects[subjectName].units[ui];

  // Use questionCount as total if set, else use what was entered
  let total = totalQs > 0 ? totalQs : correct;
  if (correct > total) { alert("Correct cannot exceed total."); return; }

  // Set stats — replace (not add) since this is a direct complete
  unit.qbankStats.total   = total;
  unit.qbankStats.correct = correct;
  unit.questionCount      = unit.questionCount > 0 ? unit.questionCount : total;
  unit.qbankDone          = true;
  unit.qbankLocked        = true; // auto-lock on complete

  // Adjust difficulty
  let q = Math.round((correct / total) * 5);
  unit.chapters.forEach(ch => {
    let ef = ch.difficultyFactor || 2.5;
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    ch.difficultyFactor = clamp(ef, 1.3, 3.0);
  });

  document.getElementById("qcountOverlay")?.remove();
  saveData(); renderQbank();
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

function logUnitQbank(subjectName, ui) {
  let total   = parseInt(document.getElementById(`qb-total-${subjectName}-${ui}`)?.value) || 0;
  let correct = parseInt(document.getElementById(`qb-correct-${subjectName}-${ui}`)?.value) || 0;
  if (total <= 0) { alert("Enter attempted questions."); return; }
  if (correct > total) { alert("Correct cannot exceed attempted."); return; }

  let unit = studyData.subjects[subjectName].units[ui];

  // Auto-expand questionCount if logging exceeds it
  let newTotal = unit.qbankStats.total + total;
  if (unit.questionCount > 0 && newTotal > unit.questionCount) {
    unit.questionCount = newTotal;
  }

  unit.qbankStats.total   += total;
  unit.qbankStats.correct += correct;

  // Auto-complete if fully attempted
  if (unit.questionCount > 0 && unit.qbankStats.total >= unit.questionCount) {
    unit.qbankDone = true;
  }

  // Adjust difficulty
  let q = Math.round((correct / total) * 5);
  unit.chapters.forEach(ch => {
    let ef = ch.difficultyFactor || 2.5;
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    ch.difficultyFactor = clamp(ef, 1.3, 3.0);
  });

  saveData(); renderQbank();
}

function clearUnitQbank(subjectName, ui) {
  if (!confirm("Clear all qbank data for this unit? This resets attempts, accuracy, lock and completion.")) return;
  let unit = studyData.subjects[subjectName].units[ui];
  unit.qbankStats   = { total: 0, correct: 0 };
  unit.qbankDone    = false;
  unit.qbankLocked  = false;
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


// ─── Flashcard + Note Badge Boot ──────────────────────────────────────────
// Load badge data and re-render once available. Runs on every page load.
document.addEventListener("DOMContentLoaded", async function() {
  await _loadBadges();
  // Re-render the active tab so badges appear
  let tab = new URLSearchParams(window.location.search).get("tab") || "editor";
  if (tab === "editor") renderEditor();
});

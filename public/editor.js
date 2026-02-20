function renderEditor() {
  let container = document.getElementById("subjectsEditorContainer");
  if (!container) return;
  container.innerHTML = "";

  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];
    let isCollapsed = studyData.uiState?.editorCollapsed?.[subjectName] || false;

    let div = document.createElement("div");
    div.className = "subject-card";
    div.style.marginBottom = "16px";

    // ── Subject Header ──
    let header = document.createElement("div");
    header.className = "subject-header";

    let completedCount = subject.topics.filter(t => t.status === "completed").length;
    let totalTopics = subject.topics.length;
    let pct = totalTopics > 0 ? ((completedCount/totalTopics)*100).toFixed(0) : 0;

    header.innerHTML = `
      <div class="subject-title" style="display:flex;align-items:center;gap:8px;">
        <button class="collapse-btn">${isCollapsed ? "▶" : "▼"}</button>
        <span>${subjectName}</span>
        <span style="font-size:11px;color:#64748b;font-weight:400;">${pct}%</span>
      </div>
      <button class="delete-btn" onclick="deleteSubject('${subjectName}')">Delete</button>
    `;

    header.querySelector(".collapse-btn").onclick = function () {
      if (!studyData.uiState) studyData.uiState = {};
      if (!studyData.uiState.editorCollapsed) studyData.uiState.editorCollapsed = {};
      studyData.uiState.editorCollapsed[subjectName] = !isCollapsed;
      saveData();
      renderEditor();
    };

    div.appendChild(header);

    // Progress bar
    let pbar = document.createElement("div");
    pbar.className = "stat-bar";
    pbar.style.marginTop = "8px";
    pbar.innerHTML = `<div class="stat-fill ${pct>=75?"green":pct>=40?"yellow":"red"}" style="width:${pct}%"></div>`;
    div.appendChild(pbar);

    if (!isCollapsed) {
      // ── Add Topic Row ──
      let addRow = document.createElement("div");
      addRow.className = "add-topic-row";
      addRow.style.marginTop = "12px";
      addRow.innerHTML = `
        <input id="addTopic-${subjectName}" placeholder="New Topic Name">
        <button onclick="addTopic('${subjectName}')">Add</button>
      `;
      div.appendChild(addRow);

      // ── Topics ──
      subject.topics.forEach((topic, index) => {
        let row = document.createElement("div");
        row.className = "topic-row";

        row.innerHTML = `
          <div class="topic-left">
            <span class="topic-name" title="${topic.name}">${index + 1}. ${topic.name}</span>
          </div>
          <div class="topic-actions">
            <span class="pill completed ${topic.status === "completed" ? "active" : ""}"
              onclick="toggleCompleted('${subjectName}', ${index})">✓</span>
            <span class="pill rev ${topic.revisionIndex === 1 ? "active" : ""}"
              onclick="markRevised('${subjectName}', ${index}, 1)">R1</span>
            <span class="pill rev ${topic.revisionIndex === 2 ? "active" : ""}"
              onclick="markRevised('${subjectName}', ${index}, 2)">R2</span>
            <span class="pill rev ${topic.revisionIndex >= 3 ? "active" : ""}"
              onclick="markRevised('${subjectName}', ${index}, 3)">R3</span>
            <span class="pill qbank ${topic.qbankDone ? "active" : ""}"
              onclick="toggleQbank('${subjectName}', ${index})">Q</span>
            <button class="icon-btn" onclick="deleteTopic('${subjectName}', ${index})">✕</button>
          </div>
        `;
        div.appendChild(row);
      });

      if (subject.topics.length === 0) {
        let empty = document.createElement("div");
        empty.style.cssText = "color:#64748b;font-size:13px;padding:10px 0;";
        empty.textContent = "No topics yet. Add one above.";
        div.appendChild(empty);
      }
    }

    container.appendChild(div);
  });

  if (Object.keys(studyData.subjects).length === 0) {
    container.innerHTML = `<div class="card" style="color:#64748b;text-align:center;">No subjects yet. Add one above.</div>`;
  }
}

function addNewSubject() {
  let name = document.getElementById("newSubjectName").value.trim();
  let size = document.getElementById("newSubjectSize").value;
  if (!name) return;

  if (!studyData.subjects[name]) {
    studyData.subjects[name] = {
      size: size,
      topics: [],
      pointer: 0,
      qbank: { total: 0, correct: 0 }
    };
  }

  document.getElementById("newSubjectName").value = "";
  saveData();
  renderEditor();
}

function deleteSubject(subjectName) {
  if (!confirm(`Delete "${subjectName}" and all its topics?`)) return;
  delete studyData.subjects[subjectName];
  saveData();
  renderEditor();
}

function addTopic(subjectName) {
  let input = document.getElementById(`addTopic-${subjectName}`);
  let topicName = input.value.trim();
  if (!topicName) return;

  studyData.subjects[subjectName].topics.push(makeTopicObj(topicName));
  input.value = "";
  saveData();
  renderEditor();
}

function deleteTopic(subjectName, index) {
  studyData.subjects[subjectName].topics.splice(index, 1);
  fixPointer(subjectName);
  saveData();
  renderEditor();
}

function toggleCompleted(subjectName, index) {
  let topic = studyData.subjects[subjectName].topics[index];
  if (topic.status === "completed") {
    topic.status = "not-started";
    topic.revisionIndex = 0;
    topic.nextRevision = null;
    topic.revisionDates = [];
  } else {
    topic.status = "completed";
    topic.completedOn = today();
    topic.lastReviewedOn = today();
    // Generate adaptive revision schedule
    let dates = [], cursor = today();
    for (let i = 0; i < BASE_INTERVALS.length; i++) {
      let interval = computeNextInterval(topic, i);
      cursor = addDays(cursor, interval);
      dates.push(cursor);
    }
    topic.revisionDates = dates;
    topic.nextRevision = dates[0];
    topic.revisionIndex = 0;
  }
  fixPointer(subjectName);
  saveData();
  renderEditor();
}

function markRevised(subjectName, index, level) {
  let topic = studyData.subjects[subjectName].topics[index];
  topic.revisionIndex = level;
  topic.lastReviewedOn = today();
  saveData();
  renderEditor();
}

function toggleQbank(subjectName, index) {
  let topic = studyData.subjects[subjectName].topics[index];
  topic.qbankDone = !topic.qbankDone;
  saveData();
  renderEditor();
}

// ─── Bulk Import ──────────────────────────────────────────────

let bulkSubjects = {};

function openBulkModal() {
  bulkSubjects = {};
  document.getElementById("bulkModal").style.display = "block";
  document.body.style.overflow = "hidden";
  bulkGoStep1();
}

function closeBulkModal() {
  document.getElementById("bulkModal").style.display = "none";
  document.body.style.overflow = "";
  bulkSubjects = {};
}

function bulkAddSubject() {
  let name = document.getElementById("bulkSubjectName").value.trim();
  let size = document.getElementById("bulkSubjectSize").value;
  let topicsRaw = document.getElementById("bulkTopicsInput").value.trim();

  if (!name) { alert("Enter subject name."); return; }
  if (!topicsRaw) { alert("Enter at least one topic."); return; }

  let topics = topicsRaw.split("\n").filter(t => t.trim()).map(t => makeTopicObj(t.trim()));
  bulkSubjects[name] = { size, topics, pointer: 0, qbank: { total: 0, correct: 0 } };

  // Clear inputs for next subject
  document.getElementById("bulkSubjectName").value = "";
  document.getElementById("bulkTopicsInput").value = "";

  renderBulkPreview();
}

function renderBulkPreview() {
  let keys = Object.keys(bulkSubjects);
  let preview = document.getElementById("bulkPreview");
  let list = document.getElementById("bulkPreviewList");
  let nextBtn = document.getElementById("bulkNextBtn");

  if (keys.length === 0) { preview.style.display = "none"; nextBtn.style.display = "none"; return; }

  preview.style.display = "block";
  nextBtn.style.display = "block";

  let sizeColors = { large: "#3b82f6", medium: "#8b5cf6", small: "#64748b" };

  list.innerHTML = keys.map(name => {
    let s = bulkSubjects[name];
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1e293b;font-size:13px;">
        <span>${name} <span style="color:#64748b;font-size:11px;">(${s.topics.length} topics)</span></span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span style="background:${sizeColors[s.size]};color:white;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:600;">${s.size}</span>
          <span onclick="bulkRemoveSubject('${name}')" style="color:#ef4444;cursor:pointer;font-size:16px;line-height:1;">×</span>
        </div>
      </div>
    `;
  }).join("");
}

function bulkRemoveSubject(name) {
  delete bulkSubjects[name];
  renderBulkPreview();
}

function bulkGoStep2() {
  let keys = Object.keys(bulkSubjects);
  if (keys.length === 0) { alert("Add at least one subject first."); return; }

  let totalTopics = Object.values(bulkSubjects).reduce((a, s) => a + s.topics.length, 0);

  document.getElementById("bulkSummarySubjects").textContent = keys.length;
  document.getElementById("bulkSummaryTopics").textContent = totalTopics;

  let sizeColors = { large: "#3b82f6", medium: "#8b5cf6", small: "#64748b" };

  document.getElementById("bulkReviewList").innerHTML = keys.map(name => {
    let s = bulkSubjects[name];
    return `
      <div style="padding:6px 0;border-bottom:1px solid #1e293b;">
        <div style="display:flex;justify-content:space-between;font-size:13px;">
          <strong>${name}</strong>
          <span style="background:${sizeColors[s.size]};color:white;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:600;">${s.size}</span>
        </div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${s.topics.length} topics</div>
      </div>
    `;
  }).join("");

  // Update step indicators
  document.getElementById("bulkStep1").style.display = "none";
  document.getElementById("bulkStep2").style.display = "block";
  document.getElementById("bDot1").style.background = "#16a34a";
  document.getElementById("bDot1").style.borderColor = "#16a34a";
  document.getElementById("bDot1").textContent = "✓";
  document.getElementById("bDot2").style.background = "#3b82f6";
  document.getElementById("bDot2").style.borderColor = "#3b82f6";
  document.getElementById("bDot2").style.color = "white";
  document.getElementById("bLine1").style.background = "#16a34a";
}

function bulkGoStep1() {
  document.getElementById("bulkStep1").style.display = "block";
  document.getElementById("bulkStep2").style.display = "none";
  document.getElementById("bDot1").style.background = "#3b82f6";
  document.getElementById("bDot1").style.borderColor = "#3b82f6";
  document.getElementById("bDot1").style.color = "white";
  document.getElementById("bDot1").textContent = "1";
  document.getElementById("bDot2").style.background = "#1e293b";
  document.getElementById("bDot2").style.borderColor = "#334155";
  document.getElementById("bDot2").style.color = "#64748b";
  document.getElementById("bLine1").style.background = "#334155";
}

function bulkConfirmImport() {
  let keys = Object.keys(bulkSubjects);
  if (keys.length === 0) return;

  keys.forEach(name => {
    // Don't overwrite if subject already exists — merge topics instead
    if (studyData.subjects[name]) {
      bulkSubjects[name].topics.forEach(t => {
        studyData.subjects[name].topics.push(t);
      });
    } else {
      studyData.subjects[name] = bulkSubjects[name];
    }
  });

  saveData();
  closeBulkModal();
  renderEditor();
  alert(`✓ Imported ${keys.length} subject${keys.length > 1 ? "s" : ""} successfully.`);
}

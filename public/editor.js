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

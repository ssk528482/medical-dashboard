function renderEditor() {
  let container = document.getElementById("subjectsEditorContainer");
  if (!container) return;

  container.innerHTML = "";

  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];

    let isCollapsed =
      studyData.uiState?.editorCollapsed?.[subjectName] || false;

    let div = document.createElement("div");
    div.className = "subject-card";

    // ===== SUBJECT HEADER =====
    let header = document.createElement("div");
    header.className = "subject-header";

    header.innerHTML = `
      <div class="subject-title">
        <span class="collapse-btn">
          ${isCollapsed ? "▶" : "▼"}
        </span>
        ${subjectName}
      </div>

      <button class="delete-btn"
        onclick="deleteSubject('${subjectName}')">
        Delete
      </button>
    `;

    header.querySelector(".collapse-btn").onclick = function () {
      if (!studyData.uiState) studyData.uiState = {};
      if (!studyData.uiState.editorCollapsed)
        studyData.uiState.editorCollapsed = {};

      studyData.uiState.editorCollapsed[subjectName] = !isCollapsed;

      saveData();
      renderEditor();
    };

    div.appendChild(header);

    if (!isCollapsed) {

      // ===== ADD TOPIC ROW =====
      let addRow = document.createElement("div");
      addRow.className = "add-topic-row";

      addRow.innerHTML = `
        <input id="addTopic-${subjectName}" placeholder="New Topic">
        <button onclick="addTopic('${subjectName}')">Add</button>
      `;

      div.appendChild(addRow);

      // ===== TOPICS =====
      subject.topics.forEach((topic, index) => {

        let row = document.createElement("div");
        row.className = "topic-row";

        let completedClass =
          topic.status === "completed" ? "completed" : "";

        let revActive =
          topic.revisionIndex > 0 ? "active" : "";

        let qbankActive =
          topic.qbankDone ? "active" : "";

        row.innerHTML = `
          <div class="topic-left">
            <span class="topic-name">
              ${index + 1}. ${topic.name}
            </span>
          </div>

          <div class="topic-actions">

            <span class="pill completed ${completedClass}"
              onclick="toggleCompleted('${subjectName}', ${index})">
              ✓
            </span>

            <span class="pill rev ${revActive}"
              onclick="markRevised('${subjectName}', ${index}, 1)">
              Rev
            </span>

            <span class="pill qbank ${qbankActive}"
              onclick="toggleQbank('${subjectName}', ${index})">
              Q
            </span>

            <button class="icon-btn"
              onclick="deleteTopic('${subjectName}', ${index})">
              ✕
            </button>

          </div>
        `;

        div.appendChild(row);
      });
    }

    container.appendChild(div);
  });
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

  saveData();
  renderEditor();
}

function deleteSubject(subjectName) {

  delete studyData.subjects[subjectName];

  saveData();
  renderEditor();
}

function addTopic(subjectName) {
  let input = document.getElementById(`addTopic-${subjectName}`);
  let topicName = input.value.trim();

  if (!topicName) return;

  studyData.subjects[subjectName].topics.push({
    name: topicName,
    status: "not-started",
    completedOn: null,
    revisionDates: [],
    revisionIndex: 0,
    nextRevision: null,
    anki: false,
    qbankDone: false
  });

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
  } else {
    topic.status = "completed";
    topic.completedOn = today();
  }

  fixPointer(subjectName);
  saveData();
  renderEditor();
}

function markRevised(subjectName, index, level) {
  let topic = studyData.subjects[subjectName].topics[index];
  topic.revisionIndex = level;
  saveData();
  renderEditor();
}

function toggleQbank(subjectName, index) {
  let topic = studyData.subjects[subjectName].topics[index];
  topic.qbankDone = !topic.qbankDone;
  saveData();
  renderEditor();
}

function changeSize(subjectName, newSize) {
  studyData.subjects[subjectName].size = newSize;
  saveData();
}

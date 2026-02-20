function renderEditor() {
  let container = document.getElementById("editorContainer");
  container.innerHTML = "";

  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];

    let card = document.createElement("div");
    card.className = "subject-card";

    let isCollapsed =
      studyData.uiState?.editorCollapsed?.[subjectName] || false;

    // ===== HEADER =====
    let header = document.createElement("div");
    header.className = "subject-header";

    header.innerHTML = `
      <div class="subject-title">
        <span class="collapse-btn">
          ${isCollapsed ? "▶" : "▼"}
        </span>
        ${subjectName}
      </div>
      <button class="delete-btn" onclick="deleteSubject('${subjectName}')">
        Delete
      </button>
    `;

    header.querySelector(".collapse-btn").onclick = function () {
      if (!studyData.uiState.editorCollapsed)
        studyData.uiState.editorCollapsed = {};

      studyData.uiState.editorCollapsed[subjectName] = !isCollapsed;
      saveData();
      renderEditor();
    };

    card.appendChild(header);

    if (!isCollapsed) {
      // ===== ADD TOPIC =====
      let addRow = document.createElement("div");
      addRow.className = "add-topic-row";

      addRow.innerHTML = `
        <input type="text" id="topicInput-${subjectName}" placeholder="New Topic">
        <button onclick="addTopic('${subjectName}')">Add</button>
      `;

      card.appendChild(addRow);

      // ===== TOPICS =====
      subject.topics.forEach((topic, index) => {

        let topicRow = document.createElement("div");
        topicRow.className = "topic-row";

        let completedIcon =
          topic.status === "completed"
            ? `<span class="status completed">✓</span>`
            : `<span class="status pending">•</span>`;

        let revBadge =
          topic.revisionIndex > 0
            ? `<span class="badge rev">Rev ${topic.revisionIndex}</span>`
            : "";

        let qbankBadge =
          topic.qbankStats?.total > 0
            ? `<span class="badge qbank">
                ${Math.round(
                  (topic.qbankStats.correct /
                    (topic.qbankStats.total || 1)) *
                    100
                )}%
              </span>`
            : "";

        topicRow.innerHTML = `
          <div class="topic-left">
            ${completedIcon}
            <span class="topic-name">${index + 1}. ${topic.name}</span>
          </div>
          <div class="topic-right">
            ${revBadge}
            ${qbankBadge}
            <button class="icon-btn delete-topic"
              onclick="deleteTopic('${subjectName}', ${index})">
              ✕
            </button>
          </div>
        `;

        card.appendChild(topicRow);
      });
    }

    container.appendChild(card);
  });
}

function addTopic(subjectName) {
  let input = document.getElementById(`topicInput-${subjectName}`);
  let topicName = input.value.trim();
  if (!topicName) return;

  studyData.subjects[subjectName].topics.push({
    name: topicName,
    status: "pending",
    revisionIndex: 0,
    qbankStats: { total: 0, correct: 0 }
  });

  input.value = "";
  saveData();
  renderEditor();
}

function deleteSubject(subjectName) {
  delete studyData.subjects[subjectName];
  saveData();
  renderEditor();
}

function deleteTopic(subjectName, index) {
  studyData.subjects[subjectName].topics.splice(index, 1);
  saveData();
  renderEditor();
}

document.addEventListener("DOMContentLoaded", renderEditor);

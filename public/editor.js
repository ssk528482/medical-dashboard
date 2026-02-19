function renderEditor() {
  let container = document.getElementById("subjectsEditorContainer");
  container.innerHTML = "";

  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];

    let div = document.createElement("div");
    div.style.border = "1px solid #ccc";
    div.style.padding = "10px";
    div.style.marginBottom = "15px";

    let topicsHTML = "";

    subject.topics.forEach((topic, index) => {
      topicsHTML += `
        <div style="margin-bottom:5px;">
          ${topic.name}
          <button onclick="deleteTopic('${subjectName}', ${index})">❌</button>

          <label>
            <input type="checkbox"
              ${topic.status === "completed" ? "checked" : ""}
              onchange="toggleCompleted('${subjectName}', ${index})">
            Completed
          </label>

          <label>
            <input type="checkbox"
              ${topic.revisionIndex >= 1 ? "checked" : ""}
              onchange="markRevised('${subjectName}', ${index}, 1)">
            Rev1
          </label>

          <label>
            <input type="checkbox"
              ${topic.revisionIndex >= 2 ? "checked" : ""}
              onchange="markRevised('${subjectName}', ${index}, 2)">
            Rev2
          </label>

          <label>
            <input type="checkbox"
              ${topic.qbankDone ? "checked" : ""}
              onchange="toggleQbank('${subjectName}', ${index})">
            Qbank
          </label>
        </div>
      `;
    });

    div.innerHTML = `
      <strong>${subjectName}</strong>
      <select onchange="changeSize('${subjectName}', this.value)">
        <option value="large" ${subject.size === "large" ? "selected" : ""}>Large</option>
        <option value="medium" ${subject.size === "medium" ? "selected" : ""}>Medium</option>
        <option value="small" ${subject.size === "small" ? "selected" : ""}>Small</option>
      </select>
      <button onclick="deleteSubject('${subjectName}')">Delete Subject</button>

      <br><br>

      Add Topic:
      <input id="addTopic-${subjectName}" placeholder="Topic Name">
      <button onclick="addTopic('${subjectName}')">Add</button>

      <hr>
      ${topicsHTML}
    `;

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

function fixPointer(subjectName) {
  let subject = studyData.subjects[subjectName];
  subject.pointer = subject.topics.findIndex(t => t.status !== "completed");
  if (subject.pointer === -1) {
    subject.pointer = subject.topics.length;
  }
}

document.addEventListener("DOMContentLoaded", renderEditor);

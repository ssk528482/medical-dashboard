function renderSubjects() {
  let container = document.getElementById("subjectsContainer");
  container.innerHTML = "";

  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];

    let div = document.createElement("div");
    div.style.border = "1px solid #ccc";
    div.style.padding = "10px";
    div.style.marginBottom = "10px";

    let completedCount = subject.topics.filter(t => t.status === "completed").length;
    let totalTopics = subject.topics.length;
    let percent = percentage(completedCount, totalTopics);

    let nextTopic =
      subject.pointer < totalTopics
        ? subject.topics[subject.pointer].name
        : "All topics completed";

    div.innerHTML = `
      <strong>${subjectName}</strong> (${subject.size})<br>
      Progress: ${percent}% (${completedCount}/${totalTopics})<br>
      Next Topic: ${nextTopic}<br><br>
      <button onclick="completeTopic('${subjectName}'); renderSubjects();">
        Mark Next Topic Complete
      </button>
    `;

    container.appendChild(div);
  });

  // 🔵 ADD RETENTION DISPLAY HERE
  let retentionDisplay = document.createElement("div");
  retentionDisplay.style.marginTop = "20px";
  retentionDisplay.innerHTML =
    "<h3>Projected Retention: " +
    calculateRetention() +
    "%</h3>";

  container.appendChild(retentionDisplay);

  renderRevisionSection();
}


function renderRevisionSection() {
  let due = getRevisionsDueToday();

  if (due.length === 0) return;

  let container = document.getElementById("subjectsContainer");

  let revDiv = document.createElement("div");
  revDiv.style.border = "2px solid red";
  revDiv.style.padding = "10px";
  revDiv.style.marginTop = "20px";

  revDiv.innerHTML = "<h3>Revisions Due Today</h3>";

  due.forEach(item => {
    let btn = document.createElement("button");
    btn.innerText = `${item.subjectName} - ${item.topicName}`;
    btn.onclick = function () {
      markRevisionDone(item.subjectName, item.topicIndex);
      renderSubjects();
    };
    revDiv.appendChild(btn);
    revDiv.appendChild(document.createElement("br"));
  });

  container.appendChild(revDiv);
}

function calculateRetention() {
  let totalTopics = 0;
  let revisedOnTime = 0;

  Object.values(studyData.subjects).forEach(subject => {
    subject.topics.forEach(topic => {
      totalTopics++;
      if (topic.revisionIndex > 0) revisedOnTime++;
    });
  });

  let revisionCompliance = (revisedOnTime / totalTopics) * 100 || 0;

  let accuracySum = 0;
  let count = 0;

  Object.values(studyData.subjects).forEach(subject => {
    accuracySum += subjectAccuracy(subject);
    count++;
  });

  let avgAccuracy = accuracySum / count || 0;

  let retention =
    revisionCompliance * 0.4 +
    avgAccuracy * 0.4 +
    (revisionCompliance > 80 ? 20 : 10);

  return retention.toFixed(1);
}

function populateEveningSelectors() {
  let subjectSelect = document.getElementById("eveningSubject");
  subjectSelect.innerHTML = "";

  Object.keys(studyData.subjects).forEach(subjectName => {
    let opt = document.createElement("option");
    opt.value = subjectName;
    opt.text = subjectName;
    subjectSelect.appendChild(opt);
  });

  subjectSelect.onchange = populateTopicSelector;
  populateTopicSelector();
}

function populateTopicSelector() {
  let subjectName = document.getElementById("eveningSubject").value;
  let topicSelect = document.getElementById("eveningTopic");
  topicSelect.innerHTML = "";

  if (!subjectName) return;

  studyData.subjects[subjectName].topics.forEach((topic, index) => {
    let opt = document.createElement("option");
    opt.value = index;
    opt.text = topic.name;
    topicSelect.appendChild(opt);
  });
}

function populateAllEveningSelectors() {

  if (!document.getElementById("studySubject")) return;

  populateSelector("studySubject", "studyTopic");
  populateSelector("qbankSubject", "qbankTopic");
  renderRevisionCheckboxList();
}


function populateSelector(subjectId, topicId) {
  let subjectSelect = document.getElementById(subjectId);
  subjectSelect.innerHTML = "";

  Object.keys(studyData.subjects).forEach(subjectName => {
    let opt = document.createElement("option");
    opt.value = subjectName;
    opt.text = subjectName;
    subjectSelect.appendChild(opt);
  });

  subjectSelect.onchange = function () {
    populateTopicDropdown(subjectId, topicId);
  };

  populateTopicDropdown(subjectId, topicId);
}

function populateTopicDropdown(subjectId, topicId) {
  let subjectName = document.getElementById(subjectId).value;
  let topicSelect = document.getElementById(topicId);
  topicSelect.innerHTML = "";

  if (!subjectName) return;

  studyData.subjects[subjectName].topics.forEach((topic, index) => {
    let opt = document.createElement("option");
    opt.value = index;
    opt.text = topic.name;
    topicSelect.appendChild(opt);
  });
}

function renderRevisionCheckboxList() {
  let container = document.getElementById("revisionCheckboxList");
  container.innerHTML = "";

  let due = getRevisionsDueToday();

  due.forEach(item => {
    let label = document.createElement("label");
    label.innerHTML = `
      <input type="checkbox" 
        value="${item.subjectName}|${item.topicIndex}">
      ${item.subjectName} - ${item.topicName}
    `;
    container.appendChild(label);
    container.appendChild(document.createElement("br"));
  });
}


document.addEventListener("DOMContentLoaded", function () {
  if (studyData.setupComplete) {
    renderSubjects();
  }
    populateAllEveningSelectors();
});

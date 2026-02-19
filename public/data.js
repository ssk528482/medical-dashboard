let studyData = JSON.parse(localStorage.getItem("studyData")) || {
  setupComplete: false,
  subjects: {}
};

function saveData() {
  localStorage.setItem("studyData", JSON.stringify(studyData));
}

function addSubject() {
  let name = document.getElementById("subjectName").value.trim();
  let size = document.getElementById("subjectSize").value;
  let topicsRaw = document.getElementById("topicsInput").value.trim();

  if (!name || !topicsRaw) {
    alert("Enter subject and topics.");
    return;
  }

  let topicsArray = topicsRaw.split("\n").map(t => ({
    name: t.trim(),
    status: "not-started",
    completedOn: null,
    revisionDates: [],
    revisionIndex: 0,
    nextRevision: null,
    anki: false
  }));

  studyData.subjects[name] = {
    size: size,
    topics: topicsArray,
    pointer: 0,
    qbank: {
      total: 0,
      correct: 0
    }
  };

  saveData();

  document.getElementById("subjectName").value = "";
  document.getElementById("topicsInput").value = "";

  alert("Subject Added.");
}

function finishSetup() {
  if (Object.keys(studyData.subjects).length === 0) {
    alert("Add at least one subject.");
    return;
  }

  studyData.setupComplete = true;
  saveData();
  renderStatus();
}

function renderStatus() {
  if (!studyData.setupComplete) return;

  document.getElementById("setupSection").style.display = "none";
  document.getElementById("statusSection").style.display = "block";

  let totalSubjects = Object.keys(studyData.subjects).length;
  let totalTopics = 0;

  Object.values(studyData.subjects).forEach(s => {
    totalTopics += s.topics.length;
  });

  document.getElementById("summary").innerText =
    `Subjects: ${totalSubjects} | Total Topics: ${totalTopics}`;
}

document.addEventListener("DOMContentLoaded", function () {
  if (studyData.setupComplete) {
    renderStatus();
  }
});

let studyData = JSON.parse(localStorage.getItem("studyData")) || {};

if (!studyData.setupComplete) studyData.setupComplete = false;
if (!studyData.subjects) studyData.subjects = {};
if (!studyData.dailyHistory) studyData.dailyHistory = {};


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

  let setupSection = document.getElementById("setupSection");
  let statusSection = document.getElementById("statusSection");

  if (setupSection) setupSection.style.display = "none";
  if (statusSection) statusSection.style.display = "block";
}

function fixPointer(subjectName) {
  let subject = studyData.subjects[subjectName];
  subject.pointer = subject.topics.findIndex(t => t.status !== "completed");
  if (subject.pointer === -1) {
    subject.pointer = subject.topics.length;
  }
}


document.addEventListener("DOMContentLoaded", function () {
  if (studyData.setupComplete) {
    renderStatus();
  }
});

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

function calculateWeeklyConsistency() {
  return calculateConsistencyForDays(7);
}

function calculateMonthlyConsistency() {
  return calculateConsistencyForDays(30);
}

function calculateConsistencyForDays(days) {

  if (!studyData.dailyHistory) return 0;

  let totalScore = 0;
  let maxScore = days * 3;

  for (let i = 0; i < days; i++) {
    let d = new Date();
    d.setDate(d.getDate() - i);
    let key = d.toISOString().split("T")[0];

    if (studyData.dailyHistory[key]) {
      let entry = studyData.dailyHistory[key];
      totalScore +=
        (entry.study ? 1 : 0) +
        (entry.qbank ? 1 : 0) +
        (entry.revision ? 1 : 0);
    }
  }

  return (totalScore / maxScore) * 100;
}

document.addEventListener("DOMContentLoaded", function () {
  if (studyData.setupComplete) {
    renderStatus();
  }
});

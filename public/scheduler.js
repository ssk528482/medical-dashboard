function subjectAccuracy(subject) {
  let q = subject.qbank;
  if (q.total === 0) return 50;
  return (q.correct / q.total) * 100;
}

function subjectPriority(subjectName) {
  let subject = studyData.subjects[subjectName];

  let accuracy = subjectAccuracy(subject);
  let incomplete =
    subject.topics.length -
    subject.topics.filter(t => t.status === "completed").length;

  let overdue = getOverdueCount(subjectName);

  let sizeWeight = { large: 10, medium: 5, small: 0 };

  return (
    (100 - accuracy) * 0.35 +
    incomplete * 0.25 +
    overdue * 10 +
    sizeWeight[subject.size]
  );
}


function generatePlan() {

  let hours = parseFloat(document.getElementById("dailyHours").value);
  if (!hours || hours <= 0) {
    alert("Enter valid hours.");
    return;
  }

  // 🔹 If today's plan already exists, reload instead of regenerating
  if (
    studyData.dailyPlan &&
    studyData.dailyPlan.date === today()
  ) {
    renderSavedPlan();
    return;
  }

  let revisionDue = getRevisionsDueToday().length;

  // 🔹 Sort subjects by priority
  let subjectsSorted = Object.keys(studyData.subjects).sort(
    (a, b) => subjectPriority(b) - subjectPriority(a)
  );

  // 🔹 Declare topSubject FIRST
  let topSubject = subjectsSorted[0];

  // 🔹 Carry forward unfinished plan
  if (
    studyData.dailyPlan &&
    studyData.dailyPlan.date !== today() &&
    studyData.dailyPlan.completed === false
  ) {
    topSubject = studyData.dailyPlan.study.subject;
  }

  let subjectObj = studyData.subjects[topSubject];

  let nextTopic =
    subjectObj.pointer < subjectObj.topics.length
      ? subjectObj.topics[subjectObj.pointer].name
      : "All topics completed";

  let studyTime = hours * 0.5;
  let qbankTime = hours * 0.3;
  let revisionTime = hours * 0.2;

  let output = `
    <strong>Study:</strong> ${studyTime.toFixed(1)} hrs – ${topSubject} – ${nextTopic}<br>
    <strong>Qbank:</strong> ${qbankTime.toFixed(1)} hrs – ${topSubject}<br>
    <strong>Revision:</strong> ${revisionTime.toFixed(1)} hrs – ${revisionDue} topics
  `;

  document.getElementById("planOutput").innerHTML = output;

  // 🔹 Save plan
  studyData.dailyPlan = {
    date: today(),
    study: {
      subject: topSubject,
      topicIndex: subjectObj.pointer
    },
    qbank: {
      subject: topSubject,
      topicIndex: subjectObj.pointer
    },
    revisionCount: revisionDue,
    hours: hours,
    completed: false
  };

  saveData();
}

studyData.dailyPlan = {
  date: today(),
  study: {
    subject: topSubject,
    topicIndex: subjectObj.pointer
  },
  qbank: {
    subject: topSubject,
    topicIndex: subjectObj.pointer
  },
  revisionCount: revisionDue,
  hours: hours,
  completed: false
};

saveData();



function submitEvening() {

  // STUDY
  if (document.getElementById("studyDone").checked) {
    let subjectName = document.getElementById("studySubject").value;
    let topicIndex = parseInt(document.getElementById("studyTopic").value);
    let topic = studyData.subjects[subjectName].topics[topicIndex];

    topic.status = "completed";
    topic.completedOn = today();

    topic.revisionDates = [
      addDays(today(), 1),
      addDays(today(), 3),
      addDays(today(), 7),
      addDays(today(), 21),
      addDays(today(), 45)
    ];

    topic.revisionIndex = 0;
    topic.nextRevision = topic.revisionDates[0];

    fixPointer(subjectName);
  }

  // QBANK
  if (document.getElementById("qbankDone").checked) {
    let subjectName = document.getElementById("qbankSubject").value;
    let topicIndex = parseInt(document.getElementById("qbankTopic").value);

    let total = parseInt(document.getElementById("qbankTotal").value) || 0;
    let correct = parseInt(document.getElementById("qbankCorrect").value) || 0;

    let topic = studyData.subjects[subjectName].topics[topicIndex];

    if (!topic.qbankStats) {
      topic.qbankStats = { total: 0, correct: 0 };
    }

    topic.qbankStats.total += total;
    topic.qbankStats.correct += correct;
    topic.qbankDone = true;
  }

  // REVISION (multiple topics)
  let revisionCheckboxes = document.querySelectorAll(
    "#revisionCheckboxList input[type='checkbox']:checked"
  );

  revisionCheckboxes.forEach(box => {
    let [subjectName, topicIndex] = box.value.split("|");
    topicIndex = parseInt(topicIndex);

    let topic = studyData.subjects[subjectName].topics[topicIndex];

    topic.revisionIndex++;
    if (topic.revisionIndex < topic.revisionDates.length) {
      topic.nextRevision = topic.revisionDates[topic.revisionIndex];
    } else {
      topic.nextRevision = null;
    }
  });
  if (
    studyData.dailyPlan &&
    studyData.dailyPlan.date === today() &&
    document.getElementById("studyDone").checked
  ) {
    studyData.dailyPlan.completed = true;
  }
  
  saveData();
  renderSubjects();
  alert("Evening update saved.");

}


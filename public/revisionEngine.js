function completeTopic(subjectName) {
  let subject = studyData.subjects[subjectName];
  let pointer = subject.pointer;

  if (pointer >= subject.topics.length) return;

  let topic = subject.topics[pointer];

  topic.status = "completed";
  topic.completedOn = today();

  // Generate spaced revision schedule
  topic.revisionDates = [
    addDays(today(), 1),
    addDays(today(), 3),
    addDays(today(), 7),
    addDays(today(), 21),
    addDays(today(), 45)
  ];

  topic.revisionIndex = 0;
  topic.nextRevision = topic.revisionDates[0];

  subject.pointer++;

  saveData();
}

function markRevisionDone(subjectName, topicIndex) {
  let topic = studyData.subjects[subjectName].topics[topicIndex];

  if (!topic.revisionDates.length) return;

  topic.revisionIndex++;

  if (topic.revisionIndex < topic.revisionDates.length) {
    topic.nextRevision = topic.revisionDates[topic.revisionIndex];
  } else {
    topic.nextRevision = null;
  }

  saveData();
}

function getRevisionsDueToday() {
  let due = [];

  Object.keys(studyData.subjects).forEach(subjectName => {
    studyData.subjects[subjectName].topics.forEach((topic, index) => {
      if (topic.nextRevision === today()) {
        due.push({ subjectName, topicIndex: index, topicName: topic.name });
      }
    });
  });

  return due;
}

function submitEvening() {
  let studyCompleted = document.getElementById("studyDone").checked;
  let qbankCompleted = document.getElementById("qbankDone").checked;
  let revisionCompleted = document.getElementById("revisionDone").checked;

  let subjectsSorted = Object.keys(studyData.subjects).sort(
    (a, b) => subjectPriority(b) - subjectPriority(a)
  );

  let topSubject = subjectsSorted[0];
  let subject = studyData.subjects[topSubject];

  // STUDY LOGIC
  if (studyCompleted && subject.pointer < subject.topics.length) {
    completeTopic(topSubject);
  }

  // QBANK LOGIC
  if (qbankCompleted) {
    let total = parseInt(document.getElementById("eveningTotal").value);
    let correct = parseInt(document.getElementById("eveningCorrect").value);

    if (total && total > 0) {
      subject.qbank.total += total;
      subject.qbank.correct += correct;
    }
  }

  // REVISION LOGIC
  if (revisionCompleted) {
    let due = getRevisionsDueToday();
    due.forEach(item => {
      markRevisionDone(item.subjectName, item.topicIndex);
    });
  }

  saveData();
  renderSubjects();

  alert("Evening update saved.");
}

function detectPhaseStatus(subjectName) {
  let subject = studyData.subjects[subjectName];

  let total = subject.topics.length;

  let completed = subject.topics.filter(t => t.status === "completed").length;
  let revisedOnce = subject.topics.filter(t => t.revisionIndex >= 1).length;
  let revisedTwice = subject.topics.filter(t => t.revisionIndex >= 2).length;

  return {
    phase1: completed === total,
    phase2: revisedOnce === total,
    phase3: revisedTwice === total
  };
}

function getOverdueCount(subjectName) {
  let subject = studyData.subjects[subjectName];

  return subject.topics.filter(t =>
    t.nextRevision && isPast(t.nextRevision)
  ).length;
}

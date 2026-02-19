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

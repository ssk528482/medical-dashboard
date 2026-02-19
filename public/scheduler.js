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

  let revisionDue = getRevisionsDueToday().length;

  let subjectsSorted = Object.keys(studyData.subjects).sort(
    (a, b) => subjectPriority(b) - subjectPriority(a)
  );

  let topSubject = subjectsSorted[0];
  let subjectObj = studyData.subjects[topSubject];

  let nextTopic =
    subjectObj.pointer < subjectObj.topics.length
      ? subjectObj.topics[subjectObj.pointer].name
      : "All topics completed";

  let daysLeft = Math.ceil(
    (new Date("2026-12-01") - new Date()) / (1000 * 60 * 60 * 24)
  );

  let revisionWeight = revisionDue > 8 ? 0.6 : 0.3;

  if (daysLeft < 120) revisionWeight += 0.1;
  if (daysLeft < 60) revisionWeight += 0.1;

  let studyWeight = 0.5 - (revisionWeight - 0.3);
  let qbankWeight = 1 - studyWeight - revisionWeight;

  let studyTime = hours * studyWeight;
  let qbankTime = hours * qbankWeight;
  let revisionTime = hours * revisionWeight;

  if (revisionDue > 10) {
    nextTopic = "Revision Heavy Day — No New Topic";
  }

  let output = `
    <strong>Study:</strong> ${studyTime.toFixed(1)} hrs – ${topSubject} – ${nextTopic}<br>
    <strong>Qbank:</strong> ${qbankTime.toFixed(1)} hrs – ${topSubject}<br>
    <strong>Revision:</strong> ${revisionTime.toFixed(1)} hrs – ${revisionDue} topics due
  `;

  document.getElementById("planOutput").innerHTML = output;
}


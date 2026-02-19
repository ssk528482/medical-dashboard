function renderAnalytics() {
  let container = document.getElementById("analyticsContainer");
  container.innerHTML = "";

  let totalTopics = 0;
  let completedTopics = 0;
  let totalOverdue = 0;

  let subjectRows = "";
  let weakTopics = [];

  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];

    let subjectTotal = 0;
    let subjectCorrect = 0;
    let overdueCount = 0;

    subject.topics.forEach(topic => {
      totalTopics++;

      if (topic.status === "completed") completedTopics++;

      if (topic.nextRevision && isPast(topic.nextRevision)) {
        overdueCount++;
        totalOverdue++;
      }

      if (topic.qbankStats) {
        subjectTotal += topic.qbankStats.total;
        subjectCorrect += topic.qbankStats.correct;

        if (
          topic.qbankStats.total > 0 &&
          topic.qbankStats.correct / topic.qbankStats.total < 0.6
        ) {
          weakTopics.push({
            subject: subjectName,
            topic: topic.name,
            accuracy:
              (topic.qbankStats.correct /
                topic.qbankStats.total) *
              100
          });
        }
      }
    });

    let subjectAccuracy =
      subjectTotal > 0
        ? ((subjectCorrect / subjectTotal) * 100).toFixed(1)
        : 0;

    let phaseStatus = detectPhaseStatus(subjectName);

    subjectRows += `
      <tr>
        <td>${subjectName}</td>
        <td>${subjectAccuracy}%</td>
        <td>${overdueCount}</td>
        <td>
          ${phaseStatus.phase1 ? "✔" : "❌"} /
          ${phaseStatus.phase2 ? "✔" : "❌"} /
          ${phaseStatus.phase3 ? "✔" : "❌"}
        </td>
      </tr>
    `;
  });

  let completionPercent = percentage(completedTopics, totalTopics);

  weakTopics.sort((a, b) => a.accuracy - b.accuracy);

  let weakTopicsHTML = weakTopics
    .slice(0, 5)
    .map(
      t =>
        `<li>${t.subject} – ${t.topic} (${t.accuracy.toFixed(1)}%)</li>`
    )
    .join("");

  let retention = calculateRetention();

  container.innerHTML = `
    <h2>Overall Progress</h2>
    <p><strong>Completion:</strong> ${completionPercent}% (${completedTopics}/${totalTopics})</p>
    <p><strong>Overdue Revisions:</strong> ${totalOverdue}</p>
    <p><strong>Projected Retention:</strong> ${retention}%</p>

    <hr>

    <h2>Subject Summary</h2>
    <table border="1" cellpadding="5">
      <tr>
        <th>Subject</th>
        <th>Accuracy</th>
        <th>Overdue</th>
        <th>Phases (1/2/3)</th>
      </tr>
      ${subjectRows}
    </table>

    <hr>

    <h2>Top Weak Qbank Topics</h2>
    <ul>
      ${weakTopicsHTML || "<li>No weak topics yet</li>"}
    </ul>
  `;
}

document.addEventListener("DOMContentLoaded", renderAnalytics);

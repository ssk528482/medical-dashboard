function renderAnalytics() {

  let container = document.getElementById("analyticsContainer");
  container.innerHTML = "";

  let totalTopics = 0;
  let completedTopics = 0;
  let totalOverdue = 0;

  let subjectStats = [];
  let weakTopics = [];

  Object.keys(studyData.subjects).forEach(subjectName => {

    let subject = studyData.subjects[subjectName];

    let subjectTotal = 0;
    let subjectCorrect = 0;
    let overdueCount = 0;

    subject.topics.forEach(topic => {

      totalTopics++;

      if (topic.status === "completed") completedTopics++;

      if (topic.nextRevision && topic.nextRevision <= today()) {
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

    let accuracy =
      subjectTotal > 0
        ? ((subjectCorrect / subjectTotal) * 100).toFixed(1)
        : 0;

    subjectStats.push({
      name: subjectName,
      accuracy: parseFloat(accuracy),
      overdue: overdueCount
    });

  });

  // 🔹 Completion %
  let completionPercent =
    totalTopics > 0
      ? ((completedTopics / totalTopics) * 100).toFixed(1)
      : 0;

  // 🔹 Days left
  let examDate = new Date("2026-12-01");
  let todayDate = new Date();
  let daysLeft = Math.ceil(
    (examDate - todayDate) / (1000 * 60 * 60 * 24)
  );

  // 🔹 Pace calculation
  let remainingTopics = totalTopics - completedTopics;
  let requiredPace =
    daysLeft > 0
      ? (remainingTopics / daysLeft).toFixed(2)
      : 0;

  let avgDailyCompletion = calculateAverageDailyCompletion();
  let projectedFinishDate = calculateProjectedFinishDate(
    remainingTopics,
    avgDailyCompletion
  );

  let riskLevel = "Low";
  if (avgDailyCompletion < requiredPace) riskLevel = "High";
  else if (avgDailyCompletion - requiredPace < 0.5) riskLevel = "Moderate";

  // 🔹 Retention
  let retention = calculateRetention();

  // 🔹 Weakest subjects
  subjectStats.sort((a, b) => a.accuracy - b.accuracy);

  let subjectRows = subjectStats
    .map(
      s =>
        `<tr>
          <td>${s.name}</td>
          <td>${s.accuracy}%</td>
          <td>${s.overdue}</td>
        </tr>`
    )
    .join("");

  // 🔹 Weakest topics
  weakTopics.sort((a, b) => a.accuracy - b.accuracy);
  let weakHTML = weakTopics
    .slice(0, 5)
    .map(
      t =>
        `<li>${t.subject} – ${t.topic} (${t.accuracy.toFixed(1)}%)</li>`
    )
    .join("");

  container.innerHTML = `

    <div class="card">
      <div class="section-title">Command Summary</div>
      <p><strong>Completion:</strong> ${completionPercent}%</p>
      <p><strong>Projected Retention:</strong> ${retention}%</p>
      <p><strong>Overdue Revisions:</strong> ${totalOverdue}</p>
      <p><strong>Days Left:</strong> ${daysLeft}</p>
      <p><strong>Required Pace:</strong> ${requiredPace} topics/day</p>
      <p><strong>Your Pace:</strong> ${avgDailyCompletion.toFixed(2)} topics/day</p>
      <p><strong>Risk Level:</strong> ${riskLevel}</p>
      <p><strong>Projected Finish:</strong> ${projectedFinishDate}</p>
    </div>

    <div class="card">
      <div class="section-title">Subject Weakness Ranking</div>
      <table border="1" cellpadding="5">
        <tr>
          <th>Subject</th>
          <th>Accuracy</th>
          <th>Overdue</th>
        </tr>
        ${subjectRows}
      </table>
    </div>

    <div class="card">
      <div class="section-title">Top Weak Qbank Topics</div>
      <ul>
        ${weakHTML || "<li>No weak topics yet</li>"}
      </ul>
    </div>

  `;
}


// 🔹 Helper Functions

function calculateAverageDailyCompletion() {

  if (!studyData.dailyHistory) return 0;

  let days = Object.keys(studyData.dailyHistory).length;
  if (days === 0) return 0;

  let completedCount = 0;

  Object.keys(studyData.dailyHistory).forEach(date => {
    if (studyData.dailyHistory[date].study) completedCount++;
  });

  return completedCount / days;
}

function calculateProjectedFinishDate(remainingTopics, avgDailyCompletion) {

  if (avgDailyCompletion === 0) return "Insufficient data";

  let daysNeeded = Math.ceil(remainingTopics / avgDailyCompletion);
  let d = new Date();
  d.setDate(d.getDate() + daysNeeded);

  return d.toISOString().split("T")[0];
}

document.addEventListener("DOMContentLoaded", renderAnalytics);

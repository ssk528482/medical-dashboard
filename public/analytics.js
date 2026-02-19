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
        ? ((subjectCorrect / subjectTotal) * 100)
        : 0;

    subjectStats.push({
      name: subjectName,
      accuracy: accuracy,
      overdue: overdueCount
    });

  });

  let completionPercent =
    totalTopics > 0
      ? (completedTopics / totalTopics) * 100
      : 0;

  let retention = calculateRetention();

  let examDate = new Date("2026-12-01");
  let daysLeft = Math.ceil(
    (examDate - new Date()) / (1000 * 60 * 60 * 24)
  );

  let remainingTopics = totalTopics - completedTopics;
  let avgDailyCompletion = calculateAverageDailyCompletion();

  let requiredPace =
    daysLeft > 0
      ? (remainingTopics / daysLeft)
      : 0;

  let riskLevel = "Low";
  let riskColor = "green";

  if (avgDailyCompletion < requiredPace) {
    riskLevel = "High";
    riskColor = "red";
  } else if (avgDailyCompletion - requiredPace < 0.5) {
    riskLevel = "Moderate";
    riskColor = "yellow";
  }

  let weeklyConsistency = calculateWeeklyConsistency();
  let monthlyConsistency = calculateMonthlyConsistency();

  let burnoutWarning = "";
  if (weeklyConsistency < monthlyConsistency - 20) {
    burnoutWarning = "<p class='warning'>⚠ Consistency dropping — burnout risk</p>";
  }

  subjectStats.sort((a, b) => a.accuracy - b.accuracy);

  let subjectRows = subjectStats
    .map(
      s =>
        `<tr>
          <td>${s.name}</td>
          <td>${s.accuracy.toFixed(1)}%</td>
          <td>${s.overdue}</td>
        </tr>`
    )
    .join("");

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

      <p>Completion: ${completionPercent.toFixed(1)}%</p>
      <div class="stat-bar">
        <div class="stat-fill green" style="width:${completionPercent}%"></div>
      </div>

      <p>Retention: ${retention}%</p>
      <div class="stat-bar">
        <div class="stat-fill green" style="width:${retention}%"></div>
      </div>

      <p>Risk Level: <span class="${riskColor}">${riskLevel}</span></p>

      <p>Days Left: ${daysLeft}</p>
      <p>Required Pace: ${requiredPace.toFixed(2)}</p>
      <p>Your Pace: ${avgDailyCompletion.toFixed(2)}</p>
    </div>

    <div class="card">
      <div class="section-title">Weekly Report</div>
      <p>7-Day Consistency: ${weeklyConsistency.toFixed(1)}%</p>
      <p>30-Day Consistency: ${monthlyConsistency.toFixed(1)}%</p>
      ${burnoutWarning}
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
      <div class="section-title">Top Weak Topics</div>
      <ul>
        ${weakHTML || "<li>No weak topics yet</li>"}
      </ul>
    </div>

  `;
}


document.addEventListener("DOMContentLoaded", renderAnalytics);

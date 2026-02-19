function renderQbank() {
  let container = document.getElementById("qbankContainer");
  container.innerHTML = "";

  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];

    let subjectDiv = document.createElement("div");
    subjectDiv.style.border = "1px solid #ccc";
    subjectDiv.style.padding = "10px";
    subjectDiv.style.marginBottom = "15px";

    let subjectTotal = 0;
    let subjectCorrect = 0;

    let topicsHTML = "";

    subject.topics.forEach((topic, index) => {
      if (!topic.qbankStats) {
        topic.qbankStats = { total: 0, correct: 0 };
      }

      subjectTotal += topic.qbankStats.total;
      subjectCorrect += topic.qbankStats.correct;

      let accuracy =
        topic.qbankStats.total > 0
          ? ((topic.qbankStats.correct / topic.qbankStats.total) * 100).toFixed(1)
          : 0;

      let weakStyle = accuracy < 60 && topic.qbankStats.total > 0
        ? "style='color:red;'"
        : "";

      topicsHTML += `
        <div style="margin-bottom:6px;">
          <strong ${weakStyle}>${topic.name}</strong><br>
          Total:
          <input type="number"
            value="${topic.qbankStats.total}"
            onchange="updateTopicQbank('${subjectName}', ${index}, 'total', this.value)">
          Correct:
          <input type="number"
            value="${topic.qbankStats.correct}"
            onchange="updateTopicQbank('${subjectName}', ${index}, 'correct', this.value)">
          Accuracy: ${accuracy}% 
        </div>
      `;
    });

    let subjectAccuracy =
      subjectTotal > 0
        ? ((subjectCorrect / subjectTotal) * 100).toFixed(1)
        : 0;

    subject.qbank.total = subjectTotal;
    subject.qbank.correct = subjectCorrect;

    subjectDiv.innerHTML = `
      <h3>${subjectName} (${subject.size})</h3>
      <p><strong>Subject Accuracy:</strong> ${subjectAccuracy}%</p>
      <hr>
      ${topicsHTML}
    `;

    container.appendChild(subjectDiv);
  });

  saveData();
}

function updateTopicQbank(subjectName, index, field, value) {
  let topic = studyData.subjects[subjectName].topics[index];

  if (!topic.qbankStats) {
    topic.qbankStats = { total: 0, correct: 0 };
  }

  topic.qbankStats[field] = parseInt(value) || 0;

  renderQbank();
}

document.addEventListener("DOMContentLoaded", renderQbank);

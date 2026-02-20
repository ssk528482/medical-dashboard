function renderQbank() {

  let container = document.getElementById("qbankContainer");
  container.innerHTML = "";

  Object.keys(studyData.subjects).forEach(subjectName => {

    let subject = studyData.subjects[subjectName];

    let subjectTotal = 0;
    let subjectCorrect = 0;

    let isCollapsed =
      studyData.uiState.qbankCollapsed[subjectName] || false;

    let subjectCard = document.createElement("div");
    subjectCard.className = "subject-card";

    let topicsHTML = "";

    subject.topics.forEach((topic, index) => {

      if (!topic.qbankStats) {
        topic.qbankStats = { total: 0, correct: 0 };
      }

      subjectTotal += topic.qbankStats.total;
      subjectCorrect += topic.qbankStats.correct;

      let accuracy = topic.qbankStats.total > 0
        ? (topic.qbankStats.correct / topic.qbankStats.total) * 100
        : 0;

      let badgeClass =
        accuracy >= 75 ? "accuracy-high"
        : accuracy >= 50 ? "accuracy-mid"
        : "accuracy-low";

      topicsHTML += `
        <div class="topic-qbank-row">
          <div>
            <strong>${topic.name}</strong>
          </div>

          <div style="display:flex;align-items:center;gap:8px;">

            <input type="number"
              value="${topic.qbankStats.total}"
              min="0"
              style="width:60px"
              onchange="updateTopicQbank('${subjectName}', ${index}, 'total', this.value)">

            <input type="number"
              value="${topic.qbankStats.correct}"
              min="0"
              style="width:60px"
              onchange="updateTopicQbank('${subjectName}', ${index}, 'correct', this.value)">

            <span class="accuracy-badge ${badgeClass}">
              ${accuracy.toFixed(1)}%
            </span>

          </div>
        </div>
      `;
    });

    let subjectAccuracy =
      subjectTotal > 0
        ? (subjectCorrect / subjectTotal) * 100
        : 0;

    subject.qbank = {
      total: subjectTotal,
      correct: subjectCorrect
    };

    subjectCard.innerHTML = `
      <div class="subject-header">

        <div style="display:flex;align-items:center;gap:8px;">
          <button class="collapse-btn"
            onclick="toggleCollapse('${subjectName}')">
            ${isCollapsed ? "▶" : "▼"}
          </button>

          <strong>${subjectName} (${subject.size})</strong>
        </div>

        <span class="accuracy-badge ${
          subjectAccuracy >= 75
            ? "accuracy-high"
            : subjectAccuracy >= 50
            ? "accuracy-mid"
            : "accuracy-low"
        }">
          ${subjectAccuracy.toFixed(1)}%
        </span>

      </div>

      <div class="stat-bar">
        <div class="stat-fill ${
          subjectAccuracy >= 75
            ? "green"
            : subjectAccuracy >= 50
            ? "yellow"
            : "red"
        }"
        style="width:${subjectAccuracy}%"></div>
      </div>

      <div class="${isCollapsed ? "collapsed-content" : ""}"
           style="margin-top:15px;">
        ${topicsHTML}
      </div>
    `;

    container.appendChild(subjectCard);

  });

  saveData();
}



function toggleCollapse(subjectName) {

  studyData.uiState.qbankCollapsed[subjectName] =
    !studyData.uiState.qbankCollapsed[subjectName];

  saveData();
  renderQbank();
}



function updateTopicQbank(subjectName, index, field, value) {

  let topic = studyData.subjects[subjectName].topics[index];

  if (!topic.qbankStats) {
    topic.qbankStats = { total: 0, correct: 0 };
  }

  topic.qbankStats[field] = parseInt(value) || 0;

  saveData(); // 🔥 ADD THIS
  renderQbank();
}

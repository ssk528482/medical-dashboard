function renderSubjects() {
  let container = document.getElementById("subjectsContainer");
  container.innerHTML = "";

  Object.keys(studyData.subjects).forEach(subjectName => {
    let subject = studyData.subjects[subjectName];

    let div = document.createElement("div");
    div.style.border = "1px solid #ccc";
    div.style.padding = "10px";
    div.style.marginBottom = "10px";

    let completedCount = subject.topics.filter(t => t.status === "completed").length;
    let totalTopics = subject.topics.length;
    let percent = percentage(completedCount, totalTopics);

    let nextTopic =
      subject.pointer < totalTopics
        ? subject.topics[subject.pointer].name
        : "All topics completed";

    div.innerHTML = `
      <strong>${subjectName}</strong> (${subject.size})<br>
      Progress: ${percent}% (${completedCount}/${totalTopics})<br>
      Next Topic: ${nextTopic}<br><br>
      <button onclick="completeTopic('${subjectName}'); renderSubjects();">
        Mark Next Topic Complete
      </button>
    `;

    container.appendChild(div);
  });

  renderRevisionSection();
}

function renderRevisionSection() {
  let due = getRevisionsDueToday();

  if (due.length === 0) return;

  let container = document.getElementById("subjectsContainer");

  let revDiv = document.createElement("div");
  revDiv.style.border = "2px solid red";
  revDiv.style.padding = "10px";
  revDiv.style.marginTop = "20px";

  revDiv.innerHTML = "<h3>Revisions Due Today</h3>";

  due.forEach(item => {
    let btn = document.createElement("button");
    btn.innerText = `${item.subjectName} - ${item.topicName}`;
    btn.onclick = function () {
      markRevisionDone(item.subjectName, item.topicIndex);
      renderSubjects();
    };
    revDiv.appendChild(btn);
    revDiv.appendChild(document.createElement("br"));
  });

  container.appendChild(revDiv);
}

document.addEventListener("DOMContentLoaded", function () {
  if (studyData.setupComplete) {
    renderSubjects();
  }
});

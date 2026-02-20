// ─── Adaptive Revision Engine (SM-2 inspired + exam compression) ─────────────

const BASE_INTERVALS = [1, 3, 7, 21, 45];

// Compute next interval with difficulty factor and exam proximity
function computeNextInterval(topic, revIndex) {
  let base = BASE_INTERVALS[revIndex] || 60;
  let ef = topic.difficultyFactor || 2.5;

  // Exam proximity compression: shrink intervals as exam approaches
  let proximity = examProximityFactor();
  let compressionFactor = 1 - (proximity * 0.5); // at exam: intervals shrink 50%
  compressionFactor = Math.max(0.3, compressionFactor);

  // Missed revision penalty: shrink interval if overdue before
  let penalty = 1 - Math.min(0.4, (topic.missedRevisions || 0) * 0.1);

  let interval = Math.round(base * ef * compressionFactor * penalty / 2.5);
  return Math.max(1, interval);
}

function completeTopic(subjectName) {
  let subject = studyData.subjects[subjectName];
  let pointer = subject.pointer;
  if (pointer >= subject.topics.length) return;

  let topic = subject.topics[pointer];
  topic.status = "completed";
  topic.completedOn = today();
  topic.lastReviewedOn = today();

  // Generate adaptive schedule
  let dates = [];
  let cursor = today();
  for (let i = 0; i < BASE_INTERVALS.length; i++) {
    let interval = computeNextInterval(topic, i);
    cursor = addDays(cursor, i === 0 ? interval : computeNextInterval(topic, i));
    dates.push(cursor);
  }

  // Recalculate properly as cumulative
  dates = [];
  cursor = today();
  for (let i = 0; i < BASE_INTERVALS.length; i++) {
    let days = computeNextInterval(topic, i);
    cursor = addDays(cursor, days);
    dates.push(cursor);
  }

  topic.revisionDates = dates;
  topic.revisionIndex = 0;
  topic.nextRevision = dates[0];
  topic.missedRevisions = 0;

  subject.pointer++;
  saveData();
}

function markRevisionDone(subjectName, topicIndex, qualityScore) {
  let topic = studyData.subjects[subjectName].topics[topicIndex];
  if (!topic.revisionDates || !topic.revisionDates.length) return;

  // quality 0-5: affects difficulty factor (SM-2 update)
  let q = qualityScore !== undefined ? qualityScore : 4;
  let ef = topic.difficultyFactor || 2.5;
  // SM-2 EF update formula
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  topic.difficultyFactor = clamp(ef, 1.3, 3.0);

  // Check if overdue → penalize
  if (topic.nextRevision && topic.nextRevision < today()) {
    topic.missedRevisions = (topic.missedRevisions || 0) + 1;
  } else {
    topic.missedRevisions = Math.max(0, (topic.missedRevisions || 0) - 1);
  }

  topic.lastReviewedOn = today();
  topic.revisionIndex++;

  if (topic.revisionIndex < topic.revisionDates.length) {
    // Recompute next interval adaptively
    let interval = computeNextInterval(topic, topic.revisionIndex);
    topic.nextRevision = addDays(today(), interval);
    topic.revisionDates[topic.revisionIndex] = topic.nextRevision;
  } else {
    topic.nextRevision = null;
  }

  saveData();
}

function getRevisionsDueToday() {
  let due = [];
  Object.keys(studyData.subjects).forEach(subjectName => {
    studyData.subjects[subjectName].topics.forEach((topic, index) => {
      if (topic.nextRevision && topic.nextRevision <= today()) {
        let overdueDays = daysBetween(topic.nextRevision, today());
        due.push({
          subjectName,
          topicIndex: index,
          topicName: topic.name,
          overdueDays,
          isOverdue: overdueDays > 0
        });
      }
    });
  });
  // Sort: most overdue first
  due.sort((a, b) => b.overdueDays - a.overdueDays);
  return due;
}

function getOverdueCount(subjectName) {
  let subject = studyData.subjects[subjectName];
  return subject.topics.filter(t => t.nextRevision && t.nextRevision < today()).length;
}

function detectPhaseStatus(subjectName) {
  let subject = studyData.subjects[subjectName];
  let total = subject.topics.length;
  if (total === 0) return { phase1: false, phase2: false, phase3: false };
  let completed = subject.topics.filter(t => t.status === "completed").length;
  let revisedOnce = subject.topics.filter(t => t.revisionIndex >= 1).length;
  let revisedTwice = subject.topics.filter(t => t.revisionIndex >= 2).length;
  return {
    phase1: completed === total,
    phase2: revisedOnce === total,
    phase3: revisedTwice === total
  };
}

// Get subjects with critical overdue (>= 3 topics overdue)
function getCriticalSubjects() {
  return Object.keys(studyData.subjects).filter(name => getOverdueCount(name) >= 3);
}

// Projected retention for a topic based on time since last review
function topicRetentionEstimate(topic) {
  if (!topic.lastReviewedOn) return 0;
  let daysSince = daysBetween(topic.lastReviewedOn, today());
  let ef = topic.difficultyFactor || 2.5;
  // Ebbinghaus forgetting curve approximation
  let r = Math.exp(-daysSince / (ef * 10)) * 100;
  return Math.max(0, Math.min(100, r));
}

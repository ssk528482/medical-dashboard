// ─── SVG Charts Engine ────────────────────────────────────────
// Pure SVG, no dependencies

function buildLineChart(data, opts = {}) {
  let {
    width = 320, height = 120,
    color = "#3b82f6",
    label = "",
    unit = "%",
    showDots = true,
    fillArea = true
  } = opts;

  if (data.length < 2) {
    return `<div style="color:#64748b;font-size:12px;text-align:center;padding:20px 0;">Not enough data yet</div>`;
  }

  let values = data.map(d => d.value);
  let labels = data.map(d => d.label);

  let min = Math.min(...values);
  let max = Math.max(...values);
  let range = max - min || 1;

  let padL = 32, padR = 12, padT = 14, padB = 24;
  let chartW = width - padL - padR;
  let chartH = height - padT - padB;

  let stepX = chartW / (data.length - 1);

  // Map value → y coordinate (inverted, 0 = top)
  function yOf(v) {
    return padT + chartH - ((v - min) / range) * chartH;
  }

  // Build path
  let points = data.map((d, i) => `${padL + i * stepX},${yOf(d.value)}`);
  let linePath = "M " + points.join(" L ");

  // Fill area path
  let fillPath = linePath +
    ` L ${padL + (data.length-1)*stepX},${padT + chartH}` +
    ` L ${padL},${padT + chartH} Z`;

  // Grid lines (3)
  let gridLines = [0, 0.5, 1].map(frac => {
    let y = padT + chartH * (1 - frac);
    let v = (min + frac * range).toFixed(0);
    return `
      <line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}"
        stroke="#1e293b" stroke-width="1"/>
      <text x="${padL - 4}" y="${y + 4}" text-anchor="end" fill="#475569" font-size="9">${v}${unit}</text>
    `;
  }).join("");

  // X labels (show every Nth)
  let step = Math.max(1, Math.floor(data.length / 5));
  let xLabels = data.map((d, i) => {
    if (i % step !== 0 && i !== data.length - 1) return "";
    return `<text x="${padL + i * stepX}" y="${padT + chartH + 16}"
      text-anchor="middle" fill="#475569" font-size="9">${d.label}</text>`;
  }).join("");

  // Dots
  let dots = showDots ? data.map((d, i) => `
    <circle cx="${padL + i * stepX}" cy="${yOf(d.value)}" r="3"
      fill="${color}" stroke="#0f172a" stroke-width="1.5"/>
  `).join("") : "";

  // Latest value label
  let lastPt = data[data.length - 1];
  let lastX = padL + (data.length - 1) * stepX;
  let lastY = yOf(lastPt.value);

  return `
    <svg width="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad_${color.replace("#","")}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>

      ${gridLines}
      ${xLabels}

      ${fillArea ? `<path d="${fillPath}" fill="url(#grad_${color.replace('#','')})" />` : ""}
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
      ${dots}

      <!-- Latest value label -->
      <rect x="${lastX - 20}" y="${lastY - 20}" width="40" height="16" rx="4"
        fill="${color}" opacity="0.9"/>
      <text x="${lastX}" y="${lastY - 9}" text-anchor="middle" fill="white" font-size="10" font-weight="bold">
        ${lastPt.value.toFixed(1)}${unit}
      </text>
    </svg>
  `;
}

function buildBarChart(data, opts = {}) {
  let {
    width = 320, height = 80,
    colors = ["#1f2937", "#f97316", "#eab308", "#16a34a"],
    unit = ""
  } = opts;

  if (data.length === 0) return "";

  let padL = 4, padR = 4, padT = 8, padB = 4;
  let chartW = width - padL - padR;
  let chartH = height - padT - padB;

  let max = Math.max(...data.map(d => d.value), 1);
  let barW = Math.max(1, chartW / data.length - 1.5);

  let bars = data.map((d, i) => {
    let barH = Math.max(2, (d.value / max) * chartH);
    let x = padL + i * (chartW / data.length);
    let y = padT + chartH - barH;
    let color = colors[d.score ?? 0] || colors[0];
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${color}"/>`;
  }).join("");

  return `
    <svg width="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${bars}
    </svg>
  `;
}

// ── Build data series ─────────────────────────────────────────

function buildAccuracyTrendData(subjectName, days) {
  let subject = studyData.subjects[subjectName];
  if (!subject) return [];

  // Collect qbank data points over time
  // We approximate using topics' qbankStats + lastReviewedOn
  let data = [];
  for (let i = days - 1; i >= 0; i--) {
    let d = new Date();
    d.setDate(d.getDate() - i);
    let dateStr = d.toISOString().split("T")[0];
    let shortLabel = (d.getMonth()+1) + "/" + d.getDate();

    // Sum accuracy for topics reviewed on or before this date
    let total = 0, correct = 0;
    subject.topics.forEach(t => {
      if (t.qbankStats && t.lastReviewedOn && t.lastReviewedOn <= dateStr) {
        total += t.qbankStats.total;
        correct += t.qbankStats.correct;
      }
    });

    if (total > 0) {
      data.push({ label: shortLabel, value: (correct / total) * 100 });
    }
  }
  return data;
}

function buildGlobalAccuracyTrend(days) {
  let data = [];
  for (let i = days - 1; i >= 0; i--) {
    let d = new Date();
    d.setDate(d.getDate() - i);
    let dateStr = d.toISOString().split("T")[0];
    let shortLabel = (d.getMonth()+1) + "/" + d.getDate();

    let total = 0, correct = 0;
    Object.values(studyData.subjects).forEach(sub => {
      sub.topics.forEach(t => {
        if (t.qbankStats && t.lastReviewedOn && t.lastReviewedOn <= dateStr) {
          total += t.qbankStats.total;
          correct += t.qbankStats.correct;
        }
      });
    });

    if (total > 0) {
      data.push({ label: shortLabel, value: (correct / total) * 100 });
    }
  }
  return data;
}

function buildConsistencyBarData(days) {
  let data = [];
  for (let i = days - 1; i >= 0; i--) {
    let d = new Date();
    d.setDate(d.getDate() - i);
    let dateStr = d.toISOString().split("T")[0];
    let shortLabel = (d.getMonth()+1) + "/" + d.getDate();

    let score = 0;
    if (studyData.dailyHistory[dateStr]) {
      let e = studyData.dailyHistory[dateStr];
      score = (e.study?1:0) + (e.qbank?1:0) + (e.revision?1:0);
    }
    data.push({ label: shortLabel, value: score, score });
  }
  return data;
}

function buildRetentionProjection(days) {
  // Project daily average retention for next N days
  let data = [];
  let avgEF = 0, count = 0;
  Object.values(studyData.subjects).forEach(sub => {
    sub.topics.forEach(t => {
      if (t.status === "completed") {
        avgEF += t.difficultyFactor || 2.5;
        count++;
      }
    });
  });
  avgEF = count > 0 ? avgEF / count : 2.5;

  for (let i = 0; i <= days; i++) {
    let d = new Date();
    d.setDate(d.getDate() + i);
    let shortLabel = (d.getMonth()+1) + "/" + d.getDate();
    // Ebbinghaus decay approximation
    let retention = Math.exp(-i / (avgEF * 10)) * 100;
    data.push({ label: shortLabel, value: Math.max(0, retention) });
  }
  return data;
}

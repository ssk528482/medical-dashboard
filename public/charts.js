// ─── SVG Charts ───────────────────────────────────────────────

function buildLineChart(data, opts = {}) {
  let { width = 320, height = 120, color = "#3b82f6", unit = "%", showDots = true, fillArea = true } = opts;
  if (data.length < 2) return `<div style="color:#64748b;font-size:12px;text-align:center;padding:20px 0;">Not enough data yet</div>`;

  let values = data.map(d => d.value);
  let min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  let padL = 32, padR = 12, padT = 14, padB = 24;
  let chartW = width - padL - padR, chartH = height - padT - padB;
  let stepX = chartW / (data.length - 1);

  function yOf(v) { return padT + chartH - ((v - min) / range) * chartH; }

  let points  = data.map((d, i) => `${padL + i * stepX},${yOf(d.value)}`);
  let linePath = "M " + points.join(" L ");
  let fillPath = linePath + ` L ${padL + (data.length-1)*stepX},${padT+chartH} L ${padL},${padT+chartH} Z`;

  let gridLines = [0, 0.5, 1].map(frac => {
    let y = padT + chartH * (1 - frac);
    let v = (min + frac * range).toFixed(0);
    return `<line x1="${padL}" y1="${y}" x2="${padL+chartW}" y2="${y}" stroke="#1e293b" stroke-width="1"/>
            <text x="${padL-4}" y="${y+4}" text-anchor="end" fill="#475569" font-size="9">${v}${unit}</text>`;
  }).join("");

  let step = Math.max(1, Math.floor(data.length / 5));
  let xLabels = data.map((d, i) => (i % step !== 0 && i !== data.length - 1) ? "" :
    `<text x="${padL + i*stepX}" y="${padT+chartH+16}" text-anchor="middle" fill="#475569" font-size="9">${d.label}</text>`
  ).join("");

  let dots = showDots ? data.map((d, i) =>
    `<circle cx="${padL+i*stepX}" cy="${yOf(d.value)}" r="3" fill="${color}" stroke="#0f172a" stroke-width="1.5"/>`
  ).join("") : "";

  let lx = padL + (data.length-1)*stepX, ly = yOf(data[data.length-1].value);

  return `
    <svg width="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g${color.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}${xLabels}
      ${fillArea ? `<path d="${fillPath}" fill="url(#g${color.replace('#','')})"/>` : ""}
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
      ${dots}
      <rect x="${lx-20}" y="${ly-20}" width="40" height="16" rx="4" fill="${color}" opacity="0.9"/>
      <text x="${lx}" y="${ly-9}" text-anchor="middle" fill="white" font-size="10" font-weight="bold">${data[data.length-1].value.toFixed(1)}${unit}</text>
    </svg>`;
}

function buildBarChart(data, opts = {}) {
  let { width = 320, height = 80, colors = ["#1f2937","#f97316","#eab308","#16a34a"] } = opts;
  if (!data.length) return "";
  let padL = 4, padR = 4, padT = 8, padB = 4;
  let chartW = width - padL - padR, chartH = height - padT - padB;
  let max = Math.max(...data.map(d => d.value), 1);
  let barW = Math.max(1, chartW / data.length - 1.5);

  let bars = data.map((d, i) => {
    let barH = Math.max(2, (d.value / max) * chartH);
    let x = padL + i * (chartW / data.length);
    let y = padT + chartH - barH;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${colors[d.score ?? 0] || colors[0]}"/>`;
  }).join("");

  return `<svg width="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

// ─── Sparkline (inline mini chart) ───────────────────────────

function buildSparkline(values, opts = {}) {
  let { width = 80, height = 28, color = "#3b82f6", strokeWidth = 1.5 } = opts;
  if (!values || values.length < 2) return `<span style="font-size:10px;color:#475569;">no data</span>`;
  let min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  let pts = values.map((v, i) => {
    let x = (i / (values.length - 1)) * width;
    let y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  let last = values[values.length - 1];
  let first = values[0];
  let trend = last >= first ? "#10b981" : "#ef4444";
  let c = opts.forceColor || trend;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;">
    <polyline points="${pts}" fill="none" stroke="${c}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${(values.length-1)/(values.length-1)*width}" cy="${(height - ((last - min)/range)*(height-4) - 2).toFixed(1)}" r="2.5" fill="${c}"/>
  </svg>`;
}

function buildSubjectQbankSparklines() {
  // Returns HTML string of per-subject sparkline rows
  let subjects = studyData.subjects;
  let rows = Object.keys(subjects).map(name => {
    let sub = subjects[name];
    // Collect qbank session history from dailyHistory
    let sessions = [];
    let sortedDays = Object.keys(studyData.dailyHistory || {}).sort();
    sortedDays.forEach(day => {
      let hist = studyData.dailyHistory[day];
      (hist.qbankEntries || []).forEach(e => {
        if (e.subject === name && e.total > 0) {
          sessions.push({ day, acc: (e.correct / e.total) * 100 });
        }
      });
    });
    // Fallback: use cumulative stats if no session history
    let totalQ = 0, totalC = 0;
    sub.units.forEach(u => { totalQ += u.qbankStats.total; totalC += u.qbankStats.correct; });
    let overallAcc = totalQ > 0 ? (totalC / totalQ * 100).toFixed(1) : null;

    if (sessions.length < 2) {
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #0f172a;">
          <div>
            <div style="font-size:13px;font-weight:600;">${name}</div>
            <div style="font-size:11px;color:#475569;">${sessions.length === 1 ? "1 session" : "No sessions yet"}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${overallAcc ? `<span style="font-size:12px;font-weight:700;color:${overallAcc>=75?"#10b981":overallAcc>=50?"#eab308":"#ef4444"};">${overallAcc}%</span>` : `<span style="color:#475569;font-size:12px;">—</span>`}
            <div style="width:80px;height:28px;display:flex;align-items:center;justify-content:center;">
              ${buildSparkline(sessions.map(s => s.acc))}
            </div>
          </div>
        </div>`;
    }
    let vals = sessions.map(s => s.acc);
    let last = vals[vals.length - 1];
    let trendUp = last >= vals[0];
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #0f172a;">
        <div>
          <div style="font-size:13px;font-weight:600;">${name}</div>
          <div style="font-size:11px;color:#475569;">${sessions.length} sessions · last: ${sessions[sessions.length-1].day.slice(5)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:13px;font-weight:700;color:${last>=75?"#10b981":last>=50?"#eab308":"#ef4444"};">${last.toFixed(1)}%</span>
          <span style="font-size:16px;">${trendUp ? "↑" : "↓"}</span>
          ${buildSparkline(vals, { width: 80, height: 28 })}
        </div>
      </div>`;
  });
  return rows.join("");
}

function buildGlobalAccuracyTrend(days) {
  // Build from actual logged qbank sessions in dailyHistory
  let data = [];
  for (let i = days - 1; i >= 0; i--) {
    let d = new Date(); d.setDate(d.getDate() - i);
    let dateStr = d.toISOString().split("T")[0];
    let label   = (d.getMonth()+1) + "/" + d.getDate();
    let hist = studyData.dailyHistory?.[dateStr];
    if (!hist?.qbankEntries?.length) continue;
    let dayTotal = 0, dayCorrect = 0;
    hist.qbankEntries.forEach(e => { dayTotal += e.total || 0; dayCorrect += e.correct || 0; });
    if (dayTotal > 0) data.push({ label, value: (dayCorrect / dayTotal) * 100 });
  }
  return data;
}

function buildConsistencyBarData(days) {
  let data = [];
  for (let i = days - 1; i >= 0; i--) {
    let d = new Date(); d.setDate(d.getDate() - i);
    let dateStr = d.toISOString().split("T")[0];
    let label   = (d.getMonth()+1) + "/" + d.getDate();
    let score = 0;
    if (studyData.dailyHistory[dateStr]) {
      let e = studyData.dailyHistory[dateStr];
      score = (e.study?1:0) + (e.qbank?1:0) + (e.revision?1:0);
    }
    data.push({ label, value: score, score });
  }
  return data;
}

function buildRetentionProjection(days) {
  // For each completed chapter, compute its real Ebbinghaus retention at each future day
  // based on actual lastReviewedOn and difficultyFactor, then average across all chapters

  let chapters = [];
  Object.values(studyData.subjects).forEach(sub => {
    sub.units.forEach(u => {
      u.chapters.forEach(ch => {
        if (ch.status === "completed" && ch.lastReviewedOn) {
          chapters.push({
            lastReviewedOn: ch.lastReviewedOn,
            ef: ch.difficultyFactor || 2.5,
            ri: ch.revisionIndex || 0,
          });
        }
      });
    });
  });

  let data = [];
  for (let i = 0; i <= days; i++) {
    let futureDate = addDays(today(), i);
    let d = new Date(futureDate.replace(/-/g, '/'));
    let label = (d.getMonth()+1) + "/" + d.getDate();

    if (chapters.length === 0) {
      data.push({ label, value: 0 });
      continue;
    }

    let totalRetention = 0;
    chapters.forEach(ch => {
      // Days since last review at this future point
      let daysSince = daysBetween(ch.lastReviewedOn, futureDate);
      if (daysSince < 0) daysSince = 0;
      // SM-2-like stability: each revision extends retention interval
      // Base stability = ef * 10 * (1 + ri * 0.5)
      let stability = ch.ef * 10 * (1 + ch.ri * 0.5);
      let retention = Math.max(0, Math.min(100, Math.exp(-daysSince / stability) * 100));
      totalRetention += retention;
    });

    data.push({ label, value: totalRetention / chapters.length });
  }
  return data;
}

// ─── Stopwatch Engine ─────────────────────────────────────────
// 3 independent timers: study, qbank, revision
// State persisted inside studyData.dailyPlan.stopwatches
// → survives tab close, refresh, background

const SW_KEYS = ["study", "qbank", "revision"];
let _swIntervals = {};

function _swEnsure() {
  if (!studyData.dailyPlan) return false;
  if (!studyData.dailyPlan.stopwatches) studyData.dailyPlan.stopwatches = {};
  SW_KEYS.forEach(k => {
    if (!studyData.dailyPlan.stopwatches[k])
      studyData.dailyPlan.stopwatches[k] = { accumulated:0, startedAt:null, running:false, targetSecs:0 };
  });
  return true;
}

function _sw(key) {
  if (!_swEnsure()) return null;
  return studyData.dailyPlan.stopwatches[key];
}

function swElapsed(key) {
  let sw = _sw(key); if (!sw) return 0;
  let base = sw.accumulated || 0;
  if (sw.running && sw.startedAt)
    base += Math.floor((Date.now() - new Date(sw.startedAt).getTime()) / 1000);
  return base;
}

function _fmtHMS(secs) {
  secs = Math.max(0, secs);
  let h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
  let mm = String(m).padStart(2,"0"), ss = String(s).padStart(2,"0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function _fmtMins(secs) {
  secs = Math.abs(secs);
  let h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function swStart(key) {
  let sw = _sw(key); if (!sw || sw.running) return;
  sw.running = true; sw.startedAt = new Date().toISOString();
  saveData(); _swTick(key);
}

function swPause(key) {
  let sw = _sw(key); if (!sw || !sw.running) return;
  sw.accumulated = swElapsed(key); sw.running = false; sw.startedAt = null;
  clearInterval(_swIntervals[key]); delete _swIntervals[key];
  saveData(); _swRender(key);
}

function swReset(key) {
  let sw = _sw(key); if (!sw) return;
  clearInterval(_swIntervals[key]); delete _swIntervals[key];
  sw.accumulated = 0; sw.running = false; sw.startedAt = null;
  saveData(); _swRender(key);
}

function _swTick(key) {
  clearInterval(_swIntervals[key]);
  _swRender(key);
  _swIntervals[key] = setInterval(() => _swRender(key), 1000);
}

function _swRender(key) {
  let sw = _sw(key); if (!sw) return;
  let el = document.getElementById(`sw-${key}`);
  if (!el) { clearInterval(_swIntervals[key]); delete _swIntervals[key]; return; }

  let elapsed = swElapsed(key);
  let target  = sw.targetSecs || 0;
  let diff    = elapsed - target;
  let pct     = target > 0 ? Math.min(100, (elapsed/target)*100) : (elapsed > 0 ? 100 : 0);
  let isOver  = target > 0 && diff > 0;
  let isNear  = target > 0 && diff > -300 && diff <= 0;

  let dispColor = sw.running ? (isOver ? "#f87171" : "#34d399") : (isOver ? "#f87171" : "#f1f5f9");

  let badge = "";
  if (elapsed === 0)  badge = `<span style="font-size:11px;color:#475569;">Not started</span>`;
  else if (target===0) badge = `<span style="font-size:11px;color:#94a3b8;">${_fmtHMS(elapsed)} elapsed</span>`;
  else if (isOver)    badge = `<span class="sw-status over">+${_fmtMins(diff)} over 🔴</span>`;
  else if (isNear)    badge = `<span class="sw-status on-target">On target 🟢</span>`;
  else                badge = `<span class="sw-status under">${_fmtMins(-diff)} left</span>`;

  let barColor = isOver ? "#ef4444" : pct > 80 ? "#10b981" : pct > 40 ? "#eab308" : "#3b82f6";
  let btnHtml  = sw.running
    ? `<button class="sw-btn pause" onclick="swPause('${key}')">⏸ Pause</button>`
    : `<button class="sw-btn start" onclick="swStart('${key}')">▶ ${elapsed>0?"Resume":"Start"}</button>`;
  let rstHtml  = elapsed > 0 ? `<button class="sw-btn reset" onclick="swReset('${key}')">↺</button>` : "";

  el.innerHTML = `
    <div class="sw-row">
      <span class="sw-display" style="color:${dispColor};">${_fmtHMS(elapsed)}</span>
      ${target > 0 ? `<span class="sw-target">Target ${_fmtMins(target)}</span>` : `<span class="sw-target"></span>`}
      ${badge}
    </div>
    <div class="sw-row" style="margin-top:7px;gap:6px;">${btnHtml}${rstHtml}</div>
    <div class="sw-bar-wrap"><div class="sw-bar-fill" style="width:${pct}%;background:${barColor};"></div></div>
  `;
}

function swInject(type, targetHrs) {
  let slot = document.getElementById(`sw-slot-${type}`); if (!slot) return;
  if (!_swEnsure()) return;
  let sw = _sw(type);
  let targetSecs = Math.round(parseFloat(targetHrs||0) * 3600);
  // Only set target if timer is fresh (don't overwrite running/paused timer)
  if (!sw.running && sw.accumulated === 0 && sw.targetSecs === 0) {
    sw.targetSecs = targetSecs; saveData();
  }
  // If target changed (new plan generated), update it
  if (sw.targetSecs === 0 && targetSecs > 0) {
    sw.targetSecs = targetSecs; saveData();
  }
  slot.innerHTML = `<div class="sw-block"><div id="sw-${type}"></div></div>`;
  _swRender(type);
  if (sw.running) _swTick(type);
}

function swInit() {
  if (!_swEnsure()) return;
  SW_KEYS.forEach(key => {
    let sw = _sw(key); if (!sw) return;
    if (sw.running) _swTick(key);
    else if (sw.accumulated > 0) _swRender(key);
  });
}

function swAutoSaveYesterday() {
  let plan = studyData.dailyPlan;
  if (!plan || !plan.date || plan.date === today()) return;
  if (!plan.stopwatches) return;
  let key = plan.date;
  if (!studyData.dailyHistory) studyData.dailyHistory = {};
  if (!studyData.dailyHistory[key]) studyData.dailyHistory[key] = {};
  let hist = studyData.dailyHistory[key];
  if (hist.timeTracking) return;
  // Freeze any still-running timers
  SW_KEYS.forEach(k => {
    let sw = plan.stopwatches[k]; if (!sw) return;
    if (sw.running && sw.startedAt) {
      sw.accumulated += Math.floor((Date.now()-new Date(sw.startedAt).getTime())/1000);
      sw.running = false; sw.startedAt = null;
    }
  });
  let tt = {};
  SW_KEYS.forEach(type => {
    let sw = plan.stopwatches[type]; if (!sw) return;
    let target = sw.targetSecs||0, elapsed = sw.accumulated||0;
    tt[type] = { targetMins: Math.round(target/60), actualMins: Math.round(elapsed/60), overUnder: Math.round((elapsed-target)/60) };
  });
  hist.timeTracking = tt;
  if (tt.study?.actualMins    > 5) hist.study    = hist.study    || true;
  if (tt.qbank?.actualMins    > 5) hist.qbank    = hist.qbank    || true;
  if (tt.revision?.actualMins > 5) hist.revision = hist.revision || true;
  saveData();
}

function swGetTodaySummary() {
  let plan = studyData.dailyPlan;
  if (!plan || plan.date !== today() || !plan.stopwatches) return null;
  let result = {};
  SW_KEYS.forEach(type => {
    let sw = plan.stopwatches[type]; if (!sw) return;
    let elapsed = swElapsed(type);
    result[type] = { targetMins: Math.round((sw.targetSecs||0)/60), actualMins: Math.round(elapsed/60), overUnder: Math.round((elapsed-(sw.targetSecs||0))/60) };
  });
  return result;
}

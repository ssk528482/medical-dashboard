// pomodoro.js — Floating Pomodoro / Focus Timer
// Injects a persistent floating widget on all pages that include this script.
// No external dependencies beyond utils.js (for today() / addDays()).

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────
  const WORK_SECS  = 25 * 60;
  const BREAK_SECS =  5 * 60;
  const LONG_BREAK_SECS = 15 * 60;

  // ── State (persisted in sessionStorage so it survives soft nav) ──
  let _state = _loadState();

  function _defaultState() {
    return { mode: 'work', remaining: WORK_SECS, running: false, sessions: 0, startedAt: null };
  }
  function _loadState() {
    try { return JSON.parse(sessionStorage.getItem('_pomState') || 'null') || _defaultState(); }
    catch (_) { return _defaultState(); }
  }
  function _saveState() {
    try { sessionStorage.setItem('_pomState', JSON.stringify(_state)); } catch (_) {}
  }

  // ── DOM ────────────────────────────────────────────────────────
  let _fab, _panel, _display, _label, _interval;

  function _inject() {
    // Floating action button
    _fab = document.createElement('button');
    _fab.id = 'pom-fab';
    _fab.title = 'Focus Timer';
    _fab.textContent = '🍅';
    _fab.style.cssText = `
      position:fixed;bottom:20px;right:20px;z-index:9000;
      width:46px;height:46px;border-radius:50%;
      background:#be123c;color:#fff;font-size:20px;
      border:none;cursor:pointer;
      box-shadow:0 4px 14px rgba(0,0,0,0.45);
      display:flex;align-items:center;justify-content:center;
      transition:transform 0.15s;padding:0;margin:0;min-height:0;
    `;
    _fab.onmouseenter = () => { _fab.style.transform = 'scale(1.1)'; };
    _fab.onmouseleave = () => { _fab.style.transform = 'scale(1)'; };
    _fab.onclick = _togglePanel;

    // Panel
    _panel = document.createElement('div');
    _panel.id = 'pom-panel';
    _panel.style.cssText = `
      position:fixed;bottom:76px;right:12px;z-index:8999;
      width:240px;background:#0f172a;border:1px solid #1e3a5f;
      border-radius:16px;padding:16px;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);
      display:none;flex-direction:column;align-items:center;gap:12px;
    `;
    _panel.innerHTML = `
      <div id="pom-label" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;">Focus Session</div>
      <div id="pom-display" style="font-size:44px;font-weight:900;color:#f1f5f9;letter-spacing:2px;font-variant-numeric:tabular-nums;line-height:1;">25:00</div>
      <div style="display:flex;gap:8px;width:100%;">
        <button id="pom-start" onclick="pomStart()" style="flex:1;background:#16a34a;color:#fff;border:none;border-radius:8px;padding:9px 0;font-size:13px;font-weight:700;cursor:pointer;min-height:0;margin:0;">▶ Start</button>
        <button id="pom-pause" onclick="pomPause()" style="flex:1;background:#1e3a5f;color:#93c5fd;border:1px solid #2a4f80;border-radius:8px;padding:9px 0;font-size:13px;font-weight:700;cursor:pointer;display:none;min-height:0;margin:0;">⏸ Pause</button>
        <button id="pom-reset" onclick="pomReset()" style="background:#1e293b;color:#64748b;border:1px solid #334155;border-radius:8px;padding:9px 12px;font-size:13px;cursor:pointer;min-height:0;margin:0;">↺</button>
      </div>
      <div style="display:flex;gap:6px;width:100%;justify-content:center;">
        <button onclick="pomSetMode('work')"  style="font-size:11px;padding:5px 10px;border-radius:6px;background:#1e293b;color:#94a3b8;border:1px solid #334155;cursor:pointer;min-height:0;margin:0;">Work</button>
        <button onclick="pomSetMode('break')" style="font-size:11px;padding:5px 10px;border-radius:6px;background:#1e293b;color:#94a3b8;border:1px solid #334155;cursor:pointer;min-height:0;margin:0;">Break</button>
        <button onclick="pomSetMode('long')"  style="font-size:11px;padding:5px 10px;border-radius:6px;background:#1e293b;color:#94a3b8;border:1px solid #334155;cursor:pointer;min-height:0;margin:0;">Long</button>
      </div>
      <div id="pom-sessions" style="font-size:11px;color:#475569;">Sessions: 0</div>
    `;

    document.body.appendChild(_fab);
    document.body.appendChild(_panel);

    _display = document.getElementById('pom-display');
    _label   = document.getElementById('pom-label');

    // Restore live countdown if timer was running when navigating away
    if (_state.running && _state.startedAt) {
      let elapsed = Math.floor((Date.now() - _state.startedAt) / 1000);
      _state.remaining = Math.max(0, _state.remaining - elapsed);
      _state.startedAt = null;
      if (_state.remaining === 0) { _state.running = false; _handleFinish(false); }
      else { _startInterval(); }
    }
    _updateUI();
  }

  function _togglePanel() {
    let visible = _panel.style.display !== 'none';
    _panel.style.display = visible ? 'none' : 'flex';
  }

  // ── Timer logic ────────────────────────────────────────────────
  function pomStart() {
    if (_state.running) return;
    _state.running = true;
    _state.startedAt = null; // we track via interval
    _saveState();
    _startInterval();
    _updateUI();
  }
  window.pomStart = pomStart;

  function pomPause() {
    if (!_state.running) return;
    _state.running = false;
    clearInterval(_interval);
    _saveState();
    _updateUI();
  }
  window.pomPause = pomPause;

  function pomReset() {
    clearInterval(_interval);
    _state.running = false;
    _state.remaining = _modeSecs(_state.mode);
    _saveState();
    _updateUI();
  }
  window.pomReset = pomReset;

  function pomSetMode(mode) {
    clearInterval(_interval);
    _state.running = false;
    _state.mode = mode;
    _state.remaining = _modeSecs(mode);
    _saveState();
    _updateUI();
  }
  window.pomSetMode = pomSetMode;

  function _modeSecs(mode) {
    return mode === 'break' ? BREAK_SECS : mode === 'long' ? LONG_BREAK_SECS : WORK_SECS;
  }

  function _startInterval() {
    clearInterval(_interval);
    _interval = setInterval(() => {
      if (!_state.running) return;
      _state.remaining = Math.max(0, _state.remaining - 1);
      _updateDisplay();
      if (_state.remaining === 0) { clearInterval(_interval); _handleFinish(true); }
    }, 1000);
  }

  function _handleFinish(notify) {
    _state.running = false;
    if (_state.mode === 'work') {
      _state.sessions++;
      if (notify) _notify('🍅 Pomodoro complete! Take a ' + (_state.sessions % 4 === 0 ? '15-min long' : '5-min') + ' break.', 'Focus Timer');
      _state.mode      = _state.sessions % 4 === 0 ? 'long' : 'break';
      _state.remaining = _modeSecs(_state.mode);
    } else {
      if (notify) _notify('☕ Break over! Start your next focus session.', 'Focus Timer');
      _state.mode      = 'work';
      _state.remaining = WORK_SECS;
    }
    _saveState();
    _updateUI();
    // Auto-open panel so user sees the prompt
    if (_panel) _panel.style.display = 'flex';
  }

  function _notify(body, title) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title || 'Pomodoro', { body, icon: 'icon/icon-192.svg' });
    }
    // Visual flash on FAB
    if (_fab) {
      _fab.style.background = '#f59e0b';
      setTimeout(() => { if (_fab) _fab.style.background = '#be123c'; }, 1500);
    }
  }

  // ── UI ─────────────────────────────────────────────────────────
  function _fmt(secs) {
    let m = Math.floor(secs / 60), s = secs % 60;
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  function _updateDisplay() {
    if (_display) _display.textContent = _fmt(_state.remaining);
    // Update FAB text to show time when running
    if (_fab) _fab.textContent = _state.running ? _fmt(_state.remaining) : '🍅';
  }

  function _updateUI() {
    _updateDisplay();
    if (_label) {
      _label.textContent = _state.mode === 'work' ? 'Focus Session' : _state.mode === 'break' ? 'Short Break' : 'Long Break';
    }
    let startBtn = document.getElementById('pom-start');
    let pauseBtn = document.getElementById('pom-pause');
    if (startBtn) startBtn.style.display = _state.running ? 'none' : 'block';
    if (pauseBtn) pauseBtn.style.display = _state.running ? 'block' : 'none';
    let sessEl = document.getElementById('pom-sessions');
    if (sessEl) sessEl.textContent = 'Sessions: ' + _state.sessions;
  }

  // ── Boot ───────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _inject);
  } else {
    _inject();
  }

  // Persist startedAt on page-hide so remaining can be computed on restore
  window.addEventListener('pagehide', () => {
    if (_state.running) { _state.startedAt = Date.now(); _saveState(); }
  });

})();

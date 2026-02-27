function today() {
  let d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function addDays(dateStr, days) {
  let d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function isPast(dateStr) {
  return dateStr < today();
}

function daysBetween(dateStr1, dateStr2) {
  let d1 = new Date(dateStr1);
  let d2 = new Date(dateStr2);
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function daysUntilExam() {
  let examDate = new Date(studyData.examDate || "2026-12-01");
  let now = new Date();
  return Math.max(0, Math.ceil((examDate - now) / (1000 * 60 * 60 * 24)));
}

function percentage(part, total) {
  if (total === 0) return 0;
  return ((part / total) * 100).toFixed(1);
}

// Exam proximity factor: returns 0.0 (far) → 1.0 (exam day)
function examProximityFactor() {
  let total = daysBetween(studyData.startDate || today(), studyData.examDate || "2026-12-01");
  let remaining = daysUntilExam();
  if (total <= 0) return 1;
  return Math.min(1, 1 - (remaining / total));
}

// Clamp a number between min and max
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ─── Global Popup System ─────────────────────────────────────────
// showToast(msg, type, duration)
// showConfirm(title, body, onConfirm, okLabel, dangerous)
// showPrompt(title, label, defaultVal, onSubmit)

var _gsConfirmFn = null;
var _gsPromptFn  = null;

function _gsInjectPopups() {
  if (document.getElementById('gs-popup-root')) return;
  var root = document.createElement('div');
  root.id = 'gs-popup-root';
  root.innerHTML =
    '<div class="gs-toast-wrap" id="gs-toast-wrap"></div>' +
    '<div class="gs-modal-backdrop" id="gs-confirm-backdrop" onclick="if(event.target===this)_gsCloseConfirm()">' +
      '<div class="gs-modal-box">' +
        '<div class="gs-modal-icon" id="gs-confirm-icon">⚠️</div>' +
        '<div class="gs-modal-title" id="gs-confirm-title">Confirm</div>' +
        '<div class="gs-modal-body"  id="gs-confirm-body"></div>' +
        '<div class="gs-modal-btns">' +
          '<button class="gs-btn-cancel" onclick="_gsCloseConfirm()">Cancel</button>' +
          '<button class="gs-btn-ok" id="gs-confirm-ok" onclick="_gsRunConfirm()">Confirm</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="gs-modal-backdrop" id="gs-prompt-backdrop" onclick="if(event.target===this)_gsClosePrompt()">' +
      '<div class="gs-modal-box">' +
        '<div class="gs-modal-title" id="gs-prompt-title">Input</div>' +
        '<div class="gs-modal-body" id="gs-prompt-label"></div>' +
        '<input id="gs-prompt-input" class="gs-prompt-input" type="text" ' +
          'onkeydown="if(event.key===\'Enter\')_gsRunPrompt();if(event.key===\'Escape\')_gsClosePrompt();" />' +
        '<div class="gs-modal-btns">' +
          '<button class="gs-btn-cancel" onclick="_gsClosePrompt()">Cancel</button>' +
          '<button class="gs-btn-ok" id="gs-prompt-ok" onclick="_gsRunPrompt()">OK</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  if (document.body) {
    document.body.appendChild(root);
  } else {
    document.addEventListener('DOMContentLoaded', function() { document.body.appendChild(root); });
  }
}

function showToast(msg, type, duration) {
  type = type || 'info';
  duration = duration || 3200;
  _gsInjectPopups();
  var icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
  var wrap = document.getElementById('gs-toast-wrap');
  if (!wrap) return;
  var t = document.createElement('div');
  t.className = 'gs-toast gs-' + type;
  t.innerHTML = '<span class="gs-toast-icon">' + (icons[type] || 'ℹ️') + '</span><span>' + msg + '</span>';
  t.onclick = function() { _gsDismissToast(t); };
  wrap.appendChild(t);
  setTimeout(function() { _gsDismissToast(t); }, duration);
}

function _gsDismissToast(el) {
  if (!el || !el.parentNode) return;
  el.classList.add('out');
  setTimeout(function() { if (el.parentNode) el.remove(); }, 200);
}

function showConfirm(title, body, onConfirm, okLabel, dangerous) {
  _gsInjectPopups();
  _gsConfirmFn = onConfirm;
  document.getElementById('gs-confirm-title').textContent = title;
  document.getElementById('gs-confirm-body').innerHTML    = body;
  var okBtn = document.getElementById('gs-confirm-ok');
  okBtn.textContent = okLabel || 'Confirm';
  okBtn.className   = 'gs-btn-ok' + (dangerous ? ' danger' : '');
  var icon = document.getElementById('gs-confirm-icon');
  if (icon) icon.textContent = dangerous ? '🗑️' : '❓';
  document.getElementById('gs-confirm-backdrop').classList.add('open');
}

function _gsCloseConfirm() {
  var el = document.getElementById('gs-confirm-backdrop');
  if (el) el.classList.remove('open');
  _gsConfirmFn = null;
}

async function _gsRunConfirm() {
  var fn = _gsConfirmFn;
  _gsCloseConfirm();
  if (fn) await fn();
}

function showPrompt(title, label, defaultVal, onSubmit) {
  _gsInjectPopups();
  _gsPromptFn = onSubmit;
  document.getElementById('gs-prompt-title').textContent = title;
  document.getElementById('gs-prompt-label').textContent = label;
  var inp = document.getElementById('gs-prompt-input');
  inp.value = defaultVal || '';
  document.getElementById('gs-prompt-backdrop').classList.add('open');
  setTimeout(function() { inp.focus(); inp.select(); }, 80);
}

function _gsClosePrompt() {
  var el = document.getElementById('gs-prompt-backdrop');
  if (el) el.classList.remove('open');
  _gsPromptFn = null;
}

function _gsRunPrompt() {
  var val = document.getElementById('gs-prompt-input').value;
  var fn  = _gsPromptFn;
  _gsClosePrompt();
  if (fn) fn(val);
}

_gsInjectPopups();

// ─── Theme Toggle ────────────────────────────────────────────────────────────
function toggleTheme() {
  document.body.classList.add('theme-transitioning');
  var isLight = document.body.classList.toggle('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  document.documentElement.style.background = isLight ? '#eef2f7' : '#0a1628';
  document.documentElement.style.color      = isLight ? '#0f172a' : '#e2e8f0';
  _updateThemeBtn();
  setTimeout(function() { document.body.classList.remove('theme-transitioning'); }, 280);
}

function _updateThemeBtn() {
  var isLight = document.body.classList.contains('light');
  var icon  = document.getElementById('nav-theme-icon');
  var label = document.getElementById('nav-theme-label');
  if (icon)  icon.textContent  = isLight ? '\uD83C\uDF19' : '\u2600\uFE0F';
  if (label) label.textContent = isLight ? 'Dark Mode' : 'Light Mode';
}

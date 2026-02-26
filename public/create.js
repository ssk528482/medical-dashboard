// create.js — Medical Study OS
// Standalone Create Card page logic
// Depends on: utils.js, data.js, supabase.js, cloudinary.js, cardSync.js

'use strict';

// ── State ─────────────────────────────────────────────────────────
let _type      = 'basic';
let _tags      = [];
let _frontUrl  = null;
let _backUrl   = null;
let _editId    = null;   // set if coming from browse via ?edit=ID
let _aiCards   = [];

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
  _fillSubjects();

  // Check for ?edit=ID deep link (edit a specific card)
  let params = new URLSearchParams(window.location.search);
  let editId = params.get('edit');
  if (editId) {
    _editId = editId;
    let { data } = await fetchCards({ suspended: 'all' });
    let card = (data || []).find(c => c.id === editId);
    if (card) _loadForEdit(card);
    document.querySelector('.create-title').textContent = '✏️ Edit Card';
  }

  // Pre-fill subject/unit/chapter from query params (from notes → cards bridge)
  let subj = params.get('subject');
  let unit = params.get('unit');
  let chap = params.get('chapter');
  if (subj) {
    let sel = document.getElementById('sel-subject');
    if (sel) { sel.value = subj; fillUnits(); }
    setTimeout(() => {
      let uSel = document.getElementById('sel-unit');
      if (uSel && unit) { uSel.value = unit; fillChapters(); }
      setTimeout(() => {
        let cSel = document.getElementById('sel-chapter');
        if (cSel && chap) cSel.value = chap;
      }, 60);
    }, 60);
  }

  // If arriving for AI with n2c bridge (from notes page)
  let n2c = params.get('n2c');
  if (n2c === '1') {
    try {
      let content = sessionStorage.getItem('n2c_content');
      sessionStorage.removeItem('n2c_content');
      if (content) { setTimeout(() => { openAiModal(); document.getElementById('ai-source').value = content || ''; }, 200); }
    } catch (_) {}
  }
});

// ── Subject / Unit / Chapter cascades ────────────────────────────
function _fillSubjects() {
  let sel = document.getElementById('sel-subject');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  Object.keys(studyData.subjects || {}).sort().forEach(s => {
    let o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o);
  });
}

function fillUnits() {
  let subj = document.getElementById('sel-subject')?.value || '';
  let uSel = document.getElementById('sel-unit');
  if (!uSel) return;
  uSel.innerHTML = '<option value="">Unit</option>';
  (studyData.subjects[subj]?.units || []).forEach(u => {
    let o = document.createElement('option'); o.value = u.name; o.textContent = u.name; uSel.appendChild(o);
  });
  fillChapters();
}

function fillChapters() {
  let subj = document.getElementById('sel-subject')?.value || '';
  let unit = document.getElementById('sel-unit')?.value    || '';
  let cSel = document.getElementById('sel-chapter');
  if (!cSel) return;
  cSel.innerHTML = '<option value="">Chapter</option>';
  let unitObj = studyData.subjects[subj]?.units?.find(u => u.name === unit);
  (unitObj?.chapters || []).forEach(ch => {
    let o = document.createElement('option'); o.value = ch.name; o.textContent = ch.name; cSel.appendChild(o);
  });
}

// ── Card type switcher ────────────────────────────────────────────
function setType(type) {
  _type = type;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  let backGroup       = document.getElementById('back-group');
  let clozeHint       = document.getElementById('cloze-hint');
  let occlusionSection = document.getElementById('occlusion-section');
  let occlusionActions = document.getElementById('occlusion-box-actions');
  let frontGroup      = document.querySelector('.form-group:has(#front)');

  if (type === 'image_occlusion') {
    if (backGroup)        backGroup.style.display        = 'none';
    if (clozeHint)        clozeHint.style.display        = 'none';
    if (occlusionSection) occlusionSection.classList.add('active');
    if (occlusionActions) occlusionActions.style.display = 'flex';
    // Hide front text group since occlusion has its own content
    let frontUploadBox = document.getElementById('front-upload');
    if (frontUploadBox) frontUploadBox.closest('.form-group').style.display = 'none';
  } else {
    if (backGroup)        backGroup.style.display        = 'block';
    if (clozeHint)        clozeHint.style.display        = type === 'cloze' ? 'block' : 'none';
    if (occlusionSection) occlusionSection.classList.remove('active');
    if (occlusionActions) occlusionActions.style.display = 'none';
    // Show front group
    let frontEl = document.getElementById('front');
    if (frontEl) frontEl.closest('.form-group').style.display = 'block';
    // Reset occlusion canvas if switching away
    if (typeof resetOcclusionCanvas === 'function') resetOcclusionCanvas();
    // Relabel back field for cloze
    let backLabel = backGroup?.querySelector('.form-label');
    let backArea  = document.getElementById('back');
    if (type === 'cloze') {
      if (backLabel) backLabel.textContent = 'Details (optional)';
      if (backArea)  backArea.placeholder  = 'Extra notes, mnemonics or tips shown after the answer is revealed…';
    } else {
      if (backLabel) backLabel.textContent = 'Back';
      if (backArea)  backArea.placeholder  = 'Answer or explanation…';
    }
  }
}

function onFrontInput() {
  if (_type !== 'cloze') return;
  let val   = document.getElementById('front')?.value || '';
  let count = (val.match(/\{\{.+?\}\}/g) || []).length;
  let hint  = document.getElementById('cloze-hint');
  if (hint && count > 0) {
    hint.innerHTML = '💡 <strong>' + count + '</strong> blank' + (count !== 1 ? 's' : '') + ' detected. Back will auto-reveal them.';
  }
}

// ── Tags ──────────────────────────────────────────────────────────
function tagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    let val = e.target.value.trim().replace(/,$/, '');
    if (val && !_tags.includes(val)) { _tags.push(val); _renderTags(); }
    e.target.value = '';
  } else if (e.key === 'Backspace' && e.target.value === '' && _tags.length) {
    _tags.pop(); _renderTags();
  }
}

function removeTag(i) { _tags.splice(i, 1); _renderTags(); }

function _renderTags() {
  let wrap  = document.getElementById('tag-wrap');
  let input = document.getElementById('tag-input');
  if (!wrap || !input) return;
  wrap.querySelectorAll('.tag-chip').forEach(c => c.remove());
  _tags.forEach((t, i) => {
    let chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = _esc(t) + '<span class="tag-chip-x" onclick="removeTag(' + i + ')">✕</span>';
    wrap.insertBefore(chip, input);
  });
}

// ── Image upload (uses cloudinary.js) ────────────────────────────
async function uploadImg(side, inputEl) {
  let file = inputEl.files[0]; if (!file) return;
  let statusEl = document.getElementById(side + '-upload-status');
  if (statusEl) { statusEl.textContent = 'Uploading…'; }
  try {
    let folder = side === 'front' ? CLOUDINARY_FOLDERS.FLASHCARD_FRONT : CLOUDINARY_FOLDERS.FLASHCARD_BACK;
    let { url } = await uploadWithProgress(file, folder, statusEl);
    if (side === 'front') _frontUrl = url; else _backUrl = url;
    document.getElementById(side + '-preview-img').src = url;
    document.getElementById(side + '-preview-wrap').style.display = 'block';
    if (statusEl) statusEl.textContent = '';
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Upload failed: ' + err.message;
  }
  inputEl.value = '';
}

function removeImg(side) {
  if (side === 'front') _frontUrl = null; else _backUrl = null;
  document.getElementById(side + '-preview-img').src = '';
  document.getElementById(side + '-preview-wrap').style.display = 'none';
}

// ── Submit ────────────────────────────────────────────────────────
async function submit() {
  let subject = document.getElementById('sel-subject')?.value || '';
  let unit    = document.getElementById('sel-unit')?.value    || '';
  let chapter = document.getElementById('sel-chapter')?.value || '';

  if (!subject) { _status('Please link to a subject.', true); return; }

  let cardObj;

  if (_type === 'image_occlusion') {
    let occData = typeof getOcclusionBoxes === 'function' ? getOcclusionBoxes() : null;
    if (!occData) { _status('Please upload a diagram and draw at least one occlusion box.', true); return; }
    cardObj = {
      id:         _editId || undefined,
      subject, unit: unit || '', chapter: chapter || '',
      card_type:  'image_occlusion',
      front_text: JSON.stringify(occData),
      back_text:  null,
      front_image_url: null,
      back_image_url:  null,
      tags: _tags,
    };
  } else {
    let front   = (document.getElementById('front')?.value   || '').trim();
    let back    = (document.getElementById('back')?.value    || '').trim();
    if (!front)   { _status('Front text is required.', true); return; }
    if (_type === 'basic' && !back && !_frontUrl && !_backUrl) { _status('Add back text or an image.', true); return; }
    if (_type === 'cloze' && !front.match(/\{\{.+?\}\}/)) { _status('Cloze cards need at least one {{blank}}.', true); return; }
    cardObj = {
      id:              _editId || undefined,
      subject, unit: unit || '', chapter: chapter || '',
      card_type:       _type,
      front_text:      front,
      back_text:       back || null,
      front_image_url: _frontUrl,
      back_image_url:  _backUrl,
      tags:            _tags,
    };
  }

  let btn = document.querySelector('.btn-primary:last-of-type');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  _status('Saving…');

  let { error } = await saveCard(cardObj);
  if (btn) { btn.disabled = false; btn.textContent = _editId ? 'Save Changes' : 'Save Card'; }

  if (error) { _status('Save failed: ' + (error.message || JSON.stringify(error)), true); return; }

  if (_editId) {
    _status('Card updated ✓');
    setTimeout(() => window.location.href = 'browse.html', 900);
  } else {
    _status('Card saved ✓ — form cleared for next card.');
    _reset();
  }
}

function _reset() {
  document.getElementById('front').value = '';
  let back = document.getElementById('back'); if (back) back.value = '';
  _tags = []; _frontUrl = null; _backUrl = null; _editId = null;
  removeImg('front'); removeImg('back'); _renderTags(); setType('basic'); _status('');
  if (typeof resetOcclusionCanvas === 'function') resetOcclusionCanvas();
}

// ── Load for edit ─────────────────────────────────────────────────
function _loadForEdit(card) {
  _editId   = card.id;
  _type     = card.card_type || 'basic';
  _tags     = card.tags      || [];
  _frontUrl = card.front_image_url || null;
  _backUrl  = card.back_image_url  || null;

  setType(_type);

  if (_type === 'image_occlusion') {
    // Load occlusion data from front_text JSON
    try {
      let occData = JSON.parse(card.front_text || '{}');
      if (typeof loadOcclusionData === 'function') loadOcclusionData(occData);
    } catch (_) {}
  } else {
    let f = document.getElementById('front'); if (f) f.value = card.front_text || '';
    let b = document.getElementById('back');  if (b) b.value = card.back_text  || '';
  }

  let sSel = document.getElementById('sel-subject');
  if (sSel) {
    sSel.value = card.subject || ''; fillUnits();
    requestAnimationFrame(() => {
      let uSel = document.getElementById('sel-unit'); if (uSel) { uSel.value = card.unit || ''; fillChapters(); }
      requestAnimationFrame(() => {
        let cSel = document.getElementById('sel-chapter'); if (cSel) cSel.value = card.chapter || '';
      });
    });
  }

  if (_frontUrl) { document.getElementById('front-preview-img').src = _frontUrl; document.getElementById('front-preview-wrap').style.display = 'block'; }
  if (_backUrl)  { document.getElementById('back-preview-img').src  = _backUrl;  document.getElementById('back-preview-wrap').style.display  = 'block'; }

  _renderTags();
  _status('Editing card — make changes then save.');

  let btn = document.querySelector('.btn-primary:last-of-type');
  if (btn) btn.textContent = 'Save Changes';
}

// ── AI Modal ──────────────────────────────────────────────────────
function openAiModal() {
  document.getElementById('ai-source').value = '';
  document.getElementById('ai-status').textContent = '';
  document.getElementById('ai-preview').innerHTML  = '';
  document.getElementById('ai-save-row').style.display = 'none';
  _aiCards = [];
  document.getElementById('ai-modal').classList.add('open');
}
function closeAiModal() { document.getElementById('ai-modal').classList.remove('open'); }

async function runAi() {
  let sourceText = (document.getElementById('ai-source')?.value || '').trim();
  if (!sourceText) { document.getElementById('ai-status').textContent = 'Please paste some text first.'; return; }

  let subject = document.getElementById('sel-subject')?.value || '';
  let unit    = document.getElementById('sel-unit')?.value    || '';
  let chapter = document.getElementById('sel-chapter')?.value || '';

  let btn = document.getElementById('ai-run-btn');
  btn.disabled = true; btn.textContent = 'Generating…';
  document.getElementById('ai-status').textContent  = 'Calling Claude…';
  document.getElementById('ai-preview').innerHTML   = '';
  document.getElementById('ai-save-row').style.display = 'none';

  let prompt = `You are a medical education expert. Generate spaced-repetition flashcards from the text below.
Return ONLY a raw JSON array (no preamble, no markdown fences).

Format:
[{"front_text":"Question?","back_text":"Answer.","card_type":"basic","tags":["tag"]},
 {"front_text":"The {{mitochondria}} is the powerhouse of the cell.","back_text":"","card_type":"cloze","tags":[]}]

Rules: use "cloze" for fill-in-the-blank (wrap hidden word in {{braces}}), "basic" for Q&A.
Focus on high-yield medical facts. Generate 5–15 cards.
Context: ${chapter || 'Medical'} (${subject} > ${unit})

TEXT:
${sourceText}`;

  try {
    let res  = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    });
    let data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || 'API error ' + res.status);
    let raw  = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    raw = raw.replace(/```json|```/g, '').trim();
    _aiCards = JSON.parse(raw);
    if (!Array.isArray(_aiCards)) throw new Error('Response was not a JSON array.');
    _renderAiPreview();
    document.getElementById('ai-status').textContent = _aiCards.length + ' cards generated.';
    document.getElementById('ai-save-row').style.display = 'flex';
  } catch (err) {
    document.getElementById('ai-status').textContent = 'Error: ' + err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Generate Cards';
  }
}

function _renderAiPreview() {
  let list = document.getElementById('ai-preview');
  list.innerHTML = _aiCards.map((card, i) =>
    '<div class="ai-card-preview">' +
      '<div class="ai-card-header">' +
        '<span>' + (card.card_type === 'cloze' ? '📝 Cloze' : '📄 Basic') + '</span>' +
        '<button onclick="removeAiCard(' + i + ')">✕</button>' +
      '</div>' +
      '<div class="ai-field-label">Front</div>' +
      '<textarea class="ai-textarea" rows="2" oninput="_aiCards[' + i + '].front_text=this.value">' + _esc(card.front_text || '') + '</textarea>' +
      (card.card_type !== 'cloze' ?
        '<div class="ai-field-label" style="margin-top:6px;">Back</div>' +
        '<textarea class="ai-textarea" rows="2" oninput="_aiCards[' + i + '].back_text=this.value">' + _esc(card.back_text || '') + '</textarea>' : '') +
    '</div>'
  ).join('');
}

function removeAiCard(i) {
  _aiCards.splice(i, 1); _renderAiPreview();
  if (!_aiCards.length) { document.getElementById('ai-save-row').style.display = 'none'; document.getElementById('ai-status').textContent = 'All removed.'; }
}

async function saveAiCards() {
  if (!_aiCards.length) return;
  let subject = document.getElementById('sel-subject')?.value || '';
  let unit    = document.getElementById('sel-unit')?.value    || '';
  let chapter = document.getElementById('sel-chapter')?.value || '';
  let btn = document.querySelector('#ai-save-row button:last-child');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  let cards = _aiCards.map(c => ({
    subject, unit: unit || '', chapter: chapter || '',
    card_type: c.card_type || 'basic', front_text: c.front_text || '',
    back_text: c.back_text || null, tags: c.tags || []
  }));

  let { error } = await saveBatchCards(cards);
  if (btn) { btn.disabled = false; btn.textContent = 'Save All Cards'; }

  if (error) { document.getElementById('ai-status').textContent = 'Save failed: ' + (error.message || error); return; }

  document.getElementById('ai-status').textContent = '✓ ' + cards.length + ' cards saved!';
  document.getElementById('ai-save-row').style.display = 'none';
  document.getElementById('ai-preview').innerHTML = '';
  _aiCards = [];
  setTimeout(() => { closeAiModal(); window.location.href = 'browse.html'; }, 1200);
}

// ── Helpers ───────────────────────────────────────────────────────
function _status(msg, isError) {
  let el = document.getElementById('form-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'form-status' + (isError ? ' error' : '');
}

function _esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

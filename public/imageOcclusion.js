// imageOcclusion.js — Medical Study OS
// Canvas-based image occlusion card builder for flashcards.html.
//
// Workflow:
//   1. User uploads a diagram image → initOcclusionCanvas(input)
//   2. User drags on canvas to draw occlusion boxes
//   3. User clicks a box to name it (the label that is hidden)
//   4. cardCreator.js calls getOcclusionBoxes() to retrieve data
//   5. During review, flashcards.js calls renderOcclusionFront() /
//      renderOcclusionBack() to paint the card faces.
//
// Depends on:
//   cloudinary.js → uploadToCloudinary(), CLOUDINARY_FOLDERS
//
// All state is module-private.
// ─────────────────────────────────────────────────────────────────

// ── Module state ──────────────────────────────────────────────────
let _ocCanvas     = null;   // HTMLCanvasElement
let _ocCtx        = null;   // CanvasRenderingContext2D
let _ocImage      = null;   // HTMLImageElement (loaded diagram)
let _ocImageUrl   = "";     // Cloudinary URL of the uploaded diagram
let _ocBoxes      = [];     // Array of { id, x, y, w, h, label, color }
let _ocDragging   = false;  // Currently drawing a new box?
let _ocStartX     = 0;      // Drag start X (canvas coords)
let _ocStartY     = 0;      // Drag start Y
let _ocCurX       = 0;      // Current drag X
let _ocCurY       = 0;      // Current drag Y
let _ocSelected   = null;   // id of selected box (for rename)
let _ocScale      = 1;      // canvas CSS width / natural image width

// Box colours cycling through a palette
const _OC_COLORS = [
  "rgba(239,68,68,0.55)",    // red
  "rgba(59,130,246,0.55)",   // blue
  "rgba(245,158,11,0.55)",   // amber
  "rgba(16,185,129,0.55)",   // green
  "rgba(139,92,246,0.55)",   // purple
  "rgba(236,72,153,0.55)",   // pink
];

// ─────────────────────────────────────────────────────────────────
// INIT — called by occlusion-file-input onchange
// ─────────────────────────────────────────────────────────────────

/**
 * Upload the selected diagram image to Cloudinary, then
 * draw it on the canvas and enable box drawing.
 * @param {HTMLInputElement} inputEl
 */
async function initOcclusionCanvas(inputEl) {
  let file = inputEl.files[0];
  if (!file) return;
  inputEl.value = "";

  let uploadBox = document.getElementById("occlusion-upload-box");
  if (uploadBox) uploadBox.textContent = "Uploading diagram…";

  try {
    let { url } = await uploadToCloudinary(file, CLOUDINARY_FOLDERS.OCCLUSION);
    _ocImageUrl = url;
    _loadImageOnCanvas(url);
    if (uploadBox) uploadBox.style.display = "none";
  } catch (err) {
    if (uploadBox) uploadBox.textContent = "Upload failed: " + err.message;
    console.error("initOcclusionCanvas:", err);
  }
}

function _loadImageOnCanvas(url) {
  let img = new Image();
  img.crossOrigin = "anonymous";

  img.onload = function () {
    _ocImage = img;

    // Set up canvas
    let canvas = document.getElementById("occlusion-canvas");
    if (!canvas) return;
    _ocCanvas = canvas;
    _ocCtx    = canvas.getContext("2d");

    // Scale to fit screen width while preserving aspect ratio
    let maxW = Math.min(window.innerWidth - 40, 700);
    _ocScale  = maxW / img.naturalWidth;

    canvas.width  = Math.round(img.naturalWidth  * _ocScale);
    canvas.height = Math.round(img.naturalHeight * _ocScale);
    canvas.style.display = "block";

    // Show hint
    let hint = document.getElementById("occlusion-hint");
    if (hint) hint.style.display = "block";

    _attachCanvasEvents();
    _ocBoxes = [];
    _ocSelected = null;
    _redraw();
  };

  img.src = url;
}

// ─────────────────────────────────────────────────────────────────
// CANVAS EVENTS
// ─────────────────────────────────────────────────────────────────

function _attachCanvasEvents() {
  let c = _ocCanvas;

  // Remove any previous listeners by replacing with clone
  let newCanvas = c.cloneNode(true);
  c.parentNode.replaceChild(newCanvas, c);
  _ocCanvas = newCanvas;
  _ocCtx    = newCanvas.getContext("2d");

  // Mouse
  newCanvas.addEventListener("mousedown", _onPointerDown);
  newCanvas.addEventListener("mousemove", _onPointerMove);
  newCanvas.addEventListener("mouseup",   _onPointerUp);

  // Touch
  newCanvas.addEventListener("touchstart", e => { e.preventDefault(); _onPointerDown(_touchToMouse(e)); }, { passive: false });
  newCanvas.addEventListener("touchmove",  e => { e.preventDefault(); _onPointerMove(_touchToMouse(e)); }, { passive: false });
  newCanvas.addEventListener("touchend",   e => { e.preventDefault(); _onPointerUp();                    }, { passive: false });

  // Click on existing box → select for rename
  newCanvas.addEventListener("click", _onClick);
}

function _touchToMouse(e) {
  let touch = e.touches[0] || e.changedTouches[0];
  return { clientX: touch.clientX, clientY: touch.clientY };
}

function _canvasCoords(e) {
  let rect = _ocCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (_ocCanvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (_ocCanvas.height / rect.height),
  };
}

function _onPointerDown(e) {
  let { x, y } = _canvasCoords(e);
  // Check if clicking inside an existing box (select, not draw)
  let hit = _hitTest(x, y);
  if (hit) {
    _ocSelected = hit.id;
    _redraw();
    return;
  }
  _ocSelected = null;
  _ocDragging = true;
  _ocStartX   = x;
  _ocStartY   = y;
  _ocCurX     = x;
  _ocCurY     = y;
}

function _onPointerMove(e) {
  if (!_ocDragging) return;
  let { x, y } = _canvasCoords(e);
  _ocCurX = x;
  _ocCurY = y;
  _redraw();
}

function _onPointerUp() {
  if (!_ocDragging) return;
  _ocDragging = false;

  let w = _ocCurX - _ocStartX;
  let h = _ocCurY - _ocStartY;

  // Normalise negative drag directions
  let x = w < 0 ? _ocCurX  : _ocStartX;
  let y = h < 0 ? _ocCurY  : _ocStartY;
  w = Math.abs(w);
  h = Math.abs(h);

  // Ignore tiny accidental taps
  if (w < 10 || h < 10) { _redraw(); return; }

  let id    = Date.now().toString(36);
  let color = _OC_COLORS[_ocBoxes.length % _OC_COLORS.length];
  _ocBoxes.push({ id, x, y, w, h, label: `Label ${_ocBoxes.length + 1}`, color });
  _ocSelected = id;
  _redraw();

  // Immediately prompt for label name
  _promptLabel(id);
}

function _onClick(e) {
  // Only handle click if it wasn't a drag end
  if (_ocDragging) return;
  let { x, y } = _canvasCoords(e);
  let hit = _hitTest(x, y);
  if (hit && hit.id === _ocSelected) {
    // Second click on selected box → rename
    _promptLabel(hit.id);
  }
}

// ─────────────────────────────────────────────────────────────────
// HIT TEST
// ─────────────────────────────────────────────────────────────────

function _hitTest(x, y) {
  // Iterate in reverse so topmost (last drawn) is found first
  for (let i = _ocBoxes.length - 1; i >= 0; i--) {
    let b = _ocBoxes[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// LABEL PROMPT
// ─────────────────────────────────────────────────────────────────

function _promptLabel(boxId) {
  let box = _ocBoxes.find(b => b.id === boxId);
  if (!box) return;

  // Use a simple inline prompt overlay on the canvas
  let label = window.prompt(`Label for this box (what's hidden):`, box.label);
  if (label !== null && label.trim() !== "") {
    box.label = label.trim();
    _redraw();
  }
}

// ─────────────────────────────────────────────────────────────────
// DRAWING
// ─────────────────────────────────────────────────────────────────

function _redraw() {
  if (!_ocCtx || !_ocImage) return;
  let ctx = _ocCtx;
  let cw  = _ocCanvas.width;
  let ch  = _ocCanvas.height;

  // Clear
  ctx.clearRect(0, 0, cw, ch);

  // Draw base image
  ctx.drawImage(_ocImage, 0, 0, cw, ch);

  // Draw all boxes
  _ocBoxes.forEach(box => {
    let isSelected = box.id === _ocSelected;

    // Box fill
    ctx.fillStyle = box.color;
    ctx.fillRect(box.x, box.y, box.w, box.h);

    // Box border
    ctx.strokeStyle = isSelected ? "#fff" : "rgba(255,255,255,0.7)";
    ctx.lineWidth   = isSelected ? 2.5 : 1.5;
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    // Label text inside the box
    let fontSize = Math.max(10, Math.min(14, box.h * 0.28));
    ctx.font      = `bold ${fontSize}px -apple-system, sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor  = "rgba(0,0,0,0.7)";
    ctx.shadowBlur   = 3;
    ctx.fillText(
      box.label,
      box.x + box.w / 2,
      box.y + box.h / 2,
      box.w - 8  // max width so text is clipped not overflowing
    );
    ctx.shadowBlur = 0;
  });

  // Draw live drag rectangle
  if (_ocDragging) {
    let dw = _ocCurX - _ocStartX;
    let dh = _ocCurY - _ocStartY;
    ctx.fillStyle   = "rgba(59,130,246,0.3)";
    ctx.strokeStyle = "rgba(59,130,246,0.9)";
    ctx.lineWidth   = 2;
    ctx.fillRect(_ocStartX, _ocStartY, dw, dh);
    ctx.strokeRect(_ocStartX, _ocStartY, dw, dh);
  }
}

// ─────────────────────────────────────────────────────────────────
// DELETE / RESET
// ─────────────────────────────────────────────────────────────────

/**
 * Delete the currently selected occlusion box.
 * Exposed as global for a "Delete box" button if desired.
 */
function deleteSelectedBox() {
  if (!_ocSelected) return;
  _ocBoxes = _ocBoxes.filter(b => b.id !== _ocSelected);
  _ocSelected = null;
  _redraw();
}

/**
 * Clear all boxes and hide the canvas.
 * Called by cardCreator.js when switching away from image_occlusion type.
 */
function resetOcclusionCanvas() {
  _ocBoxes    = [];
  _ocSelected = null;
  _ocImage    = null;
  _ocImageUrl = "";
  _ocDragging = false;

  let canvas = document.getElementById("occlusion-canvas");
  if (canvas) canvas.style.display = "none";

  let hint = document.getElementById("occlusion-hint");
  if (hint) hint.style.display = "none";

  let uploadBox = document.getElementById("occlusion-upload-box");
  if (uploadBox) { uploadBox.style.display = "block"; uploadBox.textContent = "📷 Upload diagram for occlusion"; }
}

// ─────────────────────────────────────────────────────────────────
// DATA EXPORT / IMPORT
// ─────────────────────────────────────────────────────────────────

/**
 * Return current occlusion data for saving.
 * Stored as JSON in flashcard.front_text.
 * @returns {{ imageUrl: string, boxes: Array, canvasW: number, canvasH: number } | null}
 */
function getOcclusionBoxes() {
  if (!_ocImageUrl || _ocBoxes.length === 0) return null;
  return {
    imageUrl: _ocImageUrl,
    boxes:    _ocBoxes.map(b => ({ ...b })),  // shallow clone — no DOM refs
    canvasW:  _ocCanvas?.width  || 0,
    canvasH:  _ocCanvas?.height || 0,
  };
}

/**
 * Load saved occlusion data back into the canvas for editing.
 * Called by cardCreator.js loadCardForEdit() for image_occlusion cards.
 * @param {{ imageUrl: string, boxes: Array }} data
 */
function loadOcclusionData(data) {
  if (!data || !data.imageUrl) return;
  _ocBoxes   = data.boxes || [];
  _ocSelected = null;
  _loadImageOnCanvas(data.imageUrl);
}

// ─────────────────────────────────────────────────────────────────
// REVIEW RENDERING
// Paints occlusion card faces onto a <canvas> inside the review card.
// Called by flashcards.js when card_type === "image_occlusion".
// ─────────────────────────────────────────────────────────────────

/**
 * Render the FRONT face of an occlusion card:
 * diagram with all boxes masked (coloured rectangles, labels hidden).
 *
 * @param {HTMLCanvasElement} targetCanvas
 * @param {Object} occlusionData  — parsed from card.front_text JSON
 */
function renderOcclusionFront(targetCanvas, occlusionData) {
  if (!targetCanvas || !occlusionData) return;
  _renderOcclusionFrame(targetCanvas, occlusionData, false);
}

/**
 * Render the BACK face of an occlusion card:
 * diagram with all boxes visible but labels revealed.
 *
 * @param {HTMLCanvasElement} targetCanvas
 * @param {Object} occlusionData
 */
function renderOcclusionBack(targetCanvas, occlusionData) {
  if (!targetCanvas || !occlusionData) return;
  _renderOcclusionFrame(targetCanvas, occlusionData, true);
}

function _renderOcclusionFrame(targetCanvas, data, showLabels) {
  let ctx = targetCanvas.getContext("2d");

  // Scale canvas to the stored canvas dimensions
  let stored = { w: data.canvasW || 600, h: data.canvasH || 400 };
  targetCanvas.width  = stored.w;
  targetCanvas.height = stored.h;

  let img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = function () {
    ctx.drawImage(img, 0, 0, stored.w, stored.h);

    (data.boxes || []).forEach(box => {
      if (!showLabels) {
        // Front: fill box with solid colour, hide label
        ctx.fillStyle = box.color || "rgba(59,130,246,0.7)";
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(box.x, box.y, box.w, box.h);
      } else {
        // Back: semi-transparent fill, show label
        ctx.fillStyle = (box.color || "rgba(59,130,246,0.55)").replace(/[\d.]+\)$/, "0.25)");
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.strokeStyle = box.color || "rgba(59,130,246,0.9)";
        ctx.lineWidth   = 2;
        ctx.strokeRect(box.x, box.y, box.w, box.h);

        let fontSize = Math.max(10, Math.min(14, box.h * 0.28));
        ctx.font         = `bold ${fontSize}px -apple-system, sans-serif`;
        ctx.fillStyle    = "#fff";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor  = "rgba(0,0,0,0.7)";
        ctx.shadowBlur   = 3;
        ctx.fillText(box.label || "", box.x + box.w / 2, box.y + box.h / 2, box.w - 8);
        ctx.shadowBlur = 0;
      }
    });
  };
  img.src = data.imageUrl;
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────
//   initOcclusionCanvas(inputEl)          — occlusion-file-input onchange
//   deleteSelectedBox()                   — optional "Delete box" button
//   resetOcclusionCanvas()                — called by cardCreator.js
//   getOcclusionBoxes()                   — called by cardCreator.js submitCard()
//   loadOcclusionData(data)               — called by cardCreator.js loadCardForEdit()
//   renderOcclusionFront(canvas, data)    — called by flashcards.js review engine
//   renderOcclusionBack(canvas, data)     — called by flashcards.js review engine

// cloudinary.js — Shared Cloudinary image upload handler
// Medical Study OS
// -----------------------------------------------------------------
// Requires two constants in your environment / config section:
//   CLOUDINARY_CLOUD_NAME    e.g. "my-cloud"
//   CLOUDINARY_UPLOAD_PRESET e.g. "medica_unsigned"
//
// Usage:
//   const result = await uploadToCloudinary(file, 'flashcards/fronts');
//   result → { url, publicId } on success
//           → throws Error on failure
// -----------------------------------------------------------------

// ── Config (replace with your real values) ──────────────────────
const CLOUDINARY_CLOUD_NAME    = 'YOUR_CLOUD_NAME';     // ← replace
const CLOUDINARY_UPLOAD_PRESET = 'YOUR_UPLOAD_PRESET';  // ← replace

const CLOUDINARY_BASE_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// Allowed folders (keeps bucket organised)
const CLOUDINARY_FOLDERS = {
  FLASHCARD_FRONT:  'flashcards/fronts',
  FLASHCARD_BACK:   'flashcards/backs',
  OCCLUSION:        'flashcards/occlusion',
  NOTE_IMAGE:       'notes/images',
};

// ── Core upload function ─────────────────────────────────────────
/**
 * Upload a File or Blob to Cloudinary.
 *
 * @param {File|Blob} file     - The image file to upload.
 * @param {string}    folder   - Cloudinary folder path (use CLOUDINARY_FOLDERS constants).
 * @param {Function}  [onProgress] - Optional callback(percent: number).
 * @returns {Promise<{url: string, publicId: string}>}
 */
async function uploadToCloudinary(file, folder = CLOUDINARY_FOLDERS.NOTE_IMAGE, onProgress = null) {
  if (!file || !(file instanceof Blob)) {
    throw new Error('uploadToCloudinary: first argument must be a File or Blob.');
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}. Use JPEG, PNG, GIF, or WebP.`);
  }

  const MAX_SIZE_MB = 10;
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_SIZE_MB} MB.`);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', CLOUDINARY_BASE_URL);

    if (onProgress && typeof onProgress === 'function') {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        resolve({
          url:      data.secure_url,
          publicId: data.public_id,
        });
      } else {
        let message = `Cloudinary upload failed (HTTP ${xhr.status})`;
        try {
          const err = JSON.parse(xhr.responseText);
          if (err?.error?.message) message = err.error.message;
        } catch (_) {}
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error('Cloudinary upload failed: network error.'));
    xhr.send(formData);
  });
}

// ── Paste handler helper ─────────────────────────────────────────
/**
 * Extract an image File from a ClipboardEvent, if present.
 *
 * @param {ClipboardEvent} event
 * @returns {File|null}
 */
function getImageFromClipboard(event) {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}

// ── UI helper: show inline upload progress ───────────────────────
/**
 * Upload with a visible progress indicator inside a container element.
 *
 * @param {File}        file
 * @param {string}      folder
 * @param {HTMLElement} progressEl - Element where progress % is shown.
 * @returns {Promise<{url: string, publicId: string}>}
 */
async function uploadWithProgress(file, folder, progressEl) {
  if (progressEl) {
    progressEl.style.display = 'block';
    progressEl.textContent = 'Uploading… 0%';
  }
  try {
    const result = await uploadToCloudinary(file, folder, (pct) => {
      if (progressEl) progressEl.textContent = `Uploading… ${pct}%`;
    });
    if (progressEl) progressEl.textContent = 'Upload complete ✓';
    return result;
  } catch (err) {
    if (progressEl) progressEl.textContent = `Upload failed: ${err.message}`;
    throw err;
  }
}

// ── Exports (used by flashcards.js, cardCreator.js, notes.js) ────
// No ES module syntax — matches existing codebase pattern (plain globals).
// Each consuming file can access:
//   uploadToCloudinary(file, folder, onProgress?)
//   uploadWithProgress(file, folder, progressEl)
//   getImageFromClipboard(pasteEvent)
//   CLOUDINARY_FOLDERS.*

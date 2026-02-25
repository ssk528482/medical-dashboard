/* rotateScreen.js — Programmatic landscape/portrait toggle
   Works by rotating <html> 90deg and swapping viewport dimensions.
   Persists preference in localStorage. */

(function () {
  'use strict';

  var STORAGE_KEY = 'screenRotated';
  var _rotated = localStorage.getItem(STORAGE_KEY) === '1';

  function applyRotation(rotated, animate) {
    var html = document.documentElement;
    if (rotated) {
      html.classList.add('screen-rotated');
    } else {
      html.classList.remove('screen-rotated');
    }
    // Update all rotate buttons across page
    document.querySelectorAll('.rotate-screen-btn').forEach(function (btn) {
      btn.setAttribute('title', rotated ? 'Switch to Portrait' : 'Switch to Landscape');
      btn.querySelector('.rotate-screen-icon').textContent = rotated ? '\uD83D\uDCF1' : '\uD83D\uDD04';
      btn.querySelector('.rotate-screen-label').textContent = rotated ? 'Portrait' : 'Landscape';
    });
  }

  function toggleRotation() {
    _rotated = !_rotated;
    localStorage.setItem(STORAGE_KEY, _rotated ? '1' : '0');
    applyRotation(_rotated, true);
  }

  // Apply on load immediately (no flash)
  document.addEventListener('DOMContentLoaded', function () {
    applyRotation(_rotated, false);
  });
  // Also run right away in case DOMContentLoaded already fired
  if (document.readyState !== 'loading') {
    applyRotation(_rotated, false);
  }

  // ── Touch-scroll fix for rotated mode on touch devices ────────────────────
  // When html is CSS-rotated 90deg clockwise, the user's "downward swipe" in
  // visual space is a "leftward swipe" in raw screen coordinates.
  // iOS/Android deliver scroll only for vertical screen-coordinate movement,
  // so the body never scrolls. We intercept touch events and remap X-delta
  // to body.scrollTop manually.
  var _tx = 0;

  document.addEventListener('touchstart', function (e) {
    if (!_rotated) return;
    _tx = e.touches[0].clientX;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!_rotated) return;
    var dx = e.touches[0].clientX - _tx;
    _tx = e.touches[0].clientX;
    // rotate(90deg) clockwise: visual-down = screen-left (dx < 0) → scrollTop++
    document.body.scrollTop += -dx;
    e.preventDefault(); // suppress native (broken) scroll
  }, { passive: false });

  // Expose globally
  window.toggleRotation = toggleRotation;
  window.isScreenRotated = function () { return _rotated; };
})();

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
      btn.querySelector('.rotate-screen-icon').textContent = rotated ? '📱' : '🔄';
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

  // Expose globally
  window.toggleRotation = toggleRotation;
  window.isScreenRotated = function () { return _rotated; };
})();

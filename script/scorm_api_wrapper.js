/* Minimal SCORM 1.2 API wrapper (no dependencies)
   - Finds the SCORM API (window.API)
   - Wraps LMSInitialize/LMSFinish/LMSGetValue/LMSSetValue/LMSCommit
   Note: Keep this small and compatible with older LMS webviews.
*/

(function (global) {
  function findAPI(win) {
    var tries = 0;
    while (win && tries < 200) {
      if (win.API) return win.API;
      tries++;
      win = win.parent;
    }
    return null;
  }

  function scormLog() {
    // Toggle in config.js if desired
    if (global.SCORM_DEBUG) {
      try { console.log.apply(console, arguments); } catch (_) {}
    }
  }

  var api = null;
  var isInited = false;

  global.Scorm12 = {
    init: function () {
      if (isInited) return true;
      api = findAPI(global);
      if (!api) {
        scormLog('[SCORM] API not found');
        return false;
      }
      var ok = api.LMSInitialize('');
      isInited = (ok === 'true' || ok === true);
      scormLog('[SCORM] init', ok);
      return isInited;
    },
    finish: function () {
      if (!api || !isInited) return true;
      var ok = api.LMSFinish('');
      scormLog('[SCORM] finish', ok);
      return (ok === 'true' || ok === true);
    },
    get: function (key) {
      if (!api || !isInited) return '';
      try { return api.LMSGetValue(key) || ''; } catch (_) { return ''; }
    },
    set: function (key, value) {
      if (!api || !isInited) return false;
      try {
        var ok = api.LMSSetValue(key, String(value));
        scormLog('[SCORM] set', key, value, ok);
        return (ok === 'true' || ok === true);
      } catch (_) {
        return false;
      }
    },
    commit: function () {
      if (!api || !isInited) return false;
      try {
        var ok = api.LMSCommit('');
        scormLog('[SCORM] commit', ok);
        return (ok === 'true' || ok === true);
      } catch (_) {
        return false;
      }
    }
  };
})(window);


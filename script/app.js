/* ================================================
   Ocean Luxe Training — Shared App Logic
   ================================================ */

/* =================================================
   Persistence helpers (localStorage-first)
   ================================================= */
const STORAGE_KEYS = {
  theme: 'ol_training_theme_v1',
  progress: 'ol_training_progress_v1',
  notes: 'ol_training_notes_v1',
  scorm: 'ol_training_scorm_v1'
};

function storageAvailable() {
  try {
    const k = '__ol_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch (_) {
    return false;
  }
}
const HAS_STORAGE = storageAvailable();

function readJSON(key, fallback) {
  if (!HAS_STORAGE) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function writeJSON(key, value) {
  if (!HAS_STORAGE) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // ignore (quota, blocked, etc.)
  }
}

/* =================================================
   Theme toggle (persisted)
   ================================================= */
(function () {
  const toggles = document.querySelectorAll('[data-theme-toggle]');
  const root = document.documentElement;

  let currentTheme = readJSON(STORAGE_KEYS.theme, null) || root.getAttribute('data-theme') || 'dark';
  root.setAttribute('data-theme', currentTheme);

  function updateIcons(theme) {
    toggles.forEach(t => {
      t.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
      t.innerHTML = theme === 'dark'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    });
  }
  updateIcons(currentTheme);

  toggles.forEach(t => {
    t.addEventListener('click', () => {
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', currentTheme);
      writeJSON(STORAGE_KEYS.theme, currentTheme);
      updateIcons(currentTheme);
    });
  });
})();

/* =================================================
   Progress tracking (persisted)
   ================================================= */
const _progressStore = readJSON(STORAGE_KEYS.progress, {}) || {};

function getAgentIdFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('agentId');
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch (_) {
    return null;
  }
}

const LESSON_TO_MODULE_KEY = {
  1: 'intro',
  2: 'cold_calling',
  3: 'objections',
  4: 'deal_analysis',
  5: 'crm_walkthrough'
};

async function markModuleCompleteInOnboardLuxe(lessonNum) {
  const agentId = getAgentIdFromQuery();
  if (!agentId) return;

  const moduleKey = LESSON_TO_MODULE_KEY[lessonNum];
  if (!moduleKey) return;

  try {
    await fetch(`/api/agents/${agentId}/training/${moduleKey}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (_) {}
}

function getProgress() {
  return _progressStore;
}

function setProgress(partial) {
  Object.assign(_progressStore, partial);
  writeJSON(STORAGE_KEYS.progress, _progressStore);
}

function markLessonComplete(lessonNum) {
  setProgress({ ['lesson_' + lessonNum]: true });
  markModuleCompleteInOnboardLuxe(lessonNum);
  try {
    // Tell parent frames (SCORM launcher / embedded host) about completion.
    window.parent?.postMessage(
      { source: 'oceanluxe-training', type: 'lessonCompleted', lessonNumber: lessonNum },
      '*'
    );
  } catch (_) {}

  // If all lessons are complete, emit a course completion signal once.
  try {
    if (getCompletedCount() === 5) {
      const alreadySent = readJSON(STORAGE_KEYS.scorm, {}).courseCompleted === true;
      if (!alreadySent) {
        const nextState = { ...(readJSON(STORAGE_KEYS.scorm, {}) || {}), courseCompleted: true };
        writeJSON(STORAGE_KEYS.scorm, nextState);
        window.parent?.postMessage(
          {
            source: 'oceanluxe-training',
            type: 'courseCompleted',
            // We don’t compute a global score in this prototype; report 100 on completion.
            scorePercent: 100,
            passed: true
          },
          '*'
        );
      }
    }
  } catch (_) {}
}

function isLessonComplete(lessonNum) {
  return !!getProgress()['lesson_' + lessonNum];
}

function getCompletedCount() {
  let count = 0;
  for (let i = 1; i <= 5; i++) if (isLessonComplete(i)) count++;
  return count;
}

function resetProgress() {
  for (let i = 1; i <= 5; i++) delete _progressStore['lesson_' + i];
  writeJSON(STORAGE_KEYS.progress, _progressStore);
  updateNavProgress();
  updateLessonCards();
}

// Update nav progress bar
function updateNavProgress() {
  const count = getCompletedCount();
  const fill = document.getElementById('navProgressFill');
  const text = document.getElementById('navProgressText');
  if (fill) fill.style.width = (count / 5 * 100) + '%';
  if (text) text.textContent = count + ' / 5 complete';
}

// Update lesson cards on home page
function updateLessonCards() {
  document.querySelectorAll('[data-lesson]').forEach(card => {
    const num = parseInt(card.getAttribute('data-lesson'));
    if (isLessonComplete(num)) {
      card.classList.add('completed');
      const icon = card.querySelector('[data-status-icon]');
      if (icon) {
        icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
        icon.style.display = 'block';
      }
      const footer = card.querySelector('.lesson-start-text');
      if (footer) footer.textContent = 'Review lesson ✓';
    }
  });

  const banner = document.getElementById('completionBanner');
  if (banner && getCompletedCount() === 5) {
    banner.style.display = 'block';
  }
}

/* =================================================
   Practice + checklist autosave
   ================================================= */
function debounce(fn, waitMs) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), waitMs);
  };
}

function getNotesStore() {
  const obj = readJSON(STORAGE_KEYS.notes, {});
  return obj && typeof obj === 'object' ? obj : {};
}

function setNotesStore(next) {
  writeJSON(STORAGE_KEYS.notes, next);
}

function initPracticeAutosave() {
  const areas = Array.from(document.querySelectorAll('.practice-textarea'));
  if (areas.length === 0) return;

  const notes = getNotesStore();
  const pageKey = location.pathname || location.href;

  areas.forEach((ta, idx) => {
    const key = `${pageKey}::textarea::${idx}`;
    if (typeof notes[key] === 'string' && ta.value.trim() === '') {
      ta.value = notes[key];
    }
    ta.addEventListener('input', debounce(() => {
      const latest = getNotesStore();
      latest[key] = ta.value;
      setNotesStore(latest);
    }, 250));
  });
}

function initChecklistAutosave() {
  const boxes = Array.from(document.querySelectorAll('.checklist input[type="checkbox"]'));
  if (boxes.length === 0) return;

  const notes = getNotesStore();
  const pageKey = location.pathname || location.href;

  boxes.forEach((box) => {
    const key = `${pageKey}::checkbox::${box.id || box.name || 'unknown'}`;
    if (typeof notes[key] === 'boolean') box.checked = notes[key];
    box.addEventListener('change', () => {
      const latest = getNotesStore();
      latest[key] = box.checked;
      setNotesStore(latest);
    });
  });
}

function initContinueButton() {
  const btn = document.getElementById('continueBtn');
  if (!btn) return;

  // Find first incomplete lesson; if all complete, send to course home.
  let next = null;
  for (let i = 1; i <= 5; i++) {
    if (!isLessonComplete(i)) {
      next = i;
      break;
    }
  }

  if (next === null) {
    btn.textContent = 'Review Course →';
    btn.setAttribute('href', 'index.html');
    return;
  }

  btn.textContent = `Continue: Lesson ${String(next).padStart(2, '0')} →`;
  btn.setAttribute('href', `lesson-${String(next).padStart(2, '0')}.html`);
}

// Quiz engine
function initQuiz(questions, passingScore, onPass) {
  const answers = {};
  let submitted = false;

  function selectOption(qIdx, optIdx) {
    if (submitted) return;
    answers[qIdx] = optIdx;
    document.querySelectorAll(`[data-q="${qIdx}"] .quiz-option`).forEach((el, i) => {
      el.classList.toggle('selected', i === optIdx);
    });
  }

  document.querySelectorAll('.quiz-option').forEach(btn => {
    const q = parseInt(btn.closest('[data-q]').getAttribute('data-q'));
    const opt = parseInt(btn.getAttribute('data-opt'));
    btn.addEventListener('click', () => selectOption(q, opt));
  });

  const submitBtn = document.getElementById('quizSubmit');
  if (!submitBtn) return;

  submitBtn.addEventListener('click', () => {
    if (submitted) return;

    // Check all answered
    const unanswered = questions.filter((_, i) => answers[i] === undefined);
    if (unanswered.length > 0) {
      alert('Please answer all questions before submitting.');
      return;
    }

    submitted = true;
    submitBtn.disabled = true;
    let correct = 0;

    questions.forEach((q, qIdx) => {
      const userAns = answers[qIdx];
      const isCorrect = userAns === q.correct;
      if (isCorrect) correct++;

      const block = document.querySelector(`[data-q="${qIdx}"]`);
      block.querySelectorAll('.quiz-option').forEach((btn, i) => {
        btn.disabled = true;
        if (i === q.correct) btn.classList.add('correct');
        else if (i === userAns && !isCorrect) btn.classList.add('wrong');
      });

      const fb = block.querySelector('.quiz-feedback');
      if (fb) {
        fb.classList.add('visible', isCorrect ? 'correct' : 'wrong');
        fb.textContent = isCorrect ? '✓ Correct! ' + q.explanation : '✗ ' + q.explanation;
      }
    });

    const passed = correct >= passingScore;
    const scoreBox = document.getElementById('quizScoreBox');
    const scoreNum = document.getElementById('quizScoreNum');
    const scoreMsg = document.getElementById('quizScoreMsg');

    if (scoreBox) {
      scoreBox.classList.add('visible');
      if (scoreNum) {
        scoreNum.textContent = correct + ' / ' + questions.length;
        scoreNum.className = 'quiz-score-num ' + (passed ? 'quiz-pass' : 'quiz-fail');
      }
      if (scoreMsg) {
        scoreMsg.textContent = passed
          ? 'You passed! Great work — move on to the next lesson.'
          : 'Not quite — review the lesson and try again. Passing score: ' + passingScore + '/' + questions.length + '.';
      }
      scoreBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (passed && onPass) onPass();
  });
}

// Print certificate
function printCertificate() {
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Ocean Luxe — Course Certificate</title>
      <style>
        body { font-family: Georgia, serif; text-align: center; padding: 60px; background: #faf8f0; }
        .cert { max-width: 700px; margin: 0 auto; border: 3px solid #C9A84C; padding: 60px; background: white; }
        h1 { font-size: 36px; color: #C9A84C; margin-bottom: 8px; }
        h2 { font-size: 22px; font-weight: normal; margin-bottom: 40px; color: #333; }
        p { font-size: 16px; color: #555; line-height: 1.8; }
        .date { margin-top: 40px; color: #888; font-size: 14px; }
        .sig { margin-top: 60px; border-top: 1px solid #C9A84C; padding-top: 16px; color: #C9A84C; font-size: 18px; }
      </style>
    </head>
    <body>
      <div class="cert">
        <h1>Ocean Luxe Estate LLC</h1>
        <h2>Certificate of Course Completion</h2>
        <p>This certifies successful completion of the<br><strong>New Agent Onboarding eCourse</strong><br>
        covering all five core modules:<br>
        Welcome · Cold Calling · Objection Handling · Deal Analysis · CRM Walkthrough</p>
        <p class="date">Completed: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <div class="sig">Ocean Luxe Estate LLC · HR Department</div>
      </div>
    </body>
    </html>
  `);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
  updateNavProgress();
  updateLessonCards();
  initPracticeAutosave();
  initChecklistAutosave();
  initContinueButton();

  // Optional reset button (if present in the HTML)
  const resetBtn = document.getElementById('resetProgressBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const ok = confirm('Reset course progress and saved notes on this device?');
      if (!ok) return;
      if (HAS_STORAGE) {
        try {
          window.localStorage.removeItem(STORAGE_KEYS.progress);
          window.localStorage.removeItem(STORAGE_KEYS.notes);
        } catch (_) {}
      }
      // also clear in-memory copy
      for (let i = 1; i <= 5; i++) delete _progressStore['lesson_' + i];
      updateNavProgress();
      updateLessonCards();
      location.reload();
    });
  }
});

let tests = [];
let currentTest = null;
let questions = [];
let progress = { done: 0, total: 0 };
let scores = { topics: {} };

let totalPoints = 0;
let streak = 0;
let loseStreak = 0;
let firstAttempt = true;
let topicChart = null;
let _lastChartLabels = null;
let _lastChartData = null;
let testRunning = false;
let _nextFlashcardTimer = null;

// cached current username (populated on auth state changes)
window.currentUsername = null;

function isCleanUsername(name) {
  if (!name) return false;

  // ensure bannedWords is an array (try window first, then global fallback)
  const bw = Array.isArray(window.bannedWords)
    ? window.bannedWords
    : (typeof bannedWords !== 'undefined' && Array.isArray(bannedWords) ? bannedWords : []);

  if (!bw || bw.length === 0) return true; // nothing to enforce

  const lower = name.toLowerCase().trim();

  // check each banned word against whole-word matches and a stripped variant (to catch simple obfuscation)
  for (const w of bw) {
    if (!w) continue;
    const word = String(w).toLowerCase();
    const safe = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // whole word match (avoid false positives like 'badge' for 'bad')
    const re = new RegExp('\\b' + safe + '\\b', 'i');
    if (re.test(lower)) return false;
    // stripped comparison: remove non-alphanumerics to catch things like b-a-d or b@d
    const stripped = lower.replace(/[^a-z0-9]/g, '');
    const strippedWord = word.replace(/[^a-z0-9]/g, '');
    if (strippedWord && stripped.includes(strippedWord)) return false;
  }

  return true;
}

function isValidFormat(name) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(name);
}

async function isUsernameTaken(name) {
  if (!name) return true;
  try {
    // use Firestore usernames collection (document id = username)
    if (!window.db || !window.doc || !window.getDoc) return false;
    const dref = window.doc(window.db, 'usernames', name);
    const snap = await window.getDoc(dref);
    return snap.exists();
  } catch (e) {
    console.warn('isUsernameTaken error', e);
    return false;
  }
}

function showPopup(message) {
  // use existing toast if available
  try { showToast(message, 'info'); return; } catch (e) {}
  alert(message);
}

// helper to apply cached username to inputs
window.applyAuthUsername = function (username) {
  try {
    window.currentUsername = username || null;
    const lb = document.getElementById('lbName');
    if (lb) {
      if (username) {
        lb.value = username;
        lb.readOnly = true;
        lb.setAttribute('aria-readonly', 'true');
      } else {
        lb.readOnly = false;
        lb.removeAttribute('aria-readonly');
      }
    }
    const ui = document.getElementById('username');
    if (ui) {
      if (username) {
        ui.value = username;
        ui.readOnly = true;
        ui.setAttribute('aria-readonly', 'true');
      } else {
        ui.readOnly = false;
        ui.removeAttribute('aria-readonly');
      }
    }
  } catch (e) { console.warn('applyAuthUsername error', e); }
};

async function setAuthStatus(msg, showLogout = false) {
  const el = document.getElementById('authStatus');
  if (el) el.textContent = msg || '';
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = showLogout ? 'inline-block' : 'none';
}

// wire up auth UI when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const signupBtn = document.getElementById('signupBtn');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (signupBtn) signupBtn.addEventListener('click', async () => {
    const username = (document.getElementById('username') || {}).value || '';
    const password = (document.getElementById('password') || {}).value || '';
    const name = username.trim();

    if (!name || !password) return showPopup('Fill out both fields.');
    if (!isValidFormat(name)) return showPopup('Username must be 3–20 characters, letters/numbers/underscores only.');
    if (!isCleanUsername(name)) return showPopup('Username contains inappropriate words.');
    if (await isUsernameTaken(name)) return showPopup('Username is already taken.');

    const email = `${name}@fblacer.local`;
    try {
      if (!window.authCreate) throw new Error('auth create function not available');
      const userCred = await window.authCreate(email, password);
      const uid = userCred.user.uid;
      // write username -> uid mapping in a transaction to avoid races
      try {
        await window.runTransaction(window.db, async (tx) => {
          const userDoc = window.doc(window.db, 'usernames', name);
          const snap = await tx.get(userDoc);
          if (snap.exists()) throw new Error('username taken');
          tx.set(userDoc, { uid });
          const udoc = window.doc(window.db, 'users', uid);
          tx.set(udoc, { username: name, createdAt: new Date().toISOString() });
        });
      } catch (e) {
        console.warn('transaction error', e);
      }
      setAuthStatus('Account created. Logged in as ' + name, true);
  try { if (typeof window.applyAuthUsername === 'function') window.applyAuthUsername(name); } catch (e) {}
  try { localStorage.setItem('fblacer_username', name); } catch (e) {}
  showPopup('Account created!');
    } catch (err) {
      showPopup('Signup failed: ' + (err && err.message ? err.message : String(err)));
    }
  });

  if (loginBtn) loginBtn.addEventListener('click', async () => {
    const username = (document.getElementById('username') || {}).value || '';
    const password = (document.getElementById('password') || {}).value || '';
    const name = username.trim();
    if (!name || !password) return showPopup('Fill out both fields.');
    const email = `${name}@fblacer.local`;
    try {
      if (!window.authSignIn) throw new Error('auth sign-in not available');
      await window.authSignIn(email, password);
      setAuthStatus('Logged in as ' + name, true);
      try { if (typeof window.applyAuthUsername === 'function') window.applyAuthUsername(name); } catch (e) {}
      try { localStorage.setItem('fblacer_username', name); } catch (e) {}
      showPopup('Logged in!');
    } catch (err) {
      showPopup('Login failed: ' + (err && err.message ? err.message : String(err)));
    }
  });

  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    try {
      if (!window.authSignOut) throw new Error('signOut not available');
      await window.authSignOut();
      setAuthStatus('Signed out', false);
      try { if (typeof window.applyAuthUsername === 'function') window.applyAuthUsername(null); } catch (e) {}
      try { localStorage.removeItem('fblacer_username'); } catch (e) {}
      showPopup('Signed out');
    } catch (e) {
      showPopup('Sign out failed: ' + (e && e.message ? e.message : String(e)));
    }
  });
});

// observe auth state to update UI
try {
  if (window.auth) {
    window.auth.onAuthStateChanged?.(async (user) => {
      try {
        if (user) {
          // fetch username if exists
          let name = 'Anonymous';
          try {
            const udoc = window.doc(window.db, 'users', user.uid);
            const snap = await window.getDoc(udoc);
            if (snap && snap.exists()) {
              const data = snap.data(); if (data && data.username) name = data.username;
            }
          } catch (e) {}
          setAuthStatus('Signed in as ' + name, true);
          try { if (typeof window.applyAuthUsername === 'function') window.applyAuthUsername(name); } catch (e) {}
        } else {
          setAuthStatus('Not signed in', false);
          try { if (typeof window.applyAuthUsername === 'function') window.applyAuthUsername(null); } catch (e) {}
        }
      } catch (e) {}
    });
  }
} catch (e) {}


// Chart.js removed: concaveInnerShadow plugin and Chart.register removed. Using aleks-chart.js

// Settings modal + dark mode toggle + report submission
document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  // Initialize saved theme state
  const saved = localStorage.getItem('fblacer-dark');
  if (saved === '1') root.classList.add('dark');

  // Elements
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const settingsClose = document.getElementById('settingsClose');
  const darkToggle = document.getElementById('settingsDarkToggle');
  const issueText = document.getElementById('issueText');
  const issueEmail = document.getElementById('issueEmail');
  const sendIssueBtn = document.getElementById('sendIssueBtn');
  const reportStatus = document.getElementById('reportStatus');

  // Sync toggle initial state
  if (darkToggle) darkToggle.checked = root.classList.contains('dark');

  function setDarkMode(on) {
    if (on) {
      root.classList.add('dark');
      localStorage.setItem('fblacer-dark', '1');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('fblacer-dark', '0');
    }
    try { if (typeof updateChartTheme === 'function') updateChartTheme(); } catch (e) {}
  }

  // Open/close modal
  if (settingsBtn) settingsBtn.addEventListener('click', () => {
    if (settingsModal) { settingsModal.style.display = 'flex'; settingsModal.setAttribute('aria-hidden','false'); }
    // sync toggle
    if (darkToggle) darkToggle.checked = root.classList.contains('dark');
  });
  if (settingsClose) settingsClose.addEventListener('click', () => {
    if (settingsModal) { settingsModal.style.display = 'none'; settingsModal.setAttribute('aria-hidden','true'); }
  });
  // allow ESC to close
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && settingsModal && settingsModal.style.display === 'flex') { settingsModal.style.display = 'none'; settingsModal.setAttribute('aria-hidden','true'); } });

  if (darkToggle) darkToggle.addEventListener('change', (e) => {
    setDarkMode(Boolean(e.target.checked));
  });

  // Report submission
  if (sendIssueBtn) {
    sendIssueBtn.addEventListener('click', async () => {
      const msg = issueText ? issueText.value.trim() : '';
      const email = issueEmail ? issueEmail.value.trim() : '';
      if (!msg) {
        if (reportStatus) reportStatus.textContent = 'Please enter a description.';
        return;
      }
      if (reportStatus) { reportStatus.textContent = 'Sending...'; }
      try {
        if (!window.reportApi || !window.reportApi.sendIssue) throw new Error('report API not available');
        await window.reportApi.sendIssue({ message: msg, email, page: location.pathname });
        if (reportStatus) reportStatus.textContent = 'Report sent — thank you.';
        if (issueText) issueText.value = '';
        if (issueEmail) issueEmail.value = '';
        // auto-close after short delay
        setTimeout(() => { if (settingsModal) { settingsModal.style.display = 'none'; settingsModal.setAttribute('aria-hidden','true'); } }, 900);
      } catch (err) {
        const m = (err && err.message) ? err.message : String(err);
        if (reportStatus) reportStatus.textContent = 'Failed to send: ' + m;
      }
    });
  }
});

function getSegmentColors() {
  const dark = document.documentElement.classList.contains('dark');
  if (dark) {
    return ['#4cd08a','#3bb0ff','#ffd54f','#ff8a80','#b39ddb'];
  }
  return ['#4CAF50','#2196F3','#FFC107','#E91E63','#9C27B0'];
}

try {
  const root = document.documentElement;
  const classObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        setTimeout(() => {
          try { if (typeof updateChartTheme === 'function') updateChartTheme(); } catch (e) { }
        }, 0);
        break;
      }
    }
  });
  classObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
} catch (e) { }

function createTopicChart(ctxEl, labels, data) {
  // Replace Chart.js-based rendering with the ALEKS canvas renderer.
  try {
    // destroy prior chart instance if present
    try { if (topicChart && typeof topicChart.destroy === 'function') topicChart.destroy(); } catch (e) { }
    topicChart = null;

    // Prepare a scores-like object (renderAleksChart expects scores.topics structure)
    const scoresObj = { topics: {} };
    // labels[] and data[] are expected to correspond; data currently contains weighted values per topic
    for (let i = 0; i < labels.length; i++) {
      const lab = labels[i];
      // We attempt to find actual counts in the global scores.topics if available
      const src = (scores && scores.topics && scores.topics[lab]) ? scores.topics[lab] : null;
      if (src) {
        scoresObj.topics[lab] = { firstAttemptCorrect: src.firstAttemptCorrect || 0, total: src.total || 0 };
      } else {
        // Fall back: derive from provided data (data[i]) - set total equal to Math.round(data value)
        const val = Number(data[i]) || 0;
        scoresObj.topics[lab] = { firstAttemptCorrect: Math.round(val), total: Math.round(val) };
      }
    }

    // renderAleksChart is provided by aleks-chart.js and returns { update, destroy }
    if (typeof window.renderAleksChart === 'function') {
      topicChart = window.renderAleksChart(ctxEl, scoresObj);
      try { _lastChartLabels = labels.slice(); _lastChartData = data.slice(); } catch (e) { }
    } else {
      console.warn('renderAleksChart not loaded');
    }
  } catch (e) {
    console.error('createTopicChart error', e);
  }
}

function updateChartTheme() {
  try {
    const canvas = document.getElementById('topicChart');
    if (!canvas) return;

    const rootStyles = getComputedStyle(document.documentElement);
    const textColor = rootStyles.getPropertyValue('--text-color').trim() || '#102027';
    const surface = rootStyles.getPropertyValue('--surface').trim() || '#e6eef6';
    const cssShadow2 = rootStyles.getPropertyValue('--shadow-dark').trim();
    const cssRim2 = rootStyles.getPropertyValue('--shadow-light').trim();
    const isDark = document.documentElement.classList.contains('dark');
    const shadowColor = cssShadow2 || (isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.12)');
    const rimColor = cssRim2 || (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.6)');

    // Chart.js removed: simply destroy existing aleks chart instance (if any) and re-create
    try { if (topicChart && typeof topicChart.destroy === 'function') { topicChart.destroy(); topicChart = null; } } catch (e) { }

    if (_lastChartLabels && _lastChartData) {
      createTopicChart(canvas, _lastChartLabels, _lastChartData);
      try {
        const legendEl = document.getElementById('topicLegend');
        if (legendEl) {
          const rootStyles = getComputedStyle(document.documentElement);
          legendEl.style.color = rootStyles.getPropertyValue('--text-color').trim() || '#102027';
        }
      } catch (e) { }
    }
  } catch (e) {
  }
}

fetch('tests.json')
  .then(res => res.json())
  .then(data => {
    tests = data.tests || [];
    populateTestDropdown();
  });

function populateTestDropdown() {
  const dropdown = document.getElementById('testSelect');
  // add a placeholder option at the top so the custom display shows "Select test"
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select test';
  // ensure placeholder is shown initially
  placeholder.selected = true;
  dropdown.appendChild(placeholder);
  tests.forEach((test, idx) => {
    const option = document.createElement('option');
    option.value = idx;
    option.textContent = test.testName;
    dropdown.appendChild(option);
  });
  initCustomSelect();
}

function initCustomSelect(){
  const native = document.getElementById('testSelect');
  if (!native) return;
  const existing = document.getElementById('customSelect');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'customSelect';
  wrapper.className = 'custom-select-wrapper center';
  wrapper.style.display = 'inline-block';
  wrapper.style.position = 'relative';

  const display = document.createElement('button');
  display.type = 'button';
  display.className = 'custom-select-display';
  display.textContent = native.options[native.selectedIndex] ? native.options[native.selectedIndex].textContent : 'Select test';
  display.setAttribute('aria-haspopup','listbox');
  display.setAttribute('aria-expanded','false');

  const menu = document.createElement('div');
  menu.className = 'custom-select-menu';
  menu.setAttribute('role','listbox');
  menu.style.position = 'absolute';
  menu.style.top = 'calc(100% + 8px)';
  menu.style.left = '0';
  menu.style.minWidth = '220px';
  menu.style.display = 'none';
  // make menu scrollable and not grow beyond viewport
  menu.style.maxHeight = '320px';
  menu.style.overflowY = 'auto';
  menu.style.boxSizing = 'border-box';

  // add a search input at the top of the menu for filtering options
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'custom-select-search';
  search.placeholder = 'Search tests...';
  search.setAttribute('aria-label', 'Search tests');
  search.style.boxSizing = 'border-box';
  search.style.width = '100%';
  search.style.padding = '8px 10px';
  search.style.margin = '0 0 6px 0';
  search.style.border = 'none';
  search.style.borderRadius = '8px';
  search.style.fontSize = '14px';
  search.style.background = 'rgba(255,255,255,0.9)';
  search.autocomplete = 'off';
  menu.appendChild(search);

  Array.from(native.options).forEach((opt, i) =>{
    // skip placeholder option (empty value) when building the clickable menu
    if (opt.value === '') return;
    const item = document.createElement('div');
    item.className = 'custom-select-item';
    item.setAttribute('role','option');
    item.textContent = opt.textContent;
    item.dataset.value = opt.value;
    if (native.value === opt.value || native.selectedIndex === i) item.classList.add('selected');
    item.onclick = () => {
      menu.querySelectorAll('.custom-select-item').forEach(it => it.classList.remove('selected'));
      item.classList.add('selected');
      native.value = opt.value;
      native.selectedIndex = i;
      display.textContent = opt.textContent;
      menu.style.display = 'none';
      // menu was closed by selecting an item
      display.setAttribute('aria-expanded', 'false');
      native.dispatchEvent(new Event('change', { bubbles: true }));
    };
    menu.appendChild(item);
  });

  // filter function used by the search box
  function filterMenu(q) {
    const items = menu.querySelectorAll('.custom-select-item');
    const needle = (q || '').trim().toLowerCase();
    items.forEach(it => {
      const txt = it.textContent.trim().toLowerCase();
      if (!needle || txt.indexOf(needle) !== -1) it.style.display = '';
      else it.style.display = 'none';
    });
  }

  // wire up search input
  search.addEventListener('input', (e) => {
    filterMenu(e.target.value);
  });

  display.onclick = () => {
    const open = menu.style.display === 'block';
    menu.style.display = open ? 'none' : 'block';
    display.setAttribute('aria-expanded', String(!open));
  };

  display.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') { menu.style.display='none'; display.setAttribute('aria-expanded','false'); } });

  document.addEventListener('click', (e)=>{
    if (!wrapper.contains(e.target)) { menu.style.display='none'; display.setAttribute('aria-expanded','false'); }
  });

  wrapper.appendChild(display);
  wrapper.appendChild(menu);
  native.parentNode.insertBefore(wrapper, native.nextSibling);

  native.style.display = 'none';
}

function startTest() {
  const dropdown = document.getElementById('testSelect');
  const startBtn = document.getElementById('startBtn');
  const endBtn = document.getElementById('endBtn');
  const selectedIndex = dropdown.value;
  if (selectedIndex === '') return;
  const selected = tests[selectedIndex];
  if (!selected || !selected.path) return;

  fetch(selected.path)
    .then(res => res.json())
    .then(fullTest => {
      currentTest = fullTest.testName ? fullTest : (fullTest.tests && fullTest.tests[0]) || null;
      if (!currentTest) {
        return;
      }

      questions = currentTest.topics.flatMap(t =>
        t.questions.map(q => ({ ...q, topic: t.topic }))
      );
      shuffleArray(questions);

      progress = { done: 0, total: questions.length };
      scores = { topics: {} };
      totalPoints = 0;
      streak = 0;
      loseStreak = 0;
      firstAttempt = true;

      if (document.getElementById('customSelect')) document.getElementById('customSelect').style.display = 'none';
      dropdown.style.display = 'none';
      startBtn.style.display = 'none';
      endBtn.style.display = 'inline-block';

      testRunning = true;
      generateFlashcard();
    })
  .catch(err => {
  });
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function generateFlashcard() {
  const container = document.getElementById('flashcard-container');
  container.innerHTML = '';

  if (questions.length === 0) {
    endTest();
    return;
  }

  const q = questions.shift();
  // Shuffle options and track new correct answer
  const shuffledOptions = [...q.options];
  shuffleArray(shuffledOptions);

  const correctAnswer = q.correctAnswer;
  const newCorrectAnswer = shuffledOptions.find(opt => opt === correctAnswer);

  // Replace q.options and q.correctAnswer with shuffled versions
  q.options = shuffledOptions;
  q.correctAnswer = newCorrectAnswer;

  progress.done++;
  firstAttempt = true;

  const card = document.createElement('div');
  card.className = 'flashcard';

  const statsRow = document.createElement('div');
  statsRow.style.display = 'flex';
  statsRow.style.justifyContent = 'space-between';
  statsRow.style.marginBottom = '10px';

  const pointsDiv = document.createElement('div');
  pointsDiv.id = 'livePoints';
  pointsDiv.textContent = `Points: ${totalPoints}`;
  const streakDiv = document.createElement('div');
  streakDiv.id = 'liveStreak';
  streakDiv.textContent = `Streak: ${streak}`;
  const progressDiv = document.createElement('div');
  progressDiv.id = 'liveProgress';
  progressDiv.textContent = `Q: ${progress.done}/${progress.total}`;

  statsRow.append(pointsDiv, streakDiv, progressDiv);
  card.appendChild(statsRow);

  const questionDiv = document.createElement('div');
  questionDiv.className = 'question';
  questionDiv.textContent = q.question;
  questionDiv.style.userSelect = 'none';
  questionDiv.style.webkitUserSelect = 'none';
  questionDiv.style.msUserSelect = 'none';
  card.appendChild(questionDiv);

  const optionsList = document.createElement('ul');
  optionsList.className = 'options';

  const explanationDiv = document.createElement('div');
  explanationDiv.className = 'explanation';
  explanationDiv.style.display = 'none';
  explanationDiv.textContent = `Explanation: ${q.explanation}`;
  card.appendChild(explanationDiv);

  let answeredCorrectly = false;

  q.options.forEach(option => {
    const li = document.createElement('li');
    li.textContent = option;
    li.dataset.clicked = 'false';

    li.onclick = () => {
      if (answeredCorrectly) return;
      if (li.dataset.clicked === 'true') return;
      li.dataset.clicked = 'true';

      if (option === q.correctAnswer) {
        handleCorrect(q.topic);
        li.classList.add('correct');
        answeredCorrectly = true;

        Array.from(optionsList.children).forEach(opt => opt.classList.add('answered'));
        if (_nextFlashcardTimer) { clearTimeout(_nextFlashcardTimer); _nextFlashcardTimer = null; }
        _nextFlashcardTimer = setTimeout(() => {
          if (testRunning) generateFlashcard();
        }, 800);
      } else {
        li.classList.add('incorrect');
        explanationDiv.style.display = 'block';
        handleWrong(q.topic);
      }

      if (firstAttempt && option !== q.correctAnswer) firstAttempt = false;
      updateStats();
    };

    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);
}

document.addEventListener('keydown', e => {
  if (!['1','2','3','4'].includes(e.key)) return;
  const card = document.querySelector('.flashcard');
  if (!card) return;
  const options = card.querySelectorAll('.options li');
  const idx = parseInt(e.key, 10) - 1;
  if (options[idx]) options[idx].click();
});

function handleCorrect(topic) {
  if (!scores.topics) scores.topics = {};
  if (!scores.topics[topic]) 
    scores.topics[topic] = { correct:0, total:0, firstAttemptCorrect:0 };

  scores.topics[topic].total++;
  scores.topics[topic].correct++;

  if (firstAttempt) {
    scores.topics[topic].firstAttemptCorrect++;
    streak++;
    loseStreak = 0;
    const pts = Math.round(100 + 100 * streak * 0.15);
    totalPoints += pts;
    showFloatingPoints(`+${pts} pts`, true);
  } else {
    streak = 0;
    loseStreak = 0;
  }
}

function handleWrong(topic) {
  if (!scores.topics[topic]) 
    scores.topics[topic] = { correct:0, total:0, firstAttemptCorrect:0 };

  scores.topics[topic].total++;

  streak = 0;
  loseStreak++;
  const lost = Math.round(50 + 50 * loseStreak * 0.15);
  const prev = totalPoints;
  totalPoints = Math.max(0, totalPoints - lost);
  const displayLost = (prev === 0 && totalPoints === 0) ? 0 : lost;
  showFloatingPoints(`-${displayLost} pts`, false);
}

function showFloatingPoints(text, positive){
  const live = document.getElementById('livePoints');
  const container = document.getElementById('floating-container');
  const el = document.createElement('div');
  el.className = 'floating-pts ' + (positive ? 'positive' : 'negative');
  el.textContent = text;

  if (live) {
    const rect = live.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.left = (rect.right + 8) + 'px';
    el.style.top = (rect.top - 8) + 'px';
    el.style.zIndex = 1350;
    document.body.appendChild(el);
  } else if (container) {
    container.appendChild(el);
  } else {
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.top = '18px';
    el.style.transform = 'translateX(-50%)';
    el.style.zIndex = 1350;
    document.body.appendChild(el);
  }

  setTimeout(() => { el.remove(); }, 1100);
}

function updateStats() {
  document.getElementById('livePoints').textContent = `Points: ${totalPoints}`;
  document.getElementById('liveStreak').textContent = `Streak: ${streak}`;
  document.getElementById('liveProgress').textContent = `Q: ${progress.done}/${progress.total}`;
}

function endTest() {
  testRunning = false;
  if (_nextFlashcardTimer) { clearTimeout(_nextFlashcardTimer); _nextFlashcardTimer = null; }
  const container = document.getElementById('flashcard-container');
  container.innerHTML = `
    <h2>Test Complete!</h2>
    <p>You answered ${progress.done} of ${progress.total} questions.</p>
    <p><strong>Total Points: ${totalPoints}</strong></p>
  `;

  const endBtn = document.getElementById('endBtn');
  if (endBtn) endBtn.style.display = 'none';

  const chartContainer = document.getElementById('chart-container');
  chartContainer.style.display = 'block';

  const labels = Object.keys(scores.topics);

  const percentages = labels.map(topic => {
    const { firstAttemptCorrect, total } = scores.topics[topic];
    return total > 0 ? (firstAttemptCorrect / total) * 100 : 0;
  });

  const weights = labels.map(topic => scores.topics[topic].total);
  const data = percentages.map((pct, idx) => pct * weights[idx]);

  const rootStyles = getComputedStyle(document.documentElement);
  const textColor = rootStyles.getPropertyValue('--text-color').trim() || '#102027';
  const surface = rootStyles.getPropertyValue('--surface').trim() || '#e6eef6';

  createTopicChart(document.getElementById('topicChart'), labels, data);

  let newTestBtn = document.getElementById('newTestBtn');
  if (!newTestBtn) {
    newTestBtn = document.createElement('button');
    newTestBtn.id = 'newTestBtn';
    newTestBtn.textContent = 'Start New Test';
    newTestBtn.style.marginTop = '20px';
    newTestBtn.onclick = () => {
      container.innerHTML = '';
      chartContainer.style.display = 'none';
      const sel = document.getElementById('testSelect');
      const custom = document.getElementById('customSelect');
      if (custom) {
        custom.style.display = 'inline-block';
        if (sel) sel.style.display = 'none';
      } else if (sel) {
        sel.style.display = 'inline-block';
      }
      document.getElementById('startBtn').style.display = 'inline-block';
      newTestBtn.remove();
    };
    container.appendChild(newTestBtn);
  }

  let sendBtn = document.getElementById('sendLeaderboardBtn');
  if (!sendBtn) {
    sendBtn = document.createElement('button');
    sendBtn.id = 'sendLeaderboardBtn';
    sendBtn.textContent = 'Send to leaderboard';
    sendBtn.style.marginTop = '12px';
    sendBtn.onclick = () => {
      const testId = (currentTest && currentTest.testName) ? currentTest.testName : (document.getElementById('testSelect').value || 'default');
      showLeaderboardOverlay(testId);
    };
  container.appendChild(sendBtn);
  }
}

// Save score + topic breakdowns to Firestore under users/{uid}/scores and users/{uid}/topics
async function saveScoreToFirestore() {
  try {
    const uid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || null;
    if (!uid) return showPopup('You must be logged in to save your score.');
    const testId = currentTest?.testName || 'unknown';
    const timestamp = new Date().toISOString();

    // save total points under scores/{testId}
    try {
      const scoreRef = window.doc(window.db, 'users', uid, 'scores', testId);
      await window.setDoc(scoreRef, { totalPoints, timestamp });
    } catch (e) {
      console.warn('save score failed', e);
    }

    // save topics breakdown under topics/{testId}
    try {
      const topicScores = {};
      Object.keys(scores.topics || {}).forEach(topic => {
        const s = scores.topics[topic] || {};
        const firstAttemptCorrect = Number(s.firstAttemptCorrect || 0);
        const total = Number(s.total || 0);
        topicScores[topic] = { firstAttemptCorrect, total };
      });
      const topicsRef = window.doc(window.db, 'users', uid, 'topics', testId);
      await window.setDoc(topicsRef, topicScores);
    } catch (e) {
      console.warn('save topics failed', e);
    }
    showToast('Saved score to your account', 'success');
  } catch (e) {
    console.warn('saveScoreToFirestore error', e);
  }
}

let _leaderboardState = { limit: 15, lastLoaded: null };

function showLeaderboardOverlay(testId) {
  let overlay = document.getElementById('lbOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lbOverlay';
    overlay.className = 'lb-overlay';
    overlay.innerHTML = `
      <div class="lb-panel">
        <button class="lb-close" aria-label="Close">×</button>
        <h3 class="lb-title">Leaderboard</h3>
        <div class="lb-subtitle">Top scores for: <span id="lb-test-name"></span></div>
        <div class="lb-list" id="lbList" role="list"></div>
        <div class="lb-bottom">
          <div class="lb-controls">
            <button id="lbShowMore">Show more</button>
          </div>
          <div class="lb-submit">
            <input id="lbName" placeholder="Your name" maxlength="30" />
            <button id="lbSubmitBtn">Submit score</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.lb-close').addEventListener('click', closeLeaderboard);
    overlay.querySelector('#lbShowMore').addEventListener('click', async (e) => {
      _leaderboardState.limit += 15;
      await fetchAndRenderLeaderboard(testId);
    });
    overlay.querySelector('#lbSubmitBtn').addEventListener('click', async () => {
      const name = (document.getElementById('lbName') || {}).value.trim() || 'Anonymous';
      try {
        if (!window.leaderboardApi || !window.leaderboardApi.submitScore) throw new Error('Leaderboard API not available');
        if (window.leaderboardAuthReady) await window.leaderboardAuthReady;
        if (!totalPoints || Number(totalPoints) === 0) {
          showToast('Cannot submit a score of 0.', 'error');
          return;
        }
        const localKey = `fblacer_sub_${testId}||${name}||${totalPoints}`;
        if (localStorage.getItem(localKey)) {
          showToast('You can only submit the same score once.', 'info');
          const submitWrap = overlay.querySelector('.lb-submit');
          if (submitWrap) submitWrap.remove();
          return;
        }
        await window.leaderboardApi.submitScore(testId, name, totalPoints);
        // also persist to user's private record if authenticated
        try { await saveScoreToFirestore(); } catch (e) { /* ignore */ }
        await fetchAndRenderLeaderboard(testId);
        document.getElementById('lbName').value = '';
        try { localStorage.setItem(localKey, JSON.stringify({ ts: new Date().toISOString() })); } catch (e) { }
        const submitWrap2 = overlay.querySelector('.lb-submit');
        if (submitWrap2) {
          const note = document.createElement('div');
          note.className = 'lb-submitted';
          note.textContent = 'Sent successfully';
          submitWrap2.parentNode.replaceChild(note, submitWrap2);
        }
        showToast('Sent successfully', 'success');
      } catch (err) {
        const msg = (err && err.message) ? err.message : String(err);
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing')) {
          showToast('Failed to submit score: insufficient permissions.', 'error');
        } else {
          showToast('Failed to submit score: ' + msg, 'error');
        }
      }
    });
  }

  const testNameEl = document.getElementById('lb-test-name');
  if (testNameEl) testNameEl.textContent = testId;
  // Autofill lbName: prefer cached username, then localStorage; avoid Firestore reads (permissions often block client reads)
  (function () {
    try {
      const nameInput = document.getElementById('lbName');
      if (!nameInput) return;
      const cached = window.currentUsername || (localStorage.getItem && localStorage.getItem('fblacer_username')) || null;
      if (cached) {
        console.debug('Autofill: using cached/local username for lbName', cached);
        nameInput.value = cached;
        nameInput.readOnly = true;
        nameInput.setAttribute('aria-readonly', 'true');
        return;
      }
      // leave editable if no cached username
      nameInput.readOnly = false;
      nameInput.removeAttribute('aria-readonly');
    } catch (e) {
      console.warn('Autofill lbName error', e);
    }
  })();
  overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:99999;';
  const panelEl = overlay.querySelector('.lb-panel');
  if (panelEl) {
    panelEl.style.position = 'relative';
    panelEl.style.maxHeight = '86vh';
    panelEl.style.overflow = 'hidden';
    panelEl.style.width = 'min(820px,96%)';
  }
  const listEl = overlay.querySelector('#lbList');
  if (listEl) {
    listEl.style.overflow = 'auto';
    listEl.style.maxHeight = '56vh';
  }
  document.body.style.overflow = 'hidden';
  _leaderboardState.limit = 15;
  // (previously attempted Firestore fetch here — removed to avoid permission errors)
  fetchAndRenderLeaderboard(testId);
}

function closeLeaderboard() {
  const overlay = document.getElementById('lbOverlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
}

async function fetchAndRenderLeaderboard(testId) {
  const listEl = document.getElementById('lbList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="lb-loading">Loading\u0000</div>';
  try {
    if (!window.leaderboardApi || !window.leaderboardApi.fetchTopScores) throw new Error('Leaderboard API not available');
    const entries = await window.leaderboardApi.fetchTopScores(testId, _leaderboardState.limit);
    renderLeaderboardEntries(entries);
  } catch (err) {
    listEl.innerHTML = '<div class="lb-error">Failed to load leaderboard</div>';
  }
}

function renderLeaderboardEntries(entries) {
  const listEl = document.getElementById('lbList');
  if (!listEl) return;
  if (!entries || entries.length === 0) {
    listEl.innerHTML = '<div class="lb-empty">No scores yet. Be the first to submit!</div>';
    return;
  }
  listEl.innerHTML = '';
  entries.forEach((e, idx) => {
    const item = document.createElement('div');
    item.className = 'lb-item';
    let tsText = '';
    try {
      const ts = e.createdAt;
      let d = null;
      if (!ts) d = null;
      else if (typeof ts.toDate === 'function') d = ts.toDate();
      else if (ts.seconds) d = new Date(Number(ts.seconds) * 1000);
      else d = new Date(ts);
      if (d && !isNaN(d.getTime())) tsText = d.toLocaleString();
    } catch (err) { tsText = ''; }
    item.innerHTML = `<div class="lb-rank">${idx+1}</div><div class="lb-name">${escapeHtml(e.name || 'Anonymous')}<div class="lb-timestamp">${tsText}</div></div><div class="lb-points">${Number(e.points) || 0}</div>`;
    listEl.appendChild(item);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&"'<>]/g, function (c) {
    return ({
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;',
      '<': '&lt;',
      '>': '&gt;'
    })[c];
  });
}

function ensureToastContainer() {
  let wrap = document.getElementById('toastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  return wrap;
}

function showToast(message, kind = 'info', timeout = 3500) {
  const wrap = ensureToastContainer();
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || 'info');
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity 300ms'; el.style.opacity = '0'; setTimeout(() => el.remove(), 350); }, timeout);
}

async function submitScore(name, test, score) {
  try {
    if (!name || !test || typeof score !== 'number') {
      return;
    }
    const docId = `${name}-${test}`.replace(/\s+/g, '_');
    if (!window.leaderboardApi || !window.leaderboardApi.setScoreDoc) throw new Error('leaderboardApi.setScoreDoc not available');
    await window.leaderboardAuthReady;
    if (!score || Number(score) === 0) {
      return;
    }
    const localKey = `fblacer_sub_${test}||${name}||${score}`;
    if (localStorage.getItem(localKey)) {
      return;
    }
    const createdAt = new Date().toISOString();
    await window.leaderboardApi.setScoreDoc(test, docId, { name, test, points: score, createdAt });
  try { localStorage.setItem(localKey, JSON.stringify({ ts: createdAt })); } catch (e) { }
  } catch (err) {
  }
}



(function () {
  'use strict';

  // Default color palette (used cyclically)
  const DEFAULT_COLORS = [
    '#4CAF50', // green
    '#2196F3', // blue
    '#FFC107', // amber
    '#E91E63', // pink
    '#9C27B0', // purple
    '#FF7043', // orange-ish
    '#26A69A', // teal
    '#7E57C2', // deep purple
  ];

  function readCSSVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name);
      if (!v) return fallback;
      return v.trim() || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function createTooltipElement(surface, textColor) {
    const tip = document.createElement('div');
    tip.id = 'aleksTooltip';
    tip.style.position = 'fixed';
    tip.style.pointerEvents = 'none';
    tip.style.padding = '8px 10px';
    tip.style.borderRadius = '6px';
    tip.style.background = surface;
    tip.style.color = textColor;
    tip.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
    tip.style.fontSize = '13px';
    tip.style.zIndex = 2147483647; // very high
    tip.style.display = 'none';
    tip.style.maxWidth = '320px';
    tip.style.whiteSpace = 'nowrap';
    return tip;
  }

  // Brighten a hex color by a factor (0..1) - simple approach
  function brightenHex(hex, amt) {
    // hex like #rrggbb
    try {
      const c = hex.replace('#', '');
      const num = parseInt(c, 16);
      let r = (num >> 16) + Math.round(255 * amt);
      let g = ((num >> 8) & 0x00ff) + Math.round(255 * amt);
      let b = (num & 0x0000ff) + Math.round(255 * amt);
      r = Math.min(255, Math.max(0, r));
      g = Math.min(255, Math.max(0, g));
      b = Math.min(255, Math.max(0, b));
      const out = '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
      return out;
    } catch (e) {
      return hex;
    }
  }

  // Main render function factory
  function renderAleksChart(canvasOrId, scores) {
    // Resolve canvas element
    let canvas;
    if (typeof canvasOrId === 'string') canvas = document.getElementById(canvasOrId);
    else canvas = canvasOrId;
    if (!canvas || canvas.tagName !== 'CANVAS') {
      throw new Error('renderAleksChart requires a canvas element or canvas id');
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');

    // Read theme colors
    const textColor = readCSSVar('--text-color', '#102027');
    const surface = readCSSVar('--surface', '#ffffff');

    // Tooltip
    let tooltip = document.getElementById('aleksTooltip');
    if (!tooltip) {
      tooltip = createTooltipElement(surface, textColor);
      document.body.appendChild(tooltip);
    }

    // Chart state
    let entries = []; // {label, correct, total, value}
    let totalValue = 0;
    let colors = DEFAULT_COLORS.slice();

    // Event handlers references for cleanup
    const handlers = { move: null, leave: null, resize: null };

    // compute entries from scores.topics
    function computeEntries(scoresObj) {
      const topics = (scoresObj && scoresObj.topics) ? scoresObj.topics : {};
      const out = [];
      for (const label of Object.keys(topics)) {
        const t = topics[label] || { firstAttemptCorrect: 0, total: 0 };
        const first = Number(t.firstAttemptCorrect) || 0;
        const tot = Number(t.total) || 0;
        // sliceValue as requested: (firstAttemptCorrect / total) * total
        // which simplifies to firstAttemptCorrect mathematically; implement the formula exactly
        const ratio = tot > 0 ? (first / tot) : 0;
        const value = ratio * tot; // equals 'first' when tot>0
        out.push({ label, correct: first, total: tot, value });
      }
      return out;
    }

    // Resize canvas to its displayed size and DPR
    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(240, Math.round(rect.width));
      const cssH = Math.max(240, Math.round(rect.height));
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Draw the doughnut with radial slices
    function draw(highlightIndex = -1) {
      resizeCanvas();
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;

      // Visual parameters - radial sectors (no inner hole)
      const baseRadius = Math.min(w, h) * 0.18; // minimal inner radius from center
      const maxOuterRadius = Math.min(w, h) * 0.48; // farthest a sector can reach

      // Clear
      ctx.clearRect(0, 0, w, h);

      // Background surface (subtle center circle)
      ctx.save();
      ctx.fillStyle = readCSSVar('--surface', '#ffffff');
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // if no data, draw faint circle
      if (!entries.length || totalValue <= 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.lineWidth = Math.max(8, baseRadius * 0.2);
        ctx.beginPath();
        ctx.arc(cx, cy, (baseRadius + maxOuterRadius) / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
      }

      // Draw sectors: each slice's outer radius grows with correctness
      let angle = -Math.PI / 2; // start at top
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const sliceAngle = (e.value / totalValue) * Math.PI * 2;
        const start = angle;
        const end = angle + sliceAngle;

        // correctness ratio 0..1
        const corrRatio = e.total > 0 ? (e.correct / e.total) : 0;
        // compute outer radius for this sector
        const targetOuter = baseRadius + (maxOuterRadius - baseRadius) * corrRatio;

        // hover emphasis increases outer radius slightly
        const isHover = (i === highlightIndex);
        const hoverExtra = isHover ? Math.min(12, (maxOuterRadius - baseRadius) * 0.08) : 0;
        const outerR = targetOuter + hoverExtra;

        // Draw filled sector from center to outerR over angle [start,end]
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, outerR, start, end);
        ctx.closePath();

        let fillColor = colors[i % colors.length];
        if (isHover) fillColor = brightenHex(fillColor, 0.18);
        ctx.fillStyle = fillColor;
        ctx.fill();

        // carve out the inner circle to make it a ring segment
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, baseRadius, end, start, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // stroke outer edge for separation
        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, start, end);
        ctx.stroke();

        angle = end;
      }

      // Center label (optional) - show total questions
      ctx.save();
      ctx.fillStyle = readCSSVar('--text-color', '#102027');
  ctx.font = `600 ${Math.max(14, baseRadius * 0.18)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Display total correct / total across topics
      const totalCorrect = entries.reduce((s, e) => s + (e.correct || 0), 0);
      const totalQuestions = entries.reduce((s, e) => s + (e.total || 0), 0);
      ctx.fillText(`${totalCorrect}/${totalQuestions}`, cx, cy);
      ctx.restore();

      // Render legend (small list) in the container's sibling or absolute overlay
      // We'll populate a legend if there's an element with id topicLegend
      try {
        const legendEl = document.getElementById('topicLegend');
        if (legendEl) {
          legendEl.innerHTML = '';
          entries.forEach((e, idx) => {
            const item = document.createElement('div');
            item.className = 'item';
            const sw = document.createElement('span');
            sw.className = 'swatch';
            sw.style.background = colors[idx % colors.length];
            sw.style.display = 'inline-block';
            sw.style.width = '14px';
            sw.style.height = '14px';
            sw.style.borderRadius = '3px';
            sw.style.marginRight = '8px';
            item.appendChild(sw);
            const txt = document.createElement('span');
            txt.textContent = `${e.label} — ${e.correct}/${e.total}`;
            item.appendChild(txt);
            legendEl.appendChild(item);
          });
          legendEl.style.color = readCSSVar('--text-color', '#102027');
        }
      } catch (e) {
        // ignore
      }
    }

    // Detect hovered slice by mouse position
    function handleMouseMove(ev) {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const baseRadius = Math.min(rect.width, rect.height) * 0.18;
      const maxOuterRadius = Math.min(rect.width, rect.height) * 0.48;

      if (dist < baseRadius || dist > maxOuterRadius) {
        // not over a slice
        tooltip.style.display = 'none';
        draw(-1);
        return;
      }

      // compute angle normalized from -PI/2 start
      let ang = Math.atan2(dy, dx);
      // normalize range 0..2PI with top being -PI/2
      // shift so 0 at top
      ang += Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;

      // find slice index by cumulative angles
      let a = 0;
      let found = -1;
      for (let i = 0; i < entries.length; i++) {
        const portion = entries[i].value / totalValue;
        const start = a;
        const end = a + portion;
        if (ang >= start * Math.PI * 2 && ang <= end * Math.PI * 2) {
          found = i;
          break;
        }
        a = end;
      }

      if (found === -1) {
        tooltip.style.display = 'none';
        draw(-1);
        return;
      }

      // show tooltip near mouse; content: Topic: label\n12 / 15 correct (80%)
      const e = entries[found];
      const pct = e.total > 0 ? Math.round((e.correct / e.total) * 100) : 0;
      tooltip.textContent = `${e.label}\n${e.correct} / ${e.total} correct (${pct}%)`;
      // position near mouse, avoid going off-screen
      const left = Math.min(window.innerWidth - 8 - tooltip.offsetWidth, ev.clientX + 12);
      const top = Math.min(window.innerHeight - 8 - tooltip.offsetHeight, ev.clientY + 12);
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
      tooltip.style.display = 'block';

      // redraw with highlight
      draw(found);
    }

    function handleMouseLeave() {
      tooltip.style.display = 'none';
      draw(-1);
    }

    function attachHandlers() {
      handlers.move = handleMouseMove;
      handlers.leave = handleMouseLeave;
      canvas.addEventListener('mousemove', handlers.move);
      canvas.addEventListener('mouseleave', handlers.leave);
      // observe resize to redraw
      handlers.resize = () => draw(-1);
      window.addEventListener('resize', handlers.resize);
    }

    function detachHandlers() {
      if (handlers.move) canvas.removeEventListener('mousemove', handlers.move);
      if (handlers.leave) canvas.removeEventListener('mouseleave', handlers.leave);
      if (handlers.resize) window.removeEventListener('resize', handlers.resize);
    }

    // Public API: update, destroy
    function update(newScores) {
      scores = newScores;
      entries = computeEntries(scores);
      totalValue = entries.reduce((s, e) => s + (e.value || 0), 0);
      // if totalValue is 0 but some topics exist, assign equal tiny weights to render slices
      if (totalValue === 0 && entries.length > 0) {
        entries.forEach(e => e.value = 1);
        totalValue = entries.length;
      }
      draw(-1);
    }

    function destroy() {
      detachHandlers();
      try { if (tooltip && tooltip.parentNode) tooltip.parentNode.removeChild(tooltip); } catch (e) { }
      // clear canvas
      try { const r = canvas.getBoundingClientRect(); ctx.clearRect(0,0,r.width,r.height); } catch (e) { }
    }

    // initialization
    colors = DEFAULT_COLORS.slice();
    entries = computeEntries(scores || {});
    totalValue = entries.reduce((s, e) => s + (e.value || 0), 0);
    if (totalValue === 0 && entries.length > 0) { entries.forEach(e => e.value = 1); totalValue = entries.length; }
    attachHandlers();
    draw(-1);

    return { update, destroy, el: canvas };
  }

  // expose globally
  window.renderAleksChart = renderAleksChart;
})();

window.submitScore = submitScore;

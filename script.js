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
let _endedEarly = false;

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

  // Ensure UI reflects persisted auth state after Firebase restores session on refresh.
  // We wait for the leaderboardAuthReady promise (resolved by index.html when auth is ready)
  // then update the visible auth controls using setAuthStatus and applyAuthUsername.
  try {
    (async function restoreAuthUi() {
      try {
        // immediate UI update from cached localStorage to avoid flash
        try {
          const cachedName = localStorage.getItem && localStorage.getItem('fblacer_username');
          const cachedUid = localStorage.getItem && localStorage.getItem('fblacer_uid');
          if (cachedName && cachedUid) {
            // ensure DOM is ready so setAuthStatus can find and toggle elements
            if (document.readyState === 'loading') {
              await new Promise((res) => document.addEventListener('DOMContentLoaded', res, { once: true }));
            }
            try { setAuthStatus('Signed in as ' + cachedName, true); } catch (e) {}
            try { if (typeof window.applyAuthUsername === 'function') window.applyAuthUsername(cachedName); } catch (e) {}
          }
        } catch (e) {}

        // then reconcile with real auth state when Firebase restores
        if (window.leaderboardAuthReady) await window.leaderboardAuthReady;
        if (document.readyState === 'loading') {
          await new Promise((res) => document.addEventListener('DOMContentLoaded', res, { once: true }));
        }
        const user = (window.auth && window.auth.currentUser) ? window.auth.currentUser : null;
        if (user) {
          // attempt to read username from users/{uid} if possible (overwrite cached if available)
          let name = localStorage.getItem && localStorage.getItem('fblacer_username') || 'Anonymous';
          try {
            if (window.doc && window.getDoc && window.db) {
              const ud = window.doc(window.db, 'users', user.uid);
              const s = await window.getDoc(ud);
              if (s && s.exists()) {
                const d = s.data(); if (d && d.username) name = d.username;
              }
            }
          } catch (e) { /* ignore */ }
          try { setAuthStatus('Signed in as ' + name, true); } catch (e) {}
          try { if (typeof window.applyAuthUsername === 'function') window.applyAuthUsername(name); } catch (e) {}
        } else {
          try { setAuthStatus('Not signed in', false); } catch (e) {}
          try { if (typeof window.applyAuthUsername === 'function') window.applyAuthUsername(null); } catch (e) {}
        }
      } catch (e) {}
    })();
  } catch (e) {}
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
  // Show/hide auth inputs and buttons depending on sign-in state
  try {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const signupBtn = document.getElementById('signupBtn');
    const loginBtn = document.getElementById('loginBtn');
    if (showLogout) {
      // signed in: hide login form and signup/login buttons
      if (usernameInput) usernameInput.style.display = 'none';
      if (passwordInput) passwordInput.style.display = 'none';
      if (signupBtn) signupBtn.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'none';
    } else {
      // signed out: show login/signup inputs and buttons, hide logout (handled above)
      if (usernameInput) usernameInput.style.display = '';
      if (passwordInput) passwordInput.style.display = '';
      if (signupBtn) signupBtn.style.display = '';
      if (loginBtn) loginBtn.style.display = '';
    }
  } catch (e) { console.warn('setAuthStatus UI toggle error', e); }
}

// Refresh auth UI based on current Firebase/auth or cached localStorage values.
// This is async because it may optionally read the username from Firestore.
async function refreshAuthUi() {
  try {
    // prefer cached username for immediate display
    let name = null;
    try { name = localStorage.getItem && localStorage.getItem('fblacer_username'); } catch (e) { name = null; }

    const user = (window.auth && window.auth.currentUser) ? window.auth.currentUser : null;
    if (user) {
      // if no cached name, try Firestore
      if (!name) {
        try {
          if (window.doc && window.getDoc && window.db) {
            const ud = window.doc(window.db, 'users', user.uid);
            const s = await window.getDoc(ud);
            if (s && s.exists()) {
              const d = s.data(); if (d && d.username) name = d.username;
            }
          }
        } catch (e) { /* ignore */ }
      }
      if (document.readyState === 'loading') {
        await new Promise((res) => document.addEventListener('DOMContentLoaded', res, { once: true }));
      }
      try { setAuthStatus('Signed in as ' + (name || 'Anonymous'), true); } catch (e) {}
      try { if (typeof window.applyAuthUsername === 'function') window.applyAuthUsername(name || null); } catch (e) {}
    } else {
      if (document.readyState === 'loading') {
        await new Promise((res) => document.addEventListener('DOMContentLoaded', res, { once: true }));
      }
      try { setAuthStatus('Not signed in', false); } catch (e) {}
      try { if (typeof window.applyAuthUsername === 'function') window.applyAuthUsername(null); } catch (e) {}
    }
  } catch (e) { console.warn('refreshAuthUi error', e); }
}

// Centralized logging for sensitive actions. Writes to Firestore `logs` collection when
// Firestore helpers are present, otherwise falls back to console.debug. Payload includes
// action name, provided context, UID (if available), and an ISO timestamp.
async function writeLog(action, context) {
  try {
    // If the platform provided a writeLog helper (index.html), prefer it
    if (typeof window.writeLog === 'function') {
      try { return await window.writeLog(action, context); } catch (e) { console.warn('window.writeLog failed', e); }
    }
    const uid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || null;
    const timestamp = new Date().toISOString();
    const payload = { action: String(action), context: context || {}, uid, timestamp };

    // Prefer setDoc with a generated id if Firestore helpers are available
    if (window.db && window.doc && window.setDoc) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
      try {
        const ref = window.doc(window.db, 'logs', id);
        await window.setDoc(ref, payload);
        return true;
      } catch (e) {
        // If setDoc fails, fall through to console debug
        console.warn('writeLog:setDoc failed', e);
      }
    }

    // Fallback: no console debug in production build
    return false;
  } catch (err) {
    try { console.warn('writeLog error', err); } catch (e) {}
    return false;
  }
}

// Resolve a clicked leaderboard name to a profile UID.
// Strategy:
// 1) Check in-memory cache (window.profileCache)
// 2) Try usernames/{username} document
// 3) If name looks like a UID, try users/{uid} document
// 4) Query users/accounts where username == clickedName (best-effort)
// 5) Log failures via writeLog and return null
async function resolveProfileUid(clickedName) {
  try {
    if (!clickedName) return null;
    window.profileCache = window.profileCache || {};
    if (window.profileCache[clickedName]) return window.profileCache[clickedName];

    // Helper to cache and return
    const cacheAndReturn = (uid) => {
      try { if (uid) window.profileCache[clickedName] = uid; } catch (e) {}
      return uid || null;
    };

    // 1) usernames/{username} document
    try {
      if (window.doc && window.getDoc && window.db) {
        const uref = window.doc(window.db, 'usernames', clickedName);
        const snap = await window.getDoc(uref);
        if (snap && snap.exists && snap.exists()) {
          const d = snap.data();
          if (d && d.uid) return cacheAndReturn(d.uid);
        }
      }
    } catch (err) {
      console.warn('resolveProfileUid: username doc lookup failed', err);
    }

    // 2) If clickedName looks like an auth UID, try users/{uid}
    try {
      const maybeUid = String(clickedName).trim();
      // simple heuristic: uid-like strings are alphanumeric with -/_ and length >= 12
      if (/^[A-Za-z0-9_-]{12,64}$/.test(maybeUid)) {
        if (window.doc && window.getDoc && window.db) {
          const udoc = window.doc(window.db, 'users', maybeUid);
          const usnap = await window.getDoc(udoc);
          if (usnap && usnap.exists && usnap.exists()) {
            return cacheAndReturn(maybeUid);
          }
        }
      }
    } catch (err) {
      console.warn('resolveProfileUid: UID fallback lookup failed', err);
    }

    // 3) Best-effort: query users collection for username field
    try {
      if (window.getDocs && window.collection && window.query && window.where && window.db) {
        const usersCol = window.collection(window.db, 'users');
        const q = window.query(usersCol, window.where('username', '==', clickedName));
        const qr = await window.getDocs(q);
        if (qr && typeof qr.forEach === 'function') {
          let found = null;
          qr.forEach(docSnap => { if (docSnap && docSnap.exists && docSnap.exists()) { found = docSnap; } });
          if (found) return cacheAndReturn(found.id);
        }
      }
    } catch (err) {
      console.warn('resolveProfileUid: users query failed', err);
    }

    // 4) Best-effort: query accounts collection by username
    try {
      if (window.getDocs && window.collection && window.query && window.where && window.db) {
        const col = window.collection(window.db, 'accounts');
        const q2 = window.query(col, window.where('username', '==', clickedName));
        const qr2 = await window.getDocs(q2);
        if (qr2 && typeof qr2.forEach === 'function') {
          let found2 = null;
          qr2.forEach(docSnap => { if (docSnap && docSnap.exists && docSnap.exists()) { found2 = docSnap; } });
          if (found2) {
            const data = found2.data();
            if (data && data.uid) return cacheAndReturn(data.uid);
            // if account doc id is the uid, return it
            return cacheAndReturn(found2.id);
          }
        }
      }
    } catch (err) {
      console.warn('resolveProfileUid: accounts query failed', err);
    }

    // Nothing found — log and return null
    try { writeLog('resolveProfileUid_failed', { clickedName }); } catch (e) {}
    return null;
  } catch (err) {
    try { writeLog('resolveProfileUid_error', { clickedName, message: (err && err.message) ? err.message : String(err) }); } catch (e) {}
    console.warn('resolveProfileUid fatal', err);
    return null;
  }
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
  try { if (uid) localStorage.setItem('fblacer_uid', uid); } catch (e) {}
  showPopup('Account created!');
      // Log signup event
      try { writeLog('signup', { username: name, uid }); } catch (e) { console.warn('signup log failed', e); }
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
      try { if (window.auth && window.auth.currentUser && window.auth.currentUser.uid) localStorage.setItem('fblacer_uid', window.auth.currentUser.uid); } catch (e) {}
      // Ensure usernames/{username} -> uid mapping exists so leaderboard lookups work
      try {
        const uid = window.auth && window.auth.currentUser && window.auth.currentUser.uid;
        const usernameKey = name || (localStorage.getItem && localStorage.getItem('fblacer_username')) || null;
        if (uid && usernameKey && window.doc && window.setDoc && window.db) {
          try { await window.setDoc(window.doc(window.db, 'usernames', usernameKey), { uid }); } catch (e) { console.warn('ensure username mapping failed', e); }
        }
      } catch (e) { console.warn('ensure username mapping wrapper failed', e); }
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
  try { localStorage.removeItem('fblacer_uid'); } catch (e) {}
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
  const viewProfileBtn = document.getElementById('viewProfileBtn');

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
    try {
      // fast path: immediately show cached username or current auth user to avoid modal showing signed-out
      const cachedName = (localStorage.getItem && localStorage.getItem('fblacer_username')) || null;
      const cachedUid = (localStorage.getItem && localStorage.getItem('fblacer_uid')) || null;
      const user = (window.auth && window.auth.currentUser) ? window.auth.currentUser : null;
      console.debug('settings open: cachedName, cachedUid, auth.currentUser:', cachedName, cachedUid, user && user.uid);
      if (cachedName || user) {
        const displayName = cachedName || (user ? 'Anonymous' : '');
        try { setAuthStatus('Signed in as ' + displayName, true); } catch (e) {}
        try { if (typeof window.applyAuthUsername === 'function') window.applyAuthUsername(cachedName || null); } catch (e) {}
      }
    } catch (e) { console.warn('settings fast path error', e); }
    try { refreshAuthUi(); } catch (e) { console.warn('refreshAuthUi failed', e); }
    // sync toggle
    if (darkToggle) darkToggle.checked = root.classList.contains('dark');
  });

  if (viewProfileBtn) viewProfileBtn.addEventListener('click', async () => {
    // open profile for current user if known, otherwise prompt for username
    const uid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || (localStorage.getItem && localStorage.getItem('fblacer_uid')) || null;
    if (uid) {
      showProfileOverlay(uid);
    } else {
      const who = prompt('Enter username to view public profile:');
      if (who) {
        // try to resolve username -> uid via usernames collection
        try {
          if (window.doc && window.getDoc && window.db) {
            const uref = window.doc(window.db, 'usernames', who);
            const s = await window.getDoc(uref);
            if (s && s.exists()) {
              const d = s.data(); if (d && d.uid) showProfileOverlay(d.uid);
              else alert('Profile not found');
            } else alert('Profile not found');
          }
        } catch (e) { alert('Profile lookup failed'); }
      }
    }
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
        // Log report submission
        try { writeLog('report', { message: msg.slice(0,500), email, page: location.pathname }); } catch (e) { console.warn('report log failed', e); }
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
      _endedEarly = false;

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
  // mark complete; if user clicked the 'End Test Now' button we set _endedEarly earlier
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

  // Award mastery achievement if fully completed and >=90%
  try {
    const uid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || localStorage.getItem && localStorage.getItem('fblacer_uid') || null;
    const completed = (progress.done === progress.total);
  const overallPct = (progress.total > 0) ? (Object.keys(scores.topics).reduce((s, t) => s + (scores.topics[t].correct || 0), 0) / progress.total) * 100 : 0;
    if (uid && completed && !(_endedEarly) && overallPct >= 90) {
      const testId = (currentTest && currentTest.testName) ? currentTest.testName : (document.getElementById('testSelect').value || 'default');
      grantAchievement(uid, `mastered ${testId}`);
    }
  } catch (e) { console.warn('mastery check failed', e); }
}

// Called when user clicks "End Test Now" to mark the test as ended early
function endEarly() {
  try { _endedEarly = true; } catch (e) {}
  try { endTest(); } catch (e) {}
}

// Save score + topic breakdowns to Firestore under users/{uid}/scores and users/{uid}/topics
async function saveScoreToFirestore() {
  try {
    const uid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || null;
    if (!uid) return showPopup('You must be logged in to save your score.');
    const testId = currentTest?.testName || 'unknown';
    const timestamp = new Date().toISOString();

    // topicScores needs to be available for the later accounts mirror block
    let topicScores = {};

    // save total points under scores/{testId}
    try {
      const scoreRef = window.doc(window.db, 'users', uid, 'scores', testId);
  await window.setDoc(scoreRef, { totalPoints, timestamp });
  // Log score save
  try { writeLog('save_score', { testId, totalPoints }); } catch (e) { console.warn('save_score log failed', e); }
    } catch (e) {
      console.warn('save score failed', e);
    }

    // save topics breakdown under topics/{testId}
    try {
      topicScores = {};
      Object.keys(scores.topics || {}).forEach(topic => {
        const s = scores.topics[topic] || {};
        const firstAttemptCorrect = Number(s.firstAttemptCorrect || 0);
        const total = Number(s.total || 0);
        topicScores[topic] = { firstAttemptCorrect, total };
      });
      const topicsRef = window.doc(window.db, 'users', uid, 'topics', testId);
  await window.setDoc(topicsRef, topicScores);
  // Log topics save
  try { writeLog('save_topics', { testId, topicCount: Object.keys(topicScores).length }); } catch (e) { console.warn('save_topics log failed', e); }
    } catch (e) {
      console.warn('save topics failed', e);
    }
    // Mirror aggregated data into accounts/{uid}
    try {
      const accountsRef = window.doc(window.db, 'accounts', uid);
      // prefer cached username if available (set on login/signup)
      let cachedName = null;
      try { cachedName = localStorage.getItem && localStorage.getItem('fblacer_username'); } catch (e) { cachedName = null; }
      // ensure usernames mapping exists (best-effort)
      try {
        const mapName = cachedName || 'Anonymous';
        if (mapName && window.doc && window.setDoc && window.db && uid) {
          try { await window.setDoc(window.doc(window.db, 'usernames', mapName), { uid }); } catch (e) { console.warn('username mapping write failed', e); }
        }
      } catch (e) { console.warn('username mapping block failed', e); }
      const accountPayload = {
        lastUpdated: timestamp,
        username: cachedName || undefined,
        tests: { [testId]: { totalPoints, timestamp } },
        topics: { [testId]: topicScores }
      };
      if (window.runTransaction) {
        try {
          await window.runTransaction(window.db, async (tx) => {
            const snap = await tx.get(accountsRef);
            let base = {};
            if (snap && snap.exists && snap.exists()) {
              try { base = snap.data() || {}; } catch (e) { base = {}; }
            }
            // merge nested maps for tests and topics
            const merged = Object.assign({}, base, {
              lastUpdated: timestamp,
              username: accountPayload.username || base.username,
              tests: Object.assign({}, base.tests || {}, accountPayload.tests),
              topics: Object.assign({}, base.topics || {}, accountPayload.topics)
            });
            tx.set(accountsRef, merged);
          });
        } catch (e) {
          // fallback to setDoc
          try { await window.setDoc(accountsRef, accountPayload, { merge: true }); } catch (err) { console.warn('accounts write failed', err); }
        }
      } else {
        try { await window.setDoc(accountsRef, accountPayload, { merge: true }); } catch (e) { console.warn('accounts write failed', e); }
      }
      try { writeLog('mirror_accounts', { testId, totalPoints, topicCount: Object.keys(topicScores).length }); } catch (e) { console.warn('mirror_accounts log failed', e); }
    } catch (e) {
      console.warn('mirror accounts error', e);
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
      const nameInput = document.getElementById('lbName');
      const name = (nameInput || {}).value ? (nameInput.value.trim()) : '';
      // Disallow empty names in leaderboard submissions
      if (!name) {
        showToast('Please enter your name to submit a score.', 'error');
        try { if (nameInput) { nameInput.focus(); } } catch (e) {}
        return;
      }
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
  // Log leaderboard submit
  try { writeLog('leaderboard_submit', { testId, name, points: totalPoints }); } catch (e) { console.warn('leaderboard_submit log failed', e); }
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
    // Ensure anonymous auth (used to satisfy Firestore rules) is ready before fetching
    if (window.leaderboardAuthReady) {
      try { await window.leaderboardAuthReady; } catch (e) { /* ignore */ }
    }
    if (!window.leaderboardApi || !window.leaderboardApi.fetchTopScores) throw new Error('Leaderboard API not available');
    const entries = await window.leaderboardApi.fetchTopScores(testId, _leaderboardState.limit);
    console.debug('fetchAndRenderLeaderboard: fetched', entries && entries.length, 'entries for', testId);
    renderLeaderboardEntries(entries || []);
    // If no entries returned, offer a developer debug action to run an extended fetch
    if ((!entries || entries.length === 0) && document.getElementById('lbOverlay')) {
      try {
        const listEl2 = document.getElementById('lbList');
        if (listEl2) {
          const debugWrapId = 'lb-debug-wrap';
          let debugWrap = document.getElementById(debugWrapId);
          if (!debugWrap) {
            debugWrap = document.createElement('div');
            debugWrap.id = debugWrapId;
            debugWrap.style.marginTop = '8px';
            debugWrap.style.fontSize = '12px';
            debugWrap.style.color = 'var(--muted,#666)';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Run debug fetch (show raw results)';
            btn.onclick = async () => {
              const res = await fetchLeaderboardDebug(testId);
              let out = '';
              try { out = JSON.stringify(res, null, 2); } catch (e) { out = String(res); }
              const pre = document.createElement('pre');
              pre.style.maxHeight = '240px';
              pre.style.overflow = 'auto';
              pre.style.background = 'rgba(0,0,0,0.03)';
              pre.style.padding = '8px';
              pre.textContent = out;
              debugWrap.appendChild(pre);
              btn.disabled = true;
            };
            debugWrap.appendChild(btn);
            listEl2.parentNode.insertBefore(debugWrap, listEl2.nextSibling);
          }
        }
      } catch (e) { console.warn('failed to add leaderboard debug UI', e); }
    }
  } catch (err) {
    console.warn('fetchAndRenderLeaderboard error', err);
    const msg = (err && err.message) ? err.message : String(err);
    // If permission-like error, give a hint that anonymous auth or rules may be blocking reads
    if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing')) {
      listEl.innerHTML = '<div class="lb-error">Failed to load leaderboard: insufficient permissions.</div>';
    } else {
      listEl.innerHTML = '<div class="lb-error">Failed to load leaderboard: ' + escapeHtml(msg) + '</div>';
    }
  }
}

// Developer helper: run extended fetches for diagnostics
async function fetchLeaderboardDebug(testId) {
  const result = { top: null, byName: null, errors: [] };
  try { if (window.leaderboardAuthReady) await window.leaderboardAuthReady; } catch (e) {}
  if (!window.leaderboardApi) { result.errors.push('leaderboardApi not available'); return result; }
  try {
    if (typeof window.leaderboardApi.fetchTopScores === 'function') {
      try { result.top = await window.leaderboardApi.fetchTopScores(testId, 100); } catch (e) { result.errors.push('fetchTopScores failed: ' + (e && e.message)); }
    } else result.errors.push('fetchTopScores not a function');
    const cached = window.currentUsername || (localStorage.getItem && localStorage.getItem('fblacer_username')) || null;
    if (cached && typeof window.leaderboardApi.fetchScoresByName === 'function') {
      try { result.byName = await window.leaderboardApi.fetchScoresByName(testId, cached); } catch (e) { result.errors.push('fetchScoresByName failed: ' + (e && e.message)); }
    }
  } catch (e) { result.errors.push('unexpected: ' + (e && e.message)); }
  console.debug('fetchLeaderboardDebug result', result);
  return result;
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
    const rank = document.createElement('div'); rank.className = 'lb-rank'; rank.textContent = String(idx+1);
    const nameWrap = document.createElement('div'); nameWrap.className = 'lb-name';
    const nameEl = document.createElement('button');
    nameEl.type = 'button';
    nameEl.className = 'lb-name-btn';
    nameEl.style = 'background:none;border:none;padding:0;margin:0;font:inherit;cursor:pointer;color:inherit;text-align:left;';
    nameEl.innerHTML = escapeHtml(e.name || 'Anonymous');
    nameEl.addEventListener('click', async () => {
      const clickedName = (e.name || '').trim();
      try {
        if (!clickedName) return;
        const uid = await resolveProfileUid(clickedName);
        if (uid) { showProfileOverlay(uid); return; }
        try { writeLog('profile_lookup_miss', { clickedName }); } catch (e) {}
        alert('Public profile not found for ' + clickedName);
      } catch (err) { console.warn('leaderboard name click failed', err); try { writeLog('profile_lookup_error', { clickedName, message: err && err.message }); } catch (e) {} ; alert('Failed to open profile'); }
    });
    const tsEl = document.createElement('div'); tsEl.className = 'lb-timestamp'; tsEl.textContent = tsText;
    nameWrap.appendChild(nameEl); nameWrap.appendChild(tsEl);
    const points = document.createElement('div'); points.className = 'lb-points'; points.textContent = String(Number(e.points) || 0);
    item.appendChild(rank); item.appendChild(nameWrap); item.appendChild(points);
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

// Grant a named achievement to a user's accounts/{uid}.achievements map
async function grantAchievement(uid, achievementName) {
  try {
    if (!uid) return;
    const ts = new Date().toISOString();
    if (window.runTransaction && window.doc && window.db) {
      const accRef = window.doc(window.db, 'accounts', uid);
      await window.runTransaction(window.db, async (tx) => {
        const snap = await tx.get(accRef);
        let base = {};
        if (snap && snap.exists && snap.exists()) {
          try { base = snap.data() || {}; } catch (e) { base = {}; }
        }
        const ach = Object.assign({}, base.achievements || {});
        // don't duplicate
        if (!ach[achievementName]) ach[achievementName] = { earnedAt: ts };
        const merged = Object.assign({}, base, { achievements: ach, lastUpdated: ts });
        tx.set(accRef, merged);
      });
    } else if (window.doc && window.setDoc && window.db) {
      const accRef = window.doc(window.db, 'accounts', uid);
      try {
        const snap = await window.getDoc(accRef);
        let base = snap && snap.exists ? (snap.data() || {}) : {};
        const ach = Object.assign({}, base.achievements || {});
        if (!ach[achievementName]) ach[achievementName] = { earnedAt: ts };
        const merged = Object.assign({}, base, { achievements: ach, lastUpdated: ts });
        await window.setDoc(accRef, merged);
      } catch (e) { console.warn('grantAchievement failed', e); }
    }
    try { writeLog('grantAchievement', { uid, achievementName }); } catch (e) {}
  } catch (e) { console.warn('grantAchievement error', e); }
}

// Render a public profile overlay for the given uid
async function showProfileOverlay(uid) {
  try {
    let overlay = document.getElementById('profileOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'profileOverlay';
      overlay.className = 'profile-overlay';
      document.body.appendChild(overlay);
    }
    overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:999999;';
    const panel = document.createElement('div');
    panel.style = 'background:var(--surface,#fff);color:var(--text-color,#102027);padding:24px;border-radius:10px;min-width:280px;max-width:640px;box-shadow:0 12px 40px rgba(0,0,0,0.3);position:relative;';
    overlay.innerHTML = '';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style = 'position:absolute;right:12px;top:8px;border:none;background:none;font-size:20px;';
    closeBtn.onclick = () => { overlay.style.display = 'none'; };
    panel.appendChild(closeBtn);
    const title = document.createElement('h3'); title.textContent = 'Public profile'; panel.appendChild(title);
    const content = document.createElement('div'); content.textContent = 'Loading...'; panel.appendChild(content);
    overlay.appendChild(panel);

    // Only fetch private account data when the viewer is the owner (per Firestore rules)
    let acct = null;
    try {
      const currentUid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || (localStorage.getItem && localStorage.getItem('fblacer_uid')) || null;
      const isOwner = currentUid && uid && String(currentUid) === String(uid);
      if (isOwner && window.doc && window.getDoc && window.db) {
        try {
          const aref = window.doc(window.db, 'accounts', uid);
          const s = await window.getDoc(aref);
          if (s && typeof s.exists === 'function' && s.exists()) acct = s.data();
        } catch (e) { console.warn('profile fetch failed (owner)', e); }
      }
    } catch (e) { console.warn('profile fetch wrapper failed', e); }

    // render profile
    content.innerHTML = '';
    const avatar = document.createElement('img');
    avatar.style = 'width:96px;height:96px;border-radius:50%;object-fit:cover;margin-right:12px;';
    avatar.alt = 'avatar';
    const header = document.createElement('div'); header.style.display = 'flex'; header.style.alignItems = 'center';
    const nameEl = document.createElement('div'); nameEl.style.fontWeight = 700; nameEl.style.fontSize = '18px';
    nameEl.textContent = (acct && acct.username) ? acct.username : (localStorage.getItem && localStorage.getItem('fblacer_username')) || 'Anonymous';
    avatar.src = (acct && acct.avatarUrl) ? acct.avatarUrl : 'https://www.gravatar.com/avatar/?d=mp&s=96';
    header.appendChild(avatar); header.appendChild(nameEl);
    content.appendChild(header);

    // If owner, show a Sync button to copy leaderboard entries into users/{uid}/scores/{test}
    try {
      const currentUid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || (localStorage.getItem && localStorage.getItem('fblacer_uid')) || null;
      const isOwner = currentUid && uid && String(currentUid) === String(uid);
      if (isOwner) {
        const syncWrap = document.createElement('div');
        syncWrap.style.display = 'flex';
        syncWrap.style.gap = '8px';
        syncWrap.style.marginTop = '10px';

        const syncBtn = document.createElement('button');
        syncBtn.type = 'button';
        syncBtn.textContent = 'Sync leaderboard -> Profile';
        syncBtn.style.marginRight = '8px';

        const syncStatus = document.createElement('div');
        syncStatus.style.fontSize = '13px';
        syncStatus.style.color = 'var(--muted,#666)';

        syncBtn.onclick = async () => {
          try {
            syncBtn.disabled = true; syncStatus.textContent = 'Syncing...';
            await (async function syncFromLeaderboards() {
              if (!(window.collection && window.getDocs && window.doc && window.setDoc && window.db)) return;
              const username = (acct && acct.username) ? acct.username : (localStorage.getItem && localStorage.getItem('fblacer_username')) || null;
              // ensure username -> uid mapping
              try {
                if (username) await window.setDoc(window.doc(window.db, 'usernames', username), { uid }, { merge: true });
                // ensure users/{uid}.username exists
                try { await window.setDoc(window.doc(window.db, 'users', uid), { username }, { merge: true }); } catch (e) {}
              } catch (e) { /* ignore */ }

              // iterate tests list (window.tests expected)
              const allTests = Array.isArray(window.tests) ? window.tests : [];
              for (let i = 0; i < allTests.length; i++) {
                const testId = String(i);
                try {
                  // first try uid-based entries
                  let found = false;
                  if (uid) {
                    try {
                      const col = window.collection(window.db, 'leaderboards', testId, 'scores');
                      const q = window.query(col, window.where('uid', '==', uid));
                      const snap = await window.getDocs(q);
                      if (snap && typeof snap.forEach === 'function') {
                        snap.forEach(async (d) => {
                          try {
                            const data = d.data ? d.data() : {};
                            const userScoreRef = window.doc(window.db, 'users', uid, 'scores', testId);
                            await window.setDoc(userScoreRef, { points: data.points || data.points || 0, leaderboardDocId: d.id, sentToLeaderboard: true, createdAt: data.createdAt || new Date().toISOString(), lastUpdated: new Date().toISOString() }, { merge: true });
                            found = true;
                          } catch (e) {}
                        });
                      }
                    } catch (e) {}
                  }
                  // if not found by uid and username exists, try name-based
                  if (!found && username) {
                    try {
                      const col2 = window.collection(window.db, 'leaderboards', testId, 'scores');
                      const q2 = window.query(col2, window.where('name', '==', username));
                      const snap2 = await window.getDocs(q2);
                      if (snap2 && typeof snap2.forEach === 'function') {
                        snap2.forEach(async (d) => {
                          try {
                            const data = d.data ? d.data() : {};
                            const userScoreRef = window.doc(window.db, 'users', uid, 'scores', testId);
                            await window.setDoc(userScoreRef, { points: data.points || 0, leaderboardDocId: d.id, sentToLeaderboard: true, createdAt: data.createdAt || new Date().toISOString(), lastUpdated: new Date().toISOString() }, { merge: true });
                            found = true;
                          } catch (e) {}
                        });
                      }
                    } catch (e) {}
                  }
                } catch (e) {}
              }
            })();
            syncStatus.textContent = 'Sync completed';
            // refresh overlay contents by re-opening (simple approach)
            try { overlay.remove(); showProfileOverlay(uid); } catch (e) {}
          } catch (e) {
            syncStatus.textContent = 'Sync failed';
            console.warn('Sync failed', e);
          } finally {
            syncBtn.disabled = false;
            setTimeout(() => { syncStatus.textContent = ''; }, 2500);
          }
        };

        syncWrap.appendChild(syncBtn);
        syncWrap.appendChild(syncStatus);
        content.appendChild(syncWrap);
      }
    } catch (e) { console.warn('owner sync UI failed', e); }

    // If viewing own profile, allow changing avatar
    try {
      const currentUid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || (localStorage.getItem && localStorage.getItem('fblacer_uid')) || null;
      if (currentUid && uid && String(currentUid) === String(uid)) {
        const changeWrap = document.createElement('div');
        changeWrap.style.marginTop = '10px';
        changeWrap.style.display = 'flex';
        changeWrap.style.alignItems = 'center';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';

        const changeBtn = document.createElement('button');
        changeBtn.type = 'button';
        changeBtn.textContent = 'Change picture';
        changeBtn.style.marginRight = '8px';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = 'Remove';
        removeBtn.style.marginRight = '8px';

        const statusEl = document.createElement('div');
        statusEl.style.fontSize = '13px';
        statusEl.style.color = 'var(--muted,#666)';

        changeBtn.onclick = () => fileInput.click();

        removeBtn.onclick = async () => {
          try {
            if (!(window.doc && window.setDoc && window.db)) return showToast('Storage not available', 'error');
            // remove avatarUrl field
            await window.setDoc(window.doc(window.db, 'accounts', uid), { avatarUrl: '' }, { merge: true });
            avatar.src = 'https://www.gravatar.com/avatar/?d=mp&s=96';
            try { writeLog('avatar_removed', { uid }); } catch (e) {}
            statusEl.textContent = 'Removed';
            setTimeout(() => { statusEl.textContent = ''; }, 2500);
          } catch (e) { console.warn('remove avatar failed', e); showToast('Failed to remove avatar', 'error'); }
        };

        fileInput.addEventListener('change', async (ev) => {
          const f = (ev.target && ev.target.files && ev.target.files[0]) || null;
          if (!f) return;
          if (!f.type || !f.type.startsWith('image/')) return showToast('Please select an image file', 'error');
          statusEl.textContent = 'Processing...';
          try {
            // read file into Image then resize to max 512px using canvas to limit size
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(new Error('Failed to read file'));
              reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                  try {
                    const maxDim = 512;
                    let w = img.width, h = img.height;
                    if (w > maxDim || h > maxDim) {
                      const ratio = Math.min(maxDim / w, maxDim / h);
                      w = Math.round(w * ratio); h = Math.round(h * ratio);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const out = canvas.toDataURL('image/jpeg', 0.85);
                    resolve(out);
                  } catch (e) { reject(e); }
                };
                img.onerror = () => reject(new Error('Image load error'));
                img.src = reader.result;
              };
              reader.readAsDataURL(f);
            });

            // preview
            avatar.src = dataUrl;

            // save to accounts/{uid}.avatarUrl (merge)
            if (window.doc && window.setDoc && window.db) {
              await window.setDoc(window.doc(window.db, 'accounts', uid), { avatarUrl: dataUrl, lastUpdated: new Date().toISOString() }, { merge: true });
              try { writeLog('avatar_updated', { uid }); } catch (e) {}
              showToast('Profile picture updated', 'success');
              statusEl.textContent = 'Updated';
              setTimeout(() => { statusEl.textContent = ''; }, 2500);
            } else {
              showToast('Unable to save avatar: backend unavailable', 'error');
              statusEl.textContent = '';
            }
          } catch (e) {
            console.warn('avatar upload failed', e);
            showToast('Failed to update profile picture', 'error');
            statusEl.textContent = '';
          } finally {
            try { fileInput.value = ''; } catch (e) {}
          }
        });

        changeWrap.appendChild(changeBtn);
        changeWrap.appendChild(removeBtn);
        changeWrap.appendChild(statusEl);
        content.appendChild(changeWrap);
        content.appendChild(fileInput);
      }
    } catch (e) { console.warn('owner avatar UI failed', e); }

    const achTitle = document.createElement('h4'); achTitle.textContent = 'Achievements'; achTitle.style.marginTop = '12px'; content.appendChild(achTitle);
    const achList = document.createElement('div');
    const achievements = (acct && acct.achievements) ? acct.achievements : {};
    const keys = Object.keys(achievements || {});
    if (!keys.length) {
      achList.textContent = 'No achievements yet.';
    } else {
      keys.forEach(k => {
        const row = document.createElement('div'); row.textContent = `${k} — ${achievements[k].earnedAt || ''}`;
        achList.appendChild(row);
      });
    }
    content.appendChild(achList);

    // public stats (tests summary)
    const testsEl = document.createElement('div'); testsEl.style.marginTop = '12px';
    testsEl.innerHTML = '<h4>Tests</h4>';
    const testsList = document.createElement('div');
    // Determine tests to show. For owner we will prefer user's private scores under users/{uid}/scores or accounts/{uid}/tests.
    let tests = null;
    const currentUid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || (localStorage.getItem && localStorage.getItem('fblacer_uid')) || null;
    const isOwner = currentUid && uid && String(currentUid) === String(uid);
    if (isOwner && window.collection && window.getDocs && window.doc && window.db) {
      // Try users/{uid}/scores first (per rules this is allowed for owner)
      try {
        const scoresCol = window.collection(window.db, 'users', uid, 'scores');
        const snapScores = await window.getDocs(scoresCol);
        if (snapScores && typeof snapScores.forEach === 'function') {
          tests = {};
          snapScores.forEach(d => { try { tests[d.id] = d.data(); } catch (e) {} });
        }
      } catch (e) { /* ignore */ }
      // Fallback: check accounts/{uid}/tests subcollection if present
      if (!tests) {
        try {
          const testsCol = window.collection(window.db, 'accounts', uid, 'tests');
          const snapTests = await window.getDocs(testsCol);
          if (snapTests && typeof snapTests.forEach === 'function') {
            tests = {};
            snapTests.forEach(d => { try { tests[d.id] = d.data(); } catch (e) {} });
          }
        } catch (e) { /* ignore */ }
      }
    }
    tests = tests || {};
    const tkeys = Object.keys(tests || {});
    // helper to format timestamp to 'Month Day Year'
    function fmtDate(ts) {
      try {
        if (ts === null || typeof ts === 'undefined' || ts === '') return '';
        // If it's a Firestore Timestamp-like object with toDate()
        if (ts && typeof ts.toDate === 'function') {
          const d = ts.toDate();
          if (d && !isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          return '';
        }

        // If it's an object with seconds (Firestore legacy), convert
        if (ts && typeof ts === 'object' && 'seconds' in ts) {
          const sec = Number(ts.seconds || 0);
          if (!isNaN(sec) && sec > 0) {
            const d = new Date(sec * 1000);
            if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          }
          return '';
        }

        // If it's a string, sanitize newlines and wrapping quotes and whitespace
        if (typeof ts === 'string') {
          let s = ts.trim();
          // remove surrounding quotes if present
          if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            s = s.slice(1, -1).trim();
          }
          // Remove newlines that may appear in storage exports
          s = s.replace(/\n/g, '').replace(/\r/g, '').trim();

          // If the string contains an ISO timestamp inside it, extract it (helpful when stored with extra chars)
          // Match patterns like 2025-10-07T02:06:43.201Z
          const isoMatch = s.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
          if (isoMatch && isoMatch[0]) {
            const dIso2 = new Date(isoMatch[0]);
            if (!isNaN(dIso2.getTime())) {
              try { /* debug removed */ } catch (e) {}
              return dIso2.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            }
          }

          // try ISO parse of the cleaned string
          const dIso = new Date(s);
          if (!isNaN(dIso.getTime())) {
            try { /* debug removed */ } catch (e) {}
            return dIso.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          }
          // try numeric parse
          const n = Number(s);
          if (!isNaN(n) && n > 0) {
            const dNum = new Date(n);
            if (!isNaN(dNum.getTime())) {
              try { /* debug removed */ } catch (e) {}
              return dNum.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            }
          }
          return '';
        }

        // If it's a number (epoch ms)
        if (typeof ts === 'number') {
          const d = new Date(ts);
          if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          return '';
        }

        // Fallback: attempt to coerce and parse
        const d = new Date(ts);
        if (d && !isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        return '';
      } catch (e) { return '' + ts; }
    }

    if (!tkeys.length) {
      testsList.textContent = 'No test records';
    } else {
      // Only show tests that have leaderboard entries for this user (best-effort)
      for (const tn of tkeys) {
        try {
          let shown = false;
          // Log which test we're checking
          try { /* debug removed */ } catch (e) {}

          // Prefer account-local marker if available: acct.tests.{tn}.sentToLeaderboard
          try {
            const acctTests = (acct && acct.tests) ? acct.tests : null;
            if (acctTests && acctTests[tn] && acctTests[tn].sentToLeaderboard) {
              const info = acctTests[tn];
              const r = document.createElement('div');
              const pretty = fmtDate(info.timestamp || info.createdAt || info.lastUpdated || info.ts || '');
              r.textContent = `${tn}: ${info.points || 0} pts${pretty ? ' (' + pretty + ')' : ''}`;
              // if leaderboardDocId stored, create a link
              try {
                let url = null;
                if (window.leaderboardApi && typeof window.leaderboardApi.getScoreDocUrl === 'function' && info.leaderboardDocId) {
                  url = window.leaderboardApi.getScoreDocUrl(tn, info.leaderboardDocId);
                }
                if (!url && info.leaderboardDocId) url = `leaderboard.html?test=${encodeURIComponent(tn)}&doc=${encodeURIComponent(info.leaderboardDocId)}`;
                if (url) { const a = document.createElement('a'); a.href = url; a.textContent = 'View leaderboard'; a.target = '_blank'; a.style.marginLeft = '8px'; r.appendChild(a); }
              } catch (e) {}
              testsList.appendChild(r);
              shown = true;
            }
          } catch (e) { console.warn('acct.tests check failed', e); }


          // try leaderboards/{test}/scores where name == acct.username
          if (acct && acct.username && window.getDocs && window.collection && window.query && window.where && window.db) {
            try {
              const col = window.collection(window.db, 'leaderboards', tn, 'scores');
              const q = window.query(col, window.where('name', '==', acct.username));
              const qr = await window.getDocs(q);
              // Prefer using querySnapshot.empty / querySnapshot.size to detect hits
              if (qr && typeof qr.empty === 'boolean') {
                if (!qr.empty) {
                  shown = true;
                  try { /* debug removed */ } catch (e) {}
                }
              } else if (qr && typeof qr.size === 'number') {
                if (qr.size > 0) { shown = true; try { /* debug removed */ } catch (e) {} }
              } else if (qr && typeof qr.forEach === 'function') {
                // Fallback: iterate but use snap.exists() properly
                let found = false;
                qr.forEach(docSnap => { try { if (docSnap && typeof docSnap.exists === 'function' && docSnap.exists()) found = true; } catch (e) {} });
                if (found) { shown = true; try { /* debug removed */ } catch (e) {} }
              }
            } catch (e) { console.warn('leaderboard name lookup failed for', tn, e); }
          }

          // try uid-based entries if not found yet
          if (!shown && uid && window.getDocs && window.collection && window.query && window.where && window.db) {
            try {
              const col2 = window.collection(window.db, 'leaderboards', tn, 'scores');
              const q2 = window.query(col2, window.where('uid', '==', uid));
              const qr2 = await window.getDocs(q2);
              if (qr2 && typeof qr2.empty === 'boolean') {
                if (!qr2.empty) {
                  shown = true;
                  try { /* debug removed */ } catch (e) {}
                }
              } else if (qr2 && typeof qr2.size === 'number') {
                if (qr2.size > 0) { shown = true; try { /* debug removed */ } catch (e) {} }
              } else if (qr2 && typeof qr2.forEach === 'function') {
                let found2 = false;
                qr2.forEach(docSnap => { try { if (docSnap && typeof docSnap.exists === 'function' && docSnap.exists()) found2 = true; } catch (e) {} });
                if (found2) { shown = true; try { /* debug removed */ } catch (e) {} }
              }
            } catch (e) { console.warn('leaderboard uid lookup failed for', tn, e); }
          }

          // If still not found, attempt a diagnostic scan of a few sample docs in the scores subcollection
          if (!shown && window.getDocs && window.collection && window.db) {
            try {
              try { /* debug removed */ } catch (e) {}
              const colScan = window.collection(window.db, 'leaderboards', tn, 'scores');
              const qrScan = await window.getDocs(colScan);
              if (qrScan && typeof qrScan.forEach === 'function') {
                let sampleCount = 0;
                qrScan.forEach(docSnap => {
                  if (sampleCount >= 5) return;
                  try {
                    const d = docSnap.data ? docSnap.data() : null;
                    /* debug removed: sample doc logged */
                  } catch (e) { /* debug removed sample read failure */ }
                  sampleCount++;
                });
                if (qrScan && typeof qrScan.empty === 'boolean' && !qrScan.empty) {
                  // if there are docs but earlier queries missed them, log a warning
                  try { console.warn('Diagnostic: scores exist for', tn, 'but name/uid queries returned no hits. Check field names/casing/whitespace.'); } catch (e) {}
                }
              }
            } catch (e) { console.warn('diagnostic scan failed for', tn, e); }
          }

          if (shown) {
            const info = tests[tn] || {};
            const r = document.createElement('div');
            const pretty = fmtDate(info.timestamp || info.ts || info.createdAt || info.lastUpdated || '');
            // If we have a leaderboardApi helper that can produce a URL for a score doc, use it
            let linkEl = null;
            try {
              if (window.leaderboardApi && typeof window.leaderboardApi.getScoreDocUrl === 'function' && info && info.leaderboardDocId) {
                const url = window.leaderboardApi.getScoreDocUrl(tn, info.leaderboardDocId);
                linkEl = document.createElement('a'); linkEl.href = url; linkEl.textContent = 'View leaderboard'; linkEl.target = '_blank'; linkEl.style.marginLeft = '8px';
              }
            } catch (e) {}

            // fallback: if we stored score doc id in the test metadata, create a link pattern
            if (!linkEl && info && info.leaderboardDocId) {
              try {
                const url = `leaderboard.html?test=${encodeURIComponent(tn)}&doc=${encodeURIComponent(info.leaderboardDocId)}`;
                linkEl = document.createElement('a'); linkEl.href = url; linkEl.textContent = 'View leaderboard'; linkEl.target = '_blank'; linkEl.style.marginLeft = '8px';
              } catch (e) {}
            }

            r.textContent = `${tn}: ${info.totalPoints || 0} pts${pretty ? ' (' + pretty + ')' : ''}`;
            if (linkEl) r.appendChild(linkEl);
            testsList.appendChild(r);
          } else {
            // Not found via primary queries. Try a more thorough (but heavier) scan: look through some sample docs and attempt case-insensitive or alternate-field matches.
            try {
              if (window.getDocs && window.collection && window.db) {
                const col = window.collection(window.db, 'leaderboards', tn, 'scores');
                const qr = await window.getDocs(col);
                if (qr && typeof qr.forEach === 'function' && qr.size > 0) {
                  let matchedDoc = null;
                  qr.forEach(docSnap => {
                    if (matchedDoc) return;
                    try {
                      const d = docSnap.data ? docSnap.data() : {};
                      // normalize and compare
                      const nameField = (d && (d.name || d.username || d.user || d.displayName)) || '';
                      const uidField = (d && (d.uid || d.userId || d.userid || d.owner)) || '';
                      const normName = String(nameField || '').trim().toLowerCase();
                      const normAcctName = String((acct && acct.username) || '').trim().toLowerCase();
                      const normUid = String(uidField || '').trim();
                      const normAcctUid = String(uid || '').trim();
                      if (normAcctUid && normUid && normAcctUid === normUid) {
                        matchedDoc = { id: docSnap.id, data: d };
                      } else if (normAcctName && normName && normAcctName === normName) {
                        matchedDoc = { id: docSnap.id, data: d };
                      }
                    } catch (e) {}
                  });
                  if (matchedDoc) {
                    // render link to matched doc
                    const info = tests[tn] || {};
                    const r = document.createElement('div');
                    const pretty = fmtDate(info.timestamp || info.ts || info.createdAt || info.lastUpdated || '');
                    r.textContent = `${tn}: ${info.totalPoints || 0} pts${pretty ? ' (' + pretty + ')' : ''}`;
                    let url = null;
                    try { if (window.leaderboardApi && typeof window.leaderboardApi.getScoreDocUrl === 'function') url = window.leaderboardApi.getScoreDocUrl(tn, matchedDoc.id); } catch (e) {}
                    if (!url) url = `leaderboard.html?test=${encodeURIComponent(tn)}&doc=${encodeURIComponent(matchedDoc.id)}`;
                    const a = document.createElement('a'); a.href = url; a.textContent = 'View leaderboard'; a.target = '_blank'; a.style.marginLeft = '8px';
                    r.appendChild(a);
                    testsList.appendChild(r);
                    // log discovery
                    try { /* debug removed */ } catch (e) {}
                    // mark shown to avoid final 'No leaderboard submissions' message
                    shown = true;
                  }
                }
              }
            } catch (e) { console.warn('Fallback scan failed for', tn, e); }
          }
        } catch (e) {
          console.warn('test display check failed', e);
        }
      }
      if (!testsList.children.length) testsList.textContent = 'No leaderboard submissions';
    }
    testsEl.appendChild(testsList);
    content.appendChild(testsEl);

    return overlay;
  } catch (e) { console.warn('showProfileOverlay error', e); }
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
    // perform leaderboard write
    let writeResult = null;
    try {
      writeResult = await window.leaderboardApi.setScoreDoc(test, docId, { name, test, points: score, createdAt });
    } catch (e) {
      console.warn('submitScore: leaderboard write failed', e);
      writeResult = { error: String(e && e.message ? e.message : e) };
    }
    // Only write private per-user score data under the authenticated user's own document
    try {
      const authUid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || (localStorage.getItem && localStorage.getItem('fblacer_uid')) || null;
      if (authUid && window.doc && window.setDoc && window.db) {
        // Preferred location per rules: users/{uid}/scores/{test}
        try {
          const userScoreRef = window.doc(window.db, 'users', authUid, 'scores', test);
          const testEntry = { points: score, leaderboardDocId: docId, sentToLeaderboard: !(writeResult && writeResult.error), createdAt, lastUpdated: new Date().toISOString() };
          await window.setDoc(userScoreRef, testEntry, { merge: true });
        } catch (e) {
          console.warn('submitScore: users/scores update failed', e);
        }
      }
    } catch (e) { console.warn('submitScore: private write wrapper failed', e); }
    // Log submitScore action
    try { writeLog('submitScore', { test, name, points: score, createdAt }); } catch (e) { console.warn('submitScore log failed', e); }
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

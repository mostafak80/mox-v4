// ============================================================
// auth.js — Google Authentication Layer for MOX-V4
// ============================================================
// Handles:
//   - Login screen rendering
//   - Google Sign-In (popup + redirect fallback for mobile/Safari)
//   - Auth state persistence
//   - Session management on logout
// ============================================================

import {
  getFirebaseAuth, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut
} from './firebase.js';

let _onUserReadyCallback = null;
let _currentUser = null;

/** Returns the currently signed-in Firebase user, or null. */
export function getCurrentUser() { return _currentUser; }

/**
 * Detect mobile / Safari / standalone PWA — these need redirect auth.
 */
function shouldUseRedirect() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isPWA = window.matchMedia('(display-mode: standalone)').matches
             || window.navigator.standalone === true;
  return isIOS || isSafari || isPWA;
}

/**
 * Trigger Google Sign-In.
 * Uses popup on desktop Chrome/Firefox, redirect on mobile/Safari/PWA.
 */
export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');
  provider.setCustomParameters({ prompt: 'select_account' });

  if (shouldUseRedirect()) {
    // Store a flag so we know to check redirect result on next load.
    sessionStorage.setItem('mox_auth_redirect', '1');
    await signInWithRedirect(auth, provider);
    // Execution stops here — the page will reload.
    return;
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      // Fallback to redirect if popup was blocked.
      sessionStorage.setItem('mox_auth_redirect', '1');
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

/**
 * Sign out the current user.
 * Clears in-memory state but does NOT delete Firestore data.
 */
export async function signOutUser() {
  const auth = getFirebaseAuth();
  await signOut(auth);
  _currentUser = null;
}

/**
 * Translate Firebase auth errors to friendly Arabic messages.
 */
function friendlyAuthError(code) {
  const map = {
    'auth/network-request-failed': 'لا يوجد اتصال بالإنترنت. تحقق من الشبكة وحاول مرة أخرى.',
    'auth/popup-closed-by-user':   'تم إغلاق نافذة تسجيل الدخول. يمكنك المحاولة مرة أخرى.',
    'auth/cancelled-popup-request':'تم إلغاء طلب تسجيل الدخول.',
    'auth/user-cancelled':         'تم إلغاء عملية تسجيل الدخول.',
    'auth/account-exists-with-different-credential': 'هذا البريد الإلكتروني مستخدم بطريقة مختلفة.',
  };
  return map[code] || 'فشل تسجيل الدخول بحساب Google. حاول مرة أخرى.';
}

/**
 * Bootstrap auth: check redirect result, then listen for auth state.
 * Calls callback(user) when auth state is determined.
 * @param {function} onUserReady - called with (user | null)
 */
export async function initAuth(onUserReady) {
  _onUserReadyCallback = onUserReady;
  const auth = getFirebaseAuth();

  // Check for pending redirect sign-in result first.
  if (sessionStorage.getItem('mox_auth_redirect')) {
    sessionStorage.removeItem('mox_auth_redirect');
    try {
      const result = await getRedirectResult(auth);
      if (result?.user) {
        _currentUser = result.user;
        // onAuthStateChanged will fire next and call onUserReady.
      }
    } catch (err) {
      console.error('[MOX Auth] Redirect result error:', err.code, err.message);
      showLoginError(friendlyAuthError(err.code));
    }
  }

  // Primary auth state listener.
  onAuthStateChanged(auth, (user) => {
    _currentUser = user;
    if (_onUserReadyCallback) _onUserReadyCallback(user);
  });
}

// ============================================================
// Login Screen UI
// ============================================================

let _loginScreen = null;
let _loginErrorEl = null;

export function showLoginScreen() {
  if (_loginScreen) {
    _loginScreen.style.display = '';
    return;
  }

  // Create the login overlay.
  _loginScreen = document.createElement('div');
  _loginScreen.id = 'moxLoginScreen';
  _loginScreen.className = 'mox-login-screen';
  _loginScreen.innerHTML = `
    <div class="mox-login-card glass">
      <div class="mox-login-brand">
        <img src="./assets/logo.png" alt="MOX" class="mox-login-logo">
        <div>
          <strong>MOX-V4</strong>
          <span>Store Finance OS</span>
        </div>
      </div>

      <div class="mox-login-body">
        <h2>أهلاً بك في MOX</h2>
        <p>سجّل الدخول بحساب Google لحفظ بياناتك في السحابة ومزامنتها على كل أجهزتك.</p>

        <button id="moxGoogleSignInBtn" class="mox-google-btn">
          <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
          </svg>
          <span>متابعة بحساب Google</span>
        </button>

        <div id="moxLoginError" class="mox-login-error hidden" role="alert"></div>
        <div id="moxLoginSpinner" class="mox-login-spinner hidden">
          <span class="mox-spinner-ring"></span>
          <span>جارٍ تسجيل الدخول…</span>
        </div>
      </div>

      <div class="mox-login-footer">
        <small>بياناتك المالية محمية ومرتبطة بحسابك فقط.</small>
      </div>
    </div>
  `;

  document.body.appendChild(_loginScreen);
  _loginErrorEl = _loginScreen.querySelector('#moxLoginError');

  _loginScreen.querySelector('#moxGoogleSignInBtn').onclick = handleLoginClick;
}

export function hideLoginScreen() {
  if (_loginScreen) _loginScreen.style.display = 'none';
}

function showLoginError(msg) {
  if (!_loginErrorEl) return;
  _loginErrorEl.textContent = msg;
  _loginErrorEl.classList.remove('hidden');
}

function setLoginLoading(on) {
  const btn = document.getElementById('moxGoogleSignInBtn');
  const spinner = document.getElementById('moxLoginSpinner');
  if (btn) btn.disabled = on;
  if (spinner) spinner.classList.toggle('hidden', !on);
  if (_loginErrorEl) _loginErrorEl.classList.add('hidden');
}

async function handleLoginClick() {
  setLoginLoading(true);
  try {
    await signInWithGoogle();
    // If redirect was used, the page reloads and we won't reach here.
    // If popup was used, onAuthStateChanged fires and handles the rest.
  } catch (err) {
    console.error('[MOX Auth] Login error:', err.code, err.message);
    showLoginError(friendlyAuthError(err.code));
    setLoginLoading(false);
  }
}

// ============================================================
// User Profile Header
// ============================================================

export function renderUserProfile(user, onLogout) {
  const existing = document.getElementById('moxUserProfile');
  if (existing) existing.remove();

  if (!user) return;

  const el = document.createElement('div');
  el.id = 'moxUserProfile';
  el.className = 'mox-user-profile';

  const photoUrl = user.photoURL
    ? `<img src="${escapeAttr(user.photoURL)}" alt="${escapeAttr(user.displayName || '')}" class="mox-user-avatar" referrerpolicy="no-referrer">`
    : `<span class="mox-user-avatar-placeholder">${(user.displayName || '؟').slice(0, 1)}</span>`;

  el.innerHTML = `
    ${photoUrl}
    <div class="mox-user-info">
      <b>${escHtml(user.displayName || 'مستخدم')}</b>
      <small>${escHtml(user.email || '')}</small>
    </div>
    <button id="moxLogoutBtn" class="mox-logout-btn" title="تسجيل الخروج">خروج</button>
  `;

  // Insert at the top of the sidebar brand area.
  const brand = document.querySelector('.brand');
  if (brand) brand.after(el);

  document.getElementById('moxLogoutBtn').onclick = onLogout;
}

function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function escapeAttr(v) { return escHtml(v); }

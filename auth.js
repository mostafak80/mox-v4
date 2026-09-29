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
  // Only use redirect if on mobile Safari where popups are strictly prevented
  return isIOS && isSafari;
}

/**
 * Trigger Google Sign-In.
 * Tries popup first for fastest, cleanest UX, with redirect fallback if blocked.
 */
export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');
  provider.setCustomParameters({ prompt: 'select_account' });

  if (window.location.protocol === 'file:') {
    const err = new Error('لا يمكن تسجيل الدخول عبر بروتوكول file://. يجب فتح الموقع عبر سيرفر محلي (مثل Live Server أو npx serve).');
    err.code = 'auth/operation-not-supported-in-this-environment';
    throw err;
  }

  if (shouldUseRedirect()) {
    sessionStorage.setItem('mox_auth_redirect', '1');
    await signInWithRedirect(auth, provider);
    return null;
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    if (err.code === 'auth/popup-blocked') {
      // Fallback to redirect if popup was explicitly blocked by browser
      sessionStorage.setItem('mox_auth_redirect', '1');
      await signInWithRedirect(auth, provider);
      return null;
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
 * Translate Firebase auth errors to friendly, actionable Arabic messages.
 */
function friendlyAuthError(code, message = '') {
  const currentHost = window.location.hostname || 'هذا الجهاز';
  const isFileProto = window.location.protocol === 'file:';

  if (isFileProto) {
    return '⚠️ لا يمكن تسجيل الدخول عبر فتح ملف HTML مباشرة (file://) بسبب قيود أمان Google OAuth.\n\nالحل السريع: اضغط مرتين على ملف "تشغيل-الموقع.bat" الموجود في مجلد المشروع لفتح الموقع على سيرفر محلي، أو استخدم Live Server.';
  }

  const map = {
    'auth/configuration-not-found': `⚠️ خدمة Authentication غير مفعّلة في مشروع Firebase الخاص بك (mox-v2-22fcc)!

خطوات الحل في ثوانٍ:
1. افتح رابط إعدادات الدخول لمشروعك:
https://console.firebase.google.com/project/mox-v2-22fcc/authentication
2. اضغط على زر "Get Started" (بدء الاستخدام).
3. اختر موفر "Google" واجعله مفعّل (Enable).
4. اختر بريدك الإلكتروني في خانة Support email ثم اضغط "Save" (حفظ).
5. ارجع هنا واضغط "متابعة بحساب Google" وسيعمل معك فوراً!`,
    'auth/operation-not-allowed': `⚠️ موفر Google غير مفعّل في Firebase Console!

الحل:
1. افتح https://console.firebase.google.com/project/mox-v2-22fcc/authentication/providers
2. اضغط على Google واجعله مفعّل (Enable) واكتب بريدك للدعم ثم اضغط Save.`,
    'auth/unauthorized-domain': `⚠️ النطاق الحالي (${currentHost}) غير مصرح به في Firebase Console!

الحل:
1. افتح https://console.firebase.google.com/project/mox-v2-22fcc/authentication/settings
2. اذهب إلى Authorized domains واضغط Add domain وأضف: ${currentHost}`,
    'auth/operation-not-supported-in-this-environment': '⚠️ البيئة الحالية لا تدعم تسجيل الدخول (مثل فتح ملف محلي بدون سيرفر ويب). شغّل الموقع عبر تشغيل-الموقع.bat.',
    'auth/popup-blocked': '⚠️ قام المتصفح بحظر النافذة المنبثقة (Popup Blocked).\nيرجى السماح بالنوافذ المنبثقة من شريط عنوان المتصفح ثم إعادة المحاولة.',
    'auth/popup-closed-by-user': 'تم إغلاق نافذة Google قبل إتمام تسجيل الدخول. يمكنك الضغط مرة أخرى للمحاولة.',
    'auth/cancelled-popup-request': 'تم إلغاء عملية تسجيل الدخول أو تم الضغط مرتين.',
    'auth/user-cancelled': 'تم إلغاء عملية تسجيل الدخول.',
    'auth/network-request-failed': '⚠️ تعذر الاتصال بخوادم Google. تحقق من اتصال الإنترنت وحاول مجددًا.',
    'auth/invalid-api-key': '⚠️ مفتاح Firebase API Key غير صالح. تحقق من بيانات مشروعك في firebase-config.js.',
    'auth/internal-error': '⚠️ حدث خطأ داخلي في خدمة Google. تحقق من تفعيل Authentication في مشروع Firebase.',
    'auth/account-exists-with-different-credential': 'هذا البريد الإلكتروني مسجل مسبقًا بطريقة أخرى.',
  };
  return map[code] || (message ? `تعذر تسجيل الدخول (${code || 'خطأ'}): ${message}` : 'فشل تسجيل الدخول بحساب Google. حاول مرة أخرى.');
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
      showLoginScreen();
      showLoginError(friendlyAuthError(err.code, err.message));
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
let _onLocalChoiceCallback = null;

export function showLoginScreen(onLocalChoice = null) {
  if (typeof onLocalChoice === 'function') _onLocalChoiceCallback = onLocalChoice;
  if (_loginScreen) {
    _loginScreen.style.display = 'flex';
    if (_loginErrorEl) _loginErrorEl.classList.add('hidden');
    setLoginLoading(false);
    return;
  }

  const isFileProto = window.location.protocol === 'file:';

  // Create the login overlay.
  _loginScreen = document.createElement('div');
  _loginScreen.id = 'moxLoginScreen';
  _loginScreen.className = 'mox-login-screen';
  _loginScreen.innerHTML = `
    <div class="mox-login-card glass">
      <button id="moxLoginCloseBtn" class="mox-login-close-btn" title="إغلاق والدخول في الوضع المحلي">×</button>
      <div class="mox-login-brand">
        <img src="./assets/logo.png" alt="MOX" class="mox-login-logo">
        <div>
          <strong>MOX-V4</strong>
          <span>Store Finance OS</span>
        </div>
      </div>

      <div class="mox-login-body">
        <h2>أهلاً بك في MOX</h2>
        <p>اختر طريقة تسجيل الدخول للبدء:</p>

        ${isFileProto ? `
          <div class="mox-login-error" style="display:block;margin-bottom:14px;background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.35);color:#fde68a">
            💡 <b>تنبيه:</b> أنت فاتح الموقع كملف محلي (file://). لتسجيل الدخول بـ Google وحفظ بياناتك سحابيًا، اضغط على <b>تشغيل-الموقع.bat</b> في مجلد المشروع لتشغيله على سيرفر محلي.
          </div>
        ` : ''}

        <div class="mox-login-options">
          <!-- خيار 1: تسجيل الدخول بحساب Google -->
          <button id="moxGoogleSignInBtn" class="mox-option-card mox-google-option" type="button">
            <div class="mox-option-icon">
              <svg width="24" height="24" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
              </svg>
            </div>
            <div class="mox-option-info">
              <b>تسجيل الدخول بحساب Google</b>
              <span>حفظ ومزامنة سحابية عبر كل أجهزتك ☁️</span>
            </div>
          </button>

          <!-- خيار 2: الدخول في الوضع المحلي -->
          <button id="moxLocalModeBtn" class="mox-option-card mox-local-option" type="button">
            <div class="mox-option-icon local-icon">💻</div>
            <div class="mox-option-info">
              <b>الدخول في الوضع المحلي</b>
              <span>استخدام فوري بدون إنترنت وحفظ البيانات على جهازك ⚡</span>
            </div>
          </button>
        </div>

        <div id="moxLoginError" class="mox-login-error hidden" role="alert"></div>
        <div id="moxLoginSpinner" class="mox-login-spinner hidden">
          <span class="mox-spinner-ring"></span>
          <span>جارٍ تسجيل الدخول…</span>
        </div>
      </div>

      <div class="mox-login-footer-note">
        <small>بياناتك المالية آمنة ومشفرة ومحفوظة بدقة.</small>
      </div>
    </div>
  `;

  document.body.appendChild(_loginScreen);
  _loginErrorEl = _loginScreen.querySelector('#moxLoginError');

  _loginScreen.querySelector('#moxGoogleSignInBtn').onclick = handleLoginClick;

  const handleLocal = () => {
    hideLoginScreen();
    if (_onLocalChoiceCallback) {
      _onLocalChoiceCallback();
    }
  };
  _loginScreen.querySelector('#moxLocalModeBtn').onclick = handleLocal;
  _loginScreen.querySelector('#moxLoginCloseBtn').onclick = handleLocal;
}

export function hideLoginScreen() {
  if (_loginScreen) _loginScreen.style.display = 'none';
}

function showLoginError(msg) {
  if (!_loginErrorEl) return;
  const escaped = escHtml(msg);
  const withLinks = escaped.replace(/(https:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline;word-break:break-all;display:block;margin:6px 0;font-weight:800">$1</a>');
  _loginErrorEl.innerHTML = withLinks;
  _loginErrorEl.classList.remove('hidden');
}

function setLoginLoading(on) {
  const googleBtn = document.getElementById('moxGoogleSignInBtn');
  const localBtn  = document.getElementById('moxLocalModeBtn');
  const spinner   = document.getElementById('moxLoginSpinner');
  if (googleBtn) googleBtn.disabled = on;
  if (localBtn)  localBtn.disabled = on;
  if (spinner) spinner.classList.toggle('hidden', !on);
  if (_loginErrorEl && on) _loginErrorEl.classList.add('hidden');
}

async function handleLoginClick() {
  setLoginLoading(true);
  try {
    const user = await signInWithGoogle();
    if (user) {
      _currentUser = user;
      hideLoginScreen();
      if (_onUserReadyCallback) {
        await _onUserReadyCallback(user);
      }
    }
  } catch (err) {
    console.error('[MOX Auth] Login error:', err.code, err.message, err);
    showLoginError(friendlyAuthError(err.code, err.message));
  } finally {
    setLoginLoading(false);
  }
}

// ============================================================
// User Profile Header
// ============================================================

export function renderUserProfile(user, onLogout, onLogin) {
  const existing = document.getElementById('moxUserProfile');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'moxUserProfile';
  el.className = 'mox-user-profile' + (!user ? ' guest' : '');

  if (user) {
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

    const brand = document.querySelector('.brand');
    if (brand) brand.after(el);
    document.getElementById('moxLogoutBtn').onclick = onLogout;
  } else {
    el.innerHTML = `
      <div class="mox-guest-icon">☁️</div>
      <div class="mox-user-info">
        <b>وضع محلي</b>
        <small>تسجيل الدخول اختياري</small>
      </div>
      <button id="moxSidebarLoginBtn" class="mox-sidebar-login-btn">دخول</button>
    `;

    const brand = document.querySelector('.brand');
    if (brand) brand.after(el);
    const loginBtn = document.getElementById('moxSidebarLoginBtn');
    if (loginBtn) loginBtn.onclick = onLogin || showLoginScreen;
  }
}

function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function escapeAttr(v) { return escHtml(v); }


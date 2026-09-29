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
 * Detect mobile / tablet / standalone PWA.
/**
 * Detect mobile / tablet / standalone PWA.
 */
export function isMobileDevice() {
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile|CriOS/i.test(ua);
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isSmallScreen = window.innerWidth <= 800;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  return isMobileUA || (isTouch && isSmallScreen) || Boolean(isStandalone);
}

/**
 * Detect restricted in-app browsers (Facebook, Instagram, WhatsApp, TikTok, etc.)
 * Google OAuth blocks OAuth inside in-app webviews for security.
 */
function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line|Twitter|Telegram|WhatsApp|Bytedance|Snapchat|MicroMessenger/i.test(ua);
}

/**
 * Robust clipboard copy helper working across both HTTPS and HTTP contexts.
 */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const successful = document.execCommand('copy');
    ta.remove();
    return successful;
  } catch (e) {
    console.warn('[MOX Auth] Clipboard copy failed:', e);
    return false;
  }
}

/**
 * Trigger Google Sign-In.
 * - Checks environment (file:// protocol, insecure HTTP on mobile, in-app webview).
 * - Attempts signInWithPopup first on all devices for fast, non-reloading UX and immunity to Safari 3rd-party cookie blocking.
 * - Falls back to signInWithRedirect if popup is blocked by browser.
 */
export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');
  provider.setCustomParameters({ prompt: 'select_account' });

  // 1. Check file:// protocol
  if (window.location.protocol === 'file:') {
    const err = new Error('لا يمكن تسجيل الدخول عبر فتح ملف HTML مباشرة (file://) بسبب قيود أمان Google OAuth.\nيجب فتح الموقع عبر سيرفر محلي (مثل تشغيل-الموقع.bat).');
    err.code = 'auth/operation-not-supported-in-this-environment';
    throw err;
  }

  // 2. Check insecure HTTP on mobile / remote IP
  const isHttp = window.location.protocol === 'http:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isHttp && !isLocalhost) {
    const err = new Error(
      `جوجل تمنع تسجيل الدخول عبر بروتوكول HTTP غير المشفر على الهاتف أو عبر الشبكة (${window.location.origin}). تشترط Google وجود اتصال مشفر HTTPS لحماية الحسابات.`
    );
    err.code = 'auth/insecure-http-origin';
    throw err;
  }

  // 3. Check restricted In-App browsers
  if (isInAppBrowser()) {
    const err = new Error(
      'متصفح التطبيق الحالي (مثل فيسبوك أو واتساب) محظور من تسجيل الدخول بحساب Google. افتح الرابط في متصفح خارجي (Chrome أو Safari) عبر القائمة (⋮ أو ⋯).'
    );
    err.code = 'auth/disallowed-in-app-browser';
    throw err;
  }

  // 4. Try popup first; fallback to redirect if popup is blocked
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    if (
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/cancelled-popup-request'
    ) {
      console.warn('[MOX Auth] Popup blocked or cancelled, attempting redirect fallback:', err.code);
      sessionStorage.setItem('mox_auth_redirect_started', String(Date.now()));
      sessionStorage.setItem('mox_auth_redirect_url', window.location.href);
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
 * Translate Firebase auth errors to friendly, actionable Arabic messages with complete context.
 */
export function friendlyAuthError(code, message = '', err = null) {
  const currentHost = window.location.hostname || 'هذا الجهاز';
  const isFileProto = window.location.protocol === 'file:';
  const isHttp = window.location.protocol === 'http:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isFileProto) {
    return '⚠️ لا يمكن تسجيل الدخول عبر فتح ملف HTML مباشرة (file://) بسبب قيود أمان Google OAuth.\n\nالحل السريع: اضغط مرتين على ملف "تشغيل-الموقع.bat" الموجود في مجلد المشروع لفتح الموقع على سيرفر محلي، أو استخدم Live Server.';
  }

  if (code === 'auth/insecure-http-origin' || (isHttp && !isLocalhost)) {
    return `⚠️ Google تمنع تسجيل الدخول عبر بروتوكول HTTP غير المشفر على الهواتف والأجهزة المتصلة بالشبكة (${window.location.origin}).

🔍 سبب المشكلة:
سياسات أمان Google OAuth تشترط وجود اتصال مشفر (HTTPS) لحماية الحسابات عند الدخول من الهاتف أو شبكة Wi-Fi. بروتوكول HTTP مسموح به فقط محلياً على نفس جهاز الكمبيوتر (localhost).

💡 الحلول المتاحة:
1. ارفع الموقع على GitHub Pages (مثل https://mostafak80.github.io/mox-v4) أو Firebase Hosting ليعمل مباشرة برابط HTTPS مشفر مجاناً.
2. أو استخدم خدمة مثل ngrok لعمل رابط HTTPS لسيرفرك المحلي.
3. أو اضغط على "الدخول في الوضع المحلي" بالأسفل لاستخدام MOX-V4 على هاتفك بكامل مميزاته فوراً بدون إنترنت.`;
  }

  if (code === 'auth/disallowed-in-app-browser') {
    return `⚠️ متصفح التطبيق الحالي (مثل فيسبوك أو واتساب أو إنستغرام) غير مدعوم من Google.

🔍 سبب المشكلة:
Google تمنع تسجيل الدخول داخل متصفحات التطبيقات (Embedded WebViews) لحماية كلمة المرور وبيانات الحساب.

💡 الحل:
اضغط على علامة القائمة (⋮ أو ⋯) في أعلى الشاشة واختر "فتح في المتصفح" (Open in Chrome أو Open in Safari).`;
  }

  const map = {
    'auth/configuration-not-found': `⚠️ خدمة Authentication غير مفعّلة في مشروع Firebase الخاص بك (mox-v2-22fcc)!

🛠️ خطوات الحل في ثوانٍ:
1. افتح رابط إعدادات الدخول لمشروعك:
https://console.firebase.google.com/project/mox-v2-22fcc/authentication
2. اضغط على زر "Get Started" (بدء الاستخدام).
3. اختر موفر "Google" واجعله مفعّل (Enable).
4. اختر بريدك الإلكتروني في خانة Support email ثم اضغط "Save" (حفظ).
5. ارجع هنا واضغط "متابعة بحساب Google" وسيعمل معك فوراً!`,

    'auth/operation-not-allowed': `⚠️ موفر Google Sign-In غير مفعّل في Firebase Console!

🛠️ الحل:
1. افتح https://console.firebase.google.com/project/mox-v2-22fcc/authentication/providers
2. اضغط على Google واجعله مفعّل (Enable) واكتب بريدك للدعم ثم اضغط Save.`,

    'auth/unauthorized-domain': `⚠️ النطاق الحالي (${currentHost}) غير مصرح به في Firebase Console!

🔍 سبب المشكلة:
مشروع Firebase (mox-v2-22fcc) يحمي حسابك بحظر أي نطاق لم تقم بإضافته يدويًا في قائمة النطاقات المصرح بها.

🛠️ الحل في خطوتين:
1. افتح رابط إعدادات مشروعك:
https://console.firebase.google.com/project/mox-v2-22fcc/authentication/settings
2. اذهب إلى قسم "Authorized domains" واضغط "Add domain" وأضف:
${currentHost}
3. اضغط حفظ (Save) وأعد المحاولة وسيعمل فوراً!`,

    'auth/operation-not-supported-in-this-environment': '⚠️ البيئة الحالية لا تدعم تسجيل الدخول (مثل فتح ملف محلي بدون سيرفر ويب أو متصفح قديم). شغّل الموقع عبر تشغيل-الموقع.bat أو متصفح حديث.',
    'auth/popup-blocked': '⚠️ قام المتصفح في هاتفك بحظر النافذة المنبثقة (Popup Blocked).\nيرجى الضغط على شريط الرابط واختيار السماح بالنوافذ المنبثقة (Always Allow Popups) ثم إعادة المحاولة.',
    'auth/popup-closed-by-user': 'تم إغلاق نافذة Google قبل اختيار الحساب. يمكنك الضغط مرة أخرى للمحاولة في أي وقت.',
    'auth/cancelled-popup-request': 'تم إلغاء عملية تسجيل الدخول أو تم الضغط مرتين.',
    'auth/user-cancelled': 'تم إلغاء عملية تسجيل الدخول من قِبَل المستخدم.',
    'auth/network-request-failed': '⚠️ تعذر الاتصال بخوادم Google. تحقق من اتصال الإنترنت في هاتفك أو تأكد من عدم وجود VPN أو مانع إعلانات يعترض الاتصال.',
    'auth/redirect-cancelled-or-cookies-blocked': `⚠️ تم حظر جلسة الدخول بواسطة متصفح الهاتف (Cross-Site Cookies Blocked).

🔍 سبب المشكلة:
متصفح الهاتف (خصوصاً Safari على iPhone) يفعّل ميزة "منع التتبع أثناء استخدام المواقع" أو يحظر الكوكيز الخارجية، مما يعطل استلام الجلسة من Google.

💡 الحل:
1. جرب فتح الموقع في Chrome أو Safari الأصلي وليس عبر متصفح داخل تطبيق.
2. في iPhone: إعدادات الهاتف ← Safari ← عطّل "منع التتبع أثناء استخدام المواقع" (Prevent Cross-Site Tracking).
3. أو يمكنك المتابعة في "الوضع المحلي" واستخدام كل وظائف الحسابات بدون إنترنت.`,
    'auth/invalid-api-key': '⚠️ مفتاح Firebase API Key غير صالح. تحقق من بيانات مشروعك في firebase-config.js.',
    'auth/internal-error': '⚠️ حدث خطأ داخلي في خدمة Google. تحقق من تفعيل Authentication في مشروع Firebase.',
    'auth/account-exists-with-different-credential': 'هذا البريد الإلكتروني مسجل مسبقًا بطريقة تسجيل دخول مختلفة.'
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

  const redirectPending = sessionStorage.getItem('mox_auth_redirect_started');

  // Always check redirect sign-in result on page load (Firebase official standard)
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      sessionStorage.removeItem('mox_auth_redirect_started');
      sessionStorage.removeItem('mox_auth_redirect_url');
      _currentUser = result.user;
      hideLoginScreen();
      if (_onUserReadyCallback) await _onUserReadyCallback(result.user);
      return;
    }

    if (redirectPending) {
      sessionStorage.removeItem('mox_auth_redirect_started');
      sessionStorage.removeItem('mox_auth_redirect_url');
      const elapsed = Date.now() - Number(redirectPending);
      // If a redirect was initiated within last 10 minutes and returned null:
      if (elapsed < 10 * 60 * 1000) {
        const diagErr = new Error('تمت العودة من صفحة Google ولكن المتصفح حظر استلام بيانات الجلسة (Cross-Site Cookies / Tracking Blocked).');
        diagErr.code = 'auth/redirect-cancelled-or-cookies-blocked';
        showLoginScreen(null, true);
        showLoginError(friendlyAuthError(diagErr.code, diagErr.message, diagErr), diagErr);
      }
    }
  } catch (err) {
    sessionStorage.removeItem('mox_auth_redirect_started');
    sessionStorage.removeItem('mox_auth_redirect_url');
    console.error('[MOX Auth] Redirect result error:', err.code, err.message, err);
    showLoginScreen(null, true);
    showLoginError(friendlyAuthError(err.code, err.message, err), err);
  }

  // Primary auth state listener
  onAuthStateChanged(auth, async (user) => {
    _currentUser = user;
    if (user) {
      hideLoginScreen();
      if (_onUserReadyCallback) await _onUserReadyCallback(user);
    } else {
      renderUserProfile(null, null, () => showLoginScreen());
    }
  });
}

// ============================================================
// Login Screen UI
// ============================================================

let _loginScreen = null;
let _loginErrorEl = null;
let _onLocalChoiceCallback = null;

export function showLoginScreen(onLocalChoice = null, keepError = false) {
  if (typeof onLocalChoice === 'function') _onLocalChoiceCallback = onLocalChoice;
  if (_loginScreen) {
    _loginScreen.style.display = 'flex';
    if (_loginErrorEl && !keepError) _loginErrorEl.classList.add('hidden');
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

export function showLoginError(friendlyMsg, rawErr = null) {
  if (!_loginScreen) showLoginScreen(null, true);
  if (!_loginErrorEl) _loginErrorEl = _loginScreen?.querySelector('#moxLoginError');
  if (!_loginErrorEl) return;

  const code = rawErr?.code || (friendlyMsg.match(/\[Code:\s*([^\]]+)\]/) ? RegExp.$1 : 'auth/failed');
  const rawMessage = rawErr?.message || '';
  const currentHost = window.location.hostname || 'غير محدد';
  const currentProto = window.location.protocol || '';
  const currentUrl = window.location.href;
  const isMobile = isMobileDevice();
  const ua = navigator.userAgent;

  const escaped = escHtml(friendlyMsg);
  const withLinks = escaped.replace(
    /(https:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="mox-error-link">$1</a>'
  );

  const errorReportText = [
    '=== تقرير تشخيص تسجيل الدخول MOX-V4 ===',
    `• كود الخطأ (Code): ${code}`,
    `• رسالة الخطأ الأصلية: ${rawMessage || '(لا توجد رسالة إضافية)'}`,
    `• النطاق الحالي (Host): ${currentHost}`,
    `• البروتوكول (Protocol): ${currentProto}`,
    `• الرابط الكامل (URL): ${currentUrl}`,
    `• نوع الجهاز: ${isMobile ? 'هاتف / جهاز لوحي (Mobile)' : 'كمبيوتر (Desktop)'}`,
    `• المتصفح (UA): ${ua}`,
    `• التاريخ والوقت: ${new Date().toLocaleString('ar-EG')}`,
    '====================================='
  ].join('\n');

  _loginErrorEl.innerHTML = `
    <div class="mox-error-card">
      <div class="mox-error-title-row">
        <span class="mox-error-badge-icon">⚠️</span>
        <div class="mox-error-badge-text">
          <b>سبب تعذر تسجيل الدخول</b>
          <code class="mox-error-badge-code">${escHtml(code)}</code>
        </div>
      </div>

      <div class="mox-error-text">
        ${withLinks}
      </div>

      <div class="mox-error-details-box">
        <div class="mox-details-title">تفاصيل الفحص التقني:</div>
        <div class="mox-details-grid">
          <div><span>النطاق (Domain):</span> <code>${escHtml(currentHost)}</code></div>
          <div><span>البروتوكول:</span> <code>${escHtml(currentProto)}</code></div>
          <div><span>نوع الجهاز:</span> <code>${isMobile ? 'هاتف / تابلت' : 'كمبيوتر'}</code></div>
          ${rawMessage ? `<div style="grid-column:1 / -1"><span>الرسالة الفنية:</span> <code class="mox-code-block">${escHtml(rawMessage)}</code></div>` : ''}
        </div>
      </div>

      <div class="mox-error-btn-row">
        <button id="moxCopyErrorBtn" type="button" class="mox-err-btn mox-btn-copy">
          📋 نسخ تفاصيل الخطأ
        </button>
        ${code === 'auth/unauthorized-domain' ? `
          <a href="https://console.firebase.google.com/project/mox-v2-22fcc/authentication/settings" target="_blank" rel="noopener noreferrer" class="mox-err-btn mox-btn-fix">
            ⚙️ فتح إعدادات Firebase
          </a>
        ` : ''}
        <button id="moxErrorLocalBtn" type="button" class="mox-err-btn mox-btn-local">
          💻 المتابعة في الوضع المحلي
        </button>
      </div>
    </div>
  `;

  _loginErrorEl.classList.remove('hidden');

  // Wire up Copy button
  const copyBtn = _loginErrorEl.querySelector('#moxCopyErrorBtn');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const ok = await copyToClipboard(errorReportText);
      copyBtn.textContent = ok ? '✓ تم نسخ التقرير بنجاح' : 'تم اختيار النص يدويًا';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = '📋 نسخ تفاصيل الخطأ';
        copyBtn.classList.remove('copied');
      }, 2500);
    };
  }

  // Wire up Local mode button
  const localBtn = _loginErrorEl.querySelector('#moxErrorLocalBtn');
  if (localBtn) {
    localBtn.onclick = () => {
      hideLoginScreen();
      if (_onLocalChoiceCallback) _onLocalChoiceCallback();
    };
  }

  // Auto-scroll on mobile to make the error immediately visible
  try {
    _loginErrorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {}

  // Trigger persistent toast notification if available
  if (window.moxToast) {
    window.moxToast(`⚠️ خطأ تسجيل الدخول: ${code}`, 'error', 6000);
  }
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
    showLoginError(friendlyAuthError(err.code, err.message, err), err);
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


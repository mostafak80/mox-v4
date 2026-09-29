// ============================================================
// migration.js — Local → Cloud Data Migration for MOX-V4
// ============================================================
// Detects existing IndexedDB local data when a user first signs
// in with Google, shows a migration dialog, and safely uploads
// data to Firestore while preserving local copies.
// ============================================================

import { uploadFullState } from './cloud-sync.js';

const MIGRATION_FLAG_KEY = 'mox_cloud_migrated_';

/**
 * Returns the user-specific migration flag key for IndexedDB.
 */
function migrationFlagKey(uid) {
  return `${MIGRATION_FLAG_KEY}${uid}`;
}

/**
 * Check if the current user (uid) has already been migrated.
 */
export async function isMigrated(uid, idbGet) {
  try {
    const val = await idbGet(migrationFlagKey(uid));
    return !!val;
  } catch { return false; }
}

/**
 * Mark migration as complete for this user.
 */
export async function markMigrated(uid, idbSet) {
  await idbSet(migrationFlagKey(uid), { migratedAt: new Date().toISOString() });
}

/**
 * Show the migration dialog.
 * @param {object} state - the current local state
 * @param {object} user - Firebase user object
 * @returns {Promise<'migrate'|'later'>}
 */
export function showMigrationDialog(state, user) {
  return new Promise((resolve) => {
    // Remove any existing dialog.
    document.getElementById('moxMigrationDialog')?.remove();

    const txCount   = (state.transactions || []).length;
    const presetCount = (state.presets || []).length;
    const fxCount   = (state.fixedExpenses || []).length;
    const vxCount   = (state.variableExpenses || []).length;

    const escHtml = v => String(v ?? '').replace(/[&<>"']/g, m =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

    const photoHtml = user.photoURL
      ? `<img src="${escHtml(user.photoURL)}" alt="${escHtml(user.displayName || '')}" class="mig-avatar" referrerpolicy="no-referrer">`
      : `<span class="mig-avatar-placeholder">${(user.displayName || '؟').slice(0, 1)}</span>`;

    const dlg = document.createElement('dialog');
    dlg.id = 'moxMigrationDialog';
    dlg.className = 'modal mox-migration-dialog';
    dlg.innerHTML = `
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <span class="panel-kicker">ترحيل البيانات</span>
            <h3>وجدنا بيانات MOX محفوظة على هذا الجهاز</h3>
          </div>
        </div>

        <div class="mig-stats">
          ${txCount   ? `<div class="mig-stat"><strong>${txCount.toLocaleString('ar-EG')}</strong><span>عملية</span></div>` : ''}
          ${presetCount ? `<div class="mig-stat"><strong>${presetCount.toLocaleString('ar-EG')}</strong><span>عرض</span></div>` : ''}
          ${fxCount   ? `<div class="mig-stat"><strong>${fxCount.toLocaleString('ar-EG')}</strong><span>مصروف ثابت</span></div>` : ''}
          ${vxCount   ? `<div class="mig-stat"><strong>${vxCount.toLocaleString('ar-EG')}</strong><span>مصروف يومي</span></div>` : ''}
        </div>

        <div class="mig-account">
          <p>سيتم نقل بيانات MOX إلى:</p>
          <div class="mig-account-row">
            ${photoHtml}
            <div>
              <b>${escHtml(user.displayName || 'مستخدم')}</b>
              <small>${escHtml(user.email || '')}</small>
            </div>
          </div>
        </div>

        <p class="mig-note">
          ستبقى نسخة محلية من بياناتك على هذا الجهاز. لن يتم حذف أي شيء.
        </p>

        <div id="moxMigrationProgress" class="mig-progress hidden">
          <div class="mig-progress-bar"><div id="moxMigProgressFill" class="mig-progress-fill"></div></div>
          <span id="moxMigProgressLabel">0%</span>
        </div>

        <div id="moxMigrationError" class="dialog-error hidden" role="alert"></div>

        <div class="modal-actions">
          <button id="moxMigLaterBtn" class="btn btn-ghost">لاحقًا</button>
          <button id="moxMigConfirmBtn" class="btn btn-primary">نقل البيانات إلى حساب Google</button>
        </div>
      </div>
    `;

    document.body.appendChild(dlg);
    dlg.showModal();

    dlg.querySelector('#moxMigLaterBtn').onclick = () => {
      dlg.close();
      dlg.remove();
      resolve('later');
    };

    dlg.querySelector('#moxMigConfirmBtn').onclick = () => resolve('migrate');
  });
}

/**
 * Show progress inside the migration dialog.
 */
export function setMigrationProgress(uploaded, total) {
  const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0;
  const progress = document.getElementById('moxMigrationProgress');
  const fill     = document.getElementById('moxMigProgressFill');
  const label    = document.getElementById('moxMigProgressLabel');

  if (progress) progress.classList.remove('hidden');
  if (fill)     fill.style.width = `${pct}%`;
  if (label)    label.textContent = `${pct}%`;

  const confirmBtn = document.getElementById('moxMigConfirmBtn');
  const laterBtn   = document.getElementById('moxMigLaterBtn');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'جارٍ النقل…'; }
  if (laterBtn)   laterBtn.disabled = true;
}

/**
 * Show migration error.
 */
export function showMigrationError(msg) {
  const errEl = document.getElementById('moxMigrationError');
  if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
  const confirmBtn = document.getElementById('moxMigConfirmBtn');
  const laterBtn   = document.getElementById('moxMigLaterBtn');
  if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'إعادة المحاولة'; }
  if (laterBtn)   laterBtn.disabled = false;
}

/**
 * Close and remove the migration dialog.
 */
export function closeMigrationDialog() {
  const dlg = document.getElementById('moxMigrationDialog');
  if (dlg) { try { dlg.close(); } catch {} dlg.remove(); }
}

/**
 * Run the full migration:
 * 1. Take safety snapshot
 * 2. Validate + sanitize state
 * 3. Upload to Firestore
 * 4. Verify
 * 5. Mark complete
 */
export async function runMigration(state, uid, idbGet, idbSet, createSafetySnapshot, sanitizeState) {
  // 1. Safety snapshot.
  await createSafetySnapshot('pre-cloud-migration', state);

  // 2. Validate.
  const clean = sanitizeState(JSON.parse(JSON.stringify(state)));
  if (!clean.transactions && !clean.presets) throw new Error('empty-state');

  // 3. Upload.
  let uploaded = 0;
  const total = clean.transactions.length + clean.presets.length +
    clean.fixedExpenses.length + clean.variableExpenses.length;

  await uploadFullState(clean, (up, tot) => {
    uploaded = up;
    setMigrationProgress(up, tot || total);
  });

  // 4. Mark complete.
  await markMigrated(uid, idbSet);

  return { uploaded, total };
}

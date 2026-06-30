
  const STORAGE_ROWS = 'profit_calculator_rows_v7';
  const STORAGE_PRESETS = 'profit_calculator_presets_v7';
  const STORAGE_EXPENSES = 'profit_calculator_fixed_expenses_v2';
  const STORAGE_DELETED_STACK = 'profit_calculator_deleted_stack_v2';
  const STORAGE_WALLET_DOLLAR_RATE = 'profit_wallet_dollar_rate_v2';
  const STORAGE_EXPENSES_DOLLAR_RATE = 'profit_expenses_dollar_rate_v2';
  const STORAGE_SAFETY_BACKUP = 'profit_calculator_safety_backup_v1';
  const STORAGE_BEFORE_RESTORE_BACKUP = 'profit_calculator_before_restore_backup_v1';
  const STORAGE_APP_PASSWORD = 'profit_app_password_v1';
  const STORAGE_FIREBASE_CONFIG = 'profit_firebase_config_v1';
  const STORAGE_SYNC_CODE = 'profit_sync_code_v1';
  const STORAGE_SYNC_ENABLED = 'profit_sync_enabled_v1';
  const STORAGE_SYNC_DEVICE_ID = 'profit_sync_device_id_v1';
  const STORAGE_LAST_SYNC_AT = 'profit_last_sync_at_v1';
  const STORAGE_SERVICE_COLORS = 'profit_service_colors_v1';
  const STORAGE_ROWS_VIEW_MODE = 'profit_rows_view_mode_v1';
  const STORAGE_ROWS_VIEW_SIZE = 'profit_rows_view_size_v1';
  const STORAGE_SECTION_STATE = 'profit_section_state_v1';
  // إعدادات المزامنة الافتراضية — عشان الموقع يفتح ويزامن مباشرة بدون إدخال الكود كل مرة
  const DEFAULT_SYNC_CODE = 'MOX-258-989';
  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCQgXHLCD9M_nkYGqpxFMNPRJ--7IQJ6Q",
    authDomain: "mox-v2.firebaseapp.com",
    projectId: "mox-v2",
    storageBucket: "mox-v2.firebasestorage.app",
    messagingSenderId: "233653672293",
    appId: "1:233653672293:web:29aab87a2fbb8607cae98c",
    measurementId: "G-YV427C67GN"
  };


  let rows = [];
  let presets = [];
  let expenses = [];
  let serviceColors = {};
  let rowsViewMode = 'table';
  let rowsViewSize = 'medium';

  let cloudDb = null;
  let cloudDocRef = null;
  let cloudUnsubscribe = null;
  let isApplyingCloudData = false;
  let cloudSyncTimer = null;
  let cloudSyncEnabled = false;
  let isEnablingCloudSync = false;

  const COLLAPSIBLE_CONTENT_IDS = [
    'cloudSyncContent',
    'summaryFilterPanel',
    'summaryContent',
    'reportsContent',
    'presetsContent',
    'manualContent',
    'fixedExpensesContent',
    'rowsFilterPanel',
    'tableContent'
  ];

  const defaultExpenses = [
    { name: 'إعلانات', amount: 12500 },
    { name: 'رواتب', amount: 3000 },
    { name: 'باقات نت', amount: 1500 },
    { name: 'عمولة سحب', amount: 4000 }
  ];

  function today() {
    return new Date().toLocaleDateString('en-CA');
  }




  function getSectionGroupForTarget(id) {
    const groups = {
      cloudSyncContent: ['cloudSyncContent'],
      summaryFilterPanel: ['summaryFilterPanel', 'summaryContent'],
      summaryContent: ['summaryFilterPanel', 'summaryContent'],
      reportsContent: ['reportsContent'],
      presetsContent: ['presetsContent'],
      manualContent: ['manualContent'],
      fixedExpensesContent: ['fixedExpensesContent'],
      rowsFilterPanel: ['rowsFilterPanel', 'tableContent'],
      tableContent: ['rowsFilterPanel', 'tableContent']
    };

    return groups[id] || [id];
  }

  function setSectionButtonLabelByChild(id, label) {
    const el = document.getElementById(id);
    const section = el?.closest('.section');
    const button = section?.querySelector('.section-head .toggle-btn');
    if (button) button.textContent = label;
  }

  function isSectionGroupVisible(id) {
    const ids = getSectionGroupForTarget(id);
    return ids.every(itemId => {
      const el = document.getElementById(itemId);
      return el && !el.classList.contains('hidden-section');
    });
  }

  function openSectionGroupForTarget(id) {
    const ids = getSectionGroupForTarget(id);

    ids.forEach(itemId => {
      const el = document.getElementById(itemId);
      if (el) el.classList.remove('hidden-section');
    });

    if (ids.includes('tableContent')) {
      const preview = document.getElementById('latestRowsPreview');
      if (preview) preview.classList.add('hidden-section');
    }

    setSectionButtonLabelByChild(ids[0], 'إخفاء');
    setMobileNavActive(id);
    saveSectionState();
  }

  function closeSectionGroupForTarget(id) {
    const ids = getSectionGroupForTarget(id);

    ids.forEach(itemId => {
      const el = document.getElementById(itemId);
      if (el) el.classList.add('hidden-section');
    });

    if (ids.includes('tableContent')) {
      const preview = document.getElementById('latestRowsPreview');
      if (preview) preview.classList.add('hidden-section');
    }

    setSectionButtonLabelByChild(ids[0], 'إظهار');
    setMobileNavActive('');
    saveSectionState();
  }

  function setMobileNavActive(id) {
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
      btn.classList.toggle('active', Boolean(id) && btn.dataset.target === id);
    });
  }

  function scrollToBlock(id) {
    openSectionGroupForTarget(id);

    const el = document.getElementById(id) || document.getElementById(getSectionGroupForTarget(id)[0]);
    if (!el) return;

    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  }

  function toggleMobileBlock(id) {
    if (isSectionGroupVisible(id)) {
      closeSectionGroupForTarget(id);
      return;
    }

    openSectionGroupForTarget(id);
    const el = document.getElementById(id) || document.getElementById(getSectionGroupForTarget(id)[0]);
    if (!el) return;

    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 35);
  }

  function ensureMobileNavFixed() {

    const nav = document.querySelector('.mobile-bottom-nav');
    if (nav && nav.parentElement !== document.body) {
      document.body.appendChild(nav);
    }
  }

  function detectStandaloneMode() {
    const isStandalone =
      window.navigator.standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches;

    document.body.classList.toggle('app-standalone', Boolean(isStandalone));
  }

  function setupDynamicManifest() {
    const link = document.getElementById('dynamicManifestLink');
    if (!link) return;

    const manifest = {
      name: 'MOX-V2 - حاسبة المكسب',
      short_name: 'MOX-V2',
      start_url: window.location.pathname || '.',
      scope: './',
      display: 'standalone',
      orientation: 'portrait',
      dir: 'rtl',
      lang: 'ar',
      background_color: '#0f1117',
      theme_color: '#0f1117',
      icons: [
        { src: 'assets/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: 'assets/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    };

    try {
      const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
      link.href = URL.createObjectURL(blob);
    } catch (e) {
      console.warn('Manifest setup skipped:', e);
    }
  }

  function showIOSInstallHintOnce() {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
    const isStandalone = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
    const key = 'profit_ios_install_hint_seen_v1';

    if (!isIOS || isStandalone || localStorage.getItem(key)) return;

    setTimeout(() => {
      showToast('📲 على iPhone: افتح المشاركة ثم Add to Home Screen عشان يفتح كتطبيق.');
      localStorage.setItem(key, '1');
    }, 1200);
  }

  function toggleSection(id, button) {
    const section = document.getElementById(id);
    if (!section) return;

    section.classList.toggle('hidden-section');

    if (button) {
      button.textContent = section.classList.contains('hidden-section') ? 'إظهار' : 'إخفاء';
    }

    saveSectionState();
  }

  function toggleMultiSection(ids, button) {
    const elements = ids.map(id => document.getElementById(id)).filter(Boolean);
    if (!elements.length) return;

    const shouldShow = elements.some(el => el.classList.contains('hidden-section'));

    elements.forEach(el => {
      el.classList.toggle('hidden-section', !shouldShow);
    });

    if (button) {
      button.textContent = shouldShow ? 'إخفاء' : 'إظهار';
    }

    saveSectionState();
  }

  function collapseAllSectionsOnStart() {
    COLLAPSIBLE_CONTENT_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden-section');
    });

    const preview = document.getElementById('latestRowsPreview');
    if (preview) preview.classList.add('hidden-section');

    document.querySelectorAll('.section-head .toggle-btn').forEach(button => {
      button.textContent = 'إظهار';
    });

    setMobileNavActive('');
  }


  function getSafeJsonFromStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function loadRowsViewOptions() {
    const allowedModes = ['table', 'compact', 'cards', 'mini', 'grid', 'timeline'];
    const allowedSizes = ['small', 'medium', 'large'];

    const savedMode = localStorage.getItem(STORAGE_ROWS_VIEW_MODE) || 'table';
    const savedSize = localStorage.getItem(STORAGE_ROWS_VIEW_SIZE) || 'medium';

    rowsViewMode = allowedModes.includes(savedMode) ? savedMode : 'table';
    rowsViewSize = allowedSizes.includes(savedSize) ? savedSize : 'medium';

    const modeSelect = document.getElementById('rowsViewModeSelect');
    const sizeSelect = document.getElementById('rowsViewSizeSelect');

    if (modeSelect) modeSelect.value = rowsViewMode;
    if (sizeSelect) sizeSelect.value = rowsViewSize;

    applyRowsViewOptions();
  }

  function saveRowsViewOptions() {
    localStorage.setItem(STORAGE_ROWS_VIEW_MODE, rowsViewMode);
    localStorage.setItem(STORAGE_ROWS_VIEW_SIZE, rowsViewSize);
    scheduleCloudSync('rows-view-options');
  }

  function applyRowsViewOptions() {
    const tableWrap = document.getElementById('tableContent');
    if (!tableWrap) return;

    tableWrap.classList.remove(
      'rows-view-table',
      'rows-view-compact',
      'rows-view-cards',
      'rows-view-mini',
      'rows-view-grid',
      'rows-view-timeline',
      'rows-size-small',
      'rows-size-medium',
      'rows-size-large'
    );

    tableWrap.classList.add(`rows-view-${rowsViewMode}`);
    tableWrap.classList.add(`rows-size-${rowsViewSize}`);
  }

  function setRowsViewMode(value) {
    const allowed = ['table', 'compact', 'cards', 'mini', 'grid', 'timeline'];
    rowsViewMode = allowed.includes(value) ? value : 'table';
    applyRowsViewOptions();
    saveRowsViewOptions();
    showToast('✅ تم حفظ شكل سجل العمليات.');
  }

  function setRowsViewSize(value) {
    const allowed = ['small', 'medium', 'large'];
    rowsViewSize = allowed.includes(value) ? value : 'medium';
    applyRowsViewOptions();
    saveRowsViewOptions();
    showToast('✅ تم حفظ حجم سجل العمليات.');
  }

  function resetRowsViewOptions() {
    rowsViewMode = 'table';
    rowsViewSize = 'medium';

    const modeSelect = document.getElementById('rowsViewModeSelect');
    const sizeSelect = document.getElementById('rowsViewSizeSelect');
    if (modeSelect) modeSelect.value = rowsViewMode;
    if (sizeSelect) sizeSelect.value = rowsViewSize;

    applyRowsViewOptions();
    saveRowsViewOptions();
    showToast('✅ تم رجوع شكل سجل العمليات للوضع الافتراضي.');
  }

  function saveSectionState() {
    const state = {};

    COLLAPSIBLE_CONTENT_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) state[id] = !el.classList.contains('hidden-section');
    });

    localStorage.setItem(STORAGE_SECTION_STATE, JSON.stringify(state));
    scheduleCloudSync('section-state');
  }

  function updateSectionButtonsFromState() {
    const handled = new Set();

    COLLAPSIBLE_CONTENT_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      const section = el.closest('.section');
      if (!section || handled.has(section)) return;
      handled.add(section);

      const button = section.querySelector('.section-head .toggle-btn');
      if (!button) return;

      const sectionContent = [...section.querySelectorAll('.panel, .summary, .table-wrap')]
        .filter(node => node.id && COLLAPSIBLE_CONTENT_IDS.includes(node.id));
      const hasVisible = sectionContent.some(node => !node.classList.contains('hidden-section'));
      button.textContent = hasVisible ? 'إخفاء' : 'إظهار';
    });
  }

  function applySavedSectionState() {
    const saved = getSafeJsonFromStorage(STORAGE_SECTION_STATE, null);

    if (!saved) {
      collapseAllSectionsOnStart();
      saveSectionState();
      return;
    }

    COLLAPSIBLE_CONTENT_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('hidden-section', saved[id] !== true);
    });

    const preview = document.getElementById('latestRowsPreview');
    if (preview) preview.classList.add('hidden-section');

    updateSectionButtonsFromState();
    setMobileNavActive('');
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  function fmt(n) {
    const number = Number(n) || 0;

    return number.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function escapeHTML(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function calcProfit(row) {
    return (Number(row.paid) || 0) - (Number(row.deducted) || 0);
  }

  function presetDropdownLabel(preset) {
    preset = preset || {};
    const item = preset.item || 'بدون اسم';
    const offer = preset.offer || 'بدون عرض';
    const paid = fmt(preset.paid);

    return `${item} + ${offer} + ${paid} EGP`;
  }


  const SERVICE_COLOR_PALETTE = [
    '#4f8ef7', '#22c55e', '#a78bfa', '#f59e0b', '#ef4444',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
    '#8b5cf6', '#eab308', '#10b981', '#60a5fa', '#fb7185'
  ];

  function normalizeServiceName(name) {
    return String(name || '').trim();
  }

  function hashString(value) {
    const text = String(value || '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function colorForService(name) {
    const normalized = normalizeServiceName(name);
    if (!normalized) return '#4f8ef7';
    return SERVICE_COLOR_PALETTE[hashString(normalized) % SERVICE_COLOR_PALETTE.length];
  }

  function normalizeColor(value, fallback) {
    const text = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) return text;
    return fallback || '#4f8ef7';
  }

  function hexToRgba(hex, alpha) {
    const color = normalizeColor(hex, '#4f8ef7').replace('#', '');
    const r = parseInt(color.slice(0, 2), 16);
    const g = parseInt(color.slice(2, 4), 16);
    const b = parseInt(color.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function loadServiceColors() {
    try {
      serviceColors = JSON.parse(localStorage.getItem(STORAGE_SERVICE_COLORS)) || {};
    } catch (e) {
      serviceColors = {};
    }
  }

  function saveServiceColors() {
    localStorage.setItem(STORAGE_SERVICE_COLORS, JSON.stringify(serviceColors));
    scheduleCloudSync('service-colors');
  }

  function getServiceColor(name) {
    const normalized = normalizeServiceName(name);
    if (!normalized) return '#4f8ef7';
    if (!serviceColors[normalized]) {
      serviceColors[normalized] = colorForService(normalized);
      localStorage.setItem(STORAGE_SERVICE_COLORS, JSON.stringify(serviceColors));
    }
    return normalizeColor(serviceColors[normalized], colorForService(normalized));
  }

  function setServiceColor(name, color) {
    const normalized = normalizeServiceName(name);
    if (!normalized) return;
    serviceColors[normalized] = normalizeColor(color, colorForService(normalized));
    saveServiceColors();
    renderPresets();
    render();
    showToast(`✅ تم تحديث لون خدمة ${normalized}.`);
  }

  function getServiceNames() {
    return [...new Set([
      ...presets.map(preset => normalizeServiceName(preset.item)),
      ...rows.map(row => normalizeServiceName(row.item))
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar', { sensitivity: 'base', numeric: true }));
  }

  function ensureServiceColorsForCurrentData() {
    let changed = false;
    getServiceNames().forEach(name => {
      if (!serviceColors[name]) {
        serviceColors[name] = colorForService(name);
        changed = true;
      }
    });
    if (changed) localStorage.setItem(STORAGE_SERVICE_COLORS, JSON.stringify(serviceColors));
  }

  function renderServiceColorEditor() {
    const wrap = document.getElementById('serviceColorEditor');
    if (!wrap) return;

    ensureServiceColorsForCurrentData();
    const names = getServiceNames();

    if (!names.length) {
      wrap.innerHTML = '<div class="filter-note">لا توجد خدمات بعد. عند إضافة عروض هتظهر هنا لاختيار ألوانها.</div>';
      return;
    }

    wrap.innerHTML = names.map(name => {
      const color = getServiceColor(name);
      return `
        <div class="service-color-item" style="--service-color:${color}">
          <span class="service-dot" style="--service-color:${color}"></span>
          <div class="service-color-name" title="${escapeHTML(name)}">${escapeHTML(name)}</div>
          <input class="color-input" type="color" value="${color}" title="تغيير لون ${escapeHTML(name)}" onchange="setServiceColor('${escapeHTML(name).replaceAll('\\', '\\\\')}', this.value)">
        </div>
      `;
    }).join('');
  }

  function resetServiceColors() {
    const confirmed = confirm('هل تريد إعادة ألوان كل الخدمات تلقائيًا؟');
    if (!confirmed) return;

    serviceColors = {};
    getServiceNames().forEach(name => {
      serviceColors[name] = colorForService(name);
    });
    saveServiceColors();
    renderPresets();
    render();
    showToast('✅ تم إعادة تعيين ألوان الخدمات.');
  }

  function updatePresetSelectColorPreview() {
    const select = document.getElementById('presetSelect');
    const preview = document.getElementById('presetSelectColorPreview');
    if (!select || !preview) return;

    const preset = presets[Number(select.value)];
    if (!preset) {
      preview.classList.add('hidden-section');
      preview.innerHTML = '';
      select.style.setProperty('--selected-service-color', 'var(--border)');
      return;
    }

    const color = getServiceColor(preset.item);
    select.style.setProperty('--selected-service-color', color);
    preview.classList.remove('hidden-section');
    preview.innerHTML = `<span class="service-dot" style="--service-color:${color}"></span><span>${escapeHTML(presetDropdownLabel(preset))}</span>`;
  }

  function createRowObject(date, item, offer, paid, deducted) {
    return {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      date: date || today(),
      item: item || '',
      offer: offer || '',
      paid: Number(paid) || 0,
      deducted: Number(deducted) || 0,
      createdAt: new Date().toISOString()
    };
  }

  function createPresetObject(item, offer, paid, deducted) {
    return {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      item: item || '',
      offer: offer || '',
      paid: Number(paid) || 0,
      deducted: Number(deducted) || 0,
      createdAt: new Date().toISOString()
    };
  }

  function saveRows() {
    localStorage.setItem(STORAGE_ROWS, JSON.stringify(rows));
    scheduleCloudSync('rows');
  }

  function loadRows() {
    try {
      rows = JSON.parse(localStorage.getItem(STORAGE_ROWS)) || [];
    } catch (e) {
      rows = [];
    }
  }

  function savePresets() {
    localStorage.setItem(STORAGE_PRESETS, JSON.stringify(presets));
    scheduleCloudSync('presets');
  }

  function loadPresets() {
    try {
      presets = JSON.parse(localStorage.getItem(STORAGE_PRESETS)) || [];
    } catch (e) {
      presets = [];
    }
  }

  function saveExpenses() {
    localStorage.setItem(STORAGE_EXPENSES, JSON.stringify(expenses));
    scheduleCloudSync('expenses');
  }

  function loadExpenses() {
    try {
      const saved = localStorage.getItem(STORAGE_EXPENSES);

      if (saved === null) {
        expenses = defaultExpenses.map(item => ({
          id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
          name: item.name,
          amount: item.amount,
          createdAt: new Date().toISOString()
        }));

        saveExpenses();
        return;
      }

      expenses = JSON.parse(saved) || [];
    } catch (e) {
      expenses = [];
    }
  }

  function getDeletedStack() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_DELETED_STACK)) || [];
    } catch (e) {
      return [];
    }
  }

  function setDeletedStack(stack) {
    localStorage.setItem(STORAGE_DELETED_STACK, JSON.stringify(stack));
    scheduleCloudSync('deletedStack');
  }

  function pushDeleted(type, items, label) {
    if (!items || !items.length) return;

    const stack = getDeletedStack();

    stack.push({
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type,
      label,
      deletedAt: new Date().toISOString(),
      items
    });

    setDeletedStack(stack.slice(-35));
  }

  function restoreLastDeleted() {
    const stack = getDeletedStack();

    if (!stack.length) {
      showToast('ℹ️ لا يوجد شيء محذوف لاسترجاعه.');
      return;
    }

    const last = stack.pop();

    if (last.type === 'rows') {
      rows = [...rows, ...last.items];
      saveRows();
    }

    if (last.type === 'presets') {
      presets = [...presets, ...last.items];
      savePresets();
    }

    if (last.type === 'expenses') {
      expenses = [...expenses, ...last.items];
      saveExpenses();
    }

    setDeletedStack(stack);

    renderPresets();
    renderExpenses();
    render();

    showToast(`✅ تم استرجاع: ${last.label || 'آخر حذف'}`);
  }

  function saveDollarRates() {
    localStorage.setItem(STORAGE_WALLET_DOLLAR_RATE, document.getElementById('walletDollarRate').value);
    localStorage.setItem(STORAGE_EXPENSES_DOLLAR_RATE, document.getElementById('expensesDollarRate').value);
    scheduleCloudSync('settings');
  }

  function loadDollarRates() {
    const walletRate = localStorage.getItem(STORAGE_WALLET_DOLLAR_RATE);
    const expensesRate = localStorage.getItem(STORAGE_EXPENSES_DOLLAR_RATE);

    if (walletRate) {
      document.getElementById('walletDollarRate').value = walletRate;
    }

    if (expensesRate) {
      document.getElementById('expensesDollarRate').value = expensesRate;
    }
  }

  function totalFixedExpenses() {
    return expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function dateToISO(date) {
    return date.toLocaleDateString('en-CA');
  }

  function getDateFilters() {
    let from = document.getElementById('filterFromDate')?.value || '';
    let to = document.getElementById('filterToDate')?.value || '';

    if (from && to && from > to) {
      const temp = from;
      from = to;
      to = temp;
    }

    return { from, to };
  }

  function hasActiveDateFilter() {
    const { from, to } = getDateFilters();
    return Boolean(from || to);
  }

  function isRowInDateRange(row) {
    if (!hasActiveDateFilter()) return true;

    const rowDate = String(row.date || '').slice(0, 10);
    if (!rowDate) return false;

    const { from, to } = getDateFilters();

    if (from && rowDate < from) return false;
    if (to && rowDate > to) return false;

    return true;
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replaceAll('أ', 'ا')
      .replaceAll('إ', 'ا')
      .replaceAll('آ', 'ا')
      .replaceAll('ة', 'ه')
      .trim();
  }

  function getRowsSearchValue() {
    return normalizeText(document.getElementById('rowsSearchInput')?.value || '');
  }

  function getProductFilterValue() {
    return document.getElementById('productFilterSelect')?.value || '';
  }

  function isRowMatchingTextFilters(row) {
    const search = getRowsSearchValue();
    const product = getProductFilterValue();

    if (product && row.item !== product) return false;

    if (!search) return true;

    const haystack = normalizeText(`${row.date || ''} ${row.item || ''} ${row.offer || ''} ${row.paid || ''} ${row.deducted || ''} ${calcProfit(row)}`);
    return haystack.includes(search);
  }

  function getFilteredRowsWithIndexes() {
    return rows
      .map((row, index) => ({ row, index }))
      .filter(item => isRowInDateRange(item.row))
      .filter(item => isRowMatchingTextFilters(item.row));
  }

  function formatDateLabel(value) {
    if (!value) return '';
    return value.split('-').reverse().join('/');
  }

  function updateFilterNote() {
    const note = document.getElementById('activeFilterNote');
    if (!note) return;

    const { from, to } = getDateFilters();
    const search = document.getElementById('rowsSearchInput')?.value.trim() || '';
    const product = getProductFilterValue();
    const filteredCount = getFilteredRowsWithIndexes().length;

    const activeParts = [];

    if (from || to) {
      const fromLabel = from ? formatDateLabel(from) : 'بداية السجل';
      const toLabel = to ? formatDateLabel(to) : 'نهاية السجل';
      activeParts.push(`الفترة من ${fromLabel} إلى ${toLabel}`);
    }

    if (product) activeParts.push(`المنتج: ${product}`);
    if (search) activeParts.push(`بحث: ${search}`);

    if (!activeParts.length) {
      note.textContent = 'الملخص يعرض كل الأيام وكل المنتجات.';
      return;
    }

    const fixedExpenseNote = (from || to)
      ? 'صافي المكسب هنا بدون خصم المصاريف الثابتة.'
      : 'عند عدم اختيار تاريخ يتم خصم المصاريف الثابتة من صافي المكسب.';

    note.textContent = `الملخص وسجل العمليات محسوبين حسب: ${activeParts.join(' — ')} — عدد العمليات: ${filteredCount}. ${fixedExpenseNote}`;
  }

  function applyFilters(keepQuickValue = false) {
    const quickFilter = document.getElementById('quickDateFilter');
    if (quickFilter && !keepQuickValue) {
      quickFilter.value = 'custom';
    }

    render();
  }

  function setQuickDateFilter(value) {
    const fromInput = document.getElementById('filterFromDate');
    const toInput = document.getElementById('filterToDate');
    const now = new Date();

    if (value === 'all') {
      fromInput.value = '';
      toInput.value = '';
    }

    if (value === 'today') {
      const d = today();
      fromInput.value = d;
      toInput.value = d;
    }

    if (value === 'yesterday') {
      const d = dateToISO(addDays(now, -1));
      fromInput.value = d;
      toInput.value = d;
    }

    if (value === 'last7') {
      fromInput.value = dateToISO(addDays(now, -6));
      toInput.value = today();
    }

    if (value === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      fromInput.value = dateToISO(firstDay);
      toInput.value = today();
    }

    applyFilters(true);
  }

  function clearDateFilters() {
    document.getElementById('filterFromDate').value = '';
    document.getElementById('filterToDate').value = '';
    document.getElementById('quickDateFilter').value = 'all';
    render();
  }

  function applyRowTextFilters() {
    render();
  }

  function clearRowTextFilters() {
    const searchInput = document.getElementById('rowsSearchInput');
    const productSelect = document.getElementById('productFilterSelect');

    if (searchInput) searchInput.value = '';
    if (productSelect) productSelect.value = '';

    render();
  }

  function renderProductFilterOptions() {
    const select = document.getElementById('productFilterSelect');
    if (!select) return;

    const current = select.value;
    const names = [...new Set([
      ...rows.map(row => row.item),
      ...presets.map(preset => preset.item)
    ].map(value => String(value || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ar', { sensitivity: 'base' }));

    select.innerHTML = '<option value="">كل المنتجات</option>';

    names.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    if (names.includes(current)) {
      select.value = current;
    } else {
      select.value = '';
    }
  }

  function setDailyReportToday() {
    const input = document.getElementById('dailyReportDate');
    if (!input) return;
    input.value = today();
    renderDailyReport();
  }

  function renderDailyReport() {
    const input = document.getElementById('dailyReportDate');
    if (!input) return;

    if (!input.value) input.value = today();

    const selectedDate = input.value;
    const dayRows = rows.filter(row => String(row.date || '').slice(0, 10) === selectedDate);

    const income = dayRows.reduce((sum, row) => sum + (Number(row.paid) || 0), 0);
    const expense = dayRows.reduce((sum, row) => sum + (Number(row.deducted) || 0), 0);
    const profit = income - expense;

    document.getElementById('dailyIncomeTotal').innerHTML = `${fmt(income)}<span class="unit">EGP</span>`;
    document.getElementById('dailyExpenseTotal').innerHTML = `${fmt(expense)}<span class="unit">EGP</span>`;

    const profitEl = document.getElementById('dailyProfitTotal');
    profitEl.innerHTML = `${fmt(profit)}<span class="unit">EGP</span>`;
    profitEl.className = profit >= 0 ? 'value profit' : 'value loss';

    const productMap = new Map();
    dayRows.forEach(row => {
      const key = row.item || 'غير محدد';
      const current = productMap.get(key) || { count: 0, income: 0, expense: 0, profit: 0 };
      current.count += 1;
      current.income += Number(row.paid) || 0;
      current.expense += Number(row.deducted) || 0;
      current.profit += calcProfit(row);
      productMap.set(key, current);
    });

    const topProduct = [...productMap.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].profit - a[1].profit)[0];

    const productEl = document.getElementById('dailyTopProduct');
    const productMetaEl = document.getElementById('dailyTopProductMeta');

    if (!topProduct) {
      productEl.textContent = '-';
      productMetaEl.textContent = 'لا يوجد عمليات في هذا اليوم.';
    } else {
      productEl.textContent = topProduct[0];
      productMetaEl.textContent = `${topProduct[1].count} عملية — ربح ${fmt(topProduct[1].profit)} EGP`;
    }
  }

  function getTopOffersData(limit = 10) {
    const map = new Map();

    getFilteredRowsWithIndexes().forEach(({ row }) => {
      const item = row.item || 'غير محدد';
      const offer = row.offer || 'بدون عرض';
      const key = `${item}|||${offer}`;
      const current = map.get(key) || { item, offer, count: 0, income: 0, expense: 0, profit: 0 };

      current.count += 1;
      current.income += Number(row.paid) || 0;
      current.expense += Number(row.deducted) || 0;
      current.profit += calcProfit(row);

      map.set(key, current);
    });

    return [...map.values()]
      .sort((a, b) => b.profit - a.profit || b.count - a.count || b.income - a.income)
      .slice(0, limit);
  }

  function renderTopOffers() {
    const body = document.getElementById('topOffersBody');
    if (!body) return;

    const topOffers = getTopOffersData(10);
    body.innerHTML = '';

    if (!topOffers.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty" style="display:table-cell;padding:1rem">لا يوجد عمليات لحساب أفضل العروض.</td></tr>';
      return;
    }

    topOffers.forEach((offer, index) => {
      const profitClass = offer.profit >= 0 ? 'profit-val' : 'loss-val';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="#">${index + 1}</td>
        <td data-label="المنتج">${escapeHTML(offer.item)}</td>
        <td data-label="العرض">${escapeHTML(offer.offer)}</td>
        <td data-label="عدد العمليات">${offer.count}</td>
        <td data-label="إجمالي الدخل"><span class="num paid-val">${fmt(offer.income)}</span></td>
        <td data-label="إجمالي المصروف"><span class="num deducted-val">${fmt(offer.expense)}</span></td>
        <td data-label="إجمالي الربح"><span class="num ${profitClass}">${fmt(offer.profit)}</span></td>
      `;
      body.appendChild(tr);
    });
  }

  function toggleRowsSection(button) {
    const table = document.getElementById('tableContent');
    const preview = document.getElementById('latestRowsPreview');

    table.classList.toggle('hidden-section');

    const isHidden = table.classList.contains('hidden-section');
    preview.classList.toggle('hidden-section', !isHidden);

    if (button) {
      button.textContent = isHidden ? 'إظهار' : 'إخفاء';
    }

    if (isHidden) {
      renderLatestRowsPreview();
    }

    saveSectionState();
  }

  function renderLatestRowsPreview() {
    const preview = document.getElementById('latestRowsPreview');
    if (!preview) return;

    const visibleRows = getFilteredRowsWithIndexes();
    const lastTwo = visibleRows.slice(-2).reverse();
    const title = hasActiveDateFilter() ? 'آخر عمليتين داخل الفلتر' : 'آخر عمليتين مسجلتين';

    if (!lastTwo.length) {
      preview.innerHTML = `
        <div class="preview-head">${title}</div>
        <div class="empty" style="display:block;padding:1rem">لا يوجد عمليات لعرضها.</div>
      `;
      return;
    }

    preview.innerHTML = `
      <div class="preview-head">${title}</div>
      <div class="preview-list">
        ${lastTwo.map(({ row }) => {
          const profit = calcProfit(row);
          const profitClass = profit >= 0 ? 'profit-val' : 'loss-val';

          return `
            <div class="preview-item">
              <div class="preview-title">${escapeHTML(row.item)} — ${escapeHTML(row.offer)}</div>
              <div class="preview-meta">
                التاريخ: ${escapeHTML(row.date || '-')}<br>
                الداخل: <span class="num paid-val">${fmt(row.paid)}</span> EGP — المصروف: <span class="num deducted-val">${fmt(row.deducted)}</span> EGP<br>
                الربح: <span class="num ${profitClass}">${fmt(profit)}</span> EGP
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderExpenses() {
    const body = document.getElementById('expenseBody');
    if (!body) return;

    body.innerHTML = '';

    expenses.forEach((item, index) => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td data-label="#">${index + 1}</td>

        <td data-label="بند المصروف">
          <input
            class="editable"
            value="${escapeHTML(item.name)}"
            onchange="updateExpense(${index}, 'name', this.value)"
          >
        </td>

        <td data-label="القيمة">
          <input
            class="editable num deducted-val"
            type="number"
            step="0.01"
            value="${Number(item.amount) || 0}"
            onchange="updateExpense(${index}, 'amount', this.value)"
          >
        </td>

        <td data-label="إجراء">
          <button class="delete-btn" onclick="deleteExpense(${index})">حذف</button>
        </td>
      `;

      body.appendChild(tr);
    });
  }

  function addExpense() {
    const nameInput = document.getElementById('expenseNameInput');
    const amountInput = document.getElementById('expenseAmountInput');

    const name = nameInput.value.trim();
    const amount = parseFloat(amountInput.value);

    if (!name) {
      alert('اكتب اسم المصروف.');
      nameInput.focus();
      return;
    }

    if (Number.isNaN(amount) || amount < 0) {
      alert('اكتب قيمة المصروف بشكل صحيح.');
      amountInput.focus();
      return;
    }

    expenses.push({
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      amount,
      createdAt: new Date().toISOString()
    });

    saveExpenses();
    renderExpenses();
    render();

    nameInput.value = '';
    amountInput.value = '';

    showToast('✅ تم إضافة المصروف.');
  }

  function updateExpense(index, key, value) {
    if (!expenses[index]) return;

    if (key === 'amount') {
      expenses[index][key] = parseFloat(value) || 0;
    } else {
      expenses[index][key] = value;
    }

    saveExpenses();
    renderExpenses();
    render();
  }

  function deleteExpense(index) {
    if (!expenses[index]) return;

    const confirmed = confirm('⚠️ هل تريد حذف هذا المصروف؟');
    if (!confirmed) return;

    const deleted = expenses.splice(index, 1);
    pushDeleted('expenses', deleted, 'مصروف ثابت');

    saveExpenses();
    renderExpenses();
    render();

    showToast('✅ تم حذف المصروف. يمكنك استرجاعه.');
  }

  function clearExpenses() {
    if (!expenses.length) {
      showToast('ℹ️ لا يوجد مصاريف لمسحها.');
      return;
    }

    if (!requirePasswordForAction('مسح كل المصاريف الثابتة')) return;

    const confirmed = confirm('⚠️ هل تريد مسح كل المصاريف الثابتة؟');
    if (!confirmed) return;

    pushDeleted('expenses', [...expenses], 'كل المصاريف الثابتة');

    expenses = [];
    saveExpenses();
    renderExpenses();
    render();

    showToast('✅ تم مسح المصاريف. يمكنك استرجاعها.');
  }

  function renderPresetSelect() {
    const searchValue = normalizeText(document.getElementById('presetSearchInput')?.value || '');
    const select = document.getElementById('presetSelect');

    if (!select) return;
    select.innerHTML = '<option value="">— اختار عرض: المنتج / الخدمة + العرض + الداخل للمحفظة —</option>';

    presets.forEach((preset, index) => {
      const label = presetDropdownLabel(preset);
      const searchable = normalizeText(`${preset.item || ''} ${preset.offer || ''} ${preset.paid || ''} ${preset.deducted || ''} ${calcProfit(preset)}`);

      if (searchValue && !searchable.includes(searchValue)) return;

      const color = getServiceColor(preset.item);
      const option = document.createElement('option');
      option.value = index;
      option.textContent = label;
      option.title = label;
      option.style.background = hexToRgba(color, .18);
      option.style.color = '#e2e8f0';
      select.appendChild(option);
    });

    updatePresetSelectColorPreview();
  }

  function renderPresetList() {
    const body = document.getElementById('presetListBody');
    body.innerHTML = '';

    presets.forEach((preset, index) => {
      const profit = calcProfit(preset);
      const profitClass = profit >= 0 ? 'profit-val' : 'loss-val';
      const serviceColor = getServiceColor(preset.item);

      const tr = document.createElement('tr');
      tr.style.setProperty('--service-color', serviceColor);

      tr.innerHTML = `
        <td data-label="#">${index + 1}</td>

        <td data-label="المنتج / الخدمة">
          <div class="service-name-cell">
            <span class="service-dot" style="--service-color:${serviceColor}"></span>
            <input
              class="editable preset-edit-input"
              value="${escapeHTML(preset.item)}"
              onchange="updatePreset(${index}, 'item', this.value)"
            >
          </div>
        </td>

        <td data-label="العرض">
          <input
            class="editable preset-edit-input"
            value="${escapeHTML(preset.offer)}"
            onchange="updatePreset(${index}, 'offer', this.value)"
          >
        </td>

        <td data-label="الداخل للمحفظة">
          <input
            class="editable num paid-val preset-edit-input"
            type="number"
            step="0.01"
            value="${Number(preset.paid) || 0}"
            onchange="updatePreset(${index}, 'paid', this.value)"
          >
        </td>

        <td data-label="مصروف العملية">
          <input
            class="editable num deducted-val preset-edit-input"
            type="number"
            step="0.01"
            value="${Number(preset.deducted) || 0}"
            onchange="updatePreset(${index}, 'deducted', this.value)"
          >
        </td>

        <td data-label="ربح العملية"><span class="num ${profitClass}">${fmt(profit)}</span></td>

        <td data-label="ترتيب">
          <div class="inline-actions">
            <button class="small-btn" onclick="movePreset(${index}, -1)" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="small-btn" onclick="movePreset(${index}, 1)" ${index === presets.length - 1 ? 'disabled' : ''}>↓</button>
          </div>
        </td>

        <td data-label="إجراء">
          <button class="delete-btn" onclick="deletePreset(${index})">حذف</button>
        </td>
      `;

      body.appendChild(tr);
    });
  }

  function renderPresets() {
    renderPresetSelect();
    renderPresetList();
    renderServiceColorEditor();
  }

  function getPresetFormValues() {
    const itemInput = document.getElementById('presetItemInput');
    const offerInput = document.getElementById('presetOfferInput');
    const paidInput = document.getElementById('presetPaidInput');
    const deductedInput = document.getElementById('presetDeductedInput');

    const item = itemInput.value.trim();
    const offer = offerInput.value.trim();
    const paid = parseFloat(paidInput.value);
    const deducted = parseFloat(deductedInput.value);

    if (!item) {
      alert('اكتب اسم المنتج / الخدمة.');
      itemInput.focus();
      return null;
    }

    if (!offer) {
      alert('اكتب العرض.');
      offerInput.focus();
      return null;
    }

    if (Number.isNaN(paid) || paid < 0) {
      alert('اكتب الداخل للمحفظة بشكل صحيح.');
      paidInput.focus();
      return null;
    }

    if (Number.isNaN(deducted) || deducted < 0) {
      alert('اكتب مصروف العملية بشكل صحيح.');
      deductedInput.focus();
      return null;
    }

    return { item, offer, paid, deducted };
  }

  function addPreset() {
    const values = getPresetFormValues();
    if (!values) return;

    presets.push(createPresetObject(values.item, values.offer, values.paid, values.deducted));
    getServiceColor(values.item);
    saveServiceColors();

    savePresets();
    renderPresets();

    document.getElementById('presetItemInput').value = '';
    document.getElementById('presetOfferInput').value = '';
    document.getElementById('presetPaidInput').value = '';
    document.getElementById('presetDeductedInput').value = '';

    showToast('✅ تم حفظ العرض في مكتبة العروض.');
  }

  function deletePreset(index) {
    if (!presets[index]) return;

    const confirmed = confirm('⚠️ هل تريد حذف هذا العرض من مكتبة العروض؟');
    if (!confirmed) return;

    const deleted = presets.splice(index, 1);
    pushDeleted('presets', deleted, 'عرض محفوظ');

    savePresets();
    renderPresets();

    showToast('✅ تم حذف العرض. يمكنك استرجاعه من زر استرجاع آخر حذف.');
  }

  function clearPresets() {
    if (!presets.length) {
      showToast('ℹ️ لا يوجد عروض محفوظة.');
      return;
    }

    if (!requirePasswordForAction('مسح كل العروض المحفوظة')) return;

    const confirmed = confirm('⚠️ هل تريد مسح كل العروض المحفوظة؟');
    if (!confirmed) return;

    pushDeleted('presets', [...presets], 'كل العروض المحفوظة');

    presets = [];
    savePresets();
    renderPresets();

    showToast('✅ تم مسح العروض المحفوظة. يمكنك استرجاعها.');
  }

  function updatePreset(index, key, value) {
    if (!presets[index]) return;

    if (key === 'paid' || key === 'deducted') {
      presets[index][key] = parseFloat(value) || 0;
    } else {
      presets[index][key] = value;
    }

    if (key === 'item') {
      getServiceColor(value);
      saveServiceColors();
    }

    presets[index].updatedAt = new Date().toISOString();

    savePresets();
    renderPresets();

    showToast('✅ تم تعديل العرض المحفوظ.');
  }

  function movePreset(index, direction) {
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= presets.length) return;

    const temp = presets[index];
    presets[index] = presets[newIndex];
    presets[newIndex] = temp;

    savePresets();
    renderPresets();

    const select = document.getElementById('presetSelect');
    if (select) {
      select.value = String(newIndex);
    }
  }

  function moveSelectedPreset(direction) {
    const select = document.getElementById('presetSelect');
    const index = select.value;

    if (index === '') {
      alert('اختار عرض من القائمة الأول.');
      return;
    }

    movePreset(Number(index), direction);
  }

  function sortPresets(type) {
    if (!type || type === 'manual') return;

    const collator = new Intl.Collator('ar', {
      numeric: true,
      sensitivity: 'base'
    });

    presets.sort((a, b) => {
      if (type === 'itemAsc') {
        return collator.compare(a.item || '', b.item || '') || collator.compare(a.offer || '', b.offer || '');
      }

      if (type === 'offerAsc') {
        return collator.compare(a.offer || '', b.offer || '') || collator.compare(a.item || '', b.item || '');
      }

      if (type === 'paidAsc') {
        return (Number(a.paid) || 0) - (Number(b.paid) || 0);
      }

      if (type === 'paidDesc') {
        return (Number(b.paid) || 0) - (Number(a.paid) || 0);
      }

      if (type === 'profitDesc') {
        return calcProfit(b) - calcProfit(a);
      }

      if (type === 'profitAsc') {
        return calcProfit(a) - calcProfit(b);
      }

      return 0;
    });

    savePresets();
    renderPresets();

    document.getElementById('presetSortSelect').value = 'manual';
    showToast('✅ تم ترتيب العروض المحفوظة.');
  }

  function getSelectedPreset() {
    const select = document.getElementById('presetSelect');
    const index = select.value;

    if (index === '') {
      alert('اختار عرض من القائمة الأول.');
      return null;
    }

    return presets[Number(index)] || null;
  }

  function addSelectedPresetToRows() {
    const preset = getSelectedPreset();
    if (!preset) return;

    rows.push(createRowObject(today(), preset.item, preset.offer, preset.paid, preset.deducted));
    saveRows();
    render();

    showToast('✅ تم إضافة العرض المختار للعمليات بتاريخ اليوم.');
  }

  function fillManualFromPreset() {
    const preset = getSelectedPreset();
    if (!preset) return;

    document.getElementById('dateInput').value = today();
    document.getElementById('itemInput').value = preset.item;
    document.getElementById('offerInput').value = preset.offer;
    document.getElementById('paidInput').value = preset.paid;
    document.getElementById('deductedInput').value = preset.deducted;

    showToast('✅ تم تعبئة العرض في نموذج الإضافة اليدوية.');
  }

  function saveCurrentManualAsPreset() {
    const itemInput = document.getElementById('itemInput');
    const offerInput = document.getElementById('offerInput');
    const paidInput = document.getElementById('paidInput');
    const deductedInput = document.getElementById('deductedInput');

    const item = itemInput.value.trim();
    const offer = offerInput.value.trim();
    const paid = parseFloat(paidInput.value);
    const deducted = parseFloat(deductedInput.value);

    if (!item) {
      alert('اكتب اسم المنتج / الخدمة الأول.');
      itemInput.focus();
      return;
    }

    if (!offer) {
      alert('اكتب العرض الأول.');
      offerInput.focus();
      return;
    }

    if (Number.isNaN(paid) || paid < 0) {
      alert('اكتب الداخل للمحفظة بشكل صحيح.');
      paidInput.focus();
      return;
    }

    if (Number.isNaN(deducted) || deducted < 0) {
      alert('اكتب مصروف العملية بشكل صحيح.');
      deductedInput.focus();
      return;
    }

    presets.push(createPresetObject(item, offer, paid, deducted));
    getServiceColor(item);
    saveServiceColors();
    savePresets();
    renderPresets();

    showToast('✅ تم حفظ العملية الحالية كعرض سريع.');
  }

  function render() {
    applyRowsViewOptions();
    const body = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    const visibleRows = getFilteredRowsWithIndexes();

    body.innerHTML = '';

    let walletTotal = 0;
    let operationExpensesTotal = 0;

    visibleRows.forEach(({ row, index }, displayIndex) => {
      const paid = Number(row.paid) || 0;
      const deducted = Number(row.deducted) || 0;
      const profit = paid - deducted;

      walletTotal += paid;
      operationExpensesTotal += deducted;

      const profitClass = profit >= 0 ? 'profit-val' : 'loss-val';
      const rowServiceColor = getServiceColor(row.item);

      const tr = document.createElement('tr');
      tr.style.setProperty('--row-service-color', rowServiceColor);

      tr.innerHTML = `
        <td data-label="#">${displayIndex + 1}</td>

        <td data-label="التاريخ">
          <input
            class="editable"
            type="date"
            value="${escapeHTML(row.date || '')}"
            onchange="updateRow(${index}, 'date', this.value)"
          >
        </td>

        <td data-label="المنتج / الخدمة">
          <input
            class="editable"
            value="${escapeHTML(row.item)}"
            onchange="updateRow(${index}, 'item', this.value)"
          >
        </td>

        <td data-label="العرض">
          <input
            class="editable"
            value="${escapeHTML(row.offer)}"
            onchange="updateRow(${index}, 'offer', this.value)"
          >
        </td>

        <td data-label="الداخل للمحفظة">
          <input
            class="editable num paid-val"
            type="number"
            step="0.01"
            value="${paid}"
            onchange="updateRow(${index}, 'paid', this.value)"
          >
        </td>

        <td data-label="مصروف العملية">
          <input
            class="editable num deducted-val"
            type="number"
            step="0.01"
            value="${deducted}"
            onchange="updateRow(${index}, 'deducted', this.value)"
          >
        </td>

        <td data-label="ربح العملية">
          <span class="num ${profitClass}">${fmt(profit)}</span>
          <span class="unit">EGP</span>
        </td>

        <td data-label="إجراء">
          <button class="delete-btn" onclick="deleteRow(${index})">حذف</button>
        </td>
      `;

      body.appendChild(tr);
    });

    const fixedExpensesTotal = totalFixedExpenses();
    const activeDateFilter = hasActiveDateFilter();

    // إجمالي المصاريف المعروض = مصاريف العمليات داخل الفلتر فقط
    const visibleExpensesTotal = operationExpensesTotal;

    // عند فلترة يوم أو فترة: صافي المكسب = دخل العمليات - مصاريف العمليات فقط
    // عند عرض كل الأيام: صافي المكسب الكامل = دخل العمليات - مصاريف العمليات - المصاريف الثابتة
    const profitTotal = activeDateFilter
      ? walletTotal - operationExpensesTotal
      : walletTotal - operationExpensesTotal - fixedExpensesTotal;

    const walletDollarRate = parseFloat(document.getElementById('walletDollarRate').value) || 0;
    const expensesDollarRate = parseFloat(document.getElementById('expensesDollarRate').value) || 0;

    const walletUsdTotal = walletDollarRate > 0 ? walletTotal / walletDollarRate : 0;
    const expensesUsdTotal = expensesDollarRate > 0 ? visibleExpensesTotal / expensesDollarRate : 0;

    document.getElementById('countTotal').textContent = visibleRows.length;

    document.getElementById('walletTotal').innerHTML =
      `${fmt(walletTotal)}<span class="unit">EGP</span>`;

    document.getElementById('expensesTotal').innerHTML =
      `${fmt(visibleExpensesTotal)}<span class="unit">EGP</span>`;

    document.getElementById('walletUsdTotal').innerHTML =
      `${fmt(walletUsdTotal)}<span class="unit">USD</span>`;

    document.getElementById('expensesUsdTotal').innerHTML =
      `${fmt(expensesUsdTotal)}<span class="unit">USD</span>`;

    const profitLabelEl = document.getElementById('profitLabel');
    if (profitLabelEl) {
      profitLabelEl.textContent = activeDateFilter
        ? 'صافي مكسب الفترة بدون المصاريف الثابتة'
        : 'صافي المكسب بعد المصاريف الثابتة';
    }

    const profitTotalEl = document.getElementById('profitTotal');
    profitTotalEl.innerHTML = `${fmt(profitTotal)}<span class="unit">EGP</span>`;
    profitTotalEl.className = profitTotal >= 0 ? 'value profit' : 'value loss';

    emptyState.style.display = visibleRows.length ? 'none' : 'block';

    renderProductFilterOptions();
    updateFilterNote();
    renderLatestRowsPreview();
    renderDailyReport();
    renderTopOffers();
  }

  function addRow() {
    const dateInput = document.getElementById('dateInput');
    const itemInput = document.getElementById('itemInput');
    const offerInput = document.getElementById('offerInput');
    const paidInput = document.getElementById('paidInput');
    const deductedInput = document.getElementById('deductedInput');

    const date = dateInput.value || today();
    const item = itemInput.value.trim();
    const offer = offerInput.value.trim();
    const paid = parseFloat(paidInput.value);
    const deducted = parseFloat(deductedInput.value);

    if (!item) {
      alert('اكتب اسم المنتج / الخدمة.');
      itemInput.focus();
      return;
    }

    if (!offer) {
      alert('اكتب العرض.');
      offerInput.focus();
      return;
    }

    if (Number.isNaN(paid) || paid < 0) {
      alert('اكتب الداخل للمحفظة بشكل صحيح.');
      paidInput.focus();
      return;
    }

    if (Number.isNaN(deducted) || deducted < 0) {
      alert('اكتب مصروف العملية بشكل صحيح.');
      deductedInput.focus();
      return;
    }

    rows.push(createRowObject(date, item, offer, paid, deducted));

    saveRows();
    render();

    dateInput.value = today();
    itemInput.value = '';
    offerInput.value = '';
    paidInput.value = '';
    deductedInput.value = '';

    itemInput.focus();

    showToast('✅ تم إضافة العملية بنجاح.');
  }

  function duplicateLastRow() {
    if (!rows.length) {
      showToast('ℹ️ لا يوجد عملية سابقة لتكرارها.');
      return;
    }

    const last = rows[rows.length - 1];
    rows.push(createRowObject(today(), last.item, last.offer, last.paid, last.deducted));
    saveRows();
    render();

    showToast('✅ تم تكرار آخر عملية بتاريخ اليوم.');
  }

  function updateRow(index, key, value) {
    if (!rows[index]) return;

    if (key === 'paid' || key === 'deducted') {
      rows[index][key] = parseFloat(value) || 0;
    } else {
      rows[index][key] = value;
    }

    saveRows();
    render();
  }

  function deleteRow(index) {
    if (!rows[index]) return;

    const confirmed = confirm('⚠️ هل تريد حذف هذه العملية؟');
    if (!confirmed) return;

    const deleted = rows.splice(index, 1);
    pushDeleted('rows', deleted, 'عملية من سجل العمليات');

    saveRows();
    render();

    showToast('✅ تم حذف العملية. يمكنك استرجاعها.');
  }

  function clearAll() {
    if (!rows.length) {
      showToast('ℹ️ لا يوجد بيانات لمسحها.');
      return;
    }

    if (!requirePasswordForAction('مسح كل عمليات السجل')) return;

    const confirmed = confirm('⚠️ هل تريد مسح كل عمليات السجل؟');
    if (!confirmed) return;

    pushDeleted('rows', [...rows], 'كل عمليات السجل');

    rows = [];
    saveRows();
    render();

    showToast('✅ تم مسح كل العمليات. يمكنك استرجاعها.');
  }

  function exportCSV() {
    const exportRows = rowsToExport();

    if (!exportRows.length) {
      showToast(hasActiveDateFilter() ? '⚠️ لا يوجد بيانات داخل الفلتر للتصدير.' : '⚠️ لا يوجد بيانات للتصدير.');
      return;
    }

    const headers = [
      'date',
      'item',
      'offer',
      'wallet_egp',
      'operation_expense_egp',
      'operation_profit_egp'
    ];

    const csvRows = exportRows.map(row => {
      const profit = calcProfit(row);

      return [
        row.date,
        row.item,
        row.offer,
        row.paid,
        row.deducted,
        profit
      ];
    });

    const csv = [headers, ...csvRows]
      .map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = hasActiveDateFilter() ? `profit-report-filtered-${today()}.csv` : `profit-report-${today()}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function rowsToExport() {
    return getFilteredRowsWithIndexes().map(item => item.row);
  }

  function buildReportHTML(exportRows, title) {
    const income = exportRows.reduce((sum, row) => sum + (Number(row.paid) || 0), 0);
    const expense = exportRows.reduce((sum, row) => sum + (Number(row.deducted) || 0), 0);
    const profit = income - expense;

    const rowsHTML = exportRows.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHTML(row.date || '')}</td>
        <td>${escapeHTML(row.item || '')}</td>
        <td>${escapeHTML(row.offer || '')}</td>
        <td>${fmt(row.paid)}</td>
        <td>${fmt(row.deducted)}</td>
        <td>${fmt(calcProfit(row))}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHTML(title)}</title>
        <style>
          body{font-family:Arial,Tahoma,sans-serif;direction:rtl;padding:20px;color:#111}
          h1{font-size:22px;margin-bottom:8px}
          .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:15px 0}
          .card{border:1px solid #ddd;border-radius:10px;padding:10px}
          .label{color:#666;font-size:12px;margin-bottom:5px}
          .value{font-size:18px;font-weight:bold}
          table{width:100%;border-collapse:collapse;margin-top:15px;font-size:12px}
          th,td{border:1px solid #ddd;padding:7px;text-align:right}
          th{background:#f3f4f6}
          @media print{button{display:none}}
        

    /* ===== MOX Pro Mobile Compact UI ===== */
    :root {
      --radius: 14px;
      --soft-shadow: 0 10px 26px rgba(0,0,0,.18);
    }

    body {
      font-size: 14px;
    }

    .page {
      max-width: 1180px;
    }

    .header {
      margin: .65rem 0 1rem;
    }

    .logo-box {
      width: 64px;
      height: 64px;
      border-radius: 18px;
    }

    .header h1 {
      font-size: clamp(1.55rem, 3.2vw, 2.35rem);
    }

    .header p,
    .section-subtitle,
    .filter-note,
    .security-note,
    .footer-note {
      font-size: .68rem;
      line-height: 1.65;
    }

    .section-head {
      padding: .62rem .78rem;
      border-radius: 14px;
      box-shadow: var(--soft-shadow);
    }

    .section-title {
      font-size: .88rem;
    }

    .panel,
    .card,
    .table-wrap,
    .latest-preview,
    .stat-card {
      border-radius: 14px;
      box-shadow: var(--soft-shadow);
    }

    .panel,
    .filter-panel {
      padding: .78rem;
    }

    .summary {
      grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
      gap: .55rem;
    }

    .card {
      padding: .72rem;
    }

    .card .label,
    .stat-card .label,
    .field label {
      font-size: .66rem;
    }

    .card .value,
    .stat-card .value {
      font-size: 1.02rem;
    }

    .field input,
    .field select,
    .textarea-input,
    .editable {
      padding: .55rem .65rem;
      border-radius: 10px;
      font-size: 14px;
    }

    input,
    select,
    textarea {
      font-size: 16px;
    }

    .btn,
    .toggle-btn {
      min-height: 38px;
      padding: .52rem .72rem;
      border-radius: 10px;
      font-size: .75rem;
    }

    table {
      font-size: .78rem;
      min-width: 840px;
    }

    th {
      padding: .55rem .6rem;
      font-size: .64rem;
    }

    td {
      padding: .48rem .6rem;
    }

    .editable {
      min-width: 92px;
      padding: .28rem .35rem;
    }

    .mobile-bottom-nav {
      max-width: 560px;
      margin: 0 auto;
      padding: .32rem !important;
      gap: .28rem !important;
      border-radius: 22px !important;
      background: rgba(10, 13, 22, .90) !important;
    }

    .mobile-nav-btn {
      min-height: 46px;
      border-radius: 15px;
      font-size: .58rem;
    }

    .mobile-nav-btn strong {
      font-size: .9rem;
    }

    @media(max-width: 760px) {
      body {
        font-size: 13px;
        padding: .58rem;
        padding-left: max(.58rem, var(--safe-left));
        padding-right: max(.58rem, var(--safe-right));
        padding-top: max(.58rem, var(--safe-top));
        padding-bottom: calc(5.45rem + var(--safe-bottom)) !important;
      }

      .header {
        margin: .15rem 0 .65rem;
        padding: .4rem 0 .1rem;
      }

      .logo-box {
        width: 54px;
        height: 54px;
        border-radius: 16px;
        margin-bottom: .38rem;
      }

      .header h1 {
        font-size: clamp(1.45rem, 8vw, 2rem);
      }

      .section {
        margin-bottom: .58rem;
      }

      .section-head {
        padding: .58rem .65rem;
        border-radius: 16px;
        gap: .42rem;
      }

      .section-title {
        font-size: .82rem;
      }

      .section-subtitle {
        display: none;
      }

      .panel,
      .filter-panel {
        padding: .62rem;
      }

      .summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: .45rem;
      }

      .card {
        min-height: auto;
        padding: .62rem;
      }

      .card .label,
      .stat-card .label,
      .field label,
      td::before {
        font-size: .6rem !important;
      }

      .card .value,
      .stat-card .value {
        font-size: .9rem;
      }

      .filter-grid,
      .preset-tools,
      .report-grid,
      .stats-grid,
      .preset-grid,
      .preset-add-grid,
      .expense-grid,
      .form-grid {
        gap: .45rem;
      }

      .field input,
      .field select,
      .textarea-input,
      .lock-card input {
        min-height: 40px;
        padding: .56rem .62rem;
        border-radius: 12px;
      }

      .btn,
      .toggle-btn {
        min-height: 40px;
        padding: .5rem .62rem;
        font-size: .72rem;
        border-radius: 12px;
      }

      tbody tr {
        border-radius: 15px;
        padding: .52rem;
        border-color: rgba(148,163,184,.14);
        background: rgba(18,22,36,.88);
      }

      td {
        padding: .28rem .05rem;
        font-size: .74rem;
      }

      .editable,
      .preset-edit-input {
        min-height: 36px;
        font-size: 16px;
        padding: .4rem .5rem;
      }

      .small-btn,
      .delete-btn {
        min-height: 34px;
        font-size: .68rem;
        border-radius: 10px;
        padding: .32rem .55rem;
      }

      .mobile-bottom-nav {
        left: max(.45rem, var(--safe-left)) !important;
        right: max(.45rem, var(--safe-right)) !important;
        bottom: max(.42rem, var(--safe-bottom)) !important;
        padding: .3rem !important;
        border-radius: 21px !important;
      }

      .mobile-nav-btn {
        min-height: 44px;
        padding: .32rem .18rem;
        border-radius: 14px;
        font-size: .55rem;
      }

      .mobile-nav-btn strong {
        font-size: .88rem;
      }

      .toast {
        position: fixed;
        top: max(.65rem, var(--safe-top));
        left: .65rem;
        right: .65rem;
        z-index: 2147483001;
        margin: 0;
        font-size: .72rem;
        padding: .68rem .78rem;
      }
    }

    @media(max-width: 380px) {
      .summary {
        grid-template-columns: 1fr 1fr;
      }

      .mobile-nav-btn span {
        font-size: .5rem;
      }
    }

  </style>
      </head>
      <body>
        <button onclick="window.print()">طباعة / حفظ PDF</button>
        <h1>${escapeHTML(title)}</h1>
        <p>تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}</p>
        <div class="summary">
          <div class="card"><div class="label">عدد العمليات</div><div class="value">${exportRows.length}</div></div>
          <div class="card"><div class="label">إجمالي الدخل</div><div class="value">${fmt(income)} EGP</div></div>
          <div class="card"><div class="label">إجمالي المصروف</div><div class="value">${fmt(expense)} EGP</div></div>
          <div class="card"><div class="label">صافي ربح العمليات</div><div class="value">${fmt(profit)} EGP</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th><th>التاريخ</th><th>المنتج</th><th>العرض</th><th>الدخل</th><th>المصروف</th><th>الربح</th>
            </tr>
          </thead>
          <tbody>${rowsHTML || '<tr><td colspan="7">لا يوجد بيانات</td></tr>'}</tbody>
        </table>
      </body>
      </html>
    `;
  }

  function exportExcel() {
    const exportRows = rowsToExport();

    if (!exportRows.length) {
      showToast('⚠️ لا يوجد بيانات للتصدير حسب الفلاتر الحالية.');
      return;
    }

    const html = buildReportHTML(exportRows, 'تقرير العمليات - Excel');
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `profit-report-${today()}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast('✅ تم تصدير ملف Excel.');
  }

  function exportPDF() {
    const exportRows = rowsToExport();

    if (!exportRows.length) {
      showToast('⚠️ لا يوجد بيانات للتصدير حسب الفلاتر الحالية.');
      return;
    }

    const html = buildReportHTML(exportRows, 'تقرير العمليات - PDF');
    const win = window.open('', '_blank');

    if (!win) {
      showToast('⚠️ المتصفح منع فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة وجرب تاني.');
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    win.onload = function () {
      win.focus();
      win.print();
    };

    showToast('✅ تم فتح نافذة الطباعة. اختار Save as PDF.');
  }


  function encodePassword(value) {
    try {
      return btoa(unescape(encodeURIComponent(String(value || ''))));
    } catch (e) {
      return String(value || '');
    }
  }

  function hasAppPassword() {
    return Boolean(localStorage.getItem(STORAGE_APP_PASSWORD));
  }

  function checkAppPassword(value) {
    return localStorage.getItem(STORAGE_APP_PASSWORD) === encodePassword(value);
  }

  function requirePasswordForAction(actionName) {
    if (!hasAppPassword()) return true;

    const value = prompt(`اكتب كلمة المرور لتأكيد: ${actionName || 'الإجراء'}`);
    if (value === null) return false;

    if (!checkAppPassword(value)) {
      alert('كلمة المرور غير صحيحة.');
      return false;
    }

    return true;
  }

  function setOrChangePassword() {
    if (hasAppPassword()) {
      const oldPassword = prompt('اكتب كلمة المرور الحالية لتغييرها أو حذفها:');
      if (oldPassword === null) return;

      if (!checkAppPassword(oldPassword)) {
        alert('كلمة المرور الحالية غير صحيحة.');
        return;
      }
    }

    const newPassword = prompt('اكتب كلمة المرور الجديدة. اتركها فارغة لإلغاء الحماية:');
    if (newPassword === null) return;

    if (!newPassword.trim()) {
      localStorage.removeItem(STORAGE_APP_PASSWORD);
      showToast('✅ تم إلغاء كلمة المرور.');
      return;
    }

    if (newPassword.trim().length < 4) {
      alert('كلمة المرور لازم تكون 4 حروف أو أرقام على الأقل.');
      return;
    }

    localStorage.setItem(STORAGE_APP_PASSWORD, encodePassword(newPassword.trim()));
    showToast('✅ تم حفظ كلمة المرور.');
  }

  function showLockScreen() {
    const screen = document.getElementById('lockScreen');
    if (!screen) return;

    document.body.classList.add('locked');
    screen.classList.remove('hidden-section');

    setTimeout(() => document.getElementById('lockPasswordInput')?.focus(), 80);
  }

  function hideLockScreen() {
    const screen = document.getElementById('lockScreen');
    if (!screen) return;

    document.body.classList.remove('locked');
    screen.classList.add('hidden-section');
    const input = document.getElementById('lockPasswordInput');
    const error = document.getElementById('lockError');
    if (input) input.value = '';
    if (error) error.textContent = '';
  }

  function unlockApp() {
    const input = document.getElementById('lockPasswordInput');
    const error = document.getElementById('lockError');
    const value = input?.value || '';

    if (checkAppPassword(value)) {
      hideLockScreen();
      showToast('✅ تم فتح الموقع.');
      return;
    }

    if (error) error.textContent = 'كلمة المرور غير صحيحة.';
    input?.focus();
  }

  function handleLockKey(event) {
    if (event.key === 'Enter') {
      unlockApp();
    }
  }

  function lockNow() {
    if (!hasAppPassword()) {
      showToast('ℹ️ فعّل كلمة مرور الأول من زر كلمة مرور.');
      return;
    }

    showLockScreen();
  }

  function initializePasswordProtection() {
    if (hasAppPassword()) {
      showLockScreen();
    }
  }


  function getOrCreateDeviceId() {
    let id = localStorage.getItem(STORAGE_SYNC_DEVICE_ID);
    if (!id) {
      id = `device_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(STORAGE_SYNC_DEVICE_ID, id);
    }
    return id;
  }

  function setCloudStatus(message, type) {
    const el = document.getElementById('cloudSyncStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `sync-status ${type || 'warn'}`.trim();
  }

  function updateLastSyncDisplay(value) {
    const input = document.getElementById('lastSyncDisplay');
    const stored = value || localStorage.getItem(STORAGE_LAST_SYNC_AT) || '';
    if (!input) return;
    input.value = stored ? new Date(stored).toLocaleString('ar-EG') : 'لم تتم بعد';
  }


  function getStoredFirebaseConfig() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_FIREBASE_CONFIG) || 'null');
    } catch (e) {
      return null;
    }
  }

  function getFirebaseConfig() {
    // نسخة ثابتة مدمجة داخل الموقع حتى لا يتوقف التطبيق بسبب config قديم محفوظ في localStorage.
    return { ...DEFAULT_FIREBASE_CONFIG };
  }

  function getActiveSyncCode() {
    // كود ثابت مدمج داخل الموقع: المستخدم لا يحتاج يكتبه كل مرة.
    return DEFAULT_SYNC_CODE;
  }

  function ensureFirebaseDefaultsSaved() {
    const config = getFirebaseConfig();
    const syncCode = getActiveSyncCode();

    // نكتب القيم الصحيحة فوق أي قيم قديمة كانت محفوظة بالغلط في المتصفح.
    localStorage.setItem(STORAGE_FIREBASE_CONFIG, JSON.stringify(config));
    localStorage.setItem(STORAGE_SYNC_CODE, syncCode);
    localStorage.setItem(STORAGE_SYNC_ENABLED, '1');
    cloudSyncEnabled = true;

    return { config, syncCode };
  }

  function fillFirebaseSettingsForm() {
    const configInput = document.getElementById('firebaseConfigInput');
    const syncCodeInput = document.getElementById('syncCodeInput');
    const { config, syncCode } = ensureFirebaseDefaultsSaved();

    if (configInput) {
      configInput.value = JSON.stringify(config, null, 2);
      configInput.readOnly = true;
    }

    if (syncCodeInput) {
      syncCodeInput.value = syncCode;
      syncCodeInput.readOnly = true;
    }

    updateLastSyncDisplay();
  }

  function extractFirebaseConfigText(raw) {
    const text = String(raw || '').trim();
    if (!text) return '';

    const match = text.match(/firebaseConfig\s*=\s*({[\s\S]*?})\s*;?/);
    if (match) return match[1];

    return text;
  }

  function parseFirebaseConfig(raw) {
    const text = extractFirebaseConfigText(raw);
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (e) {
      try {
        return Function(`"use strict"; return (${text});`)();
      } catch (error) {
        return null;
      }
    }
  }

  function normalizeSyncCode(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 80);
  }

  function saveFirebaseSettings(options = {}) {
    const { config, syncCode } = ensureFirebaseDefaultsSaved();

    const configInput = document.getElementById('firebaseConfigInput');
    const syncCodeInput = document.getElementById('syncCodeInput');

    if (configInput) {
      configInput.value = JSON.stringify(config, null, 2);
      configInput.readOnly = true;
    }

    if (syncCodeInput) {
      syncCodeInput.value = syncCode;
      syncCodeInput.readOnly = true;
    }

    setCloudStatus('الإعدادات جاهزة', 'ok');

    if (!isEnablingCloudSync && !options.noAutoStart) {
      setTimeout(() => autoStartCloudSyncIfEnabled(), 120);
    }

    if (!options.silent) showToast('✅ إعدادات المزامنة جاهزة ومثبتة داخل الموقع.');
    return true;
  }

  function getCloudDocPath() {
    const syncCode = getActiveSyncCode();
    if (!syncCode) return null;
    return { collection: 'moxSync', doc: syncCode };
  }

  async function initializeFirebaseSync() {
    const config = getFirebaseConfig();
    const path = getCloudDocPath();

    if (!config || !path) {
      setCloudStatus('الإعدادات ناقصة', 'warn');
      return false;
    }

    if (!window.firebase || !window.firebase.firestore) {
      setCloudStatus('Firebase غير محمل', 'error');
      showToast('⚠️ مكتبات Firebase لم يتم تحميلها. تأكد أن الجهاز متصل بالإنترنت.');
      return false;
    }

    try {
      const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(config);
      cloudDb = window.firebase.firestore(app);

      if (!window.__moxPersistenceTried) {
        window.__moxPersistenceTried = true;
        try {
          await cloudDb.enablePersistence({ synchronizeTabs: true });
        } catch (e) {
          console.warn('Firestore persistence warning:', e);
        }
      }

      cloudDocRef = cloudDb.collection(path.collection).doc(path.doc);
      return true;
    } catch (e) {
      console.error(e);
      setCloudStatus('خطأ اتصال', 'error');
      showToast('⚠️ حصل خطأ في تهيئة Firebase. راجع config.');
      return false;
    }
  }

  function makeCloudPayload(reason) {
    const fullBackup = makeBackupObject('cloud-full-sync');

    return {
      appName: 'Profit Calculator',
      format: 'mox-v2-cloud-full-backup-sync',
      version: 14,
      reason: reason || 'sync',
      updatedAt: new Date().toISOString(),
      clientId: getOrCreateDeviceId(),

      // نسخة كاملة بنفس منطق زر النسخة الاحتياطية
      backup: fullBackup,
      storageSnapshot: fullBackup.storageSnapshot || getAppLocalStorageSnapshot(),

      // حقول واضحة وسريعة للقراءة والتوافق مع النسخ القديمة
      rows,
      presets,
      expenses,
      serviceColors,
      deletedStack: getDeletedStack(),
      settings: {
        walletDollarRate: document.getElementById('walletDollarRate')?.value || localStorage.getItem(STORAGE_WALLET_DOLLAR_RATE) || '53',
        expensesDollarRate: document.getElementById('expensesDollarRate')?.value || localStorage.getItem(STORAGE_EXPENSES_DOLLAR_RATE) || '53'
      },
      totals: {
        rows: rows.length,
        presets: presets.length,
        expenses: expenses.length,
        storageKeys: Object.keys(fullBackup.storageSnapshot || {}).length
      }
    };
  }

  function applyCloudPayload(data) {
    if (!data || typeof data !== 'object') return false;

    isApplyingCloudData = true;

    try {
      let applied = false;

      // الشكل الجديد: السحابة تحمل نسخة Backup كاملة كأنك ضغطت زر نسخة احتياطية
      if (data.backup && typeof data.backup === 'object') {
        applied = applyBackupObject(data.backup) || applied;
      } else if (data.storageSnapshot && typeof data.storageSnapshot === 'object') {
        // توافق مع أي نسخة سحابية فيها snapshot كامل بدون backup wrapper
        Object.entries(data.storageSnapshot).forEach(([key, value]) => {
          if (key.startsWith('profit_')) {
            if (value === null || value === undefined) {
              localStorage.removeItem(key);
            } else {
              localStorage.setItem(key, String(value));
            }
          }
        });
        applied = true;
      }

      // توافق مع النسخ السحابية القديمة + ضمان الحقول الأساسية
      if (Array.isArray(data.rows)) {
        localStorage.setItem(STORAGE_ROWS, JSON.stringify(data.rows));
        applied = true;
      }

      if (Array.isArray(data.presets)) {
        localStorage.setItem(STORAGE_PRESETS, JSON.stringify(data.presets));
        applied = true;
      }

      if (Array.isArray(data.expenses)) {
        localStorage.setItem(STORAGE_EXPENSES, JSON.stringify(data.expenses));
        applied = true;
      }

      if (data.serviceColors && typeof data.serviceColors === 'object') {
        localStorage.setItem(STORAGE_SERVICE_COLORS, JSON.stringify(data.serviceColors));
        applied = true;
      }

      if (Array.isArray(data.deletedStack)) {
        localStorage.setItem(STORAGE_DELETED_STACK, JSON.stringify(data.deletedStack));
        applied = true;
      }

      if (data.settings) {
        if (data.settings.walletDollarRate !== undefined) {
          localStorage.setItem(STORAGE_WALLET_DOLLAR_RATE, data.settings.walletDollarRate);
        }

        if (data.settings.expensesDollarRate !== undefined) {
          localStorage.setItem(STORAGE_EXPENSES_DOLLAR_RATE, data.settings.expensesDollarRate);
        }
        applied = true;
      }

      // بعد تنزيل نسخة كاملة من جهاز آخر، نحافظ على إعدادات المزامنة الافتراضية شغالة
      ensureFirebaseDefaultsSaved();
      localStorage.setItem(STORAGE_SYNC_ENABLED, '1');

      if (data.updatedAt) {
        localStorage.setItem(STORAGE_LAST_SYNC_AT, data.updatedAt);
      }

      loadRows();
      loadPresets();
      loadExpenses();
      loadDollarRates();
      fillFirebaseSettingsForm();
      renderPresets();
      renderExpenses();
      render();
      updateLastSyncDisplay(data.updatedAt);

      return applied;
    } finally {
      isApplyingCloudData = false;
    }
  }

  async function uploadLocalDataToCloud(manual) {
    ensureFirebaseDefaultsSaved();
    fillFirebaseSettingsForm();

    if (!cloudDocRef) {
      const ok = await initializeFirebaseSync();
      if (!ok) return;
    }

    try {
      const payload = makeCloudPayload(manual ? 'manual-upload' : 'auto-sync');
      await cloudDocRef.set(payload);
      localStorage.setItem(STORAGE_LAST_SYNC_AT, payload.updatedAt);
      updateLastSyncDisplay(payload.updatedAt);
      setCloudStatus('متزامن', 'ok');
      if (manual) showToast('✅ تم رفع نسخة كاملة من بيانات الموقع للسحابة.');
    } catch (e) {
      console.error(e);
      setCloudStatus('فشل الرفع', 'error');
      if (manual) showToast('⚠️ فشل رفع البيانات. راجع الإنترنت أو صلاحيات Firestore.');
    }
  }

  async function downloadCloudDataToLocal() {
    ensureFirebaseDefaultsSaved();
    fillFirebaseSettingsForm();

    if (!cloudDocRef) {
      const ok = await initializeFirebaseSync();
      if (!ok) return;
    }

    try {
      const snap = await cloudDocRef.get();
      if (!snap.exists) {
        showToast('ℹ️ لا توجد بيانات على السحابة بهذا الكود.');
        return;
      }

      saveBeforeRestoreBackup();
      const applied = applyCloudPayload(snap.data());

      if (applied) {
        saveSafetyBackupIfUseful();
        setCloudStatus('تم التنزيل', 'ok');
        showToast('✅ تم تنزيل نسخة السحابة الكاملة على هذا الجهاز.');
      } else {
        showToast('⚠️ بيانات السحابة غير مناسبة.');
      }
    } catch (e) {
      console.error(e);
      setCloudStatus('فشل التنزيل', 'error');
      showToast('⚠️ فشل تنزيل البيانات. راجع الإنترنت أو صلاحيات Firestore.');
    }
  }

  async function enableCloudSync(options = {}) {
    if (cloudUnsubscribe && cloudDocRef && cloudSyncEnabled) {
      if (!options.silent) setCloudStatus('متزامن', 'ok');
      return;
    }

    isEnablingCloudSync = true;
    ensureFirebaseDefaultsSaved();
    fillFirebaseSettingsForm();
    isEnablingCloudSync = false;

    const ok = await initializeFirebaseSync();
    if (!ok) return;

    localStorage.setItem(STORAGE_SYNC_ENABLED, '1');
    cloudSyncEnabled = true;

    if (cloudUnsubscribe) {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }

    setCloudStatus('جاري الاتصال', 'warn');

    cloudUnsubscribe = cloudDocRef.onSnapshot(async (snap) => {
      try {
        if (!snap.exists) {
          setCloudStatus('إنشاء نسخة سحابية', 'warn');
          await uploadLocalDataToCloud(false);
          return;
        }

        const data = snap.data();
        const localLast = localStorage.getItem(STORAGE_LAST_SYNC_AT) || '';
        const remoteUpdatedAt = data.updatedAt || '';
        const sameDevice = data.clientId && data.clientId === getOrCreateDeviceId();

        if (sameDevice) {
          if (remoteUpdatedAt) {
            localStorage.setItem(STORAGE_LAST_SYNC_AT, remoteUpdatedAt);
            updateLastSyncDisplay(remoteUpdatedAt);
          }
          setCloudStatus('متزامن', 'ok');
          return;
        }

        if (remoteUpdatedAt && remoteUpdatedAt !== localLast) {
          saveBeforeRestoreBackup();
          applyCloudPayload(data);
          saveSafetyBackupIfUseful();
          setCloudStatus('استقبل تحديث', 'ok');
          showToast('✅ تم استلام تحديث من جهاز آخر.');
        } else {
          setCloudStatus('متزامن', 'ok');
        }
      } catch (e) {
        console.error(e);
        setCloudStatus('خطأ مزامنة', 'error');
      }
    }, (error) => {
      console.error(error);
      setCloudStatus('غير مصرح/خطأ', 'error');
      showToast('⚠️ فشل الاستماع للمزامنة. راجع Firestore Rules وكود المزامنة.');
    });

    // فحص احتياطي كل 15 ثانية بجانب onSnapshot، عشان لو iPhone علّق الاستماع مؤقتًا يرجع يلقط التحديثات
    if (window.__moxCloudHeartbeat) clearInterval(window.__moxCloudHeartbeat);
    window.__moxCloudHeartbeat = setInterval(async () => {
      try {
        if (!cloudDocRef || !cloudSyncEnabled || document.hidden) return;
        const snap = await cloudDocRef.get();
        if (!snap.exists) return;
        const data = snap.data();
        const localLast = localStorage.getItem(STORAGE_LAST_SYNC_AT) || '';
        const remoteUpdatedAt = data.updatedAt || '';
        const sameDevice = data.clientId && data.clientId === getOrCreateDeviceId();
        if (!sameDevice && remoteUpdatedAt && remoteUpdatedAt !== localLast) {
          saveBeforeRestoreBackup();
          applyCloudPayload(data);
          saveSafetyBackupIfUseful();
          setCloudStatus('تم تحديث البيانات', 'ok');
        }
      } catch (e) {
        console.warn('heartbeat sync warning:', e);
      }
    }, 15000);

    if (!options.silent) showToast('✅ تم تشغيل المزامنة السحابية.');
  }

  function disableCloudSync() {
    localStorage.setItem(STORAGE_SYNC_ENABLED, '0');
    cloudSyncEnabled = false;

    if (cloudUnsubscribe) {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }

    if (window.__moxCloudHeartbeat) {
      clearInterval(window.__moxCloudHeartbeat);
      window.__moxCloudHeartbeat = null;
    }

    setCloudStatus('متوقف', 'warn');
    showToast('⏸️ تم إيقاف المزامنة على هذا الجهاز فقط.');
  }

  function scheduleCloudSync(reason) {
    if (isApplyingCloudData) return;
    if (!cloudSyncEnabled && localStorage.getItem(STORAGE_SYNC_ENABLED) !== '1') return;

    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => {
      uploadLocalDataToCloud(false);
    }, 900);
  }

  async function syncNow() {
    ensureFirebaseDefaultsSaved();
    fillFirebaseSettingsForm();

    if (localStorage.getItem(STORAGE_SYNC_ENABLED) !== '1') {
      await enableCloudSync();
      return;
    }

    await uploadLocalDataToCloud(true);
  }


  async function autoStartCloudSyncIfEnabled() {
    // تشغيل تلقائي حقيقي عند فتح الموقع: لا يحتاج المستخدم يكتب config أو كود كل مرة
    fillFirebaseSettingsForm();
    ensureFirebaseDefaultsSaved();

    const hasConfig = Boolean(getFirebaseConfig());
    const hasSyncCode = Boolean(getActiveSyncCode());

    if (hasConfig && hasSyncCode) {
      localStorage.setItem(STORAGE_SYNC_ENABLED, '1');
      cloudSyncEnabled = true;
      await enableCloudSync({ silent: true });
      setCloudStatus('متزامن تلقائيًا', 'ok');
    } else {
      cloudSyncEnabled = false;
      setCloudStatus('غير متصل', 'warn');
    }
  }

  async function forceCloudReconnect() {
    try {
      ensureFirebaseDefaultsSaved();
      if (!cloudUnsubscribe || !cloudSyncEnabled) {
        await enableCloudSync({ silent: true });
      }
    } catch (e) {
      console.warn('Cloud reconnect skipped:', e);
    }
  }


  function makeBackupObject(label) {
    return {
      appName: 'Profit Calculator',
      format: 'mox-v2-full-backup',
      version: 14,
      label: label || 'backup',
      exportedAt: new Date().toISOString(),
      rows,
      presets,
      expenses,
      serviceColors,
      deletedStack: getDeletedStack(),
      settings: {
        walletDollarRate: document.getElementById('walletDollarRate')?.value || localStorage.getItem(STORAGE_WALLET_DOLLAR_RATE) || '53',
        expensesDollarRate: document.getElementById('expensesDollarRate')?.value || localStorage.getItem(STORAGE_EXPENSES_DOLLAR_RATE) || '53'
      },
      storageSnapshot: getAppLocalStorageSnapshot()
    };
  }

  function backupItemCount(backup) {
    if (!backup) return 0;
    return (Array.isArray(backup.rows) ? backup.rows.length : 0) +
      (Array.isArray(backup.presets) ? backup.presets.length : 0) +
      (Array.isArray(backup.expenses) ? backup.expenses.length : 0);
  }

  function saveSafetyBackupIfUseful() {
    const currentCount = rows.length + presets.length + expenses.length;
    if (!currentCount) return;

    let oldCount = 0;
    try {
      oldCount = backupItemCount(JSON.parse(localStorage.getItem(STORAGE_SAFETY_BACKUP)));
    } catch (e) {
      oldCount = 0;
    }

    if (currentCount >= oldCount) {
      localStorage.setItem(STORAGE_SAFETY_BACKUP, JSON.stringify(makeBackupObject('auto-safety-backup')));
    }
  }

  function saveBeforeRestoreBackup() {
    localStorage.setItem(STORAGE_BEFORE_RESTORE_BACKUP, JSON.stringify(makeBackupObject('before-restore-backup')));
  }

  function applyBackupObject(backup) {
    if (!backup || typeof backup !== 'object') return false;

    if (backup.storageSnapshot && typeof backup.storageSnapshot === 'object') {
      Object.entries(backup.storageSnapshot).forEach(([key, value]) => {
        if (key.startsWith('profit_')) {
          if (value === null || value === undefined) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, String(value));
          }
        }
      });
    }

    if (Array.isArray(backup.rows)) {
      localStorage.setItem(STORAGE_ROWS, JSON.stringify(backup.rows));
    }

    if (Array.isArray(backup.presets)) {
      localStorage.setItem(STORAGE_PRESETS, JSON.stringify(backup.presets));
    }

    if (Array.isArray(backup.expenses)) {
      localStorage.setItem(STORAGE_EXPENSES, JSON.stringify(backup.expenses));
    }

    if (backup.serviceColors && typeof backup.serviceColors === 'object') {
      localStorage.setItem(STORAGE_SERVICE_COLORS, JSON.stringify(backup.serviceColors));
    }

    if (Array.isArray(backup.deletedStack)) {
      setDeletedStack(backup.deletedStack);
    }

    if (backup.settings) {
      if (backup.settings.walletDollarRate !== undefined) {
        localStorage.setItem(STORAGE_WALLET_DOLLAR_RATE, backup.settings.walletDollarRate);
      }

      if (backup.settings.expensesDollarRate !== undefined) {
        localStorage.setItem(STORAGE_EXPENSES_DOLLAR_RATE, backup.settings.expensesDollarRate);
      }
    }

    loadRows();
    loadPresets();
    loadExpenses();
    loadDollarRates();
    loadServiceColors();
    loadRowsViewOptions();
    applySavedSectionState();

    renderPresets();
    renderExpenses();
    render();
    scheduleCloudSync('restore-backup');

    return true;
  }

  function restoreSafetyBackup() {
    const safetyRaw = localStorage.getItem(STORAGE_BEFORE_RESTORE_BACKUP) || localStorage.getItem(STORAGE_SAFETY_BACKUP);

    if (!safetyRaw) {
      showToast('ℹ️ لا توجد نسخة أمان محفوظة على هذا المتصفح.');
      return;
    }

    const confirmed = confirm('⚠️ هل تريد استرجاع نسخة الأمان المحفوظة على نفس المتصفح؟ سيتم استبدال البيانات الحالية.');
    if (!confirmed) return;

    try {
      const backup = JSON.parse(safetyRaw);
      const restored = applyBackupObject(backup);

      if (restored) {
        showToast('✅ تم استرجاع نسخة الأمان بنجاح.');
      } else {
        showToast('⚠️ نسخة الأمان غير صحيحة.');
      }
    } catch (e) {
      console.error(e);
      showToast('⚠️ حصل خطأ أثناء استرجاع نسخة الأمان.');
    }
  }

  function getAppLocalStorageSnapshot() {
    const snapshot = {};

    // مزامنة كاملة: أي مفتاح خاص بالموقع يبدأ بـ profit_ يدخل ضمن النسخة السحابية
    Object.keys(localStorage).sort().forEach(key => {
      if (key.startsWith('profit_')) {
        snapshot[key] = localStorage.getItem(key);
      }
    });

    return snapshot;
  }

  function downloadBackup() {
    // حفظ كل بيانات التطبيق الموجودة في localStorage + نسخة واضحة من البيانات الحالية
    const backup = makeBackupObject('manual-download-backup');

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `profit-backup-full-${today()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showToast('✅ تم تحميل النسخة الاحتياطية الكاملة.');
  }


  const WHATSAPP_BACKUP_PHONE = '201064870491';

  function buildBackupFile(label = 'whatsapp-backup') {
    const backup = makeBackupObject(label);
    const json = JSON.stringify(backup, null, 2);
    const safeTime = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const fileName = `profit-backup-full-${today()}-${safeTime}.json`;
    const file = new File([json], fileName, { type: 'application/json' });

    return { backup, json, fileName, file };
  }

  function downloadBackupJson(json, fileName) {
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  async function sendBackupToWhatsApp() {
    const { backup, json, fileName, file } = buildBackupFile('whatsapp-share-backup');
    const countText = `${Array.isArray(backup.rows) ? backup.rows.length : 0} عملية، ${Array.isArray(backup.presets) ? backup.presets.length : 0} عرض، ${Array.isArray(backup.expenses) ? backup.expenses.length : 0} مصروف`;
    const message = `نسخة احتياطية MOX-V2\nالملف: ${fileName}\nالمحتوى: ${countText}\nالتاريخ: ${new Date().toLocaleString('ar-EG')}`;

    try {
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({
          title: 'نسخة احتياطية MOX-V2',
          text: `${message}\n\nاختر WhatsApp وأرسل الملف إلى الرقم: +${WHATSAPP_BACKUP_PHONE}`,
          files: [file]
        });

        showToast('✅ تم تجهيز ملف النسخة. اختر واتساب وأرسله للرقم المطلوب.');
        return;
      }
    } catch (error) {
      console.warn('Web Share failed, falling back to WhatsApp link:', error);
    }

    downloadBackupJson(json, fileName);

    const whatsappMessage = encodeURIComponent(
      `${message}\n\nتم تحميل ملف النسخة الاحتياطية على الجهاز. افتح المحادثة وأرفق ملف ${fileName}.`
    );

    window.open(`https://wa.me/${WHATSAPP_BACKUP_PHONE}?text=${whatsappMessage}`, '_blank');
    showToast('✅ تم تحميل ملف النسخة وفتح واتساب على الرقم المطلوب. أرفق الملف في المحادثة.');
  }

  function restoreBackup(event) {
    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(e) {
      try {
        const backup = JSON.parse(e.target.result);

        const hasValidData =
          backup &&
          (
            Array.isArray(backup.rows) ||
            Array.isArray(backup.presets) ||
            Array.isArray(backup.expenses) ||
            (backup.storageSnapshot && typeof backup.storageSnapshot === 'object')
          );

        if (!hasValidData) {
          showToast('⚠️ ملف النسخة الاحتياطية غير صحيح.');
          event.target.value = '';
          return;
        }

        const confirmed = confirm('⚠️ هل تريد استرجاع النسخة؟ سيتم استبدال البيانات الحالية.');
        if (!confirmed) {
          event.target.value = '';
          return;
        }

        if (!requirePasswordForAction('استرجاع نسخة احتياطية واستبدال البيانات الحالية')) {
          event.target.value = '';
          return;
        }

        // قبل أي استرجاع بنحفظ نسخة أمان من البيانات الحالية، عشان لو الملف غلط تقدر ترجعها
        saveBeforeRestoreBackup();

        applyBackupObject(backup);
        saveSafetyBackupIfUseful();

        showToast('✅ تم استرجاع النسخة الاحتياطية الكاملة بنجاح.');
      } catch (error) {
        console.error(error);
        showToast('⚠️ حصل خطأ أثناء قراءة الملف.');
      }

      event.target.value = '';
    };

    reader.readAsText(file);
  }

  window.addEventListener('online', function () {
    autoStartCloudSyncIfEnabled();
    scheduleCloudSync('online');
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      autoStartCloudSyncIfEnabled();
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    ensureMobileNavFixed();
    detectStandaloneMode();
    setupDynamicManifest();
    showIOSInstallHintOnce();
    document.getElementById('dateInput').value = today();
    if (document.getElementById('dailyReportDate')) {
      document.getElementById('dailyReportDate').value = today();
    }

    loadRows();
    loadPresets();
    loadExpenses();
    loadDollarRates();
    loadServiceColors();
    loadRowsViewOptions();

    renderPresets();
    renderExpenses();
    render();
    applySavedSectionState();
    saveSafetyBackupIfUseful();

    document.getElementById('walletDollarRate').addEventListener('input', function () {
      saveDollarRates();
      render();
    });

    document.getElementById('expensesDollarRate').addEventListener('input', function () {
      saveDollarRates();
      render();
    });

    initializePasswordProtection();
    autoStartCloudSyncIfEnabled();
    setTimeout(() => autoStartCloudSyncIfEnabled(), 2500);
  });


  /* ===== MOX-V3 Pro JS additions and overrides ===== */
  const STORAGE_VARIABLE_EXPENSES = 'profit_variable_expenses_v1';
  const STORAGE_DAILY_CLOSINGS = 'profit_daily_closings_v1';
  const STORAGE_AUDIT_LOGS = 'profit_audit_logs_v1';
  const STORAGE_FIRST_RUN_PRO = 'profit_mox_v3_first_run_v1';

  let variableExpenses = [];
  let dailyClosings = [];
  let auditLogs = [];

  ['quickEntryContent', 'variableExpensesContent', 'closingContent'].forEach(id => {
    if (!COLLAPSIBLE_CONTENT_IDS.includes(id)) COLLAPSIBLE_CONTENT_IDS.push(id);
  });

  const STATUS_LABELS = {
    done: 'تمت',
    pending: 'معلقة',
    canceled: 'ملغية',
    refunded: 'مرتجعة'
  };

  function normalizeQuantity(value) {
    const quantity = Math.floor(Number(value) || 1);
    return Math.max(1, quantity);
  }

  function normalizeStatus(value) {
    return ['done', 'pending', 'canceled', 'refunded'].includes(value) ? value : 'done';
  }

  function getRowQuantity(row) {
    return normalizeQuantity(row?.quantity || 1);
  }

  function getRowStatus(row) {
    return normalizeStatus(row?.status || 'done');
  }

  function getStatusLabel(status) {
    return STATUS_LABELS[normalizeStatus(status)] || STATUS_LABELS.done;
  }

  function getStatusClass(status) {
    return `status-pill status-${normalizeStatus(status)}`;
  }

  function rowFinancials(row) {
    const quantity = getRowQuantity(row);
    const unitPaid = Number(row?.paid) || 0;
    const unitCost = Number(row?.deducted) || 0;
    const status = getRowStatus(row);

    let multiplier = 1;
    if (status === 'pending' || status === 'canceled') multiplier = 0;
    if (status === 'refunded') multiplier = -1;

    const income = unitPaid * quantity * multiplier;
    const operationCost = unitCost * quantity * multiplier;
    const profit = income - operationCost;

    return { quantity, unitPaid, unitCost, status, income, operationCost, profit };
  }

  function calcProfit(row) {
    return rowFinancials(row).profit;
  }

  function createRowObject(date, item, offer, paid, deducted, quantity = 1, status = 'done', note = '') {
    return {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      date: date || today(),
      item: item || '',
      offer: offer || '',
      paid: Number(paid) || 0,
      deducted: Number(deducted) || 0,
      quantity: normalizeQuantity(quantity),
      status: normalizeStatus(status),
      note: String(note || ''),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function normalizeRow(row) {
    if (!row || typeof row !== 'object') return createRowObject(today(), '', '', 0, 0);
    return {
      id: row.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      date: row.date || today(),
      item: row.item || '',
      offer: row.offer || '',
      paid: Number(row.paid) || 0,
      deducted: Number(row.deducted) || 0,
      quantity: normalizeQuantity(row.quantity || 1),
      status: normalizeStatus(row.status || 'done'),
      note: String(row.note || ''),
      createdAt: row.createdAt || new Date().toISOString(),
      updatedAt: row.updatedAt || row.createdAt || new Date().toISOString()
    };
  }

  function loadRows() {
    try {
      rows = (JSON.parse(localStorage.getItem(STORAGE_ROWS)) || []).map(normalizeRow);
    } catch (e) {
      rows = [];
    }
  }

  function saveRows() {
    rows = rows.map(normalizeRow);
    localStorage.setItem(STORAGE_ROWS, JSON.stringify(rows));
    scheduleCloudSync('rows');
  }

  function loadVariableExpenses() {
    try {
      variableExpenses = JSON.parse(localStorage.getItem(STORAGE_VARIABLE_EXPENSES)) || [];
    } catch (e) {
      variableExpenses = [];
    }
  }

  function saveVariableExpenses() {
    localStorage.setItem(STORAGE_VARIABLE_EXPENSES, JSON.stringify(variableExpenses));
    scheduleCloudSync('variable-expenses');
  }

  function loadDailyClosings() {
    try {
      dailyClosings = JSON.parse(localStorage.getItem(STORAGE_DAILY_CLOSINGS)) || [];
    } catch (e) {
      dailyClosings = [];
    }
  }

  function saveDailyClosings() {
    localStorage.setItem(STORAGE_DAILY_CLOSINGS, JSON.stringify(dailyClosings));
    scheduleCloudSync('daily-closings');
  }

  function loadAuditLogs() {
    try {
      auditLogs = JSON.parse(localStorage.getItem(STORAGE_AUDIT_LOGS)) || [];
    } catch (e) {
      auditLogs = [];
    }
  }

  function saveAuditLogs() {
    localStorage.setItem(STORAGE_AUDIT_LOGS, JSON.stringify(auditLogs.slice(-300)));
    scheduleCloudSync('audit-logs');
  }

  function addAuditLog(action, date, before, after) {
    auditLogs.push({
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      at: new Date().toISOString(),
      action,
      date: date || '',
      before: before || null,
      after: after || null
    });
    auditLogs = auditLogs.slice(-300);
    saveAuditLogs();
    renderAuditLogs();
  }

  function isDateClosed(date) {
    const d = String(date || '').slice(0, 10);
    return Boolean(d && dailyClosings.some(item => item.date === d));
  }

  function confirmIfClosedDate(date, actionName) {
    if (!isDateClosed(date)) return true;
    return confirm(`⚠️ اليوم ${date} مقفول بالفعل. هل تريد تنفيذ: ${actionName}؟ سيتم تسجيل التعديل في سجل التعديلات.`);
  }

  function variableExpenseInDateRange(expense) {
    const date = String(expense.date || '').slice(0, 10);
    if (!date) return false;
    const { from, to } = getDateFilters();
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  }

  function variableExpenseByDate(date) {
    const d = String(date || '').slice(0, 10);
    return variableExpenses.filter(item => String(item.date || '').slice(0, 10) === d);
  }

  function getVariableExpensesTotalForCurrentFilter() {
    return variableExpenses
      .filter(variableExpenseInDateRange)
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }

  function getVariableExpensesTotalForDate(date) {
    return variableExpenseByDate(date).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }

  function getFilteredRowsWithIndexes() {
    return rows
      .map((row, index) => ({ row: normalizeRow(row), index }))
      .filter(item => isRowInDateRange(item.row))
      .filter(item => isRowMatchingTextFilters(item.row));
  }

  function isRowMatchingTextFilters(row) {
    const search = getRowsSearchValue();
    const product = getProductFilterValue();

    if (product && row.item !== product) return false;
    if (!search) return true;

    const f = rowFinancials(row);
    const haystack = normalizeText(`${row.date || ''} ${row.item || ''} ${row.offer || ''} ${row.paid || ''} ${row.deducted || ''} ${f.quantity} ${getStatusLabel(f.status)} ${row.note || ''} ${f.profit}`);
    return haystack.includes(search);
  }

  function quickQtyId(index) {
    return `quickQty_${index}`;
  }

  function changeQuickQty(index, delta) {
    const input = document.getElementById(quickQtyId(index));
    if (!input) return;
    input.value = normalizeQuantity((Number(input.value) || 1) + delta);
  }

  function renderQuickOfferCards() {
    const wrap = document.getElementById('quickOfferCards');
    if (!wrap) return;

    const search = normalizeText(document.getElementById('quickOfferSearch')?.value || '');
    const filtered = presets
      .map((preset, index) => ({ preset, index }))
      .filter(({ preset }) => {
        const text = normalizeText(`${preset.item || ''} ${preset.offer || ''} ${preset.paid || ''} ${preset.deducted || ''} ${calcProfit(preset)}`);
        return !search || text.includes(search);
      });

    if (!filtered.length) {
      wrap.innerHTML = '<div class="filter-note">لا توجد عروض محفوظة مطابقة. أضف عروض من مكتبة العروض السريعة الأول.</div>';
      return;
    }

    wrap.innerHTML = filtered.map(({ preset, index }) => {
      const color = getServiceColor(preset.item);
      const unitProfit = (Number(preset.paid) || 0) - (Number(preset.deducted) || 0);
      return `
        <div class="quick-offer-card" style="--service-color:${color}">
          <div class="quick-offer-title">
            <span>${escapeHTML(preset.item || 'بدون اسم')}</span>
            <span class="status-pill">${escapeHTML(preset.offer || 'عرض')}</span>
          </div>
          <div class="quick-offer-meta">
            الداخل/واحدة: <span class="num paid-val">${fmt(preset.paid)}</span> — المصروف/واحدة: <span class="num deducted-val">${fmt(preset.deducted)}</span><br>
            ربح الواحدة: <span class="num ${unitProfit >= 0 ? 'profit-val' : 'loss-val'}">${fmt(unitProfit)}</span> EGP
          </div>
          <div class="qty-control">
            <button type="button" onclick="changeQuickQty(${index}, -1)">−</button>
            <input id="${quickQtyId(index)}" type="number" min="1" step="1" value="1">
            <button type="button" onclick="changeQuickQty(${index}, 1)">+</button>
          </div>
          <button class="btn btn-add" type="button" onclick="addPresetBatch(${index})">إضافة الكمية</button>
        </div>
      `;
    }).join('');
  }

  function addPresetBatch(index) {
    const preset = presets[index];
    if (!preset) return;

    const date = document.getElementById('quickEntryDate')?.value || today();
    const quantity = normalizeQuantity(document.getElementById(quickQtyId(index))?.value || 1);
    const status = normalizeStatus(document.getElementById('quickDefaultStatus')?.value || 'done');

    if (!confirmIfClosedDate(date, 'إضافة عملية جديدة')) return;

    const row = createRowObject(date, preset.item, preset.offer, preset.paid, preset.deducted, quantity, status, 'إدخال سريع');
    rows.push(row);
    saveRows();
    addAuditLog('إضافة سريعة', date, null, row);
    render();
    renderQuickOfferCards();
    showToast(`✅ تم إضافة ${quantity} من ${preset.item} — ${preset.offer}.`);
  }

  function addSelectedPresetToRows() {
    const preset = getSelectedPreset();
    if (!preset) return;

    const date = today();
    if (!confirmIfClosedDate(date, 'إضافة عرض محفوظ')) return;

    const row = createRowObject(date, preset.item, preset.offer, preset.paid, preset.deducted, 1, 'done', 'من مكتبة العروض');
    rows.push(row);
    saveRows();
    addAuditLog('إضافة عرض محفوظ', date, null, row);
    render();
    showToast('✅ تم إضافة العرض المختار للعمليات بتاريخ اليوم.');
  }

  function fillManualFromPreset() {
    const preset = getSelectedPreset();
    if (!preset) return;

    document.getElementById('dateInput').value = today();
    document.getElementById('itemInput').value = preset.item;
    document.getElementById('offerInput').value = preset.offer;
    document.getElementById('paidInput').value = preset.paid;
    document.getElementById('deductedInput').value = preset.deducted;
    const quantityInput = document.getElementById('quantityInput');
    const statusInput = document.getElementById('statusInput');
    const noteInput = document.getElementById('noteInput');
    if (quantityInput) quantityInput.value = 1;
    if (statusInput) statusInput.value = 'done';
    if (noteInput) noteInput.value = '';

    showToast('✅ تم تعبئة العرض في نموذج الإضافة اليدوية.');
  }

  function addRow() {
    const dateInput = document.getElementById('dateInput');
    const itemInput = document.getElementById('itemInput');
    const offerInput = document.getElementById('offerInput');
    const paidInput = document.getElementById('paidInput');
    const deductedInput = document.getElementById('deductedInput');
    const quantityInput = document.getElementById('quantityInput');
    const statusInput = document.getElementById('statusInput');
    const noteInput = document.getElementById('noteInput');

    const date = dateInput.value || today();
    const item = itemInput.value.trim();
    const offer = offerInput.value.trim();
    const paid = parseFloat(paidInput.value);
    const deducted = parseFloat(deductedInput.value);
    const quantity = normalizeQuantity(quantityInput?.value || 1);
    const status = normalizeStatus(statusInput?.value || 'done');
    const note = noteInput?.value.trim() || '';

    if (!item) { alert('اكتب اسم المنتج / الخدمة.'); itemInput.focus(); return; }
    if (!offer) { alert('اكتب العرض.'); offerInput.focus(); return; }
    if (Number.isNaN(paid) || paid < 0) { alert('اكتب الداخل للمحفظة بشكل صحيح.'); paidInput.focus(); return; }
    if (Number.isNaN(deducted) || deducted < 0) { alert('اكتب مصروف العملية بشكل صحيح.'); deductedInput.focus(); return; }
    if (!confirmIfClosedDate(date, 'إضافة عملية يدوية')) return;

    const row = createRowObject(date, item, offer, paid, deducted, quantity, status, note);
    rows.push(row);
    saveRows();
    addAuditLog('إضافة عملية', date, null, row);
    render();

    dateInput.value = today();
    itemInput.value = '';
    offerInput.value = '';
    paidInput.value = '';
    deductedInput.value = '';
    if (quantityInput) quantityInput.value = 1;
    if (statusInput) statusInput.value = 'done';
    if (noteInput) noteInput.value = '';
    itemInput.focus();

    showToast('✅ تم إضافة العملية بنجاح.');
  }

  function duplicateLastRow() {
    if (!rows.length) {
      showToast('ℹ️ لا يوجد عملية سابقة لتكرارها.');
      return;
    }

    const last = normalizeRow(rows[rows.length - 1]);
    const date = today();
    if (!confirmIfClosedDate(date, 'تكرار آخر عملية')) return;

    const row = createRowObject(date, last.item, last.offer, last.paid, last.deducted, last.quantity, last.status, last.note);
    rows.push(row);
    saveRows();
    addAuditLog('تكرار آخر عملية', date, null, row);
    render();
    showToast('✅ تم تكرار آخر عملية بتاريخ اليوم.');
  }

  function updateRow(index, key, value) {
    if (!rows[index]) return;

    const before = JSON.parse(JSON.stringify(rows[index]));
    const date = before.date || today();
    if (!confirmIfClosedDate(date, 'تعديل عملية')) return;

    if (key === 'paid' || key === 'deducted') rows[index][key] = parseFloat(value) || 0;
    else if (key === 'quantity') rows[index][key] = normalizeQuantity(value);
    else if (key === 'status') rows[index][key] = normalizeStatus(value);
    else rows[index][key] = value;

    rows[index].updatedAt = new Date().toISOString();
    saveRows();
    addAuditLog('تعديل عملية', date, before, rows[index]);
    render();
  }

  function deleteRow(index) {
    if (!rows[index]) return;
    const before = JSON.parse(JSON.stringify(rows[index]));
    if (!confirmIfClosedDate(before.date, 'حذف عملية')) return;
    const confirmed = confirm('⚠️ هل تريد حذف هذه العملية؟');
    if (!confirmed) return;

    const deleted = rows.splice(index, 1);
    pushDeleted('rows', deleted, 'عملية من سجل العمليات');
    saveRows();
    addAuditLog('حذف عملية', before.date, before, null);
    render();
    showToast('✅ تم حذف العملية. يمكنك استرجاعها.');
  }

  function render() {
    applyRowsViewOptions();
    const body = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    if (!body || !emptyState) return;

    const visibleRows = getFilteredRowsWithIndexes();
    body.innerHTML = '';

    let walletTotal = 0;
    let operationExpensesTotal = 0;
    let activeQuantity = 0;
    let pendingQuantity = 0;
    let canceledQuantity = 0;
    let refundedQuantity = 0;

    visibleRows.forEach(({ row, index }, displayIndex) => {
      row = normalizeRow(row);
      const f = rowFinancials(row);
      walletTotal += f.income;
      operationExpensesTotal += f.operationCost;

      if (f.status === 'done') activeQuantity += f.quantity;
      if (f.status === 'pending') pendingQuantity += f.quantity;
      if (f.status === 'canceled') canceledQuantity += f.quantity;
      if (f.status === 'refunded') refundedQuantity += f.quantity;

      const profitClass = f.profit >= 0 ? 'profit-val' : 'loss-val';
      const rowServiceColor = getServiceColor(row.item);
      const tr = document.createElement('tr');
      tr.style.setProperty('--row-service-color', rowServiceColor);

      tr.innerHTML = `
        <td data-label="#">${displayIndex + 1}</td>
        <td data-label="التاريخ"><input class="editable" type="date" value="${escapeHTML(row.date || '')}" onchange="updateRow(${index}, 'date', this.value)"></td>
        <td data-label="المنتج / الخدمة"><input class="editable" value="${escapeHTML(row.item)}" onchange="updateRow(${index}, 'item', this.value)"></td>
        <td data-label="العرض"><input class="editable" value="${escapeHTML(row.offer)}" onchange="updateRow(${index}, 'offer', this.value)"></td>
        <td data-label="الكمية"><input class="editable num" type="number" min="1" step="1" value="${f.quantity}" onchange="updateRow(${index}, 'quantity', this.value)"></td>
        <td data-label="الحالة">
          <select class="editable" onchange="updateRow(${index}, 'status', this.value)">
            <option value="done" ${f.status === 'done' ? 'selected' : ''}>تمت</option>
            <option value="pending" ${f.status === 'pending' ? 'selected' : ''}>معلقة</option>
            <option value="refunded" ${f.status === 'refunded' ? 'selected' : ''}>مرتجعة</option>
            <option value="canceled" ${f.status === 'canceled' ? 'selected' : ''}>ملغية</option>
          </select>
        </td>
        <td data-label="الداخل / واحدة"><input class="editable num paid-val" type="number" step="0.01" value="${f.unitPaid}" onchange="updateRow(${index}, 'paid', this.value)"></td>
        <td data-label="مصروف / واحدة"><input class="editable num deducted-val" type="number" step="0.01" value="${f.unitCost}" onchange="updateRow(${index}, 'deducted', this.value)"></td>
        <td data-label="ربح الإجمالي"><span class="num ${profitClass}">${fmt(f.profit)}</span><span class="unit">EGP</span></td>
        <td data-label="ملاحظة"><input class="editable note-input" value="${escapeHTML(row.note || '')}" onchange="updateRow(${index}, 'note', this.value)"></td>
        <td data-label="إجراء"><button class="delete-btn" onclick="deleteRow(${index})">حذف</button></td>
      `;
      body.appendChild(tr);
    });

    const fixedExpensesTotal = totalFixedExpenses();
    const variableExpensesTotal = getVariableExpensesTotalForCurrentFilter();
    const activeDateFilter = hasActiveDateFilter();
    const visibleExpensesTotal = operationExpensesTotal;
    const profitTotal = walletTotal - operationExpensesTotal - variableExpensesTotal - (activeDateFilter ? 0 : fixedExpensesTotal);

    const walletDollarRate = parseFloat(document.getElementById('walletDollarRate')?.value) || 0;
    const expensesDollarRate = parseFloat(document.getElementById('expensesDollarRate')?.value) || 0;
    const walletUsdTotal = walletDollarRate > 0 ? walletTotal / walletDollarRate : 0;
    const expensesUsdTotal = expensesDollarRate > 0 ? (visibleExpensesTotal + variableExpensesTotal) / expensesDollarRate : 0;

    document.getElementById('countTotal').textContent = activeQuantity;
    document.getElementById('walletTotal').innerHTML = `${fmt(walletTotal)}<span class="unit">EGP</span>`;
    document.getElementById('expensesTotal').innerHTML = `${fmt(visibleExpensesTotal + variableExpensesTotal)}<span class="unit">EGP</span>`;
    document.getElementById('walletUsdTotal').innerHTML = `${fmt(walletUsdTotal)}<span class="unit">USD</span>`;
    document.getElementById('expensesUsdTotal').innerHTML = `${fmt(expensesUsdTotal)}<span class="unit">USD</span>`;

    const profitLabelEl = document.getElementById('profitLabel');
    if (profitLabelEl) {
      profitLabelEl.textContent = activeDateFilter
        ? 'صافي الفترة بعد مصاريف اليوم المتغيرة'
        : 'صافي المكسب بعد المصاريف الثابتة والمتغيرة';
    }

    const profitTotalEl = document.getElementById('profitTotal');
    profitTotalEl.innerHTML = `${fmt(profitTotal)}<span class="unit">EGP</span>`;
    profitTotalEl.className = profitTotal >= 0 ? 'value profit' : 'value loss';

    emptyState.style.display = visibleRows.length ? 'none' : 'block';

    renderProductFilterOptions();
    updateFilterNote();
    renderLatestRowsPreview();
    renderDailyReport();
    renderTopOffers();
    renderAdvancedReport();
    renderVariableExpenses();
    renderClosings();
    renderAuditLogs();
  }

  function renderLatestRowsPreview() {
    const preview = document.getElementById('latestRowsPreview');
    if (!preview) return;

    const visibleRows = getFilteredRowsWithIndexes();
    const lastTwo = visibleRows.slice(-2).reverse();
    const title = hasActiveDateFilter() ? 'آخر عمليتين داخل الفلتر' : 'آخر عمليتين مسجلتين';

    if (!lastTwo.length) {
      preview.innerHTML = `<div class="preview-head">${title}</div><div class="empty" style="display:block;padding:1rem">لا يوجد عمليات لعرضها.</div>`;
      return;
    }

    preview.innerHTML = `
      <div class="preview-head">${title}</div>
      <div class="preview-list">
        ${lastTwo.map(({ row }) => {
          const f = rowFinancials(row);
          const profitClass = f.profit >= 0 ? 'profit-val' : 'loss-val';
          return `
            <div class="preview-item">
              <div class="preview-title">${escapeHTML(row.item)} — ${escapeHTML(row.offer)} <span class="${getStatusClass(f.status)}">${getStatusLabel(f.status)}</span></div>
              <div class="preview-meta">
                التاريخ: ${escapeHTML(row.date || '-')} — الكمية: ${f.quantity}<br>
                الداخل الإجمالي: <span class="num paid-val">${fmt(f.income)}</span> EGP — المصروف الإجمالي: <span class="num deducted-val">${fmt(f.operationCost)}</span> EGP<br>
                الربح: <span class="num ${profitClass}">${fmt(f.profit)}</span> EGP${row.note ? `<br>ملاحظة: ${escapeHTML(row.note)}` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function renderDailyReport() {
    const input = document.getElementById('dailyReportDate');
    if (!input) return;
    if (!input.value) input.value = today();

    const selectedDate = input.value;
    const dayRows = rows.map(normalizeRow).filter(row => String(row.date || '').slice(0, 10) === selectedDate);
    const activeRows = dayRows.map(rowFinancials);
    const income = activeRows.reduce((sum, f) => sum + f.income, 0);
    const expense = activeRows.reduce((sum, f) => sum + f.operationCost, 0);
    const variable = getVariableExpensesTotalForDate(selectedDate);
    const profit = income - expense - variable;

    document.getElementById('dailyIncomeTotal').innerHTML = `${fmt(income)}<span class="unit">EGP</span>`;
    document.getElementById('dailyExpenseTotal').innerHTML = `${fmt(expense + variable)}<span class="unit">EGP</span>`;

    const profitEl = document.getElementById('dailyProfitTotal');
    profitEl.innerHTML = `${fmt(profit)}<span class="unit">EGP</span>`;
    profitEl.className = profit >= 0 ? 'value profit' : 'value loss';

    const productMap = new Map();
    dayRows.forEach(row => {
      const f = rowFinancials(row);
      if (f.status !== 'done') return;
      const key = row.item || 'غير محدد';
      const current = productMap.get(key) || { count: 0, income: 0, expense: 0, profit: 0 };
      current.count += f.quantity;
      current.income += f.income;
      current.expense += f.operationCost;
      current.profit += f.profit;
      productMap.set(key, current);
    });

    const topProduct = [...productMap.entries()].sort((a, b) => b[1].count - a[1].count || b[1].profit - a[1].profit)[0];
    const productEl = document.getElementById('dailyTopProduct');
    const productMetaEl = document.getElementById('dailyTopProductMeta');

    if (!topProduct) {
      productEl.textContent = '-';
      productMetaEl.textContent = variable ? `مصاريف متغيرة: ${fmt(variable)} EGP` : 'لا يوجد عمليات مكتملة في هذا اليوم.';
    } else {
      productEl.textContent = topProduct[0];
      productMetaEl.textContent = `${topProduct[1].count} عملية — ربح ${fmt(topProduct[1].profit)} EGP — مصاريف متغيرة ${fmt(variable)} EGP`;
    }

    const closeInput = document.getElementById('closingDateInput');
    if (closeInput && !closeInput.value) closeInput.value = selectedDate;
  }

  function getTopOffersData(limit = 10) {
    const map = new Map();
    getFilteredRowsWithIndexes().forEach(({ row }) => {
      const f = rowFinancials(row);
      if (f.status !== 'done') return;
      const item = row.item || 'غير محدد';
      const offer = row.offer || 'بدون عرض';
      const key = `${item}|||${offer}`;
      const current = map.get(key) || { item, offer, count: 0, income: 0, expense: 0, profit: 0 };
      current.count += f.quantity;
      current.income += f.income;
      current.expense += f.operationCost;
      current.profit += f.profit;
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.profit - a.profit || b.count - a.count || b.income - a.income).slice(0, limit);
  }

  function updateFilterNote() {
    const note = document.getElementById('activeFilterNote');
    if (!note) return;
    const { from, to } = getDateFilters();
    const search = document.getElementById('rowsSearchInput')?.value.trim() || '';
    const product = getProductFilterValue();
    const filtered = getFilteredRowsWithIndexes();
    const quantity = filtered.reduce((sum, item) => sum + getRowQuantity(item.row), 0);
    const variable = getVariableExpensesTotalForCurrentFilter();

    const activeParts = [];
    if (from || to) activeParts.push(`الفترة من ${from ? formatDateLabel(from) : 'بداية السجل'} إلى ${to ? formatDateLabel(to) : 'نهاية السجل'}`);
    if (product) activeParts.push(`المنتج: ${product}`);
    if (search) activeParts.push(`بحث: ${search}`);

    const base = activeParts.length ? `الملخص وسجل العمليات محسوبين حسب: ${activeParts.join(' — ')}` : 'الملخص يعرض كل الأيام وكل المنتجات.';
    note.textContent = `${base} — عدد السطور: ${filtered.length} — إجمالي الكميات: ${quantity} — المصاريف المتغيرة داخل الفلتر: ${fmt(variable)} EGP.`;
  }

  function addVariableExpense() {
    const dateInput = document.getElementById('variableExpenseDateInput');
    const nameInput = document.getElementById('variableExpenseNameInput');
    const categoryInput = document.getElementById('variableExpenseCategoryInput');
    const amountInput = document.getElementById('variableExpenseAmountInput');
    const noteInput = document.getElementById('variableExpenseNoteInput');

    const date = dateInput.value || today();
    const name = nameInput.value.trim();
    const category = categoryInput.value || 'أخرى';
    const amount = parseFloat(amountInput.value);
    const note = noteInput.value.trim();

    if (!name) { alert('اكتب اسم المصروف.'); nameInput.focus(); return; }
    if (Number.isNaN(amount) || amount < 0) { alert('اكتب قيمة المصروف بشكل صحيح.'); amountInput.focus(); return; }
    if (!confirmIfClosedDate(date, 'إضافة مصروف متغير')) return;

    const expense = { id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, date, name, category, amount, note, createdAt: new Date().toISOString() };
    variableExpenses.push(expense);
    saveVariableExpenses();
    addAuditLog('إضافة مصروف متغير', date, null, expense);
    render();

    dateInput.value = today();
    nameInput.value = '';
    amountInput.value = '';
    noteInput.value = '';
    showToast('✅ تم إضافة المصروف المتغير.');
  }

  function updateVariableExpense(index, key, value) {
    if (!variableExpenses[index]) return;
    const before = JSON.parse(JSON.stringify(variableExpenses[index]));
    if (!confirmIfClosedDate(before.date, 'تعديل مصروف متغير')) return;
    if (key === 'amount') variableExpenses[index][key] = parseFloat(value) || 0;
    else variableExpenses[index][key] = value;
    variableExpenses[index].updatedAt = new Date().toISOString();
    saveVariableExpenses();
    addAuditLog('تعديل مصروف متغير', before.date, before, variableExpenses[index]);
    render();
  }

  function deleteVariableExpense(index) {
    if (!variableExpenses[index]) return;
    const before = JSON.parse(JSON.stringify(variableExpenses[index]));
    if (!confirmIfClosedDate(before.date, 'حذف مصروف متغير')) return;
    if (!confirm('⚠️ هل تريد حذف هذا المصروف المتغير؟')) return;
    variableExpenses.splice(index, 1);
    saveVariableExpenses();
    addAuditLog('حذف مصروف متغير', before.date, before, null);
    render();
    showToast('✅ تم حذف المصروف المتغير.');
  }

  function clearVariableExpenses() {
    if (!variableExpenses.length) { showToast('ℹ️ لا يوجد مصاريف متغيرة لمسحها.'); return; }
    if (!requirePasswordForAction('مسح كل المصاريف المتغيرة')) return;
    if (!confirm('⚠️ هل تريد مسح كل المصاريف المتغيرة؟')) return;
    const before = [...variableExpenses];
    variableExpenses = [];
    saveVariableExpenses();
    addAuditLog('مسح كل المصاريف المتغيرة', '', before, null);
    render();
    showToast('✅ تم مسح المصاريف المتغيرة.');
  }

  function renderVariableExpenses() {
    const body = document.getElementById('variableExpenseBody');
    if (!body) return;
    body.innerHTML = '';

    const items = variableExpenses.map((item, index) => ({ item, index })).sort((a, b) => String(b.item.date).localeCompare(String(a.item.date)));
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty" style="display:table-cell;padding:1rem">لا يوجد مصاريف متغيرة حتى الآن.</td></tr>';
      return;
    }

    items.forEach(({ item, index }, displayIndex) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="#">${displayIndex + 1}</td>
        <td data-label="التاريخ"><input class="editable" type="date" value="${escapeHTML(item.date || '')}" onchange="updateVariableExpense(${index}, 'date', this.value)"></td>
        <td data-label="الاسم"><input class="editable" value="${escapeHTML(item.name || '')}" onchange="updateVariableExpense(${index}, 'name', this.value)"></td>
        <td data-label="التصنيف"><input class="editable" value="${escapeHTML(item.category || '')}" onchange="updateVariableExpense(${index}, 'category', this.value)"></td>
        <td data-label="القيمة"><input class="editable num deducted-val" type="number" step="0.01" value="${Number(item.amount) || 0}" onchange="updateVariableExpense(${index}, 'amount', this.value)"></td>
        <td data-label="ملاحظة"><input class="editable note-input" value="${escapeHTML(item.note || '')}" onchange="updateVariableExpense(${index}, 'note', this.value)"></td>
        <td data-label="إجراء"><button class="delete-btn" onclick="deleteVariableExpense(${index})">حذف</button></td>
      `;
      body.appendChild(tr);
    });
  }

  function setReportPreset(type) {
    const fromInput = document.getElementById('filterFromDate');
    const toInput = document.getElementById('filterToDate');
    const quickFilter = document.getElementById('quickDateFilter');
    const now = new Date();

    if (type === 'all') { fromInput.value = ''; toInput.value = ''; if (quickFilter) quickFilter.value = 'all'; }
    if (type === 'today') { fromInput.value = today(); toInput.value = today(); if (quickFilter) quickFilter.value = 'today'; }
    if (type === 'yesterday') { const d = dateToISO(addDays(now, -1)); fromInput.value = d; toInput.value = d; if (quickFilter) quickFilter.value = 'yesterday'; }
    if (type === 'last7') { fromInput.value = dateToISO(addDays(now, -6)); toInput.value = today(); if (quickFilter) quickFilter.value = 'last7'; }
    if (type === 'month') { fromInput.value = dateToISO(new Date(now.getFullYear(), now.getMonth(), 1)); toInput.value = today(); if (quickFilter) quickFilter.value = 'month'; }
    if (type === 'year') { fromInput.value = dateToISO(new Date(now.getFullYear(), 0, 1)); toInput.value = today(); if (quickFilter) quickFilter.value = 'custom'; }

    render();
    scrollToBlock('reportsContent');
  }

  function setTodayView() {
    setReportPreset('today');
    scrollToBlock('tableContent');
  }

  function getCurrentReportStats() {
    const visibleRows = getFilteredRowsWithIndexes().map(item => item.row);
    const financials = visibleRows.map(rowFinancials);
    const income = financials.reduce((sum, f) => sum + f.income, 0);
    const opCost = financials.reduce((sum, f) => sum + f.operationCost, 0);
    const variable = getVariableExpensesTotalForCurrentFilter();
    const fixed = hasActiveDateFilter() ? 0 : totalFixedExpenses();
    const profit = income - opCost - variable - fixed;
    const doneQty = financials.filter(f => f.status === 'done').reduce((sum, f) => sum + f.quantity, 0);
    const pendingQty = financials.filter(f => f.status === 'pending').reduce((sum, f) => sum + f.quantity, 0);
    const canceledQty = financials.filter(f => f.status === 'canceled').reduce((sum, f) => sum + f.quantity, 0);
    const refundedQty = financials.filter(f => f.status === 'refunded').reduce((sum, f) => sum + f.quantity, 0);
    const avgProfit = doneQty ? profit / doneQty : 0;

    return { visibleRows, financials, income, opCost, variable, fixed, profit, doneQty, pendingQty, canceledQty, refundedQty, avgProfit };
  }

  function renderAdvancedReport() {
    const wrap = document.getElementById('advancedReportSummary');
    const breakdown = document.getElementById('periodBreakdownBody');
    if (!wrap || !breakdown) return;

    const stats = getCurrentReportStats();
    const topOffers = getTopOffersData(1);
    const topOfferText = topOffers[0] ? `${topOffers[0].item} — ${topOffers[0].offer}` : '-';

    wrap.innerHTML = `
      <div class="stat-card"><div class="label">عدد العمليات المكتملة</div><div class="value count">${stats.doneQty}</div></div>
      <div class="stat-card"><div class="label">إجمالي الدخل</div><div class="value wallet">${fmt(stats.income)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">تكلفة العمليات</div><div class="value expense">${fmt(stats.opCost)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">مصاريف متغيرة</div><div class="value expense">${fmt(stats.variable)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">مصاريف ثابتة محسوبة</div><div class="value expense">${fmt(stats.fixed)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">صافي الربح</div><div class="value ${stats.profit >= 0 ? 'profit' : 'loss'}">${fmt(stats.profit)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">متوسط ربح العملية</div><div class="value ${stats.avgProfit >= 0 ? 'profit' : 'loss'}">${fmt(stats.avgProfit)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">أفضل عرض داخل الفلتر</div><div class="value">${escapeHTML(topOfferText)}</div></div>
      <div class="stat-card"><div class="label">معلقة / ملغية / مرتجعة</div><div class="value">${stats.pendingQty} / ${stats.canceledQty} / ${stats.refundedQty}</div></div>
    `;

    const periodRows = buildPeriodBreakdown();
    breakdown.innerHTML = periodRows.length ? periodRows.map(item => `
      <tr>
        <td data-label="الفترة">${escapeHTML(item.period)}</td>
        <td data-label="عدد العمليات">${item.qty}</td>
        <td data-label="الدخل"><span class="num paid-val">${fmt(item.income)}</span></td>
        <td data-label="تكلفة العمليات"><span class="num deducted-val">${fmt(item.opCost)}</span></td>
        <td data-label="المصاريف المتغيرة"><span class="num deducted-val">${fmt(item.variable)}</span></td>
        <td data-label="صافي الربح"><span class="num ${item.profit >= 0 ? 'profit-val' : 'loss-val'}">${fmt(item.profit)}</span></td>
      </tr>
    `).join('') : '<tr><td colspan="6" class="empty" style="display:table-cell;padding:1rem">لا يوجد بيانات للفترة الحالية.</td></tr>';
  }

  function buildPeriodBreakdown() {
    const { from, to } = getDateFilters();
    const byMonth = new Map();

    getFilteredRowsWithIndexes().forEach(({ row }) => {
      const d = String(row.date || '').slice(0, 10);
      const key = d ? d.slice(0, 7) : 'بدون تاريخ';
      const f = rowFinancials(row);
      const current = byMonth.get(key) || { period: key, qty: 0, income: 0, opCost: 0, variable: 0, profit: 0 };
      if (f.status === 'done') current.qty += f.quantity;
      current.income += f.income;
      current.opCost += f.operationCost;
      current.profit += f.profit;
      byMonth.set(key, current);
    });

    variableExpenses.filter(variableExpenseInDateRange).forEach(expense => {
      const d = String(expense.date || '').slice(0, 10);
      const key = d ? d.slice(0, 7) : 'بدون تاريخ';
      const current = byMonth.get(key) || { period: key, qty: 0, income: 0, opCost: 0, variable: 0, profit: 0 };
      current.variable += Number(expense.amount) || 0;
      current.profit -= Number(expense.amount) || 0;
      byMonth.set(key, current);
    });

    return [...byMonth.values()].sort((a, b) => String(b.period).localeCompare(String(a.period)));
  }

  function computeDaySnapshot(date) {
    const dayRows = rows.map(normalizeRow).filter(row => String(row.date || '').slice(0, 10) === date);
    const financials = dayRows.map(rowFinancials);
    const income = financials.reduce((sum, f) => sum + f.income, 0);
    const opCost = financials.reduce((sum, f) => sum + f.operationCost, 0);
    const variable = getVariableExpensesTotalForDate(date);
    const qty = financials.filter(f => f.status === 'done').reduce((sum, f) => sum + f.quantity, 0);
    const profit = income - opCost - variable;
    return { date, qty, rowsCount: dayRows.length, income, opCost, variable, profit };
  }

  function closeSelectedDay() {
    const input = document.getElementById('closingDateInput');
    const date = input?.value || today();
    if (isDateClosed(date) && !confirm('هذا اليوم مقفول بالفعل. هل تريد تحديث الإغلاق بالأرقام الحالية؟')) return;

    const snapshot = computeDaySnapshot(date);
    const closing = {
      ...snapshot,
      closedAt: new Date().toISOString(),
      id: `${date}_${Date.now()}`
    };

    dailyClosings = dailyClosings.filter(item => item.date !== date);
    dailyClosings.push(closing);
    dailyClosings.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    saveDailyClosings();
    addAuditLog('إغلاق اليوم', date, null, closing);
    renderClosings();
    showToast(`✅ تم إغلاق يوم ${date}.`);
  }

  function reopenDay(date) {
    if (!requirePasswordForAction(`فتح يوم ${date}`)) return;
    if (!confirm(`هل تريد فتح يوم ${date} وإلغاء الإغلاق؟`)) return;
    const before = dailyClosings.find(item => item.date === date);
    dailyClosings = dailyClosings.filter(item => item.date !== date);
    saveDailyClosings();
    addAuditLog('فتح يوم مقفول', date, before, null);
    renderClosings();
    showToast('✅ تم فتح اليوم.');
  }

  function renderClosings() {
    const body = document.getElementById('closingsBody');
    const status = document.getElementById('closingStatusLine');
    if (!body) return;

    const selected = document.getElementById('closingDateInput')?.value || today();
    if (status) {
      status.innerHTML = isDateClosed(selected)
        ? `<span class="closed-day-badge">🔒 يوم ${selected} مقفول</span>`
        : `<span class="closed-day-badge warning-badge">🔓 يوم ${selected} مفتوح</span>`;
    }

    if (!dailyClosings.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty" style="display:table-cell;padding:1rem">لا يوجد أيام مغلقة حتى الآن.</td></tr>';
      return;
    }

    body.innerHTML = dailyClosings.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(item => `
      <tr>
        <td data-label="التاريخ">${escapeHTML(item.date)}</td>
        <td data-label="عدد العمليات">${item.qty || 0}</td>
        <td data-label="الدخل"><span class="num paid-val">${fmt(item.income)}</span></td>
        <td data-label="تكلفة العمليات"><span class="num deducted-val">${fmt(item.opCost)}</span></td>
        <td data-label="مصاريف متغيرة"><span class="num deducted-val">${fmt(item.variable)}</span></td>
        <td data-label="صافي الربح"><span class="num ${(item.profit || 0) >= 0 ? 'profit-val' : 'loss-val'}">${fmt(item.profit)}</span></td>
        <td data-label="وقت الإغلاق">${item.closedAt ? new Date(item.closedAt).toLocaleString('ar-EG') : '-'}</td>
        <td data-label="إجراء"><button class="delete-btn" onclick="reopenDay('${escapeHTML(item.date)}')">فتح</button></td>
      </tr>
    `).join('');
  }

  function renderAuditLogs() {
    const body = document.getElementById('auditBody');
    if (!body) return;

    if (!auditLogs.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty" style="display:table-cell;padding:1rem">لا يوجد تعديلات مسجلة حتى الآن.</td></tr>';
      return;
    }

    body.innerHTML = auditLogs.slice(-60).reverse().map(log => {
      const beforeText = log.before ? JSON.stringify(log.before).slice(0, 90) : '';
      const afterText = log.after ? JSON.stringify(log.after).slice(0, 90) : '';
      const details = beforeText || afterText ? `${beforeText ? 'قبل: ' + beforeText : ''}${beforeText && afterText ? ' | ' : ''}${afterText ? 'بعد: ' + afterText : ''}` : '-';
      return `
        <tr>
          <td data-label="الوقت">${log.at ? new Date(log.at).toLocaleString('ar-EG') : '-'}</td>
          <td data-label="الإجراء">${escapeHTML(log.action || '-')}</td>
          <td data-label="التاريخ">${escapeHTML(log.date || '-')}</td>
          <td data-label="التفاصيل">${escapeHTML(details)}</td>
        </tr>
      `;
    }).join('');
  }

  function rowsToExport() {
    return getFilteredRowsWithIndexes().map(item => item.row);
  }

  function exportCSV() {
    const exportRows = rowsToExport();
    if (!exportRows.length) {
      showToast(hasActiveDateFilter() ? '⚠️ لا يوجد بيانات داخل الفلتر للتصدير.' : '⚠️ لا يوجد بيانات للتصدير.');
      return;
    }

    const headers = ['date','item','offer','quantity','status','wallet_unit_egp','operation_expense_unit_egp','wallet_total_egp','operation_expense_total_egp','operation_profit_egp','note'];
    const csvRows = exportRows.map(row => {
      const f = rowFinancials(row);
      return [row.date, row.item, row.offer, f.quantity, getStatusLabel(f.status), f.unitPaid, f.unitCost, f.income, f.operationCost, f.profit, row.note || ''];
    });

    const csv = [headers, ...csvRows].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = hasActiveDateFilter() ? `profit-report-filtered-${today()}.csv` : `profit-report-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildReportHTML(exportRows, title) {
    const financials = exportRows.map(rowFinancials);
    const income = financials.reduce((sum, f) => sum + f.income, 0);
    const expense = financials.reduce((sum, f) => sum + f.operationCost, 0);
    const variable = getVariableExpensesTotalForCurrentFilter();
    const profit = income - expense - variable;
    const rowsHTML = exportRows.map((row, index) => {
      const f = rowFinancials(row);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHTML(row.date || '')}</td>
          <td>${escapeHTML(row.item || '')}</td>
          <td>${escapeHTML(row.offer || '')}</td>
          <td>${f.quantity}</td>
          <td>${getStatusLabel(f.status)}</td>
          <td>${fmt(f.unitPaid)}</td>
          <td>${fmt(f.unitCost)}</td>
          <td>${fmt(f.income)}</td>
          <td>${fmt(f.operationCost)}</td>
          <td>${fmt(f.profit)}</td>
          <td>${escapeHTML(row.note || '')}</td>
        </tr>`;
    }).join('');

    return `
      <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${escapeHTML(title)}</title>
      <style>body{font-family:Arial,Tahoma,sans-serif;direction:rtl;padding:20px;color:#111}h1{font-size:22px;margin-bottom:8px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:15px 0}.card{border:1px solid #ddd;border-radius:10px;padding:10px}.label{color:#666;font-size:12px;margin-bottom:5px}.value{font-size:18px;font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:15px;font-size:11px}th,td{border:1px solid #ddd;padding:7px;text-align:right}th{background:#f3f4f6}@media print{button{display:none}}</style>
      </head><body>
        <button onclick="window.print()">طباعة / حفظ PDF</button>
        <h1>${escapeHTML(title)}</h1>
        <p>تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}</p>
        <div class="summary">
          <div class="card"><div class="label">عدد السطور</div><div class="value">${exportRows.length}</div></div>
          <div class="card"><div class="label">إجمالي الدخل</div><div class="value">${fmt(income)} EGP</div></div>
          <div class="card"><div class="label">إجمالي المصروف</div><div class="value">${fmt(expense + variable)} EGP</div></div>
          <div class="card"><div class="label">صافي الربح</div><div class="value">${fmt(profit)} EGP</div></div>
        </div>
        <table><thead><tr><th>#</th><th>التاريخ</th><th>المنتج</th><th>العرض</th><th>الكمية</th><th>الحالة</th><th>دخل/واحدة</th><th>تكلفة/واحدة</th><th>الدخل الإجمالي</th><th>التكلفة الإجمالية</th><th>الربح</th><th>ملاحظة</th></tr></thead><tbody>${rowsHTML || '<tr><td colspan="12">لا يوجد بيانات</td></tr>'}</tbody></table>
      </body></html>`;
  }

  function makeBackupObject(label) {
    return {
      appName: 'Profit Calculator',
      format: 'mox-v3-full-backup',
      version: 20,
      label: label || 'backup',
      exportedAt: new Date().toISOString(),
      rows,
      presets,
      expenses,
      variableExpenses,
      dailyClosings,
      auditLogs,
      serviceColors,
      deletedStack: getDeletedStack(),
      settings: {
        walletDollarRate: document.getElementById('walletDollarRate')?.value || localStorage.getItem(STORAGE_WALLET_DOLLAR_RATE) || '53',
        expensesDollarRate: document.getElementById('expensesDollarRate')?.value || localStorage.getItem(STORAGE_EXPENSES_DOLLAR_RATE) || '53'
      },
      storageSnapshot: getAppLocalStorageSnapshot()
    };
  }

  function backupItemCount(backup) {
    if (!backup) return 0;
    return (Array.isArray(backup.rows) ? backup.rows.length : 0) +
      (Array.isArray(backup.presets) ? backup.presets.length : 0) +
      (Array.isArray(backup.expenses) ? backup.expenses.length : 0) +
      (Array.isArray(backup.variableExpenses) ? backup.variableExpenses.length : 0) +
      (Array.isArray(backup.dailyClosings) ? backup.dailyClosings.length : 0);
  }

  function applyBackupObject(backup) {
    if (!backup || typeof backup !== 'object') return false;

    if (backup.storageSnapshot && typeof backup.storageSnapshot === 'object') {
      Object.entries(backup.storageSnapshot).forEach(([key, value]) => {
        if (key.startsWith('profit_')) {
          if (value === null || value === undefined) localStorage.removeItem(key);
          else localStorage.setItem(key, String(value));
        }
      });
    }

    if (Array.isArray(backup.rows)) localStorage.setItem(STORAGE_ROWS, JSON.stringify(backup.rows.map(normalizeRow)));
    if (Array.isArray(backup.presets)) localStorage.setItem(STORAGE_PRESETS, JSON.stringify(backup.presets));
    if (Array.isArray(backup.expenses)) localStorage.setItem(STORAGE_EXPENSES, JSON.stringify(backup.expenses));
    if (Array.isArray(backup.variableExpenses)) localStorage.setItem(STORAGE_VARIABLE_EXPENSES, JSON.stringify(backup.variableExpenses));
    if (Array.isArray(backup.dailyClosings)) localStorage.setItem(STORAGE_DAILY_CLOSINGS, JSON.stringify(backup.dailyClosings));
    if (Array.isArray(backup.auditLogs)) localStorage.setItem(STORAGE_AUDIT_LOGS, JSON.stringify(backup.auditLogs));
    if (backup.serviceColors && typeof backup.serviceColors === 'object') localStorage.setItem(STORAGE_SERVICE_COLORS, JSON.stringify(backup.serviceColors));
    if (Array.isArray(backup.deletedStack)) setDeletedStack(backup.deletedStack);

    if (backup.settings) {
      if (backup.settings.walletDollarRate !== undefined) localStorage.setItem(STORAGE_WALLET_DOLLAR_RATE, backup.settings.walletDollarRate);
      if (backup.settings.expensesDollarRate !== undefined) localStorage.setItem(STORAGE_EXPENSES_DOLLAR_RATE, backup.settings.expensesDollarRate);
    }

    loadRows(); loadPresets(); loadExpenses(); loadVariableExpenses(); loadDailyClosings(); loadAuditLogs(); loadDollarRates(); loadServiceColors(); loadRowsViewOptions(); applySavedSectionState();
    renderPresets(); renderExpenses(); render(); renderQuickOfferCards(); renderVariableExpenses(); renderClosings(); renderAuditLogs();
    scheduleCloudSync('restore-backup');
    return true;
  }

  function applyCloudPayload(data) {
    if (!data || typeof data !== 'object') return false;
    isApplyingCloudData = true;
    try {
      let applied = false;
      if (data.backup && typeof data.backup === 'object') applied = applyBackupObject(data.backup) || applied;
      else if (data.storageSnapshot && typeof data.storageSnapshot === 'object') {
        Object.entries(data.storageSnapshot).forEach(([key, value]) => {
          if (key.startsWith('profit_')) {
            if (value === null || value === undefined) localStorage.removeItem(key);
            else localStorage.setItem(key, String(value));
          }
        });
        applied = true;
      }
      if (Array.isArray(data.rows)) { localStorage.setItem(STORAGE_ROWS, JSON.stringify(data.rows.map(normalizeRow))); applied = true; }
      if (Array.isArray(data.presets)) { localStorage.setItem(STORAGE_PRESETS, JSON.stringify(data.presets)); applied = true; }
      if (Array.isArray(data.expenses)) { localStorage.setItem(STORAGE_EXPENSES, JSON.stringify(data.expenses)); applied = true; }
      if (Array.isArray(data.variableExpenses)) { localStorage.setItem(STORAGE_VARIABLE_EXPENSES, JSON.stringify(data.variableExpenses)); applied = true; }
      if (Array.isArray(data.dailyClosings)) { localStorage.setItem(STORAGE_DAILY_CLOSINGS, JSON.stringify(data.dailyClosings)); applied = true; }
      if (Array.isArray(data.auditLogs)) { localStorage.setItem(STORAGE_AUDIT_LOGS, JSON.stringify(data.auditLogs)); applied = true; }
      if (data.serviceColors && typeof data.serviceColors === 'object') { localStorage.setItem(STORAGE_SERVICE_COLORS, JSON.stringify(data.serviceColors)); applied = true; }
      if (Array.isArray(data.deletedStack)) { localStorage.setItem(STORAGE_DELETED_STACK, JSON.stringify(data.deletedStack)); applied = true; }
      if (data.settings) {
        if (data.settings.walletDollarRate !== undefined) localStorage.setItem(STORAGE_WALLET_DOLLAR_RATE, data.settings.walletDollarRate);
        if (data.settings.expensesDollarRate !== undefined) localStorage.setItem(STORAGE_EXPENSES_DOLLAR_RATE, data.settings.expensesDollarRate);
        applied = true;
      }
      ensureFirebaseDefaultsSaved();
      localStorage.setItem(STORAGE_SYNC_ENABLED, '1');
      if (data.updatedAt) localStorage.setItem(STORAGE_LAST_SYNC_AT, data.updatedAt);
      loadRows(); loadPresets(); loadExpenses(); loadVariableExpenses(); loadDailyClosings(); loadAuditLogs(); loadDollarRates(); fillFirebaseSettingsForm();
      renderPresets(); renderExpenses(); render(); renderQuickOfferCards(); renderVariableExpenses(); renderClosings(); renderAuditLogs(); updateLastSyncDisplay(data.updatedAt);
      return applied;
    } finally {
      isApplyingCloudData = false;
    }
  }

  function renderPresets() {
    renderPresetSelect();
    renderPresetList();
    renderServiceColorEditor();
    renderQuickOfferCards();
  }

  function initializeMoxV3() {
    const quickDate = document.getElementById('quickEntryDate');
    const variableDate = document.getElementById('variableExpenseDateInput');
    const closingDate = document.getElementById('closingDateInput');
    const quantityInput = document.getElementById('quantityInput');
    if (quickDate && !quickDate.value) quickDate.value = today();
    if (variableDate && !variableDate.value) variableDate.value = today();
    if (closingDate && !closingDate.value) closingDate.value = today();
    if (quantityInput && !quantityInput.value) quantityInput.value = 1;

    loadVariableExpenses();
    loadDailyClosings();
    loadAuditLogs();
    renderQuickOfferCards();
    renderVariableExpenses();
    renderClosings();
    renderAuditLogs();
    renderAdvancedReport();

    if (!localStorage.getItem(STORAGE_FIRST_RUN_PRO)) {
      localStorage.setItem(STORAGE_FIRST_RUN_PRO, '1');
      setReportPreset('today');
      openSectionGroupForTarget('quickEntryContent');
    }
  }

  document.addEventListener('DOMContentLoaded', initializeMoxV3);


  /* ===== MOX-V3.1 overrides: كل العمليات تمت + استيراد رسائل المحفظة ===== */
  let parsedWalletMessages = [];

  function normalizeStatus(value) {
    return 'done';
  }

  function getRowStatus(row) {
    return 'done';
  }

  function getStatusLabel(status) {
    return 'تمت';
  }

  function getStatusClass(status) {
    return 'offer-pill';
  }

  function normalizeRow(row) {
    if (!row || typeof row !== 'object') return createRowObject(today(), '', '', 0, 0);
    return {
      id: row.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      date: row.date || today(),
      item: row.item || '',
      offer: row.offer || '',
      paid: Number(row.paid) || 0,
      deducted: Number(row.deducted) || 0,
      quantity: normalizeQuantity(row.quantity || 1),
      status: 'done',
      note: String(row.note || ''),
      walletRef: String(row.walletRef || ''),
      walletPhone: String(row.walletPhone || ''),
      walletSender: String(row.walletSender || ''),
      walletBalance: row.walletBalance !== undefined ? Number(row.walletBalance) || 0 : '',
      walletSource: String(row.walletSource || ''),
      walletTime: String(row.walletTime || ''),
      createdAt: row.createdAt || new Date().toISOString(),
      updatedAt: row.updatedAt || row.createdAt || new Date().toISOString()
    };
  }

  function rowFinancials(row) {
    const quantity = getRowQuantity(row);
    const unitPaid = Number(row?.paid) || 0;
    const unitCost = Number(row?.deducted) || 0;
    const income = unitPaid * quantity;
    const operationCost = unitCost * quantity;
    const profit = income - operationCost;
    return { quantity, unitPaid, unitCost, status: 'done', income, operationCost, profit };
  }

  function calcProfit(row) {
    return rowFinancials(row).profit;
  }

  function createRowObject(date, item, offer, paid, deducted, quantity = 1, status = 'done', note = '') {
    return {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      date: date || today(),
      item: item || '',
      offer: offer || '',
      paid: Number(paid) || 0,
      deducted: Number(deducted) || 0,
      quantity: normalizeQuantity(quantity),
      status: 'done',
      note: String(note || ''),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function installWalletImportSection() {
    if (document.getElementById('walletImportSection')) return;
    const quickSection = document.getElementById('todayQuickSection');
    if (!quickSection) return;

    quickSection.insertAdjacentHTML('afterend', `
      <div class="section" id="walletImportSection">
        <div class="section-head">
          <div>
            <div class="section-title">📩 استيراد رسائل المحفظة</div>
            <div class="section-subtitle">الصق رسائل Vodafone Cash العربي أو الإنجليزي، والموقع يطلع المبلغ والتاريخ ورقم العملية ويقترح العرض المناسب تلقائيًا</div>
          </div>
          <button class="toggle-btn" type="button" onclick="toggleSection('walletImportContent', this)">إظهار</button>
        </div>
        <div id="walletImportContent" class="panel wallet-import-panel hidden-section">
          <div class="wallet-import-grid">
            <div class="field">
              <label>الصق رسائل التحويل هنا</label>
              <textarea id="walletMessagesInput" class="textarea-input wallet-import-textarea" placeholder="الصق هنا رسائل تم استلام مبلغ... أو Received EGP..."></textarea>
              <div class="filter-note">لو العميل باعت 5 أو 10 جنيه زيادة، الموقع هيقترح أقرب عرض محفوظ أقل من المبلغ، وهيحسب الدخل بالمبلغ الحقيقي اللي وصل.</div>
            </div>
            <div class="wallet-import-summary">
              <button class="btn btn-purple" type="button" onclick="analyzeWalletMessages()">🔎 تحليل الرسائل</button>
              <button class="btn btn-export" type="button" onclick="pasteWalletMessagesFromClipboard()">📋 لصق تلقائي</button>
              <button class="btn btn-add" type="button" onclick="addParsedWalletMessages()">➕ إضافة المحدد للعمليات</button>
              <button class="btn btn-export" type="button" onclick="document.getElementById('walletMessagesInput').value=''; parsedWalletMessages=[]; renderWalletImportPreview();">مسح الرسائل</button>
              <div id="walletImportStats" class="filter-note">الصق الرسائل واضغط تحليل.</div>
              <div class="clipboard-help">زر اللصق التلقائي يحتاج موافقة المتصفح. لو Safari منعه، اضغط داخل الصندوق والصق يدويًا.</div>
            </div>
          </div>
          <div class="pro-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>اختيار</th>
                  <th>التاريخ</th>
                  <th>المبلغ</th>
                  <th>الرقم / الاسم</th>
                  <th>رقم العملية</th>
                  <th>العرض المقترح</th>
                  <th>فرق/زيادة</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody id="walletImportPreviewBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `);

    if (!COLLAPSIBLE_CONTENT_IDS.includes('walletImportContent')) COLLAPSIBLE_CONTENT_IDS.push('walletImportContent');
  }

  function removeStatusUI() {
    document.querySelectorAll('#statusInput, #quickDefaultStatus').forEach(el => {
      const field = el.closest('.field');
      if (field) field.remove();
    });

    document.querySelectorAll('.section-subtitle').forEach(el => {
      if (el.textContent.includes('حالة')) {
        el.textContent = el.textContent.replace(' + حالة', '').replace('حالة + ', '');
      }
    });

    updateTableHeaderNoStatus();
  }

  function updateTableHeaderNoStatus() {
    const header = document.querySelector('#tableContent thead tr');
    if (!header) return;
    header.innerHTML = `
      <th>#</th>
      <th class="col-date">التاريخ</th>
      <th>المنتج / الخدمة</th>
      <th>العرض</th>
      <th>الكمية</th>
      <th class="col-paid">الداخل / واحدة</th>
      <th class="col-deducted">مصروف / واحدة</th>
      <th class="col-profit">ربح الإجمالي</th>
      <th>ملاحظة</th>
      <th>إجراء</th>
    `;
  }

  function parseMoneyNumber(value) {
    return Number(String(value || '').replace(/,/g, '').trim()) || 0;
  }

  function parseArabicWalletDate(yy, mm, dd) {
    const year = Number(yy) < 80 ? `20${yy}` : `19${yy}`;
    return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  function walletMessageDuplicate(ref) {
    const value = String(ref || '').trim();
    if (!value) return false;
    return rows.some(row => String(row.walletRef || '') === value || String(row.note || '').includes(value));
  }

  function findBestPresetForAmount(amount) {
    if (!presets.length) return '';
    const scored = presets.map((preset, index) => {
      const paid = Number(preset.paid) || 0;
      const diff = amount - paid;
      const exact = Math.abs(diff) < 0.01;
      const closeBonus = diff >= 0 && diff <= 10;
      const looseBonus = diff >= 0 && diff <= 20;
      let score = 999999;
      if (exact) score = 0;
      else if (closeBonus) score = 10 + diff;
      else if (looseBonus) score = 100 + diff;
      else score = 1000 + Math.abs(diff);
      return { index, preset, score, diff };
    }).sort((a, b) => a.score - b.score || (Number(b.preset.paid) || 0) - (Number(a.preset.paid) || 0));

    return scored[0] && scored[0].score < 1000 ? String(scored[0].index) : '';
  }

  function parseWalletMessagesText(text) {
    const results = [];
    const raw = String(text || '');

    const arPattern = /تم استلام مبلغ\s*([\d,.]+)\s*جنيه\s+من رقم\s*([0-9]+)(?:\s+المسجل بإسم\s*([\s\S]*?)\s+على رقم محفظتك)?[\s\S]*?رصيدك الحالي:\s*([\d,.]+)\s*جنيه[\s\S]*?تاريخ العملية:\s*([0-9]{1,2}:[0-9]{2})\s*([0-9]{2})-([0-9]{2})-([0-9]{2})[\s\S]*?رقم العملية:\s*([0-9]+)/g;
    let match;
    while ((match = arPattern.exec(raw)) !== null) {
      const amount = parseMoneyNumber(match[1]);
      const phone = match[2] || '';
      const sender = (match[3] || '').replace(/\s+/g, ' ').trim();
      const balance = parseMoneyNumber(match[4]);
      const time = match[5] || '';
      const date = parseArabicWalletDate(match[6], match[7], match[8]);
      const ref = match[9] || '';
      if (amount && ref) {
        results.push({ source: 'Vodafone Cash AR', date, time, amount, phone, sender, balance, ref, selected: !walletMessageDuplicate(ref), duplicate: walletMessageDuplicate(ref), presetIndex: findBestPresetForAmount(amount) });
      }
    }

    const enPattern = /([A-Za-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M):\s*Received\s+EGP\s*([\d,.]+)\s+from\s+([0-9]+)[\s\S]*?Ref:\s*([0-9]+)\s+Available Balance:\s*([\d,.]+)/g;
    while ((match = enPattern.exec(raw)) !== null) {
      const dateObj = new Date(match[1]);
      const date = Number.isNaN(dateObj.getTime()) ? today() : dateToISO(dateObj);
      const time = Number.isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const amount = parseMoneyNumber(match[2]);
      const phone = match[3] || '';
      const ref = match[4] || '';
      const balance = parseMoneyNumber(match[5]);
      if (amount && ref) {
        results.push({ source: 'Vodafone Cash EN', date, time, amount, phone, sender: '', balance, ref, selected: !walletMessageDuplicate(ref), duplicate: walletMessageDuplicate(ref), presetIndex: findBestPresetForAmount(amount) });
      }
    }

    const byRef = new Map();
    results.forEach(item => {
      if (!byRef.has(item.ref)) byRef.set(item.ref, item);
    });
    return [...byRef.values()].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }

  function analyzeWalletMessages() {
    const textarea = document.getElementById('walletMessagesInput');
    parsedWalletMessages = parseWalletMessagesText(textarea?.value || '');
    renderWalletImportPreview();
    if (!parsedWalletMessages.length) {
      showToast('⚠️ لم أجد رسائل قابلة للتحليل. تأكد إن الرسائل بنفس صيغة Vodafone Cash.');
    } else {
      showToast(`✅ تم تحليل ${parsedWalletMessages.length} رسالة.`);
    }
  }

  function setWalletImportPreset(index, value) {
    if (!parsedWalletMessages[index]) return;
    parsedWalletMessages[index].presetIndex = value;
    renderWalletImportPreview();
  }

  function setWalletImportSelected(index, checked) {
    if (!parsedWalletMessages[index]) return;
    parsedWalletMessages[index].selected = checked;
  }

  function walletImportPresetOptions(selectedValue) {
    const options = ['<option value="">بدون ربط بعرض</option>'];
    presets.forEach((preset, index) => {
      const selected = String(index) === String(selectedValue) ? 'selected' : '';
      options.push(`<option value="${index}" ${selected}>${escapeHTML(preset.item || '')} — ${escapeHTML(preset.offer || '')} | ${fmt(preset.paid)} EGP</option>`);
    });
    return options.join('');
  }

  function renderWalletImportPreview() {
    const body = document.getElementById('walletImportPreviewBody');
    const stats = document.getElementById('walletImportStats');
    if (!body) return;

    if (!parsedWalletMessages.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty" style="display:table-cell;padding:1rem">لا يوجد رسائل محللة بعد.</td></tr>';
      if (stats) stats.textContent = 'الصق الرسائل واضغط تحليل.';
      return;
    }

    let selectedCount = 0;
    let duplicateCount = 0;
    let totalAmount = 0;
    body.innerHTML = parsedWalletMessages.map((msg, index) => {
      const preset = presets[Number(msg.presetIndex)];
      const diff = preset ? msg.amount - (Number(preset.paid) || 0) : 0;
      if (msg.selected && !msg.duplicate) selectedCount += 1;
      if (msg.duplicate) duplicateCount += 1;
      if (msg.selected && !msg.duplicate) totalAmount += msg.amount;
      return `
        <tr class="${msg.duplicate ? 'wallet-duplicate' : ''}">
          <td data-label="اختيار"><input type="checkbox" ${msg.selected && !msg.duplicate ? 'checked' : ''} ${msg.duplicate ? 'disabled' : ''} onchange="setWalletImportSelected(${index}, this.checked)"></td>
          <td data-label="التاريخ">${escapeHTML(msg.date)} ${escapeHTML(msg.time || '')}</td>
          <td data-label="المبلغ"><span class="num paid-val">${fmt(msg.amount)}</span></td>
          <td data-label="الرقم / الاسم">${escapeHTML(msg.phone || '-')}<br><span class="filter-note">${escapeHTML(msg.sender || msg.source || '')}</span></td>
          <td data-label="رقم العملية">${escapeHTML(msg.ref)}</td>
          <td data-label="العرض المقترح"><select class="editable" onchange="setWalletImportPreset(${index}, this.value)">${walletImportPresetOptions(msg.presetIndex)}</select></td>
          <td data-label="فرق/زيادة"><span class="num ${diff >= 0 ? 'profit-val' : 'loss-val'}">${preset ? fmt(diff) : '-'}</span></td>
          <td data-label="الحالة">${msg.duplicate ? 'موجودة قبل كده' : (preset ? 'جاهزة للإضافة' : 'تحتاج ربط أو ستضاف كمبلغ خام')}</td>
        </tr>
      `;
    }).join('');

    if (stats) stats.textContent = `تم تحليل ${parsedWalletMessages.length} رسالة — المحدد للإضافة: ${selectedCount} — المكرر: ${duplicateCount} — إجمالي المحدد: ${fmt(totalAmount)} EGP.`;
  }

  function addParsedWalletMessages() {
    if (!parsedWalletMessages.length) {
      showToast('ℹ️ حلل الرسائل الأول.');
      return;
    }

    const selected = parsedWalletMessages.filter(msg => msg.selected && !msg.duplicate && !walletMessageDuplicate(msg.ref));
    if (!selected.length) {
      showToast('ℹ️ لا يوجد رسائل جديدة محددة للإضافة.');
      return;
    }

    const closedDates = [...new Set(selected.map(msg => msg.date).filter(isDateClosed))];
    if (closedDates.length && !confirm(`⚠️ يوجد رسائل في أيام مقفولة: ${closedDates.join(', ')}. هل تريد الإضافة؟`)) return;

    let added = 0;
    selected.forEach(msg => {
      const preset = presets[Number(msg.presetIndex)];
      const extra = preset ? msg.amount - (Number(preset.paid) || 0) : 0;
      const noteParts = [
        'استيراد رسالة محفظة',
        msg.sender ? `الاسم: ${msg.sender}` : '',
        msg.phone ? `الرقم: ${msg.phone}` : '',
        msg.ref ? `رقم العملية: ${msg.ref}` : '',
        msg.balance ? `الرصيد بعد العملية: ${fmt(msg.balance)}` : '',
        preset ? `فرق/زيادة عن سعر العرض: ${fmt(extra)}` : 'لم يتم ربطها بعرض محفوظ'
      ].filter(Boolean);

      const row = preset
        ? createRowObject(msg.date, preset.item, preset.offer, msg.amount, preset.deducted, 1, 'done', noteParts.join(' | '))
        : createRowObject(msg.date, 'تحويل محفظة', `مبلغ ${fmt(msg.amount)}`, msg.amount, 0, 1, 'done', noteParts.join(' | '));

      row.walletRef = msg.ref;
      row.walletPhone = msg.phone;
      row.walletSender = msg.sender;
      row.walletBalance = msg.balance;
      row.walletSource = msg.source;
      row.walletTime = msg.time;
      rows.push(row);
      addAuditLog('استيراد رسالة محفظة', msg.date, null, row);
      msg.duplicate = true;
      msg.selected = false;
      added += 1;
    });

    saveRows();
    render();
    renderWalletImportPreview();
    showToast(`✅ تم إضافة ${added} رسالة للعمليات.`);
  }

  function renderQuickOfferCards() {
    const wrap = document.getElementById('quickOfferCards');
    if (!wrap) return;

    const search = normalizeText(document.getElementById('quickOfferSearch')?.value || '');
    const filtered = presets
      .map((preset, index) => ({ preset, index }))
      .filter(({ preset }) => {
        const text = normalizeText(`${preset.item || ''} ${preset.offer || ''} ${preset.paid || ''} ${preset.deducted || ''} ${calcProfit(preset)}`);
        return !search || text.includes(search);
      });

    if (!filtered.length) {
      wrap.innerHTML = '<div class="filter-note">لا توجد عروض محفوظة مطابقة. أضف عروض من مكتبة العروض السريعة الأول.</div>';
      return;
    }

    wrap.innerHTML = filtered.map(({ preset, index }) => {
      const color = getServiceColor(preset.item);
      const unitProfit = (Number(preset.paid) || 0) - (Number(preset.deducted) || 0);
      return `
        <div class="quick-offer-card" style="--service-color:${color}">
          <div class="quick-offer-title">
            <span>${escapeHTML(preset.item || 'بدون اسم')}</span>
            <span class="offer-pill">${escapeHTML(preset.offer || 'عرض')}</span>
          </div>
          <div class="quick-offer-meta">
            الداخل/واحدة: <span class="num paid-val">${fmt(preset.paid)}</span> — المصروف/واحدة: <span class="num deducted-val">${fmt(preset.deducted)}</span><br>
            ربح الواحدة: <span class="num ${unitProfit >= 0 ? 'profit-val' : 'loss-val'}">${fmt(unitProfit)}</span> EGP
          </div>
          <div class="qty-control">
            <button type="button" onclick="changeQuickQty(${index}, -1)">−</button>
            <input id="${quickQtyId(index)}" type="number" min="1" step="1" value="1">
            <button type="button" onclick="changeQuickQty(${index}, 1)">+</button>
          </div>
          <button class="btn btn-add" type="button" onclick="addPresetBatch(${index})">إضافة الكمية</button>
        </div>
      `;
    }).join('');
  }

  function addPresetBatch(index) {
    const preset = presets[index];
    if (!preset) return;
    const date = document.getElementById('quickEntryDate')?.value || today();
    const quantity = normalizeQuantity(document.getElementById(quickQtyId(index))?.value || 1);
    if (!confirmIfClosedDate(date, 'إضافة عملية جديدة')) return;

    const row = createRowObject(date, preset.item, preset.offer, preset.paid, preset.deducted, quantity, 'done', 'إدخال سريع');
    rows.push(row);
    saveRows();
    addAuditLog('إضافة سريعة', date, null, row);
    render();
    renderQuickOfferCards();
    showToast(`✅ تم إضافة ${quantity} من ${preset.item} — ${preset.offer}.`);
  }

  function addRow() {
    const dateInput = document.getElementById('dateInput');
    const itemInput = document.getElementById('itemInput');
    const offerInput = document.getElementById('offerInput');
    const paidInput = document.getElementById('paidInput');
    const deductedInput = document.getElementById('deductedInput');
    const quantityInput = document.getElementById('quantityInput');
    const noteInput = document.getElementById('noteInput');

    const date = dateInput.value || today();
    const item = itemInput.value.trim();
    const offer = offerInput.value.trim();
    const paid = parseFloat(paidInput.value);
    const deducted = parseFloat(deductedInput.value);
    const quantity = normalizeQuantity(quantityInput?.value || 1);
    const note = noteInput?.value.trim() || '';

    if (!item) { alert('اكتب اسم المنتج / الخدمة.'); itemInput.focus(); return; }
    if (!offer) { alert('اكتب العرض.'); offerInput.focus(); return; }
    if (Number.isNaN(paid) || paid < 0) { alert('اكتب الداخل للمحفظة بشكل صحيح.'); paidInput.focus(); return; }
    if (Number.isNaN(deducted) || deducted < 0) { alert('اكتب مصروف العملية بشكل صحيح.'); deductedInput.focus(); return; }
    if (!confirmIfClosedDate(date, 'إضافة عملية يدوية')) return;

    const row = createRowObject(date, item, offer, paid, deducted, quantity, 'done', note);
    rows.push(row);
    saveRows();
    addAuditLog('إضافة عملية', date, null, row);
    render();

    dateInput.value = today();
    itemInput.value = '';
    offerInput.value = '';
    paidInput.value = '';
    deductedInput.value = '';
    if (quantityInput) quantityInput.value = 1;
    if (noteInput) noteInput.value = '';
    itemInput.focus();
    showToast('✅ تم إضافة العملية بنجاح.');
  }

  function fillManualFromPreset() {
    const preset = getSelectedPreset();
    if (!preset) return;
    document.getElementById('dateInput').value = today();
    document.getElementById('itemInput').value = preset.item;
    document.getElementById('offerInput').value = preset.offer;
    document.getElementById('paidInput').value = preset.paid;
    document.getElementById('deductedInput').value = preset.deducted;
    const quantityInput = document.getElementById('quantityInput');
    const noteInput = document.getElementById('noteInput');
    if (quantityInput) quantityInput.value = 1;
    if (noteInput) noteInput.value = '';
    showToast('✅ تم تعبئة العرض في نموذج الإضافة اليدوية.');
  }

  function duplicateLastRow() {
    if (!rows.length) { showToast('ℹ️ لا يوجد عملية سابقة لتكرارها.'); return; }
    const last = normalizeRow(rows[rows.length - 1]);
    const date = today();
    if (!confirmIfClosedDate(date, 'تكرار آخر عملية')) return;
    const row = createRowObject(date, last.item, last.offer, last.paid, last.deducted, last.quantity, 'done', last.note);
    rows.push(row);
    saveRows();
    addAuditLog('تكرار آخر عملية', date, null, row);
    render();
    showToast('✅ تم تكرار آخر عملية بتاريخ اليوم.');
  }

  function updateRow(index, key, value) {
    if (!rows[index]) return;
    const before = JSON.parse(JSON.stringify(rows[index]));
    const date = before.date || today();
    if (!confirmIfClosedDate(date, 'تعديل عملية')) return;
    if (key === 'paid' || key === 'deducted') rows[index][key] = parseFloat(value) || 0;
    else if (key === 'quantity') rows[index][key] = normalizeQuantity(value);
    else if (key === 'status') rows[index][key] = 'done';
    else rows[index][key] = value;
    rows[index].status = 'done';
    rows[index].updatedAt = new Date().toISOString();
    saveRows();
    addAuditLog('تعديل عملية', date, before, rows[index]);
    render();
  }

  function isRowMatchingTextFilters(row) {
    const search = getRowsSearchValue();
    const product = getProductFilterValue();
    if (product && row.item !== product) return false;
    if (!search) return true;
    const f = rowFinancials(row);
    const haystack = normalizeText(`${row.date || ''} ${row.item || ''} ${row.offer || ''} ${row.paid || ''} ${row.deducted || ''} ${f.quantity} ${row.note || ''} ${row.walletRef || ''} ${row.walletPhone || ''} ${row.walletSender || ''} ${f.profit}`);
    return haystack.includes(search);
  }

  function render() {
    applyRowsViewOptions();
    updateTableHeaderNoStatus();
    const body = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    if (!body || !emptyState) return;

    const visibleRows = getFilteredRowsWithIndexes();
    body.innerHTML = '';
    let walletTotal = 0;
    let operationExpensesTotal = 0;
    let totalQuantity = 0;

    visibleRows.forEach(({ row, index }, displayIndex) => {
      row = normalizeRow(row);
      const f = rowFinancials(row);
      walletTotal += f.income;
      operationExpensesTotal += f.operationCost;
      totalQuantity += f.quantity;
      const profitClass = f.profit >= 0 ? 'profit-val' : 'loss-val';
      const rowServiceColor = getServiceColor(row.item);
      const tr = document.createElement('tr');
      tr.style.setProperty('--row-service-color', rowServiceColor);
      tr.innerHTML = `
        <td data-label="#">${displayIndex + 1}</td>
        <td data-label="التاريخ"><input class="editable" type="date" value="${escapeHTML(row.date || '')}" onchange="updateRow(${index}, 'date', this.value)"></td>
        <td data-label="المنتج / الخدمة"><input class="editable" value="${escapeHTML(row.item)}" onchange="updateRow(${index}, 'item', this.value)"></td>
        <td data-label="العرض"><input class="editable" value="${escapeHTML(row.offer)}" onchange="updateRow(${index}, 'offer', this.value)"></td>
        <td data-label="الكمية"><input class="editable num" type="number" min="1" step="1" value="${f.quantity}" onchange="updateRow(${index}, 'quantity', this.value)"></td>
        <td data-label="الداخل / واحدة"><input class="editable num paid-val" type="number" step="0.01" value="${f.unitPaid}" onchange="updateRow(${index}, 'paid', this.value)"></td>
        <td data-label="مصروف / واحدة"><input class="editable num deducted-val" type="number" step="0.01" value="${f.unitCost}" onchange="updateRow(${index}, 'deducted', this.value)"></td>
        <td data-label="ربح الإجمالي"><span class="num ${profitClass}">${fmt(f.profit)}</span><span class="unit">EGP</span></td>
        <td data-label="ملاحظة"><input class="editable note-input" value="${escapeHTML(row.note || '')}" onchange="updateRow(${index}, 'note', this.value)"></td>
        <td data-label="إجراء"><button class="delete-btn" onclick="deleteRow(${index})">حذف</button></td>
      `;
      body.appendChild(tr);
    });

    const fixedExpensesTotal = totalFixedExpenses();
    const variableExpensesTotal = getVariableExpensesTotalForCurrentFilter();
    const activeDateFilter = hasActiveDateFilter();
    const visibleExpensesTotal = operationExpensesTotal;
    const profitTotal = walletTotal - operationExpensesTotal - variableExpensesTotal - (activeDateFilter ? 0 : fixedExpensesTotal);
    const walletDollarRate = parseFloat(document.getElementById('walletDollarRate')?.value) || 0;
    const expensesDollarRate = parseFloat(document.getElementById('expensesDollarRate')?.value) || 0;
    const walletUsdTotal = walletDollarRate > 0 ? walletTotal / walletDollarRate : 0;
    const expensesUsdTotal = expensesDollarRate > 0 ? (visibleExpensesTotal + variableExpensesTotal) / expensesDollarRate : 0;

    document.getElementById('countTotal').textContent = totalQuantity;
    document.getElementById('walletTotal').innerHTML = `${fmt(walletTotal)}<span class="unit">EGP</span>`;
    document.getElementById('expensesTotal').innerHTML = `${fmt(visibleExpensesTotal + variableExpensesTotal)}<span class="unit">EGP</span>`;
    document.getElementById('walletUsdTotal').innerHTML = `${fmt(walletUsdTotal)}<span class="unit">USD</span>`;
    document.getElementById('expensesUsdTotal').innerHTML = `${fmt(expensesUsdTotal)}<span class="unit">USD</span>`;
    const profitLabelEl = document.getElementById('profitLabel');
    if (profitLabelEl) profitLabelEl.textContent = activeDateFilter ? 'صافي الفترة بعد مصاريف اليوم المتغيرة' : 'صافي المكسب بعد المصاريف الثابتة والمتغيرة';
    const profitTotalEl = document.getElementById('profitTotal');
    profitTotalEl.innerHTML = `${fmt(profitTotal)}<span class="unit">EGP</span>`;
    profitTotalEl.className = profitTotal >= 0 ? 'value profit' : 'value loss';
    emptyState.style.display = visibleRows.length ? 'none' : 'block';

    renderProductFilterOptions();
    updateFilterNote();
    renderLatestRowsPreview();
    renderDailyReport();
    renderTopOffers();
    renderAdvancedReport();
    renderVariableExpenses();
    renderClosings();
    renderAuditLogs();
  }

  function renderLatestRowsPreview() {
    const preview = document.getElementById('latestRowsPreview');
    if (!preview) return;
    const visibleRows = getFilteredRowsWithIndexes();
    const lastTwo = visibleRows.slice(-2).reverse();
    const title = hasActiveDateFilter() ? 'آخر عمليتين داخل الفلتر' : 'آخر عمليتين مسجلتين';
    if (!lastTwo.length) {
      preview.innerHTML = `<div class="preview-head">${title}</div><div class="empty" style="display:block;padding:1rem">لا يوجد عمليات لعرضها.</div>`;
      return;
    }
    preview.innerHTML = `
      <div class="preview-head">${title}</div>
      <div class="preview-list">
        ${lastTwo.map(({ row }) => {
          const f = rowFinancials(row);
          const profitClass = f.profit >= 0 ? 'profit-val' : 'loss-val';
          return `<div class="preview-item">
            <div class="preview-title">${escapeHTML(row.item)} — ${escapeHTML(row.offer)}</div>
            <div class="preview-meta">
              التاريخ: ${escapeHTML(row.date || '-')} — الكمية: ${f.quantity}<br>
              الداخل الإجمالي: <span class="num paid-val">${fmt(f.income)}</span> EGP — المصروف الإجمالي: <span class="num deducted-val">${fmt(f.operationCost)}</span> EGP<br>
              الربح: <span class="num ${profitClass}">${fmt(f.profit)}</span> EGP${row.note ? `<br>ملاحظة: ${escapeHTML(row.note)}` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function renderDailyReport() {
    const input = document.getElementById('dailyReportDate');
    if (!input) return;
    if (!input.value) input.value = today();
    const selectedDate = input.value;
    const dayRows = rows.map(normalizeRow).filter(row => String(row.date || '').slice(0, 10) === selectedDate);
    const financials = dayRows.map(rowFinancials);
    const income = financials.reduce((sum, f) => sum + f.income, 0);
    const expense = financials.reduce((sum, f) => sum + f.operationCost, 0);
    const variable = getVariableExpensesTotalForDate(selectedDate);
    const profit = income - expense - variable;
    document.getElementById('dailyIncomeTotal').innerHTML = `${fmt(income)}<span class="unit">EGP</span>`;
    document.getElementById('dailyExpenseTotal').innerHTML = `${fmt(expense + variable)}<span class="unit">EGP</span>`;
    const profitEl = document.getElementById('dailyProfitTotal');
    profitEl.innerHTML = `${fmt(profit)}<span class="unit">EGP</span>`;
    profitEl.className = profit >= 0 ? 'value profit' : 'value loss';
    const productMap = new Map();
    dayRows.forEach(row => {
      const f = rowFinancials(row);
      const key = row.item || 'غير محدد';
      const current = productMap.get(key) || { count: 0, income: 0, expense: 0, profit: 0 };
      current.count += f.quantity;
      current.income += f.income;
      current.expense += f.operationCost;
      current.profit += f.profit;
      productMap.set(key, current);
    });
    const topProduct = [...productMap.entries()].sort((a, b) => b[1].count - a[1].count || b[1].profit - a[1].profit)[0];
    const productEl = document.getElementById('dailyTopProduct');
    const productMetaEl = document.getElementById('dailyTopProductMeta');
    if (!topProduct) {
      productEl.textContent = '-';
      productMetaEl.textContent = variable ? `مصاريف متغيرة: ${fmt(variable)} EGP` : 'لا يوجد عمليات في هذا اليوم.';
    } else {
      productEl.textContent = topProduct[0];
      productMetaEl.textContent = `${topProduct[1].count} عملية — ربح ${fmt(topProduct[1].profit)} EGP — مصاريف متغيرة ${fmt(variable)} EGP`;
    }
    const closeInput = document.getElementById('closingDateInput');
    if (closeInput && !closeInput.value) closeInput.value = selectedDate;
  }

  function getTopOffersData(limit = 10) {
    const map = new Map();
    getFilteredRowsWithIndexes().forEach(({ row }) => {
      const f = rowFinancials(row);
      const item = row.item || 'غير محدد';
      const offer = row.offer || 'بدون عرض';
      const key = `${item}|||${offer}`;
      const current = map.get(key) || { item, offer, count: 0, income: 0, expense: 0, profit: 0 };
      current.count += f.quantity;
      current.income += f.income;
      current.expense += f.operationCost;
      current.profit += f.profit;
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.profit - a.profit || b.count - a.count || b.income - a.income).slice(0, limit);
  }

  function updateFilterNote() {
    const note = document.getElementById('activeFilterNote');
    if (!note) return;
    const { from, to } = getDateFilters();
    const search = document.getElementById('rowsSearchInput')?.value.trim() || '';
    const product = getProductFilterValue();
    const filtered = getFilteredRowsWithIndexes();
    const quantity = filtered.reduce((sum, item) => sum + getRowQuantity(item.row), 0);
    const variable = getVariableExpensesTotalForCurrentFilter();
    const activeParts = [];
    if (from || to) activeParts.push(`الفترة من ${from ? formatDateLabel(from) : 'بداية السجل'} إلى ${to ? formatDateLabel(to) : 'نهاية السجل'}`);
    if (product) activeParts.push(`المنتج: ${product}`);
    if (search) activeParts.push(`بحث: ${search}`);
    const base = activeParts.length ? `الملخص وسجل العمليات محسوبين حسب: ${activeParts.join(' — ')}` : 'الملخص يعرض كل الأيام وكل المنتجات.';
    note.textContent = `${base} — عدد السطور: ${filtered.length} — إجمالي الكميات: ${quantity} — المصاريف المتغيرة داخل الفلتر: ${fmt(variable)} EGP.`;
  }

  function getCurrentReportStats() {
    const visibleRows = getFilteredRowsWithIndexes().map(item => item.row);
    const financials = visibleRows.map(rowFinancials);
    const income = financials.reduce((sum, f) => sum + f.income, 0);
    const opCost = financials.reduce((sum, f) => sum + f.operationCost, 0);
    const variable = getVariableExpensesTotalForCurrentFilter();
    const fixed = hasActiveDateFilter() ? 0 : totalFixedExpenses();
    const profit = income - opCost - variable - fixed;
    const qty = financials.reduce((sum, f) => sum + f.quantity, 0);
    const avgProfit = qty ? profit / qty : 0;
    return { visibleRows, financials, income, opCost, variable, fixed, profit, doneQty: qty, pendingQty: 0, canceledQty: 0, refundedQty: 0, avgProfit };
  }

  function renderAdvancedReport() {
    const wrap = document.getElementById('advancedReportSummary');
    const breakdown = document.getElementById('periodBreakdownBody');
    if (!wrap || !breakdown) return;
    const stats = getCurrentReportStats();
    const topOffers = getTopOffersData(1);
    const topOfferText = topOffers[0] ? `${topOffers[0].item} — ${topOffers[0].offer}` : '-';
    wrap.innerHTML = `
      <div class="stat-card"><div class="label">عدد العمليات</div><div class="value count">${stats.doneQty}</div></div>
      <div class="stat-card"><div class="label">إجمالي الدخل</div><div class="value wallet">${fmt(stats.income)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">تكلفة العمليات</div><div class="value expense">${fmt(stats.opCost)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">مصاريف متغيرة</div><div class="value expense">${fmt(stats.variable)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">مصاريف ثابتة محسوبة</div><div class="value expense">${fmt(stats.fixed)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">صافي الربح</div><div class="value ${stats.profit >= 0 ? 'profit' : 'loss'}">${fmt(stats.profit)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">متوسط ربح العملية</div><div class="value ${stats.avgProfit >= 0 ? 'profit' : 'loss'}">${fmt(stats.avgProfit)}<span class="unit">EGP</span></div></div>
      <div class="stat-card"><div class="label">أفضل عرض داخل الفلتر</div><div class="value">${escapeHTML(topOfferText)}</div></div>
    `;
    const periodRows = buildPeriodBreakdown();
    breakdown.innerHTML = periodRows.length ? periodRows.map(item => `
      <tr>
        <td data-label="الفترة">${escapeHTML(item.period)}</td>
        <td data-label="عدد العمليات">${item.qty}</td>
        <td data-label="الدخل"><span class="num paid-val">${fmt(item.income)}</span></td>
        <td data-label="تكلفة العمليات"><span class="num deducted-val">${fmt(item.opCost)}</span></td>
        <td data-label="المصاريف المتغيرة"><span class="num deducted-val">${fmt(item.variable)}</span></td>
        <td data-label="صافي الربح"><span class="num ${item.profit >= 0 ? 'profit-val' : 'loss-val'}">${fmt(item.profit)}</span></td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty" style="display:table-cell;padding:1rem">لا يوجد بيانات للفترة الحالية.</td></tr>';
  }

  function buildPeriodBreakdown() {
    const byMonth = new Map();
    getFilteredRowsWithIndexes().forEach(({ row }) => {
      const d = String(row.date || '').slice(0, 10);
      const key = d ? d.slice(0, 7) : 'بدون تاريخ';
      const f = rowFinancials(row);
      const current = byMonth.get(key) || { period: key, qty: 0, income: 0, opCost: 0, variable: 0, profit: 0 };
      current.qty += f.quantity;
      current.income += f.income;
      current.opCost += f.operationCost;
      current.profit += f.profit;
      byMonth.set(key, current);
    });
    variableExpenses.filter(variableExpenseInDateRange).forEach(expense => {
      const d = String(expense.date || '').slice(0, 10);
      const key = d ? d.slice(0, 7) : 'بدون تاريخ';
      const current = byMonth.get(key) || { period: key, qty: 0, income: 0, opCost: 0, variable: 0, profit: 0 };
      current.variable += Number(expense.amount) || 0;
      current.profit -= Number(expense.amount) || 0;
      byMonth.set(key, current);
    });
    return [...byMonth.values()].sort((a, b) => String(b.period).localeCompare(String(a.period)));
  }

  function computeDaySnapshot(date) {
    const dayRows = rows.map(normalizeRow).filter(row => String(row.date || '').slice(0, 10) === date);
    const financials = dayRows.map(rowFinancials);
    const income = financials.reduce((sum, f) => sum + f.income, 0);
    const opCost = financials.reduce((sum, f) => sum + f.operationCost, 0);
    const variable = getVariableExpensesTotalForDate(date);
    const qty = financials.reduce((sum, f) => sum + f.quantity, 0);
    const profit = income - opCost - variable;
    return { date, qty, rowsCount: dayRows.length, income, opCost, variable, profit };
  }

  function exportCSV() {
    const exportRows = rowsToExport();
    if (!exportRows.length) {
      showToast(hasActiveDateFilter() ? '⚠️ لا يوجد بيانات داخل الفلتر للتصدير.' : '⚠️ لا يوجد بيانات للتصدير.');
      return;
    }
    const headers = ['date','item','offer','quantity','wallet_unit_egp','operation_expense_unit_egp','wallet_total_egp','operation_expense_total_egp','operation_profit_egp','wallet_ref','wallet_phone','wallet_sender','note'];
    const csvRows = exportRows.map(row => {
      const f = rowFinancials(row);
      return [row.date, row.item, row.offer, f.quantity, f.unitPaid, f.unitCost, f.income, f.operationCost, f.profit, row.walletRef || '', row.walletPhone || '', row.walletSender || '', row.note || ''];
    });
    const csv = [headers, ...csvRows].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = hasActiveDateFilter() ? `profit-report-filtered-${today()}.csv` : `profit-report-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildReportHTML(exportRows, title) {
    const financials = exportRows.map(rowFinancials);
    const income = financials.reduce((sum, f) => sum + f.income, 0);
    const expense = financials.reduce((sum, f) => sum + f.operationCost, 0);
    const variable = getVariableExpensesTotalForCurrentFilter();
    const profit = income - expense - variable;
    const rowsHTML = exportRows.map((row, index) => {
      const f = rowFinancials(row);
      return `<tr>
        <td>${index + 1}</td>
        <td>${escapeHTML(row.date || '')}</td>
        <td>${escapeHTML(row.item || '')}</td>
        <td>${escapeHTML(row.offer || '')}</td>
        <td>${f.quantity}</td>
        <td>${fmt(f.unitPaid)}</td>
        <td>${fmt(f.unitCost)}</td>
        <td>${fmt(f.income)}</td>
        <td>${fmt(f.operationCost)}</td>
        <td>${fmt(f.profit)}</td>
        <td>${escapeHTML(row.walletRef || '')}</td>
        <td>${escapeHTML(row.note || '')}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${escapeHTML(title)}</title>
      <style>body{font-family:Arial,Tahoma,sans-serif;direction:rtl;padding:20px;color:#111}h1{font-size:22px;margin-bottom:8px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:15px 0}.card{border:1px solid #ddd;border-radius:10px;padding:10px}.label{color:#666;font-size:12px;margin-bottom:5px}.value{font-size:18px;font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:15px;font-size:11px}th,td{border:1px solid #ddd;padding:7px;text-align:right}th{background:#f3f4f6}@media print{button{display:none}}</style>
      </head><body>
        <button onclick="window.print()">طباعة / حفظ PDF</button>
        <h1>${escapeHTML(title)}</h1>
        <p>تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}</p>
        <div class="summary">
          <div class="card"><div class="label">عدد السطور</div><div class="value">${exportRows.length}</div></div>
          <div class="card"><div class="label">إجمالي الدخل</div><div class="value">${fmt(income)} EGP</div></div>
          <div class="card"><div class="label">إجمالي المصروف</div><div class="value">${fmt(expense + variable)} EGP</div></div>
          <div class="card"><div class="label">صافي الربح</div><div class="value">${fmt(profit)} EGP</div></div>
        </div>
        <table><thead><tr><th>#</th><th>التاريخ</th><th>المنتج</th><th>العرض</th><th>الكمية</th><th>دخل/واحدة</th><th>تكلفة/واحدة</th><th>الدخل الإجمالي</th><th>التكلفة الإجمالية</th><th>الربح</th><th>رقم العملية</th><th>ملاحظة</th></tr></thead><tbody>${rowsHTML || '<tr><td colspan="12">لا يوجد بيانات</td></tr>'}</tbody></table>
      </body></html>`;
  }

  function initializeMoxV3() {
    installWalletImportSection();
    removeStatusUI();
    const quickDate = document.getElementById('quickEntryDate');
    const variableDate = document.getElementById('variableExpenseDateInput');
    const closingDate = document.getElementById('closingDateInput');
    const quantityInput = document.getElementById('quantityInput');
    if (quickDate && !quickDate.value) quickDate.value = today();
    if (variableDate && !variableDate.value) variableDate.value = today();
    if (closingDate && !closingDate.value) closingDate.value = today();
    if (quantityInput && !quantityInput.value) quantityInput.value = 1;
    loadVariableExpenses();
    loadDailyClosings();
    loadAuditLogs();
    rows = rows.map(normalizeRow);
    saveRows();
    renderQuickOfferCards();
    renderVariableExpenses();
    renderClosings();
    renderAuditLogs();
    renderAdvancedReport();
    renderWalletImportPreview();
    render();
    if (!localStorage.getItem(STORAGE_FIRST_RUN_PRO)) {
      localStorage.setItem(STORAGE_FIRST_RUN_PRO, '1');
      setReportPreset('today');
      openSectionGroupForTarget('quickEntryContent');
    }
  }



  /* ===== MOX-V3.2: لصق تلقائي + ترتيب كل الجداول بالضغط على عنوان العمود ===== */
  async function pasteWalletMessagesFromClipboard() {
    const textarea = document.getElementById('walletMessagesInput');
    if (!textarea) {
      showToast('⚠️ افتح قسم استيراد رسائل المحفظة الأول.');
      return;
    }

    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        throw new Error('Clipboard API is not available');
      }

      const text = await navigator.clipboard.readText();
      if (!String(text || '').trim()) {
        textarea.focus();
        showToast('ℹ️ الحافظة فاضية. انسخ الرسائل الأول.');
        return;
      }

      textarea.value = text;
      analyzeWalletMessages();
      showToast('✅ تم لصق الرسائل وتحليلها تلقائيًا.');
    } catch (error) {
      console.warn('Auto paste blocked:', error);
      textarea.focus();
      showToast('⚠️ المتصفح منع اللصق التلقائي. اضغط داخل الصندوق والصق يدويًا Ctrl+V أو Paste.');
    }
  }

  function getSortableCellText(cell) {
    if (!cell) return '';

    const fields = [...cell.querySelectorAll('input, select, textarea')]
      .map(el => {
        if (el.tagName === 'SELECT') {
          return el.options[el.selectedIndex]?.textContent || el.value || '';
        }
        if (el.type === 'checkbox') {
          return el.checked ? '1' : '0';
        }
        return el.value || '';
      })
      .filter(Boolean);

    const text = fields.length ? fields.join(' ') : cell.textContent;
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function parseSortableDate(value) {
    const text = String(value || '').trim();
    if (!text) return null;

    let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    }

    m = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) {
      let year = Number(m[3]);
      if (year < 100) year = year < 80 ? 2000 + year : 1900 + year;
      const d = new Date(year, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    }

    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function parseSortableNumber(value) {
    const normalized = String(value || '')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[٬,]/g, '')
      .replace(/[^0-9.\-]/g, ' ')
      .trim();

    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const number = Number(match[0]);
    return Number.isFinite(number) ? number : null;
  }

  function getSortableValue(cell) {
    const text = getSortableCellText(cell);
    const dateValue = parseSortableDate(text);
    if (dateValue !== null) return { type: 'number', value: dateValue };

    const numberValue = parseSortableNumber(text);
    const hasLetters = /[A-Za-z\u0600-\u06FF]/.test(text.replace(/EGP|USD|جنيه/gi, ''));
    if (numberValue !== null && !hasLetters) return { type: 'number', value: numberValue };

    return { type: 'text', value: text.toLowerCase() };
  }

  function compareSortableValues(a, b) {
    if (a.type === 'number' && b.type === 'number') {
      return a.value - b.value;
    }
    return String(a.value).localeCompare(String(b.value), 'ar', { numeric: true, sensitivity: 'base' });
  }

  function renumberSortableTable(table) {
    const firstHead = table.tHead?.rows?.[0]?.cells?.[0];
    const tbody = table.tBodies?.[0];
    if (!firstHead || !tbody) return;

    const isNumberColumn = String(firstHead.textContent || '').trim() === '#';
    if (!isNumberColumn) return;

    [...tbody.rows].forEach((row, index) => {
      const firstCell = row.cells?.[0];
      if (!firstCell) return;
      if (firstCell.querySelector('input, select, textarea, button')) return;
      firstCell.textContent = index + 1;
      firstCell.setAttribute('data-label', '#');
    });
  }

  function sortTableByHeader(th) {
    const table = th.closest('table');
    const headerRow = th.parentElement;
    const tbody = table?.tBodies?.[0];
    if (!table || !headerRow || !tbody || tbody.rows.length < 2) return;

    const columnIndex = [...headerRow.cells].indexOf(th);
    if (columnIndex < 0) return;

    const previousIndex = table.dataset.sortIndex;
    const previousDirection = table.dataset.sortDirection || '';
    const direction = previousIndex === String(columnIndex) && previousDirection === 'desc' ? 'asc' : 'desc';
    const multiplier = direction === 'asc' ? 1 : -1;

    const rowsToSort = [...tbody.rows].filter(row => row.cells.length > columnIndex);
    rowsToSort.sort((rowA, rowB) => {
      const valueA = getSortableValue(rowA.cells[columnIndex]);
      const valueB = getSortableValue(rowB.cells[columnIndex]);
      return compareSortableValues(valueA, valueB) * multiplier;
    });

    const fragment = document.createDocumentFragment();
    rowsToSort.forEach(row => fragment.appendChild(row));
    tbody.appendChild(fragment);

    [...headerRow.cells].forEach(cell => cell.classList.remove('sort-asc', 'sort-desc'));
    th.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
    table.dataset.sortIndex = String(columnIndex);
    table.dataset.sortDirection = direction;
    renumberSortableTable(table);
  }

  function installGlobalSortableTables() {
    if (window.__moxGlobalSortableTablesInstalled) return;
    window.__moxGlobalSortableTablesInstalled = true;

    document.addEventListener('click', function (event) {
      const th = event.target.closest('th');
      if (!th || !th.closest('table')) return;
      sortTableByHeader(th);
    });
  }



  /* ===== MOX-V3.4: رجوع جدول تصدير Excel بفترات جاهزة + XLSX مناسب لـ Google Sheets ===== */
  function injectMoxExcelExportProStyles() {
    if (document.getElementById('moxExcelExportProStyles')) return;
    const style = document.createElement('style');
    style.id = 'moxExcelExportProStyles';
    style.textContent = `
      .excel-export-panel-pro {
        border: 1px solid rgba(34,197,94,.28);
        background: linear-gradient(135deg, rgba(34,197,94,.10), rgba(79,142,247,.08));
      }

      .excel-export-actions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: .55rem;
        margin: .75rem 0;
      }

      .excel-month-buttons {
        display: flex;
        gap: .45rem;
        flex-wrap: wrap;
        margin-top: .5rem;
      }

      .excel-month-btn {
        border: 1px solid rgba(34,197,94,.35);
        background: rgba(34,197,94,.10);
        color: var(--green);
        border-radius: 999px;
        padding: .38rem .7rem;
        font-family: 'Cairo', sans-serif;
        font-weight: 900;
        font-size: .72rem;
        cursor: pointer;
      }

      .excel-month-btn.active {
        background: var(--green);
        color: #06120b;
      }

      .excel-export-preview-box {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
        gap: .55rem;
        margin-top: .75rem;
      }

      .excel-export-preview-box .mini-card {
        border: 1px solid rgba(148,163,184,.16);
        background: rgba(17,20,33,.55);
        border-radius: 14px;
        padding: .75rem;
      }

      .excel-export-preview-box .mini-card .label {
        color: var(--muted2);
        font-size: .66rem;
        font-weight: 900;
        margin-bottom: .2rem;
      }

      .excel-export-preview-box .mini-card .value {
        font-size: 1rem;
        font-weight: 900;
      }

      .excel-export-table-preview {
        margin-top: .8rem;
        border: 1px solid rgba(34,197,94,.24);
        border-radius: 14px;
        overflow-x: auto;
        background: rgba(17,20,33,.45);
      }

      .excel-export-table-preview table {
        min-width: 900px;
      }

      .excel-export-table-preview thead tr,
      .excel-export-table-preview .summary-row {
        background: #20ff00 !important;
        color: #000 !important;
        font-weight: 900;
      }

      @media(max-width:760px) {
        .excel-export-actions-grid { grid-template-columns: 1fr 1fr; }
        .excel-month-buttons { display: grid; grid-template-columns: 1fr 1fr; }
        .excel-month-btn { border-radius: 12px; min-height: 40px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureExcelExportSection() {
    injectMoxExcelExportProStyles();

    if (document.getElementById('excelExportProSection')) {
      renderExcelExportPresetButtons();
      updateExcelExportPreview();
      return;
    }

    const reportsSection = document.getElementById('reportsContent')?.closest('.section');
    const manualSection = document.getElementById('manualContent')?.closest('.section');
    const anchor = reportsSection || manualSection || document.querySelector('.section');
    if (!anchor) return;

    anchor.insertAdjacentHTML('afterend', `
      <div class="section" id="excelExportProSection">
        <div class="section-head">
          <div>
            <div class="section-title">📗 تصدير Excel احترافي</div>
            <div class="section-subtitle">حدد الفترة يدويًا، أو اختار اليوم/أمس/الشهر الحالي/السابق/أي شهر محفوظ في الموقع.</div>
          </div>
          <button class="toggle-btn" type="button" onclick="toggleSection('excelExportProContent', this)">إخفاء</button>
        </div>

        <div id="excelExportProContent" class="panel excel-export-panel-pro">
          <div class="panel-title">تحديد فترة التصدير</div>
          <div class="filter-grid">
            <div class="field">
              <label>من تاريخ</label>
              <input id="excelExportFromDate" type="date" onchange="updateExcelExportPreview()">
            </div>
            <div class="field">
              <label>إلى تاريخ</label>
              <input id="excelExportToDate" type="date" onchange="updateExcelExportPreview()">
            </div>
            <button class="btn btn-add" type="button" onclick="exportExcelGreenStyle()">📗 تصدير Excel</button>
            <button class="btn btn-export" type="button" onclick="setExcelExportPreset('all')">كل السجل</button>
          </div>

          <div class="panel-title" style="margin-top:.8rem">اختيارات جاهزة</div>
          <div id="excelExportQuickButtons" class="excel-export-actions-grid"></div>

          <div class="panel-title" style="margin-top:.8rem">الشهور المحفوظة داخل الموقع</div>
          <div id="excelExportMonthButtons" class="excel-month-buttons"></div>
          <div id="excelExportRangeNote" class="filter-note">اختار فترة للتصدير.</div>
          <div id="excelExportPreview" class="excel-export-preview-box"></div>
          <div id="excelExportTablePreview" class="excel-export-table-preview"></div>
        </div>
      </div>
    `);

    if (!COLLAPSIBLE_CONTENT_IDS.includes('excelExportProContent')) COLLAPSIBLE_CONTENT_IDS.push('excelExportProContent');
    renderExcelExportPresetButtons();
    setExcelExportPreset('today', true);
  }

  function openExcelExportPanel() {
    ensureExcelExportSection();
    openSectionGroupForTarget('excelExportProContent');
    renderExcelExportPresetButtons();
    updateExcelExportPreview();
    setTimeout(() => document.getElementById('excelExportProSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  }

  function exportExcel() {
    openExcelExportPanel();
  }

  function parseISODateLocal(value) {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function toISODateLocal(date) {
    return date.toLocaleDateString('en-CA');
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  function addMonthsLocal(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
  }

  function toEnglishDigits(value) {
    return String(value ?? '')
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٫]/g, '.')
      .replace(/[٬]/g, ',');
  }

  function formatMonthButtonLabel(yearMonth, includeYear) {
    const [year, month] = String(yearMonth).split('-');
    if (!year || !month) return yearMonth;
    return includeYear ? `شهر ${Number(month)} - ${year}` : `شهر ${Number(month)}`;
  }

  function getSavedExcelMonths() {
    const map = new Map();
    rows.map(normalizeRow).forEach(row => {
      const date = String(row.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const key = date.slice(0, 7);
      const current = map.get(key) || { key, count: 0, qty: 0 };
      current.count += 1;
      current.qty += getRowQuantity(row);
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  function renderExcelExportPresetButtons() {
    const quickWrap = document.getElementById('excelExportQuickButtons');
    const monthWrap = document.getElementById('excelExportMonthButtons');
    if (!quickWrap || !monthWrap) return;

    quickWrap.innerHTML = `
      <button class="btn btn-add" type="button" onclick="setExcelExportPreset('today')">تصدير اليوم</button>
      <button class="btn btn-export" type="button" onclick="setExcelExportPreset('yesterday')">تصدير أمس</button>
      <button class="btn btn-purple" type="button" onclick="setExcelExportPreset('currentMonth')">الشهر الحالي</button>
      <button class="btn btn-amber" type="button" onclick="setExcelExportPreset('previousMonth')">الشهر السابق</button>
      <button class="btn btn-export" type="button" onclick="setExcelExportPreset('currentYear')">السنة الحالية</button>
      <button class="btn btn-clear" type="button" onclick="setExcelExportPreset('all')">كل السجل</button>
    `;

    const months = getSavedExcelMonths();
    if (!months.length) {
      monthWrap.innerHTML = '<div class="filter-note">لا توجد شهور محفوظة بعد. لما تضيف عمليات، الشهور هتظهر هنا تلقائيًا.</div>';
      return;
    }

    const years = new Set(months.map(item => item.key.slice(0, 4)));
    const includeYear = years.size > 1;
    monthWrap.innerHTML = months.map(item => `
      <button class="excel-month-btn" type="button" data-month="${escapeHTML(item.key)}" onclick="setExcelExportMonth('${escapeHTML(item.key)}')">
        ${escapeHTML(formatMonthButtonLabel(item.key, includeYear))} · ${excelQty(item.qty)} عملية
      </button>
    `).join('');
  }

  function setExcelExportRange(from, to, label) {
    const fromInput = document.getElementById('excelExportFromDate');
    const toInput = document.getElementById('excelExportToDate');
    if (fromInput) fromInput.value = from || '';
    if (toInput) toInput.value = to || '';
    const note = document.getElementById('excelExportRangeNote');
    if (note) note.textContent = label || buildExcelRangeLabel(from, to);
    updateExcelMonthButtonActive(from, to);
    updateExcelExportPreview();
  }

  function setExcelExportPreset(type, silent = false) {
    const now = parseISODateLocal(today()) || new Date();
    let from = '';
    let to = '';
    let label = '';

    if (type === 'today') {
      from = today();
      to = today();
      label = 'الفترة المختارة: اليوم.';
    } else if (type === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = toISODateLocal(y);
      to = from;
      label = 'الفترة المختارة: أمس.';
    } else if (type === 'currentMonth') {
      from = toISODateLocal(startOfMonth(now));
      to = toISODateLocal(endOfMonth(now));
      label = 'الفترة المختارة: الشهر الحالي.';
    } else if (type === 'previousMonth') {
      const prev = addMonthsLocal(now, -1);
      from = toISODateLocal(startOfMonth(prev));
      to = toISODateLocal(endOfMonth(prev));
      label = 'الفترة المختارة: الشهر السابق.';
    } else if (type === 'currentYear') {
      from = `${now.getFullYear()}-01-01`;
      to = `${now.getFullYear()}-12-31`;
      label = 'الفترة المختارة: السنة الحالية.';
    } else if (type === 'all') {
      from = '';
      to = '';
      label = 'الفترة المختارة: كل السجل.';
    }

    setExcelExportRange(from, to, label);
    if (!silent) showToast('✅ تم تحديد فترة التصدير.');
  }

  function setExcelExportMonth(yearMonth) {
    const [year, month] = String(yearMonth || '').split('-').map(Number);
    if (!year || !month) return;
    const d = new Date(year, month - 1, 1);
    const from = toISODateLocal(startOfMonth(d));
    const to = toISODateLocal(endOfMonth(d));
    const months = getSavedExcelMonths();
    const includeYear = new Set(months.map(item => item.key.slice(0, 4))).size > 1;
    const label = formatMonthButtonLabel(yearMonth, includeYear);
    setExcelExportRange(from, to, `الفترة المختارة: ${label}.`);
    showToast(`✅ تم تحديد ${label} للتصدير.`);
  }

  function updateExcelMonthButtonActive(from, to) {
    const buttons = document.querySelectorAll('#excelExportMonthButtons .excel-month-btn');
    buttons.forEach(btn => {
      const key = btn.dataset.month || '';
      const [year, month] = key.split('-').map(Number);
      if (!year || !month || !from || !to) {
        btn.classList.remove('active');
        return;
      }
      const d = new Date(year, month - 1, 1);
      btn.classList.toggle('active', from === toISODateLocal(startOfMonth(d)) && to === toISODateLocal(endOfMonth(d)));
    });
  }

  function getExcelExportRange() {
    let from = document.getElementById('excelExportFromDate')?.value || '';
    let to = document.getElementById('excelExportToDate')?.value || '';
    if (from && to && from > to) {
      const temp = from;
      from = to;
      to = temp;
    }
    return { from, to };
  }

  function buildExcelRangeLabel(from, to) {
    if (!from && !to) return 'كل السجل';
    if (from && to && from === to) return `يوم ${formatExcelDateShort(from, true)}`;
    return `من ${from ? formatExcelDateShort(from, true) : 'بداية السجل'} إلى ${to ? formatExcelDateShort(to, true) : 'نهاية السجل'}`;
  }

  function getRowsForExcelRange(from, to) {
    return rows
      .map(normalizeRow)
      .filter(row => {
        const d = String(row.date || '').slice(0, 10);
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .sort((a, b) => {
        const keyA = `${String(a.date || '')} ${String(a.walletTime || '')} ${String(a.createdAt || '')} ${String(a.walletRef || '')}`;
        const keyB = `${String(b.date || '')} ${String(b.walletTime || '')} ${String(b.createdAt || '')} ${String(b.walletRef || '')}`;
        return keyA.localeCompare(keyB, 'en', { numeric: true });
      });
  }

  function updateExcelExportPreview() {
    const preview = document.getElementById('excelExportPreview');
    const note = document.getElementById('excelExportRangeNote');
    const tablePreview = document.getElementById('excelExportTablePreview');
    if (!preview) return;

    const { from, to } = getExcelExportRange();
    const exportRows = getRowsForExcelRange(from, to);
    const stats = getExcelExportStats(exportRows);

    if (note) note.textContent = `الفترة الحالية: ${buildExcelRangeLabel(from, to)} — عدد السطور: ${exportRows.length} — إجمالي الكميات: ${excelQty(stats.qty)}.`;

    preview.innerHTML = `
      <div class="mini-card"><div class="label">عدد السطور</div><div class="value count">${exportRows.length}</div></div>
      <div class="mini-card"><div class="label">إجمالي الكمية</div><div class="value count">${excelQty(stats.qty)}</div></div>
      <div class="mini-card"><div class="label">إجمالي الداخل</div><div class="value wallet">${excelNumber(stats.income)} EGP</div></div>
      <div class="mini-card"><div class="label">إجمالي المصروف</div><div class="value expense">${excelNumber(stats.cost)} EGP</div></div>
      <div class="mini-card"><div class="label">صافي الربح</div><div class="value ${stats.profit >= 0 ? 'profit' : 'loss'}">${excelNumber(stats.profit)} EGP</div></div>
    `;

    if (tablePreview) {
      const previewRows = exportRows.slice(0, 7);
      const totalRowsNote = exportRows.length > previewRows.length ? `<div class="filter-note" style="padding:.5rem .7rem">يتم عرض أول ${previewRows.length} سطور فقط كمعاينة، والتصدير يحتوي على كل السطور.</div>` : '';
      tablePreview.innerHTML = `
        <table>
          <thead><tr>${EXCEL_EXPORT_HEADERS.map(h => `<th>${escapeHTML(h)}</th>`).join('')}</tr></thead>
          <tbody>
            <tr class="summary-row">${getExcelSummaryRow(stats).map(v => `<td>${escapeHTML(v)}</td>`).join('')}</tr>
            ${previewRows.map(row => `<tr>${getExcelDataRow(row).map(v => `<td>${escapeHTML(v)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="8">لا توجد بيانات في الفترة المختارة.</td></tr>'}
          </tbody>
        </table>
        ${totalRowsNote}
      `;
    }
  }

  function getExcelExportStats(exportRows) {
    return exportRows.reduce((acc, row) => {
      const f = rowFinancials(row);
      acc.qty += f.quantity;
      acc.income += f.income;
      acc.cost += f.operationCost;
      acc.profit += f.profit;
      return acc;
    }, { qty: 0, income: 0, cost: 0, profit: 0 });
  }

  function excelNumber(value, digits = 2) {
    const n = Number(value) || 0;
    return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function excelQty(value) {
    const n = Number(value) || 0;
    return Number.isInteger(n) ? String(n) : excelNumber(n, 2);
  }

  function formatExcelDateShort(value, includeYear = false) {
    const date = parseISODateLocal(String(value || '').slice(0, 10));
    if (!date) return toEnglishDigits(value || '');
    const day = date.getDate();
    const month = date.getMonth() + 1;
    return includeYear ? `${day}/${month}/${date.getFullYear()}` : `${day}/${month}`;
  }

  const EXCEL_EXPORT_HEADERS = [
    'اسم المنتج / الخدمة',
    'العرض',
    'الداخل / واحدة',
    'مصروف / واحدة',
    'ربح الإجمالي',
    'الداخل للمحفظة بالدولار',
    'مصاريف العمليات بالدولار',
    'التاريخ'
  ];

  function getExcelRates() {
    const walletRate = parseFloat(document.getElementById('walletDollarRate')?.value || localStorage.getItem(STORAGE_WALLET_DOLLAR_RATE) || '53') || 0;
    const expensesRate = parseFloat(document.getElementById('expensesDollarRate')?.value || localStorage.getItem(STORAGE_EXPENSES_DOLLAR_RATE) || '53') || 0;
    return { walletRate, expensesRate };
  }

  function getExcelSummaryRow(stats) {
    const { walletRate, expensesRate } = getExcelRates();
    const incomeUsd = walletRate > 0 ? stats.income / walletRate : 0;
    const costUsd = expensesRate > 0 ? stats.cost / expensesRate : 0;
    return [
      'الإجمالي',
      '',
      excelNumber(stats.income),
      excelNumber(stats.cost),
      excelNumber(stats.profit),
      excelNumber(incomeUsd),
      excelNumber(costUsd),
      ''
    ];
  }

  function getExcelDataRow(row) {
    const normalized = normalizeRow(row);
    const f = rowFinancials(normalized);
    const { walletRate, expensesRate } = getExcelRates();
    const incomeUsd = walletRate > 0 ? f.income / walletRate : 0;
    const costUsd = expensesRate > 0 ? f.operationCost / expensesRate : 0;
    return [
      toEnglishDigits(normalized.item || ''),
      toEnglishDigits(normalized.offer || ''),
      excelNumber(f.unitPaid),
      excelNumber(f.unitCost),
      excelNumber(f.profit),
      excelNumber(incomeUsd),
      excelNumber(costUsd),
      formatExcelDateShort(normalized.date)
    ];
  }

  function getExcelDownloadFileName(rangeLabel, extension = 'xlsx') {
    return `mox-export-${String(rangeLabel || today()).replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-')}.${extension}`;
  }

  function loadXlsxLibrary() {
    if (window.XLSX && window.XLSX.utils && window.XLSX.writeFile) return Promise.resolve(true);

    return new Promise((resolve, reject) => {
      const existing = document.getElementById('moxXlsxStyleLib') || document.getElementById('moxXlsxLib');
      if (existing) {
        existing.addEventListener('load', () => resolve(true), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = 'moxXlsxStyleLib';
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
      script.onload = () => resolve(true);
      script.onerror = () => {
        script.remove();
        const fallback = document.createElement('script');
        fallback.id = 'moxXlsxLib';
        fallback.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        fallback.onload = () => resolve(true);
        fallback.onerror = reject;
        document.head.appendChild(fallback);
      };
      document.head.appendChild(script);
    });
  }

  function applyExcelSheetStyles(ws, rowCount) {
    const greenFill = { patternType: 'solid', fgColor: { rgb: '20FF00' } };
    const blackFont = { color: { rgb: '000000' }, bold: true, sz: 12 };
    const border = {
      top: { style: 'thin', color: { rgb: 'D9D9D9' } },
      bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
      left: { style: 'thin', color: { rgb: 'D9D9D9' } },
      right: { style: 'thin', color: { rgb: 'D9D9D9' } }
    };

    for (let c = 0; c < EXCEL_EXPORT_HEADERS.length; c++) {
      const headerAddress = XLSX.utils.encode_cell({ r: 0, c });
      const summaryAddress = XLSX.utils.encode_cell({ r: 1, c });
      if (ws[headerAddress]) ws[headerAddress].s = { fill: greenFill, font: blackFont, alignment: { horizontal: 'center', vertical: 'center', readingOrder: 2 }, border };
      if (ws[summaryAddress]) ws[summaryAddress].s = { fill: greenFill, font: blackFont, alignment: { horizontal: 'center', vertical: 'center', readingOrder: 2 }, border };
    }

    for (let r = 2; r < rowCount; r++) {
      for (let c = 0; c < EXCEL_EXPORT_HEADERS.length; c++) {
        const address = XLSX.utils.encode_cell({ r, c });
        if (!ws[address]) continue;
        ws[address].s = { alignment: { horizontal: c === 0 || c === 1 ? 'right' : 'center', vertical: 'center', readingOrder: c === 0 || c === 1 ? 2 : 1 }, border };
      }
    }
  }

  async function exportExcelGreenStyle(mode) {
    ensureExcelExportSection();
    let from = '';
    let to = '';
    let rangeLabel = '';

    if (mode === 'currentFilter') {
      const filters = getDateFilters();
      from = filters.from || '';
      to = filters.to || '';
      rangeLabel = buildExcelRangeLabel(from, to);
    } else {
      const range = getExcelExportRange();
      from = range.from;
      to = range.to;
      rangeLabel = buildExcelRangeLabel(from, to);
    }

    const exportRows = getRowsForExcelRange(from, to);
    if (!exportRows.length) {
      showToast('⚠️ لا يوجد بيانات للتصدير في الفترة المختارة.');
      return;
    }

    const stats = getExcelExportStats(exportRows);
    const data = [
      EXCEL_EXPORT_HEADERS,
      getExcelSummaryRow(stats),
      ...exportRows.map(getExcelDataRow)
    ];

    try {
      await loadXlsxLibrary();
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [
        { wch: 24 },
        { wch: 18 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 22 },
        { wch: 22 },
        { wch: 12 }
      ];
      ws['!autofilter'] = { ref: `A1:H${Math.max(2, data.length)}` };
      ws['!view'] = { rightToLeft: true };
      ws['!rtl'] = true;
      applyExcelSheetStyles(ws, data.length);

      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, ws, 'MOX Export');
      XLSX.writeFile(wb, getExcelDownloadFileName(rangeLabel, 'xlsx'));
      showToast('✅ تم تصدير Excel بالفترة المختارة.');
    } catch (error) {
      console.warn('XLSX export failed, using HTML fallback:', error);
      exportExcelHtmlFallback(data, rangeLabel);
    }
  }

  function exportExcelHtmlFallback(data, rangeLabel) {
    const rowsHtml = data.map((row, index) => {
      const cells = row.map(cell => `<td style="border:1px solid #d9d9d9;padding:6px;text-align:center;mso-number-format:'\\@';">${escapeHTML(cell)}</td>`).join('');
      const style = index <= 1 ? 'background:#20ff00;color:#000;font-weight:bold;' : '';
      return `<tr style="${style}">${cells}</tr>`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body dir="rtl"><table>${rowsHtml}</table></body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getExcelDownloadFileName(rangeLabel, 'xls');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('✅ تم تصدير Excel. لو Google Sheets لم يقرأ التنسيق بالكامل، افتح الملف في Excel أولًا.');
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureExcelExportSection();
  });



  /* ===== MOX update: bulk date editing + automatic quick-offer ordering ===== */
  let selectedRowIds = new Set();
  let selectedVariableExpenseIds = new Set();

  function moxNameCollator() {
    return new Intl.Collator(['ar', 'en'], { numeric: true, sensitivity: 'base', ignorePunctuation: true });
  }

  function moxCleanSortText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function sortPresetsByNames() {
    const collator = moxNameCollator();
    presets.sort((a, b) =>
      collator.compare(moxCleanSortText(a.item), moxCleanSortText(b.item)) ||
      collator.compare(moxCleanSortText(a.offer), moxCleanSortText(b.offer)) ||
      (Number(a.paid) || 0) - (Number(b.paid) || 0) ||
      (Number(a.deducted) || 0) - (Number(b.deducted) || 0)
    );
  }

  function installBulkDateTools() {
    const rowsPanel = document.getElementById('rowsFilterPanel');
    if (rowsPanel && !document.getElementById('rowsBulkDatePanel')) {
      rowsPanel.insertAdjacentHTML('beforeend', `
        <div id="rowsBulkDatePanel" class="bulk-date-panel">
          <div id="bulkRowsSelectedCount" class="bulk-selected-count">محدد: 0</div>
          <div class="field">
            <label>تاريخ جديد للعمليات المحددة</label>
            <input id="bulkRowsDateInput" type="date">
          </div>
          <button class="btn btn-export" type="button" onclick="toggleAllVisibleRows(true)">تحديد الكل الظاهر</button>
          <button class="btn btn-amber" type="button" onclick="toggleAllVisibleRows(false)">إلغاء التحديد</button>
          <button class="btn btn-add" type="button" onclick="applyBulkRowsDate()">تعديل تاريخ المحدد</button>
        </div>
      `);
    }

    const variableContent = document.getElementById('variableExpensesContent');
    const variableTableWrap = variableContent?.querySelector('.pro-table-wrap');
    if (variableTableWrap && !document.getElementById('variableExpenseBulkDatePanel')) {
      variableTableWrap.insertAdjacentHTML('beforebegin', `
        <div id="variableExpenseBulkDatePanel" class="bulk-date-panel">
          <div id="bulkVariableExpensesSelectedCount" class="bulk-selected-count">محدد: 0</div>
          <div class="field">
            <label>تاريخ جديد للمصاريف المحددة</label>
            <input id="bulkVariableExpensesDateInput" type="date">
          </div>
          <button class="btn btn-export" type="button" onclick="toggleAllVariableExpenses(true)">تحديد الكل</button>
          <button class="btn btn-amber" type="button" onclick="toggleAllVariableExpenses(false)">إلغاء التحديد</button>
          <button class="btn btn-add" type="button" onclick="applyBulkVariableExpensesDate()">تعديل تاريخ المحدد</button>
        </div>
      `);
    }

    const rowsDate = document.getElementById('bulkRowsDateInput');
    const variableDate = document.getElementById('bulkVariableExpensesDateInput');
    if (rowsDate && !rowsDate.value) rowsDate.value = today();
    if (variableDate && !variableDate.value) variableDate.value = today();
    updateBulkDateUI();
  }

  function ensureVariableExpenseIds() {
    let changed = false;
    variableExpenses = variableExpenses.map(item => {
      const normalized = item && typeof item === 'object' ? item : {};
      if (!normalized.id) {
        normalized.id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        changed = true;
      }
      return normalized;
    });
    if (changed) saveVariableExpenses();
  }

  function getVisibleRowIndexes() {
    return getFilteredRowsWithIndexes().map(item => item.index);
  }

  function getSelectedRowIndexes() {
    return rows.reduce((indexes, row, index) => {
      const normalized = normalizeRow(row);
      rows[index] = normalized;
      if (selectedRowIds.has(normalized.id)) indexes.push(index);
      return indexes;
    }, []);
  }

  function getSelectedVariableExpenseIndexes() {
    ensureVariableExpenseIds();
    return variableExpenses.reduce((indexes, item, index) => {
      if (selectedVariableExpenseIds.has(item.id)) indexes.push(index);
      return indexes;
    }, []);
  }

  function updateBulkDateUI() {
    const visibleRowIndexes = getVisibleRowIndexes();
    const visibleRowIds = visibleRowIndexes.map(index => normalizeRow(rows[index]).id);
    const visibleSelectedRows = visibleRowIds.filter(id => selectedRowIds.has(id));
    const rowCount = document.getElementById('bulkRowsSelectedCount');
    if (rowCount) rowCount.textContent = `محدد: ${selectedRowIds.size}`;

    const rowMaster = document.getElementById('selectAllVisibleRowsCheckbox');
    if (rowMaster) {
      rowMaster.checked = visibleRowIds.length > 0 && visibleSelectedRows.length === visibleRowIds.length;
      rowMaster.indeterminate = visibleSelectedRows.length > 0 && visibleSelectedRows.length < visibleRowIds.length;
    }

    ensureVariableExpenseIds();
    const variableCount = document.getElementById('bulkVariableExpensesSelectedCount');
    if (variableCount) variableCount.textContent = `محدد: ${selectedVariableExpenseIds.size}`;

    const visibleExpenseIds = variableExpenses.map(item => item.id);
    const selectedVisibleExpenses = visibleExpenseIds.filter(id => selectedVariableExpenseIds.has(id));
    const variableMaster = document.getElementById('selectAllVariableExpensesCheckbox');
    if (variableMaster) {
      variableMaster.checked = visibleExpenseIds.length > 0 && selectedVisibleExpenses.length === visibleExpenseIds.length;
      variableMaster.indeterminate = selectedVisibleExpenses.length > 0 && selectedVisibleExpenses.length < visibleExpenseIds.length;
    }
  }

  function toggleRowSelection(index, checked) {
    const row = normalizeRow(rows[index]);
    rows[index] = row;
    if (checked) selectedRowIds.add(row.id);
    else selectedRowIds.delete(row.id);
    updateBulkDateUI();
  }

  function toggleAllVisibleRows(checked) {
    getVisibleRowIndexes().forEach(index => {
      const row = normalizeRow(rows[index]);
      rows[index] = row;
      if (checked) selectedRowIds.add(row.id);
      else selectedRowIds.delete(row.id);
    });
    render();
  }

  function toggleVariableExpenseSelection(index, checked) {
    ensureVariableExpenseIds();
    const item = variableExpenses[index];
    if (!item) return;
    if (checked) selectedVariableExpenseIds.add(item.id);
    else selectedVariableExpenseIds.delete(item.id);
    updateBulkDateUI();
  }

  function toggleAllVariableExpenses(checked) {
    ensureVariableExpenseIds();
    variableExpenses.forEach(item => {
      if (checked) selectedVariableExpenseIds.add(item.id);
      else selectedVariableExpenseIds.delete(item.id);
    });
    renderVariableExpenses();
    updateBulkDateUI();
  }

  function confirmBulkDateChange(oldDates, newDate, actionName) {
    const closedDates = [...new Set([...oldDates, newDate].filter(date => isDateClosed(date)))];
    if (!closedDates.length) return true;
    return confirm(`⚠️ يوجد أيام مقفولة ضمن ${actionName}: ${closedDates.join('، ')}. هل تريد تنفيذ التعديل وتسجيله في سجل التعديلات؟`);
  }

  function applyBulkRowsDate() {
    const newDate = document.getElementById('bulkRowsDateInput')?.value || '';
    if (!newDate) { showToast('⚠️ اختار التاريخ الجديد الأول.'); return; }

    const indexes = getSelectedRowIndexes();
    if (!indexes.length) { showToast('⚠️ لم تحدد أي عملية.'); return; }

    const oldDates = indexes.map(index => String(rows[index]?.date || '').slice(0, 10)).filter(Boolean);
    if (!confirmBulkDateChange(oldDates, newDate, 'تعديل تاريخ العمليات المحددة')) return;

    indexes.forEach(index => {
      const before = JSON.parse(JSON.stringify(rows[index]));
      rows[index].date = newDate;
      rows[index].updatedAt = new Date().toISOString();
      addAuditLog('تعديل تاريخ جماعي لعملية', before.date || newDate, before, rows[index]);
    });

    saveRows();
    const changed = indexes.length;
    selectedRowIds.clear();
    render();
    showToast(`✅ تم تعديل تاريخ ${changed} عملية إلى ${newDate}.`);
  }

  function applyBulkVariableExpensesDate() {
    const newDate = document.getElementById('bulkVariableExpensesDateInput')?.value || '';
    if (!newDate) { showToast('⚠️ اختار التاريخ الجديد الأول.'); return; }

    const indexes = getSelectedVariableExpenseIndexes();
    if (!indexes.length) { showToast('⚠️ لم تحدد أي مصروف متغير.'); return; }

    const oldDates = indexes.map(index => String(variableExpenses[index]?.date || '').slice(0, 10)).filter(Boolean);
    if (!confirmBulkDateChange(oldDates, newDate, 'تعديل تاريخ المصاريف المحددة')) return;

    indexes.forEach(index => {
      const before = JSON.parse(JSON.stringify(variableExpenses[index]));
      variableExpenses[index].date = newDate;
      variableExpenses[index].updatedAt = new Date().toISOString();
      addAuditLog('تعديل تاريخ جماعي لمصروف متغير', before.date || newDate, before, variableExpenses[index]);
    });

    saveVariableExpenses();
    const changed = indexes.length;
    selectedVariableExpenseIds.clear();
    render();
    showToast(`✅ تم تعديل تاريخ ${changed} مصروف إلى ${newDate}.`);
  }

  function updateTableHeaderNoStatus() {
    const header = document.querySelector('#tableContent thead tr');
    if (!header) return;
    header.innerHTML = `
      <th class="bulk-check-cell"><input id="selectAllVisibleRowsCheckbox" class="bulk-check" type="checkbox" title="تحديد كل العمليات الظاهرة" onclick="event.stopPropagation()" onchange="toggleAllVisibleRows(this.checked)"></th>
      <th>#</th>
      <th class="col-date">التاريخ</th>
      <th>المنتج / الخدمة</th>
      <th>العرض</th>
      <th>الكمية</th>
      <th class="col-paid">الداخل / واحدة</th>
      <th class="col-deducted">مصروف / واحدة</th>
      <th class="col-profit">ربح الإجمالي</th>
      <th>ملاحظة</th>
      <th>إجراء</th>
    `;
  }

  function render() {
    installBulkDateTools();
    applyRowsViewOptions();
    updateTableHeaderNoStatus();
    const body = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    if (!body || !emptyState) return;

    const visibleRows = getFilteredRowsWithIndexes();
    body.innerHTML = '';
    let walletTotal = 0;
    let operationExpensesTotal = 0;
    let totalQuantity = 0;

    visibleRows.forEach(({ row, index }, displayIndex) => {
      row = normalizeRow(row);
      rows[index] = row;
      const f = rowFinancials(row);
      walletTotal += f.income;
      operationExpensesTotal += f.operationCost;
      totalQuantity += f.quantity;
      const profitClass = f.profit >= 0 ? 'profit-val' : 'loss-val';
      const rowServiceColor = getServiceColor(row.item);
      const tr = document.createElement('tr');
      tr.style.setProperty('--row-service-color', rowServiceColor);
      tr.innerHTML = `
        <td data-label="اختيار" class="bulk-check-cell"><input class="bulk-check" type="checkbox" ${selectedRowIds.has(row.id) ? 'checked' : ''} onclick="event.stopPropagation()" onchange="toggleRowSelection(${index}, this.checked)"></td>
        <td data-label="#">${displayIndex + 1}</td>
        <td data-label="التاريخ"><input class="editable" type="date" value="${escapeHTML(row.date || '')}" onchange="updateRow(${index}, 'date', this.value)"></td>
        <td data-label="المنتج / الخدمة"><input class="editable" value="${escapeHTML(row.item)}" onchange="updateRow(${index}, 'item', this.value)"></td>
        <td data-label="العرض"><input class="editable" value="${escapeHTML(row.offer)}" onchange="updateRow(${index}, 'offer', this.value)"></td>
        <td data-label="الكمية"><input class="editable num" type="number" min="1" step="1" value="${f.quantity}" onchange="updateRow(${index}, 'quantity', this.value)"></td>
        <td data-label="الداخل / واحدة"><input class="editable num paid-val" type="number" step="0.01" value="${f.unitPaid}" onchange="updateRow(${index}, 'paid', this.value)"></td>
        <td data-label="مصروف / واحدة"><input class="editable num deducted-val" type="number" step="0.01" value="${f.unitCost}" onchange="updateRow(${index}, 'deducted', this.value)"></td>
        <td data-label="ربح الإجمالي"><span class="num ${profitClass}">${fmt(f.profit)}</span><span class="unit">EGP</span></td>
        <td data-label="ملاحظة"><input class="editable note-input" value="${escapeHTML(row.note || '')}" onchange="updateRow(${index}, 'note', this.value)"></td>
        <td data-label="إجراء"><button class="delete-btn" onclick="deleteRow(${index})">حذف</button></td>
      `;
      body.appendChild(tr);
    });

    const fixedExpensesTotal = totalFixedExpenses();
    const variableExpensesTotal = getVariableExpensesTotalForCurrentFilter();
    const activeDateFilter = hasActiveDateFilter();
    const visibleExpensesTotal = operationExpensesTotal;
    const profitTotal = walletTotal - operationExpensesTotal - variableExpensesTotal - (activeDateFilter ? 0 : fixedExpensesTotal);
    const walletDollarRate = parseFloat(document.getElementById('walletDollarRate')?.value) || 0;
    const expensesDollarRate = parseFloat(document.getElementById('expensesDollarRate')?.value) || 0;
    const walletUsdTotal = walletDollarRate > 0 ? walletTotal / walletDollarRate : 0;
    const expensesUsdTotal = expensesDollarRate > 0 ? (visibleExpensesTotal + variableExpensesTotal) / expensesDollarRate : 0;

    document.getElementById('countTotal').textContent = totalQuantity;
    document.getElementById('walletTotal').innerHTML = `${fmt(walletTotal)}<span class="unit">EGP</span>`;
    document.getElementById('expensesTotal').innerHTML = `${fmt(visibleExpensesTotal + variableExpensesTotal)}<span class="unit">EGP</span>`;
    document.getElementById('walletUsdTotal').innerHTML = `${fmt(walletUsdTotal)}<span class="unit">USD</span>`;
    document.getElementById('expensesUsdTotal').innerHTML = `${fmt(expensesUsdTotal)}<span class="unit">USD</span>`;
    const profitLabelEl = document.getElementById('profitLabel');
    if (profitLabelEl) profitLabelEl.textContent = activeDateFilter ? 'صافي الفترة بعد مصاريف اليوم المتغيرة' : 'صافي المكسب بعد المصاريف الثابتة والمتغيرة';
    const profitTotalEl = document.getElementById('profitTotal');
    profitTotalEl.innerHTML = `${fmt(profitTotal)}<span class="unit">EGP</span>`;
    profitTotalEl.className = profitTotal >= 0 ? 'value profit' : 'value loss';
    emptyState.style.display = visibleRows.length ? 'none' : 'block';

    renderProductFilterOptions();
    updateFilterNote();
    renderLatestRowsPreview();
    renderDailyReport();
    renderTopOffers();
    renderAdvancedReport();
    renderVariableExpenses();
    renderClosings();
    renderAuditLogs();
    updateBulkDateUI();
  }

  function updateVariableExpenseHeader() {
    const header = document.querySelector('#variableExpenseBody')?.closest('table')?.querySelector('thead tr');
    if (!header) return;
    header.innerHTML = `
      <th class="bulk-check-cell"><input id="selectAllVariableExpensesCheckbox" class="bulk-check" type="checkbox" title="تحديد كل المصاريف" onclick="event.stopPropagation()" onchange="toggleAllVariableExpenses(this.checked)"></th>
      <th>#</th>
      <th>التاريخ</th>
      <th>الاسم</th>
      <th>التصنيف</th>
      <th>القيمة</th>
      <th>ملاحظة</th>
      <th>إجراء</th>
    `;
  }

  function renderVariableExpenses() {
    installBulkDateTools();
    ensureVariableExpenseIds();
    updateVariableExpenseHeader();
    const body = document.getElementById('variableExpenseBody');
    if (!body) return;
    body.innerHTML = '';
    const items = variableExpenses.map((item, index) => ({ item, index })).sort((a, b) => String(b.item.date).localeCompare(String(a.item.date)));
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty" style="display:table-cell;padding:1rem">لا يوجد مصاريف متغيرة حتى الآن.</td></tr>';
      updateBulkDateUI();
      return;
    }

    items.forEach(({ item, index }, displayIndex) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="اختيار" class="bulk-check-cell"><input class="bulk-check" type="checkbox" ${selectedVariableExpenseIds.has(item.id) ? 'checked' : ''} onclick="event.stopPropagation()" onchange="toggleVariableExpenseSelection(${index}, this.checked)"></td>
        <td data-label="#">${displayIndex + 1}</td>
        <td data-label="التاريخ"><input class="editable" type="date" value="${escapeHTML(item.date || '')}" onchange="updateVariableExpense(${index}, 'date', this.value)"></td>
        <td data-label="الاسم"><input class="editable" value="${escapeHTML(item.name || '')}" onchange="updateVariableExpense(${index}, 'name', this.value)"></td>
        <td data-label="التصنيف"><input class="editable" value="${escapeHTML(item.category || '')}" onchange="updateVariableExpense(${index}, 'category', this.value)"></td>
        <td data-label="القيمة"><input class="editable num deducted-val" type="number" step="0.01" value="${Number(item.amount) || 0}" onchange="updateVariableExpense(${index}, 'amount', this.value)"></td>
        <td data-label="ملاحظة"><input class="editable note-input" value="${escapeHTML(item.note || '')}" onchange="updateVariableExpense(${index}, 'note', this.value)"></td>
        <td data-label="إجراء"><button class="delete-btn" onclick="deleteVariableExpense(${index})">حذف</button></td>
      `;
      body.appendChild(tr);
    });
    updateBulkDateUI();
  }

  function updateRow(index, key, value) {
    if (!rows[index]) return;
    const before = JSON.parse(JSON.stringify(rows[index]));
    const originalDate = before.date || today();
    const nextDate = key === 'date' ? String(value || '').slice(0, 10) : originalDate;
    if (!confirmBulkDateChange([originalDate], nextDate, 'تعديل عملية')) return;
    if (key === 'paid' || key === 'deducted') rows[index][key] = parseFloat(value) || 0;
    else if (key === 'quantity') rows[index][key] = normalizeQuantity(value);
    else if (key === 'status') rows[index][key] = 'done';
    else rows[index][key] = value;
    rows[index].status = 'done';
    rows[index].updatedAt = new Date().toISOString();
    saveRows();
    addAuditLog('تعديل عملية', originalDate, before, rows[index]);
    render();
  }

  function updateVariableExpense(index, key, value) {
    ensureVariableExpenseIds();
    if (!variableExpenses[index]) return;
    const before = JSON.parse(JSON.stringify(variableExpenses[index]));
    const originalDate = before.date || today();
    const nextDate = key === 'date' ? String(value || '').slice(0, 10) : originalDate;
    if (!confirmBulkDateChange([originalDate], nextDate, 'تعديل مصروف متغير')) return;
    if (key === 'amount') variableExpenses[index][key] = parseFloat(value) || 0;
    else variableExpenses[index][key] = value;
    variableExpenses[index].updatedAt = new Date().toISOString();
    saveVariableExpenses();
    addAuditLog('تعديل مصروف متغير', originalDate, before, variableExpenses[index]);
    render();
  }

  function deleteRow(index) {
    if (!rows[index]) return;
    const before = JSON.parse(JSON.stringify(rows[index]));
    if (!confirmIfClosedDate(before.date, 'حذف عملية')) return;
    const confirmed = confirm('⚠️ هل تريد حذف هذه العملية؟');
    if (!confirmed) return;

    selectedRowIds.delete(normalizeRow(rows[index]).id);
    const deleted = rows.splice(index, 1);
    pushDeleted('rows', deleted, 'عملية من سجل العمليات');
    saveRows();
    addAuditLog('حذف عملية', before.date, before, null);
    render();
    showToast('✅ تم حذف العملية. يمكنك استرجاعها.');
  }

  function deleteVariableExpense(index) {
    ensureVariableExpenseIds();
    if (!variableExpenses[index]) return;
    const before = JSON.parse(JSON.stringify(variableExpenses[index]));
    if (!confirmIfClosedDate(before.date, 'حذف مصروف متغير')) return;
    if (!confirm('⚠️ هل تريد حذف هذا المصروف المتغير؟')) return;
    selectedVariableExpenseIds.delete(variableExpenses[index].id);
    variableExpenses.splice(index, 1);
    saveVariableExpenses();
    addAuditLog('حذف مصروف متغير', before.date, before, null);
    render();
    showToast('✅ تم حذف المصروف المتغير.');
  }

  function renderPresets() {
    renderPresetSelect();
    renderPresetList();
    renderServiceColorEditor();
    renderQuickOfferCards();
  }

  function addPreset() {
    const values = getPresetFormValues();
    if (!values) return;

    const preset = createPresetObject(values.item, values.offer, values.paid, values.deducted);
    presets.push(preset);
    sortPresetsByNames();
    getServiceColor(values.item);
    saveServiceColors();
    savePresets();
    renderPresets();

    document.getElementById('presetItemInput').value = '';
    document.getElementById('presetOfferInput').value = '';
    document.getElementById('presetPaidInput').value = '';
    document.getElementById('presetDeductedInput').value = '';

    const select = document.getElementById('presetSelect');
    const newIndex = presets.findIndex(item => item.id && preset.id && item.id === preset.id);
    if (select && newIndex >= 0) {
      select.value = String(newIndex);
      updatePresetSelectColorPreview();
    }

    showToast('✅ تم حفظ العرض وترتيبه تلقائيًا حسب اسم الخدمة ثم اسم العرض.');
  }

  function saveCurrentManualAsPreset() {
    const itemInput = document.getElementById('itemInput');
    const offerInput = document.getElementById('offerInput');
    const paidInput = document.getElementById('paidInput');
    const deductedInput = document.getElementById('deductedInput');

    const item = itemInput.value.trim();
    const offer = offerInput.value.trim();
    const paid = parseFloat(paidInput.value);
    const deducted = parseFloat(deductedInput.value);

    if (!item) { alert('اكتب اسم المنتج / الخدمة الأول.'); itemInput.focus(); return; }
    if (!offer) { alert('اكتب العرض الأول.'); offerInput.focus(); return; }
    if (Number.isNaN(paid) || paid < 0) { alert('اكتب الداخل للمحفظة بشكل صحيح.'); paidInput.focus(); return; }
    if (Number.isNaN(deducted) || deducted < 0) { alert('اكتب مصروف العملية بشكل صحيح.'); deductedInput.focus(); return; }

    const preset = createPresetObject(item, offer, paid, deducted);
    presets.push(preset);
    sortPresetsByNames();
    getServiceColor(item);
    saveServiceColors();
    savePresets();
    renderPresets();

    const select = document.getElementById('presetSelect');
    const newIndex = presets.findIndex(saved => saved.id && preset.id && saved.id === preset.id);
    if (select && newIndex >= 0) {
      select.value = String(newIndex);
      updatePresetSelectColorPreview();
    }

    showToast('✅ تم حفظ العملية الحالية كعرض سريع وترتيبها تلقائيًا.');
  }

  function updatePreset(index, key, value) {
    if (!presets[index]) return;
    const currentId = presets[index].id;

    if (key === 'paid' || key === 'deducted') presets[index][key] = parseFloat(value) || 0;
    else presets[index][key] = value;

    if (key === 'item') {
      getServiceColor(value);
      saveServiceColors();
    }

    presets[index].updatedAt = new Date().toISOString();
    if (key === 'item' || key === 'offer') sortPresetsByNames();
    savePresets();
    renderPresets();

    const select = document.getElementById('presetSelect');
    const newIndex = presets.findIndex(preset => preset.id && currentId && preset.id === currentId);
    if (select && newIndex >= 0) {
      select.value = String(newIndex);
      updatePresetSelectColorPreview();
    }

    showToast(key === 'item' || key === 'offer' ? '✅ تم تعديل العرض وإعادة ترتيبه حسب الاسم.' : '✅ تم تعديل العرض المحفوظ.');
  }

  function sortPresets(type) {
    if (!type || type === 'manual') return;
    const collator = moxNameCollator();

    presets.sort((a, b) => {
      if (type === 'itemAsc') return collator.compare(a.item || '', b.item || '') || collator.compare(a.offer || '', b.offer || '');
      if (type === 'offerAsc') return collator.compare(a.offer || '', b.offer || '') || collator.compare(a.item || '', b.item || '');
      if (type === 'paidAsc') return (Number(a.paid) || 0) - (Number(b.paid) || 0);
      if (type === 'paidDesc') return (Number(b.paid) || 0) - (Number(a.paid) || 0);
      if (type === 'profitDesc') return calcProfit(b) - calcProfit(a);
      if (type === 'profitAsc') return calcProfit(a) - calcProfit(b);
      return 0;
    });

    savePresets();
    renderPresets();
    document.getElementById('presetSortSelect').value = 'manual';
    showToast('✅ تم ترتيب العروض المحفوظة.');
  }


  /* ===== MOX-V4 Pro complete upgrade layer: 28 improvements ===== */
  var MOX_V4_VERSION = 'MOX-V4 Pro';
  var MOX_V4_RECENT_KEY = 'profit_mox_v4_recent_presets_v1';
  var MOX_V4_UNDO_KEY = 'profit_mox_v4_undo_stack_v1';
  var MOX_V4_ROWS_PER_PAGE_KEY = 'profit_mox_v4_rows_per_page_v1';
  var MOX_V4_PAGE_KEY = 'profit_mox_v4_current_page_v1';
  var MOX_V4_ARCHIVED_ROWS_KEY = 'profit_mox_v4_show_archived_rows_v1';
  var MOX_V4_ARCHIVED_PRESETS_KEY = 'profit_mox_v4_show_archived_presets_v1';
  var MOX_V4_PRIVACY_KEY = 'profit_mox_v4_privacy_mode_v1';
  var MOX_V4_LAST_BACKUP_DAY_KEY = 'profit_mox_v4_last_auto_backup_day_v1';
  var MOX_V4_BACKUP_RING_KEY = 'profit_mox_v4_auto_backup_ring_v1';
  var MOX_V4_AUTO_LOCK_KEY = 'profit_mox_v4_auto_lock_minutes_v1';
  var MOX_V4_INDEXED_DB_NAME = 'mox_v4_cache';
  var MOX_V4_INDEXED_STORE = 'snapshots';
  var moxV4CurrentPage = Number(localStorage.getItem(MOX_V4_PAGE_KEY) || '1') || 1;
  var moxV4RowsPerPage = Number(localStorage.getItem(MOX_V4_ROWS_PER_PAGE_KEY) || '50') || 50;
  var moxV4LastRenderReason = '';
  var moxV4LazyReportsReady = false;
  var moxV4LastActivityAt = Date.now();
  var moxV4SyncTimer = null;
  var moxV4RenderTimer = null;
  var moxV4EditingRowIndex = null;

  function moxV4SafeJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || ''); } catch (e) { return fallback; }
  }

  function moxV4SetJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function moxV4FingerprintPreset(preset) {
    preset = preset || {};
    return String(preset.id || `${preset.item || ''}|${preset.offer || ''}|${preset.paid || 0}|${preset.deducted || 0}`);
  }

  function moxV4CleanSearch(value) {
    return normalizeText(value)
      .replace(/[\u064B-\u0652]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function moxV4SmartHaystack(presetOrRow) {
    const x = presetOrRow || {};
    const aliases = {
      'ببجي': 'pubg battlegrounds uc شدات',
      'بوبجي': 'pubg battlegrounds uc شدات',
      'شدات': 'uc pubg ببجي',
      'نتفلكس': 'netflix نيتفليكس',
      'نيتفليكس': 'netflix نتفلكس',
      'جوجل': 'google play متجر',
      'ابل': 'apple app store ايفون iphone',
      'ايفون': 'iphone apple ابل',
      'واتس': 'whatsapp واتساب',
      'فيس': 'facebook meta فيسبوك',
      'انستا': 'instagram انستجرام'
    };
    const base = `${x.date || ''} ${x.item || ''} ${x.offer || ''} ${x.paid || ''} ${x.deducted || ''} ${x.quantity || ''} ${x.note || ''} ${calcProfit(x) || ''}`;
    const normalized = moxV4CleanSearch(base);
    const extra = Object.keys(aliases).filter(k => normalized.includes(moxV4CleanSearch(k))).map(k => aliases[k]).join(' ');
    return `${normalized} ${moxV4CleanSearch(extra)}`.trim();
  }

  function moxV4MatchesSmartSearch(item, search) {
    const q = moxV4CleanSearch(search || '');
    if (!q) return true;
    return q.split(' ').every(part => moxV4SmartHaystack(item).includes(part));
  }

  function moxV4IsArchivedRow(row) {
    return Boolean(row && (row.archived === true || row.deleted === true || row.hidden === true));
  }

  function moxV4IsArchivedPreset(preset) {
    return Boolean(preset && (preset.archived === true || preset.hidden === true || preset.deleted === true));
  }

  function moxV4ShowArchivedRows() {
    return localStorage.getItem(MOX_V4_ARCHIVED_ROWS_KEY) === '1';
  }

  function moxV4ShowArchivedPresets() {
    return localStorage.getItem(MOX_V4_ARCHIVED_PRESETS_KEY) === '1';
  }

  function moxV4GetServices() {
    return [...new Set([
      ...presets.filter(p => !moxV4IsArchivedPreset(p) || moxV4ShowArchivedPresets()).map(p => normalizeServiceName(p.item)),
      ...rows.filter(r => !moxV4IsArchivedRow(r) || moxV4ShowArchivedRows()).map(r => normalizeServiceName(r.item))
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar', { sensitivity: 'base', numeric: true }));
  }

  function moxV4GetPresetServiceFilter() {
    return document.getElementById('moxPresetServiceFilter')?.value || '';
  }

  function moxV4GetCashierServiceFilter() {
    return document.getElementById('moxCashierServiceFilter')?.value || '';
  }

  function moxV4UpdateServiceFilters() {
    const services = moxV4GetServices();
    ['moxCashierServiceFilter', 'moxPresetServiceFilter'].forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      const current = select.value;
      select.innerHTML = '<option value="">كل الخدمات</option>' + services.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
      if (services.includes(current)) select.value = current;
    });
  }

  function moxV4ActivePresets() {
    const presetService = moxV4GetPresetServiceFilter();
    const cashierService = moxV4GetCashierServiceFilter();
    const activeService = presetService || cashierService;
    return presets
      .map((preset, index) => ({ preset, index }))
      .filter(({ preset }) => (moxV4ShowArchivedPresets() || !moxV4IsArchivedPreset(preset)))
      .filter(({ preset }) => !activeService || preset.item === activeService);
  }

  function moxV4GetRecentFingerprints() {
    return moxV4SafeJSON(MOX_V4_RECENT_KEY, []);
  }

  function moxV4RecordPresetUse(preset) {
    if (!preset) return;
    const fp = moxV4FingerprintPreset(preset);
    const list = [fp, ...moxV4GetRecentFingerprints().filter(x => x !== fp)].slice(0, 20);
    moxV4SetJSON(MOX_V4_RECENT_KEY, list);
  }

  function moxV4RecentPresets(limit = 10) {
    const recent = moxV4GetRecentFingerprints();
    const matched = [];
    recent.forEach(fp => {
      const index = presets.findIndex(p => moxV4FingerprintPreset(p) === fp);
      if (index >= 0 && (!moxV4IsArchivedPreset(presets[index]) || moxV4ShowArchivedPresets())) matched.push({ preset: presets[index], index });
    });
    return matched.slice(0, limit);
  }

  function moxV4InstallLayout() {
    document.title = 'MOX-V4 Pro';
    const h1 = document.querySelector('.header h1');
    if (h1 && !h1.dataset.v4) { h1.textContent = 'MOX-V4 Pro'; h1.dataset.v4 = '1'; }
    const subtitle = document.querySelector('.header p');
    if (subtitle && !subtitle.dataset.v4) { subtitle.textContent = 'إدارة أسرع للعمليات والعروض والمصاريف مع وضع كاشير وأرشفة وحماية ونسخ تلقائي'; subtitle.dataset.v4 = '1'; }

    const toast = document.getElementById('toast');
    if (toast && !document.getElementById('moxCashierModeSection')) {
      toast.insertAdjacentHTML('afterend', `
        <div class="section" id="moxCashierModeSection">
          <div class="section-head">
            <div>
              <div class="section-title">🚀 وضع الكاشير السريع</div>
              <div class="section-subtitle">بحث ذكي + آخر عروض مستخدمة + أزرار كمية + إضافة بضغطة واحدة</div>
            </div>
            <button class="toggle-btn" type="button" onclick="toggleSection('moxCashierModeContent', this)">إخفاء</button>
          </div>
          <div id="moxCashierModeContent" class="panel mox-v4-panel mox-sticky-cashier">
            <div class="mox-cashier-grid">
              <div class="field"><label>بحث ذكي <span class="mox-kbd">Ctrl K</span></label><input id="moxCashierSearch" type="text" placeholder="مثال: ببجي 60 / netflix / 30" oninput="moxV4RenderCashier()"></div>
              <div class="field"><label>الخدمة</label><select id="moxCashierServiceFilter" onchange="moxV4RenderCashier()"><option value="">كل الخدمات</option></select></div>
              <div class="field"><label>تاريخ التسجيل</label><input id="moxCashierDate" type="date"></div>
              <div class="field"><label>الكمية الافتراضية</label><input id="moxCashierQty" type="number" min="1" step="1" value="1"></div>
              <button class="btn btn-add" type="button" onclick="moxV4AddFirstCashierResult()">إضافة أول نتيجة <span class="mox-kbd">Enter</span></button>
              <button class="btn btn-purple" type="button" onclick="moxV4RepeatLastRow()">🔁 كرر آخر عملية</button>
            </div>
            <div class="mox-mini-title"><span>آخر عروض استخدمتها</span><button class="small-btn" type="button" onclick="moxV4ClearRecentOffers()">مسح آخر العروض</button></div>
            <div id="moxRecentOffers" class="mox-recent-offers"></div>
            <div class="mox-mini-title">نتائج البحث السريع</div>
            <div id="moxCashierResults" class="mox-cashier-results"></div>
            <div class="mox-data-hint">اختصارات: <span class="mox-kbd">Ctrl K</span> للبحث، <span class="mox-kbd">Enter</span> لإضافة أول نتيجة، <span class="mox-kbd">Ctrl D</span> تاريخ اليوم، <span class="mox-kbd">Esc</span> مسح البحث.</div>
          </div>
        </div>
      `);
      if (!COLLAPSIBLE_CONTENT_IDS.includes('moxCashierModeContent')) COLLAPSIBLE_CONTENT_IDS.push('moxCashierModeContent');
    }

    const presetsContent = document.getElementById('presetsContent');
    if (presetsContent && !document.getElementById('moxPresetManagerTools')) {
      presetsContent.insertAdjacentHTML('afterbegin', `
        <div id="moxPresetManagerTools" class="service-color-panel">
          <div class="service-color-head">
            <div>
              <div class="service-color-title">🧠 إدارة أسرع للعروض</div>
              <div class="filter-note" style="margin:0">فلترة بالخدمة + أرشفة بدل حذف + إظهار/إخفاء العروض المؤرشفة.</div>
            </div>
            <button class="small-btn" type="button" onclick="moxV4NormalizePresetNames()">تنظيف وترتيب الأسماء</button>
          </div>
          <div class="mox-preset-filter-grid">
            <div class="field"><label>فلتر خدمة العروض</label><select id="moxPresetServiceFilter" onchange="renderPresets()"><option value="">كل الخدمات</option></select></div>
            <button class="btn btn-export" type="button" onclick="moxV4ToggleArchivedPresets()" id="moxArchivedPresetsBtn">إظهار المؤرشف</button>
            <button class="btn btn-purple" type="button" onclick="moxV4ExportSplitFiles()">📦 تنزيل نسخة منظمة</button>
          </div>
        </div>
      `);
    }

    const rowsFilterPanel = document.getElementById('rowsFilterPanel');
    if (rowsFilterPanel && !document.getElementById('moxSpeedOptionsPanel')) {
      rowsFilterPanel.insertAdjacentHTML('beforeend', `
        <div id="moxSpeedOptionsPanel" class="bulk-date-panel">
          <div class="mox-speed-grid">
            <div class="field"><label>عدد العمليات المعروضة</label><select id="moxRowsPerPageSelect" onchange="moxV4SetRowsPerPage(this.value)"><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="999999">كل السجل</option></select></div>
            <button class="btn btn-export" type="button" onclick="moxV4ToggleArchivedRows()" id="moxArchivedRowsBtn">إظهار المؤرشف</button>
            <button class="btn btn-purple" type="button" onclick="moxV4TogglePrivacyMode()" id="moxPrivacyBtn">وضع الخصوصية</button>
            <button class="btn btn-amber" type="button" onclick="moxV4DownloadAutoBackup()">تحميل آخر نسخة تلقائية</button>
          </div>
          <div class="mox-data-hint">الجدول يعرض على دفعات لتقليل الضغط. الإجماليات تفضل محسوبة على كل الفلتر، وليس الصفحة الحالية فقط.</div>
        </div>
      `);
    }

    const tableContent = document.getElementById('tableContent');
    if (tableContent && !document.getElementById('moxPaginationTop')) {
      tableContent.insertAdjacentHTML('beforebegin', `<div id="moxPaginationTop" class="mox-page-controls"></div>`);
      tableContent.insertAdjacentHTML('afterend', `<div id="moxPaginationBottom" class="mox-page-controls"></div>`);
    }

    if (!document.getElementById('moxFab')) {
      document.body.insertAdjacentHTML('beforeend', `
        <button id="moxFab" class="mox-fab" type="button" title="إضافة سريعة" onclick="moxV4FocusCashier()">＋</button>
        <div id="moxUndoBar" class="mox-undo-bar"><span id="moxUndoText">تم تنفيذ إجراء.</span><div class="inline-actions"><button class="small-btn" type="button" onclick="moxV4UndoLast()">تراجع</button><button class="small-btn" type="button" onclick="moxV4HideUndo()">إخفاء</button></div></div>
        <div id="moxEditModal" class="mox-modal-backdrop" onclick="moxV4CloseEditModal(event)">
          <div class="mox-modal-card" onclick="event.stopPropagation()">
            <div class="mox-modal-head"><span>تعديل العملية</span><button class="small-btn" type="button" onclick="moxV4CloseEditModal()">✕</button></div>
            <div class="mox-modal-grid">
              <div class="field"><label>التاريخ</label><input id="moxEditDate" type="date"></div>
              <div class="field"><label>الخدمة</label><input id="moxEditItem" type="text"></div>
              <div class="field"><label>العرض</label><input id="moxEditOffer" type="text"></div>
              <div class="field"><label>الكمية</label><input id="moxEditQty" type="number" min="1" step="1"></div>
              <div class="field"><label>الداخل / واحدة</label><input id="moxEditPaid" type="number" step="0.01" min="0"></div>
              <div class="field"><label>مصروف / واحدة</label><input id="moxEditDeducted" type="number" step="0.01" min="0"></div>
            </div>
            <div class="field" style="margin-top:.65rem"><label>ملاحظة</label><input id="moxEditNote" type="text"></div>
            <div class="actions"><button class="btn btn-add" type="button" onclick="moxV4SaveEditModal()">حفظ التعديل</button><button class="btn btn-amber" type="button" onclick="moxV4CloseEditModal()">إلغاء</button></div>
          </div>
        </div>
      `);
    }

    const perfSection = document.getElementById('closingContent');
    if (perfSection && !document.getElementById('moxV4SecurityTools')) {
      perfSection.insertAdjacentHTML('beforeend', `
        <div id="moxV4SecurityTools" class="service-color-panel">
          <div class="service-color-title">🛡️ حماية ونسخ احتياطي V4</div>
          <div class="mox-package-actions">
            <button class="btn btn-export" type="button" onclick="moxV4CreateDailyAutoBackup(true)">إنشاء نسخة تلقائية الآن</button>
            <button class="btn btn-purple" type="button" onclick="moxV4MirrorToIndexedDB(true)">تحديث IndexedDB</button>
            <button class="btn btn-amber" type="button" onclick="moxV4TogglePrivacyMode()">إخفاء الأرقام</button>
            <button class="btn btn-export" type="button" onclick="moxV4SetAutoLockMinutes()">ضبط القفل التلقائي</button>
          </div>
          <div class="mox-data-hint">يتم حفظ نسخة يومية داخلية، ومرآة IndexedDB للبيانات الكبيرة، وسجل التعديلات موجود في نفس قسم الإغلاق.</div>
        </div>
      `);
    }

    const rowsPerSelect = document.getElementById('moxRowsPerPageSelect');
    if (rowsPerSelect) rowsPerSelect.value = String(moxV4RowsPerPage);
    const cashierDate = document.getElementById('moxCashierDate');
    if (cashierDate && !cashierDate.value) cashierDate.value = today();
    moxV4UpdateButtons();
    moxV4UpdateServiceFilters();
  }

  function moxV4UpdateButtons() {
    const rowBtn = document.getElementById('moxArchivedRowsBtn');
    if (rowBtn) rowBtn.textContent = moxV4ShowArchivedRows() ? 'إخفاء المؤرشف' : 'إظهار المؤرشف';
    const presetBtn = document.getElementById('moxArchivedPresetsBtn');
    if (presetBtn) presetBtn.textContent = moxV4ShowArchivedPresets() ? 'إخفاء المؤرشف' : 'إظهار المؤرشف';
    const privacyBtn = document.getElementById('moxPrivacyBtn');
    if (privacyBtn) privacyBtn.textContent = document.body.classList.contains('mox-privacy-mode') ? 'إظهار الأرقام' : 'وضع الخصوصية';
  }

  function moxV4FocusCashier() {
    openSectionGroupForTarget('moxCashierModeContent');
    setTimeout(() => document.getElementById('moxCashierSearch')?.focus(), 120);
  }

  function moxV4RenderPresetCard({ preset, index }, compact) {
    const color = getServiceColor(preset.item);
    const unitProfit = (Number(preset.paid) || 0) - (Number(preset.deducted) || 0);
    const archivedClass = moxV4IsArchivedPreset(preset) ? ' archived' : '';
    return `
      <div class="mox-offer-card${archivedClass}" style="--service-color:${color}">
        <div class="mox-offer-head"><span>${escapeHTML(preset.item || 'بدون اسم')}</span><span class="offer-pill">${escapeHTML(preset.offer || 'عرض')}</span></div>
        <div class="mox-offer-meta">الدخل: <span class="num paid-val">${fmt(preset.paid)}</span> — التكلفة: <span class="num deducted-val">${fmt(preset.deducted)}</span><br>ربح الواحدة: <span class="num ${unitProfit >= 0 ? 'profit-val' : 'loss-val'}">${fmt(unitProfit)}</span> EGP</div>
        <div class="mox-qty-buttons">
          <button class="small-btn" type="button" onclick="moxV4AddPresetByIndex(${index}, 1)">+1</button>
          <button class="small-btn" type="button" onclick="moxV4AddPresetByIndex(${index}, 2)">+2</button>
          <button class="small-btn" type="button" onclick="moxV4AddPresetByIndex(${index}, 5)">+5</button>
          <button class="small-btn" type="button" onclick="moxV4AddPresetByIndex(${index}, 10)">+10</button>
        </div>
        ${compact ? '' : `<button class="btn btn-add" style="width:100%;margin-top:.5rem" type="button" onclick="moxV4AddPresetByIndex(${index}, Number(document.getElementById('moxCashierQty')?.value || 1))">إضافة بالكمية الافتراضية</button>`}
      </div>`;
  }

  function moxV4RenderCashier() {
    moxV4UpdateServiceFilters();
    const resultsWrap = document.getElementById('moxCashierResults');
    const recentWrap = document.getElementById('moxRecentOffers');
    const search = document.getElementById('moxCashierSearch')?.value || '';
    const service = moxV4GetCashierServiceFilter();
    if (recentWrap) {
      const recent = moxV4RecentPresets(10).filter(({ preset }) => !service || preset.item === service);
      recentWrap.innerHTML = recent.length ? recent.map(item => moxV4RenderPresetCard(item, true)).join('') : '<div class="filter-note">لسه مفيش عروض مستخدمة. أول ما تسجل عرض هيظهر هنا.</div>';
    }
    if (!resultsWrap) return;
    const filtered = presets
      .map((preset, index) => ({ preset, index }))
      .filter(({ preset }) => (moxV4ShowArchivedPresets() || !moxV4IsArchivedPreset(preset)))
      .filter(({ preset }) => !service || preset.item === service)
      .filter(({ preset }) => moxV4MatchesSmartSearch(preset, search))
      .slice(0, 24);
    resultsWrap.innerHTML = filtered.length ? filtered.map(item => moxV4RenderPresetCard(item, false)).join('') : '<div class="filter-note">لا توجد نتائج. جرّب اسم الخدمة أو رقم العرض، أو أضف العرض من مكتبة العروض.</div>';
  }

  function moxV4AddPresetByIndex(index, qty) {
    const preset = presets[index];
    if (!preset || moxV4IsArchivedPreset(preset)) { showToast('⚠️ العرض مؤرشف أو غير موجود.'); return; }
    const date = document.getElementById('moxCashierDate')?.value || document.getElementById('quickEntryDate')?.value || today();
    const quantity = normalizeQuantity(qty || 1);
    if (!confirmIfClosedDate(date, 'إضافة سريعة من وضع الكاشير')) return;
    const row = createRowObject(date, preset.item, preset.offer, preset.paid, preset.deducted, quantity, 'done', 'وضع الكاشير');
    rows.push(row);
    moxV4RecordPresetUse(preset);
    saveRows();
    addAuditLog('إضافة من وضع الكاشير', date, null, row);
    moxV4CurrentPage = 1;
    moxV4ScheduleRender('cashier-add');
    moxV4RenderCashier();
    showToast(`✅ تم إضافة ${quantity} × ${preset.item} — ${preset.offer}.`);
  }

  function moxV4AddFirstCashierResult() {
    const search = document.getElementById('moxCashierSearch')?.value || '';
    const service = moxV4GetCashierServiceFilter();
    const first = presets
      .map((preset, index) => ({ preset, index }))
      .filter(({ preset }) => !moxV4IsArchivedPreset(preset))
      .filter(({ preset }) => !service || preset.item === service)
      .find(({ preset }) => moxV4MatchesSmartSearch(preset, search));
    if (!first) { showToast('⚠️ لا توجد نتيجة لإضافتها.'); return; }
    moxV4AddPresetByIndex(first.index, Number(document.getElementById('moxCashierQty')?.value || 1));
  }

  function moxV4ClearRecentOffers() {
    localStorage.removeItem(MOX_V4_RECENT_KEY);
    moxV4RenderCashier();
    showToast('✅ تم مسح آخر العروض المستخدمة.');
  }

  function moxV4RepeatLastRow() {
    const activeRows = rows.filter(row => !moxV4IsArchivedRow(row));
    if (!activeRows.length) { showToast('ℹ️ لا يوجد عملية سابقة لتكرارها.'); return; }
    const last = normalizeRow(activeRows[activeRows.length - 1]);
    const date = document.getElementById('moxCashierDate')?.value || today();
    if (!confirmIfClosedDate(date, 'تكرار آخر عملية')) return;
    const row = createRowObject(date, last.item, last.offer, last.paid, last.deducted, last.quantity, 'done', last.note || 'تكرار سريع');
    rows.push(row);
    saveRows();
    addAuditLog('تكرار آخر عملية', date, null, row);
    moxV4ScheduleRender('repeat-last');
    showToast('✅ تم تكرار آخر عملية بتاريخ اليوم.');
  }

  function moxV4ToggleArchivedRows() {
    localStorage.setItem(MOX_V4_ARCHIVED_ROWS_KEY, moxV4ShowArchivedRows() ? '0' : '1');
    moxV4CurrentPage = 1;
    moxV4UpdateButtons();
    render();
  }

  function moxV4ToggleArchivedPresets() {
    localStorage.setItem(MOX_V4_ARCHIVED_PRESETS_KEY, moxV4ShowArchivedPresets() ? '0' : '1');
    moxV4UpdateButtons();
    renderPresets();
  }

  function moxV4SetRowsPerPage(value) {
    moxV4RowsPerPage = Number(value) || 50;
    localStorage.setItem(MOX_V4_ROWS_PER_PAGE_KEY, String(moxV4RowsPerPage));
    moxV4CurrentPage = 1;
    localStorage.setItem(MOX_V4_PAGE_KEY, '1');
    render();
  }

  function moxV4RenderPagination(totalRows) {
    const totalPages = Math.max(1, Math.ceil(totalRows / moxV4RowsPerPage));
    if (moxV4CurrentPage > totalPages) moxV4CurrentPage = totalPages;
    if (moxV4CurrentPage < 1) moxV4CurrentPage = 1;
    localStorage.setItem(MOX_V4_PAGE_KEY, String(moxV4CurrentPage));
    const from = totalRows ? ((moxV4CurrentPage - 1) * moxV4RowsPerPage) + 1 : 0;
    const to = Math.min(totalRows, moxV4CurrentPage * moxV4RowsPerPage);
    const html = `
      <div class="mox-page-info">عرض ${from}–${to} من ${totalRows} عملية مطابقة</div>
      <div class="inline-actions">
        <button class="small-btn" type="button" ${moxV4CurrentPage <= 1 ? 'disabled' : ''} onclick="moxV4GoPage(1)">الأول</button>
        <button class="small-btn" type="button" ${moxV4CurrentPage <= 1 ? 'disabled' : ''} onclick="moxV4GoPage(${moxV4CurrentPage - 1})">السابق</button>
        <span class="status-pill">صفحة ${moxV4CurrentPage} / ${totalPages}</span>
        <button class="small-btn" type="button" ${moxV4CurrentPage >= totalPages ? 'disabled' : ''} onclick="moxV4GoPage(${moxV4CurrentPage + 1})">التالي</button>
        <button class="small-btn" type="button" ${moxV4CurrentPage >= totalPages ? 'disabled' : ''} onclick="moxV4GoPage(${totalPages})">الأخير</button>
      </div>`;
    ['moxPaginationTop', 'moxPaginationBottom'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
  }

  function moxV4GoPage(page) {
    moxV4CurrentPage = Number(page) || 1;
    render();
    document.getElementById('tableContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function getFilteredRowsWithIndexes() {
    return rows
      .map((row, index) => ({ row: normalizeRow(row), index }))
      .filter(item => moxV4ShowArchivedRows() || !moxV4IsArchivedRow(rows[item.index] || item.row))
      .filter(item => isRowInDateRange(item.row))
      .filter(item => isRowMatchingTextFilters(item.row));
  }

  function render() {
    installBulkDateTools();
    moxV4InstallLayout();
    applyRowsViewOptions();
    updateTableHeaderNoStatus();
    const body = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    if (!body || !emptyState) return;
    const fullRows = getFilteredRowsWithIndexes();
    const totalRows = fullRows.length;
    const start = (moxV4CurrentPage - 1) * moxV4RowsPerPage;
    const pageRows = moxV4RowsPerPage >= 999999 ? fullRows : fullRows.slice(start, start + moxV4RowsPerPage);
    body.innerHTML = '';

    let walletTotal = 0;
    let operationExpensesTotal = 0;
    let totalQuantity = 0;
    fullRows.forEach(({ row, index }) => {
      row = normalizeRow({ ...row, archived: rows[index]?.archived });
      rows[index] = { ...rows[index], ...row };
      const f = rowFinancials(row);
      walletTotal += f.income;
      operationExpensesTotal += f.operationCost;
      totalQuantity += f.quantity;
    });

    pageRows.forEach(({ row, index }, displayIndex) => {
      row = normalizeRow({ ...row, archived: rows[index]?.archived });
      const f = rowFinancials(row);
      const archived = moxV4IsArchivedRow(rows[index]);
      const profitClass = f.profit >= 0 ? 'profit-val' : 'loss-val';
      const rowServiceColor = getServiceColor(row.item);
      const tr = document.createElement('tr');
      tr.style.setProperty('--row-service-color', rowServiceColor);
      if (archived) tr.classList.add('mox-archived-row');
      tr.innerHTML = `
        <td data-label="اختيار" class="bulk-check-cell"><input class="bulk-check" type="checkbox" ${selectedRowIds.has(row.id) ? 'checked' : ''} onclick="event.stopPropagation()" onchange="toggleRowSelection(${index}, this.checked)"></td>
        <td data-label="#">${start + displayIndex + 1}${archived ? ' 🗄️' : ''}</td>
        <td data-label="التاريخ"><input class="editable" type="date" value="${escapeHTML(row.date || '')}" onchange="updateRow(${index}, 'date', this.value)"></td>
        <td data-label="المنتج / الخدمة"><input class="editable" value="${escapeHTML(row.item)}" onchange="updateRow(${index}, 'item', this.value)"></td>
        <td data-label="العرض"><input class="editable" value="${escapeHTML(row.offer)}" onchange="updateRow(${index}, 'offer', this.value)"></td>
        <td data-label="الكمية"><input class="editable num" type="number" min="1" step="1" value="${f.quantity}" onchange="updateRow(${index}, 'quantity', this.value)"></td>
        <td data-label="الداخل / واحدة"><input class="editable num paid-val" type="number" step="0.01" value="${f.unitPaid}" onchange="updateRow(${index}, 'paid', this.value)"></td>
        <td data-label="مصروف / واحدة"><input class="editable num deducted-val" type="number" step="0.01" value="${f.unitCost}" onchange="updateRow(${index}, 'deducted', this.value)"></td>
        <td data-label="ربح الإجمالي"><span class="num ${profitClass}">${fmt(f.profit)}</span><span class="unit">EGP</span></td>
        <td data-label="ملاحظة"><input class="editable note-input" value="${escapeHTML(row.note || '')}" onchange="updateRow(${index}, 'note', this.value)"></td>
        <td data-label="إجراء"><div class="inline-actions"><button class="small-btn" onclick="moxV4OpenEditModal(${index})">تعديل</button>${archived ? `<button class="small-btn" onclick="moxV4RestoreRow(${index})">استرجاع</button><button class="delete-btn" onclick="deleteRow(${index})">حذف</button>` : `<button class="small-btn archive-btn" onclick="archiveRow(${index})">أرشيف</button><button class="delete-btn" onclick="deleteRow(${index})">حذف</button>`}</div></td>
      `;
      body.appendChild(tr);
    });

    const fixedExpensesTotal = totalFixedExpenses();
    const variableExpensesTotal = getVariableExpensesTotalForCurrentFilter();
    const activeDateFilter = hasActiveDateFilter();
    const visibleExpensesTotal = operationExpensesTotal;
    const profitTotal = walletTotal - operationExpensesTotal - variableExpensesTotal - (activeDateFilter ? 0 : fixedExpensesTotal);
    const walletDollarRate = parseFloat(document.getElementById('walletDollarRate')?.value) || 0;
    const expensesDollarRate = parseFloat(document.getElementById('expensesDollarRate')?.value) || 0;
    const walletUsdTotal = walletDollarRate > 0 ? walletTotal / walletDollarRate : 0;
    const expensesUsdTotal = expensesDollarRate > 0 ? (visibleExpensesTotal + variableExpensesTotal) / expensesDollarRate : 0;

    document.getElementById('countTotal').textContent = totalQuantity;
    document.getElementById('walletTotal').innerHTML = `${fmt(walletTotal)}<span class="unit">EGP</span>`;
    document.getElementById('expensesTotal').innerHTML = `${fmt(visibleExpensesTotal + variableExpensesTotal)}<span class="unit">EGP</span>`;
    document.getElementById('walletUsdTotal').innerHTML = `${fmt(walletUsdTotal)}<span class="unit">USD</span>`;
    document.getElementById('expensesUsdTotal').innerHTML = `${fmt(expensesUsdTotal)}<span class="unit">USD</span>`;
    const profitLabelEl = document.getElementById('profitLabel');
    if (profitLabelEl) profitLabelEl.textContent = activeDateFilter ? 'صافي الفترة بعد مصاريف اليوم المتغيرة' : 'صافي المكسب بعد المصاريف الثابتة والمتغيرة';
    const profitTotalEl = document.getElementById('profitTotal');
    profitTotalEl.innerHTML = `${fmt(profitTotal)}<span class="unit">EGP</span>`;
    profitTotalEl.className = profitTotal >= 0 ? 'value profit' : 'value loss';
    emptyState.style.display = totalRows ? 'none' : 'block';

    moxV4RenderPagination(totalRows);
    renderProductFilterOptions();
    updateFilterNote();
    renderLatestRowsPreview();
    if (moxV4LazyReportsReady || !document.getElementById('reportsContent')?.classList.contains('hidden-section')) {
      moxV4LazyReportsReady = true;
      renderDailyReport(); renderTopOffers(); renderAdvancedReport();
    }
    renderVariableExpenses(); renderClosings(); renderAuditLogs(); updateBulkDateUI();
    moxV4RenderCashier(); moxV4MirrorToIndexedDB(false); moxV4UpdateButtons();
  }

  function moxV4ScheduleRender(reason) {
    moxV4LastRenderReason = reason || '';
    clearTimeout(moxV4RenderTimer);
    moxV4RenderTimer = setTimeout(() => render(), 80);
  }

  function isRowMatchingTextFilters(row) {
    const search = getRowsSearchValue();
    const product = getProductFilterValue();
    if (product && row.item !== product) return false;
    return moxV4MatchesSmartSearch(row, search);
  }

  function renderProductFilterOptions() {
    const select = document.getElementById('productFilterSelect');
    if (!select) return;
    const current = select.value;
    const names = [...new Set([
      ...rows.filter(row => moxV4ShowArchivedRows() || !moxV4IsArchivedRow(row)).map(row => row.item),
      ...presets.filter(preset => moxV4ShowArchivedPresets() || !moxV4IsArchivedPreset(preset)).map(preset => preset.item)
    ].map(value => String(value || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ar', { sensitivity: 'base', numeric: true }));
    select.innerHTML = '<option value="">كل المنتجات</option>' + names.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
    select.value = names.includes(current) ? current : '';
    moxV4UpdateServiceFilters();
  }

  function renderPresetSelect() {
    const searchValue = document.getElementById('presetSearchInput')?.value || '';
    const select = document.getElementById('presetSelect');
    if (!select) return;
    const service = moxV4GetPresetServiceFilter();
    select.innerHTML = '<option value="">— اختار عرض: المنتج / الخدمة + العرض + الداخل للمحفظة —</option>';
    presets.forEach((preset, index) => {
      if (!moxV4ShowArchivedPresets() && moxV4IsArchivedPreset(preset)) return;
      if (service && preset.item !== service) return;
      if (!moxV4MatchesSmartSearch(preset, searchValue)) return;
      const label = `${moxV4IsArchivedPreset(preset) ? '🗄️ ' : ''}${presetDropdownLabel(preset)}`;
      const color = getServiceColor(preset.item);
      const option = document.createElement('option');
      option.value = index; option.textContent = label; option.title = label;
      option.style.background = hexToRgba(color, .18); option.style.color = '#e2e8f0';
      select.appendChild(option);
    });
    updatePresetSelectColorPreview();
  }

  function renderPresetList() {
    const body = document.getElementById('presetListBody');
    if (!body) return;
    const service = moxV4GetPresetServiceFilter();
    const searchValue = document.getElementById('presetSearchInput')?.value || '';
    const list = presets.map((preset, index) => ({ preset, index }))
      .filter(({ preset }) => moxV4ShowArchivedPresets() || !moxV4IsArchivedPreset(preset))
      .filter(({ preset }) => !service || preset.item === service)
      .filter(({ preset }) => moxV4MatchesSmartSearch(preset, searchValue));
    body.innerHTML = '';
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty" style="display:table-cell;padding:1rem">لا توجد عروض مطابقة.</td></tr>';
      return;
    }
    list.forEach(({ preset, index }, displayIndex) => {
      const profit = calcProfit(preset);
      const profitClass = profit >= 0 ? 'profit-val' : 'loss-val';
      const serviceColor = getServiceColor(preset.item);
      const archived = moxV4IsArchivedPreset(preset);
      const tr = document.createElement('tr');
      tr.style.setProperty('--service-color', serviceColor);
      if (archived) tr.classList.add('mox-archived-row');
      tr.innerHTML = `
        <td data-label="#">${displayIndex + 1}${archived ? ' 🗄️' : ''}</td>
        <td data-label="المنتج / الخدمة"><div class="service-name-cell"><span class="service-dot" style="--service-color:${serviceColor}"></span><input class="editable preset-edit-input" value="${escapeHTML(preset.item)}" onchange="updatePreset(${index}, 'item', this.value)"></div></td>
        <td data-label="العرض"><input class="editable preset-edit-input" value="${escapeHTML(preset.offer)}" onchange="updatePreset(${index}, 'offer', this.value)"></td>
        <td data-label="الداخل للمحفظة"><input class="editable num paid-val preset-edit-input" type="number" step="0.01" value="${Number(preset.paid) || 0}" onchange="updatePreset(${index}, 'paid', this.value)"></td>
        <td data-label="مصروف العملية"><input class="editable num deducted-val preset-edit-input" type="number" step="0.01" value="${Number(preset.deducted) || 0}" onchange="updatePreset(${index}, 'deducted', this.value)"></td>
        <td data-label="ربح العملية"><span class="num ${profitClass}">${fmt(profit)}</span></td>
        <td data-label="ترتيب"><div class="inline-actions"><button class="small-btn" onclick="movePreset(${index}, -1)">⬆️</button><button class="small-btn" onclick="movePreset(${index}, 1)">⬇️</button></div></td>
        <td data-label="إجراء"><div class="inline-actions">${archived ? `<button class="small-btn" onclick="moxV4RestorePreset(${index})">استرجاع</button><button class="delete-btn" onclick="deletePreset(${index})">حذف</button>` : `<button class="small-btn" onclick="moxV4AddPresetByIndex(${index}, 1)">+ عملية</button><button class="small-btn archive-btn" onclick="archivePreset(${index})">أرشيف</button><button class="delete-btn" onclick="deletePreset(${index})">حذف</button>`}</div></td>
      `;
      body.appendChild(tr);
    });
  }

  function renderPresets() {
    moxV4InstallLayout();
    sortPresetsByNames();
    renderPresetSelect();
    renderPresetList();
    renderServiceColorEditor();
    renderQuickOfferCards();
    moxV4RenderCashier();
    moxV4UpdateServiceFilters();
  }

  function renderQuickOfferCards() {
    const wrap = document.getElementById('quickOfferCards');
    if (!wrap) return;
    const search = document.getElementById('quickOfferSearch')?.value || '';
    const filtered = presets
      .map((preset, index) => ({ preset, index }))
      .filter(({ preset }) => !moxV4IsArchivedPreset(preset))
      .filter(({ preset }) => moxV4MatchesSmartSearch(preset, search))
      .slice(0, 30);
    if (!filtered.length) { wrap.innerHTML = '<div class="filter-note">لا توجد عروض محفوظة مطابقة. أضف عروض من مكتبة العروض السريعة الأول.</div>'; return; }
    wrap.innerHTML = filtered.map(({ preset, index }) => {
      const color = getServiceColor(preset.item);
      const unitProfit = (Number(preset.paid) || 0) - (Number(preset.deducted) || 0);
      return `
        <div class="quick-offer-card" style="--service-color:${color}">
          <div class="quick-offer-title"><span>${escapeHTML(preset.item || 'بدون اسم')}</span><span class="offer-pill">${escapeHTML(preset.offer || 'عرض')}</span></div>
          <div class="quick-offer-meta">الدخل/واحدة: <span class="num paid-val">${fmt(preset.paid)}</span> — المصروف/واحدة: <span class="num deducted-val">${fmt(preset.deducted)}</span><br>ربح الواحدة: <span class="num ${unitProfit >= 0 ? 'profit-val' : 'loss-val'}">${fmt(unitProfit)}</span> EGP</div>
          <div class="qty-control"><button type="button" onclick="changeQuickQty(${index}, -1)">−</button><input id="${quickQtyId(index)}" type="number" min="1" step="1" value="1"><button type="button" onclick="changeQuickQty(${index}, 1)">+</button></div>
          <div class="mox-qty-buttons"><button class="small-btn" onclick="moxV4AddPresetByIndex(${index}, 1)">+1</button><button class="small-btn" onclick="moxV4AddPresetByIndex(${index}, 2)">+2</button><button class="small-btn" onclick="moxV4AddPresetByIndex(${index}, 5)">+5</button><button class="small-btn" onclick="moxV4AddPresetByIndex(${index}, 10)">+10</button></div>
          <button class="btn btn-add" style="width:100%;margin-top:.5rem" type="button" onclick="addPresetBatch(${index})">إضافة الكمية المكتوبة</button>
        </div>`;
    }).join('');
  }

  function addPresetBatch(index) {
    const preset = presets[index];
    if (!preset || moxV4IsArchivedPreset(preset)) return;
    const quantity = normalizeQuantity(document.getElementById(quickQtyId(index))?.value || 1);
    moxV4AddPresetByIndex(index, quantity);
  }

  function archiveRow(index) {
    if (!rows[index]) return;
    const before = JSON.parse(JSON.stringify(rows[index]));
    if (!confirmIfClosedDate(before.date, 'أرشفة عملية')) return;
    if (!confirm('هل تريد نقل هذه العملية إلى الأرشيف؟ يمكنك إظهار المؤرشف واسترجاعها في أي وقت.')) return;
    rows[index].archived = true;
    rows[index].archivedAt = new Date().toISOString();
    rows[index].deleted = false;
    rows[index].hidden = false;
    selectedRowIds.delete(normalizeRow(rows[index]).id);
    saveRows();
    addAuditLog('أرشفة عملية', before.date, before, rows[index]);
    moxV4PushUndo({ type: 'restore-row', index, before, label: 'تم أرشفة عملية' });
    render();
    showToast('✅ تم أرشفة العملية. اضغط إظهار المؤرشف لاسترجاعها.');
  }

  function deleteRow(index) {
    if (!rows[index]) return;
    const before = JSON.parse(JSON.stringify(rows[index]));
    if (!confirmIfClosedDate(before.date, 'حذف عملية')) return;
    if (!confirm('⚠️ هل تريد حذف هذه العملية من السجل؟ يمكنك استرجاعها من زر استرجاع آخر حذف أو من زر التراجع.')) return;
    selectedRowIds.delete(normalizeRow(rows[index]).id);
    rows.splice(index, 1);
    pushDeleted('rows', [before], 'عملية من سجل العمليات');
    saveRows();
    addAuditLog('حذف عملية', before.date, before, null);
    moxV4PushUndo({ type: 'insert-row', index, before, label: 'تم حذف عملية' });
    render();
    showToast('✅ تم حذف العملية. يمكنك استرجاعها من زر استرجاع آخر حذف أو زر التراجع.');
  }

  function moxV4RestoreRow(index) {
    if (!rows[index]) return;
    const before = JSON.parse(JSON.stringify(rows[index]));
    rows[index].archived = false; delete rows[index].archivedAt;
    saveRows(); addAuditLog('استرجاع عملية مؤرشفة', rows[index].date, before, rows[index]); render(); showToast('✅ تم استرجاع العملية.');
  }

  function moxV4HardDeleteRow(index) {
    if (!rows[index]) return;
    if (!confirm('⚠️ حذف نهائي لا يمكن استرجاعه من الأرشيف. متأكد؟')) return;
    const before = JSON.parse(JSON.stringify(rows[index]));
    rows.splice(index, 1); saveRows(); addAuditLog('حذف نهائي لعملية', before.date, before, null); render(); showToast('✅ تم الحذف النهائي.');
  }

  function archivePreset(index) {
    if (!presets[index]) return;
    if (!confirm('هل تريد نقل هذا العرض إلى الأرشيف؟ يمكنك إظهار المؤرشف واسترجاعه في أي وقت.')) return;
    const before = JSON.parse(JSON.stringify(presets[index]));
    presets[index].archived = true;
    presets[index].archivedAt = new Date().toISOString();
    presets[index].deleted = false;
    presets[index].hidden = false;
    savePresets();
    addAuditLog('أرشفة عرض سريع', today(), before, presets[index]);
    moxV4PushUndo({ type: 'restore-preset', index, before, label: 'تم أرشفة عرض سريع' });
    renderPresets();
    showToast('✅ تم أرشفة العرض. اضغط إظهار المؤرشف لاسترجاعه.');
  }

  function deletePreset(index) {
    if (!presets[index]) return;
    if (!confirm('⚠️ هل تريد حذف هذا العرض من مكتبة العروض؟ يمكنك استرجاعه من زر استرجاع آخر حذف أو من زر التراجع.')) return;
    const before = JSON.parse(JSON.stringify(presets[index]));
    presets.splice(index, 1);
    pushDeleted('presets', [before], 'عرض سريع');
    savePresets();
    addAuditLog('حذف عرض سريع', today(), before, null);
    moxV4PushUndo({ type: 'insert-preset', index, before, label: 'تم حذف عرض سريع' });
    renderPresets();
    showToast('✅ تم حذف العرض. يمكنك استرجاعه من زر استرجاع آخر حذف أو زر التراجع.');
  }

  function moxV4RestorePreset(index) {
    if (!presets[index]) return;
    const before = JSON.parse(JSON.stringify(presets[index]));
    presets[index].archived = false; delete presets[index].archivedAt;
    savePresets(); addAuditLog('استرجاع عرض مؤرشف', today(), before, presets[index]); renderPresets(); showToast('✅ تم استرجاع العرض.');
  }

  function moxV4HardDeletePreset(index) {
    if (!presets[index]) return;
    if (!confirm('⚠️ حذف العرض نهائيًا؟')) return;
    const before = JSON.parse(JSON.stringify(presets[index]));
    presets.splice(index, 1); savePresets(); addAuditLog('حذف نهائي لعرض سريع', today(), before, null); renderPresets(); showToast('✅ تم الحذف النهائي للعرض.');
  }

  function moxV4PushUndo(action) {
    const stack = moxV4SafeJSON(MOX_V4_UNDO_KEY, []);
    stack.push({ ...action, at: new Date().toISOString() });
    moxV4SetJSON(MOX_V4_UNDO_KEY, stack.slice(-20));
    moxV4ShowUndo(action.label || 'تم تنفيذ إجراء يمكنك التراجع عنه.');
  }

  function moxV4ShowUndo(text) {
    const bar = document.getElementById('moxUndoBar');
    const span = document.getElementById('moxUndoText');
    if (!bar || !span) return;
    span.textContent = text || 'تم تنفيذ إجراء.';
    bar.classList.add('show');
    clearTimeout(window.__moxV4UndoHideTimer);
    window.__moxV4UndoHideTimer = setTimeout(moxV4HideUndo, 6000);
  }

  function moxV4HideUndo() {
    document.getElementById('moxUndoBar')?.classList.remove('show');
  }

  function moxV4UndoLast() {
    const stack = moxV4SafeJSON(MOX_V4_UNDO_KEY, []);
    const action = stack.pop();
    if (!action) { showToast('لا يوجد إجراء للتراجع.'); return; }
    if (action.type === 'restore-row' && rows[action.index]) rows[action.index] = action.before;
    if (action.type === 'restore-preset' && presets[action.index]) presets[action.index] = action.before;
    if (action.type === 'insert-row' && action.before) rows.splice(Math.min(Number(action.index) || 0, rows.length), 0, action.before);
    if (action.type === 'insert-preset' && action.before) presets.splice(Math.min(Number(action.index) || 0, presets.length), 0, action.before);
    moxV4SetJSON(MOX_V4_UNDO_KEY, stack);
    saveRows(); savePresets(); render(); renderPresets(); moxV4HideUndo(); showToast('✅ تم التراجع.');
  }

  function moxV4OpenEditModal(index) {
    if (!rows[index]) return;
    const row = normalizeRow(rows[index]);
    moxV4EditingRowIndex = index;
    document.getElementById('moxEditDate').value = row.date || today();
    document.getElementById('moxEditItem').value = row.item || '';
    document.getElementById('moxEditOffer').value = row.offer || '';
    document.getElementById('moxEditQty').value = getRowQuantity(row);
    document.getElementById('moxEditPaid').value = Number(row.paid) || 0;
    document.getElementById('moxEditDeducted').value = Number(row.deducted) || 0;
    document.getElementById('moxEditNote').value = row.note || '';
    document.getElementById('moxEditModal')?.classList.add('show');
  }

  function moxV4CloseEditModal(event) {
    if (event && event.target && event.target.id !== 'moxEditModal') return;
    document.getElementById('moxEditModal')?.classList.remove('show');
    moxV4EditingRowIndex = null;
  }

  function moxV4SaveEditModal() {
    const index = moxV4EditingRowIndex;
    if (index === null || !rows[index]) return;
    const before = JSON.parse(JSON.stringify(rows[index]));
    const date = document.getElementById('moxEditDate').value || today();
    if (!confirmIfClosedDate(before.date, 'تعديل عملية من النافذة')) return;
    rows[index] = {
      ...rows[index],
      date,
      item: document.getElementById('moxEditItem').value.trim(),
      offer: document.getElementById('moxEditOffer').value.trim(),
      paid: parseFloat(document.getElementById('moxEditPaid').value) || 0,
      deducted: parseFloat(document.getElementById('moxEditDeducted').value) || 0,
      quantity: normalizeQuantity(document.getElementById('moxEditQty').value || 1),
      note: document.getElementById('moxEditNote').value.trim(),
      status: 'done',
      updatedAt: new Date().toISOString()
    };
    saveRows(); addAuditLog('تعديل عملية من نافذة', before.date, before, rows[index]); moxV4CloseEditModal(); render(); showToast('✅ تم حفظ التعديل.');
  }

  function moxV4NormalizePresetNames() {
    presets.forEach(p => { p.item = moxCleanSortText(p.item); p.offer = moxCleanSortText(p.offer); p.updatedAt = new Date().toISOString(); });
    sortPresetsByNames(); savePresets(); renderPresets(); showToast('✅ تم تنظيف وترتيب أسماء العروض.');
  }

  function moxV4TogglePrivacyMode() {
    const enabled = !document.body.classList.contains('mox-privacy-mode');
    document.body.classList.toggle('mox-privacy-mode', enabled);
    localStorage.setItem(MOX_V4_PRIVACY_KEY, enabled ? '1' : '0');
    moxV4UpdateButtons();
  }

  function moxV4CreateDailyAutoBackup(manual) {
    const day = today();
    const lastDay = localStorage.getItem(MOX_V4_LAST_BACKUP_DAY_KEY);
    if (!manual && lastDay === day) return;
    const ring = moxV4SafeJSON(MOX_V4_BACKUP_RING_KEY, []);
    const backup = makeBackupObject(manual ? 'mox-v4-manual-auto-backup' : 'mox-v4-daily-auto-backup');
    ring.push({ day, createdAt: new Date().toISOString(), backup });
    moxV4SetJSON(MOX_V4_BACKUP_RING_KEY, ring.slice(-14));
    localStorage.setItem(MOX_V4_LAST_BACKUP_DAY_KEY, day);
    if (manual) showToast('✅ تم إنشاء نسخة تلقائية داخلية.');
  }

  function moxV4DownloadAutoBackup() {
    const ring = moxV4SafeJSON(MOX_V4_BACKUP_RING_KEY, []);
    if (!ring.length) { moxV4CreateDailyAutoBackup(true); }
    const fresh = moxV4SafeJSON(MOX_V4_BACKUP_RING_KEY, []).slice(-1)[0];
    if (!fresh) return;
    const blob = new Blob([JSON.stringify(fresh.backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `mox-v4-auto-backup-${fresh.day}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function moxV4MirrorToIndexedDB(manual) {
    if (!('indexedDB' in window)) { if (manual) showToast('⚠️ IndexedDB غير مدعوم في هذا المتصفح.'); return; }
    const request = indexedDB.open(MOX_V4_INDEXED_DB_NAME, 1);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(MOX_V4_INDEXED_STORE)) db.createObjectStore(MOX_V4_INDEXED_STORE, { keyPath: 'id' });
    };
    request.onsuccess = event => {
      const db = event.target.result;
      const tx = db.transaction(MOX_V4_INDEXED_STORE, 'readwrite');
      tx.objectStore(MOX_V4_INDEXED_STORE).put({ id: 'latest', updatedAt: new Date().toISOString(), rows, presets, expenses, variableExpenses, dailyClosings, auditLogs, serviceColors });
      tx.oncomplete = () => { db.close(); if (manual) showToast('✅ تم تحديث نسخة IndexedDB.'); };
    };
  }

  function moxV4DownloadTextFile(filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function moxV4ExportSplitFiles() {
    const payload = makeBackupObject('mox-v4-organized-package');
    moxV4DownloadTextFile(`mox-v4-data-${today()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    showToast('✅ تم تنزيل بيانات منظمة JSON. تقسيم HTML/CSS/JS الكامل يحتاج رفع على سيرفر بملفات منفصلة، والنسخة الحالية تظل ملف واحد سهل التشغيل.');
  }

  function moxV4SetAutoLockMinutes() {
    const current = localStorage.getItem(MOX_V4_AUTO_LOCK_KEY) || '10';
    const next = prompt('اكتب عدد الدقائق قبل القفل التلقائي. اكتب 0 لإيقافه.', current);
    if (next === null) return;
    const minutes = Math.max(0, Number(next) || 0);
    localStorage.setItem(MOX_V4_AUTO_LOCK_KEY, String(minutes));
    showToast(minutes ? `✅ تم ضبط القفل بعد ${minutes} دقيقة بدون حركة.` : '✅ تم إيقاف القفل التلقائي.');
  }

  function moxV4CheckAutoLock() {
    const minutes = Number(localStorage.getItem(MOX_V4_AUTO_LOCK_KEY) || '10') || 0;
    if (!minutes || !localStorage.getItem(STORAGE_APP_PASSWORD)) return;
    if (Date.now() - moxV4LastActivityAt > minutes * 60 * 1000) lockNow();
  }

  function moxV4RegisterActivity() { moxV4LastActivityAt = Date.now(); }

  function scheduleCloudSync(reason) {
    if (isApplyingCloudData) return;
    ensureFirebaseDefaultsSaved();
    clearTimeout(moxV4SyncTimer || cloudSyncTimer);
    moxV4SyncTimer = setTimeout(() => uploadLocalDataToCloud(false), 4200);
  }

  function setQuickDateFilter(value) {
    const fromInput = document.getElementById('filterFromDate');
    const toInput = document.getElementById('filterToDate');
    const now = new Date();
    if (value === 'all') { fromInput.value = ''; toInput.value = ''; }
    if (value === 'today') { const d = today(); fromInput.value = d; toInput.value = d; }
    if (value === 'yesterday') { const d = dateToISO(addDays(now, -1)); fromInput.value = d; toInput.value = d; }
    if (value === 'last7') { fromInput.value = dateToISO(addDays(now, -6)); toInput.value = today(); }
    if (value === 'month') { const firstDay = new Date(now.getFullYear(), now.getMonth(), 1); fromInput.value = dateToISO(firstDay); toInput.value = today(); }
    moxV4CurrentPage = 1;
    applyFilters(true);
  }

  function clearDateFilters() {
    document.getElementById('filterFromDate').value = '';
    document.getElementById('filterToDate').value = '';
    document.getElementById('quickDateFilter').value = 'all';
    moxV4CurrentPage = 1;
    render();
  }

  function applyFilters(keepQuickValue = false) {
    const quickFilter = document.getElementById('quickDateFilter');
    if (quickFilter && !keepQuickValue) quickFilter.value = 'custom';
    moxV4CurrentPage = 1;
    render();
  }

  function moxV4InstallKeyboardShortcuts() {
    if (window.__moxV4ShortcutsInstalled) return;
    window.__moxV4ShortcutsInstalled = true;
    document.addEventListener('keydown', event => {
      if (event.ctrlKey && event.key.toLowerCase() === 'k') { event.preventDefault(); moxV4FocusCashier(); }
      if (event.ctrlKey && event.key.toLowerCase() === 'd') { event.preventDefault(); document.getElementById('moxCashierDate') && (document.getElementById('moxCashierDate').value = today()); document.getElementById('quickEntryDate') && (document.getElementById('quickEntryDate').value = today()); showToast('✅ تم اختيار تاريخ اليوم.'); }
      if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); syncNow(); }
      if (event.key === 'Escape') { document.getElementById('moxCashierSearch') && (document.getElementById('moxCashierSearch').value = ''); moxV4CloseEditModal(); moxV4RenderCashier(); }
      if (event.key === 'Enter' && document.activeElement?.id === 'moxCashierSearch') { event.preventDefault(); moxV4AddFirstCashierResult(); }
    });
    ['click','keydown','touchstart','mousemove'].forEach(evt => document.addEventListener(evt, moxV4RegisterActivity, { passive: true }));
    setInterval(moxV4CheckAutoLock, 30000);
  }

  function moxV4SetDefaultTodayFilterOnce() {
    const key = 'profit_mox_v4_default_today_applied_v1';
    if (localStorage.getItem(key)) return;
    const quick = document.getElementById('quickDateFilter');
    if (quick) quick.value = 'today';
    const d = today();
    const from = document.getElementById('filterFromDate');
    const to = document.getElementById('filterToDate');
    if (from && to) { from.value = d; to.value = d; }
    localStorage.setItem(key, '1');
  }

  function moxV4InitialMobileCards() {
    if (window.matchMedia('(max-width: 760px)').matches && !localStorage.getItem(STORAGE_ROWS_VIEW_MODE)) {
      rowsViewMode = 'cards'; rowsViewSize = 'medium'; saveRowsViewOptions();
    }
  }

  function moxV4Init() {
    moxV4InstallLayout();
    if (localStorage.getItem(MOX_V4_PRIVACY_KEY) === '1') document.body.classList.add('mox-privacy-mode');
    moxV4InitialMobileCards();
    moxV4SetDefaultTodayFilterOnce();
    moxV4InstallKeyboardShortcuts();
    moxV4CreateDailyAutoBackup(false);
    moxV4MirrorToIndexedDB(false);
    moxV4UpdateServiceFilters();
    moxV4RenderCashier();
    setTimeout(() => { if (!moxV4LazyReportsReady && !document.getElementById('reportsContent')?.classList.contains('hidden-section')) { moxV4LazyReportsReady = true; render(); } }, 600);
  }

  document.addEventListener('DOMContentLoaded', moxV4Init);

  document.addEventListener('DOMContentLoaded', function () {
    installBulkDateTools();
    sortPresetsByNames();
    savePresets();
    renderPresets();
    render();
  });


  installGlobalSortableTables();


/* ===== MOX-V4.2 requested fixes: archive visibility + site settings + rows quick date ===== */
var MOX_V4_GLOBAL_LIST_STYLE_KEY = 'profit_mox_v4_global_list_style_v2';
var MOX_V4_REMEMBER_LAST_OPEN_KEY = 'profit_mox_v4_remember_last_open_v2';
var MOX_V4_START_COLLAPSED_KEY = 'profit_mox_v4_start_collapsed_v2';
var MOX_V4_LAST_ACTIVE_SECTION_KEY = 'profit_mox_v4_last_active_section_v2';
var MOX_V4_ROWS_QUICK_DATE_KEY = 'profit_mox_v4_rows_quick_date_v2';
var MOX_V4_ROWS_CUSTOM_DATE_KEY = 'profit_mox_v4_rows_custom_date_v2';

function moxV42BoolKey(key, defaultValue) {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === undefined || raw === '') return Boolean(defaultValue);
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function moxV42SetBoolKey(key, value) {
  localStorage.setItem(key, value ? '1' : '0');
}

function moxV42GetGlobalListStyle() {
  const value = localStorage.getItem(MOX_V4_GLOBAL_LIST_STYLE_KEY) || 'grid';
  return value === 'list' ? 'list' : 'grid';
}

function moxV42RememberLastEnabled() {
  return moxV42BoolKey(MOX_V4_REMEMBER_LAST_OPEN_KEY, true);
}

function moxV42StartCollapsedEnabled() {
  return moxV42BoolKey(MOX_V4_START_COLLAPSED_KEY, false);
}

function moxV42IsArchivedFlag(value) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'yes';
}

moxV4IsArchivedRow = function(row) {
  return Boolean(row && (
    moxV42IsArchivedFlag(row.archived) ||
    moxV42IsArchivedFlag(row.isArchived) ||
    moxV42IsArchivedFlag(row.hidden) ||
    moxV42IsArchivedFlag(row.deleted)
  ));
};

moxV4IsArchivedPreset = function(preset) {
  return Boolean(preset && (
    moxV42IsArchivedFlag(preset.archived) ||
    moxV42IsArchivedFlag(preset.isArchived) ||
    moxV42IsArchivedFlag(preset.hidden) ||
    moxV42IsArchivedFlag(preset.deleted)
  ));
};

function moxV42UpdateArchiveBodyClasses() {
  document.body.classList.toggle('mox-show-archived-rows', moxV4ShowArchivedRows());
  document.body.classList.toggle('mox-show-archived-presets', moxV4ShowArchivedPresets());
}

function moxV42ApplyGlobalListStyle(syncRowsView) {
  const style = moxV42GetGlobalListStyle();
  document.body.classList.toggle('mox-list-style-grid', style === 'grid');
  document.body.classList.toggle('mox-list-style-list', style === 'list');

  const select = document.getElementById('moxGlobalListStyleSelect');
  if (select) select.value = style;

  if (syncRowsView && typeof rowsViewMode !== 'undefined') {
    rowsViewMode = style === 'grid' ? 'grid' : 'cards';
    rowsViewSize = rowsViewSize || 'medium';
    const rowsModeSelect = document.getElementById('rowsViewModeSelect');
    if (rowsModeSelect) rowsModeSelect.value = rowsViewMode;
    applyRowsViewOptions();
    saveRowsViewOptions();
  } else {
    applyRowsViewOptions();
  }
}

function moxV42SetGlobalListStyle(value) {
  localStorage.setItem(MOX_V4_GLOBAL_LIST_STYLE_KEY, value === 'list' ? 'list' : 'grid');
  moxV42ApplyGlobalListStyle(true);
  renderPresets();
  render();
  showToast(value === 'list' ? '✅ تم تحويل القوائم لشكل قائمة طولية.' : '✅ تم تحويل القوائم لشكل مربعات.');
}

function moxV42SetRememberLast(value) {
  moxV42SetBoolKey(MOX_V4_REMEMBER_LAST_OPEN_KEY, value === '1');
  const select = document.getElementById('moxRememberLastSelect');
  if (select) select.value = value === '1' ? '1' : '0';
  if (value === '0') localStorage.removeItem(STORAGE_SECTION_STATE);
  showToast(value === '1' ? '✅ سيتم فتح الموقع على آخر حالة للأقسام.' : '✅ تم إيقاف فتح آخر حالة، وسيتم استخدام إعداد البداية.');
}

function moxV42SetStartCollapsed(value) {
  moxV42SetBoolKey(MOX_V4_START_COLLAPSED_KEY, value === '1');
  const select = document.getElementById('moxStartCollapsedSelect');
  if (select) select.value = value === '1' ? '1' : '0';
  showToast(value === '1' ? '✅ عند فتح الموقع بدون تذكر آخر حالة ستكون كل القوائم مخفية.' : '✅ عند فتح الموقع بدون تذكر آخر حالة ستظهر كل القوائم.');
}

function moxV42RefreshSettingsControls() {
  const listSelect = document.getElementById('moxGlobalListStyleSelect');
  if (listSelect) listSelect.value = moxV42GetGlobalListStyle();
  const rememberSelect = document.getElementById('moxRememberLastSelect');
  if (rememberSelect) rememberSelect.value = moxV42RememberLastEnabled() ? '1' : '0';
  const collapsedSelect = document.getElementById('moxStartCollapsedSelect');
  if (collapsedSelect) collapsedSelect.value = moxV42StartCollapsedEnabled() ? '1' : '0';
  const quickSelect = document.getElementById('moxRowsQuickDateFilter');
  if (quickSelect) quickSelect.value = localStorage.getItem(MOX_V4_ROWS_QUICK_DATE_KEY) || 'all';
  const customInput = document.getElementById('moxRowsCustomDate');
  if (customInput) customInput.value = localStorage.getItem(MOX_V4_ROWS_CUSTOM_DATE_KEY) || today();
  moxV42ToggleRowsCustomDateField();
}

function moxV42OpenAllSectionsOnStart() {
  COLLAPSIBLE_CONTENT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden-section');
  });
  const preview = document.getElementById('latestRowsPreview');
  if (preview) preview.classList.add('hidden-section');
  updateSectionButtonsFromState();
  setMobileNavActive('');
}

var __moxV42_oldSaveSectionState = saveSectionState;
saveSectionState = function() {
  if (!moxV42RememberLastEnabled()) return;
  __moxV42_oldSaveSectionState();
};

var __moxV42_oldApplySavedSectionState = applySavedSectionState;
applySavedSectionState = function() {
  if (moxV42RememberLastEnabled()) {
    __moxV42_oldApplySavedSectionState();
    const last = localStorage.getItem(MOX_V4_LAST_ACTIVE_SECTION_KEY);
    if (last && document.getElementById(last)) {
      openSectionGroupForTarget(last);
      setTimeout(() => document.getElementById(last)?.scrollIntoView({ behavior: 'auto', block: 'start' }), 80);
    }
    return;
  }

  if (moxV42StartCollapsedEnabled()) collapseAllSectionsOnStart();
  else moxV42OpenAllSectionsOnStart();
};

function moxV42RememberSection(id) {
  if (!id || !moxV42RememberLastEnabled()) return;
  localStorage.setItem(MOX_V4_LAST_ACTIVE_SECTION_KEY, id);
}

var __moxV42_oldOpenSectionGroupForTarget = openSectionGroupForTarget;
openSectionGroupForTarget = function(id) {
  __moxV42_oldOpenSectionGroupForTarget(id);
  moxV42RememberSection(id);
};

var __moxV42_oldToggleSection = toggleSection;
toggleSection = function(id, button) {
  __moxV42_oldToggleSection(id, button);
  const el = document.getElementById(id);
  if (el && !el.classList.contains('hidden-section')) moxV42RememberSection(id);
};

var __moxV42_oldToggleMultiSection = toggleMultiSection;
toggleMultiSection = function(ids, button) {
  __moxV42_oldToggleMultiSection(ids, button);
  if (Array.isArray(ids) && ids[0]) moxV42RememberSection(ids[0]);
};

function moxV42ToggleRowsCustomDateField() {
  const select = document.getElementById('moxRowsQuickDateFilter');
  const field = document.getElementById('moxRowsCustomDateField');
  if (field && select) field.classList.toggle('hidden-section', select.value !== 'custom');
}

function moxV42ApplyRowsQuickDate() {
  const select = document.getElementById('moxRowsQuickDateFilter');
  const customInput = document.getElementById('moxRowsCustomDate');
  const value = select?.value || 'all';
  localStorage.setItem(MOX_V4_ROWS_QUICK_DATE_KEY, value);

  const fromInput = document.getElementById('filterFromDate');
  const toInput = document.getElementById('filterToDate');
  const globalQuick = document.getElementById('quickDateFilter');
  if (!fromInput || !toInput) return;

  const now = new Date();
  let selected = '';
  if (value === 'all') {
    fromInput.value = '';
    toInput.value = '';
    if (globalQuick) globalQuick.value = 'all';
  } else if (value === 'today') {
    selected = today();
    fromInput.value = selected;
    toInput.value = selected;
    if (globalQuick) globalQuick.value = 'today';
  } else if (value === 'yesterday') {
    selected = dateToISO(addDays(now, -1));
    fromInput.value = selected;
    toInput.value = selected;
    if (globalQuick) globalQuick.value = 'yesterday';
  } else if (value === 'beforeYesterday') {
    selected = dateToISO(addDays(now, -2));
    fromInput.value = selected;
    toInput.value = selected;
    if (globalQuick) globalQuick.value = 'custom';
  } else if (value === 'custom') {
    selected = customInput?.value || today();
    if (customInput) {
      customInput.value = selected;
      localStorage.setItem(MOX_V4_ROWS_CUSTOM_DATE_KEY, selected);
    }
    fromInput.value = selected;
    toInput.value = selected;
    if (globalQuick) globalQuick.value = 'custom';
  }

  moxV42ToggleRowsCustomDateField();
  moxV4CurrentPage = 1;
  render();
}

function moxV42SetRowsCustomDate(value) {
  localStorage.setItem(MOX_V4_ROWS_CUSTOM_DATE_KEY, value || today());
  const select = document.getElementById('moxRowsQuickDateFilter');
  if (select) select.value = 'custom';
  localStorage.setItem(MOX_V4_ROWS_QUICK_DATE_KEY, 'custom');
  moxV42ApplyRowsQuickDate();
}

function moxV42InstallSettingsAndDateFilter() {
  const toast = document.getElementById('toast');
  if (toast && !document.getElementById('moxSiteSettingsSection')) {
    toast.insertAdjacentHTML('afterend', `
      <div class="section" id="moxSiteSettingsSection">
        <div class="section-head">
          <div>
            <div class="section-title">⚙️ إعدادات الموقع</div>
            <div class="section-subtitle">تحكم في شكل القوائم وبداية فتح الموقع وهل يفتكر آخر مكان كنت عليه</div>
          </div>
          <button class="toggle-btn" type="button" onclick="toggleSection('moxSiteSettingsContent', this)">إظهار</button>
        </div>
        <div id="moxSiteSettingsContent" class="panel site-settings-panel hidden-section">
          <div class="mox-settings-title">إعدادات العرض والبداية</div>
          <div class="mox-site-settings-grid">
            <div class="field">
              <label>شكل كل القوائم في الموقع</label>
              <select id="moxGlobalListStyleSelect" onchange="moxV42SetGlobalListStyle(this.value)">
                <option value="grid">مربعات</option>
                <option value="list">قوائم طولية</option>
              </select>
            </div>
            <div class="field">
              <label>عند فتح الموقع</label>
              <select id="moxRememberLastSelect" onchange="moxV42SetRememberLast(this.value)">
                <option value="1">افتح آخر حالة كنت عليها</option>
                <option value="0">لا تفتح آخر حالة</option>
              </select>
            </div>
            <div class="field">
              <label>لو آخر حالة متوقفة</label>
              <select id="moxStartCollapsedSelect" onchange="moxV42SetStartCollapsed(this.value)">
                <option value="0">افتح كل القوائم</option>
                <option value="1">اخفي كل القوائم</option>
              </select>
            </div>
            <button class="btn btn-export" type="button" onclick="moxV42ApplyStartupSettingsNow()">تطبيق البداية الآن</button>
          </div>
          <div class="mox-settings-note">لو اخترت "افتح آخر حالة" الموقع هيفتح على آخر الأقسام اللي كنت فاتحها. لو قفلتها، الموقع هيستخدم اختيار "افتح كل القوائم" أو "اخفي كل القوائم".</div>
        </div>
      </div>
    `);
    if (!COLLAPSIBLE_CONTENT_IDS.includes('moxSiteSettingsContent')) COLLAPSIBLE_CONTENT_IDS.push('moxSiteSettingsContent');
  }

  const rowsFilterPanel = document.getElementById('rowsFilterPanel');
  if (rowsFilterPanel && !document.getElementById('moxRowsQuickDatePanel')) {
    rowsFilterPanel.insertAdjacentHTML('afterbegin', `
      <div id="moxRowsQuickDatePanel" class="bulk-date-panel" style="margin-bottom:.8rem">
        <div class="mox-settings-title">📅 فلتر سريع لسجل العمليات</div>
        <div class="mox-rows-date-filter-grid">
          <div class="field">
            <label>عرض عمليات</label>
            <select id="moxRowsQuickDateFilter" onchange="moxV42ApplyRowsQuickDate()">
              <option value="all">كل الأيام</option>
              <option value="today">اليوم</option>
              <option value="yesterday">أمس</option>
              <option value="beforeYesterday">قبل أمس</option>
              <option value="custom">تاريخ محدد</option>
            </select>
          </div>
          <div class="field hidden-section" id="moxRowsCustomDateField">
            <label>اختار تاريخ محدد</label>
            <input id="moxRowsCustomDate" type="date" onchange="moxV42SetRowsCustomDate(this.value)">
          </div>
          <button class="btn btn-export" type="button" onclick="moxV42ApplyRowsQuickDate()">تطبيق الفلتر</button>
          <button class="btn btn-amber" type="button" onclick="moxV42ResetRowsQuickDate()">عرض كل الأيام</button>
        </div>
        <div class="mox-settings-note">هذا الفلتر يغيّر تاريخ سجل العمليات والملخص معًا: اليوم، أمس، قبل أمس، أو يوم تختاره بنفسك.</div>
      </div>
    `);
  }

  moxV42RefreshSettingsControls();
}

function moxV42ApplyStartupSettingsNow() {
  applySavedSectionState();
  updateSectionButtonsFromState();
  showToast('✅ تم تطبيق إعدادات بداية فتح الموقع الآن.');
}

function moxV42ResetRowsQuickDate() {
  const select = document.getElementById('moxRowsQuickDateFilter');
  if (select) select.value = 'all';
  localStorage.setItem(MOX_V4_ROWS_QUICK_DATE_KEY, 'all');
  moxV42ApplyRowsQuickDate();
}

getFilteredRowsWithIndexes = function() {
  return rows
    .map((row, index) => ({ row: normalizeRow(row), index }))
    .filter(item => moxV4ShowArchivedRows() || !moxV4IsArchivedRow(rows[item.index] || item.row))
    .filter(item => isRowInDateRange(item.row))
    .filter(item => isRowMatchingTextFilters(item.row));
};

var __moxV42_oldArchiveRow = archiveRow;
archiveRow = function(index) {
  if (!rows[index]) return;
  const before = JSON.parse(JSON.stringify(rows[index]));
  if (!confirmIfClosedDate(before.date, 'أرشفة عملية')) return;
  if (!confirm('هل تريد نقل هذه العملية إلى الأرشيف؟ ستختفي من كل القوائم العادية ويمكنك إظهار المؤرشف لاسترجاعها.')) return;
  rows[index].archived = true;
  rows[index].archivedAt = new Date().toISOString();
  rows[index].deleted = false;
  rows[index].hidden = false;
  if (typeof selectedRowIds !== 'undefined') selectedRowIds.delete(normalizeRow(rows[index]).id);
  localStorage.setItem(MOX_V4_ARCHIVED_ROWS_KEY, '0');
  saveRows();
  addAuditLog('أرشفة عملية', before.date, before, rows[index]);
  moxV4PushUndo({ type: 'restore-row', index, before, label: 'تم أرشفة عملية' });
  moxV42UpdateArchiveBodyClasses();
  render();
  showToast('✅ تم أرشفة العملية وإخفاؤها من القوائم العادية.');
};

var __moxV42_oldArchivePreset = archivePreset;
archivePreset = function(index) {
  if (!presets[index]) return;
  if (!confirm('هل تريد نقل هذا العرض إلى الأرشيف؟ سيختفي من كل القوائم العادية ويمكنك إظهار المؤرشف لاسترجاعه.')) return;
  const before = JSON.parse(JSON.stringify(presets[index]));
  presets[index].archived = true;
  presets[index].archivedAt = new Date().toISOString();
  presets[index].deleted = false;
  presets[index].hidden = false;
  localStorage.setItem(MOX_V4_ARCHIVED_PRESETS_KEY, '0');
  savePresets();
  addAuditLog('أرشفة عرض سريع', today(), before, presets[index]);
  moxV4PushUndo({ type: 'restore-preset', index, before, label: 'تم أرشفة عرض سريع' });
  moxV42UpdateArchiveBodyClasses();
  renderPresets();
  render();
  showToast('✅ تم أرشفة العرض وإخفاؤه من القوائم العادية.');
};

var __moxV42_oldRestoreRow = moxV4RestoreRow;
moxV4RestoreRow = function(index) {
  if (!rows[index]) return;
  const before = JSON.parse(JSON.stringify(rows[index]));
  rows[index].archived = false;
  rows[index].hidden = false;
  rows[index].deleted = false;
  delete rows[index].archivedAt;
  saveRows();
  addAuditLog('استرجاع عملية مؤرشفة', rows[index].date, before, rows[index]);
  render();
  showToast('✅ تم استرجاع العملية وظهورها في القوائم العادية.');
};

var __moxV42_oldRestorePreset = moxV4RestorePreset;
moxV4RestorePreset = function(index) {
  if (!presets[index]) return;
  const before = JSON.parse(JSON.stringify(presets[index]));
  presets[index].archived = false;
  presets[index].hidden = false;
  presets[index].deleted = false;
  delete presets[index].archivedAt;
  savePresets();
  addAuditLog('استرجاع عرض مؤرشف', today(), before, presets[index]);
  renderPresets();
  showToast('✅ تم استرجاع العرض وظهوره في القوائم العادية.');
};

moxV4ToggleArchivedRows = function() {
  localStorage.setItem(MOX_V4_ARCHIVED_ROWS_KEY, moxV4ShowArchivedRows() ? '0' : '1');
  moxV4CurrentPage = 1;
  moxV42UpdateArchiveBodyClasses();
  moxV4UpdateButtons();
  render();
};

moxV4ToggleArchivedPresets = function() {
  localStorage.setItem(MOX_V4_ARCHIVED_PRESETS_KEY, moxV4ShowArchivedPresets() ? '0' : '1');
  moxV42UpdateArchiveBodyClasses();
  moxV4UpdateButtons();
  renderPresets();
};

var __moxV42_oldUpdateButtons = moxV4UpdateButtons;
moxV4UpdateButtons = function() {
  __moxV42_oldUpdateButtons();
  moxV42UpdateArchiveBodyClasses();
  moxV42RefreshSettingsControls();
};

var __moxV42_oldInstallLayout = moxV4InstallLayout;
moxV4InstallLayout = function() {
  __moxV42_oldInstallLayout();
  moxV42InstallSettingsAndDateFilter();
  moxV42ApplyGlobalListStyle(false);
  moxV42UpdateArchiveBodyClasses();
};

var __moxV42_oldRenderDailyReport = renderDailyReport;
renderDailyReport = function() {
  const input = document.getElementById('dailyReportDate');
  if (!input) return;
  if (!input.value) input.value = today();
  const selectedDate = input.value;
  const dayRows = rows
    .map((row, index) => ({ row: normalizeRow(row), index }))
    .filter(item => !moxV4IsArchivedRow(rows[item.index] || item.row))
    .filter(item => String(item.row.date || '').slice(0, 10) === selectedDate)
    .map(item => item.row);
  const financials = dayRows.map(rowFinancials);
  const income = financials.reduce((sum, f) => sum + f.income, 0);
  const expense = financials.reduce((sum, f) => sum + f.operationCost, 0);
  const variable = getVariableExpensesTotalForDate(selectedDate);
  const profit = income - expense - variable;
  document.getElementById('dailyIncomeTotal').innerHTML = `${fmt(income)}<span class="unit">EGP</span>`;
  document.getElementById('dailyExpenseTotal').innerHTML = `${fmt(expense + variable)}<span class="unit">EGP</span>`;
  const profitEl = document.getElementById('dailyProfitTotal');
  profitEl.innerHTML = `${fmt(profit)}<span class="unit">EGP</span>`;
  profitEl.className = profit >= 0 ? 'value profit' : 'value loss';
  const productMap = new Map();
  dayRows.forEach(row => {
    const f = rowFinancials(row);
    const key = row.item || 'غير محدد';
    const current = productMap.get(key) || { count: 0, income: 0, expense: 0, profit: 0 };
    current.count += f.quantity;
    current.income += f.income;
    current.expense += f.operationCost;
    current.profit += f.profit;
    productMap.set(key, current);
  });
  const topProduct = [...productMap.entries()].sort((a, b) => b[1].count - a[1].count || b[1].profit - a[1].profit)[0];
  const productEl = document.getElementById('dailyTopProduct');
  const productMetaEl = document.getElementById('dailyTopProductMeta');
  if (!topProduct) {
    productEl.textContent = '-';
    productMetaEl.textContent = variable ? `مصاريف متغيرة: ${fmt(variable)} EGP` : 'لا يوجد عمليات في هذا اليوم.';
  } else {
    productEl.textContent = topProduct[0];
    productMetaEl.textContent = `${topProduct[1].count} عملية — ربح ${fmt(topProduct[1].profit)} EGP — مصاريف متغيرة ${fmt(variable)} EGP`;
  }
  const closeInput = document.getElementById('closingDateInput');
  if (closeInput && !closeInput.value) closeInput.value = selectedDate;
};

var __moxV42_oldComputeDaySnapshot = computeDaySnapshot;
computeDaySnapshot = function(date) {
  const dayRows = rows
    .map((row, index) => ({ row: normalizeRow(row), index }))
    .filter(item => !moxV4IsArchivedRow(rows[item.index] || item.row))
    .filter(item => String(item.row.date || '').slice(0, 10) === date)
    .map(item => item.row);
  const financials = dayRows.map(rowFinancials);
  const income = financials.reduce((sum, f) => sum + f.income, 0);
  const opCost = financials.reduce((sum, f) => sum + f.operationCost, 0);
  const variable = getVariableExpensesTotalForDate(date);
  const qty = financials.reduce((sum, f) => sum + f.quantity, 0);
  const profit = income - opCost - variable;
  return { date, qty, rowsCount: dayRows.length, income, opCost, variable, profit };
};

var __moxV42_oldMoxInit = moxV4Init;
moxV4Init = function() {
  __moxV42_oldMoxInit();
  moxV42InstallSettingsAndDateFilter();
  moxV42ApplyGlobalListStyle(false);
  moxV42UpdateArchiveBodyClasses();
  moxV42RefreshSettingsControls();
};

document.addEventListener('DOMContentLoaded', function () {
  moxV42InstallSettingsAndDateFilter();
  moxV42ApplyGlobalListStyle(false);
  moxV42UpdateArchiveBodyClasses();
  moxV42RefreshSettingsControls();
});

(() => {
  'use strict';

  const APP_NAME = 'MOX-V2';
  const DB_NAME = 'mox-v2-db';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const STATE_KEY = 'state';
  const MAX_BACKUPS = 5;
  const LOCK_HASH_KEY = 'mox_v2_lock_hash';
  const LOCK_SALT_KEY = 'mox_v2_lock_salt';
  const FIREBASE_CONFIG_KEY = 'mox_v2_firebase_config';
  const DEVICE_ID_KEY = 'mox_v2_device_id';

  const legacyKeys = {
    rows: 'profit_calculator_rows_v7',
    presets: 'profit_calculator_presets_v7',
    fixedExpenses: 'profit_calculator_fixed_expenses_v2',
    variableExpenses: 'profit_variable_expenses_v1',
    serviceColors: 'profit_service_colors_v1',
    walletRate: 'profit_wallet_dollar_rate_v2',
    expenseRate: 'profit_expenses_dollar_rate_v2',
    firebaseConfig: 'profit_firebase_config_v1'
  };

  const COLORS = ['#6c7cff','#2dd4bf','#38bdf8','#f59e0b','#fb7185','#a78bfa','#34d399','#f472b6','#60a5fa','#f97316','#22c55e','#e879f9'];

  let db;
  let state;
  let selectedPresetId = '';
  let walletParsed = [];
  let historySort = { key: 'date', dir: 'desc' };
  let lastUndo = null;
  let cloud = { app: null, auth: null, db: null, unsub: null, uid: null, timer: null, applying: false };

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const nowIso = () => new Date().toISOString();
  const todayISO = () => localDateISO(new Date());
  const uid = (prefix='id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  const num = (v) => Number(v) || 0;
  const qty = (v) => Math.max(1, Math.floor(Number(v) || 1));
  const fmt = (v, digits = 2) => num(v).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
  const normalize = (v) => String(v ?? '').toLowerCase().normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function localDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function parseISO(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(+m[1], +m[2]-1, +m[3]) : null;
  }

  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate()+n); return d; }
  function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
  function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth()+1, 0); }
  function dateLabel(s) { const d=parseISO(s); return d ? `${d.getDate()}/${d.getMonth()+1}` : ''; }
  function fullDateLabel(s) { const d=parseISO(s); return d ? d.toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'}) : ''; }
  function englishDigits(v) { return String(v ?? '').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/٫/g,'.').replace(/٬/g,','); }

  function hashText(text) {
    let h = 2166136261;
    for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return Math.abs(h >>> 0);
  }
  function serviceColor(name) {
    const saved = state?.settings?.serviceColors?.[name];
    return saved || COLORS[hashText(name) % COLORS.length];
  }

  function emptyState() {
    return {
      version: 2,
      transactions: [],
      presets: [],
      fixedExpenses: [],
      variableExpenses: [],
      closings: [],
      audit: [],
      settings: {
        walletRate: 53,
        expenseRate: 53,
        serviceColors: {},
        migratedLegacy: false,
        lastView: 'today'
      },
      meta: { createdAt: nowIso(), updatedAt: nowIso() }
    };
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function idbGet(key) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).get(key);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  function idbSet(key, value) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(value,key);
      tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
    });
  }
  function idbDelete(key) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).delete(key);
      tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
    });
  }
  function idbKeys() {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'); const req=tx.objectStore(STORE).getAllKeys();
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
  }

  function normalizeTransaction(r) {
    return {
      id: r.id || uid('tx'), date: String(r.date || todayISO()).slice(0,10), item: String(r.item || '').trim(), offer: String(r.offer || '').trim(),
      paid: num(r.paid), deducted: num(r.deducted), quantity: qty(r.quantity), note: String(r.note || ''), source: r.source || 'manual',
      externalRef: r.externalRef || r.ref || '', archived: Boolean(r.archived), createdAt: r.createdAt || nowIso(), updatedAt: r.updatedAt || r.createdAt || nowIso()
    };
  }
  function normalizePreset(p) {
    return { id:p.id||uid('preset'), item:String(p.item||'').trim(), offer:String(p.offer||'').trim(), paid:num(p.paid), deducted:num(p.deducted), active:p.active!==false, usageCount:num(p.usageCount), lastUsedAt:p.lastUsedAt||'', createdAt:p.createdAt||nowIso(), updatedAt:p.updatedAt||p.createdAt||nowIso() };
  }
  function normalizeFixedExpense(e) {
    return { id:e.id||uid('fx'), name:String(e.name||'').trim(), amount:num(e.amount), recurrence:['once','monthly','yearly'].includes(e.recurrence)?e.recurrence:'monthly', startDate:String(e.startDate||e.date||todayISO()).slice(0,10), note:String(e.note||''), createdAt:e.createdAt||nowIso() };
  }
  function normalizeVariableExpense(e) {
    return { id:e.id||uid('vx'), name:String(e.name||'').trim(), amount:num(e.amount), date:String(e.date||todayISO()).slice(0,10), note:String(e.note||''), category:e.category||'أخرى', createdAt:e.createdAt||nowIso() };
  }
  function sanitizeState(s) {
    const base=emptyState(), x={...base,...(s||{})};
    x.transactions=(x.transactions||x.rows||[]).map(normalizeTransaction);
    x.presets=(x.presets||[]).map(normalizePreset);
    x.fixedExpenses=(x.fixedExpenses||x.expenses||[]).map(normalizeFixedExpense);
    x.variableExpenses=(x.variableExpenses||[]).map(normalizeVariableExpense);
    x.closings=Array.isArray(x.closings)?x.closings:[];
    x.audit=Array.isArray(x.audit)?x.audit.slice(-500):[];
    x.settings={...base.settings,...(x.settings||{})};
    x.meta={...base.meta,...(x.meta||{})};
    delete x.rows; delete x.expenses;
    return x;
  }

  function readJsonStorage(key, fallback=[]) { try { const raw=localStorage.getItem(key); return raw?JSON.parse(raw):fallback; } catch { return fallback; } }

  async function migrateLegacy() {
    const s=emptyState();
    const rows=readJsonStorage(legacyKeys.rows,[]);
    const presets=readJsonStorage(legacyKeys.presets,[]);
    const fixed=readJsonStorage(legacyKeys.fixedExpenses,[]);
    const variable=readJsonStorage(legacyKeys.variableExpenses,[]);
    const colors=readJsonStorage(legacyKeys.serviceColors,{});
    if (rows.length || presets.length || fixed.length || variable.length) {
      s.transactions=rows.map(normalizeTransaction);
      s.presets=presets.map(normalizePreset);
      s.fixedExpenses=fixed.map(e=>normalizeFixedExpense({...e, recurrence:e.recurrence||'monthly', startDate:e.startDate||todayISO()}));
      s.variableExpenses=variable.map(normalizeVariableExpense);
      s.settings.serviceColors=colors||{};
      s.settings.walletRate=num(localStorage.getItem(legacyKeys.walletRate))||53;
      s.settings.expenseRate=num(localStorage.getItem(legacyKeys.expenseRate))||53;
      s.settings.migratedLegacy=true;
      audit(s,'ترحيل تلقائي','',`تم ترحيل ${s.transactions.length} عملية و${s.presets.length} عرض من النسخة القديمة.`);
      await idbSet(STATE_KEY,s);
      await createSafetySnapshot('legacy-migration',s);
      toast('تم نقل بيانات النسخة القديمة إلى MOX-V2 Clean تلقائيًا.','success',5000);
    }
    const oldFb=localStorage.getItem(legacyKeys.firebaseConfig);
    if (oldFb && !localStorage.getItem(FIREBASE_CONFIG_KEY)) localStorage.setItem(FIREBASE_CONFIG_KEY,oldFb);
    return s;
  }

  function audit(target, action, date, details) {
    target.audit ||= [];
    target.audit.push({id:uid('audit'),at:nowIso(),action,date:date||'',details:typeof details==='string'?details:JSON.stringify(details||{})});
    target.audit=target.audit.slice(-500);
  }

  async function loadState() {
    const saved=await idbGet(STATE_KEY);
    state=saved?sanitizeState(saved):await migrateLegacy();
    state=sanitizeState(state);
    await idbSet(STATE_KEY,state);
  }

  async function saveState(reason='update', options={}) {
    state.meta.updatedAt=nowIso(); state.meta.reason=reason;
    await idbSet(STATE_KEY,sanitizeState(state));
    if (!options.skipCloud) scheduleCloudUpload();
    renderStorageInfo();
  }

  function cleanBackupState(source=state) {
    const s=sanitizeState(JSON.parse(JSON.stringify(source)));
    s.audit=s.audit.slice(-250);
    return s;
  }

  async function createSafetySnapshot(label='auto', source=state) {
    const key=`backup:${Date.now()}`;
    await idbSet(key,{label,at:nowIso(),state:cleanBackupState(source)});
    const keys=(await idbKeys()).filter(k=>String(k).startsWith('backup:')).sort().reverse();
    for (const old of keys.slice(MAX_BACKUPS)) await idbDelete(old);
  }

  async function restoreLatestSafety() {
    const keys=(await idbKeys()).filter(k=>String(k).startsWith('backup:')).sort().reverse();
    if (!keys.length) return toast('لا توجد نسخة أمان محفوظة.','error');
    if (!confirm('استرجاع آخر نسخة أمان؟ سيتم أخذ نسخة من الوضع الحالي أولًا.')) return;
    await createSafetySnapshot('before-safety-restore');
    const snap=await idbGet(keys[0]);
    state=sanitizeState(snap.state); await saveState('restore-safety'); renderAll(); toast('تم استرجاع آخر نسخة أمان.','success');
  }

  function txFinancials(t) { const q=qty(t.quantity); return { income:num(t.paid)*q, cost:num(t.deducted)*q, profit:(num(t.paid)-num(t.deducted))*q, quantity:q }; }

  function rangeRows(from='',to='', includeArchived=false) {
    return state.transactions.filter(t => (includeArchived || !t.archived) && (!from || t.date>=from) && (!to || t.date<=to));
  }

  function rangeVariableExpenses(from='',to='') { return state.variableExpenses.filter(e=>(!from||e.date>=from)&&(!to||e.date<=to)); }

  function fixedExpenseOccurrences(e, from, to) {
    const start=parseISO(e.startDate), f=parseISO(from), end=parseISO(to); if(!start||!f||!end) return 0;
    if (e.recurrence==='once') return e.startDate>=from && e.startDate<=to ? 1:0;
    let count=0;
    if (e.recurrence==='monthly') {
      let cur=new Date(Math.max(start.getTime(), new Date(f.getFullYear(),f.getMonth(),1).getTime()));
      cur=new Date(cur.getFullYear(),cur.getMonth(),Math.min(start.getDate(),new Date(cur.getFullYear(),cur.getMonth()+1,0).getDate()));
      if(cur<start) cur=new Date(start);
      while(cur<=end){ if(cur>=f&&cur>=start) count++; const n=new Date(cur.getFullYear(),cur.getMonth()+1,1); cur=new Date(n.getFullYear(),n.getMonth(),Math.min(start.getDate(),new Date(n.getFullYear(),n.getMonth()+1,0).getDate())); }
    } else if(e.recurrence==='yearly') {
      for(let y=Math.max(start.getFullYear(),f.getFullYear());y<=end.getFullYear();y++){ const d=new Date(y,start.getMonth(),start.getDate()); if(d>=start&&d>=f&&d<=end) count++; }
    }
    return count;
  }

  function fixedExpenseTotal(from,to) { return state.fixedExpenses.reduce((s,e)=>s+num(e.amount)*fixedExpenseOccurrences(e,from,to),0); }

  function statsForRange(from,to) {
    const rows=rangeRows(from,to); const tx=rows.map(txFinancials);
    const income=tx.reduce((s,x)=>s+x.income,0), cost=tx.reduce((s,x)=>s+x.cost,0);
    const variable=rangeVariableExpenses(from,to).reduce((s,e)=>s+num(e.amount),0);
    const fixed=from&&to?fixedExpenseTotal(from,to):0;
    return {rows,income,cost,variable,fixed,profit:income-cost-variable-fixed,count:rows.reduce((s,r)=>s+qty(r.quantity),0)};
  }

  function toast(message,type='success',duration=3200,undoFn=null) {
    const host=$('toastHost'); if(!host) return;
    const el=document.createElement('div'); el.className=`toast ${type}`;
    el.innerHTML=`<div style="display:flex;gap:10px;align-items:center;justify-content:space-between"><span>${esc(message)}</span>${undoFn?'<button class="mini-btn">تراجع</button>':''}</div>`;
    host.appendChild(el);
    if(undoFn) el.querySelector('button').onclick=async()=>{ await undoFn(); el.remove(); };
    setTimeout(()=>el.remove(),duration);
  }

  function goView(name) {
    if(!$(`view-${name}`)) name='today';
    $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
    $$('.nav-item,.mobile-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    state.settings.lastView=name; saveState('view',{skipCloud:true});
    $('viewTitle').textContent={today:'اليوم',add:'إضافة عملية',history:'سجل العمليات',reports:'التقارير',settings:'الإعدادات'}[name]||APP_NAME;
    if(name==='today') renderToday(); if(name==='add') renderAdd(); if(name==='history') renderHistory(); if(name==='reports') renderReports(); if(name==='settings') renderSettings();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function setSettingsTab(tab) {
    $$('.settings-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    $$('.settings-pane').forEach(p=>p.classList.toggle('active',p.id===`settings-${tab}`));
    if(tab==='presets') renderPresetManager(); if(tab==='expenses') renderExpenses(); if(tab==='data') renderStorageInfo(); if(tab==='cloud') refreshCloudUI();
  }

  function renderToday() {
    const t=todayISO(), y=localDateISO(addDays(new Date(),-1));
    const s=statsForRange(t,t), sy=statsForRange(y,y);
    $('kpiIncome').textContent=fmt(s.income); $('kpiCost').textContent=fmt(s.cost); $('kpiProfit').textContent=fmt(s.profit); $('kpiCount').textContent=s.count;
    renderDelta($('kpiIncomeDelta'),s.income,sy.income,'عن أمس'); renderDelta($('kpiCostDelta'),s.cost,sy.cost,'عن أمس',true); renderDelta($('kpiProfitDelta'),s.profit,sy.profit,'عن أمس');
    $('kpiAvg').textContent=s.count?`متوسط الربح ${fmt(s.profit/s.count)} EGP`:'لا توجد عمليات اليوم';
    renderRevenueChart('revenueChart',7); renderProductDonut(s.rows); renderRecentTransactions(s.rows.length?s.rows:rangeRows().slice(-5));
  }

  function renderDelta(el,current,previous,label,inverse=false) {
    if(!previous){ el.className='kpi-delta neutral'; el.textContent=current?'لا توجد مقارنة أمس':'—'; return; }
    const pct=((current-previous)/Math.abs(previous))*100; const good=inverse?pct<=0:pct>=0;
    el.className=`kpi-delta ${good?'up':'down'}`; el.textContent=`${pct>=0?'+':''}${fmt(pct,1)}% ${label}`;
  }

  function dailySeries(days, fromDate=new Date()) {
    const out=[]; for(let i=days-1;i>=0;i--){ const d=localDateISO(addDays(fromDate,-i)); const s=statsForRange(d,d); out.push({date:d,income:s.income,profit:s.profit}); } return out;
  }

  function renderRevenueChart(id,days=7,from='',to='') {
    const el=$(id); if(!el) return;
    let series;
    if(from&&to){ const fd=parseISO(from),td=parseISO(to); series=[]; for(let d=new Date(fd);d<=td;d=addDays(d,1)){ const iso=localDateISO(d),s=statsForRange(iso,iso); series.push({date:iso,income:s.income,profit:s.profit}); } if(series.length>31){ const step=Math.ceil(series.length/31); series=series.filter((_,i)=>i%step===0||i===series.length-1); } }
    else series=dailySeries(days);
    const w=900,h=260,pad={l:18,r:18,t:18,b:34}; const max=Math.max(1,...series.flatMap(x=>[x.income,x.profit]));
    const x=i=>pad.l+(series.length===1?0:(i*(w-pad.l-pad.r)/(series.length-1))); const y=v=>pad.t+(h-pad.t-pad.b)*(1-v/max);
    const line=key=>series.map((s,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(Math.max(0,s[key])).toFixed(1)}`).join(' ');
    const area=key=>`${line(key)} L${x(series.length-1)},${h-pad.b} L${x(0)},${h-pad.b} Z`;
    const grid=[0,.25,.5,.75,1].map(r=>`<line class="chart-grid-line" x1="${pad.l}" x2="${w-pad.r}" y1="${pad.t+(h-pad.t-pad.b)*r}" y2="${pad.t+(h-pad.t-pad.b)*r}"/>`).join('');
    const labels=series.map((s,i)=>`<text class="chart-label" text-anchor="middle" x="${x(i)}" y="${h-8}">${dateLabel(s.date)}</text>`).join('');
    el.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2dd4bf" stop-opacity=".24"/><stop offset="1" stop-color="#2dd4bf" stop-opacity="0"/></linearGradient><linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c7cff" stop-opacity=".14"/><stop offset="1" stop-color="#6c7cff" stop-opacity="0"/></linearGradient></defs>${grid}<path class="chart-area-income" d="${area('income')}"/><path class="chart-area-profit" d="${area('profit')}"/><path class="chart-income" d="${line('income')}"/><path class="chart-profit" d="${line('profit')}"/>${labels}</svg>`;
  }

  function renderProductDonut(rows) {
    const map=new Map(); rows.forEach(r=>map.set(r.item,(map.get(r.item)||0)+qty(r.quantity)));
    const arr=[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5); const total=arr.reduce((s,x)=>s+x[1],0); $('donutTotal').textContent=total;
    if(!total){ $('productDonut').style.background='conic-gradient(#243047 0 100%)'; $('donutLegend').innerHTML='<div class="empty-state">لا توجد عمليات اليوم.</div>'; return; }
    let start=0; const stops=[]; arr.forEach(([name,count],i)=>{ const pct=count/total*100, color=serviceColor(name); stops.push(`${color} ${start}% ${start+pct}%`); start+=pct; });
    $('productDonut').style.background=`conic-gradient(${stops.join(',')})`;
    $('donutLegend').innerHTML=arr.map(([name,count])=>`<div class="donut-legend-item"><span class="donut-legend-name"><i class="donut-swatch" style="background:${serviceColor(name)}"></i>${esc(name||'غير محدد')}</span><b>${count}</b></div>`).join('');
  }

  function renderRecentTransactions(rows) {
    const data=[...rows].filter(r=>!r.archived).sort((a,b)=>`${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`)).slice(0,5);
    $('recentTransactions').innerHTML=data.length?data.map(t=>{const f=txFinancials(t);return `<div class="activity-item"><div class="activity-icon" style="color:${serviceColor(t.item)}">${esc((t.item||'?').slice(0,1))}</div><div class="activity-main"><b>${esc(t.item)} — ${esc(t.offer)}</b><span>${fullDateLabel(t.date)}${t.note?` · ${esc(t.note)}`:''}</span></div><div class="activity-amount"><strong>+${fmt(f.income)}</strong><small>ربح ${fmt(f.profit)}</small></div></div>`}).join(''):'<div class="empty-state">لا توجد عمليات حتى الآن.</div>';
  }

  function sortedPresets() {
    return [...state.presets].filter(p=>p.active!==false).sort((a,b)=>(new Date(b.lastUsedAt||0)-new Date(a.lastUsedAt||0))||b.usageCount-a.usageCount||a.item.localeCompare(b.item,'ar'));
  }

  function renderAdd() {
    $('addDate').value ||= todayISO(); $('manualDate').value ||= todayISO(); renderRecentPresets(); renderSelectedPreset(); updateAddPreview();
  }

  function renderRecentPresets() {
    const list=sortedPresets().slice(0,8);
    $('recentPresets').innerHTML=list.length?list.map(p=>`<button class="recent-preset-card" data-preset-id="${p.id}"><i class="service-bar" style="--service-color:${serviceColor(p.item)}"></i><span><b>${esc(p.item)} — ${esc(p.offer)}</b><small>مصروف ${fmt(p.deducted)} · ربح ${fmt(p.paid-p.deducted)}</small></span><strong>${fmt(p.paid)}</strong></button>`).join(''):'<div class="empty-state">أضف أول عرض من الإعدادات.</div>';
    $$('#recentPresets [data-preset-id]').forEach(b=>b.onclick=()=>selectPreset(b.dataset.presetId));
  }

  function selectPreset(id) {
    selectedPresetId=id; const p=state.presets.find(x=>x.id===id); if(!p)return;
    $('addPaid').value=p.paid; $('quickPresetSearch').value=`${p.item} — ${p.offer}`; $('presetDropdown').classList.add('hidden'); renderSelectedPreset(); updateAddPreview();
  }
  function renderSelectedPreset() {
    const p=state.presets.find(x=>x.id===selectedPresetId);
    $('selectedPresetCard').classList.toggle('empty-card',!p);
    $('selectedPresetCard').innerHTML=p?`<div class="selected-preset-grid"><div><b>${esc(p.item)} — ${esc(p.offer)}</b><small>الداخل ${fmt(p.paid)} · المصروف ${fmt(p.deducted)} · الربح ${fmt(p.paid-p.deducted)}</small></div><span class="pill">جاهز للإضافة</span></div>`:'اختار عرض من البحث أو من العروض الأخيرة.';
  }
  function updateAddPreview() {
    const p=state.presets.find(x=>x.id===selectedPresetId); const q=qty($('addQty')?.value); const paid=num($('addPaid')?.value); const cost=p?num(p.deducted):0;
    $('addCostPreview').textContent=fmt(cost*q); $('addProfitPreview').textContent=fmt((paid-cost)*q);
  }

  function renderPresetSearch() {
    const q=normalize($('quickPresetSearch').value); const box=$('presetDropdown');
    if(!q){ box.classList.add('hidden'); box.innerHTML=''; return; }
    const matches=sortedPresets().filter(p=>normalize(`${p.item} ${p.offer} ${p.paid}`).includes(q)).slice(0,12);
    box.innerHTML=matches.length?matches.map(p=>`<button class="preset-option" data-id="${p.id}"><span><b>${esc(p.item)} — ${esc(p.offer)}</b><small>الداخل ${fmt(p.paid)} · المصروف ${fmt(p.deducted)}</small></span><span class="preset-money">${fmt(p.paid)} EGP</span></button>`).join(''):'<div class="empty-state">لا يوجد عرض مطابق.</div>';
    box.classList.remove('hidden'); $$('#presetDropdown [data-id]').forEach(b=>b.onclick=()=>selectPreset(b.dataset.id));
  }

  async function addTransaction(data, reason='إضافة عملية') {
    const t=normalizeTransaction({...data,id:data.id||uid('tx'),createdAt:data.createdAt||nowIso(),updatedAt:nowIso()});
    state.transactions.push(t); audit(state,reason,t.date,{item:t.item,offer:t.offer,paid:t.paid,deducted:t.deducted,quantity:t.quantity});
    const p=state.presets.find(x=>x.id===data.presetId); if(p){ p.usageCount=num(p.usageCount)+qty(t.quantity); p.lastUsedAt=nowIso(); p.updatedAt=nowIso(); }
    await saveState(reason); return t;
  }

  async function saveQuickTransaction() {
    const p=state.presets.find(x=>x.id===selectedPresetId); if(!p) return toast('اختار عرض محفوظ الأول.','error');
    const paid=num($('addPaid').value), q=qty($('addQty').value), date=$('addDate').value||todayISO(); if(paid<0)return toast('قيمة الداخل غير صحيحة.','error');
    await addTransaction({date,item:p.item,offer:p.offer,paid,deducted:p.deducted,quantity:q,note:$('addNote').value.trim(),source:'cashier',presetId:p.id},'إضافة سريعة');
    $('addQty').value=1; $('addPaid').value=p.paid; $('addNote').value=''; updateAddPreview(); renderAll(); toast('تم حفظ العملية.','success',4200,async()=>{ const t=state.transactions.pop(); audit(state,'تراجع عن إضافة',t?.date,'Undo'); await saveState('undo-add'); renderAll(); });
  }

  async function saveManual() {
    const item=$('manualItem').value.trim(), offer=$('manualOffer').value.trim(); if(!item||!offer)return toast('اكتب المنتج والعرض.','error');
    await addTransaction({date:$('manualDate').value||todayISO(),item,offer,paid:num($('manualPaid').value),deducted:num($('manualCost').value),quantity:qty($('manualQty').value),note:$('manualNote').value.trim(),source:'manual'},'إضافة يدوية');
    ['manualItem','manualOffer','manualPaid','manualCost','manualNote'].forEach(id=>$(id).value=''); $('manualQty').value=1; renderAll(); toast('تمت الإضافة اليدوية.');
  }

  function parseWalletMessages(text) {
    const raw=String(text||''); const out=[]; let m;
    const ar=/تم استلام مبلغ\s*([\d.,٠-٩۰-۹]+)\s*جنيه\s+من رقم\s*([0-9٠-٩۰-۹]+)(?:\s+المسجل بإسم\s*([\s\S]*?)\s+على رقم محفظتك)?[\s\S]*?رصيدك الحالي:\s*([\d.,٠-٩۰-۹]+)\s*جنيه[\s\S]*?تاريخ العملية:\s*([0-9٠-٩۰-۹]{1,2}:[0-9٠-٩۰-۹]{2})\s*([0-9٠-٩۰-۹]{2})-([0-9٠-٩۰-۹]{2})-([0-9٠-٩۰-۹]{2})[\s\S]*?رقم العملية:\s*([0-9٠-٩۰-۹]+)/g;
    while((m=ar.exec(raw))){ const amount=num(englishDigits(m[1]).replace(/,/g,'')), dd=englishDigits(m[6]),mm=englishDigits(m[7]),yy=englishDigits(m[8]); out.push({amount,sender:englishDigits(m[2]),name:(m[3]||'').trim(),balance:num(englishDigits(m[4]).replace(/,/g,'')),time:englishDigits(m[5]),date:`20${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`,ref:englishDigits(m[9])}); }
    const en=/([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}:\d{2}:\d{2}\s+[AP]M):\s+Received\s+EGP([\d.,]+)\s+from\s+([0-9]+)[\s\S]*?Ref:\s*([0-9]+)\s+Available Balance:\s*([\d.,]+)/g;
    const monthMap={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
    while((m=en.exec(raw))){ const mon=monthMap[m[1]]||1; out.push({amount:num(m[5].replace(/,/g,'')),sender:m[6],name:'',balance:num(m[8].replace(/,/g,'')),time:m[4],date:`${m[3]}-${String(mon).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`,ref:m[7]}); }
    const map=new Map(); out.forEach(x=>map.set(x.ref||`${x.date}-${x.time}-${x.amount}`,x)); return [...map.values()].sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }

  function suggestPreset(amount) {
    const active=state.presets.filter(p=>p.active!==false); if(!active.length)return null;
    const scored=active.map(p=>({p,diff:Math.abs(num(p.paid)-amount),over:num(p.paid)>amount?20:0})).sort((a,b)=>(a.diff+a.over)-(b.diff+b.over));
    const best=scored[0]; return best && best.diff<=Math.max(15,amount*.08)?best.p:null;
  }

  function analyzeWallet() { walletParsed=parseWalletMessages($('walletMessages').value).map(x=>({...x,presetId:suggestPreset(x.amount)?.id||''})); renderWalletPreview(); toast(walletParsed.length?`تم تحليل ${walletParsed.length} رسالة.`:'لم أجد رسائل قابلة للتحليل.',walletParsed.length?'success':'error'); }

  function renderWalletPreview() {
    const wrap=$('walletPreviewWrap'), stats=$('walletImportStats'); if(!walletParsed.length){wrap.classList.add('hidden');stats.classList.add('hidden');return;}
    const existing=new Set(state.transactions.map(t=>t.externalRef).filter(Boolean)); const fresh=walletParsed.filter(x=>!existing.has(x.ref)); const total=walletParsed.reduce((s,x)=>s+x.amount,0);
    stats.innerHTML=`<span class="stat-chip">الرسائل: <b>${walletParsed.length}</b></span><span class="stat-chip">الجديدة: <b>${fresh.length}</b></span><span class="stat-chip">إجمالي المستلم: <b>${fmt(total)}</b></span>`; stats.classList.remove('hidden'); wrap.classList.remove('hidden');
    $('walletPreviewBody').innerHTML=walletParsed.map((x,i)=>{const p=state.presets.find(z=>z.id===x.presetId);const duplicate=existing.has(x.ref);const profit=p?x.amount-num(p.deducted):0;return `<tr style="opacity:${duplicate?.55:1}"><td>${esc(dateLabel(x.date))}</td><td>${esc(x.name||x.sender)}</td><td class="money income">${fmt(x.amount)}</td><td><select class="control wallet-preset-select" data-i="${i}"><option value="">— بدون ربط —</option>${sortedPresets().map(y=>`<option value="${y.id}" ${y.id===x.presetId?'selected':''}>${esc(y.item)} — ${esc(y.offer)} | ${fmt(y.paid)}</option>`).join('')}</select></td><td class="money cost">${p?fmt(p.deducted):'—'}</td><td class="money profit">${p?fmt(profit):'—'}</td><td>${duplicate?'<span class="pill" style="color:#fda4af;border-color:rgba(251,113,133,.2)">مكرر</span>':'<span class="pill">جديد</span>'}</td></tr>`;}).join('');
    $$('.wallet-preset-select').forEach(s=>s.onchange=()=>{walletParsed[+s.dataset.i].presetId=s.value;renderWalletPreview();});
  }

  async function importWalletRows() {
    const existing=new Set(state.transactions.map(t=>t.externalRef).filter(Boolean)); let added=0,skipped=0;
    for(const x of walletParsed){ if(existing.has(x.ref)){skipped++;continue;} const p=state.presets.find(z=>z.id===x.presetId); if(!p){skipped++;continue;} await addTransaction({date:x.date,item:p.item,offer:p.offer,paid:x.amount,deducted:p.deducted,quantity:1,note:[x.name||x.sender,`Ref ${x.ref}`].filter(Boolean).join(' · '),source:'wallet',externalRef:x.ref,presetId:p.id},'استيراد محفظة'); existing.add(x.ref); added++; }
    renderAll(); renderWalletPreview(); toast(`تمت إضافة ${added} عملية${skipped?`، وتخطي ${skipped}`:''}.`,added?'success':'error');
  }

  function historyFiltered() {
    const from=$('historyFrom').value,to=$('historyTo').value,q=normalize($('historySearch').value),show=$('showArchived').checked;
    let arr=state.transactions.filter(t=>(show||!t.archived)&&(!from||t.date>=from)&&(!to||t.date<=to));
    if(q)arr=arr.filter(t=>normalize(`${t.date} ${t.item} ${t.offer} ${t.note} ${t.paid} ${t.deducted}`).includes(q));
    const key=historySort.key, dir=historySort.dir==='asc'?1:-1;
    arr.sort((a,b)=>{let av,bv;if(key==='profit'){av=txFinancials(a).profit;bv=txFinancials(b).profit}else{av=a[key];bv=b[key]} if(typeof av==='number'||typeof bv==='number')return(num(av)-num(bv))*dir;return String(av??'').localeCompare(String(bv??''),'ar',{numeric:true})*dir;}); return arr;
  }

  function renderHistory() {
    const arr=historyFiltered();
    $('historyBody').innerHTML=arr.length?arr.map(t=>{const f=txFinancials(t);return `<tr style="opacity:${t.archived?.52:1}"><td>${esc(dateLabel(t.date))}</td><td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${serviceColor(t.item)};margin-left:6px"></span>${esc(t.item)}</td><td>${esc(t.offer)}</td><td class="money">${t.quantity}</td><td class="money income">${fmt(t.paid)}</td><td class="money cost">${fmt(t.deducted)}</td><td class="money profit">${fmt(f.profit)}</td><td class="note-cell" title="${esc(t.note)}">${esc(t.note||'—')}</td><td><div class="row-actions"><button class="mini-btn" data-edit="${t.id}">تعديل</button><button class="mini-btn ${t.archived?'':'danger'}" data-archive="${t.id}">${t.archived?'استرجاع':'أرشفة'}</button></div></td></tr>`;}).join(''):'<tr><td colspan="9"><div class="empty-state">لا توجد نتائج.</div></td></tr>';
    const s=arr.reduce((o,t)=>{const f=txFinancials(t);o.in+=f.income;o.cost+=f.cost;o.profit+=f.profit;o.q+=f.quantity;return o},{in:0,cost:0,profit:0,q:0}); $('historyCount').textContent=`${s.q} عملية`; $('historyTotals').textContent=`دخل ${fmt(s.in)} · ربح ${fmt(s.profit)} EGP`;
    $$('[data-edit]').forEach(b=>b.onclick=()=>openEditTransaction(b.dataset.edit)); $$('[data-archive]').forEach(b=>b.onclick=()=>toggleArchiveTransaction(b.dataset.archive));
    $$('#historyTable th[data-sort]').forEach(th=>{th.classList.toggle('sort-asc',historySort.key===th.dataset.sort&&historySort.dir==='asc');th.classList.toggle('sort-desc',historySort.key===th.dataset.sort&&historySort.dir==='desc');});
  }

  function setHistoryRange(range) {
    const now=new Date(); if(range==='today'){$('historyFrom').value=todayISO();$('historyTo').value=todayISO();} else if(range==='month'){$('historyFrom').value=localDateISO(startOfMonth(now));$('historyTo').value=localDateISO(endOfMonth(now));} else {$('historyFrom').value='';$('historyTo').value='';} renderHistory();
  }

  function openEditTransaction(id) {
    const t=state.transactions.find(x=>x.id===id);if(!t)return;$('editTxId').value=t.id;$('editTxDate').value=t.date;$('editTxQty').value=t.quantity;$('editTxItem').value=t.item;$('editTxOffer').value=t.offer;$('editTxPaid').value=t.paid;$('editTxCost').value=t.deducted;$('editTxNote').value=t.note;$('editTransactionDialog').showModal();
  }
  async function saveEditTransaction(e) {
    e.preventDefault(); const id=$('editTxId').value,t=state.transactions.find(x=>x.id===id);if(!t)return; const before={...t};
    Object.assign(t,{date:$('editTxDate').value||t.date,quantity:qty($('editTxQty').value),item:$('editTxItem').value.trim(),offer:$('editTxOffer').value.trim(),paid:num($('editTxPaid').value),deducted:num($('editTxCost').value),note:$('editTxNote').value.trim(),updatedAt:nowIso()}); audit(state,'تعديل عملية',t.date,{before,after:t}); await saveState('edit-transaction'); $('editTransactionDialog').close(); renderAll(); toast('تم حفظ التعديل.');
  }
  async function toggleArchiveTransaction(id) { const t=state.transactions.find(x=>x.id===id);if(!t)return;t.archived=!t.archived;t.updatedAt=nowIso();audit(state,t.archived?'أرشفة عملية':'استرجاع عملية',t.date,{id});await saveState('archive');renderAll();toast(t.archived?'تمت الأرشفة ويمكن استرجاعها.':'تم استرجاع العملية.'); }

  function reportRangeQuick(range) {
    const now=new Date(); let f='',t='';
    if(range==='today')f=t=todayISO();
    if(range==='yesterday')f=t=localDateISO(addDays(now,-1));
    if(range==='last7'){f=localDateISO(addDays(now,-6));t=todayISO();}
    if(range==='month'){f=localDateISO(startOfMonth(now));t=localDateISO(endOfMonth(now));}
    if(range==='prevMonth'){const p=new Date(now.getFullYear(),now.getMonth()-1,1);f=localDateISO(startOfMonth(p));t=localDateISO(endOfMonth(p));}
    if(range==='year'){f=`${now.getFullYear()}-01-01`;t=`${now.getFullYear()}-12-31`;}
    if(range==='all'){const dates=state.transactions.map(x=>x.date).filter(Boolean).sort();f=dates[0]||todayISO();t=dates.at(-1)||todayISO();}
    $('reportFrom').value=f;$('reportTo').value=t;renderReports();
  }

  function savedMonths() { const set=new Set(state.transactions.filter(t=>!t.archived).map(t=>t.date.slice(0,7))); return [...set].sort().reverse(); }
  function renderReportRangeButtons() {
    const ranges=[['today','اليوم'],['yesterday','أمس'],['last7','آخر 7 أيام'],['month','الشهر الحالي'],['prevMonth','الشهر السابق'],['year','السنة'],['all','كل السجل']]; $('reportQuickRanges').innerHTML=ranges.map(x=>`<button class="chip" data-report-range="${x[0]}">${x[1]}</button>`).join(''); $$('[data-report-range]').forEach(b=>b.onclick=()=>reportRangeQuick(b.dataset.reportRange));
    const months=savedMonths(); const years=new Set(months.map(m=>m.slice(0,4))); $('savedMonths').innerHTML=months.map(m=>{const [y,mo]=m.split('-');return `<button class="chip" data-month="${m}">شهر ${+mo}${years.size>1?` - ${y}`:''}</button>`}).join(''); $$('[data-month]').forEach(b=>b.onclick=()=>{const [y,m]=b.dataset.month.split('-').map(Number);$('reportFrom').value=localDateISO(new Date(y,m-1,1));$('reportTo').value=localDateISO(new Date(y,m,0));renderReports();});
  }

  function renderReports() {
    renderReportRangeButtons(); if(!$('reportFrom').value||!$('reportTo').value){const n=new Date();$('reportFrom').value=localDateISO(startOfMonth(n));$('reportTo').value=todayISO();}
    const from=$('reportFrom').value,to=$('reportTo').value,s=statsForRange(from,to); $('reportIncome').textContent=fmt(s.income);$('reportCost').textContent=fmt(s.cost);$('reportVariable').textContent=fmt(s.variable);$('reportFixed').textContent=fmt(s.fixed);$('reportProfit').textContent=fmt(s.profit); renderRevenueChart('reportChart',7,from,to); renderTopServices(s.rows);
  }

  function renderTopServices(rows) {
    const map=new Map(); rows.forEach(t=>{const f=txFinancials(t),x=map.get(t.item)||{profit:0,count:0};x.profit+=f.profit;x.count+=f.quantity;map.set(t.item,x)}); const arr=[...map.entries()].sort((a,b)=>b[1].profit-a[1].profit).slice(0,7),max=Math.max(1,...arr.map(x=>x[1].profit));
    $('topServices').innerHTML=arr.length?arr.map(([name,x],i)=>`<div class="rank-item"><span class="rank-num">${i+1}</span><div class="rank-main"><b>${esc(name)}</b><span><i style="width:${Math.max(0,x.profit)/max*100}%"></i></span></div><span class="rank-value">${fmt(x.profit)}</span></div>`).join(''):'<div class="empty-state">لا توجد بيانات.</div>';
  }

  function excelRows(from,to) { return rangeRows(from,to).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)); }
  function excelDataRow(t) { const f=txFinancials(t),wr=num(state.settings.walletRate)||53,er=num(state.settings.expenseRate)||53; return [englishDigits(t.item),englishDigits(t.offer),num(t.paid),num(t.deducted),f.profit,wr?f.income/wr:0,er?f.cost/er:0,dateLabel(t.date)]; }

  async function exportExcel(from=$('reportFrom')?.value,to=$('reportTo')?.value) {
    const rows=excelRows(from||'',to||''); if(!rows.length)return toast('لا توجد بيانات للتصدير.','error');
    const headers=['اسم المنتج / الخدمة','العرض','الداخل / واحدة','مصروف / واحدة','ربح الإجمالي','الداخل للمحفظة بالدولار','مصاريف العمليات بالدولار','التاريخ'];
    const totals=rows.reduce((a,t)=>{const f=txFinancials(t);a[2]+=f.income;a[3]+=f.cost;a[4]+=f.profit;a[5]+=f.income/(num(state.settings.walletRate)||53);a[6]+=f.cost/(num(state.settings.expenseRate)||53);return a},['الإجمالي','',0,0,0,0,0,'']);
    const data=[headers,totals,...rows.map(excelDataRow)];
    if(window.XLSX?.utils){ const ws=XLSX.utils.aoa_to_sheet(data); ws['!cols']=[{wch:24},{wch:20},{wch:14},{wch:14},{wch:14},{wch:20},{wch:20},{wch:12}]; ws['!autofilter']={ref:`A1:H${data.length}`}; ws['!view']={rightToLeft:true};
      const green={patternType:'solid',fgColor:{rgb:'19F000'}},font={bold:true,color:{rgb:'000000'}},border={top:{style:'thin',color:{rgb:'B7B7B7'}},bottom:{style:'thin',color:{rgb:'B7B7B7'}},left:{style:'thin',color:{rgb:'B7B7B7'}},right:{style:'thin',color:{rgb:'B7B7B7'}}};
      for(let r=0;r<data.length;r++)for(let c=0;c<8;c++){const a=XLSX.utils.encode_cell({r,c});if(!ws[a])continue;ws[a].s={alignment:{horizontal:c<2?'right':'center',vertical:'center',readingOrder:c<2?2:1},border,...(r<2?{fill:green,font}:{})};if(r>=2&&c===7)ws[a].t='s';}
      const wb=XLSX.utils.book_new();wb.Workbook={Views:[{RTL:true}]};XLSX.utils.book_append_sheet(wb,ws,'MOX-V2');XLSX.writeFile(wb,`MOX-V2-${from||'all'}-${to||'all'}.xlsx`);toast('تم تصدير Excel.');
    } else { exportCSVFallback(data,`MOX-V2-${from||'all'}-${to||'all'}.csv`); toast('تم تصدير CSV كبديل لأن مكتبة Excel لم تُحمّل.','error'); }
  }

  function exportCSVFallback(data,name){const csv='\ufeff'+data.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),name)}
  function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}

  function renderSettings(){renderPresetManager();renderExpenses();renderStorageInfo();refreshCloudUI();}
  function renderPresetManager(){const q=normalize($('presetManageSearch')?.value||''),svc=$('presetServiceFilter')?.value||'';const services=[...new Set(state.presets.map(p=>p.item).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));if($('presetServiceFilter')){$('presetServiceFilter').innerHTML='<option value="">كل الخدمات</option>'+services.map(s=>`<option ${s===svc?'selected':''}>${esc(s)}</option>`).join('')}
    const arr=state.presets.filter(p=>(!svc||p.item===svc)&&(!q||normalize(`${p.item} ${p.offer} ${p.paid}`).includes(q)));$('presetManageGrid').innerHTML=arr.length?arr.map(p=>`<div class="preset-manage-card" style="--service-color:${serviceColor(p.item)}"><h4>${esc(p.item)} — ${esc(p.offer)}</h4><p>استخدم ${p.usageCount||0} مرة</p><div class="preset-manage-meta"><span>الداخل<b>${fmt(p.paid)}</b></span><span>المصروف<b>${fmt(p.deducted)}</b></span><span>الربح<b>${fmt(p.paid-p.deducted)}</b></span></div><div class="preset-manage-actions"><button class="mini-btn" data-pedit="${p.id}">تعديل</button><button class="mini-btn danger" data-pdelete="${p.id}">حذف</button></div></div>`).join(''):'<div class="empty-state">لا توجد عروض مطابقة.</div>';
    $$('[data-pedit]').forEach(b=>b.onclick=()=>openPresetDialog(b.dataset.pedit));$$('[data-pdelete]').forEach(b=>b.onclick=()=>deletePreset(b.dataset.pdelete));}

  function openPresetDialog(id=''){const p=state.presets.find(x=>x.id===id);$('presetId').value=p?.id||'';$('presetDialogTitle').textContent=p?'تعديل العرض':'عرض جديد';$('presetItem').value=p?.item||'';$('presetOffer').value=p?.offer||'';$('presetPaid').value=p?.paid??'';$('presetCost').value=p?.deducted??'';$('presetColor').value=p?serviceColor(p.item):COLORS[state.presets.length%COLORS.length];$('presetDialog').showModal();}
  async function savePreset(e){e.preventDefault();const item=$('presetItem').value.trim(),offer=$('presetOffer').value.trim();if(!item||!offer)return toast('اكتب المنتج والعرض.','error');const id=$('presetId').value,p=state.presets.find(x=>x.id===id);const data={item,offer,paid:num($('presetPaid').value),deducted:num($('presetCost').value),updatedAt:nowIso()};if(p)Object.assign(p,data);else state.presets.push(normalizePreset({...data,id:uid('preset')}));state.settings.serviceColors[item]=$('presetColor').value;audit(state,p?'تعديل عرض':'إضافة عرض','',`${item} — ${offer}`);await saveState('preset');$('presetDialog').close();renderAll();toast('تم حفظ العرض.');}
  async function deletePreset(id){const p=state.presets.find(x=>x.id===id);if(!p)return;if(!confirm(`حذف العرض ${p.item} — ${p.offer}؟`))return;await createSafetySnapshot('before-delete-preset');state.presets=state.presets.filter(x=>x.id!==id);audit(state,'حذف عرض','',`${p.item} — ${p.offer}`);await saveState('delete-preset');renderAll();toast('تم حذف العرض.');}

  function renderExpenses(){const fx=[...state.fixedExpenses].sort((a,b)=>a.startDate.localeCompare(b.startDate));$('fixedExpenseList').innerHTML=fx.length?fx.map(e=>`<div class="simple-item"><span class="simple-icon">↻</span><span class="simple-main"><b>${esc(e.name)}</b><span>${e.recurrence==='monthly'?'شهري':e.recurrence==='yearly'?'سنوي':'مرة واحدة'} · من ${dateLabel(e.startDate)}${e.note?` · ${esc(e.note)}`:''}</span></span><span><b class="simple-value">${fmt(e.amount)}</b><br><button class="mini-btn" data-fxedit="${e.id}">تعديل</button> <button class="mini-btn danger" data-fxdel="${e.id}">حذف</button></span></div>`).join(''):'<div class="empty-state">لا توجد مصاريف ثابتة.</div>';
    const vx=[...state.variableExpenses].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);$('variableExpenseList').innerHTML=vx.length?vx.map(e=>`<div class="simple-item"><span class="simple-icon">−</span><span class="simple-main"><b>${esc(e.name)}</b><span>${dateLabel(e.date)}${e.note?` · ${esc(e.note)}`:''}</span></span><span><b class="simple-value">${fmt(e.amount)}</b><br><button class="mini-btn" data-vxedit="${e.id}">تعديل</button> <button class="mini-btn danger" data-vxdel="${e.id}">حذف</button></span></div>`).join(''):'<div class="empty-state">لا توجد مصاريف يومية.</div>';
    $$('[data-fxedit]').forEach(b=>b.onclick=()=>openExpenseDialog('fixed',b.dataset.fxedit));$$('[data-vxedit]').forEach(b=>b.onclick=()=>openExpenseDialog('variable',b.dataset.vxedit));$$('[data-fxdel]').forEach(b=>b.onclick=()=>deleteExpense('fixed',b.dataset.fxdel));$$('[data-vxdel]').forEach(b=>b.onclick=()=>deleteExpense('variable',b.dataset.vxdel));}

  function openExpenseDialog(type,id=''){const arr=type==='fixed'?state.fixedExpenses:state.variableExpenses,e=arr.find(x=>x.id===id);$('expenseType').value=type;$('expenseId').value=e?.id||'';$('expenseDialogTitle').textContent=type==='fixed'?(e?'تعديل مصروف ثابت':'مصروف ثابت جديد'):(e?'تعديل مصروف يومي':'مصروف يومي جديد');$('expenseName').value=e?.name||'';$('expenseAmount').value=e?.amount??'';$('expenseDate').value=(type==='fixed'?e?.startDate:e?.date)||todayISO();$('expenseRecurrence').value=e?.recurrence||'monthly';$('expenseNote').value=e?.note||'';$('recurrenceField').classList.toggle('hidden',type!=='fixed');$('expenseDialog').showModal();}
  async function saveExpense(e){e.preventDefault();const type=$('expenseType').value,id=$('expenseId').value,name=$('expenseName').value.trim(),amount=num($('expenseAmount').value),date=$('expenseDate').value||todayISO(),note=$('expenseNote').value.trim();if(!name)return toast('اكتب اسم المصروف.','error');const arr=type==='fixed'?state.fixedExpenses:state.variableExpenses,old=arr.find(x=>x.id===id);if(type==='fixed'){const data=normalizeFixedExpense({id:id||uid('fx'),name,amount,startDate:date,recurrence:$('expenseRecurrence').value,note,createdAt:old?.createdAt||nowIso()});if(old)Object.assign(old,data);else arr.push(data);}else{const data=normalizeVariableExpense({id:id||uid('vx'),name,amount,date,note,createdAt:old?.createdAt||nowIso()});if(old)Object.assign(old,data);else arr.push(data);}audit(state,old?'تعديل مصروف':'إضافة مصروف',date,{name,amount,type});await saveState('expense');$('expenseDialog').close();renderAll();toast('تم حفظ المصروف.');}
  async function deleteExpense(type,id){const arr=type==='fixed'?state.fixedExpenses:state.variableExpenses,e=arr.find(x=>x.id===id);if(!e)return;if(!confirm(`حذف ${e.name}؟`))return;await createSafetySnapshot('before-delete-expense');if(type==='fixed')state.fixedExpenses=arr.filter(x=>x.id!==id);else state.variableExpenses=arr.filter(x=>x.id!==id);audit(state,'حذف مصروف',type==='fixed'?e.startDate:e.date,{name:e.name,amount:e.amount,type});await saveState('delete-expense');renderAll();toast('تم حذف المصروف.');}

  async function downloadBackup(){const backup={app:APP_NAME,format:'mox-v2-clean-backup',version:2,exportedAt:nowIso(),state:cleanBackupState()};downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),`MOX-V2-backup-${todayISO()}.json`);toast('تم تنزيل النسخة الاحتياطية.');}
  async function restoreBackup(file){try{const text=await file.text(),b=JSON.parse(text),incoming=sanitizeState(b.state||b);if(!incoming.transactions&&!incoming.presets)throw new Error('invalid');if(!confirm('استرجاع النسخة سيستبدل البيانات الحالية. متابعة؟'))return;await createSafetySnapshot('before-file-restore');state=incoming;await saveState('restore-file');renderAll();toast('تم استرجاع النسخة.');}catch(e){console.error(e);toast('ملف النسخة غير صالح.','error')}}
  async function clearTransactions(){if(!state.transactions.length)return toast('لا توجد عمليات لمسحها.','error');const word=prompt('للتأكيد اكتب: مسح');if(word!=='مسح')return;await createSafetySnapshot('before-clear-transactions');state.transactions=[];audit(state,'مسح كل العمليات','','');await saveState('clear-transactions');renderAll();toast('تم مسح العمليات ويمكن الرجوع لنسخة الأمان.');}
  async function renderStorageInfo(){if(!$('storageInfo'))return;const estimate=await navigator.storage?.estimate?.();const size=new Blob([JSON.stringify(cleanBackupState())]).size;$('storageInfo').textContent=`حجم بيانات MOX-V2 التقريبي: ${(size/1024).toFixed(1)} KB${estimate?.quota?` · مساحة المتصفح المتاحة ${(estimate.quota/1024/1024).toFixed(0)} MB`:''} · العمليات ${state.transactions.length} · العروض ${state.presets.length}`;}

  async function deriveLockHash(password,saltBase64){const enc=new TextEncoder(),salt=Uint8Array.from(atob(saltBase64),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:120000},key,256);return btoa(String.fromCharCode(...new Uint8Array(bits)));}
  async function setLockPassword(){const p=$('newLockPassword').value;if(p.length<4)return toast('كلمة المرور لازم تكون 4 أحرف على الأقل.','error');const salt=crypto.getRandomValues(new Uint8Array(16)),s64=btoa(String.fromCharCode(...salt)),hash=await deriveLockHash(p,s64);localStorage.setItem(LOCK_SALT_KEY,s64);localStorage.setItem(LOCK_HASH_KEY,hash);$('newLockPassword').value='';toast('تم تفعيل القفل المحلي.');}
  async function removeLockPassword(){if(!localStorage.getItem(LOCK_HASH_KEY))return;const p=prompt('اكتب كلمة المرور الحالية لإلغاء القفل:');if(!await verifyLockPassword(p||''))return toast('كلمة المرور غير صحيحة.','error');localStorage.removeItem(LOCK_HASH_KEY);localStorage.removeItem(LOCK_SALT_KEY);toast('تم إلغاء القفل.');}
  async function verifyLockPassword(p){const h=localStorage.getItem(LOCK_HASH_KEY),s=localStorage.getItem(LOCK_SALT_KEY);return !h||!s?true:(await deriveLockHash(p,s))===h;}
  function showLock(){if(!localStorage.getItem(LOCK_HASH_KEY))return toast('فعّل كلمة مرور من الإعدادات أولًا.','error');$('lockScreen').classList.remove('hidden');$('lockScreen').setAttribute('aria-hidden','false');setTimeout(()=>$('unlockPassword').focus(),50)}
  async function unlock(){if(await verifyLockPassword($('unlockPassword').value)){$('lockScreen').classList.add('hidden');$('unlockPassword').value='';$('unlockError').textContent='';}else $('unlockError').textContent='كلمة المرور غير صحيحة.';}

  function getDeviceId(){let id=localStorage.getItem(DEVICE_ID_KEY);if(!id){id=uid('device');localStorage.setItem(DEVICE_ID_KEY,id)}return id}
  function firebaseConfig(){try{return JSON.parse(localStorage.getItem(FIREBASE_CONFIG_KEY)||'null')}catch{return null}}
  function setCloudStatus(text,type=''){['cloudStatus','syncBadge'].forEach(id=>{const el=$(id);if(!el)return;el.className=`sync-badge ${type}`;el.querySelector('span:last-child').textContent=text})}
  function refreshCloudUI(){const raw=localStorage.getItem(FIREBASE_CONFIG_KEY)||'';if($('firebaseConfig'))$('firebaseConfig').value=raw;setCloudStatus(cloud.uid?'متزامن':'محلي',cloud.uid?'ok':'');}
  async function initFirebase(){const cfg=firebaseConfig();if(!cfg)return false;if(!window.firebase?.auth||!window.firebase?.firestore){toast('مكتبات Firebase لم تُحمّل.','error');return false}try{if(cloud.app)return true;cloud.app=firebase.apps.find(a=>a.name==='moxv2')||firebase.initializeApp(cfg,'moxv2');cloud.auth=firebase.auth(cloud.app);cloud.db=firebase.firestore(cloud.app);cloud.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);cloud.auth.onAuthStateChanged(u=>{cloud.uid=u?.uid||null;if(u)startCloudListener();else stopCloudListener();refreshCloudUI()});return true}catch(e){console.error(e);toast('Firebase config غير صحيح.','error');return false}}
  async function saveFirebaseConfig(){try{const cfg=JSON.parse($('firebaseConfig').value.trim());if(!cfg.apiKey||!cfg.projectId)throw 0;localStorage.setItem(FIREBASE_CONFIG_KEY,JSON.stringify(cfg));if(cloud.app){stopCloudListener();try{await cloud.app.delete()}catch{}cloud={app:null,auth:null,db:null,unsub:null,uid:null,timer:null,applying:false}}await initFirebase();toast('تم حفظ Firebase config.');}catch{toast('اكتب Firebase config بصيغة JSON صحيحة.','error')}}
  async function cloudSignup(){if(!await initFirebase())return;try{const email=$('cloudEmail').value.trim(),pass=$('cloudPassword').value;await cloud.auth.createUserWithEmailAndPassword(email,pass);toast('تم إنشاء الحساب وتسجيل الدخول.');}catch(e){console.error(e);toast(firebaseErrorArabic(e),'error')}}
  async function cloudLogin(){if(!await initFirebase())return;try{await cloud.auth.signInWithEmailAndPassword($('cloudEmail').value.trim(),$('cloudPassword').value);toast('تم تسجيل الدخول.');}catch(e){console.error(e);toast(firebaseErrorArabic(e),'error')}}
  async function cloudLogout(){try{stopCloudListener();await cloud.auth?.signOut();cloud.uid=null;refreshCloudUI();toast('تم تسجيل الخروج.')}catch(e){console.error(e)}}
  function firebaseErrorArabic(e){const c=e?.code||'';if(c.includes('invalid-credential')||c.includes('wrong-password'))return'بيانات الدخول غير صحيحة.';if(c.includes('email-already'))return'البريد مستخدم بالفعل.';if(c.includes('weak-password'))return'كلمة المرور ضعيفة.';if(c.includes('operation-not-allowed'))return'فعّل Email/Password من Firebase Authentication.';return e?.message||'حصل خطأ في Firebase.'}
  function cloudRef(){return cloud.uid?cloud.db.collection('users').doc(cloud.uid).collection('apps').doc('mox-v2'):null}
  function startCloudListener(){stopCloudListener();if(!cloud.uid)return;setCloudStatus('متصل','ok');cloud.unsub=cloudRef().onSnapshot(async snap=>{if(!snap.exists){await cloudUpload(true);return}const d=snap.data();if(d.deviceId===getDeviceId())return;if(d.clientUpdatedAt&&d.clientUpdatedAt>new Date(state.meta.updatedAt).getTime()){cloud.applying=true;await createSafetySnapshot('before-cloud-update');state=sanitizeState(d.state);await saveState('cloud-download',{skipCloud:true});cloud.applying=false;renderAll();toast('تم استلام تحديث من جهاز آخر.')}} ,e=>{console.error(e);setCloudStatus('خطأ','warn')});}
  function stopCloudListener(){if(cloud.unsub){cloud.unsub();cloud.unsub=null}if(cloud.timer){clearTimeout(cloud.timer);cloud.timer=null}}
  function scheduleCloudUpload(){if(!cloud.uid||cloud.applying)return;clearTimeout(cloud.timer);cloud.timer=setTimeout(()=>cloudUpload(false),900)}
  async function cloudUpload(manual=true){if(!cloud.uid)return manual&&toast('سجل الدخول للمزامنة أولًا.','error');try{const payload={app:APP_NAME,version:2,deviceId:getDeviceId(),clientUpdatedAt:Date.now(),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),state:cleanBackupState()};await cloudRef().set(payload);setCloudStatus('متزامن','ok');if(manual)toast('تم رفع نسخة الجهاز للسحابة.')}catch(e){console.error(e);toast('فشل رفع البيانات للسحابة.','error')}}
  async function cloudDownload(){if(!cloud.uid)return toast('سجل الدخول للمزامنة أولًا.','error');try{const snap=await cloudRef().get();if(!snap.exists)return toast('لا توجد نسخة سحابية بعد.','error');await createSafetySnapshot('before-manual-cloud-download');cloud.applying=true;state=sanitizeState(snap.data().state);await saveState('manual-cloud-download',{skipCloud:true});cloud.applying=false;renderAll();toast('تم تنزيل نسخة السحابة.')}catch(e){console.error(e);toast('فشل تنزيل النسخة السحابية.','error')}}

  function renderAll(){renderToday();renderAdd();renderHistory();renderReports();renderSettings();}

  function bindEvents(){
    $$('.nav-item,.mobile-nav button').forEach(b=>b.onclick=()=>goView(b.dataset.view)); $$('[data-go]').forEach(b=>b.onclick=()=>{goView(b.dataset.go);if(b.dataset.settingsTab)setSettingsTab(b.dataset.settingsTab)});
    $('globalAddBtn').onclick=()=>goView('add'); $('lockNowBtn').onclick=showLock; $('unlockBtn').onclick=unlock; $('unlockPassword').onkeydown=e=>{if(e.key==='Enter')unlock()};
    $('quickPresetSearch').oninput=renderPresetSearch; $('quickPresetSearch').onfocus=renderPresetSearch; document.addEventListener('click',e=>{if(!e.target.closest('.search-control')&&!e.target.closest('#presetDropdown'))$('presetDropdown').classList.add('hidden')});
    $('qtyMinus').onclick=()=>{$('addQty').value=Math.max(1,qty($('addQty').value)-1);updateAddPreview()}; $('qtyPlus').onclick=()=>{$('addQty').value=qty($('addQty').value)+1;updateAddPreview()}; $('addQty').oninput=updateAddPreview; $('addPaid').oninput=updateAddPreview; $('saveQuickTransaction').onclick=saveQuickTransaction;
    document.addEventListener('keydown',e=>{if(e.key==='Enter'&&$('view-add').classList.contains('active')&&document.activeElement?.tagName!=='TEXTAREA'&&!document.querySelector('dialog[open]')){if(selectedPresetId){e.preventDefault();saveQuickTransaction()}}});
    $('saveManualBtn').onclick=saveManual;
    $('pasteWalletBtn').onclick=async()=>{try{$('walletMessages').value=await navigator.clipboard.readText();analyzeWallet()}catch{toast('المتصفح منع القراءة التلقائية. الصق يدويًا داخل المربع.','error')}}; $('analyzeWalletBtn').onclick=analyzeWallet; $('importWalletRowsBtn').onclick=importWalletRows;
    $('historySearch').oninput=renderHistory; $('historyFrom').onchange=renderHistory; $('historyTo').onchange=renderHistory; $('showArchived').onchange=renderHistory; $$('.range-btn').forEach(b=>b.onclick=()=>setHistoryRange(b.dataset.range)); $('historyTable').querySelectorAll('th[data-sort]').forEach(th=>th.onclick=()=>{historySort={key:th.dataset.sort,dir:historySort.key===th.dataset.sort&&historySort.dir==='desc'?'asc':'desc'};renderHistory()}); $('historyExportBtn').onclick=()=>exportExcel($('historyFrom').value,$('historyTo').value); $('saveEditTxBtn').onclick=saveEditTransaction;
    $('reportFrom').onchange=renderReports; $('reportTo').onchange=renderReports; $('exportExcelBtn').onclick=()=>exportExcel();
    $$('.settings-tab').forEach(b=>b.onclick=()=>setSettingsTab(b.dataset.tab)); $('newPresetBtn').onclick=()=>openPresetDialog(); $('presetManageSearch').oninput=renderPresetManager; $('presetServiceFilter').onchange=renderPresetManager; $('savePresetBtn').onclick=savePreset;
    $('newFixedExpenseBtn').onclick=()=>openExpenseDialog('fixed'); $('newVariableExpenseBtn').onclick=()=>openExpenseDialog('variable'); $('saveExpenseBtn').onclick=saveExpense;
    $('backupBtn').onclick=downloadBackup; $('restoreBtn').onclick=()=>$('restoreFile').click(); $('restoreFile').onchange=e=>{if(e.target.files[0])restoreBackup(e.target.files[0]);e.target.value=''}; $('safetyRestoreBtn').onclick=restoreLatestSafety; $('clearDataBtn').onclick=clearTransactions; $$('[data-action="backup"]').forEach(b=>b.onclick=downloadBackup); $$('[data-action="wallet-import"]').forEach(b=>b.onclick=()=>{goView('add');setTimeout(()=>$('walletImportPanel').scrollIntoView({behavior:'smooth'}),100)});
    $('saveLockPasswordBtn').onclick=setLockPassword; $('removeLockPasswordBtn').onclick=removeLockPassword;
    $('cloudSaveConfigBtn').onclick=saveFirebaseConfig; $('cloudSignupBtn').onclick=cloudSignup; $('cloudLoginBtn').onclick=cloudLogin; $('cloudLogoutBtn').onclick=cloudLogout; $('cloudUploadBtn').onclick=()=>cloudUpload(true); $('cloudDownloadBtn').onclick=cloudDownload;
  }

  async function init(){
    document.title=APP_NAME; $('todayPill').textContent=new Date().toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'}); $('addDate').value=todayISO(); $('manualDate').value=todayISO();
    await openDB(); await loadState(); bindEvents(); renderAll(); renderReportRangeButtons(); reportRangeQuick('month');
    const savedCfg=localStorage.getItem(FIREBASE_CONFIG_KEY); if(savedCfg) await initFirebase();
    if(localStorage.getItem(LOCK_HASH_KEY)) showLock();
    goView(state.settings.lastView||'today');
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }

  document.addEventListener('DOMContentLoaded',init);
})();

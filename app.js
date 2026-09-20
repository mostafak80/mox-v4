(() => {
  'use strict';

  const APP_NAME = 'MOX-V2';
  const DB_NAME = 'mox-v2-db';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const STATE_KEY = 'state';
  const MAX_BACKUPS = 5;

  const legacyKeys = {
    rows: 'profit_calculator_rows_v7',
    presets: 'profit_calculator_presets_v7',
    fixedExpenses: 'profit_calculator_fixed_expenses_v2',
    variableExpenses: 'profit_variable_expenses_v1',
    serviceColors: 'profit_service_colors_v1',
    walletRate: 'profit_wallet_dollar_rate_v2',
    expenseRate: 'profit_expenses_dollar_rate_v2',
  };

  const COLORS = ['#6c7cff','#2dd4bf','#38bdf8','#f59e0b','#fb7185','#a78bfa','#34d399','#f472b6','#60a5fa','#f97316','#22c55e','#e879f9'];

  let db;
  let state;
  let walletParsed = [];
  let historySort = { key: 'date', dir: 'desc' };
  let lastUndo = null;
  let bulkPresetMode = false;
  let bulkPresetSelection = new Set();
  let historySelectionMode = false;
  let historySelected = new Set();
  let historyPage = 1;
  const HISTORY_PAGE_SIZE = 100;
  let quickCart = [];
  let quickCartSaving = false;

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
        lastView: 'today',
        quickPresetServiceFilter: ''
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
      tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error || new Error('Storage transaction aborted'));
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

  function monthIndex(date) { return date.getFullYear() * 12 + date.getMonth(); }

  function fixedExpenseOccurrences(e, from, to) {
    const start=parseISO(e.startDate), f=parseISO(from), end=parseISO(to);
    if(!start||!f||!end||end<f) return 0;
    if (e.recurrence==='once') return e.startDate>=from && e.startDate<=to ? 1:0;
    if (e.recurrence==='monthly') {
      // المصروف الشهري يُحسب مرة لكل شهر داخل الفترة، وليس حسب يوم البداية داخل الشهر.
      const firstMonth=Math.max(monthIndex(start),monthIndex(f));
      const lastMonth=monthIndex(end);
      return Math.max(0,lastMonth-firstMonth+1);
    }
    if (e.recurrence==='yearly') {
      let count=0;
      for(let y=Math.max(start.getFullYear(),f.getFullYear());y<=end.getFullYear();y++){
        const d=new Date(y,start.getMonth(),Math.min(start.getDate(),new Date(y,start.getMonth()+1,0).getDate()));
        if(d>=start&&d>=f&&d<=end) count++;
      }
      return count;
    }
    return 0;
  }

  function fixedExpenseTotal(from,to) { return state.fixedExpenses.reduce((s,e)=>s+num(e.amount)*fixedExpenseOccurrences(e,from,to),0); }

  function repairLegacyFixedExpenseStartDates() {
    if(state?.settings?.fixedExpenseHistoryRepaired) return false;
    const dates=state.transactions.map(t=>t.date).filter(Boolean).sort();
    if(!dates.length){ state.settings.fixedExpenseHistoryRepaired=true; return false; }
    const earliest=parseISO(dates[0]);
    if(!earliest){ state.settings.fixedExpenseHistoryRepaired=true; return false; }
    const earliestMonth=localDateISO(new Date(earliest.getFullYear(),earliest.getMonth(),1));
    let changed=false;
    // المصاريف المهاجرة من النسخة القديمة لم يكن لها تاريخ بداية، لذلك كانت تبدأ يوم الترحيل بالخطأ.
    // نرجع المصروف الشهري المهاجر لأول شهر فيه عمليات فقط، بدون لمس المصروفات الجديدة التي أضافها المستخدم لاحقًا.
    state.fixedExpenses.forEach(e=>{
      if(e.recurrence==='monthly' && (!e.startDate || e.startDate>earliestMonth)){ e.startDate=earliestMonth; changed=true; }
    });
    state.settings.fixedExpenseHistoryRepaired=true;
    return changed;
  }

  function statsForRange(from,to) {
    const rows=rangeRows(from,to); const tx=rows.map(txFinancials);
    const income=tx.reduce((s,x)=>s+x.income,0), cost=tx.reduce((s,x)=>s+x.cost,0);
    const variable=rangeVariableExpenses(from,to).reduce((s,e)=>s+num(e.amount),0);
    const fixed=from&&to?fixedExpenseTotal(from,to):0;
    return {rows,income,cost,variable,fixed,profit:income-cost-variable-fixed,count:rows.reduce((s,r)=>s+qty(r.quantity),0)};
  }

  function toast(message,type='success',duration=3200,undoFn=null) {
    const openDialog=document.querySelector('dialog[open]');
    let host=$('toastHost');
    if(openDialog){
      host=openDialog.querySelector('.dialog-toast-host');
      if(!host){ host=document.createElement('div'); host.className='dialog-toast-host'; openDialog.appendChild(host); }
    }
    if(!host) return;
    const el=document.createElement('div'); el.className=`toast ${type}`;
    el.innerHTML=`<div style="display:flex;gap:10px;align-items:center;justify-content:space-between"><span>${esc(message)}</span>${undoFn?'<button class="mini-btn">تراجع</button>':''}</div>`;
    host.appendChild(el);
    if(undoFn) el.querySelector('button').onclick=async()=>{ await undoFn(); el.remove(); };
    setTimeout(()=>el.remove(),duration);
  }

  function setDialogError(dialogId,message='',focusId=''){
    const dialog=$(dialogId); if(!dialog) return;
    const box=dialog.querySelector('.dialog-error');
    if(box){ box.textContent=message; box.classList.toggle('hidden',!message); }
    if(focusId && message) setTimeout(()=>$(focusId)?.focus(),30);
  }

  function closeDialog(id){ const d=$(id); if(d?.open) d.close(); setDialogError(id,''); }

  function goView(name) {
    if(!$(`view-${name}`)) name='today';
    $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
    $$('.nav-item,.mobile-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    state.settings.lastView=name; saveState('view');
    $('viewTitle').textContent={today:'اليوم',add:'إضافة عملية',history:'سجل العمليات',reports:'التقارير',settings:'الإعدادات'}[name]||APP_NAME;
    if(name==='today') renderToday(); if(name==='add') renderAdd(); if(name==='history') renderHistory(); if(name==='reports') renderReports(); if(name==='settings') renderSettings();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function setSettingsTab(tab) {
    $$('.settings-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    $$('.settings-pane').forEach(p=>p.classList.toggle('active',p.id===`settings-${tab}`));
    if(tab==='presets') renderPresetManager(); if(tab==='expenses') renderExpenses(); if(tab==='data') renderStorageInfo();
  }

  function renderToday() {
    const t=todayISO(), y=localDateISO(addDays(new Date(),-1));
    const s=statsForRange(t,t), sy=statsForRange(y,y);
    $('kpiIncome').textContent=fmt(s.income); $('kpiCost').textContent=fmt(s.cost); $('kpiProfit').textContent=fmt(s.profit); $('kpiCount').textContent=s.count;
    renderDelta($('kpiIncomeDelta'),s.income,sy.income,'عن أمس'); renderDelta($('kpiCostDelta'),s.cost,sy.cost,'عن أمس',true); renderDelta($('kpiProfitDelta'),s.profit,sy.profit,'عن أمس');
    $('kpiAvg').textContent=s.count?`متوسط الربح ${fmt(s.profit/s.count)} EGP`:'لا توجد عمليات اليوم';
    renderRevenueChart('revenueChart',7); renderProductDonut(s.rows); renderRecentTransactions(s.rows.length?s.rows:rangeRows().slice(-5)); renderSmartInsights();
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

  function getQuickPresetServiceFilter(){
    const hidden=$('quickPresetServiceFilter');
    return String(hidden?.value ?? state?.settings?.quickPresetServiceFilter ?? '').trim();
  }

  function closeQuickServiceMenu(){
    const menu=$('quickServiceMenu'), btn=$('quickServicePickerBtn');
    if(menu) menu.classList.add('hidden');
    if(btn) btn.setAttribute('aria-expanded','false');
  }

  function openQuickServiceMenu(){
    const menu=$('quickServiceMenu'), btn=$('quickServicePickerBtn');
    if(!menu || !btn) return;
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded','true');
  }

  function toggleQuickServiceMenu(){
    const menu=$('quickServiceMenu');
    if(!menu) return;
    menu.classList.contains('hidden') ? openQuickServiceMenu() : closeQuickServiceMenu();
  }

  function setQuickPresetServiceFilter(value=''){
    const next=String(value||'').trim();
    if($('quickPresetServiceFilter')) $('quickPresetServiceFilter').value=next;
    state.settings.quickPresetServiceFilter=next;
    saveState('quick-service-filter').catch(()=>{});
    closeQuickServiceMenu();
    renderRecentPresets();
  }

  function quickPresetServices(){
    const counts=new Map();
    sortedPresets().forEach(p=>counts.set(p.item,(counts.get(p.item)||0)+1));
    return [...counts.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ar')).map(([name,count])=>({name,count}));
  }

  function renderQuickServicePicker(){
    const btn=$('quickServicePickerBtn'), menu=$('quickServiceMenu'), hidden=$('quickPresetServiceFilter');
    if(!btn || !menu || !hidden) return;
    const selected=getQuickPresetServiceFilter();
    hidden.value=selected;
    const services=quickPresetServices();
    const total=services.reduce((sum,s)=>sum+s.count,0);
    const selectedCount=selected ? (services.find(s=>s.name===selected)?.count || 0) : total;
    $('quickServicePickerLabel').textContent=selected || `كل الخدمات (${total})`;
    $('quickServicePickerCount').textContent=String(selectedCount);
    btn.classList.toggle('is-filtered',!!selected);
    const options=[{name:'',label:`كل الخدمات`,count:total,color:'linear-gradient(135deg,#6c7cff,#2dd4bf)',hint:'اعرض كل الخدمات واختر من أكثر من خدمة'},
      ...services.map(s=>({name:s.name,label:s.name,count:s.count,color:serviceColor(s.name),hint:'اعرض عروض هذه الخدمة فقط'}))];
    menu.innerHTML=options.length?options.map(opt=>{
      const active=(opt.name||'')===selected;
      const swatch=String(opt.color).startsWith('linear-gradient') ? opt.color : `${opt.color}`;
      return `<button type="button" class="quick-service-option ${active?'active':''}" data-service="${esc(opt.name)}" role="option" aria-selected="${active?'true':'false'}">
        <span class="quick-service-option-main">
          <i class="quick-service-swatch" style="background:${swatch}"></i>
          <span class="quick-service-option-copy"><b>${esc(opt.label)}</b><small>${esc(opt.hint)}</small></span>
        </span>
        <strong>${fmt(opt.count,0)}</strong>
      </button>`;
    }).join(''):'<div class="empty-state">لا توجد خدمات محفوظة بعد.</div>';
    $$('#quickServiceMenu [data-service]').forEach(el=>el.onclick=(e)=>{e.stopPropagation(); setQuickPresetServiceFilter(el.dataset.service||'');});
  }

  function renderQuickPresetFilterMeta(totalVisible,totalAll){
    const meta=$('quickPresetFilterMeta'); if(!meta) return;
    const selectedService=getQuickPresetServiceFilter();
    const selectedCount=[...bulkPresetSelection].length;
    meta.innerHTML=`<span class="meta-chip ${selectedService?'active':''}">${selectedService?`الخدمة الحالية: ${esc(selectedService)}`:'فلتر مفتوح على كل الخدمات'}</span>
      <span class="meta-chip">المعروض ${fmt(totalVisible,0)} من ${fmt(totalAll,0)}</span>
      <span class="meta-chip ${selectedCount?'active':''}">المحدد ${fmt(selectedCount,0)}</span>
      <span class="meta-tip">تقدر تبدّل بين الخدمات وتكمل التحديد بدون ما الاختيارات تضيع.</span>`;
  }

  function renderAdd() {
    $('addDate').value ||= todayISO(); $('manualDate').value ||= todayISO(); renderQuickServicePicker(); renderRecentPresets(); renderQuickCart();
  }

  function renderRecentPresets() {
    const all=sortedPresets();
    const serviceFilter=getQuickPresetServiceFilter();
    const filtered=serviceFilter ? all.filter(p=>p.item===serviceFilter) : all;
    const list=filtered;
    const wrap=$('recentPresets');
    wrap.classList.toggle('bulk-mode',bulkPresetMode);
    wrap.innerHTML=list.length?list.map((p,idx)=>{
      const selected=bulkPresetSelection.has(p.id);
      return `<button type="button" class="recent-preset-card ${selected?'selected':''}" data-preset-id="${esc(p.id)}" style="animation-delay:${Math.min(idx*45,420)}ms">
        <i class="service-bar" style="--service-color:${serviceColor(p.item)}"></i>
        <span><b>${esc(p.item)} — ${esc(p.offer)}</b><small>الداخل ${fmt(p.paid)} · المصروف ${fmt(p.deducted)} · الربح ${fmt(p.paid-p.deducted)}</small></span>
        <strong>${bulkPresetMode?`<span class="bulk-check">${selected?'✓':'＋'}</span>`:`<span class="offer-cart-count" aria-label="عدد الشحنات في السلة">${quickCart.find(r=>r.id===p.id)?.quantity || '+'}</span>`}</strong>
      </button>`;
    }).join(''):'<div class="empty-state">لا توجد عروض لهذه الخدمة. اختر خدمة أخرى أو أضف عرضًا من الإعدادات.</div>';
    $$('#recentPresets [data-preset-id]').forEach(b=>b.onclick=()=>{
      if(bulkPresetMode) toggleBulkPreset(b.dataset.presetId); else addToQuickCart(b.dataset.presetId);
    });
    const btn=$('bulkPresetModeBtn'); if(btn) btn.textContent=bulkPresetMode?'إنهاء التحديد':'تحديد متعدد';
    renderQuickServicePicker();
    renderQuickPresetFilterMeta(list.length,all.length);
    renderBulkPresetBar();
    syncOfferCartCounts();
  }

  function toggleBulkPresetMode(force){
    if(quickCartSaving) return;
    bulkPresetMode=typeof force==='boolean'?force:!bulkPresetMode;
    if(!bulkPresetMode) bulkPresetSelection.clear();
    renderRecentPresets();
  }

  function toggleBulkPreset(id){
    if(quickCartSaving) return;
    if(bulkPresetSelection.has(id)) bulkPresetSelection.delete(id); else bulkPresetSelection.add(id);
    renderRecentPresets();
  }

  function renderBulkPresetBar(){
    const bar=$('bulkPresetBar'); if(!bar) return;
    const chosen=[...bulkPresetSelection].map(id=>state.presets.find(p=>p.id===id)).filter(Boolean);
    const income=chosen.reduce((s,p)=>s+num(p.paid),0);
    const cost=chosen.reduce((s,p)=>s+num(p.deducted),0);
    bar.classList.toggle('hidden',!bulkPresetMode);
    bar.innerHTML=bulkPresetMode?`<div class="bulk-summary"><b>${chosen.length} عرض محدد</b><span>داخل ${fmt(income)} · مصروف ${fmt(cost)} · ربح ${fmt(income-cost)}</span></div><div class="bulk-actions"><button type="button" class="btn btn-ghost" id="clearBulkPresetsBtn">إلغاء التحديد</button><button type="button" class="btn btn-primary" id="addBulkPresetsBtn" ${chosen.length?'':'disabled'}>＋ إضافة المحدد مرة واحدة</button></div>`:'';
    if($('clearBulkPresetsBtn')) $('clearBulkPresetsBtn').onclick=()=>{bulkPresetSelection.clear();renderRecentPresets()};
    if($('addBulkPresetsBtn')) $('addBulkPresetsBtn').onclick=addBulkPresets;
  }

  function addBulkPresets(){
    if(quickCartSaving) return;
    const chosen=[...bulkPresetSelection].map(id=>state.presets.find(p=>p.id===id && p.active!==false)).filter(Boolean);
    if(!chosen.length) return toast('حدد عرض واحد على الأقل.','error');
    chosen.forEach(p=>addToQuickCart(p.id,false));
    bulkPresetSelection.clear(); bulkPresetMode=false;
    renderQuickCart(); renderRecentPresets();
    toast(`تمت إضافة ${chosen.length} عروض للسلة. اضغط حفظ العمليات لما تخلص.`);
  }

  function renderPresetSearch() {
    const q=normalize($('quickPresetSearch').value); const box=$('presetDropdown');
    if(!q){ box.classList.add('hidden'); box.innerHTML=''; return; }
    const matches=sortedPresets().filter(p=>normalize(`${p.item} ${p.offer} ${p.paid}`).includes(q)).slice(0,12);
    box.innerHTML=matches.length?matches.map(p=>`<button class="preset-option" data-id="${esc(p.id)}"><span><b>${esc(p.item)} — ${esc(p.offer)}</b><small>الداخل ${fmt(p.paid)} · المصروف ${fmt(p.deducted)}</small></span><span class="preset-money">${fmt(p.paid)} EGP</span></button>`).join(''):'<div class="empty-state">لا يوجد عرض مطابق.</div>';
    box.classList.remove('hidden'); $$('#presetDropdown [data-id]').forEach(b=>b.onclick=()=>{addToQuickCart(b.dataset.id);$('quickPresetSearch').value='';box.classList.add('hidden');});
  }

  async function addTransaction(data, reason='إضافة عملية') {
    const t=normalizeTransaction({...data,id:data.id||uid('tx'),createdAt:data.createdAt||nowIso(),updatedAt:nowIso()});
    state.transactions.push(t); audit(state,reason,t.date,{item:t.item,offer:t.offer,paid:t.paid,deducted:t.deducted,quantity:t.quantity});
    const p=state.presets.find(x=>x.id===data.presetId); if(p){ p.usageCount=num(p.usageCount)+qty(t.quantity); p.lastUsedAt=nowIso(); p.updatedAt=nowIso(); }
    await saveState(reason); return t;
  }

  function addToQuickCart(id, render=true){
    if(quickCartSaving) return;
    const p=state.presets.find(x=>x.id===id && x.active!==false); if(!p)return;
    const row=quickCart.find(x=>x.id===id);
    if(row) row.quantity++;
    else quickCart.push({id:p.id,item:p.item,offer:p.offer,paid:p.paid,deducted:p.deducted,quantity:1});
    if(render){renderQuickCart(id);syncOfferCartCounts();}
  }

  function syncOfferCartCounts(){
    $$('#recentPresets [data-preset-id]').forEach(button=>{
      const count=quickCart.find(row=>row.id===button.dataset.presetId)?.quantity || 0;
      button.classList.toggle('in-cart',count>0);
      const badge=button.querySelector('.offer-cart-count');
      if(badge) badge.textContent=count || '+';
    });
  }

  function changeCartQty(id,delta){
    if(quickCartSaving) return;
    const row=quickCart.find(x=>x.id===id); if(!row)return;
    row.quantity=Math.max(1,row.quantity+delta);
    renderQuickCart(id);syncOfferCartCounts();
  }

  function removeCartItem(id){
    if(quickCartSaving) return;
    quickCart=quickCart.filter(x=>x.id!==id);
    renderQuickCart();syncOfferCartCounts();
  }

  function cartTotals(){
    return quickCart.reduce((t,r)=>({count:t.count+r.quantity,income:t.income+r.paid*r.quantity,cost:t.cost+r.deducted*r.quantity}),{count:0,income:0,cost:0});
  }

  function updateCartSummary(){
    const t=cartTotals();
    $('cartSummary').textContent=`${fmt(t.count,0)} شحنة · ${fmt(quickCart.length,0)} عرض`;
    $('addIncomePreview').textContent=fmt(t.income);
    $('addCostPreview').textContent=fmt(t.cost);
    $('addProfitPreview').textContent=fmt(t.income-t.cost);
    $('addProfitPreview').classList.toggle('negative',t.income<t.cost);
    const save=$('saveQuickTransaction');
    save.disabled=quickCartSaving || !t.count;
    save.textContent=quickCartSaving?'جارٍ حفظ العمليات…':t.count?`حفظ العمليات · ${fmt(t.count,0)} شحنة`:'حفظ العمليات';
    save.setAttribute('aria-busy',String(quickCartSaving));
    $('clearQuickCart').disabled=quickCartSaving || !t.count;
  }

  function renderQuickCart(changedId=''){
    const box=$('quickCart'); if(!box)return;
    const active=document.activeElement;
    const focused=active?.closest('[data-cart-id]');
    const focusId=focused?.dataset.cartId,focusAction=active?.dataset.cartAction;
    // Keep existing rows and focus when quantities change; only new rows animate in.
    const existing=new Map([...box.querySelectorAll('[data-cart-id]')].map(el=>[el.dataset.cartId,el]));
    box.querySelector('.cart-empty')?.remove();
    for(const row of quickCart){
      let el=existing.get(row.id);
      if(el)existing.delete(row.id);
      else{
        el=document.createElement('div');el.className='cart-card';el.dataset.cartId=row.id;el.setAttribute('role','listitem');
        el.innerHTML=`<div class="cart-item-copy"><span class="cart-service"></span><b class="cart-offer"></b><small class="cart-unit-cost"></small></div>
          <label class="cart-price"><span>الداخل / شحنة</span><input class="control ltr" data-cart-action="price" type="number" min="0" step="0.01" required inputmode="decimal"></label>
          <div class="cart-stepper"><button type="button" data-cart-action="minus" aria-label="تقليل عدد الشحنات">−</button><output class="cart-quantity" aria-label="عدد الشحنات"></output><button type="button" data-cart-action="plus" aria-label="زيادة عدد الشحنات">+</button></div>
          <div class="cart-line-total"><small>إجمالي الداخل</small><b></b><small>EGP</small></div>
          <button type="button" class="cart-remove" data-cart-action="remove" aria-label="حذف العرض من السلة">×</button>`;
        el.style.setProperty('--service-color',serviceColor(row.item));
        el.querySelector('.cart-service').textContent=row.item;
        el.querySelector('.cart-offer').textContent=row.offer;
        el.querySelector('.cart-unit-cost').textContent=`المصروف / شحنة: ${fmt(row.deducted)} EGP`;
        el.querySelector('input').value=row.paid;
        el.querySelector('input').setAttribute('aria-label',`الداخل لكل شحنة ${row.item} ${row.offer}`);
        box.append(el);
      }
      el.querySelector('.cart-quantity').textContent=row.quantity;
      el.querySelector('.cart-line-total b').textContent=fmt(row.paid*row.quantity);
      el.querySelectorAll('button,input').forEach(control=>control.disabled=quickCartSaving);
      el.querySelector('[data-cart-action="minus"]').disabled=quickCartSaving || row.quantity<=1;
      if(changedId===row.id && !matchMedia('(prefers-reduced-motion: reduce)').matches){
        el.querySelector('.cart-quantity').animate?.([{transform:'scale(1.25)',color:'#fff'},{transform:'scale(1)',color:'#a5b4fc'}],{duration:180});
      }
    }
    existing.forEach(el=>el.remove());
    if(!quickCart.length)box.innerHTML='<div class="cart-empty"><span class="cart-empty-icon" aria-hidden="true">＋</span><b>ابدأ بأول عرض</b><p>اختار من العروض السريعة أو ابحث فوق.<br>كل عرض هيظهر هنا وتقدر تزود عدد شحناته.</p></div>';
    updateCartSummary();
    if(focusId && focusAction && !document.contains(active)){
      const row=[...box.querySelectorAll('[data-cart-id]')].find(el=>el.dataset.cartId===focusId);
      (row?.querySelector(`[data-cart-action="${focusAction}"]`) || box.querySelector('button:not(:disabled)') || $('quickPresetSearch')).focus();
    }
  }

  function setCashierSaving(saving){
    quickCartSaving=saving;
    $$('#view-add .cashier-layout button, #view-add .cashier-layout input').forEach(el=>el.disabled=saving);
    renderQuickCart();
  }

  async function saveQuickTransaction() {
    if(quickCartSaving || !quickCart.length)return;
    if(!$('addDate').reportValidity())return;
    for(const input of $$('#quickCart input'))if(!input.reportValidity())return;
    const date=$('addDate').value, note=$('addNote').value.trim();
    if(quickCart.some(r=>!Number.isSafeInteger(r.quantity)||r.quantity<1||!Number.isFinite(r.paid)||r.paid<0||!Number.isFinite(r.deducted)||r.deducted<0))return toast('راجع الكميات والأسعار في السلة.','error');
    const created=[], usageBefore=new Map(), previousMeta={...state.meta};
    const previousAudit=[...state.audit];
    setCashierSaving(true);
    try{
      for(const row of quickCart){
        for(let i=0;i<row.quantity;i++)created.push(normalizeTransaction({date,item:row.item,offer:row.offer,paid:row.paid,deducted:row.deducted,quantity:1,note,source:'cashier'}));
        const preset=state.presets.find(p=>p.id===row.id);
        if(preset){
          usageBefore.set(preset.id,{usageCount:preset.usageCount,lastUsedAt:preset.lastUsedAt,updatedAt:preset.updatedAt});
          preset.usageCount=num(preset.usageCount)+row.quantity;preset.lastUsedAt=nowIso();preset.updatedAt=nowIso();
        }
      }
      state.transactions=state.transactions.concat(created);
      audit(state,'حفظ سلة العمليات',date,{count:created.length,offers:quickCart.map(r=>({item:r.item,offer:r.offer,quantity:r.quantity}))});
      state.meta.updatedAt=nowIso();state.meta.reason='cashier-batch';
      // One IndexedDB transaction: every shipment commits together or none do.
      await idbSet(STATE_KEY,sanitizeState(state));
    }catch(error){
      const ids=new Set(created.map(t=>t.id));
      state.transactions=state.transactions.filter(t=>!ids.has(t.id));
      usageBefore.forEach((before,id)=>{const p=state.presets.find(p=>p.id===id);if(p)Object.assign(p,before);});
      state.audit=previousAudit;state.meta=previousMeta;
      setCashierSaving(false);
      toast('تعذر الحفظ. السلة محفوظة أمامك؛ جرّب مرة تانية.','error',6000);
      console.error('Cashier batch save failed',error);
      return;
    }
    quickCart=[];bulkPresetSelection.clear();bulkPresetMode=false;
    $('addNote').value='';$('quickPresetSearch').value='';$('presetDropdown').classList.add('hidden');
    setCashierSaving(false);renderAll();renderStorageInfo();
    toast(`تم حفظ ${created.length} شحنة، كل شحنة في صف مستقل في السجل.`,'success',5000);
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

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function median(values){ const a=values.filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length)return 0; const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
  function roundUp5(v){ return Math.ceil(num(v)/5)*5; }
  function presetKey(item,offer){ return `${normalize(item)}||${normalize(offer)}`; }

  function rankPresetSuggestions(message) {
    const amount=num(message?.amount);
    const active=state.presets.filter(p=>p.active!==false);
    if(!active.length||!amount) return [];
    const senderTokens=[message?.sender,message?.name].filter(Boolean).map(normalize).filter(Boolean);
    const senderHistory=new Map();
    if(senderTokens.length){
      state.transactions.filter(t=>!t.archived&&t.source==='wallet').forEach(t=>{
        const note=normalize(t.note||'');
        if(senderTokens.some(token=>token.length>=4&&note.includes(token))){
          const key=presetKey(t.item,t.offer); senderHistory.set(key,(senderHistory.get(key)||0)+1);
        }
      });
    }
    return active.map(p=>{
      const base=num(p.paid),diff=amount-base,absDiff=Math.abs(diff);
      let score=18;
      if(absDiff<.01) score+=72;
      else if(diff>=0&&diff<=15) score+=Math.max(35,62-diff*1.8);
      else if(diff<0&&absDiff<=5) score+=32-absDiff*3;
      else score+=Math.max(0,26-(absDiff/Math.max(amount,1))*100);
      if(base>amount&&absDiff>10) score-=18;
      const historyCount=senderHistory.get(presetKey(p.item,p.offer))||0;
      score+=Math.min(18,historyCount*6);
      score+=Math.min(8,Math.log2(num(p.usageCount)+1)*1.8);
      const confidence=clamp(Math.round(score),5,99);
      let reason='أقرب عرض للمبلغ';
      if(absDiff<.01) reason='مطابق تمامًا للمبلغ المستلم';
      else if(diff>0&&diff<=15) reason=`العميل زود ${fmt(diff,0)} جنيه فوق سعر العرض`;
      else if(diff<0&&absDiff<=5) reason=`التحويل أقل من السعر بـ ${fmt(absDiff,0)} جنيه`;
      else reason=`فرق ${fmt(absDiff)} جنيه عن سعر العرض`;
      if(historyCount) reason+=` · نفس المرسل استخدمه ${historyCount} مرة قبل كده`;
      return {preset:p,confidence,reason,diff,historyCount};
    }).sort((a,b)=>b.confidence-a.confidence||Math.abs(a.diff)-Math.abs(b.diff)).slice(0,3);
  }

  function suggestPreset(amountOrMessage) {
    const message=typeof amountOrMessage==='object'?amountOrMessage:{amount:amountOrMessage};
    return rankPresetSuggestions(message)[0]?.preset||null;
  }

  function analyzeWallet() {
    walletParsed=parseWalletMessages($('walletMessages').value).map(x=>{
      const suggestions=rankPresetSuggestions(x),top=suggestions[0];
      return {...x,suggestions,presetId:top&&top.confidence>=38?top.preset.id:'',confidence:top?.confidence||0,suggestionReason:top?.reason||'لم أجد عرضًا مناسبًا'};
    });
    renderWalletPreview();
    const confident=walletParsed.filter(x=>x.confidence>=75).length;
    toast(walletParsed.length?`تم تحليل ${walletParsed.length} رسالة · ${confident} اقتراح بثقة عالية.`:'لم أجد رسائل قابلة للتحليل.',walletParsed.length?'success':'error');
  }

  function detectAnomalies() {
    const rows=state.transactions.filter(t=>!t.archived);
    const groups=new Map();
    rows.forEach(t=>{const k=presetKey(t.item,t.offer),arr=groups.get(k)||[];arr.push(t);groups.set(k,arr)});
    const groupStats=new Map();
    groups.forEach((arr,k)=>{
      const profits=arr.map(t=>txFinancials(t).profit/qty(t.quantity));
      const paid=arr.map(t=>num(t.paid));
      groupStats.set(k,{count:arr.length,medianProfit:median(profits),medianPaid:median(paid)});
    });
    const duplicateIds=new Set();
    const seenExternalRefs=new Map();
    rows.forEach(t=>{
      const ref=String(t.externalRef||'').trim();
      if(!ref)return;
      if(seenExternalRefs.has(ref)) duplicateIds.add(t.id); else seenExternalRefs.set(ref,t.id);
    });
    const dupGroups=new Map();
    rows.filter(t=>!String(t.externalRef||'').trim()).forEach(t=>{
      // بدون مرجع خارجي لا نعتبر عمليتين متطابقتين مكررتين إلا لو تم تسجيلهما خلال ثوانٍ قليلة جدًا.
      // ده يمنع إن شحنتين حقيقيتين لنفس العرض في نفس اليوم يتعلموا كمكرر بالغلط.
      const sig=[t.date,normalize(t.item),normalize(t.offer),num(t.paid).toFixed(2),num(t.deducted).toFixed(2),qty(t.quantity),normalize(t.note),t.source||''].join('|');
      const arr=dupGroups.get(sig)||[];arr.push(t);dupGroups.set(sig,arr);
    });
    dupGroups.forEach(arr=>{
      if(arr.length<2)return;
      arr.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
      for(let i=1;i<arr.length;i++){
        const prev=new Date(arr[i-1].createdAt).getTime(),cur=new Date(arr[i].createdAt).getTime();
        if(Number.isFinite(prev)&&Number.isFinite(cur)&&Math.abs(cur-prev)<=30*1000) duplicateIds.add(arr[i].id);
      }
    });
    const presetMap=new Map(state.presets.map(p=>[presetKey(p.item,p.offer),p]));
    const sevRank={high:3,medium:2,low:1};
    const anomalies=[];
    rows.forEach(t=>{
      const f=txFinancials(t),reasons=[]; let severity='low';
      const push=(level,text)=>{reasons.push(text);if(sevRank[level]>sevRank[severity])severity=level};
      if(f.profit<0) push('high',`خسارة ${fmt(Math.abs(f.profit))} EGP`);
      else if(f.income>0&&f.profit/f.income<.04) push('medium',`هامش ربح منخفض ${(f.profit/f.income*100).toFixed(1)}%`);
      if(duplicateIds.has(t.id)) push('high','احتمال عملية مكررة خلال 10 دقائق');
      if(qty(t.quantity)>=5) push('medium',`كمية كبيرة: ${qty(t.quantity)}`);
      const p=presetMap.get(presetKey(t.item,t.offer));
      if(p){
        const diff=num(t.paid)-num(p.paid),limit=Math.max(15,num(p.paid)*.2);
        const isExpectedWalletExtra=t.source==='wallet'&&diff>=0&&diff<=15;
        if(!isExpectedWalletExtra&&Math.abs(diff)>limit) push('medium',`الداخل مختلف عن العرض المحفوظ بـ ${fmt(Math.abs(diff))} EGP`);
      }
      const gs=groupStats.get(presetKey(t.item,t.offer));
      if(gs?.count>=5&&gs.medianProfit>0){
        const unitProfit=f.profit/qty(t.quantity),dev=Math.abs(unitProfit-gs.medianProfit);
        if(dev>Math.max(20,Math.abs(gs.medianProfit)*.8)) push('low',`ربح غير معتاد مقارنة بنفس العرض`);
      }
      if(reasons.length) anomalies.push({id:t.id,transaction:t,severity,reasons,score:sevRank[severity]*100+reasons.length});
    });
    return anomalies.sort((a,b)=>b.score-a.score||String(b.transaction.date).localeCompare(String(a.transaction.date)));
  }

  function getSmartPricingSuggestions() {
    const now=new Date(),from=localDateISO(addDays(now,-89));
    const recent=state.transactions.filter(t=>!t.archived&&t.date>=from&&t.date<=todayISO());
    const groups=new Map();
    recent.forEach(t=>{const k=presetKey(t.item,t.offer),arr=groups.get(k)||[];arr.push(t);groups.set(k,arr)});
    const suggestions=[];
    state.presets.filter(p=>p.active!==false).forEach(p=>{
      const arr=groups.get(presetKey(p.item,p.offer))||[];
      if(arr.length<3)return;
      let units=0,income=0,cost=0,profit=0;
      arr.forEach(t=>{const f=txFinancials(t);units+=f.quantity;income+=f.income;cost+=f.cost;profit+=f.profit});
      if(!units)return;
      const avgCost=cost/units;
      // التسعير يعتمد على السعر المحفوظ والتكلفة الفعلية، وليس متوسط المبالغ المستلمة؛
      // لأن العميل أحيانًا يحول مبلغًا زائدًا وده ماينفعش يرفع تقييم السعر تلقائيًا.
      const currentPrice=num(p.paid),avgProfit=currentPrice-avgCost,margin=currentPrice?avgProfit/currentPrice:0;
      const baseCost=Math.max(num(p.deducted),avgCost);
      const desiredProfit=Math.max(10,baseCost*.12);
      let target=roundUp5(baseCost+desiredProfit);
      const highVolume=units>=12;
      if(highVolume&&margin<.18) target=Math.max(target,roundUp5(num(p.paid)+5));
      if(avgCost>num(p.deducted)+3) target=Math.max(target,roundUp5(avgCost+desiredProfit));
      if(target<=num(p.paid)) return;
      const shouldSuggest=margin<.14||avgProfit<desiredProfit*.95||(highVolume&&margin<.18)||avgCost>num(p.deducted)+3;
      if(!shouldSuggest)return;
      const reasons=[];
      if(margin<.14)reasons.push(`هامش الربح ${(margin*100).toFixed(1)}%`);
      if(highVolume)reasons.push(`مبيعات قوية: ${units} وحدة/90 يوم`);
      if(avgCost>num(p.deducted)+3)reasons.push(`متوسط التكلفة الفعلي ${fmt(avgCost)}`);
      if(avgProfit<desiredProfit*.95)reasons.push(`ربح الوحدة ${fmt(avgProfit)} أقل من المستهدف`);
      suggestions.push({preset:p,current:num(p.paid),target,units,margin,avgProfit,avgCost,reasons,priority:(target-num(p.paid))*Math.max(1,units)});
    });
    return suggestions.sort((a,b)=>b.priority-a.priority).slice(0,12);
  }

  function smartSeverityLabel(level){return level==='high'?'عالي':level==='medium'?'متوسط':'ملاحظة'}

  function renderSmartInsights(){
    const anomalies=detectAnomalies(),pricing=getSmartPricingSuggestions();
    if($('smartAnomalyCount')) $('smartAnomalyCount').textContent=String(anomalies.length);
    if($('smartPricingCount')) $('smartPricingCount').textContent=String(pricing.length);
    const high=anomalies.filter(a=>a.severity==='high').length,medium=anomalies.filter(a=>a.severity==='medium').length;
    const totalTx=state.transactions.filter(t=>!t.archived).length;
    const score=totalTx?clamp(Math.round(100-(high*12+medium*5+Math.max(0,anomalies.length-high-medium)*2)),35,100):100;
    if($('smartHealthScore')) $('smartHealthScore').innerHTML=`<strong>${score}</strong><span>سلامة البيانات</span>`;
    if($('smartAnomalies')) $('smartAnomalies').innerHTML=anomalies.length?anomalies.slice(0,5).map(a=>{
      const t=a.transaction;return `<div class="smart-list-item anomaly-${a.severity}"><div class="smart-list-icon">!</div><div class="smart-list-main"><b>${esc(t.item)} — ${esc(t.offer)}</b><span>${esc(a.reasons.join(' · '))}</span><small>${dateLabel(t.date)} · داخل ${fmt(txFinancials(t).income)} · ربح ${fmt(txFinancials(t).profit)}</small></div><div class="smart-list-side"><em>${smartSeverityLabel(a.severity)}</em><button class="mini-btn" data-smart-tx="${t.id}">مراجعة</button></div></div>`
    }).join(''):'<div class="smart-empty"><span>✓</span><b>مفيش عمليات شاذة واضحة</b><small>المراجعة الذكية مش لاقية أخطاء مهمة حاليًا.</small></div>';
    if($('smartPricing')) $('smartPricing').innerHTML=pricing.length?pricing.slice(0,5).map(s=>`<div class="smart-list-item pricing-suggestion"><div class="smart-list-icon">↗</div><div class="smart-list-main"><b>${esc(s.preset.item)} — ${esc(s.preset.offer)}</b><span>${esc(s.reasons.join(' · '))}</span><small>السعر الحالي ${fmt(s.current)} ← المقترح ${fmt(s.target)} EGP</small></div><div class="smart-list-side"><em>${(s.margin*100).toFixed(1)}%</em><button class="mini-btn smart-apply-price" data-smart-price="${s.preset.id}" data-target="${s.target}">تطبيق</button></div></div>`).join(''):'<div class="smart-empty"><span>✓</span><b>التسعير الحالي متوازن</b><small>مفيش عرض محتاج رفع سعر واضح بناءً على آخر 90 يوم.</small></div>';
    $$('[data-smart-tx]').forEach(b=>b.onclick=()=>focusHistoryTransaction(b.dataset.smartTx));
    $$('[data-smart-price]').forEach(b=>b.onclick=()=>applySmartPrice(b.dataset.smartPrice,num(b.dataset.target)));
    if($('openAllAnomaliesBtn')) $('openAllAnomaliesBtn').onclick=()=>{goView('history');$('historyFrom').value='';$('historyTo').value='';$('historySearch').value='';renderHistory();};
  }

  function focusHistoryTransaction(id){
    goView('history'); $('historyFrom').value='';$('historyTo').value='';$('historySearch').value=id; renderHistory();
    setTimeout(()=>$('historyTable')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  }

  async function applySmartPrice(presetId,target){
    const p=state.presets.find(x=>x.id===presetId); if(!p)return;
    const next=roundUp5(target); if(next<=num(p.paid))return toast('السعر المقترح لم يعد أعلى من السعر الحالي.','error');
    if(!confirm(`تغيير سعر ${p.item} — ${p.offer} من ${fmt(p.paid)} إلى ${fmt(next)} EGP؟`))return;
    await createSafetySnapshot('before-smart-price');
    const before=num(p.paid); p.paid=next;p.updatedAt=nowIso();
    audit(state,'تطبيق تسعير ذكي','',{item:p.item,offer:p.offer,before,after:next});
    await saveState('smart-pricing');renderAll();toast(`تم تحديث السعر إلى ${fmt(next)} EGP.`,'success');
  }

  function renderWalletPreview() {
    const wrap=$('walletPreviewWrap'), stats=$('walletImportStats'); if(!walletParsed.length){wrap.classList.add('hidden');stats.classList.add('hidden');return;}
    const existing=new Set(state.transactions.map(t=>t.externalRef).filter(Boolean)); const fresh=walletParsed.filter(x=>!existing.has(x.ref)); const total=walletParsed.reduce((s,x)=>s+x.amount,0);
    const high=walletParsed.filter(x=>x.confidence>=75).length,review=walletParsed.filter(x=>x.confidence<55).length;
    stats.innerHTML=`<span class="stat-chip">الرسائل: <b>${walletParsed.length}</b></span><span class="stat-chip">الجديدة: <b>${fresh.length}</b></span><span class="stat-chip ai-chip">اقتراح قوي: <b>${high}</b></span><span class="stat-chip ${review?'warn-chip':''}">تحتاج مراجعة: <b>${review}</b></span><span class="stat-chip">إجمالي المستلم: <b>${fmt(total)}</b></span>`; stats.classList.remove('hidden'); wrap.classList.remove('hidden');
    $('walletPreviewBody').innerHTML=walletParsed.map((x,i)=>{const p=state.presets.find(z=>z.id===x.presetId);const duplicate=existing.has(x.ref);const profit=p?x.amount-num(p.deducted):0;const level=x.confidence>=75?'high':x.confidence>=55?'medium':'low';const alts=(x.suggestions||[]).slice(1,3).map(s=>`${s.preset.item} ${s.preset.offer}`).join(' · ');return `<tr style="opacity:${duplicate?.55:1}"><td>${esc(dateLabel(x.date))}</td><td>${esc(x.name||x.sender)}</td><td class="money income">${fmt(x.amount)}</td><td><div class="wallet-smart-box"><div class="ai-confidence ${level}"><span>MOX Smart</span><b>${x.confidence}%</b></div><small>${esc(x.suggestionReason||'')}</small>${alts&&x.confidence<75?`<em>بدائل: ${esc(alts)}</em>`:''}</div><select class="control wallet-preset-select" data-i="${i}"><option value="">— بدون ربط —</option>${sortedPresets().map(y=>`<option value="${y.id}" ${y.id===x.presetId?'selected':''}>${esc(y.item)} — ${esc(y.offer)} | ${fmt(y.paid)}</option>`).join('')}</select></td><td class="money cost">${p?fmt(p.deducted):'—'}</td><td class="money profit">${p?fmt(profit):'—'}</td><td>${duplicate?'<span class="pill" style="color:#fda4af;border-color:rgba(251,113,133,.2)">مكرر</span>':x.confidence<55?'<span class="pill review-pill">راجع</span>':'<span class="pill">جديد</span>'}</td></tr>`;}).join('');
    $$('.wallet-preset-select').forEach(s=>s.onchange=()=>{walletParsed[+s.dataset.i].presetId=s.value;renderWalletPreview();});
  }

  async function importWalletRows() {
    const existing=new Set(state.transactions.map(t=>t.externalRef).filter(Boolean)); let added=0,skipped=0;
    const created=[];
    for(const x of walletParsed){
      if(existing.has(x.ref)){skipped++;continue;}
      const p=state.presets.find(z=>z.id===x.presetId); if(!p){skipped++;continue;}
      const t=normalizeTransaction({date:x.date,item:p.item,offer:p.offer,paid:x.amount,deducted:p.deducted,quantity:1,note:[x.name||x.sender,`Ref ${x.ref}`].filter(Boolean).join(' · '),source:'wallet',externalRef:x.ref});
      state.transactions.push(t);created.push(t);existing.add(x.ref);added++;
      p.usageCount=num(p.usageCount)+1;p.lastUsedAt=nowIso();p.updatedAt=nowIso();
    }
    if(added){audit(state,'استيراد محفظة','',{count:added,refs:created.map(t=>t.externalRef)});await saveState('wallet-import-batch');}
    renderAll(); renderWalletPreview(); toast(`تمت إضافة ${added} عملية${skipped?`، وتخطي ${skipped}`:''}.`,added?'success':'error');
  }

  function historyFiltered() {
    const from=$('historyFrom').value,to=$('historyTo').value,q=normalize($('historySearch').value),show=$('showArchived').checked;
    let arr=state.transactions.filter(t=>(show||!t.archived)&&(!from||t.date>=from)&&(!to||t.date<=to));
    if(q)arr=arr.filter(t=>normalize(`${t.id} ${t.date} ${t.item} ${t.offer} ${t.note} ${t.paid} ${t.deducted}`).includes(q));
    const key=historySort.key, dir=historySort.dir==='asc'?1:-1;
    arr.sort((a,b)=>{let av,bv;if(key==='profit'){av=txFinancials(a).profit;bv=txFinancials(b).profit}else{av=a[key];bv=b[key]} if(typeof av==='number'||typeof bv==='number')return(num(av)-num(bv))*dir;return String(av??'').localeCompare(String(bv??''),'ar',{numeric:true})*dir;}); return arr;
  }

  function cleanHistorySelection(){
    const live=new Set(state.transactions.map(t=>t.id));
    [...historySelected].forEach(id=>{if(!live.has(id))historySelected.delete(id)});
  }

  function setHistorySelectionMode(force){
    historySelectionMode=typeof force==='boolean'?force:!historySelectionMode;
    if(!historySelectionMode) historySelected.clear();
    historyPage=1;
    renderHistory();
  }

  function setHistorySelection(ids,checked=true){
    ids.forEach(id=>checked?historySelected.add(id):historySelected.delete(id));
    renderHistory();
  }

  function renderHistoryBulkBar(filtered){
    const bar=$('historyBulkBar'); if(!bar)return;
    cleanHistorySelection();
    const count=historySelected.size;
    bar.classList.toggle('hidden',!historySelectionMode);
    $('historyBulkCount').textContent=`${count} عملية محددة`;
    $('historyBulkHint').textContent=count?`جاهز لتغيير تاريخ ${count} عملية دفعة واحدة.`:`حدد من الجدول أو استخدم «تحديد نتائج الفلتر».`;
    if(!$('historyBulkDate').value) $('historyBulkDate').value=todayISO();
    $('historyApplyDateBtn').disabled=!count;
    $('historySelectFilteredBtn').textContent=`تحديد نتائج الفلتر (${filtered.length})`;
    const selectable=state.transactions.filter(t=>$('showArchived').checked||!t.archived).length;
    $('historySelectAllBtn').textContent=`تحديد كل السجل (${selectable})`;
  }

  function renderHistoryPagination(total){
    const pages=Math.max(1,Math.ceil(total/HISTORY_PAGE_SIZE));
    historyPage=Math.min(Math.max(1,historyPage),pages);
    const box=$('historyPagination'); if(!box)return;
    if(total<=HISTORY_PAGE_SIZE){box.innerHTML='';return;}
    box.innerHTML=`<button type="button" class="mini-btn" id="historyPrevPage" ${historyPage<=1?'disabled':''}>السابق</button><span>صفحة <b>${historyPage}</b> من ${pages}</span><button type="button" class="mini-btn" id="historyNextPage" ${historyPage>=pages?'disabled':''}>التالي</button>`;
    if($('historyPrevPage'))$('historyPrevPage').onclick=()=>{historyPage=Math.max(1,historyPage-1);renderHistory();};
    if($('historyNextPage'))$('historyNextPage').onclick=()=>{historyPage=Math.min(pages,historyPage+1);renderHistory();};
  }

  function renderHistory() {
    cleanHistorySelection();
    const all=historyFiltered();
    const pages=Math.max(1,Math.ceil(all.length/HISTORY_PAGE_SIZE));
    historyPage=Math.min(historyPage,pages);
    const start=(historyPage-1)*HISTORY_PAGE_SIZE;
    const arr=all.slice(start,start+HISTORY_PAGE_SIZE);
    const table=$('historyTable');
    table.classList.toggle('history-selecting',historySelectionMode);
    $('historyBody').innerHTML=arr.length?arr.map(t=>{const f=txFinancials(t),selected=historySelected.has(t.id);return `<tr class="${selected?'history-row-selected':''}" style="opacity:${t.archived?.52:1}"><td class="history-select-col"><input class="history-check history-row-check" type="checkbox" data-history-select="${t.id}" ${selected?'checked':''} aria-label="تحديد ${esc(t.item)} ${esc(t.offer)}"></td><td>${esc(dateLabel(t.date))}</td><td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${serviceColor(t.item)};margin-left:6px"></span>${esc(t.item)}</td><td>${esc(t.offer)}</td><td class="money">${t.quantity}</td><td class="money income">${fmt(t.paid)}</td><td class="money cost">${fmt(t.deducted)}</td><td class="money profit">${fmt(f.profit)}</td><td class="note-cell" title="${esc(t.note)}">${esc(t.note||'—')}</td><td><div class="row-actions"><button class="mini-btn" data-edit="${t.id}">تعديل</button><button class="mini-btn ${t.archived?'':'danger'}" data-archive="${t.id}">${t.archived?'استرجاع':'أرشفة'}</button><button class="mini-btn delete-btn" data-delete="${t.id}">حذف</button></div></td></tr>`;}).join(''):'<tr><td colspan="10"><div class="empty-state">لا توجد نتائج.</div></td></tr>';
    const totals=all.reduce((o,t)=>{const f=txFinancials(t);o.in+=f.income;o.cost+=f.cost;o.profit+=f.profit;o.q+=f.quantity;return o},{in:0,cost:0,profit:0,q:0});
    $('historyCount').textContent=`${totals.q} عملية${all.length!==arr.length?` · عرض ${start+1}-${Math.min(start+arr.length,all.length)} من ${all.length}`:''}`;
    $('historyTotals').textContent=`دخل ${fmt(totals.in)} · ربح ${fmt(totals.profit)} EGP`;
    $$('[data-edit]').forEach(b=>b.onclick=()=>openEditTransaction(b.dataset.edit));
    $$('[data-archive]').forEach(b=>b.onclick=()=>toggleArchiveTransaction(b.dataset.archive));
    $$('[data-delete]').forEach(b=>b.onclick=()=>deleteTransaction(b.dataset.delete));
    $$('[data-history-select]').forEach(ch=>ch.onchange=()=>{if(ch.checked)historySelected.add(ch.dataset.historySelect);else historySelected.delete(ch.dataset.historySelect);renderHistory();});
    const pageBox=$('historySelectPageCheckbox');
    if(pageBox){const pageIds=arr.map(t=>t.id);const selectedOnPage=pageIds.filter(id=>historySelected.has(id)).length;pageBox.checked=pageIds.length>0&&selectedOnPage===pageIds.length;pageBox.indeterminate=selectedOnPage>0&&selectedOnPage<pageIds.length;pageBox.disabled=!historySelectionMode||!pageIds.length;}
    const modeBtn=$('historySelectModeBtn');if(modeBtn){modeBtn.textContent=historySelectionMode?'✕ إنهاء التحديد':'☑ تحديد';modeBtn.classList.toggle('active-selection',historySelectionMode);}
    $$('#historyTable th[data-sort]').forEach(th=>{th.classList.toggle('sort-asc',historySort.key===th.dataset.sort&&historySort.dir==='asc');th.classList.toggle('sort-desc',historySort.key===th.dataset.sort&&historySort.dir==='desc');});
    renderHistoryBulkBar(all); renderHistoryPagination(all.length);
  }

  async function applyBulkHistoryDate(){
    cleanHistorySelection();
    const target=$('historyBulkDate').value;
    const selected=state.transactions.filter(t=>historySelected.has(t.id));
    if(!selected.length)return toast('حدد عملية واحدة على الأقل.','error');
    if(!target)return toast('اختار التاريخ الجديد.','error');
    const changed=selected.filter(t=>t.date!==target);
    if(!changed.length)return toast('كل العمليات المحددة بالفعل على نفس التاريخ.','error');
    if(!confirm(`تغيير تاريخ ${changed.length} عملية إلى ${dateLabel(target)}؟

سيتم أخذ نسخة أمان ويمكنك التراجع بعد التنفيذ.`))return;
    await createSafetySnapshot('before-bulk-history-date');
    const before=changed.map(t=>({id:t.id,date:t.date,updatedAt:t.updatedAt}));
    changed.forEach(t=>{t.date=target;t.updatedAt=nowIso();});
    audit(state,'تغيير تاريخ مجموعة عمليات',target,{count:changed.length,ids:changed.map(t=>t.id),previousDates:[...new Set(before.map(x=>x.date))]});
    await saveState('bulk-history-date');
    historySelected.clear(); historySelectionMode=false; historyPage=1; renderAll();
    toast(`تم تغيير تاريخ ${changed.length} عملية إلى ${dateLabel(target)}.`,'success',6200,async()=>{
      before.forEach(old=>{const t=state.transactions.find(x=>x.id===old.id);if(t){t.date=old.date;t.updatedAt=old.updatedAt;}});
      audit(state,'تراجع عن تغيير تاريخ مجموعة','',{count:before.length});
      await saveState('undo-bulk-history-date'); renderAll();
    });
  }

  function setHistoryRange(range) {
    const now=new Date(); if(range==='today'){$('historyFrom').value=todayISO();$('historyTo').value=todayISO();} else if(range==='month'){$('historyFrom').value=localDateISO(startOfMonth(now));$('historyTo').value=localDateISO(endOfMonth(now));} else {$('historyFrom').value='';$('historyTo').value='';} historyPage=1; renderHistory();
  }

  function openEditTransaction(id) {
    const t=state.transactions.find(x=>x.id===id);if(!t)return;$('editTxId').value=t.id;$('editTxDate').value=t.date;$('editTxQty').value=t.quantity;$('editTxItem').value=t.item;$('editTxOffer').value=t.offer;$('editTxPaid').value=t.paid;$('editTxCost').value=t.deducted;$('editTxNote').value=t.note;setDialogError('editTransactionDialog','');$('editTransactionDialog').showModal();
  }
  async function saveEditTransaction(e) {
    e.preventDefault(); const id=$('editTxId').value,t=state.transactions.find(x=>x.id===id);if(!t)return;
    const item=$('editTxItem').value.trim(),offer=$('editTxOffer').value.trim(),date=$('editTxDate').value;
    const paid=Number($('editTxPaid').value),deducted=Number($('editTxCost').value),quantity=Number($('editTxQty').value);
    if(!date)return setDialogError('editTransactionDialog','اختار تاريخ العملية.','editTxDate');
    if(!item)return setDialogError('editTransactionDialog','اكتب المنتج / الخدمة.','editTxItem');
    if(!offer)return setDialogError('editTransactionDialog','اكتب العرض.','editTxOffer');
    if(!Number.isFinite(quantity)||quantity<1)return setDialogError('editTransactionDialog','الكمية لازم تكون 1 أو أكثر.','editTxQty');
    if(!Number.isFinite(paid)||paid<0)return setDialogError('editTransactionDialog','قيمة الداخل غير صحيحة.','editTxPaid');
    if(!Number.isFinite(deducted)||deducted<0)return setDialogError('editTransactionDialog','قيمة المصروف غير صحيحة.','editTxCost');
    setDialogError('editTransactionDialog',''); const before={...t};
    Object.assign(t,{date,quantity:qty(quantity),item,offer,paid,deducted,note:$('editTxNote').value.trim(),updatedAt:nowIso()}); audit(state,'تعديل عملية',t.date,{before,after:t}); await saveState('edit-transaction'); closeDialog('editTransactionDialog'); renderAll(); toast('تم حفظ التعديل.');
  }

  async function toggleArchiveTransaction(id) { const t=state.transactions.find(x=>x.id===id);if(!t)return;t.archived=!t.archived;t.updatedAt=nowIso();audit(state,t.archived?'أرشفة عملية':'استرجاع عملية',t.date,{id});await saveState('archive');renderAll();toast(t.archived?'تمت الأرشفة ويمكن استرجاعها.':'تم استرجاع العملية.'); }


  async function deleteTransaction(id) {
    const index=state.transactions.findIndex(x=>x.id===id);
    if(index<0) return;
    const t=state.transactions[index];
    historySelected.delete(id);
    const label=`${t.item || 'عملية'} — ${t.offer || ''}`.trim();
    if(!confirm(`حذف ${label} نهائيًا من السجل؟

سيتم أخذ نسخة أمان قبل الحذف.`)) return;
    await createSafetySnapshot('before-delete-transaction');
    const removed={...t};
    state.transactions.splice(index,1);
    audit(state,'حذف عملية',t.date,{id:t.id,item:t.item,offer:t.offer,paid:t.paid,deducted:t.deducted,quantity:t.quantity});
    await saveState('delete-transaction');
    renderAll();
    toast('تم حذف العملية من السجل.','success',5200,async()=>{
      state.transactions.splice(Math.min(index,state.transactions.length),0,removed);
      audit(state,'تراجع عن حذف عملية',removed.date,{id:removed.id,item:removed.item,offer:removed.offer});
      await saveState('undo-delete-transaction');
      renderAll();
    });
  }

  function reportRangeQuick(range) {
    const now=new Date(); let f='',t='';
    if(range==='today')f=t=todayISO();
    if(range==='yesterday')f=t=localDateISO(addDays(now,-1));
    if(range==='last7'){f=localDateISO(addDays(now,-6));t=todayISO();}
    if(range==='month'){f=localDateISO(startOfMonth(now));t=localDateISO(endOfMonth(now));}
    if(range==='prevMonth'){const p=new Date(now.getFullYear(),now.getMonth()-1,1);f=localDateISO(startOfMonth(p));t=localDateISO(endOfMonth(p));}
    if(range==='year'){f=`${now.getFullYear()}-01-01`;t=todayISO();}
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
    const from=$('reportFrom').value,to=$('reportTo').value,s=statsForRange(from,to); const profitBeforeFixed=s.income-s.cost-s.variable; $('reportIncome').textContent=fmt(s.income);$('reportCost').textContent=fmt(s.cost);$('reportVariable').textContent=fmt(s.variable);$('reportFixed').textContent=fmt(s.fixed);$('reportProfitBeforeFixed').textContent=fmt(profitBeforeFixed);$('reportProfit').textContent=fmt(s.profit); renderRevenueChart('reportChart',7,from,to); renderTopServices(s.rows);
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

  function renderSettings(){renderPresetManager();renderExpenses();renderStorageInfo();}
  function renderPresetManager(){const q=normalize($('presetManageSearch')?.value||''),svc=$('presetServiceFilter')?.value||'';const services=[...new Set(state.presets.map(p=>p.item).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));if($('presetServiceFilter')){$('presetServiceFilter').innerHTML='<option value="">كل الخدمات</option>'+services.map(s=>`<option ${s===svc?'selected':''}>${esc(s)}</option>`).join('')}
    const arr=state.presets.filter(p=>(!svc||p.item===svc)&&(!q||normalize(`${p.item} ${p.offer} ${p.paid}`).includes(q)));$('presetManageGrid').innerHTML=arr.length?arr.map(p=>`<div class="preset-manage-card" style="--service-color:${serviceColor(p.item)}"><h4>${esc(p.item)} — ${esc(p.offer)}</h4><p>استخدم ${p.usageCount||0} مرة</p><div class="preset-manage-meta"><span>الداخل<b>${fmt(p.paid)}</b></span><span>المصروف<b>${fmt(p.deducted)}</b></span><span>الربح<b>${fmt(p.paid-p.deducted)}</b></span></div><div class="preset-manage-actions"><button class="mini-btn" data-pedit="${p.id}">تعديل</button><button class="mini-btn danger" data-pdelete="${p.id}">حذف</button></div></div>`).join(''):'<div class="empty-state">لا توجد عروض مطابقة.</div>';
    $$('[data-pedit]').forEach(b=>b.onclick=()=>openPresetDialog(b.dataset.pedit));$$('[data-pdelete]').forEach(b=>b.onclick=()=>deletePreset(b.dataset.pdelete));}

  function openPresetDialog(id=''){const p=state.presets.find(x=>x.id===id);$('presetId').value=p?.id||'';$('presetDialogTitle').textContent=p?'تعديل العرض':'عرض جديد';$('presetItem').value=p?.item||'';$('presetOffer').value=p?.offer||'';$('presetPaid').value=p?.paid??'';$('presetCost').value=p?.deducted??'';$('presetColor').value=p?serviceColor(p.item):COLORS[state.presets.length%COLORS.length];setDialogError('presetDialog','');$('presetDialog').showModal();setTimeout(()=>$('presetItem').focus(),30);}
  async function savePreset(e){
    e.preventDefault(); const item=$('presetItem').value.trim(),offer=$('presetOffer').value.trim();
    const paidRaw=$('presetPaid').value,costRaw=$('presetCost').value,paid=Number(paidRaw),deducted=Number(costRaw);
    if(!item) return setDialogError('presetDialog','اكتب اسم المنتج / الخدمة.','presetItem');
    if(!offer) return setDialogError('presetDialog','اكتب العرض.','presetOffer');
    if(!Number.isFinite(paid)||paid<0) return setDialogError('presetDialog','اكتب قيمة الداخل بشكل صحيح.','presetPaid');
    if(!Number.isFinite(deducted)||deducted<0) return setDialogError('presetDialog','اكتب قيمة المصروف بشكل صحيح.','presetCost');
    setDialogError('presetDialog','');
    const id=$('presetId').value,p=state.presets.find(x=>x.id===id);const data={item,offer,paid,deducted,updatedAt:nowIso()};
    if(p)Object.assign(p,data);else state.presets.push(normalizePreset({...data,id:uid('preset')}));
    state.settings.serviceColors[item]=$('presetColor').value;audit(state,p?'تعديل عرض':'إضافة عرض','',`${item} — ${offer}`);await saveState('preset');closeDialog('presetDialog');renderAll();toast('تم حفظ العرض.');
  }
  async function deletePreset(id){const p=state.presets.find(x=>x.id===id);if(!p)return;if(!confirm(`حذف العرض ${p.item} — ${p.offer}؟`))return;await createSafetySnapshot('before-delete-preset');state.presets=state.presets.filter(x=>x.id!==id);audit(state,'حذف عرض','',`${p.item} — ${p.offer}`);await saveState('delete-preset');renderAll();toast('تم حذف العرض.');}

  function renderExpenses(){const fx=[...state.fixedExpenses].sort((a,b)=>a.startDate.localeCompare(b.startDate));$('fixedExpenseList').innerHTML=fx.length?fx.map(e=>`<div class="simple-item"><span class="simple-icon">↻</span><span class="simple-main"><b>${esc(e.name)}</b><span>${e.recurrence==='monthly'?'شهري':e.recurrence==='yearly'?'سنوي':'مرة واحدة'} · من ${dateLabel(e.startDate)}${e.note?` · ${esc(e.note)}`:''}</span></span><span><b class="simple-value">${fmt(e.amount)}</b><br><button class="mini-btn" data-fxedit="${e.id}">تعديل</button> <button class="mini-btn danger" data-fxdel="${e.id}">حذف</button></span></div>`).join(''):'<div class="empty-state">لا توجد مصاريف ثابتة.</div>';
    const vx=[...state.variableExpenses].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);$('variableExpenseList').innerHTML=vx.length?vx.map(e=>`<div class="simple-item"><span class="simple-icon">−</span><span class="simple-main"><b>${esc(e.name)}</b><span>${dateLabel(e.date)}${e.note?` · ${esc(e.note)}`:''}</span></span><span><b class="simple-value">${fmt(e.amount)}</b><br><button class="mini-btn" data-vxedit="${e.id}">تعديل</button> <button class="mini-btn danger" data-vxdel="${e.id}">حذف</button></span></div>`).join(''):'<div class="empty-state">لا توجد مصاريف يومية.</div>';
    $$('[data-fxedit]').forEach(b=>b.onclick=()=>openExpenseDialog('fixed',b.dataset.fxedit));$$('[data-vxedit]').forEach(b=>b.onclick=()=>openExpenseDialog('variable',b.dataset.vxedit));$$('[data-fxdel]').forEach(b=>b.onclick=()=>deleteExpense('fixed',b.dataset.fxdel));$$('[data-vxdel]').forEach(b=>b.onclick=()=>deleteExpense('variable',b.dataset.vxdel));}

  function openExpenseDialog(type,id=''){
    const arr=type==='fixed'?state.fixedExpenses:state.variableExpenses,e=arr.find(x=>x.id===id);
    $('expenseType').value=type;$('expenseId').value=e?.id||'';
    $('expenseDialogTitle').textContent=type==='fixed'?(e?'تعديل مصروف ثابت':'مصروف ثابت جديد'):(e?'تعديل مصروف يومي':'مصروف يومي جديد');
    $('expenseName').value=e?.name||'';$('expenseAmount').value=e?.amount??'';
    const earliestTx=state.transactions.map(t=>t.date).filter(Boolean).sort()[0]; const defaultFixed=earliestTx?`${earliestTx.slice(0,7)}-01`:todayISO(); $('expenseDate').value=(type==='fixed'?e?.startDate:e?.date)||(type==='fixed'?defaultFixed:todayISO());
    $('expenseRecurrence').value=e?.recurrence||'monthly';$('expenseNote').value=e?.note||'';
    $('recurrenceField').classList.toggle('hidden',type!=='fixed');
    setDialogError('expenseDialog','');
    $('expenseDialog').showModal();
    setTimeout(()=>$('expenseName').focus(),30);
  }

  async function saveExpense(e){
    e?.preventDefault?.();
    const type=$('expenseType').value,id=$('expenseId').value,name=$('expenseName').value.trim();
    const rawAmount=$('expenseAmount').value,amount=Number(rawAmount),date=$('expenseDate').value,note=$('expenseNote').value.trim();
    if(!name) return setDialogError('expenseDialog','اكتب اسم المصروف.','expenseName');
    if(!Number.isFinite(amount)||amount<=0) return setDialogError('expenseDialog','اكتب قيمة مصروف صحيحة أكبر من صفر.','expenseAmount');
    if(!date) return setDialogError('expenseDialog','اختار تاريخ المصروف.','expenseDate');
    setDialogError('expenseDialog','');
    try{
      const arr=type==='fixed'?state.fixedExpenses:state.variableExpenses,old=arr.find(x=>x.id===id);
      if(type==='fixed'){
        const data=normalizeFixedExpense({id:id||uid('fx'),name,amount,startDate:date,recurrence:$('expenseRecurrence').value,note,createdAt:old?.createdAt||nowIso()});
        if(old)Object.assign(old,data);else arr.push(data);
      }else{
        const data=normalizeVariableExpense({id:id||uid('vx'),name,amount,date,note,createdAt:old?.createdAt||nowIso()});
        if(old)Object.assign(old,data);else arr.push(data);
      }
      audit(state,old?'تعديل مصروف':'إضافة مصروف',date,{name,amount,type});
      await saveState('expense'); closeDialog('expenseDialog'); renderAll(); toast('تم حفظ المصروف.');
    }catch(err){
      console.error(err); setDialogError('expenseDialog','حصل خطأ أثناء الحفظ. جرّب مرة تانية.');
    }
  }

  async function deleteExpense(type,id){const arr=type==='fixed'?state.fixedExpenses:state.variableExpenses,e=arr.find(x=>x.id===id);if(!e)return;if(!confirm(`حذف ${e.name}؟`))return;await createSafetySnapshot('before-delete-expense');if(type==='fixed')state.fixedExpenses=arr.filter(x=>x.id!==id);else state.variableExpenses=arr.filter(x=>x.id!==id);audit(state,'حذف مصروف',type==='fixed'?e.startDate:e.date,{name:e.name,amount:e.amount,type});await saveState('delete-expense');renderAll();toast('تم حذف المصروف.');}

  async function downloadBackup(){const backup={app:APP_NAME,format:'mox-v2-clean-backup',version:2,exportedAt:nowIso(),state:cleanBackupState()};downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),`MOX-V2-backup-${todayISO()}.json`);toast('تم تنزيل النسخة الاحتياطية.');}
  async function restoreBackup(file){
    try{
      const text=await file.text(),b=JSON.parse(text),raw=b?.state||b;
      const valid=raw&&typeof raw==='object'&&(Array.isArray(raw.transactions)||Array.isArray(raw.rows))&&Array.isArray(raw.presets);
      if(!valid)throw new Error('invalid-backup-structure');
      const incoming=sanitizeState(raw);
      if(!confirm(`استرجاع النسخة سيستبدل البيانات الحالية.

النسخة تحتوي على ${incoming.transactions.length} عملية و${incoming.presets.length} عرض. متابعة؟`))return;
      await createSafetySnapshot('before-file-restore');state=incoming;await saveState('restore-file');renderAll();toast('تم استرجاع النسخة.');
    }catch(e){console.error(e);toast('ملف النسخة غير صالح أو لا يخص MOX-V2.','error')}
  }
  async function clearTransactions(){if(!state.transactions.length)return toast('لا توجد عمليات لمسحها.','error');const word=prompt('للتأكيد اكتب: مسح');if(word!=='مسح')return;await createSafetySnapshot('before-clear-transactions');state.transactions=[];audit(state,'مسح كل العمليات','','');await saveState('clear-transactions');renderAll();toast('تم مسح العمليات ويمكن الرجوع لنسخة الأمان.');}
  async function renderStorageInfo(){if(!$('storageInfo'))return;const estimate=await navigator.storage?.estimate?.();const size=new Blob([JSON.stringify(cleanBackupState())]).size;$('storageInfo').textContent=`حجم بيانات MOX-V2 التقريبي: ${(size/1024).toFixed(1)} KB${estimate?.quota?` · مساحة المتصفح المتاحة ${(estimate.quota/1024/1024).toFixed(0)} MB`:''} · العمليات ${state.transactions.length} · العروض ${state.presets.length}`;}


  function renderAll(){renderToday();renderAdd();renderHistory();renderReports();renderSettings();}

  function bindEvents(){
    $$('.nav-item,.mobile-nav button').forEach(b=>b.onclick=()=>goView(b.dataset.view)); $$('[data-go]').forEach(b=>b.onclick=()=>{goView(b.dataset.go);if(b.dataset.settingsTab)setSettingsTab(b.dataset.settingsTab)});
    $('globalAddBtn').onclick=()=>goView('add');
    $$('[data-dialog-close]').forEach(b=>b.onclick=()=>closeDialog(b.dataset.dialogClose));
    $('quickPresetSearch').oninput=renderPresetSearch; $('quickPresetSearch').onfocus=renderPresetSearch;
    if($('quickServicePickerBtn')) $('quickServicePickerBtn').onclick=(e)=>{e.stopPropagation();toggleQuickServiceMenu()};
    document.addEventListener('click',e=>{
      if(!e.target.closest('.search-control')&&!e.target.closest('#presetDropdown')) $('presetDropdown').classList.add('hidden');
      if(!e.target.closest('.quick-service-filter')) closeQuickServiceMenu();
    });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeQuickServiceMenu(); });
    $('saveQuickTransaction').onclick=saveQuickTransaction;
    $('clearQuickCart').onclick=()=>{
      if(quickCartSaving || !quickCart.length)return;
      if(!confirm('تفريغ كل العروض من السلة؟ العمليات المحفوظة في السجل لن تتأثر.'))return;
      quickCart=[];renderQuickCart();syncOfferCartCounts();
    };
    $('quickCart').onclick=e=>{
      const button=e.target.closest('button[data-cart-action]');if(!button)return;
      const id=button.closest('[data-cart-id]').dataset.cartId;
      if(button.dataset.cartAction==='remove')removeCartItem(id);
      else changeCartQty(id,button.dataset.cartAction==='plus'?1:-1);
    };
    $('quickCart').oninput=e=>{
      if(quickCartSaving || e.target.dataset.cartAction!=='price')return;
      const row=quickCart.find(r=>r.id===e.target.closest('[data-cart-id]').dataset.cartId);
      if(!row)return;
      row.paid=e.target.valueAsNumber;
      e.target.closest('[data-cart-id]').querySelector('.cart-line-total b').textContent=fmt(row.paid*row.quantity);
      updateCartSummary();
    };
    document.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.repeat&&$('view-add').classList.contains('active')&&!document.querySelector('dialog[open]')){e.preventDefault();saveQuickTransaction();}
    });
    $('saveManualBtn').onclick=saveManual;
    $('pasteWalletBtn').onclick=async()=>{try{$('walletMessages').value=await navigator.clipboard.readText();analyzeWallet()}catch{toast('المتصفح منع القراءة التلقائية. الصق يدويًا داخل المربع.','error')}}; $('analyzeWalletBtn').onclick=analyzeWallet; $('importWalletRowsBtn').onclick=importWalletRows;
    const rerenderHistoryFromFilter=()=>{historyPage=1;renderHistory();};
    $('historySearch').oninput=rerenderHistoryFromFilter; $('historyFrom').onchange=rerenderHistoryFromFilter; $('historyTo').onchange=rerenderHistoryFromFilter; $('showArchived').onchange=rerenderHistoryFromFilter;
    $$('.range-btn').forEach(b=>b.onclick=()=>setHistoryRange(b.dataset.range));
    $('historyTable').querySelectorAll('th[data-sort]').forEach(th=>th.onclick=()=>{historySort={key:th.dataset.sort,dir:historySort.key===th.dataset.sort&&historySort.dir==='desc'?'asc':'desc'};historyPage=1;renderHistory()});
    $('historyExportBtn').onclick=()=>exportExcel($('historyFrom').value,$('historyTo').value); $('editTransactionForm').onsubmit=saveEditTransaction;
    $('historySelectModeBtn').onclick=()=>setHistorySelectionMode();
    $('historySelectPageCheckbox').onchange=e=>{const page=historyFiltered().slice((historyPage-1)*HISTORY_PAGE_SIZE,historyPage*HISTORY_PAGE_SIZE);setHistorySelection(page.map(t=>t.id),e.target.checked);};
    $('historySelectFilteredBtn').onclick=()=>{historySelectionMode=true;setHistorySelection(historyFiltered().map(t=>t.id),true);};
    $('historySelectAllBtn').onclick=()=>{historySelectionMode=true;const show=$('showArchived').checked;setHistorySelection(state.transactions.filter(t=>show||!t.archived).map(t=>t.id),true);};
    $('historyClearSelectionBtn').onclick=()=>{historySelected.clear();renderHistory();};
    $('historyApplyDateBtn').onclick=applyBulkHistoryDate;
    $('reportFrom').onchange=renderReports; $('reportTo').onchange=renderReports; $('exportExcelBtn').onclick=()=>exportExcel();
    $$('.settings-tab').forEach(b=>b.onclick=()=>setSettingsTab(b.dataset.tab)); $('newPresetBtn').onclick=()=>openPresetDialog(); $('presetManageSearch').oninput=renderPresetManager; $('presetServiceFilter').onchange=renderPresetManager; $('presetForm').onsubmit=savePreset;
    $('newFixedExpenseBtn').onclick=()=>openExpenseDialog('fixed'); $('newVariableExpenseBtn').onclick=()=>openExpenseDialog('variable'); $('expenseForm').onsubmit=saveExpense;
    if($('bulkPresetModeBtn')) $('bulkPresetModeBtn').onclick=()=>toggleBulkPresetMode();
    $('backupBtn').onclick=downloadBackup; $('restoreBtn').onclick=()=>$('restoreFile').click(); $('restoreFile').onchange=e=>{if(e.target.files[0])restoreBackup(e.target.files[0]);e.target.value=''}; $('safetyRestoreBtn').onclick=restoreLatestSafety; $('clearDataBtn').onclick=clearTransactions; $$('[data-action="backup"]').forEach(b=>b.onclick=downloadBackup); $$('[data-action="wallet-import"]').forEach(b=>b.onclick=()=>{goView('add');setTimeout(()=>$('walletImportPanel').scrollIntoView({behavior:'smooth'}),100)});
  }

  async function init(){
    document.title=APP_NAME; $('todayPill').textContent=new Date().toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'}); $('addDate').value=todayISO(); $('manualDate').value=todayISO();
    await openDB(); await loadState();
    const fixedRepairWasDone=Boolean(state.settings.fixedExpenseHistoryRepaired); const repairedFixed=repairLegacyFixedExpenseStartDates(); if(!fixedRepairWasDone || repairedFixed) await idbSet(STATE_KEY,sanitizeState(state));
    bindEvents(); renderAll(); renderReportRangeButtons(); reportRangeQuick('month');
    goView(state.settings.lastView||'today');
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }

  document.addEventListener('DOMContentLoaded',init);
})();

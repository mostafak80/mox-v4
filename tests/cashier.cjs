// Run: npm install --no-save playwright; npx playwright install chromium; node tests/cashier.cjs
// Starts a local test server and uses an isolated browser profile with sample data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const outputDir=require('node:path').resolve(process.env.TEST_OUTPUT_DIR || 'test-results');
require('node:fs').mkdirSync(outputDir,{recursive:true});
(async () => {
  const portable=process.env.PORTABLE_CHROMIUM ? require(process.env.PORTABLE_CHROMIUM).default : null;
  const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
  const server=http.createServer((req,res)=>{
    const name=decodeURIComponent(req.url.split('?')[0]);
    const file=path.join(__dirname,'..',name==='/'?'index.html':name);
    const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json'};
    try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
  });
  await new Promise(r=>server.listen(8765,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || (portable?await portable.executablePath():undefined),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote']});
  const context=await browser.newContext({viewport:{width:1440,height:1080},serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8765')?r.continue():r.abort());
  await page.addInitScript(()=>{
    localStorage.setItem('profit_calculator_presets_v7',JSON.stringify([
      {id:'p120',item:'PUBG Mobile',offer:'120 شدة',paid:100,deducted:80},
      {id:'p325',item:'PUBG Mobile',offer:'325 شدة',paid:250,deducted:200},
      {id:'p60',item:'PUBG Mobile',offer:'60 شدة',paid:50,deducted:40},
      {id:'netflix',item:'Netflix',offer:'اشتراك شهر',paid:150,deducted:100},
      {id:"quote'\"<>id",item:'Test <script>',offer:'عرض آمن',paid:1,deducted:0}
    ]));
  });
  await page.goto('http://127.0.0.1:8765');
  await page.locator('#globalAddBtn').click();
  await page.waitForSelector('#recentPresets [data-preset-id]');
  assert.equal(await page.locator('#saveQuickTransaction').isDisabled(),true);
  const offer=id=>page.locator(`#recentPresets [data-preset-id="${id}"]`);
  const row=id=>page.locator(`#quickCart [data-cart-id="${id}"]`);
  await offer('p120').click();
  for(let i=0;i<4;i++)await row('p120').locator('[data-cart-action="plus"]').click();
  await offer('p325').click();await offer('p60').click();
  assert.equal(await row('p120').locator('.cart-quantity').textContent(),'5');
  assert.equal(await page.locator('#addIncomePreview').textContent(),'800.00');
  assert.equal(await page.locator('#addCostPreview').textContent(),'640.00');
  assert.equal(await page.locator('#addProfitPreview').textContent(),'160.00');
  await row('p60').locator('[data-cart-action="plus"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await row('p60').locator('.cart-quantity').textContent(),'2');
  await row('p60').locator('[data-cart-action="minus"]').click();
  assert.equal(await row('p60').locator('[data-cart-action="minus"]').isDisabled(),true);
  await page.locator('#addDate').fill('2026-09-20');await page.locator('#addNote').fill('دفعة اختبار');
  await page.screenshot({path:require('node:path').join(outputDir,'cashier-desktop.png'),fullPage:true});
  const readState=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('mox-v2-db',1);r.onsuccess=()=>{const d=r.result;const q=d.transaction('kv').objectStore('kv').get('state');q.onsuccess=()=>{d.close();resolve(q.result)};q.onerror=()=>reject(q.error)};
  }));
  // Simulate double activation and count the actual writes.
  await page.evaluate(()=>{window.writes=0;const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(args[1]==='state')window.writes++;return put.apply(this,args)};const b=document.getElementById('saveQuickTransaction');b.click();b.click()});
  await page.waitForFunction(()=>document.getElementById('saveQuickTransaction').textContent==='حفظ العمليات');
  let s=await readState();assert.equal(s.transactions.length,7);assert.equal(new Set(s.transactions.map(t=>t.id)).size,7);
  assert.equal(s.transactions.filter(t=>t.offer==='120 شدة').length,5);
  assert.ok(s.transactions.every(t=>t.quantity===1&&t.date==='2026-09-20'&&t.note==='دفعة اختبار'));
  assert.equal(s.presets.find(p=>p.id==='p120').usageCount,5);
  assert.equal(await page.evaluate(()=>window.writes),1);
  assert.equal(await page.locator('#addIncomePreview').textContent(),'0.00');
  await page.locator('.nav-item[data-view="history"]').click();
  assert.equal(await page.locator('#historyBody tr').count(),7);
  await page.locator('#globalAddBtn').click();
  // Bulk adds to cart, including across service filters, without saving.
  await page.locator('#bulkPresetModeBtn').click();await offer('p120').click();
  await page.locator('#quickServicePickerBtn').click();await page.locator('#quickServiceMenu [data-service="Netflix"]').click();await offer('netflix').click();
  await page.locator('#addBulkPresetsBtn').click();
  assert.equal(await page.locator('#quickCart [data-cart-id]').count(),2);assert.equal((await readState()).transactions.length,7);
  await row('netflix').locator('[data-cart-action="remove"]').click();
  // Editing unit income is honored; invalid/empty values cannot save.
  await row('p120').locator('input').fill('');await page.locator('#saveQuickTransaction').click();assert.equal((await readState()).transactions.length,7);
  await row('p120').locator('input').fill('111');
  // Force a real IndexedDB abort, then retry. No partial state or phantom history rows.
  await page.evaluate(()=>{window.abortSave=true;const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);if(window.abortSave&&args[1]==='state'){window.abortSave=false;this.transaction.abort()}return r}});
  await page.locator('#saveQuickTransaction').click();
  await page.waitForFunction(()=>!document.getElementById('saveQuickTransaction').disabled);
  assert.equal((await readState()).transactions.length,7);assert.equal(await page.locator('#quickCart [data-cart-id]').count(),1);
  await page.keyboard.press('Control+Enter');await page.waitForFunction(()=>document.querySelector('.cart-empty'));
  s=await readState();assert.equal(s.transactions.length,8);assert.equal(s.transactions.at(-1).paid,111);assert.equal(s.presets.find(p=>p.id==='p120').usageCount,6);
  // Search path adds directly, repeated results increment, removal resets totals.
  await page.locator('#quickPresetSearch').fill('60');await page.locator('#presetDropdown [data-id="p60"]').click();
  await page.locator('#quickPresetSearch').fill('60');await page.locator('#presetDropdown [data-id="p60"]').click();
  assert.equal(await row('p60').locator('.cart-quantity').textContent(),'2');
  await row('p60').locator('[data-cart-action="remove"]').click();assert.equal(await page.locator('#addIncomePreview').textContent(),'0.00');
  // Escaped preset IDs use data attributes without executable inline handlers.
  await page.locator('#quickPresetSearch').fill('عرض آمن');await page.locator('#presetDropdown button').click();
  assert.equal(await page.locator('#quickCart .cart-offer').textContent(),'عرض آمن');
  await page.locator('#quickCart [data-cart-action="plus"]').click();assert.equal(await page.locator('#quickCart .cart-quantity').textContent(),'2');
  await page.locator('#quickCart [data-cart-action="remove"]').click();
  await page.locator('#quickServicePickerBtn').click();await page.locator('#quickServiceMenu [data-service=""]').click();
  await offer('p120').click();await offer('p325').click();await offer('p60').click();
  for(const width of [390,768,1024,1440]){
    await page.setViewportSize({width,height:1000});
    await page.waitForTimeout(250);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    if(overflow){console.log(await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,width:innerWidth})));console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,id:el.id,cls:el.className,right:el.getBoundingClientRect().right,left:el.getBoundingClientRect().left,width:el.getBoundingClientRect().width})).filter(x=>x.width>innerWidth || x.left<0 || x.right>innerWidth).slice(0,25)));await page.screenshot({path:require('node:path').join(outputDir,'overflow.png'),fullPage:true});}
    assert.equal(overflow,false,`No page overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(250);
  await page.evaluate(()=>document.querySelectorAll('#toastHost .toast').forEach(el=>el.remove()));
  await page.screenshot({path:require('node:path').join(outputDir,'cashier-mobile.png'),fullPage:true});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.cart-card').first().evaluate(el=>getComputedStyle(el).animationName),'none');
  page.once('dialog',d=>d.accept());await page.locator('#clearQuickCart').click();assert.equal(await page.locator('#saveQuickTransaction').isDisabled(),true);
  await page.reload();await page.waitForSelector('#recentPresets [data-preset-id]');assert.equal((await readState()).transactions.length,8);
  assert.deepEqual(errors,[]);
  console.log('PASS: independent rows, totals, single atomic write, double-save guard, abort/retry, bulk/filter, prices, search, escaping, empty reset, 4 viewport sizes, reduced motion, persistence.');
  await browser.close();await new Promise(r=>server.close(r));
})().catch(e=>{console.error(e);process.exit(1)});

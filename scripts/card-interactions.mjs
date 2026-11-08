import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

// Isolated browser profile: never reads or changes a player's saved characters.
const firefox = !!process.env.RK_FIREFOX;
const browser = await puppeteer.launch({
  executablePath: (firefox ? [process.env.FIREFOX_PATH,'C:/Program Files/Mozilla Firefox/firefox.exe','C:/Program Files/Zen Browser/zen.exe'] : [process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']).filter(Boolean).find(existsSync),
  ...(firefox ? { browser: 'firefox', protocol: 'webDriverBiDi' } : {}),
  headless: true, args: firefox ? [] : ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 412, height: 892, deviceScaleFactor: 1 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = process.env.TEMP + '/runekeep-card-checks';
mkdirSync(out, { recursive: true });
try {
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('runekeep.onboarding', JSON.stringify(Object.fromEntries(['welcome','creation','sheet','campaigns','classcards','featurecards'].map(k => [k,{done:true,step:0}]))));
    localStorage.setItem('runekeep.uiMuted', 'true');
    localStorage.setItem('runekeep.characters', JSON.stringify([{
      schemaVersion:1,id:'perf-test',createdAt:'2026-11-08',name:'Performance Test',portraitUri:null,
      className:'druid',level:5,subclassCardId:'subclass-warden-of-the-elements-1-foundation',ancestryCardId:'ancestry-human',communityCardId:'community-wildborne',
      domainCardIds:['sage-01-1','arcana-01-1'],classExpanded:false,
      customCards:Array.from({length:100},(_,i)=>({id:'test-'+i,title:'Test '+i,text:'Card content '+i,imageUri:null,target:'arsenal'})),
      weaponPrimaryId:'wpn-broadsword',weaponSecondaryId:'wpn-round-shield',armorId:'arm-chainmail',
    }]));
  });
  await page.goto((process.argv[2] || 'http://localhost:8081')+'/sheet?id=perf-test', {waitUntil:'networkidle0', timeout:180000});
  // Read the existing provider in a dev build, without adding test hooks to the application.
  await page.evaluate(() => {
    window.testContext = (pager = false) => {
      const el = [...document.querySelectorAll('*')].find(e => Object.keys(e).some(k=>k.startsWith('__reactFiber$')));
      if (!el) return null;
      let root = el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];
      while(root.return) root=root.return;
      const visit = f => {
        if (!f) return null;
        const v=f.memoizedProps?.value;
        if(!pager && v?.decks && v.rotation && v.enterEdit) return v;
        if(pager && f.memoizedProps?.faceCount>1 && f.memoizedProps?.renderFace) return f.memoizedProps.index;
        return visit(f.child) ?? visit(f.sibling);
      };
      return visit(root.stateNode?.current || root);
    };
  });
  await page.waitForFunction(()=>window.testContext()?.decks?.abilities?.length > 50,{timeout:90000});
  await sleep(8500);
  const state = () => page.evaluate(()=>{const c=window.testContext();return {category:c.category,count:c.decks[c.category].length,center:c.centerIndex(),editing:c.editing,raised:c.raisedIds.size,machine:c.machineState.value,switching:c.switching.value,editP:c.editMode.value,fs:c.fullscreenProgress.value,expand:c.expandProgress.value,ids:c.decks[c.category].map(x=>x.id)};});
  console.log('loaded', (await state()).count);
  const drag = async(x,y,dx,dy,hold=0) => {
    await page.mouse.move(x,y); await page.mouse.down(); if(hold) await sleep(hold);
    await page.mouse.move(x+dx,y+dy,{steps:24}); await page.mouse.up(); await sleep(1100);
  };
  const initial = await state();
  await page.mouse.click(206,838); await sleep(1100);
  assert((await state()).expand > .9,'gear tap expands');
  await drag(206,838,-150,0);
  const scrolled=await state(); assert(scrolled.center!==initial.center,'gear scroll changes center'); assert(scrolled.count===initial.count,'scroll preserves deck');
  await drag(206,838,150,0);
  await page.mouse.move(206,838);await page.mouse.down();await page.mouse.move(340,838,{steps:24});await sleep(1800);await page.mouse.up();await sleep(1500);
  assert((await state()).category!=='abilities','gear edge hold switches category');
  await page.evaluate(()=>window.testContext().setCategory('abilities'));await sleep(1500);
  await page.evaluate(()=>{const c=window.testContext();c.openCardAt(c.centerIndex());}); await sleep(1100);
  assert((await state()).fs>.9,'fullscreen opens');
  await page.mouse.click(206,838); await sleep(1100);
  assert((await state()).fs<.1,'gear closes fullscreen');
  await page.mouse.click(206,838);await sleep(1100);
  assert((await state()).expand>.9,'expand before edit hold');
  await page.mouse.move(206,838);await page.mouse.down();await sleep(1400);await page.mouse.up();await sleep(1100);
  assert((await state()).editing,'gear hold enters edit');
  await page.mouse.click(206,650);await sleep(500);
  console.log('selection', (await state()).raised);
  // Ensure a selection even if its card is positioned differently on a browser engine.
  await page.evaluate(()=>{const c=window.testContext();if(!c.raisedIds.size)c.toggleRaise(c.decks[c.category][c.centerIndex()].id);});await sleep(400);
  assert((await state()).raised>0,'selection in edit');
  await page.evaluate(()=>{const c=window.testContext();c.toggleRaise(c.decks[c.category].find(x=>!c.raisedIds.has(x.id)).id);});await sleep(400);
  assert((await state()).raised===2,'group selection');
  await page.mouse.move(206,650);await page.mouse.down();
  await page.mouse.move(206,570,{steps:16});await sleep(350);
  await page.mouse.move(320,570,{steps:20});await sleep(500);await page.mouse.up();await sleep(1600);
  assert((await state()).count===initial.count,'drag preserves every card');
  assert.notDeepEqual((await state()).ids,initial.ids,'drag changes order');
  await page.evaluate(()=>window.testContext().selectAll());await sleep(400);
  assert((await state()).raised===initial.count,'select all');
  const reversed=await page.evaluate(()=>{const c=window.testContext();const ids=c.decks[c.category].map(x=>x.id).reverse();c.sortFnRef.current(ids,ids);return ids;});await sleep(1600);
  assert.deepEqual((await state()).ids,reversed,'animated sorting persists order');
  await page.evaluate(()=>window.testContext().deselectAll());await sleep(400);
  assert((await state()).raised===0,'deselect all');
  await drag(206,838,-110,0);assert((await state()).editing,'edit gear scroll keeps edit mode');
  await page.mouse.click(206,838);await sleep(1100);assert(!(await state()).editing,'gear tap exits edit');
  const categories=await page.evaluate(()=>{const c=window.testContext();return [...new Set([...c.ring,...Object.keys(c.decks).filter(k=>c.decks[k].length)])];});
  for(const cat of categories){await page.evaluate(cat=>window.testContext().setCategory(cat),cat);await sleep(1500);assert((await state()).category===cat,'category '+cat);}
  await page.evaluate(()=>window.testContext().setCategory('abilities'));await sleep(1600);
  assert.deepEqual([...(await state()).ids].sort(),[...initial.ids].sort(),'all identities survive modes and category changes');
  await page.evaluate(()=>{const c=window.testContext();c.openCardAt(c.decks[c.category].findIndex(x=>x.id==='features-druid'));});await sleep(1100);
  assert((await state()).fs>.9,'multi-page card opens after sorting');
  const firstPage = await page.evaluate(()=>window.testContext(true));
  await page.mouse.click(300,500);await sleep(1200);
  assert.notEqual(await page.evaluate(()=>window.testContext(true)),firstPage,'multi-page tap changes page');
  const oldPage = await page.evaluate(()=>window.testContext(true));
  await drag(206,500,-110,0);
  assert.notEqual(await page.evaluate(()=>window.testContext(true)),oldPage,'multi-page swipe changes page');
  assert((await state()).fs>.9,'multi-page swipe stays fullscreen');
  await page.screenshot({path:out+'/'+(firefox?'firefox':'chrome')+'.png'});
  assert.deepEqual(errors,[],'no uncaught browser errors');
  writeFileSync(out+'/'+(firefox?'firefox':'chrome')+'.json',JSON.stringify({passed:true,initialCount:initial.count,categories,errors},null,2));
  console.log('PASS card interaction checks',categories);
} catch (e) {await page.screenshot({path:out+'/failure.png'});console.error('page errors',errors);throw e;} finally {await browser.close();}

const {chromium}=require('playwright');
(async()=>{const br=await chromium.launch();const pg=await br.newPage({viewport:{width:1500,height:900}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://'+process.cwd()+'/index.html');
await pg.click('[data-act=demoLogin][data-r=admin]');
await pg.click('.it');await pg.fill('#ta','Bom dia! Conseguiu o extrato?');
await pg.click('[data-act=sched]');await pg.screenshot({path:'d5a.png'});
await pg.fill('#schw','2026-11-07T10:30');await pg.click('[data-act=schedOk]');await pg.waitForTimeout(100);
await pg.screenshot({path:'d5b.png'});
await pg.click('#rail [data-v=fluxos]');await pg.click('[data-x=fxtab][data-v=sched]');
console.log(await pg.textContent('#fluxos table'));console.log('ERRS',errs);await br.close()})()

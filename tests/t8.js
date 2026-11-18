const {chromium}=require('playwright');
(async()=>{const br=await chromium.launch();const pg=await br.newPage({viewport:{width:1500,height:900}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://'+process.cwd()+'/index.html');
await pg.click('[data-act=demoLogin][data-r=admin]');
await pg.click('.it');await pg.screenshot({path:'/tmp/e1.png'});
await pg.click('#rail [data-v=crm]');await pg.click('[data-x=pipe][data-v=se]');await pg.screenshot({path:'/tmp/e2.png'});
await pg.click('#rail [data-v=rel]');await pg.selectOption('#simq','passivos');await pg.click('[data-tk=sim]');await pg.click('[data-tk=sim]');
await pg.click('#rail [data-v=rel]');await pg.screenshot({path:'/tmp/e3.png',fullPage:true});
await pg.click('#rail [data-v=cfg]');await pg.screenshot({path:'/tmp/e4.png',fullPage:true});
console.log(await pg.$eval('.toast',e=>e.textContent).catch(()=>''),errs);await br.close()})()

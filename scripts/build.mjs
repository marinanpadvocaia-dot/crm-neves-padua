// Junta os arquivos de js/ (ordem alfabética) em dist/app.js, dentro de uma IIFE.
// Sem dependências. Ambiente: node scripts/build.mjs [--ambiente=demonstracao|homologacao|producao]
//   (ou variável AMBIENTE). Padrão: demonstracao. A configuração vem de config/ambientes/<nome>.json.
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import {validarAmbiente} from './ambiente.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');

const nomeAmb=(process.argv.find(a=>a.startsWith('--ambiente='))||'').split('=')[1]||process.env.AMBIENTE||'demonstracao';
let amb;
try{amb=validarAmbiente(nomeAmb,JSON.parse(readFileSync(join(root,'config','ambientes',nomeAmb+'.json'),'utf8')))}
catch(e){console.error('BUILD RECUSADO ('+nomeAmb+'):',e.code==='ENOENT'?'config/ambientes/'+nomeAmb+'.json não existe':e.message);process.exit(1)}

const files=readdirSync(join(root,'js')).filter(f=>f.endsWith('.js')).sort();
const body=files.map(f=>`/* ===== ${f} ===== */\n`+readFileSync(join(root,'js',f),'utf8')).join('\n');
// catálogo de gatilhos e ações dos fluxos: o mesmo arquivo que a Edge Function fluxos-ia usa
const catalogo=readFileSync(join(root,'supabase','functions','_shared','fluxos-catalogo.json'),'utf8');
const cab=`/* ambiente: ${amb.nome} (gerado por scripts/build.mjs; não editar) */\nconst AMBIENTE=Object.freeze(${JSON.stringify(amb)});\nconst FLX_CAT=${JSON.stringify(JSON.parse(catalogo))};\n`;
mkdirSync(join(root,'dist'),{recursive:true});
writeFileSync(join(root,'dist','app.js'),`(function(){\n${cab}${body}\nrenderAll();\n})();\n`);
console.log('dist/app.js gerado a partir de',files.length,'arquivos · ambiente:',amb.rotulo);

// Versão em arquivo único (para publicar como artefato): sem doctype/html/head/body.
const idx=readFileSync(join(root,'index.html'),'utf8'),css=readFileSync(join(root,'css','app.css'),'utf8');
const bodyHtml=idx.slice(idx.indexOf('<body>')+6,idx.indexOf('<script src='));
const head=idx.slice(idx.indexOf('<title>'),idx.indexOf('<link rel="stylesheet" href="css/app.css">'));
writeFileSync(join(root,'dist','artefato.html'),head+'<meta name="claude:viewport-fit-sides" content="cover">\n<style>\n'+css+'\n</style>\n'+bodyHtml+'<script>\n'+readFileSync(join(root,'dist','app.js'),'utf8')+'</script>\n');
console.log('dist/artefato.html gerado');

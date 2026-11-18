// O seed de homologação aplica sobre as migrações, pode rodar duas vezes e se recusa a rodar em produção.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {join} from 'node:path';
import {bancoLocal,raiz} from '../banco-local.mjs';
const seed=readFileSync(join(raiz,'supabase','seed','homologacao.sql'),'utf8');
const n=async(db,sql)=>(await db.query(`select count(*)::int n from ${sql}`)).rows[0].n;

test('seed_homologacao_aplica_duas_vezes_sem_duplicar',async()=>{
  const db=await bancoLocal();
  await db.exec(`insert into auth.users(email) values ('admin@homolog.test'),('lider@homolog.test'),('atendente@homolog.test'),('comercial@homolog.test')`);
  await db.exec(seed);await db.exec(seed);
  assert.equal(await n(db,'crm.atendimentos'),8);assert.equal(await n(db,'crm.negocios'),8);
  assert.equal(await n(db,'crm.canais'),4);assert.equal(await n(db,'crm.acessos'),7);
  assert.equal(await n(db,'crm.perfis'),4);
  assert.equal(await n(db,'crm.mensagens_agendadas'),1);assert.equal(await n(db,'crm.base_artigos'),2);assert.equal(await n(db,'crm.base_artigo_filas'),1);
  assert.equal(await n(db,"crm.canais where principal and tipo='whatsapp' and numero like '+55 16 90000-%'"),1,'só chip de teste');
});
test('seed_homologacao_recusa_banco_de_producao',async()=>{
  const db=await bancoLocal();
  await db.exec(`insert into crm.config(chave,valor) values ('ambiente','{"nome":"producao"}')`);
  await assert.rejects(db.exec(seed),/NÃO roda em produção/);
  assert.equal(await n(db,'crm.atendimentos'),0);
});

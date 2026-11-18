// Passo 0: o build só aceita chave publicável e nunca mistura homologação com produção.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {validarAmbiente,validarChave,REF_PRODUCAO} from '../../scripts/ambiente.mjs';
const jwt=role=>['e30',Buffer.from(JSON.stringify({role})).toString('base64url'),'x'].join('.');
const HML='https://abcdefghijklmnopqrst.supabase.co',PRD=`https://${REF_PRODUCAO}.supabase.co`;

test('chave_publicavel_aceita',()=>{assert.equal(validarChave('sb_publishable_abc'),'publicavel');assert.equal(validarChave(jwt('anon')),'anon')});
test('chave_secreta_recusada',()=>{
  assert.throws(()=>validarChave('sb_secret_abc'),/SECRETA/);
  assert.throws(()=>validarChave(jwt('service_role')),/service_role/);
  assert.throws(()=>validarChave('qualquer-coisa'),/não reconhecido/);
});
test('demonstracao_nao_conecta',()=>{
  assert.equal(validarAmbiente('demonstracao',{nome:'demonstracao'}).conectado,false);
  assert.throws(()=>validarAmbiente('demonstracao',{nome:'demonstracao',supabaseUrl:HML}),/não conecta/);
});
test('homologacao_nao_aponta_para_producao',()=>{
  assert.equal(validarAmbiente('homologacao',{nome:'homologacao',supabaseUrl:HML,chavePublicavel:'sb_publishable_x'}).conectado,true);
  assert.throws(()=>validarAmbiente('homologacao',{nome:'homologacao',supabaseUrl:PRD,chavePublicavel:'sb_publishable_x'}),/NÃO pode apontar/);
});
test('producao_so_no_projeto_do_escritorio',()=>{
  assert.throws(()=>validarAmbiente('producao',{nome:'producao',supabaseUrl:HML,chavePublicavel:'sb_publishable_x'}),/deve apontar/);
  assert.throws(()=>validarAmbiente('producao',{nome:'producao',supabaseUrl:PRD,chavePublicavel:''}),/preencha chavePublicavel/);
  assert.throws(()=>validarAmbiente('producao',{nome:'producao',supabaseUrl:PRD,chavePublicavel:'sb_secret_x'}),/SECRETA/);
});
test('arquivo_e_nome_precisam_bater',()=>{assert.throws(()=>validarAmbiente('producao',{nome:'homologacao'}),/foi pedido/)});

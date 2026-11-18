// Convite de usuário (Edge Function usuarios-convite), com o Supabase simulado.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {convidarUsuario,cabecalhosCors} from '../../supabase/functions/_shared/usuarios.ts';

const deps=(o={})=>{const chamadas=[];return {chamadas,
  ehAdmin:async t=>{chamadas.push(['admin',t]);return o.admin??true},
  idPorEmail:async e=>{chamadas.push(['email',e]);return o.existente??null},
  convidar:async(e,n,r)=>{chamadas.push(['convite',e,n,r]);return 'novo-id'}}};

test('convite_exige_token_e_administrador',async()=>{
  assert.equal((await convidarUsuario(deps(),null,{email:'a@b.com',nome:'Ana'})).status,401);
  const d=deps({admin:false});const r=await convidarUsuario(d,'Bearer TK',{email:'a@b.com',nome:'Ana'});
  assert.equal(r.status,403);assert.deepEqual(d.chamadas,[['admin','TK']],'não procura nem convida');
});
test('convite_valida_email_e_nome',async()=>{
  assert.equal((await convidarUsuario(deps(),'Bearer TK',{email:'sem-arroba',nome:'Ana'})).status,400);
  assert.equal((await convidarUsuario(deps(),'Bearer TK',{email:'a@b.com',nome:' '})).status,400);
});
test('convite_novo_envia_email_com_endereco_do_app',async()=>{
  const d=deps();const r=await convidarUsuario(d,'Bearer TK',{email:' Ana@Escritorio.com.br ',nome:'Ana   Júlia'},'https://crm.exemplo.com.br');
  assert.deepEqual(r,{status:200,corpo:{user_id:'novo-id',convidado:true}});
  assert.deepEqual(d.chamadas.at(-1),['convite','ana@escritorio.com.br','Ana Júlia','https://crm.exemplo.com.br']);
});
test('convite_reaproveita_login_existente_sem_email',async()=>{
  const d=deps({existente:'id-juridico'});const r=await convidarUsuario(d,'Bearer TK',{email:'x@y.com',nome:'Xis'});
  assert.deepEqual(r.corpo,{user_id:'id-juridico',convidado:false});
  assert.ok(!d.chamadas.some(c=>c[0]==='convite'),'não manda convite para quem já tem login');
});
test('cors_restrito_ao_app_quando_configurado',()=>{
  assert.equal(cabecalhosCors('https://crm.exemplo.com.br/app/')['access-control-allow-origin'],'https://crm.exemplo.com.br');
  assert.equal(cabecalhosCors('')['access-control-allow-origin'],'*');
});

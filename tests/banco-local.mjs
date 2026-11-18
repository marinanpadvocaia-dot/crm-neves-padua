// Postgres local (PGlite) com o básico do Supabase (auth.users, auth.uid, papéis) e as migrações do CRM aplicadas.
// Usado pelos testes de integração e do seed. Não toca em nenhum banco real.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
export const raiz=join(dirname(fileURLToPath(import.meta.url)),'..');
const dir=join(raiz,'supabase','migrations');
export const migracoes=()=>readdirSync(dir).filter(f=>/^crm_\d{4}.*\.sql$/.test(f)&&!/^crm_000[01]/.test(f)).sort();

export async function bancoLocal(){
  const db=new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
   create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(), email text);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;`);
  for(const f of migracoes())await db.exec(readFileSync(join(dir,f),'utf8'));
  return db;
}

// Funções que devolvem várias linhas (o supabase-js devolve lista; as demais devolvem o valor).
const LISTA=new Set(['saida_pegar_lote','webhook_registrar','webhook_para_processar','ia_eventos_para_processar','fluxo_mensagens_pendentes','fluxo_webhooks_pendentes']);

/** Implementa a interface Banco das Edge Functions sobre o PGlite, como service_role. */
export function bancoServico(db){
  const como=async(sql,p=[])=>{await db.exec('set role service_role');try{return (await db.query(sql,p)).rows}finally{await db.exec('reset role')}};
  return {
    async rpc(fn,args={}){
      const ks=Object.keys(args),ps=ks.map(k=>{const v=args[k];return v!==null&&typeof v==='object'?JSON.stringify(v):v});
      const chamada=`crm.${fn}(${ks.map((k,i)=>`${k} => $${i+1}`).join(', ')})`;
      if(LISTA.has(fn))return como(`select * from ${chamada}`,ps);
      return (await como(`select ${chamada} as r`,ps))[0].r;
    },
    canais:()=>como(`select id,tipo,nome,provedor,instancia,estado from crm.canais where ativo`),
    canalPorInstancia:async i=>(await como(`select id,tipo,nome,provedor,instancia,estado from crm.canais where instancia=$1 and ativo limit 1`,[i]))[0]??null,
    alertasParaNotificar:()=>como(`select id::int,nivel,mensagem from crm.alertas where notificado_em is null order by aberto_em limit 20`),
    marcarNotificados:async ids=>{await como(`update crm.alertas set notificado_em=now() where id = any($1::bigint[])`,[ids])},
  };
}

/** Interface BancoIA (agentes de IA) sobre o PGlite, como service_role. Mesmas consultas de _shared/supabase.ts. */
export function bancoIALocal(db){
  const base=bancoServico(db);
  const como=async(sql,p=[])=>{await db.exec('set role service_role');try{return (await db.query(sql,p)).rows}finally{await db.exec('reset role')}};
  return {
    rpc:base.rpc,
    agentesAtivos:()=>como(`select id,slug,nome,canal,modo,modelo,provedor,requer_vinculo,instrucoes,responde_sozinho,transfere_quando from crm.agentes where ativo`),
    regrasValidadas:id=>como(`select tipo,regra from crm.regras_ia where ativa and validada_em is not null and (agente_id is null or agente_id=$1) order by created_at`,[id]),
    exemplos:id=>como(`select pergunta,resposta from crm.ia_exemplos where agente_id=$1 and ativo order by created_at desc limit 10`,[id]),
  };
}

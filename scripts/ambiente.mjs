// Validação da configuração de ambiente (usada pelo build e testada em tests/unit/ambiente.test.mjs).
// Regra do escritório: no front SÓ a chave publicável. Qualquer chave secreta/service_role recusa o build.
export const REF_PRODUCAO='ksdwzljfjfucjevdqxvx';
const NOMES=['demonstracao','homologacao','producao'];

function papelDoJwt(k){
  const p=k.split('.');if(p.length!==3)return null;
  try{return JSON.parse(Buffer.from(p[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8')).role||null}catch{return null}
}

export function validarChave(k){
  if(/^sb_secret_/.test(k))throw new Error('chave SECRETA (sb_secret_…) no front. Use a chave publicável (sb_publishable_…).');
  if(/^sb_publishable_/.test(k))return 'publicavel';
  const papel=papelDoJwt(k);
  if(papel==='anon')return 'anon';
  if(papel)throw new Error(`chave com papel "${papel}" no front. Só a chave publicável/anon é permitida; service_role nunca.`);
  throw new Error('formato de chave não reconhecido (esperado sb_publishable_…)');
}

export function validarAmbiente(nome,c){
  if(!NOMES.includes(nome))throw new Error('ambiente desconhecido: '+nome);
  if(c.nome!==nome)throw new Error(`o arquivo diz "${c.nome}", mas foi pedido "${nome}"`);
  const url=String(c.supabaseUrl||''),chave=String(c.chavePublicavel||'');
  if(nome==='demonstracao'){
    if(url||chave)throw new Error('demonstração não conecta em nada: deixe supabaseUrl e chavePublicavel vazios');
    return {...c,conectado:false};
  }
  const m=url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/);
  if(!m)throw new Error('preencha supabaseUrl (https://<ref>.supabase.co) em config/ambientes/'+nome+'.json');
  if(nome==='producao'&&m[1]!==REF_PRODUCAO)throw new Error('produção deve apontar para o projeto '+REF_PRODUCAO);
  if(nome==='homologacao'&&m[1]===REF_PRODUCAO)throw new Error('homologação NÃO pode apontar para o Supabase de produção');
  if(!chave)throw new Error('preencha chavePublicavel em config/ambientes/'+nome+'.json');
  validarChave(chave);
  return {...c,conectado:true};
}

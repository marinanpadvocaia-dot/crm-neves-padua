# Liga o agendamento das Edge Functions (pg_cron + pg_net) num projeto Supabase.
# Gera um CRON_SEGREDO novo (sem exibir), grava nas Edge Functions e no Vault do banco,
# cria crm.chamar_funcao e os 6 agendamentos de supabase/functions/README.md ("Agendar").
# Idempotente: rodar de novo troca o segredo nos dois lugares e mantém os agendamentos.
# Requer `supabase login` feito pelo usuário. Uso: .\scripts\agendar-funcoes.ps1 -Ref <ref>
param([Parameter(Mandatory)][string]$Ref, [switch]$AutorizadoProducao)
if ($Ref -eq 'ksdwzljfjfucjevdqxvx' -and -not $AutorizadoProducao) {
  throw 'Producao: so com a autorizacao da Maria Julia registrada. Rode com -AutorizadoProducao.'
}
$ErrorActionPreference = 'Continue'
$REF = $Ref.Trim()
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$S = -join ($b | ForEach-Object { $_.ToString('x2') })

Write-Host '== 1/2 CRON_SEGREDO novo nas Edge Functions'
npx.cmd supabase secrets set --remote=$REF --yes "CRON_SEGREDO=$S" *> $null
if ($LASTEXITCODE -ne 0) { throw 'falhou secrets set' }

Write-Host '== 2/2 Extensoes, Vault, crm.chamar_funcao e agendamentos'
$sql = @'
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $d$ begin
  if exists (select 1 from vault.secrets where name = 'crm_url_projeto') then
    perform vault.update_secret((select id from vault.secrets where name = 'crm_url_projeto'), 'https://__REF__.supabase.co');
  else perform vault.create_secret('https://__REF__.supabase.co', 'crm_url_projeto'); end if;
  if exists (select 1 from vault.secrets where name = 'crm_cron_segredo') then
    perform vault.update_secret((select id from vault.secrets where name = 'crm_cron_segredo'), '__S__');
  else perform vault.create_secret('__S__', 'crm_cron_segredo'); end if;
end $d$;
create or replace function crm.chamar_funcao(p_nome text) returns void language sql security definer set search_path = '' as $f$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'crm_url_projeto') || '/functions/v1/' || p_nome,
    headers := jsonb_build_object('content-type', 'application/json',
                 'x-cron-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_segredo')),
    body    := '{}'::jsonb);
$f$;
revoke all on function crm.chamar_funcao(text) from public, anon, authenticated;
select cron.schedule('crm-whatsapp-saude', '* * * * *', $j$ select crm.chamar_funcao('whatsapp-saude') $j$);
select cron.schedule('crm-whatsapp-saida', '* * * * *', $j$ select crm.chamar_funcao('whatsapp-saida') $j$);
select cron.schedule('crm-relatorio-diario', '0 21 * * 1-5', $j$ select crm.chamar_funcao('whatsapp-saude?relatorio=1') $j$);
select cron.schedule('crm-ia-agentes', '* * * * *', $j$ select crm.chamar_funcao('ia-agentes') $j$);
select cron.schedule('crm-google-avaliacoes', '*/10 * * * *', $j$ select crm.chamar_funcao('google-avaliacoes') $j$);
select cron.schedule('crm-fluxos-motor', '* * * * *', $j$ select crm.chamar_funcao('fluxos-motor') $j$);
select jobname, schedule, active from cron.job order by jobname;
'@
$sql = $sql.Replace('__REF__', $REF).Replace('__S__', $S)
$S = $null
$arq = Join-Path $env:TEMP ('crm-agendar-' + [guid]::NewGuid() + '.sql')
[IO.File]::WriteAllText($arq, $sql, (New-Object Text.UTF8Encoding $false)); $sql = $null
$out = npx.cmd supabase db query --remote=$REF --yes -f $arq 2>&1 | Out-String
Remove-Item $arq -Force
if ($LASTEXITCODE -ne 0) { throw ('falhou o SQL: ' + ($out -replace '[0-9a-f]{64}', '***')) }
$out -replace '[0-9a-f]{64}', '***'



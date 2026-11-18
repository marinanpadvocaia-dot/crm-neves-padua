# scripts/publicar-funcoes-homologacao.ps1
# Publica as Edge Functions do CRM no projeto de HOMOLOGACAO e cria os segredos internos
# (WEBHOOK_SEGREDO e CRON_SEGREDO) gerados aqui mesmo, sem exibir na tela.
# Segredos de terceiros (Evolution, Anthropic, Meta, Google) NAO entram aqui: cadastre no painel
# do Supabase (Edge Functions -> Secrets).
# Uso, na pasta crm:  powershell -ExecutionPolicy Bypass -File scripts\publicar-funcoes-homologacao.ps1
# So os segredos (sem login nem publicar de novo):  ... publicar-funcoes-homologacao.ps1 -SoSegredos

param([switch]$SoSegredos)
$ErrorActionPreference = 'Stop'
$REF  = 'mjazxkpjtrksbjqttowz'        # np-crm-homologacao
$PROD = 'ksdwzljfjfucjevdqxvx'        # producao: este script se recusa a usar
if ($REF -eq $PROD) { throw 'Este script e so para homologacao.' }

Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Test-Path 'supabase\functions')) { throw 'Rode a partir da pasta crm (supabase\functions nao encontrada).' }

# npx.cmd, nunca npx: no PowerShell, "npx" e o npx.ps1, que dentro de funcao perde os argumentos
# (a CLI recebe so "@args", mostra a ajuda e sai com 0, como se tivesse dado certo).
function sb { & npx.cmd --yes supabase@2 @args; if ($LASTEXITCODE -ne 0) { throw "falhou: supabase $args" } }
# Roda a CLI guardando a saida (inclusive erros) para mostrar se falhar. 'Continue' aqui dentro porque,
# no PowerShell 5.1, qualquer aviso da CLI no stderr viraria erro fatal com 'Stop'.
function sbSaida {
  $ErrorActionPreference = 'Continue'
  $o = (& npx.cmd --yes supabase@2 @args 2>&1 | ForEach-Object { "$_" }) -join "`n"
  $ok = ($LASTEXITCODE -eq 0) -and ($o -notmatch '"_tag":"Help"')
  [pscustomobject]@{ ok = $ok; saida = $o }
}

if (-not $SoSegredos) {
  Write-Host '== 1/3 Login na CLI do Supabase (abre o navegador; confirme la) =='
  sb login

  $funcoes = @(
    'usuarios-convite','canais-conectar','whatsapp-webhook','whatsapp-saude','whatsapp-saida',
    'instagram-webhook','google-avaliacoes','ia-agentes','fluxos-ia','fluxos-motor'
  )
  Write-Host "== 2/3 Publicando $($funcoes.Count) funcoes em $REF =="
  foreach ($f in $funcoes) {
    Write-Host "-- $f"
    sb functions deploy $f --no-verify-jwt --project-ref $REF
  }
}

Write-Host '== 3/3 Segredos internos (gerados aqui, nao aparecem na tela) =='
# A lista mostra so nomes e resumos (hash), nunca o valor.
$lista = sbSaida secrets list --project-ref $REF
if (-not $lista.ok) { Write-Host $lista.saida; throw 'falhou ao listar os segredos' }
$existentes = $lista.saida
function novoSegredo {
  $b = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  -join ($b | ForEach-Object { $_.ToString('x2') })
}
$novos = @()
foreach ($nome in @('WEBHOOK_SEGREDO','CRON_SEGREDO')) {
  if ($existentes -match "\b$nome\b") { Write-Host "-- $nome ja existe, mantido"; continue }
  $novos += "$nome=$(novoSegredo)"
}
if ($novos.Count -gt 0) {
  # Os valores vao por arquivo temporario (nao pela linha de comando) e o arquivo e apagado em seguida.
  $tmp = [IO.Path]::GetTempFileName()
  try {
    [IO.File]::WriteAllText($tmp, ($novos -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
    $r = sbSaida secrets set --env-file $tmp --project-ref $REF
    if (-not $r.ok) { Write-Host $r.saida; throw 'falhou ao gravar os segredos' }
  } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue; Remove-Variable novos }
  Write-Host '-- segredos criados'
}

Write-Host ''
Write-Host 'Pronto. Funcoes publicadas na homologacao.'
Write-Host 'Falta cadastrar no painel (Edge Functions -> Secrets): EVOLUTION_URL, EVOLUTION_APIKEY e, quando for usar, ANTHROPIC_API_KEY, IG_*, META_APP_SECRET, GOOGLE_*, APP_URL.'

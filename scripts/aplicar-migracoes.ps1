# Ajuda a aplicar as migrações crm_NNNN no SQL Editor do Supabase, uma por vez, na ordem.
# Não conecta em nada: só copia cada arquivo para a área de transferência.
#
# Uso (PowerShell, na pasta do projeto):
#   .\scripts\aplicar-migracoes.ps1              # da 0002 até a última
#   .\scripts\aplicar-migracoes.ps1 -De 15       # recomeçar da 0015 (depois de um erro)
#   .\scripts\aplicar-migracoes.ps1 -De 5 -Ate 9 # só um trecho
#
# Antes: confira no SQL Editor QUAL projeto está aberto (homologação ou produção).
param([int]$De = 2, [int]$Ate = 999)

$pasta = Join-Path $PSScriptRoot '..\supabase\migrations'
$arquivos = Get-ChildItem $pasta -Filter 'crm_*.sql' | ForEach-Object {
    if ($_.Name -match '^crm_(\d{4})_') { [pscustomobject]@{ N = [int]$Matches[1]; Arquivo = $_ } }
} | Where-Object { $_.N -ge 2 -and $_.N -ge $De -and $_.N -le $Ate } | Sort-Object N

if (-not $arquivos) { Write-Host 'Nenhuma migração encontrada.'; exit 1 }
Write-Host ("{0} migrações, da {1} à {2}." -f $arquivos.Count, $arquivos[0].Arquivo.Name, $arquivos[-1].Arquivo.Name)

foreach ($a in $arquivos) {
    Get-Content -Raw -Encoding UTF8 $a.Arquivo.FullName | Set-Clipboard
    Write-Host ''
    Write-Host ("[{0}] copiada para a área de transferência." -f $a.Arquivo.Name) -ForegroundColor Cyan
    Write-Host '  1) SQL Editor > New query > Ctrl+V   2) Run (confirme o aviso "Potential issue", se aparecer)'
    Write-Host '  3) Espere "Success". Se aparecer erro, PARE: não siga para a próxima.'
    $r = Read-Host '  Enter = próxima | P = parar aqui'
    if ($r -match '^[pP]') { Write-Host ("Parou na {0}. Se ela deu erro, corrija e rode de novo com -De {1}. Se deu Success, retome com -De {2}." -f $a.Arquivo.Name, $a.N, ($a.N + 1)); break }
}
Write-Host ''
Write-Host 'Fim. Rode agora as conferências do roteiro (docs/subir-para-git-e-supabase.md, passo 3).'

$ErrorActionPreference = 'Stop'
$env:DISCORD_WEBHOOK_URL = 'https://discord.invalid/api/webhooks/test/token'
$env:GITHUB_REPOSITORY = 'khentmoba/Everglow-Desktop'
$env:GITHUB_REF_NAME = 'v0.4.0'
$env:RELEASE_CHANGELOG = "- Auto-hiding top bar: Hover near top edge`n- Shortcut support: Ctrl+Shift+M"

function Invoke-RestMethod {
    param($Uri, $Method, $ContentType, $Body)
    $script:request = @{ Uri = $Uri; Method = $Method; ContentType = $ContentType; Body = $Body }
}

. "$PSScriptRoot/notify-discord.ps1"
$payload = [Text.Encoding]::UTF8.GetString($request.Body) | ConvertFrom-Json
if ($request.Uri -ne "$env:DISCORD_WEBHOOK_URL`?wait=true") { throw 'Discord must confirm delivery' }
if ($request.Method -ne 'Post' -or $request.ContentType -ne 'application/json') { throw 'Expected JSON POST' }
if ($payload.content -notmatch 'New Release: \*\*Everglow Desktop v0.4.0\*\* is now available!') { throw 'Missing header' }
if ($payload.embeds.Count -ne 1) { throw 'Expected exactly one embed' }

$embed = $payload.embeds[0]
if ($embed.title -ne 'Release: Everglow Desktop v0.4.0') { throw 'Missing or invalid embed title' }
if ($embed.color -ne 4363994) { throw 'Invalid embed color' }
if ($embed.footer.text -ne 'Everglow Desktop Automated Release System') { throw 'Missing embed footer' }

$versionField = $embed.fields | Where-Object { $_.name -eq 'Version' }
if (-not $versionField -or $versionField.value -ne '`v0.4.0`') { throw 'Missing Version field' }

$configField = $embed.fields | Where-Object { $_.name -eq 'Configuration' }
if (-not $configField -or $configField.value -ne '`Release x64`') { throw 'Missing Configuration field' }

$installerField = $embed.fields | Where-Object { $_.name -like '*Installer*' }
if (-not $installerField -or -not $installerField.value.Contains('Everglow-Desktop-Setup.exe')) { throw 'Missing Installer field' }

$whatsNewField = $embed.fields | Where-Object { $_.name -eq "What's New" }
if (-not $whatsNewField -or -not $whatsNewField.value.Contains('- Auto-hiding top bar')) { throw 'Missing What''s New field' }

if ($payload.allowed_mentions.parse.Count -ne 0) { throw 'Mentions must be disabled' }

# Test truncation when changelog is oversized
$env:RELEASE_CHANGELOG = '- ' + ('x' * 1500)
. "$PSScriptRoot/notify-discord.ps1"
$longPayload = [Text.Encoding]::UTF8.GetString($request.Body) | ConvertFrom-Json
$longWhatsNew = $longPayload.embeds[0].fields | Where-Object { $_.name -eq "What's New" }
if ($longWhatsNew.value.Length -gt 1024) { throw 'Field value must not exceed 1024 char limit' }
if (-not $longWhatsNew.value.Contains('*(truncated)*')) { throw 'Oversized changelog must be truncated' }
$env:RELEASE_CHANGELOG = ''

$env:DISCORD_WEBHOOK_URL += '?thread_id=123'
. "$PSScriptRoot/notify-discord.ps1"
if (-not $request.Uri.EndsWith('?thread_id=123&wait=true')) { throw 'Existing webhook query must be preserved' }

$env:DISCORD_WEBHOOK_URL = ''
try {
    . "$PSScriptRoot/notify-discord.ps1"
    throw 'Expected missing secret failure'
} catch {
    if ($_.Exception.Message -ne 'Missing DISCORD_WEBHOOK_URL repository secret') { throw }
}

$env:DISCORD_WEBHOOK_URL = 'https://discord.invalid/api/webhooks/test/token'
function Invoke-RestMethod { throw "Request failed: $env:DISCORD_WEBHOOK_URL" }
try {
    . "$PSScriptRoot/notify-discord.ps1"
    throw 'Expected delivery failure'
} catch {
    if ($_.Exception.Message -notlike 'Discord notification failed.*') { throw }
    if ($_.Exception.Message.Contains($env:DISCORD_WEBHOOK_URL)) { throw 'Webhook leaked in error' }
}
Write-Output 'Discord notification checks passed (no network requests).'

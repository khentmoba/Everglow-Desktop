$ErrorActionPreference = 'Stop'
$env:DISCORD_WEBHOOK_URL = 'https://discord.invalid/api/webhooks/test/token'
$env:GITHUB_REPOSITORY = 'khentmoba/Everglow-Desktop'
$env:GITHUB_REF_NAME = 'v0.4.0'

function Invoke-RestMethod {
    param($Uri, $Method, $ContentType, $Body)
    $script:request = @{ Uri = $Uri; Method = $Method; ContentType = $ContentType; Body = $Body }
}

. "$PSScriptRoot/notify-discord.ps1"
$payload = [Text.Encoding]::UTF8.GetString($request.Body) | ConvertFrom-Json
if ($request.Uri -ne "$env:DISCORD_WEBHOOK_URL`?wait=true") { throw 'Discord must confirm delivery' }
if ($request.Method -ne 'Post' -or $request.ContentType -ne 'application/json') { throw 'Expected JSON POST' }
if ($payload.content -notmatch 'Everglow Desktop v0.4.0 is available!') { throw 'Missing version' }
if (-not $payload.content.Contains('https://github.com/khentmoba/Everglow-Desktop/releases/tag/v0.4.0')) { throw 'Missing release link' }
if (-not $payload.content.Contains('https://github.com/khentmoba/Everglow-Desktop/releases/download/v0.4.0/Everglow-Desktop-Setup.exe')) { throw 'Missing version-specific installer link' }
if ($payload.allowed_mentions.parse.Count -ne 0) { throw 'Mentions must be disabled' }

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

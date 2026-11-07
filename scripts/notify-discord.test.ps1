$ErrorActionPreference = 'Stop'
$env:DISCORD_WEBHOOK_URL = 'https://discord.invalid/api/webhooks/test/token'
$env:GITHUB_REPOSITORY = 'khentmoba/Everglow-Desktop'
$env:GITHUB_REF_NAME = 'v0.4.1'
$env:RELEASE_NOTES = ''
$env:RELEASE_CHANGELOG = "- Menu dropdown: Matches top bar UI`n- Shortcut support: Ctrl+Shift+M"

function Invoke-RestMethod {
    param($Uri, $Method, $ContentType, $Body)
    $script:request = @{ Uri = $Uri; Method = $Method; ContentType = $ContentType; Body = $Body }
}
# The release body lookup must not reach GitHub from tests; report an empty release.
function gh { $global:LASTEXITCODE = 1 }

function Assert-Rejected([string]$Expected) {
    $script:request = $null
    try {
        . "$PSScriptRoot/notify-discord.ps1"
        throw "Expected failure: $Expected"
    } catch {
        if ($_.Exception.Message -notlike "$Expected*") { throw }
    }
    if ($script:request) { throw "Nothing may be posted when: $Expected" }
}

. "$PSScriptRoot/notify-discord.ps1"
$payload = [Text.Encoding]::UTF8.GetString($request.Body) | ConvertFrom-Json
if ($request.Uri -ne "$env:DISCORD_WEBHOOK_URL`?wait=true") { throw 'Discord must confirm delivery' }
if ($request.Method -ne 'Post' -or $request.ContentType -ne 'application/json') { throw 'Expected JSON POST' }
if ($payload.content -notmatch 'New Release: \*\*Everglow Desktop v0.4.1\*\* is now available!') { throw 'Missing header' }
if ($payload.embeds.Count -ne 1) { throw 'Expected exactly one embed' }

$embed = $payload.embeds[0]
if ($embed.title -ne 'Release: Everglow Desktop v0.4.1') { throw 'Missing or invalid embed title' }
if ($embed.color -ne 4363994) { throw 'Invalid embed color' }
if ($embed.footer.text -ne 'Everglow Desktop Automated Release System') { throw 'Missing embed footer' }

$versionField = $embed.fields | Where-Object { $_.name -eq 'Version' }
if (-not $versionField -or $versionField.value -ne '`v0.4.1`') { throw 'Missing Version field' }

$configField = $embed.fields | Where-Object { $_.name -eq 'Configuration' }
if (-not $configField -or $configField.value -ne '`Release x64`') { throw 'Missing Configuration field' }

$installerField = $embed.fields | Where-Object { $_.name -like '*Installer*' }
if (-not $installerField -or -not $installerField.value.Contains('Everglow-Desktop-Setup.exe')) { throw 'Missing Installer field' }

$whatsNewField = $embed.fields | Where-Object { $_.name -eq "What's New" }
if (-not $whatsNewField -or -not $whatsNewField.value.Contains('- Menu dropdown')) { throw 'Missing What''s New field' }

if ($payload.allowed_mentions.parse.Count -ne 0) { throw 'Mentions must be disabled' }

# An explicit -Changelog wins over the environment.
. "$PSScriptRoot/notify-discord.ps1" -Changelog '- Passed by the release workflow.'
$explicit = ([Text.Encoding]::UTF8.GetString($request.Body) | ConvertFrom-Json).embeds[0].fields | Where-Object { $_.name -eq "What's New" }
if ($explicit.value -ne '- Passed by the release workflow.') { throw 'Explicit changelog must be used' }

# Oversized notes keep whole bullets and link to the full release notes.
$bullets = 1..40 | ForEach-Object { "- Bullet number $_ describes one user-facing change." }
$env:RELEASE_CHANGELOG = $bullets -join "`n"
. "$PSScriptRoot/notify-discord.ps1"
$longWhatsNew = ([Text.Encoding]::UTF8.GetString($request.Body) | ConvertFrom-Json).embeds[0].fields | Where-Object { $_.name -eq "What's New" }
if ($longWhatsNew.value.Length -gt 1024) { throw 'Field value must not exceed 1024 char limit' }
$lines = $longWhatsNew.value -split "`n"
if ($lines[-1] -ne '- [Full release notes](https://github.com/khentmoba/Everglow-Desktop/releases/tag/v0.4.1)') { throw 'Truncated notes must link the full release notes' }
foreach ($line in $lines[0..($lines.Count - 2)]) {
    if ($line -notin $bullets) { throw "Truncation cut a bullet: $line" }
}

# Missing or commit-message notes fail before anything is posted.
$env:RELEASE_CHANGELOG = ''
Assert-Rejected 'Missing release notes.'
$env:RELEASE_CHANGELOG = "Merge pull request #11 from khentmoba/t3/discord-release-notifications`n`nchore(release): prepare Everglow Desktop v0.6.0"
Assert-Rejected 'Release notes look like commit messages.'
$env:RELEASE_CHANGELOG = "- Added a real change.`n- fix(desktop): fill the monitor"
Assert-Rejected 'Release notes look like commit messages.'

$env:RELEASE_CHANGELOG = '- A real change.'
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
# The gh stub leaves LASTEXITCODE at 1, and the Actions pwsh wrapper exits with it.
$global:LASTEXITCODE = 0
Write-Output 'Discord notification checks passed (no network requests).'

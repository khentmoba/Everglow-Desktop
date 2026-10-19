$ErrorActionPreference = 'Stop'

if (-not $env:DISCORD_WEBHOOK_URL) { throw 'Missing DISCORD_WEBHOOK_URL repository secret' }
if (-not $env:GITHUB_REPOSITORY -or -not $env:GITHUB_REF_NAME) { throw 'Missing release repository or tag' }

$releaseUrl = "https://github.com/$env:GITHUB_REPOSITORY/releases/tag/$([Uri]::EscapeDataString($env:GITHUB_REF_NAME))"
$downloadUrl = "https://github.com/$env:GITHUB_REPOSITORY/releases/download/$([Uri]::EscapeDataString($env:GITHUB_REF_NAME))/Everglow-Desktop-Setup.exe"
$payload = @{
    content = "**Everglow Desktop $env:GITHUB_REF_NAME is available!**`nRelease notes: $releaseUrl`nWindows installer: $downloadUrl"
    allowed_mentions = @{ parse = @() }
} | ConvertTo-Json -Depth 3 -Compress

$separator = if ($env:DISCORD_WEBHOOK_URL.Contains('?')) { '&' } else { '?' }
try {
    Invoke-RestMethod -Uri "$env:DISCORD_WEBHOOK_URL${separator}wait=true" -Method Post -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($payload)) | Out-Null
} catch {
    throw 'Discord notification failed. The release is already published; check the webhook secret before retrying.'
}

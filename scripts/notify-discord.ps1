[CmdletBinding()]
param(
    [string]$Changelog
)

$ErrorActionPreference = 'Stop'

if (-not $env:DISCORD_WEBHOOK_URL) { throw 'Missing DISCORD_WEBHOOK_URL repository secret' }
if (-not $env:GITHUB_REPOSITORY -or -not $env:GITHUB_REF_NAME) { throw 'Missing release repository or tag' }

if (-not $Changelog) {
    if ($env:RELEASE_CHANGELOG) {
        $Changelog = $env:RELEASE_CHANGELOG
    } elseif ($env:RELEASE_NOTES) {
        $Changelog = $env:RELEASE_NOTES
    }
}

if (-not $Changelog) {
    try {
        if (Get-Command gh -ErrorAction SilentlyContinue) {
            $body = (& gh release view $env:GITHUB_REF_NAME --repo $env:GITHUB_REPOSITORY --json body -q .body 2>$null)
            if ($LASTEXITCODE -eq 0 -and $body -and $body.Trim()) {
                $Changelog = $body.Trim()
            }
        }
    } catch {}
}

if (-not $Changelog) {
    try {
        $commits = (& git log -1 --pretty=%B 2>$null)
        if ($commits -and $commits.Trim()) {
            $Changelog = $commits.Trim()
        }
    } catch {}
}

if (-not $Changelog) {
    $Changelog = "Bug fixes and improvements."
}

$maxChangelogLength = 1500
if ($Changelog.Length -gt $maxChangelogLength) {
    $Changelog = $Changelog.Substring(0, $maxChangelogLength).TrimEnd() + "`n... *(truncated)*"
}

$downloadUrl = "https://github.com/$env:GITHUB_REPOSITORY/releases/download/$([Uri]::EscapeDataString($env:GITHUB_REF_NAME))/Everglow-Desktop-Setup.exe"
$payload = @{
    content = "**Everglow Desktop $env:GITHUB_REF_NAME is available!**`n`n$Changelog`n`nWindows installer: $downloadUrl"
    allowed_mentions = @{ parse = @() }
} | ConvertTo-Json -Depth 3 -Compress

$separator = if ($env:DISCORD_WEBHOOK_URL.Contains('?')) { '&' } else { '?' }
try {
    Invoke-RestMethod -Uri "$env:DISCORD_WEBHOOK_URL${separator}wait=true" -Method Post -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($payload)) | Out-Null
} catch {
    throw 'Discord notification failed. The release is already published; check the webhook secret before retrying.'
}

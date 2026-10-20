[CmdletBinding()]
param(
    [string]$InstallerPath,
    [string]$Changelog
)

$ErrorActionPreference = 'Stop'

if (-not $env:DISCORD_WEBHOOK_URL) { throw 'Missing DISCORD_WEBHOOK_URL repository secret' }
if (-not $env:GITHUB_REPOSITORY -or -not $env:GITHUB_REF_NAME) { throw 'Missing release repository or tag' }

# 1. Resolve changelog
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
            if ($LASTEXITCODE -eq 0 -and $body) {
                if ($body -is [array]) {
                    $Changelog = ($body -join "`n").Trim()
                } else {
                    $Changelog = ([string]$body).Trim()
                }
            }
        }
    } catch {}
}

if (-not $Changelog) {
    try {
        $commits = (& git log -1 --pretty=%B 2>$null)
        if ($commits) {
            if ($commits -is [array]) {
                $Changelog = ($commits -join "`n").Trim()
            } else {
                $Changelog = ([string]$commits).Trim()
            }
        }
    } catch {}
}

if (-not $Changelog) {
    $Changelog = "Bug fixes and improvements."
}

# Clean changelog: strip redundant markdown headers and trailing installer notes
$cleanChangelog = $Changelog -replace '(?im)^##\s*What''s\s*(?:New|Changed)[^\r\n]*\r?\n+', ''
$cleanChangelog = $cleanChangelog -replace '(?im)\r?\n\r?\n(?:The\s+Windows\s+installer|The\s+installer)[^\r\n]*\z', ''
$cleanChangelog = $cleanChangelog.Trim()
if (-not $cleanChangelog) { $cleanChangelog = $Changelog }

# Normalize bullet points to markdown list items
$cleanChangelog = $cleanChangelog -replace '(?m)^[•*]\s*', '- '

# Truncate if exceeding Discord embed field limit (1024 chars)
if ($cleanChangelog.Length -gt 1000) {
    $cleanChangelog = $cleanChangelog.Substring(0, 970).TrimEnd() + "`n... *(truncated)*"
}

# 2. Resolve installer path or download URL
$downloadUrl = "https://github.com/$env:GITHUB_REPOSITORY/releases/download/$([Uri]::EscapeDataString($env:GITHUB_REF_NAME))/Everglow-Desktop-Setup.exe"
$installerName = "Everglow-Desktop-Setup.exe"

$hasFile = $false
$fileDisplay = "[$installerName]($downloadUrl)"

if ($InstallerPath -and (Test-Path $InstallerPath)) {
    $fileItem = Get-Item -Path $InstallerPath
    if ($fileItem.Length -le 25MB) {
        $hasFile = $true
        $installerName = $fileItem.Name
        $sizeMb = [math]::Round($fileItem.Length / 1MB, 2)
        $fileDisplay = "$installerName ($sizeMb MB)"
    }
}

# 3. Build Embed
$tick = [char]96
$fields = [System.Collections.Generic.List[object]]::new()

$fields.Add(@{
    name   = "Version"
    value  = "$tick$env:GITHUB_REF_NAME$tick"
    inline = $true
})

$fields.Add(@{
    name   = "Configuration"
    value  = "$tick" + "Release x64$tick"
    inline = $true
})

$fields.Add(@{
    name   = if ($hasFile) { "Attached File" } else { "Windows Installer" }
    value  = if ($hasFile) { "$tick$fileDisplay$tick" } else { $fileDisplay }
    inline = $true
})

$fields.Add(@{
    name   = "What's New"
    value  = $cleanChangelog
    inline = $false
})

$desc = if ($hasFile) {
    "Download and run the attached executable below."
} else {
    "Download and run the Windows installer below."
}

$mainContent = if ($hasFile) {
    "New Release: **Everglow Desktop $env:GITHUB_REF_NAME** is now available! Download the attached $installerName below."
} else {
    "New Release: **Everglow Desktop $env:GITHUB_REF_NAME** is now available! Download the Windows installer below."
}

$embed = @{
    title       = "Release: Everglow Desktop $env:GITHUB_REF_NAME"
    description = $desc
    color       = 4363994
    fields      = $fields
    footer      = @{ text = "Everglow Desktop Automated Release System" }
    timestamp   = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
}

$payloadObj = @{
    username         = "Everglow Desktop Release Bot"
    content          = $mainContent
    embeds           = @($embed)
    allowed_mentions = @{ parse = @() }
}
$jsonString = $payloadObj | ConvertTo-Json -Depth 6 -Compress

$separator = if ($env:DISCORD_WEBHOOK_URL.Contains('?')) { '&' } else { '?' }

try {
    if ($hasFile) {
        Add-Type -AssemblyName System.Net.Http
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $client = [System.Net.Http.HttpClient]::new()
        $multipart = [System.Net.Http.MultipartFormDataContent]::new()
        $jsonContent = [System.Net.Http.StringContent]::new($jsonString, [System.Text.Encoding]::UTF8, "application/json")
        $multipart.Add($jsonContent, "payload_json")
        $fileBytes = [System.IO.File]::ReadAllBytes($InstallerPath)
        $fileContent = [System.Net.Http.ByteArrayContent]::new($fileBytes)
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/octet-stream")
        $multipart.Add($fileContent, "files[0]", $installerName)
        $response = $client.PostAsync("$env:DISCORD_WEBHOOK_URL${separator}wait=true", $multipart).GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "HTTP $([int]$response.StatusCode): $($response.ReasonPhrase)"
        }
    } else {
        Invoke-RestMethod -Uri "$env:DISCORD_WEBHOOK_URL${separator}wait=true" -Method Post -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($jsonString)) | Out-Null
    }
} catch {
    throw 'Discord notification failed. The release is already published; check the webhook secret before retrying.'
}

param([Parameter(Mandatory)][string]$Installer)
$ErrorActionPreference = 'Stop'
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$config = Get-Content src-tauri/tauri.conf.json -Raw | ConvertFrom-Json
$version = $config.version
$product = 'Everglow Installer Test'
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$product"
$productKey = "HKCU:\Software\$product\$product"
$installDir = Join-Path $env:LOCALAPPDATA $product
$dataDir = Join-Path $env:LOCALAPPDATA 'com.everglow.installer-test'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) "$product.lnk"
if ((Test-Path $uninstallKey) -or (Test-Path $installDir) -or (Test-Path $dataDir)) {
  throw 'Installer test fixture already exists; refusing to overwrite it.'
}
if ([Diagnostics.FileVersionInfo]::GetVersionInfo($Installer).ProductName -ne $product) {
  throw 'Only the isolated installer-test.json build can run in this test.'
}
function Assert($condition, $message) {
  if (-not $condition) { throw $message }
  Write-Output "PASS: $message"
}
function RunInstaller([string]$arguments, [int]$expected = 0) {
  $process = Start-Process -FilePath $Installer -ArgumentList $arguments -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(120000)) { $process.Kill(); throw 'Installer timed out' }
  Assert ($process.ExitCode -eq $expected) "Installer $arguments exits $expected (actual $($process.ExitCode))"
}
try {
  RunInstaller '/S'
  Assert ((Get-ItemProperty $uninstallKey).DisplayVersion -eq $version) 'Fresh installation registers the version'
  Assert (Test-Path (Join-Path $installDir 'everglow-desktop.exe')) 'Fresh installation copies the app'
  Assert (Test-Path $shortcut) 'Fresh installation creates the Start menu shortcut'
  $shortcutHash = (Get-FileHash -LiteralPath $shortcut).Hash
  New-Item -ItemType Directory -Path $dataDir | Out-Null
  $marker = Join-Path $dataDir 'fake-session.txt'
  Set-Content -LiteralPath $marker -Value 'fake session only'
  $markerHash = (Get-FileHash -LiteralPath $marker).Hash

  # An invalid old uninstaller command makes uninstall-before-install fail.
  Set-ItemProperty $uninstallKey -Name DisplayVersion -Value '0.3.0'
  Set-ItemProperty $uninstallKey -Name UninstallString -Value ('"' + (Join-Path $installDir 'must-not-run.exe') + '"')
  RunInstaller '/P'
  Assert ((Get-ItemProperty $uninstallKey).DisplayVersion -eq $version) 'Passive upgrade replaces the registered older version'
  Assert ((Get-FileHash -LiteralPath $marker).Hash -eq $markerHash) 'Upgrade preserves fake session data'
  Assert ((Get-FileHash -LiteralPath $shortcut).Hash -eq $shortcutHash) 'Upgrade preserves the existing shortcut'
  Assert ((Get-ItemProperty $productKey).'(default)' -eq $installDir) 'Upgrade preserves the installation directory'

  Set-ItemProperty $uninstallKey -Name UninstallString -Value ('"' + (Join-Path $installDir 'must-not-run.exe') + '"')
  RunInstaller '/S /UPDATE'
  Assert ((Get-FileHash -LiteralPath $marker).Hash -eq $markerHash) 'Same-version repair preserves fake session data without an old uninstaller'

  $exeHash = (Get-FileHash -LiteralPath (Join-Path $installDir 'everglow-desktop.exe')).Hash
  Set-ItemProperty $uninstallKey -Name DisplayVersion -Value '99.0.0'
  RunInstaller '/S /UPDATE' 1638
  Assert ((Get-ItemProperty $uninstallKey).DisplayVersion -eq '99.0.0') 'Downgrade is refused before changing registration'
  Assert ((Get-FileHash -LiteralPath (Join-Path $installDir 'everglow-desktop.exe')).Hash -eq $exeHash) 'Downgrade leaves installed files intact'
} finally {
  # Every fixture path is fixed above; never touch the real Everglow installation.
  if (Test-Path (Join-Path $installDir 'uninstall.exe')) {
    $cleanup = Start-Process -FilePath (Join-Path $installDir 'uninstall.exe') -ArgumentList '/S' -WindowStyle Hidden -PassThru
    if (-not $cleanup.WaitForExit(30000)) { throw 'Test uninstaller cleanup timed out' }
    if ($cleanup.ExitCode -ne 0) { throw "Test uninstaller cleanup failed: $($cleanup.ExitCode)" }
  }
  foreach ($path in @($installDir, $dataDir)) {
    $resolved = [IO.Path]::GetFullPath($path)
    if ($resolved -notin @((Join-Path $env:LOCALAPPDATA $product), (Join-Path $env:LOCALAPPDATA 'com.everglow.installer-test'))) {
      throw "Unexpected fixture cleanup path: $resolved"
    }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
  }
  if (Test-Path $productKey) { Remove-Item -LiteralPath $productKey -Recurse -Force }
}

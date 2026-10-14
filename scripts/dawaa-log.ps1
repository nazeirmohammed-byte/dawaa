# Shared log writer. One file per service per hour: logs\<service>-yyyyMMdd-HH.log
# Previous hours are zipped. Files older than 24 hours are deleted.

$script:DawaaLogDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'logs'

function Write-DawaaLog {
  param(
    [Parameter(Mandatory = $true)][string]$Service,
    [Parameter(Mandatory = $true)][string]$Level,
    [Parameter(Mandatory = $true)][string]$Message
  )
  $allowed = @('info', 'warn', 'error', 'action')
  if ($allowed -notcontains $Level) { $Level = 'info' }
  if (-not (Test-Path $script:DawaaLogDir)) {
    New-Item -ItemType Directory -Path $script:DawaaLogDir | Out-Null
  }
  $now = Get-Date
  $stamp = $now.ToString('yyyyMMdd-HH')
  $path = Join-Path $script:DawaaLogDir ("{0}-{1}.log" -f $Service, $stamp)
  $text = ($Message -replace '\s+', ' ').Trim()
  if ($text.Length -gt 400) { $text = $text.Substring(0, 400) }
  if (-not $text) { return }
  $line = '{0} {1,-6} {2} {3}' -f $now.ToString('yyyy-MM-dd HH:mm:ss'), $Level, $Service, $text
  Add-Content -Path $path -Value $line -Encoding UTF8
}

function Get-DawaaLevel {
  param([string]$Raw)
  $trimmed = $Raw.Trim()
  if ($trimmed.StartsWith('{')) {
    try {
      $row = $trimmed | ConvertFrom-Json
      if ($row.action) { return 'action' }
      $n = 30
      if ($null -ne $row.level) { $n = [int]$row.level }
      if ($n -ge 50) { return 'error' }
      if ($n -ge 40) { return 'warn' }
      return 'info'
    } catch {
      return 'info'
    }
  }
  if ($trimmed -match '(?i)\b(error|failed|exception)\b') { return 'error' }
  if ($trimmed -match '(?i)\bwarn') { return 'warn' }
  return 'info'
}

function Format-DawaaText {
  param([string]$Raw)
  $trimmed = $Raw.Trim()
  if ($trimmed.StartsWith('{')) {
    try {
      $row = $trimmed | ConvertFrom-Json
      if ($row.method -and $row.path) {
        return ('{0} {1} {2} {3}ms' -f $row.method, $row.path, $row.status, $row.ms)
      }
      if ($row.msg) { return [string]$row.msg }
    } catch {
      return $trimmed
    }
  }
  return $trimmed
}

function Compress-DawaaLogs {
  $dir = $script:DawaaLogDir
  if (-not (Test-Path $dir)) { return }
  $mutex = New-Object System.Threading.Mutex($false, 'Local\DawaaLogRotate')
  $owned = $false
  try {
    $owned = $mutex.WaitOne(5000)
  } catch {
    return
  }
  if (-not $owned) { return }
  try {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $now = Get-Date
    $currentStamp = $now.ToString('yyyyMMdd-HH')
    $cutoff = $now.AddHours(-24)
    Get-ChildItem -Path $dir -File | ForEach-Object {
      $file = $_
      if ($file.Name -notmatch '^(?<svc>[a-z]+)-(?<day>\d{8})-(?<hour>\d{2})\.(?<ext>log|zip)$') { return }
      $stamp = '{0}-{1}' -f $Matches.day, $Matches.hour
      $when = [datetime]::ParseExact($Matches.day + $Matches.hour, 'yyyyMMddHH', [cultureinfo]::InvariantCulture)
      if ($when -lt $cutoff) {
        Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
        return
      }
      if ($file.Extension -ne '.log') { return }
      if ($stamp -ge $currentStamp) { return }
      $zipPath = [System.IO.Path]::ChangeExtension($file.FullName, '.zip')
      if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
        return
      }
      $zip = $null
      try {
        $zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $file.Name)
      } finally {
        if ($zip) { $zip.Dispose() }
      }
      if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
      }
    }
  } finally {
    if ($owned) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
  }
}

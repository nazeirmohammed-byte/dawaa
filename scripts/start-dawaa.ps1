# Starts SQL Server (if the service is installed), the API, and the web app.
# The web app includes the pharmacy screen and the platform console.
# A second launch only opens the browser when this supervisor is already running.
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'dawaa-log.ps1')

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
if (-not (Test-Path $script:DawaaLogDir)) {
  New-Item -ItemType Directory -Path $script:DawaaLogDir | Out-Null
}

$pidFile = Join-Path $script:DawaaLogDir 'supervisor.pid'
if (Test-Path $pidFile) {
  $oldId = 0
  [void][int]::TryParse((Get-Content -LiteralPath $pidFile -TotalCount 1), [ref]$oldId)
  $old = Get-Process -Id $oldId -ErrorAction SilentlyContinue
  if ($old -and $old.ProcessName -match 'powershell|pwsh') {
    Write-DawaaLog 'starter' 'action' 'already running, opening the app'
    Start-Process 'http://127.0.0.1:4188'
    exit 0
  }
}
Set-Content -LiteralPath $pidFile -Value $PID -Encoding ASCII
try { $Host.UI.RawUI.WindowTitle = 'Dawaa' } catch { }

function Test-Listening {
  param([int]$Port)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $wait = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $wait.AsyncWaitHandle.WaitOne(400)
    if (-not $ok) { return $false }
    $client.EndConnect($wait)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Start-SqlIfNeeded {
  $services = @(Get-Service -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*'
  })
  if ($services.Count -eq 0) {
    Write-DawaaLog 'starter' 'warn' 'SQL Server service was not found'
    return
  }
  $preferred = $services | Where-Object { $_.Name -eq 'MSSQL$TPADB' } | Select-Object -First 1
  $target = $preferred
  if (-not $target) { $target = $services | Where-Object { $_.Status -eq 'Running' } | Select-Object -First 1 }
  if (-not $target) { $target = $services | Select-Object -First 1 }
  if ($target.Status -eq 'Running') {
    Write-DawaaLog 'starter' 'info' ("sql {0} running" -f $target.Name)
    return
  }
  try {
    Start-Service -Name $target.Name -ErrorAction Stop
    Write-DawaaLog 'starter' 'action' ("sql {0} started" -f $target.Name)
  } catch {
    Write-DawaaLog 'starter' 'warn' ("sql {0} not started: {1}" -f $target.Name, $_.Exception.Message)
  }
}

function Start-LoggedService {
  param(
    [string]$Name,
    [string]$Command
  )
  $arg = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Name {1} -Command "{2}" -Root "{3}"' -f (
    (Join-Path $PSScriptRoot 'run-logged.ps1'),
    $Name,
    $Command,
    $root
  )
  Start-Process -FilePath 'powershell.exe' -ArgumentList $arg -WindowStyle Hidden | Out-Null
  Write-DawaaLog 'starter' 'action' ("launch {0}" -f $Name)
}

function Get-DawaaLaunchers {
  param([string]$Name)
  $pattern = "-Name $Name "
  @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'run-logged\.ps1' -and $_.CommandLine.Contains($pattern)
  })
}

function Stop-DawaaTree {
  param([int]$ProcessId)
  & taskkill.exe /PID $ProcessId /T /F | Out-Null
}

function Get-LauncherForPort {
  param([int]$Port, [string]$Name)
  $listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listen) { return 0 }
  $id = [int]$listen.OwningProcess
  $pattern = "-Name $Name "
  for ($guard = 0; $guard -lt 16 -and $id -gt 0; $guard++) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
    if (-not $proc) { return 0 }
    if ($proc.Name -eq 'powershell.exe' -and $proc.CommandLine -match 'run-logged\.ps1' -and $proc.CommandLine.Contains($pattern)) {
      return [int]$proc.ProcessId
    }
    $id = [int]$proc.ParentProcessId
  }
  return 0
}

$opened = $false
$apiUp = $false
$webUp = $false
$sqlNoted = $false
$lastApiStart = [datetime]::MinValue
$lastWebStart = [datetime]::MinValue
$apiDownSince = [datetime]::MinValue
$webDownSince = [datetime]::MinValue
Write-DawaaLog 'starter' 'action' 'supervisor started'
Write-Host 'Dawaa starter. This window keeps watch. Close it when you want to stop watching.'
Write-Host 'App  http://127.0.0.1:4188'
Write-Host 'API  http://127.0.0.1:4190'
Write-Host ("Logs {0}" -f $script:DawaaLogDir)

try {
  while ($true) {
    if (-not $sqlNoted) {
      Start-SqlIfNeeded
      $sqlNoted = $true
    }
    $apiListening = Test-Listening 4190
    $apiLaunchers = @(Get-DawaaLaunchers 'api')
    if ($apiListening) {
      $apiDownSince = [datetime]::MinValue
      if ($apiLaunchers.Count -gt 1) {
        $owner = Get-LauncherForPort 4190 'api'
        foreach ($extra in $apiLaunchers) {
          if ($owner -ne 0 -and [int]$extra.ProcessId -ne $owner) {
            Stop-DawaaTree ([int]$extra.ProcessId)
            Write-DawaaLog 'starter' 'action' ("stopped extra api {0}" -f $extra.ProcessId)
          }
        }
      }
      if (-not $apiUp) {
        Write-DawaaLog 'starter' 'info' 'api up on 4190'
        Write-Host 'API is up'
        $apiUp = $true
      }
    } else {
      if ($apiUp) { Write-DawaaLog 'starter' 'warn' 'api went down' }
      $apiUp = $false
      if ($apiDownSince -eq [datetime]::MinValue) { $apiDownSince = Get-Date }
      $apiDownFor = ((Get-Date) - $apiDownSince).TotalSeconds
      $apiIdle = ((Get-Date) - $lastApiStart).TotalSeconds
      if ($apiLaunchers.Count -eq 0 -and $apiDownFor -gt 15 -and $apiIdle -gt 45) {
        Write-DawaaLog 'starter' 'action' 'starting api'
        Write-Host 'Starting API'
        Start-LoggedService -Name 'api' -Command '--filter @dawaa/api dev'
        $lastApiStart = Get-Date
        $apiDownSince = Get-Date
      } elseif ($apiLaunchers.Count -gt 0 -and $apiDownFor -gt 120 -and $apiIdle -gt 45) {
        foreach ($extra in $apiLaunchers) { Stop-DawaaTree ([int]$extra.ProcessId) }
        Write-DawaaLog 'starter' 'warn' 'api stayed down, restarting the one copy'
        Write-Host 'Restarting API'
        Start-LoggedService -Name 'api' -Command '--filter @dawaa/api dev'
        $lastApiStart = Get-Date
        $apiDownSince = Get-Date
      }
    }
    $webListening = Test-Listening 4188
    $webLaunchers = @(Get-DawaaLaunchers 'web')
    if ($webListening) {
      $webDownSince = [datetime]::MinValue
      if ($webLaunchers.Count -gt 1) {
        $owner = Get-LauncherForPort 4188 'web'
        foreach ($extra in $webLaunchers) {
          if ($owner -ne 0 -and [int]$extra.ProcessId -ne $owner) {
            Stop-DawaaTree ([int]$extra.ProcessId)
            Write-DawaaLog 'starter' 'action' ("stopped extra web {0}" -f $extra.ProcessId)
          }
        }
      }
      if (-not $webUp) {
        Write-DawaaLog 'starter' 'info' 'web up on 4188'
        Write-Host 'Web is up'
        $webUp = $true
        if (-not $opened) {
          Start-Process 'http://127.0.0.1:4188'
          Write-DawaaLog 'starter' 'action' 'opened http://127.0.0.1:4188'
          $opened = $true
        }
      }
    } else {
      if ($webUp) { Write-DawaaLog 'starter' 'warn' 'web went down' }
      $webUp = $false
      if ($webDownSince -eq [datetime]::MinValue) { $webDownSince = Get-Date }
      $webDownFor = ((Get-Date) - $webDownSince).TotalSeconds
      $webIdle = ((Get-Date) - $lastWebStart).TotalSeconds
      if ($webLaunchers.Count -eq 0 -and $webDownFor -gt 15 -and $webIdle -gt 45) {
        Write-DawaaLog 'starter' 'action' 'starting web'
        Write-Host 'Starting web'
        Start-LoggedService -Name 'web' -Command '--filter @dawaa/web dev'
        $lastWebStart = Get-Date
        $webDownSince = Get-Date
      } elseif ($webLaunchers.Count -gt 0 -and $webDownFor -gt 120 -and $webIdle -gt 45) {
        foreach ($extra in $webLaunchers) { Stop-DawaaTree ([int]$extra.ProcessId) }
        Write-DawaaLog 'starter' 'warn' 'web stayed down, restarting the one copy'
        Write-Host 'Restarting web'
        Start-LoggedService -Name 'web' -Command '--filter @dawaa/web dev'
        $lastWebStart = Get-Date
        $webDownSince = Get-Date
      }
    }
    Compress-DawaaLogs
    Start-Sleep -Seconds 20
  }
} finally {
  if (Test-Path $pidFile) {
    $current = Get-Content -LiteralPath $pidFile -TotalCount 1 -ErrorAction SilentlyContinue
    if ($current -eq "$PID") { Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue }
  }
}

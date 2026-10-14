# Runs one service and writes its output into logs\<name>-yyyyMMdd-HH.log
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [Parameter(Mandatory = $true)][string]$Command,
  [Parameter(Mandatory = $true)][string]$Root
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'dawaa-log.ps1')

$pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $pnpm) { $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue }
$corepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
if ($pnpm) {
  $exe = $pnpm.Source
  $launch = "`"$exe`" $Command"
} elseif ($corepack) {
  $exe = $corepack.Source
  $launch = "`"$exe`" pnpm $Command"
} else {
  Write-DawaaLog $Name 'error' 'pnpm was not found on PATH'
  exit 1
}
Write-DawaaLog $Name 'action' "start $Command"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.Arguments = "/d /s /c `"$launch`""
$psi.WorkingDirectory = $Root
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
$psi.EnvironmentVariables['API_PORT'] = '4190'

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$queue = New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'
Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -MessageData $queue -Action {
  if ($null -ne $EventArgs.Data -and $EventArgs.Data -ne '') {
    $Event.MessageData.Enqueue([string]$EventArgs.Data)
  }
} | Out-Null
Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived -MessageData $queue -Action {
  if ($null -ne $EventArgs.Data -and $EventArgs.Data -ne '') {
    $Event.MessageData.Enqueue([string]$EventArgs.Data)
  }
} | Out-Null
[void]$proc.Start()
$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()

$lastZip = [datetime]::MinValue
while (-not $proc.HasExited) {
  $line = $null
  while ($queue.TryDequeue([ref]$line)) {
    Write-DawaaLog $Name (Get-DawaaLevel $line) (Format-DawaaText $line)
  }
  if (((Get-Date) - $lastZip).TotalSeconds -gt 60) {
    Compress-DawaaLogs
    $lastZip = Get-Date
  }
  Start-Sleep -Milliseconds 400
}
$proc.WaitForExit()
Start-Sleep -Milliseconds 500
$line = $null
while ($queue.TryDequeue([ref]$line)) {
  Write-DawaaLog $Name (Get-DawaaLevel $line) (Format-DawaaText $line)
}
Write-DawaaLog $Name 'action' ("stopped exit={0}" -f $proc.ExitCode)
Get-EventSubscriber | Unregister-Event -Force
exit $proc.ExitCode

# OpenWA Background Service Manager
# Cleanly handles background start, stop, restart, and status reporting
param (
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "status", "restart")]
    [string]$Action = "status"
)

# Resolve project root dynamically so this works on any computer / any folder path
if ($PSScriptRoot) {
    $RootDir = Split-Path -Parent $PSScriptRoot
} else {
    $RootDir = (Get-Item -Path $MyInvocation.MyCommand.Definition).Directory.Parent.FullName
}
$DataDir = Join-Path $RootDir "data"
$ApiLog = Join-Path $DataDir "service-api.log"
$ApiErr = Join-Path $DataDir "service-api-err.log"
$DashLog = Join-Path $DataDir "service-dashboard.log"
$DashErr = Join-Path $DataDir "service-dashboard-err.log"

# Ensure data directory exists
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

function Test-PortListening ([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        # Get-NetTCPConnection can return stale or incomplete results for loopback
        # listeners. Probe the address the services actually expose instead.
        $connect = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $connect.AsyncWaitHandle.WaitOne(2000)) {
            return $false
        }
        $client.EndConnect($connect)
        return $true
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Get-ProcessByPort ([int]$Port) {
    try {
        $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
        if ($conns.Count -gt 0) {
            $targetPid = $conns[0].OwningProcess
            return Get-Process -Id $targetPid -ErrorAction SilentlyContinue
        }
    } catch {}
    return $null
}

function Get-ProcessDescription ($Process) {
    if (-not $Process) { return 'unknown process' }
    try {
        $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($Process.Id)" -ErrorAction Stop).CommandLine
        if ($commandLine) { return "PID $($Process.Id) ($commandLine)" }
    } catch {}
    return "PID $($Process.Id) ($($Process.ProcessName))"
}

function Show-RecentLog ([string]$Path) {
    if (Test-Path $Path) {
        Get-Content -Path $Path -Tail 20 -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Host "     $_" -ForegroundColor DarkGray }
    }
}

function Test-ApiReady {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:2785/api/health/ready" -TimeoutSec 2 -ErrorAction Stop
        return $health.status -eq 'ok'
    } catch {
        return $false
    }
}

function Test-HttpOk ([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    } catch {
        return $false
    }
}

function Wait-ForService ([string]$Name, [scriptblock]$IsReady, $Process, [int]$TimeoutSeconds, [string]$ErrorLog) {
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $nextProgressAt = 5
    while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        if (& $IsReady) { return $true }

        if ($Process -and $Process.HasExited) {
            Write-Error "$Name exited with code $($Process.ExitCode). Recent error output:"
            Show-RecentLog $ErrorLog
            return $false
        }

        if ($stopwatch.Elapsed.TotalSeconds -ge $nextProgressAt) {
            Write-Host (" [..] {0} is still starting ({1}s / {2}s)..." -f $Name, [int]$stopwatch.Elapsed.TotalSeconds, $TimeoutSeconds) -ForegroundColor DarkGray
            $nextProgressAt += 5
        }
        Start-Sleep -Milliseconds 500
    }

    Write-Error "$Name did not become ready within $TimeoutSeconds seconds. Recent error output:"
    Show-RecentLog $ErrorLog
    return $false
}

function Start-Services {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "          OpenWA Local Service Manager             " -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan

    # 1. Start OpenWA Backend API (Port 2785)
    if (Test-PortListening 2785) {
        if (Test-ApiReady) {
            Write-Host " [OK] OpenWA API Gateway already active and healthy on port 2785." -ForegroundColor Green
        } else {
            $owner = Get-ProcessByPort 2785
            Write-Error "Port 2785 is occupied but is not a healthy OpenWA gateway: $(Get-ProcessDescription $owner)"
            Write-Host "     Stop the conflicting process, then run START-SOFTWARE.bat again." -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host " [..] Starting OpenWA API Gateway (Port 2785)..." -ForegroundColor Yellow
        $cacheDir = Join-Path $DataDir "node-compile-cache"
        New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
        # Persist V8's compile cache between launches. This is especially valuable on Windows,
        # where loading the large production bundle can otherwise dominate a cold start.
        $env:NODE_COMPILE_CACHE = $cacheDir
        $apiParams = @{
            FilePath = "node.exe"
            ArgumentList = "`"$(Join-Path $RootDir 'dist\main.js')`""
            WorkingDirectory = $RootDir
            RedirectStandardOutput = $ApiLog
            RedirectStandardError = $ApiErr
            WindowStyle = "Hidden"
        }
        $existingApi = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
            Where-Object { $_.CommandLine -like "*$RootDir*dist*main.js*" }
        $apiProcess = $null
        if ($existingApi) {
            $apiProcess = Get-Process -Id $existingApi[0].ProcessId -ErrorAction SilentlyContinue
            Write-Host " [..] Waiting for the existing OpenWA API process (PID $($existingApi[0].ProcessId))..." -ForegroundColor DarkGray
        } else {
            $apiProcess = Start-Process @apiParams -PassThru
        }

        if (Wait-ForService "OpenWA API Gateway" ${function:Test-ApiReady} $apiProcess 90 $ApiErr) {
            Write-Host " [OK] OpenWA API Gateway is healthy on port 2785." -ForegroundColor Green
        } else {
            Write-Host "     Full logs: data\service-api.log and data\service-api-err.log" -ForegroundColor Yellow
            exit 1
        }
    }

    # 2. Serve the prebuilt Dashboard and embedded Bulk workspace (Port 2886)
    if (Test-PortListening 2886) {
        if (Test-HttpOk "http://127.0.0.1:2886/") {
            Write-Host " [OK] Core Dashboard already active and healthy on port 2886." -ForegroundColor Green
        } else {
            $owner = Get-ProcessByPort 2886
            Write-Error "Port 2886 is occupied but is not serving the OpenWA dashboard: $(Get-ProcessDescription $owner)"
            exit 1
        }
    } else {
        Write-Host " [..] Starting Core Dashboard (Port 2886)..." -ForegroundColor Yellow
        $viteBin = Join-Path $RootDir "dashboard\node_modules\vite\bin\vite.js"
        $dashDir = Join-Path $RootDir "dashboard"
        
        if (-not (Test-Path (Join-Path $dashDir 'dist\index.html'))) {
            Write-Error "Dashboard build missing. Run npm run dashboard:build."
            exit 1
        }
        $dashParams = @{
            FilePath = "node.exe"
            ArgumentList = "`"$viteBin`" preview --host 127.0.0.1 --port 2886 --strictPort"
            WorkingDirectory = $dashDir
            RedirectStandardOutput = $DashLog
            RedirectStandardError = $DashErr
            WindowStyle = "Hidden"
        }
        $dashProcess = Start-Process @dashParams -PassThru
        if (Wait-ForService "Core Dashboard" { Test-HttpOk "http://127.0.0.1:2886/" } $dashProcess 45 $DashErr) {
            Write-Host " [OK] Core Dashboard live on http://127.0.0.1:2886/" -ForegroundColor Green
        } else {
            Write-Host "     Full logs: data\service-dashboard.log and data\service-dashboard-err.log" -ForegroundColor Yellow
            exit 1
        }
    }

    Write-Host ""
    Write-Host "All OpenWA components are ready!" -ForegroundColor Cyan
    Write-Host " -> OpenWA Core Dashboard:   http://127.0.0.1:2886/" -ForegroundColor White
    Write-Host " -> Bulk Campaign Workspace: http://127.0.0.1:2886/bulk-campaign" -ForegroundColor White
    Write-Host " -> OpenWA API Gateway Docs: http://127.0.0.1:2785/api/docs" -ForegroundColor White
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Stop-Services {
    Write-Host ""
    Write-Host "[OpenWA Service Manager] Stopping background services..." -ForegroundColor Yellow

    $ports = @(2886, 2785)
    foreach ($p in $ports) {
        $proc = Get-ProcessByPort $p
        if ($proc) {
            Write-Host " Stopping process PID $($proc.Id) (Port $p)..." -ForegroundColor Gray
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }

    Start-Sleep -Seconds 1
    Write-Host "[OK] All OpenWA services stopped." -ForegroundColor Green
    Write-Host ""
}

function Get-ServiceStatus {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "              OpenWA Services Status                      " -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan

    $services = @(
        @{ Name = "OpenWA API Gateway"; Port = 2785; Url = "http://127.0.0.1:2785/api/docs" },
        @{ Name = "OpenWA Dashboard + Bulk Workspace"; Port = 2886; Url = "http://127.0.0.1:2886/" }
    )

    foreach ($s in $services) {
        $isListening = Test-PortListening $s.Port
        $proc = Get-ProcessByPort $s.Port

        if ($isListening) {
            $pidStr = if ($proc) { $proc.Id } else { "Active" }
            $memMb = if ($proc) { [math]::Round($proc.WorkingSet64 / 1MB, 1) } else { "N/A" }
            Write-Host (" [ONLINE]  {0,-28} Port: {1,-5} PID: {2,-7} RAM: {3} MB" -f $s.Name, $s.Port, $pidStr, $memMb) -ForegroundColor Green
            Write-Host ("           URL: {0}" -f $s.Url) -ForegroundColor DarkGray
        } else {
            Write-Host (" [OFFLINE] {0,-28} Port: {1,-5} (Not Running)" -f $s.Name, $s.Port) -ForegroundColor Red
        }
    }

    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
}

if ($Action -eq "start") {
    Start-Services
} elseif ($Action -eq "stop") {
    Stop-Services
} elseif ($Action -eq "restart") {
    Stop-Services
    Start-Sleep -Seconds 2
    Start-Services
} else {
    Get-ServiceStatus
}

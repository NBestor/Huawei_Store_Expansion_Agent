$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$expectedVersion = '0.3.0'
$requestedPort = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$candidatePorts = if ($env:PORT) { @($requestedPort) } else { @($requestedPort..($requestedPort + 9)) }

function Test-Workbench([string]$address) {
    try {
        $response = Invoke-RestMethod "$address/api/status" -TimeoutSec 2
        return ($response.mode -eq 'local' -and $response.version -eq $expectedVersion -and $response.storage -eq 'SQLite')
    } catch {
        return $false
    }
}

try {
    foreach ($candidatePort in $candidatePorts) {
        $candidateUrl = "http://127.0.0.1:$candidatePort"
        if (Test-Workbench $candidateUrl) {
            Write-Host "Workbench is already running: $candidateUrl"
            Start-Process $candidateUrl
            exit 0
        }
    }

    $candidates = @()
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand) { $candidates += $nodeCommand.Source }
    $candidates += (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'nodejs\node.exe') }
    if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe') }
    $nodeExecutable = $null
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $version = & $candidate --version
            if ($LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.(\d+)\.' -and [int]$Matches[1] -ge 24) {
                $nodeExecutable = $candidate
                break
            }
        }
    }
    if (-not $nodeExecutable) {
        throw 'Node.js 24+ was not found. Install Node.js 24 LTS from https://nodejs.org/ and retry.'
    }

    $runtimeDirectory = Join-Path $projectRoot 'app\.runtime'
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    foreach ($candidatePort in $candidatePorts) {
        $candidateUrl = "http://127.0.0.1:$candidatePort"
        $outputLog = Join-Path $runtimeDirectory "server-$candidatePort-output.log"
        $errorLog = Join-Path $runtimeDirectory "server-$candidatePort-error.log"
        $previousPort = $env:PORT
        $env:PORT = [string]$candidatePort
        try {
            $process = Start-Process -FilePath $nodeExecutable -ArgumentList 'app/server.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
        } finally {
            $env:PORT = $previousPort
        }
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if (Test-Workbench $candidateUrl) {
                Write-Host "Workbench is ready: $candidateUrl"
                Start-Process $candidateUrl
                exit 0
            }
            if ($process.HasExited) { break }
            Start-Sleep -Milliseconds 300
        }
        if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    }
    throw "Startup failed on ports $($candidatePorts -join ', '). Check logs: $runtimeDirectory"
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

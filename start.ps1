param([ValidateRange(1024, 65515)][int]$Port = 8765)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'Missing .venv. Follow the setup steps in README.md.'
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'frontend\dist\index.html'))) {
    throw 'Missing frontend build. Run pnpm --dir frontend build.'
}
$selected = $null
foreach ($candidate in $Port..($Port + 20)) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidate)
    try {
        $listener.Start()
        $selected = $candidate
        break
    } catch [System.Net.Sockets.SocketException] {
        continue
    } finally {
        $listener.Stop()
    }
}
if ($null -eq $selected) { throw 'No available local port in the requested range.' }
Write-Host "Open http://127.0.0.1:$selected"
Write-Host 'Press Ctrl+C to stop. Workspace and conversation are saved locally (not encrypted).'
Push-Location $root
try {
    & $python -m uvicorn backend.main:app --host 127.0.0.1 --port $selected --no-access-log
    if ($LASTEXITCODE -ne 0) { throw "Server exited with code $LASTEXITCODE." }
} finally {
    Pop-Location
}

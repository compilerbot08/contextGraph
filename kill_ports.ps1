# Force-Clear Service Ports (Context Graph System)
# --------------------------------------------------
# This script identifies and terminates any process running on ports 4000, 5000, 8000, or 5173.

$ports = @(4000, 5000, 8000, 5173)

Write-Host "--- Scanning for Port Conflicts ---" -ForegroundColor Cyan

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $pid = $conn.OwningProcess
            try {
                $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Host "[!] Found conflict on port $port (PID: $pid, Name: $($process.Name))" -ForegroundColor Yellow
                    Stop-Process -Id $pid -Force
                    Write-Host "    -> Terminated PID $pid" -ForegroundColor Green
                }
            } catch {
                Write-Host "    [!] Failed to terminate PID $pid (Access Denied?)" -ForegroundColor Red
            }
        }
    }
}

Write-Host "--- Environment Sanitized ---" -ForegroundColor Cyan

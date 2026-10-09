Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3000, 5173, 5174, 8080, 8000 } | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Select-Object ProcessId, CommandLine | Format-Table -AutoSize

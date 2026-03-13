import { spawn, spawnSync } from 'node:child_process'

const frontendDir = process.cwd()
const vitePort = 5218
const frontendDirLower = frontendDir.toLowerCase()

function runPowerShell(command) {
  return spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    cwd: frontendDir,
    encoding: 'utf8',
  })
}

function listListeners(port) {
  const frontend = frontendDir.replace(/'/g, "''")
  const result = runPowerShell(`
$port = ${port}
$frontend = '${frontend}'
$items = @()
$conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
foreach ($conn in $conns) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($conn.OwningProcess)" | Select-Object -First 1
  if ($proc) {
    $items += [PSCustomObject]@{
      pid = [int]$proc.ProcessId
      name = [string]$proc.Name
      commandLine = [string]$proc.CommandLine
    }
  }
}
$items | ConvertTo-Json -Compress
`)

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `failed to inspect port ${port}`)
  }

  const text = result.stdout.trim()
  if (!text) return []

  const parsed = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function isProjectVite(proc) {
  const cmd = String(proc.commandLine || '').toLowerCase()
  return cmd.includes(frontendDirLower) && cmd.includes('vite')
}

function ensureVitePortAvailable(port) {
  if (process.platform !== 'win32') return

  const listeners = listListeners(port)
  for (const proc of listeners) {
    if (isProjectVite(proc)) {
      console.log(`[dev] cleaning stale Vite on ${port} (PID ${proc.pid})`)
      const killed = spawnSync('taskkill.exe', ['/F', '/T', '/PID', String(proc.pid)], {
        cwd: frontendDir,
        stdio: 'inherit',
      })
      if (killed.status !== 0) {
        throw new Error(`failed to kill stale Vite process ${proc.pid}`)
      }
      continue
    }

    const name = proc.name || 'unknown'
    const cmd = proc.commandLine || ''
    throw new Error(`port ${port} is already occupied by ${name} (PID ${proc.pid})\n${cmd}`)
  }
}

function main() {
  ensureVitePortAvailable(vitePort)

  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm'
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm run dev:raw']
    : ['run', 'dev:raw']

  const child = spawn(command, args, {
    cwd: frontendDir,
    stdio: 'inherit',
    env: process.env,
  })

  child.on('error', (error) => {
    console.error(`[dev] failed to start Vite: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

try {
  main()
} catch (error) {
  console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

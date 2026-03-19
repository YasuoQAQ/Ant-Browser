import { useEffect, useMemo, useState } from 'react'
import { Bot, Copy, Rocket } from 'lucide-react'
import { Button, Card, toast } from '../../../shared/components'
import { fetchAPIServerInfo, fetchLaunchServerInfo } from '../api'

const DEFAULT_LAUNCH_BASE_URL = 'http://127.0.0.1:19876'
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:49999'

function buildLaunchRequest(baseUrl: string): string {
  return `curl -X POST ${baseUrl}/api/launch \\
  -H "Content-Type: application/json" \\
  -d '{
    "code": "A3F9K2",
    "launchArgs": ["--window-size=1280,800", "--lang=en-US"],
    "startUrls": ["https://example.com"],
    "skipDefaultStartUrls": true
  }'`
}

function buildInstanceStartRequest(baseUrl: string): string {
  return `curl -X POST ${baseUrl}/api/instances/start \\
  -H "Content-Type: application/json" \\
  -d '{
    "profileId": "550e8400-e29b-41d4-a716-446655440000",
    "launchArgs": ["--window-size=1440,900"],
    "startUrls": ["https://example.com", "https://ipinfo.io/json"],
    "skipDefaultStartUrls": true,
    "resetUserData": false
  }'`
}

function buildInstanceRefreshRequest(baseUrl: string): string {
  return `curl -X POST ${baseUrl}/api/instances/refresh \\
  -H "Content-Type: application/json" \\
  -d '{
    "profileId": "550e8400-e29b-41d4-a716-446655440000",
    "proxyConfig": "http://127.0.0.1:7890",
    "fingerprintArgs": ["--fingerprint=9527", "--lang=en-US"],
    "launchArgs": ["--window-size=1440,900"],
    "startUrls": ["https://example.com"],
    "skipDefaultStartUrls": true,
    "resetUserData": true,
    "startAfterRefresh": true
  }'`
}

const sampleInstanceResponse = `{
  "ok": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "pid": 12345,
  "debugPort": 9222,
  "running": true,
  "userDataDir": "data/browser/550e8400-e29b-41d4-a716-446655440000",
  "proxyId": "",
  "proxyConfig": "http://127.0.0.1:7890",
  "effectiveProxy": "http://127.0.0.1:7890",
  "fingerprintArgs": ["--fingerprint=9527", "--lang=en-US"],
  "launchArgs": ["--disable-features=Translate"],
  "requestedLaunchArgs": ["--window-size=1440,900"],
  "requestedStartUrls": ["https://example.com"],
  "skipDefaultStartUrls": true,
  "resetUserData": true,
  "lastStartAt": "2026-03-19T10:20:30Z",
  "lastStopAt": "2026-03-19T10:19:58Z",
  "wsEndpoint": "ws://127.0.0.1:9222/devtools/page/xxx"
}`

function buildSampleLogsRequest(baseUrl: string): string {
  return `curl ${baseUrl}/api/launch/logs?limit=20`
}

function CopyCodeButton({ text }: { text: string }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => toast.success('已复制'))
      }}
    >
      <Copy className="w-3.5 h-3.5" /> 复制
    </Button>
  )
}

export function AutomationPage() {
  const [launchBaseUrl, setLaunchBaseUrl] = useState(DEFAULT_LAUNCH_BASE_URL)
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL)
  const [launchServerReady, setLaunchServerReady] = useState(false)
  const [apiServerReady, setApiServerReady] = useState(false)

  useEffect(() => {
    let disposed = false

    void Promise.allSettled([fetchLaunchServerInfo(), fetchAPIServerInfo()])
      .then(([launchResult, apiResult]) => {
        if (disposed) return

        if (launchResult.status === 'fulfilled') {
          if (launchResult.value.baseUrl) {
            setLaunchBaseUrl(launchResult.value.baseUrl)
          }
          setLaunchServerReady(launchResult.value.ready)
        }

        if (apiResult.status === 'fulfilled') {
          if (apiResult.value.baseUrl) {
            setApiBaseUrl(apiResult.value.baseUrl)
          }
          setApiServerReady(apiResult.value.ready)
        }
      })
      .catch(() => {})

    return () => {
      disposed = true
    }
  }, [])

  const sampleLaunchRequest = useMemo(() => buildLaunchRequest(launchBaseUrl), [launchBaseUrl])
  const sampleInstanceStartRequest = useMemo(() => buildInstanceStartRequest(apiBaseUrl), [apiBaseUrl])
  const sampleInstanceRefreshRequest = useMemo(() => buildInstanceRefreshRequest(apiBaseUrl), [apiBaseUrl])
  const sampleLogsRequest = useMemo(() => buildSampleLogsRequest(launchBaseUrl), [launchBaseUrl])

  return (
    <div className="space-y-5 animate-fade-in">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)] text-xs font-medium mb-3">
              <Bot className="w-3.5 h-3.5" /> 自动化接口
            </div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">外部脚本唤起与实例控制</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
              已支持通过 <code>LaunchCode</code> 唤起实例，以及通过 REST API 直接启动、刷新实例环境，适合 Playwright、Selenium、自研调度器等自动化流程。
            </p>
            <div className="text-xs text-[var(--color-text-muted)] mt-2 space-y-1">
              <p>
                Launch 地址：<code>{launchBaseUrl}</code>
                {!launchServerReady ? '（服务启动后会自动刷新）' : ''}
              </p>
              <p>
                API 地址：<code>{apiBaseUrl}</code>
                {!apiServerReady ? '（服务启动后会自动刷新）' : ''}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="1) LaunchCode 唤起接口"
        subtitle="POST /api/launch"
        actions={<CopyCodeButton text={sampleLaunchRequest} />}
      >
        <pre className="text-xs leading-relaxed font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border-muted)] rounded-lg p-3 overflow-x-auto">
{sampleLaunchRequest}
        </pre>
        <div className="mt-3 text-sm text-[var(--color-text-secondary)] space-y-1">
          <p><code>code</code>: 实例快捷码（必填）。</p>
          <p><code>launchArgs</code>: 仅本次启动附加的 Chrome 启动参数（可选）。</p>
          <p><code>startUrls</code>: 启动后打开的页面列表（可选）。</p>
          <p><code>skipDefaultStartUrls</code>: 设为 <code>true</code> 时不追加系统默认起始页（可选）。</p>
        </div>
      </Card>

      <Card
        title="2) 直接启动实例"
        subtitle="POST /api/instances/start"
        actions={<CopyCodeButton text={sampleInstanceStartRequest} />}
      >
        <pre className="text-xs leading-relaxed font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border-muted)] rounded-lg p-3 overflow-x-auto">
{sampleInstanceStartRequest}
        </pre>
        <div className="mt-3 text-sm text-[var(--color-text-secondary)] space-y-1">
          <p><code>profileId</code>: 实例 ID（必填）。</p>
          <p><code>launchArgs</code>: 本次启动临时附加参数，不落库。</p>
          <p><code>startUrls</code>: 本次启动指定打开页面。</p>
          <p><code>resetUserData</code>: 为 <code>true</code> 时先清空用户数据目录再启动。</p>
        </div>
      </Card>

      <Card
        title="3) 刷新实例环境"
        subtitle="POST /api/instances/refresh"
        actions={<CopyCodeButton text={sampleInstanceRefreshRequest} />}
      >
        <pre className="text-xs leading-relaxed font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border-muted)] rounded-lg p-3 overflow-x-auto">
{sampleInstanceRefreshRequest}
        </pre>
        <div className="mt-3 text-sm text-[var(--color-text-secondary)] space-y-1">
          <p>支持停止运行中的实例后，更新代理、指纹、启动参数等配置。</p>
          <p><code>startAfterRefresh</code> 默认为 <code>true</code>；若设为 <code>false</code>，仅更新配置不立即启动。</p>
          <p><code>resetUserData</code> 默认为 <code>true</code>，适合做“换环境重启”。</p>
        </div>
      </Card>

      <Card
        title="4) 实例响应结构"
        subtitle="start / refresh 成功时返回启动上下文"
        actions={<CopyCodeButton text={sampleInstanceResponse} />}
      >
        <pre className="text-xs leading-relaxed font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border-muted)] rounded-lg p-3 overflow-x-auto">
{sampleInstanceResponse}
        </pre>
        <div className="mt-3 text-sm text-[var(--color-text-secondary)] space-y-1">
          <p><code>effectiveProxy</code>: 本次实际生效代理，已包含桥接后的 socks 地址。</p>
          <p><code>requestedLaunchArgs</code>: 本次请求透传的临时启动参数。</p>
          <p><code>wsEndpoint</code>: 可直接接 CDP / Playwright。</p>
        </div>
      </Card>

      <Card
        title="5) 调用记录"
        subtitle="GET /api/launch/logs?limit=20"
        actions={<CopyCodeButton text={sampleLogsRequest} />}
      >
        <pre className="text-xs leading-relaxed font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border-muted)] rounded-lg p-3 overflow-x-auto">
{sampleLogsRequest}
        </pre>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          可查询最近接口调用记录（默认 50 条，最大 200 条），用于排查自动化脚本调用问题。实例列表会展示启动实况摘要，实例详情页可查看完整运行上下文。
        </p>
      </Card>

      <Card>
        <div className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
          <Rocket className="w-4 h-4 mt-0.5 text-[var(--color-accent)]" />
          <p>
            当前已覆盖 LaunchCode 唤起、实例启动、环境刷新三类自动化入口，后续可继续补充 Python / Playwright 模板脚本。
          </p>
        </div>
      </Card>
    </div>
  )
}

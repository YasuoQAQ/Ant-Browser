import { useEffect, useState } from 'react'
import { Bot, Copy, Rocket } from 'lucide-react'
import { Button, Card, toast } from '../../../shared/components'
import { fetchLaunchServerInfo } from '../api'

const DEFAULT_LAUNCH_BASE_URL = 'http://127.0.0.1:19876'

function buildSampleRequest(baseUrl: string): string {
  return `curl -X POST ${baseUrl}/api/launch \\
  -H "Content-Type: application/json" \\
  -d '{
    "code": "A3F9K2",
    "launchArgs": ["--window-size=1280,800", "--lang=en-US"],
    "startUrls": ["https://example.com"],
    "skipDefaultStartUrls": true
  }'`
}

const sampleResponse = `{
  "ok": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "profileName": "账号 A",
  "pid": 12345,
  "debugPort": 9222
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
  const [launchServerReady, setLaunchServerReady] = useState(false)

  useEffect(() => {
    let disposed = false

    void fetchLaunchServerInfo()
      .then((info) => {
        if (disposed) return
        if (info.baseUrl) {
          setLaunchBaseUrl(info.baseUrl)
        }
        setLaunchServerReady(info.ready)
      })
      .catch(() => {})

    return () => {
      disposed = true
    }
  }, [])

  const sampleRequest = buildSampleRequest(launchBaseUrl)
  const sampleLogsRequest = buildSampleLogsRequest(launchBaseUrl)

  return (
    <div className="space-y-5 animate-fade-in">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)] text-xs font-medium mb-3">
              <Bot className="w-3.5 h-3.5" /> 自动化（未完成）
            </div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">外部脚本唤起接口</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
              已支持通过 <code>浏览器 Code + 参数</code> 唤起实例，适合 Playwright、Selenium、自研调度器等自动化流程。
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              当前 Launch 地址：<code>{launchBaseUrl}</code>
              {!launchServerReady ? '（服务启动后会自动刷新）' : ''}
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="1) 参数化唤起接口"
        subtitle="POST /api/launch"
        actions={<CopyCodeButton text={sampleRequest} />}
      >
        <pre className="text-xs leading-relaxed font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border-muted)] rounded-lg p-3 overflow-x-auto">
{sampleRequest}
        </pre>
        <div className="mt-3 text-sm text-[var(--color-text-secondary)] space-y-1">
          <p><code>code</code>: 实例快捷码（必填）。</p>
          <p><code>launchArgs</code>: 仅本次启动附加的 Chrome 启动参数（可选）。</p>
          <p><code>startUrls</code>: 启动后打开的页面列表（可选）。</p>
          <p><code>skipDefaultStartUrls</code>: 设为 <code>true</code> 时不追加系统默认起始页（可选）。</p>
        </div>
      </Card>

      <Card
        title="2) 响应结构"
        subtitle="成功返回 pid + debugPort，可直接接 CDP"
        actions={<CopyCodeButton text={sampleResponse} />}
      >
        <pre className="text-xs leading-relaxed font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border-muted)] rounded-lg p-3 overflow-x-auto">
{sampleResponse}
        </pre>
      </Card>

      <Card
        title="3) 调用记录"
        subtitle="GET /api/launch/logs?limit=20"
        actions={<CopyCodeButton text={sampleLogsRequest} />}
      >
        <pre className="text-xs leading-relaxed font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border-muted)] rounded-lg p-3 overflow-x-auto">
{sampleLogsRequest}
        </pre>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          可查询最近接口调用记录（默认 50 条，最大 200 条），用于排查自动化脚本调用问题。
        </p>
      </Card>

      <Card>
        <div className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
          <Rocket className="w-4 h-4 mt-0.5 text-[var(--color-accent)]" />
          <p>
            当前页面是第一版占位，后续会补充自动化任务编排、模板脚本、连接状态监控等功能。
          </p>
        </div>
      </Card>
    </div>
  )
}

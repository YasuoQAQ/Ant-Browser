import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CheckCircle, ChevronRight, Copy, FileText } from 'lucide-react'
import { toast } from '../../../shared/components'
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime'
import { fetchLaunchServerInfo } from '../api'

// ============================================================================
// 文档内容（自动化优先重构版）
// ============================================================================

const DOC_OVERVIEW = `# 自动化接口文档（重构版）

## 文档目标

本页仅聚焦 **自动化集成** 场景，回答三个核心问题：

1. 如何通过 Code 唤起浏览器实例
2. 如何带参数启动并对接 CDP
3. 如何查询调用记录做排障

## 适用场景

- 自动化脚本（Python / Node.js / PowerShell）
- 本地调度器或 RPA 任务编排
- 多实例批量启动与状态观测

## 运行前提

- 应用已启动
- Launch 服务监听本机（地址见本页顶部）
- 实例已分配可用 Code（支持自定义）

## 自动化链路

\`\`\`
脚本 -> HTTP 接口 -> 实例启动 -> 返回 debugPort -> CDP 接管
\`\`\`
`

const DOC_QUICKSTART = `# 快速接入（3 分钟）

## 第一步：拿到实例 Code

在 **实例列表** 的“快捷码”列获取 Code。

- 可直接使用已有 Code
- 也可点击编辑设置自定义 Code

## 第二步：健康检查

\`\`\`bash
curl http://127.0.0.1:19876/api/health
# {"ok":true}
\`\`\`

## 第三步：按 Code 启动

\`\`\`bash
curl http://127.0.0.1:19876/api/launch/A3F9K2
\`\`\`

成功后会返回 \`debugPort\`，即可连接 CDP。

## 第四步：带参数启动（推荐自动化）

\`\`\`bash
curl -X POST http://127.0.0.1:19876/api/launch \\
  -H "Content-Type: application/json" \\
  -d '{
    "code":"A3F9K2",
    "launchArgs":["--window-size=1280,800"],
    "startUrls":["https://example.com"],
    "skipDefaultStartUrls":true
  }'
\`\`\`
`

const DOC_API_INDEX = `# 接口总览

| 能力 | 方法 | 路径 | 用途 |
|------|------|------|------|
| 健康检查 | GET | \`/api/health\` | 检查服务可用性 |
| 按 Code 启动 | GET | \`/api/launch/{code}\` | 快速启动实例 |
| 参数化启动 | POST | \`/api/launch\` | 自动化脚本标准入口 |
| 调用记录 | GET | \`/api/launch/logs?limit=50\` | 最近调用排障 |
`

const DOC_API_HEALTH = `# 接口：健康检查

\`\`\`
GET /api/health
\`\`\`

## 请求示例

\`\`\`bash
curl http://127.0.0.1:19876/api/health
\`\`\`

## 成功响应

\`\`\`json
{
  "ok": true
}
\`\`\`
`

const DOC_API_LAUNCH_GET = `# 接口：按 Code 启动

\`\`\`
GET /api/launch/{code}
\`\`\`

## 说明

- 用于最简启动流程
- 实例已运行时返回当前运行信息（幂等）

## 请求示例

\`\`\`bash
curl http://127.0.0.1:19876/api/launch/A3F9K2
\`\`\`

## 成功响应

\`\`\`json
{
  "ok": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "profileName": "账号 A",
  "pid": 12345,
  "debugPort": 9222
}
\`\`\`
`

const DOC_API_LAUNCH_POST = `# 接口：参数化启动（自动化主入口）

\`\`\`
POST /api/launch
\`\`\`

## 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| \`code\` | string | 是 | 实例 Code |
| \`launchArgs\` | string[] | 否 | 本次附加启动参数 |
| \`startUrls\` | string[] | 否 | 本次启动打开 URL 列表 |
| \`skipDefaultStartUrls\` | boolean | 否 | 跳过系统默认起始页 |

## 请求示例

\`\`\`bash
curl -X POST http://127.0.0.1:19876/api/launch \\
  -H "Content-Type: application/json" \\
  -d '{
    "code":"A3F9K2",
    "launchArgs":["--lang=en-US","--window-size=1366,768"],
    "startUrls":["https://example.com"],
    "skipDefaultStartUrls":true
  }'
\`\`\`

## 成功响应

\`\`\`json
{
  "ok": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "profileName": "账号 A",
  "pid": 12345,
  "debugPort": 9222
}
\`\`\`
`

const DOC_API_LOGS = `# 接口：调用记录

\`\`\`
GET /api/launch/logs?limit=50
\`\`\`

## 说明

- 默认返回最近 50 条
- 最大支持 200 条
- 返回顺序：按时间倒序（最新在前）

## 请求示例

\`\`\`bash
curl http://127.0.0.1:19876/api/launch/logs?limit=20
\`\`\`

## 成功响应

\`\`\`json
{
  "ok": true,
  "items": [
    {
      "timestamp": "2026-03-01T12:00:00+08:00",
      "method": "POST",
      "path": "/api/launch",
      "clientIp": "127.0.0.1",
      "code": "A3F9K2",
      "profileId": "550e8400-e29b-41d4-a716-446655440000",
      "profileName": "账号 A",
      "params": {
        "launchArgs": ["--window-size=1280,800"],
        "startUrls": ["https://example.com"],
        "skipDefaultStartUrls": true
      },
      "ok": true,
      "status": 200,
      "error": "",
      "durationMs": 156
    }
  ]
}
\`\`\`
`

const DOC_ERRORS = `# 错误码与重试策略

| 状态码 | 场景 | 建议处理 |
|--------|------|----------|
| 400 | 请求体非法 / 缺少字段 | 修复参数后重试 |
| 403 | 非 localhost 访问 | 改为本机请求 |
| 404 | Code 不存在 | 检查 Code 是否正确 |
| 405 | 方法错误 | 使用正确 HTTP 方法 |
| 500 | 启动失败 | 查 \`/api/launch/logs\` + 应用日志 |

## 自动化建议

- 设置请求超时（3-10 秒）
- 对 \`500\` 可短暂重试（指数退避）
- 对 \`400/404\` 不建议盲目重试
`

const DOC_EXAMPLES = `# 自动化示例

## Python：启动并连接 CDP

\`\`\`python
import requests
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:19876"

def launch_by_code(code: str) -> dict:
    r = requests.post(
        f"{BASE}/api/launch",
        json={
            "code": code,
            "launchArgs": ["--window-size=1280,800"],
            "skipDefaultStartUrls": True,
        },
        timeout=10,
    )
    r.raise_for_status()
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(data.get("error", "launch failed"))
    return data

with sync_playwright() as p:
    data = launch_by_code("A3F9K2")
    browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{data['debugPort']}")
    page = browser.contexts[0].new_page()
    page.goto("https://example.com")
\`\`\`

## Node.js：最小调用

\`\`\`javascript
const BASE = 'http://127.0.0.1:19876'

async function launch(code) {
  const res = await fetch(\`\${BASE}/api/launch\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, skipDefaultStartUrls: true })
  })
  const data = await res.json()
  if (!res.ok || !data.ok) throw new Error(data.error || \`HTTP \${res.status}\`)
  return data
}
\`\`\`
`

const DOC_PRACTICES = `# 最佳实践

## 1) Code 管理

- 为每个实例分配稳定 Code
- 高风险脚本使用专用 Code，不与人工操作混用
- 变更 Code 后同步更新你的任务配置

## 2) 启动参数策略

- 把通用参数放在实例默认配置
- 仅把“任务相关参数”放在 \`POST /api/launch\` 的 \`launchArgs\`

## 3) 排障流程

1. 先调 \`/api/health\`
2. 再调启动接口
3. 失败时查 \`/api/launch/logs\`
4. 最后结合应用日志定位
`

const DOC_TROUBLESHOOT = `# 常见问题

## Q1：返回 \`launch code not found\`

- Code 拼写错误或未分配
- 检查实例列表中的 Code 是否一致

## Q2：返回 \`forbidden: only localhost is allowed\`

- 当前服务只允许本机访问
- 请在同一台机器发起请求

## Q3：返回 \`500\` 启动失败

- 先查 \`/api/launch/logs\` 的 \`error\`
- 再检查内核路径、代理配置、启动参数是否合法
`

// ============================================================================
// 文档树结构
// ============================================================================

interface DocNode {
  id: string
  label: string
  children?: DocNode[]
  content?: string
}

const DOC_TREE: DocNode[] = [
  {
    id: 'overview',
    label: '文档说明',
    content: DOC_OVERVIEW,
  },
  {
    id: 'quickstart',
    label: '快速接入',
    content: DOC_QUICKSTART,
  },
  {
    id: 'api-index',
    label: '接口总览',
    content: DOC_API_INDEX,
  },
  {
    id: 'api',
    label: '核心接口',
    children: [
      { id: 'api-health', label: '健康检查', content: DOC_API_HEALTH },
      { id: 'api-launch-get', label: '按 Code 启动', content: DOC_API_LAUNCH_GET },
      { id: 'api-launch-post', label: '参数化启动', content: DOC_API_LAUNCH_POST },
      { id: 'api-logs', label: '调用记录', content: DOC_API_LOGS },
    ],
  },
  {
    id: 'errors',
    label: '错误与重试',
    content: DOC_ERRORS,
  },
  {
    id: 'examples',
    label: '代码示例',
    content: DOC_EXAMPLES,
  },
  {
    id: 'practices',
    label: '最佳实践',
    content: DOC_PRACTICES,
  },
  {
    id: 'troubleshoot',
    label: '常见问题',
    content: DOC_TROUBLESHOOT,
  },
]

const DEFAULT_LAUNCH_BASE_URL = 'http://127.0.0.1:19876'

function renderDocWithLaunchBase(raw: string, baseUrl: string): string {
  if (!raw) return raw
  const safeBase = baseUrl.trim() || DEFAULT_LAUNCH_BASE_URL
  const hostPort = safeBase.replace(/^https?:\/\//, '')
  return raw
    .split('http://127.0.0.1:19876').join(safeBase)
    .split('127.0.0.1:19876').join(hostPort)
}

// ============================================================================
// 组件
// ============================================================================

function DocTreeItem({
  node,
  depth,
  activeId,
  onSelect,
  expandedIds,
  onToggle,
}: {
  node: DocNode
  depth: number
  activeId: string
  onSelect: (id: string, content: string) => void
  expandedIds: Set<string>
  onToggle: (id: string) => void
}) {
  const hasChildren = !!node.children?.length
  const isExpanded = expandedIds.has(node.id)
  const isActive = activeId === node.id

  const handleClick = () => {
    if (hasChildren) {
      onToggle(node.id)
    } else if (node.content) {
      onSelect(node.id, node.content)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        className={[
          'w-full flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors text-left',
          isActive && !hasChildren
            ? 'bg-[var(--color-accent)] text-[var(--color-text-inverse)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-muted)] hover:text-[var(--color-text-primary)]',
        ].join(' ')}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
      >
        {hasChildren ? (
          <ChevronRight
            className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        ) : (
          <FileText className="w-3.5 h-3.5 shrink-0 opacity-60" />
        )}
        <span className="truncate">{node.label}</span>
      </button>

      {hasChildren && isExpanded && (
        <div>
          {node.children!.map(child => (
            <DocTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          toast.success('已复制')
          setTimeout(() => setCopied(false), 2000)
        })
      }}
      className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
    >
      {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6 pb-3 border-b border-[var(--color-border-default)]">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mt-8 mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-[var(--color-accent)] rounded-full inline-block shrink-0" />
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-6 mb-2">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-3">
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul className="space-y-1 mb-4 pl-5 list-disc marker:text-[var(--color-accent)]">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="space-y-1 mb-4 pl-5 list-decimal marker:text-[var(--color-accent)]">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            {children}
          </li>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes('language-')
          if (isBlock) return null
          return (
            <code className="text-xs font-mono bg-[var(--color-bg-secondary)] text-[var(--color-accent)] px-1.5 py-0.5 rounded border border-[var(--color-border-muted)]">
              {children}
            </code>
          )
        },
        pre: ({ children }) => {
          const codeEl = (children as any)?.props
          const lang = codeEl?.className?.replace('language-', '') || ''
          const codeText = codeEl?.children || ''
          return (
            <div className="my-4 rounded-lg overflow-hidden border border-[var(--color-border-default)]">
              <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-bg-surface)] border-b border-[var(--color-border-muted)]">
                <span className="text-xs font-mono text-[var(--color-text-muted)]">{lang || 'code'}</span>
                <CopyButton text={String(codeText).replace(/\n$/, '')} />
              </div>
              <pre className="p-4 bg-[var(--color-bg-secondary)] overflow-x-auto text-sm font-mono text-[var(--color-text-primary)] leading-relaxed">
                {children}
              </pre>
            </div>
          )
        },
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto rounded-lg border border-[var(--color-border-default)]">
            <table className="w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-[var(--color-bg-surface)] border-b border-[var(--color-border-default)]">
            {children}
          </thead>
        ),
        th: ({ children }) => (
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2.5 text-[var(--color-text-secondary)] border-t border-[var(--color-border-muted)]">
            {children}
          </td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-3 pl-4 border-l-2 border-[var(--color-accent)] text-[var(--color-text-muted)] italic">
            {children}
          </blockquote>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>
        ),
        hr: () => <hr className="my-6 border-[var(--color-border-default)]" />,
        a: ({ href, children }) => (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              if (href) {
                BrowserOpenURL(href)
              }
            }}
            className="text-[var(--color-accent)] hover:underline cursor-pointer"
            title={href}
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ============================================================================
// 主页面
// ============================================================================

function findFirstLeaf(nodes: DocNode[]): DocNode | null {
  for (const n of nodes) {
    if (!n.children) return n
    const found = findFirstLeaf(n.children)
    if (found) return found
  }
  return null
}

function collectParentIds(nodes: DocNode[], targetId: string, path: string[] = []): string[] {
  for (const n of nodes) {
    if (n.id === targetId) return path
    if (n.children) {
      const found = collectParentIds(n.children, targetId, [...path, n.id])
      if (found.length) return found
    }
  }
  return []
}

export function LaunchApiDocsPage() {
  const firstLeaf = findFirstLeaf(DOC_TREE)!
  const [activeId, setActiveId] = useState(firstLeaf.id)
  const [activeContent, setActiveContent] = useState(firstLeaf.content || '')
  const [launchBaseUrl, setLaunchBaseUrl] = useState(DEFAULT_LAUNCH_BASE_URL)
  const [launchServerReady, setLaunchServerReady] = useState(false)

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const parents = collectParentIds(DOC_TREE, firstLeaf.id)
    return new Set(parents)
  })

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

  const handleSelect = (id: string, content: string) => {
    setActiveId(id)
    setActiveContent(content)
  }

  const handleToggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const renderedContent = renderDocWithLaunchBase(activeContent, launchBaseUrl)

  return (
    <div className="flex h-full -m-5 overflow-hidden">
      <aside className="w-52 shrink-0 border-r border-[var(--color-border-default)] bg-[var(--color-bg-surface)] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border-muted)]">
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">文档</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {DOC_TREE.map(node => (
            <DocTreeItem
              key={node.id}
              node={node}
              depth={0}
              activeId={activeId}
              onSelect={handleSelect}
              expandedIds={expandedIds}
              onToggle={handleToggle}
            />
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-10 py-8">
          <div className="mb-4 px-3 py-2 text-xs rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]">
            当前 Launch 地址：<code>{launchBaseUrl}</code>
            {!launchServerReady ? '（服务启动后会自动刷新）' : ''}
          </div>
          <MarkdownContent content={renderedContent} />
        </div>
      </main>
    </div>
  )
}


import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Copy, Globe, Play, RefreshCw, RotateCcw, Square } from 'lucide-react'
import { Badge, Button, Card, Input, Table, toast } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'
import type { BrowserProfile, BrowserRuntimeSummary, BrowserTab } from '../types'
import {
  fetchBrowserProfiles,
  fetchBrowserTabs,
  openBrowserUrl,
  regenerateBrowserProfileCode,
  restartBrowserInstance,
  startBrowserInstance,
  stopBrowserInstance,
} from '../api'
import { CookieManagerCard } from '../components/CookieManagerCard'
import { SnapshotTab } from '../components/SnapshotTab'
import { resolveActionErrorMessage } from '../utils/actionErrors'
import { summarizeFingerprint, fingerprintCompleteness, deserialize } from '../utils/fingerprintSerializer'

const statusVariant = (running: boolean) => (running ? 'success' : 'warning')

const formatTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN')
}

const formatList = (items?: string[]) => {
  if (!items || items.length === 0) return '无'
  return items.join('\n')
}

const getRuntimeSummary = (profile: BrowserProfile): BrowserRuntimeSummary => ({
  running: profile.runtime?.running ?? profile.running,
  debugPort: profile.runtime?.debugPort ?? profile.debugPort,
  pid: profile.runtime?.pid ?? profile.pid,
  lastError: profile.runtime?.lastError ?? profile.lastError,
  lastStartAt: profile.runtime?.lastStartAt ?? profile.lastStartAt,
  lastStopAt: profile.runtime?.lastStopAt ?? profile.lastStopAt,
  effectiveProxy: profile.runtime?.effectiveProxy ?? profile.effectiveProxy,
  requestedLaunchArgs: profile.runtime?.requestedLaunchArgs ?? profile.requestedLaunchArgs,
  requestedStartUrls: profile.runtime?.requestedStartUrls ?? profile.requestedStartUrls,
  wsEndpoint: profile.runtime?.wsEndpoint ?? profile.wsEndpoint,
  resetUserData: profile.runtime?.resetUserData ?? profile.resetUserData,
})

type TabKey = 'overview' | 'snapshot'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'snapshot', label: '快照管理' },
]

export function BrowserDetailPage() {
  const { id } = useParams()
  const [profile, setProfile] = useState<BrowserProfile | null>(null)
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [targetUrl, setTargetUrl] = useState('https://example.com')
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [fpDetailOpen, setFpDetailOpen] = useState(false)

  const loadProfile = async () => {
    const list = await fetchBrowserProfiles()
    const current = list.find(item => item.profileId === id) || null
    setProfile(current)
  }

  const loadTabs = async () => {
    if (!id) return
    const list = await fetchBrowserTabs(id)
    setTabs(list)
  }

  useEffect(() => { loadProfile() }, [id])
  useEffect(() => { loadTabs() }, [id])

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-[var(--color-text-muted)]">
        暂无实例信息
      </div>
    )
  }

  const handleOpenUrl = async () => {
    await openBrowserUrl(profile.profileId, targetUrl)
    toast.success('已发送打开指令')
  }

  const handleStart = async () => {
    try {
      await startBrowserInstance(profile.profileId)
      toast.success('实例已启动')
    } catch (error: any) {
      toast.error(resolveActionErrorMessage(error, '实例启动失败'))
    } finally {
      loadProfile()
    }
  }

  const handleStop = async () => {
    try {
      await stopBrowserInstance(profile.profileId)
      toast.success('实例已停止')
    } catch (error: any) {
      toast.error(resolveActionErrorMessage(error, '实例停止失败'))
    } finally {
      loadProfile()
    }
  }

  const handleRestart = async () => {
    try {
      await restartBrowserInstance(profile.profileId)
      toast.success('实例已重启')
    } catch (error: any) {
      toast.error(resolveActionErrorMessage(error, '实例重启失败'))
    } finally {
      loadProfile()
    }
  }

  const tabsColumns: TableColumn<BrowserTab>[] = [
    { key: 'title', title: '标题' },
    { key: 'url', title: '地址' },
    {
      key: 'active',
      title: '状态',
      render: value => (
        <Badge variant={value ? 'success' : 'default'}>{value ? '当前' : '后台'}</Badge>
      ),
    },
  ]

  const runtime = getRuntimeSummary(profile)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">实例详情</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">{profile.profileName}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/browser/edit/${profile.profileId}`}>
            <Button variant="secondary" size="sm">编辑配置</Button>
          </Link>
          <Link to="/browser/list">
            <Button variant="ghost" size="sm">返回列表</Button>
          </Link>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="flex border-b border-[var(--color-border)]">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 概览 Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="运行信息" subtitle="实例运行状态与端口信息">
              <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                <div className="flex justify-between">
                  <span>状态</span>
                  <Badge variant={statusVariant(runtime.running)} dot>{runtime.running ? '运行中' : '已停止'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>进程 PID</span>
                  <span>{runtime.pid || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>调试端口</span>
                  <span>{runtime.debugPort || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>最近启动</span>
                  <span>{formatTime(runtime.lastStartAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>最近停止</span>
                  <span>{formatTime(runtime.lastStopAt)}</span>
                </div>
              </div>
            </Card>

            <Card title="配置摘要" subtitle="指纹与启动参数">
              <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                <div className="flex justify-between">
                  <span>用户数据目录</span>
                  <span>{profile.userDataDir}</span>
                </div>
                <div className="flex justify-between">
                  <span>内核</span>
                  <span>{profile.coreId || '默认'}</span>
                </div>
                <div className="flex justify-between">
                  <span>代理配置</span>
                  <span>{profile.proxyConfig || '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>指纹摘要</span>
                  <span className="text-right max-w-[60%] truncate" title={summarizeFingerprint(profile.fingerprintArgs || [])}>{summarizeFingerprint(profile.fingerprintArgs || [])}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>指纹完整度</span>
                  <div className="flex items-center gap-2 w-[40%]">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg-secondary)] overflow-hidden">
                      {(() => { const pct = fingerprintCompleteness(profile.fingerprintArgs || []); return <div className={`h-full rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${pct}%` }} /> })()}
                    </div>
                    <span className="text-xs tabular-nums">{fingerprintCompleteness(profile.fingerprintArgs || [])}%</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span>启动参数</span>
                  <span>{profile.launchArgs?.length || 0} 项</span>
                </div>
                <div className="flex justify-between">
                  <span>标签</span>
                  <span>{profile.tags?.join(', ') || '-'}</span>
                </div>

                {/* 指纹详情折叠区 */}
                <div className="border-t border-[var(--color-border)] pt-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                    onClick={() => setFpDetailOpen(v => !v)}
                  >
                    {fpDetailOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    指纹配置详情
                  </button>
                  {fpDetailOpen && (() => {
                    const cfg = deserialize(profile.fingerprintArgs || [])
                    const rows: [string, string][] = [
                      ['种子', cfg.seed || '-'],
                      ['品牌', cfg.brand || '-'],
                      ['品牌版本', cfg.brandVersion || '-'],
                      ['平台', cfg.platform || '-'],
                      ['系统版本', cfg.platformVersion || '-'],
                      ['语言', cfg.lang || '-'],
                      ['Accept-Language', cfg.acceptLang || '-'],
                      ['时区', cfg.timezone || '-'],
                      ['分辨率', cfg.resolution === 'custom' ? (cfg.customResolution || '-') : (cfg.resolution || '-')],
                      ['CPU 核心', cfg.hardwareConcurrency || '-'],
                      ['WebRTC 非代理 UDP', cfg.disableWebrtcUdp ? '禁用' : '允许'],
                      ['Canvas 伪装', cfg.spoofCanvas === false ? '关闭' : '开启'],
                      ['Audio 伪装', cfg.spoofAudio === false ? '关闭' : '开启'],
                      ['字体伪装', cfg.spoofFont === false ? '关闭' : '开启'],
                      ['ClientRects 伪装', cfg.spoofClientRects === false ? '关闭' : '开启'],
                      ['GPU 伪装', cfg.spoofGpu === false ? '关闭' : '开启'],
                    ]
                    return (
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {rows.map(([label, val]) => (
                          <div key={label} className="flex justify-between py-0.5">
                            <span className="text-[var(--color-text-muted)]">{label}</span>
                            <span className="text-[var(--color-text-primary)] truncate max-w-[60%] text-right" title={val}>{val}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                <div className="flex justify-between items-center">
                  <span>快捷码</span>
                  <div className="flex items-center gap-1">
                    {profile.launchCode ? (
                      <>
                        <code className="text-xs font-mono bg-[var(--color-bg-secondary)] px-1.5 py-0.5 rounded text-[var(--color-accent)]">{profile.launchCode}</code>
                        <button
                          onClick={() => navigator.clipboard.writeText(profile.launchCode!).then(() => toast.success('已复制快捷码'))}
                          className="p-0.5 hover:text-[var(--color-accent)] text-[var(--color-text-muted)] transition-colors"
                          title="复制"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={async () => {
                            await regenerateBrowserProfileCode(profile.profileId)
                            loadProfile()
                            toast.success('快捷码已重新生成')
                          }}
                          className="p-0.5 hover:text-[var(--color-accent)] text-[var(--color-text-muted)] transition-colors"
                          title="重新生成"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">-</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <Card title="本次实际启动上下文" subtitle="自动化接口返回的运行上下文与接管信息">
            <div className="space-y-4 text-sm text-[var(--color-text-secondary)]">
              <div className="flex justify-between gap-4">
                <span>本次实际生效代理</span>
                <span className="text-right break-all">{runtime.effectiveProxy || profile.proxyConfig || '-'}</span>
              </div>
              <div className="flex justify-between items-start gap-4">
                <span>CDP / Playwright 地址</span>
                <div className="flex items-center gap-2 max-w-[70%]">
                  <span className="text-right break-all">{runtime.wsEndpoint || '-'}</span>
                  {runtime.wsEndpoint && (
                    <button
                      onClick={() => navigator.clipboard.writeText(runtime.wsEndpoint!).then(() => toast.success('已复制 wsEndpoint'))}
                      className="p-0.5 hover:text-[var(--color-accent)] text-[var(--color-text-muted)] transition-colors shrink-0"
                      title="复制"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex justify-between gap-4">
                <span>是否重置用户数据</span>
                <span>{runtime.resetUserData ? '是' : '否'}</span>
              </div>
              <div className="space-y-1">
                <div className="text-[var(--color-text-primary)]">本次请求透传启动参数</div>
                <pre className="text-xs leading-relaxed font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border-muted)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{formatList(runtime.requestedLaunchArgs)}</pre>
              </div>
              <div className="space-y-1">
                <div className="text-[var(--color-text-primary)]">本次请求打开页面</div>
                <pre className="text-xs leading-relaxed font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border-muted)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{formatList(runtime.requestedStartUrls)}</pre>
              </div>
            </div>
          </Card>

          <Card title="快捷操作" subtitle="快速控制实例">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={handleStart}>
                <Play className="w-4 h-4" />
                启动
              </Button>
              <Button size="sm" variant="secondary" onClick={handleStop}>
                <Square className="w-4 h-4" />
                停止
              </Button>
              <Button size="sm" variant="ghost" onClick={handleRestart}>
                <RotateCcw className="w-4 h-4" />
                重启
              </Button>
            </div>
          </Card>

          {runtime.lastError && (
            <Card title="最近错误" subtitle="最近一次启动或运行失败原因">
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
                {runtime.lastError}
              </div>
            </Card>
          )}

          <Card title="打开地址" subtitle="向实例发送打开 URL 指令">
            <div className="flex flex-col md:flex-row gap-3">
              <Input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="请输入目标地址" />
              <Button onClick={handleOpenUrl}>
                <Globe className="w-4 h-4" />
                打开
              </Button>
            </div>
          </Card>

          <Card title="标签页列表" subtitle="当前实例标签页信息">
            <Table columns={tabsColumns} data={tabs} rowKey="tabId" />
          </Card>

          <CookieManagerCard
            profileId={profile.profileId}
            profileName={profile.profileName}
            running={profile.running}
          />
        </div>
      )}

      {/* 快照管理 Tab */}
      {activeTab === 'snapshot' && (
        <SnapshotTab profileId={profile.profileId} running={profile.running} />
      )}
    </div>
  )
}

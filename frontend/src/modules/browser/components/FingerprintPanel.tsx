import { useEffect, useState, useMemo } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Info, RefreshCw, Wand2 } from 'lucide-react'
import { ConfirmModal, FormItem, Input, Select, Textarea } from '../../../shared/components'
import {
  type FingerprintConfig,
  FINGERPRINT_PRESETS,
  PRESET_RESOLUTIONS,
  deserialize,
  getSystemTimezone,
  randomFingerprintSeed,
  serialize,
} from '../utils/fingerprintSerializer'
import { validateFingerprint } from '../utils/fingerprintValidator'

interface FingerprintPanelProps {
  value: string[]
  onChange: (args: string[]) => void
}

const BRAND_OPTIONS = [
  { value: '', label: '不设置（默认 Chromium）' },
  { value: 'Chrome', label: 'Chrome' },
  { value: 'Edge', label: 'Edge' },
  { value: 'Opera', label: 'Opera' },
  { value: 'Vivaldi', label: 'Vivaldi' },
]

const PLATFORM_OPTIONS = [
  { value: '', label: '不设置' },
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
]

const LANG_OPTIONS = [
  { value: '', label: '不设置' },
  { value: 'zh-CN', label: '中文 (zh-CN)' },
  { value: 'en-US', label: 'English (en-US)' },
  { value: 'en-GB', label: 'English (en-GB)' },
  { value: 'ja-JP', label: '日本語 (ja-JP)' },
  { value: 'ko-KR', label: '한국어 (ko-KR)' },
  { value: 'fr-FR', label: 'Français (fr-FR)' },
  { value: 'de-DE', label: 'Deutsch (de-DE)' },
]

const TIMEZONE_OPTIONS = [
  { value: '', label: '不设置' },
  { value: 'system', label: '跟随系统时区' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (UTC+9)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (UTC+8)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+4)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (UTC+5:30)' },
  { value: 'America/New_York', label: 'America/New_York (UTC-5)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC-8)' },
  { value: 'America/Chicago', label: 'America/Chicago (UTC-6)' },
  { value: 'America/Denver', label: 'America/Denver (UTC-7)' },
  { value: 'America/Toronto', label: 'America/Toronto (UTC-5)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (UTC-3)' },
  { value: 'Europe/London', label: 'Europe/London (UTC+0)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (UTC+1)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (UTC+1)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow (UTC+3)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (UTC+10)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (UTC+12)' },
]

const RESOLUTION_OPTIONS = [
  { value: '', label: '不设置' },
  ...PRESET_RESOLUTIONS.map(r => ({ value: r, label: r })),
  { value: 'custom', label: '自定义...' },
]

const HARDWARE_CONCURRENCY_OPTIONS = [
  { value: '', label: '不设置（由种子随机）' },
  { value: '2', label: '2 核' },
  { value: '4', label: '4 核' },
  { value: '6', label: '6 核' },
  { value: '8', label: '8 核' },
  { value: '10', label: '10 核' },
  { value: '12', label: '12 核' },
  { value: '16', label: '16 核' },
]

const PRESET_OPTIONS = [
  { value: '', label: '选择预设...' },
  ...FINGERPRINT_PRESETS.map(p => ({ value: p.id, label: p.name })),
]

/** 伪装项开关 */
function SpoofToggle({ label, description, value, onChange }: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors">
      <div className="min-w-0">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>
      </div>
      <div className="flex gap-1.5 shrink-0 ml-4">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-3 py-1 text-xs rounded-md border transition-colors ${
            value
              ? 'bg-green-50 border-green-300 text-green-700 font-medium'
              : 'bg-[var(--color-bg-base)] border-[var(--color-border)] text-[var(--color-text-muted)]'
          }`}
        >随机</button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-3 py-1 text-xs rounded-md border transition-colors ${
            !value
              ? 'bg-red-50 border-red-300 text-red-700 font-medium'
              : 'bg-[var(--color-bg-base)] border-[var(--color-border)] text-[var(--color-text-muted)]'
          }`}
        >关闭</button>
      </div>
    </div>
  )
}

export function FingerprintPanel({ value, onChange }: FingerprintPanelProps) {
  const [config, setConfig] = useState<FingerprintConfig>(() => deserialize(value))
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [confirmSeedOpen, setConfirmSeedOpen] = useState(false)

  useEffect(() => {
    setConfig(deserialize(value))
  }, [value.join('\n')])

  const update = (patch: Partial<FingerprintConfig>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    onChange(serialize(next))
  }

  const handlePresetChange = (presetId: string) => {
    if (!presetId) return
    const preset = FINGERPRINT_PRESETS.find(p => p.id === presetId)
    if (!preset) return
    const next: FingerprintConfig = {
      ...preset.config,
      seed: randomFingerprintSeed(),
      unknownArgs: config.unknownArgs,
    }
    setConfig(next)
    onChange(serialize(next))
  }

  const handleAdvancedChange = (text: string) => {
    const args = text.split('\n').map(s => s.trim()).filter(Boolean)
    const parsed = deserialize(args)
    setConfig(parsed)
    onChange(serialize(parsed))
  }

  const advancedText = serialize(config).join('\n')
  const warnings = useMemo(() => validateFingerprint(config), [config])
  const warningCount = warnings.filter(w => w.level === 'warning').length
  const infoCount = warnings.filter(w => w.level === 'info').length

  return (
    <div className="space-y-4">
      {/* 指纹种子 */}
      <div className="p-3 rounded-lg bg-[var(--color-bg-hover)] border border-[var(--color-border)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">指纹种子（Fingerprint Seed）</span>
          <span className="text-xs text-[var(--color-text-muted)]">设置后自动开启 Canvas/Audio/Font/GPU/ClientRects 全伪装</span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={config.seed ?? ''}
            onChange={e => update({ seed: e.target.value || undefined })}
            placeholder="留空则由系统按 ProfileId 自动生成"
            className="flex-1 font-mono text-sm"
          />
          <button
            type="button"
            title="随机生成新种子"
            onClick={() => {
              if (config.seed) {
                setConfirmSeedOpen(true)
              } else {
                update({ seed: randomFingerprintSeed() })
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            随机
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmSeedOpen}
        onClose={() => setConfirmSeedOpen(false)}
        onConfirm={() => update({ seed: randomFingerprintSeed() })}
        title="重新生成指纹种子"
        content="重新生成后，当前指纹将完全改变。确定继续？"
        confirmText="确定重新生成"
        danger
      />

      {/* 预设选择 */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-hover)] border border-[var(--color-border)]">
        <Wand2 className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
        <div className="flex-1 min-w-0">
          <Select
            value=""
            onChange={e => handlePresetChange(e.target.value)}
            options={PRESET_OPTIONS}
          />
        </div>
        <span className="text-xs text-[var(--color-text-muted)] shrink-0">选择后覆盖当前配置</span>
      </div>

      {/* 基础身份 */}
      <div>
        <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2 uppercase tracking-wide">基础身份</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label="浏览器品牌">
            <Select value={config.brand ?? ''} onChange={e => update({ brand: e.target.value || undefined })} options={BRAND_OPTIONS} />
          </FormItem>
          <FormItem label="品牌版本">
            <Input value={config.brandVersion ?? ''} onChange={e => update({ brandVersion: e.target.value || undefined })} placeholder="留空使用默认版本" />
          </FormItem>
          <FormItem label="操作系统">
            <Select value={config.platform ?? ''} onChange={e => update({ platform: e.target.value || undefined })} options={PLATFORM_OPTIONS} />
          </FormItem>
          <FormItem label="系统版本">
            <Input value={config.platformVersion ?? ''} onChange={e => update({ platformVersion: e.target.value || undefined })} placeholder="留空使用默认版本" />
          </FormItem>
          <FormItem label="语言">
            <Select value={config.lang ?? ''} onChange={e => update({ lang: e.target.value || undefined })} options={LANG_OPTIONS} />
          </FormItem>
          <FormItem label="Accept-Language">
            <Input value={config.acceptLang ?? ''} onChange={e => update({ acceptLang: e.target.value || undefined })} placeholder="zh-CN,en-US" />
          </FormItem>
          <FormItem label="时区">
            <Select value={config.timezone ?? ''} onChange={e => update({ timezone: e.target.value || undefined })} options={TIMEZONE_OPTIONS.map(opt =>
              opt.value === 'system'
                ? { ...opt, label: `跟随系统时区 (当前: ${getSystemTimezone()})` }
                : opt
            )} />
          </FormItem>
        </div>
      </div>

      {/* 硬件与窗口 */}
      <div>
        <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2 uppercase tracking-wide">硬件与窗口</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label="CPU 核心数">
            <Select value={config.hardwareConcurrency ?? ''} onChange={e => update({ hardwareConcurrency: e.target.value || undefined })} options={HARDWARE_CONCURRENCY_OPTIONS} />
          </FormItem>
          <FormItem label="分辨率">
            <Select
              value={config.resolution ?? ''}
              onChange={e => update({ resolution: e.target.value || undefined, customResolution: undefined })}
              options={RESOLUTION_OPTIONS}
            />
          </FormItem>
          {config.resolution === 'custom' && (
            <FormItem label="自定义分辨率">
              <Input value={config.customResolution ?? ''} onChange={e => update({ customResolution: e.target.value || undefined })} placeholder="1600,900" />
            </FormItem>
          )}
        </div>
      </div>

      {/* 指纹伪装开关（Chrome 144 核心功能） */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">指纹伪装</p>
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Chrome 144</span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mb-3">设置种子后以下伪装默认全部开启，可选择性关闭</p>
        <div className="border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
          <SpoofToggle
            label="Canvas"
            description="Canvas 2D 渲染指纹随机化"
            value={config.spoofCanvas !== false}
            onChange={v => update({ spoofCanvas: v })}
          />
          <SpoofToggle
            label="Audio"
            description="AudioContext 指纹随机化"
            value={config.spoofAudio !== false}
            onChange={v => update({ spoofAudio: v })}
          />
          <SpoofToggle
            label="字体"
            description="字体指纹随机化"
            value={config.spoofFont !== false}
            onChange={v => update({ spoofFont: v })}
          />
          <SpoofToggle
            label="ClientRects"
            description="DOM 元素尺寸测量指纹随机化"
            value={config.spoofClientRects !== false}
            onChange={v => update({ spoofClientRects: v })}
          />
          <SpoofToggle
            label="GPU"
            description="WebGL / GPU 指纹随机化"
            value={config.spoofGpu !== false}
            onChange={v => update({ spoofGpu: v })}
          />
        </div>
      </div>

      {/* WebRTC */}
      <div>
        <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2 uppercase tracking-wide">网络隐私</p>
        <div className="border border-[var(--color-border)] rounded-lg">
          <div className="flex items-center justify-between py-2 px-3">
            <div>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">WebRTC 禁用非代理 UDP</span>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">防止 WebRTC 泄露真实 IP</p>
            </div>
            <div className="flex gap-1.5 shrink-0 ml-4">
              <button
                type="button"
                onClick={() => update({ disableWebrtcUdp: true })}
                className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                  config.disableWebrtcUdp
                    ? 'bg-green-50 border-green-300 text-green-700 font-medium'
                    : 'bg-[var(--color-bg-base)] border-[var(--color-border)] text-[var(--color-text-muted)]'
                }`}
              >开启</button>
              <button
                type="button"
                onClick={() => update({ disableWebrtcUdp: false })}
                className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                  !config.disableWebrtcUdp
                    ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                    : 'bg-[var(--color-bg-base)] border-[var(--color-border)] text-[var(--color-text-muted)]'
                }`}
              >关闭</button>
            </div>
          </div>
        </div>
      </div>

      {/* 高级模式 */}
      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] transition-colors"
          onClick={() => setAdvancedOpen(v => !v)}
        >
          <span>高级模式（原始参数）</span>
          {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {advancedOpen && (
          <div className="px-4 pb-4 pt-2 border-t border-[var(--color-border)]">
            <p className="text-xs text-[var(--color-text-muted)] mb-2">每行一个参数，修改后自动同步到上方控件</p>
            <Textarea
              value={advancedText}
              onChange={e => handleAdvancedChange(e.target.value)}
              rows={6}
              placeholder="--fingerprint=12345"
            />
          </div>
        )}
      </div>

      {/* 指纹校验结果 */}
      {warnings.length > 0 && (
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-bg-hover)]">
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5" />
                {warningCount} 个警告
              </span>
            )}
            {infoCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-blue-500">
                <Info className="w-3.5 h-3.5" />
                {infoCount} 个建议
              </span>
            )}
          </div>
          <div className="px-4 py-2 space-y-1.5">
            {warnings.map((w, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 text-xs py-1 ${
                  w.level === 'warning' ? 'text-amber-700' : 'text-blue-600'
                }`}
              >
                {w.level === 'warning' ? (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                )}
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

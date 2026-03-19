// 指纹参数序列化/反序列化工具 —— 对齐 Chrome 144 实际支持的参数

/**
 * 获取系统当前时区
 */
export function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/**
 * Chrome 144 支持的指纹配置
 *
 * 重要：Chrome 144 中，当 --fingerprint=<seed> 存在时，
 * canvas / audio / font / clientRects / gpu 伪装**默认全部开启**。
 * 用 --disable-spoofing=xxx 来选择性**关闭**某项。
 */
export interface FingerprintConfig {
  // 核心种子（开启指纹伪装的根）
  seed?: string                    // --fingerprint=<seed>

  // 基础身份
  brand?: string                   // --fingerprint-brand= (Chrome|Edge|Opera|Vivaldi)
  brandVersion?: string            // --fingerprint-brand-version=
  platform?: string                // --fingerprint-platform= (windows|linux|macos)
  platformVersion?: string         // --fingerprint-platform-version=
  lang?: string                    // --lang=
  acceptLang?: string              // --accept-lang=
  timezone?: string                // --timezone=

  // 硬件
  hardwareConcurrency?: string     // --fingerprint-hardware-concurrency=

  // 窗口尺寸
  resolution?: string              // --window-size= (预设值或 'custom')
  customResolution?: string        // 当 resolution === 'custom' 时使用

  // WebRTC
  disableWebrtcUdp?: boolean       // --disable-non-proxied-udp（无值标志位）

  // 伪装开关（全部默认开启，设为 false 表示关闭该项伪装）
  spoofCanvas?: boolean            // false → --disable-spoofing 加入 canvas
  spoofAudio?: boolean             // false → --disable-spoofing 加入 audio
  spoofFont?: boolean              // false → --disable-spoofing 加入 font
  spoofClientRects?: boolean       // false → --disable-spoofing 加入 clientrects
  spoofGpu?: boolean               // false → --disable-spoofing 加入 gpu

  // 无法识别的原始参数，原样保留
  unknownArgs?: string[]
}

export const PRESET_RESOLUTIONS = ['1920,1080', '1440,900', '1366,768', '2560,1440', '1280,800', '1600,900']

// Chrome 144 支持的 CLI 参数 → FingerprintConfig 字段映射
export const KEY_MAP: Record<string, keyof FingerprintConfig> = {
  '--fingerprint': 'seed',
  '--fingerprint-brand': 'brand',
  '--fingerprint-brand-version': 'brandVersion',
  '--fingerprint-platform': 'platform',
  '--fingerprint-platform-version': 'platformVersion',
  '--lang': 'lang',
  '--accept-lang': 'acceptLang',
  '--timezone': 'timezone',
  '--fingerprint-hardware-concurrency': 'hardwareConcurrency',
  '--window-size': 'resolution',
}

// FingerprintConfig → string[]
export function serialize(config: FingerprintConfig): string[] {
  const args: string[] = []

  if (config.seed) args.push(`--fingerprint=${config.seed}`)
  if (config.brand) args.push(`--fingerprint-brand=${config.brand}`)
  if (config.brandVersion) args.push(`--fingerprint-brand-version=${config.brandVersion}`)
  if (config.platform) args.push(`--fingerprint-platform=${config.platform}`)
  if (config.platformVersion) args.push(`--fingerprint-platform-version=${config.platformVersion}`)
  if (config.lang) args.push(`--lang=${config.lang}`)
  if (config.acceptLang) args.push(`--accept-lang=${config.acceptLang}`)
  if (config.timezone) {
    const tz = config.timezone === 'system' ? getSystemTimezone() : config.timezone
    args.push(`--timezone=${tz}`)
  }
  if (config.hardwareConcurrency) args.push(`--fingerprint-hardware-concurrency=${config.hardwareConcurrency}`)

  const res = config.resolution === 'custom' ? config.customResolution : config.resolution
  if (res) args.push(`--window-size=${res}`)

  // WebRTC：无值标志位
  if (config.disableWebrtcUdp) args.push('--disable-non-proxied-udp')

  // --disable-spoofing：收集需要关闭的伪装项
  const disabledSpoofing: string[] = []
  if (config.spoofCanvas === false) disabledSpoofing.push('canvas')
  if (config.spoofAudio === false) disabledSpoofing.push('audio')
  if (config.spoofFont === false) disabledSpoofing.push('font')
  if (config.spoofClientRects === false) disabledSpoofing.push('clientrects')
  if (config.spoofGpu === false) disabledSpoofing.push('gpu')
  if (disabledSpoofing.length > 0) {
    args.push(`--disable-spoofing=${disabledSpoofing.join(',')}`)
  }

  return [...args, ...(config.unknownArgs ?? [])]
}

// string[] → FingerprintConfig
export function deserialize(args: string[]): FingerprintConfig {
  const config: FingerprintConfig = {
    // 伪装默认全开
    spoofCanvas: true,
    spoofAudio: true,
    spoofFont: true,
    spoofClientRects: true,
    spoofGpu: true,
    disableWebrtcUdp: false,
    unknownArgs: [],
  }

  for (const arg of args) {
    // 无值标志位
    if (arg === '--disable-non-proxied-udp') {
      config.disableWebrtcUdp = true
      continue
    }

    const eqIdx = arg.indexOf('=')
    if (eqIdx === -1) {
      config.unknownArgs!.push(arg)
      continue
    }
    const key = arg.slice(0, eqIdx)
    const val = arg.slice(eqIdx + 1)

    // --disable-spoofing=canvas,audio,...
    if (key === '--disable-spoofing') {
      const items = val.split(',').map(s => s.trim().toLowerCase())
      if (items.includes('canvas')) config.spoofCanvas = false
      if (items.includes('audio')) config.spoofAudio = false
      if (items.includes('font')) config.spoofFont = false
      if (items.includes('clientrects')) config.spoofClientRects = false
      if (items.includes('gpu')) config.spoofGpu = false
      continue
    }

    const field = KEY_MAP[key]
    if (!field) {
      config.unknownArgs!.push(arg)
      continue
    }

    if (field === 'resolution') {
      if (PRESET_RESOLUTIONS.includes(val)) {
        config.resolution = val
      } else {
        config.resolution = 'custom'
        config.customResolution = val
      }
    } else {
      (config as Record<string, unknown>)[field] = val
    }
  }

  return config
}

// 生成随机指纹种子（32位正整数）
export function randomFingerprintSeed(): string {
  return String(Math.floor(Math.random() * 2147483647) + 1)
}

// ─── 新建配置时的默认指纹 ──────────────────────────────────────────

const DEFAULT_HW_CONCURRENCY = ['4', '6', '8', '12']
const DEFAULT_RESOLUTIONS = ['1920,1080', '1440,900', '1366,768']

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * 生成新建配置的默认指纹参数（已序列化为 string[]）
 *
 * Chrome 144 策略：
 * - 设置 seed 后 canvas/audio/font/clientrects/gpu 伪装自动全开
 * - WebRTC: 禁用非代理 UDP
 * - 硬件参数: 随机分配合理值
 * - 语言/时区: 跟随系统
 */
export function generateDefaultFingerprint(): string[] {
  const config: FingerprintConfig = {
    seed: randomFingerprintSeed(),
    brand: 'Chrome',
    platform: 'windows',
    lang: 'zh-CN',
    acceptLang: 'zh-CN,en-US',
    timezone: 'system',
    resolution: pickRandom(DEFAULT_RESOLUTIONS),
    hardwareConcurrency: pickRandom(DEFAULT_HW_CONCURRENCY),
    disableWebrtcUdp: true,
    // 伪装全部开启（默认值）
    spoofCanvas: true,
    spoofAudio: true,
    spoofFont: true,
    spoofClientRects: true,
    spoofGpu: true,
  }
  return serialize(config)
}

// ─── 指纹摘要与完整度 ────────────────────────────────────────────

const CORE_FIELDS: (keyof FingerprintConfig)[] = [
  'seed', 'brand', 'platform', 'lang', 'timezone', 'resolution',
  'hardwareConcurrency', 'disableWebrtcUdp',
]

/**
 * 生成人类可读的指纹摘要
 * 例如: "Chrome / Win / 1920x1080 / 8核"
 */
export function summarizeFingerprint(args: string[]): string {
  if (!args || args.length === 0) return '未配置'
  const cfg = deserialize(args)
  const parts: string[] = []
  if (cfg.brand) parts.push(cfg.brand)
  if (cfg.platform) {
    const platNames: Record<string, string> = { windows: 'Win', mac: 'Mac', macos: 'Mac', linux: 'Linux' }
    parts.push(platNames[cfg.platform] ?? cfg.platform)
  }
  if (cfg.resolution && cfg.resolution !== 'custom') {
    parts.push(cfg.resolution.replace(',', 'x'))
  } else if (cfg.customResolution) {
    parts.push(cfg.customResolution.replace(',', 'x'))
  }
  if (cfg.hardwareConcurrency) parts.push(`${cfg.hardwareConcurrency}核`)

  // 伪装状态
  const spoofCount = [cfg.spoofCanvas, cfg.spoofAudio, cfg.spoofFont, cfg.spoofClientRects, cfg.spoofGpu]
    .filter(v => v !== false).length
  if (spoofCount === 5) {
    parts.push('全伪装')
  } else if (spoofCount > 0) {
    parts.push(`${spoofCount}/5 伪装`)
  }

  return parts.length > 0 ? parts.join(' / ') : `${args.length} 项参数`
}

/**
 * 计算指纹配置完整度（0-100）
 */
export function fingerprintCompleteness(args: string[]): number {
  if (!args || args.length === 0) return 0
  const cfg = deserialize(args)
  let filled = 0
  for (const key of CORE_FIELDS) {
    const val = cfg[key]
    if (val !== undefined && val !== null && val !== '' && val !== false) {
      filled++
    }
  }
  return Math.round((filled / CORE_FIELDS.length) * 100)
}

// ─── 预设指纹配置 ─────────────────────────────────────────────────

export interface FingerprintPreset {
  id: string
  name: string
  description: string
  config: Partial<FingerprintConfig>
}

export const FINGERPRINT_PRESETS: FingerprintPreset[] = [
  {
    id: 'win-chrome-office',
    name: 'Windows / Chrome / 办公',
    description: '模拟国内办公室 Windows 用户，中文环境，1920x1080',
    config: {
      brand: 'Chrome', platform: 'windows',
      lang: 'zh-CN', acceptLang: 'zh-CN,en-US', timezone: 'Asia/Shanghai',
      resolution: '1920,1080', hardwareConcurrency: '8',
      disableWebrtcUdp: true,
      spoofCanvas: true, spoofAudio: true, spoofFont: true, spoofClientRects: true, spoofGpu: true,
    },
  },
  {
    id: 'win-chrome-gaming',
    name: 'Windows / Chrome / 游戏主机',
    description: '模拟高配游戏 PC，2560x1440',
    config: {
      brand: 'Chrome', platform: 'windows',
      lang: 'en-US', acceptLang: 'en-US', timezone: 'America/New_York',
      resolution: '2560,1440', hardwareConcurrency: '16',
      disableWebrtcUdp: true,
      spoofCanvas: true, spoofAudio: true, spoofFont: true, spoofClientRects: true, spoofGpu: true,
    },
  },
  {
    id: 'mac-chrome-designer',
    name: 'macOS / Chrome / 设计师',
    description: '模拟 Mac 设计师用户，Retina 分辨率',
    config: {
      brand: 'Chrome', platform: 'macos',
      lang: 'zh-CN', acceptLang: 'zh-CN,en-US', timezone: 'Asia/Shanghai',
      resolution: '2560,1440', hardwareConcurrency: '10',
      disableWebrtcUdp: true,
      spoofCanvas: true, spoofAudio: true, spoofFont: true, spoofClientRects: true, spoofGpu: true,
    },
  },
  {
    id: 'win-edge-enterprise',
    name: 'Windows / Edge / 企业',
    description: '模拟企业 Windows 用户，Edge 浏览器',
    config: {
      brand: 'Edge', platform: 'windows',
      lang: 'zh-CN', acceptLang: 'zh-CN,en-US', timezone: 'Asia/Shanghai',
      resolution: '1366,768', hardwareConcurrency: '4',
      disableWebrtcUdp: true,
      spoofCanvas: true, spoofAudio: false, spoofFont: true, spoofClientRects: true, spoofGpu: true,
    },
  },
  {
    id: 'win-chrome-us-user',
    name: 'Windows / Chrome / 美国用户',
    description: '模拟美国普通用户，英文环境',
    config: {
      brand: 'Chrome', platform: 'windows',
      lang: 'en-US', acceptLang: 'en-US', timezone: 'America/Los_Angeles',
      resolution: '1920,1080', hardwareConcurrency: '8',
      disableWebrtcUdp: true,
      spoofCanvas: true, spoofAudio: true, spoofFont: true, spoofClientRects: true, spoofGpu: true,
    },
  },
  {
    id: 'win-chrome-uk-office',
    name: 'Windows / Chrome / 英国-办公',
    description: '模拟英国办公室 Windows 用户 (en-GB)',
    config: {
      brand: 'Chrome', platform: 'windows',
      lang: 'en-GB', acceptLang: 'en-GB,en-US', timezone: 'Europe/London',
      resolution: '1920,1080', hardwareConcurrency: '8',
      disableWebrtcUdp: true,
      spoofCanvas: true, spoofAudio: true, spoofFont: true, spoofClientRects: true, spoofGpu: true,
    },
  },
  {
    id: 'mac-chrome-us-edu',
    name: 'macOS / Chrome / 美国-教育',
    description: '模拟美国大学教育网 Mac 用户',
    config: {
      brand: 'Chrome', platform: 'macos',
      lang: 'en-US', acceptLang: 'en-US', timezone: 'America/New_York',
      resolution: '1440,900', hardwareConcurrency: '8',
      disableWebrtcUdp: true,
      spoofCanvas: true, spoofAudio: true, spoofFont: true, spoofClientRects: true, spoofGpu: true,
    },
  },
]

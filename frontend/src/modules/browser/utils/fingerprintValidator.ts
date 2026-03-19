// 指纹配置校验与冲突检测（基于 Chrome 144 实际支持参数）

import type { FingerprintConfig } from './fingerprintSerializer'

export interface FingerprintWarning {
  field: string
  level: 'error' | 'warning' | 'info'
  message: string
}

const LANG_REGION_MAP: Record<string, string[]> = {
  'zh-CN': ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore'],
  'ja-JP': ['Asia/Tokyo'],
  'ko-KR': ['Asia/Seoul'],
  'en-US': ['America/New_York', 'America/Los_Angeles', 'America/Chicago', 'America/Denver'],
  'en-GB': ['Europe/London'],
  'fr-FR': ['Europe/Paris'],
  'de-DE': ['Europe/Berlin'],
}

const BRAND_PLATFORM_MAP: Record<string, string[]> = {
  Safari: ['macos'],
}

function parseResolution(resolution?: string, customResolution?: string) {
  const raw = resolution === 'custom' ? customResolution : resolution
  if (!raw) return null
  const parts = raw.split(',')
  if (parts.length !== 2) return null
  const w = parseInt(parts[0], 10)
  const h = parseInt(parts[1], 10)
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null
  return { w, h }
}

export function validateFingerprint(config: FingerprintConfig): FingerprintWarning[] {
  const warnings: FingerprintWarning[] = []

  // 品牌 × 平台
  if (config.brand && config.platform) {
    const allowed = BRAND_PLATFORM_MAP[config.brand]
    if (allowed && !allowed.includes(config.platform)) {
      warnings.push({
        field: 'brand',
        level: 'warning',
        message: `${config.brand} 与 ${config.platform} 组合不自然，容易被识别`,
      })
    }
  }

  // 语言 × 时区
  if (config.lang && config.timezone && config.timezone !== 'system') {
    const expectedZones = LANG_REGION_MAP[config.lang]
    if (expectedZones && !expectedZones.includes(config.timezone)) {
      warnings.push({
        field: 'timezone',
        level: 'warning',
        message: `语言 ${config.lang} 与时区 ${config.timezone} 地理位置不一致，容易被识别`,
      })
    }
  }

  // 语言 × Accept-Language
  if (config.lang && config.acceptLang && !config.acceptLang.includes(config.lang)) {
    warnings.push({
      field: 'acceptLang',
      level: 'warning',
      message: `Accept-Language 未包含主语言 ${config.lang}，组合不自然`,
    })
  }

  // macOS × 分辨率
  const res = parseResolution(config.resolution, config.customResolution)
  if (config.platform === 'macos' && res && res.w <= 1366 && res.h <= 768) {
    warnings.push({
      field: 'resolution',
      level: 'info',
      message: `macOS 常见分辨率更偏向 1440x900 / 2560x1440，当前 ${res.w}x${res.h} 较少见`,
    })
  }

  // 极端硬件值
  const cores = config.hardwareConcurrency ? parseInt(config.hardwareConcurrency, 10) : 0
  if (cores >= 16 && config.platform === 'macos') {
    warnings.push({
      field: 'hardwareConcurrency',
      level: 'info',
      message: 'macOS 用户中 16 核以上设备占比不高，建议确认是否符合目标人群',
    })
  }

  // seed
  if (!config.seed) {
    warnings.push({
      field: 'seed',
      level: 'info',
      message: '未设置指纹种子，系统将根据 ProfileId 自动生成',
    })
  }

  // WebRTC
  if (!config.disableWebrtcUdp) {
    warnings.push({
      field: 'disableWebrtcUdp',
      level: 'info',
      message: '未启用“禁用非代理 UDP”，WebRTC 可能暴露真实网络接口',
    })
  }

  // 伪装项被关闭
  const disabled: string[] = []
  if (config.spoofCanvas === false) disabled.push('Canvas')
  if (config.spoofAudio === false) disabled.push('Audio')
  if (config.spoofFont === false) disabled.push('字体')
  if (config.spoofClientRects === false) disabled.push('ClientRects')
  if (config.spoofGpu === false) disabled.push('GPU')

  if (disabled.length >= 3) {
    warnings.push({
      field: 'spoofing',
      level: 'warning',
      message: `已关闭 ${disabled.join('、')} 等多项伪装，真实设备特征暴露较多`,
    })
  } else if (disabled.length > 0) {
    warnings.push({
      field: 'spoofing',
      level: 'info',
      message: `已关闭 ${disabled.join('、')} 伪装`,
    })
  }

  // 不支持品牌提示
  if (config.brand === 'Firefox' || config.brand === 'Safari') {
    warnings.push({
      field: 'brand',
      level: 'warning',
      message: `${config.brand} 不是 Chrome 144 指纹参数支持的品牌，建议使用 Chrome / Edge / Opera / Vivaldi`,
    })
  }

  return warnings
}

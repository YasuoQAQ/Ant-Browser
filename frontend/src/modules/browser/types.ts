export interface BrowserRuntimeSummary {
  effectiveProxy?: string
  requestedLaunchArgs?: string[]
  requestedStartUrls?: string[]
  wsEndpoint?: string
  resetUserData?: boolean
  lastStartAt?: string
  lastStopAt?: string
  lastError?: string
  debugPort?: number
  pid?: number
  running: boolean
}

export interface ProfilePreferences {
  // 显示
  showWindowName?: boolean
  // 书签
  customBookmarks?: boolean
  // 同步
  syncBookmarks?: boolean
  syncHistory?: boolean
  syncTabs?: boolean
  syncCookies?: boolean
  syncExtensions?: boolean
  syncPasswords?: boolean
  syncIndexedDB?: boolean
  syncLocalStorage?: boolean
  syncSessionStorage?: boolean
  // 启动前清理
  clearCacheOnStart?: boolean
  clearCookiesOnStart?: boolean
  clearLocalStorageOnStart?: boolean
  // 指纹
  randomFingerprintOnStart?: boolean
  // 浏览器行为
  disablePasswordPrompt?: boolean
  // 安全检查
  stopOnNetworkFail?: boolean
  stopOnIPChange?: boolean
}

export interface FingerprintConfigData {
  seed?: string
  brand?: string
  brandVersion?: string
  platform?: string
  platformVersion?: string
  lang?: string
  acceptLang?: string
  timezone?: string
  resolution?: string
  customResolution?: string
  hardwareConcurrency?: string
  disableWebrtcUdp?: boolean
  spoofCanvas?: boolean
  spoofAudio?: boolean
  spoofFont?: boolean
  spoofClientRects?: boolean
  spoofGpu?: boolean
  unknownArgs?: string[]
}

export interface BrowserProfile {
  profileId: string
  profileName: string
  userDataDir: string
  coreId: string
  fingerprintArgs: string[]
  fingerprintConfig?: FingerprintConfigData
  proxyId: string
  proxyConfig: string
  launchArgs: string[]
  tags: string[]
  keywords: string[]
  groupId?: string
  preferences?: ProfilePreferences
  running: boolean
  debugPort: number
  pid: number
  lastError: string
  createdAt: string
  updatedAt: string
  lastStartAt?: string
  lastStopAt?: string
  launchCode?: string
  runtime?: BrowserRuntimeSummary
  effectiveProxy?: string
  requestedLaunchArgs?: string[]
  requestedStartUrls?: string[]
  wsEndpoint?: string
  resetUserData?: boolean
}

export interface BrowserProfileInput {
  profileName: string
  userDataDir: string
  coreId: string
  fingerprintArgs: string[]
  fingerprintConfig?: FingerprintConfigData
  proxyId: string
  proxyConfig: string
  launchArgs: string[]
  tags: string[]
  keywords: string[]
  groupId?: string
  preferences?: ProfilePreferences
}

export interface BrowserTab {
  tabId: string
  title: string
  url: string
  active: boolean
}

export interface BrowserSettings {
  userDataRoot: string
  defaultFingerprintArgs: string[]
  defaultLaunchArgs: string[]
  defaultProxy: string
}

export interface BrowserCore {
  coreId: string
  coreName: string
  corePath: string
  isDefault: boolean
}

export interface BrowserCoreInput {
  coreId: string
  coreName: string
  corePath: string
  isDefault: boolean
}

export interface BrowserCoreValidateResult {
  valid: boolean
  message: string
}

export interface BrowserProxy {
  proxyId: string
  proxyName: string
  proxyConfig: string
  dnsServers?: string
  groupName?: string
  sourceId?: string
  sourceUrl?: string
  sourceNamePrefix?: string
  sourceAutoRefresh?: boolean
  sourceRefreshIntervalM?: number
  sourceLastRefreshAt?: string
  lastLatencyMs?: number
  lastTestOk?: boolean
  lastTestedAt?: string
  lastIPHealthJson?: string
}

export interface ProxyIPHealthResult {
  proxyId: string
  ok: boolean
  source: string
  error: string
  ip: string
  fraudScore: number
  isResidential: boolean
  isBroadcast: boolean
  country: string
  region: string
  city: string
  asOrganization: string
  rawData: Record<string, any>
  updatedAt: string
}

export interface BrowserCoreExtended {
  coreId: string
  chromeVersion: string
  instanceCount: number
}

export interface CookieInfo {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: string
}

export interface SnapshotInfo {
  snapshotId: string
  profileId: string
  name: string
  sizeMB: number
  createdAt: string
}

export interface BrowserBookmark {
  name: string
  url: string
}


// 分组相关类型
export interface BrowserGroup {
  groupId: string
  groupName: string
  parentId: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface BrowserGroupInput {
  groupName: string
  parentId: string
  sortOrder: number
}

export interface BrowserGroupWithCount extends BrowserGroup {
  instanceCount: number
}

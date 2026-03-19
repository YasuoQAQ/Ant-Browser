import type { ProfilePreferences } from '../types'

interface PreferencesPanelProps {
  value: ProfilePreferences
  onChange: (prefs: ProfilePreferences) => void
}

interface PreferenceItem {
  key: keyof ProfilePreferences
  label: string
}

const SECTIONS: { title: string; items: PreferenceItem[] }[] = [
  {
    title: '显示与书签',
    items: [
      { key: 'showWindowName', label: '窗口名称' },
      { key: 'customBookmarks', label: '自定义书签' },
    ],
  },
  {
    title: '数据同步',
    items: [
      { key: 'syncBookmarks', label: '同步书签' },
      { key: 'syncHistory', label: '同步历史记录' },
      { key: 'syncTabs', label: '同步标签页' },
      { key: 'syncCookies', label: '同步 Cookie' },
      { key: 'syncExtensions', label: '同步扩展应用程序' },
      { key: 'syncPasswords', label: '同步已保存的用户名密码' },
      { key: 'syncIndexedDB', label: '同步 IndexedDB' },
      { key: 'syncLocalStorage', label: '同步 Local Storage' },
      { key: 'syncSessionStorage', label: '同步 Session Storage' },
    ],
  },
  {
    title: '启动前清理',
    items: [
      { key: 'clearCacheOnStart', label: '启动浏览器前删除缓存文件' },
      { key: 'clearCookiesOnStart', label: '启动浏览器前删除 Cookie' },
      { key: 'clearLocalStorageOnStart', label: '启动浏览器前删除 Local Storage' },
    ],
  },
  {
    title: '指纹与行为',
    items: [
      { key: 'randomFingerprintOnStart', label: '启动浏览器时随机指纹' },
      { key: 'disablePasswordPrompt', label: '弹出保存密码提示' },
    ],
  },
  {
    title: '安全检查',
    items: [
      { key: 'stopOnNetworkFail', label: '网络不通停止打开' },
      { key: 'stopOnIPChange', label: 'IP 发生变化停止打开' },
    ],
  },
]

export function PreferencesPanel({ value, onChange }: PreferencesPanelProps) {
  return (
    <div className="space-y-5">
      {SECTIONS.map((section, si) => (
        <div key={section.title}>
          {si > 0 && <div className="border-t border-[var(--color-border)] mb-4" />}
          <p className="text-xs font-medium text-[var(--color-text-muted)] mb-3 uppercase tracking-wide">{section.title}</p>
          <div className="space-y-2">
            {section.items.map(item => {
              // disablePasswordPrompt 含义反转：UI 显示"弹出保存密码提示"，开启=允许弹出=disable=false
              const isInverted = item.key === 'disablePasswordPrompt'
              const checked = isInverted ? !value[item.key] : !!value[item.key]

              return (
                <div key={item.key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors">
                  <span className="text-sm text-[var(--color-text-primary)]">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (isInverted) {
                          onChange({ ...value, [item.key]: false })
                        } else {
                          onChange({ ...value, [item.key]: true })
                        }
                      }}
                      className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                        checked
                          ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                          : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]'
                      }`}
                    >
                      开启
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isInverted) {
                          onChange({ ...value, [item.key]: true })
                        } else {
                          onChange({ ...value, [item.key]: false })
                        }
                      }}
                      className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                        !checked
                          ? 'bg-[var(--color-text-muted)] text-white border-[var(--color-text-muted)]'
                          : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]'
                      }`}
                    >
                      关闭
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

import { ReactNode, useState } from 'react'
import clsx from 'clsx'

export interface TabItem {
  key: string
  label: string
  icon?: ReactNode
  disabled?: boolean
}

interface TabsProps {
  items: TabItem[]
  activeKey?: string
  defaultActiveKey?: string
  onChange?: (key: string) => void
  children?: (activeKey: string) => ReactNode
}

export function Tabs({
  items,
  activeKey: controlledActiveKey,
  defaultActiveKey,
  onChange,
  children,
}: TabsProps) {
  const [internalActiveKey, setInternalActiveKey] = useState(
    defaultActiveKey || items[0]?.key || ''
  )

  const activeKey = controlledActiveKey ?? internalActiveKey

  const handleTabClick = (key: string, disabled?: boolean) => {
    if (disabled) return
    
    if (controlledActiveKey === undefined) {
      setInternalActiveKey(key)
    }
    onChange?.(key)
  }

  return (
    <div className="space-y-4">
      {/* Tab 导航 */}
      <div className="border-b border-[var(--color-border)]">
        <div className="flex gap-1">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => handleTabClick(item.key, item.disabled)}
              disabled={item.disabled}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative',
                'border-b-2 -mb-px',
                activeKey === item.key
                  ? 'text-[var(--color-accent)] border-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-secondary)]',
                item.disabled && 'opacity-40 cursor-not-allowed'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      {children && (
        <div className="animate-fade-in">
          {children(activeKey)}
        </div>
      )}
    </div>
  )
}

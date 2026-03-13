import { ReactNode, useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'

export interface DropdownItem {
  key: string
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
  danger?: boolean
  divider?: boolean
}

interface DropdownProps {
  items: DropdownItem[]
  onSelect?: (key: string) => void
  children?: ReactNode
  trigger?: ReactNode
  placement?: 'bottom-left' | 'bottom-right'
}

export function Dropdown({
  items,
  onSelect,
  children,
  trigger,
  placement = 'bottom-left',
}: DropdownProps) {
  const [visible, setVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible) {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setVisible(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [visible])

  const handleSelect = (item: DropdownItem) => {
    if (item.disabled || item.divider) return
    onSelect?.(item.key)
    setVisible(false)
  }

  const placementStyles = {
    'bottom-left': 'left-0',
    'bottom-right': 'right-0',
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <div onClick={() => setVisible(!visible)} className="cursor-pointer">
        {trigger || children || (
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-muted)] transition-colors">
            <span className="text-sm">操作</span>
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {visible && (
        <div
          className={clsx(
            'absolute top-full mt-2 z-50 min-w-[160px] bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 animate-scale-in',
            placementStyles[placement]
          )}
        >
          {items.map((item, index) => (
            item.divider ? (
              <div key={index} className="h-px bg-[var(--color-border)] my-1" />
            ) : (
              <button
                key={item.key}
                onClick={() => handleSelect(item)}
                disabled={item.disabled}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors',
                  item.disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : item.danger
                    ? 'text-[var(--color-error)] hover:bg-[var(--color-error)]/15'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
                )}
              >
                {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                {item.label}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  )
}

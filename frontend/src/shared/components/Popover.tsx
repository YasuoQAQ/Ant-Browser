import { ReactNode, useState, useRef, useEffect } from 'react'
import clsx from 'clsx'

type PopoverPlacement = 'top' | 'bottom' | 'left' | 'right'
type PopoverTrigger = 'click' | 'hover'

interface PopoverProps {
  content: ReactNode
  children: ReactNode
  placement?: PopoverPlacement
  trigger?: PopoverTrigger
  className?: string
}

export function Popover({
  content,
  children,
  placement = 'bottom',
  trigger = 'click',
  className,
}: PopoverProps) {
  const [visible, setVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (trigger === 'click' && visible) {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setVisible(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [visible, trigger])

  const handleTrigger = () => {
    if (trigger === 'click') {
      setVisible(!visible)
    }
  }

  const handleMouseEnter = () => {
    if (trigger === 'hover') {
      setVisible(true)
    }
  }

  const handleMouseLeave = () => {
    if (trigger === 'hover') {
      setVisible(false)
    }
  }

  const placementStyles = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div onClick={handleTrigger}>
        {children}
      </div>

      {visible && (
        <div
          className={clsx(
            'absolute z-50 animate-scale-in',
            placementStyles[placement],
            className
          )}
        >
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-lg p-3 min-w-[120px]">
            {content}
          </div>
        </div>
      )}
    </div>
  )
}

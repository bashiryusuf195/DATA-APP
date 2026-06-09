import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'

interface BottomSheetProps {
  open:       boolean
  onClose:    () => void
  title?:     string
  children:   ReactNode
  className?: string
}

/**
 * Android-style draggable bottom sheet.
 *
 * Features:
 * - Slides up from bottom with spring easing; slides back down on close
 * - Drag the pill handle downward to dismiss (threshold: 130 px)
 * - Backdrop tap also dismisses
 * - Locks body scroll while open
 * - Unmounts after the exit transition so it doesn't stay in the DOM
 * - Reduced motion: transitions are instant (no animation)
 *
 * Usage:
 *   <BottomSheet open={open} onClose={() => setOpen(false)} title="Filters">
 *     …content…
 *   </BottomSheet>
 */
export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [dragY,   setDragY]   = useState(0)

  const draggingRef  = useRef(false)
  const startYRef    = useRef(0)
  const dragYRef     = useRef(0)

  // Mount → wait 2 frames → set visible=true to trigger enter transition
  // Close → set visible=false → wait for transition → unmount
  useEffect(() => {
    if (open) {
      setMounted(true)
      document.body.style.overflow = 'hidden'
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true))
      )
    } else {
      setVisible(false)
      document.body.style.overflow = ''
      const t = setTimeout(() => { setMounted(false); setDragY(0) }, 340)
      return () => clearTimeout(t)
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  function onHandleTouchStart(e: React.TouchEvent) {
    draggingRef.current = true
    startYRef.current   = e.touches[0].clientY
    dragYRef.current    = 0
  }

  function onHandleTouchMove(e: React.TouchEvent) {
    if (!draggingRef.current) return
    const delta = e.touches[0].clientY - startYRef.current
    const clamped = Math.max(0, delta)
    dragYRef.current = clamped
    setDragY(clamped)
  }

  function onHandleTouchEnd() {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (dragYRef.current > 130) {
      onClose()
    } else {
      setDragY(0)
    }
  }

  if (!mounted) return null

  const isDragging = dragY > 0

  // Sheet transform: hidden below viewport → slides up to 0 → snaps back on drag release
  const sheetTransform =
    isDragging            ? `translateY(${dragY}px)` :
    visible               ? 'translateY(0)'           :
                            'translateY(100%)'

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px] sheet-backdrop"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 280ms ease' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet panel */}
      <div
        className={cn(
          'relative z-10 w-full max-h-[92vh] flex flex-col',
          'bg-surface-1 rounded-t-3xl shadow-modal',
          className,
        )}
        style={{
          transform:  sheetTransform,
          transition: isDragging ? 'none' : 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle — only this area captures the swipe-to-close gesture */}
        <div
          className="flex justify-center pt-3 pb-1.5 flex-shrink-0 cursor-grab active:cursor-grabbing"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          aria-hidden="true"
        >
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Optional title row */}
        {title && (
          <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0 border-b border-border">
            <h2 className="text-base font-bold text-ink">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-ink-faint hover:bg-surface-2 hover:text-ink transition-colors pressable"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Scrollable content — overscroll-contain prevents scroll chaining */}
        <div className="overflow-y-auto flex-1 overscroll-contain">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

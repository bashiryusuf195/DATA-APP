import { useNumPadStore } from '@/store/numpad.store'
import { cn } from '@/utils/cn'

const KEYS = ['1','2','3','4','5','6','7','8','9','dot','0','del'] as const
type Key = typeof KEYS[number]

export function NumPad() {
  const isOpen     = useNumPadStore((s) => s.isOpen)
  const label      = useNumPadStore((s) => s.label)
  const hasDecimal = useNumPadStore((s) => s.hasDecimal)
  const press      = useNumPadStore((s) => s.press)
  const close      = useNumPadStore((s) => s.close)

  if (!isOpen) return null

  function handleKey(key: Key) {
    if (key === 'dot') press('.')
    else               press(key)
  }

  return (
    // z-[45]: above BottomNav (z-40), below Modal backdrops (z-50)
    <div
      className="fixed inset-x-0 bottom-0 z-[45] select-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Label + Done bar */}
      <div className="flex items-center justify-between px-4 h-10 bg-[#CDD0D5] dark:bg-[#1C1C1E] border-t border-[#A8ABB2] dark:border-[#3A3A3C]">
        <span className="text-[11px] font-semibold text-ink-muted truncate pr-4">
          {label ?? ''}
        </span>
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); close() }}
          className="text-sm font-bold text-brand-600 dark:text-brand-400 px-2 py-1 rounded-lg shrink-0"
        >
          Done
        </button>
      </div>

      {/* Key grid — gap-px creates iOS-style dividers */}
      <div className="grid grid-cols-3 gap-px bg-[#A8ABB2] dark:bg-[#3A3A3C]">
        {KEYS.map((key) => {
          const isBlank   = key === 'dot' && !hasDecimal
          const isModifier = key === 'del' || isBlank

          return (
            <button
              key={key}
              type="button"
              disabled={isBlank}
              onPointerDown={(e) => {
                e.preventDefault()
                if (!isBlank) handleKey(key)
              }}
              className={cn(
                'flex items-center justify-center h-[54px] text-[22px] font-normal text-ink transition-colors',
                isModifier
                  ? 'bg-[#ADB0B7] dark:bg-[#2C2C2E] active:bg-[#C5C8CF] dark:active:bg-[#3C3C3E]'
                  : 'bg-[#F9FAFB] dark:bg-[#3A3A3C] active:bg-[#C5C8CF] dark:active:bg-[#4A4A4C]',
                isBlank && 'cursor-default',
              )}
            >
              {key === 'del'
                ? <span className="text-xl leading-none">⌫</span>
                : key === 'dot'
                  ? (hasDecimal ? '.' : null)
                  : key}
            </button>
          )
        })}
      </div>
    </div>
  )
}

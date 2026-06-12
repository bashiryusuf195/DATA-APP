import { create } from 'zustand'

interface NumPadConfig {
  fieldId:     string
  value:       string
  onChange:    (v: string) => void
  maxLength?:  number
  masked?:     boolean
  hasDecimal?: boolean
  label?:      string
  placeholder?: string
}

interface NumPadState {
  isOpen:      boolean
  fieldId:     string | null
  value:       string
  onChange:    (v: string) => void
  maxLength?:  number
  masked:      boolean
  hasDecimal:  boolean
  label?:      string
  placeholder?: string
  // actions
  open:        (cfg: NumPadConfig) => void
  close:       () => void
  press:       (key: string) => void
  syncValue:   (v: string) => void
}

export const useNumPadStore = create<NumPadState>((set, get) => ({
  isOpen:     false,
  fieldId:    null,
  value:      '',
  onChange:   () => {},
  maxLength:  undefined,
  masked:     false,
  hasDecimal: false,
  label:      undefined,
  placeholder: undefined,

  open: (cfg) => set({
    isOpen:     true,
    fieldId:    cfg.fieldId,
    value:      cfg.value,
    onChange:   cfg.onChange,
    maxLength:  cfg.maxLength,
    masked:     cfg.masked     ?? false,
    hasDecimal: cfg.hasDecimal ?? false,
    label:      cfg.label,
    placeholder: cfg.placeholder,
  }),

  close: () => set({ isOpen: false, fieldId: null }),

  press: (key) => {
    const { value, onChange, maxLength, hasDecimal } = get()
    let next: string

    if (key === 'del') {
      next = value.slice(0, -1)
    } else if (key === '.') {
      if (!hasDecimal || value.includes('.')) return
      next = (value === '' ? '0' : value) + '.'
    } else {
      // Count only digit characters toward maxLength
      const digitCount = value.replace(/\D/g, '').length
      if (maxLength != null && digitCount >= maxLength) return
      next = value + key
    }

    set({ value: next })
    onChange(next)
  },

  // Sync store value when the parent state changes externally (e.g. quick-chip)
  syncValue: (v) => set({ value: v }),
}))

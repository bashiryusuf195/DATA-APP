import { create } from 'zustand'

interface SystemStore {
  maintenance: boolean
  setMaintenance: (v: boolean) => void
}

export const useSystemStore = create<SystemStore>((set) => ({
  maintenance: false,
  setMaintenance: (v) => set({ maintenance: v }),
}))

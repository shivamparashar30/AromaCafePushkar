import { useCallback, useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'

/**
 * Kitchen display preferences, stored per device.
 *
 * SecureStore is used because it is the only persistence already in this app (it backs
 * the auth session). These are not secrets; the alternative would be adding
 * async-storage as a dependency for a few hundred bytes of settings.
 */
export interface KdsSettings {
  /** 'board' = Kanban columns, 'grid' = one flat list sorted by age. */
  view: 'board' | 'grid'
  theme: 'light' | 'dark'
  /** Multiplies the whole type scale, for screens further from the line. */
  fontScale: number
  /** 0 = derive from screen width. Any other value forces that many columns of cards. */
  cardsPerRowOverride: number
  /** Minutes before a ticket turns amber, then red. */
  warnAfterMinutes: number
  urgentAfterMinutes: number
  /** null = every station. */
  station: string | null
  soundEnabled: boolean
  soundVolume: number
  keepAwake: boolean
  showAllDay: boolean
}

export const DEFAULT_SETTINGS: KdsSettings = {
  view: 'board',
  theme: 'light',
  fontScale: 1,
  cardsPerRowOverride: 0,
  warnAfterMinutes: 10,
  urgentAfterMinutes: 20,
  station: null,
  soundEnabled: true,
  soundVolume: 0.8,
  keepAwake: true,
  showAllDay: false,
}

const KEY = 'kds_settings_v1'

export async function loadSettings(): Promise<KdsSettings> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    if (!raw) return DEFAULT_SETTINGS
    // Merged over the defaults so a settings file written by an older build, missing
    // keys added since, still loads instead of rendering an undefined-shaped screen.
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(next: KdsSettings) {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(next))
  } catch {
    // Preferences only — a failure here must never block the board.
  }
}

export function useKdsSettings() {
  const [settings, setSettings] = useState<KdsSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadSettings().then((s) => { setSettings(s); setLoaded(true) })
  }, [])

  const update = useCallback((patch: Partial<KdsSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      void saveSettings(next)
      return next
    })
  }, [])

  return { settings, update, loaded }
}

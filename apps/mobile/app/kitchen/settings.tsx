import { router } from 'expo-router'
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/context/AuthContext'
import { DEFAULT_SETTINGS, useKdsSettings } from '../../src/kds/settings'
import {
  CARDS_PER_COLUMN,
  screenClassFor,
  themeFor,
  touchSize,
  typeScale,
  type KdsTheme,
} from '../../src/kds/theme'

const FONT_SCALES = [0.9, 1, 1.15, 1.3, 1.5]
const CARD_COUNTS = [0, 1, 2, 3, 4, 5, 6]
const THRESHOLDS = [5, 10, 15, 20, 30, 45]

/** Kitchen manager settings. Everything here is stored per device. */
export default function KitchenSettings() {
  const { width } = useWindowDimensions()
  const { settings, update, loaded } = useKdsSettings()
  const { profile, signOut } = useAuth()

  function handleSignOut() {
    Alert.alert('Sign out?', 'You will need your PIN to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut()
          router.replace('/login')
        },
      },
    ])
  }
  const screen = screenClassFor(width)
  const theme = themeFor(settings)
  const t = typeScale(screen, settings.fontScale)
  const touch = touchSize(screen)

  if (!loaded) return <View style={[styles.fill, { backgroundColor: theme.bg }]} />

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { fontSize: t.kot * 0.7, color: theme.text }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Appearance" theme={theme} t={t}>
          <Row label="Theme" hint="Dark is easier on the eyes in a bright kitchen and saves power on TVs." theme={theme} t={t}>
            <Segmented
              options={[{ v: 'dark', l: 'Dark' }, { v: 'light', l: 'Light' }]}
              value={settings.theme}
              onChange={(v) => update({ theme: v as 'dark' | 'light' })}
              theme={theme} t={t} touch={touch}
            />
          </Row>

          <Row label="Default view" theme={theme} t={t}>
            <Segmented
              options={[{ v: 'board', l: 'Board' }, { v: 'grid', l: 'Grid' }]}
              value={settings.view}
              onChange={(v) => update({ view: v as 'board' | 'grid' })}
              theme={theme} t={t} touch={touch}
            />
          </Row>

          <Row label="Text size" hint={`Screen detected as ${screen}.`} theme={theme} t={t}>
            <Segmented
              options={FONT_SCALES.map((f) => ({ v: String(f), l: `${Math.round(f * 100)}%` }))}
              value={String(settings.fontScale)}
              onChange={(v) => update({ fontScale: Number(v) })}
              theme={theme} t={t} touch={touch}
            />
          </Row>

          <Row
            label="Cards per column"
            hint={`Auto uses ${CARDS_PER_COLUMN[screen]} on this screen.`}
            theme={theme} t={t}
          >
            <Segmented
              options={CARD_COUNTS.map((c) => ({ v: String(c), l: c === 0 ? 'Auto' : String(c) }))}
              value={String(settings.cardsPerRowOverride)}
              onChange={(v) => update({ cardsPerRowOverride: Number(v) })}
              theme={theme} t={t} touch={touch}
            />
          </Row>
        </Section>

        <Section title="Timing" theme={theme} t={t}>
          <Row label="Warn after" hint="Card turns amber." theme={theme} t={t}>
            <Segmented
              options={THRESHOLDS.map((m) => ({ v: String(m), l: `${m}m` }))}
              value={String(settings.warnAfterMinutes)}
              onChange={(v) => update({ warnAfterMinutes: Number(v) })}
              theme={theme} t={t} touch={touch}
            />
          </Row>
          <Row label="Urgent after" hint="Card turns red with a full border." theme={theme} t={t}>
            <Segmented
              options={THRESHOLDS.map((m) => ({ v: String(m), l: `${m}m` }))}
              value={String(settings.urgentAfterMinutes)}
              onChange={(v) => update({ urgentAfterMinutes: Number(v) })}
              theme={theme} t={t} touch={touch}
            />
          </Row>
        </Section>

        <Section title="Alerts" theme={theme} t={t}>
          <ToggleRow
            label="Alert on new ticket"
            hint="Vibrates and flashes the top of the screen. Audio needs the expo-audio package — see the handover notes."
            value={settings.soundEnabled}
            onChange={(v) => update({ soundEnabled: v })}
            theme={theme} t={t}
          />
          <ToggleRow
            label="All-day summary"
            hint="Totals each pending dish across every ticket, for batch cooking."
            value={settings.showAllDay}
            onChange={(v) => update({ showAllDay: v })}
            theme={theme} t={t}
          />
          <ToggleRow
            label="Keep screen awake"
            hint="Needs the expo-keep-awake package to take effect — see the handover notes."
            value={settings.keepAwake}
            onChange={(v) => update({ keepAwake: v })}
            theme={theme} t={t}
          />
        </Section>

        <Pressable
          onPress={() => update(DEFAULT_SETTINGS)}
          style={[styles.reset, { minHeight: touch, borderColor: theme.border }]}
        >
          <Text style={[styles.resetText, { fontSize: t.note, color: theme.textDim }]}>
            Reset to defaults
          </Text>
        </Pressable>

        <View style={[styles.signedIn, { borderColor: theme.border }]}>
          <Text style={[styles.rowLabel, { fontSize: t.note, color: theme.text }]}>
            {profile?.name ?? 'Kitchen'}
          </Text>
          <Pressable
            onPress={handleSignOut}
            style={[styles.signOut, { minHeight: touch, borderColor: theme.danger }]}
          >
            <Ionicons name="log-out-outline" size={t.item} color={theme.danger} />
            <Text style={[styles.signOutText, { fontSize: t.note, color: theme.danger }]}>
              Sign out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Section({ title, children, theme, t }: any) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { fontSize: t.meta, color: theme.textDim }]}>{title}</Text>
      <View style={[styles.sectionBody, { backgroundColor: theme.card, borderColor: theme.border }]}>{children}</View>
    </View>
  )
}

function Row({ label, hint, children, theme, t }: any) {
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <Text style={[styles.rowLabel, { fontSize: t.note, color: theme.text }]}>{label}</Text>
      {hint ? <Text style={[styles.rowHint, { fontSize: t.meta, color: theme.textDim }]}>{hint}</Text> : null}
      <View style={styles.rowControl}>{children}</View>
    </View>
  )
}

interface ToggleRowProps {
  label: string
  hint?: string
  value: boolean
  onChange: (value: boolean) => void
  theme: KdsTheme
  t: ReturnType<typeof typeScale>
}

function ToggleRow({ label, hint, value, onChange, theme, t }: ToggleRowProps) {
  return (
    <View style={[styles.row, styles.toggleRow, { borderBottomColor: theme.border }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[styles.rowLabel, { fontSize: t.note, color: theme.text }]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { fontSize: t.meta, color: theme.textDim }]}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent }} />
    </View>
  )
}

interface SegmentedProps {
  options: { v: string; l: string }[]
  value: string
  onChange: (value: string) => void
  theme: KdsTheme
  t: ReturnType<typeof typeScale>
  touch: number
}

function Segmented({ options, value, onChange, theme, t, touch }: SegmentedProps) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const on = value === o.v
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            style={[
              styles.segment,
              {
                minHeight: touch * 0.78,
                backgroundColor: on ? theme.accent : theme.cardRaised,
                borderColor: on ? theme.accent : theme.border,
              },
            ]}
          >
            <Text style={[styles.segmentText, { fontSize: t.meta + 1, color: on ? '#fff' : theme.text }]}>
              {o.l}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  title: { fontWeight: '800' },
  content: { padding: 16, paddingBottom: 48, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 4 },
  sectionBody: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row: { padding: 14, borderBottomWidth: 1, gap: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { fontWeight: '700' },
  rowHint: { fontWeight: '500', lineHeight: 18 },
  rowControl: { marginTop: 2 },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { flexGrow: 1, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, borderWidth: 2 },
  segmentText: { fontWeight: '700' },
  reset: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  resetText: { fontWeight: '700' },
  signedIn: { gap: 10, paddingTop: 16, borderTopWidth: 1 },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5 },
  signOutText: { fontWeight: '800' },
})

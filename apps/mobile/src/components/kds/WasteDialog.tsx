import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { WasteReason } from '../../lib/api'
import { touchSize, typeScale, type KdsTheme, type ScreenClass } from '../../kds/theme'
import type { KdsSettings } from '../../kds/settings'

const REASONS: WasteReason[] = ['Burnt', 'Dropped', 'Wrong order', 'Customer returned', 'Expired', 'Other']

export interface WasteTarget {
  orderItemId: string
  label: string
  qty: number
}

/**
 * Waste capture. Reasons are large buttons rather than a dropdown because this is used
 * mid-service, often one-handed — the whole interaction should be two taps.
 */
export function WasteDialog({
  target,
  theme,
  screen,
  settings,
  onCancel,
  onConfirm,
}: {
  target: WasteTarget | null
  theme: KdsTheme
  screen: ScreenClass
  settings: KdsSettings
  onCancel: () => void
  onConfirm: (reason: WasteReason, note: string, reFire: boolean) => void
}) {
  const t = typeScale(screen, settings.fontScale)
  const touch = touchSize(screen)
  const [reason, setReason] = useState<WasteReason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  function reset() {
    setReason(null)
    setNote('')
    setBusy(false)
  }

  function finish(reFire: boolean) {
    if (!reason || busy) return
    setBusy(true)
    onConfirm(reason, note, reFire)
    reset()
  }

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { fontSize: t.kot * 0.7, color: theme.text }]}>Record waste</Text>
            <Pressable onPress={() => { reset(); onCancel() }} hitSlop={10}>
              <Ionicons name="close" size={t.item + 6} color={theme.textDim} />
            </Pressable>
          </View>

          <Text style={[styles.subject, { fontSize: t.item, color: theme.text }]}>
            {target?.qty} × {target?.label}
          </Text>

          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 4 }}>
            <Text style={[styles.label, { fontSize: t.note, color: theme.textDim }]}>Reason</Text>
            <View style={styles.reasons}>
              {REASONS.map((r) => {
                const on = reason === r
                return (
                  <Pressable
                    key={r}
                    onPress={() => setReason(r)}
                    style={[
                      styles.reason,
                      {
                        minHeight: touch,
                        backgroundColor: on ? theme.danger : theme.cardRaised,
                        borderColor: on ? theme.danger : theme.border,
                      },
                    ]}
                  >
                    <Text style={[styles.reasonText, { fontSize: t.note, color: on ? '#fff' : theme.text }]}>
                      {r}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={[styles.label, { fontSize: t.note, color: theme.textDim }]}>Note (optional)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="What happened?"
              placeholderTextColor={theme.textDim}
              style={[
                styles.input,
                { minHeight: touch, fontSize: t.note, color: theme.text, backgroundColor: theme.cardRaised, borderColor: theme.border },
              ]}
              multiline
            />
          </ScrollView>

          {/* Re-fire is the real decision here, so it is two explicit buttons rather than
              a toggle the chef has to notice before confirming. */}
          <Text style={[styles.label, { fontSize: t.note, color: theme.textDim }]}>
            Cook this again?
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => finish(false)}
              disabled={!reason || busy}
              style={[
                styles.action,
                { minHeight: touch, backgroundColor: theme.cardRaised, borderColor: theme.border, opacity: reason ? 1 : 0.4 },
              ]}
            >
              <Text style={[styles.actionText, { fontSize: t.note, color: theme.text }]}>
                No, just log it
              </Text>
            </Pressable>
            <Pressable
              onPress={() => finish(true)}
              disabled={!reason || busy}
              style={[
                styles.action,
                { minHeight: touch, backgroundColor: theme.accent, borderColor: theme.accent, opacity: reason ? 1 : 0.4 },
              ]}
            >
              <Ionicons name="refresh" size={t.note + 2} color="#fff" />
              <Text style={[styles.actionText, { fontSize: t.note, color: '#fff' }]}>Re-fire</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '88%', borderRadius: 20, borderWidth: 1, padding: 20, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: '800' },
  subject: { fontWeight: '700' },
  scroll: { flexGrow: 0 },
  label: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8, marginBottom: 6 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reason: { flexGrow: 1, minWidth: '30%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 2 },
  reasonText: { fontWeight: '700', textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 2, paddingHorizontal: 10 },
  actionText: { fontWeight: '800', textAlign: 'center' },
})

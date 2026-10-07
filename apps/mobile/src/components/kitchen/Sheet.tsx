import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { K } from '../../kitchen/theme'

/** Bottom sheet shell shared by the kitchen's pop-ups. */
export function Sheet({ visible, title, subtitle, onClose, children }: {
  visible: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable style={styles.close} onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={K.textMuted} />
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: K.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e5e5', alignSelf: 'center', marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: K.text },
  subtitle: { fontSize: 13, color: K.textMuted, marginTop: 2 },
  close: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: K.divider,
    alignItems: 'center', justifyContent: 'center',
  },
})

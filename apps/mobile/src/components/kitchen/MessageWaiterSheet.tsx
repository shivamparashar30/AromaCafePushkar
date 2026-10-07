import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { messageWaiter } from '../../lib/api'
import type { Order } from '../../lib/types'
import { K } from '../../kitchen/theme'
import { Sheet } from './Sheet'

const QUICK_MESSAGES = [
  'Running late, about 10 more minutes',
  'An item is out of stock, please check with the guest',
  'Need clarification on this order',
  'Food is ready, please pick up now',
]

const MAX_LENGTH = 200

export function MessageWaiterSheet({ order, onClose, onSent }: {
  order: Order | null
  onClose: () => void
  onSent: (order: Order) => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { if (order) setText('') }, [order])

  async function send(message: string) {
    if (!order || !message.trim() || sending) return
    setSending(true)
    try {
      await messageWaiter(order.id, message.trim())
      onSent(order)
      onClose()
    } catch (err: any) {
      Alert.alert('Message not sent', err?.message || 'Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet
      visible={!!order}
      title="Message waiter"
      subtitle={order ? `KOT #${order.kot_number} · ${order.table_name || 'Counter'}` : undefined}
      onClose={onClose}
    >
      <View style={styles.quickList}>
        {QUICK_MESSAGES.map((m) => (
          <Pressable
            key={m}
            style={({ pressed }) => [styles.quick, pressed && styles.quickPressed]}
            onPress={() => send(m)}
            disabled={sending}
          >
            <Text style={styles.quickText}>{m}</Text>
            <Ionicons name="send" size={16} color={K.orange} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Or write your own</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="e.g. No more paneer, offer mushroom instead"
          placeholderTextColor={K.textFaint}
          maxLength={MAX_LENGTH}
          multiline
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={() => send(text)}
        />
        <Pressable
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={() => send(text)}
          disabled={!text.trim() || sending}
          accessibilityLabel="Send message"
        >
          {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  quickList: { gap: 8 },
  quick: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    backgroundColor: K.orangeLight, borderWidth: 1, borderColor: K.orangeBorder,
  },
  quickPressed: { backgroundColor: K.orangeSoft },
  quickText: { flex: 1, fontSize: 15, fontWeight: '600', color: K.text },
  label: { fontSize: 12, fontWeight: '700', color: K.textMuted, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, minHeight: 48, maxHeight: 110, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: K.text, backgroundColor: '#fff',
  },
  sendBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: K.orange, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
})

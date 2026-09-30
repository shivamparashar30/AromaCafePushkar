import { useEffect, useState } from 'react'
import { fetchOutletName } from '../../src/lib/api'
import { router } from 'expo-router'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/context/AuthContext'

const ORANGE = '#E8713A'

export default function KitchenAccountScreen() {
  const [outletName, setOutletName] = useState('')

  useEffect(() => {
    fetchOutletName().then(setOutletName).catch(() => {})
  }, [])
  const { profile, signOut } = useAuth()

  async function handleSignOut() {
    Alert.alert('Sign out?', 'You will need to enter your PIN again.', [
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

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {profile?.name?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.name}>{profile?.name}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>Kitchen</Text>
        </View>
        <View style={styles.phoneRow}>
          <Ionicons name="call-outline" size={14} color="#999" />
          <Text style={styles.phone}>{profile?.phone}</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Ionicons name="cafe-outline" size={18} color={ORANGE} />
          <Text style={styles.infoText}>{outletName || '—'}</Text>
        </View>
      </View>

      <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa', padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: ORANGE,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  name: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  roleBadge: {
    backgroundColor: '#FFF0E8',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 6,
  },
  roleText: {
    fontSize: 13,
    fontWeight: '600',
    color: ORANGE,
    textTransform: 'capitalize',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  phone: { fontSize: 14, color: '#999' },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 14,
    borderRadius: 14,
  },
  signOutText: { color: '#ef4444', fontSize: 16, fontWeight: '700' },
})

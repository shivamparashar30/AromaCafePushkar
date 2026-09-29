import { router } from 'expo-router'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/context/AuthContext'

export default function KitchenAccountScreen() {
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
          <Ionicons name="call-outline" size={14} color="#9ca3af" />
          <Text style={styles.phone}>{profile?.phone}</Text>
        </View>
      </View>

      <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#fff" />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  name: { fontSize: 20, fontWeight: '700', color: '#111' },
  roleBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  roleText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  phone: { fontSize: 14, color: '#9ca3af' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 12,
  },
  signOutText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})

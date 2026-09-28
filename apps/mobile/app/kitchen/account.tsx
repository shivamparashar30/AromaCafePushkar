import { router } from 'expo-router'
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native'
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
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{profile?.name}</Text>
        <Text style={styles.role}>Kitchen</Text>
        <Text style={styles.phone}>{profile?.phone}</Text>
      </View>

      <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  name: { fontSize: 20, fontWeight: '700' },
  role: { fontSize: 14, color: '#888', textTransform: 'capitalize', marginTop: 4 },
  phone: { fontSize: 14, color: '#666', marginTop: 8 },
  signOutBtn: { marginTop: 24, backgroundColor: '#ef4444', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  signOutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})

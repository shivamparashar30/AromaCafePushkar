import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { loginWithPin } from '../src/lib/auth'
import { useAuth } from '../src/context/AuthContext'
import { loadProfile } from '../src/lib/auth'
import { supabase } from '../src/lib/supabase'

export default function LoginScreen() {
  const { setProfile } = useAuth()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [platform, setPlatform] = useState<'android_waiter' | 'android_kitchen'>('android_waiter')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!phone || !pin) {
      Alert.alert('Error', 'Please enter phone and PIN')
      return
    }

    setLoading(true)
    try {
      const deviceId = `${Platform.OS}-${Platform.Version}-app`
      const result = await loginWithPin(phone, pin, deviceId, platform)

      // Load the full profile
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const profile = await loadProfile(session.user.id)
        setProfile(profile)
        if (profile?.role === 'kitchen') {
          router.replace('/kitchen')
        } else {
          router.replace('/waiter')
        }
      }
    } catch (err: any) {
      Alert.alert('Login failed', err.message || 'Check your phone and PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Restro Staff</Text>
        <Text style={styles.subtitle}>Sign in with your phone and PIN</Text>

        <TextInput
          style={styles.input}
          placeholder="Phone (+91...)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="PIN"
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />

        <View style={styles.roleRow}>
          <Pressable
            style={[styles.roleBtn, platform === 'android_waiter' && styles.roleBtnActive]}
            onPress={() => setPlatform('android_waiter')}
          >
            <Text style={[styles.roleBtnText, platform === 'android_waiter' && styles.roleBtnTextActive]}>
              Waiter
            </Text>
          </Pressable>
          <Pressable
            style={[styles.roleBtn, platform === 'android_kitchen' && styles.roleBtnActive]}
            onPress={() => setPlatform('android_kitchen')}
          >
            <Text style={[styles.roleBtnText, platform === 'android_kitchen' && styles.roleBtnTextActive]}>
              Kitchen
            </Text>
          </Pressable>
        </View>

        <Pressable style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loginBtnText}>Sign in</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  card: { width: '85%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 12, padding: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  roleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  roleBtnActive: { backgroundColor: '#111', borderColor: '#111' },
  roleBtnText: { fontSize: 14, fontWeight: '600', color: '#666' },
  roleBtnTextActive: { color: '#fff' },
  loginBtn: { backgroundColor: '#111', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})

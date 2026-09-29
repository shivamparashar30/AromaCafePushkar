import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { loginWithPin } from '../src/lib/auth'
import { useAuth } from '../src/context/AuthContext'
import { loadProfile } from '../src/lib/auth'
import { supabase } from '../src/lib/supabase'

const ORANGE = '#E8713A'
const ORANGE_LIGHT = '#FFF7F2'
const ORANGE_BORDER = '#FDDCC8'

export default function LoginScreen() {
  const { setProfile } = useAuth()
  const [phone, setPhone] = useState('+91')
  const [pin, setPin] = useState('')
  const [platform, setPlatform] = useState<'android_waiter' | 'android_kitchen'>('android_waiter')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    const digits = phone.replace(/^\+91/, '')
    if (!digits || digits.length < 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number')
      return
    }
    if (!pin || pin.length < 4) {
      Alert.alert('Error', 'Please enter your PIN (4-6 digits)')
      return
    }

    setLoading(true)
    try {
      const deviceId = `${Platform.OS}-${Platform.Version}-app`
      await loginWithPin('+91' + digits, pin, deviceId, platform)

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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <View style={styles.logoCircle}>
          <Ionicons name="cafe" size={32} color="#fff" />
        </View>
        <Text style={styles.title}>Aroma Cafe Pushkar</Text>
        <Text style={styles.subtitle}>Sign in with your phone & PIN</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone number</Text>
          <View style={styles.phoneRow}>
            <View style={styles.phonePrefix}>
              <Text style={styles.phonePrefixText}>+91</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              placeholder="Enter 10-digit number"
              placeholderTextColor="#c4c4c4"
              value={phone.replace(/^\+91/, '')}
              onChangeText={(text) => setPhone('+91' + text.replace(/[^0-9]/g, ''))}
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>PIN</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your PIN"
            placeholderTextColor="#c4c4c4"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Role</Text>
          <View style={styles.roleRow}>
            <Pressable
              style={[styles.roleBtn, platform === 'android_waiter' && styles.roleBtnActive]}
              onPress={() => setPlatform('android_waiter')}
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={platform === 'android_waiter' ? '#fff' : '#888'}
              />
              <Text style={[styles.roleBtnText, platform === 'android_waiter' && styles.roleBtnTextActive]}>
                Waiter
              </Text>
            </Pressable>
            <Pressable
              style={[styles.roleBtn, platform === 'android_kitchen' && styles.roleBtnActive]}
              onPress={() => setPlatform('android_kitchen')}
            >
              <Ionicons
                name="flame-outline"
                size={18}
                color={platform === 'android_kitchen' ? '#fff' : '#888'}
              />
              <Text style={[styles.roleBtnText, platform === 'android_kitchen' && styles.roleBtnTextActive]}>
                Kitchen
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[styles.loginBtn, loading && { opacity: 0.7 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.loginBtnText}>Sign in</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  card: {
    width: '88%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  logoCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
    shadowColor: ORANGE,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 28,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  phoneRow: {
    flexDirection: 'row',
  },
  phonePrefix: {
    backgroundColor: ORANGE_LIGHT,
    borderWidth: 1,
    borderColor: ORANGE_BORDER,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderRightWidth: 0,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  phonePrefixText: {
    fontSize: 16,
    fontWeight: '600',
    color: ORANGE,
  },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    backgroundColor: '#fafafa',
  },
  roleBtnActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  roleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  roleBtnTextActive: {
    color: '#fff',
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ORANGE,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    shadowColor: ORANGE,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
})

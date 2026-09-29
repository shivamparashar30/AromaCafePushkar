import { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { Ionicons } from '@expo/vector-icons'
import { AuthProvider } from '../src/context/AuthContext'

SplashScreen.preventAutoHideAsync()

function AppSplash({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onReady()
    }, 1500)
    return () => clearTimeout(timer)
  }, [onReady])

  return (
    <View style={splashStyles.container}>
      <View style={splashStyles.logoCircle}>
        <Ionicons name="cafe" size={44} color="#fff" />
      </View>
      <Text style={splashStyles.title}>Aroma Cafe</Text>
      <Text style={splashStyles.subtitle}>Pushkar</Text>
    </View>
  )
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#E8713A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#E8713A',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#E8713A',
    marginTop: 2,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
})

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true)

  const onLayoutReady = useCallback(async () => {
    await SplashScreen.hideAsync()
  }, [])

  useEffect(() => {
    onLayoutReady()
  }, [onLayoutReady])

  if (showSplash) {
    return (
      <>
        <StatusBar style="dark" />
        <AppSplash onReady={() => setShowSplash(false)} />
      </>
    )
  }

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Slot />
    </AuthProvider>
  )
}

import { Redirect, Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useKeepAwake } from 'expo-keep-awake'
import { useAuth } from '../../src/context/AuthContext'

const ORANGE = '#E8713A'
const ORANGE_LIGHT = '#FFF7F2'

export default function KitchenLayout() {
  // A kitchen display that dims mid-rush is a missed ticket. Held for the whole kitchen
  // app (board, stock, account) and released on sign-out when this layout unmounts.
  useKeepAwake()
  const { profile } = useAuth()
  const insets = useSafeAreaInsets()
  if (!profile) return <Redirect href="/login" />

  const tabBarHeight = 60 + insets.bottom

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.6)',
        tabBarStyle: {
          backgroundColor: ORANGE,
          borderTopWidth: 0,
          height: tabBarHeight,
          paddingBottom: insets.bottom + 4,
          paddingTop: 6,
          elevation: 8,
          shadowColor: ORANGE,
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
        },
        headerStyle: {
          backgroundColor: ORANGE_LIGHT,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: '#FDDCC8',
        },
        headerTitleStyle: {
          fontSize: 17,
          fontWeight: '700',
          color: '#1a1a1a',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Orders',
          headerTitle: 'Kitchen',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flame-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Stock',
          headerTitle: 'Stock',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}

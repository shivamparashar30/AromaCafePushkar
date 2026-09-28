import { Redirect, Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useAuth } from '../../src/context/AuthContext'

export default function WaiterLayout() {
  const { profile } = useAuth()
  if (!profile) return <Redirect href="/login" />

  return (
    <Tabs screenOptions={{ headerShown: true, tabBarActiveTintColor: '#111' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tables',
          headerTitle: `Hi, ${profile.name}`,
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🪑</Text>,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🔔</Text>,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>👤</Text>,
        }}
      />
    </Tabs>
  )
}

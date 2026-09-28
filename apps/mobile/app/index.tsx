import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../src/context/AuthContext'

export default function Index() {
  const { loading, profile } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!profile) return <Redirect href="/login" />

  if (profile.role === 'kitchen') return <Redirect href="/kitchen" />
  return <Redirect href="/waiter" />
}

import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useAuth } from '../../src/context/AuthContext'
import { claimTable, fetchWaiterTables } from '../../src/lib/api'
import { supabase } from '../../src/lib/supabase'
import type { TableWithSession } from '../../src/lib/types'

const STATUS_COLORS: Record<string, string> = {
  free: '#22c55e',
  occupied: '#3b82f6',
  bill_requested: '#f59e0b',
  paid: '#a855f7',
  cleaning: '#6b7280',
  reserved: '#ef4444',
}

export default function WaiterTablesScreen() {
  const { profile } = useAuth()
  const [tables, setTables] = useState<TableWithSession[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    try {
      const data = await fetchWaiterTables(profile.id)
      setTables(data)
    } catch (err) {
      console.error('Failed to load tables', err)
    }
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  // Realtime subscription for table changes
  useEffect(() => {
    const channel = supabase
      .channel('waiter-tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, () => load())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function handleClaim(tableId: string) {
    try {
      await claimTable(tableId)
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not claim table')
    }
  }

  function handleTablePress(table: TableWithSession) {
    if (table.session_id) {
      router.push(`/waiter/session/${table.session_id}`)
    } else if (table.status === 'free') {
      Alert.alert('Claim table?', `Claim ${table.name} and start a session?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Claim', onPress: () => handleClaim(table.id) },
      ])
    }
  }

  const myTables = tables.filter((t) => t.waiter_id === profile?.id)
  const otherTables = tables.filter((t) => t.waiter_id !== profile?.id)

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={[...myTables, ...otherTables]}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          myTables.length > 0 ? (
            <Text style={styles.sectionHeader}>My tables ({myTables.length})</Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <>
            {index === myTables.length && otherTables.length > 0 && (
              <Text style={styles.sectionHeader}>Other tables</Text>
            )}
            <Pressable style={styles.tableCard} onPress={() => handleTablePress(item)}>
              <View style={styles.tableRow}>
                <View>
                  <Text style={styles.tableName}>{item.name}</Text>
                  <Text style={styles.tableFloor}>{item.floor_name} &middot; {item.capacity} seats</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] ?? '#999' }]}>
                  <Text style={styles.statusText}>{item.status.replace('_', ' ')}</Text>
                </View>
              </View>
              {item.waiter_id === profile?.id && (
                <Text style={styles.assignedLabel}>Assigned to you</Text>
              )}
            </Pressable>
          </>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No tables found.</Text>}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  sectionHeader: { fontSize: 13, fontWeight: '600', color: '#888', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableCard: { backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4, borderRadius: 10, padding: 14, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tableName: { fontSize: 16, fontWeight: '600' },
  tableFloor: { fontSize: 13, color: '#888', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  assignedLabel: { fontSize: 12, color: '#3b82f6', fontWeight: '500', marginTop: 6 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 14 },
})

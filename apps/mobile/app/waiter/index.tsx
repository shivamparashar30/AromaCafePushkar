import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/context/AuthContext'
import { claimTable, fetchWaiterTables } from '../../src/lib/api'
import { supabase } from '../../src/lib/supabase'
import type { TableWithSession } from '../../src/lib/types'

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  free: { color: '#15803d', bg: '#dcfce7', label: 'Free' },
  occupied: { color: '#1d4ed8', bg: '#dbeafe', label: 'Occupied' },
  bill_requested: { color: '#b45309', bg: '#fef3c7', label: 'Bill' },
  reserved: { color: '#dc2626', bg: '#fee2e2', label: 'Reserved' },
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
      Alert.alert('Start session?', `Claim ${table.name} and start a new session?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Claim', onPress: () => handleClaim(table.id) },
      ])
    }
  }

  const myTables = tables.filter((t) => t.waiter_id === profile?.id)
  const otherTables = tables.filter((t) => t.waiter_id !== profile?.id)

  function renderTable(item: TableWithSession) {
    const config = STATUS_CONFIG[item.status] ?? { color: '#666', bg: '#f3f4f6', label: item.status }
    const isMine = item.waiter_id === profile?.id

    return (
      <Pressable
        style={[styles.tableCard, isMine && styles.tableCardMine]}
        onPress={() => handleTablePress(item)}
      >
        <View style={styles.tableRow}>
          <View style={styles.tableInfo}>
            <Text style={styles.tableName}>{item.name}</Text>
            <Text style={styles.tableMeta}>
              {item.floor_name} · {item.capacity} seats
              {item.guest_count ? ` · ${item.guest_count} guests` : ''}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
            <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
          </View>
        </View>
        {isMine && (
          <View style={styles.assignedRow}>
            <Ionicons name="checkmark-circle" size={14} color="#3b82f6" />
            <Text style={styles.assignedLabel}>Your table</Text>
          </View>
        )}
      </Pressable>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={[...myTables, ...otherTables]}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.list}
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
            {renderTable(item)}
          </>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="grid-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No tables found</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  list: { paddingVertical: 8 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tableCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  tableCardMine: {
    borderColor: '#bfdbfe',
    backgroundColor: '#fafbff',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableInfo: { flex: 1 },
  tableName: { fontSize: 17, fontWeight: '700', color: '#111' },
  tableMeta: { fontSize: 13, color: '#9ca3af', marginTop: 3 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 12,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  assignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  assignedLabel: { fontSize: 12, color: '#3b82f6', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 15, color: '#9ca3af', marginTop: 12 },
})

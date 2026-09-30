import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/context/AuthContext'
import { claimTable, fetchWaiterTables } from '../../src/lib/api'
import { supabase } from '../../src/lib/supabase'
import type { TableWithSession } from '../../src/lib/types'

const ORANGE = '#E8713A'
const ORANGE_LIGHT = '#FFF7F2'
const ORANGE_BORDER = '#FDDCC8'

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  free: { color: '#15803d', bg: '#dcfce7', label: 'Free' },
  occupied: { color: ORANGE, bg: '#FFF0E8', label: 'Occupied' },
  bill_requested: { color: '#b45309', bg: '#fef3c7', label: 'Bill' },
  reserved: { color: '#dc2626', bg: '#fee2e2', label: 'Reserved' },
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'free', label: 'Free' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'bill_requested', label: 'Bill' },
  { value: 'reserved', label: 'Reserved' },
]

export default function WaiterTablesScreen() {
  const { profile } = useAuth()
  const [tables, setTables] = useState<TableWithSession[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tables.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (!q) return true
      const statusLabel = STATUS_CONFIG[t.status]?.label ?? t.status
      return (
        t.name.toLowerCase().includes(q) ||
        (t.floor_name ?? '').toLowerCase().includes(q) ||
        statusLabel.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
      )
    })
  }, [tables, search, statusFilter])

  const myTables = filtered.filter((t) => t.waiter_id === profile?.id)
  const otherTables = filtered.filter((t) => t.waiter_id !== profile?.id)
  const isFiltering = search.trim().length > 0 || statusFilter !== 'all'

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
            <Ionicons name="checkmark-circle" size={14} color={ORANGE} />
            <Text style={styles.assignedLabel}>Your table</Text>
          </View>
        )}
      </Pressable>
    )
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#bbb" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search table, floor or status..."
          placeholderTextColor="#c4c4c4"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#bbb" />
          </Pressable>
        )}
      </View>

      {/* Status filter chips */}
      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBar}
        >
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value
            const count =
              f.value === 'all'
                ? tables.length
                : tables.filter((t) => t.status === f.value).length
            return (
              <Pressable
                key={f.value}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setStatusFilter(f.value)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label} ({count})
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      <FlatList
        data={[...myTables, ...otherTables]}
        keyExtractor={(t) => t.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ORANGE} />}
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
            <Ionicons name={isFiltering ? 'search-outline' : 'grid-outline'} size={48} color="#ddd" />
            <Text style={styles.emptyText}>
              {isFiltering ? 'No tables match your search' : 'No tables found'}
            </Text>
            {isFiltering && (
              <Pressable
                style={styles.clearBtn}
                onPress={() => {
                  setSearch('')
                  setStatusFilter('all')
                }}
              >
                <Text style={styles.clearBtnText}>Clear filters</Text>
              </Pressable>
            )}
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  list: { paddingVertical: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    padding: 0,
  },
  filterRow: {
    height: 52,
    marginTop: 4,
  },
  filterBar: {
    paddingHorizontal: 12,
    height: 52,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  filterChipActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#777',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
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
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  tableCardMine: {
    borderColor: ORANGE_BORDER,
    backgroundColor: ORANGE_LIGHT,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableInfo: { flex: 1 },
  tableName: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  tableMeta: { fontSize: 13, color: '#999', marginTop: 3 },
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
  assignedLabel: { fontSize: 12, color: ORANGE, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 15, color: '#999', marginTop: 12 },
  clearBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ORANGE_BORDER,
    backgroundColor: ORANGE_LIGHT,
  },
  clearBtnText: { fontSize: 13, fontWeight: '600', color: ORANGE },
})

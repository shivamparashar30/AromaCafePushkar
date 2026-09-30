import { router, Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import { claimTable, lookupTableByQrToken } from '../../src/lib/api'

const ORANGE = '#E8713A'
const ORANGE_LIGHT = '#FFF7F2'

function extractToken(data: string): string | null {
  // QR encodes URLs like https://order.domain.com/t/{token}
  const match = data.match(/\/t\/([A-Za-z0-9_-]+)/)
  if (match) return match[1]
  // Fallback: treat the entire scanned value as a token
  return data.trim() || null
}

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain) {
      requestPermission()
    }
  }, [permission, requestPermission])

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned || processing) return
    setScanned(true)
    setProcessing(true)

    try {
      const token = extractToken(data)
      if (!token) {
        Alert.alert('Invalid QR', 'This does not look like a table QR code.', [
          { text: 'Scan again', onPress: () => setScanned(false) },
        ])
        setProcessing(false)
        return
      }

      const table = await lookupTableByQrToken(token)
      if (!table) {
        Alert.alert('Table not found', 'No active table matches this QR code.', [
          { text: 'Scan again', onPress: () => setScanned(false) },
        ])
        setProcessing(false)
        return
      }

      if (table.session_id) {
        // Table has an active session — go straight to it
        router.replace(`/waiter/session/${table.session_id}`)
      } else if (table.status === 'free') {
        // Table is free — offer to claim it
        Alert.alert(
          `Open ${table.name}?`,
          `${table.floor_name} · ${table.capacity} seats\n\nClaim this table and start a new session?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => { setScanned(false); setProcessing(false) } },
            {
              text: 'Claim',
              onPress: async () => {
                try {
                  const result = await claimTable(table.id)
                  const sessionId = typeof result === 'string' ? result : (result as any)?.session_id
                  if (sessionId) {
                    router.replace(`/waiter/session/${sessionId}`)
                  } else {
                    router.back()
                  }
                } catch (err: any) {
                  Alert.alert('Error', err.message || 'Could not claim table')
                  setScanned(false)
                  setProcessing(false)
                }
              },
            },
          ],
        )
      } else {
        Alert.alert(
          table.name,
          `Status: ${table.status}\n\nThis table is not available right now.`,
          [{ text: 'Scan again', onPress: () => setScanned(false) }],
        )
        setProcessing(false)
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong', [
        { text: 'Scan again', onPress: () => setScanned(false) },
      ])
      setProcessing(false)
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="camera-outline" size={48} color="#ccc" />
        <Text style={styles.permissionText}>Camera access is required to scan QR codes</Text>
        <Pressable style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Permission</Text>
        </Pressable>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable style={styles.closeBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Scan Table QR</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Viewfinder */}
        <View style={styles.viewfinderArea}>
          <View style={styles.viewfinder}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        {/* Bottom hint */}
        <View style={styles.bottomBar}>
          {processing ? (
            <Text style={styles.hint}>Looking up table...</Text>
          ) : (
            <Text style={styles.hint}>Point your camera at a table QR code</Text>
          )}
        </View>
      </View>
    </View>
  )
}

const CORNER_SIZE = 24
const CORNER_WIDTH = 4

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: '#fafafa',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionText: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
  },
  grantBtn: {
    marginTop: 20,
    backgroundColor: ORANGE,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  grantBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  backBtn: { marginTop: 12 },
  backBtnText: { color: '#999', fontSize: 14 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },

  viewfinderArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinder: {
    width: 240,
    height: 240,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: ORANGE,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: ORANGE,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: ORANGE,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: ORANGE,
    borderBottomRightRadius: 4,
  },

  bottomBar: {
    paddingVertical: 24,
    paddingHorizontal: 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  hint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
})

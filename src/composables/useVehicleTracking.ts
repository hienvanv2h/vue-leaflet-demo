import { ref, onUnmounted } from 'vue'
import L from 'leaflet'
import { makeVehicleIcon } from '@/layers/dvp-layers'
import type { Map as LeafletMap } from 'leaflet'

export interface VehiclePosition {
  vehicleId: string
  lat:       number
  lng:       number
  speed:     number | null
  heading:   number | null
  time:      string
}

export interface RegisteredVehicle {
  id:          number
  vehicleId:   string
  name:        string
  type:        string | null
  description: string | null
  createdAt:   string
}

const API_BASE = 'http://localhost:5244'

export function useVehicleTracking(getMap: () => LeafletMap | null) {
  const vehicles            = ref<VehiclePosition[]>([])
  const registeredVehicles  = ref<RegisteredVehicle[]>([])
  const selectedVehicleId   = ref<string | null>(null)
  const visible             = ref(true)

  const markerLayer = L.layerGroup()
  let trackPolyline: L.Polyline | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  // ── fetch registered vehicle list ────────────────────────────────────────
  async function fetchRegisteredVehicles() {
    try {
      const res = await fetch(`${API_BASE}/api/vehicles`)
      if (res.ok) registeredVehicles.value = await res.json()
    } catch { /* backend unavailable */ }
  }

  // ── fetch + update markers ──────────────────────────────────────────────
  async function refresh() {
    const map = getMap()
    if (!map) return
    try {
      const res = await fetch(`${API_BASE}/api/gps-tracks/vehicles`)
      if (!res.ok) return
      const data: VehiclePosition[] = await res.json()
      vehicles.value = data

      if (!visible.value) return   // keep data, skip map update

      const knownIds = new Set(registeredVehicles.value.map(v => v.vehicleId))

      markerLayer.clearLayers()
      for (const v of data) {
        const known  = knownIds.has(v.vehicleId)
        const color  = known ? '#E65100' : '#757575'
        const marker = L.marker([v.lat, v.lng], {
          icon: makeVehicleIcon(v.heading ?? 0, color),
          zIndexOffset: 500,
        })
        marker.bindTooltip(v.vehicleId, { permanent: false, direction: 'top', offset: [0, -16] })
        marker.bindPopup(makeVehiclePopup(v))
        marker.on('click', () => selectVehicle(v.vehicleId))
        markerLayer.addLayer(marker)
      }
      if (!map.hasLayer(markerLayer)) markerLayer.addTo(map)
    } catch { /* backend unavailable — fail silently */ }
  }

  // ── track history for one vehicle ───────────────────────────────────────
  async function selectVehicle(vehicleId: string) {
    const map = getMap()
    if (!map) return
    selectedVehicleId.value = vehicleId
    trackPolyline?.remove()
    trackPolyline = null
    try {
      const from = new Date(Date.now() - 3_600_000 * 24).toISOString()
      const to   = new Date().toISOString()
      const res  = await fetch(
        `${API_BASE}/api/gps-tracks/${vehicleId}?from=${from}&to=${to}`)
      if (!res.ok) return
      const points: VehiclePosition[] = await res.json()
      if (points.length < 2) return
      trackPolyline = L.polyline(
        points.map(p => [p.lat, p.lng] as [number, number]),
        { color: '#FF6F00', weight: 2, opacity: 0.85, dashArray: '6 4' },
      ).addTo(map)
    } catch { /* ignore */ }
  }

  function clearTrack() {
    trackPolyline?.remove()
    trackPolyline = null
    selectedVehicleId.value = null
  }

  // ── visibility toggle ───────────────────────────────────────────────────
  function toggleVisibility() {
    const map = getMap()
    if (!map) return
    visible.value = !visible.value
    if (visible.value) {
      refresh()
    } else {
      map.removeLayer(markerLayer)
      markerLayer.clearLayers()
    }
  }

  // ── lifecycle ───────────────────────────────────────────────────────────
  function start(intervalMs = 8_000) {
    fetchRegisteredVehicles()
    refresh()
    timer = setInterval(refresh, intervalMs)
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null }
    trackPolyline?.remove()
    const map = getMap()
    if (map) map.removeLayer(markerLayer)
    markerLayer.clearLayers()
  }

  onUnmounted(stop)

  return {
    vehicles,
    registeredVehicles,
    selectedVehicleId,
    visible,
    start,
    refresh,
    fetchRegisteredVehicles,
    selectVehicle,
    clearTrack,
    toggleVisibility,
  }
}

// ── popup HTML ──────────────────────────────────────────────────────────────
function makeVehiclePopup(v: VehiclePosition): string {
  const t = new Date(v.time).toLocaleTimeString('vi-VN')
  return `<div>
    <div style="font-weight:700;font-size:13px">${v.vehicleId}</div>
    <div style="font-size:11px;color:#888;margin-top:1px">${t}</div>
    ${v.speed   != null ? `<div style="font-size:12px;margin-top:4px">Tốc độ: <b>${v.speed.toFixed(1)} km/h</b></div>` : ''}
    ${v.heading != null ? `<div style="font-size:12px">Hướng: <b>${v.heading.toFixed(0)}°</b></div>` : ''}
  </div>`
}

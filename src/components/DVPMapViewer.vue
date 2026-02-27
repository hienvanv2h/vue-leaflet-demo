<script setup lang="ts">
import { onMounted, onUnmounted, ref, reactive, computed } from 'vue'
import L from 'leaflet'
import 'leaflet-rotate'
import type { Map as LeafletMap } from 'leaflet'
import {
  CRANE_TYPES, makeCraneIcon, makeLandmarkIcon,
  styleBoundary, styleBlock, styleArea, styleRoad, styleBuilding,
  popupBlock, popupArea, popupRoad, popupBuilding, popupLandmark,
} from '@/layers/dvp-layers'
import { useVehicleTracking } from '@/composables/useVehicleTracking'

interface Props {
  height?: string
}
const props = withDefaults(defineProps<Props>(), { height: '600px' })

const mapContainer = ref<HTMLElement | null>(null)
const initialBearing = -36.4
const bearing = ref(initialBearing)
let map: LeafletMap | null = null

const layerVisibility = reactive<Record<string, boolean>>({
  yard_boundary: true,
  yard_block: true,
  yard_area: true,
  yard_road: true,
  building: true,
  landmarks: true,
})

const layerLabels: Record<string, string> = {
  yard_boundary: 'Ranh giới bãi',
  yard_block: 'Block container',
  yard_area: 'Khu vực chức năng',
  yard_road: 'Đường nội bộ',
  building: 'Tòa nhà',
  landmarks: 'Điểm mốc',
}

const featureCounts = reactive<Record<string, number>>({})
const layerInstances = new Map<string, L.GeoJSON>()

// --- Highlight ---
let highlightedLayer: L.Path | null = null
let highlightedParent: L.GeoJSON | null = null

function highlightFeature(parent: L.GeoJSON, layer: L.Path) {
  resetHighlight()
  layer.setStyle({ color: '#00e5ff', weight: 4 })
  layer.bringToFront()
  highlightedLayer = layer
  highlightedParent = parent
}

function resetHighlight() {
  if (highlightedLayer && highlightedParent) {
    highlightedParent.resetStyle(highlightedLayer)
  }
  highlightedLayer = null
  highlightedParent = null
}

// --- Layer loading ---
async function loadGeoJSON(url: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`)
  return res.json()
}

async function loadLayer(name: string, url: string, options: L.GeoJSONOptions) {
  try {
    const data = await loadGeoJSON(url)
    featureCounts[name] = data.features.length

    const origOnEach = options.onEachFeature
    options.onEachFeature = (feature, layer) => {
      origOnEach?.(feature, layer)
      layer.on('click', (e: L.LeafletMouseEvent) => {
        if (mockMode.value) {
          // Stop DOM propagation so map.click doesn't double-fire (SVG renderer)
          // Canvas renderer already stops propagation itself
          e.originalEvent.stopPropagation()
          mockClickHandler(e)
          return
        }
        if ('setStyle' in layer) highlightFeature(geoLayer, layer as L.Path)
      })
      layer.on('popupclose', () => resetHighlight())
    }

    const geoLayer = L.geoJSON(data, options)
    layerInstances.set(name, geoLayer)
    if (map && layerVisibility[name]) geoLayer.addTo(map)
  } catch (err) {
    console.error(`Error loading ${name}:`, err)
  }
}

function toggleLayer(name: string) {
  layerVisibility[name] = !layerVisibility[name]
  const layer = layerInstances.get(name)
  if (!layer || !map) return
  layerVisibility[name] ? layer.addTo(map) : map.removeLayer(layer)
}

// --- Rotation ---
function updateCraneRotations(delta: number) {
  document.querySelectorAll<HTMLElement>('.crane-icon').forEach(el => {
    const cur = parseFloat(el.getAttribute('data-rot') ?? '0')
    const next = cur + delta
    el.setAttribute('data-rot', String(next))
    el.style.transform = `rotate(${next}deg)`
  })
}

function setBearing(deg: number) {
  const prevDeg = bearing.value
  bearing.value = (deg + 360) % 360
  map?.setBearing(bearing.value)
  let delta = bearing.value - prevDeg
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  updateCraneRotations(delta)
}
function rotateCW() { setBearing(bearing.value + 5) }
function rotateCCW() { setBearing(bearing.value - 5) }
function resetBearing() {
  setBearing(initialBearing)
  document.querySelectorAll<HTMLElement>('.crane-icon').forEach(el => {
    el.setAttribute('data-rot', '0')
    el.style.transform = 'rotate(0deg)'
  })
}

// --- Vehicle tracking ---
const {
  vehicles,
  registeredVehicles,
  selectedVehicleId,
  visible: vehicleVisible,
  start: startVehicleTracking,
  refresh: refreshVehicles,
  fetchRegisteredVehicles,
  selectVehicle,
  clearTrack,
  toggleVisibility: toggleVehicleLayer,
} = useVehicleTracking(() => map)

const knownIds = computed(() => new Set(registeredVehicles.value.map(v => v.vehicleId)))

// GPS vehicles that are in the registry (with their registered name)
const knownVehiclesWithGps = computed(() =>
  vehicles.value
    .filter(v => knownIds.value.has(v.vehicleId))
    .map(v => ({
      ...v,
      name: registeredVehicles.value.find(rv => rv.vehicleId === v.vehicleId)!.name,
    }))
)

// GPS vehicles NOT found in the registry
const unknownVehiclesWithGps = computed(() =>
  vehicles.value.filter(v => !knownIds.value.has(v.vehicleId))
)

// --- Mock GPS tool ---
const API_BASE = 'http://localhost:5244'
const mockMode = ref(false)
const mockVehicleId = ref('TRK-001')
const mockSpeed = ref(20)
const mockPointCount = ref(0)
const lastMockPoints = new Map<string, { lat: number; lng: number }>()

// Pending point waiting for user confirmation
const pendingPoint = ref<{ lat: number; lng: number } | null>(null)
let pendingMarker: L.Marker | null = null

function toggleMockMode() {
  if (!mockMode.value) {
    mockMode.value = true
    if (mapContainer.value) mapContainer.value.style.cursor = 'crosshair'
    map?.on('click', mockClickHandler)
  } else {
    cancelMockPoint()
    mockMode.value = false
    if (mapContainer.value) mapContainer.value.style.cursor = ''
    map?.off('click', mockClickHandler)
  }
}

function mockClickHandler(e: L.LeafletMouseEvent) {
  // Block feature selection
  map?.closePopup()
  resetHighlight()

  // Replace any previous pending marker
  pendingMarker?.remove()
  pendingMarker = L.marker([e.latlng.lat, e.latlng.lng], {
    icon: L.divIcon({
      html: `<div style="width:14px;height:14px;background:#E65100;border-radius:50%;
                         border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.6)"></div>`,
      className: '',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    }),
    zIndexOffset: 1000,
  }).addTo(map!)

  pendingPoint.value = { lat: e.latlng.lat, lng: e.latlng.lng }
}

async function saveMockPoint() {
  if (!pendingPoint.value) return
  const { lat, lng } = pendingPoint.value
  const vehicleId = mockVehicleId.value

  let heading: number | null = null
  const prev = lastMockPoints.get(vehicleId)
  if (prev) {
    heading = (Math.atan2(lng - prev.lng, lat - prev.lat) * 180 / Math.PI + 360) % 360
  }
  lastMockPoints.set(vehicleId, { lat, lng })

  pendingMarker?.remove()
  pendingMarker = null
  pendingPoint.value = null

  try {
    const res = await fetch(`${API_BASE}/api/gps-tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId, lat, lng, speed: mockSpeed.value, heading }),
    })
    if (res.ok) {
      mockPointCount.value++
      await refreshVehicles()
    }
  } catch (err) {
    console.error('Failed to add mock point:', err)
  }
}

function cancelMockPoint() {
  pendingMarker?.remove()
  pendingMarker = null
  pendingPoint.value = null
}

async function clearMockData() {
  if (!window.confirm(`Xóa toàn bộ dữ liệu GPS của ${mockVehicleId.value}?`)) return
  cancelMockPoint()
  await fetch(`${API_BASE}/api/gps-tracks/${mockVehicleId.value}`, { method: 'DELETE' })
  mockPointCount.value = 0
  lastMockPoints.delete(mockVehicleId.value)
  await refreshVehicles()
}

// --- Lifecycle ---
onMounted(async () => {
  if (!mapContainer.value) return

  map = L.map(mapContainer.value, {
    rotate: true,
    bearing: 0,
    touchRotate: true,
    rotateControl: false,
  })
  map.on('click', () => resetHighlight())

  // NOTE: Cần setup tile server khi chạy production
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map)

  // L.tileLayer('http://localhost:8080/styles/basic-preview/512/{z}/{x}/{y}.png', {
  //   attribution: '© MapTiler © OpenStreetMap contributors',
  //   maxZoom: 20,
  //   tileSize: 512,
  //   zoomOffset: -1,
  // }).addTo(map)

  const base = '/geojson/dvp'

  await loadLayer('yard_boundary', `${base}/yard_boundary.geojson`, {
    style: styleBoundary,
    interactive: false,
  })
  await loadLayer('yard_area', `${base}/yard_area.geojson`, {
    style: styleArea,
    onEachFeature: (f, l) => l.bindPopup(popupArea(f.properties ?? {})),
  })
  await loadLayer('yard_road', `${base}/yard_road.geojson`, {
    style: styleRoad,
    renderer: L.canvas({ tolerance: 10 }),
    onEachFeature: (f, l) => l.bindPopup(popupRoad(f.properties ?? {})),
  })
  await loadLayer('building', `${base}/building.geojson`, {
    style: styleBuilding,
    onEachFeature: (f, l) => l.bindPopup(popupBuilding(f.properties ?? {})),
  })
  await loadLayer('yard_block', `${base}/yard_block.geojson`, {
    style: styleBlock,
    onEachFeature: (f, l) => {
      l.bindPopup(popupBlock(f.properties ?? {}))
      const blockId = f.properties?.block_id ?? ''
      if (blockId) {
        l.bindTooltip(blockId, { permanent: true, direction: 'center', className: 'block-label' })
      }
    },
  })
  await loadLayer('landmarks', `${base}/landmarks.geojson`, {
    pointToLayer(feature, latlng) {
      const lmType = feature.properties?.landmark_type ?? 'label'
      const iconScale = lmType === 'qc-crane' ? 1.8 : 1
      return CRANE_TYPES.has(lmType)
        ? L.marker(latlng, { icon: makeCraneIcon(0, iconScale) })
        : L.marker(latlng, { icon: makeLandmarkIcon(lmType) })
    },
    onEachFeature: (f, l) => l.bindPopup(popupLandmark(f.properties ?? {})),
  })

  const boundaryLayer = layerInstances.get('yard_boundary')
  if (boundaryLayer && map) {
    const bounds = boundaryLayer.getBounds()
    map.fitBounds(bounds, { padding: [20, 20] })
    map.setMinZoom(map.getBoundsZoom(bounds, false, [20, 20]) + 1)
    map.setMaxBounds(bounds.pad(0.3))
  }

  map.setBearing(initialBearing)
  startVehicleTracking()
})

onUnmounted(() => {
  if (mockMode.value) { cancelMockPoint(); map?.off('click', mockClickHandler) }
  layerInstances.forEach(layer => layer.off())
  layerInstances.clear()
  if (map) { map.off(); map.remove(); map = null }
})

const totalFeatures = () => Object.values(featureCounts).reduce((a, b) => a + b, 0)
</script>

<template>
  <div class="w-full flex gap-3 items-start">

    <!-- Map column -->
    <div class="flex-1 min-w-0">
      <!-- overflow-hidden clips leaflet-rotate panes; no Vue reactive bindings on mapContainer itself -->
      <!-- mock-mode class is safe here — this wrapper is NOT managed by Leaflet -->
      <div class="rounded-lg shadow-lg border-2 border-blue-300 overflow-hidden" :class="{ 'mock-mode': mockMode }"
        :style="{ height: props.height }">
        <div ref="mapContainer" class="w-full h-full"></div>
      </div>

      <!-- Bottom controls -->
      <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">

        <!-- Rotation -->
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-700">Xoay:</span>
          <button @click="rotateCCW"
            class="w-7 h-7 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-sm font-bold cursor-pointer">↺</button>
          <input type="range" min="0" max="360" step="1" :value="bearing"
            @input="setBearing(+($event.target as HTMLInputElement).value)" class="w-24 accent-blue-600" />
          <button @click="rotateCW"
            class="w-7 h-7 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-sm font-bold cursor-pointer">↻</button>
          <span class="text-sm font-mono text-blue-700 w-10">{{ bearing }}°</span>
          <button v-if="bearing !== initialBearing" @click="resetBearing"
            class="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded border border-red-300 cursor-pointer">Reset</button>
        </div>

        <!-- Vehicle tracking -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="text-sm font-medium text-gray-700">Phương tiện:</span>
          <label class="inline-flex items-center gap-1 text-sm cursor-pointer select-none"
            :class="vehicleVisible ? 'text-gray-800' : 'text-gray-400'">
            <input type="checkbox" :checked="vehicleVisible" @change="toggleVehicleLayer"
              class="accent-orange-500 w-3.5 h-3.5" />
            Hiển thị
            <span v-if="vehicles.length" class="text-xs text-gray-400">({{ vehicles.length }})</span>
          </label>

          <!-- Known vehicles (in registry) -->
          <div v-if="knownVehiclesWithGps.length" class="flex flex-wrap items-center gap-1">
            <button v-for="v in knownVehiclesWithGps" :key="v.vehicleId" @click="selectVehicle(v.vehicleId)"
              :title="v.vehicleId" class="text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer"
              :class="v.vehicleId === selectedVehicleId
                ? 'bg-orange-500 text-white border-orange-400'
                : 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100'">
              {{ v.name }}
            </button>
          </div>

          <!-- Unknown vehicles (GPS data but not in registry) -->
          <template v-if="unknownVehiclesWithGps.length">
            <span class="text-xs text-gray-400 border-l border-gray-200 pl-2">Không xác định:</span>
            <div class="flex flex-wrap items-center gap-1">
              <button v-for="v in unknownVehiclesWithGps" :key="v.vehicleId" @click="selectVehicle(v.vehicleId)"
                class="text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer" :class="v.vehicleId === selectedVehicleId
                  ? 'bg-gray-500 text-white border-gray-400'
                  : 'bg-gray-50 text-gray-500 border-gray-300 hover:bg-gray-100'">
                {{ v.vehicleId }}
              </button>
            </div>
          </template>

          <button v-if="selectedVehicleId" @click="clearTrack"
            class="text-xs px-2 py-0.5 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 cursor-pointer">
            ✕ track
          </button>
        </div>

        <!-- Info -->
        <div class="text-sm text-gray-500 ml-auto">{{ totalFeatures() }} features</div>
      </div>
    </div>

    <!-- Sidebar — relative + z-10 ensures it stays above any leaflet overflow -->
    <div class="relative z-10 w-52 shrink-0 bg-white rounded-lg shadow-lg border border-gray-200 overflow-y-auto"
      :style="{ maxHeight: props.height }">

      <!-- Layers section -->
      <div class="p-3 border-b border-gray-100">
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Layers</div>
        <div class="flex flex-col gap-1.5">
          <label v-for="(label, name) in layerLabels" :key="name"
            class="inline-flex items-center gap-1.5 text-sm cursor-pointer select-none"
            :class="layerVisibility[name] ? 'text-gray-800' : 'text-gray-400'">
            <input type="checkbox" :checked="layerVisibility[name]" @change="toggleLayer(name)"
              class="accent-blue-600 w-3.5 h-3.5 shrink-0" />
            <span class="leading-tight">{{ label }}</span>
            <span v-if="featureCounts[name]" class="text-xs text-gray-400 shrink-0">({{ featureCounts[name] }})</span>
          </label>
        </div>
      </div>

      <!-- Mock GPS section -->
      <div class="p-3">
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Mock GPS</div>

        <!-- Vehicle selector -->
        <div class="mb-2">
          <div class="text-xs text-gray-500 mb-1">Xe</div>
          <select v-model="mockVehicleId"
            class="w-full text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-400 cursor-pointer">
            <option v-for="v in registeredVehicles" :key="v.vehicleId" :value="v.vehicleId">
              {{ v.name }}
            </option>
          </select>
        </div>

        <!-- Speed -->
        <div class="mb-3">
          <div class="text-xs text-gray-500 mb-1">Tốc độ (km/h)</div>
          <input type="number" v-model.number="mockSpeed" min="0" max="60"
            class="w-full text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-400" />
        </div>

        <!-- Mode toggle -->
        <button @click="toggleMockMode"
          class="w-full text-sm py-1.5 rounded border font-medium transition-colors cursor-pointer" :class="mockMode
            ? 'bg-red-500 text-white border-red-400 hover:bg-red-600'
            : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'">
          {{ mockMode ? '⏹ Dừng chấm' : '✚ Chế độ chấm' }}
        </button>
        <p v-if="mockMode && !pendingPoint" class="text-xs text-gray-400 mt-1.5 text-center leading-tight">
          Click trên bản đồ để chọn tọa độ
        </p>

        <!-- Pending point confirmation -->
        <div v-if="pendingPoint" class="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
          <div class="text-xs font-semibold text-orange-800 mb-1">Xác nhận điểm?</div>
          <div class="text-xs text-gray-600 font-mono leading-relaxed">
            {{ pendingPoint.lat.toFixed(6) }}<br>
            {{ pendingPoint.lng.toFixed(6) }}
          </div>
          <div class="flex gap-1.5 mt-2">
            <button @click="saveMockPoint"
              class="flex-1 text-xs bg-green-600 text-white rounded py-1 hover:bg-green-700 cursor-pointer font-medium">
              ✓ Lưu
            </button>
            <button @click="cancelMockPoint"
              class="flex-1 text-xs bg-gray-400 text-white rounded py-1 hover:bg-gray-500 cursor-pointer">
              ✕ Hủy
            </button>
          </div>
        </div>

        <!-- Stats + clear -->
        <template v-if="mockPointCount > 0">
          <div class="mt-2.5 text-xs text-gray-500">
            Đã thêm: <b class="text-gray-700">{{ mockPointCount }}</b> điểm
          </div>
          <button @click="clearMockData"
            class="mt-1.5 w-full text-xs text-red-600 border border-red-200 rounded py-1 hover:bg-red-50 cursor-pointer transition-colors">
            Xóa dữ liệu
          </button>
        </template>
      </div>

    </div>
  </div>
</template>

<style>
/* Override Leaflet's pointer cursor on interactive features when mock GPS mode is active */
.mock-mode .leaflet-interactive {
  cursor: crosshair !important;
}

.block-label {
  background: none !important;
  border: none !important;
  box-shadow: none !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  color: #333 !important;
  text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff;
  white-space: nowrap;
}
</style>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import L from 'leaflet'
import type { Map } from 'leaflet'

// Props
interface Props {
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: '600px'
})

// Refs
const mapContainer = ref<HTMLElement | null>(null)
let map: Map | null = null

// Initialize map
onMounted(() => {
  if (!mapContainer.value) return

  // Image dimensions
  const imageSize = 8192
  const tileSize = 256
  const tileMaxZoom = 5  // Tiles: 0 to 5 (8192 / 256 = 2^5)
  const scaleFactor = tileSize / imageSize;

  // Setup map
  map = L.map(mapContainer.value, {
    crs: L.CRS.Simple,
    // minZoom: 0
  })

  // Note: CRS.Simple
  // Coordinates: [y, x] (như [lat, lng])
  // Y axis: negative goes down (0 ở top, -256 ở bottom)
  //   Ví dụ với ảnh 256×256:
  // [0, 0] ---------> [0, 256]
  //   |                    |
  //   |     MAP HERE       |
  //   |                    |
  // [-256, 0] -----> [-256, 256]

    // Calculate bounds dynamically from viewport
  // const containerHeight = mapContainer.value.clientHeight
  // const containerWidth = mapContainer.value.clientWidth

  // console.log(containerHeight, containerWidth)

  // const boundsHeight = containerHeight / 2
  // const boundsWidth = containerWidth / 2

  // // Use the larger dimension to ensure full coverage
  // const boundsSize = Math.max(boundsHeight, boundsWidth)

  // const bounds: L.LatLngBoundsExpression = [
  //   [0, 0],
  //   [-boundsSize, boundsSize]
  // ]

  // Bounds: scale to match map zoom levels
  // At map zoom 1 (tile zoom 0), display 1 tile = 256 units
  // const boundsSize = tileSize
  // const bounds: L.LatLngBoundsExpression = [
  //   [0, 0],
  //   // [-boundsSize, boundsSize]
  //   [-256, 256]
  // ]

  // var w = 8192, h = 8192;
  // var southWest = map.unproject([0, h], map.getMaxZoom());
  // var northEast = map.unproject([w, 0], map.getMaxZoom());
  // var bounds = new L.LatLngBounds(southWest, northEast);

  const bounds: L.LatLngBoundsExpression = [[0, 0], [-tileSize, tileSize]];
  // const bounds: L.LatLngBoundsExpression = [[0, 0], [-32, 32]];

  // // Add tile layer with zoomOffset
  L.tileLayer('map/{z}/{x}/{y}.png', {
    attribution: 'Egryia Fantasy Map',
    noWrap: true,
    tileSize: tileSize,
    zoomOffset: 0,
    minZoom: 1,
    maxZoom: tileMaxZoom,
    // maxNativeZoom: 5,
    continuousWorld: false
  }).addTo(map)

  // Set initial view (commented out when using fitBounds)
  // map.setView([-boundsSize/2, boundsSize/2], 2)

// Ép map hiển thị đúng vùng ảnh
  map.fitBounds(bounds);
  
  // Giới hạn không cho kéo ra ngoài vùng ảnh trắng
  map.setMaxBounds(bounds);

  // Add example markers (if needed)
  // const scaleFactor = boundsSize / imageSize
  // const locations = [
  //   { name: 'Location 1', coords: [-1000 * scaleFactor, 4000 * scaleFactor] as [number, number] },
  // ]
  // locations.forEach(location => {
  //   L.marker(location.coords)
  //     .addTo(map!)
  //     .bindPopup(`<strong>${location.name}</strong>`)
  // })
})

// Cleanup
onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div class="w-full">
    <div
      ref="mapContainer"
      class="w-full rounded-lg shadow-lg border-4 border-purple-900"
      :style="{ height: props.height }"
    ></div>
  </div>
</template>

<style scoped>
/* Fantasy map styling */
:deep(.leaflet-container) {
  /* background: #6b9dc6; */
  background: #6B8ABA;
  font-family: 'Georgia', serif;
}

:deep(.leaflet-popup-content-wrapper) {
  background: #f4e4c1;
  color: #2c1810;
  border: 2px solid #8b6914;
}

:deep(.leaflet-popup-tip) {
  background: #f4e4c1;
}
</style>

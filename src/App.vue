<script setup lang="ts">
import { ref } from 'vue'
import LeafletMap from './components/LeafletMap.vue'
import EgryiaMap from './components/EgryiaMap.vue'
import EgryiaMapEditor from './components/EgryiaMapEditor.vue'

const center = ref<[number, number]>([21.0285, 105.8542])
const zoom = ref(13)
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <div class="container mx-auto px-4 py-8">
      <header class="mb-8 text-center">
        <h1 class="text-4xl font-bold text-gray-800 mb-2">
          Leaflet.js + Vue 3 Demo
        </h1>
        <p class="text-gray-600">
          Interactive map với Leaflet, Vue 3, TypeScript, Pinia & Tailwind 4
        </p>
      </header>

      <main class="max-w-7xl mx-auto space-y-8">
        <!-- OpenStreetMap Demo -->
        <div class="bg-white rounded-xl shadow-xl p-6">
          <div class="mb-4">
            <h2 class="text-2xl font-semibold text-gray-700 mb-2">
              Bản đồ Hà Nội
            </h2>
            <p class="text-gray-500 text-sm">
              Click vào markers để xem thông tin các địa điểm nổi tiếng
            </p>
          </div>

          <LeafletMap :center="center" :zoom="zoom" height="600px" />

          <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-blue-50 p-4 rounded-lg">
              <h3 class="font-semibold text-blue-900 mb-1">Markers</h3>
              <p class="text-sm text-blue-700">3 địa điểm du lịch nổi tiếng</p>
            </div>
            <div class="bg-green-50 p-4 rounded-lg">
              <h3 class="font-semibold text-green-900 mb-1">Tiles</h3>
              <p class="text-sm text-green-700">OpenStreetMap tiles</p>
            </div>
            <div class="bg-purple-50 p-4 rounded-lg">
              <h3 class="font-semibold text-purple-900 mb-1">Features</h3>
              <p class="text-sm text-purple-700">Circle overlay & popups</p>
            </div>
          </div>
        </div>

        <!-- Egryia Fantasy Map -->
        <div class="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl shadow-xl p-6">
          <div class="mb-4">
            <h2 class="text-2xl font-semibold text-purple-900 mb-2 flex items-center gap-2">
              🌍 Egryia Fantasy Map
            </h2>
            <p class="text-purple-700 text-sm">
              Large custom map từ ảnh 8192x8192, 6 zoom levels (0-5), 1365 tiles
            </p>
          </div>

          <EgryiaMap height="600px" />
        </div>


      </main>
    </div>
  </div>
</template>

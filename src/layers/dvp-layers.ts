import L from 'leaflet'

// ---------------------------------------------------------------------------
// Landmark icon definitions (non-crane types)
// ---------------------------------------------------------------------------
export const LANDMARK_DEFS: Record<string, { color: string; symbol: string }> = {
  'customs-office': { color: '#1565C0', symbol: 'gavel' },
  '5f-office':      { color: '#1565C0', symbol: 'apartment' },
  'parking':        { color: '#6A1B9A', symbol: 'local_parking' },
  'power':          { color: '#F9A825', symbol: 'bolt' },
  'equipment':      { color: '#795548', symbol: 'precision_manufacturing' },
  'warehouse':      { color: '#2E7D32', symbol: 'warehouse' },
  'weightstation':  { color: '#455A64', symbol: 'scale' },
  'label':          { color: '#757575', symbol: 'location_on' },
}

export function makeLandmarkIcon(type: string): L.DivIcon {
  const { color, symbol } = LANDMARK_DEFS[type] ?? { color: '#757575', symbol: 'place' }
  return L.divIcon({
    html: `<div style="width:28px;height:28px;background:${color};border-radius:50%;
                       border:2px solid #fff;display:flex;align-items:center;
                       justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.45)">
             <span class="material-symbols-outlined"
                   style="font-size:15px;color:#fff;line-height:1;user-select:none">${symbol}</span>
           </div>`,
    className: '',
    iconSize:   [28, 28],
    iconAnchor: [14, 14],
    popupAnchor:[0, -16],
  })
}

// ---------------------------------------------------------------------------
// Vehicle (GPS tracking) icon — orange circle with directional arrow
// ---------------------------------------------------------------------------
export function makeVehicleIcon(heading: number, color = '#E65100'): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:30px;height:30px;background:${color};border-radius:50%;
                       border:2px solid #fff;display:flex;align-items:center;
                       justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.5)">
             <span class="material-symbols-outlined"
                   style="font-size:16px;color:#fff;line-height:1;user-select:none;
                          display:block;transform:rotate(${heading}deg)"
             >navigation</span>
           </div>`,
    className: '',
    iconSize:    [30, 30],
    iconAnchor:  [15, 15],
    popupAnchor: [0, -18],
  })
}

// ---------------------------------------------------------------------------
// Crane icon
// ---------------------------------------------------------------------------
export const CRANE_TYPES = new Set(['crane', 'qc-crane'])
const CRANE_W = 18
const CRANE_H = Math.round(CRANE_W * 402 / 144) // aspect ratio of SVG 144×402

export function makeCraneIcon(counterRotateDeg: number, scale = 1): L.DivIcon {
  const [width, height] = [CRANE_W * scale, CRANE_H * scale]
  return L.divIcon({
    html: `<img src="/icons/sts_crane_icon.svg" class="crane-icon"
               style="width:${width}px;height:${height}px;
                      transform:rotate(${counterRotateDeg}deg);
                      transform-origin:50% 100%;display:block">`,
    className: '',
    iconSize:   [width, height],
    iconAnchor: [width / 2, height / 1.6],
    popupAnchor:[0, -height],
  })
}

// ---------------------------------------------------------------------------
// Style functions
// ---------------------------------------------------------------------------
export function styleBoundary(): L.PathOptions {
  return { color: '#d32f2f', weight: 3, dashArray: '8 4', fillOpacity: 0.03 }
}

export function styleBlock(feature?: GeoJSON.Feature): L.PathOptions {
  return {
    color: '#555',
    weight: 1.5,
    fillColor: feature?.properties?.fill_color ?? '#ffff00',
    fillOpacity: 0.5,
  }
}

export function styleArea(): L.PathOptions {
  return { color: '#00897B', weight: 1, dashArray: '4 2', fillColor: '#B2DFDB', fillOpacity: 0.25 }
}

export function styleRoad(): L.PathOptions {
  return { color: '#78909C', weight: 4, opacity: 0.7 }
}

export function styleBuilding(): L.PathOptions {
  return { color: '#5D4037', weight: 1.5, fillColor: '#BCAAA4', fillOpacity: 0.6 }
}

// ---------------------------------------------------------------------------
// Popup builders
// ---------------------------------------------------------------------------

// yard_boundary hiện không dùng (interactive: false) — giữ lại để tham khảo
// export function popupBoundary(p: Record<string, unknown>): string {
//   return `
//     <div style="min-width:200px">
//       <div style="font-weight:700;font-size:14px;margin-bottom:6px">${p.yard_name}</div>
//       <div style="font-size:12px;color:#555">${p.operator ?? ''}</div>
//       <hr style="margin:6px 0;border-color:#ddd">
//       <table style="font-size:12px;width:100%">
//         <tr><td style="color:#888">Trạng thái</td><td style="text-align:right"><b>${p.status}</b></td></tr>
//         <tr><td style="color:#888">Diện tích</td><td style="text-align:right"><b>${Number(p.total_area_sqm).toLocaleString()} m²</b></td></tr>
//         <tr><td style="color:#888">Sức chứa</td><td style="text-align:right"><b>${Number(p.capacity_teus).toLocaleString()} TEU</b></td></tr>
//       </table>
//     </div>`
// }

export function popupBlock(p: Record<string, unknown>): string {
  const rows = [
    ['Category', p.category],
    ['Max slots', p.max_slots],
    p.bay_count                                ? ['Bays',      p.bay_count]  : null,
    p.row_count                                ? ['Rows',      p.row_count]  : null,
    p.tier_count && Number(p.tier_count) > 1   ? ['Tiers',     p.tier_count] : null,
    p.direction                                ? ['Direction', p.direction]  : null,
    p.remark                                   ? ['Ghi chú',   p.remark]     : null,
  ].filter(Boolean) as [string, unknown][]

  return `
    <div style="min-width:160px">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">${p.block_name}</div>
      <div style="font-size:11px;color:#888;margin-bottom:6px">ID: ${p.block_id}</div>
      <table style="font-size:12px;width:100%">
        ${rows.map(([k, v]) => `<tr><td style="color:#888;padding:1px 8px 1px 0">${k}</td><td style="text-align:right"><b>${v}</b></td></tr>`).join('')}
      </table>
    </div>`
}

export function popupArea(p: Record<string, unknown>): string {
  return `
    <div style="min-width:150px">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px">${p.name}</div>
      <div style="font-size:12px;color:#888">Loại: ${p.area_type ?? 'N/A'}</div>
      ${p.remark ? `<div style="font-size:12px;margin-top:4px">${p.remark}</div>` : ''}
    </div>`
}

export function popupRoad(p: Record<string, unknown>): string {
  const info = [
    p.road_type  ? `Loại: ${p.road_type}`  : null,
    p.lane_count ? `Làn: ${p.lane_count}`  : null,
  ].filter(Boolean).join(' | ')
  return `<div><b>${p.name ?? 'Road'}</b>${info ? `<div style="font-size:12px;color:#888;margin-top:2px">${info}</div>` : ''}</div>`
}

export function popupBuilding(p: Record<string, unknown>): string {
  return `
    <div>
      <div style="font-weight:700;font-size:13px">${p.bld_name}</div>
      <div style="font-size:12px;color:#888">ID: ${p.bld_id}${p.bld_type ? ` | ${p.bld_type}` : ''}</div>
      ${p.remark ? `<div style="font-size:12px;margin-top:4px">${p.remark}</div>` : ''}
    </div>`
}

export function popupLandmark(p: Record<string, unknown>): string {
  return `
    <div>
      <div style="font-weight:700;font-size:13px">${p.bld_name}</div>
      <div style="font-size:12px;color:#888">${p.landmark_type ?? ''}</div>
      ${p.remark ? `<div style="font-size:12px;margin-top:4px">${p.remark}</div>` : ''}
    </div>`
}

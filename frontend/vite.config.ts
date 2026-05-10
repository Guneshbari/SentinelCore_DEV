import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    // Suppress the warning now that we're splitting; raise limit slightly for the
    // firebase chunk which can't be further split without ESM tree-shaking issues.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — always needed, very cacheable
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // State management
          'vendor-state': ['zustand', '@tanstack/react-query'],
          // Charting — only needed on dashboard/analytics pages
          'vendor-charts': ['recharts', 'echarts'],
          // 3D / heavy visualisations — only needed on 3D pages
          'vendor-three': ['three'],
          // Firebase auth — large SDK, only needed on auth flows
          'vendor-firebase': ['firebase'],
          // Table utilities
          'vendor-table': ['@tanstack/react-table', '@tanstack/react-virtual'],
        },
      },
    },
  },
})


import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        outDir: 'wwwroot/dist',
        emptyOutDir: true,
        manifest: true,
    },
    server: {
        port: 5173,
        strictPort: true,
        hmr: {
            protocol: 'ws'
        }
    },
    resolve: {
        extensions: ['.ts', '.js', '.css', ".svg"],
        dedupe: ['leaflet'],
        
    },
    assetsInclude: ['**/*.svg', '**/*.png'],
    optimizeDeps: {
        include: ['leaflet', 'leaflet-draw'],
    }
})

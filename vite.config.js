import { defineConfig } from 'vite'

export default defineConfig({
    root: '.',
    server: {
        port: 5173,
        open: true,
        fs: {
            allow: ['.']
        },
        proxy: {
            '/socket.io': 'http://localhost:3000'
        }
    },
    build: {
        outDir: 'dist'
    }
})
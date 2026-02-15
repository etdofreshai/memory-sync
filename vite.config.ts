import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'child_process';

// Auto-start the Express backend when Vite dev server starts
function autoBackend(): Plugin {
  let proc: ReturnType<typeof spawn> | null = null;
  const backendPort = process.env.BACKEND_PORT || '3001';
  return {
    name: 'auto-backend',
    configureServer() {
      proc = spawn('npx', ['tsx', 'src/server.ts'], {
        stdio: 'inherit',
        env: { ...process.env, BACKEND_PORT: backendPort, PORT: backendPort },
        shell: true,
      });
      proc.on('error', (err) => console.error('[auto-backend] Failed to start:', err));
    },
    buildEnd() {
      if (proc) { proc.kill(); proc = null; }
    },
  };
}

const backendPort = process.env.BACKEND_PORT || '3001';

export default defineConfig({
  plugins: [react(), autoBackend()],
  server: {
    allowedHosts: true,
    port: parseInt(process.env.PORT || '5173'),
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});

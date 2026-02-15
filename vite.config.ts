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
      console.log(`[auto-backend] Starting Express on port ${backendPort}...`);
      proc = spawn('npx', ['tsx', 'src/server.ts'], {
        stdio: 'inherit',
        env: { ...process.env, BACKEND_PORT: backendPort, PORT: backendPort },
        shell: true,
      });
      proc.on('error', (err) => console.error('[auto-backend] Failed to start:', err));
      proc.on('exit', (code) => console.log(`[auto-backend] Exited with code ${code}`));
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
    // Don't set port here — let CLI --port flag control it (Live Edit passes --port {assigned})
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
      // Also match when accessed through Live Edit's --base prefix
      '^/proxy/\\d+/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/proxy\/\d+/, ''),
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});

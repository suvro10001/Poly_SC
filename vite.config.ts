import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'lucide-react',
        'recharts',
        'motion/react',
        'firebase/app',
        'firebase/firestore',
        'xlsx',
        'exceljs',
        'jspdf',
        'prismjs',
      ],
    },
    server: {
      // HMR and WebSocket server are disabled in AI Studio preview environment
      hmr: false,
      ws: false as const,
    },
  };
});

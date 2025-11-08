import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig(async () => {
  const react = await import('@vitejs/plugin-react');
  
  return {
    plugins: [react.default()],
    resolve: {
      alias: {
        '@textreme/schema': path.resolve(__dirname, '../../packages/schema/src'),
        '@textreme/client': path.resolve(__dirname, '../../packages/client/src'),
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
  };
});

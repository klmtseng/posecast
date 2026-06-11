import { defineConfig } from 'vite';

// HTTPS=1 npm run dev → 區網手機實測用 (getUserMedia 需要安全環境)
export default defineConfig(async () => {
  const plugins = [];
  if (process.env.HTTPS === '1') {
    const mkcert = (await import('vite-plugin-mkcert')).default;
    plugins.push(mkcert());
  }
  return {
    plugins,
    server: { host: true },
  };
});

import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import fs from 'node:fs';

// Com SAMPLE=1 o servidor de desenvolvimento serve dados de exemplo (tests/fixtures/sample) em vez de public/data.
function sampleData() {
  return {
    name: 'sample-data',
    configureServer(server) {
      if (!process.env.SAMPLE) return;
      const sample = JSON.parse(fs.readFileSync(resolve(import.meta.dirname, 'tests/fixtures/sample/curated.json'), 'utf8'));
      server.middlewares.use((req, res, next) => {
        const m = /\/data\/(meta|incidents|feed|services|shelters|myths)\.json/.exec(req.url ?? '');
        if (!m) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(m[1] === 'meta' ? { updatedAt: new Date().toISOString() } : sample[m[1]]));
      });
    },
  };
}

// Site estático. base './' permite publicar em qualquer alojamento ou subcaminho.
export default defineConfig({
  base: './',
  plugins: [sampleData()],
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), recs: resolve(import.meta.dirname, 'recomendacoes.html') },
    },
  },
});

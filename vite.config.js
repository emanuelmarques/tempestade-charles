import { defineConfig } from 'vite';
import { resolve, basename } from 'node:path';
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

// SEO: com SITE_URL definido (ex.: SITE_URL=https://exemplo.pt npm run build) injeta canonical e og:url
// e gera robots.txt e sitemap.xml. Sem domínio, não se emitem URLs absolutos inventados.
function seo() {
  const site = (process.env.SITE_URL ?? 'https://charles.emanuelsmarques.pt').replace(/\/$/, '');
  const pages = { 'index.html': '/', 'recomendacoes.html': '/recomendacoes.html', 'situacao.html': '/situacao.html', 'metodologia.html': '/metodologia.html', 'feedback.html': '/feedback.html', 'fontes.html': '/fontes.html' };
  return {
    name: 'seo',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!site) return html.replace('<!--seo-head-->', '');
        const url = site + (pages[basename(ctx.filename ?? '')] ?? '/');
        return html.replace('<!--seo-head-->', `<link rel="canonical" href="${url}">\n<meta property="og:url" content="${url}">
<meta property="og:image" content="${site}/og-image.png">
<meta name="twitter:image" content="${site}/og-image.png">`);
      },
    },
    generateBundle() {
      const lastmod = new Date().toISOString().slice(0, 10);
      const robots = `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ''}`;
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      if (site) {
        const urls = Object.values(pages).map((p) => `  <url><loc>${site}${p}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n');
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` });
      }
    },
  };
}

// Site estático. base './' permite publicar em qualquer alojamento ou subcaminho.
export default defineConfig({
  base: './',
  plugins: [sampleData(), seo()],
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), recs: resolve(import.meta.dirname, 'recomendacoes.html'), detail: resolve(import.meta.dirname, 'situacao.html'), how: resolve(import.meta.dirname, 'metodologia.html'), feedback: resolve(import.meta.dirname, 'feedback.html'), sources: resolve(import.meta.dirname, 'fontes.html') },
    },
  },
});

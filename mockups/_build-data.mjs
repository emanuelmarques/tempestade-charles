// Gera mockups/data.js a partir dos dados reais do site (geo + feed + serviços + ocorrências).
// Os NÍVEIS DE AVISO por distrito são ilustrativos (nos mockups não há chamada ao IPMA).
import fs from 'node:fs';
const geo = JSON.parse(fs.readFileSync('src/data/geo.json', 'utf8'));
const rd = (f) => JSON.parse(fs.readFileSync('public/data/' + f, 'utf8'));
const feed = rd('feed.json'), inc = rd('incidents.json'), svc = rd('services.json');
const level = {
  lisboa: 'vermelho', setubal: 'vermelho', leiria: 'vermelho',
  porto: 'laranja', aveiro: 'laranja', coimbra: 'laranja', santarem: 'laranja', faro: 'laranja', evora: 'laranja',
  viana: 'amarelo', braga: 'amarelo', viseu: 'amarelo', castelobranco: 'amarelo', beja: 'amarelo', portalegre: 'amarelo',
  vilareal: 'verde', guarda: 'verde', braganca: 'verde',
};
const score = { vermelho: 78, laranja: 52, amarelo: 24, verde: 4 };
const districts = Object.entries(geo.districts).map(([id, d], i) => ({
  id, name: d.name, d: d.d, lx: d.lx, ly: d.ly, level: level[id],
  score: Math.max(2, score[level[id]] + ((i * 7) % 13) - 6),
}));
const out = {
  land: geo.land, districts,
  feed: feed.map((f) => ({ time: f.time, title: f.title.pt, cat: f.source.category, src: f.source.name, url: f.source.url })).sort((a, b) => b.time.localeCompare(a.time)),
  incidents: inc.map((f) => ({ time: f.time, district: f.district, place: f.place, title: f.title.pt, sev: f.severity, verified: f.verified, cat: f.source.category, src: f.source.name })),
  services: svc.map((s) => ({ type: s.type, status: s.status, name: s.name.pt, cat: s.source.category, src: s.source.name })),
  warnings: [
    { lvl: 'vermelho', what: 'Precipitação', where: 'Lisboa, Setúbal, Leiria', from: '11 nov 00:00', to: '11 nov 18:00' },
    { lvl: 'laranja', what: 'Agitação marítima (ondas até 10 m)', where: 'Todo o litoral continental', from: '11 nov 06:00', to: '12 nov 06:00' },
    { lvl: 'laranja', what: 'Vento (rajadas até 120 km/h)', where: 'Porto, Aveiro, Coimbra, Faro', from: '11 nov 03:00', to: '11 nov 21:00' },
    { lvl: 'amarelo', what: 'Trovoada', where: 'Viana, Braga, Viseu, Beja', from: '11 nov 12:00', to: '12 nov 00:00' },
  ],
  wx: [['21h', 14, 38], ['00h', 13, 55], ['03h', 13, 72], ['06h', 12, 94]],
  recs: [
    ['Em casa', 'Feche janelas e persianas, retire objetos de varandas e carregue o telemóvel.'],
    ['Na estrada', 'Evite deslocações desnecessárias; nunca atravesse zonas inundadas.'],
    ['Perto da costa', 'Afaste-se de arribas, molhes e paredões; ondas até 10 metros.'],
    ['Sem eletricidade', 'Tenha lanterna e rádio de pilhas; não use geradores dentro de casa.'],
  ],
};
fs.writeFileSync('mockups/data.js', 'window.MOCK=' + JSON.stringify(out) + ';\n');
console.log('ok', JSON.stringify(out).length);

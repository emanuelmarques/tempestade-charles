// Texto fixo bilingue: recomendações, tipos de aviso e áreas. Conselhos baseados nas orientações públicas da ANEPC/IPMA.
export const ANEPC = { category: 'governamental', name: 'ANEPC', url: 'https://prociv.gov.pt' };

export const RECS = {
  casa: [
    [['Fique em casa', 'Stay indoors'], ['Se possível, evite sair enquanto durar o aviso.', 'If you can, avoid going out while the warning lasts.']],
    [['Afaste-se de janelas', 'Keep away from windows'], ['Evite portas e janelas de vidro; fique em divisões interiores.', 'Avoid glass doors and windows; stay in interior rooms.']],
    [['Recolha objetos', 'Secure loose objects'], ['Prenda ou guarde vasos, toldos e mobiliário no exterior.', 'Tie down or store pots, awnings and outdoor furniture.']],
    [['Prepare luz e comunicações', 'Prepare light and communications'], ['Lanterna, rádio a pilhas e telemóvel carregado.', 'Torch, battery radio and a charged phone.']],
    [['Não se abrigue sob árvores', 'Do not shelter under trees'], ['Árvores, postes e placards podem cair com o vento.', 'Trees, poles and billboards can fall in strong wind.']],
    [['Siga a Proteção Civil', 'Follow Civil Protection'], ['Acompanhe as indicações das autoridades da sua zona.', 'Follow the instructions of the authorities in your area.']],
  ],
  estrada: [
    [['Evite deslocações', 'Avoid travelling'], ['Só viaje se for mesmo necessário.', 'Only travel if it is really necessary.']],
    [['Reduza a velocidade', 'Slow down'], ['Aumente a distância de segurança e agarre bem o volante.', 'Increase your following distance and grip the wheel firmly.']],
    [['Não atravesse zonas alagadas', 'Do not cross flooded areas'], ['Nem vias com árvores ou cabos elétricos caídos.', 'Or roads with fallen trees or power lines.']],
    [['Estacione longe de árvores', 'Park away from trees'], ['E de placards e linhas elétricas.', 'And away from billboards and power lines.']],
  ],
  costa: [
    [['Afaste-se da orla costeira', 'Stay away from the shoreline'], ['Evite molhes, falésias e passeios marítimos.', 'Avoid piers, cliffs and seafront walks.']],
    [['Não vá ver as ondas', 'Do not go to watch the waves'], ['Ondas fortes arrastam pessoas sem aviso.', 'Strong waves can sweep people away without warning.']],
    [['Retire equipamentos', 'Remove equipment'], ['Embarcações e material em zonas expostas.', 'Boats and gear in exposed areas.']],
    [['Siga as autoridades marítimas', 'Follow the maritime authorities'], ['E as indicações da Proteção Civil local.', 'And the instructions of local Civil Protection.']],
  ],
};

export const LEVEL_EN = { verde: 'green', amarelo: 'yellow', laranja: 'orange', vermelho: 'red' };
export const TIER_NAMES = [['sem relevância', 'negligible'], ['moderado', 'moderate'], ['alto', 'high'], ['muito alto', 'very high']];

export const TYPE_EN = {
  'Precipitação': 'Rain', 'Vento': 'Wind', 'Trovoada': 'Thunderstorm', 'Agitação Marítima': 'Rough sea', 'Nevoeiro': 'Fog',
  'Tempo Quente': 'Hot weather', 'Tempo Frio': 'Cold weather', 'Neve': 'Snow', 'Costeiro': 'Coastal', 'Tempo Seco': 'Dry weather',
};

export const AREA_NAMES = {
  AOR: 'Açores – Grupo Oriental', ACE: 'Açores – Grupo Central', AOC: 'Açores – Grupo Ocidental',
  MCS: 'Madeira – Costa Sul', MCN: 'Madeira – Costa Norte', MRM: 'Madeira – Regiões Montanhosas', MPS: 'Madeira – Porto Santo',
};
export const ISLAND_AREAS = { acores: ['AOR', 'ACE', 'AOC'], madeira: ['MCN', 'MCS', 'MRM', 'MPS'] };

export const STATUS_CLASS = { cortada: 'st-red', suprimida: 'st-red', sem_servico: 'st-red', condicionada: 'st-org', atrasos: 'st-org', encerrada: 'st-gry' };
export const STATUS_NAMES = {
  cortada: ['Cortada', 'Closed'], condicionada: ['Condicionada', 'Restricted'], suprimida: ['Suprimida', 'Cancelled'],
  atrasos: ['Atrasos', 'Delays'], encerrada: ['Encerrada', 'Closed'], sem_servico: ['Sem serviço', 'No service'],
};
export const TYPE_NAMES = {
  estrada: ['Estrada', 'Road'], comboio: ['Comboio', 'Train'], aeroporto: ['Aeroporto', 'Airport'], escola: ['Escola', 'School'],
  eletricidade: ['Eletricidade', 'Electricity'], agua: ['Água', 'Water'], comunicacoes: ['Comunicações', 'Communications'],
};

export const TYPE_EMOJI = { estrada: '🛣️', comboio: '🚆', aeroporto: '✈️', escola: '🏫', eletricidade: '⚡', agua: '💧', comunicacoes: '📡' };
export const REC_EMOJI = { casa: ['🏠', '🪟', '🧰', '🔦', '🌳', '📻'], estrada: ['🚗', '🐢', '🌊', '🅿️'], costa: ['🏖️', '🚫', '⚓', '📻'] };
export const SIT_EMOJI = { casa: '🏠', estrada: '🚗', costa: '🌊' };

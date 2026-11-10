import geo from './geo.json' with { type: 'json' };

/** Distritos de Portugal continental: id do desenho, área de aviso IPMA e local IPMA da capital. */
const META = [
  ['viana', 'VCT', 1160900], ['braga', 'BRG', 1030300], ['porto', 'PTO', 1131200], ['vilareal', 'VRL', 1171400],
  ['braganca', 'BGC', 1040200], ['viseu', 'VIS', 1182300], ['guarda', 'GDA', 1090700], ['aveiro', 'AVR', 1010500],
  ['coimbra', 'CBR', 1060300], ['leiria', 'LRA', 1100900], ['castelobranco', 'CBO', 1050200], ['santarem', 'STM', 1141600],
  ['lisboa', 'LSB', 1110600], ['portalegre', 'PTG', 1121400], ['evora', 'EVR', 1070500], ['setubal', 'STB', 1151200],
  ['beja', 'BJA', 1020500], ['faro', 'FAR', 1080500],
];

export const DISTRICTS = META.map(([id, area, locationId]) => ({ id, area, locationId, ...geo.districts[id] }));
export const LAND_PATH = geo.land;
export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));
export const DISTRICT_BY_AREA = Object.fromEntries(DISTRICTS.map((d) => [d.area, d]));

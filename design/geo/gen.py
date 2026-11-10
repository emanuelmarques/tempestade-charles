import json, unicodedata
import shapely
from shapely.geometry import shape, Polygon, MultiPolygon, box
from shapely.ops import unary_union, transform
from pyproj import Transformer
d=json.load(open('dist.geojson',encoding='utf-8-sig'))
def nid(s):
    s=unicodedata.normalize('NFD',s.lower())
    s=''.join(c for c in s if unicodedata.category(c)!='Mn')
    return s.replace(' ','')
geoms={}
for f in d['features']:
    geoms[nid(f['properties']['Distrito'])]=shape(f['geometry'])
ids=list(geoms)
simp=shapely.coverage_simplify([geoms[i] for i in ids], 1100)
S={i:g for i,g in zip(ids,simp)}
# drop tiny islands
def big(g):
    if isinstance(g,MultiPolygon):
        ps=[p for p in g.geoms if p.area>20e6]
        return MultiPolygon(ps) if len(ps)>1 else ps[0]
    return g
S={i:big(g) for i,g in S.items()}
allp=unary_union(list(S.values()))
xmin,ymin,xmax,ymax=allp.bounds
print('bounds km',(xmax-xmin)/1000,(ymax-ymin)/1000, file=__import__('sys').stderr)
def T(x,y): return ((x-xmin)/1000+20, (ymax-y)/1000+20)
def tg(g): return transform(lambda x,y,z=None:(((x-xmin)/1000+20),((ymax-y)/1000+20)), g)
def path(g):
    out=[]
    polys=g.geoms if hasattr(g,'geoms') else [g]
    for p in polys:
        for ring in [p.exterior]+list(p.interiors):
            c=list(ring.coords)[:-1]
            out.append('M'+' L'.join(f'{x:.0f},{y:.0f}' for x,y in c)+' Z')
    return ' '.join(out)
res={'districts':{}}
for i,g in S.items():
    t=tg(g)
    pl=__import__("shapely.algorithms.polylabel",fromlist=["x"]).polylabel(max(t.geoms,key=lambda p:p.area) if hasattr(t,'geoms') else t, 1)
    res['districts'][i]={'d':path(t),'lx':round(pl.x),'ly':round(pl.y)+3}
res['outline']=path(tg(allp))
# spain
tr=Transformer.from_crs(4326,3763,always_xy=True)
esp=json.load(open('esp.geojson'))['features'][0]['geometry']['coordinates'][0]
sp=Polygon([tr.transform(lo,la) for lo,la in esp]).buffer(6000)
land=unary_union([sp, allp.buffer(500)])
view=box(xmin-40000-20000, ymin-30000, xmax+60000, ymax+30000)  # generous
land=land.intersection(view).simplify(1500)
res['land']=path(tg(land))
pins={'Aveiro':(40.64,-8.65),'Ilhavo':(40.60,-8.67),'FigueiraFoz':(40.15,-8.86),'Coimbra':(40.21,-8.43),'Leiria':(39.74,-8.81),'MarinhaGrande':(39.75,-8.93),'Peniche':(39.36,-9.38),'Porto':(41.15,-8.61),'Gaia':(41.06,-8.62),'Lisboa':(38.72,-9.14),'Setubal':(38.52,-8.89),'Faro':(37.02,-7.93),'Guarda':(40.54,-7.27)}
res['pins']={k:[round(v) for v in T(*tr.transform(lo,la))] for k,(la,lo) in pins.items()}
res['espLabel']=[round(v) for v in T(*tr.transform(-6.2,39.0))]
json.dump(res,open('out.json','w'),ensure_ascii=False)
for k,v in res['districts'].items(): print(k,v['lx'],v['ly'],len(v['d']))
print(res['pins']); print(res['espLabel'], len(res['land']), len(res['outline']))
print('X range',T(xmin,0)[0],T(xmax,0)[0],'Y',T(0,ymax)[1],T(0,ymin)[1])

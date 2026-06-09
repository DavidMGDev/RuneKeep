import json
from simplify import box, collect
d=json.load(open('layout.json'))
sc=d['screens'][0]
acc=[]
for n in sc['root']: collect(n,acc)
# find mainBG as origin (full-screen rect, x:start y:start)
def find(name):
    for n in acc:
        if n.get('name')==name: return n
    return None
VW,VH=412,892
bg=find('mainBG')
bb=box(bg,VW,VH)
ox,oy=bb['x'],bb['y']
print(f"# base viewport {VW}x{VH}; origin(mainBG)=({ox:.1f},{oy:.1f}) size={bb['w']:.0f}x{bb['h']:.0f}")
# print painted layers with screen-relative box
def rel(n):
    b=box(n,VW,VH)
    if not b: return None
    return (b['x']-ox, b['y']-oy, b['w'], b['h'])
# walk preserving hierarchy/depth
def walk(node,depth):
    nm=node.get('name') or '(unnamed)'
    b=rel(node)
    paints=node.get('paints')
    tag=node['kind']+('' if paints else ' grp')
    ap=node.get('appearance') or {}
    asset=ap.get('asset','').split('/')[-1] if ap.get('asset') else ''
    fill=ap.get('fill') or ''
    if b:
        print(f"{'  '*depth}{nm} [{tag}] x={b[0]:.1f} y={b[1]:.1f} w={b[2]:.1f} h={b[3]:.1f} {asset}{(' fill='+str(fill)) if fill else ''}")
    for c in node.get('children') or []: walk(c,depth+1)
for n in sc['root']: walk(n,0)

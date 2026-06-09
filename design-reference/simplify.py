#!/usr/bin/env python3
"""Distill a Ligma Adapt layout.json into a compact digest an AI can actually read.

Usage:
    python simplify.py [layout.json]          # human/AI text digest (default)
    python simplify.py layout.json --layer ID # full record for one layer (jq-like)

The digest shows the component tree + each layer's responsive intent
(anchor: start/center/end/lerp; sizing: fixed/fluid) on both axes, derived by
resolving the keyframes at the screen's smallest and largest viewport. It is a
HINT for translation; verify against the .html at each resolution."""
import json, sys

def interp(kfs, vw, vh, axis, prop, fb):
    rel = [k for k in kfs if (k.get('axis') == axis or k.get('axis') == 'both') and k.get(prop) is not None]
    if not rel: return fb
    drive = (lambda k: k['viewport_w']) if axis == 'h' else (lambda k: k['viewport_h'])
    other = (lambda k: k['viewport_h']) if axis == 'h' else (lambda k: k['viewport_w'])
    v  = vw if axis == 'h' else vh
    co = vh if axis == 'h' else vw
    by = {}
    for k in rel:
        key = round(drive(k) * 2)
        ex = by.get(key)
        if ex is None or abs(other(k) - co) < abs(other(ex) - co): by[key] = k
    s = sorted(by.values(), key=drive)
    if v <= drive(s[0]):  return s[0].get(prop, fb)
    if v >= drive(s[-1]): return s[-1].get(prop, fb)
    for i in range(len(s) - 1):
        a, b = s[i], s[i + 1]; av, bv = drive(a), drive(b)
        if av <= v <= bv:
            t = 0 if bv == av else (v - av) / (bv - av)
            pa = a.get(prop, fb); pb = b.get(prop, fb)
            return pa + (pb - pa) * t
    return fb

def box(layer, vw, vh):
    g = layer.get('geometry')
    if not g: return None
    b = g['base']; kfs = g.get('keyframes') or []
    if not kfs: return dict(b)
    return {'x': interp(kfs, vw, vh, 'h', 'x', b['x']), 'y': interp(kfs, vw, vh, 'v', 'y', b['y']),
            'w': interp(kfs, vw, vh, 'h', 'w', b['w']), 'h': interp(kfs, vw, vh, 'v', 'h', b['h'])}

def anchor(p0, sz0, span0, p1, sz1, span1):
    if abs(p1 - p0) < 1.5: return 'start'
    if abs((span1 - (p1 + sz1)) - (span0 - (p0 + sz0))) < 1.5: return 'end'
    if abs(p0 - (span0 - sz0) / 2) < 2 and abs(p1 - (span1 - sz1) / 2) < 2: return 'center'
    return 'lerp'

def intent(layer, lo, hi):
    bl, bh = box(layer, lo[0], lo[1]), box(layer, hi[0], hi[1])
    if not bl or not bh: return ''
    hsz = 'fluid' if abs(bh['w'] - bl['w']) > 1 else 'fixed(%g)' % round(bl['w'])
    vsz = 'fluid' if abs(bh['h'] - bl['h']) > 1 else 'fixed(%g)' % round(bl['h'])
    ha = anchor(bl['x'], bl['w'], lo[0], bh['x'], bh['w'], hi[0])
    va = anchor(bl['y'], bl['h'], lo[1], bh['y'], bh['h'], hi[1])
    return 'x:%s w:%s | y:%s h:%s' % (ha, hsz, va, vsz)

def appearance_hint(layer):
    a = layer.get('appearance') or {}
    bits = []
    if a.get('asset'): bits.append('asset=' + a['asset'].split('/')[-1])
    if a.get('fill'): bits.append('fill=' + str(a['fill']))
    if a.get('color'): bits.append('bg=' + str(a['color']))
    if a.get('text'): bits.append('text=' + json.dumps(a['text'][:24]))
    return ('  ' + ' '.join(bits)) if bits else ''

def walk(node, lo, hi, depth, out):
    name = node.get('name') or '(unnamed)'
    tag = node['kind'] + ('' if node.get('paints') else ' grp')
    line = '%s- %s [%s]' % ('  ' * depth, name, tag)
    it = intent(node, lo, hi)
    if it: line += '  ' + it
    if node.get('breakpoints'): line += '  bp:%d' % len(node['breakpoints'])
    line += appearance_hint(node)
    out.append(line)
    for c in node.get('children') or []:
        walk(c, lo, hi, depth + 1, out)

def collect(node, acc):
    acc.append(node)
    for c in node.get('children') or []: collect(c, acc)

def resolutions(nodes):
    ws, hs = set(), set()
    for n in nodes:
        g = n.get('geometry') or {}
        for k in g.get('keyframes') or []:
            ws.add(round(k['viewport_w'])); hs.add(round(k['viewport_h']))
    return sorted(ws), sorted(hs)

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    path = args[0] if args else 'layout.json'
    layer_id = None
    if '--layer' in sys.argv:
        i = sys.argv.index('--layer'); layer_id = sys.argv[i + 1] if i + 1 < len(sys.argv) else None
    doc = json.load(open(path, encoding='utf-8'))
    ow, oh = doc['origin']['width'], doc['origin']['height']

    if layer_id:
        for s in doc['screens']:
            acc = []
            for n in s['root']: collect(n, acc)
            for n in acc:
                if n['id'] == layer_id: print(json.dumps(n, indent=2)); return
        print('layer not found:', layer_id); return

    print('BASE DESIGN %dx%d  -  %d screen(s)' % (ow, oh, len(doc['screens'])))
    for s in doc['screens']:
        acc = []
        for n in s['root']: collect(n, acc)
        ws, hs = resolutions(acc)
        lo = (ws[0] if ws else ow, hs[0] if hs else oh)
        hi = (ws[-1] if ws else ow, hs[-1] if hs else oh)
        painted = sum(1 for n in acc if n.get('paints'))
        print('\n=== SCREEN: %s  (%dx%d)  layers=%d painted=%d ===' % (s['name'], round(s['frame']['w']), round(s['frame']['h']), len(acc), painted))
        print('widths: %s' % (ws or [ow]))
        print('heights: %s' % (hs or [oh]))
        print('intent sampled at %s..%s wide, %s..%s tall' % (lo[0], hi[0], lo[1], hi[1]))
        print('legend: anchor start|center|end|lerp / sizing fixed(px)|fluid / grp=container / bp=breakpoints')
        out = []
        for n in s['root']: walk(n, lo, hi, 0, out)
        print('\n'.join(out))

if __name__ == '__main__':
    main()

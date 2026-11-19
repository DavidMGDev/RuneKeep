"""
Model the desktop play table's dice in Blender and export them as one GLB (v0.47.0).

    blender -b -P scripts/blender/make_dice.py -- public/models/dice.glb [preview.png]

Six solids (d4, d6, d8, d10, d12, d20), each scaled to a circumradius of 1 and bevelled with three
segments so the edges catch light. Two material slots split every die into two glTF primitives:
"Face" (the flat faces, each UV-mapped into its own square cell of a 5 x 4 atlas, row-major from the top
left, so the app can paint numbers or icons on a canvas) and "Edge" (the bevels, smooth shaded).

Each object carries glTF extras the app reads to settle a die on a chosen face:
  faces: [{ n: [x, y, z], up: [x, y, z] }]  per face, in glTF (Y-up) space: the outward normal and the
         direction that is "up" in that face's atlas cell
  inR:   the distance from the centre to a face (the height the die rests at, for radius 1)
  artR:  how much of a cell the face's inscribed circle covers (the radius, as a share of the cell)
"""
import math
import sys

import bmesh
import bpy
from mathutils import Vector

COLS, ROWS = 5, 4
BEVEL = 0.075

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'dice.glb'
PREVIEW = argv[1] if len(argv) > 1 else None

PHI = (1 + 5 ** 0.5) / 2


def tetra():
    v = [(1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1)]
    return v, [(0, 1, 2), (0, 3, 1), (0, 2, 3), (1, 3, 2)]


def cube():
    v = [(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    return v, [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]


def octa():
    v = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
    f = []
    for a in (0, 1):
        for b in (2, 3):
            for c in (4, 5):
                f.append((a, b, c))
    return v, f


def icosa():
    v = []
    for a in (-1, 1):
        for b in (-PHI, PHI):
            v += [(0, a, b), (a, b, 0), (b, 0, a)]
    return v, hull_faces(v, 3)


def dodeca():
    v = [(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    for a in (-1, 1):
        for b in (-1, 1):
            v += [(0, a / PHI, b * PHI), (a / PHI, b * PHI, 0), (b * PHI, 0, a / PHI)]
    return v, hull_faces(v, 5)


def d10():
    """A pentagonal trapezohedron: two poles and two staggered rings of five, kites made planar."""
    h = 1.0

    def plane_err(z0):
        t = Vector((0, 0, h))
        u0 = Vector((1, 0, z0))
        l0 = Vector((math.cos(math.radians(36)), math.sin(math.radians(36)), -z0))
        u1 = Vector((math.cos(math.radians(72)), math.sin(math.radians(72)), z0))
        n = (u0 - t).cross(u1 - t)
        return n.dot(l0 - t)

    lo, hi = 0.0, 1.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if plane_err(lo) * plane_err(mid) <= 0:
            hi = mid
        else:
            lo = mid
    z0 = (lo + hi) / 2
    v = [(0, 0, h), (0, 0, -h)]
    for k in range(5):
        a = math.radians(72 * k)
        v.append((math.cos(a), math.sin(a), z0))
    for k in range(5):
        a = math.radians(72 * k + 36)
        v.append((math.cos(a), math.sin(a), -z0))
    U = lambda k: 2 + k % 5
    L = lambda k: 7 + k % 5
    f = []
    for k in range(5):
        f.append((0, U(k), L(k), U(k + 1)))  # pole first: "up" points at it
        f.append((1, L(k), U(k + 1), L(k + 1)))
    return v, f


def hull_faces(verts, n):
    """Faces of a regular solid from its vertices: every plane that has n vertices and none outside."""
    V = [Vector(p) for p in verts]
    faces = set()
    import itertools
    for a, b, c in itertools.combinations(range(len(V)), 3):
        nrm = (V[b] - V[a]).cross(V[c] - V[a])
        if nrm.length < 1e-6:
            continue
        nrm.normalize()
        d = nrm.dot(V[a])
        side = [nrm.dot(p) - d for p in V]
        if all(s <= 1e-5 for s in side) or all(s >= -1e-5 for s in side):
            on = tuple(sorted(i for i, s in enumerate(side) if abs(s) < 1e-5))
            if len(on) == n:
                faces.add(on)
    out = []
    for on in faces:
        c = sum((V[i] for i in on), Vector()) / n
        nrm = c.normalized()
        ref = (V[on[0]] - c).normalized()
        side = nrm.cross(ref)
        ang = lambda i: math.atan2((V[i] - c).dot(side), (V[i] - c).dot(ref))
        out.append(tuple(sorted(on, key=ang)))
    # A stable order: top to bottom, then around.
    def key(face):
        c = sum((V[i] for i in face), Vector()) / n
        return (round(-c.z, 3), round(math.atan2(c.y, c.x), 3))
    return sorted(out, key=key)


def build(name, verts, faces):
    V = [Vector(p) for p in verts]
    r = max(p.length for p in V)
    V = [p / r for p in V]
    # Outward winding.
    fixed = []
    for f in faces:
        c = sum((V[i] for i in f), Vector()) / len(f)
        nrm = (V[f[1]] - V[f[0]]).cross(V[f[2]] - V[f[0]])
        fixed.append(tuple(reversed(f)) if nrm.dot(c) < 0 else tuple(f))
    faces = fixed

    # Per face: centre, normal, an "up" in its plane, and the circumradius.
    frames = []
    for f in faces:
        pts = [V[i] for i in f]
        c = sum(pts, Vector()) / len(pts)
        n = c.normalized()
        if len(f) == 4 and name == 'd6':
            up = ((pts[0] + pts[1]) / 2 - c).normalized()
        else:
            up = (pts[0] - c).normalized()
        R = max((p - c).length for p in pts)
        inr = min(((pts[i] + pts[(i + 1) % len(pts)]) / 2 - c).length for i in range(len(pts)))
        if len(f) == 4 and name == 'd10':
            # A kite's inscribed circle sits low; the art centre stays the face centre, sized to fit.
            inr = min(_dist_to_seg(c, pts[i], pts[(i + 1) % 4]) for i in range(4))
        frames.append((c, n, up, R, inr))
    inR = min(fr[0].length for fr in frames)

    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bv = [bm.verts.new(p) for p in V]
    for i, f in enumerate(faces):
        face = bm.faces.new([bv[j] for j in f])
        face.material_index = 0
    bm.normal_update()

    res = bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=BEVEL, offset_type='OFFSET', segments=3, profile=0.5, affect='EDGES', clamp_overlap=True)
    bevel_faces = set(res['faces'])
    uv = bm.loops.layers.uv.new('UVMap')
    cell = 1.0
    for face in bm.faces:
        if face in bevel_faces:
            face.material_index = 1
            face.smooth = True
            for loop in face.loops:
                loop[uv].uv = (0.001, 0.999)
            continue
        face.material_index = 0
        face.smooth = False
        for e in face.edges:
            e.smooth = False
        fn = face.normal
        idx = max(range(len(frames)), key=lambda k: frames[k][1].dot(fn))
        c, n, up, R, _ = frames[idx]
        right = up.cross(n)
        s = 0.46 / R
        col, row = idx % COLS, idx // COLS
        for loop in face.loops:
            d = loop.vert.co - c
            gx = (col + 0.5 + d.dot(right) * s) / COLS
            gy = (row + 0.5 - d.dot(up) * s) / ROWS
            loop[uv].uv = (gx, 1 - gy)  # Blender's v runs up; glTF's runs down (the exporter flips it)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(MAT_FACE)
    obj.data.materials.append(MAT_EDGE)
    to_gl = lambda p: [round(p.x, 5), round(p.z, 5), round(-p.y, 5)]
    obj['faces'] = [{'n': to_gl(fr[1]), 'up': to_gl(fr[2])} for fr in frames]
    obj['inR'] = round(inR, 5)
    obj['artR'] = round(min(fr[4] for fr in frames) * 0.46 / frames[0][3], 5)
    return obj


def _dist_to_seg(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.dot(ab)))
    return (a + ab * t - p).length


bpy.ops.wm.read_factory_settings(use_empty=True)
MAT_FACE = bpy.data.materials.new('Face')
MAT_EDGE = bpy.data.materials.new('Edge')
for m, col in ((MAT_FACE, (0.06, 0.07, 0.09, 1)), (MAT_EDGE, (0.78, 0.57, 0.23, 1))):
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = col

objs = [build('d4', *tetra()), build('d6', *cube()), build('d8', *octa()), build('d10', *d10()), build('d12', *dodeca()), build('d20', *icosa())]
for i, o in enumerate(objs):
    o.location = ((i - 2.5) * 2.6, 0, 0)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_extras=True, export_yup=True, export_materials='EXPORT', export_normals=True, export_texcoords=True)
for o in objs:
    print(o.name, len(o.data.polygons), 'faces', len(o['faces']), 'inR', o['inR'], 'artR', o['artR'])

if PREVIEW:
    # A quick look: a camera above the row, a sun, Workbench.
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    bpy.context.collection.objects.link(cam)
    cam.location = (0, -9, 7)
    cam.rotation_euler = (math.radians(52), 0, 0)
    bpy.context.scene.camera = cam
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'MATERIAL'
    sc.render.resolution_x, sc.render.resolution_y = 1400, 500
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)

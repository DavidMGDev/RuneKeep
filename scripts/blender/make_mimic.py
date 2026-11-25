"""
Model the table's chests (v0.47.12) in Blender and export each as a GLB.

    blender -b -P scripts/blender/make_mimic.py -- public/models/mimic.glb [preview.png]
    blender -b -P scripts/blender/make_mimic.py -- public/models/chest.glb [preview.png] --cute
    blender -b -P scripts/blender/make_mimic.py -- public/models/tokenchest.glb [preview.png] --token
    blender -b -P scripts/blender/make_mimic.py -- public/models/dicechest.glb [preview.png] --brown

The mimic (the Void card's): a small iron-bound chest that is really a mouth, a dark wooden box with gold corner bands
and a row of fangs along the rim of the box and the lid (owner: no tongue, no eyes; it gives itself away by
breathing, its lid opening and shutting).

The cute chest (--cute, owner: "a different chest that looks a little cuter"): squat and soft, honey wood with
rounded everything, a tall dome lid with one gold band, a round gold lock, a rosy mouth and two little rounded fangs.
It is the other look for both the mimic and the dice chest.

The token chest (--token, owner v0.50.6: small and golden, distinct especially from the top): the cute chest's soft
shape gilded all over with bronze bands. From above it reads as its own thing: a bronze strap the long way crossing
the band over the lid, and where they meet a big copper token set in a bronze ring.

The dice chest (--brown, owner v0.50.6: brown and large): the cute chest's shape in dark walnut with iron, not gold.

Both are exported Z up (the table's frame: x across, y up the screen, z towards the camera), front facing -y, about
1.6 across, sitting on z = -0.5, with no two faces of different parts in the same plane (no z-fighting). Objects:
"Mimic" (the root) holds "Base" and "Lid"; "Lid" is an empty at the hinge (the back of the rim), and the app turns it
about x to open the mouth.
"""
import math
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
TOKEN = '--token' in argv
BROWN = '--brown' in argv
CUTE = '--cute' in argv or TOKEN or BROWN
argv = [a for a in argv if a not in ('--cute', '--token', '--brown')]
OUT = argv[0] if argv else ('tokenchest.glb' if TOKEN else 'dicechest.glb' if BROWN else 'chest.glb' if CUTE else 'mimic.glb')
PREVIEW = argv[1] if len(argv) > 1 else None

FLOOR = -0.5

bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    return m


def box(name, size, loc, material, bevel=0.03, parent=None, segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        m = o.modifiers.new('b', 'BEVEL')
        m.width = bevel
        m.segments = segments
        bpy.ops.object.modifier_apply(modifier='b')
    o.data.materials.append(material)
    if parent:
        o.parent = parent
    return o


def cone(name, loc, down, material, parent, h=0.13, r=0.055):
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r, radius2=0.0, depth=h, location=loc)
    o = bpy.context.active_object
    o.name = name
    if down:
        o.rotation_euler = (math.pi, 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    o.data.materials.append(material)
    o.parent = parent
    return o


def blob(name, loc, scale, material, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(material)
    o.parent = parent
    return o


def dome(name, w, d, z0, h, material, parent):
    """Half a cylinder lying across (its round side up), flattened to height h, its flat base at z0."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=d / 2, depth=w, location=(0, -d / 2, 0), rotation=(0, math.pi / 2, 0))
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.transform_apply(rotation=True, location=False)
    for v in o.data.vertices:
        v.co.z = z0 + max(0.0, v.co.z) * (h / (d / 2))
    o.data.materials.append(material)
    o.parent = parent
    return o


def empty(name, parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    o.parent = parent
    return o


root = empty('Mimic')
base = empty('Base', root)
lid = empty('Lid', root)

if not CUTE:
    W, D, RIM, LID_H = 1.6, 1.1, 0.12, 0.34
    WOOD = mat('Wood', (0.17, 0.075, 0.035), 0.75)
    WOOD_DARK = mat('WoodDark', (0.09, 0.035, 0.02), 0.8)
    GOLD = mat('Gold', (0.83, 0.58, 0.22), 0.32, 1.0)
    TOOTH = mat('Tooth', (0.93, 0.88, 0.74), 0.45)
    MOUTH = mat('Mouth', (0.22, 0.02, 0.03), 0.6)
    h = RIM - FLOOR
    box('Box', (W, D, h), (0, 0, FLOOR + h / 2), WOOD, 0.04, base)
    # The mouth: a thin sheet a hair above the rim (the box is solid), never in its plane.
    box('Gullet', (W - 0.16, D - 0.16, 0.01), (0, 0, RIM + 0.001), MOUTH, 0.0, base)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('Band', (0.12, 0.12, h + 0.02), (sx * (W / 2 - 0.04), sy * (D / 2 - 0.04), FLOOR + h / 2), GOLD, 0.02, base)
    box('Strap', (W - 0.1, 0.1, 0.1), (0, -D / 2 + 0.02, FLOOR + 0.18), GOLD, 0.02, base)
    for i in range(7):
        cone('LowTooth', (-W / 2 + 0.2 + i * (W - 0.4) / 6, -D / 2 + 0.1, RIM + 0.05), False, TOOTH, base)
    # The lid hangs forward from its hinge, a hair above the rim so the two never share a plane when it is shut.
    lid.location = (0, D / 2, RIM + 0.01)
    box('LidBox', (W, D, 0.12), (0, -D / 2, 0.06), WOOD, 0.03, lid)
    # The curved top sinks into the lid's box and stops short of its ends (it used to sit flush on both: z-fighting).
    dome('LidRound', W - 0.04, D, 0.1, LID_H - 0.1, WOOD_DARK, lid)
    for sx in (-1, 1):
        # The bands stand proud of the lid's ends (they used to share its end face: z-fighting).
        box('LidBand', (0.12, D + 0.04, 0.08), (sx * (W / 2 - 0.04), -D / 2, LID_H * 0.5), GOLD, 0.015, lid)
    for i in range(6):
        cone('HighTooth', (-W / 2 + 0.27 + i * (W - 0.54) / 5, -D + 0.1, -0.05), True, TOOTH, lid)
    smooth = {'LidRound'}
else:
    W, D, RIM, LID_H = 1.5, 1.15, 0.0, 0.62
    if TOKEN:
        # Satin gold, not a mirror (owner: the glossy gilt glared under the table's light).
        WOOD = mat('Gilt', (0.78, 0.55, 0.17), 0.62, 0.3)
        WOOD_LID = mat('GiltLid', (0.85, 0.62, 0.22), 0.58, 0.3)
        GOLD = mat('Bronze', (0.42, 0.25, 0.09), 0.55, 0.6)
    elif BROWN:
        WOOD = mat('Walnut', (0.2, 0.09, 0.035), 0.65)
        WOOD_LID = mat('WalnutLid', (0.26, 0.12, 0.05), 0.6)
        GOLD = mat('Iron', (0.32, 0.31, 0.3), 0.38, 1.0)
    else:
        WOOD = mat('Honey', (0.62, 0.34, 0.13), 0.6)
        WOOD_LID = mat('HoneyLid', (0.7, 0.4, 0.16), 0.55)
        GOLD = mat('Gold', (0.95, 0.72, 0.3), 0.28, 1.0)
    TOOTH = mat('Tooth', (1.0, 0.97, 0.9), 0.4)
    MOUTH = mat('Mouth', (0.75, 0.22, 0.3), 0.55)
    h = RIM - FLOOR
    # Soft, round edges all over: a toy, not a strongbox.
    box('Box', (W, D, h), (0, 0, FLOOR + h / 2), WOOD, 0.14, base, segments=5)
    box('Gullet', (W - 0.3, D - 0.3, 0.01), (0, 0, RIM + 0.001), MOUTH, 0.0, base)
    # A round gold lock on the front, and a band low round the box.
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.15, depth=0.06, location=(0, -D / 2 - 0.01, RIM - 0.16), rotation=(math.pi / 2, 0, 0))
    lock = bpy.context.active_object
    lock.name = 'Lock'
    bpy.ops.object.transform_apply(rotation=True)
    lock.data.materials.append(GOLD)
    lock.parent = base
    box('Band', (W + 0.03, D + 0.03, 0.07), (0, 0, FLOOR + 0.13), GOLD, 0.03, base, segments=3)
    # A row of tiny round teeth along the front rim.
    for i in range(5):
        blob('LowTooth', (-0.42 + i * 0.21, -D / 2 + 0.16, RIM + 0.01), (0.055, 0.045, 0.06), TOOTH, base)
    lid.location = (0, D / 2, RIM + 0.012)
    # A tall dome lid, soft at its ends, with one gold band over the top.
    box('LidBox', (W, D, 0.12), (0, -D / 2, 0.06), WOOD_LID, 0.05, lid, segments=4)
    dome('LidRound', W - 0.06, D - 0.02, 0.1, LID_H - 0.1, WOOD_LID, lid)
    box('LidBand', (0.16, D + 0.04, 0.16), (0, -D / 2, 0.08), GOLD, 0.05, lid, segments=3)
    bpy.ops.mesh.primitive_torus_add(major_radius=(D + 0.06) / 2, minor_radius=0.045, location=(0, -D / 2, 0.1), rotation=(0, math.pi / 2, 0))
    arch = bpy.context.active_object
    arch.name = 'LidArch'
    bpy.ops.object.transform_apply(rotation=True, location=False)
    for v in arch.data.vertices:
        v.co.z = 0.1 + max(-0.02, v.co.z - 0.1) * ((LID_H - 0.1) / ((D + 0.06) / 2))
    arch.data.materials.append(GOLD)
    arch.parent = lid
    # Two little rounded fangs, the only giveaway.
    for sx in (-1, 1):
        cone('Fang', (sx * 0.26, -D + 0.12, -0.04), True, TOOTH, lid, h=0.12, r=0.06)
    smooth = {'LidRound', 'LowTooth', 'LidArch', 'Lock'}
    if TOKEN:
        # The top, as seen from above: a strap the long way crossing the band, and a copper token in a bronze ring
        # where they meet, all standing proud of the dome (never in its surface).
        COPPER = mat('Copper', (0.8, 0.4, 0.2), 0.45, 0.7)
        box('LidStrap', (W - 0.02, 0.14, 0.05), (0, -D / 2, LID_H + 0.005), GOLD, 0.02, lid, segments=2)
        for name, r, dz, h, m in (('TopRing', 0.3, 0.03, 0.07, GOLD), ('TopCoin', 0.23, 0.07, 0.06, COPPER)):
            bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=r, depth=h, location=(0, -D / 2, LID_H + dz))
            o = bpy.context.active_object
            o.name = name
            o.data.materials.append(m)
            o.parent = lid
        bpy.ops.mesh.primitive_torus_add(major_radius=0.15, minor_radius=0.025, location=(0, -D / 2, LID_H + 0.1))
        o = bpy.context.active_object
        o.name = 'CoinRim'
        o.data.materials.append(COPPER)
        o.parent = lid
        smooth |= {'TopRing', 'TopCoin', 'CoinRim'}

for o in bpy.data.objects:
    if o.type == 'MESH':
        for p in o.data.polygons:
            p.use_smooth = o.name.split('.')[0] in smooth or (CUTE and o.name.split('.')[0] in ('Box', 'LidBox', 'Band', 'LidBand'))

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=False, export_apply=True, export_extras=False)
print('exported', OUT)

if PREVIEW:
    scene = bpy.context.scene
    lid.rotation_euler = (-0.45, 0, 0)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    cam.location = (2.2, -3.4, 2.6)
    cam.rotation_euler = (math.radians(58), 0, math.radians(33))
    scene.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4
    sun.rotation_euler = (0.7, 0.2, -0.6)
    scene.collection.objects.link(sun)
    scene.world = bpy.data.worlds.new('w')
    scene.world.color = (0.05, 0.05, 0.07)
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print('preview', PREVIEW)

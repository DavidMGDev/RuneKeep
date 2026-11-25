"""
The token chest's landmine (owner, v0.50.6), modelled in Blender and exported as a GLB.

    blender -b -P scripts/blender/make_mine.py -- public/models/mine.glb [preview.png]

Token-shaped, so it reads as made of the tokens it swallowed: a squat round disc with a domed top, a ring of bolts
round the rim, four short prongs, and a lamp in the middle that the app blinks faster and faster as the fuse burns.
Materials the app reads by name: "Shell" (tinted per mine: olive, or metallic black for the big ones) and "Lamp"
(its emission blinks). Z up, about 1.8 across, sitting on z = -0.5, like the chests.
"""
import math
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'mine.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
FLOOR = -0.5

bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, rough=0.5, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = 2.0
    return m


SHELL = mat('Shell', (0.27, 0.27, 0.14), 0.45, 0.6)
STEEL = mat('Steel', (0.5, 0.5, 0.52), 0.3, 1.0)
DARK = mat('Band', (0.05, 0.05, 0.05), 0.6, 0.3)
LAMP = mat('Lamp', (0.9, 0.08, 0.05), 0.2, 0.0, emit=(1.0, 0.1, 0.05))

root = bpy.data.objects.new('Mine', None)
bpy.context.scene.collection.objects.link(root)


def own(o, m, smooth=True):
    o.data.materials.append(m)
    o.parent = root
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


R = 0.9
# The disc with a bevelled edge, and a dark band round its waist so it reads as a token from the side.
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=R, depth=0.32, location=(0, 0, FLOOR + 0.16))
disc = bpy.context.active_object
disc.name = 'Disc'
bev = disc.modifiers.new('b', 'BEVEL')
bev.width = 0.06
bev.segments = 3
bpy.ops.object.modifier_apply(modifier='b')
own(disc, SHELL)
bpy.ops.mesh.primitive_torus_add(major_radius=R + 0.005, minor_radius=0.045, location=(0, 0, FLOOR + 0.12))
own(bpy.context.active_object, DARK)
# The dome, sunk into the disc (never sharing its top face).
bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=0.62, location=(0, 0, FLOOR + 0.26))
dome = bpy.context.active_object
dome.name = 'Dome'
for v in dome.data.vertices:
    v.co.z = max(0.0, v.co.z) * 0.42
own(dome, SHELL)
# Bolts round the rim.
for i in range(10):
    a = i / 10 * math.tau
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.06, depth=0.05, location=(math.cos(a) * 0.76, math.sin(a) * 0.76, FLOOR + 0.335))
    own(bpy.context.active_object, STEEL)
# Four prongs (the trigger), leaning out, each with a ball on its tip.
for i in range(4):
    a = i / 4 * math.tau + math.pi / 4
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.035, depth=0.26, location=(math.cos(a) * 0.36, math.sin(a) * 0.36, FLOOR + 0.62),
                                        rotation=(math.sin(a) * -0.45, math.cos(a) * 0.45, 0))
    own(bpy.context.active_object, STEEL)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.05, location=(math.cos(a) * 0.42, math.sin(a) * 0.42, FLOOR + 0.74))
    own(bpy.context.active_object, STEEL)
# The lamp in a steel collar on top.
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.2, depth=0.08, location=(0, 0, FLOOR + 0.52))
own(bpy.context.active_object, STEEL)
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.15, location=(0, 0, FLOOR + 0.58))
own(bpy.context.active_object, LAMP)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=False, export_apply=True, export_extras=False)
print('exported', OUT)

if PREVIEW:
    scene = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    cam.location = (2.2, -3.0, 3.0)
    cam.rotation_euler = (math.radians(50), 0, math.radians(36))
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

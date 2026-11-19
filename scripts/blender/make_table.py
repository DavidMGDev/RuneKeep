"""
Render the desktop play table's surface in Blender (v0.47.0).

    blender -b -P scripts/blender/make_table.py -- public/table

Writes two PNGs into the folder (the caller converts them to WebP):
  felt.png  2048 x 1280, the ink felt seen from straight above: the app's own background colour, with a fine
            fibre and a soft light falling off towards the corners, so the table reads as cloth under a lamp.
  rail.png  512 x 512 with a transparent middle: the table's rail, dark wood with a gold inlay along its inner
            edge, mitred at the corners, for a CSS 9-slice border (slice 44).
"""
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '.'
os.makedirs(OUT, exist_ok=True)


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    world = bpy.data.worlds.new('w')
    sc.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.0
    return sc


def ortho_cam(sc, w, h):
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(w, h)
    cam.location = (0, 0, 10)
    sc.camera = cam
    return cam


def node(m, kind, **inputs):
    n = m.node_tree.nodes.new(kind)
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def felt():
    sc = reset()
    W, H = 16.0, 10.0
    sc.render.resolution_x, sc.render.resolution_y = 2048, 1280
    ortho_cam(sc, W, H)
    bpy.ops.mesh.primitive_plane_add(size=1)
    plane = bpy.context.object
    plane.scale = (W, H, 1)
    m = bpy.data.materials.new('felt')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.95
    coord = nt.nodes.new('ShaderNodeTexCoord')
    # Fibre: a very fine noise for the bump, and a slow one that mottles the colour a few percent.
    fine = node(m, 'ShaderNodeTexNoise', Scale=900.0, Detail=12.0, Roughness=0.7)
    slow = node(m, 'ShaderNodeTexNoise', Scale=6.0, Detail=3.0, Roughness=0.5)
    nt.links.new(coord.outputs['Object'], fine.inputs['Vector'])
    nt.links.new(coord.outputs['Object'], slow.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs[6].default_value = srgb('#0c1017')
    mix.inputs[7].default_value = srgb('#121823')
    nt.links.new(slow.outputs['Fac'], mix.inputs['Factor'])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bump = node(m, 'ShaderNodeBump', Strength=0.35, Distance=0.02)
    nt.links.new(fine.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    plane.data.materials.append(m)
    # One broad lamp above and a little left of centre: the cloth is brightest under it.
    bpy.ops.object.light_add(type='AREA', location=(-2.0, 1.2, 9))
    lamp = bpy.context.object
    lamp.data.size = 16
    lamp.data.energy = 1500
    sc.render.filepath = os.path.join(OUT, 'felt.png')
    bpy.ops.render.render(write_still=True)


def rail():
    sc = reset()
    sc.render.film_transparent = True
    S, T = 512, 44  # image px; rail thickness in px
    sc.render.resolution_x = sc.render.resolution_y = S
    u = 1 / 100  # one px in Blender units
    ortho_cam(sc, S * u, S * u)
    half, inner = S * u / 2, (S / 2 - T) * u
    wood = bpy.data.materials.new('wood')
    wood.use_nodes = True
    nt = wood.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.55
    bsdf.inputs['Coat Weight'].default_value = 0.12
    coord = nt.nodes.new('ShaderNodeTexCoord')
    wave = node(wood, 'ShaderNodeTexWave', Scale=1.6, Distortion=7.0, Detail=6.0)
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Y'  # varies across the bar, so the grain runs along it
    nt.links.new(coord.outputs['Object'], wave.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = srgb('#1a110b')
    ramp.color_ramp.elements[1].color = srgb('#3b271a')
    nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    gold = bpy.data.materials.new('gold')
    gold.use_nodes = True
    gb = next(n for n in gold.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    gb.inputs['Base Color'].default_value = srgb('#C8923A')
    gb.inputs['Metallic'].default_value = 1.0
    gb.inputs['Roughness'].default_value = 0.3

    # Four mitred bars, each its own object so the grain runs along it; a rounded top from a bevel.
    def bar(rot, mat, out_r, in_r, z):
        import bmesh
        me = bpy.data.meshes.new('bar')
        bm = bmesh.new()
        pts = [(-out_r, out_r), (out_r, out_r), (in_r, in_r), (-in_r, in_r)]
        vb = [bm.verts.new((x, y, 0)) for x, y in pts]
        vt = [bm.verts.new((x, y, z)) for x, y in pts]
        bm.faces.new(vt)
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        top_edges = [e for e in bm.edges if all(v.co.z > z / 2 for v in e.verts)]
        bmesh.ops.bevel(bm, geom=top_edges, offset=z * 0.7, segments=6, profile=0.5, affect='EDGES', clamp_overlap=True)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        ob = bpy.data.objects.new('bar', me)
        sc.collection.objects.link(ob)
        ob.rotation_euler = (0, 0, rot)
        me.materials.append(mat)
        return ob

    for k in range(4):
        bar(math.radians(90 * k), wood, half, inner + 3 * u, 0.32)
        bar(math.radians(90 * k), gold, inner + 3 * u, inner, 0.06)
    bpy.ops.object.light_add(type='AREA', location=(-1.2, 1.6, 6))
    lamp = bpy.context.object
    lamp.data.size = 6
    lamp.data.energy = 260
    bpy.ops.object.light_add(type='AREA', location=(1.5, -1.5, 5))
    fill = bpy.context.object
    fill.data.size = 5
    fill.data.energy = 60
    sc.render.filepath = os.path.join(OUT, 'rail.png')
    bpy.ops.render.render(write_still=True)


felt()
rail()

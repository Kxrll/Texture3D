"""Material texture sets with unmodified source UV coordinates."""

import bpy, bmesh, json, uuid, re, time

from array import array

from . import materials, projects



def prepare(context, folder, resolution, guide):

    objects=[o for o in context.selected_objects if o.type=='MESH']

    if not objects or context.mode!='OBJECT': raise ValueError('Sélectionne au moins un maillage en mode Objet.')

    groups={}

    for obj in objects:

        for slot in sorted({p.material_index for p in obj.data.polygons}):

            source=materials.source_for(obj,slot)

            if source:

                mat=source['material']

                key=mat.as_pointer() if mat else ('none',obj.name,slot)

                groups.setdefault(key,[]).append(source)

    if not groups: raise ValueError('Aucune face à peindre.')

    groups = {'common': [source for group in groups.values() for source in group]}
    for sources in groups.values():

        size=max(resolution,*[max(s['image'].size) if s['image'] else resolution for s in sources])

        if size>8192: raise ValueError('Texture limitée à 8192 px par matériau.')

    name=re.sub(r'[^\w .-]','_',objects[0].name).strip(' .') or 'Modele'

    project=folder.parent/'Projets Texture3D'/(name+'_'+time.strftime('%Y%m%d_%H%M%S')+'_'+uuid.uuid4().hex[:6])

    project.mkdir(parents=True)

    selected=list(context.selected_objects);active=context.view_layer.objects.active

    copies=[];temp_materials=[];sets=[];regions={o.name:[] for o in objects}

    try:

        for index,sources in enumerate(groups.values()):

            source=sources[0];sid='set_'+str(index);label='Texture commune'

            size=max(resolution, *[max(s['image'].size) if s['image'] else resolution for s in sources])

            pixels=array('f',[0])* (size*size*4)

            pixels = common_pixels(sources, size)

            image=bpy.data.images.new('Texture3D temporaire',width=size,height=size,alpha=True)

            try:

                image.pixels.foreach_set(pixels);image.update();image.filepath_raw=str(project/(sid+'.png'));image.file_format='PNG';image.save()

            finally: bpy.data.images.remove(image)

            material=bpy.data.materials.new('Texture3D_'+sid);temp_materials.append(material)

            material['texture3d_set']=sid

            material.use_nodes=True

            materials.shader_for(material).inputs['Base Color'].default_value=source['color']

            guides=bytearray(size*size*4)

            for s in sources:

                obj=s['object'];clone=obj.copy();clone.data=obj.data.copy();context.collection.objects.link(clone);copies.append(clone)

                bm=bmesh.new()

                try:

                    bm.from_mesh(clone.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index!=s['slot']],context='FACES');bm.to_mesh(clone.data)

                finally: bm.free()

                uv=clone.data.uv_layers[s['uv']]

                for other in list(clone.data.uv_layers):

                    if other.name!=s['uv']:clone.data.uv_layers.remove(other)

                uv=clone.data.uv_layers[s['uv']];uv.active_render=True;clone.data.uv_layers.active=uv

                guides=guide(clone.data,uv,project/(sid+'_UV.png'),size,guides)

                clone.data.materials.clear();clone.data.materials.append(material)

                for face in clone.data.polygons:face.material_index=0

                regions[obj.name].append({'slot':s['slot'],'uv':s['uv'],'scale':1,'x':0,'y':0,'material':label,'set_id':sid})

            sets.append({'id':sid,'name':label,'document':name+'_'+sid+'_'+project.name[-6:]+'.psd','texture':sid+'.png','uv':sid+'_UV.png','resolution':size})

        for obj in context.selected_objects:obj.select_set(False)

        for clone in copies:clone.select_set(True)

        context.view_layer.objects.active=copies[0]

        bpy.ops.export_scene.gltf(filepath=str(project/'Modele.glb'),export_format='GLB',use_selection=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_animations=False,export_skins=False,export_morph=False)

        if (project/'Modele.glb').stat().st_size>25*1024*1024:raise ValueError('La sélection dépasse 25 Mo.')

        first=sets[0]

        settings={'schema':3,'uv_layout':'original_shared','name':name,'model':'Modele.glb','document':first['document'],'texture':first['texture'],'uv':first['uv'],'resolution':first['resolution'],'texture_sets':sets,'material_regions':regions,'source_objects':[o.name for o in objects],'source_object':objects[0].name,'source_blend':bpy.data.filepath,'uv_map':regions[objects[0].name][0]['uv']}

        projects.save_settings(project,settings)

        targets=[(o,regions[o.name][0]['uv'],1,0,0) for o in objects]

        return project,settings,targets

    finally:

        for clone in copies:

            mesh=clone.data;bpy.data.objects.remove(clone,do_unlink=True);bpy.data.meshes.remove(mesh)

        for mat in temp_materials:bpy.data.materials.remove(mat)

        for obj in selected:obj.select_set(True)

        context.view_layer.objects.active=active



def apply(context,job):

    targets=projects.validate_return(context,job['projectID'])

    settings=projects.read_settings(projects.project_path(context))

    sid=job.get('setID')

    if sid not in {s['id'] for s in settings['texture_sets']}:raise ValueError('Matériau du transfert inconnu.')

    records={r['id']:r for r in projects.stored(context)['bindings']}

    affected=[]

    for obj,*_ in targets:

        regions=[r for r in records[obj[projects.OBJECT_KEY]]['materials'] if r.get('set_id')==sid]

        if regions:

            if obj.mode!='OBJECT':raise ValueError('Passe en mode Objet avant le retour.')

            for r in regions:materials.shader_for(obj.material_slots[r['slot']].material if r['slot']<len(obj.material_slots) else None)

            affected.append((obj,regions))

    owner=str(projects.project_path(context))+':'+sid

    previous=next((i for i in bpy.data.images if i.get(materials.OWNER)==owner),None)

    image=bpy.data.images.load(job['image'],check_existing=False);image.pack();image[materials.OWNER]=owner

    if previous:previous.user_remap(image);bpy.data.images.remove(previous)

    for obj,regions in affected:

        if obj.data.users>1:obj.data=obj.data.copy()

        for r in regions:materials.update_material(obj,r['slot'],image,r['uv'],owner+':'+obj[projects.OBJECT_KEY]+':'+str(r['slot']))

    image.update()
    for obj, _ in affected: obj.update_tag()
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.shading.type = 'MATERIAL'
                area.tag_redraw()
    return len(affected)


def common_pixels(sources, size):
    """Composite source colors inside their original UV faces; never repack."""
    import numpy as np
    result = np.full((size, size, 4), (0.8, 0.8, 0.8, 1), dtype=np.float32)
    for source in sources:
        tile = array('f', [0]) * (size * size * 4)
        materials.fill_tile(tile, size, size, 0, 0, source)
        colors = np.frombuffer(tile, dtype=np.float32).reshape(size, size, 4)
        mesh = source['object'].data
        mesh.calc_loop_triangles()
        uv = mesh.uv_layers[source['uv']]
        for tri in mesh.loop_triangles:
            if mesh.polygons[tri.polygon_index].material_index != source['slot']: continue
            a, b, c = [np.array(uv.data[i].uv, dtype=float) * size for i in tri.loops]
            lower = np.maximum(0, np.floor(np.minimum(np.minimum(a,b),c)).astype(int))
            upper = np.minimum(size, np.ceil(np.maximum(np.maximum(a,b),c)).astype(int))
            x0,y0 = lower; x1,y1 = upper
            if x1<=x0 or y1<=y0: continue
            denominator = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(denominator)<1e-10: continue
            x,y = np.meshgrid(np.arange(x0,x1)+.5,np.arange(y0,y1)+.5)
            u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denominator
            v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denominator
            mask=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1+1e-6)
            result[y0:y1,x0:x1][mask]=colors[y0:y1,x0:x1][mask]
    return array('f', result.ravel())

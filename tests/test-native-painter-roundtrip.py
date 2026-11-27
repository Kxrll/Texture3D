"""Run manually INSIDE an empty Painter. Creates only isolated temporary test data.

Exercises native export/Photoshop reception/resource return for three cycles.
Does not replace the separate Blender-origin/viewer/restart acceptance session.
"""
import json,sys,tempfile,subprocess,traceback
from pathlib import Path
import substance_painter as sp
import substance_painter.project
import substance_painter.export
import substance_painter.resource
import substance_painter.textureset
import substance_painter.layerstack
from PySide6.QtGui import QImage,QColor
root=Path(__file__).resolve().parent.parent
report=root/'.test-painter-roundtrip-native.json'

def run():
    if sp.project.is_open():raise RuntimeError('Test refusé : ferme toi-même tout projet Painter avant de commencer.')
    sys.path.insert(0,str(root/'painter_plugin'))
    from texture3d_painter import texture_export,uv_guide,resources,image_checks
    folder=Path(tempfile.mkdtemp(prefix='texture3d-roundtrip-native-'))
    mesh=folder/'test.obj'
    mesh.write_text('mtllib test.mtl\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl Body\nf 1/1 2/2 3/3 4/4\n')
    (folder/'test.mtl').write_text('newmtl Body\nKd 1 1 1\n')
    sp.project.create(str(mesh),settings=sp.project.Settings(default_texture_resolution=2048))
    spp=folder/'test.spp';sp.project.save_as(str(spp))
    stack=sp.textureset.get_active_stack();material=stack.material()
    if not stack.has_channel(sp.textureset.ChannelType.Emissive):
        stack.add_channel(sp.textureset.ChannelType.Emissive,sp.textureset.ChannelFormat.RGB16)
    # Artist setup in THIS TEST ONLY. Production exports never add channels/layers.
    layer=sp.layerstack.insert_fill(sp.layerstack.InsertPosition.from_textureset_stack(stack))
    layer.set_name('Test artistique isolé')
    guide_mesh=folder/'guide.obj'
    result=sp.export.export_mesh(str(guide_mesh),sp.export.MeshExportOption.BaseMesh)
    assert result.status==sp.export.ExportStatus.Success
    edges=uv_guide.read_edges(guide_mesh,None)
    uv_guide.write_images(edges,2048,2048,folder)
    checks=[]
    context=texture_export.context_id(sp)
    for cycle in range(3):
        for channel in ('BaseColor','Emissive','Roughness','Metallic'):
            if not stack.has_channel(getattr(sp.textureset.ChannelType,channel)):continue
            image=QImage(64,64,QImage.Format.Format_ARGB32)
            image.fill(QColor(40+cycle*60,80,160-cycle*30))
            seed=folder/(channel+'-'+str(cycle)+'.png');assert image.save(str(seed),'PNG')
            seed_resource=sp.resource.import_project_resource(str(seed),sp.resource.Usage.TEXTURE,name='Test_'+channel+'_'+str(cycle))
            layer.set_source(getattr(sp.textureset.ChannelType,channel),seed_resource.identifier())
            before=[node.uid() for node in sp.layerstack.get_root_layer_nodes(stack)]
            exported=texture_export.export_channel(sp,folder/'exports',context,material.name(),stack.name(),channel,16)
            image_checks.inspect_png(exported['file'],(2048,2048),16,exported['sha256'])
            psd=folder/('Native_'+channel+'.psd')
            payload=folder/'receive.json';payload.write_text(json.dumps({**exported,'document':psd.name,'psd':str(psd),'uv':str(folder/'Reperes_UV.png')}),encoding='utf-8')
            received=subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(root/'receive-painter-texture.ps1'),'-Payload',str(payload)],capture_output=True,timeout=120)
            if received.returncode:raise RuntimeError(received.stderr.decode('utf-8',errors='replace'))
            # Return a copy of the exported file. Photoshop editing/pixel fidelity is
            # covered by the interactive acceptance session, not asserted here.
            job={'image':exported['file'],'projectID':'native-'+channel,'textureSet':material.name(),'resourceName':'Texture3D_native_'+channel,'sha256':exported['sha256']}
            resources.import_paint(sp,job,str(spp),folder/(channel+'-binding.json'))
            assert [node.uid() for node in sp.layerstack.get_root_layer_nodes(stack)]==before
            checks.append({'cycle':cycle+1,'channel':channel,'sha256':exported['sha256'],'exportDurationMs':exported['exportDurationMs']})
    sp.project.save();sp.project.close();sp.project.open(str(spp));sp.project.close()
    return {'ok':True,'scope':'Native export, Photoshop reception and resource import components; not full viewer/Blender acceptance','folder':str(folder),'checks':checks,'interactiveAcceptanceRequired':True}

try:report.write_text(json.dumps(run(),ensure_ascii=False,indent=2),encoding='utf-8')
except Exception:report.write_text(json.dumps({'ok':False,'error':traceback.format_exc()},ensure_ascii=False,indent=2),encoding='utf-8')

"""Run inside an empty Painter instance through its documented scripting API.

Creates only a temporary test project. Does not save or close an existing project.
Writes .test-painter-native.json with the result for an external test runner.
"""
import json
from pathlib import Path
import sys
import tempfile
import traceback

import substance_painter as sp
import substance_painter.export
import substance_painter.layerstack
import substance_painter.project
import substance_painter.resource
import substance_painter.textureset
from PySide6.QtGui import QColor, QImage

root = Path(__file__).resolve().parent
result_file = root / '.test-painter-native.json'


def run():
    if sp.project.is_open():
        raise RuntimeError('Test refusé : un projet Painter est déjà ouvert.')
    sys.path.insert(0, str(root/'painter_plugin'))
    from texture3d_painter import uv_guide, resources, start_plugin, close_plugin
    directory = Path(tempfile.mkdtemp(prefix='texture3d-painter-native-'))
    mesh = directory/'test.obj'
    mesh.write_text('mtllib test.mtl\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl Body\nf 1/1 2/2 3/3 4/4\n')
    (directory/'test.mtl').write_text('newmtl Body\nKd 0.8 0.8 0.8\n')
    sp.project.create(str(mesh))
    project = directory/'test.spp'
    sp.project.save_as(str(project))
    material = sp.textureset.get_active_stack().material()
    exported = directory/'exported.obj'
    result = sp.export.export_mesh(str(exported), sp.export.MeshExportOption.BaseMesh)
    assert result.status == sp.export.ExportStatus.Success, result.message
    edges = uv_guide.read_edges(exported, material.name(), True)
    assert edges
    uv_guide.write_images(edges, 64, 64, directory)
    assert QImage(str(directory/'Peinture.png')).pixelColor(32,32).alpha() == 0
    start_plugin()
    close_plugin()
    image = QImage(64,64,QImage.Format.Format_ARGB32)
    image.fill(QColor(255,0,0,128))
    paint = directory/'paint.png'
    assert image.save(str(paint),'PNG')
    job = {'image':str(paint),'textureSet':material.name(),'resourceName':'Texture3D_native_test'}
    assert resources.import_paint(sp,job,str(project)) is False
    identifier = sp.resource.ResourceID.from_project(name=job['resourceName'])
    resource = sp.resource.Resource.retrieve(identifier)[0]
    fill = sp.layerstack.insert_fill(sp.layerstack.InsertPosition.from_textureset_stack(sp.textureset.get_active_stack()))
    fill.set_source(sp.textureset.ChannelType.BaseColor,resource.identifier())
    old = [r for r in sp.resource.list_project_resources() if r.name==job['resourceName']]
    assert old
    image.fill(QColor(0,0,255,128));assert image.save(str(paint),'PNG')
    assert resources.import_paint(sp,job,str(project)) is True
    new = [r for r in sp.resource.list_project_resources() if r.name==job['resourceName']]
    assert new and new[0] != old[0], 'Layer must reference the new resource version'
    try:
        resources.import_paint(sp,job,str(directory/'wrong.spp'))
        raise AssertionError('Wrong project accepted')
    except ValueError:
        pass
    sp.project.close()  # Only the temporary project created above.
    return {'ok':True,'directory':str(directory),'material':material.name() if sp.project.is_open() else 'Body',
            'checks':['Painter mesh export and UV parsing','transparent image and UV guide','plugin UI lifecycle',
                      'Texture resource import','existing layer updated on second import','wrong project rejected']}


try:
    result_file.write_text(json.dumps(run(),ensure_ascii=False,indent=2),encoding='utf-8')
except Exception:
    result_file.write_text(json.dumps({'ok':False,'error':traceback.format_exc()},ensure_ascii=False,indent=2),encoding='utf-8')

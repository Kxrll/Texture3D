"""Prepare an isolated full-model roundtrip fixture inside an empty Painter."""
import json
import tempfile
from pathlib import Path
import sys
import substance_painter as sp
import substance_painter.project
import substance_painter.textureset
import substance_painter_plugins

root = Path(__file__).resolve().parent
if sp.project.is_open():
    raise RuntimeError('Test refusé : projet Painter déjà ouvert.')
folder = Path(tempfile.mkdtemp(prefix='texture3d-live-'))
mesh = folder/'test.obj'
mesh.write_text('mtllib test.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nv 2 0 0\nv 3 0 0\nv 2 1 0\nvt 0 0\nvt 0.4 0\nvt 0 0.4\nvt 0.6 0.6\nvt 1 0.6\nvt 0.6 1\nusemtl Body\nf 1/1 2/2 3/3\nusemtl Hat\nf 4/4 5/5 6/6\n')
(folder/'test.mtl').write_text('newmtl Body\nKd 1 1 1\nnewmtl Hat\nKd 1 1 1\n')
sp.project.create(str(mesh))
sp.project.save_as(str(folder/'test.spp'))
for material in sp.textureset.all_texture_sets():
    material.set_resolution(sp.textureset.Resolution(256,256))
sys.path.insert(0,str(root/'painter_plugin'))
import texture3d_painter
texture3d_painter = substance_painter_plugins.reload_plugin(texture3d_painter)
texture3d_painter._panel.prepare()
bindings = texture3d_painter._panel.bindings
if len(bindings) != 1:
    raise AssertionError('Le document commun n’a pas été préparé : '+texture3d_painter._panel.status.text())
identity, metadata = next(iter(bindings.items()))
(root/'.test-live-painter.json').write_text(json.dumps({'project':str(folder/'test.spp'),'projectID':identity,
    'folder':str(root.parent/'Projets Texture3D'/('Painter_'+identity)),'metadata':metadata},ensure_ascii=False,indent=2),encoding='utf-8')

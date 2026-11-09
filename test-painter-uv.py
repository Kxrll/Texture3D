"""Pure UV parsing plus real Qt raster output; no running Painter required."""
import importlib.util
import tempfile
import os
import sys
from pathlib import Path
import unittest
import json
import struct

if sys.platform == 'win32' and (Path(sys.executable).parents[2]/'Qt6Gui.dll').exists():
    _dll_directory = os.add_dll_directory(str(Path(sys.executable).parents[2]))

root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('uv_guide', root / 'painter_plugin/texture3d_painter/uv_guide.py')
uv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uv)
spec_preview = importlib.util.spec_from_file_location('preview', root / 'painter_plugin/texture3d_painter/preview.py')
preview = importlib.util.module_from_spec(spec_preview)
spec_preview.loader.exec_module(preview)


class UVTests(unittest.TestCase):
    def test_viewer_glb_geometry_and_uv(self):
        with tempfile.TemporaryDirectory() as directory:
            mesh=Path(directory)/'mesh.obj'
            mesh.write_text('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl Body\nf 1/1 2/2 3/3\nusemtl Other\nf 1/1 3/3 2/2\n')
            glb=bytes(preview.from_obj(mesh,'Body'))
            self.assertEqual(struct.unpack('<4sII',glb[:12]),(b'glTF',2,len(glb)))
            length=struct.unpack('<I',glb[12:16])[0]
            document=json.loads(glb[20:20+length])
            self.assertEqual(document['accessors'][0]['count'],3)
            self.assertEqual(document['accessors'][2]['count'],3)
            all_glb=bytes(preview.from_obj(mesh,None))
            all_length=struct.unpack('<I',all_glb[12:16])[0]
            all_document=json.loads(all_glb[20:20+all_length])
            self.assertEqual(all_document['accessors'][2]['count'],6, 'Both materials must be in the common model')
            binary=glb[28+length:]
            self.assertEqual(struct.unpack('<6f',binary[36:60]),(0,0,1,0,0,1))
            with self.assertRaises(ValueError): preview.from_obj(mesh,'Missing')
    def test_material_negative_indices_and_images(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            mesh = folder/'mesh.obj'
            mesh.write_text('vt 0 0\nvt 1 0\nvt 0 1\nvt 1 1\nusemtl Peau\nf 1/1 2/2 3/3\nusemtl Vetement\nf 2/-3 4/-1 3/-2\n')
            first = uv.read_edges(mesh, 'Peau')
            second = uv.read_edges(mesh, 'Vetement')
            self.assertEqual(len(first), 3)
            self.assertNotEqual(first, second)
            self.assertEqual(set(uv.read_edges(mesh,None)), set(first)|set(second))
            with self.assertRaises(ValueError): uv.read_edges(mesh, 'Inconnu')
            uv.write_images(first, 64, 32, folder)
            from PySide6.QtGui import QImage
            guide = QImage(str(folder/'Reperes_UV.png'))
            paint = QImage(str(folder/'Peinture.png'))
            self.assertEqual((guide.width(),guide.height()), (64,32))
            self.assertGreater(guide.pixelColor(0,31).alpha(), 0)  # V=0 is the bottom.
            self.assertEqual(guide.pixelColor(60,2).alpha(), 0)  # Other material excluded.
            self.assertTrue(all(paint.pixelColor(x,y).alpha()==0 for x in range(64) for y in range(32)))

    def test_missing_outside_and_nonfinite_uv(self):
        with tempfile.TemporaryDirectory() as directory:
            mesh=Path(directory)/'mesh.obj'
            for coordinates, face in [('vt 0 0\nvt 2 0\nvt 0 1','1/1 2/2 3/3'),
                                      ('vt 0 0\nvt nan 0\nvt 0 1','1/1 2/2 3/3'),
                                      ('vt 0 0','1 2 3'), ('vt 0 0','1/0 2/0 3/0')]:
                mesh.write_text(coordinates+'\nusemtl Body\nf '+face+'\n')
                with self.assertRaises(ValueError): uv.read_edges(mesh,'Body')


if __name__=='__main__': unittest.main()

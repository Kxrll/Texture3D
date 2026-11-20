"""Load the Texture3D receiver when Painter starts (user startup directory)."""
import sys
from pathlib import Path


def start_plugin():
    directory = str(Path(__file__).resolve().parent.parent / 'plugins')
    if directory not in sys.path:
        sys.path.insert(0, directory)
    import texture3d_painter
    texture3d_painter.start_plugin()


def close_plugin():
    module = sys.modules.get('texture3d_painter')
    if module:
        module.close_plugin()

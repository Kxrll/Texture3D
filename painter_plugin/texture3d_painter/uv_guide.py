"""Read original UV edges from Painter's OBJ export, without repacking."""
import hashlib
import math
from pathlib import Path


def read_edges(filename, material_name, single_material=False):
    coordinates, faces, materials = [], [], set()
    material = None
    for raw in Path(filename).read_text(encoding='utf-8-sig', errors='strict').splitlines():
        line = raw.split('#', 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        if parts[0] == 'vt':
            coordinates.append(tuple(float(v) for v in parts[1:3]))
        elif parts[0] == 'usemtl':
            material = line[7:].strip()
        elif parts[0] == 'f':
            materials.add(material)
            indices = []
            for corner in parts[1:]:
                fields = corner.split('/')
                index = int(fields[1]) if len(fields) > 1 and fields[1] else 0
                resolved = index - 1 if index > 0 else len(coordinates) + index if index < 0 else -1
                indices.append(resolved if index and 0 <= resolved < len(coordinates) else None)
            faces.append((material, indices))
    selected = material_name
    if selected is not None and selected not in materials:
        if single_material and len(materials) == 1:
            selected = next(iter(materials))
        else:
            raise ValueError('Matériau absent de l’export OBJ : ' + material_name + '. Matériaux exportés : ' + ', '.join(str(m) for m in materials))
    edges = set()
    for name, indices in faces:
        if selected is not None and name != selected:
            continue
        if len(indices) < 3 or any(i is None for i in indices):
            raise ValueError('Des faces du matériau n’ont pas de coordonnées UV valides.')
        points = [coordinates[i] for i in indices]
        if any(len(p) != 2 or any(not math.isfinite(v) or v < -1e-5 or v > 1.00001 for v in p) for p in points):
            raise ValueError('Ce prototype accepte uniquement les UV dans le carré 0–1, sans UDIM.')
        for a, b in zip(points, points[1:] + points[:1]):
            edges.add(tuple(sorted((tuple(max(0., min(1., v)) for v in a), tuple(max(0., min(1., v)) for v in b)))))
    if not edges:
        raise ValueError('Aucun contour UV trouvé pour ce matériau.')
    return sorted(edges)


def signature(edges, width, height):
    return hashlib.sha256(repr((width, height, edges)).encode('utf-8')).hexdigest()


def write_images(edges, width, height, folder):
    from PySide6.QtCore import QPointF, Qt
    from PySide6.QtGui import QColor, QImage, QPainter, QPen
    folder = Path(folder)
    image = QImage(width, height, QImage.Format.Format_ARGB32)
    image.fill(Qt.GlobalColor.transparent)
    if not image.save(str(folder / 'Peinture.png'), 'PNG'):
        raise RuntimeError('Impossible de créer la texture transparente.')
    painter = QPainter(image)
    try:
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(QPen(QColor('#101010'), max(1.5, min(5.0, max(width, height) / 1024))))
        for a, b in edges:
            painter.drawLine(QPointF(a[0] * (width-1), (1-a[1]) * (height-1)),
                             QPointF(b[0] * (width-1), (1-b[1]) * (height-1)))
    finally:
        painter.end()
    if not image.save(str(folder / 'Reperes_UV.png'), 'PNG'):
        raise RuntimeError('Impossible de créer le guide UV.')

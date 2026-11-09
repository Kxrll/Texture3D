"""Texture3D Painter plugin. All Painter/Qt calls run on the UI thread."""
import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid

from PySide6 import QtCore, QtWidgets
import substance_painter as sp
import substance_painter.export
import substance_painter.project
import substance_painter.resource
import substance_painter.textureset
import substance_painter.ui
from . import uv_guide, resources, preview

_panel = None
_dock = None


def tool_directory():
    location = Path(__file__).with_name('tool-location.json')
    root = Path(json.loads(location.read_text(encoding='utf-8-sig'))['directory']) if location.exists() else Path(__file__).resolve().parents[2]
    if not (root / 'painter-bridge.cjs').is_file():
        raise ValueError('Dossier Texture3D introuvable. Réinstalle le plugin Painter depuis les sources.')
    return root


def request(config, route, body):
    req = urllib.request.Request('http://127.0.0.1:' + str(config['port']) + route,
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'X-Texture3D-Key': config['token']})
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            message = json.loads(error.read()).get('error', str(error))
        except Exception:
            message = str(error)
        raise RuntimeError(message) from error


def ensure_service(root):
    config_path = root / 'companion-config.json'
    node = root / 'runtime' / 'node.exe'
    node = str(node) if node.is_file() else shutil.which('node')
    if not node:
        raise ValueError('Node.js est introuvable. Installe Node.js ou utilise le moteur de la version portable.')
    if not config_path.exists():
        subprocess.run([node, str(root / 'init-config.cjs')], cwd=str(root), check=True,
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    config = json.loads(config_path.read_text(encoding='utf-8-sig'))
    try:
        request(config, '/painter/bridge', {'session': 'startup-check'})
        return config
    except urllib.error.URLError:
        pass
    except RuntimeError as error:
        raise RuntimeError('Un autre service Texture3D utilise déjà ce port. Ferme l’ancienne version du service puis réessaie depuis ce dossier source. Détail : ' + str(error)) from error
    log = open(root / 'companion-painter.log', 'ab')
    try:
        subprocess.Popen([node, str(root / 'companion.cjs')], cwd=str(root), stdout=log, stderr=log,
                         creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    finally:
        log.close()
    for _ in range(40):
        try:
            request(config, '/painter/bridge', {'session': 'startup-check'})
            return config
        except urllib.error.URLError:
            time.sleep(.1)
    raise RuntimeError('Le service Texture3D ne démarre pas. Consulte companion-painter.log.')


class Panel(QtWidgets.QWidget):
    def __init__(self):
        super().__init__()
        self.setObjectName('Texture3DPainter')
        self.setWindowTitle('Texture3D — Photoshop')
        self.session = uuid.uuid4().hex
        self.bindings = {}
        self.done = set()
        self.acks = []
        self.events = queue.Queue()
        self.running = False
        self.stopped = threading.Event()
        self.config = None
        self.root = None
        self.watch_document = None
        self.watch_stamp = None
        self.restore_for = None
        self.restoring = False
        layout = QtWidgets.QVBoxLayout(self)
        explanation = QtWidgets.QLabel('Envoie tous les objets et leurs guides UV dans un document Photoshop commun, puis importe ta peinture comme Texture dans ce projet.')
        explanation.setWordWrap(True)
        layout.addWidget(explanation)
        self.open_button = QtWidgets.QPushButton('Peindre dans Photoshop')
        self.open_button.clicked.connect(self.prepare)
        layout.addWidget(self.open_button)
        self.status = QtWidgets.QLabel('Modèle complet et tous les matériaux. UV 0–1, sans UDIM.')
        self.status.setWordWrap(True)
        self.status.setTextInteractionFlags(QtCore.Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(self.status)
        layout.addStretch()
        self.timer = QtCore.QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.timer.start(300)

    def prepare(self):
        self.open_button.setEnabled(False)
        try:
            self.root = tool_directory()
            project = sp.project.file_path() if sp.project.is_open() else None
            if not project:
                raise ValueError('Ouvre et enregistre d’abord ton projet Painter (.spp).')
            materials = sp.textureset.all_texture_sets()
            if not materials:
                raise ValueError('Le projet ne contient aucun matériau à peindre.')
            if any(material.has_uv_tiles() for material in materials):
                raise ValueError('Ce prototype ne gère pas encore les projets UDIM.')
            width = max(material.get_resolution().width for material in materials)
            height = max(material.get_resolution().height for material in materials)
            material_names = sorted(material.name() for material in materials)
            if min(width, height) < 1 or max(width, height) > 8192:
                raise ValueError('Résolution prise en charge : jusqu’à 8192 pixels par côté.')
            self.status.setText('Préparation des contours UV…')
            with tempfile.TemporaryDirectory(prefix='texture3d-uv-') as temporary:
                mesh = Path(temporary) / 'Modele.obj'
                result = sp.export.export_mesh(str(mesh), sp.export.MeshExportOption.BaseMesh)
                if result.status != sp.export.ExportStatus.Success:
                    raise RuntimeError('Export du maillage impossible : ' + result.message)
                edges = uv_guide.read_edges(mesh, None)
                if not sp.export.scene_is_triangulated():
                    mesh = Path(temporary) / 'Apercu.obj'
                    result = sp.export.export_mesh(str(mesh), sp.export.MeshExportOption.TriangulatedMesh)
                    if result.status != sp.export.ExportStatus.Success:
                        raise RuntimeError('Export du viewer impossible : ' + result.message)
                model_bytes = preview.from_obj(mesh, None)
            identity = hashlib.sha256((str(Path(project).resolve()) + '\0common\0' + '\0'.join(material_names) + '\0' + uv_guide.signature(edges, width, height)).encode('utf-8')).hexdigest()[:32]
            folder = self.root.parent / 'Projets Texture3D' / ('Painter_' + identity)
            folder.mkdir(parents=True, exist_ok=True)
            document = 'Painter_' + identity + '.psd'
            uv_guide.write_images(edges, width, height, folder)
            (folder / 'Modele.glb').write_bytes(bytes(model_bytes))
            metadata = {'source': 'painter', 'document': document, 'texture': 'Peinture.png', 'uv': 'Reperes_UV.png',
                        'project_id': identity, 'painter_project': str(Path(project).resolve()),
                        'texture_set': 'Texture commune', 'texture_sets': material_names, 'width': width, 'height': height}
            (folder / 'texture3d-project.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
            self.bindings[identity] = metadata
            self.watch_document = folder / document
            self.restore_for = str(Path(project).resolve())
            payload = {'session': self.session, 'projectID': identity, 'documentName': document,
                       'textureSet': 'Texture commune', 'textureSets': material_names, 'width': width, 'height': height,
                       'bytes': model_bytes, 'name': Path(project).stem + '.glb'}
            self.status.setText('Ouverture de Photoshop…')
            threading.Thread(target=self.open_photoshop, args=(folder, payload), daemon=True).start()
        except Exception as error:
            self.status.setText(str(error))
            self.open_button.setEnabled(True)

    def open_photoshop(self, folder, payload):
        try:
            config = ensure_service(self.root)
            # Registration is done after opening, so a missing PSD is not acknowledged prematurely.
            completed = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                '-File', str(self.root / 'open-photoshop-project.ps1'), '-ProjectDirectory', str(folder),
                '-ToolDirectory', str(self.root)], capture_output=True, timeout=120,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if completed.returncode:
                raise RuntimeError(completed.stderr.decode('utf-8', errors='replace').strip() or 'Impossible d’ouvrir Photoshop.')
            if self.stopped.is_set():
                return
            request(config, '/painter/start', payload)
            self.events.put(('opened', config))
        except Exception as error:
            self.events.put(('error', str(error)))

    def poll(self, acknowledged):
        try:
            result = request(self.config, '/painter/bridge', {'session': self.session, 'ack': acknowledged})
            # Some Photoshop saves (notably scripted saves) do not emit a UXP
            # notification. Watching only the associated PSD provides a fallback.
            if self.watch_document and self.watch_document.is_file():
                stat = self.watch_document.stat()
                stamp = (stat.st_mtime_ns, stat.st_size)
                if self.watch_stamp is not None and stamp != self.watch_stamp:
                    request(self.config, '/painter/command', {'type': 'link', 'documentName': self.watch_document.name})
                    request(self.config, '/painter/command', {'type': 'refresh'})
                self.watch_stamp = stamp
            self.events.put(('poll', (result, acknowledged)))
        except Exception as error:
            self.events.put(('poll-error', str(error)))

    def restore(self, project):
        """Restore a saved association, without reopening Photoshop or its viewer."""
        try:
            root = tool_directory()
            candidates = []
            directory = root.parent / 'Projets Texture3D'
            for metadata_file in directory.glob('Painter_*/texture3d-project.json'):
                try:
                    data = json.loads(metadata_file.read_text(encoding='utf-8-sig'))
                    if Path(data.get('painter_project', '')).resolve() == Path(project).resolve():
                        candidates.append((metadata_file.stat().st_mtime_ns, metadata_file.parent, data))
                except (OSError, ValueError, KeyError):
                    continue
            if not candidates:
                self.events.put(('restore-empty', None))
                return
            _, folder, data = max(candidates, key=lambda item: item[0])
            config = ensure_service(root)
            payload = {'session': self.session, 'projectID': data['project_id'], 'documentName': data['document'],
                       'textureSet': data['texture_set'], 'textureSets': data.get('texture_sets') or [data['texture_set']],
                       'width': data['width'], 'height': data['height'], 'resume': True}
            model = folder / 'Modele.glb'
            if model.is_file():
                payload.update(bytes=list(model.read_bytes()), name=Path(project).stem+'.glb')
            for attempt in range(6):
                try:
                    request(config, '/painter/start', payload)
                    break
                except RuntimeError as error:
                    if 'autre fenêtre Painter' not in str(error) or attempt == 5:
                        raise
                    if self.stopped.wait(2): return
            self.events.put(('restored', (root, config, folder, data)))
        except Exception as error:
            self.events.put(('restore-error', str(error)))

    def tick(self):
        while not self.events.empty():
            kind, value = self.events.get_nowait()
            if kind == 'opened':
                self.config = value
                self.open_button.setEnabled(True)
                if self.watch_document and self.watch_document.is_file():
                    stat = self.watch_document.stat()
                    self.watch_stamp = (stat.st_mtime_ns, stat.st_size)
                self.status.setText('Prêt. Dans Photoshop : Plugins → Texture3D → Envoyer la peinture dans Painter.')
            elif kind == 'restored':
                self.restoring = False
                self.root, self.config, folder, metadata = value
                self.bindings[metadata['project_id']] = metadata
                self.watch_document = folder / metadata['document']
                if self.watch_document.is_file():
                    stat = self.watch_document.stat()
                    self.watch_stamp = (stat.st_mtime_ns, stat.st_size)
                self.status.setText('Projet reconnecté. Photoshop peut envoyer la peinture dans Painter.')
            elif kind in {'restore-empty', 'restore-error'}:
                self.restoring = False
                if kind == 'restore-error': self.status.setText(value)
            elif kind == 'error':
                self.open_button.setEnabled(True)
                self.status.setText(value)
            elif kind == 'poll-error':
                self.running = False
                self.status.setText('Connexion interrompue : ' + value)
            elif kind == 'poll':
                self.running = False
                result, acknowledged = value
                if result.get('needsRegistration'):
                    self.config = None
                    self.restore_for = None
                self.acks = [a for a in self.acks if a not in acknowledged]
                for job in result.get('jobs', []):
                    if job['id'] in self.done:
                        continue
                    ack = {'id': job['id'], 'projectID': job['projectID']}
                    try:
                        metadata = self.bindings.get(job['projectID'])
                        if not metadata or metadata['texture_set'] != job['textureSet']:
                            raise ValueError('Liaison inconnue. Reprends le matériau depuis ce panneau.')
                        image = Path(job['image']).resolve()
                        if image.parent != (self.root / 'cache-textures').resolve() or image.suffix != '.png':
                            raise ValueError('Chemin de texture inattendu.')
                        # Older companion versions only send the display label.
                        # The local association owns the actual material list.
                        job = {**job, 'textureSets': metadata.get('texture_sets') or [metadata['texture_set']]}
                        ack['updated'] = resources.import_paint(sp, job, metadata['painter_project'])
                        self.status.setText('Peinture actualisée dans Painter.' if ack['updated'] else 'Peinture importée comme Texture. Tu peux l’utiliser dans tes calques.')
                    except Exception as error:
                        ack['error'] = str(error)
                        self.status.setText(str(error))
                    self.done.add(job['id'])
                    self.acks.append(ack)
        if not self.restoring and self.open_button.isEnabled() and not self.stopped.is_set():
            project = sp.project.file_path() if sp.project.is_open() else None
            if project and str(Path(project).resolve()) != self.restore_for:
                self.restore_for = str(Path(project).resolve())
                self.restoring = True
                threading.Thread(target=self.restore, args=(project,), daemon=True).start()
        if self.config and not self.running and not self.stopped.is_set():
            self.running = True
            threading.Thread(target=self.poll, args=(list(self.acks),), daemon=True).start()

    def shutdown(self):
        self.stopped.set()
        self.timer.stop()


def start_plugin():
    global _panel, _dock
    if _panel is None:
        _panel = Panel()
        _dock = sp.ui.add_dock_widget(_panel)


def close_plugin():
    global _panel, _dock
    if _panel is not None:
        _panel.shutdown()
        sp.ui.delete_ui_element(_dock)
        _panel = _dock = None


def reload_plugin():
    """Painter keeps package helpers cached when reloading only __init__."""
    import importlib
    for module in (uv_guide, resources, preview):
        importlib.reload(module)

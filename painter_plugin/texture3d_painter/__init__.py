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

from PySide6 import QtCore, QtWidgets, QtGui
import substance_painter as sp
import substance_painter.layerstack
import substance_painter.export
import substance_painter.project
import substance_painter.resource
import substance_painter.textureset
import substance_painter.ui
from . import uv_guide, resources, preview, associations, texture_export, image_checks, managed_layer

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


def current_mesh_signature():
    with tempfile.TemporaryDirectory(prefix='texture3d-identity-') as temporary:
        mesh=Path(temporary)/'mesh.obj'
        result=sp.export.export_mesh(str(mesh),sp.export.MeshExportOption.BaseMesh)
        if result.status!=sp.export.ExportStatus.Success: raise RuntimeError('Impossible de vérifier le maillage Painter.')
        return associations.mesh_signature(mesh)


def validate_association(metadata):
    """Recheck live UVs/resolution on the UI thread before trusting persisted bindings."""
    project = sp.project.file_path() if sp.project.is_open() else None
    if not project or Path(project).resolve() != Path(metadata['painter_project']).resolve():
        raise ValueError('Le projet Painter a changé. Reprends la liaison depuis ce projet.')
    if metadata.get('painter_uuid') and str(sp.project.get_uuid())!=metadata['painter_uuid']:
        raise ValueError('L’UUID du projet Painter ne correspond pas à la liaison enregistrée.')
    materials = sp.textureset.all_texture_sets()
    if not materials or any(material.has_uv_tiles() for material in materials):
        raise ValueError('Association incompatible : matériaux absents ou UV en tuiles.')
    original_name = metadata.get('source_material')
    if original_name is not None:
        materials = [m for m in materials if associations.original_name(m) == original_name]
        if len(materials) != 1:
            raise ValueError('Texture Set associé introuvable ou ambigu.')
    channel = metadata.get('channel', 'BaseColor')
    if original_name is not None and not materials[0].get_stack(metadata.get('stack','')).has_channel(getattr(sp.textureset.ChannelType, channel)):
        raise ValueError('Le canal associé a été supprimé. Aucune modification du projet.')
    names = sorted(material.name() for material in materials)
    width = max(material.get_resolution().width for material in materials)
    height = max(material.get_resolution().height for material in materials)
    with tempfile.TemporaryDirectory(prefix='texture3d-check-') as temporary:
        mesh = Path(temporary) / 'Modele.obj'
        result = sp.export.export_mesh(str(mesh), sp.export.MeshExportOption.BaseMesh)
        if result.status != sp.export.ExportStatus.Success:
            raise RuntimeError('Impossible de vérifier les UV du projet avant synchronisation.')
        edges = uv_guide.read_edges(mesh, original_name)
        if metadata.get('mesh_signature') and associations.mesh_signature(mesh)!=metadata['mesh_signature']:
            raise ValueError('La géométrie ou la topologie a changé depuis la liaison. Reprends explicitement le projet.')
    identity = associations.identity(project, names, uv_guide.signature(edges, width, height), original_name, metadata.get('channel', 'BaseColor'),metadata.get('stack',''))
    if identity != metadata['project_id']:
        raise ValueError('Les UV, matériaux ou dimensions ont changé. Reprends Peindre dans Photoshop pour créer une nouvelle association ; le PSD existant reste intact.')


class Panel(QtWidgets.QWidget):
    def __init__(self):
        super().__init__()
        self.setObjectName('Texture3DPainter')
        self.setWindowTitle('Texture3D — Photoshop')
        self.session = uuid.uuid4().hex
        self.bindings = {}
        self.done = set()
        self.done_order = []
        self.acks = []
        self.events = queue.Queue()
        self.running = False
        self.stopped = threading.Event()
        self.config = None
        self.root = None
        self.catalogue = None
        self.handoff_running = False
        self.handoff_seen = set()
        self.handoff_ack = None
        self.watch_documents = {}
        self.watch_document = None
        self.watch_stamp = None
        self.restore_for = None
        self.restoring = False
        layout = QtWidgets.QVBoxLayout(self)
        explanation = QtWidgets.QLabel('Envoie tous les objets et leurs guides UV dans un document Photoshop commun, puis importe ta peinture comme Texture dans ce projet.')
        explanation.setWordWrap(True)
        layout.addWidget(explanation)
        self.set_choice = QtWidgets.QComboBox()
        self.set_choice.addItem('Document commun — tous les Texture Sets', None)
        layout.addWidget(self.set_choice)
        self.channel_choice = QtWidgets.QComboBox()
        for key, label in [('BaseColor', 'Base Color'), ('Emissive', 'Emissive'), ('Roughness', 'Roughness'), ('Metallic', 'Metallic')]:
            self.channel_choice.addItem(label, key)
        layout.addWidget(self.channel_choice)
        refresh_sets = QtWidgets.QPushButton('Actualiser les Texture Sets')
        refresh_sets.clicked.connect(self.refresh_sets)
        layout.addWidget(refresh_sets)
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

    def refresh_sets(self):
        selected = self.set_choice.currentData()
        self.set_choice.clear()
        self.set_choice.addItem('Document commun — tous les Texture Sets', None)
        if sp.project.is_open():
            for material in sp.textureset.all_texture_sets():
                resolution = material.get_resolution()
                self.set_choice.addItem(f'{material.name()} — {resolution.width} × {resolution.height}', associations.original_name(material))
        index = self.set_choice.findData(selected)
        if index >= 0: self.set_choice.setCurrentIndex(index)

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
            original_name = self.set_choice.currentData()
            chosen = next((m for m in materials if associations.original_name(m) == original_name), None) if original_name is not None else None
            if original_name is not None and chosen is None:
                raise ValueError('Ce Texture Set est introuvable. Actualise la liste.')
            channel = self.channel_choice.currentData()
            if channel != 'BaseColor' and chosen is None:
                raise ValueError('Choisis un Texture Set pour travailler sur Roughness ou Metallic.')
            if chosen and not chosen.get_stack().has_channel(getattr(sp.textureset.ChannelType, channel)):
                raise ValueError('Ce canal est absent du Texture Set. Texture3D ne l’ajoute pas automatiquement.')
            selected_materials = [chosen] if chosen else materials
            width = max(material.get_resolution().width for material in selected_materials)
            height = max(material.get_resolution().height for material in selected_materials)
            material_names = sorted(material.name() for material in selected_materials)
            if min(width, height) < 1 or max(width, height) > 8192:
                raise ValueError('Résolution prise en charge : jusqu’à 8192 pixels par côté.')
            self.status.setText('Préparation des contours UV…')
            with tempfile.TemporaryDirectory(prefix='texture3d-uv-') as temporary:
                mesh = Path(temporary) / 'Modele.obj'
                result = sp.export.export_mesh(str(mesh), sp.export.MeshExportOption.BaseMesh)
                if result.status != sp.export.ExportStatus.Success:
                    raise RuntimeError('Export du maillage impossible : ' + result.message)
                mesh_fingerprint = associations.mesh_signature(mesh)
                all_edges = uv_guide.read_edges(mesh, None)
                edges = uv_guide.read_edges(mesh, associations.original_name(chosen)) if chosen else all_edges
                scene_id = associations.identity(project, [associations.original_name(m) for m in materials], uv_guide.signature(all_edges, max(m.get_resolution().width for m in materials), max(m.get_resolution().height for m in materials)))
                mapping = {associations.original_name(m): associations.set_id(project, associations.original_name(m)) for m in materials} if chosen else None
                if not sp.export.scene_is_triangulated():
                    mesh = Path(temporary) / 'Apercu.obj'
                    result = sp.export.export_mesh(str(mesh), sp.export.MeshExportOption.TriangulatedMesh)
                    if result.status != sp.export.ExportStatus.Success:
                        raise RuntimeError('Export du viewer impossible : ' + result.message)
                model_bytes = preview.from_obj(mesh, None, texture_sets=mapping)
            identity = associations.identity(project, material_names, uv_guide.signature(edges, width, height), original_name, channel)
            set_label = chosen.name() if chosen else 'Texture commune'
            set_id = associations.set_id(project, original_name) if chosen else None
            scene_id = scene_id + ('-sets' if chosen else '-common')
            folder = self.root.parent / 'Projets Texture3D' / ('Painter_' + identity)
            folder.mkdir(parents=True, exist_ok=True)
            document = 'Painter_' + identity + '.psd'
            uv_guide.write_images(edges, width, height, folder)
            (folder / 'Modele.glb').write_bytes(bytes(model_bytes))
            metadata = {'source': 'painter', 'document': document, 'texture': 'Peinture.png', 'uv': 'Reperes_UV.png',
                        'project_id': identity, 'painter_project': str(Path(project).resolve()), 'painter_uuid':str(sp.project.get_uuid()),
                        'texture_set': set_label, 'texture_sets': material_names, 'width': width, 'height': height,
                        'mesh_signature':mesh_fingerprint,'source_material': original_name, 'set_id': set_id, 'scene_id': scene_id, 'channel': channel}
            (folder / 'texture3d-project.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
            self.bindings[identity] = metadata
            self.watch_document = folder / document
            self.watch_documents[self.watch_document] = None
            self.restore_for = str(Path(project).resolve())
            payload = {'session': self.session, 'projectID': identity, 'documentName': document,
                       'textureSet': set_label, 'textureSets': material_names, 'width': width, 'height': height,
                       'setID': set_id, 'sceneID': scene_id, 'channel': channel, 'painterProject':str(Path(project).resolve()),
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
            for document, previous in list(self.watch_documents.items()):
                if not document.is_file(): continue
                stat = document.stat()
                stamp = (stat.st_mtime_ns, stat.st_size)
                if previous is not None and stamp != previous:
                    request(self.config, '/painter/command', {'type': 'link', 'documentName': document.name})
                    request(self.config, '/painter/command', {'type': 'refresh', 'reason': 'saved-document'})
                self.watch_documents[document] = stamp
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
            config = ensure_service(root)
            for _, folder, data in sorted(candidates,key=lambda item:item[0]):
                payload = {'session': self.session, 'projectID': data['project_id'], 'documentName': data['document'],
                           'textureSet': data['texture_set'], 'textureSets': data.get('texture_sets') or [data['texture_set']],
                           'width': data['width'], 'height': data['height'], 'resume': True,
                           'setID': data.get('set_id'), 'sceneID': data.get('scene_id'), 'channel': data.get('channel', 'BaseColor'), 'painterProject':data['painter_project']}
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

    def poll_handoff(self):
        try:
            root = tool_directory()
            config_path = root / 'companion-config.json'
            if not config_path.is_file(): return
            config = json.loads(config_path.read_text(encoding='utf-8-sig'))
            result = request(config, '/painter/blender-handoff', {'session':self.session,'ack': self.handoff_ack, 'catalogue': self.catalogue})
            self.handoff_ack = None
            if result.get('job'): self.events.put(('handoff', (root, result['job'])))
        except Exception:
            pass
        finally:
            self.handoff_running = False

    def tick(self):
        try:
            self.catalogue = {'uuid':str(sp.project.get_uuid()),'context':texture_export.context_id(sp),'project':str(Path(sp.project.file_path()).resolve()) if sp.project.file_path() else None} if sp.project.is_open() else None
        except Exception:
            self.catalogue = None
        if not self.handoff_running and not self.stopped.is_set():
            self.handoff_running = True
            threading.Thread(target=self.poll_handoff, daemon=True).start()
        while not self.events.empty():
            kind, value = self.events.get_nowait()
            if kind == 'handoff':
                root, job = value
                if job['id'] in self.handoff_seen: continue
                self.handoff_seen.add(job['id'])
                if len(self.handoff_seen)>2048: self.handoff_seen={job['id']}
                ack = {'id':job['id']}
                try:
                    if job.get('action') in ('locate-project','open-project'):
                        target = job.get('project')
                        if job['action']=='locate-project':
                            target,_ = QtWidgets.QFileDialog.getOpenFileName(self,'Retrouver le projet Substance',target or '', 'Projets Substance (*.spp)')
                            if not target: raise ValueError('Choix du projet annulé. Le projet ouvert est conservé.')
                        target = Path(target or '').resolve()
                        if not target.is_file() or target.suffix.lower()!='.spp':
                            raise ValueError('Le fichier .spp associé est introuvable. Utilise Retrouver le projet Substance.')
                        current = sp.project.file_path() if sp.project.is_open() else None
                        same = current and Path(current).resolve()==target
                        if not same:
                            if sp.project.is_open():
                                if sp.project.needs_saving():
                                    answer=QtWidgets.QMessageBox.question(self,'Changer de projet Substance','Le projet ouvert contient des modifications non enregistrées. Le fermer sans les enregistrer pour ouvrir le fichier choisi ?',QtWidgets.QMessageBox.StandardButton.Yes|QtWidgets.QMessageBox.StandardButton.No,QtWidgets.QMessageBox.StandardButton.No)
                                    if answer!=QtWidgets.QMessageBox.StandardButton.Yes:
                                        raise ValueError('Ouverture annulée. Enregistre ton travail puis réessaie.')
                                sp.project.close()
                            sp.project.open(str(target))
                        ack.update(project=str(target),context=texture_export.context_id(sp),uuid=str(sp.project.get_uuid()),meshSignature=current_mesh_signature(),opened=True)
                        self.handoff_ack=ack
                        self.status.setText('Projet Substance associé : '+target.name)
                        continue
                    if job.get('action') == 'texture':
                        if job.get('meshSignature') and current_mesh_signature()!=job['meshSignature']:
                            raise ValueError('Le maillage Painter a changé depuis l’export Blender. Nouvelle association nécessaire.')
                        image = Path(job['image']).resolve()
                        if image.parent != (root / 'Projets Painter').resolve() or image.suffix != '.png':
                            raise ValueError('Chemin de texture invalide.')
                        image_checks.inspect_png(image,expected_sha=job.get('sha256'))
                        context = job['context']
                        ledger = root / 'Projets Painter' / ('binding-' + hashlib.sha256((job['projectID']+context).encode()).hexdigest() + '.json')
                        names = [m.name() for m in sp.textureset.all_texture_sets()] if sp.project.is_open() else []
                        resource_job = {'image':str(image),'projectID':job['projectID'],'textureSets':names,'textureSet':'Texture commune','resourceName':'Texture3D_'+hashlib.sha256(job['projectID'].encode()).hexdigest()[:20]}
                        if ledger.exists():
                            managed_layer.validate_owned(sp,json.loads(ledger.read_text(encoding='utf-8')),
                                lambda material,stack: associations.original_name(material)+'/'+stack.name())
                        resources.import_paint(sp, resource_job, '', ledger, expected_context=context)
                        # Explicitly requested Blender-to-Painter automatic Base Color setup.
                        state = json.loads(ledger.read_text(encoding='utf-8'))
                        assigned = state.setdefault('baseColorLayers', {})
                        identifier = sp.resource.Resource.retrieve(sp.resource.ResourceID.from_project(name=resource_job['resourceName']))[0].identifier()
                        managed_layer.ensure_base_color(sp,state,identifier,
                            lambda material,stack: associations.original_name(material)+'/'+stack.name(),
                            lambda: ledger.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8'))
                        ack['updated'] = True
                        ack['baseColorApplied'] = True
                        self.status.setText('Texture appliquée en Base Color dans ce projet Painter.')
                        self.handoff_ack = ack
                        continue
                    if sp.project.is_open():
                        raise ValueError('Un projet Painter est ouvert. Ferme-le toi-même puis relance l’envoi depuis le viewer.')
                    mesh = Path(job['fbx']).resolve()
                    if mesh.parent != (root / 'Projets Painter').resolve() or mesh.suffix.lower() != '.fbx' or not mesh.is_file():
                        raise ValueError('FBX de transfert invalide.')
                    sp.project.create(str(mesh), settings=sp.project.Settings(default_texture_resolution=2048))
                    ack['created'] = True
                    ack['meshSignature'] = current_mesh_signature()
                    ack['uuid'] = str(sp.project.get_uuid())
                    ack['context'] = sp.resource.ResourceID.from_project(name='Texture3D_context').context
                    self.status.setText('Modèle Blender ouvert dans un nouveau projet Painter. Enregistre-le pour utiliser Peindre dans Photoshop.')
                except Exception as error:
                    ack['error'] = str(error)
                    self.status.setText(str(error))
                self.handoff_ack = ack
            elif kind == 'opened':
                self.config = value
                self.open_button.setEnabled(True)
                if self.watch_document and self.watch_document.is_file():
                    stat = self.watch_document.stat()
                    self.watch_stamp = (stat.st_mtime_ns, stat.st_size)
                self.status.setText('Prêt. Dans Photoshop : Plugins → Texture3D → Envoyer la peinture dans Painter.')
            elif kind == 'restored':
                self.restoring = False
                root, config, folder, metadata = value
                try:
                    validate_association(metadata)
                except Exception as error:
                    self.config = None
                    self.status.setText(str(error))
                    continue
                self.root, self.config = root, config
                self.bindings[metadata['project_id']] = metadata
                self.watch_document = folder / metadata['document']
                self.watch_documents[self.watch_document] = None
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
                        validate_association(metadata)
                        image = Path(job['image']).resolve()
                        if image.parent != (self.root / 'cache-textures').resolve() or image.suffix != '.png':
                            raise ValueError('Chemin de texture inattendu.')
                        data = image.read_bytes()
                        if not job.get('sha256') or hashlib.sha256(data).hexdigest() != job['sha256']:
                            raise ValueError('Texture incomplète ou service ancien : intégrité du transfert non vérifiée.')
                        decoded = QtGui.QImage.fromData(data, 'PNG')
                        if decoded.isNull() or (decoded.width(), decoded.height()) != (metadata['width'], metadata['height']):
                            raise ValueError('Le PNG est corrompu ou sa résolution ne correspond pas à la liaison.')
                        del decoded, data
                        # Older companion versions only send the display label.
                        # The local association owns the actual material list.
                        job = {**job, 'textureSets': metadata.get('texture_sets') or [metadata['texture_set']]}
                        ack['updated'] = resources.import_paint(sp, job, metadata['painter_project'], self.root.parent / 'Projets Texture3D' / ('Painter_' + metadata['project_id']) / 'resource-binding.json')
                        self.status.setText('Peinture actualisée dans Painter.' if ack['updated'] else 'Peinture importée comme Texture. Tu peux l’utiliser dans tes calques.')
                    except Exception as error:
                        ack['error'] = str(error)
                        self.status.setText(str(error))
                    self.done.add(job['id'])
                    self.done_order.append(job['id'])
                    if len(self.done_order) > 2048:
                        self.done.discard(self.done_order.pop(0))
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
    for module in (uv_guide, resources, preview, associations, texture_export, image_checks, managed_layer):
        importlib.reload(module)

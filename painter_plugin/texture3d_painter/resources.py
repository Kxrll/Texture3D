"""Import/update only resource versions recorded by this local association."""
import hashlib
import json
import os
from pathlib import Path


def import_paint(api, job, expected_project, ownership_file, expected_context=None):
    if expected_context is not None:
        if not api.project.is_open() or api.resource.ResourceID.from_project(name='Texture3D_context').context != expected_context:
            raise ValueError('Le projet Painter a changé. Reviens au projet associé pour actualiser sa texture.')
    else:
        current = api.project.file_path() if api.project.is_open() else None
        if not current or Path(current).resolve() != Path(expected_project).resolve():
            raise ValueError('Le projet Painter a changé. Rouvre le projet associé avant l’envoi.')
    available = {m.name() for m in api.textureset.all_texture_sets()}
    expected = job.get('textureSets') or [job['textureSet']]
    if not set(expected).issubset(available):
        raise ValueError('Un matériau associé a été supprimé ou renommé. Reprends le projet depuis Texture3D.')
    resource_api = api.resource
    name = job['resourceName']
    ledger = Path(ownership_file)
    identity = {'project': expected_context if expected_context is not None else str(Path(expected_project).resolve()), 'projectID': job['projectID'], 'name': name}
    state = json.loads(ledger.read_text(encoding='utf-8')) if ledger.exists() else {**identity, 'urls': []}
    if any(state.get(key) != value for key, value in identity.items()) or not isinstance(state.get('urls'), list):
        raise ValueError('Association de ressource incompatible. Aucun remplacement effectué.')
    owned = set(state['urls'])
    # Inspect embedded resources too, including unused resources absent from list_project_resources.
    identifier = resource_api.ResourceID.from_project(name=name)
    existing = [r.identifier() for r in resource_api.Resource.retrieve(identifier)]
    used = [r for r in resource_api.list_project_resources() if r.name == name]
    if any(r.url() not in owned for r in existing + used):
        raise ValueError('Une ressource homonyme non associée existe. Import refusé pour préserver cette ressource.')
    if owned and not existing:
        raise ValueError('La ressource associée est introuvable. Aucun nouvel import automatique effectué.')
    # Probe durable storage before importing. No SPP metadata or automatic save.
    ledger.parent.mkdir(parents=True, exist_ok=True)
    temporary = ledger.with_suffix('.tmp')
    def persist():
        temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
        os.replace(temporary, ledger)
    persist()
    # Painter may lazily read the imported image again while saving the SPP.
    # Keep immutable association-owned assets; only the transport file may be deleted.
    data = Path(job['image']).read_bytes()
    content_hash = hashlib.sha256(data).hexdigest()
    assets = ledger.parent / 'resource-assets'
    assets.mkdir(exist_ok=True)
    durable = assets / (content_hash + '.png')
    if durable.exists():
        if hashlib.sha256(durable.read_bytes()).hexdigest() != content_hash:
            raise ValueError('Le cache durable de la ressource est corrompu. Aucun import effectué.')
    else:
        with durable.open('xb') as stream:
            stream.write(data)
    del data
    resource = resource_api.import_project_resource(str(durable), resource_api.Usage.TEXTURE,
                                                   name=name, group='Texture3D')
    new_id = resource.identifier()
    state['urls'] = sorted(owned | {new_id.url()})
    persist()  # Keep ownership even if updating existing uses fails afterwards.
    replacements = {old: new_id for old in used if old.url() in owned and old != new_id}
    if replacements:
        result = resource_api.replace_project_resources(replacements)
        if result.status != resource_api.UpdateProjectStatus.SUCCESS:
            raise RuntimeError('Texture importée, mais actualisation des utilisations impossible : ' + str(result.errors))
    if job.get('sha256'):
        state['lastSyncedSHA256'] = job['sha256']
        persist()
    if not existing:
        resource.show_in_ui()
    return bool(existing)

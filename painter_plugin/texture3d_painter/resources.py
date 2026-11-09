"""Import one named Texture resource and update only its existing uses."""
from pathlib import Path


def import_paint(api, job, expected_project):
    current = api.project.file_path() if api.project.is_open() else None
    if not current or Path(current).resolve() != Path(expected_project).resolve():
        raise ValueError('Le projet Painter a changé. Rouvre le projet associé avant l’envoi.')
    available = {m.name() for m in api.textureset.all_texture_sets()}
    expected = job.get('textureSets') or [job['textureSet']]
    if not set(expected).issubset(available):
        raise ValueError('Un matériau Painter associé a été supprimé ou renommé. Reprends le projet depuis le panneau Texture3D.')
    resource_api = api.resource
    name = job['resourceName']
    old_ids = [r for r in resource_api.list_project_resources() if r.name == name]
    resource = resource_api.import_project_resource(job['image'], resource_api.Usage.TEXTURE,
                                                   name=name, group='Texture3D')
    new_id = resource.identifier()
    replacements = {old: new_id for old in old_ids if old != new_id}
    if replacements:
        result = resource_api.replace_project_resources(replacements)
        if result.status != resource_api.UpdateProjectStatus.SUCCESS:
            raise RuntimeError('La texture a été importée mais ses utilisations n’ont pas été actualisées : ' + str(result.errors))
    resource.show_in_ui()
    return bool(old_ids)

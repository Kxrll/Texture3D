"""Read-only inventory of explicitly selected Texture3D storage; never deletes files."""
import argparse,hashlib,json
from pathlib import Path
from datetime import datetime,timezone

def inventory(root):
    root=Path(root).resolve();items=[]
    for directory in ['Projets Painter','resource-assets']:
        folder=root/directory
        if not folder.is_dir():continue
        for path in folder.rglob('*'):
            if not path.is_file() or path.is_symlink():continue
            resolved=path.resolve()
            if not resolved.is_relative_to(root):continue
            stat=path.stat();digest=hashlib.sha256()
            with path.open('rb') as stream:
                for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
            items.append({'file':str(path.relative_to(root)),'size':stat.st_size,'createdUTC':datetime.fromtimestamp(stat.st_ctime,timezone.utc).isoformat(),'modifiedUTC':datetime.fromtimestamp(stat.st_mtime,timezone.utc).isoformat(),'lastUse':'inconnu : aucune suppression autorisée','association':str(path.parent.relative_to(root)),'sha256':digest.hexdigest(),'status':'durable si référencé ; usage à vérifier'})
    return {'root':str(root),'files':items,'totalBytes':sum(i['size'] for i in items),'deletionPerformed':False}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--output',required=True);args=p.parse_args()
    Path(args.output).write_text(json.dumps(inventory(args.root),ensure_ascii=False,indent=2),encoding='utf-8')

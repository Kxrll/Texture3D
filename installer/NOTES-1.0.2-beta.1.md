# Texture3D Studio 1.0.2 — bêta 1

Préversion Windows x64 destinée à vérifier une correction de l'installateur après le problème **« Impossible de démarrer la transcription »** signalé pendant une mise à jour de 0.6.0 vers 1.0.1.

## Correctifs
- Le journal d'installation utilise un nom unique par tentative, évitant les collisions avec un ancien fichier ouvert.
- Si le dossier temporaire refuse la transcription, l'installateur tente le dossier %LOCALAPPDATA%\Texture3D\Logs.
- Si aucun journal n'est accessible, l'installation continue en signalant l'avertissement, **sans désactiver les vérifications ni la restauration en cas d'échec**.
- Le lien « Consulter le journal » ouvre désormais le fichier réellement utilisé.
- Test automatisé Windows : journal initial indisponible, deux destinations indisponibles, unicité et transcription native.

La version interne du programme et du plugin Adobe est **1.0.2** ; le tag de cette préversion est **v1.0.2-beta.1**.

## Installer
Fermer Blender et Photoshop, puis lancer **Texture3D-Setup-1.0.2-beta.1.exe**. Les projets et configurations existants sont préservés par le système de mise à jour, sous réserve du comportement validé sur la machine utilisée. Exécutable Windows non signé : ne pas outrepasser des avertissements de sécurité inattendus.

Cette correction **ne constitue pas encore une validation sur le poste qui présentait l'erreur**. Signaler le résultat de l'installation et, en cas de nouvel échec, le texte du message d'erreur affiché.

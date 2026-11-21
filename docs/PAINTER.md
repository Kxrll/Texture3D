# Envoyer une texture dans Substance 3D Painter

## Charger le plugin

Si Painter est détecté, l’installateur Texture3D installe le plugin pour le compte Windows courant. Ouvrir ou relancer Painter pour le charger automatiquement.

### Installation manuelle

Pour Texture3D Studio 1.0.0, une installation de Painter non détectée ou un environnement de développement, utiliser le script fourni.

1. Dans Painter, ouvrir **Python → Plugins Folder** et copier le chemin du dossier `plugins`.
2. Fermer Painter, puis exécuter dans PowerShell en remplaçant le chemin d’exemple.

   ```powershell
   Set-Location (Join-Path $env:LOCALAPPDATA 'Programs\Texture3D')
   powershell.exe -NoProfile -File .\INSTALLER_PAINTER.ps1 -PluginsDirectory "CHEMIN\python\plugins"
   ```

3. Rouvrir Painter. Si le viewer indique que le plugin est déconnecté, vérifier que **Python → texture3d_painter** est activé.

Le script installe le plugin pour le compte courant. Pour une installation depuis les sources, exécuter le même script à la racine du dépôt afin que Painter pointe vers les sources de développement.

## Première utilisation

1. Démarrer un projet Texture3D depuis Blender avec **Peindre dans Photoshop**.
2. Dans le viewer, cliquer sur **Envoyer dans Painter**. Au premier envoi, si aucun projet Painter n’est ouvert, Texture3D exporte le modèle en FBX et ouvre un projet Substance.
3. La texture issue de Photoshop est appliquée en **Base Color** dans un calque Texture3D. Les envois suivants actualisent cette texture dans le projet associé.
4. Enregistrer le projet dans Painter au format `.spp`.

## Reprendre ou retrouver un projet

Ouvrir le projet Blender et choisir **Reprendre la peinture**. Cliquer ensuite sur **Envoyer dans Painter** pour retrouver la destination enregistrée. Utiliser **Retrouver le projet Substance** pour sélectionner un `.spp` déplacé ou associer un autre fichier. Le viewer propose le sélecteur Windows, puis envoie la texture une fois le projet ouvert. Painter demande une confirmation si le projet à remplacer a des modifications non enregistrées.

Les exports de cartes et le transfert de textures de Painter vers Photoshop se font manuellement dans cette version. Le panneau Painter propose aussi le parcours distinct **Peindre dans Photoshop**, qui renvoie la peinture comme ressource **Texture** dans le projet de départ.

# Développer Texture3D

## Reprendre sur un autre PC

Installer Git et Node.js avec npm, ainsi que Blender et Photoshop pour les intégrations.

```powershell
git clone https://github.com/Kxrll/Texture3D.git
cd Texture3D
npm ci
node init-config.cjs
npm run build
npm run check
```

La configuration locale est créée sans écraser celle qui existe. Ne pas la pousser sur GitHub. Le plugin Photoshop et le service doivent utiliser la même clé.

## Brancher les applications

Fermer Blender, puis installer l’extension depuis les sources :

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python-exit-code 1 --python install-blender-addon.py
```

Adapter le chemin à sa version. Le script active l’extension et enregistre les préférences.

Dans UXP Developer Tools, charger le `manifest.json` à la racine. Désactiver la version installée pendant le développement : `fr.texture3d.studio` et `fr.texture3d.preview` ne doivent pas fonctionner ensemble.

Lancer `OUVRIR_VIEWER.vbs`, puis créer un projet depuis Blender. Les projets sont dans `Projets Texture3D`, à côté du dossier de l’outil. Git ne remplace pas une sauvegarde des PSD et fichiers .blend.

## Organisation

| Sources | Rôle |
| --- | --- |
| `src/viewer.js` | Rendu Three.js, navigation et commandes |
| `studio.css`, `restyle.cjs` | Apparence et génération de l’interface |
| `viewer/` | Interface compilée |
| `companion.cjs` | Serveur local, synchronisation, transferts |
| `main.js`, `manifest.json`, `index.html` | Plugin Photoshop UXP |
| `prepare-photoshop-project.jsx`, `open-photoshop-project.ps1` | Préparation du PSD |
| `blender_addon/texture3d_blender/` | Extension, matériaux, UV et projets |
| `installer/` | Installateur C#/PowerShell, mise à jour et portable |
| `assets/` | Icônes et modèle de démonstration |
| `test-*`, `installer/test-*` | Tests |

## Comportement à conserver

- Un document commun avec les UV d’origine, sans nouvelle carte UV.
- Aucun compactage automatique : demander de corriger les UV dans Blender.
- Ctrl+S actualise le viewer ; le retour Blender reste manuel.
- Les guides restent visibles dans Photoshop mais sont exclus des textures envoyées.
- Préserver les autres propriétés des matériaux.
- Ne pousser sur GitHub que sur demande explicite.

## Construire la distribution

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File installer/build.ps1
```

Le script reconstruit le viewer, prépare le CCX, embarque Node.js et compile l’installateur. Résultats dans `distribution/Texture3D-0.8.0/`.

Prérequis : Windows x64, Node.js dans `C:\Program Files\nodejs\node.exe`, compilateur .NET Framework dans `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`, réseau pour télécharger la licence Node.js. La licence embarquée correspond à Node.js 22.17.1 ; adapter ce point si le moteur change. Le RAR se prépare séparément avec WinRAR.

Les sauvegardes de mise à jour sont dans `%LOCALAPPDATA%\Texture3D\Recovery`. Le build crée une configuration de distribution sans recopier la clé de développement.

## Vérifier

```powershell
npm run check
node test-guide-exclusion.cjs
node test-native-reconnect.cjs
powershell.exe -NoProfile -File installer/test-upgrade.ps1
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --python-exit-code 1 --python test-texture-sets.py
```

`installer/test-backend.ps1 -PackageStage <dossier temporaire affiché par le build>` teste la mise à jour et un échec volontaire dans un profil isolé, avec Adobe et Blender simulés. Cela ne remplace pas un essai de l’installateur réel.

Certains tests historiques demandent Photoshop, un service actif ou une ancienne structure de projet. Les anciens tests multi-matériaux ne décrivent pas tous le document commun actuel : vérifier leurs prérequis.

## Synchroniser

Avant de reprendre : `git pull --ff-only` avec un dossier de travail propre. Après les modifications : examiner `git diff`, vérifier le comportement, créer un commit et pousser. Ne jamais ajouter les clés, caches ou projets personnels.

Les dépendances se réinstallent avec `npm ci`. Les sources du projet, les scripts et les ressources sont versionnés ; les dépendances tierces et les exécutables sont reconstruits ou téléchargés.

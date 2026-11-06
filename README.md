# Texture3D

Peins tes textures dans Photoshop et visualise le résultat dans le viewer 3D.

## Télécharger

Télécharge le RAR **installateur + portable** dans [les releases](https://github.com/Kxrll/Texture3D/releases). Décompresse tout et lis LIRE EN PREMIER.txt.

## Utilisation

Le tutoriel complet est dans [GUIDE.txt](GUIDE.txt). Windows 64 bits, Blender, Photoshop et Edge nécessaires. Testé avec Blender 5.1 et Photoshop 27.11. Node.js est inclus. Le plugin Photoshop reste nécessaire en mode portable. Les autorisations Adobe peuvent varier selon le PC. 

## Reprendre le développement sur un autre ordinateur

Le dépôt contient maintenant les sources complètes du viewer, du service local, du plugin Photoshop, de l’extension Blender, des tests et de l’installateur.

```powershell
git clone https://github.com/Kxrll/Texture3D.git
cd Texture3D
npm ci
node init-config.cjs
npm run build
npm run check
```

Pour développer, Node.js et npm doivent être installés sur ce poste. Le moteur intégré concerne les versions distribuées aux utilisateurs.

### Organisation du code

- `src/viewer.js`, `studio.css`, `restyle.cjs` : vue 3D et interface ; `viewer/` contient le résultat utilisable.
- `companion.cjs` : service local et échanges entre les applications.
- `main.js`, `index.html`, `manifest.json` : plugin Photoshop UXP.
- `blender_addon/texture3d_blender/` : extension Blender et gestion des matériaux/projets.
- `open-photoshop-project.ps1`, `prepare-photoshop-project.jsx` : ouverture et préparation du PSD.
- `installer/` : sources C# et PowerShell de l’installateur Windows et de sa désinstallation.
- `test-*` : tests ; certains utilisent Blender, Photoshop ou un service déjà lancé et créent des projets de test.

### Configuration locale et Photoshop

`node init-config.cjs` crée `companion-config.json` avec une clé locale aléatoire, sans écraser une configuration existante. Ce fichier est ignoré par Git. Le service et le plugin doivent utiliser la même configuration : ne pas associer un ancien plugin empaqueté à une nouvelle clé locale.

Pour charger le plugin en développement, utiliser UXP Developer Tools avec le `manifest.json` à la racine. Ne pas charger simultanément la version installée `fr.texture3d.studio` et la version de développement `fr.texture3d.preview`.

Pour installer l’extension Blender depuis les sources :

```powershell
& 'C:\Program Files\Blender Foundation\Blender\blender.exe' --background --python-exit-code 1 --python install-blender-addon.py
```

Adapter le chemin à sa version de Blender. Ce script active l’extension et enregistre les préférences utilisateur. Il est préférable de fermer Blender avant cette opération.

### Préparer une distribution

1. `npm run build` pour reconstruire le viewer.
2. `node build-distribution.cjs` pour préparer `distribution/photoshop`.
3. Empaqueter ce dossier via UXP Developer Tools en `distribution/fr.texture3d.studio_PS.ccx`.
4. `powershell -ExecutionPolicy Bypass -File installer/build.ps1` pour construire l’EXE Windows. Ce script nécessite Node.js dans `C:\Program Files\nodejs`, le compilateur .NET Framework Windows et un accès Internet pour la licence du moteur embarqué. Le moteur embarqué est actuellement prévu pour Node.js 22.17.1.

Les exécutables et archives se téléchargent dans les releases, pas dans le code source. Les projets personnels, caches, configurations et fichiers de test temporaires ne sont pas versionnés.

### Synchroniser le travail

Avant de travailler sur un autre poste, récupérer les derniers changements avec `git pull --ff-only` depuis un dossier sans modifications en attente. Après les modifications, vérifier `git diff`, lancer les contrôles adaptés, puis faire un commit et `git push`. Les consignes pour maintenir ce dépôt à jour sont aussi dans `AGENTS.md`.

## Version 0.7 : conserver les UV

Les nouveaux projets utilisent un PSD par matériau avec les UV d’origine, sans les réduire ni ajouter de carte UV. Le viewer affiche tout le modèle et permet de choisir le matériau à peindre. Le retour Blender concerne le matériau choisi. Les anciens projets en atlas restent compatibles ; créer un nouveau projet pour adopter le nouveau mode. Les limites de textures procédurales/UDIM restent inchangées.

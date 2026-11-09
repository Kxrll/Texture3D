# Painter ↔ Photoshop : prototype local

Cette option ajoute un trajet Painter → guide UV dans un PSD → peinture importée dans Painter comme ressource **Texture**. Elle n’exporte pas les canaux Base Color, Roughness, Metallic, etc. Le guide est tracé à partir des UV du maillage exporté par Painter, sans compactage. Le maillage OBJ temporaire est supprimé après lecture.

## Installer pour tester

Prérequis : Windows, Painter avec API Python et PySide6 (testé avec l’application installée sur le poste), Photoshop 26+, plugin Photoshop reconstruit depuis ces sources et Node.js disponible dans le PATH ou dans `runtime/node.exe`.

1. Dans le dossier source, lancer `node init-config.cjs`. La même configuration doit être embarquée dans le plugin Photoshop. Ne pas utiliser simultanément le plugin Photoshop installé et celui de développement.
2. Charger le `manifest.json` racine avec UXP Developer Tools, après avoir désactivé l’ancienne version. Il contient désormais la commande **Envoyer la peinture dans Painter**. Autre possibilité : `powershell.exe -NoProfile -ExecutionPolicy Bypass -File build-painter-prototype.ps1` crée `distribution/Texture3D-Painter-prototype.ccx`, installable avec Creative Cloud. Ce paquet a l’identifiant de développement `fr.texture3d.preview` et le nom **Texture3D - prototype Painter**. Désactiver la version Studio pendant le test. Le plugin Painter et le service doivent pointer vers cette copie des sources.
3. Dans Painter, ouvrir **Python → Plugins Folder**, puis copier le chemin du dossier `plugins`.
4. Exécuter dans PowerShell, depuis le dossier source :

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\INSTALLER_PAINTER.ps1 -PluginsDirectory "CHEMIN\python\plugins"
   ```

5. Activer **Python → texture3d_painter**. Si l’entrée n’apparaît pas, redémarrer Painter. Le script d’installation conserve une copie d’un éventuel plugin précédent ; il ne modifie pas les projets Painter.

## Utiliser

1. Enregistrer le projet `.spp` et cliquer **Peindre dans Photoshop** dans le panneau Texture3D. Tous les objets et tous les matériaux sont envoyés ensemble ; le PSD commun et le viewer du modèle complet s’ouvrent.
2. Photoshop ouvre un document transparent avec un groupe verrouillé **Repère UV** et un calque **Peinture**. Le groupe contient un fond blanc de travail et les contours renforcés, automatiquement exclus de l’export. Peindre sur les calques extérieurs au groupe de guide.
3. Dans Photoshop : **Plugins → Texture3D → Envoyer la peinture dans Painter** (le libellé du plugin dépend du chargement Studio ou Aperçu).
4. Painter importe la peinture comme ressource Texture du projet et la met en évidence dans Assets. L’artiste choisit où l’utiliser. Le plugin ne crée pas de calque Painter et ne décide pas du canal à modifier.
5. Les envois suivants réimportent la même ressource nommée et actualisent ses utilisations existantes dans le projet. Le bouton **Envoyer dans Painter** du viewer permet aussi cet envoi. Les guides UV ne sont pas transmis. Enregistrer le `.spp` pour conserver l’import.

Le PSD est conservé dans `Projets Texture3D/Painter_<identifiant>/`, à côté du dossier de l’outil. Recliquer **Peindre dans Photoshop** pour reprendre le même document. Le plugin reconnecte aussi les associations enregistrées à la réouverture du projet Painter. Une modification des UV, des matériaux ou de la résolution produit une autre association et un autre PSD, pour préserver la peinture existante. Les anciens PSD par matériau restent conservés ; le passage au modèle complet crée un nouveau document commun.

Ctrl+S actualise le viewer. Le plugin écoute les notifications Photoshop et surveille aussi la modification du fichier PSD associé pour récupérer les enregistrements qui n’émettent pas de notification (par exemple certains scripts). La commande Photoshop **Ouvrir Texture 3D** choisit le viewer Painter lorsqu’un document Painter est actif.

## Limites du prototype

- Un PSD commun à tous les matériaux, à la résolution maximale du projet ; UV dans 0–1, sans workflow UDIM. Les dimensions du PSD doivent rester identiques.
- UV superposés : peinture partagée. Aucun déplacement automatique des îlots.
- Le guide vient de tous les UV de l’export OBJ de Painter. Le viewer utilise une seconde exportation triangulée de tous les objets, convertie en GLB autonome, limitée à 25 Mo. Les UV et la scène source ne sont pas modifiés.
- Retour manuel dans Painter. Ctrl+S seul ne déclenche pas l’import.
- Le service conserve ses liaisons en mémoire. Le plugin peut les réenregistrer depuis les métadonnées locales après un redémarrage ; le bouton du panneau permet aussi une reprise explicite.
- Le viewer ouvert depuis Painter possède un état séparé du viewer Blender. Ctrl+S actualise son aperçu via le plugin Photoshop. Le retour dans Painter reste manuel. La transparence est montrée sur un fond de prévisualisation clair ; le PNG envoyé conserve son alpha.
- Le script de build inclut les sources Painter, mais son installation reste explicite via `INSTALLER_PAINTER.ps1`. Aucun nouvel installateur ni release n’est publié automatiquement.

## Vérifications

```powershell
node test-painter-bridge.cjs
node test-painter-photoshop.cjs
node test-painter-viewer.cjs
node test-guide-exclusion.cjs
node test-native-reconnect.cjs
node test-return-bridge.cjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File test-painter-psd.ps1
```

`test-painter-uv.py` utilise Python avec PySide6 pour vérifier le filtrage par matériau, les indices OBJ négatifs, le rejet d’UV invalides, l’orientation et la transparence des PNG. Il peut utiliser le Python embarqué de Painter.

`test-native-painter.py` s’exécute **dans une instance Painter sans projet ouvert** via l’API de scripting documentée. Il crée un projet temporaire, exporte ses UV, teste le panneau et importe deux versions d’une texture déjà utilisée par un calque. Il refuse de toucher un projet préexistant. Son résultat est écrit dans `.test-painter-native.json` (ignoré par Git).

Les tests simulés du plugin Photoshop ne remplacent pas un essai utilisateur du menu UXP chargé avec la même clé que le service.

Vérifications effectuées sur le poste : tests HTTP et Photoshop simulé réussis, tests UV/PNG et modèle complet avec Qt réussis, tests réels dans Photoshop et Painter avec deux matériaux. Un Ctrl+S natif et une sauvegarde scriptée ont actualisé le viewer ; l’envoi depuis le menu Photoshop a importé la texture, puis un second envoi depuis le viewer a remplacé la ressource utilisée par les deux matériaux. Le test Blender `test-blender-all-objects.py` vérifie qu’un seul objet sélectionné n’exclut pas les autres objets visibles.

## Références

- [Export du maillage](https://experienceleague.adobe.com/en/docs/substance-3d-dev/painter-python/api/substancepainter-package/export)
- [Import et remplacement des ressources](https://experienceleague.adobe.com/en/docs/substance-3d-dev/painter-python/api/substancepainter-package/resource)
- [Contrôle d’une instance de test](https://adobedocs.github.io/painter-python-api/guides/remote-control/)

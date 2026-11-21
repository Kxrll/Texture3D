> État actuel — 21 novembre 2026 : l’import depuis Painter dans le viewer a été retiré à la demande de l’utilisateur ; l’export des textures Substance se fait manuellement. Envoyer dans Painter reste disponible. Retrouver le projet Substance ouvre désormais un sélecteur Windows depuis le viewer, ouvre le .spp choisi, mémorise son chemin et déclenche l’envoi de la texture dans le parcours Blender. Les projets ouverts contenant des modifications sont protégés par confirmation. À la reprise, le .spp enregistré est prioritaire ; un fichier manquant ne déclenche pas de nouveau projet de secours. Les documents Round Trip ci-dessous décrivent aussi les développements expérimentaux antérieurs, dont les modules d’export sont conservés mais dont les routes viewer sont désactivées.

> Changement de périmètre demandé : l’import Painter → Photoshop depuis le viewer est retiré, y compris cartes/sélections/options. L’export depuis Substance se fait manuellement. Le bouton Envoyer dans Painter est conservé. Retrouver le projet Substance choisit un .spp dans Painter, remplace le projet ouvert après confirmation des modifications non enregistrées, puis mémorise cette destination. À la reprise, un .spp connu est rouvert ; un fichier absent n’entraîne pas de nouveau projet FBX de secours. La création FBX reste réservée au tout premier envoi sans historique.

> Finalisation locale : lire [le bilan de couverture](PAINTER-FINALISATION.md) et [le guide Round Trip](PAINTER-ROUNDTRIP.md). Les deux directions sont implémentées dans les sources. Les derniers essais natifs sont volontairement réservés à la séance commune ; ne pas confondre les tests contractuels réussis avec une validation dans Adobe. Aucun installateur ni publication n’a été produit.

> Mise à jour du 20 novembre : le viewer Blender possède un second bouton Envoyer dans Painter. Premier clic : export FBX depuis la session Blender et création d’un projet Painter vide de tout projet préexistant. Clics suivants : capture fraîche Photoshop, import/actualisation de la ressource et affectation Base Color dans un calque Texture3D géré, conformément à la demande explicite de l’utilisateur. La liaison locale est persistée dans .painter-destinations.json ; le contexte du projet est vérifié avant mise à jour. Le SPP reste à enregistrer manuellement. Le plugin Painter est chargé par le script utilisateur startup/texture3d_autostart.py. Les imports du parcours classique Painter → Photoshop restent distincts de cette affectation automatique.
>
> Le fonctionnement des derniers envois a été confirmé par l’utilisateur. Le nouveau parcours FBX/Base Color ne possède pas encore une couverture native automatisée exhaustive. Les déplacements/suppressions de calques gérés, la reprise après réouverture du SPP et plusieurs fenêtres restent à tester. La branche contient aussi les Texture Sets indépendants, BaseColor/Roughness/Metallic et un aperçu PBR expérimental. Les anciennes mentions « non implémenté » de la roadmap décrivent l’audit initial ; elles ne représentent plus ces développements locaux. Aucun installateur final pour ces modifications n’est publié.

> État de développement du 19 novembre 2026 : consulter [l’audit](PAINTER-AUDIT.md), [l’architecture](PAINTER-ARCHITECTURE.md), [la feuille de route](PAINTER-ROADMAP.md), [les résultats de tests](PAINTER-TEST-REPORT.md) et [les mesures attendues](PAINTER-PERFORMANCE.md). Les paragraphes de validation historiques ci-dessous ne valident pas automatiquement les nouvelles modifications.
>
> Le prototype local refuse désormais les homonymes non associés et mémorise les URLs des ressources dans resource-binding.json. Les anciennes ressources sans preuve de propriété ne sont pas adoptées. Une option de synchronisation à la sauvegarde est en cours de validation ; désactivée par défaut, sans création de calque ni affectation de canal.

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


## Complément Round Trip local du 20 novembre

Voir [PAINTER-ROUNDTRIP.md](PAINTER-ROUNDTRIP.md) pour l’état le plus récent : bouton d’import, catalogue réel, PSD par carte/set, retour via association, reprise multiple et verrouillage. Les validations natives de cette nouvelle chaîne sont en attente de la séance utilisateur ; les mentions historiques ne valent pas validation de ces changements. Aucun benchmark nouveau ni exécution CI distante revendiqué. Les cartes avancées et masques restent exclus de l’interface faute de validation technique suffisante.

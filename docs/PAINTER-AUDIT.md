# Audit initial Painter — 19 novembre 2026

Base : 7084b32 / v0.8.1-beta.1 ; branche feature/painter-integration. Audit ciblé, non certification complète. Aucun changement main, commit, push ou release.

## P01 — Confirmé, élevé

- Source : `painter_plugin/texture3d_painter/resources.py:22`.
- Cause et conséquence : Remplacement fondé sur le nom ; homonyme étranger potentiellement remplacé.
- Correction : Registre local d’URLs versionnées, refus des collisions et ressources disparues.
- Validation : 4 tests contractuels ; deux imports natifs réussis. Collision native dédiée à compléter.
- État : Corrigé localement ; migration des anciennes associations reste explicite.

## P02 — Confirmé, élevé

- Source : `painter_plugin/texture3d_painter/uv_guide.py:60`.
- Cause et conséquence : Préparation réécrit la texture de départ lors d’une reprise.
- Correction : Créer uniquement si absente.
- Validation : Test Qt conserve exactement les octets existants.
- État : Corrigé localement.

## P03 — Confirmé, moyen

- Source : `painter-bridge.cjs:84`.
- Cause et conséquence : Reprise d’une liaison connue ne réinitialise pas toujours modèle/texture du précédent projet.
- Correction : Réinitialiser lors du changement de document actif.
- Validation : Test HTTP changement de liaison et texture nulle.
- État : Corrigé localement.

## P04 — Confirmé, élevé

- Source : `painter_plugin/texture3d_painter/__init__.py:84`.
- Cause et conséquence : Reprise fait confiance aux anciennes métadonnées sans revérifier les UV/dimensions.
- Correction : Validation du projet, matériaux, résolution, signature UV avant import et acceptation de reprise.
- Validation : Recette native après reconnexion réussie ; scénario changement UV à compléter.
- État : Correction partielle : comparaison géométrie/topologie exhaustive et projet copié restent ouverts.

## P05 — Confirmé, moyen

- Source : `prepare-photoshop-project.jsx:46`.
- Cause et conséquence : La reprise pouvait ajouter un fond de travail et renforcer le guide d’un ancien PSD.
- Correction : Amélioration du guide réservée aux documents nouvellement créés.
- Validation : Test Photoshop de reprise ; compléter ancien guide sans fond.
- État : Corrigé localement.

## P06 — Confirmé, élevé

- Source : `painter_plugin/texture3d_painter/__init__.py:318`.
- Cause et conséquence : Contrôle serveur limité à l’en-tête PNG ; fichier incomplet accepté jusqu’à l’import.
- Correction : SHA-256 du transfert et décodage PNG/résolution avant import Painter.
- Validation : Envoi natif avec empreinte réussi ; corruption native à compléter.
- État : Corrigé côté réception ; CRC/décompression serveur non implémentés.

## P07 — Confirmé, moyen

- Source : `painter-bridge.cjs:30`.
- Cause et conséquence : Base64, listes GLB, JSON et écritures synchrones consomment mémoire et bloquent Node.
- Correction : Mesurer puis transfert binaire versionné, I/O asynchrone.
- Validation : Benchmark 1K–8K à effectuer.
- État : Ouvert ; cache binaire Blender déjà corrigé en bêta, ne pas le réécrire.

## P08 — Confirmé, faible

- Source : `manifest.json:17`.
- Cause et conséquence : Permissions UXP réseau all plus larges que nécessaire.
- Correction : Limiter loopback après vérification des ports dynamiques et API UXP officielle.
- Validation : Chargement natif avec permission restreinte requis.
- État : Ouvert, manifeste inchangé.

## P09 — Confirmé, moyen

- Source : `src/viewer.js:53`.
- Cause et conséquence : Outils objets/UV désactivés en Painter ; export GLB rassemble tous les objets.
- Correction : Préserver groupes objets/matériaux puis activer inspection.
- Validation : Tests maillage multi-objets requis.
- État : Non implémenté en Painter ; fonctions Blender préservées.

## P10 — Confirmé, moyen

- Source : `painter_plugin/texture3d_painter/__init__.py:113`.
- Cause et conséquence : Identifiants terminés conservés sans borne ; cache Painter orphelin possible après arrêt brutal.
- Correction : Borner l’historique et nettoyer uniquement fichiers possédés/expirés.
- Validation : Test longue session et arrêt brutal.
- État : Ouvert ; nettoyage normal après acquittement/échec déjà présent.

## P11 — Observé, élevé

- Source : `main.js:47`.
- Cause et conséquence : Ancien plugin Photoshop installé 0.8.0 reste occupé dans la recette complète.
- Correction : Aligner prototype et service avant de conclure à une régression des nouvelles sources.
- Validation : Prototype installé avec accord ; transfert natif ensuite réussi.
- État : Conflit de version contourné ; cause précise du blocage ancien non isolée.

## P12 — Confirmé, moyen

- Source : `painter_plugin/texture3d_painter/__init__.py:219`.
- Cause et conséquence : Sauvegarde scriptée détectée par fichier mais ignorée par première implémentation auto.
- Correction : Marquer les captures de sauvegarde ; debounce et déduplication communs.
- Validation : Test natif en cours ; HTTP opt-in/doublons/désactivation réussi.
- État : Corrigé localement, recette en cours.

## Déjà corrigé dans 0.8.1

Retour Blender à version exacte, nettoyage PNG de retour, cache de session binaire adressé par contenu, ambiguïté des noms PSD, mémorisation des guides renommés, réduction mémoire Blender et restauration de l’installateur : conservés, tests existants réexécutés. Pas de seconde réécriture.

## API et limites

Référence officielle Adobe consultée : [resource](https://experienceleague.adobe.com/en/docs/substance-3d-dev/painter-python/api/substancepainter-package/resource), [remote scripting](https://adobedocs.github.io/painter-python-api/guides/remote-control/). Les modules Python livrés avec Painter 12.2.0 ont également été inspectés. Les signatures réellement employées sont testées nativement. Le travail PBR, Texture Sets indépendants, transfert de canaux et installation multi-version reste à faire ; voir roadmap.


## Complément Round Trip local du 20 novembre

Voir [PAINTER-ROUNDTRIP.md](PAINTER-ROUNDTRIP.md) pour l’état le plus récent : bouton d’import, catalogue réel, PSD par carte/set, retour via association, reprise multiple et verrouillage. Les validations natives de cette nouvelle chaîne sont en attente de la séance utilisateur ; les mentions historiques ne valent pas validation de ces changements. Aucun benchmark nouveau ni exécution CI distante revendiqué. Les cartes avancées et masques restent exclus de l’interface faute de validation technique suffisante.


## Corrections confirmées pendant la finalisation du Round Trip
- Réception sur un PSD homonyme situé ailleurs : chemin complet maintenant vérifié avant ouverture/import.
- Profil, mode ou profondeur incompatibles : refus explicite plutôt que conversion implicite.
- Calque Base Color géré supprimé : contrôle UID, y compris sous un groupe, avant import de ressource ; aucun nouveau calque automatique de remplacement.
- Premier envoi Blender n’importait que le modèle : livraison de texture enchaînée après création confirmée.
- Attente COM sur thread UI Painter : worker dédié, résultat restitué par file Qt.
- Acquittement tardif/autre récepteur : session affectée au job, bail vérifié avant/après COM, expiration du script de réception.
- Réimport de carte sans association de retour : métadonnées PSD/set/stack/canal et enregistrement du pont avant confirmation.
- Empreinte UV insuffisante pour nouveaux projets : signature géométrie/topologie et UUID ajoutés ; contrôles enrichis pour les nouveaux handoffs. Les anciennes liaisons conservent leurs limites de preuve et peuvent nécessiter une reprise explicite.

Pour les lignes actuelles, rechercher les symboles receive_roundtrip, validate_association, managed_layer.validate_owned, inspect_png, painter-handoff-lease, deliverBlenderTexture et updateChannels. Les anciens numéros de ligne de l’audit initial précèdent ces ajouts.

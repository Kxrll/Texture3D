# Tests Painter — 19 novembre 2026

## Environnement réellement inspecté
Sources et origin/main : 7084b32 ; release v0.8.1-beta.1 du 15 novembre. Branche locale feature/painter-integration créée depuis un arbre propre. Painter 12.2.0 ; Photoshop 27.11 et 28.0 présents, essais COM/UXP dans 27.11 ; Blender 5.1 ; Node 22.17.1 ; PySide6 6.8.7.

## Tests exécutés
- npm test : succès (capture UXP simulée, exclusion guides, reconnexion, retour Blender et Painter simulés).
- test-painter-bridge.cjs : succès HTTP réel/service isolé ; routage, acquittements, refus mauvais projet/session/dimensions, nettoyage ; opt-in automatique, debounce de dix captures, doublons et désactivation. PNG synthétique du test : ne valide pas le décodage d’une vraie image.
- test-painter-viewer.cjs et test-object-tools.cjs : succès navigateur headless avec serveur/logiciels simulés.
- test-painter-resources.py : quatre tests contractuels réussis ; homonymes utilisés/non utilisés, propriété persistante, perte de ressource, mauvais projet. Aucun Adobe requis.
- test-painter-uv.py : trois tests Qt réels réussis avec le Python embarqué de Painter ; UV, orientation, transparence, conservation d’un Peinture.png existant.
- test-painter-psd.ps1 : succès Photoshop réel ; PSD temporaire, guide verrouillé, alpha exporté, visibilité respectée à la reprise.
- test-native-painter.py : succès dans Painter réel, projet créé en 2048 ; export OBJ, UV, panneau, deux imports et utilisation existante actualisée, mauvais projet refusé. La texture unitaire de ce script reste 64 × 64.
- Recette native séparée en sandbox : panneau Painter → PSD 2048 → capture UXP 2048/8 bits → import Painter → application de la ressource dans un calque créé uniquement par le test → nouvelle peinture et second transfert → nouvelle URL utilisée et nombre de calques inchangé. Reprise après redémarrage du service test et import avec SHA-256 réussis.
- Ctrl+S a été exécuté dans le PSD de test ; le second transfert a également demandé une capture explicite. Cela ne prouve pas encore à lui seul l’import automatique sur Ctrl+S.

## Incident réel rencontré
Plugin Photoshop installé 0.8.0, différent des sources ; capture bloquée busy. Après accord utilisateur, sauvegarde locale de l’installation, retrait de Studio via UPIA et installation du prototype. Le prototype a permis les transferts natifs. Cause interne précise du blocage 0.8.0 non isolée ; ne pas attribuer sa résolution à une nouvelle correction non testée.

## Limites
Aucune campagne native complète PBR/16 bits/8K, dix sauvegardes natives, disque plein ou changement concurrent de projet. Contrôle natif de non-destruction partiel : nombre de calques et références ressources ; pas encore comparaison exhaustive de tous paramètres/masques/générateurs. Aucun test nouveau Blender natif exécuté dans cette campagne. Les anciennes affirmations de docs/PAINTER.md décrivent une campagne antérieure, pas une preuve de validation de cette branche.

Les journaux .test-* et configurations restent locaux et ignorés par Git. Les projets de tests se trouvent dans TEMP. Les essais ne ferment ni ne modifient de projet personnel.

## Complément — synchronisation automatique

Import automatique natif confirmé après sauvegarde scriptée grâce au fallback du PSD ; dix sauvegardes natives successives exécutées puis nouvel import acquitté. PNG final inspecté avec Qt : pixel intérieur (200,70,65,255), pixel hors peinture alpha 0. L’URL exacte et tous les pixels de la ressource Painter après la série ne sont pas encore comparés à un export de ressource ; ne pas présenter ce contrôle comme une comparaison exhaustive pixel à pixel dans Painter.

Workflow CI Windows ajouté localement : serveur, mocks UXP/ressources, viewer Edge et installation simulée. Non poussé, donc aucune exécution GitHub Actions revendiquée.

## Reprise du 20 novembre 2026

Build et tests npm, pont HTTP Painter, viewer Painter, cinq tests de ressources et trois tests UV/Qt : succès après les derniers changements. Painter et Photoshop étaient fermés à cette reprise ; aucune nouvelle validation native revendiquée pour cette journée.

Résultats natifs obtenus en fin de session précédente : deux PSD Body/Hat en 2048, deux ressources distinctes, couleurs rouge/bleue simultanément détectées dans le viewer utilisant les données du serveur réel. Roughness : PSD niveaux de gris puis conversion volontaire du document de test en 16 bits, capture UXP confirmée en 2048/16 bits et import Painter réussi. Ce résultat ne constitue pas une validation colorimétrique complète ni une validation PBR visuelle.

Régression importante corrigée : le PNG de transport pouvait être supprimé avant sa lecture différée par Painter lors de la sauvegarde du SPP. Chaque import utilise désormais un PNG immutable conservé dans resource-assets de l’association. Test natif sauvegarde/réouverture du SPP après suppression du transport réussi avant cette reprise ; conservation durable couverte également par un test contractuel.

Limites prioritaires : restauration automatique de toutes les associations après redémarrage (seule la plus récente est actuellement restaurée), contrôle de topologie complet, validation native Metallic/PBR, export de canaux Painter vers Photoshop, mesures mémoire et installation finale. La branche reste expérimentale et locale.


## Complément Round Trip local du 20 novembre

Voir [PAINTER-ROUNDTRIP.md](PAINTER-ROUNDTRIP.md) pour l’état le plus récent : bouton d’import, catalogue réel, PSD par carte/set, retour via association, reprise multiple et verrouillage. Les validations natives de cette nouvelle chaîne sont en attente de la séance utilisateur ; les mentions historiques ne valent pas validation de ces changements. Aucun benchmark nouveau ni exécution CI distante revendiqué. Les cartes avancées et masques restent exclus de l’interface faute de validation technique suffisante.


## Campagne finale hors applications — Round Trip
Exécutés avec succès après les correctifs locaux : npm run check ; npm test (quatre scripts) ; test-painter-bridge.cjs ; test-painter-viewer.cjs ; test-object-tools.cjs ; test-roundtrip-photoshop.cjs ; test-painter-texture-export.py (4 tests) ; test-painter-safety.py (3 tests) ; test-painter-resources.py (5 tests) ; test-painter-uv.py (3 tests Qt avec Python Painter). Compilation Python et parsing PowerShell de la réception réussis. git diff --check ne signale pas d’erreur ; avertissements de normalisation LF/CRLF uniquement.

Le pont HTTP couvre maintenant aussi la liaison obsolète, le verrou d’export concurrent, l’acquittement d’une autre session et l’expiration du bail. Le test de réception Photoshop exécute le JSX dans un environnement simulé et vérifie trois versions ajoutées sans suppression de peinture/guide, refus d’un même nom situé ailleurs et refus de profils incompatibles. Il ne remplace pas Photoshop natif.

Les scripts test-native-painter-roundtrip.py et painter-storage-report.py sont préparés. Le premier n’a pas été exécuté dans cette phase et refuse un projet Painter préexistant ; le second fournit un inventaire en lecture seule avec tailles, dates, empreintes et usage non prouvé. Aucune suppression de fichier durable n’est autorisée.

Pas de nouveau résultat natif ni benchmark depuis la demande de reporter les essais à la séance commune. Pas de push pour déclencher GitHub Actions.

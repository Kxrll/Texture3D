# Bilan de finalisation — sources locales

Date : 20 novembre 2026. Base a39caa6, branche feature/painter-integration. Aucun commit/push/release et aucun changement d’installateur durant cette mission. Les essais natifs de cette nouvelle version sont différés à la séance commune demandée par l’utilisateur.

## Couverture des phases du master prompt
| Phase | Réalisation dans les sources | Validation restante |
|---|---|---|
| Audit | Existant et tests relus ; bugs critiques corrigés | Campagne native complète |
| Viewer central | Deux actions Painter, action Blender conservée, catalogue, état, choix cartes/set/profondeur, lots bornés | Ergonomie native |
| Envoyer Painter | Capture fraîche, destination connue, ressource possédée, exception Base Color conservée, première texture intégrée | Trois cycles Blender |
| Importer Painter | Export dédié actuel, association, réception Photoshop, reprise viewer Painter | Trois cycles par origine |
| Export natif | export_project_textures, résultat et fichiers contrôlés, aucune mutation des piles | Pixels et profils réels |
| Réception PSD | Nouveau PSD/guides ou nouveau calque ; dimensions/mode/profondeur/profil/path contrôlés | COM dans chaque mode |
| Round Trip | Associations par carte/set/stack, retour comme ressource, verrou et bail | Reprise SPP et réponses tardives |
| Texture Sets/PBR | Quatre cartes prioritaires et quatre avancées expérimentales | Fidélité des cartes |
| Masques | Étude : smart mask ≠ bitmap du masque calculé ; aucun contournement destructif | Pas de fonctionnalité bitmap revendiquée |
| Auto-sync | Option existante, debounce/déduplication, suspension lors de l’import | Absence de boucle native |
| Persistance | Parcours de toutes les associations ; destinations persistées ; UUID/path/UV/mesh | Changement de contexte après réouverture |
| Blender/Painter | Réutilisation du projet, première texture, vérification UID du calque, empreinte PNG | Reprise et plusieurs instances |
| Ressources/stockage | URLs possédées, refus homonymes, ressources durables, inventaire sans suppression | Déplacement externe de fichiers |
| Interface | Cartes disponibles, 8/16 bits, sélection multiple, erreurs de lot, connexion/dernier transfert | Validation utilisateur |
| Colorimétrie | Conservation du fichier natif, refus conversion implicite sur PSD existant, data maps sans sRGB | Profils ICC/OCIO réels et aller-retour pixel |
| Viewer PBR | Standard expérimental, cartes base/rough/metal/emissive, mode unlit conservé | Équivalence visuelle non revendiquée |
| Performances | Cache UV, décode évité, frames masquées, mesure durée export, inventaire | Benchmarks RAM/CPU/1K–8K ensemble |
| Erreurs | Session/projet, fichiers, concurrence, lease, timeout, source personnelle préservée | Injection panne/disque plein native |
| Sécurité | Loopback authentifié, chemins/format/hash/CRC, UID/UUID, limites | Permissions UXP all conservées jusqu’à essai de restriction |
| Tests | Contrats Python/Node, HTTP, viewer et réception simulée ; script natif préparé | Aucun nouveau résultat natif inventé |
| Documentation | Six documents existants actualisés, roundtrip et présent bilan | Compléter les résultats de recette |

## Décisions
- Les tests natifs restent une condition de validation ; implémenté ne signifie pas validé dans Adobe.
- Aucun changement réseau majeur Base64→binaire n’est imposé aux clients existants. L’export Painter vers Photoshop passe par fichier local contrôlé. Les anciens transferts Base64 restent un coût connu à mesurer.
- Une seule direction de transfert automatique est conservée : Photoshop vers Painter, explicitement activée. Painter vers Photoshop reste manuel.
- Les ressources durables ne sont jamais purgées par âge. Une absence de preuve d’utilisation empêche la suppression.
- Aucun matériau procédural ni pile Painter n’est recréé dans Photoshop. Les images exportées sont les cartes calculées ; l’artiste assume leur réutilisation et la double application possible des effets.
- Pas de modification automatique de géométrie, UV, canaux ou projets personnels. Exception limitée au calque Base Color depuis Blender explicitement autorisé.
- Le catalogue masque les canaux absents. Les quatre cartes avancées restent marquées expérimentales et ne doivent pas être présentées comme validées.

## Fichiers ajoutés
texture_export.py, image_checks.py, managed_layer.py dans painter_plugin/texture3d_painter ; receive-painter-texture.ps1 ; test-painter-texture-export.py ; test-painter-safety.py ; test-roundtrip-photoshop.cjs ; test-native-painter-roundtrip.py ; painter-storage-report.py ; docs/PAINTER-ROUNDTRIP.md et ce bilan.

## Limites qui ne peuvent pas être levées sans la recette commune
La fidélité du PNG exporté, le profil attribué par Photoshop, la stabilité de contexte/UID après sauvegarde/réouverture, l’affichage PBR et la fluidité 8K exigent les applications et des mesures natives. Les transformations de profils sont refusées plutôt qu’appliquées silencieusement. Une commande COM déjà engagée n’offre pas de transaction inter-applications annulable ; les ajouts restent non destructifs et les baux empêchent les confirmations obsolètes. Les permissions réseau UXP ne sont pas restreintes sans un essai natif demandé par le master prompt.

## Résultats revendiqués
Les tests hors applications sont consignés dans PAINTER-TEST-REPORT.md. Aucun benchmark natif nouveau, aucune exécution CI distante et aucune recette complète de cette nouvelle chaîne ne sont revendiqués. Les confirmations utilisateur antérieures portent sur le parcours Blender→Painter avant ces changements. La version reste une branche expérimentale en attente des essais convenus.

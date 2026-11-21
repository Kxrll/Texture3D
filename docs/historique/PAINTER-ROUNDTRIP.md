# Round Trip — implémentation locale du 20 novembre 2026

## Utilisation prévue pour la recette native
1. Depuis Blender, créer/reprendre la peinture, puis Envoyer dans Painter. Conserver le calque Base Color géré existant. Depuis Painter, utiliser le panneau existant pour préparer la première association.
2. Dans le viewer, Actualiser les cartes Painter interroge le projet associé. Choisir un Texture Set/stack puis une carte disponible.
3. Importer depuis Painter déclenche un nouvel export natif, puis ouvre/crée le PSD associé ou ajoute un nouveau calque à ce PSD. Aucun calque existant n’est remplacé. Aucun SPP n’est sauvegardé. Enregistrer volontairement le projet Painter une première fois est requis pour les associations durables classiques.
4. Peindre dans le PSD reçu puis Envoyer dans Painter. Ce document utilise une association par Texture Set/canal et retourne comme ressource ; l’artiste choisit son utilisation. L’affectation Base Color automatique reste réservée à l’ancien parcours Blender dédié.
5. Réimporter produit une nouvelle version dans un nouveau calque. Les réglages et effets Painter restent ceux de l’artiste : une carte composite peut subir une double application d’effets si elle est réutilisée au mauvais endroit.

## Cartes
Base Color, Emissive, Roughness, Metallic : export documentMap dédié, PNG 16 bits par défaut, niveaux de gris pour les cartes de données. Le plugin ne crée aucun canal absent. UDIM refusé. Le catalogue n’affiche que les canaux présents parmi ces quatre types.
Normal, Height, AO, Opacity : export expérimental explicitement activable ; fidélité native non validée. Normal exporte le canal natif sans inversion ni conversion de convention. Height exige 16 bits. AO correspond au canal documentMap, pas à une mesh map implicite. Opacity reste une image indépendante en luminance. Les masques individuels ne sont pas exportés : aucun contournement par modification temporaire de la pile n’est implémenté.

## Protection des documents
Un nouveau PSD reçoit la texture native, un groupe UV verrouillé et un calque Peinture. Le mode/profondeur provient de l’image exportée. Un PSD existant conserve ses calques ; un mode, une profondeur ou une taille incompatibles déclenchent une erreur explicite. L’ajout d’un calque ne sauvegarde pas automatiquement le document. Le nouveau calque est identifié Painter/canal/horodatage. Il reste possible d’annuler son ajout dans Photoshop.

## Association et reprise
Identité par projet, nom d’origine du set, canal et signature UV/résolution. Les métadonnées et le PSD restent dans Projets Texture3D/Painter_<id>. Toutes les associations locales retrouvées sont parcourues à la reprise, chacune étant validée. Les fichiers de modèle déjà accessibles depuis Blender sont réutilisés ; le maillage de base Painter est exporté pour vérifier les UV. Cette vérification reste coûteuse et ne constitue pas une empreinte complète de topologie.

## Concurrence
Un seul handoff d’export à la fois ; le pont refuse un retour manuel simultané et suspend les captures automatiques en attente durant l’import. Un ancien identifiant d’acquittement est ignoré. Les timeouts libèrent le verrou. Les opérations COM déjà commencées ne sont pas annulables de manière transactionnelle : une opération tardive peut encore ouvrir/ajouter une image même après une perte de connexion. La recette doit vérifier ce cas avant diffusion.

## État de validation
Code implémenté localement, tests simulés et de non-régression exécutés. Aucun essai natif de cette nouvelle chaîne effectué : ils sont réservés à la séance avec l’utilisateur. Aucune publication, aucun changement d’installateur. Ne pas qualifier le round trip de validé avant les trois cycles par origine et la reprise après redémarrage.


## Compléments de finalisation
- Catalogue par récepteur et routage vers le contexte/chemin associé ; session de réception mémorisée pour le job, acquittements d’une autre session ignorés.
- Vérification du bail avant et après réception COM ; expiration contrôlée également dans le script Photoshop. Le script ne peut pas annuler transactionnellement une opération Adobe déjà commencée, mais aucune pile existante n’est effacée.
- Réception COM exécutée hors thread UI Painter. Les appels natifs restent dans le thread Painter.
- Empreinte de géométrie/topologie/UV sur les nouvelles associations et UUID Painter lorsqu’il est disponible. Les anciennes métadonnées sans ces preuves restent limitées aux contrôles qu’elles contiennent ; une migration complète exige une reprise explicite.
- Premier transfert Blender suivi de la texture Base Color, sans deuxième clic nécessaire.
- Contrôle du calque géré par UID, y compris sous un groupe. Suppression/déplacement vers une autre pile : refus, sans recréation. Renommage et paramètres conservés.
- PNG : taille, signature, chunks, CRC, dimensions, profondeur et empreinte contrôlés côté réception. Le décodage natif reste aussi une vérification requise en recette.
- Choix 8/16 bits ; sélection multiple compatible, 16 cartes maximum, traitement séquentiel. Les imports déjà reçus restent disponibles si un élément suivant échoue.
- Diagnostic de stockage en lecture seule via painter-storage-report.py. Aucun nettoyage de fichiers durables par ancienneté.
- Optimisations : Path2D UV en cache, décodage évité pour texture identique, arrêt des frames lorsque le document est masqué.

## Commandes de vérification hors applications
npm run check
npm test
node test-painter-bridge.cjs
node test-painter-viewer.cjs
node test-object-tools.cjs
node test-roundtrip-photoshop.cjs
python test-painter-texture-export.py
python test-painter-resources.py
python test-painter-safety.py

## Recette native préparée mais non exécutée
Le script test-native-painter-roundtrip.py est à lancer dans une instance Painter sans projet ouvert. Il crée uniquement un projet temporaire, ajoute les canaux/calques de fixture, effectue trois cycles de composants export/réception Photoshop/import de ressource et sauvegarde/réouvre son SPP. Il ne prouve pas le parcours complet viewer/Blender ni l’édition artistique Photoshop ; les trois parcours d’acceptation ci-dessous restent nécessaires ensemble.

A : depuis Blender, 3 cycles Base Color puis Emissive, modification dans Painter, import viewer, peinture Photoshop, retour ressource. Vérifier PID Painter stable, absence de nouvel FBX, UV, pixels, alpha et calques.
B : depuis Painter, plusieurs Texture Sets, mêmes cycles via viewer, guides et ressources étrangères conservés. Tester également Roughness et Metallic en 8/16 bits.
C : sauvegarder les projets de test, fermer les logiciels de test, redémarrer le service puis rouvrir ; vérifier toutes les associations et les deux directions. Tester renommage/déplacement/copie, changement de résolution/UV/modèle, calque géré renommé/déplacé/supprimé/dupliqué, réponse tardive et transfert simultané.

Ne jamais lancer ces scripts sur un projet personnel ouvert. Les scripts ne ferment pas un projet préexistant. Ne pas déclarer leurs résultats avant exécution.

# Texture 3D — prototype Photoshop

## Version 0.6.0 — connexion, matériaux et texture native

Cette section remplace les anciennes restrictions sur le matériau unique et le retour JPEG 2048 px. Le plugin Photoshop installé et l’extension Blender sont maintenant en version **0.6.0**.

- **Reconnexion** : Photoshop peut être fermé puis rouvert ; le document associé est retrouvé lorsqu’il est ouvert. Le service conserve le dernier modèle et sa texture après redémarrage. Dans Blender, **Reprendre la peinture** rétablit le projet enregistré et **Reconnecter** rétablit la liaison. Les messages distinguent Photoshop et Blender déconnectés. Un retour reste confirmé par la scène Blender destinataire.
- **Matériaux conservés** : le retour modifie la couleur de base sur une copie du matériau source. Métal, rugosité, normales et leurs connexions restent en place. Les objets non concernés qui partagent le matériau d’origine restent inchangés. Les retours suivants réutilisent les matériaux et l’image gérés par le projet.
- **PNG natif** : la texture est exportée sans les guides UV, sans compression JPEG ni réduction à 2048 px. Les dimensions du document sont conservées jusqu’à 8192 px par côté, avec un PNG limité à 128 Mio. Le retour transmet directement ce PNG à Blender, y compris sa profondeur 16 bits ; l’aperçu du navigateur reste en 8 bits et dépend de la limite de texture de la carte graphique. Un document trop grand produit un message explicite.
- **Plusieurs matériaux** : tous les emplacements réellement utilisés des objets sélectionnés sont regroupés dans un atlas partagé, avec une zone et un libellé par objet/matériau. Un seul PSD permet de peindre l’ensemble. Les affectations des faces aux matériaux restent conservées dans Blender. L’atlas peut être agrandi pour préserver la résolution des images sources, dans la limite de 8192 px.

Préparer les UV dans le carré 0–1 puis lancer **Nouveau projet** pour profiter du nouvel atlas. Les anciens projets peuvent toujours être repris. Les matériaux pris en charge ont un **Principled BSDF directement relié à la sortie**, avec une couleur de base uniforme ou une texture image directement reliée. Les textures procédurales, les transformations de coordonnées, les images animées et les UDIM demandent une préparation manuelle ; aucun baking automatique n’est effectué. Un cas incompatible est signalé avant création du projet. Aucun compactage automatique des UV n’est effectué.

**Ctrl + S dans Photoshop actualise uniquement le viewer. Envoyer dans Blender reste manuel.** Le groupe verrouillé **Repère UV**, avec ses lignes et libellés, est visible dans Photoshop mais exclu du PNG transmis. La peinture reste sur le calque **Peinture**, hors du groupe. Enregistrer le `.blend` pour conserver les associations et les matériaux reçus.

Vérifications : transfert réel Blender → Photoshop installé → PNG 4096 × 256 en 16 bits → même scène Blender ; deux matériaux conservés, image 16 bits intégrée au `.blend`, retours répétés sans accumulation ; fermeture/réouverture de Photoshop ; redémarrage du service et routage vers la bonne scène ; exclusion/restauration des guides ; reprise de projets enregistrés et déplacés.

## Extension Blender 0.5.0 : reprendre un projet existant

Après création d’un projet, **Reprendre la peinture** devient le bouton principal du panneau Texture3D. Il rouvre le même PSD et le GLB du projet, reconnecte le viewer et rétablit le retour de texture sur les objets d’origine. Aucune sélection n’est nécessaire pour reprendre. **Nouveau projet** crée toujours un dossier et une peinture distincts ; l’avertissement de sélection incomplète reste présent pour ce lancement.

**Enregistrer le fichier `.blend` après création, première reprise d’un ancien projet ou déplacement du PSD** : le chemin du projet, les identifiants des objets et leur association UV sont enregistrés dans la scène. Les objets peuvent être renommés. Un maillage ou des UV modifiés, un objet supprimé ou des identifiants dupliqués entraînent un message demandant un nouveau projet, au lieu d’appliquer une peinture à un objet incertain. Le modèle affiché à la reprise est l’export enregistré du projet ; reprendre ne réexporte pas un modèle modifié.

**Retrouver le PSD** permet de choisir son nouvel emplacement. Si tout le dossier de projet a été déplacé, choisir le PSD dans ce dossier récupère aussi le modèle et les métadonnées voisins. Un PSD manquant n’est jamais remplacé automatiquement par un document vide pendant une reprise. Les anciens projets qui disposent déjà d’un chemin enregistré dans le `.blend` peuvent être adoptés à leur première reprise si leurs objets et leurs cartes UV ont gardé leurs noms d’origine. Les projets nouvellement créés utilisent des identifiants persistants.

La version 0.5.0 concerne l’extension Blender ; le plugin Photoshop reste en version 0.4.1. Enregistrer son travail puis redémarrer Blender une fois pour charger l’extension mise à jour. Les calques sont rendus visibles à l’ouverture, conformément au comportement précédent ; la peinture et la structure du PSD sont conservées.

Vérifications : `node test-project-resume.cjs` utilise deux processus Blender distincts pour créer/enregistrer puis rouvrir une scène, retrouver les objets renommés sans sélection, préserver le PSD et le modèle, retrouver un PSD ou un dossier déplacé, refuser les associations ambiguës et les UV modifiés, puis appliquer un vrai retour GLB sans doublonner les objets. La reprise Photoshop a aussi été vérifiée sur un PSD existant à trois calques, sans réécriture du fichier ; un PSD absent est refusé sans création de remplacement.

## Version 0.4.1 : import depuis Blender et calques visibles

Le bouton d’import manuel GLB et son sélecteur de fichier sont retirés de la grande fenêtre : le modèle vient de Blender. Lorsqu’un projet est ouvert par **Peindre dans Photoshop**, tous ses calques et groupes sont rendus visibles, y compris **Repère UV**. Ce guide sert uniquement à peindre : le plugin l’exclut temporairement pendant la capture, puis rétablit le document par annulation des changements d’historique temporaires. Il reste donc visible dans Photoshop, sans apparaître sur le modèle 3D ni dans le retour Blender. Les autres calques suivent leur visibilité au moment de la capture.

La mise à jour du plugin installé nécessite un redémarrage de Photoshop après avoir enregistré son travail. Actualiser également le viewer pour retirer son ancien bouton d’import. Tests : `test-guide-exclusion.cjs` vérifie l’exclusion du guide et la restauration du document en cas de réussite ou d’erreur ; `test-studio.cjs` vérifie l’absence des commandes d’import et le fonctionnement de l’interface.

## Installation permanente et démarrage automatique — version 0.4.0

**Texture3D Studio est installé et activé dans Photoshop 27.11 sur cette machine. UXP Developer Tools n’est plus nécessaire au quotidien.** Le plugin installé a l’identifiant `fr.texture3d.studio` et se charge automatiquement au démarrage de Photoshop. Ne pas charger en parallèle l’ancienne version de développement `fr.texture3d.preview`, car les deux utiliseraient la même connexion locale.

Depuis Blender : sélectionner les maillages, puis **Peindre dans Photoshop**. Photoshop est lancé automatiquement, le PSD s’ouvre, et l’extension attend la connexion du plugin jusqu’à 30 secondes. La grande fenêtre s’ouvre avec le modèle associé. Ctrl + S dans Photoshop actualise le viewer ; **Envoyer dans Blender** reste manuel. Aucun petit panneau Photoshop ne s’ouvre.

Pour réinstaller ou mettre à jour : fermer Photoshop après avoir enregistré son travail, puis installer `distribution/fr.texture3d.studio_PS.ccx` avec Creative Cloud Desktop (double-clic) ou exécuter `INSTALLER_PHOTOSHOP.ps1`, qui utilise l’installateur officiel Adobe UPIA. Redémarrer Photoshop après installation. Le service local et le plugin doivent provenir du même paquet afin de partager leur configuration de connexion. Le dossier de l’outil doit rester présent pour le viewer et l’extension Blender. Ce fichier CCX n’installe que la connexion Photoshop, pas Blender ni Node.js.

Vérification effectuée : installation reconnue et activée par UPIA, démarrage de Photoshop depuis Blender sans processus UXP Developer Tools, association du nouveau PSD, réception de sa texture, puis nouvelle capture après un véritable enregistrement Photoshop. Le script `test-installed-startup.py` crée un projet de test neuf pour ce parcours. Le paquet CCX est créé par UXP Developer Tools à partir du dossier réduit préparé par `node build-distribution.cjs` ; cet outil reste utile au développement et à l’empaquetage, pas à l’utilisation.

Les anciennes mentions de chargement manuel via UXP Developer Tools dans les sections suivantes sont remplacées par cette installation permanente.

## Une seule interface : la grande fenêtre

Le petit panneau Photoshop et sa miniature 3D ont été retirés. Le plugin Photoshop est désormais une connexion sans panneau : il écoute les enregistrements et transmet les textures à la grande fenêtre. Toutes les commandes visibles se trouvent dans celle-ci. Le plugin doit toujours être chargé via UXP Developer Tools dans ce prototype ; sa commande **Plugins > Texture 3D — Aperçu > Ouvrir Texture 3D** ouvre la grande fenêtre lorsque le service local est lancé. Le raccourci `OUVRIR_VIEWER.vbs` et le lancement depuis Blender restent disponibles.

Cette modification remplace les anciennes instructions de ce document faisant référence au petit panneau ou à sa commande « Fenêtre séparée ». Vérification en Photoshop : connexion active et capture d’une nouvelle texture sans WebView ni panneau Photoshop.

## UV hors du carré : compactage manuel

Le compactage automatique a été retiré. Si les UV d’un objet dépassent le carré 0–1, le lancement est interrompu avec un message : sélectionner tous les îlots dans Édition d’UV, utiliser **UV > Compacter les îlots**, puis réessayer. Aucun recalcul automatique de couleur ni déplacement automatique des îlots n’est effectué.

Après installation de cette mise à jour : enregistrer son travail et redémarrer Blender.

## Mise à jour : sélection multiple et retour dans la scène ouverte

Le bouton Blender accepte désormais **tous les maillages sélectionnés**, avec au moins un maillage sélectionné en mode Objet. Caméras et lumières sont ignorées. Chaque maillage doit avoir ses UV 0–1 et un seul matériau utilisé, selon les restrictions de couleur décrites plus bas. Avec plusieurs objets, leurs images sont regroupées dans un atlas et leurs UV d’export occupent des cases distinctes. La résolution choisie est celle de l’atlas complet ; chaque objet reçoit une partie de cette surface. Les UV et matériaux source restent intacts pendant l’export.

**Envoyer dans Blender** applique maintenant la texture aux **objets d’origine dans la fenêtre qui a lancé le projet**. Il ne crée plus de nouvelle scène ni de nouvelle fenêtre. La géométrie et les transformations sont conservées ; le retour ajoute une carte UV d’atlas et remplace les matériaux attribués aux objets par des matériaux utilisant la couleur peinte. Les anciens matériaux restent dans les données Blender. Les autres canaux de matériau (normal, rugosité, etc.) ne sont pas repris par ce prototype. Le retour conserve la qualité de l’aperçu Photoshop (JPEG, jusqu’à 2048 px).

Après cette mise à jour, enregistrer son travail et redémarrer Blender, puis relancer **Peindre dans Photoshop** pour établir l’association à la scène. Actualiser aussi la fenêtre du viewer pour charger son nouveau texte de confirmation. Si l’extension n’est pas connectée ou si le projet n’a pas été lancé par cette session Blender, le retour explique la démarche au lieu d’ouvrir une nouvelle instance. Le fichier `.blend` n’est jamais enregistré automatiquement après un retour : utiliser Ctrl + S dans Blender pour conserver les nouveaux matériaux.

Ces comportements remplacent les anciennes indications de ce document concernant la sélection d’un seul objet et la création d’un nouveau `.blend` par le bouton de retour. Tests : `test-multi-blender.py` (deux objets, atlas, retour réel de texture GLB, répétition du retour, préservation des sources) et `test-return-bridge.cjs` (routage entre sessions et confirmation effective de réception).

## Commencer depuis Blender

L’extension **Texture3D — Peindre dans Photoshop** est installée et activée sur cette machine dans Blender 5.1.

1. Dans Blender, sélectionne **un seul objet mesh**, avec ses UV déjà dépliés, en mode Objet.
2. Place la souris dans la vue 3D, appuie sur **N**, puis ouvre l’onglet **Texture3D**.
3. Choisis la résolution de la nouvelle texture : 1024, 2048 ou 4096. Si une image couleur existe déjà, sa résolution est conservée.
4. Clique **Peindre dans Photoshop**. La préparation peut prendre quelques secondes ; Blender reste disponible pendant le lancement de Photoshop.
5. Peins dans le calque **Peinture**, puis **Ctrl + S** pour voir le résultat sur le modèle. Au premier enregistrement, Photoshop peut demander une confirmation de compatibilité du PSD.

Le bouton exporte le modèle sélectionné en GLB, prépare une image couleur et un patron UV, crée un PSD à trois calques (**Peinture**, **Repère UV** masqué/verrouillé et **Couleur de base**), ouvre le viewer et associe le document automatiquement. Chaque lancement crée un dossier distinct dans **projet photoshop/Projets Texture3D**. Le bouton **Ouvrir le dossier du projet** donne accès au PSD, au GLB et aux images. Le fichier `.blend` source et ses matériaux ne sont pas modifiés par l’export. L’extension ne met pas encore à jour le matériau de la scène Blender après la peinture.

**Prérequis actuels :** Windows, Blender 5.1, Photoshop installé avec son interface COM, Node.js et le plugin Photoshop Texture3D chargé via UXP Developer Tools. Le lancement de Photoshop est automatique ; le chargement du plugin UXP ne l’est pas encore. Si le plugin est fermé, le PSD et le viewer s’ouvrent, puis les commandes attendent sa connexion tant que le service local reste actif. Ouvre/charge le panneau Texture 3D pour terminer l’association. Pour le prototype : lancer UXP Developer Tools, puis **Load** sur Texture 3D — Aperçu.

**Périmètre de cette version :** un objet, un matériau utilisé et une texture couleur carrée, UV de rendu dans le carré 0–1. Une image directement reliée à la couleur de base d’un Principled BSDF est conservée ; une couleur unie devient une image. Les montages procéduraux, transformations de coordonnées, UDIM, textures animées et objets avec plusieurs matériaux utilisés sont refusés avec un message. Le viewer reçoit toujours un aperçu JPEG limité à 2048 pixels ; le PSD conserve sa résolution d’origine, jusqu’à 4096 pixels pour ce lancement.

### Installer l’extension sur une autre installation Blender

L’archive **Texture3D-Blender.zip** contient l’extension. Dans Blender, Préférences > Extensions/Add-ons > menu > **Installer depuis le disque**, sélectionner ce ZIP puis activer Texture3D. Dans ses préférences, indiquer le dossier de l’outil contenant `companion.cjs`. Cette archive seule ne remplace pas l’installation du viewer, de Node.js et du plugin Photoshop.

Le script `install-blender-addon.py`, exécuté par Blender en arrière-plan, installe la version locale dans les scripts utilisateur et enregistre son activation. `test-blender-addon.py` vérifie réellement l’export GLB/UV, la reprise d’une image, la préservation des données source et le refus d’UV hors du carré 0–1. Le bouton a aussi été testé dans l’interface Blender avec création du PSD, association automatique et actualisation après Ctrl + S.

## Interface Studio — cyan et violet sombre

La fenêtre complète utilise une nouvelle palette cyan et violet sombre. Le panneau regroupe Document, Modèle, Synchronisation et le transfert Blender. Le bouton **Panneau** en haut à droite affiche ou masque ces commandes ; le panneau est replié au démarrage dans les petites fenêtres. Les pastilles sous Modèle changent le fond entre violet sombre, gris et clair. Le gizmo et la caméra conservent leurs comportements.

La barre flottante en bas contient Recentrer, Plein écran et l’aide « ? ». Le statut relatif à la dernière texture apparaît en bas à droite ; la connexion à Photoshop est indiquée en haut. Actualise le viewer pour charger la nouvelle interface.

Vérifications : affichage de 380 à 1400 pixels, absence de débordement horizontal, panneau repliable, sélection du fond, plein écran, commande d’import, navigation, actualisation de texture et création d’un GLB/.blend par le bouton Blender.

## Navigation et orientation

La rotation et le déplacement ont une inertie adoucie. La molette applique un zoom progressif. Le gizmo en haut à droite suit l’orientation du modèle : clique sur X, Y ou Z (ou leur côté négatif) pour passer à une vue de droite/gauche, dessus/dessous ou face/dos. La caméra rejoint cette vue avec une transition, autour du centre actuellement visé.

Le bouton **Recentrer** et le double-clic dans la vue rétablissent le cadrage avec une transition. Une manipulation manuelle interrompt la transition. Le bouton **?** affiche les gestes disponibles ; la ligne d’instructions permanente a été supprimée. Les commandes latérales peuvent être masquées pour agrandir la vue. Actualise la fenêtre du viewer après une mise à jour de ses fichiers pour charger cette navigation.

## Envoyer dans Blender

Dans la fenêtre complète, clique **Envoyer dans Blender**. Le plugin doit être chargé dans Photoshop et un document de texture doit être associé. Le bouton récupère les derniers calques visibles, même si le PSD n’a pas encore été enregistré, puis prépare un GLB et un `.blend` dans **projet photoshop/Exports Blender**. Une nouvelle fenêtre Blender s’ouvre sur cette scène : UV conservés, texture intégrée, matériau attribué à toutes les faces et aperçu matériau activé. Les scènes déjà ouvertes restent séparées.

Chaque envoi crée des fichiers distincts. C’est un transfert ponctuel ; modifier Photoshop ensuite ne modifie pas cette scène Blender. La texture exportée utilise la qualité actuelle de l’aperçu (JPEG, maximum 2048 pixels). L’ouverture automatique est configurée pour Blender 5.1 installé sur cette machine.

## Vue redimensionnable et fenêtre séparée (version 0.2)

Le viewer intégré occupe maintenant l’espace disponible : agrandis le panneau par ses bords, ou détache son onglet pour le placer ailleurs. La caméra conserve son angle pendant le redimensionnement.

Pour une fenêtre indépendante de Photoshop :

1. Double-clique **OUVRIR_VIEWER.vbs** dans ce dossier. Il démarre le relais local et ouvre une fenêtre dédiée Microsoft Edge, sans barre d’onglets.
2. Dans le panneau Photoshop, clique **Fenêtre séparée ↗**. Le modèle importé et la dernière texture sont transmis.
3. Déplace cette fenêtre sur ton second écran, agrandis-la avec le bouton Windows de maximisation, ou clique **Plein écran**. **Échap** quitte le plein écran.
4. Peins dans Photoshop et fais **Ctrl + S** : la vue intégrée et la fenêtre séparée reçoivent la nouvelle texture. Chaque vue conserve sa propre caméra.

Si le relais local est déjà démarré, le bouton **Fenêtre séparée ↗** ouvre directement la fenêtre. Après un redémarrage de Windows, relance **OUVRIR_VIEWER.vbs**. Le panneau Photoshop doit rester chargé pour envoyer les mises à jour. La fermeture du viewer ne ferme pas le relais ; celui-ci reste actif jusqu’à la fermeture de son processus Node ou la fin de session Windows.

La fenêtre séparée utilise Microsoft Edge et le Node.js déjà présent sur cette machine. Les échanges restent sur `127.0.0.1:18743` et sont protégés par une clé locale. Rien n’est envoyé sur Internet. Le fichier `companion-config.json` doit rester identique dans le dossier du plugin et celui du relais.

Vérifié sur cette machine : ouverture depuis Photoshop 27.11, réception de la texture dans la fenêtre Edge et nouvelle réception après Ctrl + S. Les tests automatiques vérifient aussi le redimensionnement portrait/paysage et l’entrée/sortie du plein écran. Un redémarrage de Photoshop peut être nécessaire après modification des permissions du manifeste. Le runtime a refusé la liste d’adresses locales ; le manifeste utilise donc `network.domains: "all"`, tandis que le code du plugin contacte uniquement l’adresse locale fixe ci-dessus.

Ce panneau affiche le cube fourni et applique l’image visible d’un document Photoshop à ses UV. La texture est actualisée quand Photoshop émet un événement d’enregistrement, ou avec le bouton Actualiser. Le PSD et ses calques ne sont pas modifiés par le plugin.

## Chargement dans Photoshop

1. Installe **UXP Developer Tool** depuis Creative Cloud Desktop (application Adobe pour développeurs).
2. Active le **Mode développeur** dans Photoshop : **Édition → Préférences → Plug-ins**. Redémarre Photoshop si demandé, après avoir sauvegardé tes documents.
3. Lance UXP Developer Tool et effectue son activation du mode développeur si demandée.
4. Laisse Photoshop ouvert. Dans UXP Developer Tool, clique **Add Plugin**, puis sélectionne le fichier **manifest.json** de ce dossier.
5. Sur la ligne du plugin, choisis **Load** dans le menu Actions.
6. Dans Photoshop, ouvre **Plug-ins → Texture 3D — Aperçu → Texture 3D** si le panneau n’apparaît pas automatiquement.

Guide Adobe : https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/udt-walkthrough/

## Premier essai

1. Ouvre `assets/CUBE_UV_2048.png` dans Photoshop.
2. Renomme le calque de contours **Repère UV**. Ajoute un fond blanc et un calque **Peinture** en dessous.
3. Peins des couleurs différentes dans plusieurs carrés UV, sans déplacer les contours ni recadrer le document.
4. Masque le calque **Repère UV** avant l’aperçu pour ne pas afficher ses lignes sur le cube.
5. Enregistre le document en PSD dans le dossier de ton choix.
6. Dans le panneau, clique **Associer le document actif**. Le cube fourni se charge automatiquement ; ne le réimporte pas.
7. Peins, puis appuie sur **Ctrl + S** avec le document de peinture actif. Le statut doit devenir **À jour**.
8. Glisse dans la vue 3D pour tourner, utilise la molette pour zoomer, ou le clic droit pour déplacer la vue.

Le bouton **Actualiser** permet aussi de voir les changements non enregistrés. **Recentrer** restaure la vue sur le modèle. Si tu ouvres un autre document de texture, associe-le explicitement.

## Limites du prototype

- Aperçu de la couleur seulement, sans relief ni propriétés métalliques. Matériau sans éclairage pour lire clairement la peinture.
- Copie d’aperçu JPEG, transparence affichée sur blanc, résolution maximale de 2048 pixels sur le grand côté. Le PSD original conserve sa qualité et ses calques.
- Import GLB simple, non compressé, avec UV ; limite de 25 Mo. Une texture est appliquée à tous les maillages du modèle. Pas encore d’association séparée par matériau, d’UDIM, de FBX direct ou de modèle compressé Draco/KTX2.
- Le panneau doit rester chargé. Après son rechargement, associe à nouveau le document.
- Un Ctrl + S sans changement peut ne pas déclencher de nouvel enregistrement ; utilise Actualiser si nécessaire.
- Chargement du panneau, lecture du composite et actualisation après Ctrl + S validés dans Photoshop 27.11 sur cette machine. Une surveillance légère de l’état enregistré complète les notifications save.

## En cas de problème

- **Vue vide** : agrandis le panneau, puis relève le message affiché. Vérifie WebView2 et la disponibilité de WebGL sur la machine.
- **Le bouton Actualiser marche mais pas Ctrl + S** : vérifie la case d’actualisation et le document associé. Fais une vraie modification puis enregistre. Les événements exacts de cette version devront être inspectés si le problème persiste.
- **Traits noirs sur le cube** : masque le calque des contours UV.
- **Mauvais placement** : utilise le patron du modèle et ne déplace pas les UV. Si plusieurs surfaces partagent les mêmes UV, elles partageront aussi la peinture.
- **Erreur de chargement** : copie le message UXP Developer Tool ; le dossier contient déjà le visualiseur compilé, aucune commande npm n’est nécessaire pour le charger.

## Développement

`npm install`, puis `npm run build`. `npm run check` vérifie la syntaxe. `node test-viewer.cjs` teste le rendu avec Edge installé sur Windows. Aucun service réseau n’est utilisé par le plugin.

La bibliothèque Three.js (MIT) et son avis de licence sont fournis dans `THREE-LICENSE.txt`.

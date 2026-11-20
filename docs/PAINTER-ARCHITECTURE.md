# Architecture Painter — branche de développement

## Principe
Le plugin exporte des copies et gère uniquement les ressources associées. Aucun code de production ne crée de calque, n’affecte de canal ou ne sauvegarde le SPP. Les modifications de calques dans test-native-painter.py sont limitées au projet temporaire créé par le test.

## Parcours actuel
1. Plugin Python/Qt : API Painter sur le thread principal ; export OBJ temporaire et lecture des UV 0–1.
2. Conversion OBJ triangulé → GLB, PSD commun, métadonnées locales d’association.
3. Service Node local authentifié, états Painter/Blender séparés ; lancement Photoshop par COM.
4. UXP : PNG original, guides temporairement cachés puis historique restauré ; mise à jour du viewer.
5. Retour manuel ou automatique opt-in : PNG temporaire, SHA-256, identification du projet, réception confirmée, nettoyage après succès/erreur.
6. Painter vérifie à nouveau le projet, les matériaux, la résolution, la signature UV et l’intégrité/décodage du PNG avant import.

## Propriété des ressources
resource-binding.json reste dans le dossier local de l’association. Il contient projet, identifiant d’association, nom et URLs versionnées réellement importées. Aucun remplacement fondé uniquement sur le nom. Une collision, une association incompatible ou une ressource disparue provoque un refus. Aucune adoption automatique d’une ancienne ressource dont la propriété n’est pas connue. Les versions possédées sont enregistrées avant le remplacement des utilisations pour permettre une reprise après erreur. Aucune ancienne ressource n’est supprimée.

Limites : le registre n’est pas embarqué dans le SPP ; déplacement de projet et changement de machine exigent une procédure d’association explicite encore à développer. Une panne disque après import mais avant écriture du registre peut laisser une ressource non associée ; les tentatives suivantes refusent de la remplacer.

## Automatisation
Désactivée par défaut et limitée à la liaison en mémoire. Debounce 400 ms ; une capture en attente remplace la précédente. Un seul import actif par association, puis traitement de la dernière capture. Empreinte du dernier import confirmé pour éviter les doublons automatiques. Les captures demandées par une commande manuelle ne déclenchent pas un second envoi automatique. Désactiver supprime l’attente, sans annuler un import déjà remis à Painter. Reconnexion : nouvelle activation explicite requise. Une erreur n’entraîne pas de réimportation aveugle.

## Évolutions prévues
Texture Sets indépendants et canaux de référence : introduire des associations versionnées sans toucher au mode commun Blender. PBR : typer les textures et leur espace colorimétrique avant de changer le matériau du viewer. Ne pas fusionner ces étapes avec la stabilisation des transferts.

## Extensions expérimentales en cours

Un PSD par Texture Set et canal BaseColor/Roughness/Metallic est désormais préparé explicitement depuis le panneau ; les Texture Sets utilisent leur nom d’origine pour l’identité et le nom affiché pour l’interface. Le document commun reste disponible pour Base Color. Les imports créent uniquement des ressources. Le viewer reçoit plusieurs textures par scène ; les cartes Roughness/Metallic sont marquées sans espace sRGB et le rendu Standard est activable. Ce rendu n’est pas encore validé comme équivalent à Painter.

Les PNG importés sont copiés par empreinte dans resource-assets avant appel Adobe. Ces fichiers sont durables et ne doivent pas être nettoyés comme des fichiers de transport. L’historique des identifiants de jobs terminés est borné à 2048 entrées.

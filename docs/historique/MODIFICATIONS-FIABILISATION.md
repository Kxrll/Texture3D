# Corrections locales — Blender / Photoshop

- Refus des noms de PSD ambigus (aucun choix arbitraire entre deux copies).
- Mémorisation des identifiants des guides reconnus pour résister au renommage ; refus si un guide connu disparaît.
- Retour Blender limité à la version exacte de texture demandée.
- PNG de transfert supprimé après retour ou échec ; anciens fichiers orphelins reconnus nettoyés après 24 h au démarrage.
- Cache de session : binaires séparés et adressés par contenu, migration en lecture de l’ancien JSON.
- Confirmation de sélection rétablie, avec choix sélection seule ou tous les maillages visibles.
- Mémoire réduite : allocation inutile supprimée, masques UV calculés par bandes, couleurs unies sans tampon plein format, réutilisation directe des pixels à résolution égale.
- Nettoyage des projets nouvellement créés en cas d’échec de préparation et suppression du code de retour atlas inaccessible.
- Installateur : restauration des informations Windows et du raccourci après échec tardif. Conservation des trois dernières sauvegardes complètes de paquets ; les fichiers personnels des sauvegardes anciennes restent conservés.
- Commande npm test regroupant les tests de transfert et de capture.

Validation : tests Node simulés, tests Blender réels (UV inchangés, choix de sélection et échec de préparation), tests de mise à jour en environnement isolé avec échecs injectés. Non-régression Painter testée sans modifier ses sources spécifiques.

Limites restantes : pas de mesure complète de pic RAM en 8K ; les images à redimensionner utilisent encore un tampon complet. Le guide doit être reconnu au moins une fois avant renommage. Les permissions réseau UXP restent inchangées et la CI GitHub reste à mettre en place. Pas de nouvel installateur, pas de modification des plugins installés, pas de publication GitHub. Une recette Photoshop réelle reste nécessaire avant diffusion.

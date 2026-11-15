# Sélection, isolation et repérage UV

Ces commandes sont disponibles dans le viewer Blender. Elles ne modifient pas le PSD, les UV, la scène Blender ou les textures exportées.

1. Cliquer sur une pièce du modèle ou sur son nom dans **Objets** pour la sélectionner. Un glissement continue à tourner la caméra.
2. **Isoler** masque les autres pièces et cadre la sélection. **Tout afficher** rétablit leur visibilité. Le bouton à gauche de chaque nom permet aussi de masquer une pièce individuellement.
3. Activer **Repérer UV**, puis cliquer sur une surface du modèle. L’aperçu montre la texture, le triangle touché et le point correspondant. X et Y sont les coordonnées en pixels depuis le coin supérieur gauche, à partir de zéro.
4. Les boutons + / − ou la molette zooment autour du point. Glisser dans l’aperçu pour le déplacer ; **Ajuster** réaffiche toute la texture.

L’aperçu suit les actualisations Photoshop sans ajouter de dessin à la texture. Les coordonnées tiennent compte de la résolution originale même si le viewer réduit son aperçu pour le GPU.

Un objet Blender avec plusieurs matériaux reste regroupé grâce aux métadonnées des nouveaux exports. Les anciens modèles sans ces métadonnées peuvent apparaître en plusieurs morceaux : préparer un nouveau projet depuis les sources actualisées pour obtenir le regroupement, en conservant les anciens PSD.

Un bras appartenant au même objet Blender que le corps ne devient pas un objet indépendant. Le repérage concerne un point et son triangle, pas encore tout l’îlot UV. Des UV superposés partagent le même emplacement sur l’image.

Validation : `npm run build`, puis `node test-object-tools.cjs` (Edge installé). Le test Blender `test-texture-sets.py` contrôle aussi les métadonnées de regroupement et la conservation des UV.

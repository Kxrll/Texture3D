# Performances Painter — état initial

Aucun benchmark contrôlé de RAM, CPU ou latence médiane effectué. Aucun résultat 4K/8K natif revendiqué.

Vérifications réalisées : projet Painter natif en 2048 ; PNG Photoshop 2048 × 2048, 8 bits ; tests simulés du transport d’un PNG 4096/16 bits. Les scripts de tests s’exécutent en quelques secondes, mais leur durée totale n’est pas une mesure de latence artistique.

Points à mesurer : export OBJ et conversion GLB sur le thread UI ; revalidation UV avant chaque import ; décodage QImage pour contrôler le PNG ; copies listes d’octets/Base64/JSON ; écritures synchrones Node ; mémoire GPU ; tracé UV recalculé à chaque déplacement. Le cache binaire adressé par contenu de la bêta concerne surtout Blender, pas un cache Painter complet.

Protocole : projet isolé, 1024 puis 2048/4096/8192, 8/16 bits, dix sauvegardes, textures unies et bruitées, plusieurs matériaux. Relever pic mémoire des trois applications, temps export/capture/transfert/import/affichage et pauses UI. Conserver séparément première capture, médiane et pire cas ; ne pas autoriser la 8K sur la seule base d’une taille maximale dans le code.

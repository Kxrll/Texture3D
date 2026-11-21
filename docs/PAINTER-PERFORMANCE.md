# Performances Painter — état initial

Aucun benchmark contrôlé de RAM, CPU ou latence médiane effectué. Aucun résultat 4K/8K natif revendiqué.

Vérifications réalisées : projet Painter natif en 2048 ; PNG Photoshop 2048 × 2048, 8 bits ; tests simulés du transport d’un PNG 4096/16 bits. Les scripts de tests s’exécutent en quelques secondes, mais leur durée totale n’est pas une mesure de latence artistique.

Points à mesurer : export OBJ et conversion GLB sur le thread UI ; revalidation UV avant chaque import ; décodage QImage pour contrôler le PNG ; copies listes d’octets/Base64/JSON ; écritures synchrones Node ; mémoire GPU ; tracé UV recalculé à chaque déplacement. Le cache binaire adressé par contenu de la bêta concerne surtout Blender, pas un cache Painter complet.

Protocole : projet isolé, 1024 puis 2048/4096/8192, 8/16 bits, dix sauvegardes, textures unies et bruitées, plusieurs matériaux. Relever pic mémoire des trois applications, temps export/capture/transfert/import/affichage et pauses UI. Conserver séparément première capture, médiane et pire cas ; ne pas autoriser la 8K sur la seule base d’une taille maximale dans le code.


## Complément Round Trip local du 20 novembre

Voir [PAINTER-ROUNDTRIP.md](PAINTER-ROUNDTRIP.md) pour l’état le plus récent : bouton d’import, catalogue réel, PSD par carte/set, retour via association, reprise multiple et verrouillage. Les validations natives de cette nouvelle chaîne sont en attente de la séance utilisateur ; les mentions historiques ne valent pas validation de ces changements. Aucun benchmark nouveau ni exécution CI distante revendiqué. Les cartes avancées et masques restent exclus de l’interface faute de validation technique suffisante.


## Optimisations implémentées pendant la finalisation
Cache Path2D du tracé UV par mesh/version/transform, invalidé au changement de modèle ou texture. Vérification de l’URL déjà chargée avant décodage d’une texture par set/canal. Frames suspendues lorsque le viewer est masqué. Le GLB du projet Painter est mis en cache par UUID et empreinte du maillage ; premier export triangulé si nécessaire, puis réutilisation. Le maillage de base reste exporté pour vérifier la compatibilité UV/topologie. La réception COM et ses échanges réseau sont sortis du thread UI Painter.

texture_export.export_channel renvoie exportDurationMs mesuré par perf_counter pour chaque export. Le script natif préparé collecte ces durées mais aucune valeur n’est revendiquée avant son exécution. Les opérations bpy/Adobe restent sur leur thread principal. Le protocole historique Base64/JSON et certaines écritures synchrones du companion restent conservés pour compatibilité ; il ne s’agit pas d’une refonte binaire complète.

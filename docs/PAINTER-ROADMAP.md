# Feuille de route Painter

État au 19 novembre 2026 ; branche feature/painter-integration. Aucun push ni nouvelle release.

| Étape | État | Condition de passage |
|---|---|---|
| A Audit/stabilisation | En cours ; corrections locales et tests natifs ciblés | Compléter non-destruction, collisions natives, changements de projet/UV et reprise |
| B Synchronisation opt-in | Implémentation locale, tests simulés et premier import automatique natif réussi | Dix sauvegardes, dernière version livrée, reconnexion et désactivation |
| C Texture Sets indépendants | Non implémenté | Identifiants persistants et mapping matériaux du GLB ; préserver mode commun |
| D PBR | Non implémenté | Base Color puis Roughness/Metallic ; 8/16 bits et espaces colorimétriques vérifiés |
| E Ressources | Registre local de propriété implémenté | Migration explicite des anciennes associations, déplacement/reprise et collisions natives |
| F Painter → Photoshop | Guide/modèle présents ; export des canaux absent | Export d’une copie indépendante, aucun changement des piles de calques |
| G Finalisation | Documentation initiale | CI locale ajoutée (pas encore exécutée sur GitHub), performances, UX, installateur optionnel et campagne complète |

Ne pas publier ni modifier main. Ne pas qualifier une fonctionnalité de validée dans les applications sur la seule base d’un mock. Le support UDIM reste refusé explicitement. La limite 8192 du code ne constitue pas une validation 8K.

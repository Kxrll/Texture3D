# État de finalisation du Round Trip

La table historique ci-dessous est l’audit de départ. Pour l’état actuel du code, consulter PAINTER-FINALISATION.md et PAINTER-ROUNDTRIP.md.

Code ajouté : import depuis le viewer, export natif, catalogue réel, PSD par set/carte/stack, retour via association, Emissive, quatre cartes avancées expérimentales, reprise multiple, contrôle des calques gérés, intégrité des PNG, routage de session, concurrence, durée export, inventaire et optimisations viewer. Les essais natifs restent la condition de validation convenue avec l’utilisateur. Les masques calculés individuels ne sont pas revendiqués exportables par une API bitmap vérifiée.

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


## Complément Round Trip local du 20 novembre

Voir [PAINTER-ROUNDTRIP.md](PAINTER-ROUNDTRIP.md) pour l’état le plus récent : bouton d’import, catalogue réel, PSD par carte/set, retour via association, reprise multiple et verrouillage. Les validations natives de cette nouvelle chaîne sont en attente de la séance utilisateur ; les mentions historiques ne valent pas validation de ces changements. Aucun benchmark nouveau ni exécution CI distante revendiqué. Les cartes avancées et masques restent exclus de l’interface faute de validation technique suffisante.

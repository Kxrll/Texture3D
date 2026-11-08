# Travail sur Texture3D

Le propriétaire demande de mettre à jour le dépôt GitHub Kxrll/Texture3D uniquement lorsqu’il le demande explicitement. Les modifications restent locales entre ces demandes.

- Lire les changements distants et locaux avant de travailler ; préserver les modifications de l'utilisateur.
- Après une modification autorisée, effectuer les vérifications adaptées. Ne pas créer de commit ni pousser sur GitHub automatiquement. À la demande explicite de synchronisation, créer un commit des fichiers concernés et pousser sur origin sans force-push. Si le push est impossible, l'indiquer clairement.
- Ne jamais envoyer companion-config.json, les identifiants locaux, les caches, les sauvegardes personnelles, les PSD ou les projets Blender.
- Les archives et exécutables de distribution sont des pièces jointes de release ; ne pas les ajouter à l'historique Git. Ne pas publier de nouvelle release automatiquement pour une simple modification des sources.
- Sur un nouveau poste : npm ci, node init-config.cjs, npm run build. La configuration locale doit correspondre à celle du plugin Photoshop utilisé.

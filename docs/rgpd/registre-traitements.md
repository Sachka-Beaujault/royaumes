# Registre des traitements de données personnelles

Ce registre, prévu par l'article 30 du RGPD, recense les traitements de données personnelles
réalisés par Royaumes. Il est tenu à jour à chaque évolution du jeu qui ajoute, modifie ou
supprime une donnée personnelle, dans le même commit que cette évolution.

- Responsable du traitement : Sachka Beaujault, sachka.beaujault@gmail.com.
- Date de dernière mise à jour : 2026-10-23.

## Sous-traitants

| Sous-traitant | Rôle | Localisation des données | Garanties à vérifier |
| --- | --- | --- | --- |
| Vercel | Hébergement de l'application, journaux techniques | Région de Francfort (fra1) pour les fonctions | Accord de traitement des données (DPA) publié par Vercel ; transferts hors de l'Espace économique européen encadrés par les clauses contractuelles types de l'Union européenne et l'addendum britannique. À vérifier : la version consultée du DPA date du 31 mars 2023, et son application à l'offre Hobby reste à confirmer |
| Neon | Hébergement de la base de données | Région de Francfort | Accord de traitement des données (DPA) intégré aux conditions d'utilisation, et disponible en version signée ; base hébergée en région de Francfort ; Neon Inc. est une société américaine, et ses sous-traitants sont publiés par Neon. À vérifier : les clauses encadrant les transferts hors de l'Union européenne |

## Traitements

| N° | Traitement | Finalité | Données | Personnes concernées | Base légale | Durée de conservation | Emplacement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Comptes des joueurs | Permettre l'accès au jeu | Nom, adresse électronique, empreinte du mot de passe, date d'inscription | Joueurs | Exécution du contrat (conditions d'utilisation du jeu) | Jusqu'à la suppression du compte | `identity.user`, `identity.account` |
| T2 | Sessions | Maintenir la connexion ; limiter les tentatives de connexion | Adresse IP, navigateur, dates de la session | Joueurs | Exécution du contrat ; intérêt légitime (sécurité) | Jusqu'à l'expiration de la session, ou la suppression du compte | `identity.session` |
| T3 | Activité de jeu | Faire fonctionner le Village, le Donjon, le Marché et le Classement | Identifiant, nom du joueur, nom du village, actions de jeu | Joueurs | Exécution du contrat | Jusqu'à la suppression du compte ; ensuite, identifiant pseudonymisé et noms remplacés (ADR 0008) | `platform.events`, `platform.outbox`, `ranking`, `dungeon`, `market` |
| T4 | Messagerie de la Taverne | Permettre aux joueurs de discuter | Contenu des messages, auteur, date | Joueurs | Exécution du contrat | Trente jours, ou jusqu'à la suppression du compte | `tavern.messages` |
| T5 | Présence dans la Taverne | Indiquer les joueurs présents | Identifiant, nom, date du dernier signal | Joueurs | Exécution du contrat | Deux minutes après le dernier signal | `tavern.presence` |
| T6 | Registre des effacements | Démontrer la réalisation des effacements | Date de l'effacement, nombre d'événements réécrits ; aucune donnée sur le joueur | Aucune personne identifiable | Obligation légale (responsabilité, article 5) | Illimitée | `platform.erasures` |
| T7 | Journaux techniques | Diagnostiquer les erreurs, assurer la sécurité | Adresse IP, adresses des requêtes, messages d'erreur | Joueurs, visiteurs | Intérêt légitime (sécurité, maintenance) | Environ une heure, durée de conservation des journaux d'exécution de l'offre Hobby de Vercel | Vercel |
| T8 | Appartenance aux guildes et Faille | Faire fonctionner les guildes, le changement de guilde et la Faille ; établir le classement des guildes | Identifiant du joueur, guilde actuelle, historique de ses changements et de ses participations à la Faille ; nom du joueur dans les expéditions qu'il a ouvertes ou rejointes, son rôle et ses actions de jeu | Joueurs | Exécution du contrat | Jusqu'à la suppression du compte ; ensuite, identifiant pseudonymisé et nom remplacé dans les expéditions (ADR 0008) | `platform.events` (flux `guild-member-*` et `guild-rift-*`), `guild.open_runs` |
| T9 | Chats de guilde | Permettre aux membres d'une guilde de discuter entre eux | Contenu des messages, auteur, nom de l'auteur, guilde, date | Joueurs | Exécution du contrat | Trente jours, ou jusqu'à la suppression du compte | `guild.messages` |

## Mesures de sécurité des traitements de la Guilde

Les traitements T8 et T9 sont vérifiés par la [revue de sécurité de la Guilde](../qualite/revue-securite-guilde.md) :

- toutes les routes de la Guilde sont réservées aux joueurs connectés, et un joueur n'agit
  qu'en son propre nom (G1, G2) ;
- un chat de guilde, son historique comme son canal temps réel, n'est accessible qu'aux membres
  de la guilde (G4) ; un ancien membre peut toutefois recevoir les messages de son ancienne
  guilde pendant au plus 240 secondes après un changement (G5, risque accepté) ;
- les événements de l'appartenance ne contiennent pas le nom du joueur : seuls son identifiant
  et sa guilde y figurent ;
- la durée de conservation des messages est appliquée à chaque lecture, et chaque jour par la
  tâche planifiée, même sans activité ;
- l'export et l'effacement couvrent l'appartenance, les expéditions et les messages (G15) ;
- le classement des guildes, `guild.ranking`, ne contient aucune donnée personnelle : il ne
  conserve que des scores par guilde, et n'est donc pas un traitement de ce registre.

## Droits des personnes

| Droit | Mise en œuvre |
| --- | --- |
| Accès et portabilité (articles 15 et 20) | Page « Mes données » : export JSON de toutes les données du joueur |
| Effacement (article 17) | Page « Mes données » : suppression du compte, effective dans tous les modules |
| Rectification (article 16) | Non mis en œuvre : le nom d'un joueur ne peut pas encore être modifié |

# Rendu de l'évaluation

- Auteur : Sachka Beaujault
- Module : `guild`
- Adresse du déploiement : https://royaumes-eight.vercel.app
- Fiche de cadrage : [fiche-cadrage.md](fiche-cadrage.md)

Le module Guilde ajoute au jeu trois guildes fixes, choisies dès l'entrée dans le jeu et
changées contre de l'or prélevé au Village, un chat réservé aux membres de chaque guilde, la
Faille, donjon quotidien et sans fin joué en groupe avec des rôles, et le classement des
guildes. Il communique avec le Village, par une saga, et avec la Taverne, par un port.

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/guild/` : `domain/` (`member.ts`, `saga.ts`, `chat.ts`, `calendar.ts`, `rift-content.ts`, `rift-rules.ts`, `run.ts`, `run-view.ts`, `view.ts`, `catalog.ts`, `random.ts`), `application/` (services et ports), `infrastructure/` (adaptateurs, projections, `schema.ts`), `api.ts`, `messages.ts`, `personal-data.ts`, et les entrées publiques `index.ts`, `contracts.ts`, `ui.tsx` | `pnpm lint:archi` : aucune violation des règles `module-encapsulation`, `outside-uses-public-entries`, `pure-domain` et `application-ignores-infrastructure` |
| E2 | `src/bootstrap/create-api.ts` (instanciation du module, gestionnaires, canaux, données personnelles, tâche quotidienne, `requireUser`, montage sur `/api/guild`) ; `app/(jeu)/guild/page.tsx`, `app/(jeu)/guild/rift/[id]/page.tsx` ; entrée « Guilde » de `src/ui/app-shell.tsx` ; redirection d'un joueur sans guilde par `app/(jeu)/layout.tsx` et `src/ui/app-shell.tsx` | Tous les tests de `src/bootstrap/guild-*.test.ts`, qui passent par l'application assemblée par `createApi` |
| E3 | `src/modules/guild/domain/` : fonctions pures `decide` et `evolve` de l'appartenance (`member.ts`) et de la Faille (`rift-rules.ts`, `run.ts`), étapes de la saga (`saga.ts`), règles du chat (`chat.ts`), calendrier (`calendar.ts`) | `member.test.ts`, `rift-rules.test.ts`, `calendar.test.ts`, `chat.test.ts`, sans base de données ; règle `pure-domain` de `pnpm lint:archi` |
| E4 | Journal d'événements selon le modèle decider, avec concurrence optimiste (`withOptimisticRetry`) : flux `guild-member-*`, `guild-rift-*` et `guild-day-*` ; tables du schéma `guild` dans `infrastructure/schema.ts` (`messages`, `open_runs`, `ranking`), créées par les migrations `drizzle/0013_guild.sql`, `0014_guild_faille.sql` et `0015_guild_classement.sql` ; justification dans l'ADR 0010 | Fonction d'aptitude « range chaque table dans le schéma d'une brique de la plateforme ou d'un module » ; `messages.test.ts` ; « présente la même Faille à toutes les guildes, sans jamais transmettre sa graine » (une seule graine par jour, malgré deux ouvertures) |
| E5 | `requireUser` sur `/guild` et `/guild/*` ; joueur tiré de `c.var.userId` dans `src/modules/guild/api.ts` ; schémas Zod de `contracts.ts` (`ChooseGuildInput`, `PostGuildMessageInput`, `ChooseRoleInput`, `SubmitRunActionInput`) ; règles d'accès des canaux dans `index.ts` | « refuse une requête anonyme (401) » dans les quatre fichiers `guild-*.test.ts` ; « n'agit qu'au nom du joueur connecté : un autre joueur n'est pas concerné » ; « refuse une guilde inconnue (400) » ; « refuse la Faille à un joueur sans guilde (403), et un rôle inconnu (400) » ; « refuse une action sur une cible inexistante (422) » ; revue de sécurité, exigences G1 à G4 et G10 |
| E6 | Village, par la boîte d'envoi : `domain/saga.ts`, `application/guild-service.ts`, `messages.ts`, sujet `GUILD_TOPICS` ; Taverne, par un port : `src/modules/tavern/application/author-guilds.ts`, `createGuildReader` de `src/modules/guild/index.ts` ; ADR 0011 et 0014 | `messages.test.ts` (prélèvement, refus, doublon, compensation, message mal formé) ; « change le joueur de guilde avec le Village extrait en service » ; `tavern-guilds.test.ts` ; `tavern-service.test.ts` |
| E7 | `src/modules/guild/personal-data.ts` (export de l'appartenance, de l'historique, des expéditions et des messages ; réécriture des noms dans `RunOpened` et `HeroJoined` ; effacement des messages et du nom dans `guild.open_runs`) ; traitements T8 et T9 du registre | Fonction d'aptitude « déclare les données personnelles de chaque module qui conserve des données » ; `personal-data.test.ts` ; « inclut l'appartenance à une guilde dans l'export des données du joueur » ; « exporte les messages du joueur, puis les supprime avec l'effacement de son compte » ; « exporte les expéditions du joueur, puis efface son nom des expéditions » |
| E8 | 18 règles de la fiche et 13 routes, détaillées dans les deux tableaux qui suivent | 100 tests ajoutés, dans 13 fichiers de test |
| E9 | `.dependency-cruiser.cjs` et `src/bootstrap/architecture.test.ts` inchangés | `pnpm verify` : aucune violation des 8 règles de dépendance ; les 2 fonctions d'aptitude réussissent |
| E10 | Déploiement de production, migrations `0013` à `0015` appliquées par `pnpm vercel-build`, qui n'aboutit qu'après `pnpm verify` | Parcours de la liste de contrôle 6.2 sur le déploiement de production : choix d'une guilde, chat entre deux comptes, expédition de la Faille, classement, guilde dans la Taverne, export puis suppression d'un compte de test |

### Règles de la fiche de cadrage et tests

| Règle | Tests du domaine | Tests de l'API |
| --- | --- | --- |
| 1. Trois guildes fixes, une au plus par joueur | « refuse un second premier choix : un joueur n'appartient qu'à une guilde » | « enregistre le premier choix (201), gratuit, et refuse un second choix (409) » ; « refuse une guilde inconnue (400) » |
| 2. Premier choix gratuit | « rejoint une guilde gratuitement : aucun prélèvement n'est demandé au Village » | « enregistre le premier choix (201), gratuit, et refuse un second choix (409) » |
| 3. Changement à 50 pièces d'or, annulé si le village ne peut pas payer | « demande le prélèvement du prix du changement, sans changer encore de guilde » ; « change de guilde lorsque le Village a prélevé le prix » ; « annule la demande si le village ne peut pas payer : le joueur reste dans sa guilde » | « change le joueur de guilde contre 50 pièces d'or prélevées dans son village » ; « laisse le joueur dans sa guilde, et lui indique l'or manquant, si son village est trop pauvre » |
| 4. Changement refusé vers sa guilde, pendant une demande, ou après la Faille du jour | « refuse un changement vers la guilde actuelle » ; « refuse une seconde demande tant que la première attend la réponse du Village » ; « fige la guilde jusqu'au lendemain une fois la Faille rejointe » | « refuse un changement vers sa guilde, ou sans guilde (409) » ; « fige la guilde d'un joueur qui a rejoint la Faille aujourd'hui (409) » |
| 5. Remboursement si la Faille est rejointe pendant la demande | « annule un changement en attente si le joueur rejoint la Faille, et rembourse l'or » ; « n'a rien à rembourser si le Village a refusé le prélèvement » | « rembourse l'or prélevé si le joueur a rejoint la Faille pendant sa demande (compensation) » (`messages.test.ts`) |
| 6. Ni chat ni Faille sans guilde | « refuse la Faille à un joueur qui n'a pas de guilde » | « refuse le chat à un joueur qui n'a pas de guilde (403) » ; « refuse la Faille à un joueur sans guilde (403), et un rôle inconnu (400) » |
| 7. Chat et canal réservés aux membres | — | « publie au nom du joueur connecté, dans le seul chat de sa guilde » ; « n'ouvre le canal temps réel d'une guilde qu'à ses membres (403) » ; « diffuse sur le canal d'une guilde ses seuls messages, avec leur contenu » |
| 8. Messages de 1 à 280 caractères, 5 par 30 secondes, conservés 30 jours | « retire les espaces de début et de fin, et refuse un message vide » ; « accepte 280 caractères, et refuse un message plus long » ; « accepte cinq messages par période de trente secondes, et refuse le sixième » ; « conserve un message trente jours » | « refuse un message vide ou trop long (422), et limite les messages par joueur (429) » ; « supprime chaque jour les messages de plus de trente jours » |
| 9. Nom du jour fonction de la date, sept jours annoncés | « ne dépend que de la date : le même jour porte toujours le même nom » ; « change chaque jour, et parcourt tous les noms avant de revenir au premier » ; « annonce le nom du jour et celui des sept jours suivants » | « présente la Faille du jour et les noms des sept jours suivants » |
| 10. Contenu du jour identique pour toutes les guildes, tiré d'une graine secrète | « ne dépend que de la graine du jour et de l'étage » ; « présente les mêmes monstres à toutes les guildes, quel que soit le nombre de leurs héros » | « présente la même Faille à toutes les guildes, sans jamais transmettre sa graine » |
| 11. De 1 à 4 joueurs d'une même guilde, rôle choisi avant le départ | « enregistre le rôle de chaque héros, et ses caractéristiques de départ » ; « refuse un joueur d'une autre guilde, un cinquième héros, ou une arrivée après le départ » ; « permet à un joueur seul de lancer son expédition, et réserve le départ à l'hôte » | « refuse un joueur d'une autre guilde (403), sans lui retirer sa participation du jour » |
| 12. Effets des rôles | « fait du tank la cible de tous les monstres tant qu'il est debout » ; « réduit les dégâts subis par le tank, et divise par deux ceux d'un héros qui se défend » ; « fait rendre au soigneur deux fois plus de points de vie qu'aux autres rôles » ; « donne à l'attaquante la meilleure attaque du groupe » | — |
| 13. Manches simultanées, échéance de 30 secondes, défense par défaut | « attend le choix de tous les héros debout, puis résout la manche sans attendre » ; « résout la manche à son échéance : un héros sans choix se défend » ; « refuse un choix pour une manche déjà résolue, ou un second choix » | « lance l'expédition, résout les manches, et la retire des expéditions ouvertes » |
| 14. Étages de plus en plus difficiles, un boss tous les cinq étages | « renforce les monstres à chaque étage » ; « fait garder un étage sur cinq par un boss, plus puissant à chaque apparition » | — |
| 15. Fin quand tous les héros sont tombés, score en étages franchis | « passe à l'étage suivant lorsque tous les monstres sont vaincus » ; « s'achève lorsque tous les héros sont tombés, avec le nombre d'étages franchis pour score » ; « finit toujours par arrêter un groupe qui attaque sans relâche » | « classe les expéditions achevées de chaque guilde, jour par jour » |
| 16. Une seule expédition par jour, même après un changement de guilde | « n'accepte qu'une participation par jour, et une nouvelle le lendemain » ; « compte la participation du jour même si le joueur change ensuite de guilde » | « n'accepte qu'une participation par joueur et par jour (409), puis une le lendemain » |
| 17. Meilleur score du jour et de tous les temps, et non la somme | « retient le meilleur score de chaque guilde, et non la somme de ses expéditions » ; « garde le meilleur score de tous les temps, et un classement propre à chaque jour » (`ranking-projection.test.ts`) | « conserve le meilleur score de tous les temps, et repart de zéro chaque jour » |
| 18. Guilde des auteurs dans la Taverne | « présente les messages sans guilde lorsque aucun lecteur des guildes ne lui est fourni » ; « lit la guilde de chaque auteur auprès du lecteur fourni » (`tavern-service.test.ts`) | « présente la guilde de chaque auteur, ou aucune s'il n'en a pas choisi » ; « présente la guilde actuelle de l'auteur, et non celle du jour de son message » ; « joint la guilde de l'auteur au message publié et au message diffusé sur le canal » |

### Routes et tests de l'API

| Route | Test |
| --- | --- |
| `GET /api/guild` | « présente un joueur sans guilde tant qu'il n'en a choisi aucune » |
| `POST /api/guild/join` | « enregistre le premier choix (201), gratuit, et refuse un second choix (409) » |
| `POST /api/guild/change` | « change le joueur de guilde contre 50 pièces d'or prélevées dans son village » |
| `GET /api/guild/chat` | « publie au nom du joueur connecté, dans le seul chat de sa guilde » |
| `POST /api/guild/chat` | « refuse un message vide ou trop long (422), et limite les messages par joueur (429) » |
| `GET /api/guild/rift` | « présente la Faille du jour et les noms des sept jours suivants » |
| `POST /api/guild/rift/runs` | « ouvre une expédition (201), proposée aux seuls membres de la guilde de l'hôte » |
| `GET /api/guild/rift/runs/:id` | « exporte les expéditions du joueur, puis efface son nom des expéditions » |
| `POST /api/guild/rift/runs/:id/join` | « refuse un joueur d'une autre guilde (403), sans lui retirer sa participation du jour » |
| `POST /api/guild/rift/runs/:id/start` | « lance l'expédition, résout les manches, et la retire des expéditions ouvertes » |
| `POST /api/guild/rift/runs/:id/action` | « refuse une action sur une cible inexistante (422) » |
| `POST /api/guild/rift/runs/:id/deadline` | « lance l'expédition, résout les manches, et la retire des expéditions ouvertes » |
| `GET /api/guild/ranking` | « présente les trois guildes, même celles qui n'ont encore rien joué » |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B1 | Canaux temps réel propres au module, avec leur règle d'accès : chat de chaque guilde réservé à ses membres, expédition réservée à ses héros et discrète, classement global et discret | `src/modules/guild/index.ts`, `src/modules/guild/ui.tsx` | « n'ouvre le canal temps réel d'une guilde qu'à ses membres (403) » ; « diffuse sur le canal d'une guilde ses seuls messages, avec leur contenu » ; « réserve le canal d'une expédition à ses héros (403) » ; « annonce les fins d'expédition sur un canal ouvert à tout joueur connecté » | README, section « Temps réel » ; ADR 0010 et 0012 ; revue de sécurité, G4, G8 et G10 |
| B2 | Échéances paresseuses des manches de la Faille, et tâche quotidienne propre au module : purge des messages des chats et clôture des expéditions abandonnées | `src/modules/guild/domain/rift-rules.ts` (`settle`, `CloseRun`), `src/modules/guild/application/rift-service.ts`, `src/modules/guild/application/chat-service.ts` | « résout la manche à son échéance : un héros sans choix se défend » ; « s'achève lorsque tous les héros sont tombés… » ; « supprime chaque jour les messages de plus de trente jours » ; « compte, grâce à la tâche quotidienne, les expéditions abandonnées des jours passés » | ADR 0012 et 0013 ; `docs/architecture.md`, section « Déploiement » |
| B4 | Modèle de lecture tenu par une projection, avec son point de reprise et sa version : classement des guildes (`guild-ranking`, version 1), et liste des expéditions ouvertes (`guild-open-runs`, version 2) | `src/modules/guild/infrastructure/ranking-projection.ts`, `drizzle-guild-ranking-reader.ts`, `open-runs-projection.ts`, `drizzle-open-runs-reader.ts` | `ranking-projection.test.ts`, dont « donne le même classement après une reconstruction à partir du journal » ; `guild-ranking.test.ts` | ADR 0013 |
| B5 | Saga avec une étape compensable entre la Guilde et le Village : prélèvement de l'or, remboursement si le changement devient impossible | `src/modules/guild/domain/saga.ts`, `src/modules/guild/domain/member.ts`, `src/modules/guild/messages.ts`, `src/modules/guild/application/guild-service.ts` | « rembourse l'or prélevé si le joueur a rejoint la Faille pendant sa demande (compensation) » ; « annule un changement en attente si le joueur rejoint la Faille, et rembourse l'or » ; « ne refait aucun changement si la réponse du Village est remise deux fois » ; « change le joueur de guilde avec le Village extrait en service » | ADR 0011 ; diagramme de séquence de `docs/architecture.md` |
| B6 | Communication avec deux modules existants : le Village, par la boîte d'envoi, et la Taverne, par un port | `src/modules/guild/messages.ts`, `src/modules/tavern/application/author-guilds.ts`, `src/modules/guild/index.ts` (`createGuildReader`), `src/bootstrap/create-api.ts` | `messages.test.ts` ; `tavern-guilds.test.ts` ; `tavern-service.test.ts` | ADR 0011 et 0014 ; `docs/architecture.md`, niveau 3 |

## Écarts avec la fiche de cadrage

Les écarts suivants sont apparus pendant la réalisation. La fiche de cadrage a été mise à jour
en conséquence le 2026-10-23.

- **La Guilde expose la guilde des joueurs par son entrée `index.ts`, et non par `contracts.ts`.**
  La fiche annonçait que la Guilde l'exposerait « par ses contrats ». Le lecteur des
  appartenances lit le journal : c'est du code serveur, qui ne peut pas figurer dans
  `contracts.ts`, partagé avec l'interface. Il est exposé par l'entrée publique serveur,
  `createGuildReader`, et la Taverne n'en dépend que par son propre port (ADR 0014).
- **Le choix d'une guilde n'est imposé que par l'interface.** La fiche annonce qu'un joueur sans
  guilde est redirigé vers la page de la Guilde, ce qui est réalisé ; les API des autres modules
  ne le vérifient pas, ce qui aurait demandé de modifier tous les modules existants (DT-018,
  revue de sécurité G13).
- **Ajouts non annoncés par la fiche** : la liste des expéditions ouvertes est tenue par une
  projection (`guild-open-runs`), et la tâche quotidienne clôture les expéditions abandonnées des
  jours passés, afin que leur score entre au classement (ADR 0013).

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | 232 | 332 |
| Couverture des lignes | 75 % | 74,0 % (94,1 % hors interface ; module Guilde hors interface : 96,7 %) |
| Violations des règles d'architecture | 0 | 0 |

La baisse d'un point de la couverture vient de l'interface de la Guilde, qu'aucun test
automatique ne couvre, comme les interfaces des autres modules (bilan technique, risque 3).
Aucun test existant n'a été supprimé, désactivé ni affaibli ; des tests de la Guilde ajoutés
pendant l'évaluation ont été complétés à mesure que l'export, les vues et la tâche quotidienne
du module gagnaient des champs.

## Usage de l'IA générative

L'outil utilisé est Claude Code (Anthropic, modèle Claude Opus 5.5), dans l'éditeur, sur
l'ensemble du travail.

- **Conception** : l'auteur a proposé l'idée du module, son usage et une première vision de sa
  mise en œuvre. Claude Code l'a analysée au regard des exigences et des briques du projet, a
  proposé des options et leurs alternatives aux points bloquants,
  et l'auteur a tranché. La fiche de cadrage a été rédigée par Claude Code à partir de ces choix.
- **Code** : Claude Code a écrit le code du module et les modifications de l'existant, commit
  par commit, sur le modèle des modules réalisés pendant les TD. Chaque ligne a été validée par l'auteur.
- **Tests** : Claude Code a écrit les tests, une règle de la fiche et une route au moins par
  test. Chaque étape a été vérifiée par `pnpm verify` (ou ses composantes), `pnpm build`, et un
  parcours de l'API sur un serveur de développement local.
- **Documents** : Claude Code a rédigé les ADR 0010 à 0014, la revue de sécurité, les mises à
  jour de l'architecture, du README, du registre de la dette, du registre des traitements, du
  bilan technique, et ce document. Chaque constat de la revue de sécurité provient d'un test
  exécuté ou d'une manipulation réalisée ; chaque valeur des indicateurs a été mesurée ; les
  diagrammes Mermaid ont été contrôlés par l'analyseur de Mermaid. L'auteur a relu et validé
  chaque document avant de l'enregistrer.

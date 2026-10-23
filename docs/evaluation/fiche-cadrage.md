# Fiche de cadrage : Les Guildes

- Auteur : Sachka Beaujault
- Date : 2026-10-23
- Nom technique du module : `guild`
- Validée par l'enseignant le :
- Mise à jour le : 2026-10-23, au rendu : exposition du lecteur des guildes, portée de la
  redirection, liste des expéditions ouvertes et clôture des expéditions abandonnées (voir le
  document de rendu, « Écarts avec la fiche de cadrage »)

## L'idée

Chaque joueur rejoint l'une des trois guildes du royaume : l'Ordre du Dragon (rouge), le
Cercle du Chêne (vert) ou la Garde de l'Onde (bleu). Le choix est demandé dès l'entrée dans
le jeu ; changer ensuite de guilde coûte de l'or, prélevé dans son village.

Les membres d'une guilde disposent d'un chat qui leur est réservé, et peuvent affronter
ensemble la Faille : un donjon sans fin, renouvelé chaque jour, dont les étages sont de plus en
plus difficiles. Chaque jour, la Faille porte un nouveau nom, annoncé à l'avance, et présente
le même contenu à toutes les guildes. Chaque héros y tient un rôle : tank, soigneur ou
attaquant. L'expédition s'achève lorsque tout le groupe est tombé ; le classement des guildes
retient l'étage le plus profond atteint par chacune.

L'intérêt dans le jeu : une compétition collective et quotidienne, à armes égales entre les
guildes, qui donne un usage à l'or du village et une appartenance visible jusque dans la
Taverne.

## Les règles métier

Appartenance

1. Le royaume compte trois guildes fixes ; un joueur appartient au plus à une guilde.
2. Le premier choix d'une guilde est gratuit.
3. Changer de guilde coûte 50 pièces d'or, prélevées dans le village du joueur ; si le
   village ne peut pas les fournir, la demande est annulée et le joueur reste dans sa guilde.
4. Une demande de changement est refusée vers la guilde actuelle, lorsqu'une autre demande
   est déjà en attente, ou lorsque le joueur a déjà rejoint une expédition de la Faille dans
   la journée : sa guilde est alors figée jusqu'au lendemain.
5. Si le joueur rejoint une expédition alors que sa demande est en attente, le changement
   devient impossible : à la réception de l'or prélevé, celui-ci lui est remboursé, et il
   reste dans sa guilde.
6. Un joueur sans guilde ne peut ni utiliser un chat de guilde, ni ouvrir ou rejoindre une
   expédition de la Faille.

Chat de guilde

7. Seuls les membres d'une guilde peuvent lire et écrire dans son chat, et écouter son canal
   temps réel.
8. Un message compte de 1 à 280 caractères ; un joueur publie au plus 5 messages par
   période de 30 secondes ; un message est conservé 30 jours.

La Faille

9. Le nom de la Faille d'un jour ne dépend que de la date : il est le même pour tous les
   joueurs, et les noms des sept jours suivants sont annoncés à l'avance.
10. Le contenu de la Faille d'un jour, monstres et boss compris, ne dépend que d'une graine
    secrète propre à ce jour, tirée lors de la première expédition de la journée : il est le
    même pour toutes les guildes, et il n'est pas révélé à l'avance.
11. Une expédition réunit de 1 à 4 joueurs de la même guilde ; chacun choisit son rôle, tank,
    soigneur ou attaquant, avant le départ.
12. Le tank est la cible prioritaire des monstres et subit des dégâts réduits ; le soigneur
    rend davantage de points de vie ; l'attaquant inflige des dégâts majorés.
13. Les héros choisissent leur action simultanément ; une manche est résolue lorsque tous les
    héros debout ont choisi, ou à son échéance de 30 secondes, un héros sans choix se
    défendant.
14. Chaque étage est plus difficile que le précédent, et un boss garde un étage sur cinq,
    plus puissant à chaque apparition.
15. L'expédition s'achève lorsque tous les héros sont tombés ; son score est le nombre
    d'étages franchis.
16. Un joueur ne participe qu'à une seule expédition de la Faille par jour, même s'il a
    changé de guilde dans la journée.
17. Le classement des guildes retient, pour chacune, le meilleur score du jour et le meilleur
    score de tous les temps, et non la somme des scores de ses membres.

Taverne

18. Dans la Taverne, le nom de chaque auteur est accompagné de la guilde à laquelle il
    appartient.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Consulter sa guilde, les trois guildes et sa demande en cours | Lecture | `GET /api/guild` |
| Choisir sa première guilde | Commande `JoinGuild` | `POST /api/guild/join` |
| Demander un changement de guilde | Commande `RequestChange` | `POST /api/guild/change` |
| Lire le chat de sa guilde | Lecture | `GET /api/guild/chat` |
| Publier dans le chat de sa guilde | Commande | `POST /api/guild/chat` |
| Consulter la Faille du jour, les noms des jours suivants et les expéditions ouvertes de sa guilde | Lecture | `GET /api/guild/rift` |
| Ouvrir une expédition, en choisissant son rôle | Commande `OpenRun` | `POST /api/guild/rift/runs` |
| Consulter une expédition | Lecture | `GET /api/guild/rift/runs/:id` |
| Rejoindre une expédition, en choisissant son rôle | Commande `JoinRun` | `POST /api/guild/rift/runs/:id/join` |
| Lancer l'expédition | Commande `StartRun` | `POST /api/guild/rift/runs/:id/start` |
| Choisir son action pour la manche | Commande `SubmitAction` | `POST /api/guild/rift/runs/:id/action` |
| Signaler l'échéance d'une manche | Commande `CheckDeadline` | `POST /api/guild/rift/runs/:id/deadline` |
| Consulter le classement des guildes | Lecture | `GET /api/guild/ranking` |

Un joueur connecté sans guilde est redirigé vers la page de la Guilde, quelle que soit la
page du jeu demandée. Cette redirection est assurée par l'interface du jeu : les API des
autres modules ne vérifient pas l'appartenance à une guilde.

## Le stockage envisagé

Un stockage mixte, chaque donnée selon sa nature.

- L'appartenance, les demandes de changement et les expéditions de la Faille sont conservées
  dans le journal d'événements, selon le modèle decider : leur historique a une valeur de
  jeu, puisque le classement en est tiré ; les échéances des manches se calculent à partir
  des événements ; la concurrence optimiste empêche deux changements simultanés.
- Les messages du chat sont conservés dans une table classique du schéma `guild`, créée par
  une migration : ils sont destinés à disparaître au terme de leur durée de conservation,
  ce que ne permet pas un journal en ajout seul.
- Le classement des guildes est un modèle de lecture du schéma `guild`, tenu par une
  projection du journal.
- La liste des expéditions ouvertes est un modèle de lecture du schéma `guild`, tenu par une
  projection du journal ; elle permet aussi à la tâche quotidienne de clôturer les expéditions
  abandonnées des jours passés, afin que leur score entre au classement.

## La communication avec les modules existants

- **Village** : la Guilde lui adresse, par la boîte d'envoi, un message de prélèvement de
  l'or d'un changement, puis, en cas de changement devenu impossible, un message de
  versement qui le rembourse. Le Village répond au prélèvement par un message adressé à la
  Guilde. Ces échanges forment une saga, dont les gestionnaires sont idempotents. Le Village
  n'est pas modifié : il expose déjà ces sujets dans ses contrats.
- **Taverne** : elle reçoit de la Guilde, par un port injecté par la racine de composition,
  la guilde de chaque auteur de message. La Guilde l'expose par son entrée publique serveur
  (`index.ts`), le lecteur des appartenances étant du code serveur ; la Taverne ne dépend
  d'aucun fichier de la Guilde.

## Les données personnelles

- L'appartenance du joueur à une guilde et l'historique de ses changements.
- Les messages qu'il a publiés dans le chat de sa guilde, et le nom qui les accompagne.
- Son nom, copié dans les événements des expéditions de la Faille qu'il a ouvertes ou
  rejointes.

Le classement des guildes ne contient aucune donnée personnelle : il ne retient que des
scores par guilde.

## Les bonus visés

1. B5 - La saga du changement de guilde avec le Village, dont le remboursement est l'étape
   de compensation.
2. B1 - Le canal temps réel du chat de guilde, réservé à ses membres, et celui de chaque
   expédition, réservé à ses participants.
3. B2 - Les échéances paresseuses des manches de la Faille, et la tâche quotidienne qui purge
   les messages du chat.
4. B4 - Le classement des guildes, tenu par une projection avec son point de reprise et sa
   version.
5. B6 - La communication avec deux modules existants : le Village et la Taverne.

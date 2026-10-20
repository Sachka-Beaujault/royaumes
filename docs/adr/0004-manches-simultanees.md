# ADR-0004 - Manches simultanées, aux échéances paresseuses, pour les combats du Donjon

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les combats du Donjon réunissent jusqu'à quatre joueurs humains. Ils ne doivent ni s'attendre
indéfiniment les uns les autres, ni être avantagés ou pénalisés par l'ordre dans lequel ils
jouent.

L'hébergement sans serveur ne permet ni minuteur en mémoire, ni tâche de fond : une fonction
s'arrête après avoir répondu, et l'instance suivante n'est pas nécessairement la même. Les
tâches planifiées de l'offre gratuite ne s'exécutent qu'une fois par jour.

L'état d'une expédition est reconstruit à partir de ses événements (ADR 0002) : tout calcul,
y compris le hasard, doit produire le même résultat à chaque reconstruction.

Les choix des joueurs doivent rester secrets jusqu'à la résolution de la manche.

## Décision

Les héros choisissent leur action simultanément. Une manche est résolue lorsque tous les héros
encore debout ont choisi, ou lorsque son échéance de trente secondes est atteinte ; un héros
sans choix se défend.

L'échéance est une donnée enregistrée dans les événements (`RoomEntered`, puis `RoundResolved`
sous le nom `nextDeadline`). Une manche échue est résolue à l'instant de son échéance, et non à
celui où ce dépassement est constaté.

Une lecture calcule la résolution des manches échues sans rien enregistrer. Toute commande
commence par enregistrer cette résolution, puis traite sa propre demande. Lorsque son compte à
rebours atteint zéro, le navigateur envoie une commande d'échéance, dont le seul rôle est de
faire enregistrer la résolution (`src/modules/dungeon/domain/rules.ts`, `src/ui/use-countdown.ts`).

Le hasard est tiré dans `decide`, au moyen d'un générateur à graine dont la graine est dérivée
de celle de l'expédition et du numéro de manche (`src/modules/dungeon/domain/random.ts`) ; ses
résultats, comme les dégâts infligés, sont enregistrés dans les événements.

Une action porte le numéro de la manche visée, et elle est refusée si cette manche est déjà
résolue.

## Conséquences

### Positives

- Aucun joueur n'attend les autres au-delà de l'échéance, et aucun n'est avantagé par l'ordre
  de jeu.
- Aucune tâche de fond ni aucun minuteur n'est nécessaire : le fonctionnement est compatible
  avec l'hébergement sans serveur, quelle que soit l'instance qui traite la requête.
- La résolution d'une manche est la même quel que soit l'instant où elle est calculée ou
  enregistrée, et le hasard est rejoué à l'identique lors de chaque reconstruction.
- Les commandes concurrentes de plusieurs joueurs, y compris des commandes d'échéance
  répétées, sont départagées par la concurrence optimiste et rejouées sans effet supplémentaire.
- Les lectures n'écrivent jamais : une consultation ne provoque ni conflit d'écriture ni
  notification.

### Négatives

- Si plus aucun joueur ne se manifeste, la résolution d'une manche échue n'est jamais
  enregistrée : le journal peut rester en retard sur ce qu'affichent les lectures, et une
  expédition abandonnée n'enregistre jamais sa fin.
- Les notifications des autres joueurs dépendent d'un navigateur : la résolution n'est diffusée
  que lorsqu'un navigateur envoie la commande d'échéance, ou qu'une autre commande arrive.
- Le domaine est plus complexe : `decide` doit d'abord enregistrer les manches échues avant de
  traiter la commande, et les lectures doivent reproduire ce calcul.
- Chaque fin de compte à rebours provoque une requête par navigateur ouvert, dont toutes sauf
  une n'ont aucun effet.

## Alternatives écartées

- **Tour par tour strict** : chaque héros agit à son tour en connaissant les actions
  précédentes ; les joueurs s'attendent les uns les autres, et le dernier à jouer est avantagé.
- **Minuteur ou tâche planifiée** : un minuteur n'a nulle part où s'exécuter sur des fonctions
  qui s'arrêtent après chaque requête, et les tâches planifiées de l'offre gratuite ne
  s'exécutent qu'une fois par jour.
- **Lecture qui enregistre elle-même la résolution** : contraire à la sémantique d'une requête
  `GET`, elle provoquerait des écritures, des conflits de version et des notifications lors de
  simples consultations.
- **Tirage par `Math.random`, dont seul le résultat serait enregistré** : il interdit de
  reproduire le calcul effectué par une lecture, qui doit afficher la même résolution que celle
  qui sera enregistrée plus tard.

## Réexamen

Cette décision devra être réexaminée s'il devient nécessaire d'enregistrer la fin d'une
expédition abandonnée, par exemple pour le classement construit à partir des événements
`GameEnded` (TD8), si des héros doivent agir sans navigateur, comme les héros pilotés par
l'ordinateur (TD7), ou si un service de planification de tâches compatible avec l'hébergement
devient disponible.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a proposé la rédaction de cet ADR à partir
des éléments imposés par le support du TD6 et du code mis en place au cours du TD. Cette
rédaction a été relue et validée avant d'être enregistrée ; les références aux fichiers ont
été vérifiées dans le dépôt.

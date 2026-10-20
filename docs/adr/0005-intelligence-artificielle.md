# ADR-0005 - Intelligence artificielle déterministe, exécutée dans le domaine, sans tâche de fond

- Statut : accepté
- Date : 2026-10-20

## Contexte

Le Donjon a besoin de personnages pilotés par l'ordinateur : des monstres dont le comportement
dépend d'un niveau de difficulté choisi par l'hôte, et des compagnons qui permettent à un
joueur seul de mener une expédition.

L'hébergement ne permet aucun processus permanent : aucune boucle de jeu ne peut s'exécuter
entre deux requêtes (ADR 0004).

L'état d'une expédition est reconstruit à partir de ses événements, et une manche peut être
calculée lors d'une lecture sans être enregistrée : toute décision doit donc produire le même
résultat, quel que soit le moment où elle est calculée (ADR 0002 et 0004).

## Décision

Les décisions de l'intelligence artificielle sont des fonctions pures du domaine, appelées au
seul moment de la résolution d'une manche, par la fonction `resolveRound`.

Elles ne tirent au sort qu'au moyen du générateur à graine de la manche.

Leurs résultats, actions des compagnons comprises, sont enregistrés dans l'événement
`RoundResolved` : la relecture d'une expédition n'exécute jamais l'intelligence artificielle.

Le choix de la cible des monstres est isolé derrière un port de stratégie, `MonsterStrategy`,
dont chaque niveau de difficulté fournit une mise en œuvre
(`src/modules/dungeon/domain/monster-strategies.ts`) ; les compagnons ont leur propre
intelligence artificielle (`src/modules/dungeon/domain/companion.ts`).

Un compagnon n'agit que si au moins un joueur a choisi une action pour la manche ; sinon, il se
défend, comme un joueur absent.

L'équilibre du jeu est mesuré par la simulation d'expéditions
(`src/modules/dungeon/domain/simulation.ts`, `scripts/simulate-dungeon.ts`), et protégé par des
tests statistiques (`src/modules/dungeon/domain/simulation.test.ts`).

## Conséquences

### Positives

- Aucune nouvelle brique d'architecture n'est nécessaire : l'intelligence artificielle s'insère
  dans la résolution des manches, compatible avec l'hébergement sans serveur.
- Une même manche produit toujours les mêmes décisions, qu'elle soit calculée lors d'une
  lecture ou enregistrée par une commande.
- Une modification ultérieure de l'intelligence artificielle ne change pas les expéditions déjà
  jouées, dont les décisions sont enregistrées.
- Ajouter un niveau de difficulté consiste à écrire une nouvelle stratégie, sans modifier les
  règles du combat.
- Les décisions se testent sans base de données ni serveur, de manière exacte, et des milliers
  d'expéditions peuvent être simulées en quelques secondes.

### Négatives

- Un personnage piloté par l'ordinateur ne peut pas agir entre deux échéances, ni de sa propre
  initiative : il ne décide qu'à la résolution d'une manche.
- La qualité de l'équilibre mesuré dépend de la règle suivie par les joueurs simulés, plus
  simple que le comportement de joueurs réels.
- Les tests statistiques vérifient des seuils et non des valeurs exactes : une dérive de
  l'équilibre qui reste à l'intérieur de ces seuils n'est pas détectée.
- L'intelligence artificielle est exécutée lors des lectures, pour les manches échues : son coût
  de calcul s'ajoute à celui de chaque consultation.

## Alternatives écartées

- **Une boucle de jeu exécutée par un processus permanent** : impossible sur un hébergement
  sans serveur, où aucun processus ne s'exécute entre deux requêtes.
- **Des décisions prises par le navigateur d'un joueur** : elles dépendraient de la présence de
  ce joueur, pourraient être falsifiées, et ne permettraient pas de calculer la même manche lors
  d'une lecture.
- **Un recalcul des décisions lors de la relecture, plutôt que leur enregistrement** : toute
  modification de l'intelligence artificielle changerait l'issue des expéditions déjà jouées.

## Réexamen

Cette décision devra être réexaminée si un personnage doit agir en temps réel, entre deux
échéances, ou si l'intelligence artificielle devient trop coûteuse en calcul pour être exécutée
lors d'une lecture.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a proposé la rédaction de cet ADR à partir
des éléments imposés par le support du TD7 et du code mis en place au cours du TD. Cette
rédaction a été relue et validée avant d'être enregistrée ; les références aux fichiers ont
été vérifiées dans le dépôt.

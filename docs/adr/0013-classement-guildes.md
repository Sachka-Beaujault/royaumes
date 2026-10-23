# ADR-0013 - Classement des guildes tenu par une projection propre au module, et clôture quotidienne des expéditions abandonnées

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le classement des guildes retient, pour chacune, le meilleur score du jour et le meilleur score
de tous les temps, et non la somme des scores de ses membres (fiche de cadrage, règle 17). Le
score d'une expédition de la Faille est enregistré par l'événement `RunEnded` (ADR 0012).

Calculer ce classement par rejeu à chaque consultation relirait toutes les expéditions de
l'historique du jeu, comme le faisait la liste des expéditions ouvertes du Donjon avant le TD8
(dette DT-005). Le projet dispose de projections rattrapées à la lecture, avec point de reprise et
version (ADR 0006).

Le module Classement existe déjà : il classe des joueurs, à partir des événements du Village et du
Donjon. Une projection existante ne change de version qu'en cas de nécessité, et les modifications
d'un module existant doivent rester minimales (énoncé de l'évaluation, partie 4.2).

Une expédition abandonnée n'enregistre jamais sa fin si aucune commande ne la constate (ADR 0012,
conséquences négatives) : son score n'entrerait jamais au classement. L'hébergement ne permet
aucune tâche de fond, mais une tâche quotidienne s'exécute chaque jour à 4 h UTC (ADR 0008).

## Décision

Le classement des guildes est un modèle de lecture propre au module Guilde, la table
`guild.ranking`, qui garde pour chaque guilde et chaque jour le meilleur nombre d'étages franchis
et le nombre d'expéditions achevées. Le meilleur score de tous les temps est le plus élevé de ces
jours, calculé à la lecture.

Il est tenu par la projection `guild-ranking`, en version 1, qui ne lit que les événements
`RunEnded` des flux de la Faille, et ne conserve que le meilleur score
(`src/modules/guild/infrastructure/ranking-projection.ts`). Elle est rattrapée à chaque
consultation, et son point de reprise est enregistré dans `platform.projections`.

Le classement est annoncé aux navigateurs par un canal global et discret, `guild-ranking` ;
l'interface relit le classement jusqu'à ce que la projection ait atteint la position annoncée.

La tâche quotidienne clôture les expéditions des jours passés qui n'ont pas enregistré leur fin,
par la commande `CloseRun` : une expédition en combat est menée à son terme, chacune de ses manches
étant résolue à son échéance, et une expédition restée au salon s'achève sans score. Les
expéditions à clôturer sont lues dans la projection des expéditions ouvertes, passée en version 2
pour conserver les expéditions lancées jusqu'à leur fin. Cette clôture remédie à la conséquence
négative de l'ADR 0012 relative aux expéditions abandonnées.

Le module Classement n'est pas modifié.

## Conséquences

### Positives

- Le coût d'une consultation ne dépend plus de l'historique des expéditions, mais des seuls
  événements apparus depuis le dernier rattrapage.
- Une guilde plus nombreuse ne gagne pas du seul fait de son nombre d'expéditions : seul compte le
  meilleur score.
- Le classement peut être reconstruit à tout moment à partir du journal, qui reste la seule
  source de vérité ; une évolution de ses règles est appliquée à tout le passé par une nouvelle
  version.
- Toute expédition finit par entrer au classement, même abandonnée, sans tâche de fond
  supplémentaire.
- Le classement ne contient aucune donnée personnelle : il ne connaît que des guildes.

### Négatives

- Une expédition abandonnée n'entre au classement que le lendemain matin, après la tâche
  quotidienne : le classement du jour peut être incomplet jusqu'alors.
- La tâche clôture toutes les expéditions abandonnées en une seule exécution ; un grand nombre
  d'entre elles pourrait dépasser la durée maximale d'une fonction (dette DT-017).
- Le passage de la projection des expéditions ouvertes en version 2 provoque sa reconstruction à
  partir du journal lors de la première consultation qui suit le déploiement.
- Les joueurs consultent deux classements distincts, celui des joueurs et celui des guildes, dans
  deux modules.

## Alternatives écartées

- **Le classement des guildes dans le module Classement** : il aurait fallu modifier une
  projection existante et augmenter sa version, et le Classement aurait dû connaître le langage
  publié de la Guilde, pour une donnée qui n'a rien de commun avec les scores des joueurs.
- **Le calcul par rejeu à chaque consultation** : son coût croît sans limite avec l'historique des
  expéditions, comme celui de la dette DT-005.
- **La somme des scores des membres** : elle avantagerait les guildes les plus peuplées, contre
  la règle 17.
- **La clôture des expéditions abandonnées lors des consultations** : une lecture enregistrerait
  des événements, contrairement à la règle qui veut qu'une lecture n'écrive jamais (ADR 0004).
- **La recherche des expéditions à clôturer dans le journal** : la tâche relirait chaque jour
  toutes les expéditions de l'historique, alors que la projection ne garde que celles qui ne sont
  pas terminées.

## Réexamen

Cette décision devra être réexaminée si le nombre d'expéditions abandonnées rend la tâche
quotidienne trop longue, si le classement du jour doit être exact avant le lendemain, ou si le
classement des guildes doit être présenté avec celui des joueurs.

## Usage de l'IA générative

L'auteur a défini le classement des guildes par leur meilleure expédition, et décidé que la tâche
quotidienne clôture les expéditions abandonnées. Claude Code (Anthropic, modèle Claude Opus 5.5)
a rédigé le code de la projection, sur le modèle de celle du Classement, et cet ADR, à partir de
ces choix. La rédaction a été relue et validée par l'auteur avant d'être enregistrée ; les
comportements décrits sont vérifiés par les tests
`src/modules/guild/infrastructure/ranking-projection.test.ts`,
`src/modules/guild/domain/rift-rules.test.ts` et `src/bootstrap/guild-ranking.test.ts`.

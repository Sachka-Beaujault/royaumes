# ADR-0008 - Stockage classique pour la Taverne, et réécriture ciblée des champs personnels du journal pour l'effacement

- Statut : accepté
- Date : 2026-10-21

## Contexte

La Taverne traite des données personnelles destinées à disparaître : des messages, conservés
trente jours, et la présence des joueurs, qui n'a de sens que pendant quelques minutes. Les
joueurs disposent par ailleurs de droits d'accès, de portabilité et d'effacement, qui portent sur
le jeu entier et non sur un seul module.

Les événements déjà enregistrés contiennent des noms en clair : le nom des joueurs dans les
événements du Donjon et du Marché, le nom de leur village dans ceux du Village. Certains de ces
événements appartiennent à des flux partagés avec d'autres joueurs, comme une expédition jouée à
plusieurs ou une offre acceptée par un autre joueur.

Le journal est en ajout seul : aucun événement n'est jamais modifié ni supprimé (ADR 0002), et
les projections reconstruisent leurs tables à partir de lui (ADR 0006).

## Décision

La Taverne utilise des tables ordinaires (`tavern.messages`, `tavern.presence`), et non le
journal d'événements ; leurs lignes sont supprimées à l'expiration de leur durée de conservation.

Son canal temps réel est alimenté par une source fournie par le module, qui lit sa propre table,
et non par un flux du journal.

La présence repose sur un signal périodique du navigateur : une ligne par joueur présent, remplacée
à chaque signal, et supprimée à son départ ou deux minutes après son dernier signal.

Les durées de conservation sont appliquées à la lecture, et chaque jour par la route des tâches
quotidiennes (`/api/cron/daily`, `src/platform/cron/`).

Chaque module déclare ses données personnelles par un contributeur (`personal-data.ts`), qui
assure l'export de ses données, la réécriture de ses événements et l'effacement de ses tables.

L'effacement réécrit les seuls champs de nom des événements du joueur, par une fonction unique de
la plateforme (`src/platform/privacy/privacy.ts`), et le consigne dans un registre
(`platform.erasures`) qui n'en conserve que la date et le nombre d'événements réécrits, sans aucune
donnée sur le joueur.

L'identité du joueur est effacée en dernier, et chaque étape de l'effacement est idempotente :
un effacement interrompu peut être relancé sans effet supplémentaire.

## Conséquences

### Positives

- Les droits d'accès, de portabilité et d'effacement sont exercés par le joueur lui-même, depuis la
  page « Mes données », sans intervention.
- L'effacement n'altère ni les états reconstruits ni l'historique des autres joueurs : seuls les
  noms sont remplacés, et la reconstruction d'une projection donne le même résultat que la
  correction directe de ses tables.
- La durée de conservation est garantie même sans activité, grâce à la tâche quotidienne.
- La Taverne est plus simple que si elle avait suivi l'Event Sourcing : ni état reconstruit, ni
  fonctions `decide` et `evolve`, pour des données qui n'ont pas vocation à être conservées.

### Négatives

- La réécriture ciblée est une exception à la règle de l'ajout seul : toute modification future du
  journal devra respecter strictement les limites fixées ici.
- Le coût de l'effacement et de l'export croît avec la taille du journal, qui doit être parcouru
  pour retrouver les événements du joueur.
- Chaque événement futur impose une obligation nouvelle : ses champs personnels doivent être
  déclarés dans le contributeur de son module, faute de quoi ils échapperont à l'effacement.
- L'identifiant du joueur reste dans le journal : les données ne sont que pseudonymisées, et
  cette pseudonymisation dépend de la destruction effective de tout lien entre cet identifiant et
  la personne.

## Alternatives écartées

- **L'Event Sourcing pour la Taverne** : il conserverait indéfiniment des messages destinés à
  disparaître, et chaque suppression deviendrait une réécriture du journal.
- **La suppression des flux du joueur** : impossible pour les flux partagés, dont elle détruirait
  l'historique des autres joueurs.
- **L'effacement cryptographique** : il exige de chiffrer et déchiffrer les données dans chaque
  module et chaque projection, et ne s'applique pas aux événements déjà enregistrés en clair.
- **Les références sans copie** : la meilleure conception pour l'avenir, mais elle ne règle pas le
  cas des événements déjà enregistrés, qui contiennent les noms en clair.
- **Un service externe de présence, comme une base clé-valeur en mémoire** : une infrastructure
  supplémentaire, hors de l'offre gratuite, pour une donnée qu'une table ordinaire suffit à tenir.

## Réexamen

Cette décision devra être réexaminée lors de la conception d'un nouveau module, pour lequel les
références sans copie devraient être préférées dès l'origine, si la taille du journal rend
l'effacement trop long pour une requête, ou si la doctrine sur l'anonymisation des identifiants
pseudonymes évolue.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a proposé la rédaction de cet ADR à partir
des éléments imposés par le support du TD10 et du code mis en place au cours du TD. Cette
rédaction a été relue et validée avant d'être enregistrée ; les références aux fichiers ont
été vérifiées dans le dépôt.

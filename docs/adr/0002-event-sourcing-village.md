# ADR-0002 - Event Sourcing comme mode de persistance du Village

- Statut : accepté
- Date : 2026-10-19

## Contexte

Le Village est un état qui évolue uniquement par des actions successives du joueur : fonder
le village, puis améliorer ses bâtiments. Chaque action dépend de l'état produit par les
précédentes, et la production de ressources est calculée à partir du temps écoulé entre deux
actions.

La suite du projet prévoit deux besoins qui reposent sur ces changements : leur diffusion
en temps réel aux joueurs (TD5), et la construction de vues de lecture, comme le classement,
à partir de l'activité des joueurs (TD8).

L'application est hébergée en mode sans serveur : plusieurs instances, qui ne partagent
aucune mémoire, peuvent traiter simultanément des requêtes pour un même village. Le
stockage en mémoire du TD2 ne conservait rien entre deux redémarrages et ne détectait les
écritures concurrentes qu'au sein d'un seul processus (DT-002, DT-003).

## Décision

L'état du village n'est pas stocké : il est reconstruit à chaque chargement en rejouant ses
événements (fonction `replay` du domaine).

Les événements sont enregistrés dans un journal générique de la plateforme, la table
`platform.events` (`src/platform/event-store/`), en ajout seul. Chaque village correspond à
un flux nommé `village-<joueur>` ; l'adaptateur
`src/modules/realm/infrastructure/event-store-village-repository.ts` fait la traduction
entre les événements du domaine et ceux du journal.

Les écritures concurrentes sont détectées par la contrainte d'unicité sur le couple
(flux, version) : une écriture fondée sur une version périmée est refusée par la base, et la
commande est rejouée sur l'état à jour, au plus trois fois (`withOptimisticRetry`).

Un événement porte toutes les informations nécessaires à son application, par exemple le
coût effectivement payé lors d'une amélioration, afin d'être rejoué à l'identique même si
les règles ou l'équilibrage du jeu évoluent.

## Conséquences

### Positives

- Un historique complet et fiable de chaque village : aucun événement n'est modifié ni
  supprimé.
- L'état peut être reconstruit à tout moment, y compris après la correction d'une règle.
- Les mêmes événements pourront alimenter le temps réel (TD5) et le classement (TD8) sans
  modifier le Village.
- La concurrence est garantie par la base elle-même, quel que soit le nombre d'instances de
  l'application, sans verrou ni attente.
- Le domaine et la couche application n'ont pas été modifiés : seul l'adaptateur a changé.

### Négatives

- Un événement enregistré ne peut plus être modifié : toute évolution de sa structure
  oblige le code à savoir lire les anciennes et les nouvelles versions.
- Chaque chargement relit et rejoue tout le flux du village ; le coût croît avec le nombre
  d'événements.
- Les questions qui portent sur tous les villages (par exemple les joueurs les plus riches)
  ne peuvent pas être posées directement au journal : elles exigent des vues de lecture
  dédiées.
- Un journal dont rien n'est supprimé entre en tension avec le droit à l'effacement du RGPD,
  qui devra être traité (TD10).

## Alternatives écartées

- **Stockage de l'état dans une table propre au module** (une ligne par village, mise à
  jour à chaque action) : plus simple à interroger, mais il perd l'historique, ne fournit
  aucun événement à diffuser ou à projeter, et la détection des écritures concurrentes
  devrait être construite à part.
- **Verrouillage pessimiste** du village pendant le traitement d'une commande : il évite
  les conflits, mais impose des attentes et le maintien d'un verrou pendant toute la
  requête, ce qui s'accorde mal avec une exécution sans serveur, alors que les conflits
  sont rares.
- **Conservation des événements en mémoire** (adaptateur du TD2) : les données sont perdues
  à chaque redémarrage et ne sont pas partagées entre les instances.

## Réexamen

Cette décision devra être réexaminée si le nombre d'événements par village rend la
reconstruction de l'état coûteuse (des instantanés seraient alors à envisager), si
l'évolution de la structure des événements devient trop fréquente pour être absorbée par le
code, ou si les exigences de suppression de données ne peuvent pas être satisfaites sur le
journal.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a proposé la rédaction de cet ADR à partir
des éléments imposés par le support du TD3 et du code mis en place au cours du TD. Cette
rédaction a été relue et validée avant d'être enregistrée ; les références aux fichiers ont
été vérifiées dans le dépôt.

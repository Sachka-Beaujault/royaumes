# ADR-0006 - Modèles de lecture séparés du modèle d'écriture, tenus par des projections rattrapées à la lecture

- Statut : accepté
- Date : 2026-10-20

## Contexte

Certaines lectures traversent les flux du journal : le classement des joueurs, qui agrège
l'activité du Village et du Donjon, et la liste des expéditions ouvertes. Calculées par rejeu,
elles relisent à chaque consultation des événements dont le nombre croît avec l'historique du
jeu, et non avec ce qui est affiché (dette DT-005).

L'hébergement ne permet aucun processus permanent : aucune tâche de fond ne peut tenir ces
lectures à jour entre deux requêtes (ADR 0004).

Le journal attribue à chaque événement une position globale, croissante mais non continue :
une insertion refusée consomme une position, et deux insertions simultanées peuvent être
validées dans le désordre (ADR 0002).

## Décision

Les lectures transversales s'appuient sur des modèles de lecture, placés dans le schéma
PostgreSQL de leur module (`ranking.players`, `dungeon.open_games`) ; les décisions s'appuient
toujours sur le modèle d'écriture, le journal.

Chaque modèle de lecture est tenu à jour par une projection, dont le point de reprise est
enregistré dans la table `platform.projections` (`src/platform/projection/`).

Une projection est rattrapée au moment de sa consultation, dans une seule transaction qui
couvre ses tables et son point de reprise, ce dernier étant verrouillé jusqu'à la fin de la
transaction.

Le rattrapage s'arrête devant une position manquante tant que l'événement qui la suit a été
enregistré il y a moins de cinq secondes ; au-delà, la position est considérée comme celle
d'une insertion refusée, et franchie.

Chaque projection porte une version : une version plus élevée que celle enregistrée provoque
la reconstruction de ses tables à partir du journal, une version moins élevée interdit toute
écriture.

Le classement est annoncé aux navigateurs par un canal global et discret (`ranking`) ;
l'interface relit le classement jusqu'à ce que la projection ait atteint la position annoncée.

## Conséquences

### Positives

- Le coût d'une consultation ne dépend plus de l'historique du jeu, mais des seuls événements
  apparus depuis le dernier rattrapage.
- Les modules qui écrivent ne savent rien des projections qui les lisent : le Classement a été
  ajouté sans modifier le Village ni le Donjon.
- Une information nouvelle, comme le meilleur butin, est calculée pour tout le passé par la
  reconstruction de la projection, sans migration de données.
- Aucune tâche de fond ni aucune opération manuelle n'est nécessaire après un déploiement : la
  première consultation rattrape ou reconstruit la projection.
- Un modèle de lecture peut être supprimé et recalculé à tout moment à partir du journal, qui
  reste la seule source de vérité.

### Négatives

- La cohérence n'est obtenue qu'à terme : un modèle de lecture peut avoir quelques secondes de
  retard sur le journal, notamment devant une position manquante récente.
- La reconstruction a lieu pendant une consultation, dont la durée est limitée sur Vercel :
  elle deviendra impossible au-delà d'une certaine taille du journal.
- Après un retour à une version précédente de l'application, une projection dont la version a
  été augmentée cesse d'avancer jusqu'au déploiement suivant.
- Les projections dépendent du langage publié des autres modules : un événement ajouté ou
  modifié sans réexamen de ses lecteurs passe inaperçu, comme l'a montré l'oubli des
  compagnons dans la liste des expéditions ouvertes.

## Alternatives écartées

- **Mise à jour des modèles de lecture dans la commande, par le module qui écrit** : elle
  obligerait chaque module à connaître ceux qui le lisent, et à garantir la cohérence de deux
  écritures distinctes.
- **Tâche planifiée ou processus de fond abonné au journal** : impossible sur un hébergement
  sans serveur, et les tâches planifiées de l'offre gratuite ne s'exécutent qu'une fois par
  jour.
- **Vue matérialisée de PostgreSQL** : entièrement recalculée à chaque rafraîchissement, son coût
  resterait proportionnel à l'historique, et son rafraîchissement devrait encore être déclenché.
- **Maintien du calcul par rejeu** : son coût croît sans limite avec l'historique du jeu.

## Réexamen

Cette décision devra être réexaminée si la reconstruction d'une projection approche la durée
maximale d'une fonction, si les consultations simultanées font du verrou du point de reprise
un goulet d'étranglement, ou si une lecture doit être strictement à jour.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a proposé la rédaction de cet ADR à partir
des éléments imposés par le support du TD8 et du code mis en place au cours du TD. Cette
rédaction a été relue et validée avant d'être enregistrée ; les références aux fichiers ont
été vérifiées dans le dépôt.

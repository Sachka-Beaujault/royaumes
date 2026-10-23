# ADR-0012 - La Faille : graine secrète tirée chaque jour, échéances paresseuses, et participation quotidienne enregistrée dans le flux du joueur

- Statut : accepté
- Date : 2026-10-23

## Contexte

La Faille est un donjon sans fin, renouvelé chaque jour, dont le classement compare les
guildes entre elles (fiche de cadrage, règles 9 à 17). La comparaison n'est équitable que si
toutes les guildes affrontent le même contenu un jour donné, et si aucun joueur ne peut le
connaître à l'avance, ni jouer plusieurs fois le même jour, y compris pour deux guildes.

Le dépôt du projet est public : une valeur calculée par le code à partir de la date est
connue de tous.

L'hébergement ne permet aucun processus permanent, et les tâches planifiées de l'offre gratuite
ne s'exécutent qu'une fois par jour (ADR 0004). Les manches simultanées et les échéances
paresseuses du Donjon répondent déjà à cette contrainte (ADR 0004).

La participation d'un joueur concerne deux flux : le sien, qui porte son appartenance
(ADR 0010), et celui de l'expédition qu'il rejoint. Le journal n'offre aucune transaction
couvrant deux flux.

## Décision

La graine de la Faille d'un jour est tirée au hasard lors de la première expédition du jour, et
enregistrée par l'événement `DaySeeded` dans un flux propre à ce jour, `guild-day-<jour>`, avec la
version attendue 0 : de deux premières expéditions simultanées, la seconde reçoit la graine de la
première (`src/modules/guild/infrastructure/event-store-run-repository.ts`). La graine est copiée
dans l'événement d'ouverture de chaque expédition, et n'est jamais transmise aux joueurs.

Le nom de la Faille d'un jour, et l'aperçu des sept jours suivants, ne dépendent que de la date,
en heure de Paris (`src/modules/guild/domain/calendar.ts`).

Les monstres d'un étage ne dépendent que de la graine du jour et du numéro de l'étage, et non du
nombre de héros ; ils sont tirés à l'entrée dans l'étage et enregistrés dans l'événement
`FloorEntered` (`src/modules/guild/domain/rift-rules.ts`).

Les manches sont simultanées, et leurs échéances paresseuses, comme dans le Donjon : une
lecture calcule les manches échues sans rien enregistrer, toute commande les enregistre d'abord,
et le navigateur envoie une commande d'échéance à la fin de son compte à rebours.

La participation du jour est enregistrée dans le flux du joueur (`RiftEntered`) avant son
inscription dans le flux de l'expédition ; la concurrence optimiste de son flux garantit une seule
participation par jour, quelle que soit sa guilde. Si l'inscription est refusée, la participation
est annulée (`RiftEntryCancelled`). Une inscription est d'abord décidée sans rien enregistrer, afin
qu'une expédition complète, lancée ou d'une autre guilde ne consomme pas la participation.

La liste des expéditions ouvertes d'une guilde est un modèle de lecture, `guild.open_runs`, tenu par
la projection `guild-open-runs`. Le canal temps réel d'une expédition est réservé à ses héros, et
discret.

## Conséquences

### Positives

- Toutes les guildes affrontent le même contenu un jour donné, et nul ne peut le calculer à
  l'avance, pas même à partir du code public.
- Aucune tâche de fond n'est nécessaire, ni pour ouvrir la Faille d'un jour, ni pour résoudre ses
  manches : la première expédition du jour tire la graine.
- Une modification ultérieure de l'équilibrage ne change pas les expéditions déjà jouées, dont les
  monstres sont enregistrés.
- Un joueur ne peut participer qu'une fois par jour, même en changeant de guilde, sans verrou ni
  contrainte en base.

### Négatives

- Le contenu du jour, identique pour tous, peut être communiqué par les premiers joueurs aux
  guildes qui jouent après eux ; le tirage des dégâts dépendant de la graine, de l'étage et de la
  manche, une même suite d'actions produit aussi les mêmes résultats d'une expédition à l'autre.
- Les monstres ne s'adaptant pas au nombre de héros, une guilde qui réunit quatre joueurs va
  nettement plus loin qu'un joueur seul.
- Une expédition abandonnée n'enregistre sa fin que lorsqu'une lecture ou une commande la
  constate et qu'une commande l'enregistre : sans nouvelle commande, son résultat n'entre jamais
  dans le journal.
- L'inscription en deux enregistrements n'est pas atomique : une interruption entre les deux laisse
  au joueur une participation sans expédition, jusqu'au lendemain (dette DT-016).
- Le moteur de combat duplique celui du Donjon, générateur à graine compris (dette DT-015).

## Alternatives écartées

- **Une graine calculée à partir de la date** : elle ne nécessite aucun enregistrement, mais le
  dépôt étant public, n'importe qui pourrait calculer le contenu de la Faille de tous les jours à
  venir.
- **Une graine propre à chaque expédition** : chaque groupe affronterait un contenu différent, et le
  classement des guildes dépendrait du hasard autant que du jeu.
- **Des monstres dont les points de vie s'adaptent au nombre de héros, comme le troll du Donjon** :
  plus équilibré entre petits et grands groupes, mais le contenu ne serait plus le même pour toutes
  les guildes ; écarté par l'auteur au profit de l'identité stricte du contenu.
- **La participation retrouvée dans les flux des expéditions** : vérifier qu'un joueur n'a pas déjà
  joué demanderait de parcourir toutes les expéditions du jour, et deux inscriptions simultanées à
  deux expéditions ne seraient départagées par aucune concurrence optimiste.
- **Une tâche planifiée qui résout les manches échues** : elle ne s'exécute qu'une fois par jour sur
  l'offre gratuite, alors qu'une manche dure trente secondes.

## Réexamen

Cette décision devra être réexaminée si le partage du contenu entre guildes fausse le classement,
si les expéditions abandonnées privent des guildes de leur résultat, ou si un mécanisme de
transaction entre flux devient disponible dans le journal.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a rédigé cet ADR à partir du code réalisé et des choix arrêtés avec l'auteur. La rédaction a été relue et validée avant d'être enregistrée ; les comportements décrits sont vérifiés par les tests
`src/modules/guild/domain/rift-rules.test.ts`, `src/modules/guild/domain/calendar.test.ts`,
`src/modules/guild/domain/member.test.ts` et `src/bootstrap/guild-rift.test.ts`.

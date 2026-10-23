# ADR-0010 - Module Guilde : journal d'événements pour l'appartenance et la Faille, tables classiques pour le chat

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le module Guilde ajoute au jeu trois guildes fixes, que chaque joueur rejoint dès son entrée
dans le jeu, et qu'il peut quitter pour une autre contre 50 pièces d'or prélevées dans son
village (fiche de cadrage, `docs/evaluation/fiche-cadrage.md`). Les membres d'une guilde
disposent d'un chat qui leur est réservé, et affrontent ensemble la Faille, un donjon quotidien
dont le classement retient l'étage le plus profond atteint par chaque guilde.

Ces fonctions produisent des données de nature différente :

- l'appartenance d'un joueur change rarement, mais chaque changement suit une saga avec le
  Village, et deux demandes simultanées d'un même joueur ne doivent jamais aboutir toutes deux ;
- les expéditions de la Faille ont les mêmes besoins que celles du Donjon : des manches dont
  l'échéance se calcule à partir de l'historique, et un résultat qui alimente un classement ;
- les messages du chat sont des données personnelles destinées à disparaître au terme de leur
  durée de conservation, comme ceux de la Taverne.

Le projet dispose d'un journal d'événements avec concurrence optimiste (ADR 0002), de
projections (ADR 0006), et d'une boîte d'envoi transactionnelle (ADR 0007). L'ADR 0008 a montré
qu'un journal en ajout seul se prête mal à des données destinées à disparaître, et recommande,
pour un nouveau module, des événements qui désignent les joueurs par référence plutôt que par
une copie de leur nom.

Le domaine du Donjon n'est accessible qu'à son propre module : la règle d'encapsulation des
modules interdit d'en importer les fichiers internes (ADR 0001).

## Décision

L'appartenance d'un joueur est conservée dans le journal d'événements, selon le modèle decider,
dans un flux par joueur, `guild-member-<identifiant>` (`src/modules/guild/domain/member.ts`).
Ce flux porte aussi l'état de la saga de changement de guilde : la demande en attente et la
réponse du Village sont des événements du même flux, enregistrés avec les messages qu'ils
déclenchent.

Les événements de l'appartenance ne contiennent que l'identifiant du joueur, jamais son nom : la
guilde d'un joueur est une référence, et non une copie de son identité.

Les expéditions de la Faille sont conservées dans le journal, dans un flux par expédition, selon
un decider propre au module Guilde, construit sur le modèle de celui du Donjon sans en importer
le code.

Les messages du chat sont conservés dans une table classique du schéma `guild`, créée par une
migration, et supprimés à l'expiration de leur durée de conservation, comme ceux de la Taverne.

Le classement des guildes est un modèle de lecture du schéma `guild`, tenu par une projection du
journal.

## Conséquences

### Positives

- La concurrence optimiste du flux d'un joueur garantit qu'une seule demande de changement est
  en attente à la fois, sans verrou ni contrainte en base.
- L'historique des changements de guilde et des expéditions est conservé : l'export des données
  du joueur le présente, et le classement peut être reconstruit à partir du journal.
- Les expéditions de la Faille réutilisent les mécanismes du Donjon, échéances paresseuses et
  hasard à graine, qui exigent un état reconstruit à partir des événements.
- L'effacement d'un joueur n'a rien à réécrire dans les flux de l'appartenance : une fois son
  identité effacée, ils ne se rapportent plus à personne.
- Les messages du chat disparaissent réellement au terme de leur conservation, sans exception à
  la règle de l'ajout seul du journal.

### Négatives

- Le module combine deux modèles de stockage : ses développeurs doivent maîtriser les deux, et
  ses données personnelles se trouvent à la fois dans le journal et dans ses tables.
- Le decider de la Faille duplique une partie du Donjon, comme le générateur à graine et l'ordre
  de résolution d'une manche : une correction apportée à l'un ne profite pas à l'autre.
- Les expéditions de la Faille copient le nom des héros dans leurs événements, comme celles du
  Donjon : ces noms devront être réécrits lors de l'effacement d'un joueur.
- La lecture de la guilde d'un joueur reconstruit son flux à chaque consultation ; son coût croît
  avec le nombre de ses événements.

## Alternatives écartées

- **Tout le module dans le journal d'événements** : les messages du chat y seraient conservés
  indéfiniment, et leur suppression deviendrait une réécriture du journal (ADR 0008).
- **Tout le module dans des tables classiques** : la concurrence optimiste, les échéances
  paresseuses et la reconstruction du classement devraient être réécrites à la main, alors que
  le journal et les projections les fournissent déjà.
- **Un flux par guilde, contenant les arrivées et les départs de ses membres** : tous les membres
  d'une guilde entreraient en conflit sur le même flux, et un changement concernerait deux flux,
  sans transaction commune.
- **Un mode « Faille » ajouté au module Donjon** : il modifierait profondément un module existant,
  et les règles de la fiche de cadrage ne seraient plus portées par le domaine de la Guilde.
- **Un moteur de combat commun, extrait du Donjon** : il réorganiserait le code d'un module
  existant, et placerait des règles métier dans la plateforme, qui ne doit connaître aucun module.

## Réexamen

Cette décision devra être réexaminée si les joueurs doivent pouvoir créer leurs propres guildes,
si la lecture de l'appartenance devient trop coûteuse pour la mise en page du jeu, qui la
consulte à chaque page, ou si une troisième fonction du module se révèle commune avec le Donjon.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a analysé l'idée du module proposée par
l'auteur puis rédigé cet ADR à partir des choix arrêtés avec l'auteur lors du cadrage. La rédaction a été relue et validée avant
d'être enregistrée ; les références aux fichiers existants ont été vérifiées dans le dépôt, et
le respect des règles d'architecture par la commande `pnpm lint:archi`.

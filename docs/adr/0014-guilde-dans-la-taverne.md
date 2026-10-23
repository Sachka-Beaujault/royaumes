# ADR-0014 - Guilde des auteurs de la Taverne fournie par un port de la Taverne, mis en œuvre par le lecteur public de la Guilde

- Statut : accepté
- Date : 2026-10-23

## Contexte

Dans la Taverne, le nom de chaque auteur doit être accompagné de la guilde à laquelle il
appartient (fiche de cadrage, règle 18). L'appartenance est conservée par la Guilde, dans le flux
de chaque joueur (ADR 0010) ; la Taverne conserve ses messages dans sa propre table, sans
événements (ADR 0008).

Un joueur peut changer de guilde : la guilde présentée doit être celle à laquelle il appartient,
et non celle du jour de son message.

Un module existant n'est modifié que si le nouveau module l'exige, par ses contrats, et sans
importer de fichier interne d'un autre module (énoncé de l'évaluation, partie 4.2 ; ADR 0001).
Les deux moyens de communication éprouvés du projet sont les messages de la boîte d'envoi
(ADR 0007) et la lecture du langage publié par une projection (ADR 0006).

## Décision

La Taverne définit un port, `AuthorGuilds` (`src/modules/tavern/application/author-guilds.ts`),
qui renvoie la guilde actuelle de chacun des joueurs demandés. Le port est facultatif : sans lui,
les messages sont présentés sans guilde.

La racine de composition fournit à la Taverne la mise en œuvre de ce port : le lecteur public de
la Guilde, `createGuildReader`, exposé par son entrée publique (`src/modules/guild/index.ts`), qui
lit l'appartenance dans le flux de chaque joueur.

La guilde n'est pas conservée avec le message : elle est lue à chaque présentation, une fois par
auteur, pour l'historique, la réponse à une publication et les messages diffusés sur le canal de
la Taverne. Le contrat de la Taverne présente la guilde sous la forme d'un simple identifiant
(`authorGuild`), sans importer aucun type de la Guilde.

## Conséquences

### Positives

- La Taverne ne dépend d'aucun fichier de la Guilde, et la Guilde ignore tout de la Taverne : le
  sens de la dépendance est porté par le port, défini par le module qui en a besoin.
- La guilde présentée est toujours la guilde actuelle de l'auteur, sans aucune mise à jour à
  propager lors d'un changement de guilde.
- La table et la migration de la Taverne sont inchangées, et la Taverne ne conserve aucune donnée
  nouvelle : ses données personnelles et son effacement ne changent pas.
- La Taverne reste testable seule, avec ou sans lecteur des guildes, et aucun de ses tests
  existants n'est modifié.

### Négatives

- La lecture est synchrone : chaque présentation de messages reconstruit l'appartenance de
  chacun de leurs auteurs, jusqu'à cinquante flux pour l'historique (dette DT-020).
- La Taverne dépend, à l'exécution, de la disponibilité du lecteur de la Guilde : si la Guilde
  était extraite dans un service, chaque consultation de la Taverne deviendrait un appel réseau.
- Le contrat public de la Taverne change : un champ s'ajoute à chaque message, que tout lecteur
  de ce contrat reçoit désormais.

## Alternatives écartées

- **Une projection de l'appartenance tenue par la Taverne** : aucun couplage à l'exécution, mais
  la Taverne devrait connaître le langage publié de la Guilde, et recevoir une table, une
  migration et une projection versionnée, pour afficher un emblème.
- **Des messages de la boîte d'envoi adressés à la Taverne à chaque changement de guilde** : la
  Guilde devrait connaître la Taverne, et la Taverne recevoir des gestionnaires et une table pour
  conserver l'appartenance de tous les joueurs.
- **La guilde copiée dans le message lors de sa publication** : la Taverne conserverait une donnée
  qui devient fausse dès que l'auteur change de guilde, et sa table devrait recevoir une
  migration.
- **L'import direct du lecteur de la Guilde par la Taverne** : autorisé par les règles de
  dépendance, puisqu'il passe par l'entrée publique, mais la Taverne dépendrait alors de la
  Guilde, et ne pourrait plus fonctionner ni être testée sans elle.
- **L'association des guildes dans l'interface de la Taverne** : la Guilde devrait exposer une
  route qui révèle la guilde de n'importe quel joueur, et le canal temps réel ne transmettrait
  pas l'information.

## Réexamen

Cette décision devra être réexaminée si la Guilde est extraite dans un service autonome, si le
coût de la lecture des appartenances devient sensible pour la Taverne, ou si d'autres modules
doivent présenter la guilde des joueurs, ce qui justifierait un modèle de lecture partagé.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a rédigé le code et cet ADR à partir des choix de l'auter. 
La rédaction a été relue et validée par l'auteur avant d'être enregistrée ; les
comportements décrits sont vérifiés par les tests `src/bootstrap/tavern-guilds.test.ts` et
`src/modules/tavern/application/tavern-service.test.ts`, et l'absence de dépendance de la
Taverne envers la Guilde par la commande `pnpm lint:archi`.

# ADR-0003 - Server-Sent Events, alimentés par le journal d'événements, pour le temps réel

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les joueurs doivent être informés des changements sans recharger la page : d'abord entre les
onglets d'un même joueur, puis entre les participants d'une partie du Donjon (TD6).

Les actions des joueurs passent déjà par l'API, au moyen de requêtes HTTP authentifiées par
le cookie de session : seules les notifications ont besoin d'un canal du serveur vers le
navigateur.

L'application est hébergée sur l'offre gratuite de Vercel : la durée d'exécution d'une
fonction est plafonnée (300 secondes), plusieurs instances peuvent traiter les requêtes sans
partager de mémoire, et aucune infrastructure supplémentaire (serveur permanent, service de
messagerie) n'est disponible.

Le projet dispose d'un journal d'événements dont chaque flux porte des versions croissantes
et uniques (ADR 0002).

## Décision

Les changements sont diffusés par des Server-Sent Events, sur la route `/api/stream/<canal>`
(`src/platform/realtime/stream-api.ts`).

Un canal correspond exactement à un flux du journal. L'identifiant de chaque message est la
version de l'événement, ce qui permet au navigateur de reprendre la diffusion après une
interruption grâce à l'en-tête `Last-Event-ID`, sans perte ni doublon.

Le flux relit le journal toutes les demi-secondes. Il se ferme de lui-même au bout de 240
secondes, sous la limite de la plateforme, et le navigateur s'y reconnecte automatiquement.

L'accès aux flux est réservé aux joueurs connectés, et chaque module déclare la règle d'accès
à ses canaux (`src/platform/realtime/channel-policy.ts`) ; un canal qu'aucune règle ne couvre
est refusé.

L'interface relit sa vue auprès de l'API à chaque notification, plutôt que d'appliquer
elle-même le contenu des événements (`src/platform/realtime/use-channel.ts`).

## Conséquences

### Positives

- Les flux sont du HTTP ordinaire : ils fonctionnent sur l'hébergement sans serveur et
  traversent les intermédiaires du réseau sans configuration particulière.
- Le navigateur gère nativement la réception et la reconnexion (`EventSource`), et le
  cookie de session suffit à authentifier le flux.
- La reprise par `Last-Event-ID` garantit qu'aucun événement n'est perdu ni reçu deux fois,
  y compris lors des fermetures volontaires.
- Aucun état n'est conservé en mémoire : n'importe quelle instance peut servir n'importe
  quel flux, puisque le journal est la seule source des notifications.
- L'interface affiche toujours la vue calculée par le serveur, sans rejouer elle-même les
  événements.

### Négatives

- Chaque joueur connecté produit deux lectures du journal par seconde ; ce coût croît avec
  le nombre de joueurs connectés simultanément.
- Chaque notification provoque une relecture de la vue auprès de l'API, soit une requête
  supplémentaire par événement et par onglet abonné.
- Chaque flux occupe une fonction Vercel pendant toute sa durée, et se reconnecte toutes les
  quatre minutes.
- La communication est unidirectionnelle : toute action du navigateur reste une requête
  distincte vers l'API.

## Alternatives écartées

- **WebSocket** : connexion bidirectionnelle permanente, mais qui suppose un serveur capable
  de la maintenir ouverte ; elle s'accorde mal avec les fonctions Vercel, à durée plafonnée,
  et aurait exigé un hébergement permanent supplémentaire.
- **Interrogation périodique par le navigateur** : simple, mais chaque onglet multiplierait
  les requêtes complètes vers l'API, et le délai de réception dépendrait de l'intervalle
  choisi.
- **Mécanisme de notification partagé entre instances** (`LISTEN/NOTIFY` de PostgreSQL, ou un
  service de messagerie comme Redis) : il éviterait la relecture périodique du journal, mais
  suppose des connexions permanentes ou une infrastructure supplémentaire, hors de portée de
  l'offre gratuite.

## Réexamen

Cette décision devra être réexaminée si le nombre de joueurs connectés simultanément rend
les lectures du journal pesantes pour la base, si un besoin de communication du navigateur
vers le serveur à très faible délai apparaît, ou si l'hébergeur propose une prise en charge
stable des WebSocket.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a proposé la rédaction de cet ADR à partir
des éléments imposés par le support du TD5 et du code mis en place au cours du TD. Cette
rédaction a été relue et validée avant d'être enregistrée ; les références aux fichiers ont
été vérifiées dans le dépôt.

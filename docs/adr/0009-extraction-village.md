# ADR-0009 - Extraction du Village en service autonome, préparée mais non déployée

- Statut : accepté
- Date : 2026-10-21

## Contexte

L'ADR 0001 a retenu un monolithe modulaire, en promettant des frontières entre modules assez
strictes pour qu'un module puisse un jour être extrait dans un service autonome. Cette promesse
n'avait jamais été vérifiée.

Les raisons d'extraire un module sont connues : montée en charge indépendante, autonomie des
équipes, cadence de déploiement propre, isolation d'une panne ou d'une faille, technologie
différente. Aucune ne s'applique aujourd'hui au jeu, développé par une seule personne et joué par
quelques dizaines de joueurs.

L'inventaire des dépendances du Village en compte sept. Deux ne passent pas par le code : le
Classement et le canal temps réel lisent les événements du Village directement dans le journal
commun, par son langage publié.

## Décision

Le Village peut s'exécuter dans un service autonome (`src/services/village/`, démarré par
`scripts/village-service.ts`), doté de sa propre base, de son propre journal et de sa propre boîte
d'envoi.

L'application devient alors une passerelle : elle reçoit une version distante du module Village
(`src/modules/realm/remote.ts`), de même forme que la version exécutée dans le processus ; la
racine de composition choisit l'une ou l'autre selon la variable `REALM_SERVICE_URL`.

Les messages de la saga franchissent la frontière par une boîte de réception
(`src/platform/outbox/inbox-api.ts`), sans modifier les garanties de la boîte d'envoi : livraison au
moins une fois, gestionnaires idempotents.

Un relais recopie le flux d'événements publié par le service dans le journal de l'application, où
le Classement et le canal temps réel continuent de le lire sans modification.

Les échanges entre les deux processus sont authentifiés par un secret partagé, `SERVICE_SECRET`,
qui n'est jamais versionné (`src/platform/http/service-auth.ts`).

Le service n'est pas déployé : en production, ni `REALM_SERVICE_URL` ni `SERVICE_SECRET` ne sont
définies, et le Village s'exécute dans l'application.

## Conséquences

### Positives

- Les frontières du Village sont démontrées, et non plus supposées : le module s'exécute dans un
  autre processus sans qu'une ligne de son domaine ni de sa couche application ait changé.
- Six tests de contrat vérifient ces frontières à chaque construction, y compris la reprise d'un
  échange du Marché après une panne du service.
- L'extraction est réversible sans migration de données : l'application relancée seule retrouve
  les villages, dont le relais a déposé une copie complète dans son journal.
- La boîte de réception et l'authentification entre processus sont des briques de la plateforme,
  réutilisables pour l'extraction de tout autre module.
- Le coût réel d'une extraction est mesuré : passerelle, relais, boîte de réception, secret, et une
  panne partielle désormais possible.

### Négatives

- Deux chemins d'exécution du Village doivent être maintenus, l'un dans le processus, l'autre
  distant, et chaque évolution du module doit être vérifiée sur les deux.
- Les événements du Village sont copiés dans le journal de l'application, avec une cohérence
  différée : le Classement et le canal temps réel ne les voient qu'après le passage du relais.
- Des dettes doivent être remboursées avant tout déploiement du service : ses migrations, la
  pagination de son flux publié et la distribution de sa boîte d'envoi, consignées dans le registre
  de la dette technique.
- L'authentification repose sur un secret partagé : en cas de fuite, il permettrait de se faire
  passer pour n'importe quel joueur auprès du service.

## Alternatives écartées

- **Déployer le service** : un second déploiement, une seconde base et un second ensemble de
  secrets, sans qu'aucune des raisons d'extraire ne le justifie aujourd'hui.
- **Ne pas extraire** : les frontières resteraient une hypothèse, et la promesse de l'ADR 0001 ne
  serait jamais vérifiée.
- **La lecture à distance du flux publié par le Classement et le canal temps réel** : elle
  obligerait ces deux lecteurs à connaître le service, et ajouterait un appel réseau à chacune de
  leurs lectures.
- **Extraire le Marché** : sa saga lie son fonctionnement à celui du Village, et il dépend lui-même
  de messages vers le Village ; le Village, dont le domaine ne dépend d'aucun autre module, est le
  meilleur candidat.
- **Un jeton signé ou le TLS mutuel pour authentifier les échanges** : plus robustes qu'un secret
  partagé, mais d'une mise en œuvre disproportionnée pour un service qui n'est pas déployé.

## Réexamen

Cette décision devra être réexaminée si le test de charge montre que le Village dépasse le budget
de performance alors que les autres modules le respectent, si une seconde équipe est chargée du
Village, ou si le Village doit être déployé plus souvent que le reste du jeu.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a proposé la rédaction de cet ADR à partir
des éléments imposés par le support du TD11 et du code mis en place au cours du TD. Cette
rédaction a été relue et validée avant d'être enregistrée ; les références aux fichiers ont
été vérifiées dans le dépôt.

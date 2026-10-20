# ADR-0007 - Sagas orchestrées, dont les messages transitent par une boîte d'envoi transactionnelle, pour les opérations qui concernent plusieurs modules

- Statut : accepté
- Date : 2026-10-20

## Contexte

Un échange du Marché modifie les données du Marché, celles du village du vendeur et celles du
village de l'acheteur. Il ne doit ni créer ni perdre de ressources, quelle que soit l'étape à
laquelle une panne, une fin de fonction ou un conflit d'écriture l'interrompt.

Un module n'écrit jamais dans les données d'un autre (règle d'encapsulation, TD2), et
l'extraction d'un module dans un service doté de sa propre base de données est envisagée
(TD11) : une transaction qui engloberait les données de deux modules rendrait cette extraction
impossible.

L'hébergement ne permet aucun processus permanent : aucun service de messagerie ni aucune tâche
de fond ne peut acheminer les messages entre deux requêtes (ADR 0004).

## Décision

Une transaction ne modifie jamais les données que d'un seul module.

Une opération qui concerne plusieurs modules est une saga, dont les étapes sont identifiées
comme compensables, pivot ou reprises jusqu'au succès ; pour un échange, la mise en séquestre
des ressources du vendeur est compensable, le paiement de l'acheteur est le pivot, et les
versements de la livraison comme la restitution des ressources en séquestre sont repris
jusqu'au succès.

La saga est orchestrée par le module qui porte l'opération (`src/modules/market/domain/saga.ts`) ;
les participants, comme le Village, ne connaissent pas la saga, et répondent à l'adresse de
retour indiquée dans chaque demande.

Les messages sont enregistrés dans la boîte d'envoi de la plateforme (`platform.outbox`,
`src/platform/outbox/`), dans la même transaction que les événements qui les déclenchent.

La distribution est garantie au moins une fois : chaque message est réservé par un bail, retenté
avec un recul exponentiel en cas d'échec, et abandonné après dix tentatives.

Chaque gestionnaire de message est idempotent, grâce à une clé d'idempotence choisie par le
demandeur : un message remis plusieurs fois n'a d'effet qu'une fois.

La distribution a lieu après chaque commande et chaque consultation du Marché, et une fois par
jour par une tâche planifiée de Vercel, dont la route n'est accessible qu'avec le secret
`CRON_SECRET`.

## Conséquences

### Positives

- Aucun module n'écrit dans les données d'un autre : chaque participant n'écrit que dans ses
  propres données et dans la boîte d'envoi de la plateforme.
- Une panne à n'importe quel moment de la saga ne perd ni ne duplique aucune ressource : aucun
  message n'est perdu, et un message remis plusieurs fois n'a d'effet qu'une fois.
- Le Village peut servir d'autres demandeurs sans modification : il sait prélever et verser des
  ressources, sans rien connaître des offres.
- La boîte d'envoi sert aussi de minuterie : un message différé déclenche l'échéance d'une offre
  sans tâche de fond.
- Le déroulement complet de la saga se lit en un seul endroit, l'orchestrateur.

### Négatives

- Des états intermédiaires sont visibles des joueurs, comme une offre en réservation ou en
  règlement, et l'interface doit les présenter.
- La latence dépend de l'activité : une saga interrompue ne reprend qu'à la consultation
  suivante du Marché, ou lors de la tâche planifiée du lendemain.
- Chaque gestionnaire doit être écrit de manière idempotente, et ses doublons doivent être
  testés.
- Les messages abandonnés restent dans la table, mais aucun outil ne permet encore de les
  examiner ni de les relancer (dette DT-007).
- La table de la boîte d'envoi grandit sans limite, les messages traités étant conservés.

## Alternatives écartées

- **Une transaction unique englobant les données des deux modules** : elle obligerait le Marché
  à écrire dans les données du Village, et rendrait impossible l'extraction d'un module dans un
  service doté de sa propre base.
- **Une transaction distribuée par validation en deux phases** : elle suppose un coordinateur et
  des participants capables de maintenir des verrous entre deux requêtes, ce que ne permet pas
  l'hébergement sans serveur.
- **Un appel direct du Village par le Marché, sans boîte d'envoi** : il reproduit le problème de
  la double écriture, puisqu'une panne entre l'enregistrement de l'offre et l'appel laisse le
  système incohérent.
- **Une saga chorégraphiée** : le déroulement serait réparti entre les participants, et le
  Village devrait connaître les événements du Marché.
- **Le journal d'événements utilisé comme boîte d'envoi** : un message est une commande adressée
  à un destinataire, et non un fait, et sa distribution demande de suivre, message par message,
  le nombre de tentatives et la dernière erreur.

## Réexamen

Cette décision devra être réexaminée si un module est extrait dans un service distinct, ce qui
demanderait une boîte d'envoi par base et un transport entre services, si le volume de messages
justifie un courtier de messages dédié, ou si une latence que la distribution déclenchée par les
requêtes ne satisfait plus devient nécessaire.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a proposé la rédaction de cet ADR à partir
des éléments imposés par le support du TD9 et du code mis en place au cours du TD. Cette
rédaction a été relue et validée avant d'être enregistrée ; les références aux fichiers ont
été vérifiées dans le dépôt.

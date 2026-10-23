# ADR-0011 - Saga orchestrée par la Guilde, par la boîte d'envoi, pour payer un changement de guilde au Village

- Statut : accepté
- Date : 2026-10-23

## Contexte

Changer de guilde coûte 50 pièces d'or, qui se trouvent dans le village du joueur (fiche de
cadrage, règle 3). L'appartenance est conservée dans le journal, dans le flux du joueur
(ADR 0010) ; le stock du village appartient au module Village, et ne peut être modifié que par
lui (ADR 0001).

Le changement peut devenir impossible après le paiement : un joueur qui rejoint la Faille
pendant que sa demande est en attente voit sa guilde figée jusqu'au lendemain (règles 4 et 5).
L'or ne doit alors être ni perdu ni créé.

Le Village expose déjà, par son contrat, les sujets `realm.withdraw` et `realm.deposit`, qu'il
traite de manière idempotente, et répond à l'adresse de retour indiquée par le demandeur
(ADR 0007). Il peut être extrait dans un service autonome (ADR 0009).

## Décision

Le changement de guilde est une saga orchestrée par la Guilde (`src/modules/guild/domain/saga.ts`),
dont les étapes sont :

1. la demande, enregistrée dans le flux du joueur avec le message de prélèvement de l'or,
   adressé au Village par la boîte d'envoi (`realm.withdraw`, réponse attendue sur
   `guild.transfer-result`) ;
2. le prélèvement par le Village, étape compensable ; un refus, faute d'or, annule la demande
   sans rien à compenser ;
3. la confirmation du changement par la Guilde, à la réception de l'or, étape pivot ;
4. si le joueur a rejoint la Faille pendant l'attente, l'annulation du changement et le
   remboursement de l'or par un message de versement (`realm.deposit`), étape de compensation,
   reprise jusqu'au succès.

Chaque mouvement d'or porte un identifiant déterminé par le joueur, la demande et l'étape
(`guild-<joueur>:change-<n>`, `guild-<joueur>:refund-<n>`), qui sert de clé d'idempotence au
Village. Le gestionnaire de la Guilde (`src/modules/guild/messages.ts`) ignore toute réponse qui
ne correspond pas à la demande en cours.

La Guilde distribue la boîte d'envoi après chacune de ses commandes et à chaque consultation de
l'appartenance ; la tâche quotidienne la distribue aussi.

Le Village n'est pas modifié.

## Conséquences

### Positives

- Aucun module n'écrit dans les données d'un autre : la Guilde n'écrit que dans le flux du
  joueur, et le Village dans celui du village.
- L'or n'est ni perdu ni dupliqué : un message remis plusieurs fois n'a d'effet qu'une fois, et
  un changement devenu impossible est compensé par un versement.
- Le Village sert un nouveau demandeur sans aucune modification de son code ni de ses contrats,
  y compris lorsqu'il est extrait dans un service autonome : le relais transmet les messages de
  la Guilde comme ceux du Marché.
- La concurrence optimiste du flux du joueur garantit qu'une seule demande est en attente à la
  fois.

### Négatives

- La cohérence n'est obtenue qu'à terme : une demande en attente est visible du joueur, et
  l'interface doit la relire jusqu'à son issue.
- Un joueur dont le changement est compensé voit son or quitter son village, puis y revenir :
  pendant cet intervalle, il ne peut pas le dépenser ailleurs.
- La règle qui rend le changement impossible n'est vérifiée qu'à la réception de l'or : le
  prélèvement a lieu même lorsque le changement est déjà condamné, et doit alors être compensé.
- Une saga interrompue ne reprend qu'à la consultation suivante de la Guilde, ou lors de la
  tâche quotidienne.

## Alternatives écartées

- **La lecture du langage publié du Village, sans message** : la Guilde pourrait connaître le
  stock d'or du joueur, mais non le prélever ; vérifier puis prélever par deux opérations
  distinctes laisserait le stock changer entre les deux.
- **Un appel direct du service du Village par la Guilde** : il obligerait la Guilde à dépendre
  d'un fichier interne du Village, et une panne entre l'enregistrement du changement et l'appel
  laisserait le système incohérent.
- **Le prélèvement après le changement** : le joueur aurait changé de guilde avant que le
  paiement soit garanti, et un refus du Village obligerait à défaire un changement déjà visible.
- **Le refus des participations à la Faille pendant une demande en attente** : il supprime la
  compensation, mais bloque le joueur hors de la Faille tant que le Village n'a pas répondu,
  potentiellement jusqu'à la tâche quotidienne.
- **Une saga chorégraphiée, où le Village réagirait aux événements de la Guilde** : le Village
  devrait connaître les guildes, et le déroulement serait réparti entre les deux modules.

## Réexamen

Cette décision devra être réexaminée si le changement de guilde doit coûter d'autres
ressources que l'or, si le Village extrait en service est déployé en production, ce qui
soumettrait la saga aux dettes DT-010 à DT-012, ou si la latence de la saga devient sensible
pour les joueurs.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a rédigé le code de la saga, sur le modèle de celle du Marché, et cet
ADR, à partir des choix de l'auteur. La rédaction a été relue et validée par l'auteur avant d'être
enregistrée ; chaque étape décrite est vérifiée par les tests du domaine
(`src/modules/guild/domain/member.test.ts`), de la saga (`src/modules/guild/messages.test.ts`)
et de l'API (`src/bootstrap/guild-api.test.ts`), dont un avec le Village extrait en service.

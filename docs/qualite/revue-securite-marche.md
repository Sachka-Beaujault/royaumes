# Revue de sécurité du Marché : intégrité des échanges

- Date : 2026-10-20
- Périmètre : API du module Marché, gestionnaires de messages du Village et du Marché, boîte d'envoi et sa route de distribution, canal temps réel du Marché.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design, A08 Software and Data Integrity Failures).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| M1 | Un joueur ne publie, n'accepte et ne retire une offre qu'en son propre nom | Lecture de `api.ts` : aucune route n'accepte d'identifiant de joueur | Dans `api.ts`, chaque route obtient le joueur par `c.var.userId` et `c.var.userName`, renseignés par l'intergiciel `requireUser`. L'adresse ne fournit que l'identifiant de l'offre, et le corps d'une publication ne contient que `give` et `want` : aucune route n'accepte d'identifiant de joueur. | conforme |
| M2 | Seul le vendeur peut retirer son offre et récupérer les ressources en séquestre | Test « restitue les ressources au vendeur qui retire son offre » | Le test réussit. Un joueur qui n'est pas le vendeur et tente de retirer l'offre reçoit l'erreur 403 `NOT_SELLER`. | conforme |
| M3 | Un joueur ne peut pas accepter sa propre offre | Tests « refuse l'acceptation de sa propre offre... » et « restitue les ressources au vendeur... » | Les tests « refuse l'acceptation de sa propre offre, d'une offre en cours de règlement ou échue » et « restitue les ressources au vendeur qui retire son offre » réussissent. | conforme |
| M4 | Aucun échange ne crée ni ne détruit de ressources, y compris lors d'acceptations simultanées | Test « ne conclut l'échange qu'avec un seul acheteur, lors de deux acceptations simultanées » | Le test réussit : la première acceptation place l'offre en règlement, ce qui interdit la seconde, et aucune ressource n'est créée ni détruite. | conforme |
| M5 | Un message remis plusieurs fois n'a d'effet qu'une fois | Test « n'a qu'un effet, et ne répond qu'une fois, lorsqu'un message est remis deux fois » ; test « ignore une réponse en double... » | Les tests « n'a qu'un effet, et ne répond qu'une fois, lorsqu'un message est remis deux fois » (Village) et « ignore une réponse en double, ou qui ne correspond pas à l'étape en cours » (Marché) réussissent. | conforme |
| M6 | Les quantités échangées sont des entiers strictement positifs, à l'entrée de l'API comme à la réception d'un message | Publication d'une offre de -50 bois ; schéma `ResourceAmounts` | La publication d'une offre de -50 bois est refusée avec l'erreur 400 `INVALID_INPUT` (« expected number to be >0 »), et le stock du village ne change pas ; une quantité décimale est également refusée (« expected int »). Le schéma `ResourceAmounts` exige des entiers strictement positifs ; il valide l'entrée de l'API et, par le schéma `TransferRequest`, chaque message reçu par le Village. | conforme |
| M7 | Aucun joueur ne peut provoquer un mouvement de ressources dans un village autrement que par une offre | Lecture des routes de l'API : aucune n'enregistre de message dans la boîte d'envoi | Les routes de `api.ts` n'appellent que les fonctions du service (publication, `list`, `getView`, `acceptOffer`, `withdrawOffer`) ; aucune n'enregistre de message dans la boîte d'envoi : un mouvement de ressources ne peut naître que d'une offre. | conforme |
| M8 | La route de distribution planifiée n'est accessible qu'avec le secret, absent du dépôt | Test « refuse une requête sans le secret attendu, et reste fermée sans secret configuré (401) » ; `git grep -n CRON_SECRET` | Le test réussit. `CRON_SECRET` n'apparaît dans le dépôt que comme nom : vide dans `.env.example`, lu dans `process.env` par `server.ts`, cité dans la documentation et l'ADR 0007 ; les tests utilisent une valeur de test qui leur est propre. Aucune valeur réelle n'est versionnée. | conforme |
| M9 | Le canal du Marché ne transmet aucune donnée d'événement | Route de repli `/api/stream/market/events?after=0` | La route de repli renvoie quatorze événements de six types (`OfferPublished`, `OfferOpened`, `OfferAccepted`, `PaymentRefused`, `TradeCompleted`, `OfferWithdrawn`), dont le champ `data` est toujours vide. | conforme |
| M10 | Les ressources manquantes lors d'un paiement refusé ne sont connues que de l'acheteur concerné | Consultation de l'offre par le vendeur après un paiement refusé | Après un paiement refusé, la vue de l'acheteur indique les quantités manquantes, tandis que la vue de l'offre consultée par le vendeur indique `missing: null`. | conforme |

## Synthèse

10 exigences : 10 conformes, aucune non conforme et aucune en risque accepté.

Action décidée : les messages abandonnés de la boîte d'envoi, qui peuvent bloquer une offre
avec des ressources en séquestre, sont consignés dans le registre de la dette technique.


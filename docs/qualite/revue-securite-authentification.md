# Revue de sécurité du parcours d'authentification

- Date : 2026-10-20
- Périmètre : inscription, connexion, déconnexion, sessions, accès à l'API et aux pages du jeu.
- Références : OWASP Top 10, OWASP ASVS.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| S1 | Les mots de passe ne sont conservés que sous forme d'empreinte, par une fonction dédiée | Test « ne conserve qu'une empreinte du mot de passe » ; documentation de Better Auth | Le test réussit : la colonne `identity.account.password` contient une empreinte non vide, qui ne contient pas le mot de passe. Le hachage est assuré par Better Auth (scrypt). | conforme |
| S2 | Les mots de passe comportent au moins 8 caractères | Test « refuse un mot de passe trop court » | Le test réussit : un mot de passe de 5 caractères est refusé avec le code 400 (`minPasswordLength: 8`). | conforme |
| S3 | Les tentatives répétées d'inscription et de connexion sont limitées | Sous-partie 2.3 ; configuration de `better-auth.ts` | `better-auth.ts` limite les inscriptions à 40 et les connexions à 60 par minute et par adresse IP. Vérifié en local : au-delà de 60 tentatives de connexion dans la minute, la réponse est un code 429 « Too many requests ». La limitation reste active sur Vercel même si `AUTH_RATE_LIMIT=off`. Les compteurs sont conservés dans la mémoire de chaque instance. | conforme |
| S4 | Le cookie de session est inaccessible au JavaScript de la page | Test sur l'attribut `HttpOnly` | Le test réussit, et l'en-tête observé avec curl le confirme : le cookie `better-auth.session_token` porte l'attribut `HttpOnly`. | conforme |
| S5 | Le cookie de session n'est pas envoyé par les requêtes émises depuis un autre site | Test sur l'attribut `SameSite` | Le test réussit, et l'en-tête observé avec curl le confirme : le cookie porte l'attribut `SameSite=Lax`. | conforme |
| S6 | Le cookie de session ne circule que sur des connexions chiffrées | Inspection du cookie dans le navigateur ; comportement en local et en production | En production, le cookie se nomme `__Secure-better-auth.session_token` et porte l'attribut `Secure` : le navigateur ne le transmet que sur HTTPS. En local, sur `http://localhost`, l'attribut est absent, ce qui est sans conséquence puisque la connexion ne quitte pas le poste. | Conforme |
| S7 | Le secret de signature n'est pas versionné, et son absence en production empêche le démarrage | `git grep BETTER_AUTH_SECRET` ; fonction `resolveSecret` | `BETTER_AUTH_SECRET` n'apparaît que comme nom de variable : vide dans `.env.example`, lu dans `process.env` par `better-auth.ts`. Aucune valeur n'est versionnée et aucun fichier `.env.local` n'existe. La fonction `resolveSecret` lève une erreur en production sur Vercel si la variable est absente. | conforme |
| S8 | La connexion ne révèle pas si une adresse est inscrite | Test « répond de la même manière que l'adresse existe ou non » | Le test réussit : un mauvais mot de passe pour une adresse inscrite et une adresse inconnue produisent la même réponse (même code 401, même corps). | conforme |
| S9 | L'inscription ne révèle pas si une adresse est inscrite | Création d'un compte avec une adresse déjà utilisée | Une inscription avec une adresse déjà utilisée reçoit le code 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`, affiché « Cette adresse est déjà utilisée. » : l'inscription révèle l'existence d'un compte. Risque accepté : le jeu ne conserve aucune donnée sensible et n'envoie aucun courrier électronique, ce qui exclut la parade consistant à répondre par courrier dans tous les cas. | risque accepté |
| S10 | Toute route de l'API réservée aux joueurs refuse une requête anonyme | Tests « Contrôle d'accès à l'API du Village » ; racine de composition | Les tests « refuse une lecture anonyme » et « refuse une commande anonyme » réussissent (401, rien n'est enregistré), et une requête anonyme à `/api/realm/village` reçoit 401. La protection est déclarée module par module dans `create-api.ts` (`app.use('/realm/*', requireUser(auth))`) : un nouveau module pourrait être oublié. Ce risque est maîtrisé par un test de contrôle d'accès accompagnant chaque module protégé. | conforme |
| S11 | Un joueur ne peut accéder qu'à ses propres données | Test « isole les villages des joueurs » ; origine de `userId` dans les routes | Le test « isole les villages des joueurs » réussit. Le nom du flux est construit à partir de `c.var.userId`, renseigné par `requireUser` ; aucune route n'accepte un identifiant de joueur fourni par le client. | conforme |
| S12 | Les pages du jeu sont protégées sur le serveur, avant tout rendu | Mise en page `app/(jeu)/layout.tsx` ; accès à `/village` sans session | `app/(jeu)/layout.tsx` vérifie la session sur le serveur avant tout rendu (`dynamic = 'force-dynamic'`). Une requête anonyme à `/village` reçoit une redirection 307 vers `/login`, sans aucun contenu du jeu. | conforme |
| S13 | Les erreurs imprévues ne révèlent aucun détail technique au client | Gestionnaire `onError` de la racine de composition | Le gestionnaire `onError` de `create-api.ts` consigne l'erreur dans les journaux du serveur et ne renvoie au client que `{ error: { code: 'INTERNAL', message: 'Erreur interne' } }`, avec le code 500. | conforme |
| S14 | La déconnexion invalide la session sur le serveur | Réutilisation d'un cookie après déconnexion | La déconnexion avec l'origine de l'application réussit (`{"success":true}`). Le même cookie, réutilisé ensuite, reçoit une erreur 401 `UNAUTHENTICATED` : la session a été supprimée sur le serveur. | conforme |
| S15 | Une requête d'authentification accompagnée d'un cookie et émise depuis une autre origine est refusée | Appel de la déconnexion avec un en-tête `origin` étranger | La déconnexion avec l'en-tête `origin: http://site-malveillant.example` est refusée (403 `INVALID_ORIGIN`), de même qu'une requête sans en-tête `origin` (403 `MISSING_OR_NULL_ORIGIN`). Après ces refus, la session était toujours valide. | conforme |
| S16 | Un flux temps réel n'est accessible qu'aux joueurs connectés, et seulement pour les canaux auxquels ils ont droit | Tests « réserve le temps réel aux joueurs connectés (401) », « refuse l'écoute du village d'un autre joueur (403) » et « refuse un canal qu'aucune règle ne couvre (403) » ; principe de l'accès fermé par défaut dans `channel-policy.ts` | Un visiteur anonyme reçoit une erreur 401, un joueur qui tente d'écouter le village d'un autre joueur une erreur 403. Un canal sans règle est refusé : l'oubli d'une règle par un module futur rend ses canaux inaccessibles, et non publics. | Conforme |

## Synthèse

16 exigences : 15 conformes, aucune non conforme et 1 en risque accepté (S9). Plus aucune
exigence n'est en attente de vérification.

Actions décidées :

- S3 : les compteurs de la limitation des tentatives sont conservés dans la mémoire de chaque
  instance, et ne sont donc pas partagés entre instances ; cette limite est consignée dans le
  registre de la dette technique.

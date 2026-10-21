# Bilan technique de Royaumes

- Date : 2026-10-21
- Version examinée : étiquette `td11-fin`
- Auteur : Sachka Beaujault

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | 6 : `realm`, `dungeon`, `market`, `ranking`, `tavern`, `system` ; un service extrait, `village` |
| Briques de la plateforme | 9 : `auth`, `cron`, `db`, `event-store`, `http`, `outbox`, `privacy`, `projection`, `realtime` |
| Lignes de code, hors tests | 8 258 (`src/` et `app/`) |
| Fichiers de test, nombre de tests | 33 fichiers, 232 tests |
| Commits | 79 à l'étiquette `td11-fin` |
| Hébergement | Vercel (Francfort), base Neon (Francfort) |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | 1 093, dont le module distant ; service extrait : 82 |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 064 |
| `market` | Event Sourcing, projection des offres, saga | 1 271 |
| `ranking` | Projection du journal | 459 |
| `tavern` | Tables ordinaires | 678 |
| `system` | Aucun | 73 |

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction du Village (TD11) | Tenue : le Village s'exécute dans un autre processus sans modification de son domaine ni de sa couche application ; six tests de contrat le vérifient. Prix : passerelle, relais, boîte de réception et secret partagé |
| 0002 | Event Sourcing pour le Village | Ajout des projections (TD8), effacement des données (TD10), extraction (TD11) | Tenue : les projections ont reconstruit le classement à partir de l'historique antérieur ; le relais a recopié le flux du service. Prix : une exception encadrée à l'ajout seul pour l'effacement (ADR 0008) |
| 0003 | Server-Sent Events alimentés par le journal | Canaux discrets du Donjon (TD6), canal global du classement (TD8), canal à source propre de la Taverne (TD10) | Tenue : trois formes de canaux ajoutées sans changer de technique. Prix : deux lectures du journal par seconde et par joueur connecté |
| 0004 | Manches simultanées et échéances paresseuses | Compagnons et échéance d'exploration (TD7) | Tenue : l'échéance d'exploration a réutilisé le mécanisme sans nouvelle brique, et a remboursé DT-006. Limite : une expédition abandonnée n'enregistre jamais sa fin |
| 0005 | Intelligence artificielle déterministe | Simulation de 12 000 expéditions (TD7) | Tenue : mesures exactes et reproductibles, deux corrections d'équilibrage protégées par des tests statistiques |
| 0006 | CQRS et projections rattrapées à la lecture | Liste des expéditions ouvertes (TD8), test de charge (TD11) | Tenue, après correction : la mesure a montré que chaque consultation ouvrait une transaction verrouillée ; le chemin rapide a augmenté le débit des lectures concernées de 28 à 46 % (`perf/avant.json`, `perf/apres.json`) |
| 0007 | Saga orchestrée et boîte d'envoi | Acceptations simultanées et remise en double (TD9), panne partielle du service Village (TD11) | Tenue : la saga a survécu à une panne du service et franchi la frontière entre deux processus sans perte ni duplication de ressources |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | Revue de conformité (TD10) | Tenue : après suppression d'un compte, ni son nom ni celui de son village n'apparaissent dans aucune table. Limite : pseudonymisation et non anonymisation |
| 0009 | Extraction du Village, préparée mais non déployée | Démonstration à deux processus (TD11) | Tenue en local ; trois dettes à rembourser avant tout déploiement (DT-010 à DT-012) |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | 232 tests réussis ; domaines couverts à 99,6 % ou plus | Satisfaisante : chaque règle du jeu est vérifiée par un test |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | De 761 req/s (Marché) à 1 568 req/s (Village) ; p99 de 22 à 47 ms ; budget de 500 ms respecté, sans erreur (`perf/apres.json`) | Satisfaisante en local ; non mesurée en production |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | Tests d'écritures simultanées, de reprise après panne et de remise en double réussis ; aucun message abandonné ; outil `scripts/dead-letters.ts` | Satisfaisante : les chemins d'échec sont testés, et les messages abandonnés sont signalés |
| Sécurité | Exigences des revues de sécurité | 40 exigences : 38 conformes, 2 en risque accepté, aucune non conforme | Satisfaisante ; les deux risques acceptés sont justifiés dans les revues |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | Aucune violation des 8 règles de dépendance ; 2 fonctions d'aptitude vérifiées par des tests ; couverture de 75 % des lignes | Bonne pour le serveur ; l'interface (`ui.tsx`, `src/ui/`) n'est couverte par aucun test automatique, et n'est vérifiée qu'à la main |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Village extrait sans modification de son domaine ; PGlite en local, Neon en production, selon la seule variable `DATABASE_URL` | Démontrée |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 12 |
| Entrées remboursées, dont à l'échéance prévue | 7, toutes à l'échéance prévue |
| Entrées ouvertes | 5 |

Analyse : les sept premières entrées, consignées au moment où le raccourci était pris, ont
toutes été remboursées au TD fixé lors de leur ouverture : la dette a été pilotée, et non
subie. Les cinq entrées ouvertes ont deux origines. Deux ont été révélées par la revue de
conformité (DT-008, sessions expirées jamais supprimées ; DT-009, erreurs écrites en entier dans
les journaux) : elles touchent des données personnelles, et leur échéance est l'ouverture du jeu
au public. Trois concernent le service Village extrait (DT-010 à DT-012), qui n'est pas en
production : elles ne pèsent sur le système qu'en cas de déploiement du service.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 | 15 | 1 risque accepté (S9) | Aucune |
| Sécurité du Donjon | 14 | 13 | 1 risque accepté (D10) | Aucune |
| Sécurité du Marché | 10 | 10 | Aucune | Aucune ; la limite relevée est remboursée (DT-007) |
| Conformité au RGPD | 10 | 7 | 2 non conformes (R8, R9), 1 risque accepté (R10) | DT-008, DT-009 |

Chaque action ouverte figure dans le registre de la dette technique.

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | Charge des flux temps réel, qui croît avec le nombre de joueurs connectés (ADR 0003) | Hausse de la charge de la base Neon proportionnelle au nombre de joueurs connectés, avant toute hausse de l'activité de jeu | Mesurer la charge par joueur connecté avant toute ouverture au public ; réexaminer l'ADR 0003 au profit d'un mécanisme de notification partagé entre instances |
| 2 | Croissance du journal, qui allonge la reconstruction des projections et l'effacement d'un compte (ADR 0006 et 0008) | Durée d'une reconstruction ou d'un effacement approchant la durée maximale d'une fonction Vercel | Suivre la durée de la reconstruction du classement à chaque changement de version ; prévoir des instantanés ou une reconstruction hors requête |
| 3 | Interface sans test automatique | Régression visible seulement à la main, par exemple un temps réel cassé sans test en échec | Ajouter des tests de bout en bout sur les parcours principaux : connexion, Village, échange au Marché, Taverne |

## 7. Conclusion

Le projet peut être repris et évoluer sans régression côté serveur : ses règles métier sont
couvertes par des tests, ses frontières sont vérifiées à chaque construction et ont résisté à
l'extraction d'un module, ses décisions et sa dette sont consignées et à jour. Deux conditions
s'imposent avant toute ouverture au public : rembourser les dettes DT-008 et DT-009, qui
touchent des données personnelles, et doter l'interface de tests automatiques. Le déploiement
du service Village, enfin, ne devrait être envisagé que dans les conditions de réexamen de
l'ADR 0009, après remboursement des dettes DT-010 à DT-012.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a proposé la rédaction de ce bilan à partir des
documents du dépôt (ADR, revues, registre de la dette, mesures de `perf/`) et des mesures
relevées sur l'état final du projet (taille du code, nombre de tests, couverture). Cette
rédaction a été relue et validée avant d'être enregistrée ; chaque valeur a été vérifiée dans le
dépôt ou par la commande correspondante.

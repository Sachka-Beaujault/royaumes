# Bilan technique de Royaumes

- Date : 2026-10-23
- Version examinée : étiquette `eval-fin`, comparée à l'étiquette `td11-fin`
- Auteur : Sachka Beaujault

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | 7 : `realm`, `dungeon`, `market`, `ranking`, `tavern`, `guild`, `system` ; un service extrait, `village` |
| Briques de la plateforme | 9 : `auth`, `cron`, `db`, `event-store`, `http`, `outbox`, `privacy`, `projection`, `realtime` |
| Lignes de code, hors tests | 11 937 (`src/` et `app/`), contre 8 258 à l'étiquette `td11-fin` |
| Fichiers de test, nombre de tests | 46 fichiers, 332 tests, contre 33 fichiers et 232 tests à l'étiquette `td11-fin` |
| Commits | 103 au rendu, contre 79 à l'étiquette `td11-fin` |
| Hébergement | Vercel (Francfort), base Neon (Francfort) |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | 1 093, dont le module distant ; service extrait : 82 |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 064 |
| `market` | Event Sourcing, projection des offres, saga | 1 271 |
| `ranking` | Projection du journal | 459 |
| `tavern` | Tables ordinaires | 723 ; 678 à l'étiquette `td11-fin`, avant le port de la guilde des auteurs |
| `guild` | Event Sourcing pour l'appartenance et la Faille, tables ordinaires pour les chats, projections des expéditions ouvertes et du classement, saga | 3 665 |
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
| 0009 | Extraction du Village, préparée mais non déployée | Démonstration à deux processus (TD11) ; saga de la Guilde (évaluation) | Tenue en local ; la saga de la Guilde fonctionne avec le Village extrait sans aucune modification du relais. Trois dettes à rembourser avant tout déploiement (DT-010 à DT-012) |
| 0010 | Module Guilde : journal pour l'appartenance et la Faille, tables pour les chats | Saga, Faille, effacement d'un compte (évaluation) | Tenue : les événements de l'appartenance, sans nom, n'ont rien à réécrire lors d'un effacement ; les chats disparaissent au terme de leur conservation. Prix : deux modèles de stockage dans un module, et une relecture du flux du joueur à chaque page (DT-019) |
| 0011 | Saga orchestrée par la Guilde pour payer un changement de guilde au Village | Remise en double, compensation, Village extrait (évaluation) | Tenue : l'or n'est ni créé ni perdu, y compris lors d'un remboursement ; le Village sert un nouveau demandeur sans modification |
| 0012 | La Faille : graine secrète du jour, échéances paresseuses, participation dans le flux du joueur | Deux guildes le même jour, participations simultanées (évaluation) | Tenue : une seule graine par jour, jamais transmise ; une seule participation par jour. Limites : contenu partageable entre guildes, grands groupes favorisés, inscription non atomique (DT-016) |
| 0013 | Classement des guildes par une projection propre au module, clôture quotidienne des expéditions abandonnées | Reconstruction de la projection, expéditions abandonnées (évaluation) | Tenue : la reconstruction donne le même classement ; la clôture corrige la limite de l'ADR 0012. Prix : une expédition abandonnée n'est comptée que le lendemain, et la clôture n'est pas découpée (DT-017) |
| 0014 | Guilde des auteurs de la Taverne par un port injecté | Ajout au contrat de la Taverne (évaluation) | Tenue : aucun test existant de la Taverne n'a été modifié, et la Taverne ne dépend pas de la Guilde. Prix : lecture synchrone d'un flux par auteur (DT-020) |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | 332 tests réussis ; domaines couverts à 99,6 % ou plus, dont celui de la Guilde (99,6 %) | Satisfaisante : chaque règle du jeu, et chacune des 18 règles de la fiche de cadrage de la Guilde, est vérifiée par un test |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | De 761 req/s (Marché) à 1 568 req/s (Village) ; p99 de 22 à 47 ms ; budget de 500 ms respecté, sans erreur (`perf/apres.json`) | Satisfaisante en local ; non mesurée en production |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | Tests d'écritures simultanées, de reprise après panne et de remise en double réussis ; aucun message abandonné ; outil `scripts/dead-letters.ts` | Satisfaisante : les chemins d'échec sont testés, et les messages abandonnés sont signalés |
| Sécurité | Exigences des revues de sécurité | 55 exigences : 51 conformes, 4 en risque accepté, aucune non conforme | Satisfaisante ; les quatre risques acceptés sont justifiés dans les revues, et consignés comme dette lorsqu'ils doivent être levés |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | Aucune violation des 8 règles de dépendance ; 2 fonctions d'aptitude vérifiées par des tests ; couverture de 74,0 % des lignes, et de 94,1 % hors interface | Bonne pour le serveur ; l'interface (`ui.tsx`, `src/ui/`) n'est couverte par aucun test automatique, et n'est vérifiée qu'à la main |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Village extrait sans modification de son domaine ; PGlite en local, Neon en production, selon la seule variable `DATABASE_URL` | Démontrée |

### Comparaison avec l'étiquette `td11-fin`

| Indicateur | À l'étiquette `td11-fin` | Au rendu | Évolution |
| --- | --- | --- | --- |
| Nombre de tests | 232 | 332 | +100, dont 95 pour la Guilde et 5 pour la guilde des auteurs de la Taverne ; aucun test existant supprimé ni affaibli |
| Couverture des lignes | 75 % | 74,0 % | -1 point : les 183 lignes exécutables de l'interface de la Guilde ne sont couvertes par aucun test, tandis que le code de la Guilde hors interface est couvert à 96,7 % |
| Violations des règles d'architecture | 0 | 0 | Inchangé : 8 règles de dépendance, sans modification de leur configuration |
| Fonctions d'aptitude | 2 | 2 | Inchangé ; la fonction des données personnelles a imposé le contributeur de la Guilde dès son premier commit |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 20, dont 8 pour la Guilde (DT-013 à DT-020) |
| Entrées remboursées, dont à l'échéance prévue | 7, toutes à l'échéance prévue |
| Entrées ouvertes | 13 |

Analyse : les sept premières entrées, consignées au moment où le raccourci était pris, ont
toutes été remboursées au TD fixé lors de leur ouverture : la dette a été pilotée, et non
subie. Les cinq entrées ouvertes ont deux origines. Deux ont été révélées par la revue de
conformité (DT-008, sessions expirées jamais supprimées ; DT-009, erreurs écrites en entier dans
les journaux) : elles touchent des données personnelles, et leur échéance est l'ouverture du jeu
au public. Trois concernent le service Village extrait (DT-010 à DT-012), qui n'est pas en
production : elles ne pèsent sur le système qu'en cas de déploiement du service.

Les huit entrées de la Guilde ont été consignées au moment où le raccourci était pris. Deux sont
des duplications de code, rendues nécessaires par l'encapsulation des modules (DT-013, règles
des messages de la Taverne ; DT-015, générateur à graine du Donjon). Trois sont des limites de
sécurité ou de cohérence, à rembourser avant toute ouverture au public (DT-014, chat d'une
ancienne guilde ; DT-016, inscription non atomique à la Faille ; DT-018, choix de la guilde
imposé par la seule interface), de même que DT-017, la clôture non découpée des expéditions
abandonnées. Les deux dernières sont des coûts de lecture qui croissent avec l'activité (DT-019,
relecture du flux du joueur à chaque page ; DT-020, relecture des flux des auteurs de la
Taverne) : un modèle de lecture de l'appartenance les rembourserait ensemble.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 | 15 | 1 risque accepté (S9) | Aucune |
| Sécurité du Donjon | 14 | 13 | 1 risque accepté (D10) | Aucune |
| Sécurité du Marché | 10 | 10 | Aucune | Aucune ; la limite relevée est remboursée (DT-007) |
| Sécurité de la Guilde | 15 | 13 | 2 risques acceptés (G5, G13) | DT-014, DT-018 |
| Conformité au RGPD | 10 | 7 | 2 non conformes (R8, R9), 1 risque accepté (R10) | DT-008, DT-009 |

Chaque action ouverte figure dans le registre de la dette technique.

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | Charge des flux temps réel, qui croît avec le nombre de joueurs connectés (ADR 0003) | Hausse de la charge de la base Neon proportionnelle au nombre de joueurs connectés, avant toute hausse de l'activité de jeu | Mesurer la charge par joueur connecté avant toute ouverture au public ; réexaminer l'ADR 0003 au profit d'un mécanisme de notification partagé entre instances |
| 2 | Croissance du journal, qui allonge la reconstruction des projections et l'effacement d'un compte (ADR 0006 et 0008) | Durée d'une reconstruction ou d'un effacement approchant la durée maximale d'une fonction Vercel | Suivre la durée de la reconstruction du classement à chaque changement de version ; prévoir des instantanés ou une reconstruction hors requête |
| 3 | Interface sans test automatique, dont celle de la Guilde, la plus étendue du projet | Régression visible seulement à la main, par exemple un temps réel cassé sans test en échec | Ajouter des tests de bout en bout sur les parcours principaux : connexion, choix de la guilde, Village, échange au Marché, Taverne, expédition de la Faille |
| 4 | Relecture des flux d'appartenance à chaque page et à chaque ouverture de la Taverne (DT-019, DT-020) | Durée des pages du jeu croissant avec l'ancienneté des joueurs | Tenir l'appartenance dans un modèle de lecture, par une projection, avant de mesurer les pages du jeu par un test de charge |
| 5 | Équité de la Faille : contenu partageable entre guildes, avantage aux grands groupes (ADR 0012) | Classement des guildes dominé par les guildes qui jouent en dernier, ou par les plus peuplées | Réexaminer l'ADR 0012 : tirer les dégâts d'une graine propre à chaque expédition, ou adapter les monstres au nombre de héros |

## 7. Conclusion

Le projet peut être repris et évoluer sans régression côté serveur : ses règles métier sont
couvertes par des tests, ses frontières sont vérifiées à chaque construction et ont résisté à
l'extraction d'un module, ses décisions et sa dette sont consignées et à jour. Deux conditions
s'imposent avant toute ouverture au public : rembourser les dettes DT-008 et DT-009, qui
touchent des données personnelles, et doter l'interface de tests automatiques. Le module Guilde
ajoute à ces conditions le remboursement des dettes DT-014, DT-016, DT-017 et DT-018. Il a été
intégré sans enfreindre aucune règle d'architecture, et sans modifier d'autres modules existants
que la Taverne, par son propre port, et le cadre de l'interface. Le déploiement
du service Village, enfin, ne devrait être envisagé que dans les conditions de réexamen de
l'ADR 0009, après remboursement des dettes DT-010 à DT-012.

## Usage de l'IA générative

Claude Code (Anthropic, modèle Claude Opus 5.5) a proposé la rédaction de ce bilan à partir des
documents du dépôt (ADR, revues, registre de la dette, mesures de `perf/`) et des mesures
relevées sur l'état final du projet (taille du code, nombre de tests, couverture), puis l'a mis
à jour au rendu de l'évaluation, à partir des mêmes sources et de nouvelles mesures. Cette
rédaction a été relue et validée par l'auteur avant d'être enregistrée ; chaque valeur a été
vérifiée dans le dépôt ou par la commande correspondante.

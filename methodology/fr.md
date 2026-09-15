# Comment l’Observatoire mesure

L’Observatoire Quavsit relève chaque jour ce que valent les données de transport public de 147 réseaux français quand un moteur les lit. Le moteur est celui de Quavsit ; les règles de comptage sont dans `observatory/metrics.py`, dans ce dépôt, et la tâche qui les applique dans `observatory/collector.py` et `observatory/publish.py`.

**Période de rodage.** La publication a commencé le 15 septembre 2026. Tant que dure le rodage, les règles de comptage peuvent encore changer ; quand elles changent, les jours concernés sont publiés à nouveau et la modification est consignée dans `CORRECTIONS.md`.

## Ce qui est échantillonné

- Chaque flux GTFS-Realtime déclaré par un descripteur de réseau Quavsit : mises à jour de courses, positions de véhicules et alertes.
- Huit relevés par jour, à 02 h 40, 05 h 40, 08 h 40, 11 h 40, 14 h 40, 17 h 40, 20 h 40 et 23 h 40 UTC. Chaque relevé lit chaque flux une fois. Un flux déclaré par plusieurs réseaux est lu une fois et compté pour chacun.
- Un jour est une date UTC. Les taux ne comptent que les relevés faits entre 6 h et 22 h dans le fuseau horaire du réseau ; un flux vide la nuit n’est pas une panne. Les relevés de nuit sont comptés à part, dans `samples_night`.
- Les produits soumis à contrat ou à clé personnelle (PRIM d’Île-de-France Mobilités, navitia de la SNCF, XtraData de TBM, l’API Tisséo, les données ouvertes à quota de STAR) ne sont jamais échantillonnés. Pour ces réseaux, la page indique quand le moteur lui-même a atteint chaque source pour la dernière fois, en précisant qu’il s’agit du trafic propre du moteur.
- Chaque lecture est imputée au budget quotidien que Quavsit tient pour cette source, et à un plafond distinct de 2 000 lectures d’Observatoire par jour : l’Observatoire ne prend jamais de capacité aux utilisateurs de Quavsit.

## Ce qui est compté

Chaque taux est un couple de nombres, `n` sur `of`. Un taux dont `of` vaut 0 signifie qu’il n’y avait rien à mesurer et s’affiche « — ». Le taux d’un jour est la somme de ses relevés de journée, pas une moyenne de pourcentages.

**Mises à jour de courses**

- `trip_join` : courses dont le `trip_id` existe dans la grille horaire du réseau, sur les courses qui portent un `trip_id`. Une course est un couple `(trip_id, start_date)` ; ses répétitions dans un même message comptent une fois.
- `no_trip_id` : entités de mise à jour sans `trip_id`.
- `stop_updates_timed` : mises à jour d’arrêt qui portent une heure ou un retard (ou dont la course porte un retard), sur toutes les mises à jour d’arrêt.
- `cancelled` : courses marquées `CANCELED` ou `DELETED`, sur toutes les courses et les entités sans `trip_id`.

**Positions de véhicules**

- `with_position` : véhicules avec une latitude et une longitude, sur tous les véhicules.
- `with_trip_id` et `with_route_id` : véhicules positionnés qui nomment une course, ou une ligne, sur les véhicules positionnés.
- `trip_join` : véhicules dont le `trip_id` existe dans la grille horaire, sur les véhicules qui ont un `trip_id`.

**Alertes**

- `informed_resolved` : entités informées dont la ligne ou l’arrêt existe dans la grille horaire, sur les entités qui nomment une ligne ou un arrêt.

**Pour chaque flux**

- `samples`, `ok` (HTTP 200 et un FeedMessage valide), et les échecs : `timeout`, `connection`, `http_4xx`, `http_5xx`, `decode_error`, `budget`. Un HTTP 429 est retenté une fois après 40 secondes ; un second 429 est compté comme `rate_limited`, à part des échecs.
- `header_age_seconds` : la médiane de l’heure de lecture moins l’horodatage d’en-tête du flux. `no_header_timestamp` compte les réponses qui n’en ont pas.
- `entities` : le nombre médian d’entités par message.

**Grille horaire**

- `timetable_ends_on` : le dernier jour couvert par la grille publiée, d’après son calendrier et ses dates de service ajoutées. `days_left` compte à partir du jour du relevé.
- `state` : `ok`, `error` (la dernière actualisation a échoué et des données plus anciennes sont servies) ou `never_ingested`.
- `age_hours` : depuis combien de temps Quavsit a chargé la grille.
- Les nombres de lignes, d’arrêts, de courses et de passages chargés.

## Lire un chiffre bas

Un taux de correspondance bas peut venir du flux, de la grille horaire utilisée ou de l’appariement de Quavsit. L’Observatoire mesure un moteur dans une version donnée : chaque jour nomme le code exécuté (`engine.code_sha256`, une empreinte du paquet transport du moteur). Ce n’est ni une certification, ni une note, ni un classement, et ces pages n’en contiennent aucun.

Certains flux ne couvrent qu’une partie d’un réseau (par exemple le temps réel d’Astuce couvre le sous-réseau TCAR), ou sont partagés par plusieurs réseaux (le flux d’alertes de Marseille est métropolitain). Ils sont mesurés tels qu’ils sont publiés.

## Ce qui n’est jamais publié

Les URL des flux (certaines portent des clés d’opérateur), les textes d’erreur, les identifiants de courses, d’arrêts ou de véhicules, les positions, les textes d’alerte, les chiffres de quota. Un flux est désigné par son hôte, et une grille horaire par son jeu de données sur transport.data.gouv.fr.

## Fichiers et licences

- `data/days/AAAA-MM-JJ.json` : un fichier par jour ; `data/latest.json` : le jour le plus récent.
- `data/networks/<réseau>.json` : les 90 derniers jours d’un réseau.
- `data/history.csv` : une ligne par jour, réseau, type de flux et mesure.

Les mesures sont publiées sous licence Creative Commons Attribution 4.0 (CC BY 4.0) : citer « Observatoire Quavsit ». Les flux qu’elles décrivent sont publiés par leurs opérateurs sous leurs propres licences (ODbL, Licence Ouverte 2.0 et d’autres), citées sur chaque page de réseau. Le code est sous Licence open source Quavern, version 1.0.

## Corrections

Si un chiffre est faux, ouvrez une correction sur GitHub ou écrivez à hello@quavern.com en indiquant le réseau, le jour et la mesure. Une correction acceptée publie à nouveau les jours concernés et figure dans `CORRECTIONS.md`.

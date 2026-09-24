# Correctif « cartes jamais testées d'abord » — sources gratuites uniquement

Cible : dépôt `engoB/PokeTest`, branche `main`, sur la version v4.5 présente le 24 septembre 2026 (commit `77a49b64e393fc2ce4822854c0f2fddeb4436540`).

## Installation

Remplacer dans le dépôt les cinq fichiers suivants par ceux de cette archive, **en conservant leurs chemins** :

- `scripts/harvest-core.mjs`
- `scripts/harvest-images.mjs`
- `.github/workflows/harvest-images.yml`
- `tests/harvest.test.mjs`
- `tests/fixtures/mock-network.mjs`

Le fichier `NOTE-MOISSON-GRATUITE.md` est une notice facultative.

Après le commit sur `main`, les quatre exécutions automatiques quotidiennes appliqueront le correctif. On peut aussi lancer manuellement `resolve` dans GitHub Actions. Le workflow conserve le lot de 400 cartes et le plafond de 55 appels à l'ancienne API Pokémon TCG par exécution.

## Changements

1. Les cartes françaises **jamais testées** passent avant les tentatives différées. Une fois celles-ci examinées, les nouvelles tentatives éligibles passent de la plus ancienne à la plus récente.
2. `--free-only` est activé par défaut dans le workflow, en mode `resolve` et `pack` : aucun appel à Scrydex et aucune clé Scrydex requise, même si un secret est configuré.
3. Les anciennes cartes bloquées uniquement par l'absence de clé Scrydex sont reclassées `unavailable-in-checked-sources`, avec le motif `free-sources-exhausted`. Cela signifie « pas d'image trouvée dans les sources gratuites effectivement consultées », **pas** « image inexistante sur Internet ». Elles restent réexaminables avec `--refresh-missing`.
4. Les quotas et erreurs réseau restent `retry` avec temporisation ; aucun fournisseur payant n'est requis.
5. Le rapport JSON expose `freeOnly`, `priority`, `plannedPending`, `plannedRetries`, `freeOnlyMigrated` et `freeSourcesExhausted` pour suivre les deux ou trois prochains jours.

## Dernier checkpoint réel vérifié (24 septembre 2026, 16 h 21, heure de Paris)

- 22 170 cartes françaises ciblées ; 20 695 URL indexées ; 1 475 cartes sans URL.
- 1 069 jamais testées, 280 à réessayer, 126 bloquées par l'absence de clé Scrydex.
- Simulation **sans réseau** du correctif sur ce checkpoint : 400 cartes jamais testées planifiées pour le prochain passage, 0 ancienne tentative dans ce premier lot ; les 126 blocages deviennent un inventaire explicite des sources gratuites épuisées.
- En supposant 400 cartes jamais testées traitées par passage, il faudra au moins 3 passages pour terminer leur premier examen. Les limites d'API peuvent nécessiter davantage de passages pour les recherches secondaires et les réessais.

Le correctif ne télécharge pas encore le pack local des illustrations et ne change pas les données de collection/prix de la PWA.

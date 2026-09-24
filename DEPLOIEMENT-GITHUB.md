# Installer les correctifs v4.5 sur engoB/PokeTest

Le connecteur GitHub utilisé pour préparer ce correctif a refusé la création
d'une branche (`403 Resource not accessible by integration`). Aucun push n'a
été effectué par l'assistant. Ces fichiers sont prêts à être déposés par le
propriétaire du dépôt.

## Depuis l'interface GitHub

1. Décompresser le ZIP v4.5. Déposer **le contenu** de `PokeTest-Premium/` à la
   racine de `engoB/PokeTest` sur `main` (ou sur une branche puis PR). Conserver
   tous les sous-dossiers, notamment `.github/workflows/harvest-images.yml`,
   `scripts/`, `tests/` et `inputs/`. **Ne pas déposer seulement le ZIP**.
2. Vérifier dans GitHub que `scripts/harvest-images.mjs` contient
   `frenchTargetCatalogue` et que le workflow `harvest-images.yml` contient
   `--inventory-only --fr-only` dans son job `assemble`.
3. Attendre la fin d'une éventuelle exécution Actions en cours. Ouvrir
   `https://github.com/engoB/PokeTest/actions/workflows/harvest-images.yml`,
   cliquer `Run workflow`, choisir `resolve`, `max_cards=400`.
4. Télécharger l'artefact `pokevault-image-audit` du nouveau run et lire
   `report.json`. Vérifier `scope: fr-exact-ids`, `totalCatalog` égal au nombre
   actuel de cartes FR et `originalIndex` >= 20 582. Les cartes EN-only ne
   doivent plus augmenter le dénominateur.

Le checkpoint existant sur `pokevault-image-data` / les artefacts GitHub sera
repris automatiquement. Les 235 anciens blocages ambigus seront reprogrammés
une fois, mais seuls 210 concernent les cartes FR. Les passages suivants
continuent quatre fois par jour. La collection locale `pv_collection` n'est
ni modifiée ni effacée.

Pour un PC avec Git déjà configuré, le fichier `.patch` fourni séparément peut
être appliqué sur la version du dépôt vérifiée lors de la livraison avec
`git apply --check PokeVault-v4.5-CORRECTIFS-FR.patch`, puis `git apply ...`,
`npm run check`, `git add -A`, `git commit` et `git push`. Le ZIP **et le patch**
contiennent aussi l'index FR enrichi avec les 23 nouvelles URL du premier run.

Ne lancer `pack` qu'après vérification des droits de téléchargement et de
redistribution des illustrations.

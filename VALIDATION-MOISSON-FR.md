# Vérification du correctif v4.5 (snapshot utilisateur du 24/09/2026)

Test local **sans réseau** effectué avec les deux artefacts de la première
moisson (`pokevault-image-state.zip` et `pokevault-image-audit.zip`) et l'index
initial du dépôt. Il valide le périmètre et la reprise ; il ne constitue pas
une nouvelle récupération réelle de visuels.

| Mesure | Résultat |
| --- | ---: |
| Cartes FR dans le snapshot TCGdex | 22 170 |
| Cartes EN dans le snapshot (source uniquement) | 23 736 |
| Cartes EN-only ignorées comme cibles | 1 659 |
| URL de l'index initial (toutes FR) | 20 559 |
| URL FR après la première moisson | 20 582 |
| URL FR incluses durablement dans l'index du ZIP v4.5 | 20 582 |
| Cartes FR encore sans URL | 1 588 |
| Anciennes lignes ambiguës réévaluées dans le checkpoint | 235 |
| Parmi ces 235, cibles FR | 210 |
| Parmi ces 235, cartes EN-only ignorées | 25 |
| IDs spéciaux conservés | `exu-!`, `exu-%3F` |

Le test complet `npm run check` valide 51 tests automatisés, dont les IDs
spéciaux à travers le téléchargement local simulé, la collecte de shards et
l'assemblage. Les cartes FR sans URL sont toujours à rechercher : **92,84 % de
couverture URL n'est pas une garantie de 92,84 % de fichiers locaux**.

Après publication sur `main`, le prochain `resolve` reprendra le checkpoint
précédent, reprogrammera les anciens blocages de quota, et écrira un nouveau
rapport `scope: fr-exact-ids`. Les 11 langues restent des sources de visuels
pour ces mêmes cartes FR. Le mode `pack` reste soumis aux droits des scans.

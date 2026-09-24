# PokéVault v4.6 — recherche exhaustive, gratuite et personnelle

Cette version conserve **exactement le catalogue français** (22 170 références dans le checkpoint du 24/09/2026). Les onze langues TCGdex servent uniquement de sources d'images pour **le même ID**. Le programme ne substitue pas une autre édition parce qu'elle porte le même nom.

## Dans l'application

- Les champs **carte** et **extension** ont une croix × accessible au clavier, visible lorsqu'un texte est saisi.
- La fiche de carte affiche **Voir cette carte sur Cardmarket** uniquement si un URL de produit exact est fourni et validé. Sinon, elle indique **Rechercher cette carte sur Cardmarket**, avec le nom, l'extension et le numéro préremplis : **la recherche n'est pas une offre vérifiée**. Les prix sont indicatifs et peuvent différer selon langue, variante, état et vendeur.
- Pour ajouter des URL exactes validées manuellement, modifier `inputs/cardmarket-links.json` : `{"format":"pokevault-cardmarket-links-v1","links":{"base1-4":"https://www.cardmarket.com/fr/Pokemon/Products/Singles/..."}}`. Ne pas inventer d'URL.
- La fiche de carte dispose de **Chercher sur 6 autres catalogues** : PkmnCards, Pokécardex, Bulbapedia, TCG Collector, Pokélector et Limitless TCG. Ces boutons ouvrent des recherches ciblées, sans extraction automatique.

## Automatisation gratuite dans GitHub Actions

Le workflow `harvest-images.yml` exécute quatre passages par jour, avec priorité aux cartes FR jamais examinées, puis aux erreurs réessayables. Il utilise TCGdex (11 langues) et la **Pokémon TCG API sans clé**, dans la limite de 100 appels secondaires par passage (400/jour si quatre passages ; surveiller les exécutions manuelles et l'usage de l'application). **Aucune API payante, aucune clé Scrydex, aucun aspirateur de sites tiers.** Les délais et quotas sont respectés.

Après chaque `resolve`, le ZIP d'artifact **pokevault-image-audit** contient aussi `research/recherche.html`, `research/missing.csv`, `research/report.json` et `research/manual-images.template.json`. Le rapport HTML affiche **toutes** les références françaises encore sans URL d'image et propose six recherches ciblées par carte. L'API Pokémon TCG est déjà consultée automatiquement par la moisson.

## Recherche manuelle des cas résistants

Ouvrir `research/recherche.html` dans le navigateur (le rapport fonctionne hors connexion, les liens externes nécessitent Internet). Filtrer par nom/ID, ouvrir un site, puis comparer la **même extension, le même numéro et la même illustration**. Les scans d'une autre édition ou langue ne sont retenus que si la correspondance est certaine. Si vous obtenez légalement un fichier pour votre usage personnel, renommez-le `<ID>.png`, `<ID>.jpg` ou `<ID>.webp` et placez-le dans le dossier **local** `personal-images/`. Ne placez pas ces images dans le dépôt GitHub public.

Le rapport HTML dispose du bouton **Associer** : choisir la source, indiquer le nom du fichier et l'URL de la page d'origine, cocher la confirmation après comparaison, puis **Exporter mon manifeste JSON**. Enregistrer le résultat à la racine du projet sous `manual-images.json`. On peut également compléter `manual-images.template.json` fourni dans le rapport. Pour une image personnelle sans site, choisir la source `personal`.

**Important :** l'usage privé n'autorise pas automatiquement la collecte massive. Pokélector interdit explicitement les moyens automatisés sans permission ; d'autres catalogues réservent leur API ou protègent leurs scans. Ce système fournit des recherches ciblées et l'importation locale de fichiers obtenus dans le respect des conditions de chaque source. Il ne contourne ni paywall, ni captcha, ni robots.txt. Il n'existe aucune garantie honnête d'obtenir 100 % des visuels : les absences restent documentées.

## Intégrer les fichiers privés dans le pack hors ligne

Après avoir téléchargé/assemblé le pack GitHub dans `dist/`, et extrait le dernier artifact d'état dans `harvest-cache/` :

```bash
node scripts/import-personal-images.mjs \
  --catalog harvest-cache/catalog-fr.json \
  --manifest manual-images.json \
  --images-dir personal-images \
  --dist dist
```

L'importateur vérifie que chaque ID existe dans le catalogue FR, que le fichier est au bon nom, que l'image n'est pas tronquée, que sa taille reste sous 8 Mo, et que la source/référence correspond. Il calcule le SHA-256 de chaque fichier, copie les scans dans `dist/assets/offline/cards/`, fusionne le manifeste existant **sans écraser** les fichiers déjà présents (sauf `--replace`) et produit `dist/assets/offline/personal-import-report.json`. Les erreurs sont listées ; aucune fausse image n'est comptée comme trouvée. Les fichiers locaux restent ignorés par Git.

Tant que des visuels manquent, le pack est `partial` : l'application garde les recherches en ligne possibles. Il devient `sealed` seulement lorsque chaque ID français possède un fichier déclaré dans le manifeste. **Attention :** le pack GitHub `pack` télécharge des images et ne doit être lancé que si vous avez vérifié les droits et conditions applicables. L'importateur local n'envoie aucune image sur Internet.

## Générer le rapport localement

```bash
node scripts/image-research.mjs \
  --fr-cards harvest-cache/catalog-fr.json \
  --en-cards harvest-cache/catalog-en.json \
  --state harvest-cache/state.json \
  --index harvest-output/pokevault-index-enrichi.json \
  --output image-research
```

`npm run check` lance les tests. `npm run research:images` et `npm run import:personal` acceptent les mêmes arguments supplémentaires via `--`. Le script de recherche ne récupère aucune image sur les six catalogues externes ; il crée un inventaire exhaustif des IDs non résolus et des chemins de recherche pour chacun.

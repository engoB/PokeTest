# PokéVault · PWA

Classeur Pokémon rapide et épuré pour mobile, iPad et ordinateur. HTML/CSS/JavaScript natifs, sans compilation, dépendance à un CDN ni compte utilisateur.

## Démarrer

```bash
python3 -m http.server 4173
# http://localhost:4173
node --test
```

Pour installer la PWA en production, utilisez **HTTPS**. Le manifeste inclut les icônes 192/512, l'application fonctionne en mode `standalone`, et le service worker conserve l'interface, les listes déjà consultées, les fiches ouvertes et jusqu'à 170 images visitées. Un premier chargement en ligne est nécessaire. L'API TCGdex reste indispensable pour les cartes non encore consultées. Sur `file://`, ni modules JS ni service worker ne fonctionneront : servez le dossier via HTTP.

## Déploiement

Le dépôt est une application statique. Hébergez la racine sur un domaine HTTPS, par exemple via GitHub Pages (Settings → Pages → source : branche `main`, dossier `/ (root)` après avoir ajouté les fichiers). Les chemins du manifeste et du service worker sont relatifs : l'installation fonctionne aussi sous un sous-chemin comme `/PokeTest/`. Testez l'application sur l'URL publiée, dans un navigateur récent, avec puis sans réseau. Aucun navigateur ne peut afficher un scan manquant chez le fournisseur.

## Images, prix et collection

- Les URL de TCGdex ne comprennent pas d'extension. L'application essaye WebP, puis PNG. Lorsqu'une image française manque, elle recherche **l'image officiellement liée à la même carte** via la fiche anglaise. Si les deux langues n'ont aucune image, un visuel neutre évite une image cassée et évite d'afficher la mauvaise carte.
- Les images non renseignées par TCGdex ne peuvent pas toutes être restaurées automatiquement. Signaler/ajouter les scans manquants à TCGdex reste nécessaire.
- Les prix Cardmarket de TCGdex sont des **estimations** pouvant manquer, notamment sur certaines variantes ; la valeur suivie n'inclut que les cartes avec un prix. Les prix sont récupérés avec une concurrence limitée et un cache de 24 h. Tri et filtres basés sur la cote ou la rareté ne couvrent que les fiches enrichies/consultées, contrairement au filtre par nom.
- La collection reste stockée sous la clé compatible `pv_collection` en `localStorage`. Export/import JSON de version 1 pour les sauvegardes et les transferts d'appareil. Aucune synchronisation n'est prétendue.

## Architecture et futurs App Store

Le code sépare les helpers testables (`core.mjs`), l'interface (`app.js`), le shell (`index.html`/`style.css`) et le cache hors connexion (`sw.js`). Il ne contient ni SDK iOS ni soumission App Store. Pour une éventuelle distribution iOS, développer des fonctions propres et utiles à l'application au-delà d'un simple emballage WebView, vérifier les droits sur les illustrations et les marques, traiter confidentialité et restauration des données, puis consulter la version en vigueur de la règle App Store 4.2. Ce dossier constitue la base PWA, **pas** une garantie de validation App Store.

Données et illustrations : [TCGdex](https://tcgdex.dev/). Projet indépendant, non affilié à The Pokémon Company.

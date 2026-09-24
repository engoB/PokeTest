# PokéVault v4.5 — moisson FR corrigée, images cherchées dans 11 langues

**Correctif de périmètre :** la cible est exclusivement l'inventaire TCGdex FR. Le
snapshot utilisateur du 24 septembre 2026 contient **22 170 identifiants FR**,
dont `exu-!` et `exu-%3F` (Zarbi). Le catalogue EN (23 736 lignes) et les neuf
autres langues ne servent **que de sources de visuels pour les mêmes IDs FR**.
Si TCGdex publie de nouvelles cartes FR, ce total évoluera naturellement ;
aucune carte uniquement anglaise ne sera ajoutée à la cible.

Le dernier checkpoint fourni par l'utilisateur contient **20 582 URL pour des
cartes FR**, dont 23 récupérées lors de la première moisson. Il conserve aussi
128 URL de cartes uniquement anglaises, qui sont maintenant ignorées dans les
rapports et les packs FR, sans effacer les anciennes données du checkpoint.
Les **235 états v4.4 ambigus** (« clé secondaire absente ou quota épuisé ») sont
reprogrammés une fois : un quota épuisé devient `retry` avec temporisation ;
une clé Scrydex absente reste `needs-provider-access` si aucun autre fournisseur
ne peut être interrogé. Cela évite de bloquer définitivement des cartes après
les 55 appels secondaires d'une session.

## Mission pour Work : installer le workflow, ne pas demander à l'utilisateur de recliquer

Le ZIP contient le code complet du dépôt `engoB/PokeTest`, l'index FR enrichi (`inputs/pokevault-index-visuels.json`, **20 582 URL** : les 20 559 originales + 23 découvertes lors de la première moisson), et le workflow `.github/workflows/harvest-images.yml`. Il **ne contient pas** les images : seule l'exécution réseau GitHub Actions peut les récupérer réellement.

1. Publier le **code** du ZIP sur une branche `feat/pokevault-moisson-visuels` du dépôt existant ; conserver `inputs/pokevault-index-visuels.json`. Ne pas effacer `pv_collection`, les données de prix ni IndexedDB. Laisser les fichiers d'images hors du dépôt Git public.
2. Exécuter `npm run check` (dont récupération réseau simulée, reprise, quotas, IDs Zarbi et assemblage). Créer une PR, puis fusionner sur `main`. Les cron GitHub Actions ne s'exécutent que depuis la branche par défaut. Si le connecteur GitHub est en lecture seule, utiliser le navigateur GitHub authentifié ou transférer directement les fichiers ; ne pas prétendre que la PR a été créée si GitHub refuse l'écriture.
3. Dans GitHub : **Actions → PokéVault - moisson d'illustrations → Run workflow → `resolve`**. Cette action se relance ensuite automatiquement **4 fois par jour** (02:21, 08:21, 14:21, 20:21 UTC), par lots de 400 IDs encore sans image, sans interaction avec la PWA. GitHub peut retarder les exécutions programmées ; les dépôts publics inactifs peuvent voir leurs cron désactivés.
4. À chaque exécution, le moissonneur recharge le dernier checkpoint (`pokevault-image-state`) et les inventaires TCGdex mis en cache. Il publie `pokevault-image-audit` avec `report.md`, `report.json`, `missing-images-report.csv`, `missing-images-report.json` et `pokevault-index-enrichi.json`. Les **URL résolues et les échecs** sont aussi sauvegardés sur une branche de métadonnées `pokevault-image-data` (sans images). Si la politique du dépôt bloque cette écriture, les artefacts gardent l'état 90 jours ; configurer les autorisations Actions `contents: write` pour la branche de métadonnées.
5. Consulter **`report.json.statusCounts`** : `pending` = pas encore essayé ; `retry` = réseau/quota, temporisation puis nouvelle tentative ; `needs-provider-access` = une source secondaire exige une clé, **pas** un quota de session épuisé ; `unavailable-in-checked-sources` = aucun scan valide dans les sources réellement testées. `report.json.scope` doit valoir `fr-exact-ids` et `totalCatalog` correspondre au catalogue FR actuel (22 170 dans le snapshot fourni). Le nombre `stillUnindexed` **ne prouve pas** qu'une image est inexistante sur Internet. Les URL initiales ne sont pas encore des fichiers physiquement validés : seul `pack` vérifie leurs octets.

## Recherche élargie, correspondances sûres

- TCGdex : **FR → EN → DE → ES → IT → PT → PT-BR → JA → ZH-TW → ID → TH**, toujours sur le **même identifiant exact** ; essais WebP/PNG/JPG, puis HD WebP, puis fiches détaillées. Pour les sous-extensions dont l'API omet `image`, la moisson essaie aussi le chemin CDN documenté **uniquement après récupération des métadonnées de la bonne extension**. Les locales indisponibles ne sont pas inventées.
- Scrydex : **facultatif**, nécessite `SCRYDEX_API_KEY` et `SCRYDEX_TEAM_ID` dans *Settings → Secrets and variables → Actions*. Le service peut être payant ; vérifier le forfait et les crédits avant d'ajouter les clés. L'ID, le nom anglais et le numéro doivent correspondre strictement. Sans accès, les cas concernés restent `needs-provider-access`, jamais `introuvable`.
- Ancienne Pokémon TCG API : dernier recours temporaire, recherche limitée à 55 appels par exécution, rapprochement strict par numéro, nom anglais de la carte, extension et total imprimé. Clé `POKEMONTCG_API_KEY` facultative. Aucune correspondance approximative n'est acceptée.
- HTTP 429, panne réseau et timeout : temporisation par fournisseur, prise en compte de `Retry-After`, checkpoint tous les 10 IDs, puis reprise automatique à l'exécution suivante. Si le fournisseur impose une pause d'une heure, **ne pas bloquer le job une heure** ni déclarer l'image introuvable.

## Seconde phase : GitHub aspire les vrais fichiers image

**Ne lancer `pack` qu'après avoir vérifié les droits d'utilisation et les conditions des fournisseurs.** Ce contrôle est requis avant de télécharger et redistribuer massivement les scans, notamment dans une application App Store ou un artefact GitHub. Le code seul peut être publié indépendamment de ce choix.

1. GitHub → **Actions → PokéVault - moisson d'illustrations → Run workflow → mode `pack`** ; cocher `rights_confirmed` après vérification. Seize jobs, deux simultanés, téléchargent les images connues et les valident physiquement (signature et marqueur de fin PNG/WebP/JPEG, taille maximale 8 Mo). Chaque job produit `pokevault-image-shard-N` (14 jours de rétention) ; les fichiers sont nommés par ID exact.
2. Le job GitHub `assemble` s'exécute **automatiquement après les 16 shards** : il récupère les 16 artefacts, construit le catalogue **FR uniquement** (`--fr-only`), vérifie chaque fichier et publie `pokevault-image-pack-audit` (`images.json`, `images-assembly-report.json`) et `pokevault-dist-shell`. Le shell n'inclut pas les gros scans pour ne pas doubler le quota de stockage GitHub. Les 16 shards contiennent tous les vrais fichiers. Les deux noms spéciaux Zarbi restent exacts sur disque et sont encodés dans les URL du manifeste.
3. Dans Work, récupérer **les artefacts du même run** : `gh run download RUN_ID --pattern 'pokevault-image-shard-*' --dir artifacts` et `gh run download RUN_ID --name pokevault-dist-shell --dir dist`. Puis, à la racine du projet, lancer `node scripts/collect-image-shards.mjs --artifacts artifacts --dist dist --shards 16` et `node scripts/assemble-image-pack.mjs --dir dist --shards 16`.
4. Vérifier `dist/assets/offline/images-assembly-report.json` : `verifiedFiles`, `unresolvedIds`, `damagedFiles`, `complete`. **Ne jamais annoncer 100 % si `complete` est `false`**. Si une carte manque, l'interface affiche son verso local et le rapport contient son ID. L'app `dist/` est en mode **pack figé** : plus de recherche d'images automatique au démarrage.
5. Tester sur un serveur HTTP local (`python3 -m http.server -d dist 4173`), puis dans un conteneur natif avec tous les fichiers embarqués. Sur une PWA Web, la présence des fichiers sur le serveur **ne garantit pas** qu'un navigateur ait stocké 20 000 scans hors ligne : limites de stockage et service worker. Le pack natif physique, lui, n'a pas cette limite de cache navigateur.

### Limites honnêtes de cette livraison

La première moisson réelle sur GitHub a déjà récupéré 151 URL, dont 23 pour les cartes FR. Les correctifs v4.5 ont été testés localement avec le checkpoint fourni, sans relancer le réseau : **22 170 cibles FR, 20 582 URL FR connues, 1 588 sans URL et 235 anciens états ambigus reprogrammés**. Ce test ne constitue pas une nouvelle récupération en ligne. Les vrais téléchargements, les limites des fournisseurs, les droits de redistribution et le test final sur appareil devront encore être vérifiés avec GitHub Actions. Les cartes absentes de l'inventaire FR ne sont pas ajoutées artificiellement.

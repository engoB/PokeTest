# PokéVault v4 — pack d’images natif optionnel

Cette version conserve le correctif de démarrage v3.1 et ajoute le builder de visuels. Le ZIP livré contient le **code**, pas les illustrations protégées ; voir la section V4 en fin de fichier.

## Base héritée de v3.1


Cette archive contient **app.bundle.js**, un script autonome qui évite les imports JavaScript manquants ou mal servis. Le chargement affiche une erreur explicite plutôt que quatre cartes fantômes bloquées.

**Déploiement :** transférer **tous les fichiers et dossiers** de `PokeTest-Premium/` à la racine du site, en particulier `app.bundle.js`, `index.html` et `sw.js`. Conserver la même URL / origine que la version précédente pour retrouver automatiquement `pv_collection`. Ne pas effacer les données du site.

**Test local :** ouvrir un terminal dans `PokeTest-Premium/`, puis `py -m http.server 4173` (Windows avec Python) et ouvrir `http://localhost:4173`. Ne pas ouvrir `index.html` directement depuis le ZIP.

**Si le catalogue reste vide :** ouvrir F12 → Console / Réseau, vérifier que `app.bundle.js` retourne 200, puis essayer Ctrl+Maj+R. Le catalogue TCGdex a un délai maximal de 35 secondes avant de proposer « Réessayer ».

**Collection :** `pv_collection` n'est ni migrée ni supprimée. Exporter une sauvegarde JSON avant tout changement d'URL ou de domaine.

---

# PokéVault Premium · PWA v3

Classeur Pokémon rapide et épuré pour mobile, iPad et ordinateur. HTML/CSS/JavaScript natifs, **sans CDN JavaScript**, sans compilation et sans compte utilisateur. Le projet est indépendant et non affilié à The Pokémon Company.

## Démarrer et vérifier

```bash
python3 -m http.server 4173
# Ouvrir http://localhost:4173
node --test
npm run check
```

Publiez **les fichiers de ce dossier à la même adresse HTTPS que l'ancienne version** pour conserver le `localStorage` du navigateur. `file://` ne permet pas d'utiliser les modules JavaScript ou le service worker. Le manifeste et les chemins relatifs conviennent à GitHub Pages dans un sous-répertoire. Testez sur un vrai téléphone et une vraie connexion avant publication.

## Mise à jour SANS perdre sa collection

**La clé `pv_collection` est conservée telle quelle.** Aucune réinitialisation ou migration destructive n'est effectuée. Les anciennes sauvegardes `{format:'pokevault-collection', version:1, collection:{...}}` restent compatibles. L'importation **fusionne** les cartes avec la collection présente et conserve, pour chaque identifiant, la quantité la plus élevée (pas de remplacement ni de double comptage). Les prix et les images sont des caches séparés et jetables.

Avant toute mise en production, utilisez le bouton **Exporter** sur l'installation existante et conservez le JSON ailleurs. Les données locales ne se déplacent **pas automatiquement** entre un domaine GitHub Pages, `localhost`, une PWA sur un autre domaine ou une future application iOS. Dans ce cas, utilisez Exporter / Importer. La désinstallation, l'effacement des données du site et certains nettoyages système peuvent effacer le stockage local. Aucune synchronisation cloud n'est annoncée.

## Illustrations manquantes

1. Image **TCGdex FR** (WebP puis PNG, avec résolution HD en fiche).
2. Si l'image manque ou retourne une erreur : **fiche TCGdex FR détaillée**, puis **TCGdex EN avec le même identifiant**.
3. Si ces deux sources échouent : recherche ciblée dans l'ancienne **Pokémon TCG API** (sans clé), en vérifiant strictement le numéro, le **nom anglais de l'extension** et, si disponible, le nom anglais de la carte et le nombre officiel de cartes du set. Une correspondance ambiguë est rejetée, plutôt que d'afficher une mauvaise illustration.
4. Le résultat **effectivement chargé** est mémorisé dans IndexedDB (ou un petit cache `localStorage` de secours). Les images consultées sont mises en cache par le service worker. Un échec confirmé est temporairement mémorisé 24 h ; la fiche propose **Rechercher le visuel** pour réessayer.
5. En dernier recours, le **verso PokéVault local** s'affiche immédiatement. Il est distinct du verso officiel Pokémon afin de ne pas incorporer un visuel de marque non licencié.

**Attention :** Pokémon TCG API (`pokemontcg.io`) est dépréciée et annonce son arrêt au **1er mars 2027**. Ce fallback est transitoire, limité à 60 recherches secondaires par session pour préserver le service gratuit. Avant cette date, remplacer cet adaptateur par un fournisseur pérenne (par exemple Scrydex), idéalement via un petit backend sécurisé pour ne pas exposer de clé API dans la PWA. Un fournisseur secondaire peut être indisponible, limité, incomplet ou refuser les requêtes cross-origin. Aucune illustration n'est inventée.

## Tri et filtres de prix

Le tri et les seuils ≥ 10 € / ≥ 50 € utilisent **exactement le même prix tendance Cardmarket en euros**, lu sur la fiche TCGdex de l'identifiant précis. Les prix inconnus sont **inconnus, jamais 0 €** ; ils ne figurent pas dans les filtres à seuil tant qu'ils ne sont pas chargés. La section **Vérification des cotes** affiche le nombre de fiches contrôlées, le nombre coté, le nombre sans cote et la progression. Les résultats sont explicitement provisoires tant que la couverture n'atteint pas 100 %.

En mode prix ou rareté, l'application analyse automatiquement jusqu'à **300 cartes dans une extension** (75 sur le catalogue global) avec trois requêtes concurrentes et un rythme modéré. Utilisez **Analyser 150 fiches de plus** ou **Analyser tout le périmètre** pour continuer. Pour des dizaines de milliers de cartes, une analyse complète peut être longue ; mieux vaut sélectionner une extension ou prévoir un index de prix côté serveur. Le bouton **Mettre en pause** interrompt la programmation de nouvelles requêtes. Les prix positifs ou absents sont mis en cache 24 h dans IndexedDB ; les anciens caches `pv_prices` et `pv_prices_v2` sont lus pour préserver l'historique. La valeur suivie ne couvre que les références cotées. Les prix restent indicatifs : TCGdex signale des cas d'association imparfaite de variantes.

Lorsque les cotes changent pendant un défilement profond, l'application **ne réordonne pas brutalement les cartes sous le doigt** : elle propose **Actualiser le classement**. En haut de la liste, le tri se met à jour automatiquement après une courte temporisation.

## Défilement et performances

- **Grille virtualisée** : seuls les rangs visibles et environ 850 px de marge sont présents dans le DOM, même avec des milliers de cartes. Les espaces avant/après maintiennent la longueur et la position de défilement.
- `requestAnimationFrame` pour le défilement, recalcul des colonnes à la rotation / au redimensionnement, dimensions de cartes réservées pour éviter les sauts visuels, `IntersectionObserver` pour les images proches de l'écran.
- **Flèches haut/bas** à défilement animé, avec respect de `prefers-reduced-motion` ; chargement des fiches prioritaires devant le scan de fond ; cache des fiches limité en mémoire.
- Les changements de quantité modifient uniquement la carte concernée, sans reconstruire toute la grille, sauf lorsqu'un filtre « Possédées / Manquantes » doit changer les résultats.

## PWA et limites

Le service worker v3 conserve le shell, les catalogues déjà consultés, les fiches récentes et jusqu'à 320 images visitées. Les catalogues globaux sont protégés de l'éviction lors des scans de prix. Le premier chargement nécessite le réseau ; une illustration non visitée ne sera pas magiquement disponible hors connexion. La collection reste dans `localStorage`, les caches remplaçables dans IndexedDB/Cache Storage. Testez les quotas réels d'iOS, les erreurs réseau et l'actualisation du service worker sur votre hébergement.

La PWA **n'est pas une application iOS soumise à l'App Store**. La règle 4.2, les droits sur les images et marques, la politique de confidentialité, la restauration et d'éventuelles fonctionnalités natives devront être étudiés séparément. Aucune validation App Store n'est garantie.

Sources : [TCGdex](https://tcgdex.dev/) · [Documentation Pokémon TCG API (dépréciation)](https://docs.pokemontcg.io/) · [Scrydex](https://scrydex.com/docs).

## Nouveautés v3 : visuels suivis et défilement sans clignotement

La section **Vérification des visuels** reste visible sous celle des cotes et mesure le **périmètre actuellement sélectionné** (recherche, extension, filtre). Elle distingue :

- **Non recherchés / en attente** : aucune vérification complète n'a encore été faite. Ce n'est pas une absence de visuel.
- **Recherche en cours** : les URL d'illustration sont effectivement testées, puis les sources FR, EN et secondaire sont consultées si nécessaire.
- **Trouvés** : une image a réellement été chargée, et non simplement mentionnée dans une fiche API.
- **Introuvables** : les catalogues interrogés n'ont pas fourni de visuel valide ; cet état négatif expire après 24 heures.
- **À réessayer** : problème réseau, fournisseur indisponible, URL d'image en erreur, source secondaire limitée ou vérification incomplète. Ce statut n'est **jamais** compté comme « introuvable ».

La recherche se poursuit en tâche de fond **tant que l'application reste ouverte**, par lots de deux images, en laissant la priorité au défilement. Le démarrage automatique vérifie jusqu'à 100 cartes dans le catalogue global, ou 300 dans une extension ; les boutons permettent de poursuivre par 100 ou de lancer l'ensemble du périmètre. La source secondaire temporaire reste limitée à 60 requêtes par session : les cartes non vérifiées à cause de cette limite sont signalées comme « à réessayer », pas comme absentes. La mise en pause arrête les nouveaux lots, sans annuler les requêtes déjà lancées. Une application web fermée ne peut pas garantir cette analyse en arrière-plan ; une synchronisation serveur serait nécessaire pour cela.

La grille **réutilise les mêmes éléments DOM** pour les cartes communes entre deux fenêtres de défilement, au lieu de tout reconstruire à chaque mouvement. Elle conserve également jusqu'à 65 tuiles récemment sorties de l'écran et affiche toujours le verso local pendant le chargement initial, avec fondu d'entrée sur le visuel trouvé. Les images résolues restent dans IndexedDB et les fichiers visités dans le cache du service worker. Le comportement réel reste à tester sur les téléphones cibles, notamment en cas de manque de mémoire.

**Compatibilité collection :** la clé `pv_collection`, les quantités et les exports JSON v1 sont inchangés. La nouvelle logique n'écrit que dans les caches d'images. Avant publication, exporter une sauvegarde JSON et conserver la même origine HTTPS pour retrouver automatiquement les données existantes.

## V4 — Pack d'illustrations embarqué (préparation pour Work / natif)

Cette version fonctionne sans pack (PWA habituelle) ou avec un pack `dist/assets/offline/` créé au moment du build. **L'archive du code ne contient pas les 22 000 images** : elles doivent être téléchargées depuis une machine disposant du réseau, après vérification des droits de redistribution. Ne pas pousser `dist/` ou les images sur un dépôt public sans autorisation.

Dans la v4, le bouton **Index visuels** exporte les correspondances URL/carte déjà vérifiées sur **ce navigateur** (pas les images elles-mêmes, pas les quantités). Exporter séparément la collection JSON par précaution ; la v4 conserve toujours `pv_collection` et les anciens exports.

Depuis Work ou un PC disposant de Node.js >=20 et d'une connexion Internet :

```bash
npm test
npm run pack:offline -- --resolutions-json pokevault-index-visuels.json --languages de,it,es,pt --precache-limit 100
# Produit dist/ (app statique + catalogue FR + visuels téléchargés + rapport détaillé).
# Pour ne traiter que les cartes possédées : --only-owned ma-collection.json
# Pour un essai rapide : --limit 100
# Pour reprendre un build interrompu, relancer la même commande avec le même --output. Le builder limite ses requêtes à une toutes les 200 ms par défaut et ralentit après HTTP 429/5xx (`--request-gap-ms` permet d’ajuster ce délai selon les conditions du fournisseur).
```

Le builder tente successivement : URLs déjà vérifiées, TCGdex FR, TCGdex EN (même ID), puis les langues TCGdex demandées (même ID). Pour les cartes vraiment absentes, un fichier `--overrides-json overrides.json` permet d'ajouter des correspondances **revues manuellement** :

```json
{"swsh3-136":{"url":"https://images.pokemontcg.io/swsh3/136.png","reviewed":true}}
```

Une correspondance n'est acceptée que si l'image est téléchargée et possède une signature d'image valide. Les URLs arbitraires, les réponses HTML et les correspondances non revues sont refusées. Pour Scrydex, un outil externe autorisé peut produire ce fichier après appariement rigoureux nom anglais + numéro + extension + année. Si les images proviennent d’un autre CDN, ajouter explicitement son domaine avec `--allow-host cdn.exemple.org` après vérification des droits et des conditions du fournisseur ; aucune clé API ne doit être exposée. Ne jamais exposer une clé Scrydex dans l'app ou le dépôt. Le catalogue `pokemon-tcg-data` reste historique et ne remplace pas une source maintenue.

`dist/assets/offline/report.json` contient `packed`, `missingIds` et les erreurs. **Un `missing` ne prouve pas que l'illustration n'existe pas** : cela signifie qu'aucun candidat autorisé n'a pu être téléchargé lors de ce build. Ajouter des overrides revus et relancer pour compléter le pack.

Le dossier `dist/` est déployable tel quel sur un hébergement statique ou copiable comme `webDir` d'un projet Capacitor. Une application native contenant les fichiers embarqués n'a plus besoin de vérifier les images présentes dans le pack. Sur le Web, le navigateur impose des quotas : seules les images consultées et au plus `--precache-limit` images sélectionnées sont garanties hors ligne après installation de la PWA ; une PWA ne peut pas garantir 22 000 images hors ligne sur tous les appareils. Le service worker est versionné v4 pour éviter de conserver les fichiers v3.

Les prix **ne sont pas figés dans le pack** : les cotes évoluent, et l'app conserve son système actuel de rafraîchissement et de cache. Les visuels non empaquetés conservent la recherche réseau et le verso local. Aucune modification ni purge de la clé `pv_collection`.

## Priorité v4.2 : catalogue intégral autonome (données, pas illustrations)

La commande `npm run pack:catalog -- --index inputs/pokevault-index-visuels.json --strict --output dist` récupère les inventaires **FR + EN** et les fiches de **chaque carte**, conserve les IDs propres à chaque impression, construit les fiches des extensions et écrit un rapport exhaustif sous `dist/assets/offline/catalogue-report.json`. Sans `detailsComplete: true`, le build est partiel et ne doit pas être livré comme un catalogue intégral. Le cache `.catalogue-cache` permet de relancer la commande sans tout retélécharger. Pour un essai sans réseau, utiliser les fixtures de `tests/catalogue.test.mjs` ; cela valide le processus mais ne constitue pas les 22 000 fiches réelles.

**État des ressources :** le fichier `inputs/pokevault-index-visuels.json` reprend ton export d'URL d'images vérifiées ; il ne contient ni photos, ni cartes de collection, ni prix. Le build de catalogue n'emporte pas les illustrations protégées. Voir `WORK-CATALOGUE.md` pour la livraison complète et le test navigateur hors connexion, puis `ROADMAP-COTES.md` pour les futurs rafraîchissements manuels des prix.

---

## V4.4 — Moisson des images automatisée sur GitHub

Voir **[WORK-MOISSON-VISUELS.md](WORK-MOISSON-VISUELS.md)** pour l'installation et les contrôles. Le workflow `.github/workflows/harvest-images.yml` relance la recherche quatre fois par jour, enregistre les résultats et les échecs sur la branche de métadonnées `pokevault-image-data`, et peut ensuite télécharger les scans dans 16 artefacts isolés, après vérification des droits. Le job `assemble` vérifie les octets de tous les shards et produit un rapport. L'application détecte les packs locaux `mode: sealed` et désactive alors les recherches automatiques d'images.

L'archive contient **20 559 URL validées syntaxiquement**, pas 20 559 fichiers image ; les fichiers ne seront confirmés qu'après le téléchargement réel dans GitHub Actions. Aucune action sur `pv_collection` n'est nécessaire.

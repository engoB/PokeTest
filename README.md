# PokéVault Premium · PWA v2

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

Le service worker v2 conserve le shell, les catalogues déjà consultés, les fiches récentes et jusqu'à 320 images visitées. Les catalogues globaux sont protégés de l'éviction lors des scans de prix. Le premier chargement nécessite le réseau ; une illustration non visitée ne sera pas magiquement disponible hors connexion. La collection reste dans `localStorage`, les caches remplaçables dans IndexedDB/Cache Storage. Testez les quotas réels d'iOS, les erreurs réseau et l'actualisation du service worker sur votre hébergement.

La PWA **n'est pas une application iOS soumise à l'App Store**. La règle 4.2, les droits sur les images et marques, la politique de confidentialité, la restauration et d'éventuelles fonctionnalités natives devront être étudiés séparément. Aucune validation App Store n'est garantie.

Sources : [TCGdex](https://tcgdex.dev/) · [Documentation Pokémon TCG API (dépréciation)](https://docs.pokemontcg.io/) · [Scrydex](https://scrydex.com/docs).

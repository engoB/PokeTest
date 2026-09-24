# PokéVault — collecte automatique des visuels, sans abonnement

L'objectif est le catalogue **français exact**. Il n'est pas demandé de rechercher les cartes à la main. Le rapport HTML sur les cartes manquantes est **un diagnostic facultatif**, pas une étape nécessaire à la collecte.

## Quatre passages GitHub par jour

Le workflow `.github/workflows/harvest-images.yml` exécute `resolve` quatre fois par jour, sans intervention :

1. Il charge le dernier état sauvegardé et les catalogues TCGdex en cache.
2. Il commence par les références françaises jamais examinées, puis reprend les erreurs temporaires.
3. Il consulte TCGdex dans onze langues, par ID de carte identique, y compris les détails et les chemins d'image reconstruits à partir de l'extension vérifiée.
4. Si TCGdex ne fournit pas l'image, il interroge **l'API Pokémon TCG gratuite**. Lorsque plusieurs cartes manquantes appartiennent à la même extension, une requête récupère toute l'extension (pagination à 250 cartes), puis chaque carte est appariée **strictement** par nom anglais, numéro, nom d'extension et, lorsqu'il est connu, total imprimé. Les résultats complets sont mis en cache pendant 14 jours. Si le nom de l'extension diffère entre les deux bases, le programme revient à la recherche individuelle. Budget : 100 requêtes API maximum par passage, et donc 400 par jour pour les quatre passages programmés, sous réserve d'autres utilisations de la même adresse IP.
5. Une image n'est retenue que si elle provient d'un hôte approuvé et si les octets téléchargés constituent un vrai fichier PNG, JPG ou WEBP non tronqué. Le programme conserve l'URL, la source, le statut et la date de vérification.
6. Les cartes sans résultat dans les sources gratuites sont **réexaminées automatiquement tous les sept jours**. Les erreurs réseau et quotas sont réessayés avec temporisation. L'état et l'index des URL sont sauvegardés sur la branche `pokevault-image-data` et dans les artifacts GitHub Actions.

Le tableau `research/recherche.html` est généré à titre informatif. Il n'est **pas** nécessaire de l'ouvrir, de cliquer 1 475 fois ni de remplir un fichier manuel.

## Pourquoi pas sept aspirateurs automatiques ?

PkmnCards ne fournit pas d'API publique, TCG Collector réserve son API aux partenaires professionnels, et Pokélector interdit les accès automatisés sans permission écrite. Les autres catalogues ont des restrictions et des formats qui ne garantissent pas une correspondance exacte. Une utilisation privée ne supprime pas ces conditions. Ces sites peuvent aider à identifier des références, mais ils ne sont pas aspirés massivement par le workflow.

Il n'existe **aucune garantie de 100 %** : les visuels réellement absents de toutes les sources gratuites autorisées restent signalés, sans substitution trompeuse d'une autre carte. Les 22 170 références ne sont pas 22 170 fichiers téléchargés : `resolve` vérifie les URL ; le mode `pack`, séparé, récupère les fichiers physiques après vérification des droits de téléchargement et d'utilisation.

## Installer

Importer les fichiers du correctif en conservant les chemins, puis valider le commit sur `main`. Le prochain passage programmé utilisera automatiquement le nouveau code. Il est possible de lancer un `resolve` manuel une seule fois pour voir le résultat immédiatement, mais ce n'est pas obligatoire.

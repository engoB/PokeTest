# PokéVault 5.1 — bibliothèque d’images gratuite sur GitHub

## Ce qui fonctionne immédiatement

Le classeur continue d’afficher les images déjà indexées auprès des fournisseurs. Le nouveau dossier `assets/library/` est publié directement par **GitHub Pages**, sur le même domaine que l’application. Son manifeste est volontairement vide au départ : **aucun scan tiers n’a été copié sans confirmation des droits**. À chaque visite, PokéVault lit ce petit manifeste puis ne télécharge que les images affichées, sans imposer de pack hors ligne.

Le sélecteur de finition et ses différentes cotes se trouvent **uniquement dans la fiche ouverte**. Sur les vignettes du catalogue, une cote non déterminée est simplement indiquée « Cote — ».

## Publier des images sur GitHub, sans stockage payant

1. Vérifier que tu disposes du **droit de redistribution publique** de chaque scan envisagé, et pas uniquement du droit de le consulter ou de le télécharger. Écarter les images dont les droits sont incertains.
2. Dans **Actions → PokéVault - moisson d’illustrations → Run workflow**, sélectionner le mode `pack` et confirmer les droits applicables. Attendre que les **16 shards** soient disponibles. Noter l’identifiant numérique de ce run ; ses artefacts expirent après 14 jours.
3. Dans **Actions → Publish images to GitHub Pages (free) → Run workflow**, renseigner cet identifiant et confirmer les droits de redistribution publique. Aucun compte de stockage, clé API ou abonnement supplémentaire n’est nécessaire.
4. Le workflow vérifie les fichiers réels, puis ajoute les images autorisées dans `assets/library/cards/` et met à jour `assets/library/manifest.json` **après** chaque lot. Les images sont nommées d’après leur empreinte SHA-256 ; les fichiers déjà présents ne sont pas retéléversés. Le workflow demande ensuite une reconstruction de GitHub Pages.
5. Attendre la réussite de **pages build and deployment** puis ouvrir le classeur. Dans **⚙ Options → État des visuels**, la ligne « Bibliothèque GitHub » affiche le nombre de fichiers réellement hébergés. Les URL indexées par la moisson restent comptabilisées séparément.

**Si le workflow signale que la reconstruction Pages a été refusée**, les images sont tout de même dans Git. Un commit normal sur `main` (par exemple une petite correction du README via l’interface GitHub) déclenche la publication Pages habituelle. Les commits effectués avec `GITHUB_TOKEN` ne déclenchent pas à eux seuls ce build automatique.

## Limites et sécurité

- **Pas de facture de stockage externe :** GitHub Pages est accessible gratuitement pour les dépôts publics, sous réserve des conditions d’utilisation de GitHub.
- **Limites officielles :** dépôt source recommandé sous 1 Go, site Pages publié sous 1 Go et bande passante souple de 100 Go par mois. Voir [la documentation GitHub](https://docs.github.com/fr/pages/getting-started-with-github-pages/github-pages-limits). Pages n’est pas conçu pour un site dont l’objet principal est le commerce ou un service de distribution de fichiers à fort trafic.
- **Garde-fous automatiques :** maximum 650 Mio de fichiers dans la bibliothèque, 120 Kio par image, lots Git de 32 Mio maximum. Les scans trop volumineux ou au-delà du plafond sont laissés de côté et restent accessibles par les fournisseurs lorsqu’une URL valide existe. Ces limites évitent de promettre que 22 000 images tiendront nécessairement sur GitHub Pages.
- **Aucun téléchargement massif dans le navigateur :** les images ne sont demandées qu’à l’affichage et le cache reste borné. La PWA peut conserver les images déjà consultées, mais n’essaie pas de synchroniser toute la bibliothèque hors ligne.
- **Pas de fichiers LFS pour Pages :** les images publiées sont de petits fichiers Git ordinaires. Git LFS ne permet pas de contourner la taille du site publié.
- **Pas de suppression automatique :** les anciennes images restent dans Git tant que le manifeste les référence. Le script ne remplace pas silencieusement une image existante.
- **Collection inchangée :** aucun effacement de la collection locale, des imports ou des exports.

Pour préparer et tester localement un pack déjà autorisé : `node scripts/publish-image-library.mjs --dir dist --out assets/library --rights-confirmed`, puis `npm run check` avant de committer les nouveaux fichiers. La vérification des droits reste à la charge de la personne qui publie les images.

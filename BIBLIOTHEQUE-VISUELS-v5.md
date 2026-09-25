# PokéVault 5.0 — bibliothèque d'illustrations propriétaire

La PWA utilise en priorité des images sous ton contrôle, à la demande. Aucun utilisateur ne doit télécharger le catalogue complet. La moisson GitHub reste un secours pour les cartes absentes de ta bibliothèque.

## État réel

Le code et le pipeline sont livrés, mais **aucune bibliothèque propriétaire n'est hébergée automatiquement**. `image-library-config.json` contient `baseUrl: ""` tant que tu n'as pas configuré le stockage et vérifié les droits de redistribution. Les URL tierces restent utilisées entre-temps.

## Activer la bibliothèque

1. Vérifier les droits de conservation **et de redistribution publique** des scans auprès des fournisseurs. Ne pas publier de fichiers sans autorisation.
2. Lancer le workflow **PokéVault - moisson d'illustrations** en mode `pack` avec confirmation des droits. Conserver son ID de run ; les 16 artefacts expirent après 14 jours.
3. Configurer un bucket S3-compatible avec domaine public HTTPS et CORS autorisant ton site. Ajouter les secrets GitHub `PV_IMAGE_ACCESS_KEY` et `PV_IMAGE_SECRET_KEY` et les variables `PV_IMAGE_S3_ENDPOINT` et `PV_IMAGE_BUCKET`.
4. Lancer **Publish owned image library** avec l'ID du run `pack` et confirmer les droits. Le workflow vérifie les fichiers, calcule SHA-256, téléverse les images sous des chemins immuables puis publie `manifest.json` en dernier.
5. Vérifier `https://TON-DOMAINE/manifest.json` et une image, puis renseigner `baseUrl` (HTTPS avec barre finale) dans `image-library-config.json`. Déployer le changement.

## Mises à jour

Répéter la préparation et la publication après une nouvelle moisson. Les images inchangées conservent leur nom basé sur SHA-256 ; seules les nouvelles sont téléversées. Les utilisateurs téléchargent un petit manifeste au démarrage, puis uniquement les images consultées. La vérification systématique de toutes les URL indexées dans chaque navigateur est supprimée.

## Limites

Le stockage, les droits et la première publication ne sont pas fournis par ce commit. Les sources externes restent utilisées pour les cartes sans fichier hébergé. Ne pas supprimer les anciens fichiers du bucket tant qu'un manifeste publié les référence. Le navigateur conserve sa collection `pv_collection`.

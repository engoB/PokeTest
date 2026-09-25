# PokéVault v4.9 — index GitHub synchronisé et nouvelle identité

## Deux compteurs, deux mesures

- **Moisson GitHub** : l'application charge l'index d'URL de la branche `pokevault-image-data` et affiche la couverture de l'ensemble du catalogue français. Une URL est une piste vérifiée par la moisson, pas une image garantie sur chaque appareil.
- **Vérification sur cet appareil** : le navigateur ne compte un visuel comme trouvé qu'après le chargement réel de l'image. Les résultats locaux déjà enregistrés restent intacts.

L'index GitHub est actualisé au démarrage, au retour du réseau et toutes les six heures si l'application reste ouverte. Si GitHub est inaccessible, PokéVault essaie sa dernière copie enregistrée, puis l'index de secours intégré au dépôt. Les URL de la moisson sont prioritaires dans les essais d'affichage, y compris pour les cartes que le navigateur avait provisoirement classées « introuvables ».

**Aucune relance manuelle de `resolve` n'est nécessaire** : la moisson planifiée continue sur GitHub Actions. Les chiffres de l'interface ne sont pas figés à 21 587 et évoluent avec les nouvelles exécutions.

## Icônes et actualisation PWA

L'ancien favicon vert a été remplacé par un sceau bleu nuit, rouge et or : `assets/icon.svg`, `assets/favicon-32.png`, `assets/icon-192.png` et `assets/icon-512.png`. Les liens du navigateur et du manifeste sont versionnés `v=4.9.0` et le service worker utilise le cache `pv-v4.9`. Les anciennes images de cartes mises en cache sont préservées pendant la mise à jour.

Les icônes des PWA déjà installées peuvent rester affichées temporairement à cause du cache du système d'exploitation ; le navigateur doit afficher immédiatement le nouveau favicon après le déploiement et une actualisation normale. Ne jamais effacer les données de PokéVault sans exporter sa collection JSON.

## Vérification

`npm run check` contrôle la génération du bundle, la syntaxe et les tests, dont les nouveaux cas sur l'index GitHub, la séparation des compteurs et les nouvelles icônes.

# PokéVault v4.8 — interface Collection

Cette version est un **correctif d'interface** construit sur le `main` de `engoB/PokeTest` du 24 septembre 2026 (commit `d38fea8b1ded83c03b1492c1cc43a3eb202143b3`). Elle ne modifie **ni** le catalogue des 22 170 cartes françaises, **ni** le moteur de moisson v4.7 / ses quatre passages quotidiens, **ni** la collection locale `pv_collection`.

## Installer

1. Décompresser `PokeVault-v4.8-CORRECTIF-INTERFACE.zip`.
2. Dans une copie de votre dépôt GitHub, copier **tous les fichiers** en conservant les sous-dossiers (`tests/`). Remplacer les fichiers existants.
3. Valider et pousser sur `main` (GitHub Desktop : *Commit to main* puis *Push origin*). Attendre la réussite de **Verify PWA** et du déploiement GitHub Pages.
4. Sur l'appareil, actualiser la PWA ; si l'ancienne interface reste affichée, fermer/réouvrir la PWA ou faire un rechargement forcé. Le service worker utilise désormais `pv-v4.8` et migre les images précédemment mises en cache.

**Ne remplacez pas `scripts/harvest-images.mjs` ni `.github/workflows/harvest-images.yml` : le correctif ne les contient pas.** La moisson automatique continue indépendamment de l'interface.

## Changements

- Thème Pokémon de collection bleu nuit, or, rouge et motif Poké Ball, responsive.
- Rotation très légère des illustrations et inclinaison 3D au survol (souris), désactivables dans **⚙ Options** ; respect du réglage système de réduction des animations.
- Option **Afficher les cotes** : masque estimations, badges et filtres de prix sans cacher le bouton d'achat. Préférences conservées sur l'appareil.
- Recherche immédiate pendant la saisie, avec liste déroulante de huit cartes maximum, extension et numéro, navigation clavier ↑/↓, Entrée et Échap. La grille se filtre en même temps. Croix pour effacer conservée.
- La recherche individuelle d'images et les liens manuels des six catalogues ont été retirés **de la fiche** ; la recherche globale et le moteur GitHub continuent automatiquement.
- Cotes TCGdex/Cardmarket distinguées par **finition standard / holographique / reverse**. Si plusieurs finitions ont une cote, il faut en sélectionner une : pas de mélange silencieux. Les anciens prix mis en cache sans finition confirmée sont invalidés puis recherchés à nouveau.
- Achat séparé de la cote : **lien produit uniquement si une URL exacte est disponible dans les données ou dans `inputs/cardmarket-links.json`**. Sinon recherche Cardmarket volontairement large par nom, plus recherche web ciblée par extension et numéro. La fiche affiche explicitement l'extension, le numéro et l'absence de correspondance produit confirmée.

## Limite importante des cotes

Une cote statistique TCGdex n'est **pas** le prix de vente actuel d'une annonce Cardmarket. TCGdex indique lui-même que certains tirages/raretés peuvent être reliés à une mauvaise fiche produit ; ses identifiants Cardmarket par variante sont encore en développement. Sans identifiant produit exact et vérifié, PokéVault affiche un avertissement au lieu de prétendre que le lien et la cote correspondent. Les prix dépendent aussi de la langue, de l'état et de la finition.

## Validation

- `npm run check` : **65 tests réussis**.
- Essai navigateur desktop sur un petit catalogue de démonstration : recherche immédiate, sélection d'une carte, choix de finition, lien Cardmarket et options fonctionnels ; aucune erreur JavaScript.
- Essai navigateur mobile : pas de débordement horizontal, options et fiche accessibles ; aucune erreur JavaScript.
- Les essais navigateur utilisent un **catalogue fictif de trois cartes** et des prix de démonstration ; ils ne constituent **pas** une vérification de prix Cardmarket réels.

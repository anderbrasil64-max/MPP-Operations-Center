# Plan de nettoyage de l'historique Git

**Etat: non execute.** Une reecriture d'historique ne revoque aucun secret; toutes les
rotations concernees doivent etre terminees avant cette procedure.

## Preconditions

1. Inventaire redige valide et rotations confirmees hors depot.
2. Gel des pushes, proprietaire et collaborateurs prevenus.
3. Sauvegarde miroir hors ligne creee et testee en lecture.
4. Liste exacte de remplacement creee hors depot, protegee et destinee a etre detruite.
5. Fenetre de maintenance et procedure de recuperation des clones approuvees.

## Repetition dans un clone jetable

```powershell
git clone --mirror <repository-url> MPP-Operations-Center-cleanup.git
Set-Location MPP-Operations-Center-cleanup.git
git filter-repo --replace-text C:\secure\mpp-replacements.txt --force
```

Le fichier de remplacement ne doit jamais etre cree dans le depot ni affiche dans un
rapport. Ne jamais lancer `filter-repo` depuis un clone de travail.

## Validation avant publication forcee

- Scanner tous les refs, tags et objets atteignables; ne publier aucune valeur trouvee.
- Comparer les arbres attendus, migrations, tags et release artifacts.
- Refaire les tests et construire `site-dist/` depuis l'historique nettoye.
- Verifier qu'une restauration depuis le miroir original reste possible hors ligne.

## Coordination du force-push

Avec approbation explicite seulement: forcer branches et tags, purger artifacts/caches
contenant les anciens objets, puis imposer un nouveau clone ou une procedure de reset
documentee. Ne jamais fusionner un ancien clone apres la reecriture. Conserver le
miroir original hors ligne pendant la duree approuvee, puis le detruire.

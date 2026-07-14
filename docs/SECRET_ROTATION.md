# Rotation des secrets et credentials

Aucune valeur ne doit apparaitre dans ce document, une commande partagee ou le rapport.
Une suppression Git n'annule jamais une valeur deja exposee.

## Ordre recommande avant Alpha 0.13.0

1. Recenser en prive les categories historiquement publiees et leur reutilisation.
2. Remplacer toute valeur de secours privilegiee ou credential qui en depend.
3. Revoquer toutes les sessions applicatives.
4. Si l'audit fournisseur le justifie, faire tourner bot/webhooks Discord, secrets
   Cron, `service_role`, secret operateur et pepper de liaison.
5. Verifier que l'ancienne valeur est refusee et que la nouvelle fonctionne sur un
   environnement non productif ou un canal de test.
6. Seulement ensuite planifier le nettoyage d'historique.

## Procedure par secret fournisseur

1. Creer la nouvelle valeur dans l'interface du fournisseur, jamais dans chat/Git.
2. L'enregistrer dans le gestionnaire de secrets sous le nom documente.
3. Avec approbation, deployer uniquement les fonctions concernees.
4. Tester une requete refusee et une requete nominale avec fixtures redigees.
5. Revoquer l'ancienne valeur puis confirmer son echec.
6. Revoquer les sessions/codes en attente qui en dependent.
7. Consigner hors depot date, proprietaire, categorie, composant et resultat, sans valeur.

## Cas particuliers

- `service_role`: impact transversal; verifier toutes les huit fonctions avant
  revocation de l'ancienne valeur.
- Webhook/bot Discord: utiliser un canal de test, puis surveiller les erreurs 401/403 et
  l'anti-doublon sans envoyer de rappel reel.
- Pepper de liaison: invalider les demandes/code existants et informer les utilisateurs
  de recommencer le parcours.
- Credential joueur/admin: utiliser l'interface/RPC securisee; ne jamais l'ecrire dans
  une migration, un script ou un ticket.

## Criteres de cloture

- Ancienne valeur rejetee, nouvelle valeur testee, sessions dependantes revoquees.
- Logs et historique de deploiement sans valeur.
- Inventaire prive mis a jour et checklist de release signee.

# Kōv — Guide de test client

> **Objectif de ce document** : te permettre de tester toi-même l'application Kōv de bout en bout, sans connaissance technique, pour vérifier que tout fonctionne comme attendu avant la mise en production. Suis les sections dans l'ordre — chacune correspond à une fonctionnalité réelle de l'app.
>
> **Comment l'utiliser** : coche chaque case au fur et à mesure. Si quelque chose ne correspond pas à ce qui est décrit (message d'erreur inattendu, écran vide, bouton qui ne fait rien, page qui reste bloquée), note-le avec le nom de l'écran et ce que tu as fait juste avant — envoie-nous cette liste, ce sera plus rapide à corriger.

---

## Avant de commencer

- **Utilise un vrai compte de test**, pas ton compte définitif — crée un compte spécialement pour ces tests (tu pourras le supprimer à la fin via Profil → Supprimer mon compte).
- **Teste sur mobile ET sur ordinateur** si possible — l'app est conçue pour marcher sur les deux, mais certains écrans changent de disposition selon la taille.
- **Active de temps en temps le mode "hors ligne"** de ton téléphone/navigateur pendant un test (juste pour voir apparaître le bandeau "Hors ligne" en haut de l'écran) — c'est normal et volontaire, pas un bug.
- Compte environ **1h30 à 2h** pour un passage complet et sérieux de tout ce document.

---

## 1. Inscription et connexion

- [ ] Va sur l'écran d'inscription, crée un compte avec un email valide (tu dois pouvoir recevoir l'email de confirmation).
- [ ] Reçois bien l'email de confirmation et clique sur le lien — tu dois arriver sur l'app, pas sur une page d'erreur.
- [ ] Déconnecte-toi puis reconnecte-toi avec ce même compte — ça doit fonctionner du premier coup.
- [ ] Essaie de te connecter avec un mauvais mot de passe — un message d'erreur clair doit apparaître (pas un écran blanc ou un plantage).
- [ ] Teste "Mot de passe oublié" — tu dois recevoir un email et pouvoir définir un nouveau mot de passe.
- [ ] Une fois connecté, essaie de retourner manuellement sur l'écran de connexion (tape l'adresse) — tu dois être automatiquement renvoyé vers l'app, pas revoir le formulaire de connexion.

## 2. Configuration initiale (onboarding)

Ce parcours ne s'affiche qu'une seule fois, à la création du compte.

- [ ] Choisis ton métier (ex. plomberie-chauffage) — la suite du parcours doit correspondre à ce choix.
- [ ] Choisis ton mode d'équipe (seul / avec employés).
- [ ] Remplis les informations de ton entreprise (nom, adresse, SIREN, TVA, mentions légales) — si tu laisses un champ obligatoire vide, un message doit te le signaler clairement.
- [ ] Une fois terminé, tu dois arriver sur l'écran d'accueil — jamais revenir sur ce parcours de configuration après coup (sauf si tu vas volontairement dans Profil → Entreprise pour modifier ces infos plus tard).

## 3. Écran d'accueil (Accueil)

- [ ] L'écran d'accueil doit afficher les actions/priorités du jour, sans donnée fictive (si tu n'as encore rien créé, ça doit dire clairement qu'il n'y a rien pour l'instant, jamais des faux chiffres).
- [ ] Clique sur une action proposée — elle doit t'amener au bon endroit (pas un écran vide ou une erreur).

## 4. Clients

- [ ] Va dans "Clients", crée un nouveau client avec toutes les infos (nom, adresse, téléphone, email, SIREN si pertinent).
- [ ] Mets volontairement un email mal formé (ex. "test@") — un message d'erreur doit apparaître avant l'enregistrement.
- [ ] Ouvre la fiche du client créé — vérifie que toutes les infos saisies sont bien là.
- [ ] Modifie une info (ex. le téléphone) et enregistre — ressors de la fiche et reviens : la modification doit être conservée.
- [ ] **Ajoute un document** depuis la fiche client (photo ou fichier) — vérifie qu'il apparaît bien dans la liste des documents de ce client après.
- [ ] Ajoute une note interne sur ce client (texte libre, avec ou sans étiquette) — vérifie qu'elle apparaît dans la liste des notes.
- [ ] Si ton téléphone/ordinateur le permet, teste la dictée vocale pour une note — le texte dicté doit apparaître dans la zone de texte (jamais envoyé automatiquement, tu dois toujours pouvoir le relire/corriger avant d'enregistrer).
- [ ] Une fois que tu auras créé un devis/facture/chantier pour ce client (sections suivantes), reviens sur sa fiche : le chiffre d'affaires cumulé, le nombre de chantiers, et l'historique (devis/chantiers) doivent refléter les vraies données — jamais rester à zéro ou vide une fois que tu as des devis/chantiers réels.
- [ ] Archive ce client (bouton "Archiver ce client") — il doit disparaître de la liste principale des clients, mais rester accessible si tu recherches les clients archivés. Vérifie que ses devis/factures/chantiers existent toujours (rien ne doit être supprimé).

## 5. Bibliothèque de prix

- [ ] Va dans Profil → Bibliothèque de prix. Si tu as choisi un métier avec un catalogue de démarrage (plomberie-chauffage), vérifie qu'une liste de prestations/fournitures est déjà présente avec des prix réalistes.
- [ ] Ajoute un nouvel article (désignation, unité, prix d'achat, prix de vente, TVA, fourniture ou main d'oeuvre) — vérifie qu'il apparaît dans la liste.
- [ ] Modifie un article existant — vérifie que le changement est conservé.
- [ ] Désactive un article — il doit disparaître de la liste par défaut mais rester consultable via "Afficher désactivés". Réactive-le, il doit redevenir normal.
- [ ] Recherche un article par son nom — la liste doit se filtrer correctement.

## 6. Fiches techniques

- [ ] Crée une fiche technique (titre + contenu), optionnellement liée à un article de ta bibliothèque de prix.
- [ ] Vérifie qu'elle apparaît dans la liste et que la recherche fonctionne.

## 7. Devis

- [ ] Crée un nouveau devis : choisis un client, décris les travaux (teste aussi l'assistant IA si disponible — il doit proposer des lignes basées sur ta bibliothèque de prix, jamais inventer un prix).
- [ ] Ajoute des lignes depuis ta bibliothèque de prix ET en saisie libre.
- [ ] Modifie la quantité/le prix d'une ligne directement dans le tableau — vérifie que le total et la marge se recalculent immédiatement.
- [ ] Supprime une ligne — vérifie qu'elle disparaît bien et que le total se met à jour.
- [ ] Vérifie que le taux de TVA et la mention légale TVA sont bien sélectionnables et cohérents.
- [ ] Regarde la boîte "marge" pendant que tu modifies les prix — la couleur et le message doivent changer selon que la marge est bonne, moyenne ou mauvaise.
- [ ] Émets le devis (bouton final d'envoi) — le statut doit passer à "Émis", et un PDF doit être généré et téléchargeable.
- [ ] Ouvre le PDF généré — vérifie que toutes les informations (client, entreprise, lignes, totaux, mentions légales) sont correctes et lisibles.
- [ ] Essaie de modifier un devis déjà émis ("Modifier ce devis") — il doit repasser en brouillon, et à la ré-émission un NOUVEAU PDF (version 2) doit être généré, sans écraser le premier.
- [ ] Simule l'acceptation du devis par le client (bouton d'acceptation/signature) — vérifie que le statut passe bien à "Accepté".
- [ ] Teste aussi le refus d'un devis (sur un autre devis test) — le statut doit passer à "Refusé".
- [ ] Retourne dans la liste des devis — vérifie que le filtrage par statut (Brouillon/Émis/Accepté/Refusé) fonctionne.

## 8. Transformation en chantier

- [ ] À partir d'un devis accepté, transforme-le en chantier — vérifie qu'un nouveau chantier apparaît bien lié à ce devis et à ce client.
- [ ] Ouvre le chantier — vérifie que le planning, la marge réelle vs prévue, et les informations du devis d'origine sont cohérents.

## 9. Suivi de chantier

- [ ] Sur un chantier, ajoute un rapport d'avancement (texte ou dictée vocale) avec un pourcentage d'avancement.
- [ ] Coche "Informer le client par SMS" et envoie — vérifie qu'un message de confirmation apparaît.
- [ ] Regarde la "main courante" (historique des échanges) du client concerné — ce rapport doit y apparaître automatiquement.
- [ ] Ajoute une commande de fournitures liée au chantier (voir section Commandes plus bas) et vérifie que le coût réel du chantier se met à jour.
- [ ] Regarde le bloc de rentabilité du chantier — la marge réelle doit se mettre à jour au fur et à mesure que tu ajoutes des coûts/factures, et se comparer à la marge prévue au devis.

## 10. Avenant (travaux supplémentaires)

- [ ] Depuis un chantier en cours, crée un avenant (ligne(s) de travaux supplémentaires).
- [ ] Modifie les lignes proposées avant envoi (rien ne doit partir sans ta validation explicite).
- [ ] Envoie l'avenant — vérifie qu'un nouveau devis est bien créé (numéro de devis, montant correspondant) et que tu peux le suivre comme un devis normal (voir section 7).

## 11. Facturation

- [ ] Depuis un devis accepté ou un chantier, crée une facture (acompte, situation, solde ou totalité) — vérifie que le montant calculé correspond au bon pourcentage du devis.
- [ ] Vérifie que la mention légale sur les pénalités de retard et l'indemnité de 40 € apparaît bien.
- [ ] Retourne dans "Facturation" — la facture doit apparaître dans la liste avec le bon statut, et en cliquant dessus tu dois être renvoyé vers la fiche du client concerné (sauf si elle est en retard : dans ce cas tu dois arriver sur l'écran "Impayés").
- [ ] Filtre les factures par statut (Brouillon/Envoyée/Payée/En retard/Annulée) — vérifie que le filtrage est correct.

## 12. Impayés et relances

- [ ] Sur l'écran "Impayés", vérifie que les factures en retard apparaissent avec le bon niveau de relance (courtois / ferme / mise en demeure) selon le nombre de jours de retard.
- [ ] Envoie une relance — relis bien le message pré-rempli (adapté au niveau de retard), modifie-le si besoin, puis confirme l'envoi (une étape de confirmation explicite doit apparaître avant l'envoi réel).
- [ ] Vérifie que cette relance apparaît ensuite dans la main courante du client.

## 13. Commandes de fournitures

- [ ] Depuis un devis/chantier, ouvre "Commander" — sélectionne les fournitures à commander.
- [ ] Vérifie que l'état de stock (disponible / en transit / rupture) et le délai s'affichent pour chaque article.
- [ ] Confirme la commande — vérifie que le coût correspondant est bien ajouté au chantier concerné.

## 14. Planning

- [ ] Va dans "Planning" — vérifie que tes chantiers en cours apparaissent aux bonnes dates.
- [ ] Si tu as plusieurs chantiers/employés qui se chevauchent, vérifie qu'un avertissement de conflit de planning apparaît.

## 15. Messages (main courante globale)

- [ ] Va dans "Messages" — tu dois voir un fil par client, trié par échange le plus récent.
- [ ] Teste les filtres (Tout / Reçus / Sans réponse) — vérifie qu'ils filtrent correctement.
- [ ] Clique sur un fil — tu dois arriver sur la fiche du client correspondant.

## 16. Assistant Kōv (agent IA)

- [ ] Ouvre l'Assistant Kōv, tape une demande simple (ex. "envoie une relance à [nom d'un client test]").
- [ ] Vérifie que l'assistant comprend l'intention et te présente un plan d'action à valider — **rien ne doit être envoyé automatiquement**, il doit toujours y avoir une étape "Confirmer" explicite.
- [ ] Avant de confirmer, essaie de retirer une étape du plan et de relire/modifier un message proposé — vérifie que ça fonctionne.
- [ ] Confirme le plan — vérifie que chaque action s'exécute (tu dois voir un retour visuel étape par étape), et que le résultat apparaît bien dans la main courante du client concerné.
- [ ] Si ta demande est ambiguë (ex. nom de client approximatif), l'assistant doit te demander de préciser plutôt que de deviner.
- [ ] Teste aussi la dictée vocale dans l'assistant si ton appareil le permet.

## 17. Équipe (si tu travailles avec des employés)

- [ ] Va dans Profil → Entreprise → Gérer l'équipe.
- [ ] Ajoute un employé (nom, rôle).
- [ ] Désactive-le puis réactive-le — vérifie que ça fonctionne sans erreur.

## 18. Financement

- [ ] Va dans Profil → Financement — vérifie que le message "simulation indicative, pas une offre réelle" est bien visible et impossible à manquer.
- [ ] Crée une simulation pour un client (montant, durée, partenaire) — vérifie que la mensualité calculée est cohérente.
- [ ] Envoie la simulation au client — vérifie qu'elle apparaît dans l'historique des simulations et dans la main courante du client.

## 19. Satisfaction / suivi client

- [ ] Programme un rappel de suivi de satisfaction depuis la fiche d'un client (si cette option est accessible depuis la fiche client).
- [ ] Va dans Profil → Satisfaction — le client avec un rappel programmé doit apparaître.
- [ ] Clique sur "Marquer envoyé" — le client doit disparaître de cette liste, et l'action doit apparaître dans sa main courante.

## 20. Export comptable

- [ ] Va dans Profil → Export comptable — vérifie que les chiffres du trimestre en cours (chiffre d'affaires, TVA, nombre de factures/pièces) correspondent à ce que tu as réellement créé.
- [ ] Génère un export au format FEC — vérifie qu'un fichier se télécharge.
- [ ] Génère un export PDF + Excel/CSV — vérifie que les deux fichiers se téléchargent et que les montants correspondent.
- [ ] Si tu n'as aucun justificatif joint à une dépense, vérifie qu'un avertissement apparaît bien à ce sujet.

## 21. Reprendre mes données (migration)

- [ ] Choisis ton ancien logiciel dans la liste — vérifie que des instructions d'export s'affichent.
- [ ] Prépare un petit fichier CSV de test (2-3 clients avec nom/ville/téléphone/email) et importe-le.
- [ ] Vérifie l'aperçu et la correspondance des colonnes avant de confirmer.
- [ ] Confirme l'import — vérifie que le nombre de lignes importées est correct et que les nouveaux clients apparaissent bien dans ta liste de clients.
- [ ] Refais le test avec un fichier CSV volontairement incomplet (une ligne sans nom, par exemple) — vérifie qu'elle est bien ignorée et signalée, pas plantée.

## 22. Profil et compte

- [ ] Va dans "Profil" — vérifie que tous les liens (Entreprise, Bibliothèque de prix, Fiches techniques, Export comptable, Reprendre mes données, Financement, Satisfaction) fonctionnent.
- [ ] Modifie les informations de ton entreprise — vérifie qu'elles sont bien reprises sur un nouveau devis/facture après modification.
- [ ] Déconnecte-toi depuis cet écran — vérifie que tu es bien renvoyé vers l'écran de connexion.

## 23. Situations générales à tester partout

Ces points ne sont pas liés à un seul écran — teste-les à quelques endroits différents (par exemple sur Clients, Devis, et Factures) :

- [ ] **Pendant un chargement** : tu dois voir une animation de chargement claire (jamais un écran blanc figé).
- [ ] **Liste vide** : un écran sans aucune donnée doit clairement dire "rien pour l'instant" avec éventuellement un bouton pour créer le premier élément — jamais une liste qui a l'air cassée.
- [ ] **Erreur réseau** : si possible, coupe ta connexion internet quelques secondes pendant un chargement — un message d'erreur avec un bouton "Réessayer" doit apparaître, jamais un plantage silencieux.
- [ ] **Hors ligne** : coupe complètement ta connexion — un bandeau "Hors ligne" doit apparaître en haut de l'écran, et les boutons d'envoi/enregistrement doivent se désactiver (mais tu dois pouvoir continuer à naviguer/lire).
- [ ] **Connexion lente** : si tu es sur une connexion très lente (3G, ou en limitant volontairement le débit), un message "Toujours en cours..." doit apparaître si une action prend plus de quelques secondes.
- [ ] **Assistant IA temporairement indisponible** : si jamais un des écrans utilisant l'IA (devis, assistant Kōv) répond avec une erreur, tu dois pouvoir continuer à travailler manuellement (l'IA n'est jamais bloquante).

## 24. Test sur mobile spécifiquement

- [ ] Sur ton téléphone, vérifie que rien ne dépasse de l'écran horizontalement (pas de scroll latéral).
- [ ] Vérifie que tous les boutons sont assez grands pour être touchés facilement, même avec des gants si tu es sur un chantier.
- [ ] Vérifie que le bouton flottant "+" (nouveau devis) en bas de l'écran fonctionne bien.

## 25. Suppression de compte (à faire en dernier, uniquement sur ton compte de test)

- [ ] Va dans Profil → Supprimer mon compte.
- [ ] Vérifie qu'un message d'avertissement clair (irréversible) apparaît avant confirmation.
- [ ] Confirme la suppression — vérifie que tu es déconnecté et renvoyé vers l'écran de connexion, et que tu ne peux plus te reconnecter avec ce compte.

---

## Comment nous signaler un problème

Pour chaque problème trouvé, donne-nous si possible :
1. **L'écran concerné** (ex. "Fiche client", "Devis - étape Lignes du devis").
2. **Ce que tu as fait** juste avant (ex. "j'ai cliqué sur Archiver ce client").
3. **Ce qui s'est passé** vs **ce qui aurait dû se passer** selon toi.
4. **Une capture d'écran** si possible.

Merci pour ce test — c'est ce qui nous permet de livrer une application vraiment fiable avant la mise en ligne définitive.

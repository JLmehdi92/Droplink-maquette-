import { config } from "dotenv";

/**
 * AMORÇAGE GLOBAL DES SUITES QUI TOUCHENT LA BASE.
 *
 * Il s'exécute UNE FOIS par projet, avant tout fichier de test — donc avant
 * tout `beforeAll` susceptible d'échouer. C'est ce qui le rend fiable là où un
 * `afterAll` ne l'est pas : `afterAll` ne s'exécute pas quand la mise en place
 * a échoué, et c'est précisément dans ce cas qu'il reste des résidus.
 *
 * `globalSetup` tourne dans son propre contexte : les fichiers de `setupFiles`
 * n'y ont pas encore chargé l'environnement, il faut donc le charger ici.
 */
/*
 * MEME ORDRE QUE `charger-env` : la base de TESTS prime, `dotenv` ne remplace
 * pas ce qui est deja pose.
 */
config({ path: ".env.test.local", quiet: true });
config({ path: ".env.local", quiet: true });

/**
 * Au-delà de quoi on refuse de commencer, en octets.
 *
 * L'offre gratuite de Supabase plafonne à 500 Mo, et la base bascule alors en
 * LECTURE SEULE — sans avertissement, et avec un message qui ne dit rien de sa
 * cause (« Database error creating new user »). Le banc de mesure sème à lui
 * seul plusieurs centaines de mégaoctets ; démarrer à 300 Mo, c'est le
 * déclencher.
 */
const PLAFOND_BASE = 300 * 1024 * 1024;

export async function setup(projet?: { readonly name?: string }): Promise<void> {
  /*
   * ⚠️ AVANT TOUT LE RESTE, ET SURTOUT AVANT LA PURGE.
   *
   * La premiere chose que fait cet amorcage est d EFFACER : comptes de test,
   * parametres, battements, reservations d alerte. Lance par erreur sur la
   * production, il detruirait. La garde vient donc avant le premier `delete`,
   * pas apres — et elle echoue ferme, en refusant tout ce qui n est pas la
   * base de tests PROUVEE.
   */
  const { exigerBaseDeTests } = await import("./base-de-tests");
  await exigerBaseDeTests();

  const {
    purgerResidusDeTest,
    rendreLesParametresAuDefaut,
    effacerLesBattements,
    effacerLesReservationsDAlerte,
    signalerLesResidusDeVeille,
    tailleBase,
    rendreLEspace,
  } = await import("./purger-residus");
  await purgerResidusDeTest();
  await rendreLesParametresAuDefaut();
  // COMPTER AVANT D'EFFACER : sinon le remède masque la fuite qu'il répare.
  await signalerLesResidusDeVeille();
  await effacerLesBattements();
  await effacerLesReservationsDAlerte();

  /*
   * LE BANC DE MESURE RESTITUE À CHAQUE PASSAGE, sans condition de taille.
   *
   * ⚠️ LE SEUIL SEUL NE SUFFISAIT PAS, et c'est une mesure qui l'a dit. Le banc
   * a échoué sur `canceling statement due to statement timeout` alors que la
   * base occupait 153 Mo — bien SOUS le seuil de 300 Mo. Le seuil protège du
   * basculement en lecture seule ; il ne protège pas du RALENTISSEMENT. Après
   * restitution, la même suite est passée 13/13 sans autre changement.
   *
   * C'est le banc qui sème des centaines de milliers de lignes puis les efface,
   * donc c'est lui qui laisse le mort derrière lui : il le paie à l'entrée,
   * une dizaine de secondes, plutôt que de le léguer au passage suivant sous
   * la forme d'une panne qui désigne le mauvais coupable.
   */
  if (projet?.name === "perf") {
    const apres = await rendreLEspace();
    console.warn(`[banc] espace restitué — base à ${(apres / 1024 / 1024).toFixed(0)} Mo.`);
    return;
  }

  /*
   * ⚠️ SUPPRIMER NE REND PAS L'ESPACE, ET C'EST CE QUI A COÛTÉ DEUX INCIDENTS.
   *
   * La purge ci-dessus efface les lignes depuis toujours ; le disque, lui,
   * continuait de croître, parce qu'un `DELETE` laisse des lignes MORTES et
   * que seul un `VACUUM FULL` restitue l'espace au système. La base a donc
   * glissé jusqu'à 930 Mo le 21/08, puis 753 Mo le 30/08, et Supabase l'a
   * basculée en LECTURE SEULE les deux fois.
   *
   * Le mode de défaillance est celui qu'on redoute le plus ici : il ne casse
   * rien tant qu'il ne casse pas tout, et quand il casse, le symptôme désigne
   * le mauvais coupable — on cherche la régression dans les fichiers qu'on
   * vient de toucher.
   *
   * ON RÉCUPÈRE PLUTÔT QUE D'AVERTIR, et on ne récupère que si c'est
   * nécessaire : `VACUUM FULL` prend un verrou exclusif et coûte des secondes,
   * il n'a pas à être payé à chaque passage.
   */
  const avant = await tailleBase();
  if (avant > PLAFOND_BASE) {
    console.warn(
      `Base à ${(avant / 1024 / 1024).toFixed(0)} Mo — au-delà du seuil de ` +
        `${PLAFOND_BASE / 1024 / 1024} Mo. Restitution de l'espace en cours…`,
    );
    const apres = await rendreLEspace();
    console.warn(`Base ramenée à ${(apres / 1024 / 1024).toFixed(0)} Mo.`);

    // ET SI ÇA NE SUFFIT PAS, ON REFUSE DE COMMENCER. Lancer le banc à ce
    // stade le ferait échouer plus loin, sur un message qui ne dirait pas
    // pourquoi — et laisserait la base bloquée pour tout le reste.
    if (apres > PLAFOND_BASE) {
      throw new Error(
        `La base occupe encore ${(apres / 1024 / 1024).toFixed(0)} Mo après ` +
          `restitution. L'offre gratuite plafonne à 500 Mo et bascule en LECTURE ` +
          `SEULE au-delà, sans le dire. Purger avant de mesurer : ` +
          `\`pnpm purge:test --confirmer\`.`,
      );
    }
  }
}

/**
 * LE NETTOYAGE DE SORTIE — ET POURQUOI L'ENTRÉE NE SUFFISAIT PAS.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ LE 01/09/2026 PARCE QU'IL A MORDU. Quelques minutes
 * après la vérification du domaine d'envoi, une VRAIE alerte est arrivée dans
 * la boîte de Wassim : « Tâche en retard : veille-mutuelle, 301 minutes ».
 * Personne ne l'avait demandée, et elle était FAUSSE — `veille-mutuelle` n'a
 * jamais tourné, son battement de cinq heures était un résidu de suite.
 *
 * Le nettoyage n'avait lieu qu'à l'ENTRÉE. Entre deux exécutions, la base
 * gardait donc l'état laissé par la précédente : inoffensif tant que rien ne
 * pouvait partir, et transformé en alerte le jour où l'expéditeur a marché.
 *
 * ⚠️ CE N'EST PAS UN DÉTAIL D'HYGIÈNE. `scheduler_heartbeat` est GLOBALE et
 * l'ABSENCE de ligne y est l'information : elle distingue « jamais déployée »
 * d'« en retard », c'est-à-dire un CONSTAT d'une ALERTE. Un résidu déplace le
 * produit d'un état vers l'autre, et « une alerte qui se trompe est une alerte
 * qu'on apprend à ignorer ».
 *
 * L'ENTRÉE EST CONSERVÉE malgré tout : une exécution interrompue — Ctrl-C,
 * plantage — ne passe jamais par la sortie, et la suivante doit quand même
 * partir propre.
 */
export async function teardown(): Promise<void> {
  const { effacerLesBattements, effacerLesReservationsDAlerte } = await import("./purger-residus");
  await effacerLesBattements();
  await effacerLesReservationsDAlerte();
}

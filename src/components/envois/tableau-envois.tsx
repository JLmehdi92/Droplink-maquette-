import { getFormatter, getTranslations } from "next-intl/server";
import { decrireSilence } from "@/lib/tracking/silence";
import type { CompteursEnvois, Etat, PageEnvois, ParametresEnvois } from "@/lib/envois/liste";
import { ETATS, TRIS } from "@/lib/envois/liste";
import { LienEcran } from "@/components/lien-ecran";

/**
 * L'ÉCRAN DES ENVOIS, porté sur `Envois` et `EnvoisMobile`.
 *
 * TABLEAU DENSE AU BUREAU, LISTE DE CARTES AU TÉLÉPHONE — et c'est la largeur
 * qui décide, pas le contenu. Six colonnes dans 390 px se lisent à la loupe ou
 * se font défiler latéralement ; la carte reprend les mêmes six informations en
 * trois lignes, dans l'ordre où on les cherche.
 *
 * RENDU ENTIÈREMENT CÔTÉ SERVEUR, filtres et pagination en LIENS. Zéro octet de
 * bundle, et l'écran fonctionne sans JavaScript. Un fournisseur qui consulte ses
 * envois depuis un téléphone bas de gamme sur un réseau lent n'a pas à attendre
 * qu'un composant s'hydrate pour voir où en sont ses colis.
 *
 * LE CODE TRANSPORTEUR N'EST PAS AFFICHÉ. C'est un identifiant numérique du
 * fournisseur de suivi, et nous n'avons aucune table de correspondance vers un
 * nom lisible. Afficher « 3011 » n'apprendrait rien à personne ; inventer un
 * libellé serait pire. Une information qu'on ne sait pas rendre lisible est
 * omise — la même règle que sur la page publique.
 *
 * ⚠️ « RESYNCHRONISER » N'EST PAS PORTÉ, et c'est délibéré. Les deux planches
 * dessinent le bouton ; le produit n'a AUCUNE action de resynchronisation, et
 * en poser une reviendrait à déclencher des interrogations chez un fournisseur
 * de suivi qui facture À LA PRISE EN CHARGE et qui n'est pas encore choisi
 * (§14 du brief : le sujet est bloqué sur Wassim). Un bouton qui ne fait rien
 * serait un mensonge d'interface ; un bouton qui coûte à chaque clic sans
 * limite de débit serait pire.
 */

/** Construit un lien de filtre en conservant les autres paramètres. */
function lien(base: string, actuels: ParametresEnvois, modif: Record<string, string | null>): string {
  const p = new URLSearchParams();

  if (actuels.tri !== "immobiles") p.set("tri", actuels.tri);
  if (actuels.etat !== null) p.set("etat", actuels.etat);
  if (actuels.silencieux) p.set("silencieux", "oui");
  if (actuels.abandonnes !== null) p.set("abandonnes", actuels.abandonnes ? "oui" : "non");

  for (const [cle, valeur] of Object.entries(modif)) {
    if (valeur === null) p.delete(cle);
    else p.set(cle, valeur);
  }

  // LE CURSEUR EST TOUJOURS RETIRÉ QUAND UN FILTRE CHANGE. Le garder ferait
  // reprendre la nouvelle liste au milieu de l'ancienne : le vendeur cliquerait
  // « sans mouvement » et tomberait sur une page vide en concluant qu'il n'en a
  // aucun.
  if (!("curseur" in modif)) p.delete("curseur");

  const q = p.toString();
  return q === "" ? base : base + "?" + q;
}

const CARTE =
  "rounded-lg border border-outline-variant bg-surface-container-lowest p-4 lg:rounded-[18px]";

/**
 * LA PEAU DE CHAQUE ÉTAT, relevée sur les planches.
 *
 * `expedie` n'y figure pas : les maquettes ne montrent que quatre situations.
 * Il prend la peau du transit, parce qu'il décrit la même chose du point de vue
 * du vendeur — le colis est parti. Lui inventer une cinquième couleur aurait
 * ajouté un code à retenir sans ajouter une information.
 */
const PEAU: Readonly<Record<Etat, { fond: string; encre: string; pastille: string }>> = {
  preparation: { fond: "bg-fond-neutre", encre: "text-ardoise", pastille: "bg-gris-inactif" },
  expedie: { fond: "bg-violet-fond", encre: "text-violet-encre", pastille: "bg-violet" },
  en_transit: { fond: "bg-violet-fond", encre: "text-violet-encre", pastille: "bg-violet" },
  livre: { fond: "bg-succes-fond", encre: "text-succes", pastille: "bg-succes" },
};

const ALERTE = {
  fond: "bg-alerte-fond-vif",
  encre: "text-alerte",
  pastille: "bg-alerte-puce",
} as const;

function Puce({
  fond,
  encre,
  pastille,
  children,
}: {
  readonly fond: string;
  readonly encre: string;
  readonly pastille: string;
  readonly children: React.ReactNode;
}) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-[5px] rounded-full px-[9px] py-[3px] font-label-md text-[11px] font-semibold lg:gap-1.5 lg:px-2.5 lg:py-1 lg:text-[12px] " +
        fond +
        " " +
        encre
      }
    >
      <span className={"h-[5px] w-[5px] shrink-0 rounded-full lg:h-1.5 lg:w-1.5 " + pastille} />
      {children}
    </span>
  );
}

export async function TableauEnvois({
  base,
  parametres,
  page,
  compteurs,
  maintenant,
}: {
  readonly base: string;
  readonly parametres: ParametresEnvois;
  readonly page: PageEnvois;
  readonly compteurs: CompteursEnvois;
  readonly maintenant: Date;
}) {
  const t = await getTranslations("envois");
  const format = await getFormatter();

  const aUnFiltre =
    parametres.etat !== null || parametres.silencieux || parametres.abandonnes !== null;

  /*
   * ⚠️ LES COLONNES S'ÉCARTENT, ALORS QUE LA PLANCHE N'ÉCARTE RIEN.
   *
   * Son `.td` porte `padding: 15px 0` — aucune marge horizontale — et cela tient
   * parce que ses cinq lignes d'exemple sont courtes. Mesuré à 1 024 px sur de
   * vraies données : « COMMANDES LIÉESÉTAT » et « DERNIER MOUVEMENTDERNIER
   * POINT » se touchaient, exactement comme « CLIENTRÉFÉRENCESTATUT » sur la
   * liste des commandes. La dernière colonne ne prend rien : elle est alignée à
   * droite, sur le bord de la carte.
   */
  const enTete =
    "pb-3 pr-4 text-left font-label-sm text-[11px] leading-[14px] font-bold tracking-[0.05em] whitespace-nowrap text-gris-entete uppercase last:pr-0";
  const cellule =
    "border-t border-filet-ligne py-[15px] pr-4 font-body-md text-[14px] last:pr-0";

  const pilule = (actif: boolean): string =>
    "inline-flex min-h-9 items-center rounded-full px-3 font-label-md text-[13px] font-semibold transition-colors " +
    (actif
      ? "bg-violet-fond text-violet-encre"
      : "text-on-surface-variant hover:bg-surface-container-low");

  /**
   * Tout ce qu'une ligne dit de son colis, calculé UNE FOIS et servi aux deux
   * mises en page. Le tableau et les cartes montrent la même chose ; deux
   * calculs divergeraient au premier ajustement.
   */
  const decrire = (ligne: PageEnvois["lignes"][number]) => {
    const silence = decrireSilence(
      ligne.dernierMouvement === null ? null : new Date(ligne.dernierMouvement),
      maintenant,
    );
    const silencieux = silence.etat === "silencieux";

    const anciennete =
      silence.etat === "aucun-mouvement"
        ? null
        : silencieux
          ? // AU-DELÀ DE DIX JOURS, LE RELATIF CESSE D'AIDER. « il y a 14 jours »
            // se relit moins bien qu'une date, et c'est justement le colis sur
            // lequel le vendeur va devoir écrire au transporteur.
            format.dateTime(new Date(ligne.dernierMouvement as string), {
              day: "numeric",
              month: "long",
            })
          : silence.jours === 0
            ? t("mouvement.aujourdhui")
            : silence.jours === 1
              ? t("mouvement.hier")
              : t("mouvement.jours", { n: silence.jours });

    return {
      silence,
      silencieux,
      anciennete,
      // Deux noms puis « +N ». Le compte reste celui des commandes rattachées,
      // pas celui des noms : une commande sans destinataire nommé existe quand
      // même.
      clients:
        ligne.clients.length === 0
          ? null
          : ligne.clients.slice(0, 2).join(", ") +
            (ligne.commandes > 2 ? " +" + String(ligne.commandes - 2) : ""),
      puce: silencieux ? (
        <Puce {...ALERTE}>{t("puce.silence", { n: silence.jours })}</Puce>
      ) : (
        <Puce {...PEAU[ligne.etat]}>{t(`etat.${ligne.etat}`)}</Puce>
      ),
    };
  };

  return (
    <div className="flex flex-col gap-2.5 lg:gap-5">
      {/*
        LES QUATRE COMPTEURS DE TÊTE. Ils portent leur VALEUR, jamais un
        jugement : « 4 sans mouvement depuis plus de dix jours », pas « des colis
        sont en retard ». Un chiffre se vérifie, une appréciation se discute.

        LE TROISIÈME EST EN ALERTE, les autres non — c'est le seul qui appelle un
        geste. Peindre les quatre reviendrait à n'en peindre aucun.

        DEUX AU TÉLÉPHONE, QUATRE AU BUREAU : la planche `EnvoisMobile` ne garde
        que « En transit » et « Sans mouvement ». Le total est déjà sous le titre
        et « livrés ce mois » ne se regarde pas depuis un téléphone.
      */}
      <section
        aria-label={t("compteurs.titre")}
        className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3"
      >
        {(
          [
            { cle: "total", valeur: compteurs.total, filtre: {}, alerte: false, mobile: false },
            {
              cle: "enTransit",
              valeur: compteurs.enTransit,
              filtre: { etat: "en_transit" },
              alerte: false,
              mobile: true,
            },
            {
              cle: "silencieux",
              valeur: compteurs.silencieux,
              filtre: { silencieux: "oui" },
              alerte: true,
              mobile: true,
            },
            {
              cle: "livresCeMois",
              valeur: compteurs.livresCeMois,
              filtre: { etat: "livre" },
              alerte: false,
              mobile: false,
            },
          ] as const
        ).map((c) => (
          <LienEcran
            key={c.cle}
            href={lien(base, parametres, {
              etat: null,
              silencieux: null,
              abandonnes: null,
              ...c.filtre,
            })}
            className={
              "rounded-lg border p-4 transition-colors lg:rounded-lg lg:px-5 lg:py-[18px] " +
              (c.alerte
                ? "border-alerte-filet bg-alerte-fond hover:bg-alerte-fond-doux"
                : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low") +
              (c.mobile ? "" : " hidden lg:block")
            }
          >
            <p
              className={
                "mb-1.5 font-body-sm text-[12px] " +
                (c.alerte ? "text-alerte" : "text-on-surface-variant")
              }
            >
              {t(`compteurs.${c.cle}`)}
            </p>
            <p
              className={
                "font-headline-lg text-[24px] leading-[30px] font-extrabold tracking-[-0.03em] lg:text-[26px] lg:leading-8 " +
                (c.alerte ? "text-alerte" : "text-on-surface")
              }
            >
              {format.number(c.valeur)}
            </p>
          </LienEcran>
        ))}
      </section>

      {/*
        LES FILTRES FINS.

        ⚠️ AUCUNE DES DEUX PLANCHES NE LES DESSINE, et ils sont conservés. Les
        compteurs filtrent déjà — c'est ce que la planche exploite — mais ils ne
        couvrent ni « expédié » ni « en préparation », ni aucun des trois tris.
        Les retirer aurait rendu l'écran conforme en lui ôtant ce qui le rend
        utile à qui a neuf mille colis.
      */}
      <section aria-label={t("filtres.titre")} className={CARTE + " lg:px-5 lg:py-4"}>
        <div className="defilement-discret -mx-1 flex items-center gap-1.5 overflow-x-auto px-1">
          <span className="shrink-0 pr-1 font-label-md text-[12px] font-bold text-gris-entete uppercase">
            {t("filtres.etat")}
          </span>
          <LienEcran
            href={lien(base, parametres, { etat: null, silencieux: null })}
            aria-current={parametres.etat === null && !parametres.silencieux ? "true" : undefined}
            className={pilule(parametres.etat === null && !parametres.silencieux) + " shrink-0"}
          >
            {t("filtres.tous")}
          </LienEcran>
          {ETATS.map((etat: Etat) => (
            <LienEcran
              key={etat}
              href={lien(base, parametres, { etat, silencieux: null })}
              aria-current={parametres.etat === etat ? "true" : undefined}
              className={pilule(parametres.etat === etat) + " shrink-0"}
            >
              {t(`etat.${etat}`)}
            </LienEcran>
          ))}
        </div>

        <div className="defilement-discret -mx-1 mt-2.5 flex items-center gap-1.5 overflow-x-auto border-t border-filet-ligne px-1 pt-2.5">
          <span className="shrink-0 pr-1 font-label-md text-[12px] font-bold text-gris-entete uppercase">
            {t("filtres.tri")}
          </span>
          {TRIS.map((tri) => (
            <LienEcran
              key={tri}
              href={lien(base, parametres, { tri: tri === "immobiles" ? "" : tri })}
              aria-current={parametres.tri === tri ? "true" : undefined}
              className={pilule(parametres.tri === tri) + " shrink-0"}
            >
              {t(`tri.${tri}`)}
            </LienEcran>
          ))}
        </div>
      </section>

      {page.lignes.length === 0 ? (
        /* DEUX ÉTATS VIDES DISTINCTS. « Ce compte n'a rien » et « ce filtre ne
           rend rien » sont deux situations différentes : afficher « collez votre
           premier numéro de suivi » à un vendeur qui en a neuf mille est une
           perte de confiance immédiate. */
        <div className={CARTE + " px-5 py-10 text-center"}>
          <p className="font-body-md text-[14px] leading-5 text-on-surface-variant">
            {aUnFiltre ? t("vide.filtre") : t("vide.compte")}
          </p>
          {aUnFiltre ? (
            <LienEcran
              href={base}
              className="mt-3 inline-flex min-h-11 items-center font-label-md text-[14px] font-semibold text-on-surface underline"
            >
              {t("vide.effacer")}
            </LienEcran>
          ) : null}
        </div>
      ) : (
        <>
          {/* --- LE TABLEAU, à partir de `lg` ---------------------------- */}
          <div className={"hidden xl:block " + CARTE + " xl:px-[22px] xl:py-5"}>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={enTete}>
                    {t("colonnes.numero")}
                  </th>
                  <th scope="col" className={enTete}>
                    {t("colonnes.commandes")}
                  </th>
                  <th scope="col" className={enTete}>
                    {t("colonnes.etat")}
                  </th>
                  <th scope="col" className={enTete}>
                    {t("colonnes.mouvement")}
                  </th>
                  <th scope="col" className={enTete}>
                    {t("colonnes.point")}
                  </th>
                  <th scope="col" className={enTete + " text-right"}>
                    {t("colonnes.interrogations")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.lignes.map((ligne) => {
                  const d = decrire(ligne);
                  return (
                    <tr key={ligne.id} className={d.silencieux ? "bg-alerte-fond-doux" : undefined}>
                      <td className={cellule + " font-mono text-[13px] font-semibold text-on-surface"}>
                        {ligne.numero}
                        {ligne.abandonneLe !== null ? (
                          /* ON DIT QUE NOUS AVONS CESSÉ D'INTERROGER, pas que le
                             colis est perdu. La différence compte : l'un est un
                             fait sur nous, l'autre une affirmation sur le colis
                             que nous ne pouvons pas soutenir. */
                          <span className="ml-2 rounded-full bg-fond-neutre px-2 py-0.5 font-label-md text-[11px] font-semibold text-ardoise">
                            {t("abandonne")}
                          </span>
                        ) : null}
                      </td>
                      <td className={cellule + " text-on-surface"}>
                        {d.clients ?? (
                          <span className="text-on-surface-variant">
                            {t("commandesRattachees", { n: ligne.commandes })}
                          </span>
                        )}
                      </td>
                      <td className={cellule}>{d.puce}</td>
                      <td
                        className={
                          cellule +
                          " whitespace-nowrap " +
                          (d.silencieux ? "font-semibold text-alerte" : "text-on-surface-variant")
                        }
                      >
                        {d.anciennete ?? "—"}
                      </td>
                      <td
                        className={
                          cellule + " " + (ligne.dernierPoint === null ? "text-on-surface-variant" : "text-on-surface")
                        }
                      >
                        {ligne.dernierPoint ?? t("mouvement.aucun")}
                      </td>
                      <td className={cellule + " text-right text-on-surface-variant"}>
                        {format.number(ligne.interrogations)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <BandeauAide texte={t("aide")} />
          </div>

          {/* --- LES CARTES, en dessous de `lg` -------------------------- */}
          <ul className="flex flex-col gap-2.5 xl:hidden">
            {page.lignes.map((ligne) => {
              const d = decrire(ligne);
              return (
                <li
                  key={ligne.id}
                  className={
                    "rounded-lg border p-4 " +
                    (d.silencieux
                      ? "border-alerte-filet bg-alerte-fond-doux"
                      : "border-outline-variant bg-surface-container-lowest")
                  }
                >
                  <div className="mb-[9px] flex items-center justify-between gap-2.5">
                    <span className="truncate font-mono text-[13px] font-semibold text-on-surface">
                      {ligne.numero}
                    </span>
                    {d.puce}
                  </div>
                  <p
                    className={
                      "mb-[3px] font-body-md text-[14px] leading-5 " +
                      (ligne.dernierPoint === null ? "text-on-surface-variant" : "text-on-surface")
                    }
                  >
                    {ligne.dernierPoint ?? t("mouvement.aucun")}
                  </p>
                  {/* LES TROIS FAITS SECONDAIRES SUR UNE SEULE LIGNE, séparés par
                      des points médians : c'est ce que fait la planche, et cela
                      évite trois libellés pour trois valeurs courtes. */}
                  <p className="font-body-sm text-[12px] text-on-surface-variant">
                    {[
                      // LE COMPTE PREND LE RELAIS DES NOMS, comme dans le
                      // tableau : une commande sans destinataire nommé existe,
                      // et la carte ne doit pas la faire disparaître.
                      d.clients ?? t("commandesRattachees", { n: ligne.commandes }),
                      d.anciennete,
                      t("interrogationsFaites", { n: ligne.interrogations }),
                      ligne.abandonneLe !== null ? t("abandonne") : null,
                    ]
                      .filter((v): v is string => v !== null)
                      .join(" · ")}
                  </p>
                </li>
              );
            })}

            <li>
              <BandeauAide texte={t("aideCourte")} encadre />
            </li>
          </ul>
        </>
      )}

      {page.curseurSuivant !== null ? (
        <LienEcran
          href={lien(base, parametres, { curseur: page.curseurSuivant })}
          className="mx-auto inline-flex min-h-11 items-center rounded-[11px] border border-filet-controle px-6 font-label-md text-[14px] font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
        >
          {t("pageSuivante")}
        </LienEcran>
      ) : null}
    </div>
  );
}

/**
 * LE BANDEAU D'AIDE, EN PIED DE LISTE.
 *
 * Il existe pour une seule phrase, et cette phrase évite un message au support :
 * un numéro tout juste collé n'est pas encore scanné, et l'écran affiche alors
 * « Pas encore d'information du transporteur ». Sans explication, cette ligne se
 * lit comme une panne du suivi — décision 7 du brief, dans sa forme la plus
 * concrète.
 */
function BandeauAide({ texte, encadre = false }: { readonly texte: string; readonly encadre?: boolean }) {
  return (
    <div
      className={
        "mt-4 flex items-start gap-2.5 rounded-[12px] px-3.5 py-3 lg:mt-[18px] " +
        (encadre
          ? "mt-0 border border-outline-variant bg-surface-container-lowest"
          : "bg-surface-container-low")
      }
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="mt-px shrink-0 text-sourdine"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <span className="font-body-sm text-[12px] leading-[18px] text-on-surface-variant">
        {texte}
      </span>
    </div>
  );
}

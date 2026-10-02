import Link from "next/link";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { ArrowLeft, Globe } from "lucide-react";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { EncartTrace } from "@/components/admin/encart-trace";
import { AvatarCompte } from "@/components/admin/briques-admin";
import { TuileVolume, Tuiles } from "@/components/admin/tuile-volume";
import { RESEAUX } from "@/components/publique/reseaux-vendeur";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import {
  compterDoublons,
  listerDoublons,
  valeurLisible,
  type GenreIdentifiant,
  type GroupeDoublon,
} from "@/lib/audit/doublons";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI : Next évalue les métadonnées en parallèle du rendu, et un titre
  // posé sans elle partirait dans le corps du 404 servi à qui n'a pas les droits.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("doublons.titre"), robots: { index: false, follow: false } };
}

/** Le logo officiel du réseau (les tracés de la page client), ou un globe pour le site. */
function Symbole({ genre }: { readonly genre: GenreIdentifiant }) {
  const reseau = RESEAUX.find((r) => r.clef === genre);
  if (genre === "site" || reseau === undefined) {
    return <Globe aria-hidden="true" className="ic" />;
  }
  return (
    <svg aria-hidden="true" className="ic" viewBox="0 0 24 24" fill="currentColor">
      <path d={reseau.trace} />
    </svg>
  );
}

/**
 * LES COMPTES EN DOUBLON (migration 170).
 *
 * Décision de Wassim, 20/09/2026. L'écran dit un FAIT — ces comptes affichent le même
 * identifiant — jamais qu'il s'agit de la même personne ; il n'agit sur rien. Son ouverture
 * écrit UNE entrée au journal (`comptes.doublons`), dans la même transaction que la lecture.
 */
export default async function PageDoublons({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  // 404 sans jamais revenir si l'appelant n'est pas administrateur ACTIF — jamais 403.
  await exigerAdmin();

  const supabase = await creerClientServeur();
  const [groupes, nombres] = await Promise.all([
    listerDoublons(supabase, await empreinteAdmin()),
    compterDoublons(supabase),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const base = `/${langue}/admin/comptes`;

  /* « EN BREF » DÉCRIT CE QUI EST AFFICHÉ. Au-delà de 100 identifiants, la phrase du plafond
     dit le total ; les trois nombres restent ceux des cartes qu'on a sous les yeux. */
  const comptes = new Set(groupes.flatMap((g) => g.comptes.map((c) => c.id)));
  const suspendus = new Set(
    groupes.flatMap((g) => g.comptes.filter((c) => c.statut === "suspended").map((c) => c.id)),
  );

  const carte = (g: GroupeDoublon) => (
    <section key={g.genre + ":" + g.valeur} className="bloc adm-bloc" aria-label={t(`doublons.genres.${g.genre}`) + " " + valeurLisible(g)}>
      <header className="bloc__tete">
        <div>
          {/* LA VALEUR N'EST JAMAIS COUPÉE : c'est elle qu'on juge. Un fait
              (« même identifiant »), jamais « même personne ». */}
          <h2 className="inline-flex items-center gap-2 [overflow-wrap:anywhere]">
            <Symbole genre={g.genre} />
            {t(`doublons.genres.${g.genre}`)} · {valeurLisible(g)}
          </h2>
        </div>
        <span className="adm-periode">{t("doublons.nombreComptes", { n: g.comptes.length })}</span>
      </header>
      <div className="adm-defil">
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">{t("doublons.colCompte")}</th>
              <th scope="col">{t("doublons.colStatut")}</th>
              <th scope="col">{t("doublons.colInscription")}</th>
              <th scope="col">{t("doublons.colCommandes")}</th>
              <th scope="col">
                <span className="sr">{t("comptes.colonnes.action")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {g.comptes.map((c) => (
              <tr key={c.id}>
                <td>
                  {/* L'ADRESSE N'EST JAMAIS COUPÉE : « lea.m@… » et
                      « lea.modeaddict@… » ne diffèrent que par ce qu'une ellipse
                      cacherait. */}
                  <span className="adm-qui">
                    <AvatarCompte email={c.email} nom={c.boutique} />
                    <span>
                      <b>{c.email}</b>
                      <small>{c.boutique === null ? <span className="adm-sourdine">{t("comptes.sansNom")}</span> : c.boutique}</small>
                    </span>
                  </span>
                </td>
                <td>
                  <span className="adm-badge" data-statut={c.statut}>
                    <i aria-hidden="true" />
                    {t(`comptes.statuts.${c.statut}`)}
                  </span>
                </td>
                <td className="adm-date">{format.dateTime(new Date(c.inscritLe), { dateStyle: "medium" })}</td>
                <td className="adm-nb">{format.number(c.commandes)}</td>
                <td>
                  <Link prefetch={false} href={`${base}/${c.id}`} aria-label={t("doublons.voirLong", { email: c.email })} className="bouton-outil adm-ouvrir">
                    {t("doublons.voir")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <main id="contenu" className="tableau adm">
      <EnTeteAdmin
        titre={t("doublons.titre")}
        sousTitre={t("doublons.sousTitre")}
        fil={[{ href: base, libelle: t("comptes.titre") }, { libelle: t("doublons.titre") }]}
      >
        {/* Un LIEN vers la liste, pas un retour d'historique : on arrive ici aussi
            par l'adresse directe. */}
        <Link prefetch={false} href={base} className="bouton-outil">
          <ArrowLeft aria-hidden="true" className="ic" />
          {t("doublons.retour")}
        </Link>
      </EnTeteAdmin>
      <EncartTrace texte={t("doublons.trace")} />

      {/* « EN BREF » DÉCRIT CE QUI EST AFFICHÉ : au-delà de 100 identifiants, la
          phrase du plafond dit le total. */}
      <Tuiles etiquette={t("doublons.enBref")} colonnes={3}>
        <TuileVolume libelle={t("doublons.identifiants")} valeur={format.number(groupes.length)} />
        <TuileVolume libelle={t("doublons.concernes")} valeur={format.number(comptes.size)} />
        <TuileVolume ton={suspendus.size > 0 ? "erreur" : undefined} libelle={t("doublons.suspendus")} valeur={format.number(suspendus.size)} />
      </Tuiles>

      <div className="adm-rangee adm-rangee--liste">
        <div className="adm-colonne">
          {nombres.identifiants > groupes.length ? <p className="adm-aide">{t("doublons.plafond", { total: nombres.identifiants })}</p> : null}
          {groupes.length === 0 ? (
            <section className="bloc adm-bloc">
              <p className="adm-vide">{t("doublons.vide")}</p>
            </section>
          ) : (
            groupes.map(carte)
          )}
        </div>
        <section className="bloc adm-bloc" aria-labelledby="doublons-regles">
          <header className="bloc__tete">
            <div>
              <h2 id="doublons-regles">{t("doublons.reglesTitre")}</h2>
            </div>
          </header>
          <dl className="adm-regles">
            {(["reseaux", "whatsapp", "site", "decision"] as const).map((cle) => (
              <div key={cle}>
                <dt>{t(`doublons.regles.${cle}Q`)}</dt>
                <dd>{t(`doublons.regles.${cle}R`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}

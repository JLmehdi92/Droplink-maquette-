import { Changeant } from "@/components/app/changeant";
import { ValeurRoulee } from "@/components/app/couche-v4";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  Archive,
  ArrowUpDown,
  ChartColumn,
  ChevronRight,
  CircleCheck,
  CircleX,
  Copy,
  ImageMinus,
  Images,
  Link2,
  Package,
  Palette,
  Plus,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { LienEcran } from "@/components/lien-ecran";
import { creerBrouillon } from "@/lib/commandes/actions";
import { referenceCourte } from "@/lib/commandes/reference";
import { decrireSilence } from "@/lib/tracking/silence";
import { lireTransporteur } from "@/lib/tracking/transporteurs";
import type { LigneCommande } from "@/lib/commandes/liste";
import type { CompteursEnvois } from "@/lib/envois/liste";
import { etatPanneauQc, type Activite, type CommandeConsultee, type PartTransporteur } from "@/lib/analyses/activite";
import type { FaitRecent } from "@/lib/analyses/recente";
import type { TypeEvenement } from "@/lib/commandes/journal";

/** Le taux d'approbation, arrondi vers le bas : 199 sur 200 ne s'affiche jamais « 100 % ». */
function tauxQc(approuve: number, repondu: number, format: Awaited<ReturnType<typeof getFormatter>>): string {
  return format.number(Math.floor((approuve / repondu) * 100) / 100, { style: "percent" });
}

/*
 * LES BLOCS DU TABLEAU DE BORD DE LA REFONTE (maquette, `tableau.html`) : des
 * filets plutôt que des cartes, un titre de 14 px, un lien « Voir tout ».
 * Chaque bloc rend une lecture que l'écran fait réellement ; une lecture échouée
 * rend « illisible pour l'instant », jamais zéro (`BlocIndisponible`).
 */

export const DERNIERES_COMMANDES = 5;

function TeteBloc({
  id,
  titre,
  lien,
  meta,
}: {
  readonly id: string;
  readonly titre: string;
  readonly lien?: { readonly href: string; readonly libelle: string };
  readonly meta?: string;
}) {
  return (
    <header className="bloc__tete">
      <h2 id={id}>{titre}</h2>
      {meta === undefined ? null : (
        <p className="bloc__meta">
          <ValeurRoulee texte={meta} />
        </p>
      )}
      {lien === undefined ? null : (
        <LienEcran className="bloc__lien" href={lien.href}>
          {lien.libelle}
          <ChevronRight aria-hidden="true" className="ic" />
        </LienEcran>
      )}
    </header>
  );
}

/** Une lecture qui a échoué se dit illisible : « aucune donnée » serait faux. */
export async function BlocIndisponible({ titre }: { readonly titre: string }) {
  const t = await getTranslations("analyses");
  return (
    <section className="bloc v4-carte">
      <header className="bloc__tete">
        <h2>{titre}</h2>
      </header>
      <p className="bloc__vide">{t("indisponible")}</p>
    </section>
  );
}

/* ---------- dernières commandes ---------- */
export async function DernieresCommandesBloc({
  commandes,
  langue,
}: {
  readonly commandes: readonly LigneCommande[];
  readonly langue: string;
}) {
  const t = await getTranslations("tableau");
  const tc = await getTranslations("commandes");
  const format = await getFormatter();
  const maintenant = new Date();
  return (
    <section className="bloc v4-carte" aria-labelledby="t-dernieres">
      <TeteBloc
        id="t-dernieres"
        titre={t("dernieres.titre")}
        lien={{ href: `/${langue}/commandes`, libelle: t("dernieres.voirTout") }}
      />
      {commandes.length === 0 ? (
        <p className="bloc__vide">{t("dernieres.vide")}</p>
      ) : (
        <ul className="dernieres">
            {commandes.map((c) => {
              const silence = decrireSilence(c.colisBougeLe === null ? null : new Date(c.colisBougeLe), maintenant, c.statut);
              const [libelle, ton] =
                silence.etat === "silencieux"
                  ? [t("silenceJours", { n: silence.jours }), "silence"]
                  : [tc(`statut.${c.statut}`), c.statut === "livre" ? "livre" : c.statut === "preparation" ? "attente" : "transit"];
              return (
                <li key={c.id}>
                  <LienEcran href={`/${langue}/commandes/${c.id}`} className="derniere">
                    {c.vignettes[0] === undefined ? (
                      <span className="derniere__vide" aria-hidden="true">
                        <Images className="ic" />
                      </span>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element --
                         URL signée à expiration : `next/image` la servirait encore
                         après l'expiration de sa signature. */
                      <img src={c.vignettes[0]} alt="" width={36} height={36} loading="lazy" decoding="async" />
                    )}
                    <span className="derniere__qui">
                      <b>{c.client ?? t("dernieres.sansNom")}</b>
                      <small>
                        {referenceCourte(c.id)} ·{" "}
                        {format.relativeTime(new Date(c.modifieeLe), { now: maintenant, style: "long" })}
                      </small>
                    </span>
                    <span className="badge" data-ton={ton}>
                      {libelle}
                    </span>
                  </LienEcran>
                </li>
              );
            })}
          </ul>
      )}
    </section>
  );
}

/* ---------- actions rapides ---------- */
export async function ActionsRapidesBloc({ langue }: { readonly langue: string }) {
  const t = await getTranslations("tableau.actions");
  const tc = await getTranslations("commandes");
  const liens: ReadonlyArray<{ href: string; libelle: string; Icone: LucideIcon }> = [
    { href: `/${langue}/marque`, libelle: t("marque"), Icone: Palette },
    { href: `/${langue}/envois`, libelle: t("envois"), Icone: Truck },
    { href: `/${langue}/analyses`, libelle: t("analyses"), Icone: ChartColumn },
  ];
  return (
    <section className="bloc v4-carte" aria-labelledby="t-actions">
      <TeteBloc id="t-actions" titre={t("titre")} />
      <ul className="actions-rapides">
        <li>
          {/* Créer une commande est une Server Action, pas un lien : le brouillon
              naît en base, puis l'éditeur s'ouvre. */}
          <form action={creerBrouillon}>
            <input type="hidden" name="langue" value={langue} />
            <button type="submit" className="actions-rapides__bouton">
              <Plus aria-hidden="true" className="ic" />
              {tc("nouvelle")}
              <ChevronRight aria-hidden="true" className="ic" />
            </button>
          </form>
        </li>
        {liens.map(({ href, libelle, Icone }) => (
          <li key={href}>
            <LienEcran href={href}>
              <Icone aria-hidden="true" className="ic" />
              {libelle}
              <ChevronRight aria-hidden="true" className="ic" />
            </LienEcran>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- répartition des statuts ---------- */
export async function RepartitionBloc({
  compteurs,
  variante = "tableau",
}: {
  readonly compteurs: CompteursEnvois;
  /** Aux Analyses, le total s'écrit en grand au-dessus de la barre (maquette, `.total-colis`). */
  readonly variante?: "tableau" | "analyses";
}) {
  const t = await getTranslations("analyses");
  const tt = await getTranslations("tableau");
  const format = await getFormatter();
  /* Chaque part porte aussi son libellé et sa valeur : jamais la couleur seule.
     ⚠️ QUATRE STATUTS QUI NE SE CHEVAUCHENT PAS. La maquette empile « Sans
     mouvement » comme une cinquième part ; dans le produit c'est un FILTRE posé
     sur les autres (un colis en transit peut se taire) : l'empiler compterait ce
     colis deux fois. Il est dit à part, sous la légende. */
  const parts = [
    { cle: "transit", libelle: t("colis.enTransit"), valeur: compteurs.enTransit },
    { cle: "expedie", libelle: t("colis.expedie"), valeur: compteurs.expedie },
    { cle: "livre", libelle: t("colis.livre"), valeur: compteurs.livre },
    { cle: "attente", libelle: t("colis.preparation"), valeur: compteurs.preparation },
  ] as const;
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  return (
    <section className="bloc v4-carte" aria-labelledby="t-colis">
      <TeteBloc
        id="t-colis"
        titre={t("colis.titre")}
        {...(variante === "tableau" ? { meta: tt("colisTotal", { n: compteurs.total }) } : {})}
      />
      <p className="bloc__aide">{t("colis.aide")}</p>
      {variante === "analyses" && total > 0 ? (
        <p className="reponses__taux total-colis">
          <b>
            <ValeurRoulee texte={format.number(compteurs.total)} />
          </b>
          <span>{t("colis.suivis", { n: compteurs.total })}</span>
        </p>
      ) : null}
      {total === 0 ? (
        <p className="bloc__vide">{t("colis.vide")}</p>
      ) : (
        <div className={variante === "analyses" ? "envois envois--colis" : "envois"}>
          <BarreEtLegende parts={parts} total={total} />
          {compteurs.silencieux > 0 ? (
            <p className="legende__silence">
              <i style={{ background: "var(--st-silence)" }} />
              {t("colis.dontSilencieux", { n: compteurs.silencieux })}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** La barre empilée et sa légende (maquette, `barreEtLegende`) : chaque part
    porte son libellé, sa valeur et sa proportion — jamais la couleur seule. */
async function BarreEtLegende({
  parts,
  total,
}: {
  readonly parts: ReadonlyArray<{ readonly cle: string; readonly libelle: string; readonly valeur: number }>;
  readonly total: number;
}) {
  const format = await getFormatter();
  return (
    <>
      <div className="empile" role="img" aria-label={parts.map((p) => `${p.libelle} : ${p.valeur}`).join(", ")}>
        {parts
          .filter((p) => p.valeur > 0)
          .map((p) => (
            <i key={p.cle} style={{ flexGrow: p.valeur, background: `var(--st-${p.cle})` }} />
          ))}
      </div>
      <ul className="legende">
        {parts.map((p) => (
          <li key={p.cle}>
            <i style={{ background: `var(--st-${p.cle})` }} />
            <span>{p.libelle}</span>
            <b>{format.number(p.valeur)}</b>
            <small>{format.number(p.valeur / total, { style: "percent" })}</small>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---------- les commandes les plus consultées (Analyses) ---------- */
export async function ConsulteesBloc({
  commandes,
  langue,
}: {
  readonly commandes: readonly CommandeConsultee[];
  readonly langue: string;
}) {
  const t = await getTranslations("analyses");
  const format = await getFormatter();
  const max = Math.max(1, ...commandes.map((c) => c.vues));
  return (
    <section className="bloc v4-carte" aria-labelledby="t-consultees">
      <TeteBloc id="t-consultees" titre={t("consultees.titre")} />
      <p className="bloc__aide">{t("consultees.aide")}</p>
      {commandes.length === 0 ? (
        <p className="bloc__vide">{t("consultees.vide")}</p>
      ) : (
        <ol className="consultees">
          {commandes.map((c, i) => (
            <li key={c.id}>
              <LienEcran className="consultee" href={`/${langue}/commandes/${c.id}`}>
                <span className="consultee__rang">{i + 1}</span>
                {c.vignette === null ? (
                  <span className="vignette-vide" style={{ width: 40, height: 40 }} aria-hidden="true">
                    <Images className="ic" />
                  </span>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element --
                     URL signée à expiration : `next/image` la resservirait après. */
                  <img src={c.vignette} alt="" width={40} height={40} loading="lazy" decoding="async" />
                )}
                <span className="consultee__qui">
                  <b>{c.client?.trim() ? c.client : t("consultees.sansNom")}</b>
                  <small>{referenceCourte(c.id)}</small>
                </span>
                <span className="consultee__vues">
                  <b>{format.number(c.vues)}</b>
                  <small>{t("consultees.vues", { n: c.vues })}</small>
                </span>
                <i className="consultee__barre" style={{ "--p": c.vues / max } as React.CSSProperties} aria-hidden="true" />
              </LienEcran>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ---------- les réponses des clients (Analyses) ----------
   Le taux porte sur ce qui a été RÉPONDU (approuvé + refusé), jamais sur tout :
   une commande sans réponse n'est pas un refus. Le gris sépare le vert du rouge. */
export async function ReponsesBloc({ activite }: { readonly activite: Activite | null }) {
  const t = await getTranslations("analyses");
  const format = await getFormatter();
  // L'état du panneau vient de la règle testée (`etatPanneauQc`), jamais d'un recalcul ici.
  const etat = etatPanneauQc(activite);
  const total = etat.etat === "parts" ? etat.total : 0;
  const repondu = activite === null ? 0 : activite.qcApprouve + activite.qcRefuse;
  return (
    <section className="bloc v4-carte" aria-labelledby="t-qc">
      <TeteBloc id="t-qc" titre={t("qc.titre")} />
      <p className="bloc__aide">{t("qc.aide")}</p>
      {etat.etat === "indisponible" || activite === null ? (
        <p className="bloc__vide">{t("indisponible")}</p>
      ) : etat.etat === "vide" ? (
        <p className="bloc__vide">{t("qc.vide")}</p>
      ) : (
        <div className="reponses">
          <p className="reponses__taux">
            {/* Aucune réponse encore : « — », jamais « 0 % », qui dirait un refus. */}
            <b>
              {repondu === 0 ? (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="visuellement-cache">{t("qc.aucuneReponse")}</span>
                </>
              ) : (
                // Arrondi vers le bas : 199 sur 200 ne s'affiche jamais « 100 % ». Il roule
                // au premier chargement et se fond au changement de période (maquette).
                <Changeant cle={tauxQc(activite.qcApprouve, repondu, format)}>
                  <ValeurRoulee texte={tauxQc(activite.qcApprouve, repondu, format)} />
                </Changeant>
              )}
            </b>
            <span>
              {t("qc.tauxTexte")}
              <small>{t("reponsesSur", { n: repondu, total })}</small>
            </span>
          </p>
          <div data-parts="">
            <BarreEtLegende
              parts={[
                { cle: "livre", libelle: t("qc.approuve"), valeur: activite.qcApprouve },
                { cle: "attente", libelle: t("qc.enAttente"), valeur: activite.qcEnAttente },
                { cle: "refus", libelle: t("qc.refuse"), valeur: activite.qcRefuse },
              ]}
              total={total}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- transporteurs ---------- */
const LIGNES_TRANSPORTEURS = 5;
export async function TransporteursBloc({
  parts,
  voirTout,
}: {
  readonly parts: readonly PartTransporteur[];
  /** Le lien vers les envois (tableau de bord) ; les Analyses n'en portent pas. */
  readonly voirTout?: string;
}) {
  const t = await getTranslations("analyses");
  const format = await getFormatter();
  const nommees = parts.map((p) => ({
    nom: (p.code === null ? null : lireTransporteur(p.code)?.nom) ?? t("transporteurs.inconnu"),
    nombre: p.nombre,
  }));
  const tete = nommees.slice(0, LIGNES_TRANSPORTEURS);
  const reste = nommees.slice(LIGNES_TRANSPORTEURS).reduce((s, p) => s + p.nombre, 0);
  const lignes = reste === 0 ? tete : [...tete, { nom: t("transporteurs.autres"), nombre: reste }];
  const total = lignes.reduce((s, l) => s + l.nombre, 0);
  const maximum = lignes.reduce((m, l) => Math.max(m, l.nombre), 0);
  return (
    <section className="bloc v4-carte" aria-labelledby="t-transp">
      <TeteBloc
        id="t-transp"
        titre={t("transporteurs.titre")}
        {...(voirTout === undefined ? {} : { lien: { href: voirTout, libelle: t("activite.voirTout") } })}
      />
      <p className="bloc__aide">{t("transporteurs.aide")}</p>
      {total === 0 ? (
        <p className="bloc__vide">{t("transporteurs.aucun")}</p>
      ) : (
        <div className="envois">
          <table className="transporteurs">
            <tbody>
              {lignes.map((l) => (
                <tr key={l.nom}>
                  <th scope="row">{l.nom}</th>
                  <td aria-hidden="true">
                    <i style={{ "--p": l.nombre / maximum } as React.CSSProperties} />
                  </td>
                  <td>{format.number(l.nombre)}</td>
                  <td>{format.number(l.nombre / total, { style: "percent" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------- activité récente ---------- */
const ICONES: Record<TypeEvenement, LucideIcon> = {
  commande_creee: Plus,
  commande_modifiee: Package,
  commande_archivee: Archive,
  commande_dupliquee: Copy,
  media_ajoute: Images,
  media_supprime: ImageMinus,
  medias_reordonnes: ArrowUpDown,
  lien_revoque: Link2,
  qc_approuve: CircleCheck,
  qc_refuse: CircleX,
};
const TONS: Partial<Record<TypeEvenement, string>> = { qc_approuve: "ok", qc_refuse: "refus" };

export async function ActiviteBloc({
  faits,
  langue,
  lienVoirTout = false,
}: {
  readonly faits: readonly FaitRecent[];
  readonly langue: string;
  readonly lienVoirTout?: boolean;
}) {
  const t = await getTranslations("analyses");
  const tHisto = await getTranslations("editeur.historique");
  const format = await getFormatter();
  const maintenant = new Date();
  return (
    <section className="bloc v4-carte" aria-labelledby="t-activite">
      <TeteBloc
        id="t-activite"
        titre={t("activite.titre")}
        {...(lienVoirTout ? { lien: { href: `/${langue}/commandes`, libelle: t("activite.voirTout") } } : {})}
      />
      {faits.length === 0 ? (
        <p className="bloc__vide">{t("activite.aucune")}</p>
      ) : (
        <ol className="activite">
          {faits.map((f) => {
            const Icone = ICONES[f.type];
            return (
              <li key={f.id}>
                <LienEcran href={`/${langue}/commandes/${f.commandeId}`}>
                  <i data-ton={TONS[f.type]}>
                    <Icone aria-hidden="true" className="ic" />
                  </i>
                  <p>
                    {tHisto(`types.${f.type}`)}
                    <small>
                      {t("activite.commande")} {f.reference}
                    </small>
                  </p>
                  <time dateTime={f.quand}>{format.relativeTime(new Date(f.quand), { now: maintenant, style: "long" })}</time>
                </LienEcran>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

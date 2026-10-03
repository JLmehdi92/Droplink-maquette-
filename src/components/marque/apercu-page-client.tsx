"use client";

import Image from "next/image";
import { ArrowRight, CalendarDays, Check, MessageCircle, Truck } from "lucide-react";
import type { AccentResolu } from "@/lib/design/contraste";
import type { TextesPageApercu } from "@/lib/boutique/phrases-apercu";
import { IMAGES_DEMO } from "@/components/landing/images-demo";

export interface ReseauApercu {
  readonly clef: "instagram" | "tiktok" | "whatsapp" | "site";
  /** Le nom de la plateforme (« Instagram »), ou « Site web » dans la langue de la page. */
  readonly libelle: string;
  readonly trace: string;
}

/**
 * LA PAGE CLIENT DE L'APERÇU DE « MA MARQUE » (maquette, `page-client.html`
 * repeinte par `marque.js`).
 *
 * Elle reprend la grammaire et les TEXTES de la vraie page client, dans la
 * langue des pages client choisie au formulaire — jamais celle de l'écran du
 * vendeur. Elle suit la frappe : nom, description, logo, couleur résolue par
 * `resoudreAccent()` (jamais la couleur brute), réseaux, carte « Propulsé par
 * DropLink ». Les données de commande (numéro, transporteur, photos) sont une
 * démonstration : l'aperçu dit « pour votre client », il n'invente aucun nom.
 *
 * Décorative : son cadre porte `role="img"` — c’est une IMAGE de la page.
 */
export function ApercuPageClient({
  textes,
  pour,
  nom,
  description,
  logo,
  accent,
  reseaux,
  marqueMasquee,
  langue,
  bureau = false,
  zoom,
  nomProvisoire,
  accueil = false,
}: {
  readonly textes: TextesPageApercu;
  readonly pour: string;
  readonly nom: string;
  readonly description: string;
  readonly logo: string | null;
  readonly accent: AccentResolu;
  readonly reseaux: readonly ReseauApercu[];
  readonly marqueMasquee: boolean;
  readonly langue: string;
  readonly bureau?: boolean;
  readonly zoom?: number;
  /** À l'onboarding seulement (maquette `compte.js`) : tant qu'aucun nom n'est tapé, l'aperçu
   *  montre ce nom-ci, grisé (`est-provisoire`), pour qu'on voie OÙ le nom apparaîtra. */
  readonly nomProvisoire?: string;
  /**
   * L'aperçu de `/bienvenue` (maquette `compte.js:72-80`, audit final du 03/10/2026) : la page
   * « se construit » — suivi et photos y ENTRENT (`data-etats`, `a-suivi`, `a-photos`) — et
   * elle s'arrête à la validation : livraison et « Propulsé par DropLink » sont masquées
   * dans la maquette (`page-client.html`, `hidden`).
   */
  readonly accueil?: boolean;
}) {
  const style = {
    "--pc-texte": accent.texte,
    "--pc-interface": accent.interface,
    "--pc-remplissage": accent.remplissage,
    "--pc-sur-remplissage": accent.surRemplissage,
    "--pc-teinte": accent.teinte,
    "--pc-sur-teinte": accent.surTeinte,
    ...(zoom === undefined ? {} : { "--z": String(zoom) }),
  } as React.CSSProperties;
  // Une page sans nom ni logo commence directement par son contenu (décision 24).
  const enTete = nom !== "" || logo !== null || nomProvisoire !== undefined;
  // « Une question ? » n'existe que s'il y a un réseau pour répondre ; le site n'en est pas un.
  const contacts = reseaux.filter((r) => r.clef !== "site");
  const icone = (trace: string) => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={trace} />
    </svg>
  );

  const boutique = enTete ? (
    <header className="pc__boutique">
      {logo === null ? null : (
        /* eslint-disable-next-line @next/next/no-img-element -- aperçu local
           `blob:` ou URL signée à expiration. */
        <img className="pc__logo" src={logo} alt="" width={44} height={44} />
      )}
      <small>{textes.commandeDe}</small>
      {nom !== "" ? <b>{nom}</b> : nomProvisoire !== undefined ? <b className="est-provisoire">{nomProvisoire}</b> : null}
      {/* La description suit le nom, et seulement lui : seule, elle ne dirait pas de qui elle parle. */}
      {nom === "" || description === "" ? null : <span>{description}</span>}
      {reseaux.length === 0 ? null : (
        <ul className="pc__icones">
          {reseaux.map((r) => (
            <li key={r.clef} title={r.libelle}>
              {icone(r.trace)}
            </li>
          ))}
        </ul>
      )}
    </header>
  ) : null;

  const commande = (
    <section className="pc__commande">
      <small>
        <span>{textes.titre}</span> <em className="pc__pour">{pour}</em>
      </small>
      <b>6A4D21</b>
      <span>{textes.sousTitre}</span>
      <div className="pc__suivi" data-pc-suivi="">
        <div className="pc__date">
          <i className="pc__tuile">
            <CalendarDays aria-hidden="true" className="ic" />
          </i>
          <p>
            <small>{textes.dateEstimee}</small>
            <strong>{textes.dates}</strong>
          </p>
        </div>
        <ol className="pc__frise" style={{ "--avance": 2 } as React.CSSProperties}>
          {textes.etapes.map((etape, i) => (
            <li key={i} className={i < 2 ? "fait" : i === 2 ? "actuel" : ""}>
              <i>
                <Check aria-hidden="true" className="ic" />
              </i>
              <b>{etape}</b>
              <small className="pc__quand">{textes.quand[i]}</small>
              <small className="pc__pastille">{textes.enCours}</small>
              <small className="pc__attente">{textes.enAttente}</small>
            </li>
          ))}
        </ol>
        <div className="pc__bandeau">
          <Truck aria-hidden="true" className="ic" />
          <p>
            <strong>{textes.bandeau}</strong>
            <small>{textes.mouvement}</small>
          </p>
        </div>
      </div>
    </section>
  );

  const photos = (
    <section className="pc__photos">
      {/* Pas des titres : l'aperçu est une IMAGE de la page client (même règle que la
          démo de la landing, `.pc__titre`, audit SEO du 03/10/2026). */}
      <div className="pc__titre">
        <span>{textes.galerie}</span> <span data-pc-compte="">({IMAGES_DEMO.length})</span>
      </div>
      <div className="pc__grille" data-pc-grille="">
        {IMAGES_DEMO.map((img, i) => (
          <figure key={i}>
            <Image src={img} alt="" width={90} height={90} sizes="90px" />
          </figure>
        ))}
      </div>
    </section>
  );

  const qc = (
    <section className="pc__qc">
      <div className="pc__titre">{textes.qcTitre}</div>
      <p>{textes.qcTexte}</p>
      <div className="pc__qc-actions">
        <span>{textes.qcRefuser}</span>
        <span className="pc__plein">{textes.qcApprouver}</span>
      </div>
    </section>
  );

  const livraison = (
    <section className="pc__carte pc__livraison">
      <div className="pc__titre">{textes.livraisonTitre}</div>
      <dl>
        <div>
          <dt>{textes.transporteur}</dt>
          <dd>Colissimo</dd>
        </div>
        <div>
          <dt>{textes.numero}</dt>
          <dd>6A30489215734</dd>
        </div>
        <div>
          <dt>{textes.dateCourte}</dt>
          <dd>{textes.dates}</dd>
        </div>
      </dl>
    </section>
  );

  const contact =
    contacts.length === 0 ? null : (
      <section className="pc__carte pc__contact">
        <div className="pc__contact-tete">
          <i className="pc__tuile pc__tuile--rond">
            <MessageCircle aria-hidden="true" className="ic" />
          </i>
          <p>
            <b>{textes.contactTitre}</b>
            <span>{textes.contactTexte}</span>
          </p>
        </div>
        <span className="pc__contact-bouton">
          <span>{textes.contactBouton}</span>
          <ArrowRight aria-hidden="true" className="ic" />
        </span>
        <ul>
          {contacts.map((r) => (
            <li key={r.clef}>
              {icone(r.trace)}
              {r.libelle}
            </li>
          ))}
        </ul>
      </section>
    );

  // La carte « Propulsé par DropLink » porte les couleurs du VENDEUR (règle 3) ;
  // un compte Pro peut la retirer.
  const propulse = marqueMasquee ? null : (
    <aside className="pc__propulse">
      <small>{textes.propulseSurtitre}</small>
      <b>{textes.propulseTitre}</b>
      <span>{textes.propulseTexte}</span>
      <em>{textes.propulseBouton}</em>
    </aside>
  );

  if (bureau) {
    return (
      <div className="pc pc--bureau" lang={langue} style={style}>
        {boutique}
        <div className="pc__colonnes">
          <div>
            {commande}
            {photos}
            {qc}
          </div>
          <div>
            {livraison}
            {contact}
            {propulse}
          </div>
        </div>
      </div>
    );
  }
  if (accueil) {
    return (
      <div className="pc a-photos a-suivi" data-etats="" lang={langue} style={style}>
        {boutique}
        {commande}
        {photos}
        {qc}
      </div>
    );
  }
  return (
    <div className="pc" lang={langue} style={style}>
      {boutique}
      {commande}
      {photos}
      {qc}
      {livraison}
      {contact}
      {propulse}
    </div>
  );
}

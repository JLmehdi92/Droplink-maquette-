"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { ApercuPageClient } from "./apercu-page-client";

/**
 * L'APERÇU DE « MA MARQUE » (maquette, `.marque__apercu`) : la même page client,
 * dans un téléphone ou en desktop réduit à la largeur du panneau.
 *
 * ⚠️ LA BASCULE CHANGE LA MISE EN PAGE, PAS SEULEMENT LE CADRE. En desktop la
 * page prend sa disposition de bureau (en-tête, puis deux colonnes) : c'est ce
 * que la maquette montre, et c'est pourquoi la bascule n'est plus le mensonge
 * qu'un ancien commentaire refusait — deux boutons qui ne changeaient rien.
 *
 * La page est posée à l'échelle EXACTE de son cadre, mesurée : en desktop par
 * transformation (à 0,4, `zoom` arrondit chaque lettre et les mots se collent),
 * en rendant au défilement la hauteur que la transformation ne retire pas ; au
 * téléphone, l'aperçu mobile EST la page à sa taille.
 */
const LARGEUR = { mobile: 390, desktop: 1180 } as const;

export function ApercuMarque({
  format,
  surFormat,
  libelles,
  page,
}: {
  readonly format: "mobile" | "desktop";
  readonly surFormat: (f: "mobile" | "desktop") => void;
  readonly libelles: {
    readonly titre: string;
    readonly aide: string;
    readonly direct: string;
    readonly formats: string;
    readonly bureau: string;
    readonly mobile: string;
    readonly imageMobile: string;
    readonly imageBureau: string;
  };
  readonly page: Omit<ComponentProps<typeof ApercuPageClient>, "bureau" | "zoom">;
}) {
  const ecranMobile = useRef<HTMLDivElement>(null);
  const ecranBureau = useRef<HTMLDivElement>(null);
  const pageBureau = useRef<HTMLDivElement>(null);
  const [zMobile, setZMobile] = useState(300 / 390);
  const [bureau, setBureau] = useState({ z: 0.4, h: 0 });

  useLayoutEffect(() => {
    const cadrer = () => {
      const m = ecranMobile.current;
      if (m && m.clientWidth > 0) {
        setZMobile(window.matchMedia("(max-width: 640px)").matches ? 1 : m.clientWidth / LARGEUR.mobile);
      }
      const b = ecranBureau.current, p = pageBureau.current;
      if (b && p && b.clientWidth > 0) {
        const z = b.clientWidth / LARGEUR.desktop;
        setBureau((a) => (Math.abs(a.z - z) > 0.001 || a.h !== p.offsetHeight ? { z, h: p.offsetHeight } : a));
      }
    };
    cadrer();
    const obs = new ResizeObserver(cadrer);
    [ecranMobile.current, ecranBureau.current, pageBureau.current].forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [format]);

  return (
    <aside className="bloc marque__apercu" aria-labelledby="m-apercu">
      <header className="bloc__tete">
        <h2 id="m-apercu">{libelles.titre}</h2>
        <p className="direct">
          <i aria-hidden="true" />
          {libelles.direct}
        </p>
      </header>
      <p className="bloc__aide">{libelles.aide}</p>
      <div className="apercu-format" role="group" aria-label={libelles.formats}>
        <button type="button" aria-pressed={format === "desktop"} onClick={() => surFormat("desktop")}>
          <Monitor aria-hidden="true" className="ic" />
          {libelles.bureau}
        </button>
        <button type="button" aria-pressed={format === "mobile"} onClick={() => surFormat("mobile")}>
          <Smartphone aria-hidden="true" className="ic" />
          {libelles.mobile}
        </button>
      </div>
      <div className="apercu-zone">
        <div className="apercu-mobile" hidden={format !== "mobile"}>
          {/* `role="img"` : ses enfants ne sont pas exposés, c'est une IMAGE de la page. */}
          <div ref={ecranMobile} className="apercu-mobile__ecran" role="img" aria-label={libelles.imageMobile}>
            <ApercuPageClient {...page} zoom={zMobile} />
          </div>
        </div>
        <div ref={ecranBureau} className="apercu-bureau" role="img" aria-label={libelles.imageBureau} hidden={format !== "desktop"}>
          <div style={{ width: LARGEUR.desktop * bureau.z, height: bureau.h * bureau.z, overflow: "hidden" }}>
            <div ref={pageBureau} style={{ width: LARGEUR.desktop, transform: `scale(${bureau.z})`, transformOrigin: "0 0" }}>
              <ApercuPageClient {...page} bureau />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

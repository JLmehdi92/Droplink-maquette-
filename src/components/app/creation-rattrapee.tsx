"use client";

import { Component, createRef, type ReactNode } from "react";
import { annoncer } from "@/components/app/annonce";

/**
 * LE FORMULAIRE « Créer une commande » DE LA BARRE DU HAUT, RATTRAPÉ SUR PLACE (audit final du
 * 03/10/2026). Il vit dans la COQUE : une action qui lève (panne réseau, `creerBrouillon` qui
 * refuse) remontait jusqu'à la frontière au-dessus d'elle, et l'écran d'erreur public
 * remplaçait toute l'application — navigation comprise — en parlant d'affichage. Ici l'échec
 * est dit dans la bulle de la coque, et le bouton revient, prêt à réessayer.
 *
 * Une frontière d'erreur React reçoit l'erreur d'une action de formulaire (React 19). Rien
 * n'est affirmé que la base n'a pas fait : aucune commande n'apparaît (contrainte n° 8).
 */
export class CreationRattrapee extends Component<
  { readonly message: string; readonly children: ReactNode },
  { readonly essai: number; readonly echec: boolean }
> {
  override state = { essai: 0, echec: false };
  private readonly zone = createRef<HTMLDivElement>();

  static getDerivedStateFromError(): Partial<{ echec: boolean }> {
    return { echec: true };
  }

  override componentDidCatch(erreur: unknown): void {
    console.error("[coque] création de commande échouée", erreur);
    annoncer(this.props.message);
    // Le formulaire est remonté neuf : son bouton n'est plus « en cours ».
    this.setState((s) => ({ essai: s.essai + 1, echec: false }));
  }

  // Le bouton qui avait le focus a été remplacé : le nouveau le reprend, sans quoi il
  // tombait sur `<body>` (audit final du 03/10/2026).
  override componentDidUpdate(_: unknown, avant: { readonly essai: number }): void {
    if (avant.essai !== this.state.essai) this.zone.current?.querySelector<HTMLElement>('button[type="submit"]')?.focus();
  }

  override render(): ReactNode {
    if (this.state.echec) return null;
    return (
      <div key={this.state.essai} ref={this.zone} className="contents">
        {this.props.children}
      </div>
    );
  }
}

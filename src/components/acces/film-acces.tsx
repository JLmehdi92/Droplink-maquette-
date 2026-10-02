"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  Check,
  CircleCheck,
  Clock,
  Eye,
  Images,
  Link as IconeLien,
  Package,
  Share2,
  Truck,
  UserRound,
  type LucideIcon,
} from "lucide-react";

/**
 * LE FILM DES PAGES D'ACCÈS (maquette, `design/maquette/src/film.js`).
 *
 * Grammaire du skill film-lancement-saas, rendue en direct : un `renderAt(t)`
 * déterministe, appelé à chaque image, qui pose chaque calque. Tout ce qu'on lit
 * est vrai : les libellés du produit, des événements que le produit enregistre.
 * Deux films : « absence » (connexion) et « minute » (inscription).
 *
 * Les règles de fluidité de la maquette, mesurées et gardées (refonte-design § 6) :
 * - rien n'est construit sous 1 021 px (le panneau est masqué) ;
 * - il ne tourne que visible et onglet affiché ;
 * - il n'écrit que les styles qui changent, en valeurs arrondies ;
 * - un mode léger (sans flou, mouvement intact) se juge en continu sur les 60
 *   dernières images ;
 * - sous `prefers-reduced-motion`, une image fixe.
 *
 * Composant client isolé, chargé sur ces deux routes seulement. Ses textes sont
 * traduits par le serveur et arrivent en propriété ; la page client de
 * démonstration est rendue par le serveur dans un modèle caché, et clonée ici.
 * Décoratif : son conteneur est `aria-hidden`.
 */

export interface TextesFilm {
  readonly [cle: string]: string;
}

const ICONES: Record<string, LucideIcon> = {
  check: Check,
  "circle-check": CircleCheck,
  clock: Clock,
  eye: Eye,
  images: Images,
  link: IconeLien,
  package: Package,
  "share-2": Share2,
  truck: Truck,
  "user-round": UserRound,
};

export function FilmAcces({
  film,
  textes,
  logo,
  children,
}: {
  readonly film: "absence" | "minute";
  readonly textes: TextesFilm;
  /** L'adresse du symbole DropLink, déjà résolue par `next/image`. */
  readonly logo: string;
  /** La page client de démonstration, rendue par le serveur. */
  readonly children: ReactNode;
}) {
  const hote = useRef<HTMLDivElement>(null);
  const modele = useRef<HTMLDivElement>(null);
  const icones = useRef<HTMLDivElement>(null);

  // Une redirection vers la même page (`?erreur=…`) recrée l'objet `textes` à
  // l'identique : la clé de l'effet est son CONTENU, sinon le film repartirait à
  // zéro sous les yeux du vendeur à chaque refus.
  const cle = JSON.stringify(textes);

  useEffect(() => {
    const h = hote.current, m = modele.current, i = icones.current;
    if (!h || !m || !i) return;
    const film = monterFilm(h, m, i, JSON.parse(cle) as TextesFilm, logo);
    return () => film.arreter();
  }, [cle, logo]);

  return (
    <aside className="acces__vitrine acces__vitrine--film" aria-hidden="true">
      <div ref={hote} className="film-hote" data-film={film} />
      <div ref={modele} hidden>
        {children}
      </div>
      <div ref={icones} hidden>
        {Object.entries(ICONES).map(([nom, Icone]) => (
          <span key={nom} data-i={nom}>
            <Icone className="ic" aria-hidden="true" />
          </span>
        ))}
      </div>
    </aside>
  );
}

/** Échappe un texte avant de l'écrire dans le gabarit HTML du film. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

type Style = Record<string, string>;
interface Pose {
  o?: number;
  x?: number;
  y?: number;
  s?: number;
  r?: number;
  rx?: number;
  ry?: number;
  z?: number;
  blur?: number;
}

function monterFilm(hote: HTMLElement, modele: HTMLElement, sourceIcones: HTMLElement, T: TextesFilm, logo: string) {
  let arrete = false;
  const nettoyages: Array<() => void> = [];
  // Le film n'existe qu'à côté du formulaire. Sous 1021 px, le panneau est masqué
  // et rien n'est construit ni calculé : ni DOM, ni boucle.
  const place = window.matchMedia("(min-width: 1021px)");
  const lancer = () => {
    if (arrete || !place.matches || hote.dataset.lance) return;
    hote.dataset.lance = "1";
    film();
  };
  place.addEventListener("change", lancer);
  lancer();
  return {
    arreter: () => {
      arrete = true;
      place.removeEventListener("change", lancer);
      nettoyages.forEach((f) => f());
      hote.replaceChildren();
      delete hote.dataset.lance;
    },
  };

  function film() {
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const W = 600, H = 760;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    let leger = !!(nav.connection?.saveData || (nav.deviceMemory && nav.deviceMemory <= 2));
    let echelle = 1;
    const t = (cle: string) => esc(T[cle] ?? "");

    /* ---------- outillage (repris du moteur du skill) ---------- */
    const cl = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const P = (x: number, a: number, b: number) => cl((x - a) / (b - a));
    const eo = (x: number) => 1 - (1 - x) ** 3, eo5 = (x: number) => 1 - (1 - x) ** 5, ei = (x: number) => x * x * x, ei5 = (x: number) => x ** 5;
    const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
    const eio5 = (x: number) => (x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2);
    const spring = (x: number, f = 10, d = 7) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-d * x) * Math.cos(f * x));
    const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
    // On n'écrit que ce qui a changé, en valeurs arrondies : un plan posé reste posé.
    const ecrit = new WeakMap<Element, Style & { calque?: string }>();
    const pose = (el: Element | null, k: string, v: string | number) => {
      if (!el) return;
      const val = String(v);
      let m = ecrit.get(el);
      if (!m) ecrit.set(el, (m = {}));
      if (m[k] === val) return;
      m[k] = val;
      (el as HTMLElement).style.setProperty(k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()).replace(/^webkit-/, "-webkit-"), val);
      // Un plan qu'on floute devient un calque, une fois pour toutes.
      if (k === "filter" && val && !m.calque) {
        m.calque = "1";
        (el as HTMLElement).style.willChange = "transform, filter";
      }
    };
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const tf = (el: Element | null, { o, x = 0, y = 0, s = 1, r = 0, rx = 0, ry = 0, z = 0, blur = 0 }: Pose) => {
      if (o !== undefined) pose(el, "opacity", Math.round(o * 1000) / 1000);
      pose(el, "transform", `translate3d(${r2(x)}px,${r2(y)}px,${r2(z)}px) rotateX(${r2(rx)}deg) rotateY(${r2(ry)}deg) rotate(${r2(r)}deg) scale(${Math.round(s * 1e4) / 1e4})`);
      pose(el, "filter", !leger && blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "");
    };
    const vis = (el: Element | null, on: boolean) => pose(el, "display", on ? "" : "none");
    // révélation masquée : la ligne monte de derrière son cache (135 % pour les accents)
    const masque = (el: Element | null | undefined, x: number, a: number, d = 0.6, sortie = 1e9, ds = 0.35) => {
      const k = eo5(P(x, a, a + d)), q2 = eio(P(x, sortie, sortie + ds));
      pose(el?.firstElementChild ?? null, "transform", `translateY(${(1 - k) * 135 - q2 * 135}%)`);
    };
    const ic = (n: string) => sourceIcones.querySelector(`[data-i="${n}"]`)?.innerHTML ?? "";
    const ligne = (texte: string, cls = "") => `<span class="fm-ligne ${cls}"><span>${texte}</span></span>`;
    const q = <E extends Element = HTMLElement>(sel: string) => racine.querySelector<E>(sel);
    const qa = (sel: string) => [...racine.querySelectorAll<HTMLElement>(sel)];

    /* ---------- scène ---------- */
    const racine = document.createElement("div");
    racine.className = "fm fm--transparent";
    racine.innerHTML = `
      <div class="fm-fond fm-fond--clair"></div>
      <div class="fm-fond fm-fond--sombre" data-sombre></div>
      <div class="fm-ambiance" aria-hidden="true"><i class="fm-halo fm-halo--1"></i><i class="fm-halo fm-halo--2"></i><i class="fm-halo fm-halo--3"></i></div>
      <div class="fm-scene" data-fm-scene>
        <div class="fm-calque" data-L0></div>
        <div class="fm-calque" data-L1></div>
        <div class="fm-calque" data-L2></div>
        <div class="fm-calque" data-L3></div>
      </div>
      <div class="fm-vignette" data-vignette></div>
      <svg width="0" height="0" style="position:absolute"><linearGradient id="fm-deg" x1="0" x2="1"><stop offset="0" stop-color="#6C5CFB"/><stop offset=".52" stop-color="#A855E0"/><stop offset="1" stop-color="#FB7C7F"/></linearGradient></svg>`;
    hote.append(racine);
    const scene = q("[data-fm-scene]")!;
    const pcModele = modele.querySelector(".pc");
    const pc = () => (pcModele ? (pcModele.cloneNode(true) as HTMLElement) : document.createElement("div"));
    const photos = [...modele.querySelectorAll<HTMLImageElement>(".pc__grille img")].map((img) => img.currentSrc || img.src);
    const marque = `<img src="${esc(logo)}" alt="" width="20" height="28">DropLink`;

    /* ---------- rouleau de chiffres ---------- */
    const rouleau = (el: Element | null, sequence: readonly string[]) => {
      if (!el) return null;
      el.innerHTML = `<span class="fm-rouleau__piste">${sequence.map((c) => `<span>${c}</span>`).join("")}</span>`;
      return el.firstElementChild as HTMLElement;
    };
    const rouler = (piste: HTMLElement | null, pos: number, vitesse = 0) => {
      if (!piste) return;
      pose(piste, "transform", `translateY(${(-pos * 100) / piste.children.length}%)`);
      pose(piste, "filter", vitesse > 0.02 ? `blur(${Math.min(6, vitesse * 40).toFixed(2)}px)` : "");
    };
    const anneau = `<svg class="fm-anneau" viewBox="0 0 200 200" aria-hidden="true"><ellipse cx="100" cy="100" rx="94" ry="94" fill="none" stroke="url(#fm-deg)" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="100" data-anneau/></svg>`;

    let renderAt: (x: number) => void = () => {};
    let DUREE = 15.4, POSE = 6.9;
    const L0 = q("[data-L0]"), L1 = q("[data-L1]"), L2 = q("[data-L2]"), L3 = q("[data-L3]");
    if (!L0 || !L1 || !L2 || !L3) return;

    /* =====================================================================
       CONNEXION · « Pendant votre absence »
       A sombre : l'horloge tourne de 18:19 à 08:40 → zoom à travers l'horloge
       B clair  : téléphone en 3D, les événements tombent, poussée sur le bandeau → coup de fouet
       C clair  : le compteur de consultations roule → zoom à travers le « 3 »
       D sombre : sceau « Photos validées », logo → retour à A
       ===================================================================== */
    if (hote.dataset.film === "absence") {
      DUREE = 15.4; POSE = 6.9;
      L0.innerHTML = `
        <p class="fm-surtitre" data-a-titre>${ligne(t("surtitre"))}</p>
        <div class="fm-horloge" data-a-horloge>
          ${anneau}
          <p class="fm-horloge__heure"><span class="fm-rouleau" data-h1></span><span class="fm-rouleau" data-h2></span><span class="fm-deuxpoints">:</span><span class="fm-rouleau" data-m1></span><span class="fm-rouleau" data-m2></span></p>
          <p class="fm-horloge__date"><span data-a-date1>${t("jour1")}</span><span data-a-date2>${t("jour2")}</span></p>
        </div>`;
      L1.innerHTML = `
        <div class="fm-titre" data-b-titre>${ligne(t("titre1"))}${ligne(t("titre2"), "fm-attenue")}</div>
        <div class="fm-3d"><div class="fm-tel" data-b-tel><div class="telephone telephone--film"><div class="telephone__ecran" data-b-ecran></div></div></div></div>
        <div class="fm-notif" data-b-n1><i class="fm-notif__icone">${ic("package")}</i><p><b>${t("n1")}</b><small>${t("n1detail")}</small></p></div>
        <div class="fm-notif" data-b-n2><i class="fm-notif__icone">${ic("truck")}</i><p><b>${t("n2")}</b><small>${t("n2detail")}</small></p></div>`;
      q("[data-b-ecran]")?.append(pc());
      L2.innerHTML = `
        <div class="fm-compteur" data-c-bloc>
          <p class="fm-compteur__tete"><i class="fm-notif__icone">${ic("eye")}</i>${t("consulte")}</p>
          <p class="fm-compteur__nombre"><span class="fm-rouleau fm-rouleau--grand" data-c-n></span></p>
          <p class="fm-compteur__mot">${t("consultations")}</p>
          <p class="fm-compteur__detail" data-c-detail>${t("derniere")}</p>
        </div>`;
      L3.innerHTML = `
        <div class="fm-sceau" data-d-sceau>${anneau}<i class="fm-sceau__coeur">${ic("check")}</i><div class="fm-eclats" data-d-eclats></div></div>
        <div class="fm-titre fm-titre--sombre fm-titre--centre" data-d-titre>${ligne(t("valide1"))}${ligne(t("valide2"), "fm-attenue")}</div>
        <p class="fm-detail" data-d-heure>${t("quandValide")}</p>
        <p class="fm-marque" data-d-marque>${marque}</p>`;
      for (let k = 0; k < 14; k += 1) q("[data-d-eclats]")?.append(document.createElement("i"));

      const h1 = rouleau(q("[data-h1]"), ["1", "2", "0"]), h2 = rouleau(q("[data-h2]"), ["8", "9", "0", "1", "2", "3", "4", "5", "6", "7", "8"]);
      const m1 = rouleau(q("[data-m1]"), ["1", "2", "3", "4", "5", "0", "1", "2", "3", "4"]), m2 = rouleau(q("[data-m2]"), ["9", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
      const cn = rouleau(q("[data-c-n]"), ["1", "2", "3"]);
      const pcB = L1.querySelector(".pc");
      const frise = pcB?.querySelector<HTMLElement>("[data-pc-frise]") ?? null;
      const lis = frise ? [...frise.querySelectorAll("li")] : [];
      const bandeauTexte = pcB?.querySelector(".pc__suivi .pc__bandeau strong") ?? null;
      const mouvement = pcB?.querySelector(".pc__suivi .pc__bandeau small") ?? null;
      const bandeau = bandeauTexte?.closest(".pc__bandeau") ?? null;
      let etatB = -1;
      const poserFrise = (k: number) => {
        if (k === etatB || !frise) return;
        etatB = k;
        frise.style.setProperty("--avance", String(Math.min(k, 2)));
        lis.forEach((li, j) => {
          li.classList.toggle("fait", j < k);
          li.classList.toggle("actuel", j === k);
        });
        if (bandeauTexte) bandeauTexte.textContent = k < 2 ? (T.bandeauExpedie ?? "") : (T.bandeauTransit ?? "");
        if (mouvement) mouvement.textContent = k < 2 ? (T.mouvementHier ?? "") : (T.mouvementAujourdhui ?? "");
      };
      const eclats = qa("[data-d-eclats] i");

      renderAt = (x) => {
        const inA = x < 2.95 || x > 14.7, inB = x > 2.55 && x < 8.75, inC = x > 8.35 && x < 11.95, inD = x > 11.55;
        vis(L0, inA); vis(L1, inB); vis(L2, inC); vis(L3, inD);
        const sombre = x < 2.6 ? 1 : x < 2.8 ? 1 - P(x, 2.6, 2.76) : x < 11.6 ? 0 : P(x, 11.6, 11.78);
        pose(q("[data-sombre]"), "opacity", sombre);
        pose(q("[data-vignette]"), "opacity", lerp(0.25, 1, sombre));
        scene.classList.toggle("fm-est-sombre", sombre > 0.5);

        /* A · l'horloge */
        if (inA) {
          const tA = x > 14.7 ? x - DUREE : x;
          masque(q("[data-a-titre]")?.firstElementChild, tA, 0.1, 0.6);
          const k = eio5(P(tA, 0.7, 2.05)), dk = eio5(P(tA + 0.02, 0.7, 2.05)) - k;
          rouler(h1, k * 2, dk * 2); rouler(h2, k * 10, dk * 10); rouler(m1, k * 9, dk * 9); rouler(m2, k * 11, dk * 11);
          const bascule = P(tA, 1.25, 1.45);
          tf(q("[data-a-date1]"), { o: 1 - bascule, y: -14 * bascule });
          tf(q("[data-a-date2]"), { o: bascule, y: 14 * (1 - bascule) });
          const an = q("[data-a-horloge] [data-anneau]");
          pose(an, "strokeDashoffset", String(100 * (1 - eo(P(tA, 0.05, 1.1)))));
          pose(an?.parentElement ?? null, "transform", `rotate(${tA * 22}deg)`);
          const z = ei(P(tA, 2.4, 2.9));
          const entre = x > 14.7 ? eo5(P(x, 14.7, 15.3)) : 1;
          tf(q("[data-a-horloge]"), { s: lerp(0.9, 1, entre) * (1 + z * 6), blur: z * 12 + (1 - entre) * 8, o: (1 - P(tA, 2.7, 2.9)) * entre });
          tf(q("[data-a-titre]"), { o: (1 - P(tA, 2.4, 2.6)) * entre, y: -z * 60 });
        }

        /* B · téléphone en 3D, événements, poussée caméra */
        if (inB) {
          const e = eo5(P(x, 2.62, 3.75));
          const resp = Math.sin(x * 0.8) * 1.4;
          const push = eio5(P(x, 6.1, 6.65));
          const fouetK = ei5(P(x, 8.3, 8.64));
          tf(q("[data-b-tel]"), { x: lerp(200, 0, e) - fouetK * 2300, ry: lerp(-32, -14, e) + resp + push * 10, rx: lerp(14, 6, e), s: lerp(0.72, 1, e) * (1 + push * 0.34), y: Math.sin(x * 0.9) * 5 - push * 40, blur: (1 - e) * 10, o: cl(P(x, 2.62, 2.8)) });
          pose(q("[data-b-tel]"), "transformOrigin", `50% ${lerp(50, 43, push)}%`);
          const titreB = q("[data-b-titre]");
          masque(titreB?.children[0], x, 3.0, 0.6);
          masque(titreB?.children[1], x, 3.15, 0.6);
          tf(titreB, { x: -fouetK * 2300, o: 1 - push * 0.78, blur: push * 3.2 });
          poserFrise(x < 4.95 ? 1 : 2);
          if (x > 4.95 && x < 5.5) pose(bandeau, "filter", `blur(${(Math.sin(P(x, 4.95, 5.35) * Math.PI) * 2.5).toFixed(2)}px)`);
          else pose(bandeau, "filter", "");
          ([[q("[data-b-n1]"), 3.75, -1], [q("[data-b-n2]"), 4.75, 1]] as const).forEach(([el, a, cote]) => {
            const k = eo5(P(x, a, a + 0.5));
            const vitesse = Math.sin(Math.PI * P(x, a, a + 0.5));
            tf(el, { o: cl(P(x, a, a + 0.12)) * (1 - push * 0.35), x: lerp(120 * cote, 0, k) - fouetK * 2300 + Math.sin(x * 1.1 + a) * 6, y: lerp(-320, 0, k), z: lerp(260, 0, k), r: lerp(-18 * cote, 0, k), blur: vitesse * 5 + push * 3.2 });
          });
          const fq = Math.sin(Math.PI * P(x, 8.3, 8.75));
          pose(L1, "filter", !leger && fq > 0.02 ? `blur(${(fq * 14).toFixed(1)}px)` : "");
        }

        /* C · le compteur roule */
        if (inC) {
          const arrive = eo5(P(x, 8.42, 8.87));
          const z = ei(P(x, 11.45, 11.9));
          const bloc = q("[data-c-bloc]");
          tf(bloc, { x: lerp(2300, 0, arrive), s: 1 + z * 7 });
          pose(bloc, "transformOrigin", "50% 44%");
          pose(bloc, "filter", z > 0.01 ? `blur(${(z * 12).toFixed(2)}px)` : "");
          pose(bloc, "opacity", 1 - P(x, 11.72, 11.9));
          const fq = x < 8.9 ? Math.sin(Math.PI * P(x, 8.3, 8.9)) : 0;
          pose(L2, "filter", !leger && fq > 0.02 ? `blur(${(fq * 14).toFixed(1)}px)` : "");
          const pos = spring(P(x, 9.35, 9.95), 13, 7) + spring(P(x, 10.25, 10.85), 13, 7);
          const d = spring(P(x + 0.02, 9.35, 9.95), 13, 7) + spring(P(x + 0.02, 10.25, 10.85), 13, 7) - pos;
          rouler(cn, pos, Math.abs(d));
          tf(q("[data-c-detail]"), { o: cl(P(x, 9.0, 9.3)), y: (1 - eo5(P(x, 9.0, 9.5))) * 14 });
        }

        /* D · sceau de validation, marque */
        if (inD) {
          const entre = eo5(P(x, 11.62, 12.2));
          const sortie = P(x, 14.55, 15.2);
          const sc = spring(P(x, 11.75, 12.45), 10, 6);
          tf(q("[data-d-sceau]"), { s: lerp(0.5, 1, sc) * lerp(0.72, 1, entre), o: cl(P(x, 11.7, 11.85)) * (1 - sortie), blur: (1 - entre) * 10 + sortie * 8 });
          const an = q("[data-d-sceau] [data-anneau]");
          pose(an, "strokeDashoffset", String(100 * (1 - eo(P(x, 11.8, 12.6)))));
          pose(an?.parentElement ?? null, "transform", `rotate(${x * 14}deg)`);
          eclats.forEach((b, j) => {
            const a = (j / eclats.length) * Math.PI * 2, k = eo(P(x, 12.0, 12.7)), rr = 40 + (j % 3) * 30;
            pose(b, "transform", `translate(${Math.cos(a) * rr * k}px,${Math.sin(a) * rr * k}px) scale(${1 - k * 0.6})`);
            pose(b, "opacity", x > 12.0 ? 1 - P(x, 12.3, 12.7) : 0);
          });
          const titre = q("[data-d-titre]");
          masque(titre?.children[0], x, 12.2, 0.6, 14.45);
          masque(titre?.children[1], x, 12.35, 0.6, 14.5);
          tf(q("[data-d-heure]"), { o: cl(P(x, 12.8, 13.1)) * (1 - sortie), y: (1 - eo5(P(x, 12.8, 13.3))) * 16 });
          tf(q("[data-d-marque]"), { o: cl(P(x, 13.2, 13.5)) * (1 - sortie), s: lerp(0.9, 1, spring(P(x, 13.2, 13.8))) });
        }
      };
    }

    /* =====================================================================
       INSCRIPTION · « Dans une minute »
       A sombre : le chrono part → ouverture en cercle depuis le chrono
       B clair  : l'éditeur en 3D se remplit, poussée sur chaque champ, les photos tombent
       C clair  : clic sur Partager, le lien vole → la page client dans le téléphone
       E sombre : le chrono s'arrête à 0:48, « Moins d'une minute. »
       ===================================================================== */
    if (hote.dataset.film === "minute") {
      DUREE = 17; POSE = 10.6;
      L0.innerHTML = `
        <div class="fm-titre fm-titre--sombre fm-titre--centre fm-titre--haut" data-a-titre>${ligne(t("titre1"))}${ligne(t("titre2"), "fm-attenue")}</div>
        <div class="fm-horloge fm-horloge--chrono" data-a-chrono>${anneau}<p class="fm-horloge__heure" data-a-temps>0:00</p></div>`;
      L1.innerHTML = `
        <p class="fm-puce fm-puce--chrono" data-chrono>${ic("clock")}<span data-chrono-t>0:00</span></p>
        <div class="fm-titre" data-b-titre>${ligne(t("b1"))}${ligne(t("b2"), "fm-attenue")}</div>
        <div class="fm-3d"><div class="fm-fenetre" data-b-fen>
          <div class="fm-fenetre__tete"><b>${t("laCommande")}</b><span class="fm-enr">${ic("check")}${t("enregistre")}</span></div>
          <div class="fm-champ" data-f1><small>${t("champClient")}</small><span class="fm-champ__boite"><span data-f1-v></span><i class="fm-curseur"></i></span></div>
          <div class="fm-champ" data-f2><small>${t("champMedias")}</small><span class="fm-depot">${photos.map((src) => `<i data-ph><img src="${esc(src)}" alt=""></i>`).join("")}</span></div>
          <div class="fm-champ" data-f3><small>${t("champSuivi")}</small><span class="fm-champ__boite"><span data-f3-v></span><i class="fm-curseur"></i><span class="fm-transporteur" data-transp>${ic("circle-check")}Colissimo</span></span></div>
          <div class="fm-fenetre__pied"><span class="fm-partager" data-partager><span data-p-a>${ic("share-2")}${t("partager")}</span><span data-p-b>${ic("check")}${t("copie")}</span></span></div>
        </div></div>
        <p class="fm-lien" data-lien>${ic("link")}droplink.fr/p/k7Qm2xR9vLpA</p>
        <svg class="fm-pointeur" data-pointeur viewBox="0 0 24 24"><path d="M4 2.5 L4 19.5 L8.6 15.3 L11.6 21.6 L14.6 20.2 L11.7 14.1 L18 14.1 Z" fill="#0B0B18" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
        <i class="fm-onde" data-onde></i>`;
      L2.innerHTML = `
        <div class="fm-titre" data-c-titre>${ligne(t("c1"))}${ligne(t("c2"), "fm-attenue")}</div>
        <div class="fm-3d"><div class="fm-tel fm-tel--d" data-d-tel><div class="telephone telephone--film"><div class="telephone__ecran" data-d-ecran></div></div></div></div>
        <p class="fm-puce" data-d-p1>${ic("user-round")}${t("pourLea")}</p>
        <p class="fm-puce" data-d-p2>${ic("images")}${t("photos")}</p>
        <p class="fm-puce" data-d-p3>${ic("truck")}${t("transit")}</p>`;
      q("[data-d-ecran]")?.append(pc());
      L3.innerHTML = `
        <div class="fm-horloge fm-horloge--chrono" data-e-chrono>${anneau}<p class="fm-horloge__heure">0:48</p></div>
        <div class="fm-titre fm-titre--sombre fm-titre--centre" data-e-titre>${ligne(t("fin"))}</div>
        <p class="fm-mots" data-e-mots>${t("offre").split(" ").map((m) => `<span>${m}</span>`).join(" ")}</p>
        <p class="fm-marque" data-e-marque>${marque}</p>`;

      const chronoTexte = (x: number) => `0:${String(Math.round(48 * eio(P(x, 1.2, 12.4)))).padStart(2, "0")}`;
      const taper = (el: Element | null, texte: string, x: number, a: number, v: number) => {
        const n = Math.floor(cl((x - a) / v, 0, texte.length));
        if (el) el.textContent = [...texte].slice(0, n).join("");
        return n;
      };
      const pcD = L2.querySelector(".pc");
      const ph = qa("[data-ph]");
      const mots = qa("[data-e-mots] span");
      const centre = (el: Element | null): [number, number] => {
        if (!el) return [W / 2, H / 2];
        const r = el.getBoundingClientRect(), s = scene.getBoundingClientRect(), k = s.width / W;
        return [(r.left + r.width / 2 - s.left) / k, (r.top + r.height / 2 - s.top) / k];
      };

      renderAt = (x) => {
        const inA = x < 2.6 || x > 16.4, inB = x > 1.9 && x < 8.75, inC = x > 8.3 && x < 12.9, inE = x > 12.4;
        vis(L0, inA); vis(L1, inB); vis(L2, inC); vis(L3, inE);
        const sombre = x < 2.45 ? 1 : x < 12.45 ? 1 - P(x, 2.45, 2.5) : P(x, 12.45, 12.7);
        pose(q("[data-sombre]"), "opacity", sombre);
        pose(q("[data-vignette]"), "opacity", lerp(0.25, 1, sombre));
        scene.classList.toggle("fm-est-sombre", sombre > 0.5);

        /* A · le chrono part */
        if (inA) {
          const tA = x > 16.4 ? x - DUREE : x;
          const entre = x > 16.4 ? eo5(P(x, 16.4, 17)) : 1;
          const titreA = q("[data-a-titre]");
          masque(titreA?.children[0], tA, 0.1, 0.6);
          masque(titreA?.children[1], tA, 0.25, 0.6);
          const temps = q("[data-a-temps]");
          if (temps) temps.textContent = chronoTexte(tA);
          const an = q("[data-a-chrono] [data-anneau]");
          pose(an, "strokeDashoffset", String(100 * (1 - eo(P(tA, 0.1, 1.2)))));
          pose(an?.parentElement ?? null, "transform", `rotate(${tA * 30}deg)`);
          tf(q("[data-a-chrono]"), { s: lerp(0.86, 1, spring(P(tA, 0.2, 0.9))) * lerp(0.9, 1, entre), o: cl(P(tA, 0.15, 0.3)) * entre });
          tf(titreA, { o: entre });
        }

        /* B · l'éditeur se remplit */
        if (inB) {
          const r = eio5(P(x, 1.95, 2.45)) * 1100;
          pose(L1, "clipPath", x < 2.45 ? `circle(${r}px at 300px 420px)` : "");
          const sb = scene.getBoundingClientRect(), hb = hote.getBoundingClientRect();
          const cx = sb.left - hb.left + 300 * echelle, cy = sb.top - hb.top + 420 * echelle, rr = r * echelle;
          const trou = x > 1.95 && x < 2.45 ? `radial-gradient(circle at ${cx}px ${cy}px, transparent ${rr}px, #000 ${rr + 1}px)` : "";
          pose(q("[data-sombre]"), "maskImage", trou);
          pose(q("[data-sombre]"), "webkitMaskImage", trou);
          const trouL0 = trou ? `radial-gradient(circle at 300px 420px, transparent ${r}px, #000 ${r + 1}px)` : "";
          pose(L0, "maskImage", trouL0);
          pose(L0, "webkitMaskImage", trouL0);
          const chrono = q("[data-chrono-t]");
          if (chrono) chrono.textContent = chronoTexte(x);
          const e = eo5(P(x, 2.1, 3.2));
          const resp = Math.sin(x * 0.75) * 1.2;
          const cibles: ReadonlyArray<readonly [number, number, number]> = [[2.95, 4.05, 28], [5.35, 6.75, 70], [6.95, 8.3, 88]];
          let push = 0, oy = 30;
          cibles.forEach(([a, b, y]) => {
            const k = eio5(P(x, a, a + 0.5)) * (1 - eio5(P(x, b - 0.45, b)));
            if (k > push) { push = k; oy = y; }
          });
          const z = ei(P(x, 8.3, 8.7));
          const fen = q("[data-b-fen]");
          pose(fen, "transformOrigin", `50% ${oy}%`);
          tf(fen, { x: lerp(240, 0, e), ry: lerp(-30, -11, e) + resp + push * 6, rx: lerp(14, 6, e), s: lerp(0.86, 1, e) * (1 + push * 0.26), y: Math.sin(x * 0.9) * 5, blur: (1 - e) * 8 + z * 10, o: 1 - P(x, 8.5, 8.7) });
          const titreB = q("[data-b-titre]");
          masque(titreB?.children[0], x, 2.4, 0.6);
          masque(titreB?.children[1], x, 2.55, 0.6);
          tf(titreB, { o: (1 - push * 0.75) * (1 - z), blur: push * 3.2 });
          const n1 = taper(q("[data-f1-v]"), "Léa M.", x, 3.3, 0.09);
          q("[data-f1]")?.classList.toggle("est-actif", x > 3.1 && x < 4.1);
          q("[data-f1]")?.classList.toggle("est-rempli", n1 > 0);
          ph.forEach((el, j) => {
            const a = 4.35 + j * 0.2, k = eo5(P(x, a, a + 0.45));
            tf(el, { o: cl(P(x, a, a + 0.1)), x: lerp(120, 0, k), y: lerp(-320, 0, k), z: lerp(260, 0, k), r: lerp(-18, 0, k), blur: Math.sin(Math.PI * P(x, a, a + 0.45)) * 5 });
          });
          taper(q("[data-f3-v]"), "6A30489215734", x, 5.55, 0.045);
          q("[data-f3]")?.classList.toggle("est-actif", x > 5.4 && x < 6.5);
          const tr = spring(P(x, 6.35, 6.85), 12, 6);
          tf(q("[data-transp]"), { o: cl(P(x, 6.35, 6.45)), s: lerp(0.4, 1, tr) });
          const clic = 7.55;
          const copie = x >= clic;
          tf(q("[data-p-a]"), { o: copie ? 0 : 1, y: copie ? -10 : 0 });
          tf(q("[data-p-b]"), { o: copie ? 1 : 0, s: copie ? lerp(0.4, 1, spring(P(x, clic, clic + 0.4))) : 1 });
          q("[data-partager]")?.classList.toggle("est-copie", copie);
          const [bx, by] = centre(q("[data-partager]"));
          const pt = q("[data-pointeur]"), k = eio(P(x, 6.95, 7.45));
          const px = lerp(540, bx, k), py = lerp(700, by, k);
          const presse = x > clic - 0.08 && x < clic + 0.18 ? 1 - 0.16 * Math.sin(P(x, clic - 0.08, clic + 0.18) * Math.PI) : 1;
          pose(pt, "opacity", cl(P(x, 6.95, 7.1)) * (1 - P(x, 7.9, 8.05)));
          pose(pt, "transform", `translate(${px - 5}px,${py - 3}px) scale(${presse})`);
          const oq = P(x, clic, clic + 0.45), onde = q("[data-onde]");
          pose(onde, "opacity", oq > 0 && oq < 1 ? (1 - oq) * 0.8 : 0);
          pose(onde, "transform", `translate(${bx}px,${by}px) scale(${0.4 + oq * 0.9})`);
          const lk = eio(P(x, 7.75, 8.25)), lien = q("[data-lien]");
          const lx = lerp(bx, 300, lk), ly = lerp(by + 30, 560, lk) + Math.sin(Math.PI * lk) * 80;
          pose(lien, "opacity", cl(P(x, 7.75, 7.85)) * (1 - P(x, 8.6, 8.7)));
          pose(lien, "transform", `translate(${lx}px,${ly}px) translate(-50%,-50%) scale(${lerp(0.7, 1.1, lk) * (1 + z * 7)}) rotate(${lerp(-6, 0, lk)}deg)`);
          pose(lien, "filter", leger ? "" : `blur(${(Math.sin(Math.PI * lk) * 5 + z * 10).toFixed(2)}px)`);
          tf(q("[data-chrono]"), { o: 1 - z });
        }

        /* C · la page client, en 3D */
        if (inC) {
          const e = eo5(P(x, 8.4, 9.3));
          const recul = eio(P(x, 12.35, 12.85));
          const resp = Math.sin(x * 0.8) * 1.4;
          tf(q("[data-d-tel]"), { ry: -14 + resp, rx: 6, s: lerp(0.72, 1, e) * lerp(1, 0.86, recul), y: Math.sin(x * 0.9) * 5, blur: (1 - e) * 10 + recul * 8, o: cl(P(x, 8.4, 8.55)) * (1 - P(x, 12.6, 12.85)) });
          const titreC = q("[data-c-titre]");
          masque(titreC?.children[0], x, 8.9, 0.6);
          masque(titreC?.children[1], x, 9.05, 0.6);
          tf(titreC, { o: 1 - recul, blur: recul * 6 });
          ([["[data-d-p1]", 9.4, -1], ["[data-d-p2]", 9.65, 1], ["[data-d-p3]", 9.9, -1]] as const).forEach(([sel, a, cote], j) => {
            const k = spring(P(x, a, a + 0.6), 10, 6);
            tf(q(sel), { o: cl(P(x, a, a + 0.1)) * (1 - recul), s: lerp(0.6, 1, k), y: (1 - cl(k)) * 20 + Math.sin(1.1 * x + j) * 8, x: cote * (1 - cl(k)) * 30, blur: j === 1 ? 0.6 : 0 });
          });
          const dz = eio5(P(x, 10.6, 11.6));
          pose(pcD, "transform", `translateY(${-dz * 330}px)`);
        }

        /* E · le chrono s'arrête */
        if (inE) {
          const e = eo5(P(x, 12.5, 13.1)), sortie = P(x, 16.3, 17);
          const an = q("[data-e-chrono] [data-anneau]");
          pose(an, "strokeDashoffset", "0");
          pose(an?.parentElement ?? null, "transform", `rotate(${x * 18}deg)`);
          tf(q("[data-e-chrono]"), { s: lerp(0.6, 1, spring(P(x, 12.5, 13.2), 10, 6)), o: cl(P(x, 12.5, 12.65)) * (1 - sortie), blur: (1 - e) * 8 + sortie * 8 });
          masque(q("[data-e-titre]")?.children[0], x, 13.1, 0.6, 16.2);
          mots.forEach((mot, j) => {
            const a = 13.6 + j * 0.075, k = eo5(P(x, a, a + 0.5));
            tf(mot, { o: cl(P(x, a, a + 0.2)) * (1 - sortie), y: (1 - k) * 60, blur: (1 - k) * 12 });
          });
          tf(q("[data-e-marque]"), { o: cl(P(x, 14.3, 14.6)) * (1 - sortie), s: lerp(0.9, 1, spring(P(x, 14.3, 14.9))) });
        }
      };
    }

    /* ---------- mise à l'échelle et boucle ---------- */
    const ajuster = () => {
      const r = hote.getBoundingClientRect();
      // la scène entière, avec de l'air autour, plafonnée à 1,15
      const mx = Math.max(32, r.width * 0.06), my = Math.max(28, r.height * 0.05);
      const k = Math.min((r.width - 2 * mx) / W, (r.height - 2 * my) / H, 1.15);
      echelle = k;
      scene.style.transform = `scale(${k})`;
      scene.style.left = `${(r.width - W * k) / 2}px`;
      scene.style.top = `${(r.height - H * k) / 2}px`;
    };
    ajuster();
    const taille = new ResizeObserver(ajuster);
    taille.observe(hote);
    nettoyages.push(() => taille.disconnect());

    if (reduit) {
      void document.fonts.ready.then(() => !arrete && renderAt(POSE));
      return;
    }
    let visible = false, t0: number | null = null, tPause = 0, dernier = 0;
    const fenetre: boolean[] = [];
    const vue = new IntersectionObserver(([e]) => (visible = e?.isIntersecting ?? false));
    vue.observe(hote);
    nettoyages.push(() => vue.disconnect());
    const passerLeger = () => {
      leger = true;
      racine.classList.add("fm-leger");
      racine.querySelectorAll("[style*='blur']").forEach((el) => pose(el, "filter", ""));
    };
    if (leger) passerLeger();
    // la scène suit doucement le pointeur : quelques pixels, amortis
    let cibleX = 0, cibleY = 0, px = 0, py = 0, dernierPas = 0;
    const suivre = (e: PointerEvent) => {
      cibleX = e.clientX / innerWidth - 0.5;
      cibleY = e.clientY / innerHeight - 0.5;
    };
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      window.addEventListener("pointermove", suivre, { passive: true });
      nettoyages.push(() => window.removeEventListener("pointermove", suivre));
    }
    const boucle = (now: number) => {
      if (arrete) return;
      requestAnimationFrame(boucle);
      // rien ne tourne hors de l'écran, onglet caché, ou panneau masqué
      if (!visible || document.hidden) {
        t0 = null; dernier = 0; dernierPas = 0;
        return;
      }
      // L'aisance se juge en continu, sur les 60 dernières images visibles : plus
      // d'une sur quatre au-delà de 24 ms → léger.
      if (dernier && !leger) {
        fenetre.push(now - dernier > 24);
        if (fenetre.length > 60) fenetre.shift();
        if (fenetre.length === 60 && fenetre.filter(Boolean).length > 15) passerLeger();
      }
      dernier = now;
      if (t0 === null) t0 = now - tPause * 1000;
      tPause = ((now - t0) / 1000) % DUREE;
      try {
        renderAt(tPause);
      } catch (erreur) {
        // Une image qui lève lèverait aux 60 suivantes : on journalise UNE fois et
        // le film s'arrête. Il est décoratif, le formulaire n'en dépend pas.
        console.error("[film-acces] rendu interrompu", erreur);
        arrete = true;
        return;
      }
      const dt = Math.min(64, now - (dernierPas || now));
      dernierPas = now;
      const a = 1 - Math.exp(-dt / 260);
      px += (cibleX - px) * a;
      py += (cibleY - py) * a;
      const dx = Math.sin(now / 3100) * 5, dy = Math.cos(now / 3700) * 4;
      pose(racine, "transform", `translate3d(${(-px * 18 + dx).toFixed(2)}px,${(-py * 12 + dy).toFixed(2)}px,0)`);
    };
    void document.fonts.ready.then(() => !arrete && requestAnimationFrame(boucle));
  }
}

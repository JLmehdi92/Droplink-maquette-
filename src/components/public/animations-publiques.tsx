"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * LE MOUVEMENT DES PAGES PUBLIQUES (maquette, `public.js`) : tarifs, documentation,
 * blog, articles, pages légales, signalement.
 *
 * Ce que le serveur a rendu est animé ici, jamais réécrit : la cascade des entrées
 * (`[data-entree]` → `--i`, jouée par le CSS dès que `.pret` est posée par
 * `ScriptJs`), les blocs qui entrent une fois quand on les regarde (`[data-anime]` →
 * `est-vu`, seuil 0,2), les croix du tableau des tarifs posées sur le filet d'en-tête
 * (`--tp-croix`), le sommaire qui suit la lecture (`[data-sommaire]`, section active =
 * la dernière dont le titre a passé le tiers haut de l'écran), et la barre de
 * progression d'un article (`[data-progres]`). La bordure lumineuse au pointeur est
 * `CoucheV4`, montée à côté.
 *
 * Il se rejoue à chaque page (clé : le chemin), puisque la maquette recharge un
 * document par page. Sous mouvement réduit, tout est posé dans son état final.
 * La classe `js` vient de `ScriptJs` ; si ce composant lève, il pose `est-vu`
 * partout plutôt que de laisser un bloc masqué.
 */
export function AnimationsPubliques() {
  const chemin = usePathname();

  useEffect(() => {
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nettoyages: Array<() => void> = [];
    const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];

    try {
      $$("[data-entree]").forEach((el, i) => el.style.setProperty("--i", String(i)));

      /* ---------- les blocs : une entrée, une fois, quand on les regarde ---------- */
      $$("[data-anime]").forEach((el) => {
        if (reduit) {
          el.classList.add("est-vu");
          return;
        }
        const o = new IntersectionObserver(
          ([e]) => {
            if (e?.isIntersecting) {
              o.disconnect();
              el.classList.add("est-vu");
            }
          },
          { threshold: 0.2 },
        );
        o.observe(el);
        nettoyages.push(() => o.disconnect());
      });

      /* ---------- tableau comparatif : les croix se posent sur le filet d'en-tête ---------- */
      $$(".tp").forEach((tp) => {
        const tete = tp.querySelector<HTMLElement>("thead");
        if (tete === null) return;
        const poser = () => tp.style.setProperty("--tp-croix", `${tete.offsetHeight - 5}px`);
        const ro = new ResizeObserver(poser);
        ro.observe(tete);
        poser();
        nettoyages.push(() => ro.disconnect());
      });

      /* ---------- sommaire : il suit la lecture ---------- */
      const sommaires = $$("[data-sommaire]");
      if (sommaires.length > 0) {
        const liens = sommaires.flatMap((s) => $$<HTMLAnchorElement>("[data-sommaire-nav] a[data-ancre]", s));
        const courants = sommaires.flatMap((s) => $$("[data-sommaire-courant]", s));
        const ids = [...new Set(liens.map((a) => a.dataset.ancre ?? ""))];
        const sections = ids.map((id) => document.getElementById(id)).filter((s): s is HTMLElement => s !== null);
        let actif: string | null = null;
        const marquer = (id: string | undefined) => {
          if (id === undefined || id === actif) return;
          actif = id;
          liens.forEach((a) => {
            const oui = a.dataset.ancre === id;
            a.toggleAttribute("data-actif", oui);
            if (oui) a.setAttribute("aria-current", "location");
            else a.removeAttribute("aria-current");
          });
          const a = liens.find((x) => x.dataset.ancre === id);
          if (a) courants.forEach((c) => (c.textContent = a.textContent));
        };
        const suivre = () => {
          const ligne = window.innerHeight * 0.3;
          let id = sections[0]?.id;
          for (const s of sections) if (s.getBoundingClientRect().top <= ligne) id = s.id;
          marquer(id);
        };
        // au téléphone, le sommaire replié se referme au choix d'une section
        const refermer = (e: Event) => {
          const d = (e.currentTarget as Element).closest("details");
          if (d !== null && window.matchMedia("(max-width: 980px)").matches) d.open = false;
        };
        liens.forEach((a) => a.addEventListener("click", refermer));
        window.addEventListener("scroll", suivre, { passive: true });
        suivre();
        nettoyages.push(() => {
          window.removeEventListener("scroll", suivre);
          liens.forEach((a) => a.removeEventListener("click", refermer));
        });
      }

      /* ---------- article : la progression de lecture ---------- */
      const progres = document.querySelector<HTMLElement>("[data-progres]");
      const corps = document.querySelector<HTMLElement>(".art-corps");
      if (progres !== null && corps !== null) {
        let image = 0;
        const maj = () => {
          image = 0;
          const r = corps.getBoundingClientRect();
          const k = Math.min(1, Math.max(0, (window.innerHeight * 0.4 - r.top) / r.height));
          progres.style.transform = `scaleX(${k.toFixed(4)})`;
        };
        // une mise à jour par image au plus : le défilement peut tirer plus souvent
        const planifier = () => {
          if (image === 0) image = requestAnimationFrame(maj);
        };
        window.addEventListener("scroll", planifier, { passive: true });
        window.addEventListener("resize", planifier, { passive: true });
        maj();
        nettoyages.push(() => {
          window.removeEventListener("scroll", planifier);
          window.removeEventListener("resize", planifier);
          cancelAnimationFrame(image);
        });
      }
    } catch (erreur) {
      // Un bloc ne reste jamais masqué : tout est posé dans son état final.
      console.error("[pages publiques] animation interrompue —", erreur instanceof Error ? erreur.message : erreur);
      document.querySelectorAll("[data-anime]").forEach((el) => el.classList.add("est-vu"));
    }

    return () => nettoyages.forEach((n) => n());
  }, [chemin]);

  return null;
}

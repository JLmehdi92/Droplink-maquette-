"use client";

import { useEffect } from "react";
import { resoudreAccent, type AccentResolu } from "@/lib/design/contraste";

/**
 * LE MOUVEMENT DE LA LANDING — un seul îlot, qui anime ce que le serveur a rendu.
 *
 * Porté de `design/maquette/src/main.js` et `l4.js`. Chaque mouvement montre une
 * cause et son effet (ce que le vendeur fait, ce que le client voit) ; aucun ne
 * porte d'information : sous `prefers-reduced-motion`, tout est posé dans son
 * état final, immobile.
 *
 * POURQUOI DU DOM ET PAS DE L'ÉTAT REACT : tout ce qui est animé ici est rendu par
 * le SERVEUR, dans un composant que React ne re-rend jamais (la landing est
 * prérendue, sans état). Animer ces nœuds en place garde la page lisible sans
 * JavaScript, n'expédie aucun texte une seconde fois, et coûte un îlot au lieu de
 * huit. Les textes qui changent (légendes du studio, réponses de la validation)
 * arrivent par des attributs `data-*`, traduits par le serveur.
 *
 * Ce qui ne se porte pas de la maquette : le thème sombre, le menu (l'en-tête est
 * son propre composant), et les liens de relecture de la maquette.
 */
export function AnimationsLanding() {
  useEffect(() => {
    const racine = document.querySelector<HTMLElement>(".l4");
    if (!racine) return;
    const fenetre = window as Window & { __landing?: boolean };
    const html = document.documentElement;
    const nettoyages: Array<() => void> = [];
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointeurFin = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = racine): T[] => [...r.querySelectorAll<T>(s)];
    const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = racine): T | null => r.querySelector<T>(s);
    let vivant = true;
    const attendre = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const observer = (el: Element, fn: (e: IntersectionObserverEntry) => void, options?: IntersectionObserverInit) => {
      const o = new IntersectionObserver(([e]) => e && fn(e), options);
      o.observe(el);
      nettoyages.push(() => o.disconnect());
      return o;
    };
    const unefois = (el: Element, fn: () => void, seuil = 0.35) => {
      const o = observer(el, (e) => {
        if (e.isIntersecting) {
          o.disconnect();
          fn();
        }
      }, { threshold: seuil });
    };
    const ecouter = <K extends keyof WindowEventMap>(cible: Window | Element | Document, type: K, fn: (e: WindowEventMap[K]) => void, options?: AddEventListenerOptions) => {
      cible.addEventListener(type, fn as EventListener, options);
      nettoyages.push(() => cible.removeEventListener(type, fn as EventListener, options));
    };

    try {
    $$("[data-entree]").forEach((el, i) => el.style.setProperty("--i", String(i)));

    /* ---------- la couleur : le même algorithme que la vraie page client ---------- */
    const peindre = (pc: HTMLElement, a: AccentResolu) => {
      pc.style.setProperty("--pc-texte", a.texte);
      pc.style.setProperty("--pc-interface", a.interface);
      pc.style.setProperty("--pc-remplissage", a.remplissage);
      pc.style.setProperty("--pc-sur-remplissage", a.surRemplissage);
      pc.style.setProperty("--pc-teinte", a.teinte);
      pc.style.setProperty("--pc-sur-teinte", a.surTeinte);
    };
    $$(".pc").forEach((pc) => peindre(pc, resoudreAccent("#5B4BF5")));

    /* ---------- héros : le lien se déplie en page client ----------
       Le message part, son lien s'enfonce comme sous un doigt, et les cartes de la
       page client en sortent l'une après l'autre, reliées à lui par un fil. Puis la
       page vit comme le produit : le suivi passe « En transit », les photos
       arrivent, la cliente les approuve. L'état final est stable : rien ne boucle. */
    const hx = $("[data-hx]");
    if (hx) {
      const scene = $(".hx__scene", hx)!;
      const cartes = $$("[data-hx-carte]", hx);
      const lien = $("[data-hx-lien]", hx)!;
      const fils = $<SVGSVGElement>("[data-hx-fils]", hx)!;
      const frise = $("[data-hx-frise]", hx)!;
      const etapes = $$("li", frise);
      const bandeau = $("[data-hx-bandeau]", hx)!;
      const mouvement = $("[data-hx-mouvement]", hx)!;
      const photos = $$("[data-hx-photo]", hx);
      const tampon = $("[data-hx-tampon]", hx)!;
      const EO = "cubic-bezier(.23, 1, .32, 1)";
      const repere = (el: Element) => {
        // la scène est réduite par zoom sur tablette : on revient à ses unités
        const sb = scene.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const k = parseFloat((getComputedStyle(scene) as CSSStyleDeclaration & { zoom: string }).zoom) || 1;
        return { x: (r.left - sb.left) / k, y: (r.top - sb.top) / k, l: r.width / k, h: r.height / k };
      };
      const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
      let pose = reduit;
      const SVG = "http://www.w3.org/2000/svg";
      const tracer = () => {
        const o = repere(lien);
        const ocx = o.x + o.l / 2;
        const ocy = o.y + o.h / 2;
        fils.replaceChildren(
          ...cartes.flatMap((c) => {
            const r = repere(c);
            const tx = cl(ocx, r.x, r.x + r.l);
            const ty = cl(ocy, r.y, r.y + r.h);
            const horizontal = Math.abs(tx - ocx) > Math.abs(ty - ocy);
            const sx = horizontal ? o.x + o.l : cl(tx, o.x + 24, o.x + o.l - 24);
            const sy = horizontal ? ocy : o.y + o.h;
            const ex = horizontal ? tx : cl(sx + 40, r.x + 30, r.x + r.l - 30);
            const ey = horizontal ? cl(sy, r.y + 30, r.y + r.h - 30) : ty;
            const m = horizontal ? (ex - sx) / 2 : (ey - sy) / 2;
            const f = (n: number) => n.toFixed(1);
            const d = horizontal
              ? `M${f(sx)} ${f(sy)} C ${f(sx + m)} ${f(sy)}, ${f(ex - m)} ${f(ey)}, ${f(ex)} ${f(ey)}`
              : `M${f(sx)} ${f(sy)} C ${f(sx)} ${f(sy + m)}, ${f(ex)} ${f(ey - m)}, ${f(ex)} ${f(ey)}`;
            const chemin = document.createElementNS(SVG, "path");
            chemin.setAttribute("d", d);
            chemin.setAttribute("pathLength", "1");
            const point = document.createElementNS(SVG, "circle");
            point.setAttribute("cx", f(ex));
            point.setAttribute("cy", f(ey));
            point.setAttribute("r", "3.5");
            return [chemin, point];
          }),
        );
      };
      const enTransit = () => {
        frise.style.setProperty("--avance", "2");
        etapes[1]?.classList.replace("actuel", "fait");
        etapes[2]?.classList.add("actuel");
        bandeau.textContent = bandeau.dataset.apres ?? bandeau.textContent;
        mouvement.textContent = mouvement.dataset.apres ?? mouvement.textContent;
      };
      if (reduit) {
        enTransit();
        requestAnimationFrame(tracer);
      } else {
        cartes.forEach((c) => (c.style.opacity = "0"));
        photos.forEach((f) => (f.style.opacity = "0"));
        tampon.style.opacity = "0";
        // L'îlot tient désormais le masquage (en ligne, puis par le remplissage de chaque
        // animation) : la règle CSS qui cachait les cartes avant lui s'efface, pour que
        // rendre l'opacité au style (`""`, comme `l4.js`) les laisse visibles.
        hx.dataset.hxParti = "";
        void document.fonts.ready.then(() => {
          if (!vivant) return;
          try {
            tracer();
            const chemins = $$<SVGPathElement>("path", fils);
            chemins.forEach((p) => {
              p.style.strokeDasharray = "1 1";
              p.style.strokeDashoffset = "1";
            });
            const points = $$<SVGCircleElement>("circle", fils);
            const t0 = 650;
            lien.animate([{ transform: "scale(1)" }, { transform: "scale(.96)", offset: 0.35 }, { transform: "scale(1)" }], { duration: 420, delay: t0, easing: "ease-out" });
            lien.animate([{ boxShadow: "0 0 0 0 rgba(91, 75, 245, .45)" }, { boxShadow: "0 0 0 14px rgba(91, 75, 245, 0)" }], { duration: 700, delay: t0 + 120, easing: "ease-out" });
            const o = repere(lien);
            cartes.forEach((c, i) => {
              const r = repere(c);
              // chaque carte part du lien : déplacement et échelle calculés, pas devinés
              const dx = o.x + o.l / 2 - (r.x + r.l / 2);
              const dy = o.y + o.h / 2 - (r.y + r.h / 2);
              const d = t0 + 260 + i * 120;
              c.animate(
                [
                  { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.14)`, filter: "blur(10px)" },
                  { opacity: 1, offset: 0.35, filter: "blur(2px)" },
                  { opacity: 1, transform: "translate(0, 0) scale(1)", filter: "blur(0)" },
                ],
                { duration: 980, delay: d, easing: "cubic-bezier(.2, .9, .25, 1.08)", fill: "backwards" },
              ).finished.then(
                () => {
                  c.style.opacity = "";
                },
                // Annulée au démontage : la carte reste à son style, rien à rendre.
                () => undefined,
              );
              c.style.opacity = "";
              chemins[i]?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, delay: d - 120, easing: EO, fill: "both" });
              points[i]?.animate([{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "scale(1)" }], { duration: 360, delay: d + 420, easing: "cubic-bezier(.2, .9, .25, 1.3)", fill: "backwards" });
            });
            const tP = t0 + 1500;
            photos.forEach((f, i) => {
              f.animate([{ opacity: 0, transform: "translateY(-14px) scale(.9)" }, { opacity: 1, transform: "none" }], { duration: 520, delay: tP + i * 110, easing: "cubic-bezier(.2, .9, .25, 1.15)", fill: "backwards" });
              f.style.opacity = "";
            });
            const m1 = setTimeout(enTransit, t0 + 2300);
            const m2 = setTimeout(() => (pose = true), t0 + 1900);
            nettoyages.push(() => {
              clearTimeout(m1);
              clearTimeout(m2);
            });
            tampon.animate([{ opacity: 0, transform: "translateY(8px) scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 560, delay: tP + 1500, easing: "cubic-bezier(.2, .9, .25, 1.2)", fill: "backwards" });
            tampon.style.opacity = "";
          } catch (erreur) {
            // UNE SCÈNE QUI NE SE JOUE PAS RESTE LISIBLE (relecture du 03/10/2026) : sans ce
            // filet, une erreur ici laissait cartes, photos et tampon à l'opacité 0 posée en
            // ligne, pour toujours — retirer `js` ne touche pas un style en ligne.
            [...cartes, ...photos, tampon].forEach((e) => (e.style.opacity = ""));
            console.error("[landing] scène du héros interrompue", erreur);
          }
        });
      }
      // les fils suivent la mise en page ; pendant le parallaxe, ils restent posés
      const ro = new ResizeObserver(() => pose && tracer());
      ro.observe(scene);
      nettoyages.push(() => ro.disconnect());

      // la scène suit le pointeur : chaque carte selon sa profondeur
      if (!reduit && pointeurFin) {
        let cx = 0, cy = 0, x = 0, y = 0, enCours = false, dernier = 0;
        const pas = (now: number) => {
          if (!vivant) return;
          const dt = Math.min(64, now - (dernier || now));
          dernier = now;
          const a = 1 - Math.exp(-dt / 180);
          x += (cx - x) * a;
          y += (cy - y) * a;
          hx.style.setProperty("--hx-x", `${(x * 10).toFixed(2)}px`);
          hx.style.setProperty("--hx-y", `${(y * 8).toFixed(2)}px`);
          if (pose) tracer();
          if (Math.abs(cx - x) + Math.abs(cy - y) > 0.001) requestAnimationFrame(pas);
          else {
            enCours = false;
            dernier = 0;
          }
        };
        ecouter(window, "pointermove", (e) => {
          const r = hx.getBoundingClientRect();
          cx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.8)));
          cy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.8)));
          if (r.bottom < 0) return;
          if (!enCours) {
            enCours = true;
            requestAnimationFrame(pas);
          }
        }, { passive: true });
      }
    }

    /* ---------- les compteurs en rouleaux : chaque chiffre glisse jusqu'à sa valeur ---------- */
    $$("[data-compteur]").forEach((el) => {
      const valeur = el.dataset.compteur ?? "";
      if (reduit || !/^\d+$/.test(valeur)) return;
      // La valeur reste lisible par un lecteur d'écran : un `aria-label` sur un
      // élément générique est ignoré en mode lecture.
      const lisible = Object.assign(document.createElement("span"), { className: "visuellement-cache", textContent: valeur });
      el.replaceChildren(
        lisible,
        ...[...valeur].map((_, i) => {
          const rouleau = document.createElement("span");
          rouleau.className = "l4-rouleau";
          rouleau.setAttribute("aria-hidden", "true");
          const colonne = document.createElement("span");
          colonne.style.setProperty("--d", `${i * 90}ms`);
          colonne.append(...[..."0123456789"].map((d) => Object.assign(document.createElement("span"), { textContent: d })));
          rouleau.append(colonne);
          return rouleau;
        }),
      );
      unefois(el, () => {
        [...valeur].forEach((c, i) => {
          const colonne = el.children[i + 1]?.firstElementChild as HTMLElement | null;
          if (colonne) colonne.style.transform = `translateY(${-Number(c)}em)`;
        });
      }, 0.6);
    });

    /* ---------- la phrase qui s'éclaire mot par mot, au rythme du défilement ---------- */
    $$("[data-mots]").forEach((titre) => {
      if (reduit) return;
      const mots = $$(".l4-mot", titre);
      let attente = false;
      const maj = () => {
        attente = false;
        const r = titre.getBoundingClientRect();
        const h = innerHeight;
        // de 85 % à 40 % de la hauteur d'écran, la phrase s'allume en entier
        const p = Math.min(1, Math.max(0, (h * 0.85 - r.top) / (h * 0.45)));
        const n = Math.round(p * mots.length);
        mots.forEach((m, i) => m.classList.toggle("est-allume", i < n));
      };
      ecouter(window, "scroll", () => {
        if (!attente) {
          attente = true;
          requestAnimationFrame(maj);
        }
      }, { passive: true });
      maj();
    });

    /* ---------- la bordure lumineuse suit le pointeur ---------- */
    if (pointeurFin) {
      $$(".case, .offre, .l4-carte").forEach((c) => {
        ecouter(c, "pointermove", (e) => {
          const r = c.getBoundingClientRect();
          c.style.setProperty("--mx", `${e.clientX - r.left}px`);
          c.style.setProperty("--my", `${e.clientY - r.top}px`);
        });
      });
    }

    /* ---------- les cartes du vendeur s'animent une fois, quand on les regarde ---------- */
    $$("[data-anime]").forEach((carte) => {
      if (reduit) carte.classList.add("est-vu");
      else unefois(carte, () => carte.classList.add("est-vu"));
    });

    /* ---------- tarifs : les croix se posent sur le filet d'en-tête ---------- */
    const tp = $(".tp");
    const tete = tp ? $("thead", tp) : null;
    if (tp && tete) {
      const poser = () => tp.style.setProperty("--tp-croix", `${tete.offsetHeight - 5}px`);
      const ro = new ResizeObserver(poser);
      ro.observe(tete);
      nettoyages.push(() => ro.disconnect());
      poser();
    }

    /* ---------- le lien final s'écrit : votre boutique, à votre nom ---------- */
    const slug = $("[data-slug]");
    if (slug && !reduit) {
      const NOMS = (slug.dataset.slugs ?? "").split("|").filter(Boolean);
      let i = 0, visible = false, actif = false;
      const boucle = async () => {
        if (actif || NOMS.length < 2) return;
        actif = true;
        while (visible && vivant) {
          await attendre(2200);
          for (let t = slug.textContent ?? ""; t.length && vivant; t = t.slice(0, -1)) {
            slug.textContent = t.slice(0, -1);
            await attendre(38);
          }
          i = (i + 1) % NOMS.length;
          for (const c of NOMS[i] ?? "") {
            if (!vivant) break;
            slug.textContent += c;
            await attendre(70);
          }
        }
        actif = false;
      };
      observer(slug, (e) => {
        visible = e.isIntersecting;
        if (visible) void boucle();
      });
    }

    /* ---------- défileur des questions : hors de l'écran, annulé en retenant sa position ---------- */
    const piste = $("[data-defileur]");
    if (piste && !reduit) {
      const anim = piste.animate([{ transform: "translateX(0)" }, { transform: "translateX(-50%)" }], { duration: 44000, iterations: Infinity });
      let position: CSSNumberish | null = 0;
      observer(piste, (e) => {
        if (e.isIntersecting) {
          if (anim.playState === "idle") anim.currentTime = position;
          anim.play();
        } else if (anim.playState !== "idle") {
          position = anim.currentTime;
          anim.cancel();
        }
      });
      nettoyages.push(() => anim.cancel());
    }

    /* ---------- studio : quatre gestes, joués dans l'éditeur et sur la page ---------- */
    const plan = $("[data-studio]");
    if (plan) {
      const onglets = $$<HTMLButtonElement>("[data-onglet]");
      const legende = $("[data-legende]", plan)!;
      const LEGENDES = JSON.parse(plan.dataset.legendes ?? "[]") as string[];
      const modeleCompte = plan.dataset.compteModele ?? "{n}";
      const champClient = $('[data-champ="client"]', plan)!;
      const champSuivi = $('[data-champ="suivi"]', plan)!;
      const champTransp = $('[data-champ="transporteur"]', plan)!;
      const transporteur = $("[data-transporteur]", plan)!;
      const depot = $("[data-depot]", plan)!;
      const compte = $("[data-compte-medias]", plan)!;
      const partager = $("[data-partager]", plan)!;
      const lien = $("[data-lien]", plan)!;
      const apercu = $(".studio__apercu .pc", plan)!;
      apercu.setAttribute("data-etats", "");
      const frise = $("[data-pc-frise]", apercu)!;
      const comptePc = $("[data-pc-compte]", apercu)!;
      const sync = $(".studio__sync", plan)!;
      const DUREES = [4200, 3800, 5200, 4400];
      let jeton = 0, courant = 0, auto = !reduit, visible = false, survol = false;
      let jauge: Animation | null = null;
      let tJauge: CSSNumberish | null = 0;

      const valeur = (champ: HTMLElement) => $("[data-saisie]", champ)!;
      const signaler = () => {
        if (reduit) return;
        sync.classList.remove("pulse");
        void sync.offsetWidth;
        sync.classList.add("pulse");
      };
      const remplir = (champ: HTMLElement) => {
        const v = valeur(champ);
        v.textContent = v.dataset.saisie ?? "";
      };
      const vider = (champ: HTMLElement) => (valeur(champ).textContent = "");
      const compteDe = (n: number) => modeleCompte.replace("{n}", String(n));
      const taper = async (champ: HTMLElement, t: number) => {
        const v = valeur(champ);
        const texte = v.dataset.saisie ?? "";
        champ.classList.add("est-actif");
        v.textContent = "";
        await attendre(260);
        for (const lettre of texte) {
          if (t !== jeton || !vivant) return false;
          v.textContent += lettre;
          await attendre(texte.length > 8 ? 42 : 85);
        }
        await attendre(240);
        champ.classList.remove("est-actif");
        return t === jeton;
      };
      const poserFrise = (k: number) => {
        frise.style.setProperty("--avance", String(Math.min(k, 2)));
        $$("li", frise).forEach((li, i) => {
          li.classList.toggle("fait", i < k);
          li.classList.toggle("actuel", i === k);
        });
      };
      const etat = (n: number) => {
        [champClient, champSuivi, champTransp].forEach((c) => c.classList.remove("est-actif", "est-cherche"));
        if (n > 0) remplir(champClient);
        else vider(champClient);
        depot.classList.toggle("est-rempli", n > 1);
        compte.textContent = compteDe(n > 1 ? 4 : 0);
        comptePc.textContent = n > 1 ? "(4)" : "(0)";
        if (n > 2) remplir(champSuivi);
        else vider(champSuivi);
        transporteur.classList.toggle("est-detecte", n > 2);
        partager.classList.remove("est-copie", "est-presse");
        lien.classList.remove("est-visible");
        apercu.classList.toggle("a-client", n > 0);
        apercu.classList.toggle("a-photos", n > 1);
        apercu.classList.toggle("a-suivi", n > 2);
        frise.style.setProperty("--avance", n > 2 ? "2" : "0");
        $$("li", frise).forEach((li, i) => {
          li.classList.toggle("fait", n > 2 && i < 2);
          li.classList.toggle("actuel", n > 2 && i === 2);
        });
      };
      const jouer = async (n: number, t: number) => {
        etat(n);
        if (reduit) {
          etat(n + 1);
          if (n === 3) {
            partager.classList.add("est-copie");
            lien.classList.add("est-visible");
          }
          return;
        }
        if (n === 0 && (await taper(champClient, t))) {
          apercu.classList.add("a-client");
          signaler();
        }
        if (n === 1) {
          await attendre(300);
          if (t !== jeton) return;
          depot.classList.add("est-rempli");
          for (let k = 1; k <= 4; k += 1) {
            compte.textContent = compteDe(k);
            await attendre(60);
          }
          await attendre(260);
          if (t !== jeton) return;
          comptePc.textContent = "(4)";
          apercu.classList.add("a-photos");
          signaler();
        }
        if (n === 2) {
          if (!(await taper(champSuivi, t))) return;
          champTransp.classList.add("est-cherche");
          await attendre(900);
          if (t !== jeton) return;
          champTransp.classList.remove("est-cherche");
          transporteur.classList.add("est-detecte");
          await attendre(280);
          if (t !== jeton) return;
          apercu.classList.add("a-suivi");
          signaler();
          for (let k = 0; k < 3; k += 1) {
            await attendre(k ? 420 : 200);
            if (t !== jeton) return;
            poserFrise(k);
          }
        }
        if (n === 3) {
          await attendre(500);
          if (t !== jeton) return;
          partager.classList.add("est-presse");
          await attendre(140);
          partager.classList.remove("est-presse");
          partager.classList.add("est-copie");
          await attendre(240);
          if (t !== jeton) return;
          lien.classList.add("est-visible");
        }
      };
      // même règle que le défileur : hors de l'écran, la jauge est annulée en retenant sa position
      const geler = () => {
        if (jauge && jauge.playState !== "idle") {
          tJauge = jauge.currentTime;
          jauge.cancel();
        }
      };
      const reprendre = () => {
        if (!jauge) return;
        if (jauge.playState === "idle") jauge.currentTime = tJauge;
        jauge.play();
      };
      const lancerJauge = () => {
        jauge?.cancel();
        jauge = null;
        tJauge = 0;
        if (!auto) return;
        const barre = onglets[courant]?.querySelector(".studio__jauge");
        if (!barre) return;
        jauge = barre.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: DUREES[courant] ?? 4000, easing: "linear", fill: "forwards" });
        if (!visible) geler();
        else if (survol) jauge.pause();
        const ceJeton = jeton;
        jauge.onfinish = () => {
          if (ceJeton === jeton && auto && vivant) aller((courant + 1) % onglets.length);
        };
      };
      const aller = (n: number, focus = false) => {
        courant = n;
        jeton += 1;
        onglets.forEach((o, i) => {
          const actif = i === n;
          o.setAttribute("aria-selected", String(actif));
          o.tabIndex = actif ? 0 : -1;
        });
        if (focus) onglets[n]?.focus();
        const onglet = onglets[n];
        if (onglet) plan.setAttribute("aria-labelledby", onglet.id);
        plan.dataset.etape = String(n);
        // La légende ne s'annonce qu'une fois la démonstration prise en main : en
        // avance automatique, elle parlerait toutes les quatre secondes.
        if (!auto) legende.setAttribute("aria-live", "polite");
        legende.textContent = LEGENDES[n] ?? "";
        void jouer(n, jeton);
        lancerJauge();
      };
      onglets.forEach((o, i) => {
        ecouter(o, "click", () => {
          auto = false;
          aller(i);
        });
        ecouter(o, "keydown", (e) => {
          if (e.key === "Home" || e.key === "End") {
            e.preventDefault();
            auto = false;
            aller(e.key === "Home" ? 0 : onglets.length - 1, true);
            return;
          }
          const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          auto = false;
          aller((i + d + onglets.length) % onglets.length, true);
        });
      });
      ecouter(plan, "pointerenter", () => {
        survol = true;
        jauge?.pause();
      });
      ecouter(plan, "pointerleave", () => {
        survol = false;
        if (visible) reprendre();
      });
      // Au clavier aussi, la démonstration s'arrête dès qu'on y entre (WCAG 2.2.2).
      $$("[data-onglet]").forEach((o) =>
        ecouter(o, "focus", () => {
          auto = false;
          jauge?.cancel();
          jauge = null;
        }),
      );
      let demarre = false;
      observer(plan, (e) => {
        visible = e.isIntersecting;
        if (visible && !demarre) {
          demarre = true;
          aller(0);
          return;
        }
        if (!jauge) return;
        if (visible && !survol) reprendre();
        else if (!visible) geler();
        else jauge.pause();
      }, { threshold: 0.45 });
      nettoyages.push(() => jauge?.cancel());
      // État au repos : ce qu'on voit avant que la démo démarre, et sans mouvement
      etat(1);
    }

    /* ---------- couleurs : n'importe quelle teinte, toujours lisible ---------- */
    const cible = $("[data-teinte-cible] .pc");
    const pastilles = $$<HTMLButtonElement>("[data-teinte]");
    const libre = $<HTMLInputElement>("[data-couleur-libre]");
    const code = $("[data-code-couleur]");
    if (libre && code) {
      const etiquetteLibre = libre.closest("label");
      const libelleChoisie = code.firstChild?.textContent?.trim() ?? "";
      const libelleAjuste = code.dataset.ajuste ?? "";
      const choisir = (hex: string, source: Element, annoncer = true) => {
        const a = resoudreAccent(hex);
        if (cible) peindre(cible, a);
        const parPastille = source !== libre;
        pastilles.forEach((b) => {
          const ok = b === source;
          b.setAttribute("aria-checked", String(ok));
          b.tabIndex = ok || (!parPastille && b === pastilles[0]) ? 0 : -1;
        });
        etiquetteLibre?.classList.toggle("est-choisi", !parPastille);
        etiquetteLibre?.style.setProperty("--libre", a.brut);
        etiquetteLibre?.style.setProperty("--libre-encre", a.surRemplissage);
        const brut = Object.assign(document.createElement("code"), { textContent: a.brut });
        const morceaux: Node[] = [document.createTextNode(`${libelleChoisie} `), brut];
        if (a.ajuste) {
          const ajuste = document.createElement("span");
          ajuste.className = "ajuste";
          ajuste.append(`${libelleAjuste} `, Object.assign(document.createElement("code"), { textContent: a.texte }));
          morceaux.push(ajuste);
        }
        if (annoncer) code.replaceChildren(...morceaux);
      };
      pastilles.forEach((b, i) => {
        ecouter(b, "click", () => choisir(b.dataset.teinte ?? "#5B4BF5", b));
        ecouter(b, "keydown", (e) => {
          const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          const suivante = pastilles[(i + d + pastilles.length) % pastilles.length];
          suivante?.focus();
          suivante?.click();
        });
      });
      ecouter(libre, "input", () => choisir(libre.value, libre));
      const premiere = pastilles[0];
      // Au montage, la page est déjà peinte de la première teinte : on n'écrit rien
      // dans la région annoncée.
      if (premiere) choisir(premiere.dataset.teinte ?? "#5B4BF5", premiere, false);
    }

    /* ---------- validation des photos : une démonstration, aucun appel ---------- */
    const qc = $("[data-qc]");
    if (qc) {
      const question = $("[data-qc-question]", qc)!;
      const reponse = $("[data-qc-reponse]", qc)!;
      const texte = $("[data-qc-texte]", qc)!;
      const bascule = async (vers: HTMLElement) => {
        const de = vers === reponse ? question : reponse;
        if (!reduit) {
          de.classList.add("sort");
          await attendre(200);
        }
        de.hidden = true;
        de.classList.remove("sort");
        vers.hidden = false;
        if (!reduit && vers === reponse) {
          reponse.classList.remove("entre");
          void reponse.offsetWidth;
          reponse.classList.add("entre");
        }
        $(vers === reponse ? "[data-qc-changer]" : "[data-qc-approuver]", qc)?.focus({ preventScroll: true });
      };
      ecouter($("[data-qc-approuver]", qc)!, "click", () => {
        qc.classList.remove("est-refuse");
        texte.textContent = qc.dataset.approuve ?? "";
        void bascule(reponse);
      });
      ecouter($("[data-qc-refuser]", qc)!, "click", () => {
        qc.classList.add("est-refuse");
        texte.textContent = qc.dataset.refuse ?? "";
        void bascule(reponse);
      });
      ecouter($("[data-qc-changer]", qc)!, "click", () => void bascule(question));
    }

    /* ---------- langues : les trois lignes tournent quand la case est à l'écran ---------- */
    const lignes = $$(".langues__ligne");
    const caseLangues = $(".case--langues");
    if (!reduit && lignes.length && caseLangues) {
      let n = 0;
      let minuterie: ReturnType<typeof setInterval> | null = null;
      const tourner = () => {
        const avant = lignes[n];
        n = (n + 1) % lignes.length;
        avant?.classList.remove("est-actif");
        avant?.classList.add("sort");
        setTimeout(() => avant?.classList.remove("sort"), 380);
        lignes[n]?.classList.add("est-actif");
      };
      observer(caseLangues, (e) => {
        if (e.isIntersecting && !minuterie) minuterie = setInterval(tourner, 2400);
        else if (!e.isIntersecting && minuterie) {
          clearInterval(minuterie);
          minuterie = null;
        }
      }, { threshold: 0.5 });
      nettoyages.push(() => minuterie && clearInterval(minuterie));
    }

    /* ---------- la frise de la case livraison avance quand on la regarde ---------- */
    const friseDemo = $("[data-frise-demo]");
    if (friseDemo && !reduit) {
      const lis = $$("li", friseDemo);
      const poser = (k: number) => {
        friseDemo.style.setProperty("--avance", String(Math.min(k, 2)));
        lis.forEach((li, i) => {
          li.classList.toggle("fait", i < k);
          li.classList.toggle("actuel", i === k);
        });
      };
      unefois(friseDemo, () => {
        poser(0);
        void (async () => {
          for (let k = 1; k <= 2 && vivant; k += 1) {
            await attendre(460);
            poser(k);
          }
        })();
      }, 0.6);
    }

    /* ---------- apparitions au défilement : une seule fois ---------- */
    const apparitions = new IntersectionObserver(
      (entrees) => {
        entrees.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("est-visible");
            apparitions.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    nettoyages.push(() => apparitions.disconnect());
    $$("[data-apparait]").forEach((el) => {
      const freres = [...(el.parentElement?.children ?? [])].filter((c) => c.matches(".case, .offre, .final__boite > *"));
      el.style.setProperty("--i", String(Math.max(0, freres.indexOf(el))));
      apparitions.observe(el);
    });

    fenetre.__landing = true;
    } catch (erreur) {
      /*
       * UNE ANIMATION QUI LÈVE NE DOIT RIEN LAISSER MASQUÉ. Sans ce filet, une
       * exception remonterait à la frontière d'erreur (toute la landing remplacée
       * par l'écran d'erreur), ou laisserait les apparitions à opacité nulle :
       * on retire la classe `js`, et tout s'affiche dans son état final.
       */
      console.error("[landing] animation interrompue —", erreur instanceof Error ? erreur.message : erreur);
      html.classList.remove("js", "attente");
    }

    return () => {
      vivant = false;
      nettoyages.forEach((n) => n());
      // La classe `js` vit avec le document (`ScriptJs`) : toutes les surfaces la
      // portent, comme dans la maquette où chaque script de page la pose.
      delete fenetre.__landing;
    };
  }, []);

  return null;
}

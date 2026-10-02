// DropLink · landing v4 : la grammaire de mouvement des grands SaaS.
// Chiffres en rouleaux, phrase qui s'éclaire au défilement, bordure qui suit
// le pointeur, cartes qui s'animent une fois, lien final qui s'écrit.
// Rien ne porte d'information : sous prefers-reduced-motion, tout est posé
// dans son état final, immobile.
(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const unefois = (el, fn, seuil = .35) => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { o.disconnect(); fn(); } }, { threshold: seuil });
    o.observe(el);
  };

  /* ---------- héros : le lien se déplie en page client ----------
     Le message part, son lien s'enfonce comme sous un doigt, et les trois
     cartes de la page client en sortent l'une après l'autre, reliées à lui par
     un fil. Puis la page vit comme le produit : le suivi passe « En transit »,
     les photos arrivent, la cliente les approuve. L'état final est stable :
     rien ne boucle, rien n'invente d'événement. */
  const hx = document.querySelector("[data-hx]");
  if (hx) {
    const scene = hx.querySelector(".hx__scene");
    const cartes = $$("[data-hx-carte]", hx);
    const lien = hx.querySelector("[data-hx-lien]");
    const fils = hx.querySelector("[data-hx-fils]");
    const frise = hx.querySelector("[data-hx-frise]"), etapes = $$("li", frise);
    const bandeau = hx.querySelector("[data-hx-bandeau]"), mouvement = hx.querySelector("[data-hx-mouvement]");
    const photos = $$("[data-hx-photo]", hx), tampon = hx.querySelector("[data-hx-tampon]");
    const EO = "cubic-bezier(.23, 1, .32, 1)";
    // dans le repère de la scène, avant zoom
    const repere = (el) => {
      // la scène est réduite par zoom sur tablette : on revient à ses unités
      const sb = scene.getBoundingClientRect(), r = el.getBoundingClientRect(), k = parseFloat(getComputedStyle(scene).zoom) || 1;
      return { x: (r.left - sb.left) / k, y: (r.top - sb.top) / k, l: r.width / k, h: r.height / k };
    };
    // un fil part du bord du lien et arrive au bord de chaque carte, au point le plus proche
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    let pose = reduit; // l'ouverture est jouée : les fils peuvent suivre le parallaxe
    const tracer = () => {
      const o = repere(lien), ocx = o.x + o.l / 2, ocy = o.y + o.h / 2;
      fils.innerHTML = cartes.map((c) => {
        const r = repere(c);
        const tx = cl(ocx, r.x, r.x + r.l), ty = cl(ocy, r.y, r.y + r.h);
        const horizontal = Math.abs(tx - ocx) > Math.abs(ty - ocy);
        const sx = horizontal ? o.x + o.l : cl(tx, o.x + 24, o.x + o.l - 24), sy = horizontal ? ocy : o.y + o.h;
        const ex = horizontal ? tx : cl(sx + 40, r.x + 30, r.x + r.l - 30), ey = horizontal ? cl(sy, r.y + 30, r.y + r.h - 30) : ty;
        const m = horizontal ? (ex - sx) / 2 : (ey - sy) / 2;
        const d = horizontal ? `M${sx} ${sy} C ${sx + m} ${sy}, ${ex - m} ${ey}, ${ex} ${ey}` : `M${sx} ${sy} C ${sx} ${sy + m}, ${ex} ${ey - m}, ${ex} ${ey}`;
        return `<path d="${d.replace(/\d+\.\d+/g, (n) => (+n).toFixed(1))}" pathLength="1"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.5"/>`;
      }).join("");
    };
    const enTransit = () => {
      frise.style.setProperty("--avance", "2");
      etapes[1].classList.replace("actuel", "fait");
      etapes[2].classList.add("actuel");
      bandeau.textContent = "Votre colis est en transit";
      mouvement.textContent = "Colissimo · Mouvement aujourd’hui";
    };

    if (reduit) { enTransit(); requestAnimationFrame(tracer); }
    else {
      cartes.forEach((c) => { c.style.opacity = "0"; });
      photos.forEach((f) => { f.style.opacity = "0"; });
      tampon.style.opacity = "0";
      document.fonts.ready.then(() => {
        tracer();
        const chemins = $$("path", fils);
        chemins.forEach((p) => { p.style.strokeDasharray = "1 1"; p.style.strokeDashoffset = "1"; });
        const points = $$("circle", fils);
        const t0 = 650;
        // le lien s'enfonce, puis rebondit : on vient de l'ouvrir
        lien.animate([{ transform: "scale(1)" }, { transform: "scale(.96)", offset: .35 }, { transform: "scale(1)" }], { duration: 420, delay: t0, easing: "ease-out" });
        lien.animate([{ boxShadow: "0 0 0 0 rgba(91, 75, 245, .45)" }, { boxShadow: "0 0 0 14px rgba(91, 75, 245, 0)" }], { duration: 700, delay: t0 + 120, easing: "ease-out" });
        const o = repere(lien);
        cartes.forEach((c, i) => {
          const r = repere(c);
          // chaque carte part du lien : déplacement et échelle calculés, pas devinés
          const dx = o.x + o.l / 2 - (r.x + r.l / 2), dy = o.y + o.h / 2 - (r.y + r.h / 2);
          const d = t0 + 260 + i * 120;
          c.animate([
            { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.14)`, filter: "blur(10px)" },
            { opacity: 1, offset: .35, filter: "blur(2px)" },
            { opacity: 1, transform: "translate(0, 0) scale(1)", filter: "blur(0)" },
          ], { duration: 980, delay: d, easing: "cubic-bezier(.2, .9, .25, 1.08)", fill: "backwards" })
            .finished.then(() => { c.style.opacity = ""; });
          c.style.opacity = "";
          const p = chemins[i];
          p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, delay: d - 120, easing: EO, fill: "both" });
          points[i].animate([{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "scale(1)" }], { duration: 360, delay: d + 420, easing: "cubic-bezier(.2, .9, .25, 1.3)", fill: "backwards" });
        });
        // la page vit : photos, suivi, validation
        const tP = t0 + 1500;
        photos.forEach((f, i) => {
          f.animate([{ opacity: 0, transform: "translateY(-14px) scale(.9)" }, { opacity: 1, transform: "none" }], { duration: 520, delay: tP + i * 110, easing: "cubic-bezier(.2, .9, .25, 1.15)", fill: "backwards" });
          f.style.opacity = "";
        });
        setTimeout(enTransit, t0 + 2300);
        setTimeout(() => { pose = true; }, t0 + 1900);
        tampon.animate([{ opacity: 0, transform: "translateY(8px) scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 560, delay: tP + 1500, easing: "cubic-bezier(.2, .9, .25, 1.2)", fill: "backwards" });
        tampon.style.opacity = "";
      });
    }
    // les fils suivent la mise en page ; pendant le parallaxe, ils restent posés (les cartes ne bougent que de quelques pixels)
    new ResizeObserver(() => { if (pose) tracer(); }).observe(scene);

    // la scène suit le pointeur : chaque carte selon sa profondeur, le plan s'incline à peine
    if (!reduit && matchMedia("(hover: hover) and (pointer: fine)").matches) {
      let cx = 0, cy = 0, x = 0, y = 0, enCours = false, dernier = 0;
      const pas = (now) => {
        const dt = Math.min(64, now - (dernier || now)); dernier = now;
        const a = 1 - Math.exp(-dt / 180);
        x += (cx - x) * a; y += (cy - y) * a;
        hx.style.setProperty("--hx-x", `${(x * 10).toFixed(2)}px`);
        hx.style.setProperty("--hx-y", `${(y * 8).toFixed(2)}px`);
        if (pose) tracer();
        if (Math.abs(cx - x) + Math.abs(cy - y) > .001) requestAnimationFrame(pas); else { enCours = false; dernier = 0; }
      };
      addEventListener("pointermove", (e) => {
        const r = hx.getBoundingClientRect();
        cx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * .8)));
        cy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * .8)));
        if (r.bottom < 0) return;
        if (!enCours) { enCours = true; requestAnimationFrame(pas); }
      }, { passive: true });
    }
  }

  /* ---------- les compteurs en rouleaux ----------
     Chaque chiffre est une colonne 0 à 9 qui glisse jusqu'à sa valeur. Le
     nombre reste lisible tel quel pour les lecteurs d'écran. */
  $$("[data-compteur]").forEach((el) => {
    const valeur = el.dataset.compteur;
    if (reduit) return;
    el.setAttribute("aria-label", valeur);
    el.innerHTML = [...valeur].map((c, i) => `<span class="l4-rouleau" aria-hidden="true"><span style="--d:${i * 90}ms">${"0123456789".split("").map((d) => `<span>${d}</span>`).join("")}</span></span>`).join("");
    unefois(el, () => {
      [...valeur].forEach((c, i) => { el.children[i].firstElementChild.style.transform = `translateY(${-Number(c)}em)`; });
    }, .6);
  });

  /* ---------- la phrase qui s'éclaire mot par mot, au rythme du défilement ---------- */
  $$("[data-mots]").forEach((titre) => {
    const parcourir = (n) => [...n.childNodes].forEach((c) => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach((m) => {
          if (!m) return;
          if (/^\s+$/.test(m)) { frag.append(m); return; }
          const s = document.createElement("span"); s.className = "l4-mot"; s.textContent = m; frag.append(s);
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1 && c.tagName !== "BR") parcourir(c);
    });
    parcourir(titre);
    if (reduit) return;
    const mots = $$(".l4-mot", titre);
    let attente = false;
    const maj = () => {
      attente = false;
      const r = titre.getBoundingClientRect(), h = innerHeight;
      // de 85 % à 40 % de la hauteur d'écran, la phrase s'allume en entier
      const p = Math.min(1, Math.max(0, (h * .85 - r.top) / (h * .45)));
      const n = Math.round(p * mots.length);
      mots.forEach((m, i) => m.classList.toggle("est-allume", i < n));
    };
    addEventListener("scroll", () => { if (!attente) { attente = true; requestAnimationFrame(maj); } }, { passive: true });
    maj();
  });

  /* ---------- la bordure lumineuse suit le pointeur ---------- */
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    $$(".l4 .case, .l4 .offre, .l4-carte").forEach((c) => {
      c.addEventListener("pointermove", (e) => {
        const r = c.getBoundingClientRect();
        c.style.setProperty("--mx", `${e.clientX - r.left}px`);
        c.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });
  }

  /* ---------- les cartes du vendeur s'animent une fois, quand on les regarde ---------- */
  $$("[data-anime]").forEach((carte) => {
    $$(".l4-barres i, .l4-envois li", carte).forEach((el, i) => el.style.setProperty("--n", String(i)));
    if (reduit) { carte.classList.add("est-vu"); return; }
    unefois(carte, () => carte.classList.add("est-vu"));
  });

  /* ---------- tarifs : les croix se posent sur le filet d'en-tête, quelle que soit sa hauteur ---------- */
  const tp = document.querySelector(".tp");
  if (tp) {
    const tete = tp.querySelector("thead");
    const poser = () => tp.style.setProperty("--tp-croix", `${tete.offsetHeight - 5}px`);
    new ResizeObserver(poser).observe(tete); poser();
  }

  /* ---------- le lien final s'écrit : votre boutique, à votre nom ---------- */
  const slug = document.querySelector("[data-slug]");
  if (slug && !reduit) {
    const NOMS = ["atelier-nord", "votre-boutique", "studio-kaia", "maison-lou"];
    let i = 0, visible = false, actif = false;
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    const boucle = async () => {
      if (actif) return; actif = true;
      while (visible) {
        await pause(2200);
        for (let t = slug.textContent; t.length; t = t.slice(0, -1)) { slug.textContent = t.slice(0, -1); await pause(38); }
        i = (i + 1) % NOMS.length;
        for (const c of NOMS[i]) { slug.textContent += c; await pause(70); }
      }
      actif = false;
    };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) boucle(); }).observe(slug);
  }
})();

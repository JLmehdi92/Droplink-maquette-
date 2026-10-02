// DropLink · landing v3
// Chaque mouvement montre une cause et son effet : ce que le vendeur fait,
// ce que le client voit. Aucun ne porte d'information : sous
// prefers-reduced-motion, tout reste lisible, immobile, et dans son état final.
(() => {
  const racine = document.documentElement;
  racine.classList.add("js");
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

  document.querySelectorAll("[data-entree]").forEach((el, i) => el.style.setProperty("--i", i));
  requestAnimationFrame(() => racine.classList.add("pret"));

  /* ---------- Thème ---------- */
  const boutonsTheme = document.querySelectorAll("[data-theme-choix]");
  const lireTheme = () => { try { return localStorage.getItem("dl-theme"); } catch { return null; } };
  const appliquerTheme = (t) => {
    if (t) racine.setAttribute("data-theme", t);
    const effectif = racine.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    boutonsTheme.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoix === effectif)));
  };
  appliquerTheme(lireTheme());
  boutonsTheme.forEach((b) => b.addEventListener("click", () => {
    try { localStorage.setItem("dl-theme", b.dataset.themeChoix); } catch { /* stockage indisponible : le choix vaut pour la visite */ }
    appliquerTheme(b.dataset.themeChoix);
  }));

  /* ---------- En-tête et menu ---------- */
  const entete = document.querySelector("[data-entete]");
  // Une sentinelle de 8 px en haut de page : dès qu'elle sort, l'en-tête recouvre du contenu.
  const sentinelle = document.querySelector("[data-sentinelle]");
  if (sentinelle) new IntersectionObserver(([e]) => entete.classList.toggle("est-defile", !e.isIntersecting)).observe(sentinelle);

  const menuBouton = document.querySelector("[data-menu-bouton]");
  const menu = document.querySelector("[data-menu]");
  const basculerMenu = (ouvrir) => {
    menu.hidden = !ouvrir;
    menuBouton.setAttribute("aria-expanded", String(ouvrir));
    menuBouton.setAttribute("aria-label", ouvrir ? "Fermer le menu" : "Ouvrir le menu");
    menuBouton.querySelector("use").setAttribute("href", ouvrir ? "#i-x" : "#i-menu");
  };
  menuBouton.addEventListener("click", () => basculerMenu(menu.hidden));
  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => basculerMenu(false)));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { basculerMenu(false); menuBouton.focus(); } });

  /* ---------- Contraste : l'algorithme du produit (lib/design/contraste.ts) ----------
     Porté tel quel : la démo de couleur applique la même règle que la vraie page. */
  const hexVersRvb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); if (!m) return null; const n = parseInt(m[1], 16); return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 }; };
  const rvbVersHex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
  const lum = ({ r, g, b }) => { const c = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const quant = ({ r, g, b }) => ({ r: Math.max(0, Math.min(255, Math.round(r))), g: Math.max(0, Math.min(255, Math.round(g))), b: Math.max(0, Math.min(255, Math.round(b))) });
  const versTsl = ({ r, g, b }) => {
    const rn = r / 255, gn = g / 255, bn = b / 255, max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), l = (max + min) / 2, d = max - min;
    if (d === 0) return { t: 0, s: 0, l };
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const t = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6 : max === gn ? ((bn - rn) / d + 2) / 6 : ((rn - gn) / d + 4) / 6;
    return { t, s, l };
  };
  const versRvb = ({ t, s, l }) => {
    if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const c = (dec) => { let x = t + dec; if (x < 0) x += 1; if (x > 1) x -= 1; if (x < 1 / 6) return p + (q - p) * 6 * x; if (x < 1 / 2) return q; if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6; return p; };
    return { r: c(1 / 3) * 255, g: c(0) * 255, b: c(-1 / 3) * 255 };
  };
  const ajuster = (couleur, fond, vise) => {
    const f = quant(fond);
    if (ratio(quant(couleur), f) >= vise) return couleur;
    const tsl = versTsl(couleur), clair = lum(f) > 0.18;
    let bas = clair ? 0 : tsl.l, haut = clair ? tsl.l : 1, meilleure = quant(versRvb({ ...tsl, l: clair ? 0 : 1 }));
    for (let i = 0; i < 24; i += 1) {
      const m = (bas + haut) / 2, cand = quant(versRvb({ ...tsl, l: m }));
      if (ratio(cand, f) >= vise) { meilleure = cand; if (clair) bas = m; else haut = m; } else if (clair) haut = m; else bas = m;
    }
    return meilleure;
  };
  const BLANC = { r: 255, g: 255, b: 255 }, ENCRE = { r: 0x11, g: 0x11, b: 0x17 };
  const resoudreAccent = (hex) => {
    const base = hexVersRvb(hex) || hexVersRvb("#5B4BF5");
    const texte = ajuster(base, BLANC, 4.5), ui = ajuster(base, BLANC, 3);
    let remplissage = ajuster(base, BLANC, 3);
    const sur = ratio(remplissage, BLANC) >= ratio(remplissage, ENCRE) ? BLANC : ENCRE;
    if (ratio(quant(remplissage), sur) < 4.5) remplissage = ajuster(remplissage, sur, 4.5);
    const teinte = quant({ r: 255 + (ui.r - 255) * 0.1, g: 255 + (ui.g - 255) * 0.1, b: 255 + (ui.b - 255) * 0.1 });
    return { brut: rvbVersHex(base), texte: rvbVersHex(texte), interface: rvbVersHex(ui), remplissage: rvbVersHex(remplissage), surRemplissage: rvbVersHex(sur), teinte: rvbVersHex(teinte), surTeinte: rvbVersHex(ajuster(texte, teinte, 4.5)), ajuste: rvbVersHex(texte) !== rvbVersHex(base) };
  };
  const peindre = (pc, a) => {
    pc.style.setProperty("--pc-texte", a.texte);
    pc.style.setProperty("--pc-interface", a.interface);
    pc.style.setProperty("--pc-remplissage", a.remplissage);
    pc.style.setProperty("--pc-sur-remplissage", a.surRemplissage);
    pc.style.setProperty("--pc-teinte", a.teinte);
    pc.style.setProperty("--pc-sur-teinte", a.surTeinte);
  };
  document.querySelectorAll(".pc").forEach((pc) => peindre(pc, resoudreAccent("#5B4BF5")));

  /* ---------- Défileur des questions ---------- */
  const piste = document.querySelector("[data-defileur]");
  if (piste) {
    piste.append(...[...piste.children].map((n) => n.cloneNode(true)));
    if (!reduit) {
      const anim = piste.animate([{ transform: "translateX(0)" }, { transform: "translateX(-50%)" }], { duration: 44000, iterations: Infinity });
      // Hors de l'écran, l'animation est annulée (pas mise en pause) en retenant sa position :
      // une animation en pause reste active, garde son calque et fait promouvoir tout ce qui
      // est peint après elle. Elle reprend exactement là où elle s'était arrêtée.
      let position = 0;
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { if (anim.playState === "idle") anim.currentTime = position; anim.play(); }
        else if (anim.playState !== "idle") { position = anim.currentTime; anim.cancel(); }
      }).observe(piste);
    }
  }

  /* ---------- Studio : quatre gestes, joués dans l'éditeur et sur la page ---------- */
  const plan = document.querySelector("[data-studio]");
  if (plan) {
    const onglets = [...document.querySelectorAll("[data-onglet]")];
    const legende = plan.querySelector("[data-legende]");
    const champClient = plan.querySelector('[data-champ="client"]');
    const champSuivi = plan.querySelector('[data-champ="suivi"]');
    const champTransp = plan.querySelector('[data-champ="transporteur"]');
    const transporteur = plan.querySelector("[data-transporteur]");
    const depot = plan.querySelector("[data-depot]");
    const compte = plan.querySelector("[data-compte-medias]");
    const partager = plan.querySelector("[data-partager]");
    const lien = plan.querySelector("[data-lien]");
    const apercu = plan.querySelector(".studio__apercu .pc");
    apercu.setAttribute("data-etats", "");
    const frise = apercu.querySelector("[data-pc-frise]");
    const sync = plan.querySelector(".studio__sync");
    const LEGENDES = [
      "Un nom ou un pseudo suffit. Pas d'adresse à saisir, pas de compte à lui créer.",
      "Glissez vos photos et vidéos, jusqu'à 20 par commande. La première sert de couverture.",
      "Collez le numéro : le transporteur est reconnu et les étapes se mettent à jour seules.",
      "Un clic sur Partager et le lien est copié. Il ne change plus, même quand vous modifiez la commande.",
    ];
    const DUREES = [4200, 3800, 5200, 4400];
    let jeton = 0, courant = 0, auto = !reduit, jauge = null, visible = false, survol = false;

    const valeur = (champ) => champ.querySelector("[data-saisie]");
    const signaler = () => { if (reduit) return; sync.classList.remove("pulse"); void sync.offsetWidth; sync.classList.add("pulse"); };
    const remplir = (champ) => { const v = valeur(champ); v.textContent = v.dataset.saisie; };
    const vider = (champ) => { valeur(champ).textContent = ""; };
    const taper = async (champ, t) => {
      const v = valeur(champ), texte = v.dataset.saisie;
      champ.classList.add("est-actif"); v.textContent = "";
      await attendre(260);
      for (const lettre of texte) { if (t !== jeton) return false; v.textContent += lettre; await attendre(texte.length > 8 ? 42 : 85); }
      await attendre(240); champ.classList.remove("est-actif");
      return t === jeton;
    };
    const etat = (n) => {
      // état final de toutes les étapes avant n, sans animation
      [champClient, champSuivi, champTransp].forEach((c) => c.classList.remove("est-actif", "est-cherche"));
      if (n > 0) remplir(champClient); else vider(champClient);
      depot.classList.toggle("est-rempli", n > 1);
      compte.textContent = n > 1 ? "4 sur 20" : "0 sur 20";
      apercu.querySelector("[data-pc-compte]").textContent = n > 1 ? "(4)" : "(0)";
      if (n > 2) remplir(champSuivi); else vider(champSuivi);
      transporteur.classList.toggle("est-detecte", n > 2);
      partager.classList.remove("est-copie", "est-presse");
      lien.classList.remove("est-visible");
      apercu.classList.toggle("a-client", n > 0);
      apercu.classList.toggle("a-photos", n > 1);
      apercu.classList.toggle("a-suivi", n > 2);
      frise.style.setProperty("--avance", n > 2 ? "2" : "0");
      frise.querySelectorAll("li").forEach((li, i) => { li.classList.toggle("fait", n > 2 && i < 2); li.classList.toggle("actuel", n > 2 && i === 2); });
    };
    const jouer = async (n, t) => {
      etat(n);
      if (reduit) { etat(n + 1); if (n === 3) { partager.classList.add("est-copie"); lien.classList.add("est-visible"); } return; }
      if (n === 0) { if (await taper(champClient, t)) { apercu.classList.add("a-client"); signaler(); } }
      if (n === 1) {
        await attendre(300); if (t !== jeton) return;
        depot.classList.add("est-rempli");
        for (let k = 1; k <= 4; k += 1) { compte.textContent = `${k} sur 20`; await attendre(60); }
        await attendre(260); if (t !== jeton) return;
        apercu.querySelector("[data-pc-compte]").textContent = "(4)";
        apercu.classList.add("a-photos"); signaler();
      }
      if (n === 2) {
        if (!(await taper(champSuivi, t))) return;
        champTransp.classList.add("est-cherche"); await attendre(900); if (t !== jeton) return;
        champTransp.classList.remove("est-cherche"); transporteur.classList.add("est-detecte");
        await attendre(280); if (t !== jeton) return;
        apercu.classList.add("a-suivi"); signaler();
        const lis = frise.querySelectorAll("li");
        for (let k = 0; k < 3; k += 1) {
          await attendre(k ? 420 : 200); if (t !== jeton) return;
          frise.style.setProperty("--avance", String(Math.min(k, 2)));
          lis.forEach((li, i) => { li.classList.toggle("fait", i < k); li.classList.toggle("actuel", i === k); });
        }
      }
      if (n === 3) {
        await attendre(500); if (t !== jeton) return;
        partager.classList.add("est-presse"); await attendre(140);
        partager.classList.remove("est-presse"); partager.classList.add("est-copie");
        await attendre(240); if (t !== jeton) return;
        lien.classList.add("est-visible");
      }
    };
    // même règle que le défileur : hors de l'écran, annulée en retenant sa position
    let tJauge = 0;
    const geler = () => { if (jauge && jauge.playState !== "idle") { tJauge = jauge.currentTime; jauge.cancel(); } };
    const reprendre = () => { if (!jauge) return; if (jauge.playState === "idle") jauge.currentTime = tJauge; jauge.play(); };
    const lancerJauge = () => {
      jauge?.cancel(); jauge = null; tJauge = 0;
      if (!auto) return;
      const barre = onglets[courant].querySelector(".studio__jauge");
      jauge = barre.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: DUREES[courant], easing: "linear", fill: "forwards" });
      if (!visible) geler(); else if (survol) jauge.pause();
      const ceJeton = jeton;
      jauge.onfinish = () => { if (ceJeton === jeton && auto) aller((courant + 1) % onglets.length); };
    };
    const aller = (n, { focus = false } = {}) => {
      courant = n; jeton += 1;
      onglets.forEach((o, i) => { const actif = i === n; o.setAttribute("aria-selected", String(actif)); o.tabIndex = actif ? 0 : -1; });
      if (focus) onglets[n].focus();
      plan.setAttribute("aria-labelledby", onglets[n].id);
      plan.dataset.etape = String(n);
      legende.textContent = LEGENDES[n];
      jouer(n, jeton);
      lancerJauge();
    };
    onglets.forEach((o, i) => {
      o.addEventListener("click", () => { auto = false; aller(i); });
      o.addEventListener("keydown", (e) => {
        if (e.key === "Home" || e.key === "End") { e.preventDefault(); auto = false; aller(e.key === "Home" ? 0 : onglets.length - 1, { focus: true }); return; }
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault(); auto = false; aller((i + d + onglets.length) % onglets.length, { focus: true });
      });
    });
    plan.addEventListener("pointerenter", () => { survol = true; jauge?.pause(); });
    plan.addEventListener("pointerleave", () => { survol = false; if (visible) reprendre(); });
    let demarre = false;
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !demarre) { demarre = true; aller(0); return; }
      if (!jauge) return;
      if (visible && !survol) reprendre(); else if (!visible) geler(); else jauge.pause();
    }, { threshold: .45 }).observe(plan);
    // État au repos : ce qu'on voit avant que la démo démarre, et sans mouvement
    etat(1);
  }

  /* ---------- Couleurs : n'importe quelle teinte, toujours lisible ---------- */
  const cible = document.querySelector("[data-teinte-cible] .pc");
  const pastilles = [...document.querySelectorAll("[data-teinte]")];
  const libre = document.querySelector("[data-couleur-libre]");
  const code = document.querySelector("[data-code-couleur]");
  const choisir = (hex, source) => {
    const a = resoudreAccent(hex);
    if (cible) peindre(cible, a);
    const parPastille = source !== libre;
    pastilles.forEach((b) => { const ok = b === source; b.setAttribute("aria-checked", String(ok)); b.tabIndex = ok || (!parPastille && b === pastilles[0]) ? 0 : -1; });
    const etiquette = libre.closest("label");
    etiquette.classList.toggle("est-choisi", !parPastille);
    etiquette.style.setProperty("--libre", a.brut);
    etiquette.style.setProperty("--libre-encre", a.surRemplissage);
    code.innerHTML = `Couleur choisie <code>${a.brut}</code>` + (a.ajuste ? `<span class="ajuste">Texte ajusté : <code>${a.texte}</code></span>` : "");
  };
  pastilles.forEach((b, i) => {
    b.addEventListener("click", () => choisir(b.dataset.teinte, b));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = (i + d + pastilles.length) % pastilles.length;
      pastilles[n].focus(); pastilles[n].click();
    });
  });
  libre?.addEventListener("input", () => choisir(libre.value, libre));
  if (pastilles[0]) choisir(pastilles[0].dataset.teinte, pastilles[0]);

  /* ---------- Validation des photos ---------- */
  const qc = document.querySelector("[data-qc]");
  if (qc) {
    const question = qc.querySelector("[data-qc-question]");
    const reponse = qc.querySelector("[data-qc-reponse]");
    const texte = qc.querySelector("[data-qc-texte]");
    const sceau = qc.querySelector("[data-qc-sceau] use");
    const bascule = async (vers) => {
      const de = vers === reponse ? question : reponse;
      if (!reduit) { de.classList.add("sort"); await attendre(200); }
      de.hidden = true; de.classList.remove("sort");
      vers.hidden = false;
      if (!reduit && vers === reponse) { reponse.classList.remove("entre"); void reponse.offsetWidth; reponse.classList.add("entre"); }
      (vers === reponse ? qc.querySelector("[data-qc-changer]") : qc.querySelector("[data-qc-approuver]")).focus({ preventScroll: true });
    };
    qc.querySelector("[data-qc-approuver]").addEventListener("click", () => { qc.classList.remove("est-refuse"); texte.textContent = "Cette commande est validée."; sceau.setAttribute("href", "#i-check"); bascule(reponse); });
    qc.querySelector("[data-qc-refuser]").addEventListener("click", () => { qc.classList.add("est-refuse"); texte.textContent = "Un problème a été signalé sur cette commande. Le vendeur est prévenu."; sceau.setAttribute("href", "#i-message-circle"); bascule(reponse); });
    qc.querySelector("[data-qc-changer]").addEventListener("click", () => bascule(question));
  }

  /* ---------- Langues ---------- */
  const lignes = [...document.querySelectorAll(".langues__ligne")];
  const caseLangues = document.querySelector(".case--langues");
  if (!reduit && lignes.length) {
    let n = 0, minuterie = null;
    const tourner = () => {
      const avant = lignes[n]; n = (n + 1) % lignes.length;
      avant.classList.remove("est-actif"); avant.classList.add("sort");
      setTimeout(() => avant.classList.remove("sort"), 380);
      lignes[n].classList.add("est-actif");
    };
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !minuterie) minuterie = setInterval(tourner, 2400);
      else if (!e.isIntersecting) { clearInterval(minuterie); minuterie = null; }
    }, { threshold: .5 }).observe(caseLangues);
  }

  /* ---------- Frise de la case livraison : elle avance quand on la regarde ---------- */
  const friseDemo = document.querySelector("[data-frise-demo]");
  if (friseDemo && !reduit) {
    const lis = friseDemo.querySelectorAll("li");
    const poser = (k) => { friseDemo.style.setProperty("--avance", String(Math.min(k, 2))); lis.forEach((li, i) => { li.classList.toggle("fait", i < k); li.classList.toggle("actuel", i === k); }); };
    const obs = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      poser(0);
      for (let k = 1; k <= 2; k += 1) { await attendre(460); poser(k); }
    }, { threshold: .6 });
    obs.observe(friseDemo);
  }

  /* ---------- Apparitions au défilement : une seule fois ---------- */
  const aApparaitre = document.querySelectorAll(".case, .offre, .entete-section, .probleme__reponse, .final__boite > *, .studio__onglets, .studio__plan");
  const observateur = new IntersectionObserver((entrees) => {
    entrees.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("est-visible"); observateur.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px" });
  aApparaitre.forEach((el) => {
    el.setAttribute("data-apparait", "");
    const freres = [...el.parentElement.children].filter((c) => c.matches(".case, .offre, .final__boite > *"));
    el.style.setProperty("--i", String(Math.max(0, freres.indexOf(el))));
    observateur.observe(el);
  });

})();

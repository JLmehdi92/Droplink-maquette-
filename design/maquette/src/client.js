// DropLink · Page client (maquette fidèle à /p/[token])
// Les gestes du client final : valider les photos (arbitrage-qc.tsx), déplier
// l'historique (repli-historique.tsx), demander le suivi par e-mail
// (carte-notifications.tsx) et parcourir les photos (visionneur.tsx, écrit à la
// main : une bibliothèque de carrousel mangerait la moitié du budget de la page).
// Rien n'est envoyé : chaque geste rend la réponse que le produit rendrait.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.23,1,.32,1)";
  const apparaitre = (el) => { if (!reduit) el.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 200, easing: EASE }); };

  /* ---------- l'arrivée : chaque bloc reçoit son rang, le CSS décale de 40 ms ---------- */
  $$(".cn-entree, .cv-entree").forEach((el, i) => el.style.setProperty("--i", String(Math.min(i, 8))));

  /* ---------- annonces de maquette : ce qui sortirait de la page ---------- */
  const toast = $("[data-toast]"); let minuterie = 0;
  const annoncer = (t) => { toast.textContent = t; toast.classList.add("est-visible"); clearTimeout(minuterie); minuterie = setTimeout(() => toast.classList.remove("est-visible"), 2600); };
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-sortie]");
    if (!a) return;
    e.preventDefault();
    annoncer(`Maquette : « ${a.dataset.sortie} » s’ouvrirait dans un nouvel onglet.`);
  });

  /* ---------- la validation des photos ---------- */
  const qc = $("[data-qc]");
  const etape = (nom) => $$("[data-qc-etape]", qc).forEach((x) => { const ici = x.dataset.qcEtape === nom; x.hidden = !ici; if (ici) apparaitre(x); });
  const commentaire = $("[data-qc-commentaire]");
  // Le serveur confirme avant que la page n'affirme (contrainte n° 8)
  const decider = (decision, bouton) => {
    const libelle = bouton.textContent;
    $$("button", qc).forEach((b) => { b.disabled = true; });
    bouton.textContent = "Envoi…";
    setTimeout(() => {
      $$("button", qc).forEach((b) => { b.disabled = false; });
      bouton.textContent = libelle;
      $("[data-qc-resultat]").textContent = decision === "approuve"
        ? "Cette commande est validée."
        : "Un problème a été signalé sur cette commande. Le vendeur est prévenu.";
      qc.dataset.etat = decision;
      commentaire.value = "";
      etape("decide");
    }, reduit ? 0 : 600);
  };
  $("[data-qc-approuver]").addEventListener("click", (e) => decider("approuve", e.currentTarget));
  $("[data-qc-refuser]").addEventListener("click", () => { etape("motif"); commentaire.focus({ preventScroll: true }); });
  $("[data-qc-annuler]").addEventListener("click", () => etape("question"));
  $("[data-qc-envoyer-refus]").addEventListener("click", (e) => decider("refuse", e.currentTarget));
  $("[data-qc-modifier]").addEventListener("click", () => { delete qc.dataset.etat; etape("question"); });

  /* ---------- l'historique long se replie : les cinq plus récents, puis « Voir tout » ---------- */
  const repli = $("[data-repli]"), reste = $("[data-reste]");
  if (repli) repli.addEventListener("click", () => {
    const ouvert = reste.hidden;
    reste.hidden = !ouvert;
    repli.setAttribute("aria-expanded", String(ouvert));
    $("[data-repli-libelle]").textContent = ouvert ? "Réduire" : "Voir tout l'historique (7)";
    repli.classList.toggle("est-ouvert", ouvert);
    if (ouvert) apparaitre(reste);
  });

  /* ---------- le suivi par e-mail ---------- */
  const notif = $("[data-notif]"), erreur = $("[data-notif-erreur]");
  notif.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = notif.querySelector("input").value.trim();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    erreur.hidden = ok;
    notif.querySelector("input").setAttribute("aria-invalid", String(!ok));
    if (!ok) return;
    const b = notif.querySelector("button"); b.disabled = true;
    setTimeout(() => { notif.hidden = true; const m = $("[data-notif-ok]"); m.hidden = false; apparaitre(m); }, reduit ? 0 : 600);
  });

  /* ---------- le visionneur ----------
     Absent du document tant qu'il est fermé : une grande image cachée serait
     tout de même téléchargée. Flèches, Échap, balayage, et le focus revient à
     la vignette d'où l'on vient. */
  const tuiles = $$("[data-ouvrir-photo]");
  const photos = tuiles.map((t) => ({ src: t.querySelector("img").getAttribute("src"), alt: t.querySelector("img").alt }));
  let vis = null, index = 0, retour = null;
  const afficher = (i, sens = 0) => {
    index = (i + photos.length) % photos.length;
    const img = $("[data-vis-image]", vis);
    img.src = photos[index].src; img.alt = photos[index].alt;
    $("[data-vis-compteur]", vis).textContent = `${index + 1} / ${photos.length}`;
    vis.setAttribute("aria-label", `Photos et vidéos, ${index + 1} sur ${photos.length}`);
    $$("[data-vis-vignette]", vis).forEach((b, k) => b.setAttribute("aria-current", String(k === index)));
    if (sens && !reduit) img.animate([{ opacity: 0, transform: `translateX(${sens * 24}px)` }, { opacity: 1, transform: "none" }], { duration: 200, easing: EASE });
  };
  const fermer = () => {
    if (!vis) return;
    const v = vis; vis = null;
    document.removeEventListener("keydown", clavier);
    document.documentElement.classList.remove("cl-bloque");
    const fin = () => { v.remove(); retour?.focus({ preventScroll: true }); };
    // la sortie est plus rapide que l'entrée
    if (reduit) fin(); else v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "ease-out" }).finished.then(fin);
  };
  const clavier = (e) => {
    if (e.key === "Escape") return fermer();
    if (e.key === "ArrowRight") return afficher(index + 1, 1);
    if (e.key === "ArrowLeft") return afficher(index - 1, -1);
    if (e.key === "Tab") {
      // le focus reste dans le dialogue
      const f = $$("button", vis), premier = f[0], dernier = f.at(-1);
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    }
  };
  const ouvrir = (i, depuis) => {
    retour = depuis;
    vis = $("template[data-visionneur]").content.firstElementChild.cloneNode(true);
    $("[data-vis-vignettes]", vis).innerHTML = photos.map((p, k) => `<li><button type="button" class="cl-vis-vignette" aria-label="Photo ${k + 1} sur ${photos.length}" data-vis-vignette="${k}"><img src="${p.src}" alt=""></button></li>`).join("");
    document.body.append(vis);
    document.documentElement.classList.add("cl-bloque");
    afficher(i);
    $("[data-vis-fermer]", vis).addEventListener("click", fermer);
    $("[data-vis-prec]", vis).addEventListener("click", () => afficher(index - 1, -1));
    $("[data-vis-suiv]", vis).addEventListener("click", () => afficher(index + 1, 1));
    $("[data-vis-vignettes]", vis).addEventListener("click", (e) => { const b = e.target.closest("[data-vis-vignette]"); if (b) afficher(+b.dataset.visVignette, Math.sign(+b.dataset.visVignette - index)); });
    // balayage : la distance OU la vitesse suffit, un geste vif n'a pas à aller loin
    const scene = $("[data-vis-scene]", vis); let x0 = null, t0 = 0, id = null;
    scene.addEventListener("pointerdown", (e) => { if (id !== null) return; id = e.pointerId; x0 = e.clientX; t0 = performance.now(); });
    scene.addEventListener("pointerup", (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0, v = Math.abs(dx) / (performance.now() - t0); id = null;
      if (Math.abs(dx) > 50 || (Math.abs(dx) > 12 && v > 0.11)) afficher(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    });
    scene.addEventListener("pointercancel", () => { id = null; });
    scene.addEventListener("click", (e) => { if (e.target === scene) fermer(); });
    document.addEventListener("keydown", clavier);
    if (!reduit) vis.animate([{ opacity: 0, transform: "scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 200, easing: EASE });
    $("[data-vis-fermer]", vis).focus({ preventScroll: true });
  };
  tuiles.forEach((t) => t.addEventListener("click", () => ouvrir(+t.dataset.ouvrirPhoto, t)));

  /* ---------- le carrousel (version 3) : le compteur suit la photo en vue ---------- */
  const carrousel = $("[data-carrousel]");
  if (carrousel) {
    const position = $("[data-carrousel-position]");
    carrousel.addEventListener("scroll", () => {
      const pas = carrousel.firstElementChild.getBoundingClientRect().width + 12;
      position.textContent = String(Math.min(photos.length, Math.round(carrousel.scrollLeft / pas) + 1));
    }, { passive: true });
  }

  /* ---------- l'historique en panneau (version 3) ----------
     Au téléphone il monte du bas et se ferme en le glissant : la distance OU
     la vitesse suffit, et au-dessus de sa position il résiste au lieu de
     s'arrêter net. Au bureau il glisse de la droite. */
  const declencheurs = $$("[data-ouvrir-historique]");
  let ouvrirHistorique = declencheurs[0];
  if (ouvrirHistorique) {
    const TIROIR = "cubic-bezier(.32,.72,0,1)";
    const bureau = () => matchMedia("(min-width: 1024px)").matches;
    let feuille = null;
    const sortie = () => (bureau() ? "translateX(calc(100% + 24px))" : "translateY(100%)");
    const fermerFeuille = () => {
      if (!feuille) return;
      const f = feuille; feuille = null;
      document.removeEventListener("keydown", clavierFeuille);
      document.documentElement.classList.remove("cl-bloque");
      const panneau = $("[data-feuille-panneau]", f), voile = $(".cv-feuille__voile", f);
      const fin = () => { f.remove(); ouvrirHistorique.focus({ preventScroll: true }); };
      if (reduit) return fin();
      // la sortie est plus rapide que l'entrée
      voile.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "forwards" });
      panneau.animate([{ transform: getComputedStyle(panneau).transform === "none" ? "none" : getComputedStyle(panneau).transform }, { transform: sortie() }], { duration: 240, easing: TIROIR, fill: "forwards" }).finished.then(fin);
    };
    const clavierFeuille = (e) => {
      if (e.key === "Escape") return fermerFeuille();
      if (e.key !== "Tab") return;
      const f = $$("button", feuille), premier = f[0], dernier = f.at(-1);
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    };
    declencheurs.forEach((d) => d.addEventListener("click", () => {
      ouvrirHistorique = d;
      feuille = $("template[data-historique]").content.firstElementChild.cloneNode(true);
      // le panneau vit hors de la page : il reprend les couleurs du vendeur
      feuille.style.cssText = $(".cv").style.cssText;
      document.body.append(feuille);
      document.documentElement.classList.add("cl-bloque");
      const panneau = $("[data-feuille-panneau]", feuille), voile = $(".cv-feuille__voile", feuille);
      $$("[data-feuille-fermer]", feuille).forEach((b) => b.addEventListener("click", fermerFeuille));
      document.addEventListener("keydown", clavierFeuille);
      if (!reduit) {
        voile.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: "ease-out" });
        panneau.animate([{ transform: sortie() }, { transform: "none" }], { duration: 420, easing: TIROIR });
      }
      $("button[data-feuille-fermer]", feuille).focus({ preventScroll: true });
      // glisser pour fermer
      const poignee = $("[data-feuille-poignee]", feuille);
      let y0 = null, t0 = 0, dy = 0, id = null;
      poignee.addEventListener("pointerdown", (e) => { if (id !== null) return; id = e.pointerId; y0 = e.clientY; t0 = performance.now(); dy = 0; poignee.setPointerCapture(id); panneau.style.transition = "none"; });
      poignee.addEventListener("pointermove", (e) => {
        if (e.pointerId !== id) return;
        const brut = e.clientY - y0;
        dy = brut > 0 ? brut : -Math.sqrt(-brut) * 2;
        panneau.style.transform = `translateY(${dy}px)`;
      });
      const lacher = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        const vitesse = dy / (performance.now() - t0);
        if (dy > 110 || vitesse > 0.11) return fermerFeuille();
        panneau.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 260, easing: TIROIR });
        panneau.style.transform = "";
      };
      poignee.addEventListener("pointerup", lacher);
      poignee.addEventListener("pointercancel", lacher);
    }));
  }

  /* ---------- le camion rejoint sa position (en transform : rien ne se recalcule) ---------- */
  const camion = $(".cv-camion");
  if (camion && !reduit) {
    const depart = -camion.parentElement.getBoundingClientRect().width * parseFloat(getComputedStyle(camion).getPropertyValue("--x")) / 100;
    camion.animate([{ transform: `translateX(${depart}px)` }, { transform: "none" }], { duration: 1100, delay: 300, easing: "cubic-bezier(.23,1,.32,1)", fill: "backwards" });
  }
})();

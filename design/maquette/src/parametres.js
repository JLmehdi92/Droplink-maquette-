// DropLink · Paramètres (maquette fidèle au produit)
// Réglages, règles de saisie et messages : ceux de /parametres (droplink2 :
// parametres/page.tsx, components/parametres/formulaires-parametres.tsx,
// messages/fr.json « parametres »). Rien n'est envoyé : chaque bloc rend la
// réponse que le produit rendrait. Le mot de passe actuel attendu est celui de
// la connexion démo ; tout autre est refusé, comme dans le produit.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const signal = window.DropLink.ecran();
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.23,1,.32,1)";
  const MOT_DE_PASSE_DEMO = "demo-droplink-2026";
  const ADRESSE = "contact@ateliernord.fr";
  let deuxActive = true;
  const on = (el, ev, fn) => el.addEventListener(ev, fn, { signal });

  /* ---------- onglets : un sujet à la fois, l'adresse garde l'onglet (#securite) ---------- */
  const liste = $("[data-onglets]"), trait = $("[data-onglets-trait]"), onglets = $$("[data-onglet]", liste);
  const placerTrait = (anime) => {
    const b = onglets.find((x) => x.getAttribute("aria-selected") === "true");
    trait.style.transition = anime && !reduit ? "" : "none";
    // en navigation verticale le trait devient la pastille de l'onglet actif
    if (getComputedStyle(liste).flexDirection === "column") {
      trait.style.width = ""; trait.style.height = `${b.offsetHeight}px`; trait.style.transform = `translateY(${b.offsetTop}px)`;
    } else {
      trait.style.height = ""; trait.style.width = `${b.offsetWidth}px`; trait.style.transform = `translateX(${b.offsetLeft}px)`;
    }
  };
  const ouvrir = (cle, { anime = true, focus = false } = {}) => {
    if (!onglets.some((b) => b.dataset.onglet === cle)) cle = "compte";
    onglets.forEach((b) => { const actif = b.dataset.onglet === cle; b.setAttribute("aria-selected", String(actif)); b.tabIndex = actif ? 0 : -1; if (actif && focus) b.focus(); });
    $$("[data-panneau]").forEach((p) => { p.hidden = p.dataset.panneau !== cle; });
    placerTrait(anime);
    // au téléphone la rangée défile : l'onglet choisi reste en vue
    const actif = onglets.find((x) => x.dataset.onglet === cle);
    if (liste.scrollWidth > liste.clientWidth) liste.scrollTo({ left: actif.offsetLeft - 16, behavior: anime && !reduit ? "smooth" : "auto" });
    const p = $(`[data-panneau="${cle}"]`);
    // un changement d'onglet est fréquent : court, et sans mouvement si réduit
    if (anime && !reduit) p.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: EASE });
    try { history.replaceState(history.state, "", `#${cle}`); } catch { /* adresse figée : l'onglet reste choisi */ }
  };
  onglets.forEach((b, i) => {
    on(b, "click", () => ouvrir(b.dataset.onglet));
    on(b, "keydown", (e) => {
      const pas = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      const cible = pas ? onglets[(i + pas + onglets.length) % onglets.length] : e.key === "Home" ? onglets[0] : e.key === "End" ? onglets.at(-1) : null;
      if (!cible) return;
      e.preventDefault(); ouvrir(cible.dataset.onglet, { anime: false, focus: true });
    });
  });
  const obs = new ResizeObserver(() => placerTrait(false)); obs.observe(liste);
  signal.addEventListener("abort", () => obs.disconnect());
  ouvrir(location.hash.slice(1), { anime: false });

  /* ---------- outils communs ---------- */
  // Le pied d'un bloc dit l'aide ; une réponse la remplace, puis l'aide revient à la saisie suivante
  const pieds = new Map();
  const annoncer = (form, texte, erreur = false) => {
    const p = $("[data-annonce]", form);
    if (!pieds.has(form)) pieds.set(form, p.textContent);
    p.textContent = texte || pieds.get(form);
    p.dataset.ton = texte ? (erreur ? "erreur" : "ok") : "";
    p.setAttribute("role", texte ? (erreur ? "alert" : "status") : "");
    if (texte && !reduit) p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: EASE });
  };
  const calmer = (form) => { if (pieds.has(form)) annoncer(form, ""); };
  const attendre = (bouton, fin) => {
    const libelle = bouton.innerHTML;
    bouton.disabled = true; bouton.textContent = bouton.dataset.enCours || "Enregistrement…";
    setTimeout(() => { bouton.innerHTML = libelle; bouton.disabled = false; fin(); }, reduit ? 0 : 650);
  };
  const actuelJuste = (form) => form.actuel.value === MOT_DE_PASSE_DEMO;
  const emailValide = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const devoiler = (el) => { el.hidden = false; if (!reduit) el.animate([{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { duration: 200, easing: EASE }); };

  /* ---------- Nom complet : le bouton n'existe qu'une fois le nom changé ---------- */
  const formNom = $('[data-form="nom"]');
  let nomEnregistre = formNom.nom.value;
  const initiales = (t) => t.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join("");
  on(formNom, "input", () => {
    calmer(formNom);
    formNom.querySelector("[type=submit]").disabled = formNom.nom.value.trim() === nomEnregistre.trim();
    // l'avatar suit la saisie ; sans nom, le produit retombe sur celui de la boutique
    $("[data-initiales]").textContent = initiales(formNom.nom.value.trim() || "Atelier Nord");
  });
  on(formNom, "submit", (e) => {
    e.preventDefault();
    const b = e.submitter;
    attendre(b, () => { nomEnregistre = formNom.nom.value; b.disabled = true; annoncer(formNom, "Enregistré."); });
  });

  /* ---------- Adresse : le mot de passe n'est demandé qu'une fois l'adresse changée ---------- */
  const formAdresse = $('[data-form="adresse"]'), champMdpAdresse = $("[data-si-modifie]", formAdresse);
  on(formAdresse, "input", () => {
    calmer(formAdresse);
    const change = formAdresse.adresse.value.trim().toLowerCase() !== ADRESSE;
    if (change && champMdpAdresse.hidden) devoiler(champMdpAdresse);
    if (!change) { champMdpAdresse.hidden = true; formAdresse.actuel.value = ""; }
    formAdresse.querySelector("[type=submit]").disabled = !change || !formAdresse.actuel.value;
  });
  on(formAdresse, "submit", (e) => {
    e.preventDefault();
    const v = formAdresse.adresse.value.trim();
    if (!emailValide(v)) return annoncer(formAdresse, "Vérifiez les informations saisies.", true);
    attendre(e.submitter, () => {
      if (!actuelJuste(formAdresse)) return annoncer(formAdresse, "Mot de passe actuel incorrect.", true);
      annoncer(formAdresse, "Si cette adresse peut recevoir un e-mail, un lien de confirmation vient d'y être envoyé. Votre adresse ne change qu'une fois ce lien suivi.");
      formAdresse.actuel.value = ""; e.submitter.disabled = true;
    });
  });

  /* ---------- Mot de passe ---------- */
  const formMdp = $('[data-form="motDePasse"]');
  on(formMdp, "input", () => { calmer(formMdp); formMdp.querySelector("[type=submit]").disabled = !formMdp.actuel.value || !formMdp.nouveau.value; });
  on(formMdp, "submit", (e) => {
    e.preventDefault();
    const nouveau = formMdp.nouveau.value;
    if ([...nouveau].length < 12) return annoncer(formMdp, "12 caractères minimum.", true);
    if (nouveau.toLowerCase().includes(ADRESSE)) return annoncer(formMdp, "Le mot de passe ne doit pas contenir votre adresse e-mail.", true);
    if (nouveau === formMdp.actuel.value) return annoncer(formMdp, "Le nouveau mot de passe doit être différent de l'actuel.", true);
    attendre(e.submitter, () => {
      if (!actuelJuste(formMdp)) return annoncer(formMdp, "Mot de passe actuel incorrect.", true);
      formMdp.reset(); e.submitter.disabled = true;
      annoncer(formMdp, "Mot de passe modifié. Vos autres appareils ont été déconnectés.");
      $$("[data-sessions] li[data-autre]").forEach((li) => li.remove());
    });
  });

  /* ---------- Langue de l'interface : la maquette n'existe qu'en français ---------- */
  const formLangue = $('[data-form="langue"]');
  on(formLangue, "change", () => { formLangue.querySelector("[type=submit]").disabled = formLangue.langue.value === "fr"; });
  on(formLangue, "submit", (e) => {
    e.preventDefault();
    window.DropLink.annoncer(`Maquette : l’interface se rechargerait en ${formLangue.langue.selectedOptions[0].text.toLowerCase()}.`);
  });

  /* ---------- Les gestes protégés : un premier clic demande le mot de passe, le second agit ---------- */
  const armer = (form, surConfirme) => {
    const zone = $("[data-confirmation]", form), envoi = form.querySelector("[type=submit]"), annuler = $("[data-annuler]", form);
    const libelle = envoi.textContent;
    const replier = () => { zone.hidden = true; annuler.hidden = true; envoi.textContent = libelle; $$("input", zone).forEach((c) => { c.value = ""; }); calmer(form); };
    on(annuler, "click", replier);
    on(form, "input", () => calmer(form));
    on(form, "submit", (e) => {
      e.preventDefault();
      if (zone.hidden) {
        devoiler(zone); annuler.hidden = false; envoi.textContent = envoi.dataset.libelleFinal || libelle;
        $("input", zone).focus({ preventScroll: true });
        return;
      }
      if ((form.confirmation && !form.confirmation.value) || !form.actuel.value) return annoncer(form, "Vérifiez les informations saisies.", true);
      if (form.confirmation && form.confirmation.value.trim().toLowerCase() !== ADRESSE) return annoncer(form, "L'adresse recopiée ne correspond pas à celle du compte.", true);
      attendre(envoi, () => {
        if (!actuelJuste(form)) return annoncer(form, "Mot de passe actuel incorrect.", true);
        replier(); surConfirme(form);
      });
    });
  };
  // l'adresse d'une suppression se RECOPIE, elle ne se colle pas
  $$("[data-sans-coller]").forEach((c) => { on(c, "paste", (e) => e.preventDefault()); on(c, "drop", (e) => e.preventDefault()); });

  armer($('[data-form="sessions"]'), (form) => {
    const partants = $$("[data-sessions] li[data-autre]");
    const fin = () => { partants.forEach((li) => li.remove()); annoncer(form, "Vos autres appareils ont été déconnectés."); };
    if (reduit || !partants.length) return fin();
    Promise.all(partants.map((li) => li.animate([{ opacity: 1 }, { opacity: 0, transform: "translateX(6px)" }], { duration: 180, easing: EASE, fill: "forwards" }).finished)).then(fin);
  });
  // la maquette s'arrête là où le produit effacerait : rien n'est supprimé, et on le dit
  armer($('[data-form="supCompte"]'), () => window.DropLink.annoncer("Maquette : le compte serait supprimé et vous seriez déconnecté. Rien n’a été effacé."));
  armer($('[data-form="supDonnees"]'), (form) => { annoncer(form, "Toutes vos données ont été supprimées."); window.DropLink.annoncer("Maquette : rien n’a été effacé."); });

  /* ---------- Double authentification ----------
     Au repos, l'état et son geste tiennent dans l'en-tête ; le pied n'apparaît
     que pendant les étapes (mot de passe, puis QR code et premier code). */
  const form2 = $('[data-form="deuxEtapes"]'), ouvrir2 = $("[data-ouvrir-deux]"), pied2 = $("[data-pied-deux]"), bouton2 = $("[data-action-deux]");
  const etape = (nom) => $$("[data-etape]", form2).forEach((x) => { if (x.dataset.etape === nom) devoiler(x); else x.hidden = true; });
  let phase = "repos"; // repos → mdp → qr
  const peindre2 = () => {
    const etat = $("[data-etat-deux]");
    etat.dataset.actif = String(deuxActive);
    $("span", etat).textContent = deuxActive ? "Activée" : "Désactivée";
    // les appareils fiables n'existent qu'après un vrai second facteur
    $("[data-bloc-fiables]").hidden = !deuxActive;
    ouvrir2.hidden = phase !== "repos";
    ouvrir2.textContent = deuxActive ? "Désactiver" : "Activer";
    ouvrir2.className = `bouton-app ${deuxActive ? "bouton-app--second" : "bouton-app--plein"}`;
    bouton2.textContent = phase === "mdp" ? (deuxActive ? "Désactiver la double authentification" : "Continuer") : "Confirmer l'activation";
    bouton2.dataset.enCours = phase === "mdp" ? (deuxActive ? "Désactivation…" : "Préparation…") : "Vérification…";
  };
  // une réponse finale se lit dans le pied, qui reste ouvert le temps de la lire
  const repos2 = (message) => {
    phase = "repos"; $$("[data-etape]", form2).forEach((x) => { x.hidden = true; }); $$("input", form2).forEach((c) => { c.value = ""; });
    peindre2();
    if (message) { $("[data-annuler]", form2).hidden = true; bouton2.hidden = true; annoncer(form2, message); } else pied2.hidden = true;
  };
  on(ouvrir2, "click", () => {
    phase = "mdp";
    $("[data-aide-deux]", form2).textContent = deuxActive
      ? "Votre compte ne demandera plus de code à la connexion. Confirmez avec votre mot de passe."
      : "Confirmez votre mot de passe pour commencer. Il vous faudra une application d'authentification sur votre téléphone.";
    annoncer(form2, ""); $("[data-annuler]", form2).hidden = false; bouton2.hidden = false;
    etape("mdp"); devoiler(pied2); peindre2(); form2.actuel.focus({ preventScroll: true });
  });
  on($("[data-annuler]", form2), "click", () => repos2());
  on(form2, "input", () => calmer(form2));
  on(form2, "submit", (e) => {
    e.preventDefault();
    if (phase === "mdp") {
      if (!form2.actuel.value) return annoncer(form2, "Vérifiez les informations saisies.", true);
      return attendre(bouton2, () => {
        if (!actuelJuste(form2)) return annoncer(form2, "Mot de passe actuel incorrect.", true);
        if (deuxActive) { deuxActive = false; repos2("Double authentification désactivée."); return; }
        phase = "qr"; etape("qr"); peindre2(); calmer(form2); form2.code.focus({ preventScroll: true });
      });
    }
    const code = form2.code.value.replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return annoncer(form2, "Code incorrect ou expiré. Saisissez le code affiché maintenant.", true);
    attendre(bouton2, () => { deuxActive = true; repos2("Double authentification activée. Vos autres appareils demanderont le code à leur prochaine utilisation."); });
  });
  peindre2();

  /* ---------- Appareils fiables : la révocation porte sur une ligne ---------- */
  on($("[data-fiables]"), "click", (e) => {
    const b = e.target.closest("[data-revoquer]");
    if (!b) return;
    b.disabled = true; b.textContent = "Révocation…";
    setTimeout(() => {
      b.closest("li").remove();
      $("[data-fiables-aucun]").hidden = $$("[data-fiables] li").length > 0;
    }, reduit ? 0 : 500);
  });

  /* ---------- Export ---------- */
  on($("[data-exporter]"), "click", () => window.DropLink.annoncer("Maquette : le fichier JSON de vos données se téléchargerait."));
})();

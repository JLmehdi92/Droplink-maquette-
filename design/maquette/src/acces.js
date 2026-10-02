/* eslint-disable @next/next/no-location-assign-relative-destination -- page HTML statique de la maquette, sans routeur Next */
// DropLink · pages d'accès
// Les règles sont celles du produit, portées telles quelles : la suggestion
// d'adresse (lib/email/domaines.ts) et le plancher de 12 caractères. Ce que
// seul le serveur sait (mot de passe dans une fuite, compte existant), la
// maquette ne le simule pas : elle renvoie vers la vraie page.
(() => {
  const racine = document.documentElement;
  racine.classList.add("js");
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  try { const t = localStorage.getItem("dl-theme"); if (t) racine.setAttribute("data-theme", t); } catch { /* pas de stockage : thème du système */ }

  /* ---------- Suggestion de domaine (lib/email/domaines.ts) ---------- */
  const DOMAINES = ["gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "gmx.com", "gmx.fr", "mail.com", "protonmail.com", "proton.me", "pm.me", "tutanota.com", "zoho.com", "fastmail.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "laposte.net", "bbox.fr", "numericable.fr", "neuf.fr", "aliceadsl.fr", "qq.com", "foxmail.com", "163.com", "126.com", "yeah.net", "sina.com", "sina.cn", "sohu.com", "aliyun.com", "139.com", "189.cn", "outlook.jp"];
  const CONNUS = new Set(DOMAINES);
  const distance = (a, b, plafond) => {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > plafond) return plafond + 1;
    const col = b.length + 1, d = new Array((a.length + 1) * col).fill(0);
    for (let i = 0; i <= a.length; i += 1) d[i * col] = i;
    for (let j = 0; j <= b.length; j += 1) d[j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      let min = Infinity;
      for (let j = 1; j <= b.length; j += 1) {
        let v = Math.min(d[i * col + j - 1] + 1, d[(i - 1) * col + j] + 1, d[(i - 1) * col + j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[(i - 2) * col + j - 2] + 1);
        d[i * col + j] = v; if (v < min) min = v;
      }
      if (min > plafond) return plafond + 1;
    }
    return d[a.length * col + b.length];
  };
  const suggerer = (adresse) => {
    const propre = adresse.trim().toLowerCase(), at = propre.lastIndexOf("@");
    if (at <= 0 || at === propre.length - 1) return null;
    const domaine = propre.slice(at + 1);
    if (CONNUS.has(domaine) || !domaine.includes(".")) return null;
    let meilleur = null, dist = 3;
    for (const c of DOMAINES) { const x = distance(domaine, c, 2); if (x < dist && x <= (c.length <= 9 ? 1 : 2)) { dist = x; meilleur = c; } }
    return meilleur && dist > 0 ? `${propre.slice(0, at)}@${meilleur}` : null;
  };
  const emailValide = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

  /* ---------- Champs ---------- */
  const erreur = (champ, texte) => {
    champ.classList.toggle("est-invalide", !!texte);
    const zone = champ.querySelector("[data-erreur]");
    zone.textContent = texte || "";
    champ.querySelector("input").setAttribute("aria-invalid", texte ? "true" : "false");
  };

  const secouer = (el) => { if (reduit) return; el.classList.remove("secoue"); void el.offsetWidth; el.classList.add("secoue"); };
  const occupe = async (bouton, ms) => { bouton.classList.add("est-en-cours"); bouton.setAttribute("aria-busy", "true"); await attendre(reduit ? 200 : ms); bouton.classList.remove("est-en-cours"); bouton.removeAttribute("aria-busy"); };

  // Tout ce qui vit dans le formulaire se branche sur une portée : la bascule
  // connexion ⇄ inscription remplace le formulaire, et le rebranche.
  const brancher = (portee) => {
    portee.querySelectorAll("[data-champ-email]").forEach((champ) => {
      const input = champ.querySelector("input");
      const bloc = champ.querySelector("[data-suggestion]");
      const bouton = champ.querySelector("[data-suggestion-bouton]");
      const proposer = () => {
        const s = suggerer(input.value);
        bloc.hidden = !s;
        if (s) bouton.textContent = s;
      };
      input.addEventListener("blur", () => { proposer(); if (input.value && !emailValide(input.value)) erreur(champ, "Cette adresse ne semble pas valide."); });
      input.addEventListener("input", () => { if (champ.classList.contains("est-invalide") && emailValide(input.value)) erreur(champ, ""); if (!bloc.hidden) proposer(); });
      bouton.addEventListener("click", () => { input.value = bouton.textContent; bloc.hidden = true; erreur(champ, ""); input.focus(); });
    });

    portee.querySelectorAll("[data-oeil]").forEach((oeil) => {
      const input = oeil.parentElement.querySelector("input");
      oeil.addEventListener("click", () => {
        const montre = input.type === "password";
        input.type = montre ? "text" : "password";
        oeil.setAttribute("aria-pressed", String(montre));
        oeil.setAttribute("aria-label", montre ? "Masquer le mot de passe" : "Afficher le mot de passe");
        oeil.querySelector("use").setAttribute("href", montre ? "#i-eye-off" : "#i-eye");
      });
    });

    // Inscription : la jauge compte vers 12, et signale une adresse recopiée dans le mot de passe
    const aide = portee.querySelector("[data-aide-mdp]");
    if (aide) {
      const champ = aide.closest("[data-champ-mdp]");
      const input = champ.querySelector("input");
      const jauge = champ.querySelector("[data-jauge]");
      const compteur = aide.querySelector("[data-compteur]");
      const email = portee.querySelector("[data-champ-email] input");
      input.addEventListener("input", () => {
        const n = [...input.value].length, ok = n >= 12;
        compteur.textContent = String(n);
        jauge.style.setProperty("--remplie", String(Math.min(1, n / 12)));
        jauge.classList.toggle("est-ok", ok);
        aide.classList.toggle("est-ok", ok);
        if (champ.classList.contains("est-invalide") && ok) erreur(champ, "");
      });
      input.addEventListener("blur", () => {
        const e = (email?.value ?? aide.closest("form")?.dataset.adresse ?? "").trim().toLowerCase();
        if (e && input.value.toLowerCase().includes(e)) erreur(champ, "Votre mot de passe ne doit pas contenir votre adresse email.");
      });
    }

    // Connexion : l'erreur « mot de passe vide » s'efface dès qu'on tape
    portee.querySelectorAll('[data-formulaire="connexion"] [data-champ-mdp] input').forEach((input) => {
      input.addEventListener("input", () => { const c = input.closest("[data-champ-mdp]"); if (input.value && c.classList.contains("est-invalide")) erreur(c, ""); });
    });

    /* ---------- Envoi ---------- */
    portee.querySelectorAll("[data-formulaire]").forEach((form) => {
      const type = form.dataset.formulaire;
      const statut = form.querySelector("[data-statut]");
      const bouton = form.querySelector("[data-envoi]");
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        statut.textContent = "";
        const invalides = [];
        const champEmail = form.querySelector("[data-champ-email]");
        // le nouveau mot de passe n'a pas de champ d'adresse : elle est déjà connue
        const email = champEmail ? champEmail.querySelector("input").value.trim() : (form.dataset.adresse || "");
        if (champEmail) { if (!emailValide(email)) { erreur(champEmail, "Cette adresse ne semble pas valide."); invalides.push(champEmail); } else erreur(champEmail, ""); }
        const champMdp = form.querySelector("[data-champ-mdp]");
        if (champMdp) {
          const mdp = champMdp.querySelector("input").value;
          let msg = "";
          if (type === "inscription" || type === "nouveau") {
            if ([...mdp].length < 12) msg = "Votre mot de passe doit faire au moins 12 caractères.";
            else if (email && mdp.toLowerCase().includes(email.toLowerCase())) msg = "Votre mot de passe ne doit pas contenir votre adresse email.";
          } else if (!mdp) msg = "Saisissez votre mot de passe.";
          erreur(champMdp, msg);
          if (msg) invalides.push(champMdp);
        }
        if (invalides.length) {
          invalides.forEach((c) => secouer(c.querySelector(".champ-acces__boite")));
          invalides[0].querySelector("input").focus();
          return;
        }
        await occupe(bouton, 900);
        if (type === "oubli") {
          // Le produit répond la même chose qu'un compte existe ou non : c'est voulu.
          const envoye = form.parentElement.querySelector("[data-envoye]");
          form.hidden = true;
          envoye.hidden = false;
          envoye.querySelector("h2").focus();
          return;
        }
        // la maquette enchaîne sur le tableau de bord de démonstration
        location.href = "tableau.html";
      });
    });

    /* ---------- Connexion ⇄ mot de passe oublié ---------- */
    const panneaux = Object.fromEntries([...portee.querySelectorAll("[data-panneau]")].map((p) => [p.dataset.panneau, p]));
    const basculer = async (vers) => {
      const cible = panneaux[vers];
      const actuel = Object.values(panneaux).find((p) => !p.hidden);
      if (!cible || cible === actuel) return;
      if (!reduit) { actuel.classList.add("sort"); await attendre(190); }
      actuel.hidden = true; actuel.classList.remove("sort");
      cible.hidden = false;
      if (!reduit) { cible.classList.remove("entre"); void cible.offsetWidth; cible.classList.add("entre"); }
      // l'adresse déjà saisie suit d'un panneau à l'autre
      const depuis = actuel.querySelector("[data-champ-email] input"), vers2 = cible.querySelector("[data-champ-email] input");
      if (depuis && vers2 && depuis.value && !vers2.value) vers2.value = depuis.value;
      if (vers === "oubli") { cible.querySelector("form").hidden = false; cible.querySelector("[data-envoye]").hidden = true; }
      cible.querySelector("h1").focus({ preventScroll: true });
    };
    portee.querySelector("[data-oubli]")?.addEventListener("click", (e) => { e.preventDefault(); history.replaceState(null, "", "#oubli"); basculer("oubli"); });
    portee.querySelector("[data-retour]")?.addEventListener("click", (e) => { e.preventDefault(); history.replaceState(null, "", "#connexion"); basculer("connexion"); });
    if (location.hash === "#oubli" && panneaux.oubli) { panneaux.connexion.hidden = true; panneaux.oubli.hidden = false; }
  };
  brancher(document.querySelector(".acces__corps") || document);

  /* ---------- Connexion ⇄ inscription, sans recharger la page ---------- */
  // La page suivante est déjà chargée quand on clique (survol, puis temps mort) :
  // seul le formulaire change, le film de l'une se fond dans celui de l'autre,
  // et l'adresse déjà tapée suit. Si le chargement échoue, le lien reste un lien.
  const ACCES = /(^|\/)(connexion|inscription)\.html$/;
  const cache = new Map();
  const charger = (url) => {
    const cle = new URL(url, location.href).pathname;
    if (!cache.has(cle)) {
      cache.set(cle, fetch(url)
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
        .then((t) => new DOMParser().parseFromString(t, "text/html"))
        .catch((e) => { cache.delete(cle); throw e; }));
    }
    return cache.get(cle);
  };
  let pageActuelle = location.pathname, enCours = false;
  const naviguer = async (url, pousser) => {
    if (enCours) return;
    enCours = true;
    let doc;
    try { doc = await charger(url); } catch { location.href = url; return; }
    const corps = document.querySelector(".acces__corps"), legal = document.querySelector(".acces__legal");
    const source = doc.querySelector(".acces__corps"), sourceLegal = doc.querySelector(".acces__legal");
    if (!corps || !source) { location.href = url; return; }
    const nCorps = document.importNode(source, true), nLegal = sourceLegal ? document.importNode(sourceLegal, true) : null;
    const adresse = corps.querySelector("[data-champ-email] input")?.value || "";

    // Le film sortant s'arrête tout de suite et s'efface sur sa dernière image : pendant
    // la bascule, un seul film calcule. Le nouveau se monte une fois le formulaire posé.
    const ancien = document.querySelector(".acces__vitrine--film [data-film]"), nHote = doc.querySelector("[data-film]");
    const changerFilm = ancien && nHote && nHote.dataset.film !== ancien.dataset.film && window.DropLinkFilm;
    if (changerFilm) {
      window.DropLinkFilm.courant?.arreter();
      ancien.classList.add("est-entrant");
      setTimeout(() => ancien.remove(), reduit ? 0 : 560);
    }
    if (scrollY > 0) scrollTo({ top: 0, behavior: reduit ? "auto" : "smooth" });
    if (!reduit) { corps.classList.add("v4-sort"); legal?.classList.add("v4-sort"); await attendre(170); }
    corps.replaceWith(nCorps);
    if (legal && nLegal) legal.replaceWith(nLegal);
    document.title = doc.title;
    if (pousser) history.pushState({ acces: true }, "", url);
    pageActuelle = location.pathname;
    brancher(nCorps);
    nCorps.querySelectorAll(".formulaire").forEach((f) => f.classList.add("v4-carte"));
    const champ = nCorps.querySelector("[data-champ-email] input");
    if (champ && adresse && !champ.value) champ.value = adresse;
    if (!reduit) {
      nCorps.classList.add("v4-entre"); nLegal?.classList.add("v4-entre");
      setTimeout(() => { nCorps.classList.remove("v4-entre"); nLegal?.classList.remove("v4-entre"); }, 800);
    }
    nCorps.querySelector("h1")?.focus({ preventScroll: true });
    if (changerFilm) {
      const entrant = document.createElement("div");
      entrant.className = `${nHote.className} est-entrant`;
      entrant.dataset.film = nHote.dataset.film;
      ancien.after(entrant);
      // construit après l'entrée du formulaire, pour ne pas lui voler ses images
      setTimeout(() => {
        window.DropLinkFilm.courant = window.DropLinkFilm.monter(entrant);
        requestAnimationFrame(() => requestAnimationFrame(() => entrant.classList.remove("est-entrant")));
      }, reduit ? 0 : 260);
    }
    enCours = false;
  };
  const lienAcces = (cible) => {
    const a = cible.closest?.("a[href]");
    return a && a.closest(".acces__corps") && ACCES.test(a.getAttribute("href")) ? a : null;
  };
  document.addEventListener("click", (e) => {
    const a = lienAcces(e.target);
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    naviguer(a.getAttribute("href"), true);
  });
  const prechargerLien = (e) => { const a = lienAcces(e.target); if (a) charger(a.getAttribute("href")).catch(() => { /* le clic retombera sur un vrai lien */ }); };
  document.addEventListener("pointerover", prechargerLien, { passive: true });
  document.addEventListener("focusin", prechargerLien);
  document.addEventListener("touchstart", prechargerLien, { passive: true });
  // l'autre page se charge dès que le navigateur n'a plus rien à faire
  const autre = document.querySelector('.acces__corps a[href="inscription.html"], .acces__corps a[href="connexion.html"]');
  if (autre) (window.requestIdleCallback || ((f) => setTimeout(f, 800)))(() => charger(autre.getAttribute("href")).catch(() => { /* idem */ }));
  addEventListener("popstate", () => {
    if (location.pathname !== pageActuelle && ACCES.test(location.pathname)) naviguer(location.href, false);
  });
})();

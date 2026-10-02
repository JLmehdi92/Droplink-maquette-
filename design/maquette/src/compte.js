/* eslint-disable @next/next/no-location-assign-relative-destination -- page HTML statique de la maquette, sans routeur Next */
// DropLink · pages de compte hors connexion : vérification en deux étapes,
// bienvenue (première configuration de la boutique), suivi par e-mail.
// Les règles sont celles du produit : 6 chiffres, contraste ajusté par
// resoudreAccent, deux types de compte, et une page e-mail à six états.
(() => {
  const racine = document.documentElement;
  racine.classList.add("js");
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  try { const t = localStorage.getItem("dl-theme"); if (t) racine.setAttribute("data-theme", t); } catch { /* thème du système */ }
  const occupe = async (bouton, ms) => { bouton.classList.add("est-en-cours"); bouton.setAttribute("aria-busy", "true"); await attendre(reduit ? 150 : ms); bouton.classList.remove("est-en-cours"); bouton.removeAttribute("aria-busy"); };
  const secouer = (el) => { if (reduit) return; el.classList.remove("secoue"); void el.offsetWidth; el.classList.add("secoue"); };

  /* ---------- vérification en deux étapes : six cases, collage accepté ---------- */
  const verif = $("[data-verification]");
  if (verif) {
    const cases = $$("[data-chiffre]", verif), zone = $("[data-code]", verif), erreur = $("[data-code-erreur]", verif);
    const code = () => cases.map((c) => c.value).join("");
    const dire = (m) => { erreur.textContent = m; zone.classList.toggle("est-invalide", !!m); };
    const remplir = (chiffres, depuis = 0) => {
      [...chiffres].slice(0, 6 - depuis).forEach((d, i) => { cases[depuis + i].value = d; });
      const suivante = cases[Math.min(5, depuis + chiffres.length)];
      suivante.focus(); suivante.select();
      if (code().length === 6) verif.requestSubmit();
    };
    cases.forEach((c, i) => {
      c.addEventListener("input", () => {
        const chiffres = c.value.replace(/\D/g, "");
        c.value = "";
        if (zone.classList.contains("est-invalide")) dire("");
        if (chiffres) remplir(chiffres, i);
      });
      c.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !c.value && i > 0) { e.preventDefault(); cases[i - 1].value = ""; cases[i - 1].focus(); }
        if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); cases[i - 1].focus(); }
        if (e.key === "ArrowRight" && i < 5) { e.preventDefault(); cases[i + 1].focus(); }
      });
      c.addEventListener("paste", (e) => { e.preventDefault(); const t = (e.clipboardData?.getData("text") || "").replace(/\D/g, ""); if (t) remplir(t, i); });
      c.addEventListener("focus", () => c.select());
    });
    verif.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (code().length < 6) { dire("Saisissez les 6 chiffres affichés par votre application."); secouer($(".code-2fa__cases", verif)); cases.find((c) => !c.value)?.focus(); return; }
      await occupe($("[data-envoi]", verif), 800);
      // la maquette n'a pas d'application d'authentification : « 000000 » montre le refus du produit
      if (code() === "000000") { dire("Code incorrect ou expiré. Saisissez le code affiché maintenant."); secouer($(".code-2fa__cases", verif)); cases.forEach((c) => { c.value = ""; }); cases[0].focus(); return; }
      zone.classList.add("est-valide");
      await attendre(reduit ? 0 : 380);
      location.href = "tableau.html";
    });
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) cases[0].focus();
  }

  /* ---------- bienvenue : la page du client se construit sous les yeux ---------- */
  const onb = $("[data-onboarding]");
  if (onb) {
    // resoudreAccent (lib/design/contraste.ts), le même calcul que Ma marque
    const hexVersRvb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); if (!m) return null; const n = parseInt(m[1], 16); return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 }; };
    const rvbVersHex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
    const lum = ({ r, g, b }) => { const c = (v) => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }; return .2126 * c(r) + .7152 * c(g) + .0722 * c(b); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const quant = ({ r, g, b }) => ({ r: Math.max(0, Math.min(255, Math.round(r))), g: Math.max(0, Math.min(255, Math.round(g))), b: Math.max(0, Math.min(255, Math.round(b))) });
    const versTsl = ({ r, g, b }) => { const rn = r / 255, gn = g / 255, bn = b / 255, max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), l = (max + min) / 2, d = max - min; if (d === 0) return { t: 0, s: 0, l }; const s = l > .5 ? d / (2 - max - min) : d / (max + min); const t = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6 : max === gn ? ((bn - rn) / d + 2) / 6 : ((rn - gn) / d + 4) / 6; return { t, s, l }; };
    const versRvb = ({ t, s, l }) => { if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 }; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const c = (dec) => { let x = t + dec; if (x < 0) x += 1; if (x > 1) x -= 1; if (x < 1 / 6) return p + (q - p) * 6 * x; if (x < 1 / 2) return q; if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6; return p; }; return { r: c(1 / 3) * 255, g: c(0) * 255, b: c(-1 / 3) * 255 }; };
    const ajuster = (couleur, fond, vise) => { const f = quant(fond); if (ratio(quant(couleur), f) >= vise) return couleur; const tsl = versTsl(couleur), clair = lum(f) > .18; let bas = clair ? 0 : tsl.l, haut = clair ? tsl.l : 1, meilleure = quant(versRvb({ ...tsl, l: clair ? 0 : 1 })); for (let i = 0; i < 24; i += 1) { const m = (bas + haut) / 2, cand = quant(versRvb({ ...tsl, l: m })); if (ratio(cand, f) >= vise) { meilleure = cand; if (clair) bas = m; else haut = m; } else if (clair) haut = m; else bas = m; } return meilleure; };
    const BLANC = { r: 255, g: 255, b: 255 }, ENCRE = { r: 0x11, g: 0x11, b: 0x17 };
    const resoudre = (hex) => { const base = hexVersRvb(hex) || hexVersRvb("#5B4BF5"); const texte = ajuster(base, BLANC, 4.5), ui = ajuster(base, BLANC, 3); let rem = ajuster(base, BLANC, 3); const sur = ratio(rem, BLANC) >= ratio(rem, ENCRE) ? BLANC : ENCRE; if (ratio(quant(rem), sur) < 4.5) rem = ajuster(rem, sur, 4.5); const teinte = quant({ r: 255 + (ui.r - 255) * .1, g: 255 + (ui.g - 255) * .1, b: 255 + (ui.b - 255) * .1 }); return { texte: rvbVersHex(texte), interface: rvbVersHex(ui), remplissage: rvbVersHex(rem), surRemplissage: rvbVersHex(sur), teinte: rvbVersHex(teinte), surTeinte: rvbVersHex(ajuster(texte, teinte, 4.5)) }; };

    const pc = $("[data-onb-ecran] .pc");
    pc.setAttribute("data-etats", "");
    pc.classList.add("a-photos", "a-suivi");
    pc.querySelector(".pc__commande > small").innerHTML = `<span>Votre commande</span> <em class="pc__pour">pour votre client</em>`;
    const nomPc = $("[data-pc-nom]", pc), descPc = $("[data-pc-description]", pc), logoPc = $("[data-pc-logo]", pc);
    descPc.hidden = true;
    const champNom = $("[data-onb-nom]", onb);
    const poserNom = () => { const n = champNom.value.trim(); nomPc.textContent = n || "Votre boutique"; nomPc.classList.toggle("est-provisoire", !n); };
    champNom.addEventListener("input", poserNom); poserNom();

    const hex = $("[data-onb-hex]", onb), roue = $("[data-onb-roue]", onb), pastille = $("[data-onb-pastille]", onb);
    const peindre = (h) => {
      const a = resoudre(h);
      [["--pc-texte", a.texte], ["--pc-interface", a.interface], ["--pc-remplissage", a.remplissage], ["--pc-sur-remplissage", a.surRemplissage], ["--pc-teinte", a.teinte], ["--pc-sur-teinte", a.surTeinte]].forEach(([k, v]) => pc.style.setProperty(k, v));
      pastille.style.background = h;
      $$("[data-onb-vite]", onb).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.onbVite.toLowerCase() === h.toLowerCase())));
    };
    const choisir = (h) => { hex.value = h.toUpperCase(); roue.value = h.toLowerCase(); peindre(h); };
    roue.addEventListener("input", () => choisir(roue.value));
    hex.addEventListener("input", () => { const v = hex.value.trim(); const h = v.startsWith("#") ? v : `#${v}`; if (/^#[0-9a-f]{6}$/i.test(h)) { roue.value = h.toLowerCase(); peindre(h); } });
    $$("[data-onb-vite]", onb).forEach((b) => b.addEventListener("click", () => choisir(b.dataset.onbVite)));
    choisir("#5B4BF5");

    // le logo : lu dans le navigateur, posé sur la page du client, jamais envoyé
    const logo = $("[data-onb-logo]", onb), visuel = $("[data-onb-logo-visuel]", onb), libelle = $("[data-onb-logo-libelle]", onb), retirer = $("[data-onb-logo-retirer]", onb), errLogo = $("[data-onb-logo-erreur]", onb);
    let url = null;
    logo.addEventListener("change", () => {
      const f = logo.files[0]; if (!f) return;
      if (!["image/png", "image/jpeg"].includes(f.type)) { errLogo.textContent = "Ce format d’image n’est pas accepté."; return; }
      errLogo.textContent = "";
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(f);
      visuel.innerHTML = `<img src="${url}" alt="">`;
      logoPc.src = url; logoPc.hidden = false;
      libelle.textContent = "Remplacer"; retirer.hidden = false;
    });
    retirer.addEventListener("click", () => {
      if (url) URL.revokeObjectURL(url); url = null; logo.value = "";
      visuel.innerHTML = `<svg class="ic"><use href="#i-images"/></svg>`;
      logoPc.hidden = true; libelle.textContent = "Choisir une image"; retirer.hidden = true;
    });

    const errType = $("[data-onb-type-erreur]", onb);
    $$("[data-onb-type]", onb).forEach((r) => r.addEventListener("change", () => { errType.textContent = ""; }));
    onb.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!$$("[data-onb-type]", onb).some((r) => r.checked)) { errType.textContent = "Choisissez à qui vous vendez."; secouer($(".onb-type__choix", onb)); return; }
      await occupe($("[data-envoi]", onb), 800);
      // étape 2 sur 2 : la première commande
      location.href = "commande.html";
    });
  }

  /* ---------- suivi par e-mail : la page ouverte depuis l'e-mail ---------- */
  const notif = $("[data-notif]");
  if (notif) {
    const ETATS = {
      confirmer: ["mail", "Confirmer le suivi par e-mail", "Appuyez sur le bouton pour recevoir un e-mail à l'expédition, pendant le transit et à la livraison de cette commande.", "Confirmer", "confirmee"],
      confirmee: ["mail-check", "C'est confirmé", "Vous recevrez un e-mail aux prochaines étapes de votre commande. Chaque e-mail contient un lien pour vous désinscrire."],
      desinscrire: ["bell-off", "Ne plus recevoir d'e-mails", "Vous ne recevrez plus d'e-mails de suivi pour cette commande.", "Me désinscrire", "desinscrite"],
      desinscrite: ["circle-check", "C'est fait", "Vous ne recevrez plus d'e-mails pour cette commande."],
      invalide: ["circle-alert", "Ce lien n'est plus valable", "Il a peut-être expiré ou déjà servi. Vous pouvez refaire la demande depuis la page de votre commande."],
      indisponible: ["clock", "Service momentanément indisponible", "Votre lien reste valable : réessayez dans quelques minutes."],
    };
    const bouton = $("[data-notif-bouton]");
    let etat = "confirmer";
    const poser = (e, anime) => {
      etat = ETATS[e] ? e : "invalide";
      const [icone, titre, texte, action] = ETATS[etat];
      notif.dataset.etat = etat;
      $("[data-notif-icone] use").setAttribute("href", `#i-${icone}`);
      $("[data-notif-titre]").textContent = titre;
      $("[data-notif-texte]").textContent = texte;
      bouton.hidden = !action;
      if (action) $("[data-notif-libelle]").textContent = action;
      document.title = `${titre} · DropLink`;
      if (anime && !reduit) notif.animate([{ opacity: 0, transform: "translateY(8px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.23,1,.32,1)" });
    };
    // l'état vient de l'adresse, comme dans le produit (?action=… / ?etat=…)
    poser((location.hash || "#confirmer").slice(1), false);
    addEventListener("hashchange", () => poser(location.hash.slice(1), true));
    bouton.addEventListener("click", async () => {
      const suite = ETATS[etat][4];
      bouton.classList.add("est-en-cours"); bouton.disabled = true;
      await attendre(reduit ? 150 : 700);
      bouton.classList.remove("est-en-cours"); bouton.disabled = false;
      history.replaceState(null, "", `#${suite}`);
      poser(suite, true);
      $("[data-notif-titre]").focus({ preventScroll: true });
    });
  }
})();

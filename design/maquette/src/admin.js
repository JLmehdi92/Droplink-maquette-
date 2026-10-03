/* eslint-disable @next/next/no-location-assign-relative-destination -- page HTML statique de la maquette, sans routeur Next */
// DropLink · administration (maquette)
// Les gestes du produit, avec ses règles : un motif d'au moins 10 caractères,
// l'adresse recopiée à la main (collage refusé) pour suspendre, une réponse
// écrite pour une contestation. Rien n'est supprimé, rien n'est facturé, et
// aucun contenu de commande n'est jamais montré.
(() => {
  const racine = document.documentElement;
  racine.classList.add("js");
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ic = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const MOTIF_MIN = 10;
  try { const t = localStorage.getItem("dl-theme"); if (t) racine.setAttribute("data-theme", t); } catch { /* thème du système */ }

  /* ---------- annonces ---------- */
  const toast = $("[data-toast]"); let minuterie = 0;
  const annoncer = (t) => { toast.textContent = t; toast.classList.add("est-visible"); clearTimeout(minuterie); minuterie = setTimeout(() => toast.classList.remove("est-visible"), 2800); };

  /* ---------- tiroir de navigation (écrans étroits) : tiroir.js ---------- */

  /* ---------- recherche de compte, depuis n'importe quel écran ---------- */
  $("[data-adm-recherche]").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = e.currentTarget.q.value.trim();
    try { sessionStorage.setItem("dl-adm-q", q); } catch { /* sans stockage : la liste s'ouvre sans filtre */ }
    location.href = "admin-comptes.html";
  });

  /* ---------- listes : filtre + recherche, sur les lignes déjà là ---------- */
  const table = $("[data-table]");
  if (table) {
    const lignes = $$(table.tagName === "OL" ? ":scope > li" : "tbody tr", table);
    const champ = $("[data-cherche]"), vide = $("[data-vide]");
    const groupes = $$("[data-filtres]");
    const etat = groupes.map((g) => $("[aria-pressed=true]", g).dataset.filtre);
    const appliquer = () => {
      const q = (champ?.value || "").trim().toLowerCase();
      let n = 0;
      lignes.forEach((l) => {
        const f = etat[0];
        const garde = (!f || ["tous", "toutes", "0"].includes(f) || l.dataset.statut === f || l.dataset.type === f || l.dataset.famille === f) && (!q || (l.dataset.cherche || l.textContent.toLowerCase()).includes(q));
        l.hidden = !garde; if (garde) n += 1;
      });
      if (vide) vide.hidden = n > 0;
    };
    groupes.forEach((g, k) => g.addEventListener("click", (e) => {
      const b = e.target.closest("[data-filtre]"); if (!b) return;
      $$("[data-filtre]", g).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      etat[k] = b.dataset.filtre;
      // seul le premier groupe filtre les lignes ; les fenêtres de temps changent le décompte côté serveur
      if (k === 0) appliquer(); else annoncer("Maquette : la fenêtre se recalcule côté serveur.");
    }));
    champ?.addEventListener("input", appliquer);
    try { const q = sessionStorage.getItem("dl-adm-q"); if (q && champ) { champ.value = q; sessionStorage.removeItem("dl-adm-q"); } } catch { /* rien */ }
    appliquer();
  } else {
    // les écrans sans liste (statistiques) : les filtres changent de vue, côté serveur
    $$("[data-filtres]").forEach((g) => g.addEventListener("click", (e) => {
      const b = e.target.closest("[data-filtre]"); if (!b) return;
      $$("[data-filtre]", g).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));
  }
  $$("[data-suite]").forEach((b) => b.addEventListener("click", () => annoncer("Maquette : la suite se charge par curseur, 50 lignes à la fois.")));

  /* ---------- fiche de compte : un compte par ancre ---------- */
  const fiches = $$("[data-fiche]");
  if (fiches.length) {
    const montrer = () => {
      const id = location.hash.slice(1) || "c1";
      const f = fiches.find((x) => x.dataset.fiche === id) || fiches[0];
      fiches.forEach((x) => { x.hidden = x !== f; });
      const email = $("h2", f).textContent;
      document.title = `${email} · Administration DropLink`;
      $(".v4-fil b").textContent = email;
      if (!reduit) f.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.23,1,.32,1)" });
    };
    addEventListener("hashchange", montrer); montrer();
  }
  // une ancre de la liste des commandes (#7E0B6D) : la ligne s'allume
  if (!fiches.length && /^#[A-Z0-9]{6}$/.test(location.hash)) {
    const l = document.getElementById(location.hash.slice(1));
    if (l?.tagName === "TR") { l.classList.add("est-cible"); l.scrollIntoView({ block: "center" }); }
  }

  /* ---------- info-bulles des graphiques ---------- */
  const bulle = $("[data-info-bulle]");
  const placer = (e, t) => { bulle.textContent = t; bulle.hidden = false; const r = bulle.getBoundingClientRect(); bulle.style.left = `${Math.min(innerWidth - r.width - 8, Math.max(8, e.clientX - r.width / 2))}px`; bulle.style.top = `${Math.max(8, e.clientY - r.height - 12)}px`; };
  document.addEventListener("pointermove", (e) => { const c = e.target.closest?.("[data-info]"); if (c) placer(e, c.dataset.info); else bulle.hidden = true; }, { passive: true });
  document.addEventListener("pointerleave", () => { bulle.hidden = true; });

  /* ---------- réglages : enregistrer seulement ce qui a changé ---------- */
  $$("[data-reglage]").forEach((f) => {
    const i = $("input", f), b = $("button", f), retour = $(".adm-reglage__retour", f);
    i.addEventListener("input", () => { b.disabled = i.value === i.dataset.initial || i.value === ""; retour.textContent = ""; f.classList.remove("est-erreur"); });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = Number(i.value), min = Number(i.min), max = Number(i.max);
      if (!Number.isInteger(v) || v < min || v > max) { retour.textContent = "Valeur hors des limites autorisées."; f.classList.add("est-erreur"); return; }
      b.disabled = true; b.textContent = "En cours…";
      setTimeout(() => {
        const avant = i.dataset.initial; i.dataset.initial = String(v); b.textContent = "Enregistrer";
        retour.textContent = `Enregistré. ${avant} → ${v}, écrit au journal.`;
        $(".adm-origine", f).textContent = "Modifié à l’instant par admin@droplink.fr.";
      }, reduit ? 100 : 600);
    });
  });
  $$("[data-interrupteur]").forEach((c) => c.addEventListener("change", () => annoncer(`${c.dataset.interrupteur} : ${c.checked ? "activé" : "désactivé"}, effet immédiat, écrit au journal.`)));

  /* ---------- dialogues : suspension, plan, blocage, contestation ---------- */
  const comptes = (() => { try { return JSON.parse($("[data-comptes]")?.textContent || "{}"); } catch { return {}; } })();
  const dlg = document.createElement("dialog");
  dlg.className = "adm-dialogue";
  document.body.append(dlg);
  const fermer = () => { if (reduit) { dlg.close(); return; } dlg.classList.add("sort"); setTimeout(() => { dlg.classList.remove("sort"); dlg.close(); }, 160); };
  dlg.addEventListener("click", (e) => { if (e.target === dlg) fermer(); });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); fermer(); });
  const ouvrir = ({ titre, aide, champs, confirmer, danger, valider, fait }) => {
    dlg.innerHTML = `<form method="dialog" class="adm-dialogue__corps" novalidate>
      <header><h2>${titre}</h2><button type="button" class="adm-dialogue__x" aria-label="Annuler" data-annuler>${ic("x")}</button></header>
      <p class="adm-dialogue__aide">${aide}</p>
      ${champs}
      <p class="adm-dialogue__erreur" role="alert"></p>
      <footer><button type="button" class="bouton-outil" data-annuler>Annuler</button><button type="submit" class="${danger ? "adm-danger" : "adm-confirmer"}">${confirmer}</button></footer>
    </form>`;
    const form = $("form", dlg), err = $(".adm-dialogue__erreur", dlg);
    $$("[data-annuler]", dlg).forEach((b) => b.addEventListener("click", fermer));
    $$("[data-sans-collage]", dlg).forEach((c) => c.addEventListener("paste", (e) => { e.preventDefault(); err.textContent = "Collage refusé. Recopiez l'adresse à la main : c'est le seul moment où l'on vérifie vraiment quel compte est visé."; }));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const msg = valider(form);
      if (msg) { err.textContent = msg; if (!reduit) form.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }], { duration: 280 }); return; }
      const b = $("[type=submit]", form); b.disabled = true; b.textContent = "En cours…";
      setTimeout(() => { fermer(); fait(form); }, reduit ? 100 : 650);
    });
    dlg.showModal();
    $("textarea, input", dlg)?.focus();
  };
  const motif = (aide) => `<label class="adm-champ"><span>Motif</span><textarea name="motif" rows="3" required></textarea><small>${aide}</small></label>`;
  const motifCourt = (form) => form.motif.value.trim().length < MOTIF_MIN ? "Le motif est trop court." : "";
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dialogue]"); if (!b) return;
    const sorte = b.dataset.dialogue, c = comptes[b.dataset.compte], ref = b.dataset.ref;
    if (sorte === "suspension") {
      const suspendre = c.statut === "active";
      ouvrir({
        titre: suspendre ? "Suspendre ce compte" : "Réactiver ce compte",
        aide: suspendre ? "Ses pages publiques cesseront immédiatement d'être servies. Ses liens ne seront pas détruits : une réactivation les rétablit à l'identique." : "Ses pages redeviendront accessibles sur les mêmes liens que ceux déjà envoyés à ses clients.",
        champs: motif(`Au moins ${MOTIF_MIN} caractères. Il s'affiche en clair dans le journal, et c'est ce qu'on relira si la décision est contestée.`)
          + `<label class="adm-champ"><span>Recopiez l'adresse du compte pour confirmer</span><input name="recopie" type="email" autocomplete="off" spellcheck="false" placeholder="${c.email}" data-sans-collage><small>Le collage est désactivé : recopier l'adresse est ce qui garantit que vous suspendez le bon compte.</small></label>`,
        confirmer: suspendre ? "Suspendre" : "Réactiver", danger: suspendre,
        valider: (f) => motifCourt(f) || (f.recopie.value.trim().toLowerCase() !== c.email ? "L'adresse recopiée ne correspond pas à ce compte." : ""),
        fait: () => {
          c.statut = suspendre ? "suspended" : "active";
          const f = $(`[data-fiche="${b.dataset.compte}"]`);
          const badge = $(".adm-fiche__etats .adm-badge", f); badge.dataset.statut = c.statut; badge.lastChild.textContent = suspendre ? "Suspendu" : "Actif";
          b.textContent = suspendre ? "Réactiver ce compte" : "Suspendre ce compte"; b.className = suspendre ? "bouton-outil" : "adm-danger";
          const bloc = b.closest(".adm-bloc"); $("h2", bloc).textContent = b.textContent; bloc.classList.toggle("adm-bloc--danger", !suspendre);
          $(".adm-texte", bloc).textContent = suspendre ? "Ses pages redeviendront accessibles sur les mêmes liens que ceux déjà envoyés à ses clients." : "Ses pages publiques cesseront immédiatement d'être servies. Ses liens ne seront pas détruits : une réactivation les rétablit à l'identique.";
          annoncer(`Effectué. ${suspendre ? "Compte suspendu" : "Compte réactivé"}, écrit au journal avec le motif.`);
        },
      });
    }
    if (sorte === "plan") {
      const versPro = c.plan === "gratuit";
      ouvrir({
        titre: versPro ? "Passer en Pro" : "Repasser en gratuit",
        aide: "Aucun paiement ne passe par DropLink : une fois le paiement reçu, passez le compte en Pro ici. Un vendeur Pro peut retirer la marque DropLink de ses pages client.",
        champs: motif(`Au moins ${MOTIF_MIN} caractères. Par exemple : « paiement reçu le 19/09 par virement ». Il s'affiche en clair dans le journal.`),
        confirmer: versPro ? "Passer en Pro" : "Repasser en gratuit",
        valider: motifCourt,
        fait: () => {
          c.plan = versPro ? "pro" : "gratuit";
          const f = $(`[data-fiche="${b.dataset.compte}"]`), p = $(".adm-plan", f);
          p.dataset.plan = c.plan; p.innerHTML = versPro ? `${ic("crown")}Pro` : "Gratuit";
          $(".adm-plan-ligne b", f).textContent = versPro ? "Pro" : "Gratuit";
          b.textContent = versPro ? "Repasser en gratuit" : "Passer en Pro";
          annoncer("Effectué. Changement de plan écrit au journal.");
        },
      });
    }
    if (sorte === "blocage") {
      const ligne = b.closest("tr"), bloque = !!$(".adm-badge[data-ton=erreur]", ligne);
      ouvrir({
        titre: bloque ? `Débloquer le lien de #${ref}` : `Bloquer le lien de #${ref}`,
        aide: bloque ? "La page revient sur le même lien, celui que le client a déjà reçu." : "Son client verra « Ce lien n'est plus valable ». Le lien n'est pas détruit : le débloquer le rétablit à l'identique. Vous ne voyez pas le contenu de la commande.",
        champs: motif(bloque ? `Au moins ${MOTIF_MIN} caractères. Il s'affiche en clair dans le journal, et c'est ce qu'on relira si la décision est contestée.` : `Au moins ${MOTIF_MIN} caractères. Le vendeur le lit dans sa commande, et il s'écrit au journal.`),
        confirmer: bloque ? "Débloquer le lien" : "Bloquer le lien", danger: !bloque,
        valider: motifCourt,
        fait: () => {
          const cellule = $(".adm-ref", ligne);
          if (bloque) { cellule.textContent = `#${ref}`; b.textContent = "Bloquer le lien"; }
          else { cellule.innerHTML = `#${ref} <span class="adm-badge" data-ton="erreur"><i></i>Lien bloqué</span>`; b.textContent = "Débloquer le lien"; }
          annoncer(bloque ? "Lien débloqué. La page revient sur le même lien." : "Lien bloqué. Le vendeur voit le motif dans sa commande.");
        },
      });
    }
    if (sorte === "contestation") {
      ouvrir({
        titre: `Contestation du blocage de #${ref}`,
        aide: "Envoyée par le vendeur le 30 sept. 2026 · première sur trois. Cette lecture est écrite au journal d’audit.",
        champs: `<blockquote class="adm-contest">Ces photos sont les miennes, prises dans mon atelier le 27/09. Je peux fournir les fichiers d’origine avec leurs métadonnées.</blockquote>
          <label class="adm-champ"><span>Votre réponse</span><textarea name="motif" rows="3" required></textarea><small>Au moins ${MOTIF_MIN} caractères. Le vendeur la lit, et elle s’écrit au journal.</small></label>`,
        confirmer: "Débloquer le lien",
        valider: motifCourt,
        fait: () => {
          const ligne = b.closest("tr");
          $(".adm-ref", ligne).textContent = `#${ref}`;
          $("[data-dialogue=blocage]", ligne).textContent = "Bloquer le lien";
          annoncer("Contestation acceptée : lien débloqué, réponse envoyée au vendeur.");
        },
      });
      // le second choix du produit : refuser, avec la même réponse écrite
      const pied = $("footer", dlg);
      const refuser = document.createElement("button");
      refuser.type = "button"; refuser.className = "bouton-outil adm-refuser"; refuser.textContent = "Refuser la contestation";
      pied.insertBefore(refuser, pied.lastElementChild);
      refuser.addEventListener("click", () => {
        const f = $("form", dlg), err = $(".adm-dialogue__erreur", dlg);
        if (motifCourt(f)) { err.textContent = "La réponse est trop courte."; return; }
        fermer(); b.remove(); annoncer("Contestation refusée. Le vendeur lit votre réponse ; le lien reste bloqué.");
      });
    }
  });
})();

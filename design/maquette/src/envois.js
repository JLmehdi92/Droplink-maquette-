// DropLink · Suivi d'envois (maquette fidèle au produit)
// Tuiles, menus, tris, colonnes, actions et libellés : ceux de /envois
// (droplink2, messages/fr.json « envois »). Les 19 colis sont ceux des
// commandes de la maquette : 2 pas encore scannés, 7 en transit, 1 sans
// mouvement depuis 12 jours, 9 livrés ; 7 Colissimo, 5 Mondial Relay,
// 4 Chronopost, 3 La Poste (les mêmes que le tableau de bord).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ic = (n) => `<svg class="ic"><use href="#i-${n}"/></svg>`;
  const { annoncer, aller } = window.DropLink;
  const signal = window.DropLink.ecran();
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.23,1,.32,1)";
  const SEUIL_SILENCE_JOURS = 10; // lib/tracking/silence.ts
  const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un).replace("#", n.toLocaleString("fr-FR"));
  const d = (j, h = 12, m = 0) => new Date(2026, 8, j, h, m);
  const oct = (j) => new Date(2026, 9, j, 12, 0);

  /* ---------- le jeu de démonstration ---------- */
  // [numéro, transporteur, état, [réf, client], premier mouvement, dernier mouvement, dernier point, arrivée du, arrivée au, interrogations]
  const BRUT = [
    ["6A30489215734", "Colissimo", "en_transit", ["6A4D21", "Léa M."], d(29, 18, 10), d(30, 8, 40), "Colis en cours d’acheminement", oct(1), oct(2), 6],
    ["6A31177420985", "Colissimo", "preparation", ["D41E08", "Mélissa K."], null, null, null, null, null, 4],
    ["6A30571182466", "Colissimo", "en_transit", ["C83D40", "Ethan G."], d(27, 16, 2), d(30, 7, 55), "Arrivé sur le site de distribution", d(30), d(30), 11],
    ["6A29917702231", "Colissimo", "livre", ["5E3C18", "Luca R."], d(24, 9, 30), d(27, 11, 5), "Votre colis a été livré", null, null, 14],
    ["6A29810034477", "Colissimo", "livre", ["7F40C9", "Maëlys D."], d(22, 14, 0), d(25, 10, 18), "Votre colis a été livré", null, null, 12],
    ["6A29655128410", "Colissimo", "livre", ["5A0C73", "Ilyes M."], d(18, 10, 41), d(21, 9, 4), "Votre colis a été livré", null, null, 13],
    ["6A29502216638", "Colissimo", "livre", ["C0E7B8", "Emma N."], d(13, 8, 20), d(16, 9, 48), "Votre colis a été livré", null, null, 15],
    ["MR48291174", "Mondial Relay", "en_transit", ["4E9B17", "Jade L."], d(27, 19, 30), d(29, 16, 5), "Colis en transit vers le Point Relais", oct(2), oct(3), 9],
    ["MR48175502", "Mondial Relay", "en_transit", ["91E2A4", "Sarah H."], d(26, 11, 12), d(29, 9, 40), "Colis pris en charge par Mondial Relay", oct(1), oct(2), 10],
    ["MR48213390", "Mondial Relay", "livre", ["9C1E07", "Yanis B."], d(24, 17, 2), d(29, 15, 22), "Colis livré en Point Relais", null, null, 16],
    ["MR47990210", "Mondial Relay", "livre", ["36A8E1", "Hugo F."], d(19, 9, 12), d(23, 8, 50), "Colis livré en Point Relais", null, null, 12],
    ["MR47851177", "Mondial Relay", "livre", ["28FD4A", "Samy O."], d(14, 16, 30), d(18, 10, 20), "Colis livré en Point Relais", null, null, 11],
    ["XW551920437FR", "Chronopost", "preparation", ["F0A3C2", "Noah P."], null, null, null, null, null, 5],
    ["XY418830211FR", "Chronopost", "en_transit", ["1B6E44", "Amine K."], d(27, 20, 5), d(29, 11, 30), "Colis en cours d’acheminement", oct(1), oct(1), 8],
    ["XY418992307FR", "Chronopost", "en_transit", ["E5F812", "Lina B."], d(26, 18, 44), d(29, 17, 48), "Colis en cours de livraison", d(30), d(30), 9],
    ["XY417763905FR", "Chronopost", "livre", ["B2D95F", "Nora A."], d(18, 19, 2), d(22, 11, 32), "Livraison effectuée", null, null, 10],
    ["LA982455120FR", "La Poste", "en_transit", ["0B6D7E", "Adam R."], d(25, 17, 5), d(28, 14, 12), "Votre colis est en cours d’acheminement", null, null, 9],
    ["LA981902774FR", "La Poste", "livre", ["E91B06", "Camille R."], d(16, 12, 0), d(20, 12, 15), "Votre colis a été livré", null, null, 12],
    ["LA982231665FR", "La Poste", "en_transit", ["7D2A90", "Inès D."], d(13, 9, 30), d(18, 9, 12), "Votre colis est en cours d’acheminement", null, null, 22],
  ];
  const ENVOIS = BRUT.map((r) => ({ numero: r[0], transp: r[1], etat: r[2], ref: r[3][0], client: r[3][1], premier: r[4], dernier: r[5], point: r[6], du: r[7], au: r[8], interrogations: r[9] }));
  const jours = (dt) => Math.floor((new Date(2026, 8, 30) - new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())) / 864e5);
  const silencieux = (e) => e.etat !== "livre" && e.dernier && jours(e.dernier) > SEUIL_SILENCE_JOURS;
  // immobile depuis : le dernier mouvement, ou l'enregistrement du numéro quand rien n'a encore bougé
  const immobileDepuis = (e) => e.dernier ?? d(28, 9, 0);

  /* ---------- libellés ---------- */
  const ETAT = { preparation: "Pas encore scanné", expedie: "Expédié", en_transit: "En transit", livre: "Livré" };
  const TON = { preparation: "attente", expedie: "transit", en_transit: "transit", livre: "livre" };
  const jourMois = (dt) => dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }).replace(" ", "\u00a0");
  const heure = (dt) => dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", " h ");
  const miseAJour = (e) => {
    if (!e.dernier) return "Pas encore d’information du transporteur";
    const j = jours(e.dernier);
    return j === 0 ? "Aujourd’hui" : j === 1 ? "Hier" : `il y a ${j}\u00a0jours`;
  };
  const prochaine = (e) => {
    if (e.etat === "livre") return ["Colis livré", "livre"];
    if (silencieux(e)) return [`Sans mouvement depuis ${jours(e.dernier)}\u00a0jours`, "silence"];
    if (e.du) return jours(e.du) === 0 ? ["Livraison prévue aujourd’hui", "bientot"] : [`Livraison prévue le ${jourMois(e.du)}`, ""];
    return [e.point ?? "", ""];
  };

  /* ---------- état de la vue ---------- */
  const etat = { statut: "", transp: "", q: "", tri: "immobiles" };
  const selection = new Set();
  const STATUTS = [["", "Tous les statuts"], ["preparation", "Pas encore scanné"], ["expedie", "Expédié"], ["en_transit", "En transit"], ["livre", "Livré"], ["silencieux", "Sans mouvement"], ["abandonnes", "Suivi arrêté"]];
  const TRANSPORTEURS = [["", "Tous les transporteurs"], ...[...new Set(ENVOIS.map((e) => e.transp))].map((t) => [t, t])];
  const TRIS = [["immobiles", "Ce qui ne bouge plus"], ["recents", "Mis à jour récemment"], ["anciens", "Mis à jour il y a longtemps"]];
  const filtrer = () => {
    let l = ENVOIS;
    if (etat.statut === "silencieux") l = l.filter(silencieux);
    else if (etat.statut === "abandonnes") l = l.filter((e) => e.abandonne);
    else if (etat.statut === "en_transit") l = l.filter((e) => e.etat === "en_transit" && !silencieux(e));
    else if (etat.statut) l = l.filter((e) => e.etat === etat.statut);
    if (etat.transp) l = l.filter((e) => e.transp === etat.transp);
    // la recherche porte sur le numéro seul, en lettres, chiffres et tiret
    const q = etat.q.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (q) l = l.filter((e) => e.numero.includes(q));
    const cle = { immobiles: (e) => (e.etat === "livre" ? 1e15 : 0) + +immobileDepuis(e), recents: (e) => -(e.dernier ?? d(28, 9, 0)), anciens: (e) => +(e.dernier ?? d(28, 9, 0)) }[etat.tri];
    return [...l].sort((a, b) => cle(a) - cle(b));
  };

  /* ---------- en-tête : fraîcheur et actualisation ---------- */
  let fraicheur = new Date(2026, 8, 30, 11, 52);
  const majFraicheur = () => { $("[data-fraicheur]").textContent = `${fraicheur.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à ${fraicheur.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`; };
  $("[data-actualiser]").addEventListener("click", (e) => {
    const b = e.currentTarget;
    if (b.classList.contains("est-en-cours")) return;
    b.classList.add("est-en-cours"); b.setAttribute("aria-busy", "true");
    setTimeout(() => { fraicheur = new Date(2026, 8, 30, 12, 0); majFraicheur(); b.classList.remove("est-en-cours"); b.removeAttribute("aria-busy"); rafraichir(); }, reduit ? 0 : 700);
  });

  /* ---------- tuiles : chacune filtre la liste ---------- */
  const TUILES = [
    ["", "Tous les envois", ENVOIS.length, "+4 ce mois-ci"],
    ["preparation", "Pas encore scanné", ENVOIS.filter((e) => e.etat === "preparation").length],
    ["en_transit", "En transit", ENVOIS.filter((e) => e.etat === "en_transit" && !silencieux(e)).length],
    ["silencieux", "Sans mouvement > 10 j", ENVOIS.filter(silencieux).length],
    ["livre", "Livrés ce mois", ENVOIS.filter((e) => e.etat === "livre").length],
  ];
  const zoneTuiles = $("[data-tuiles]");
  zoneTuiles.innerHTML = TUILES.map(([k, l, n, evol]) => `<button type="button" class="compteur-app compteur-app--bouton" data-tuile="${k}"${k === "silencieux" && n ? " data-alerte" : ""} aria-pressed="false"><span class="compteur-app__titre">${l}</span><span class="compteur-app__valeur">${n}</span>${evol ? `<span class="compteur-app__dessous"><span class="delta" data-ton="hausse">${evol}</span></span>` : ""}</button>`).join("");
  zoneTuiles.addEventListener("click", (e) => { const t = e.target.closest("[data-tuile]"); if (t) { etat.statut = t.dataset.tuile; majMenus(); rafraichir(); } });

  /* ---------- la mini-frise de progression ----------
     La même que sur les commandes, sans libellés (la colonne est étroite) :
     franchie pleine, courante cerclée, à venir creuse ; verte quand c'est livré,
     ambre quand le colis se tait depuis plus de dix jours. */
  const ETAPES = ["preparation", "expedie", "en_transit", "livre"];
  const miniFrise = (e) => {
    const k = ETAPES.indexOf(e.etat), s = silencieux(e);
    return `<span class="mini-frise" data-ton="${e.etat === "livre" ? "livre" : s ? "silence" : ""}" style="--k:${k}"><span class="sr">${s ? "Sans mouvement" : ETAT[e.etat]}</span>${ETAPES.map((_, i) => `<i data-etat="${i < k || e.etat === "livre" ? "fait" : i === k ? "actuel" : "avenir"}" aria-hidden="true"></i>`).join("")}</span>`;
  };
  const badge = (e) => (silencieux(e) ? `<span class="badge" data-ton="silence">Sans mouvement</span>` : `<span class="badge" data-ton="${TON[e.etat]}">${ETAT[e.etat]}</span>`);

  /* ---------- la table ---------- */
  const table = $("[data-table]");
  const tete = `<div class="rangee rangee--tete rangee--envoi" role="row">
    <span role="columnheader"><label class="coche"><input type="checkbox" aria-label="Tout sélectionner" data-tout><i></i></label></span>
    <span role="columnheader">Suivi</span><span role="columnheader">Commande</span><span role="columnheader">Client</span><span role="columnheader">Transporteur</span>
    <span role="columnheader">Statut</span><span role="columnheader">Progression</span><span role="columnheader">Dernière mise à jour</span><span role="columnheader">Prochaine étape</span><span role="columnheader"><span class="sr">Actions</span></span></div>`;
  const ligne = (e) => {
    const [p, tonP] = prochaine(e);
    return `<div class="rangee rangee--envoi" role="row" data-numero="${e.numero}"${selection.has(e.numero) ? " data-choisie" : ""}><div class="rangee__corps">
      <span role="cell"><label class="coche"><input type="checkbox" aria-label="Sélectionner le colis ${e.numero}" data-choix${selection.has(e.numero) ? " checked" : ""}><i></i></label></span>
      <span role="cell" class="col-numero">${e.numero}</span>
      <span role="cell" class="col-ref"><a href="commandes.html" data-voir>#${e.ref}</a></span>
      <span role="cell" class="col-client-envoi">${e.client}</span>
      <span role="cell" class="col-transp">${e.transp}</span>
      <span role="cell" class="col-statut">${badge(e)}</span>
      <span role="cell" class="col-progression">${miniFrise(e)}</span>
      <span role="cell" class="col-maj" title="${pluriel(e.interrogations, "# interrogation", "# interrogations")} du transporteur">${e.dernier ? `<span>${miseAJour(e)}</span><small>${heure(e.dernier)}</small>` : `<span class="vide">${miseAJour(e)}</span>`}</span>
      <span role="cell" class="col-prochaine" data-ton="${tonP}">${p}</span>
      <span role="cell" class="col-actions">
        <a class="action-ligne" href="commandes.html" aria-label="Voir la commande #${e.ref}" data-voir>${ic("package")}</a>
        <button type="button" class="action-ligne" aria-label="Ouvrir le site du transporteur" data-site>${ic("external-link")}</button>
      </span>
    </div></div>`;
  };
  const pied = $("[data-pied]"), vide = $("[data-vide]");
  const rendre = () => {
    const l = filtrer();
    table.innerHTML = tete + l.map(ligne).join("");
    table.hidden = !l.length; vide.hidden = !!l.length;
    vide.innerHTML = `<p class="liste__vide-titre">Aucun colis ne correspond à ce filtre.</p><button type="button" class="bouton-app bouton-app--second" data-effacer>Tout effacer</button>`;
    pied.innerHTML = l.length ? `<span>Affichage de 1 à ${l.length} sur ${pluriel(ENVOIS.length, "# envoi", "# envois")}</span>` : "";
    $$("[data-tuile]", zoneTuiles).forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.tuile === etat.statut)));
    majCoches();
  };
  let premiere = true;
  const rafraichir = () => {
    if (reduit || premiere) { premiere = false; rendre(); return; }
    table.animate([{ opacity: 1 }, { opacity: .35 }], { duration: 90, easing: "ease-out" }).finished.then(() => { rendre(); table.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 160, easing: "ease-out" }); });
  };
  document.addEventListener("click", (e) => { if (e.target.closest("[data-effacer]")) { Object.assign(etat, { statut: "", transp: "", q: "" }); $("[data-recherche-envoi] input").value = ""; majMenus(); rafraichir(); } }, { signal });

  /* ---------- menus : statut, transporteur, tri ---------- */
  const options = (liste, courant, attr) => liste.map(([v, l]) => `<button type="button" role="option" aria-selected="${v === courant}" data-${attr}="${v}">${l}</button>`).join("");
  const majMenus = () => {
    $("[data-pop-statut]").innerHTML = options(STATUTS, etat.statut, "statut");
    $("[data-pop-transp]").innerHTML = options(TRANSPORTEURS, etat.transp, "transp");
    $("[data-pop-tri]").innerHTML = options(TRIS, etat.tri, "tri");
    $("[data-statut-libelle]").textContent = STATUTS.find(([v]) => v === etat.statut)[1];
    $("[data-transp-libelle]").textContent = TRANSPORTEURS.find(([v]) => v === etat.transp)[1];
    $("[data-tri-libelle]").textContent = TRIS.find(([v]) => v === etat.tri)[1];
    $('[aria-controls="pop-statut"]').toggleAttribute("data-actif", !!etat.statut);
    $('[aria-controls="pop-transp"]').toggleAttribute("data-actif", !!etat.transp);
  };
  let ouvert = null;
  const fermer = () => { if (!ouvert) return; ouvert.pop.hidden = true; ouvert.bouton.setAttribute("aria-expanded", "false"); ouvert = null; };
  $$("[data-deroulant] > [data-ouvrir]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const pop = $(`#${b.getAttribute("aria-controls")}`);
    if (ouvert?.pop === pop) { fermer(); return; }
    fermer(); window.DropLink.fermerAlertes();
    pop.hidden = false; b.setAttribute("aria-expanded", "true"); ouvert = { bouton: b, pop };
    $("[aria-selected='true']", pop)?.focus({ preventScroll: true });
  }));
  document.addEventListener("click", (e) => { if (ouvert && !ouvert.pop.contains(e.target)) fermer(); }, { signal });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && ouvert) { const b = ouvert.bouton; fermer(); b.focus(); } }, { signal });
  $("[data-pop-statut]").addEventListener("click", (e) => { const o = e.target.closest("[data-statut]"); if (o) { etat.statut = o.dataset.statut; fermer(); majMenus(); rafraichir(); } });
  $("[data-pop-transp]").addEventListener("click", (e) => { const o = e.target.closest("[data-transp]"); if (o) { etat.transp = o.dataset.transp; fermer(); majMenus(); rafraichir(); } });
  $("[data-pop-tri]").addEventListener("click", (e) => { const o = e.target.closest("[data-tri]"); if (o) { etat.tri = o.dataset.tri; fermer(); majMenus(); rafraichir(); } });

  /* ---------- recherche : sur le numéro, à la frappe ---------- */
  const champ = $("[data-recherche-envoi] input");
  let minuterie = 0;
  champ.addEventListener("input", () => { clearTimeout(minuterie); minuterie = setTimeout(() => { etat.q = champ.value; rafraichir(); }, 160); });
  $("[data-recherche-envoi]").addEventListener("submit", (e) => { e.preventDefault(); etat.q = champ.value; rafraichir(); });

  /* ---------- gestes d'une ligne ---------- */
  table.addEventListener("click", (e) => {
    const r = e.target.closest("[data-numero]"); if (!r) return;
    const env = ENVOIS.find((x) => x.numero === r.dataset.numero);
    if (e.target.closest("[data-voir]")) {
      // « Voir la commande » : la liste des commandes, cherchée sur ce numéro de suivi
      e.preventDefault(); e.stopPropagation();
      try { sessionStorage.setItem("dl-recherche", env.numero); } catch { /* la liste s'ouvre sans filtre */ }
      aller("commandes.html");
    }
    if (e.target.closest("[data-site]")) annoncer(`Maquette : le suivi ${env.transp} de ce colis s’ouvrirait dans un nouvel onglet.`);
  });

  /* ---------- sélection : exporter la sélection ---------- */
  const lot = $("[data-lot]");
  const majCoches = () => {
    const visibles = $$("[data-choix]", table), tout = $("[data-tout]", table);
    if (tout) { const n = visibles.filter((c) => c.checked).length; tout.checked = n > 0 && n === visibles.length; tout.indeterminate = n > 0 && n < visibles.length; }
    const n = selection.size;
    $("[data-lot-n]").textContent = String(n);
    $("[data-lot-libelle]").textContent = n > 1 ? "colis sélectionnés" : "colis sélectionné";
    if (n && lot.hidden) { lot.hidden = false; requestAnimationFrame(() => lot.classList.add("est-visible")); }
    if (!n && !lot.hidden) { lot.classList.remove("est-visible"); setTimeout(() => { if (!selection.size) lot.hidden = true; }, reduit ? 0 : 200); }
  };
  table.addEventListener("change", (e) => {
    if (e.target.matches("[data-tout]")) $$("[data-choix]", table).forEach((c) => { c.checked = e.target.checked; const r = c.closest("[data-numero]"); if (c.checked) selection.add(r.dataset.numero); else selection.delete(r.dataset.numero); r.toggleAttribute("data-choisie", c.checked); });
    else if (e.target.matches("[data-choix]")) { const r = e.target.closest("[data-numero]"); if (e.target.checked) selection.add(r.dataset.numero); else selection.delete(r.dataset.numero); r.toggleAttribute("data-choisie", e.target.checked); }
    majCoches();
  });
  $("[data-lot-fermer]").addEventListener("click", () => { selection.clear(); $$("[data-choix], [data-tout]", table).forEach((c) => { c.checked = false; }); $$("[data-choisie]", table).forEach((r) => r.removeAttribute("data-choisie")); majCoches(); });
  $("[data-lot-exporter]").addEventListener("click", () => annoncer(`Maquette : le CSV de ${pluriel(selection.size, "# colis", "# colis")} se téléchargerait.`));

  /* ---------- premier affichage ---------- */
  majFraicheur(); majMenus(); rendre(); premiere = false;
  if (!reduit && !document.documentElement.dataset.arrivee) $$(".mini-frise", table).forEach((f, i) => f.animate([{ opacity: 0, transform: "translateX(-4px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: 80 + i * 16, easing: EASE, fill: "backwards" }));
})();

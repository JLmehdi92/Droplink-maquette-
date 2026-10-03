// DropLink · Commandes (maquette fidèle au produit)
// Colonnes, vues, filtres, tris, actions et libellés : ceux de /commandes
// (droplink2, messages/fr.json « commandes »). Jeu de démonstration cohérent
// avec le tableau de bord : 24 commandes actives (le badge du menu), 7 en
// préparation, 8 en transit, 9 livrées, 19 colis suivis, une jamais ouverte
// et un colis sans mouvement depuis 12 jours (les deux alertes de la cloche).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ic = (n, c = "") => `<svg class="ic${c ? " " + c : ""}"><use href="#i-${n}"/></svg>`;
  const { annoncer, champRecherche, rechercherSurPlace } = window.DropLink;
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.23,1,.32,1)";
  // chaque écran se débranche quand on en part (navigation sans rechargement, coque.js)
  const signal = window.DropLink.ecran();
  const MAINTENANT = new Date(2026, 8, 30, 12, 0);
  const SEUIL_SILENCE_JOURS = 10; // lib/tracking/silence.ts
  const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un).replace("#", n.toLocaleString("fr-FR"));
  const sansAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/æ/g, "ae").replace(/œ/g, "oe").toLowerCase();
  const echapper = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- le jeu de démonstration ---------- */
  const srcPhotos = [...$("template[data-pc]").content.querySelectorAll(".pc__grille img")].map((img) => img.getAttribute("src"));
  const PHOTOS = Object.fromEntries(["sneaker", "hoodie", "jogger", "cap"].map((n, i) => [n, srcPhotos[i]]));
  const d = (j, h = 12, m = 0) => new Date(2026, 8, j, h, m);
  // [réf, client, référence produit, numéro de suivi, statut, qc, créée, modifiée, vues, dernière vue, colis bougé, photos, vignettes]
  const BRUT = [
    ["6A4D21", "Léa M.", "Sneakers T39, sweat, jogging et casquette", "6A30489215734", "en_transit", "en_attente", d(30, 9, 12), d(30, 11, 48), 3, d(30, 11, 2), d(30, 8, 40), 4, ["sneaker", "hoodie"]],
    ["8B1F63", "Chloé V.", "Doudoune courte beige", "", "preparation", "en_attente", d(30, 8, 30), d(30, 8, 51), 1, d(30, 9, 5), null, 8, ["hoodie", "cap"]],
    ["3F8B52", "Sofia M.", "Jogging noir taille M", "", "preparation", "en_attente", d(29, 16, 48), d(29, 17, 2), 0, null, null, 3, ["jogger"]],
    ["2C7A95", "Rayan T.", "Pack 3 t-shirts blancs", "", "preparation", "en_attente", d(29, 10, 2), d(29, 14, 20), 2, d(29, 19, 41), null, 4, ["hoodie", "jogger"]],
    ["D41E08", "Mélissa K.", "Sac bandoulière noir", "6A31177420985", "preparation", "en_attente", d(28, 15, 26), d(29, 9, 10), 1, d(28, 21, 3), null, 5, ["cap", "hoodie"]],
    ["F0A3C2", "Noah P.", "Sneakers grises T42", "XW551920437FR", "preparation", "approuve", d(28, 11, 40), d(28, 18, 2), 2, d(29, 8, 12), null, 6, ["sneaker", "jogger"]],
    ["6D3A52", "Yasmine B.", "Hoodie gris chiné", "", "preparation", "en_attente", d(27, 19, 15), d(27, 19, 30), 1, d(28, 10, 44), null, 4, ["hoodie"]],
    ["A7C5D0", "Karim S.", "Veste en jean brut", "", "preparation", "en_attente", d(27, 14, 5), d(27, 14, 22), 1, d(27, 20, 16), null, 3, ["hoodie", "cap"]],
    ["4E9B17", "Jade L.", "Bonnet côtelé gris", "MR48291174", "en_transit", "approuve", d(26, 17, 33), d(28, 9, 4), 4, d(29, 18, 22), d(29, 16, 5), 3, ["cap"]],
    ["C83D40", "Ethan G.", "Survêtement complet noir", "6A30571182466", "en_transit", "en_attente", d(26, 10, 18), d(27, 11, 0), 3, d(29, 12, 30), d(30, 7, 55), 5, ["jogger", "hoodie"]],
    ["1B6E44", "Amine K.", "Sneakers blanches T43", "XY418830211FR", "en_transit", "refuse", d(25, 13, 50), d(30, 9, 0), 2, d(29, 21, 14), d(29, 11, 30), 5, ["sneaker"]],
    ["E5F812", "Lina B.", "Lunettes de soleil écaille", "XY418992307FR", "en_transit", "approuve", d(25, 9, 41), d(26, 8, 12), 6, d(30, 7, 20), d(29, 17, 48), 4, ["cap", "sneaker"]],
    ["0B6D7E", "Adam R.", "Sneakers noires T41", "LA982455120FR", "en_transit", "en_attente", d(24, 16, 2), d(25, 10, 45), 2, d(27, 13, 3), d(28, 14, 12), 6, ["sneaker", "jogger"]],
    ["91E2A4", "Sarah H.", "Robe pull côtelée", "MR48175502", "en_transit", "approuve", d(24, 11, 12), d(25, 9, 30), 5, d(30, 10, 2), d(29, 9, 40), 5, ["hoodie"]],
    ["9C1E07", "Yanis B.", "Hoodie noir taille L", "MR48213390", "livre", "approuve", d(22, 18, 5), d(30, 11, 0), 7, d(30, 10, 58), d(29, 15, 22), 4, ["hoodie", "cap"]],
    ["5E3C18", "Luca R.", "Crème de soin cuir + hoodie", "6A29917702231", "livre", "approuve", d(20, 10, 30), d(28, 12, 0), 9, d(28, 19, 12), d(27, 11, 5), 7, ["hoodie", "sneaker"]],
    ["7F40C9", "Maëlys D.", "Sweat zippé crème", "6A29810034477", "livre", "approuve", d(19, 15, 10), d(25, 16, 40), 8, d(26, 9, 3), d(25, 10, 18), 5, ["hoodie"]],
    ["36A8E1", "Hugo F.", "Casquette brodée bleue", "MR47990210", "livre", "approuve", d(18, 12, 22), d(23, 9, 15), 4, d(23, 18, 44), d(23, 8, 50), 3, ["cap"]],
    ["B2D95F", "Nora A.", "Mocassins cuir T38", "XY417763905FR", "livre", "approuve", d(17, 9, 55), d(22, 14, 3), 6, d(22, 20, 10), d(22, 11, 32), 6, ["sneaker", "cap"]],
    ["5A0C73", "Ilyes M.", "Maillot rétro vert", "6A29655128410", "livre", "en_attente", d(16, 18, 40), d(21, 10, 12), 3, d(21, 19, 55), d(21, 9, 4), 4, ["hoodie", "jogger"]],
    ["E91B06", "Camille R.", "Pantalon cargo kaki", "LA981902774FR", "livre", "approuve", d(15, 11, 3), d(20, 17, 28), 5, d(21, 8, 40), d(20, 12, 15), 5, ["jogger"]],
    ["28FD4A", "Samy O.", "Sneakers blanches T44", "MR47851177", "livre", "approuve", d(13, 20, 12), d(18, 11, 50), 7, d(19, 12, 1), d(18, 10, 20), 6, ["sneaker", "hoodie"]],
    ["7D2A90", "Inès D.", "Casquette noire", "LA982231665FR", "en_transit", "approuve", d(12, 16, 30), d(18, 10, 40), 5, d(27, 22, 8), d(18, 9, 12), 2, ["cap"]],
    ["C0E7B8", "Emma N.", "Écharpe laine rouge", "6A29502216638", "livre", "refuse", d(11, 10, 45), d(16, 15, 5), 4, d(17, 9, 30), d(16, 9, 48), 4, ["cap", "hoodie"]],
  ];
  const ARCHIVEES = [
    ["A2C981", "Tom V.", "Sweat à capuche marine", "MR47512208", "livre", "approuve", d(2, 14, 10), d(9, 11, 0), 6, d(8, 20, 3), d(8, 10, 12), 5, ["hoodie"]],
    ["E4B017", "Inès K.", "Sneakers blanches T37", "6A29188450172", "livre", "approuve", d(1, 9, 30), d(7, 16, 45), 5, d(7, 18, 30), d(6, 14, 2), 4, ["sneaker"]],
  ];
  const versCommande = (r, archivee = false) => ({
    ref: r[0], client: r[1], reference: r[2], suivi: r[3], statut: r[4], qc: r[5], creee: r[6], modifiee: r[7],
    vues: r[8], derniereVue: r[9], bouge: r[10], photos: r[11], vignettes: r[12], archivee,
  });
  const COMMANDES = [...BRUT.map((r) => versCommande(r)), ...ARCHIVEES.map((r) => versCommande(r, true))];
  const joursSilence = (c) => (c.statut === "en_transit" && c.bouge ? Math.floor((MAINTENANT - c.bouge) / 864e5) : 0);
  const bloquee = (c) => joursSilence(c) > SEUIL_SILENCE_JOURS;

  /* ---------- formats ---------- */
  const jourCourt = (dt) => dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");
  const heure = (dt) => dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dateLongue = (dt) => `${dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à ${heure(dt).replace(":", " h ")}`;
  const STATUT = { preparation: "Préparation", expedie: "Expédié", en_transit: "En transit", livre: "Livré" };
  const TON = { preparation: "attente", expedie: "transit", en_transit: "transit", livre: "livre" };
  const QC = { en_attente: "En attente", approuve: "Approuvées", refuse: "Refusées" };
  const TRIS = { recentes: "Plus récentes", anciennes: "Plus anciennes", modifiees: "Modifiées en dernier", "jamais-ouvert": "Jamais ouvertes par le client", bloquees: "Bloquées en transit" };

  /* ---------- état de la vue ---------- */
  const etat = { vue: "toutes", tri: "recentes", q: "", statut: "", qc: "", archives: false, du: "", au: "" };
  const selection = new Set();

  const filtrer = () => {
    const nq = sansAccent(etat.q);
    let l = COMMANDES.filter((c) => c.archivee === etat.archives);
    if (etat.vue === "en-transit") l = l.filter((c) => c.statut === "en_transit");
    if (etat.vue === "jamais-ouvertes") l = l.filter((c) => c.vues === 0);
    if (etat.vue === "bloquees") l = l.filter(bloquee);
    if (etat.tri === "jamais-ouvert") l = l.filter((c) => c.vues === 0);
    if (etat.tri === "bloquees") l = l.filter(bloquee);
    if (etat.statut) l = l.filter((c) => c.statut === etat.statut);
    if (etat.qc) l = l.filter((c) => c.qc === etat.qc);
    if (etat.du) l = l.filter((c) => c.creee >= new Date(`${etat.du}T00:00`));
    if (etat.au) l = l.filter((c) => c.creee < new Date(new Date(`${etat.au}T00:00`).getTime() + 864e5));
    // la colonne générée `recherche` : nom du client, référence produit, numéro de suivi, accents ignorés
    if (nq) l = l.filter((c) => sansAccent(`${c.client} ${c.reference} ${c.suivi}`).includes(nq));
    const cle = { recentes: (c) => -c.creee, anciennes: (c) => +c.creee, modifiees: (c) => -c.modifiee, "jamais-ouvert": (c) => -c.creee, bloquees: (c) => +c.bouge }[etat.tri];
    return l.sort((a, b) => cle(a) - cle(b));
  };

  /* ---------- en-tête et tuiles ---------- */
  const actives = () => COMMANDES.filter((c) => !c.archivee);
  const majEntete = () => {
    const a = actives(), debutSemaine = d(28, 0, 0);
    $("[data-sous-titre]").textContent = etat.archives
      ? "Vous consultez vos archives. Les liens continuent de fonctionner."
      : `${pluriel(a.length, "# commande", "# commandes")}, ${pluriel(a.filter((c) => c.creee >= debutSemaine).length, "# créée", "# créées")} cette semaine`;
    const T = [
      ["preparation", "En préparation", a.filter((c) => c.statut === "preparation").length],
      ["transit", "En transit", a.filter((c) => c.statut === "en_transit").length],
      ["jamais", "Jamais ouvertes", a.filter((c) => c.vues === 0).length],
      ["livrees", "Livrées", a.filter((c) => c.statut === "livre").length],
    ];
    $("[data-tuiles]").innerHTML = T.map(([k, l, n]) => `<div class="compteur-app"${k === "jamais" && n > 0 ? ' data-alerte' : ""}><p class="compteur-app__titre">${l}</p><p class="compteur-app__valeur">${n}</p></div>`).join("");
    const menu = document.querySelector('.app__nav [data-nav="commandes"] .app__compte');
    if (menu) menu.textContent = String(a.length);
  };

  /* ---------- la frise de suivi, améliorée ----------
     Mêmes quatre étapes que l'énumération de la base. Ce qu'elle dit en plus,
     sans rien inventer : l'étape COURANTE se distingue des étapes franchies,
     la série passe au vert quand c'est livré, à l'ambre quand le colis se tait
     depuis plus de dix jours, et le survol donne le dernier mouvement du colis
     (`colisBougeLe`, déjà lu par la liste). */
  const ETAPES = ["preparation", "expedie", "en_transit", "livre"];
  const frise = (c) => {
    const k = ETAPES.indexOf(c.statut), silence = bloquee(c);
    const ton = c.statut === "livre" ? "livre" : silence ? "silence" : "";
    const info = c.bouge ? `Dernier mouvement du colis : ${dateLongue(c.bouge)}` : c.suivi ? "Pas encore d’information du transporteur" : "Pas encore de numéro de suivi";
    return `<div class="frise" data-ton="${ton}" style="--k:${k}" title="${info}">
      <span class="sr">${silence ? `Sans mouvement depuis ${joursSilence(c)} jours` : STATUT[c.statut]}. ${info}.</span>
      <i class="frise__rail" aria-hidden="true"><i class="frise__plein"></i></i>
      ${ETAPES.map((e, i) => `<span class="frise__etape" data-etat="${i < k || (c.statut === "livre") ? "fait" : i === k ? "actuel" : "avenir"}" aria-hidden="true"><i></i><small>${STATUT[e]}</small></span>`).join("")}
    </div>`;
  };
  const badge = (c) => {
    const j = joursSilence(c);
    return j > SEUIL_SILENCE_JOURS ? `<span class="badge" data-ton="silence">Sans mouvement · ${j} j</span>` : `<span class="badge" data-ton="${TON[c.statut]}">${STATUT[c.statut]}</span>`;
  };

  /* ---------- la table ---------- */
  const table = $("[data-table]");
  const tete = `<div class="rangee rangee--tete" role="row">
    <span role="columnheader"><label class="coche"><input type="checkbox" aria-label="Tout sélectionner" data-tout><i></i></label></span>
    <span role="columnheader">Commande</span><span role="columnheader">Date</span><span role="columnheader">Client</span>
    <span role="columnheader" class="col-produits">Produits</span><span role="columnheader">Numéro de suivi</span>
    <span role="columnheader">Statut</span><span role="columnheader">Suivi</span><span role="columnheader"><span class="sr">Actions</span></span></div>`;
  const ligne = (c) => `<div class="rangee" role="row" data-ref="${c.ref}"${selection.has(c.ref) ? " data-choisie" : ""}><div class="rangee__corps">
    <span role="cell"><label class="coche"><input type="checkbox" aria-label="Sélectionner ${c.client}" data-choix${selection.has(c.ref) ? " checked" : ""}><i></i></label></span>
    <span role="cell" class="col-commande"><img src="${PHOTOS[c.vignettes[0]]}" alt="" width="36" height="36"><a href="#" data-maquette="Commande #${c.ref}" aria-label="Ouvrir la commande #${c.ref}">#${c.ref}</a></span>
    <span role="cell" class="col-date"><span>${jourCourt(c.creee)}</span><small>${heure(c.creee)}</small></span>
    <span role="cell" class="col-client"><b>${echapper(c.client)}</b>${c.vues ? `<small title="Dernière ouverture le ${dateLongue(c.derniereVue)}">${pluriel(c.vues, "# vue", "# vues")}</small>` : `<small class="jamais" title="${echapper(c.client)} n’a pas encore ouvert son lien.">Jamais ouvert</small>`}</span>
    <span role="cell" class="col-produits"><span class="vignettes">${c.vignettes.map((v) => `<img src="${PHOTOS[v]}" alt="" width="28" height="28">`).join("")}${c.photos > c.vignettes.length ? `<em>+${c.photos - c.vignettes.length}</em>` : ""}</span></span>
    <span role="cell" class="col-suivi">${c.suivi ? echapper(c.suivi) : '<span class="vide">Aucun</span>'}</span>
    <span role="cell" class="col-statut">${badge(c)}</span>
    <span role="cell" class="col-frise">${frise(c)}</span>
    <span role="cell" class="col-actions">
      <button type="button" class="action-ligne" aria-label="Copier le lien de ${echapper(c.client)}" data-copier>${ic("copy")}</button>
      <button type="button" class="action-ligne" aria-label="Ouvrir la page de ${echapper(c.client)}" data-ouvrir-page>${ic("external-link")}</button>
      <span class="deroulant">
        <button type="button" class="action-ligne" aria-label="Plus d’actions pour ${echapper(c.client)}" aria-expanded="false" data-plus>${ic("ellipsis")}</button>
      </span>
    </span>
    <span class="carte-meta" aria-hidden="true">${pluriel(c.photos, "# photo", "# photos")} · ${c.vues ? pluriel(c.vues, "# vue", "# vues") : "Jamais ouvert"}</span>
  </div></div>`;

  const pied = $("[data-pied]"), vide = $("[data-vide]");
  let premiere = true;
  const rendre = () => {
    const l = filtrer();
    table.innerHTML = tete + l.map(ligne).join("");
    table.hidden = !l.length;
    vide.hidden = !!l.length;
    if (!l.length) {
      const actif = etat.q || etat.statut || etat.qc || etat.du || etat.au || etat.vue !== "toutes" || ["jamais-ouvert", "bloquees"].includes(etat.tri);
      vide.innerHTML = etat.archives && !actif
        ? `<p class="liste__vide-titre">Aucune commande archivée</p>`
        : `<p class="liste__vide-titre">Aucune commande ne correspond</p><p>Ce compte contient des commandes, mais aucune ne passe les filtres en cours.</p>${etat.q ? "<p>La recherche ignore les accents : « creme » trouve aussi « Crème ».</p>" : ""}<button type="button" class="bouton-app bouton-app--second" data-tout-effacer>Tout effacer</button>`;
    }
    const total = etat.archives ? COMMANDES.filter((c) => c.archivee).length : actives().length;
    pied.innerHTML = l.length ? `<span>Affichage de ${l.length} sur ${pluriel(total, "# commande", "# commandes")}</span><span>Fin de la liste.</span>` : "";
    majCoches();
    // la frise se remplit une fois, au premier affichage ; ensuite la liste se lit sans attendre
    if (premiere && !reduit && !document.documentElement.dataset.arrivee) {
      $$(".frise__plein", table).forEach((f, i) => f.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 520, delay: 120 + i * 18, easing: EASE, fill: "backwards" }));
    }
    premiere = false;
  };
  const rafraichir = () => {
    if (reduit || premiere) { rendre(); majPuces(); return; }
    table.animate([{ opacity: 1 }, { opacity: .35 }], { duration: 90, easing: "ease-out" }).finished.then(() => { rendre(); majPuces(); table.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 160, easing: "ease-out" }); });
  };

  /* ---------- puces des filtres actifs ---------- */
  const zonePuces = $("[data-puces]");
  const majPuces = () => {
    const p = [];
    if (etat.q) p.push(["q", `Recherche : « ${echapper(etat.q)} »`]);
    if (etat.statut) p.push(["statut", `Statut : ${STATUT[etat.statut]}`]);
    if (etat.qc) p.push(["qc", `Photos : ${QC[etat.qc]}`]);
    const iso = (s) => jourCourt(new Date(`${s}T00:00`));
    if (etat.du && etat.au) p.push(["periode", `Période : du ${iso(etat.du)} au ${iso(etat.au)}`]);
    else if (etat.du) p.push(["periode", `Période : à partir du ${iso(etat.du)}`]);
    else if (etat.au) p.push(["periode", `Période : jusqu’au ${iso(etat.au)}`]);
    if (etat.archives) p.push(["archives", "Archives"]);
    zonePuces.hidden = !p.length;
    zonePuces.innerHTML = `<span class="puces__titre">Filtres actifs :</span>${p.map(([k, l]) => `<button type="button" class="puce" data-retirer="${k}" aria-label="Retirer le filtre : ${l}">${l}${ic("x")}</button>`).join("")}<button type="button" class="bouton-texte" data-tout-effacer>Tout effacer</button>`;
    const n = [etat.statut, etat.qc, etat.archives].filter(Boolean).length;
    $("[data-filtres-n]").hidden = !n; $("[data-filtres-n]").textContent = String(n);
    const lib = etat.du && etat.au ? `${iso(etat.du)} au ${iso(etat.au)}` : etat.du ? `À partir du ${iso(etat.du)}` : etat.au ? `Jusqu’au ${iso(etat.au)}` : "Toutes les périodes";
    $("[data-periode-libelle]").textContent = lib;
    majEntete();
  };
  const effacer = (k) => {
    if (k === "q") { etat.q = ""; champRecherche.value = ""; }
    if (k === "statut") etat.statut = "";
    if (k === "qc") etat.qc = "";
    if (k === "periode") { etat.du = ""; etat.au = ""; }
    if (k === "archives") { etat.archives = false; selection.clear(); }
    synchroniserFormulaires(); rafraichir();
  };
  document.addEventListener("click", (e) => {
    const r = e.target.closest("[data-retirer]"); if (r) effacer(r.dataset.retirer);
    if (e.target.closest("[data-tout-effacer]")) { ["q", "statut", "qc", "periode", "archives"].forEach((k) => { if (k === "q") { etat.q = ""; champRecherche.value = ""; } else if (k === "periode") { etat.du = ""; etat.au = ""; } else etat[k] = k === "archives" ? false : ""; }); choisirVue("toutes", false); choisirTri("recentes", false); synchroniserFormulaires(); rafraichir(); }
  }, { signal });

  /* ---------- déroulants : filtres, tri, période, export, menu de ligne ---------- */
  let ouvert = null;
  const fermer = () => { if (!ouvert) return; ouvert.pop.hidden = true; ouvert.bouton.setAttribute("aria-expanded", "false"); ouvert = null; };
  const ouvrir = (bouton, pop) => {
    fermer(); window.DropLink.fermerAlertes();
    pop.hidden = false; bouton.setAttribute("aria-expanded", "true"); ouvert = { bouton, pop };
    (pop.querySelector("select, input, [aria-selected='true'], button") ?? pop).focus?.({ preventScroll: true });
  };
  $$("[data-deroulant] > [data-ouvrir]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); const pop = $(`#${b.getAttribute("aria-controls")}`); if (ouvert?.pop === pop) fermer(); else ouvrir(b, pop); }));
  document.addEventListener("click", (e) => { if (ouvert && !ouvert.pop.contains(e.target) && !e.target.closest("[data-plus]")) fermer(); }, { signal });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && ouvert) { const b = ouvert.bouton; fermer(); b.focus(); } }, { signal });

  const formFiltres = $("[data-pop-filtres]"), formPeriode = $("[data-pop-periode]");
  const synchroniserFormulaires = () => {
    formFiltres.statut.value = etat.statut; formFiltres.qc.value = etat.qc; formFiltres.archives.checked = etat.archives;
    formPeriode.du.value = etat.du; formPeriode.au.value = etat.au;
  };
  formFiltres.addEventListener("submit", (e) => {
    e.preventDefault();
    const archives = formFiltres.archives.checked;
    if (archives !== etat.archives) selection.clear();
    Object.assign(etat, { statut: formFiltres.statut.value, qc: formFiltres.qc.value, archives });
    fermer(); rafraichir();
  });
  $("[data-filtres-effacer]").addEventListener("click", () => { Object.assign(etat, { statut: "", qc: "", archives: false }); synchroniserFormulaires(); fermer(); rafraichir(); });
  formPeriode.addEventListener("submit", (e) => { e.preventDefault(); etat.du = formPeriode.du.value; etat.au = formPeriode.au.value; fermer(); rafraichir(); });
  $("[data-periode-effacer]").addEventListener("click", () => { etat.du = ""; etat.au = ""; synchroniserFormulaires(); fermer(); rafraichir(); });

  const choisirTri = (t, rendreAussi = true) => {
    etat.tri = t;
    $$("[data-tri]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tri === t)));
    $('[aria-controls="pop-tri"] span').textContent = t === "recentes" ? "Trier" : TRIS[t];
    if (rendreAussi) rafraichir();
  };
  $$("[data-tri]").forEach((b) => b.addEventListener("click", () => { choisirTri(b.dataset.tri); fermer(); }));
  $("[data-telecharger]").addEventListener("click", () => {
    fermer();
    const n = filtrer().length;
    // la page ne peut pas déclencher de téléchargement dans l'Artifact : on dit ce que le produit ferait
    annoncer(`Maquette : le CSV de ${pluriel(n, "# commande", "# commandes")} se téléchargerait (filtres de la vue repris).`);
  });

  /* ---------- vues (pilules) ---------- */
  const vues = $("[data-vues]"), trait = $("[data-vues-trait]");
  const placerTrait = (anime = true) => {
    const b = $(`[data-vue="${etat.vue}"]`, vues);
    trait.style.transition = anime && !reduit ? "" : "none";
    trait.style.width = `${b.offsetWidth}px`; trait.style.transform = `translateX(${b.offsetLeft}px)`;
  };
  const choisirVue = (v, rendreAussi = true) => {
    etat.vue = v;
    $$("[data-vue]", vues).forEach((b) => { const on = b.dataset.vue === v; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    placerTrait();
    if (rendreAussi) rafraichir();
  };
  $$("[data-vue]", vues).forEach((b, i, tous) => {
    b.addEventListener("click", () => { if (b.dataset.vue !== etat.vue) choisirVue(b.dataset.vue); });
    b.addEventListener("keydown", (e) => { const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!k) return; e.preventDefault(); const n = tous[(i + k + tous.length) % tous.length]; n.focus(); n.click(); });
  });
  const obsVues = new ResizeObserver(() => placerTrait(false)); obsVues.observe(vues);
  signal.addEventListener("abort", () => obsVues.disconnect());

  /* ---------- recherche : filtre sur place ---------- */
  rechercherSurPlace((q) => { etat.q = q; rafraichir(); });

  /* ---------- sélection & actions groupées ---------- */
  const lot = $("[data-lot]");
  const majCoches = () => {
    const visibles = $$("[data-choix]", table);
    const tout = $("[data-tout]", table);
    if (tout) { const n = visibles.filter((c) => c.checked).length; tout.checked = n > 0 && n === visibles.length; tout.indeterminate = n > 0 && n < visibles.length; }
    const n = selection.size;
    $("[data-lot-n]").textContent = String(n);
    $("[data-lot-libelle]").textContent = n > 1 ? "sélectionnées" : "sélectionnée";
    $("[data-lot-archiver]").textContent = etat.archives ? "Sortir la sélection des archives" : "Archiver la sélection";
    if (n && lot.hidden) { lot.hidden = false; requestAnimationFrame(() => lot.classList.add("est-visible")); }
    if (!n && !lot.hidden) { lot.classList.remove("est-visible"); setTimeout(() => { if (!selection.size) lot.hidden = true; }, reduit ? 0 : 200); }
  };
  table.addEventListener("change", (e) => {
    if (e.target.matches("[data-tout]")) {
      $$("[data-choix]", table).forEach((c) => { c.checked = e.target.checked; const ref = c.closest("[data-ref]").dataset.ref; if (c.checked) selection.add(ref); else selection.delete(ref); c.closest("[data-ref]").toggleAttribute("data-choisie", c.checked); });
    } else if (e.target.matches("[data-choix]")) {
      const r = e.target.closest("[data-ref]");
      if (e.target.checked) selection.add(r.dataset.ref); else selection.delete(r.dataset.ref);
      r.toggleAttribute("data-choisie", e.target.checked);
    }
    majCoches();
  });
  $("[data-lot-fermer]").addEventListener("click", () => { selection.clear(); $$("[data-choix], [data-tout]", table).forEach((c) => { c.checked = false; }); $$("[data-choisie]", table).forEach((r) => r.removeAttribute("data-choisie")); majCoches(); });

  // archiver : la ligne se replie, puis la liste se recompte. « Chaque action groupée est tout ou rien. »
  const archiver = (refs) => {
    const vers = !etat.archives;
    const lignes = refs.map((r) => $(`[data-ref="${r}"]`, table)).filter(Boolean);
    refs.forEach((r) => { COMMANDES.find((c) => c.ref === r).archivee = vers; selection.delete(r); });
    const fin = () => { rendre(); majPuces(); };
    annoncer(`${pluriel(refs.length, "# commande traitée", "# commandes traitées")}.`);
    if (reduit || !lignes.length) { fin(); return; }
    lignes.forEach((l) => l.classList.add("est-partie"));
    setTimeout(fin, 260);
  };
  $("[data-lot-archiver]").addEventListener("click", () => archiver([...selection]));

  /* ---------- gestes d'une ligne ---------- */
  const menuLigne = document.createElement("div");
  menuLigne.className = "pop pop--menu pop--ligne"; menuLigne.hidden = true; menuLigne.id = "pop-ligne";
  document.body.append(menuLigne);
  signal.addEventListener("abort", () => menuLigne.remove());
  table.addEventListener("click", async (e) => {
    const r = e.target.closest("[data-ref]"); if (!r) return;
    const c = COMMANDES.find((x) => x.ref === r.dataset.ref);
    const b = e.target.closest("button");
    if (b?.matches("[data-copier]")) {
      try { await navigator.clipboard.writeText(`https://droplink.fr/p/exemple-${c.ref.toLowerCase()}`); } catch { /* presse-papiers refusé : l'annonce suffit pour une maquette */ }
      b.innerHTML = ic("check"); b.classList.add("est-copie"); annoncer(`Lien de ${c.client} copié`);
      setTimeout(() => { b.innerHTML = ic("copy"); b.classList.remove("est-copie"); }, 1600);
    }
    if (b?.matches("[data-ouvrir-page]")) ouvrirPage(c);
    if (b?.matches("[data-plus]")) {
      e.stopPropagation();
      if (ouvert?.pop === menuLigne && ouvert.bouton === b) { fermer(); return; }
      menuLigne.innerHTML = `<button type="button" data-dupliquer>${ic("copy")}Dupliquer comme gabarit</button><button type="button" data-archiver>${ic(c.archivee ? "archive-restore" : "archive")}${c.archivee ? "Sortir des archives" : "Archiver"}</button>`;
      const rb = b.getBoundingClientRect();
      menuLigne.style.top = `${Math.min(innerHeight - 110, rb.bottom + 6)}px`; menuLigne.style.left = `${Math.max(12, rb.right - 220)}px`;
      menuLigne.dataset.ref = c.ref;
      ouvrir(b, menuLigne);
    }
  });
  menuLigne.addEventListener("click", (e) => {
    const c = COMMANDES.find((x) => x.ref === menuLigne.dataset.ref);
    if (e.target.closest("[data-dupliquer]")) { fermer(); annoncer(`Maquette : une nouvelle commande reprendrait « ${c.reference} ».`); }
    if (e.target.closest("[data-archiver]")) { fermer(); archiver([c.ref]); }
  });
  addEventListener("scroll", () => { if (ouvert?.pop === menuLigne) fermer(); }, { passive: true, signal });

  /* ---------- la page publique d'une commande ---------- */
  const fond = $("[data-page-publique]"), ecran = $("[data-page-ecran]");
  const pc = $("template[data-pc]").content.firstElementChild.cloneNode(true);
  pc.setAttribute("data-etats", ""); ecran.append(pc);
  let focusAvant = null;
  const ouvrirPage = (c) => {
    $("[data-pc-pour]", pc).textContent = `pour ${c.client}`;
    $(".pc__commande > b", pc).textContent = c.ref;
    pc.classList.add("a-client", "a-photos");
    pc.classList.toggle("a-suivi", !!c.suivi);
    const k = ETAPES.indexOf(c.statut), f = $("[data-pc-frise]", pc);
    f.style.setProperty("--avance", String(Math.min(k, 3)));
    $$("li", f).forEach((li, i) => { li.classList.toggle("fait", i < k || (k === 3 && i === 3)); li.classList.toggle("actuel", i === k && k < 3); });
    const j = joursSilence(c);
    $("[data-pc-bandeau]", pc).textContent = c.statut === "livre" ? "Votre colis a été livré" : c.bouge ? "Votre colis est en transit" : "Votre colis a été expédié";
    $("[data-pc-mouvement]", pc).textContent = j > SEUIL_SILENCE_JOURS ? `Aucun mouvement depuis ${j} jours` : c.bouge ? `Dernier mouvement le ${jourCourt(c.bouge)}` : "En attente du transporteur";
    const ordre = [...c.vignettes, ...["sneaker", "hoodie", "jogger", "cap"].filter((x) => !c.vignettes.includes(x))];
    $$(".pc__grille img", pc).forEach((img, i) => { img.src = PHOTOS[ordre[i]]; img.parentElement.hidden = i >= c.photos; });
    $("[data-pc-compte]", pc).textContent = `(${c.photos})`;
    focusAvant = document.activeElement;
    fond.hidden = false; requestAnimationFrame(() => fond.classList.add("est-visible"));
    $("[data-fermer-page].page-publique__fermer", fond).focus();
  };
  const fermerPage = () => { fond.classList.remove("est-visible"); setTimeout(() => { fond.hidden = true; }, reduit ? 0 : 200); focusAvant?.focus?.({ preventScroll: true }); };
  $$("[data-fermer-page]", fond).forEach((b) => b.addEventListener("click", fermerPage));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !fond.hidden) fermerPage(); }, { signal });

  /* ---------- premier affichage ---------- */
  // la cloche mène ici avec #jamais-ouvertes ; le tableau de bord avec une recherche en attente
  if (location.hash === "#jamais-ouvertes") choisirVue("jamais-ouvertes", false);
  try { const q = sessionStorage.getItem("dl-recherche"); if (q) { etat.q = q; champRecherche.value = q; sessionStorage.removeItem("dl-recherche"); } } catch { /* sans stockage, pas de recherche reprise */ }
  addEventListener("hashchange", () => { if (location.hash === "#jamais-ouvertes") choisirVue("jamais-ouvertes"); }, { signal });
  majEntete(); rendre(); majPuces(); placerTrait(false);
})();

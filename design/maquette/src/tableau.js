// DropLink · tableau de bord (maquette fidèle au produit)
// Chaque panneau reprend une lecture que /tableau-de-bord fait réellement
// (droplink2 : lib/analyses/activite.ts, recente.ts, envois/liste.ts,
// commandes/liste.ts) et ses libellés exacts (messages/fr.json). Les lectures
// d'analyse et leurs graphiques sont partagés avec l'écran Analyses
// (analytique.js), comme dans le produit.
(() => {
  const finPointeur = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  // chaque écran se débranche quand on en part (navigation sans rechargement, coque.js)
  const signal = window.DropLink.ecran();

  /* ---------- le jeu de démonstration ---------- */
  const srcPhotos = [...$("template[data-pc]").content.querySelectorAll(".pc__grille img")].map((img) => img.getAttribute("src"));
  const PHOTOS = Object.fromEntries(["sneaker", "hoodie", "jogger", "cap"].map((n, i) => [n, srcPhotos[i]]));
  // les cinq dernières commandes, par date de modification (DERNIERES_COMMANDES = 5)
  const COMMANDES = [
    { ref: "6A4D21", client: "Léa M.", statut: "en_transit", etape: 2, modif: "il y a 12 min", photo: "sneaker" },
    { ref: "9C1E07", client: "Yanis B.", statut: "livre", etape: 3, modif: "il y a 1 h", photo: "hoodie" },
    { ref: "1B6E44", client: "Amine K.", statut: "en_transit", etape: 2, modif: "il y a 3 h", photo: "sneaker" },
    { ref: "3F8B52", client: "Sofia M.", statut: "preparation", etape: 0, modif: "hier", photo: "jogger" },
    { ref: "7D2A90", client: "Inès D.", statut: "en_transit", etape: 2, silence: 12, modif: "il y a 12 j", photo: "cap" },
  ];
  // order_status et ses libellés de liste (commandes.statut.*)
  const STATUT = { preparation: ["Préparation", "attente"], expedie: ["Expédié", "transit"], en_transit: ["En transit", "transit"], livre: ["Livré", "livre"] };
  const A = window.DropLinkAnalytique;
  const { PERIODES } = A;
  const majCompteurs = A.compteurs($("[data-compteurs]"));

  /* ---------- le graphique : la frise des semaines, ou les ouvertures par jour ---------- */
  const zoneGraphe = $("[data-graphe]"), tableGraphe = $("[data-table-graphe]");
  let vueGraphe = "semaines", periode = "30j";
  const TEXTES_GRAPHE = {
    semaines: ["Évolution des commandes", "Nombre de commandes créées par semaine, sur les 12 dernières semaines."],
    liens: ["Liens clients", "Nombre d’ouvertures des liens de suivi."],
  };
  const dessinerGraphe = (anime) => {
    $("[data-graphe-titre]").textContent = TEXTES_GRAPHE[vueGraphe][0];
    $("[data-graphe-aide]").textContent = TEXTES_GRAPHE[vueGraphe][1];
    if (vueGraphe === "semaines") A.frise(zoneGraphe, tableGraphe, anime); else A.liens(zoneGraphe, tableGraphe, PERIODES[periode], anime);
  };
  const redessiner = () => A.redessiner(zoneGraphe, dessinerGraphe);
  $$("[data-vue-graphe]").forEach((b, i, tous) => {
    b.addEventListener("click", () => {
      if (b.dataset.vueGraphe === vueGraphe) return;
      vueGraphe = b.dataset.vueGraphe;
      tous.forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      redessiner();
    });
    b.addEventListener("keydown", (e) => { const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!k) return; e.preventDefault(); const n = tous[(i + k + tous.length) % tous.length]; n.focus(); n.click(); });
  });

  /* ---------- dernières commandes ---------- */
  $("[data-dernieres]").innerHTML = COMMANDES.map((c) => {
    const [l, ton] = c.silence ? [`Sans mouvement · ${c.silence} j`, "silence"] : STATUT[c.statut];
    return `<li><a href="#" class="derniere" data-ref="${c.ref}" data-maquette="Commande #${c.ref}">
      <img src="${PHOTOS[c.photo]}" alt="" width="36" height="36">
      <span class="derniere__qui"><b>${c.client}</b><small>#${c.ref} · ${c.modif}</small></span>
      <span class="badge" data-ton="${ton}">${l}</span></a></li>`;
  }).join("");

  /* ---------- aperçu de la page client au survol (la même page que l'aperçu de la fiche commande) ---------- */
  const apercu = $("[data-apercu]"), ecran = $("[data-apercu-ecran]");
  const pc = $("template[data-pc]").content.firstElementChild.cloneNode(true);
  pc.setAttribute("data-etats", "");
  ecran.append(pc);
  const BANDEAU = { en_transit: ["Votre colis est en transit", "Mouvement aujourd’hui"], livre: ["Votre colis a été livré", "Livré le 29 sept."], silence: ["Votre colis est en transit", "Aucun mouvement depuis 12 jours"] };
  const remplirApercu = (c) => {
    $("[data-pc-pour]", pc).textContent = `pour ${c.client}`;
    $(".pc__commande > b", pc).textContent = c.ref;
    pc.classList.add("a-client", "a-photos");
    pc.classList.toggle("a-suivi", c.statut !== "preparation");
    const f = $("[data-pc-frise]", pc), k = c.etape;
    f.style.setProperty("--avance", String(Math.min(k, 3)));
    $$("li", f).forEach((li, i) => { li.classList.toggle("fait", i < k || (k === 3 && i === 3)); li.classList.toggle("actuel", i === k && k < 3); });
    const b = BANDEAU[c.silence ? "silence" : c.statut];
    if (b) { $("[data-pc-bandeau]", pc).textContent = b[0]; $("[data-pc-mouvement]", pc).textContent = b[1]; }
    const ordre = [c.photo, ...["sneaker", "hoodie", "jogger", "cap"].filter((x) => x !== c.photo)];
    $$(".pc__grille img", pc).forEach((img, i) => { img.src = PHOTOS[ordre[i]]; });
  };
  const LARG = 236, HAUT = 236 * 844 / 390 + 20;
  let apercuPour = null, minuterie = 0;
  const ouvrirApercu = (lien) => {
    const c = COMMANDES.find((x) => x.ref === lien.dataset.ref);
    if (apercuPour !== c) remplirApercu(c);
    apercuPour = c;
    // à gauche de la liste : la ligne survolée reste lisible
    const r = lien.closest(".bloc").getBoundingClientRect(), l = lien.getBoundingClientRect();
    apercu.style.setProperty("--x", `${Math.max(16, r.left - LARG - 20)}px`);
    apercu.style.setProperty("--y", `${Math.max(12, Math.min(innerHeight - HAUT - 12, l.top + l.height / 2 - HAUT / 2))}px`);
    apercu.hidden = false; requestAnimationFrame(() => apercu.classList.add("est-visible"));
  };
  const fermerApercu = () => { apercu.classList.remove("est-visible"); clearTimeout(minuterie); minuterie = setTimeout(() => { if (!apercu.classList.contains("est-visible")) apercu.hidden = true; }, 200); };
  if (finPointeur) {
    let ouvert = false, intention = 0;
    $$(".derniere").forEach((l) => {
      l.addEventListener("pointerenter", () => { clearTimeout(intention); clearTimeout(minuterie); if (ouvert) ouvrirApercu(l); else intention = setTimeout(() => { ouvert = true; ouvrirApercu(l); }, 450); });
      l.addEventListener("pointerleave", () => clearTimeout(intention));
    });
    $("[data-dernieres]").addEventListener("pointerleave", () => { ouvert = false; fermerApercu(); });
    addEventListener("scroll", () => { if (ouvert) { ouvert = false; fermerApercu(); } }, { passive: true, signal });
  }

  /* ---------- répartition des statuts, transporteurs, activité récente ---------- */
  $("[data-colis-total]").textContent = `${A.totalColis} colis`;
  A.colis($("[data-envois]"));
  A.activite($("[data-activite]"));
  const appliquer = () => { const P = PERIODES[periode]; majCompteurs(P); A.transporteurs($("[data-transp]"), P); };

  /* ---------- période ---------- */
  A.periodes($("[data-periodes]"), (p) => {
    periode = p; appliquer();
    if (vueGraphe === "liens") redessiner(); // la frise des semaines ne dépend pas de la période
  }, signal);

  /* ---------- premier affichage ---------- */
  appliquer();
  requestAnimationFrame(() => dessinerGraphe(!document.documentElement.dataset.arrivee));
  A.suivreLargeur(zoneGraphe, dessinerGraphe, signal);
})();

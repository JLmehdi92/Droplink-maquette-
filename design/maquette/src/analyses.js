// DropLink · Analyses (maquette fidèle au produit)
// Les mêmes lectures que le tableau de bord (analytique.js), dans l'ordre et
// avec les panneaux de /analyses : les commandes les plus consultées (trois),
// les réponses des clients et le bandeau final en plus.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const signal = window.DropLink.ecran();
  const A = window.DropLinkAnalytique;
  const { PERIODES, nb, changer } = A;
  const srcPhotos = [...$("template[data-pc]").content.querySelectorAll(".pc__grille img")].map((img) => img.getAttribute("src"));
  const PHOTOS = Object.fromEntries(["sneaker", "hoodie", "jogger", "cap"].map((n, i) => [n, srcPhotos[i]]));
  let periode = "30j";

  const majCompteurs = A.compteurs($("[data-compteurs]"));
  const zoneFrise = $("[data-frise]"), zoneLiens = $("[data-liens]");
  const dessinerFrise = (anime) => A.frise(zoneFrise, $("[data-table-frise]"), anime);
  const dessinerLiens = (anime) => A.liens(zoneLiens, $("[data-table-liens]"), PERIODES[periode], anime);

  $("[data-colis-total]").textContent = String(A.totalColis);
  A.colis($("[data-colis]"));
  A.activite($("[data-activite]"));

  /* ---------- les commandes les plus consultées (PLUS_CONSULTEES = 3) ---------- */
  const consultees = (P) => {
    const max = P.consultees[0][2];
    $("[data-consultees]").innerHTML = P.consultees.map(([ref, client, vues, photo], i) => `
      <li><a href="#" class="consultee" data-maquette="Commande #${ref}">
        <span class="consultee__rang">${i + 1}</span>
        <img src="${PHOTOS[photo]}" alt="" width="40" height="40">
        <span class="consultee__qui"><b>${client}</b><small>#${ref}</small></span>
        <span class="consultee__vues"><b>${vues}</b><small>vue${vues > 1 ? "s" : ""}</small></span>
        <i class="consultee__barre" style="--p:${vues / max}" aria-hidden="true"></i>
      </a></li>`).join("");
  };

  /* ---------- les réponses des clients ----------
     Le taux porte sur ce qui a été répondu (approuvé + refusé), jamais sur
     tout : une commande sans réponse n'est pas un refus. Ordre des parts validé
     au script dataviz : le gris sépare le vert du rouge. */
  const reponses = (P) => {
    const [ok, ko, sans] = P.qc, total = ok + ko + sans, repondu = ok + ko;
    const zone = $("[data-qc]");
    const parts = [["ok", "Approuvé", ok], ["sans", "Sans réponse", sans], ["ko", "Refusé", ko]];
    if (!zone.innerHTML) zone.innerHTML = `<p class="reponses__taux"><b data-taux></b><span data-taux-texte></span></p><div data-parts></div>`;
    changer($("[data-taux]", zone), `${Math.round(ok / repondu * 100)}&#8239;%`);
    // analyses.reponsesSur : « {n} réponses sur {total} »
    $("[data-taux-texte]", zone).innerHTML = `des réponses approuvent les photos<small>${repondu} réponse${repondu > 1 ? "s" : ""} sur ${total}</small>`;
    $("[data-parts]", zone).innerHTML = A.barreEtLegende(parts, total);
  };

  const appliquer = () => {
    const P = PERIODES[periode];
    majCompteurs(P); A.transporteurs($("[data-transp]"), P); consultees(P); reponses(P);
    $("[data-liens-total]").textContent = `${nb(P.vues)} ouvertures`;
  };
  A.periodes($("[data-periodes]"), (p) => { periode = p; appliquer(); A.redessiner(zoneLiens, dessinerLiens); }, signal);

  /* ---------- premier affichage ---------- */
  appliquer();
  const anime = !document.documentElement.dataset.arrivee;
  requestAnimationFrame(() => { dessinerFrise(anime); dessinerLiens(anime); });
  A.suivreLargeur(zoneFrise, dessinerFrise, signal);
  A.suivreLargeur(zoneLiens, dessinerLiens, signal);
})();

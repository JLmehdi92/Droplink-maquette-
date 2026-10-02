// DropLink · les lectures d'analyse de la maquette, partagées par le tableau de
// bord et l'écran Analyses. Dans le produit, /tableau-de-bord ne calcule rien
// lui-même : il réutilise les lectures de /analyses (lib/analyses/activite.ts),
// pour que le vendeur ne voie jamais deux nombres différents pour la même
// chose. La maquette fait pareil : un seul jeu de données, un seul dessin.
window.DropLinkAnalytique = (() => {
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ic = (n) => `<svg class="ic"><use href="#i-${n}"/></svg>`;
  const nb = (n, d = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const s = (n) => (n > 1 ? "s" : "");
  const EASE = "cubic-bezier(.23,1,.32,1)";
  const AUJOURDHUI = new Date(2026, 8, 30);
  const dateCourte = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");

  /* ---------- le jeu de démonstration ----------
     24 commandes créées sur 30 jours, 23 ouvertes (une jamais ouverte, celle
     de l'alerte), 19 colis suivis : 7 Colissimo, 5 Mondial Relay, 4 Chronopost,
     3 La Poste — les numéros de suivi des écrans Commandes et Suivi d'envois. */
  const PERIODES = {
    "7j": { jours: 7, creees: [6, 5], livrees: 4, vues: 38, ouvertes: 5, qc: [4, 1, 1], delai: [3.4, 4], transp: [["Colissimo", 3], ["Mondial Relay", 1], ["Chronopost", 1]],
      consultees: [["E5F812", "Lina B.", 6, "cap"], ["91E2A4", "Sarah H.", 5, "hoodie"], ["4E9B17", "Jade L.", 4, "cap"]] },
    "30j": { jours: 30, creees: [24, 19], livrees: 17, vues: 142, ouvertes: 23, qc: [19, 2, 3], delai: [3.8, 17], transp: [["Colissimo", 7], ["Mondial Relay", 5], ["Chronopost", 4], ["La Poste", 3]],
      consultees: [["5E3C18", "Luca R.", 9, "hoodie"], ["7F40C9", "Maëlys D.", 8, "hoodie"], ["9C1E07", "Yanis B.", 7, "hoodie"]] },
    "90j": { jours: 90, creees: [61, 44], livrees: 49, vues: 406, ouvertes: 60, qc: [47, 5, 9], delai: [4.1, 49], transp: [["Colissimo", 21], ["Mondial Relay", 14], ["Chronopost", 7], ["La Poste", 4], ["Autres", 3]],
      consultees: [["5E3C18", "Luca R.", 9, "hoodie"], ["7F40C9", "Maëlys D.", 8, "hoodie"], ["28FD4A", "Samy O.", 7, "sneaker"]] },
  };
  const SEMAINES = [3, 4, 5, 3, 5, 4, 4, 6, 5, 6, 7, 6]; // SEMAINES_FRISE = 12, indépendante de la période
  const COLIS = [["transit", "En transit", 7], ["livre", "Livrés", 9], ["attente", "Pas encore scannés", 2], ["silence", "Sans mouvement", 1]];
  // order_events, les cinq plus récents (ACTIVITE_RECENTE = 5), libellés de editeur.historique.types
  const FAITS = [
    ["media_ajoute", "Média ajouté", "images", "", "6A4D21", "il y a 12 min"],
    ["commande_modifiee", "Commande modifiée", "package", "", "6A4D21", "il y a 14 min"],
    ["qc_approuve", "Contrôle approuvé par le client", "circle-check", "ok", "9C1E07", "il y a 1 h"],
    ["qc_refuse", "Contrôle refusé par le client", "circle-x", "refus", "1B6E44", "il y a 3 h"],
    ["commande_creee", "Commande créée", "plus", "", "3F8B52", "hier"],
  ];

  // ouvertures par jour : bruit déterministe, ramené exactement au total de la période
  const repartir = (jours, total) => {
    let g = jours * 7919;
    const alea = () => { g = (g * 16807) % 2147483647; return g / 2147483647; };
    const poids = Array.from({ length: jours }, (_, i) => 0.45 + alea() + (i % 7 >= 5 ? 0.35 : 0) + i / jours * 0.4);
    const somme = poids.reduce((a, b) => a + b, 0);
    const brut = poids.map((p) => p / somme * total);
    const arr = brut.map(Math.floor);
    const reste = total - arr.reduce((a, b) => a + b, 0);
    brut.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).slice(0, reste).forEach(([, i]) => { arr[i] += 1; });
    return arr;
  };

  /* ---------- un chiffre qui change se fond, flouté, plutôt que de défiler ---------- */
  const changer = (el, html) => {
    if (el.innerHTML === html) return;
    if (reduit || !el.innerHTML) { el.innerHTML = html; return; }
    el.animate([{ opacity: 1, filter: "blur(0)" }, { opacity: 0, filter: "blur(3px)" }], { duration: 110, easing: "ease-out" }).finished.then(() => {
      el.innerHTML = html;
      el.animate([{ opacity: 0, filter: "blur(3px)", transform: "translateY(3px)" }, { opacity: 1, filter: "blur(0)", transform: "none" }], { duration: 220, easing: EASE });
    });
  };

  /* ---------- Vue d'ensemble : les cinq compteurs ---------- */
  const compteurs = (zone) => {
    const C = [["creees", "Commandes créées"], ["livrees", "Commandes livrées"], ["liens", "Liens clients ouverts"], ["validation", "Taux de validation des photos"], ["delai", "Temps moyen de livraison"]];
    zone.innerHTML = C.map(([cle, titre]) => `<div class="compteur-app" data-compteur="${cle}"><p class="compteur-app__titre">${titre}</p><p class="compteur-app__valeur" data-valeur></p><p class="compteur-app__dessous" data-dessous></p></div>`).join("");
    return (P) => {
      const [ok, ko] = P.qc, reponses = ok + ko;
      const ecart = P.creees[0] - P.creees[1];
      // le sens de la variation est une couleur : c'est la seule information de l'écran qui dise une direction
      const ton = ecart > 0 ? "hausse" : ecart < 0 ? "baisse" : "";
      const V = {
        creees: [nb(P.creees[0]), `<span class="delta" data-ton="${ton}">${ecart > 0 ? "+" : ""}${nb(ecart)} vs période précédente</span>`],
        livrees: [nb(P.livrees), `${P.livrees} sur ${P.creees[0]} créées`],
        liens: [nb(P.vues), `${nb(Math.round(P.vues / P.ouvertes * 10) / 10, 1)} vues par commande ouverte`],
        validation: [`${Math.round(ok / reponses * 100)}&#8239;%`, `${reponses} réponse${s(reponses)} sur ${P.creees[0]}`],
        delai: [`${nb(P.delai[0], 1)} jours`, `sur ${P.delai[1]} colis livré${s(P.delai[1])}`],
      };
      for (const [cle, [v, d]] of Object.entries(V)) {
        const c = $(`[data-compteur="${cle}"]`, zone);
        changer($("[data-valeur]", c), v);
        changer($("[data-dessous]", c), d);
      }
    };
  };

  /* ---------- les graphiques ---------- */
  const lundi = new Date(AUJOURDHUI); lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  const semaines = SEMAINES.map((n, i) => { const d = new Date(lundi); d.setDate(d.getDate() - (11 - i) * 7); return { n, d }; });
  const placerBulle = (zone, bulle, px, py) => {
    const bw = bulle.offsetWidth || 190, W = zone.clientWidth;
    bulle.style.transform = `translate(${Math.round(Math.min(W - bw, Math.max(0, px - bw / 2)))}px, ${Math.round(Math.max(0, py - 64))}px)`;
  };
  // la frise des douze semaines
  const frise = (zone, table, anime) => {
    const W = Math.max(280, zone.clientWidth), H = zone.clientHeight || 240, gauche = 30, bas = 26, haut = 10;
    const max = Math.ceil(Math.max(...SEMAINES) / 4) * 4;
    const pas = (W - gauche) / 12, lb = Math.min(28, pas * 0.56);
    const y = (v) => haut + (1 - v / max) * (H - bas - haut);
    zone.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
        <g class="graphe__grille">${[0, max / 2, max].map((v) => `<line x1="${gauche}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
        <g class="graphe__axe">${[0, max / 2, max].map((v) => `<text x="${gauche - 10}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
          ${semaines.map((sm, i) => ((pas >= 44 ? i % 2 === 0 && i < 10 : i % 4 === 0 && i < 8) || i === 11 ? `<text x="${gauche + pas * i + pas / 2}" y="${H - 6}" text-anchor="middle">${i === 11 ? "Cette sem." : dateCourte(sm.d)}</text>` : "")).join("")}</g>
        ${semaines.map((sm, i) => { const h = y(0) - y(sm.n); return `<rect class="graphe__barre${i === 11 ? " est-courante" : ""}" x="${gauche + pas * i + (pas - lb) / 2}" y="${y(0) - h}" width="${lb}" height="${h}" rx="4"/>`; }).join("")}
      </svg>
      <div class="graphe__zone" tabindex="0" role="img" aria-label="Évolution des commandes sur 12 semaines. Flèches gauche et droite pour lire chaque semaine."></div>
      <div class="bulle" data-bulle></div>`;
    if (anime && !reduit) $$(".graphe__barre", zone).forEach((b, i) => b.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 520, delay: i * 35, easing: EASE, fill: "backwards" }));
    // une seule zone pour toute la frise : au doigt, douze colonnes de 25 px seraient autant de cibles trop petites
    const bulle = $("[data-bulle]", zone), cible = $(".graphe__zone", zone);
    cible.style.left = `${gauche / W * 100}%`;
    const montrer = (i) => {
      i = Math.max(0, Math.min(11, i)); cible.dataset.i = String(i);
      const sm = semaines[i];
      $$(".graphe__barre", zone).forEach((b, k) => b.classList.toggle("est-visee", k === i));
      bulle.innerHTML = `<p class="bulle__date">Semaine du ${dateCourte(sm.d)}</p><p><span>Commandes créées</span><b>${sm.n}</b></p>`;
      placerBulle(zone, bulle, (gauche + pas * i + pas / 2) * zone.clientWidth / W, y(sm.n));
      zone.classList.add("est-vise");
    };
    const cacher = () => { zone.classList.remove("est-vise"); $$(".graphe__barre", zone).forEach((b) => b.classList.remove("est-visee")); };
    cible.addEventListener("pointermove", (e) => { const r = cible.getBoundingClientRect(); montrer(Math.floor((e.clientX - r.left) / r.width * 12)); });
    cible.addEventListener("pointerleave", cacher);
    cible.addEventListener("focus", () => montrer(11));
    cible.addEventListener("blur", cacher);
    cible.addEventListener("keydown", (e) => { const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (k) { e.preventDefault(); montrer(+(cible.dataset.i ?? 11) + k); } });
    if (table) table.innerHTML = `<thead><tr><th scope="col">Semaine du</th><th scope="col">Commandes créées</th></tr></thead><tbody>${semaines.map((sm) => `<tr><td>${dateCourte(sm.d)}</td><td>${sm.n}</td></tr>`).join("")}</tbody>`;
  };
  // les ouvertures des liens, jour par jour, sur la période
  const liens = (zone, table, P, anime) => {
    const serie = repartir(P.jours, P.vues);
    const W = Math.max(280, zone.clientWidth), H = zone.clientHeight || 240, gauche = 30, bas = 26, haut = 10;
    const max = Math.max(4, Math.ceil(Math.max(...serie) / 4) * 4);
    const x = (i) => gauche + i / (serie.length - 1) * (W - gauche - 6), y = (v) => haut + (1 - v / max) * (H - bas - haut);
    const d = serie.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const debut = new Date(AUJOURDHUI); debut.setDate(debut.getDate() - (P.jours - 1));
    const jour = (i) => { const dd = new Date(debut); dd.setDate(dd.getDate() + i); return dd; };
    const tics = [0, Math.round((P.jours - 1) / 2), P.jours - 1];
    const id = `aire-${Math.random().toString(36).slice(2, 7)}`;
    zone.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
        <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".16"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
        <g class="graphe__grille">${[0, max / 2, max].map((v) => `<line x1="${gauche}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
        <g class="graphe__axe">${[0, max / 2, max].map((v) => `<text x="${gauche - 10}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
          ${tics.map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === P.jours - 1 ? "end" : "middle"}">${dateCourte(jour(i))}</text>`).join("")}</g>
        <path class="graphe__aire" d="${d}L${x(serie.length - 1)},${y(0)}L${gauche},${y(0)}Z" fill="url(#${id})"/>
        <path class="graphe__trait" d="${d}" pathLength="1"/>
        <line class="graphe__reticule" y1="${haut}" y2="${y(0)}"/>
        <circle class="graphe__point" r="4.5"/>
      </svg>
      <div class="graphe__zone" tabindex="0" role="img" aria-label="Liens clients : ${P.vues} ouvertures. Flèches gauche et droite pour lire chaque jour."></div>
      <div class="bulle" data-bulle></div>`;
    if (anime && !reduit) {
      $(".graphe__trait", zone).animate([{ strokeDasharray: "1", strokeDashoffset: 1 }, { strokeDasharray: "1", strokeDashoffset: 0 }], { duration: 900, easing: EASE });
      $(".graphe__aire", zone).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 300, easing: "ease-out", fill: "backwards" });
    }
    const cible = $(".graphe__zone", zone), bulle = $("[data-bulle]", zone);
    const ret = $(".graphe__reticule", zone), pt = $(".graphe__point", zone);
    const viser = (i) => {
      i = Math.max(0, Math.min(serie.length - 1, i)); cible.dataset.i = String(i);
      ret.setAttribute("x1", x(i)); ret.setAttribute("x2", x(i)); pt.setAttribute("cx", x(i)); pt.setAttribute("cy", y(serie[i]));
      // analyses.ouverturesLe : « {n} ouverture(s) le {jour} »
      bulle.innerHTML = `<p class="bulle__date">${jour(i).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p><p><span>Ouvertures</span><b>${serie[i]}</b></p>`;
      placerBulle(zone, bulle, x(i) * zone.clientWidth / W, y(serie[i]));
      zone.classList.add("est-vise");
    };
    cible.addEventListener("pointermove", (e) => { const r = cible.getBoundingClientRect(); viser(Math.round(((e.clientX - r.left) / r.width * W - gauche) / (W - gauche - 6) * (serie.length - 1))); });
    cible.addEventListener("pointerleave", () => zone.classList.remove("est-vise"));
    cible.addEventListener("focus", () => viser(serie.length - 1));
    cible.addEventListener("blur", () => zone.classList.remove("est-vise"));
    cible.addEventListener("keydown", (e) => { const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (k) { e.preventDefault(); viser(+(cible.dataset.i ?? serie.length - 1) + k); } });
    if (table) table.innerHTML = `<thead><tr><th scope="col">Jour</th><th scope="col">Ouvertures</th></tr></thead><tbody>${serie.map((v, i) => `<tr><td>${dateCourte(jour(i))}</td><td>${v}</td></tr>`).join("")}</tbody>`;
  };
  // redessiner en fondu : l'ancien tracé s'efface, flouté, avant le nouveau
  const redessiner = (zone, dessiner) => {
    const svg = $("svg", zone);
    if (!svg || reduit) { dessiner(false); return; }
    svg.animate([{ opacity: 1, filter: "blur(0)" }, { opacity: 0, filter: "blur(4px)" }], { duration: 120, easing: "ease-out", fill: "forwards" }).finished.then(() => dessiner(true));
  };
  // retracer quand la largeur change, et plus du tout une fois l'écran quitté
  const suivreLargeur = (zone, dessiner, signal) => {
    let largeur = zone.clientWidth;
    const obs = new ResizeObserver(() => { if (Math.abs(zone.clientWidth - largeur) > 4) { largeur = zone.clientWidth; dessiner(false); } });
    obs.observe(zone);
    signal.addEventListener("abort", () => obs.disconnect());
  };

  /* ---------- répartition des statuts, transporteurs, activité ---------- */
  const couleur = { transit: "var(--st-transit)", livre: "var(--st-livre)", attente: "var(--st-attente)", silence: "var(--st-silence)", ok: "var(--st-livre)", sans: "var(--st-attente)", ko: "var(--st-refus)" };
  const barreEtLegende = (parts, total) => `
    <div class="empile" role="img" aria-label="${parts.map((c) => `${c[1]} : ${c[2]}`).join(", ")}">${parts.filter((p) => p[2]).map(([k, , v]) => `<i style="flex-grow:${v};background:${couleur[k]}"></i>`).join("")}</div>
    <ul class="legende">${parts.map(([k, l, v]) => `<li><i style="background:${couleur[k]}"></i><span>${l}</span><b>${v}</b><small>${Math.round(v / total * 100)}&#8239;%</small></li>`).join("")}</ul>`;
  const totalColis = COLIS.reduce((a, c) => a + c[2], 0);
  const colis = (zone) => { zone.innerHTML = barreEtLegende(COLIS, totalColis); };
  const transporteurs = (zone, P) => {
    const tot = P.transp.reduce((a, t) => a + t[1], 0), maxT = P.transp[0][1];
    zone.innerHTML = `<table class="transporteurs"><tbody>${P.transp.map(([n, v]) => `<tr><th scope="row">${n}</th><td><i style="--p:${v / maxT}"></i></td><td>${v}</td><td>${Math.round(v / tot * 100)}&#8239;%</td></tr>`).join("")}</tbody></table>`;
  };
  const activite = (zone) => { zone.innerHTML = FAITS.map(([, libelle, icone, ton, ref, quand]) => `<li><a href="#" data-maquette="Commande #${ref}"><i data-ton="${ton}">${ic(icone)}</i><p>${libelle}<small>Commande #${ref}</small></p><time>${quand}</time></a></li>`).join(""); };

  /* ---------- le sélecteur de période ---------- */
  const periodes = (groupe, surChangement, signal) => {
    const curseur = $("[data-curseur]", groupe), boutons = $$("[data-periode]", groupe);
    const placer = () => { const b = boutons.find((x) => x.getAttribute("aria-checked") === "true"); curseur.style.width = `${b.offsetWidth}px`; curseur.style.transform = `translateX(${b.offsetLeft}px)`; };
    boutons.forEach((b, i) => {
      b.tabIndex = b.getAttribute("aria-checked") === "true" ? 0 : -1;
      b.addEventListener("click", () => {
        if (b.getAttribute("aria-checked") === "true") return;
        boutons.forEach((x) => { const on = x === b; x.setAttribute("aria-checked", String(on)); x.tabIndex = on ? 0 : -1; });
        placer(); surChangement(b.dataset.periode);
      });
      b.addEventListener("keydown", (e) => { const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!k) return; e.preventDefault(); const n = boutons[(i + k + boutons.length) % boutons.length]; n.focus(); n.click(); });
    });
    const obs = new ResizeObserver(placer); obs.observe(groupe);
    signal.addEventListener("abort", () => obs.disconnect());
    placer();
  };

  return { PERIODES, COLIS, totalColis, nb, s, ic, reduit, EASE, changer, compteurs, frise, liens, redessiner, suivreLargeur, colis, transporteurs, activite, barreEtLegende, periodes };
})();

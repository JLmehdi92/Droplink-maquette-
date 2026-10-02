// DropLink · films des pages d'accès
// Grammaire du skill film-lancement-saas, rendue en direct dans le navigateur :
// un renderAt(t) déterministe, appelé à chaque image, qui pose chaque calque.
// Clair pour le produit, sombre pour la marque ; zoom à travers, ouverture en
// cercle, coup de fouet avec flou directionnel, interface en 3D, typographie
// masquée, chiffres qui roulent, grain. Tout ce qu'on lit est vrai : libellés
// du produit, événements que le produit enregistre.
(() => {
  // Un film se monte sur un hôte et s'arrête sur demande : passer de la connexion
  // à l'inscription fond l'un dans l'autre sans recharger la page.
  const monter = (hote) => {
  let arrete = false;
  const nettoyages = [];
  // Le film n'existe qu'à côté du formulaire. Sous 1021 px, le panneau est masqué
  // et rien n'est construit ni calculé : ni DOM, ni boucle.
  const place = matchMedia("(min-width: 1021px)");
  const lancer = () => { if (arrete || !place.matches || hote.dataset.lance) return; hote.dataset.lance = "1"; film(); };
  place.addEventListener("change", lancer);
  lancer();
  return { arreter: () => { arrete = true; place.removeEventListener("change", lancer); nettoyages.forEach((f) => f()); } };

  function film() {
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = 600, H = 760;
  // Mode léger : sans flou. D'office si l'appareil le demande, sinon dès que la
  // mesure montre qu'il peine. Il garde toutes les images : couper à 30 images/s
  // rendait le film saccadé, et c'était le flou qui coûtait, pas la cadence.
  let leger = !!(navigator.connection?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2));
  let echelle = 1;

  /* ---------- outillage (repris du moteur du skill) ---------- */
  const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const P = (t, a, b) => cl((t - a) / (b - a));
  const eo = (x) => 1 - (1 - x) ** 3, eo5 = (x) => 1 - (1 - x) ** 5, ei = (x) => x * x * x, ei5 = (x) => x ** 5;
  const eio = (x) => (x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const eio5 = (x) => (x < .5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2);
  const spring = (x, f = 10, d = 7) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-d * x) * Math.cos(f * x));
  const lerp = (a, b, x) => a + (b - a) * x;
  // Une écriture de style coûte un recalcul même quand rien ne bouge. On n'écrit
  // donc que ce qui a changé, et des valeurs arrondies : un plan posé reste posé.
  const ecrit = new WeakMap();
  // Un plan qu'on floute devient un calque, une fois pour toutes : le flou est alors
  // appliqué par le compositeur sur une texture déjà peinte, sans repeindre le texte.
  const pose = (el, k, v) => {
    let m = ecrit.get(el); if (!m) ecrit.set(el, m = {});
    if (k === "filter" && v) v = v.replace(/blur\(([\d.]+)px\)/, (_, n) => `blur(${(n * FLOU).toFixed(1)}px)`);
    if (m[k] === v) return; m[k] = v; el.style[k] = v;
    if (k === "filter" && v && !m.calque) { m.calque = true; el.style.willChange = "transform, filter"; }
  };
  const FLOU = window.__FLOU ?? 1;
  const r2 = (n) => Math.round(n * 100) / 100;
  const tf = (el, { o, x = 0, y = 0, s = 1, r = 0, rx = 0, ry = 0, z = 0, blur = 0 }) => {
    if (o !== undefined) pose(el, "opacity", Math.round(o * 1000) / 1000);
    pose(el, "transform", `translate3d(${r2(x)}px,${r2(y)}px,${r2(z)}px) rotateX(${r2(rx)}deg) rotateY(${r2(ry)}deg) rotate(${r2(r)}deg) scale(${Math.round(s * 1e4) / 1e4})`);
    pose(el, "filter", !leger && blur > .05 ? `blur(${blur.toFixed(2)}px)` : "");
  };
  const vis = (el, on) => { pose(el, "display", on ? "" : "none"); };
  // révélation masquée : la ligne monte de derrière son cache (135 % pour les accents)
  const masque = (el, t, a, d = .6, sortie = 1e9, ds = .35) => {
    const k = eo5(P(t, a, a + d)), q = eio(P(t, sortie, sortie + ds));
    pose(el.firstElementChild, "transform", `translateY(${(1 - k) * 135 - q * 135}%)`);
  };
  const ic = (n) => `<svg class="ic"><use href="#i-${n}"/></svg>`;
  const ligne = (texte, cls = "") => `<span class="fm-ligne ${cls}"><span>${texte}</span></span>`;
  const q = (sel) => racine.querySelector(sel);
  const qa = (sel) => [...racine.querySelectorAll(sel)];

  /* ---------- scène ---------- */
  const racine = document.createElement("div");
  const transparent = true;
  racine.className = "fm fm--transparent";
  // Le décor (clair, sombre, halos, vignette, grain) couvre tout le panneau ;
  // seule la scène est mise à l'échelle. Un panneau plus large ou plus haut que
  // la scène montre donc du décor, jamais un bord ni un plan rogné.
  racine.innerHTML = `
    <div class="fm-fond fm-fond--clair"></div>
    <div class="fm-fond fm-fond--sombre" data-sombre></div>
    <div class="fm-ambiance" aria-hidden="true"><i class="fm-halo fm-halo--1"></i><i class="fm-halo fm-halo--2"></i><i class="fm-halo fm-halo--3"></i></div>
    <div class="fm-scene" data-fm-scene>
      <div class="fm-calque" data-L0></div>
      <div class="fm-calque" data-L1></div>
      <div class="fm-calque" data-L2></div>
      <div class="fm-calque" data-L3></div>
    </div>
    <div class="fm-vignette" data-vignette></div>
    <canvas class="fm-grain" width="300" height="380" data-grain></canvas>
    <svg width="0" height="0" style="position:absolute"><linearGradient id="fm-deg" x1="0" x2="1"><stop offset="0" stop-color="#6C5CFB"/><stop offset=".52" stop-color="#A855E0"/><stop offset="1" stop-color="#FB7C7F"/></linearGradient></svg>`;
  hote.append(racine);
  const scene = q("[data-fm-scene]");
  const pcModele = document.querySelector("template[data-pc]");
  const pc = () => pcModele.content.firstElementChild.cloneNode(true);
  // les photos viennent de la page client : une seule source, même une fois tout inclus en data:
  const photos = [...pcModele.content.querySelectorAll(".pc__grille img")].map((i) => i.getAttribute("src"));

  /* ---------- grain déterministe ---------- */
  const gc = q("[data-grain]").getContext("2d"), gim = gc.createImageData(300, 380);
  const grain = (image, alpha) => {
    // posé sur la page, le film n'a plus de fond à graver : le grain n'est plus calculé
    if (transparent || leger || image % 3) return;
    let s = (image * 2654435761) >>> 0; const d = gim.data;
    for (let i = 0; i < d.length; i += 4) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; const v = s & 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = alpha; }
    gc.putImageData(gim, 0, 0);
  };

  /* ---------- rouleau de chiffres ---------- */
  // une colonne par chiffre : la position (0..n) choisit la ligne visible, en continu
  const rouleau = (el, sequence) => { el.innerHTML = `<span class="fm-rouleau__piste">${sequence.map((c) => `<span>${c}</span>`).join("")}</span>`; return el.firstElementChild; };
  const rouler = (piste, pos, vitesse = 0) => {
    pose(piste, "transform", `translateY(${-pos * 100 / piste.children.length}%)`);
    pose(piste, "filter", vitesse > .02 ? `blur(${Math.min(6, vitesse * 40).toFixed(2)}px)` : "");
  };

  const anneau = `<svg class="fm-anneau" viewBox="0 0 200 200" aria-hidden="true"><ellipse cx="100" cy="100" rx="94" ry="94" fill="none" stroke="url(#fm-deg)" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="100" data-anneau/></svg>`;

  let renderAt, DUREE, POSE;

  /* =====================================================================
     CONNEXION · « Pendant votre absence »
     A sombre : l'horloge tourne de 18:19 à 08:40 → zoom à travers l'horloge
     B clair  : téléphone en 3D, les événements tombent, poussée sur le bandeau → coup de fouet
     C clair  : le compteur de consultations roule → zoom à travers le « 3 »
     D sombre : sceau « Photos validées », logo → retour à A
     ===================================================================== */
  if (hote.dataset.film === "absence") {
    DUREE = 15.4; POSE = 6.9;
    const L0 = q("[data-L0]"), L1 = q("[data-L1]"), L2 = q("[data-L2]"), L3 = q("[data-L3]");
    L0.innerHTML = `
      <p class="fm-surtitre" data-a-titre>${ligne("Pendant votre absence")}</p>
      <div class="fm-horloge" data-a-horloge>
        ${anneau}
        <p class="fm-horloge__heure"><span class="fm-rouleau" data-h1></span><span class="fm-rouleau" data-h2></span><span class="fm-deuxpoints">:</span><span class="fm-rouleau" data-m1></span><span class="fm-rouleau" data-m2></span></p>
        <p class="fm-horloge__date"><span data-a-date1>29 sept.</span><span data-a-date2>30 sept.</span></p>
      </div>`;
    L1.innerHTML = `
      <div class="fm-titre" data-b-titre>${ligne("Vos clients,")}${ligne("ont suivi leurs colis.", "fm-attenue")}</div>
      <div class="fm-3d"><div class="fm-tel" data-b-tel><div class="telephone telephone--film"><div class="telephone__ecran" data-b-ecran></div></div></div></div>
      <div class="fm-notif" data-b-n1><i class="fm-notif__icone">${ic("package")}</i><p><b>Pris en charge par La Poste</b><small>Paris · 29 sept. · 18:19</small></p></div>
      <div class="fm-notif" data-b-n2><i class="fm-notif__icone">${ic("truck")}</i><p><b>Colis en cours d’acheminement</b><small>Wissous · 30 sept. · 07:19</small></p></div>`;
    q("[data-b-ecran]").append(pc());
    L2.innerHTML = `
      <div class="fm-compteur" data-c-bloc>
        <p class="fm-compteur__tete"><i class="fm-notif__icone">${ic("eye")}</i>Lien consulté</p>
        <p class="fm-compteur__nombre"><span class="fm-rouleau fm-rouleau--grand" data-c-n></span></p>
        <p class="fm-compteur__mot">consultations</p>
        <p class="fm-compteur__detail" data-c-detail>Dernière le 30 sept. à 08:12</p>
      </div>`;
    L3.innerHTML = `
      <div class="fm-sceau" data-d-sceau>${anneau}<i class="fm-sceau__coeur">${ic("check")}</i><div class="fm-eclats" data-d-eclats></div></div>
      <div class="fm-titre fm-titre--sombre fm-titre--centre" data-d-titre>${ligne("Photos validées")}${ligne("par votre client.", "fm-attenue")}</div>
      <p class="fm-detail" data-d-heure>30 sept. · 08:40</p>
      <p class="fm-marque" data-d-marque><img src="${document.querySelector(".acces__logo img").getAttribute("src")}" alt="" width="20" height="28">DropLink</p>`;
    for (let i = 0; i < 14; i += 1) q("[data-d-eclats]").append(document.createElement("i"));

    const h1 = rouleau(q("[data-h1]"), ["1", "2", "0"]), h2 = rouleau(q("[data-h2]"), ["8", "9", "0", "1", "2", "3", "4", "5", "6", "7", "8"]);
    const m1 = rouleau(q("[data-m1]"), ["1", "2", "3", "4", "5", "0", "1", "2", "3", "4"]), m2 = rouleau(q("[data-m2]"), ["9", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
    const cn = rouleau(q("[data-c-n]"), ["1", "2", "3"]);
    const pcB = L1.querySelector(".pc");
    const frise = pcB.querySelector("[data-pc-frise]"), lis = frise.querySelectorAll("li");
    const bandeauTexte = pcB.querySelector("[data-pc-bandeau]"), mouvement = pcB.querySelector("[data-pc-mouvement]");
    const bandeau = bandeauTexte.closest(".pc__bandeau");
    let etatB = -1;
    const poserFrise = (k) => {
      if (k === etatB) return; etatB = k;
      frise.style.setProperty("--avance", String(Math.min(k, 2)));
      lis.forEach((li, i) => { li.classList.toggle("fait", i < k); li.classList.toggle("actuel", i === k); });
      bandeauTexte.textContent = k < 2 ? "Votre colis a été expédié" : "Votre colis est en transit";
      mouvement.textContent = k < 2 ? "Mouvement hier" : "Mouvement aujourd’hui";
    };
    const eclats = qa("[data-d-eclats] i");

    renderAt = (t, image = 0) => {
      const inA = t < 2.95 || t > 14.7, inB = t > 2.55 && t < 8.75, inC = t > 8.35 && t < 11.95, inD = t > 11.55;
      vis(L0, inA); vis(L1, inB); vis(L2, inC); vis(L3, inD);
      // lumière : sombre en A et D, clair en B et C
      const sombre = t < 2.6 ? 1 : t < 2.8 ? 1 - P(t, 2.6, 2.76) : t < 11.6 ? 0 : P(t, 11.6, 11.78);
      pose(q("[data-sombre]"), "opacity", sombre);
      pose(q("[data-vignette]"), "opacity", lerp(.25, 1, sombre));
      scene.classList.toggle("fm-est-sombre", sombre > .5);

      /* A · l'horloge */
      if (inA) {
        const tA = t > 14.7 ? t - DUREE : t; // la fin de D ramène à A sans coupure
        masque(q("[data-a-titre]").firstElementChild, tA, .1, .6);
        const k = eio5(P(tA, .7, 2.05)), dk = eio5(P(tA + .02, .7, 2.05)) - k;
        rouler(h1, k * 2, dk * 2); rouler(h2, k * 10, dk * 10); rouler(m1, k * 9, dk * 9); rouler(m2, k * 11, dk * 11);
        const bascule = P(tA, 1.25, 1.45);
        tf(q("[data-a-date1]"), { o: 1 - bascule, y: -14 * bascule }); tf(q("[data-a-date2]"), { o: bascule, y: 14 * (1 - bascule) });
        const an = q("[data-a-horloge] [data-anneau]");
        pose(an, "strokeDashoffset", String(100 * (1 - eo(P(tA, .05, 1.1)))));
        pose(an.parentElement, "transform", `rotate(${tA * 22}deg)`);
        // zoom à travers l'horloge : le monde grossit, le calque clair monte pendant
        // tout en temps de l'acte (tA) : la fin du film est le début de l'acte A
        const z = ei(P(tA, 2.4, 2.9));
        const entre = t > 14.7 ? eo5(P(t, 14.7, 15.3)) : 1;
        tf(q("[data-a-horloge]"), { s: lerp(.9, 1, entre) * (1 + z * 6), blur: z * 12 + (1 - entre) * 8, o: (1 - P(tA, 2.7, 2.9)) * entre });
        tf(q("[data-a-titre]"), { o: (1 - P(tA, 2.4, 2.6)) * entre, y: -z * 60 });
      }

      /* B · téléphone en 3D, événements, poussée caméra */
      if (inB) {
        const e = eo5(P(t, 2.62, 3.75));
        const resp = Math.sin(t * .8) * 1.4;
        // poussée caméra sur le bandeau : ×1,26, +6°, le reste perd la netteté
        const push = eio5(P(t, 6.1, 6.65));
        const fouetK = ei5(P(t, 8.3, 8.64));
        tf(q("[data-b-tel]"), { x: lerp(200, 0, e) - fouetK * 2300, ry: lerp(-32, -14, e) + resp + push * 10, rx: lerp(14, 6, e), s: lerp(.72, 1, e) * (1 + push * .34), y: Math.sin(t * .9) * 5 - push * 40, blur: (1 - e) * 10, o: cl(P(t, 2.62, 2.8)) });
        pose(q("[data-b-tel]"), "transformOrigin", `50% ${lerp(50, 43, push)}%`);
        masque(q("[data-b-titre]").children[0], t, 3.0, .6);
        masque(q("[data-b-titre]").children[1], t, 3.15, .6);
        tf(q("[data-b-titre]"), { x: -fouetK * 2300, o: 1 - push * .78, blur: push * 3.2 });
        poserFrise(t < 4.95 ? 1 : 2);
        if (t > 4.95 && t < 5.5) pose(bandeau, "filter", `blur(${(Math.sin(P(t, 4.95, 5.35) * Math.PI) * 2.5).toFixed(2)}px)`); else pose(bandeau, "filter", "");
        // les événements tombent de la profondeur dans le cadre
        [[q("[data-b-n1]"), 3.75, -1], [q("[data-b-n2]"), 4.75, 1]].forEach(([el, a, cote]) => {
          const k = eo5(P(t, a, a + .5));
          const vitesse = Math.sin(Math.PI * P(t, a, a + .5));
          tf(el, { o: cl(P(t, a, a + .12)) * (1 - push * .35), x: lerp(120 * cote, 0, k) - fouetK * 2300 + Math.sin(t * 1.1 + a) * 6, y: lerp(-320, 0, k), z: lerp(260, 0, k), r: lerp(-18 * cote, 0, k), blur: vitesse * 5 + push * 3.2 });
        });
        // le coup de fouet : un flou CSS, calculé par la carte graphique (le filtre SVG
        // directionnel d'origine était rendu par le processeur, image après image)
        const fq = Math.sin(Math.PI * P(t, 8.3, 8.75));
        pose(L1, "filter", !leger && fq > .02 ? `blur(${(fq * 14).toFixed(1)}px)` : "");
      }

      /* C · le compteur roule */
      if (inC) {
        const arrive = eo5(P(t, 8.42, 8.87));
        const z = ei(P(t, 11.45, 11.9));
        const bloc = q("[data-c-bloc]");
        tf(bloc, { x: lerp(2300, 0, arrive), s: 1 + z * 7 });
        pose(bloc, "transformOrigin", "50% 44%");
        pose(bloc, "filter", z > .01 ? `blur(${(z * 12).toFixed(2)}px)` : "");
        pose(bloc, "opacity", 1 - P(t, 11.72, 11.9));
        const fq = t < 8.9 ? Math.sin(Math.PI * P(t, 8.3, 8.9)) : 0;
        pose(L2, "filter", !leger && fq > .02 ? `blur(${(fq * 14).toFixed(1)}px)` : "");
        const pos = spring(P(t, 9.35, 9.95), 13, 7) + spring(P(t, 10.25, 10.85), 13, 7);
        const d = (spring(P(t + .02, 9.35, 9.95), 13, 7) + spring(P(t + .02, 10.25, 10.85), 13, 7)) - pos;
        rouler(cn, pos, Math.abs(d));
        tf(q("[data-c-detail]"), { o: cl(P(t, 9.0, 9.3)), y: (1 - eo5(P(t, 9.0, 9.5))) * 14 });
      }

      /* D · sceau de validation, marque */
      if (inD) {
        const entre = eo5(P(t, 11.62, 12.2));
        const sortie = P(t, 14.55, 15.2);
        const sc = spring(P(t, 11.75, 12.45), 10, 6);
        tf(q("[data-d-sceau]"), { s: lerp(.5, 1, sc) * lerp(.72, 1, entre), o: cl(P(t, 11.7, 11.85)) * (1 - sortie), blur: (1 - entre) * 10 + sortie * 8 });
        const an = q("[data-d-sceau] [data-anneau]");
        pose(an, "strokeDashoffset", String(100 * (1 - eo(P(t, 11.8, 12.6)))));
        pose(an.parentElement, "transform", `rotate(${t * 14}deg)`);
        eclats.forEach((b, i) => {
          const a = i / eclats.length * Math.PI * 2, k = eo(P(t, 12.0, 12.7)), rr = 40 + (i % 3) * 30;
          pose(b, "transform", `translate(${Math.cos(a) * rr * k}px,${Math.sin(a) * rr * k}px) scale(${1 - k * .6})`);
          pose(b, "opacity", t > 12.0 ? 1 - P(t, 12.3, 12.7) : 0);
        });
        const titre = q("[data-d-titre]");
        masque(titre.children[0], t, 12.2, .6, 14.45);
        masque(titre.children[1], t, 12.35, .6, 14.5);
        tf(q("[data-d-heure]"), { o: cl(P(t, 12.8, 13.1)) * (1 - sortie), y: (1 - eo5(P(t, 12.8, 13.3))) * 16 });
        tf(q("[data-d-marque]"), { o: cl(P(t, 13.2, 13.5)) * (1 - sortie), s: lerp(.9, 1, spring(P(t, 13.2, 13.8))) });
      }
      grain(image, sombre > .5 ? 18 : 10);
    };
  }

  /* =====================================================================
     INSCRIPTION · « Dans une minute »
     A sombre : le chrono part → ouverture en cercle depuis le chrono
     B clair  : l'éditeur en 3D se remplit, poussée sur chaque champ, les photos tombent
     C clair  : clic sur Partager, le lien vole → zoom à travers le lien
     D clair  : la page client dans le téléphone, puces flottantes → chute de luminance
     E sombre : le chrono s'arrête à 0:48, « Moins d'une minute. »
     ===================================================================== */
  if (hote.dataset.film === "minute") {
    DUREE = 17; POSE = 10.6;
    const L0 = q("[data-L0]"), L1 = q("[data-L1]"), L2 = q("[data-L2]"), L3 = q("[data-L3]");
    L0.innerHTML = `
      <div class="fm-titre fm-titre--sombre fm-titre--centre fm-titre--haut" data-a-titre>${ligne("Dans une minute,")}${ligne("votre premier lien.", "fm-attenue")}</div>
      <div class="fm-horloge fm-horloge--chrono" data-a-chrono>${anneau}<p class="fm-horloge__heure" data-a-temps>0:00</p></div>`;
    L1.innerHTML = `
      <p class="fm-puce fm-puce--chrono" data-chrono>${ic("clock")}<span data-chrono-t>0:00</span></p>
      <div class="fm-titre" data-b-titre>${ligne("Vous remplissez.")}${ligne("DropLink s’occupe du reste.", "fm-attenue")}</div>
      <div class="fm-3d"><div class="fm-fenetre" data-b-fen>
        <div class="fm-fenetre__tete"><b>La commande</b><span class="fm-enr">${ic("check")}Enregistré</span></div>
        <div class="fm-champ" data-f1><small>Nom ou pseudo du client</small><span class="fm-champ__boite"><span data-f1-v></span><i class="fm-curseur"></i></span></div>
        <div class="fm-champ" data-f2><small>Photos et vidéos</small><span class="fm-depot" data-depot>${photos.map((src) => `<i data-ph><img src="${src}" alt=""></i>`).join("")}</span></div>
        <div class="fm-champ" data-f3><small>Numéro de suivi</small><span class="fm-champ__boite"><span data-f3-v></span><i class="fm-curseur"></i><span class="fm-transporteur" data-transp>${ic("circle-check")}Colissimo</span></span></div>
        <div class="fm-fenetre__pied"><span class="fm-partager" data-partager><span data-p-a>${ic("share-2")}Partager</span><span data-p-b>${ic("check")}Lien copié</span></span></div>
      </div></div>
      <p class="fm-lien" data-lien>${ic("link")}droplink.fr/p/k7Qm2xR9vLpA</p>
      <svg class="fm-pointeur" data-pointeur viewBox="0 0 24 24"><path d="M4 2.5 L4 19.5 L8.6 15.3 L11.6 21.6 L14.6 20.2 L11.7 14.1 L18 14.1 Z" fill="#0B0B18" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <i class="fm-onde" data-onde></i>`;
    L2.innerHTML = `
      <div class="fm-titre" data-c-titre>${ligne("Votre client suit")}${ligne("son colis tout seul.", "fm-attenue")}</div>
      <div class="fm-3d"><div class="fm-tel fm-tel--d" data-d-tel><div class="telephone telephone--film"><div class="telephone__ecran" data-d-ecran></div></div></div></div>
      <p class="fm-puce" data-d-p1>${ic("user-round")}Pour Léa M.</p>
      <p class="fm-puce" data-d-p2>${ic("images")}4 photos</p>
      <p class="fm-puce" data-d-p3>${ic("truck")}Colissimo · En transit</p>`;
    q("[data-d-ecran]").append(pc());
    L3.innerHTML = `
      <div class="fm-horloge fm-horloge--chrono" data-e-chrono>${anneau}<p class="fm-horloge__heure">0:48</p></div>
      <div class="fm-titre fm-titre--sombre fm-titre--centre" data-e-titre>${ligne("Moins d’une minute.")}</div>
      <p class="fm-mots" data-e-mots>${"5 commandes offertes · sans carte bancaire".split(" ").map((m) => `<span>${m}</span>`).join(" ")}</p>
      <p class="fm-marque" data-e-marque><img src="${document.querySelector(".acces__logo img").getAttribute("src")}" alt="" width="20" height="28">DropLink</p>`;

    const chronoTexte = (t) => { const s = Math.round(48 * eio(P(t, 1.2, 12.4))); return `0:${String(s).padStart(2, "0")}`; };
    const taper = (el, texte, t, a, v) => { const n = Math.floor(cl((t - a) / v, 0, texte.length)); el.textContent = [...texte].slice(0, n).join(""); return n; };
    const pcD = L2.querySelector(".pc");
    const ph = qa("[data-ph]");
    const mots = qa("[data-e-mots] span");
    const centre = (el) => { const r = el.getBoundingClientRect(), s = scene.getBoundingClientRect(), k = s.width / W; return [(r.left + r.width / 2 - s.left) / k, (r.top + r.height / 2 - s.top) / k]; };

    renderAt = (t, image = 0) => {
      const inA = t < 2.6 || t > 16.4, inB = t > 1.9 && t < 8.75, inC = t > 8.3 && t < 12.9, inE = t > 12.4;
      vis(L0, inA); vis(L1, inB); vis(L2, inC); vis(L3, inE);
      const sombre = t < 2.45 ? 1 : t < 12.45 ? 1 - P(t, 2.45, 2.5) : P(t, 12.45, 12.7);
      pose(q("[data-sombre]"), "opacity", sombre);
      pose(q("[data-vignette]"), "opacity", lerp(.25, 1, sombre));
      scene.classList.toggle("fm-est-sombre", sombre > .5);

      /* A · le chrono part */
      if (inA) {
        const tA = t > 16.4 ? t - DUREE : t;
        const entre = t > 16.4 ? eo5(P(t, 16.4, 17)) : 1;
        masque(q("[data-a-titre]").children[0], tA, .1, .6);
        masque(q("[data-a-titre]").children[1], tA, .25, .6);
        q("[data-a-temps]").textContent = chronoTexte(tA);
        const an = q("[data-a-chrono] [data-anneau]");
        pose(an, "strokeDashoffset", String(100 * (1 - eo(P(tA, .1, 1.2)))));
        pose(an.parentElement, "transform", `rotate(${tA * 30}deg)`);
        tf(q("[data-a-chrono]"), { s: lerp(.86, 1, spring(P(tA, .2, .9))) * lerp(.9, 1, entre), o: cl(P(tA, .15, .3)) * entre });
        tf(q("[data-a-titre]"), { o: entre });
      }

      /* B · l'éditeur se remplit */
      if (inB) {
        // ouverture en cercle depuis le chrono
        const r = eio5(P(t, 1.95, 2.45)) * 1100;
        pose(L1, "clipPath", t < 2.45 ? `circle(${r}px at 300px 420px)` : "");
        // le décor sombre s'ouvre au même endroit, en px du panneau
        const sb = scene.getBoundingClientRect(), hb = hote.getBoundingClientRect();
        const cx = sb.left - hb.left + 300 * echelle, cy = sb.top - hb.top + 420 * echelle, rr = r * echelle;
        const trou = t > 1.95 && t < 2.45 ? `radial-gradient(circle at ${cx}px ${cy}px, transparent ${rr}px, #000 ${rr + 1}px)` : "";
        pose(q("[data-sombre]"), "maskImage", trou); pose(q("[data-sombre]"), "webkitMaskImage", trou);
        pose(L0, "maskImage", trou ? `radial-gradient(circle at 300px 420px, transparent ${r}px, #000 ${r + 1}px)` : ""); pose(L0, "webkitMaskImage", L0.style.maskImage);
        q("[data-chrono-t]").textContent = chronoTexte(t);
        const e = eo5(P(t, 2.1, 3.2));
        const resp = Math.sin(t * .75) * 1.2;
        // poussées caméra : sur le nom, sur le suivi, sur Partager
        const cibles = [[2.95, 4.05, 28], [5.35, 6.75, 70], [6.95, 8.3, 88]];
        let push = 0, oy = 30;
        cibles.forEach(([a, b, y]) => { const k = eio5(P(t, a, a + .5)) * (1 - eio5(P(t, b - .45, b))); if (k > push) { push = k; oy = y; } });
        const z = ei(P(t, 8.3, 8.7));
        const fen = q("[data-b-fen]");
        pose(fen, "transformOrigin", `50% ${oy}%`);
        tf(fen, { x: lerp(240, 0, e), ry: lerp(-30, -11, e) + resp + push * 6, rx: lerp(14, 6, e), s: lerp(.86, 1, e) * (1 + push * .26), y: Math.sin(t * .9) * 5, blur: (1 - e) * 8 + z * 10, o: 1 - P(t, 8.5, 8.7) });
        masque(q("[data-b-titre]").children[0], t, 2.4, .6);
        masque(q("[data-b-titre]").children[1], t, 2.55, .6);
        tf(q("[data-b-titre]"), { o: (1 - push * .75) * (1 - z), blur: push * 3.2 });
        const n1 = taper(q("[data-f1-v]"), "Léa M.", t, 3.3, .09);
        q("[data-f1]").classList.toggle("est-actif", t > 3.1 && t < 4.1);
        q("[data-f1]").classList.toggle("est-rempli", n1 > 0);
        // les photos tombent dans l'interface, de la profondeur
        ph.forEach((el, i) => {
          const a = 4.35 + i * .2, k = eo5(P(t, a, a + .45));
          tf(el, { o: cl(P(t, a, a + .1)), x: lerp(120, 0, k), y: lerp(-320, 0, k), z: lerp(260, 0, k), r: lerp(-18, 0, k), blur: Math.sin(Math.PI * P(t, a, a + .45)) * 5 });
        });
        taper(q("[data-f3-v]"), "6A30489215734", t, 5.55, .045);
        q("[data-f3]").classList.toggle("est-actif", t > 5.4 && t < 6.5);
        const tr = spring(P(t, 6.35, 6.85), 12, 6);
        tf(q("[data-transp]"), { o: cl(P(t, 6.35, 6.45)), s: lerp(.4, 1, tr) });
        // clic sur Partager
        const clic = 7.55;
        const copie = t >= clic;
        tf(q("[data-p-a]"), { o: copie ? 0 : 1, y: copie ? -10 : 0 });
        tf(q("[data-p-b]"), { o: copie ? 1 : 0, s: copie ? lerp(.4, 1, spring(P(t, clic, clic + .4))) : 1 });
        q("[data-partager]").classList.toggle("est-copie", copie);
        const [bx, by] = centre(q("[data-partager]"));
        const pt = q("[data-pointeur]"), k = eio(P(t, 6.95, 7.45));
        const px = lerp(540, bx, k), py = lerp(700, by, k);
        const presse = t > clic - .08 && t < clic + .18 ? 1 - .16 * Math.sin(P(t, clic - .08, clic + .18) * Math.PI) : 1;
        pose(pt, "opacity", cl(P(t, 6.95, 7.1)) * (1 - P(t, 7.9, 8.05)));
        pose(pt, "transform", `translate(${px - 5}px,${py - 3}px) scale(${presse})`);
        const oq = P(t, clic, clic + .45), onde = q("[data-onde]");
        pose(onde, "opacity", oq > 0 && oq < 1 ? (1 - oq) * .8 : 0);
        pose(onde, "transform", `translate(${bx}px,${by}px) scale(${.4 + oq * .9})`);
        // le lien sort du bouton et vole en arc (vers le bas) avec un flou de vitesse
        const lk = eio(P(t, 7.75, 8.25)), lien = q("[data-lien]");
        const lx = lerp(bx, 300, lk), ly = lerp(by + 30, 560, lk) + Math.sin(Math.PI * lk) * 80;
        pose(lien, "opacity", cl(P(t, 7.75, 7.85)) * (1 - P(t, 8.6, 8.7)));
        pose(lien, "transform", `translate(${lx}px,${ly}px) translate(-50%,-50%) scale(${lerp(.7, 1.1, lk) * (1 + z * 7)}) rotate(${lerp(-6, 0, lk)}deg)`);
        pose(lien, "filter", `blur(${(Math.sin(Math.PI * lk) * 5 + z * 10).toFixed(2)}px)`);
        tf(q("[data-chrono]"), { o: 1 - z });
      }

      /* C · la page client, en 3D */
      if (inC) {
        const e = eo5(P(t, 8.4, 9.3));
        const recul = eio(P(t, 12.35, 12.85));
        const resp = Math.sin(t * .8) * 1.4;
        tf(q("[data-d-tel]"), { ry: -14 + resp, rx: 6, s: lerp(.72, 1, e) * lerp(1, .86, recul), y: Math.sin(t * .9) * 5, blur: (1 - e) * 10 + recul * 8, o: cl(P(t, 8.4, 8.55)) * (1 - P(t, 12.6, 12.85)) });
        masque(q("[data-c-titre]").children[0], t, 8.9, .6);
        masque(q("[data-c-titre]").children[1], t, 9.05, .6);
        tf(q("[data-c-titre]"), { o: 1 - recul, blur: recul * 6 });
        [["[data-d-p1]", 9.4, -1], ["[data-d-p2]", 9.65, 1], ["[data-d-p3]", 9.9, -1]].forEach(([sel, a, cote], i) => {
          const k = spring(P(t, a, a + .6), 10, 6);
          tf(q(sel), { o: cl(P(t, a, a + .1)) * (1 - recul), s: lerp(.6, 1, k), y: (1 - cl(k)) * 20 + Math.sin(1.1 * t + i) * 8, x: cote * (1 - cl(k)) * 30, blur: i === 1 ? .6 : 0 });
        });
        // la page défile sous le pouce du client
        const dz = eio5(P(t, 10.6, 11.6));
        pose(pcD, "transform", `translateY(${-dz * 330}px)`);
      }

      /* E · le chrono s'arrête */
      if (inE) {
        const e = eo5(P(t, 12.5, 13.1)), sortie = P(t, 16.3, 17);
        const an = q("[data-e-chrono] [data-anneau]");
        pose(an, "strokeDashoffset", "0");
        pose(an.parentElement, "transform", `rotate(${t * 18}deg)`);
        tf(q("[data-e-chrono]"), { s: lerp(.6, 1, spring(P(t, 12.5, 13.2), 10, 6)), o: cl(P(t, 12.5, 12.65)) * (1 - sortie), blur: (1 - e) * 8 + sortie * 8 });
        masque(q("[data-e-titre]").children[0], t, 13.1, .6, 16.2);
        mots.forEach((m, i) => { const a = 13.6 + i * .075, k = eo5(P(t, a, a + .5)); tf(m, { o: cl(P(t, a, a + .2)) * (1 - sortie), y: (1 - k) * 60, blur: (1 - k) * 12 }); });
        tf(q("[data-e-marque]"), { o: cl(P(t, 14.3, 14.6)) * (1 - sortie), s: lerp(.9, 1, spring(P(t, 14.3, 14.9))) });
      }
      grain(image, sombre > .5 ? 18 : 10);
    };
  }

  /* ---------- mise à l'échelle et boucle ---------- */
  const ajuster = () => {
    const r = hote.getBoundingClientRect();
    // la scène entière, avec de l'air autour : sans cadre, rien ne doit toucher le bord
    // de l'écran. Plafonnée à 1,15 pour ne pas devenir une affiche sur un grand écran.
    const mx = Math.max(32, r.width * .06), my = Math.max(28, r.height * .05);
    const k = Math.min((r.width - 2 * mx) / W, (r.height - 2 * my) / H, 1.15);
    echelle = k;
    scene.style.transform = `scale(${k})`;
    scene.style.left = `${(r.width - W * k) / 2}px`;
    scene.style.top = `${(r.height - H * k) / 2}px`;
  };
  ajuster();
  const taille = new ResizeObserver(ajuster); taille.observe(hote);
  nettoyages.push(() => taille.disconnect());

  if (reduit) { document.fonts.ready.then(() => renderAt(POSE, 0)); return; }
  let visible = false, t0 = null, tPause = 0, image = 0, dernier = 0;
  const fenetre = [];
  const vue = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); vue.observe(hote);
  nettoyages.push(() => vue.disconnect());
  const passerLeger = () => {
    leger = true;
    racine.classList.add("fm-leger");
    racine.querySelectorAll("[style*='blur']").forEach((el) => { pose(el, "filter", ""); });
  };
  if (leger) passerLeger();
  // la scène suit doucement le pointeur : quelques pixels, amortis, pour qu'elle vive entre les actes
  let cibleX = 0, cibleY = 0, px = 0, py = 0, dernierPas = 0;
  const suivre = (e) => { cibleX = e.clientX / innerWidth - .5; cibleY = e.clientY / innerHeight - .5; };
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) addEventListener("pointermove", suivre, { passive: true });
  const boucle = (now) => {
    if (window.__filmFige) return; // planche contact : le temps est piloté de l’extérieur
    if (arrete) { removeEventListener("pointermove", suivre); return; }
    requestAnimationFrame(boucle);
    // rien ne tourne hors de l'écran, onglet caché, ou panneau masqué (téléphone, tablette)
    if (!visible || document.hidden) { t0 = null; dernier = 0; dernierPas = 0; return; }
    // L'aisance se juge en continu, sur les 60 dernières images visibles : plus d'une sur
    // quatre au-delà de 24 ms → léger. Juger sur les 90 premières seulement ne voyait que
    // le plan le plus calme ; les traversées floutées, plus loin, saccadaient sans recours.
    if (dernier && !leger) {
      fenetre.push(now - dernier > 24); if (fenetre.length > 60) fenetre.shift();
      if (fenetre.length === 60 && fenetre.filter(Boolean).length > 15) passerLeger();
    }
    dernier = now;
    if (t0 === null) t0 = now - tPause * 1000;
    tPause = ((now - t0) / 1000) % DUREE;
    image += 1;
    renderAt(tPause, image);
    // amorti indépendant de la cadence : même douceur à 60 et à 120 images/s
    const dt = Math.min(64, now - (dernierPas || now)); dernierPas = now;
    const a = 1 - Math.exp(-dt / 260);
    px += (cibleX - px) * a; py += (cibleY - py) * a;
    // une respiration lente, pour qu'aucun plan ne soit jamais tout à fait immobile
    const dx = Math.sin(now / 3100) * 5, dy = Math.cos(now / 3700) * 4;
    pose(racine, "transform", `translate3d(${(-px * 18 + dx).toFixed(2)}px,${(-py * 12 + dy).toFixed(2)}px,0)`);
  };
  document.fonts.ready.then(() => requestAnimationFrame(boucle));
  window.__film = { renderAt: (t) => renderAt(t, 0), DUREE };
}
  };
  window.DropLinkFilm = { monter };
  const hote = document.querySelector("[data-film]");
  if (hote) window.DropLinkFilm.courant = monter(hote);
})();

// DropLink · éditeur de commande (= la création)
// Comme le produit : aucune sauvegarde à déclencher, aucun « publier ». Chaque
// saisie part seule après une courte pause, le témoin le dit, l'historique
// l'écrit, et l'aperçu montre la page du client telle qu'elle est devenue.
// Le lien existe dès la création et ne change que par une révocation explicite.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ecran = $("[data-ecran].fiche");
  if (!ecran) return;
  const signal = window.DropLink?.ecran?.() ?? new AbortController().signal;
  const on = (el, ev, fn, o = {}) => el?.addEventListener(ev, fn, { signal, ...o });
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const annoncer = (t) => window.DropLink?.annoncer?.(t);
  const ic = (n) => `<svg class="ic"><use href="#i-${n}"/></svg>`;
  const heure = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  /* ---------- l'aperçu : la vraie page client, aux couleurs d'Atelier Nord ---------- */
  const pc = $("[data-apercu] .pc", ecran);
  pc.setAttribute("data-etats", "");
  // la couleur de la boutique (Ma marque), résolue comme le produit : texte 4,5:1, interface 3:1
  Object.entries({ "--pc-texte": "#0F766E", "--pc-interface": "#0F766E", "--pc-remplissage": "#0F766E", "--pc-sur-remplissage": "#FFFFFF", "--pc-teinte": "#E7F1F0", "--pc-sur-teinte": "#0B5F58" })
    .forEach(([k, v]) => pc.style.setProperty(k, v));
  $(".pc__commande > b", pc).textContent = "6B2F41";
  const pour = $("[data-pc-pour]", pc), compte = $("[data-pc-compte]", pc), grillePc = $("[data-pc-grille]", pc);
  // les quatre photos de démonstration sont celles de la page client : une seule source
  const PHOTOS_DEMO = $$("img", grillePc).map((i) => i.getAttribute("src"));
  const frisePc = $("[data-pc-frise]", pc), lisPc = $$("li", frisePc);
  const bandeauPc = $("[data-pc-bandeau]", pc), mouvementPc = $("[data-pc-mouvement]", pc);

  /* ---------- le témoin d'enregistrement ---------- */
  const temoin = $("[data-temoin]", ecran), temoinTexte = $("[data-temoin-texte]", ecran);
  let minuterie = 0;
  const enregistrer = (evenement) => {
    temoin.dataset.etat = "cours"; temoinTexte.textContent = "Enregistrement…";
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      temoin.dataset.etat = "ok"; temoinTexte.textContent = "Enregistré";
      if (evenement) histo(...evenement);
    }, reduit ? 120 : 520);
  };

  /* ---------- l'historique : les vrais types d'événement du produit ---------- */
  const listeHisto = $("[data-histo]", ecran);
  let dernierModif = 0;
  const histo = (texte, icone) => {
    // une rafale de frappes est UNE modification, comme dans le produit
    if (texte === "Commande modifiée" && Date.now() - dernierModif < 8000) return;
    if (texte === "Commande modifiée") dernierModif = Date.now();
    const li = document.createElement("li");
    li.innerHTML = `<i>${ic(icone)}</i><p>${texte}<small>Aujourd’hui à ${heure()}</small></p>`;
    listeHisto.prepend(li);
    if (!reduit) li.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.23,1,.32,1)" });
  };

  /* ---------- les champs ---------- */
  const champ = (k) => $(`[data-champ="${k}"]`, ecran);
  const resume = (k) => $(`[data-resume="${k}"]`, ecran);
  // une tuile vide le dit en toutes lettres, en gris : « Non renseigné »
  const poserTuile = (k, v) => { const el = resume(k); el.textContent = v || "Non renseigné"; el.toggleAttribute("data-vide", !v); };
  const titre = $("[data-titre]", ecran), fil = $("[data-fil]", ecran);
  // titreDeCommande : le nom du client dès qu'il existe, « Nouvelle commande » sinon
  const poserTitre = () => {
    const nom = champ("client").value.trim();
    const t = nom || "Nouvelle commande";
    titre.textContent = t; fil.textContent = t;
    document.title = `${t} · DropLink`;
    poserTuile("client", nom);
    pour.textContent = nom ? `pour ${nom}` : "";
    pc.classList.toggle("a-client", !!nom);
  };
  on(champ("client"), "input", () => { poserTitre(); enregistrer(["Commande modifiée", "file-text"]); });
  on(champ("reference"), "input", () => { poserTuile("reference", champ("reference").value.trim()); enregistrer(["Commande modifiée", "file-text"]); });
  on(champ("notes"), "input", () => enregistrer(["Commande modifiée", "file-text"]));

  // le transporteur se reconnaît à la forme du numéro (formats des envois de démonstration)
  const NOMS = { colissimo: "Colissimo", chronopost: "Chronopost", "mondial-relay": "Mondial Relay", "la-poste": "La Poste" };
  const reconnaitre = (n) => /^(6A|8L|8R)\d{11}$/.test(n) ? "colissimo" : /^(XY|XW|EE)\d{9}FR$/.test(n) ? "chronopost" : /^MR\d{8}$/.test(n) ? "mondial-relay" : /^(LA|LB|RK)\d{9}FR$/.test(n) ? "la-poste" : "";
  const reconnu = $("[data-reconnu]", ecran), reconnuNom = $("[data-reconnu-nom]", ecran);
  const poserSuivi = () => {
    const n = champ("suivi").value.replace(/\s+/g, "").toUpperCase();
    const choisi = champ("transporteur").value, detecte = reconnaitre(n);
    const code = choisi || detecte;
    reconnu.hidden = !(n && detecte && !choisi);
    reconnuNom.textContent = detecte ? `${NOMS[detecte]} reconnu` : "";
    poserTuile("suivi", n);
    resume("transporteur").textContent = n ? (code ? NOMS[code] : "Transporteur à préciser") : "";
    pc.classList.toggle("a-suivi", !!n);
    if (mouvementPc) mouvementPc.textContent = code ? `${NOMS[code]} · pas encore d’information` : "Pas encore d’information du transporteur";
  };
  on(champ("suivi"), "input", () => { poserSuivi(); enregistrer(["Commande modifiée", "file-text"]); });
  on(champ("transporteur"), "change", () => { poserSuivi(); enregistrer(["Commande modifiée", "file-text"]); });

  // le statut part immédiatement : c'est une décision, pas de la saisie
  const ORDRE = ["preparation", "expedie", "en_transit", "livre"];
  const BANDEAU = { preparation: "Votre commande est en préparation", expedie: "Votre colis a été expédié", en_transit: "Votre colis est en transit", livre: "Votre colis a été livré" };
  const poserStatut = () => {
    const k = ORDRE.indexOf(champ("statut").value);
    $$("[data-frise] li", ecran).forEach((li, i) => {
      li.dataset.etat = i < k || (k === 3 && i === 3) ? "fait" : i === k ? "actuel" : "";
      const q = $("[data-quand]", li);
      q.textContent = i <= k ? (q.dataset.date || "Aujourd’hui") : "En attente";
    });
    frisePc.style.setProperty("--avance", String(Math.min(k, 3)));
    lisPc.forEach((li, i) => { li.classList.toggle("fait", i < k || k === 3); li.classList.toggle("actuel", i === k && k < 3); });
    if (bandeauPc) bandeauPc.textContent = BANDEAU[champ("statut").value];
  };
  on(champ("statut"), "change", () => { poserStatut(); enregistrer(["Commande modifiée", "file-text"]); });
  on(champ("qc"), "change", () => {
    const v = champ("qc").value;
    pc.classList.toggle("qc-valide", v === "approuve");
    enregistrer(v === "approuve" ? ["Contrôle approuvé par le client", "circle-check"] : v === "refuse" ? ["Contrôle refusé par le client", "circle-x"] : ["Commande modifiée", "file-text"]);
  });

  /* ---------- photos et vidéos : 20 par commande, dont 3 vidéos ---------- */
  const grille = $("[data-grille]", ecran), aideOrdre = $("[data-aide-ordre]", ecran);
  const nbMedias = $("[data-nb-medias]", ecran), nbVideos = $("[data-nb-videos]", ecran);
  const MAX = 20, MAX_VIDEOS = 3;
  let medias = [];
  const peindreMedias = () => {
    grille.innerHTML = medias.map((m, i) => `<li class="ed-vignette${i === 0 ? " est-couverture" : ""}" draggable="true" data-i="${i}">
      ${m.video ? `<video src="${m.url}" muted playsinline preload="metadata"></video><span class="ed-vignette__video">${ic("monitor")}Vidéo</span>` : `<img src="${m.url}" alt="">`}
      ${i === 0 ? `<span class="ed-vignette__couverture">Couverture</span>` : `<button type="button" class="ed-vignette__geste" data-couverture="${i}" aria-label="Définir le média ${i + 1} comme couverture">${ic("images")}</button>`}
      <button type="button" class="ed-vignette__geste ed-vignette__geste--suppr" data-suppr="${i}" aria-label="Supprimer le média ${i + 1}">${ic("trash-2")}</button>
    </li>`).join("");
    const v = medias.filter((m) => m.video).length;
    nbMedias.textContent = String(medias.length); nbVideos.textContent = String(v);
    aideOrdre.hidden = medias.length < 2;
    // la page du client : les quatre premières vignettes, le compteur exact
    pc.classList.toggle("a-photos", medias.length > 0);
    compte.textContent = `(${medias.length})`;
    grillePc.innerHTML = medias.slice(0, 4).map((m) => `<figure>${m.video ? `<video src="${m.url}" muted playsinline></video>` : `<img src="${m.url}" alt="">`}</figure>`).join("");
  };
  const ajouter = (liste, depuisDemo = false) => {
    let refus = "";
    for (const f of liste) {
      const video = f.video ?? f.type === "video/mp4";
      if (!depuisDemo && !["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(f.type)) { refus = "Format non accepté."; continue; }
      if (medias.length >= MAX) { refus = "Plafond atteint pour cette commande."; break; }
      if (video && medias.filter((m) => m.video).length >= MAX_VIDEOS) { refus = "Plafond de vidéos atteint."; continue; }
      medias.push({ url: f.url ?? URL.createObjectURL(f), video });
      histo("Média ajouté", "images");
    }
    peindreMedias();
    temoin.dataset.etat = "ok"; temoinTexte.textContent = "Enregistré";
    if (refus) annoncer(refus);
    if (!reduit) $$(".ed-vignette", grille).slice(-liste.length).forEach((li, i) => li.animate([{ opacity: 0, transform: "translateY(-10px) scale(.92)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: i * 70, easing: "cubic-bezier(.2,.9,.25,1.15)", fill: "backwards" }));
  };
  const entree = $("[data-fichiers]", ecran), depot = $("[data-depot]", ecran);
  on(entree, "change", () => { ajouter([...entree.files]); entree.value = ""; });
  on(depot, "dragover", (e) => { e.preventDefault(); depot.classList.add("est-survolee"); });
  on(depot, "dragleave", () => depot.classList.remove("est-survolee"));
  on(depot, "drop", (e) => { e.preventDefault(); depot.classList.remove("est-survolee"); ajouter([...e.dataTransfer.files]); });
  on($("[data-demo-photos]", ecran), "click", (e) => {
    e.preventDefault(); e.stopPropagation();
    ajouter(PHOTOS_DEMO.map((url) => ({ url, video: false })), true);
  });
  on(grille, "click", (e) => {
    const s = e.target.closest("[data-suppr]"), c = e.target.closest("[data-couverture]");
    if (s) { medias.splice(+s.dataset.suppr, 1); peindreMedias(); histo("Média supprimé", "trash-2"); annoncer("Média supprimé."); }
    if (c) { const [m] = medias.splice(+c.dataset.couverture, 1); medias.unshift(m); peindreMedias(); histo("Médias réordonnés", "images"); annoncer("Nouvelle couverture."); }
  });
  // l'ordre se change en glissant une vignette sur une autre
  let saisi = -1;
  on(grille, "dragstart", (e) => { const li = e.target.closest(".ed-vignette"); if (!li) return; saisi = +li.dataset.i; li.classList.add("est-saisie"); e.dataTransfer.effectAllowed = "move"; });
  on(grille, "dragover", (e) => { if (saisi >= 0) e.preventDefault(); });
  on(grille, "drop", (e) => {
    const li = e.target.closest(".ed-vignette"); if (!li || saisi < 0) return;
    e.preventDefault(); e.stopPropagation();
    const cible = +li.dataset.i; if (cible === saisi) return;
    const [m] = medias.splice(saisi, 1); medias.splice(cible, 0, m); saisi = -1;
    peindreMedias(); histo("Médias réordonnés", "images");
  });
  on(grille, "dragend", () => { saisi = -1; $$(".est-saisie", grille).forEach((l) => l.classList.remove("est-saisie")); });

  /* ---------- le lien : copier, et révoquer explicitement ---------- */
  const jeton = $("[data-jeton]", ecran);
  const copier = async () => {
    const lien = `https://droplink.fr/p/${jeton.textContent}`;
    try { await navigator.clipboard.writeText(lien); annoncer("Lien copié"); }
    catch { annoncer("Copie refusée par le navigateur"); }
  };
  $$("[data-copier]").forEach((b) => on(b, "click", copier));
  const comprends = $("[data-comprends]", ecran), revoquer = $("[data-revoquer]", ecran);
  on(comprends, "change", () => { revoquer.disabled = !comprends.checked; });
  on(revoquer, "click", () => {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const nouveau = Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => A[x % A.length]).join("");
    revoquer.textContent = "Révocation…"; revoquer.disabled = true;
    setTimeout(() => {
      jeton.textContent = nouveau;
      if (!reduit) jeton.animate([{ opacity: 0, filter: "blur(4px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 360, easing: "ease-out" });
      revoquer.textContent = "Révoquer et régénérer"; comprends.checked = false;
      $("details.ed-revoquer", ecran).open = false;
      histo("Lien révoqué et régénéré", "refresh-cw");
      annoncer("Nouveau lien créé. L’ancien ne fonctionne plus.");
    }, reduit ? 100 : 700);
  });


  /* ---------- une commande existante : la même fiche, remplie ----------
     Dans le produit, ouvrir une commande ouvre cet éditeur (commandes/[id]).
     Le jeu est celui de l'écran Commandes, à l'identique. */
  // [client, référence, suivi, statut, qc, créée, modifiée, vues, dernière vue, dernier mouvement, médias, vignettes]
  const COMMANDES = {"6A4D21": ["Léa M.", "Sneakers T39, sweat, jogging et casquette", "6A30489215734", "en_transit", "en_attente", "2026-09-30T09:12", "2026-09-30T11:48", 3, "2026-09-30T11:02", "2026-09-30T08:40", 4, ["sneaker", "hoodie"]], "8B1F63": ["Chloé V.", "Doudoune courte beige", "", "preparation", "en_attente", "2026-09-30T08:30", "2026-09-30T08:51", 1, "2026-09-30T09:05", null, 8, ["hoodie", "cap"]], "3F8B52": ["Sofia M.", "Jogging noir taille M", "", "preparation", "en_attente", "2026-09-29T16:48", "2026-09-29T17:02", 0, null, null, 3, ["jogger"]], "2C7A95": ["Rayan T.", "Pack 3 t-shirts blancs", "", "preparation", "en_attente", "2026-09-29T10:02", "2026-09-29T14:20", 2, "2026-09-29T19:41", null, 4, ["hoodie", "jogger"]], "D41E08": ["Mélissa K.", "Sac bandoulière noir", "6A31177420985", "preparation", "en_attente", "2026-09-28T15:26", "2026-09-29T09:10", 1, "2026-09-28T21:03", null, 5, ["cap", "hoodie"]], "F0A3C2": ["Noah P.", "Sneakers grises T42", "XW551920437FR", "preparation", "approuve", "2026-09-28T11:40", "2026-09-28T18:02", 2, "2026-09-29T08:12", null, 6, ["sneaker", "jogger"]], "6D3A52": ["Yasmine B.", "Hoodie gris chiné", "", "preparation", "en_attente", "2026-09-27T19:15", "2026-09-27T19:30", 1, "2026-09-28T10:44", null, 4, ["hoodie"]], "A7C5D0": ["Karim S.", "Veste en jean brut", "", "preparation", "en_attente", "2026-09-27T14:05", "2026-09-27T14:22", 1, "2026-09-27T20:16", null, 3, ["hoodie", "cap"]], "4E9B17": ["Jade L.", "Bonnet côtelé gris", "MR48291174", "en_transit", "approuve", "2026-09-26T17:33", "2026-09-28T09:04", 4, "2026-09-29T18:22", "2026-09-29T16:05", 3, ["cap"]], "C83D40": ["Ethan G.", "Survêtement complet noir", "6A30571182466", "en_transit", "en_attente", "2026-09-26T10:18", "2026-09-27T11:00", 3, "2026-09-29T12:30", "2026-09-30T07:55", 5, ["jogger", "hoodie"]], "1B6E44": ["Amine K.", "Sneakers blanches T43", "XY418830211FR", "en_transit", "refuse", "2026-09-25T13:50", "2026-09-30T09:00", 2, "2026-09-29T21:14", "2026-09-29T11:30", 5, ["sneaker"]], "E5F812": ["Lina B.", "Lunettes de soleil écaille", "XY418992307FR", "en_transit", "approuve", "2026-09-25T09:41", "2026-09-26T08:12", 6, "2026-09-30T07:20", "2026-09-29T17:48", 4, ["cap", "sneaker"]], "0B6D7E": ["Adam R.", "Sneakers noires T41", "LA982455120FR", "en_transit", "en_attente", "2026-09-24T16:02", "2026-09-25T10:45", 2, "2026-09-27T13:03", "2026-09-28T14:12", 6, ["sneaker", "jogger"]], "91E2A4": ["Sarah H.", "Robe pull côtelée", "MR48175502", "en_transit", "approuve", "2026-09-24T11:12", "2026-09-25T09:30", 5, "2026-09-30T10:02", "2026-09-29T09:40", 5, ["hoodie"]], "9C1E07": ["Yanis B.", "Hoodie noir taille L", "MR48213390", "livre", "approuve", "2026-09-22T18:05", "2026-09-30T11:00", 7, "2026-09-30T10:58", "2026-09-29T15:22", 4, ["hoodie", "cap"]], "5E3C18": ["Luca R.", "Crème de soin cuir + hoodie", "6A29917702231", "livre", "approuve", "2026-09-20T10:30", "2026-09-28T12:00", 9, "2026-09-28T19:12", "2026-09-27T11:05", 7, ["hoodie", "sneaker"]], "7F40C9": ["Maëlys D.", "Sweat zippé crème", "6A29810034477", "livre", "approuve", "2026-09-19T15:10", "2026-09-25T16:40", 8, "2026-09-26T09:03", "2026-09-25T10:18", 5, ["hoodie"]], "36A8E1": ["Hugo F.", "Casquette brodée bleue", "MR47990210", "livre", "approuve", "2026-09-18T12:22", "2026-09-23T09:15", 4, "2026-09-23T18:44", "2026-09-23T08:50", 3, ["cap"]], "B2D95F": ["Nora A.", "Mocassins cuir T38", "XY417763905FR", "livre", "approuve", "2026-09-17T09:55", "2026-09-22T14:03", 6, "2026-09-22T20:10", "2026-09-22T11:32", 6, ["sneaker", "cap"]], "5A0C73": ["Ilyes M.", "Maillot rétro vert", "6A29655128410", "livre", "en_attente", "2026-09-16T18:40", "2026-09-21T10:12", 3, "2026-09-21T19:55", "2026-09-21T09:04", 4, ["hoodie", "jogger"]], "E91B06": ["Camille R.", "Pantalon cargo kaki", "LA981902774FR", "livre", "approuve", "2026-09-15T11:03", "2026-09-20T17:28", 5, "2026-09-21T08:40", "2026-09-20T12:15", 5, ["jogger"]], "28FD4A": ["Samy O.", "Sneakers blanches T44", "MR47851177", "livre", "approuve", "2026-09-13T20:12", "2026-09-18T11:50", 7, "2026-09-19T12:01", "2026-09-18T10:20", 6, ["sneaker", "hoodie"]], "7D2A90": ["Inès D.", "Casquette noire", "LA982231665FR", "en_transit", "approuve", "2026-09-12T16:30", "2026-09-18T10:40", 5, "2026-09-27T22:08", "2026-09-18T09:12", 2, ["cap"]], "C0E7B8": ["Emma N.", "Écharpe laine rouge", "6A29502216638", "livre", "refuse", "2026-09-11T10:45", "2026-09-16T15:05", 4, "2026-09-17T09:30", "2026-09-16T09:48", 4, ["cap", "hoodie"]], "A2C981": ["Tom V.", "Sweat à capuche marine", "MR47512208", "livre", "approuve", "2026-09-02T14:10", "2026-09-09T11:00", 6, "2026-09-08T20:03", "2026-09-08T10:12", 5, ["hoodie"]], "E4B017": ["Inès K.", "Sneakers blanches T37", "6A29188450172", "livre", "approuve", "2026-09-01T09:30", "2026-09-07T16:45", 5, "2026-09-07T18:30", "2026-09-06T14:02", 4, ["sneaker"]]};
  const ref = decodeURIComponent(location.hash.slice(1)).toUpperCase();
  const existante = COMMANDES[ref];
  if (existante) {
    const [client, reference, suivi, statut, qc, creee, modifiee, vues, derniereVue, bouge, nbPhotos, vignettes] = existante;
    const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
    const quand = (iso) => { const x = new Date(iso); return `${x.getDate()} ${MOIS[x.getMonth()]} à ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };
    const jour = (iso) => { const x = new Date(iso); return `${x.getDate()} ${MOIS[x.getMonth()]}`; };
    champ("client").value = client; champ("reference").value = reference; champ("suivi").value = suivi;
    champ("statut").value = statut; champ("qc").value = qc;
    $("[data-creee]", ecran).parentElement.textContent = `Créée le ${quand(creee)}`;
    $(".fiche__ref", ecran).textContent = `#${ref}`;
    // le jeton : immuable, propre à chaque commande
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let h = 0; for (const c of ref) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    $("[data-jeton]", ecran).textContent = ref === "6A4D21" ? "k7Qm2xR9vLpA" : Array.from({ length: 12 }, (_, i) => A[(h = (h * 1103515245 + 12345 + i) >>> 0) % A.length]).join("");
    $(".pc__commande > b", pc).textContent = ref;
    const tuileVues = $$(".fiche__resume .compteur-app", ecran)[3];
    tuileVues.innerHTML = vues ? `<p class="compteur-app__titre">Vues du lien</p><p class="compteur-app__valeur">${vues} consultation${vues > 1 ? "s" : ""}</p><p class="compteur-app__dessous">Dernière le ${quand(derniereVue)}</p>` : `<p class="compteur-app__titre">Vues du lien</p><p class="compteur-app__valeur">Jamais ouvert</p>`;
    tuileVues.toggleAttribute("data-alerte", !vues);
    // les médias : les vignettes de la liste d'abord
    const NOMS_PHOTOS = ["sneaker", "hoodie", "jogger", "cap"];
    const ordre = [...vignettes, ...NOMS_PHOTOS.filter((n) => !vignettes.includes(n))].slice(0, Math.min(nbPhotos, 4));
    medias = ordre.map((n) => ({ url: PHOTOS_DEMO[NOMS_PHOTOS.indexOf(n)], video: false }));
    // l'historique, du plus récent au plus ancien, avec les vrais types d'événement
    const evts = [["Commande créée", "plus", creee], ...ordre.map(() => ["Média ajouté", "images", creee])];
    if (modifiee !== creee) evts.push(["Commande modifiée", "file-text", modifiee]);
    if (qc === "approuve" && derniereVue) evts.push(["Contrôle approuvé par le client", "circle-check", derniereVue]);
    if (qc === "refuse" && derniereVue) evts.push(["Contrôle refusé par le client", "circle-x", derniereVue]);
    evts.sort((a, b) => b[2].localeCompare(a[2]));
    listeHisto.innerHTML = evts.map(([t, i, d]) => `<li><i>${ic(i)}</i><p>${t}<small>${quand(d)}</small></p></li>`).join("");
    dernierModif = Date.now();
    // les dates de la frise du suivi
    const ETAPE = ORDRE.indexOf(statut);
    $$("[data-frise] li", ecran).forEach((li, i) => { if (i < ETAPE || (i === ETAPE)) $("[data-quand]", li).dataset.date = i === 0 ? jour(creee) : jour(bouge ?? modifiee); });
    pc.classList.toggle("qc-valide", qc === "approuve");
  }

  /* ---------- départ ---------- */
  if (!existante) $("[data-creee]", ecran).textContent = "14:32";
  // une autre commande ouverte depuis celle-ci : la fiche repart de zéro
  addEventListener("hashchange", () => location.reload(), { signal });
  poserTitre(); poserSuivi(); poserStatut(); peindreMedias();
  poserTuile("reference", champ("reference").value.trim());
  // une commande déjà suivie : la page dit le dernier mouvement relevé chez le transporteur
  if (existante?.[9] && mouvementPc) {
    const x = new Date(existante[9]), M = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
    const code = champ("transporteur").value || reconnaitre(champ("suivi").value.replace(/\s+/g, "").toUpperCase());
    mouvementPc.textContent = `${code ? NOMS[code] + " · " : ""}Mouvement le ${x.getDate()} ${M[x.getMonth()]}`;
  }
  temoin.dataset.etat = "ok"; temoinTexte.textContent = "Enregistré";
  // une commande toute neuve : le curseur attend le nom du client (pas au téléphone, le clavier couvrirait l'écran)
  if (!existante && matchMedia("(hover: hover) and (pointer: fine)").matches) champ("client").focus({ preventScroll: true });
})();

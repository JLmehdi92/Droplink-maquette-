// DropLink · Ma marque (maquette fidèle au produit)
// Sections, champs, bornes, règles de saisie et libellés : ceux de /marque
// (droplink2 : formulaire-marque.tsx, lib/boutique/reglages.ts,
// normaliser-lien.ts, lib/design/contraste.ts). L'aperçu est la page client de
// la maquette, repeinte et traduite en direct avec les chaînes du produit.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const signal = window.DropLink.ecran();
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const form = $("[data-formulaire-marque]");

  /* ---------- le contraste : l'algorithme du produit (lib/design/contraste.ts), porté tel quel ---------- */
  const hexVersRvb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); if (!m) return null; const n = parseInt(m[1], 16); return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 }; };
  const rvbVersHex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
  const lum = ({ r, g, b }) => { const c = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const quant = ({ r, g, b }) => ({ r: Math.max(0, Math.min(255, Math.round(r))), g: Math.max(0, Math.min(255, Math.round(g))), b: Math.max(0, Math.min(255, Math.round(b))) });
  const versTsl = ({ r, g, b }) => {
    const rn = r / 255, gn = g / 255, bn = b / 255, max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), l = (max + min) / 2, d = max - min;
    if (d === 0) return { t: 0, s: 0, l };
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const t = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6 : max === gn ? ((bn - rn) / d + 2) / 6 : ((rn - gn) / d + 4) / 6;
    return { t, s, l };
  };
  const versRvb = ({ t, s, l }) => {
    if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const c = (dec) => { let x = t + dec; if (x < 0) x += 1; if (x > 1) x -= 1; if (x < 1 / 6) return p + (q - p) * 6 * x; if (x < 1 / 2) return q; if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6; return p; };
    return { r: c(1 / 3) * 255, g: c(0) * 255, b: c(-1 / 3) * 255 };
  };
  const ajuster = (couleur, fond, vise) => {
    const f = quant(fond);
    if (ratio(quant(couleur), f) >= vise) return couleur;
    const tsl = versTsl(couleur), clair = lum(f) > 0.18;
    let bas = clair ? 0 : tsl.l, haut = clair ? tsl.l : 1, meilleure = quant(versRvb({ ...tsl, l: clair ? 0 : 1 }));
    for (let i = 0; i < 24; i += 1) {
      const m = (bas + haut) / 2, cand = quant(versRvb({ ...tsl, l: m }));
      if (ratio(cand, f) >= vise) { meilleure = cand; if (clair) bas = m; else haut = m; } else if (clair) haut = m; else bas = m;
    }
    return meilleure;
  };
  const BLANC = { r: 255, g: 255, b: 255 }, ENCRE = { r: 0x11, g: 0x11, b: 0x17 };
  const resoudreAccent = (hex) => {
    const base = hexVersRvb(hex) || hexVersRvb("#5B4BF5");
    const texte = ajuster(base, BLANC, 4.5), ui = ajuster(base, BLANC, 3);
    let remplissage = ajuster(base, BLANC, 3);
    const sur = ratio(remplissage, BLANC) >= ratio(remplissage, ENCRE) ? BLANC : ENCRE;
    if (ratio(quant(remplissage), sur) < 4.5) remplissage = ajuster(remplissage, sur, 4.5);
    const teinte = quant({ r: 255 + (ui.r - 255) * 0.1, g: 255 + (ui.g - 255) * 0.1, b: 255 + (ui.b - 255) * 0.1 });
    return { texte: rvbVersHex(texte), interface: rvbVersHex(ui), remplissage: rvbVersHex(remplissage), surRemplissage: rvbVersHex(sur), teinte: rvbVersHex(teinte), surTeinte: rvbVersHex(ajuster(texte, teinte, 4.5)), ajuste: rvbVersHex(texte) !== rvbVersHex(base) || rvbVersHex(remplissage) !== rvbVersHex(base) };
  };

  /* ---------- les chaînes de la page client (messages/*.json, « page-publique ») ---------- */
  const LANGUES = {
    fr: { commandeDe: "Une commande de", titre: "Votre commande", pourClient: "pour {nom}", "commande.sousTitre": "Suivi mis à jour automatiquement.", "commande.dateEstimee": "Date estimée de livraison", dates: "1er au 2 octobre", "frise.preparation": "Préparation", "frise.expedie": "Expédié", "frise.en_transit": "En transit", "frise.livre": "Livré", "frise.enCours": "En cours", "frise.enAttente": "En attente", "bandeau.en_transit": "Votre colis est en transit", "suivi.aujourdHui": "Mouvement aujourd’hui", "galerie.titre": "Photos et vidéos", "qc.titre": "Votre validation", "qc.texte": "Ces photos correspondent-elles à votre commande ?", "qc.approuver": "Approuver", "qc.refuser": "Refuser", "reseaux.site": "Site web", "livraison.titre": "Informations de livraison", "livraison.transporteur": "Transporteur", "livraison.numero": "Numéro de suivi", "livraison.dateEstimee": "Date estimée", "contact.titre": "Une question ?", "contact.texte": "Pour toute question concernant votre commande, contactez directement la boutique.", "contact.bouton": "Contacter la boutique", "carteDropLink.surtitre": "PROPULSÉ PAR DROPLINK", "carteDropLink.titre": "Des liens de suivi simples et puissants.", "carteDropLink.texte": "Créez un lien de suivi par commande, en moins d'une minute.", "carteDropLink.bouton": "Découvrir DropLink", client: "votre client" },
    en: { commandeDe: "An order from", titre: "Your order", pourClient: "for {nom}", "commande.sousTitre": "Tracking updated automatically.", "commande.dateEstimee": "Estimated delivery date", dates: "October 1–2", "frise.preparation": "Preparation", "frise.expedie": "Shipped", "frise.en_transit": "In transit", "frise.livre": "Delivered", "frise.enCours": "In progress", "frise.enAttente": "Pending", "bandeau.en_transit": "Your parcel is in transit", "suivi.aujourdHui": "Moved today", "galerie.titre": "Photos and videos", "qc.titre": "Your approval", "qc.texte": "Do these photos match your order?", "qc.approuver": "Approve", "qc.refuser": "Reject", "reseaux.site": "Website", "livraison.titre": "Delivery details", "livraison.transporteur": "Carrier", "livraison.numero": "Tracking number", "livraison.dateEstimee": "Estimated date", "contact.titre": "A question?", "contact.texte": "For anything about your order, contact the shop directly.", "contact.bouton": "Contact the shop", "carteDropLink.surtitre": "POWERED BY DROPLINK", "carteDropLink.titre": "Tracking links, simple and powerful.", "carteDropLink.texte": "Create one tracking link per order, in under a minute.", "carteDropLink.bouton": "Learn more about DropLink", client: "your customer" },
    "zh-CN": { commandeDe: "来自以下店铺的订单", titre: "您的订单", pourClient: "致 {nom}", "commande.sousTitre": "物流信息自动更新。", "commande.dateEstimee": "预计送达日期", dates: "10月1日至2日", "frise.preparation": "备货中", "frise.expedie": "已发货", "frise.en_transit": "运输中", "frise.livre": "已送达", "frise.enCours": "进行中", "frise.enAttente": "待处理", "bandeau.en_transit": "您的包裹正在运输中", "suivi.aujourdHui": "今天有物流更新", "galerie.titre": "照片和视频", "qc.titre": "您的确认", "qc.texte": "这些照片和您的订单一致吗？", "qc.approuver": "确认无误", "qc.refuser": "有问题", "reseaux.site": "官网", "livraison.titre": "配送信息", "livraison.transporteur": "承运商", "livraison.numero": "运单号", "livraison.dateEstimee": "预计日期", "contact.titre": "有疑问？", "contact.texte": "如对订单有任何疑问，请直接联系店铺。", "contact.bouton": "联系店铺", "carteDropLink.surtitre": "由 DropLink 提供支持", "carteDropLink.titre": "简单而强大的物流链接。", "carteDropLink.texte": "为每笔订单创建物流链接，一分钟内完成。", "carteDropLink.bouton": "了解 DropLink", client: "您的客户" },
  };

  /* ---------- les réseaux (reseaux-vendeur.tsx : les tracés officiels du produit) ---------- */
  const RESEAUX = [
    { clef: "instagram", libelle: "Instagram", exemple: "@votrecompte", valeur: "@ateliernord", aide: "Nom de compte ou adresse Instagram, par exemple @votrecompte.", trace: "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1zm0 3.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 10.9a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6zm6.9-11.2a1.5 1.5 0 1 1-3.1 0 1.5 1.5 0 0 1 3.1 0z" },
    { clef: "tiktok", libelle: "TikTok", exemple: "@votrecompte", valeur: "", aide: "Nom de compte ou adresse TikTok, par exemple @votrecompte.", trace: "M14.7 3h2.5a5.3 5.3 0 0 0 4.3 4.3v2.5a7.7 7.7 0 0 1-4.3-1.4v5.9a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1v2.6a3.3 3.3 0 1 0 2.5 3.2z" },
    { clef: "whatsapp", libelle: "WhatsApp", exemple: "Numéro au format international", valeur: "", aide: "Numéro au format international, avec l’indicatif du pays, par exemple +33 6 12 34 56 78.", trace: "M12 3.5a8.4 8.4 0 0 0-7.2 12.7L3.6 20.4l4.3-1.1A8.4 8.4 0 1 0 12 3.5zm4.8 11.9c-.2.6-1.2 1.1-1.7 1.1-.4 0-1 .1-3-.8-2.5-1.1-4.1-3.7-4.2-3.9-.1-.2-1-1.3-1-2.5 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.3.4c-.1.2-.3.3-.1.6.2.3.7 1.1 1.4 1.8.9.8 1.7 1.1 2 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.7.8c.2.1.4.2.4.3.1.2.1.7-.1 1.4z" },
    { clef: "site", libelle: "Site web (facultatif)", exemple: "votresite.fr", valeur: "", aide: "Adresse de votre site, par exemple votresite.fr. Seules les adresses en https sont acceptées.", trace: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.1 1.4 2.5 1.8 4h-3.6c.4-1.5 1-2.9 1.8-4zM4.3 14a8 8 0 0 1 0-4h3.3a17 17 0 0 0 0 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zm2.9-8H5.1a8 8 0 0 1 4.3-3.6A15.6 15.6 0 0 0 8 8zM12 20c-.8-1.1-1.4-2.5-1.8-4h3.6c-.4 1.5-1 2.9-1.8 4zm2.2-6H9.8a15 15 0 0 1 0-4h4.4a15 15 0 0 1 0 4zm.4 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6zm1.8-5.6a17 17 0 0 0 0-4h3.3a8 8 0 0 1 0 4h-3.3z" },
  ];
  // lib/boutique/reglages.ts : ce que la base accepte, après normalisation de la saisie
  const MOTIFS = {
    instagram: /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._/?=&%-]{1,180}$/,
    tiktok: /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._/?=&%-]{1,180}$/,
    whatsapp: /^https:\/\/(wa\.me|api\.whatsapp\.com)\/[A-Za-z0-9._/?=&%+-]{1,180}$/,
    site: /^https:\/\/[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+(\/[A-Za-z0-9._~:/?#=@!$&'()*+,;%-]{0,180})?$/,
  };
  // lib/boutique/normaliser-lien.ts : un pseudo devient une adresse, un numéro devient wa.me
  const normaliser = (clef, saisie) => {
    const brut = saisie.trim();
    if (!brut) return "";
    if (clef === "site") return /^[a-z][a-z0-9+.-]*:\/\//i.test(brut) ? brut : "https://" + brut.toLowerCase();
    const hotes = { instagram: /(^|\.)instagram\.com$/i, tiktok: /(^|\.)tiktok\.com$/i, whatsapp: /^(wa\.me|api\.whatsapp\.com)$/i }[clef];
    const avec = brut.replace(/^http:\/\//i, "https://");
    try { const u = new URL(/^https?:\/\//i.test(avec) ? avec : "https://" + avec); if (hotes.test(u.hostname)) return "https://" + u.hostname.toLowerCase() + u.pathname + u.search; } catch { /* pas une adresse : on essaie pseudo et numéro */ }
    if (clef === "whatsapp") { const n = brut.replace(/[\s.()-]/g, ""); return /^\+\d{8,15}$/.test(n) ? "https://wa.me/" + n.slice(1) : brut; }
    if (/^@?[A-Za-z0-9._]{1,30}$/.test(brut)) { const p = brut.replace(/^@/, ""); return clef === "tiktok" ? "https://www.tiktok.com/@" + p : "https://instagram.com/" + p; }
    return brut;
  };
  const zoneReseaux = $("[data-reseaux]");
  zoneReseaux.innerHTML = RESEAUX.map((r) => `
    <label class="champ-reglage">
      <span class="champ-reglage__etiquette">${r.libelle}</span>
      <span class="champ-icone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${r.trace}"/></svg><input type="text" name="${r.clef}" placeholder="${r.exemple}" value="${r.valeur}" autocomplete="off" spellcheck="false" data-reseau="${r.clef}"></span>
      <small class="champ-reglage__erreur" data-erreur-reseau="${r.clef}"></small>
    </label>`).join("");

  /* ---------- l'aperçu : la même page, en mobile et en desktop ----------
     Comme ApercuClient (fiche commande) : un téléphone de 300 px à 8 px de bord,
     ou la page desktop de 1180 px réduite à la largeur du panneau. La page est
     posée à l'échelle EXACTE de son cadre, mesurée : rien ne dépasse à droite. */
  const modele = $("template[data-pc]").content.firstElementChild;
  const creerPage = (bureau) => {
    const p = modele.cloneNode(true);
    p.setAttribute("data-etats", "");
    p.classList.add("a-client", "a-photos", "a-suivi");
    $$("[data-pc-livraison]", p).forEach((el) => { el.hidden = false; });
    if (bureau) {
      // la mise en page desktop du produit : l'en-tête, puis deux piles (1,72 fr / 1 fr)
      p.classList.add("pc--bureau");
      const colonnes = document.createElement("div"); colonnes.className = "pc__colonnes";
      const gauche = document.createElement("div"), droite = document.createElement("div");
      gauche.append(...$$(".pc__commande, .pc__photos, .pc__qc", p));
      droite.append(...$$(".pc__livraison, .pc__contact, .pc__propulse", p));
      colonnes.append(gauche, droite); p.append(colonnes);
    }
    return p;
  };
  const pages = [["mobile", creerPage(false)], ["desktop", creerPage(true)]];
  pages.forEach(([m, p]) => $(`[data-apercu-ecran="${m}"]`).append(p));
  const LARGEUR = { mobile: 390, desktop: 1180 };
  const zoneApercu = $("[data-apercu-zone]");
  // En desktop l'échelle tombe vers 0,4 : `zoom` y arrondit chaque lettre et les
  // mots se collent. On réduit donc par transformation, et on rend au défilement
  // la hauteur que la transformation ne retire pas d'elle-même.
  const cadrer = () => pages.forEach(([m, p]) => {
    const cadre = $(`[data-apercu-ecran="${m}"]`);
    if (!cadre.clientWidth) return;
    const z = cadre.clientWidth / LARGEUR[m];
    // au téléphone, l'aperçu mobile EST la page à sa taille : la réduire la rendait illisible
    if (m === "mobile") { p.style.setProperty("--z", matchMedia("(max-width: 640px)").matches ? "1" : String(z)); return; }
    p.style.transform = `scale(${z})`;
    p.style.marginBottom = `${-(1 - z) * p.offsetHeight}px`;
    p.style.marginRight = `${-(1 - z) * LARGEUR.desktop}px`;
  });
  const obs = new ResizeObserver(cadrer); obs.observe(zoneApercu);
  signal.addEventListener("abort", () => obs.disconnect());
  // la bascule Desktop / Mobile ; le panneau s'élargit en desktop, où la page est quatre fois plus large
  const formats = $$("[data-format]");
  formats.forEach((b) => b.addEventListener("click", () => {
    const m = b.dataset.format;
    formats.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $$("[data-vue]", zoneApercu).forEach((v) => { v.hidden = v.dataset.vue !== m; });
    form.dataset.apercu = m;
    cadrer();
  }));
  let logo = null;
  const icone = (trace) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${trace}"/></svg>`;
  const ORDRE_CONTACT = ["whatsapp", "instagram", "tiktok", "site"];
  const peindre = () => {
    const nom = form.nom.value.trim(), description = form.description.value.trim(), langue = form.langue.value;
    const L = LANGUES[langue];
    const hex = /^#[0-9a-f]{6}$/i.test(form.couleur.value.trim()) ? form.couleur.value.trim() : null;
    const a = hex ? resoudreAccent(hex) : null;
    // réseaux : seulement ceux qui sont configurés et valides, aucun bloc sinon
    const liens = RESEAUX.filter((r) => { const v = normaliser(r.clef, form[r.clef].value); return v && MOTIFS[r.clef].test(v); });
    const libelle = (r) => (r.clef === "site" ? L["reseaux.site"] : r.libelle);
    const principal = ORDRE_CONTACT.map((c) => liens.find((r) => r.clef === c)).find(Boolean);
    for (const [, pc] of pages) {
      // une page sans nom ni logo commence directement par son contenu
      $(".pc__boutique", pc).hidden = !nom && !logo;
      $("[data-pc-nom]", pc).textContent = nom; $("[data-pc-nom]", pc).hidden = !nom;
      $("[data-pc-description]", pc).textContent = description; $("[data-pc-description]", pc).hidden = !description;
      const img = $("[data-pc-logo]", pc); img.hidden = !logo; if (logo) img.src = logo;
      pc.setAttribute("lang", langue);
      $$("[data-t]", pc).forEach((el) => { const v = L[el.dataset.t]; if (v) el.textContent = v; });
      $("[data-pc-pour]", pc).textContent = L.pourClient.replace("{nom}", L.client);
      $(".pc__commande > b", pc).textContent = "6A4D21";
      if (a) {
        pc.style.setProperty("--pc-texte", a.texte); pc.style.setProperty("--pc-interface", a.interface); pc.style.setProperty("--pc-remplissage", a.remplissage);
        pc.style.setProperty("--pc-sur-remplissage", a.surRemplissage); pc.style.setProperty("--pc-teinte", a.teinte); pc.style.setProperty("--pc-sur-teinte", a.surTeinte);
      }
      // en-tête : les icônes de tous les liens, site compris (variante « icone »)
      const icones = $("[data-pc-icones]", pc);
      icones.hidden = !liens.length;
      icones.innerHTML = liens.map((r) => `<li title="${libelle(r)}">${icone(r.trace)}</li>`).join("");
      // « Une question ? » : seulement s'il y a un lien pour répondre ; les réseaux libellés, sans le site
      $("[data-pc-contact]", pc).hidden = !principal;
      $("[data-pc-contact-liens]", pc).innerHTML = liens.filter((r) => r.clef !== "site").map((r) => `<li>${icone(r.trace)}${r.libelle}</li>`).join("");
      // la carte « Propulsé par DropLink », aux couleurs du vendeur ; le Pro peut la retirer
      $("[data-pc-propulse]", pc).hidden = form.masquer.checked;
    }
    if (a) {
      $("[data-demo-texte]").style.color = a.texte;
      Object.assign($("[data-demo-bouton]").style, { background: a.remplissage, color: a.surRemplissage });
      Object.assign($("[data-demo-bandeau]").style, { background: a.teinte, color: a.surTeinte });
      $("[data-note-ajustee]").hidden = !a.ajuste;
      $("[data-pastille]").style.background = hex;
    }
    // filigrane : il faut un nom à écrire
    const possible = !!nom;
    form.filigrane.disabled = !possible;
    if (!possible) form.filigrane.checked = false;
    $("[data-aide-filigrane]").textContent = possible ? "Votre nom apparaît discrètement sur chaque photo agrandie. Cela décourage la réutilisation, mais ne l’empêche pas." : "Donnez d'abord un nom à votre boutique : sans lui, il n'y a rien à écrire sur les photos.";
    for (const [, pc] of pages) pc.dataset.filigrane = form.filigrane.checked ? nom : "";
    cadrer();
    $("[data-compteur-description]").textContent = `${[...form.description.value].length} / 150`;
  };

  /* ---------- la couleur : la roue et le code se suivent ---------- */
  const roue = $("[data-couleur-roue]"), texte = $("[data-couleur-texte]");
  roue.addEventListener("input", () => { texte.value = roue.value.toUpperCase(); valider("couleur"); peindre(); });
  texte.addEventListener("input", () => { const v = texte.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) roue.value = v.toLowerCase(); valider("couleur", true); peindre(); });

  /* ---------- validation, au fil de la saisie puis à l'enregistrement ---------- */
  const erreurs = {};
  const montrer = (el, msg) => { el.textContent = msg; el.closest(".champ-reglage, .reglage__corps")?.classList.toggle("a-erreur", !!msg); };
  const valider = (quoi, douce = false) => {
    if (quoi === "couleur") {
      const ok = /^#[0-9a-f]{6}$/i.test(texte.value.trim());
      erreurs.couleur = !ok;
      $("[data-conforme]").hidden = !ok;
      if (!douce || ok) montrer($("[data-erreur-couleur]"), ok ? "" : "Indiquez un code de six chiffres ou lettres précédé d'un dièse, par exemple #0058be.");
    }
    if (quoi === "lien") {
      const v = form.lien.value.trim();
      const ok = v === "" || /^(?!.*--)[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(v);
      erreurs.lien = !ok;
      montrer($("[data-erreur-lien]"), ok ? "" : "Ce nom ne convient pas : 3 à 40 caractères, en minuscules, chiffres et tirets, sans tiret au début, à la fin, ni deux à la suite.");
    }
    const r = RESEAUX.find((x) => x.clef === quoi);
    if (r) {
      const v = normaliser(r.clef, form[r.clef].value);
      const ok = v === "" || MOTIFS[r.clef].test(v);
      erreurs[r.clef] = !ok;
      montrer($(`[data-erreur-reseau="${r.clef}"]`), ok ? "" : r.aide);
    }
  };
  form.addEventListener("input", (e) => {
    if (e.target.matches("[data-reseau]")) { if (erreurs[e.target.name]) valider(e.target.name); }
    if (e.target === form.lien && erreurs.lien) valider("lien");
    marquerModifie(); peindre();
  });
  form.addEventListener("change", (e) => {
    if (e.target.matches("[data-reseau]")) valider(e.target.name);
    if (e.target === form.lien) valider("lien");
    marquerModifie(); peindre();
  });

  /* ---------- le logo : réduit dans le navigateur, puis borné à 20 Ko comme dans le produit ---------- */
  const fichier = $("[data-depot-fichier]"), visuel = $("[data-depot-visuel]"), erreurLogo = $("[data-erreur-logo]");
  const poserLogo = (url) => {
    logo = url;
    visuel.innerHTML = url ? `<img src="${url}" alt="">` : `<svg class="ic"><use href="#i-upload"/></svg>`;
    $("[data-depot-titre]").textContent = url ? "Changer le logo" : "Choisir une image";
    $("[data-depot-retirer]").hidden = !url;
    marquerModifie(); peindre();
  };
  fichier.addEventListener("change", async () => {
    const f = fichier.files?.[0]; fichier.value = "";
    if (!f) return;
    montrer(erreurLogo, "");
    // SVG refusé, jamais « assaini » : seuls PNG, JPG et WebP passent
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) { montrer(erreurLogo, "Ce format n'est pas accepté. Choisissez un PNG, un JPG ou un WebP."); return; }
    try {
      const bitmap = await createImageBitmap(f);
      const cote = 256, k = Math.min(1, cote / Math.max(bitmap.width, bitmap.height));
      const c = document.createElement("canvas"); c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k);
      c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
      const blob = await new Promise((ok) => c.toBlob(ok, "image/webp", 0.85));
      if (!blob || blob.size > 20 * 1024) { montrer(erreurLogo, "Cette image est trop lourde."); return; }
      poserLogo(URL.createObjectURL(blob));
    } catch { montrer(erreurLogo, "Cette image n'a pas pu être lue par votre navigateur. Essayez un PNG, un JPG ou un WebP."); }
  });
  $("[data-depot-retirer]").addEventListener("click", () => { if (logo) URL.revokeObjectURL(logo); poserLogo(null); });
  // glisser une image sur la zone
  const zone = $("[data-depot-zone]");
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("est-survolee"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("est-survolee"));
  zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("est-survolee"); if (e.dataTransfer.files[0]) { const dt = new DataTransfer(); dt.items.add(e.dataTransfer.files[0]); fichier.files = dt.files; fichier.dispatchEvent(new Event("change")); } });

  /* ---------- enregistrer ---------- */
  const statut = $("[data-statut]"), bouton = $("[data-enregistrer]");
  const marquerModifie = () => { statut.textContent = ""; statut.dataset.ton = ""; };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    ["couleur", "lien", ...RESEAUX.map((r) => r.clef)].forEach((q) => valider(q));
    const premier = Object.entries(erreurs).find(([, v]) => v);
    if (premier) {
      const champ = premier[0] === "couleur" ? texte : form[premier[0]];
      champ.focus({ preventScroll: true }); champ.scrollIntoView({ block: "center", behavior: reduit ? "auto" : "smooth" });
      statut.textContent = "Rien n'a été enregistré."; statut.dataset.ton = "erreur";
      return;
    }
    bouton.disabled = true; bouton.querySelector("span").textContent = "Enregistrement…";
    setTimeout(() => {
      bouton.disabled = false; bouton.querySelector("span").textContent = "Enregistrer les modifications";
      statut.textContent = "Enregistré."; statut.dataset.ton = "ok";
      if (!reduit) statut.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.23,1,.32,1)" });
    }, reduit ? 0 : 700);
  });

  /* ---------- premier affichage ---------- */
  valider("couleur", true);
  peindre();
})();

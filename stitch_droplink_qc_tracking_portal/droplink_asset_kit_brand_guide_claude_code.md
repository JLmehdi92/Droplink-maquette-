# DropLink Development Asset Kit & Brand Guidelines

Ce document est conçu pour être utilisé comme référence par **Claude Code** (ou tout autre agent de développement) afin de garantir une reproduction pixel-perfect de l'écosystème DropLink.

---

## 1. Typographie (Fonts)
La plateforme utilise une seule famille de polices moderne et technologique.

- **Police principale :** `Plus Jakarta Sans`
- **Source :** [Google Fonts - Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)
- **Usage :**
    - **Headlines :** ExtraBold / Bold (Tracking: -0.02em)
    - **Body :** Medium / Regular
    - **Labels/Data :** SemiBold (All Caps pour les titres de tableaux)

---

## 2. Palette de Couleurs (Design Tokens)
Utilisez ces variables CSS pour maintenir la cohérence de la DA "Navy, Blanc, Bleu".

### Couleurs de Marque
- `--brand-navy`: `#0f172a` (Utilisé pour la Sidebar Desktop et les textes profonds)
- `--brand-blue-primary`: `#0058be` (Couleur d'accent, boutons, états actifs)
- `--brand-blue-light`: `#e6eff8` (Surbrillances, fonds de badges)

### Couleurs d'Interface (Admin/Dashboard)
- `--surface-bg`: `#f7f9fb` (Fond principal des pages)
- `--surface-card`: `#ffffff` (Conteneurs Bento, cartes blanches)
- `--surface-nav`: `#f2f4f6` (Sidebar "Fidelity Fix" - Gris très clair)
- `--border-subtle`: `#e2e8f0` (Bordures de cartes et séparateurs)

### Status & Feedback
- `--status-success`: `#10b981` (Badges "QC Passed")
- `--status-warning`: `#f59e0b` (Alertes température, "Flagged")
- `--status-error`: `#ef4444` (Erreurs infrastructure, "QC Failed")

---

## 3. Identité Visuelle (Logos)
Voici les références des actifs générés à intégrer :

- **Logo Full (Wordmark + Icon) :** `{{DATA:IMAGE:IMAGE_68}}`
- **Logo Icon Only (Circular Monogram DL) :** `{{DATA:IMAGE:IMAGE_54}}`

---

## 4. Spécifications de Composants (Bento Grid)
- **Radius :** `8px` (Standard pour tous les conteneurs et boutons)
- **Shadows :** 
    - `shadow-sm`: 0 1px 2px 0 rgb(0 0 0 / 0.05)
    - `shadow-md`: 0 4px 6px -1px rgb(0 0 0 / 0.1)
- **Padding :**
    - Section Desktop: `32px` (2rem)
    - Section Mobile: `16px` (1rem)

---

## 5. Intégrations Spécifiques
- **Animations :** Utiliser `Three.js` et `Framer Motion` pour les transitions de scroll.
- **Charts :** Utiliser `Chart.js` ou `Recharts` avec des courbes de type *monotone* (Smooth Step).
- **Icons :** Utiliser la bibliothèque `Lucide React` ou `Material Symbols`.

---

## 6. Liste des Écrans de Référence (Architecture)
Claude Code doit se référer à ces IDs pour la structure HTML :
- **Landing (Desktop):** `{{DATA:SCREEN:SCREEN_76}}`
- **Dashboard (Operational):** `{{DATA:SCREEN:SCREEN_53}}`
- **Admin Panel (Master):** `{{DATA:SCREEN:SCREEN_26}}`
- **Tracking Portal (White Label):** `{{DATA:SCREEN:SCREEN_83}}`
- **Mobile Ecosystem:** `{{DATA:SCREEN:SCREEN_60}}` à `{{DATA:SCREEN:SCREEN_66}}`

---
*Document généré pour l'initialisation du Spec Kit DropLink.*
---
name: DropLink Logistics System
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#45464d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0058be'
  on-secondary: '#ffffff'
  secondary-container: '#2170e4'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#0b1c30'
  on-tertiary-container: '#75859d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1440px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
---

## Brand & Style

The design system is engineered for the high-stakes environment of logistics and quality control. It prioritizes clarity, speed, and unwavering professionalism. The aesthetic combines **Corporate Modern** reliability with **Glassmorphism** accents to signify a tech-forward, cloud-native platform.

The visual narrative focuses on "transparency through the supply chain." This is achieved through translucent layers, precise data visualization, and a spacious layout that reduces cognitive load during high-volume photo audits. The emotional response should be one of absolute control and structural integrity.

## Colors

The palette is anchored by **Deep Navy (#0F172A)**, providing a foundation of authority and stability. **Electric Blue (#3B82F6)** serves as the primary action color, driving user focus toward essential QC tasks and uploads.

- **Primary (Deep Navy):** Used for sidebars, primary headings, and heavy UI anchors.
- **Secondary (Electric Blue):** Used for primary buttons, active states, and progress indicators.
- **Neutral (Slate Grays):** A sophisticated range of grays from `#F8FAFC` to `#1E293B` manages secondary text and subtle borders.
- **Surface:** The background uses a very light Slate tint to reduce eye strain compared to pure white.

## Typography

This design system utilizes a dual-font strategy. **Plus Jakarta Sans** is used for headlines to provide a modern, slightly geometric personality that feels approachable yet professional. **Inter** is the workhorse for body text and data-heavy tables, chosen for its exceptional legibility at small sizes and its neutral, systematic tone.

Key typographic rules:
- Use **Headline XL** only for main dashboard overviews.
- All labels in data tables should use **Label SM** with uppercase styling for maximum scannability.
- Maintain tight letter spacing on headlines to keep the "tech-forward" appearance.

## Layout & Spacing

The design system follows a **12-column fluid grid** for internal content, housed within a fixed-width container of 1440px for desktop. Spacing is based on an **8px linear scale**, ensuring mathematical harmony across all components.

- **Desktop:** 12 columns, 24px gutters, 40px outer margins.
- **Tablet:** 8 columns, 16px gutters, 24px outer margins.
- **Mobile:** 4 columns, 16px gutters, 16px outer margins.

The layout philosophy emphasizes "Zonal Grouping"—using whitespace rather than heavy lines to separate different stages of the logistics workflow.

## Elevation & Depth

To achieve the requested **Glassmorphism** effect, this design system uses a specific layering logic:

1.  **Background:** Solid light neutral (`#F8FAFC`).
2.  **Middleground (Cards):** Semi-transparent white (`rgba(255, 255, 255, 0.7)`) with a `20px` backdrop-blur. 
3.  **Foreground (Modals/Popovers):** `rgba(255, 255, 255, 0.9)` with a `40px` backdrop-blur and a subtle `1px` white inner border to simulate glass edges.

**Shadows:** Use extra-diffused "Ambient Shadows." 
- `shadow-sm`: `0 2px 4px rgba(15, 23, 42, 0.05)`
- `shadow-md`: `0 8px 16px rgba(15, 23, 42, 0.08)`
- `shadow-lg`: `0 20px 32px rgba(15, 23, 42, 0.12)`

## Shapes

The design system utilizes a **"2xl" roundedness** philosophy. Most standard UI components use a 0.5rem (8px) base, but large containers and image cards utilize significantly larger radii to create a soft, premium feel.

- **Small Components (Inputs/Buttons):** `rounded` (8px).
- **Medium Components (Cards/Modals):** `rounded-lg` (16px).
- **Large Sections (Wrappers):** `rounded-xl` (24px).
- **Extreme Elements (Photo Overlays):** `rounded-2xl` (32px).

## Components

### Buttons
- **Primary:** Electric Blue background, white text. Large 12px vertical padding. No gradient, but a subtle `shadow-md` that disappears on press.
- **Secondary:** Deep Navy border (1.5px), Navy text, transparent background.

### Input Fields
- Use a light slate background (`#F1F5F9`) instead of white to contrast against the glass-morphic cards.
- On focus: 2px Electric Blue border and a soft glow.

### QC Cards (Photos)
- Must include a `rounded-xl` image with a semi-transparent status badge (e.g., "Passed," "Flagged") in the top right corner using Glassmorphism.
- The footer of the card should be a solid Slate-50 background to anchor metadata (Timestamp, Location).

### Data Lists
- Use horizontal dividers in `Slate-100` with 0.5px thickness. 
- Alternating row highlights are discouraged; use hover states with a `2px` Electric Blue left-border indicator instead.

### Status Chips
- Rounded-pill shape. Use high-saturation background colors at 10% opacity with 100% opacity text for clear readability (e.g., Success = Green-500 @ 10% bg).
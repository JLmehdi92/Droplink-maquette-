/**
 * Le code TOTP réel vit dans `scripts/totp.mjs` depuis le 23/09/2026 : la fumée
 * en a besoin aussi, pour ouvrir une session d'administration en double facteur
 * (migration 186). Réexporté ici pour que les suites ne changent pas d'import.
 */
export { codeTotp } from "../../scripts/totp.mjs";

import sneaker from "@/../public/marque/apercu-sneaker.jpg";
import hoodie from "@/../public/marque/apercu-hoodie.jpg";
import jogger from "@/../public/marque/apercu-jogger.jpg";
import cap from "@/../public/marque/apercu-cap.jpg";

/**
 * Les quatre photos de démonstration de la landing, en imports statiques : un
 * chemin `/marque/…` passerait par le middleware de langue (307), et
 * l'optimiseur d'images de Next refuserait la redirection.
 */
export const IMAGES_DEMO = [sneaker, hoodie, jogger, cap] as const;

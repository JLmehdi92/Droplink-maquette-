import { TemplateEcran } from "@/components/app/template-ecran";

/** L'entrée de chaque écran de l'espace vendeur : voir `TemplateEcran`. */
export default function TemplateApplication({ children }: { children: React.ReactNode }) {
  return <TemplateEcran>{children}</TemplateEcran>;
}

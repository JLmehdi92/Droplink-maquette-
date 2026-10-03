import { Bell, ClockAlert, EyeOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DetailsFermable } from "./details-fermable";

/**
 * LA CLOCHE : deux familles d'alertes, sans état « lu ».
 *
 * Chaque famille mène à l'écran qui la montre, filtré. Une famille à zéro, ou
 * dont la lecture a échoué (`null`), n'apparaît pas : on n'annonce jamais un
 * nombre qu'on n'a pas compté. Le badge est la somme EXACTE des familles
 * listées, pour que le nombre de la cloche et celui du panneau ne se
 * contredisent jamais.
 *
 * Dessin de la maquette (`coque.html`, `.alertes`) : bouton de 36 px (44 au
 * doigt), panneau de 320 px, feuille pleine largeur sous 760 px.
 */
export async function ClocheAlertes({
  langue,
  jamaisOuvertes,
  colisSilencieux,
}: {
  readonly langue: string;
  readonly jamaisOuvertes: number | null;
  readonly colisSilencieux: number | null;
}) {
  const t = await getTranslations("alertes");

  const familles = [
    {
      clef: "jamaisOuvertes" as const,
      valeur: jamaisOuvertes,
      href: `/${langue}/commandes?tri=jamais-ouvert`,
      Icone: EyeOff,
      ton: "attente",
    },
    {
      clef: "silencieux" as const,
      valeur: colisSilencieux,
      href: `/${langue}/envois?silencieux=oui`,
      Icone: ClockAlert,
      ton: "silence",
    },
  ].filter((f) => f.valeur !== null && f.valeur > 0);

  const total = familles.reduce((n, f) => n + (f.valeur ?? 0), 0);
  const titre = total > 0 ? t("titreAvec", { n: total }) : t("titre");

  return (
    <DetailsFermable className="alertes">
      <summary className="alertes__bouton" aria-label={titre} aria-expanded="false" aria-controls="panneau-alertes">
        <Bell aria-hidden="true" className="ic" />
        {total > 0 ? (
          <span className="alertes__pastille" aria-hidden="true">
            {total}
          </span>
        ) : null}
      </summary>
      <div className="alertes__panneau" id="panneau-alertes">
        <p className="alertes__titre">{titre}</p>
        {familles.length === 0 ? (
          // Le panneau est vide la plupart du temps : c'est une bonne nouvelle,
          // qu'il faut annoncer comme telle.
          <p className="alertes__rien">{t("rien")}</p>
        ) : (
          familles.map((f) => (
            <Link key={f.clef} href={f.href} className="alerte">
              <i data-ton={f.ton}>
                <f.Icone aria-hidden="true" className="ic" />
              </i>
              <span>
                <b>{t(f.clef + ".titre", { n: f.valeur ?? 0 })}</b>
                <small>{t(f.clef + ".texte")}</small>
              </span>
            </Link>
          ))
        )}
      </div>
    </DetailsFermable>
  );
}

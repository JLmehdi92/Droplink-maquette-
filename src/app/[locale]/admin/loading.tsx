/**
 * LE SQUELETTE DE L'ESPACE D'ADMINISTRATION.
 *
 * ⚠️ IL ÉTAIT INVISIBLE, ET SON COMMENTAIRE DISAIT LE CONTRAIRE. Il annonçait
 * emprunter « les couleurs de cette surface, en chrome sombre » et peignait ses
 * blocs en `white/10` — sur la zone de contenu, qui est CLAIRE (#f7f7fb) et l'a
 * toujours été. Seule la colonne de navigation est sombre. Un blanc à 10 %
 * posé sur du #f7f7fb ne se distingue pas du fond : pendant chaque navigation,
 * l'écran restait simplement vide. Le commentaire décrivait une intention, pas
 * un comportement — et c'est exactement le genre de phrase qui rend un défaut
 * invérifiable, puisqu'elle explique déjà pourquoi tout va bien.
 *
 * IL SUIT MAINTENANT LA GÉOMÉTRIE RÉELLE DE L'ÉCRAN : la bande sombre du titre
 * au téléphone, où les blocs sont clairs sur fond noir, puis la zone de contenu
 * claire, où ils sont sombres sur fond clair. Un squelette qui ne correspond pas
 * à la page qu'il annonce fait sauter la mise en page au moment du remplacement.
 */
export default function Chargement() {
  return (
    <div aria-hidden="true">
      <div className="bg-admin px-4 pb-5 md:bg-transparent md:px-[30px] md:pt-[26px]">
        <div className="h-[33px] w-56 max-w-full animate-pulse rounded-md bg-white/10 md:h-[35px] md:bg-on-surface/10" />
        <div className="mt-1 h-4 w-80 max-w-full animate-pulse rounded-md bg-white/10 md:mt-[5px] md:h-[17px] md:bg-on-surface/10" />
      </div>

      <div className="p-4 md:mt-[22px] md:px-[30px] md:pb-[26px]">
        <div className="h-[13px] w-40 animate-pulse rounded-md bg-on-surface/10" />
        <div className="mt-3 flex flex-col gap-2.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-[76px] animate-pulse rounded-[16px] bg-on-surface/[0.06] md:rounded-[18px]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

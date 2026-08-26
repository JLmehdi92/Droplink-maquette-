/**
 * L'espace d'administration, en chrome sombre.
 *
 * Le squelette emprunte les couleurs de CETTE surface et non celles du
 * dashboard : un squelette clair sur un chrome sombre produirait un éclair
 * blanc à chaque navigation, ce qui est pire que l'attente.
 */
export default function Chargement() {
  return (
    <div className="px-margin-mobile py-6 md:px-[30px] md:py-[26px]" aria-hidden="true">
      <div className="h-8 w-56 rounded-md bg-white/10 animate-pulse" />
      <div className="mt-3 h-4 w-80 max-w-full rounded-md bg-white/10 animate-pulse" />
      <div className="mt-gutter flex flex-col gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

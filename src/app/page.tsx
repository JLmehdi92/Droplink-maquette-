/**
 * Page d'accueil provisoire.
 *
 * La vraie landing est le lot 1. Ce fichier existe pour que la racine réponde
 * pendant le lot 0 ; il ne porte aucune copy définitive et sera remplacé
 * entièrement, structure comprise.
 */
export default function Accueil() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-4">
      <h1 className="font-[family-name:var(--font-titre)] text-titre-lg text-encre">DropLink</h1>
      <p className="text-encre-douce">
        Socle en place. La landing arrive au lot 1.
      </p>
    </main>
  );
}

import { MeshGradient } from "@/components/brand/MeshGradient";
import { HeroBackdrop } from "@/components/brand/HeroBackdrop";

interface CeremonyLayoutProps {
  children: React.ReactNode;
}

/**
 * CeremonyLayout — Full-screen celebration/result reveal.
 * Used for exam completion, achievement unlock, etc.
 */
export function CeremonyLayout({ children }: CeremonyLayoutProps) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-12">
      <MeshGradient variant="hero" />
      <HeroBackdrop />
      <div className="relative z-10 w-full max-w-lg text-center">{children}</div>
    </div>
  );
}

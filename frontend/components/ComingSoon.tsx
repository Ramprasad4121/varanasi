import Link from "next/link";
import { BrandButton } from "@/components/BrandButton";
import { PageHero } from "@/components/PageHero";
import { Diamond } from "@/components/Diamond";

export function ComingSoon({
  title,
  eyebrow,
  what,
  image = "/images/gate.jpg",
}: {
  title: string;
  eyebrow: string;
  what: string;
  image?: string;
}) {
  return (
    <div>
      <PageHero title={title} eyebrow={eyebrow} subtitle="Coming soon." image={image} />
      <section className="mx-auto max-w-[680px] px-4 py-14 text-center sm:px-6">
        <Diamond className="mx-auto text-accent" />
        <p className="mt-6 font-display text-xl italic leading-relaxed text-fg-body">{what}</p>
        <p className="mt-4 font-display text-base leading-relaxed text-fg-muted">
          We ship one brick at a time, and every brick has to hold before the next one goes down. This one is not
          down yet.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <BrandButton href="/roadmap">Read the roadmap</BrandButton>
          <BrandButton href="/hire" variant="ghost">
            Use what is live
          </BrandButton>
        </div>
        <p className="mt-8 font-label text-[11px] uppercase tracking-[0.16em] text-fg-muted">
          Or follow along on{" "}
          <Link href="/docs" className="text-accent underline underline-offset-4">
            documentation
          </Link>
        </p>
      </section>
    </div>
  );
}

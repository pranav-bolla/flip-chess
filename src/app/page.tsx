import Link from "next/link";
import { HeroBoard } from "@/components/HeroBoard";
import { HomeModes } from "@/components/HomeModes";

export default function Home() {
  return (
    <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-20 lg:py-0">
      <div className="max-w-md">
        <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em]">FLIP Chess</h1>
        <p className="mt-1 text-[16px] text-muted">Chess. But you switch sides.</p>
        <div className="mt-8">
          <HomeModes />
        </div>
        <Link href="/rules" className="mt-5 inline-block text-[13px] text-faint transition-colors hover:text-muted">
          How flips work
        </Link>
      </div>
      <div className="mx-auto w-full max-w-[400px]">
        <HeroBoard />
      </div>
    </div>
  );
}

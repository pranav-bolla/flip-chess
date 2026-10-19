import type { Metadata } from "next";
import { DuelCreate } from "@/components/duel/DuelCreate";

export const metadata: Metadata = { title: "Flip Duel · FLIP Chess" };

export default function DuelPage() {
  return <DuelCreate />;
}

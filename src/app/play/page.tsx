import type { Metadata } from "next";
import { GameView } from "@/components/GameView";

export const metadata: Metadata = { title: "Play · FLIP Chess" };

export default function PlayPage() {
  return <GameView />;
}

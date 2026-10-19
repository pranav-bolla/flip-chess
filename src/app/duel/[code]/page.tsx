import type { Metadata } from "next";
import { Suspense } from "react";
import { DuelRoomRoute } from "@/components/duel/DuelRoomRoute";

export const metadata: Metadata = { title: "Flip Duel · FLIP Chess" };

export default function DuelRoomPage() {
  // The room code is only known at request time; useParams suspends until then.
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <DuelRoomRoute />
    </Suspense>
  );
}

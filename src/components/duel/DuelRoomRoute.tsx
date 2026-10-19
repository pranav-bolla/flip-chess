"use client";

import { useParams } from "next/navigation";
import { DuelRoom } from "./DuelRoom";

export function DuelRoomRoute() {
  const { code } = useParams<{ code: string }>();
  return <DuelRoom code={String(code).toUpperCase()} />;
}

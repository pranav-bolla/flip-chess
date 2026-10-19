import type { Metadata } from "next";
import { DailyView } from "@/components/DailyView";

export const metadata: Metadata = { title: "Daily Flip · FLIP Chess" };

export default function DailyPage() {
  return <DailyView />;
}

import { connection } from "next/server";
import { timerCalls } from "@/timer-calls";

// Timers scheduled so far, by the kind of render that scheduled them.
// `connection()` keeps the route dynamic.
export async function GET() {
  await connection();
  return Response.json(timerCalls());
}

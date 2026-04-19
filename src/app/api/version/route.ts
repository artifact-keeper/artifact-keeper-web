import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    version: process.env.NEXT_PUBLIC_APP_VERSION || "dev",
    name: "artifact-keeper-web",
  });
}

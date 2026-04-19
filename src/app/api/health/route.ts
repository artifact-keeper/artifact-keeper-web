import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "artifact-keeper-web",
    timestamp: new Date().toISOString(),
  });
}

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServerClient();
    
    // Quick, cheap query to verify Supabase connection and service key validity
    const { error } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);

    if (error) {
      console.error("Health check database query error:", error);
      // No error detail in the body: /api/health is unauthenticated (the
      // uptime monitor and the deploy smoke test both hit it anonymously), so
      // anything returned here is public. A Postgres error string names
      // tables, columns and roles. The detail is logged above instead.
      return NextResponse.json(
        {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          database: "disconnected",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (err: any) {
    console.error("Health check exception:", err);
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

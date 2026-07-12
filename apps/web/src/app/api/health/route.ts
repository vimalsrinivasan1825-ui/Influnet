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
      return NextResponse.json(
        {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          database: "disconnected",
          error: error.message,
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

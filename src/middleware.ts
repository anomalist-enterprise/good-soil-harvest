import { NextRequest, NextResponse } from "next/server";

// 301 www → apex so Google sees one canonical host. Without this, both
// goodsoilharvest.com and www.goodsoilharvest.com return 200 with no
// redirect, which lights up the "Duplicate without user-selected canonical"
// row in Search Console.
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (host.startsWith("www.")) {
    const url = new URL(req.url);
    url.host = host.slice(4);
    return NextResponse.redirect(url, 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};

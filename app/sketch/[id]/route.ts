import { NextResponse } from 'next/server';

export function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  return NextResponse.redirect(new URL(`/api/projects/${params.id}/sketch`, request.url));
}

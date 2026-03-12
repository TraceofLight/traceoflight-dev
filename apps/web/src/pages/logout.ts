import type { APIRoute } from "astro";

import {
  createAdminLogoutRedirect,
  createAdminLogoutResponse,
} from "../lib/admin-logout";

export const prerender = false;

export const POST: APIRoute = (context) => createAdminLogoutResponse(context);
export const GET: APIRoute = (context) => createAdminLogoutRedirect(context);

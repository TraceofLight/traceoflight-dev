import type { APIRoute } from 'astro';

import {
  createAdminLogoutRedirect,
  createAdminLogoutResponse,
} from '../../../lib/admin-logout';

export const prerender = false;

const performLogout: APIRoute = (context) => createAdminLogoutResponse(context);
const redirectAway: APIRoute = (context) => createAdminLogoutRedirect(context);

export const POST: APIRoute = performLogout;
export const GET: APIRoute = redirectAway;

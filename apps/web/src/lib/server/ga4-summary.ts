export type VisitorSummary = {
  todayVisitors: number;
  totalVisitors: number;
};

type CachedVisitorSummary = {
  fetchedAt: number;
  value: VisitorSummary | null;
};

const DEFAULT_TOTAL_START_DATE = "2025-01-01";
const DEFAULT_CACHE_TTL_SECONDS = 600;
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

let analyticsClientPromise: Promise<unknown> | null = null;
let cachedSummary: CachedVisitorSummary | null = null;

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getCacheTtlMilliseconds() {
  return parsePositiveInt(process.env.GA4_VISITOR_CACHE_TTL_SECONDS, DEFAULT_CACHE_TTL_SECONDS) * 1000;
}

function getPropertyId() {
  return (process.env.GA4_PROPERTY_ID ?? "").trim();
}

function getTotalStartDate() {
  return (process.env.GA4_VISITOR_TOTAL_START_DATE ?? "").trim() || DEFAULT_TOTAL_START_DATE;
}

function getServiceAccountCredentials() {
  const raw = (process.env.GA4_SERVICE_ACCOUNT_JSON ?? "").trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      client_email?: string;
      private_key?: string;
    };

    const clientEmail = parsed.client_email?.trim() ?? "";
    const privateKey = parsed.private_key?.replace(/\\n/g, "\n").trim() ?? "";
    if (!clientEmail || !privateKey) {
      return null;
    }

    return {
      client_email: clientEmail,
      private_key: privateKey,
    };
  } catch {
    return null;
  }
}

async function getAnalyticsClient() {
  if (!analyticsClientPromise) {
    analyticsClientPromise = import("@google-analytics/data").then(({ BetaAnalyticsDataClient }) => {
      const credentials = getServiceAccountCredentials();
      if (!credentials) {
        throw new Error("missing ga4 service account credentials");
      }

      return new BetaAnalyticsDataClient({
        credentials,
        scopes: [GA_SCOPE],
      });
    });
  }

  return analyticsClientPromise;
}

function parseMetricValue(response: unknown) {
  const row = (response as { rows?: Array<{ metricValues?: Array<{ value?: string }> }> })?.rows?.[0];
  const value = row?.metricValues?.[0]?.value ?? "0";
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function runTotalUsersReport(dateRanges: Array<{ startDate: string; endDate: string }>) {
  const propertyId = getPropertyId();
  if (!propertyId) {
    throw new Error("missing ga4 property id");
  }

  const client = (await getAnalyticsClient()) as {
    runReport: (input: unknown) => Promise<[unknown]>;
  };
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges,
    metrics: [{ name: "totalUsers" }],
  });

  return parseMetricValue(response);
}

export async function getGa4VisitorSummary(): Promise<VisitorSummary | null> {
  const now = Date.now();
  const ttl = getCacheTtlMilliseconds();
  if (cachedSummary && now - cachedSummary.fetchedAt < ttl) {
    return cachedSummary.value;
  }

  if (!getPropertyId() || !getServiceAccountCredentials()) {
    cachedSummary = {
      fetchedAt: now,
      value: null,
    };
    return null;
  }

  try {
    const [todayVisitors, totalVisitors] = await Promise.all([
      runTotalUsersReport([{ startDate: "today", endDate: "today" }]),
      runTotalUsersReport([{ startDate: getTotalStartDate(), endDate: "today" }]),
    ]);

    const value = {
      todayVisitors,
      totalVisitors,
    };
    cachedSummary = {
      fetchedAt: now,
      value,
    };
    return value;
  } catch (error) {
    console.error("[ga4-summary] failed to load visitor summary", error);
    cachedSummary = {
      fetchedAt: now,
      value: null,
    };
    return null;
  }
}

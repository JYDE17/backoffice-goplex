// Server-only client for the RaceFacer admin panel (racefacer.brossard.goplex.ca).
// RaceFacer is reachable only from the site's local network — this module must run
// on a machine on that network (see .env.example / RACEFACER_BASE_URL).
import { getServerEnv } from "./env.server";

export type RaceFacerTenderBucket = {
  name: string;
  paid: number;
  refund: number;
  total: number;
};

export type RaceFacerStation = {
  stationId: string;
  stationName: string;
  tenders: Record<string, RaceFacerTenderBucket>;
};

export type RaceFacerSalesSummary = {
  reportDateFrom: string;
  reportDateTo: string;
  stations: RaceFacerStation[];
};

class CookieJar {
  private cookies = new Map<string, string>();

  applyResponse(res: Response) {
    const setCookies =
      typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

function toRaceFacerDate(isoDate: string): string {
  // isoDate: "YYYY-MM-DD" -> RaceFacer expects "DD-MM-YYYY"
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

async function loginAndGetSession(baseUrl: string, username: string, password: string) {
  const jar = new CookieJar();

  const loginPageRes = await fetch(`${baseUrl}/fr/auth/login`, { redirect: "follow" });
  jar.applyResponse(loginPageRes);
  const loginPageHtml = await loginPageRes.text();

  const tokenMatch = loginPageHtml.match(/name="_token"\s+value="([^"]+)"/);
  if (!tokenMatch) {
    throw new Error("RaceFacer login: could not find CSRF token on login page.");
  }
  const csrfToken = tokenMatch[1];

  const body = new URLSearchParams({
    _token: csrfToken,
    pos_station_id: "",
    username,
    password,
  });

  const loginRes = await fetch(`${baseUrl}/fr/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.header(),
    },
    body,
  });
  jar.applyResponse(loginRes);

  const isRedirect = loginRes.status >= 300 && loginRes.status < 400;
  if (!isRedirect) {
    throw new Error(
      `RaceFacer login failed (status ${loginRes.status}). Check RACEFACER_USERNAME / RACEFACER_PASSWORD.`,
    );
  }

  return jar;
}

export async function fetchRaceFacerSalesSummary(isoDate: string): Promise<RaceFacerSalesSummary> {
  const baseUrl = getServerEnv("RACEFACER_BASE_URL").replace(/\/$/, "");
  const username = getServerEnv("RACEFACER_USERNAME");
  const password = getServerEnv("RACEFACER_PASSWORD");

  const jar = await loginAndGetSession(baseUrl, username, password);

  const rfDate = toRaceFacerDate(isoDate);
  const reportUrl = `${baseUrl}/ajax/reports/others/sales-summary-report?page=1&from_date=${rfDate}&to_date=${rfDate}`;

  const res = await fetch(reportUrl, {
    headers: {
      Cookie: jar.header(),
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`RaceFacer sales summary request failed with status ${res.status}.`);
  }

  const json = (await res.json()) as {
    report_data_from: string;
    report_data_to: string;
    data: {
      tenders_by_stations: Record<
        string,
        { name: string; tenders: Record<string, RaceFacerTenderBucket> }
      >;
    };
  };

  const stations: RaceFacerStation[] = Object.entries(json.data.tenders_by_stations).map(
    ([stationId, station]) => ({
      stationId,
      stationName: station.name,
      tenders: station.tenders,
    }),
  );

  return {
    reportDateFrom: json.report_data_from,
    reportDateTo: json.report_data_to,
    stations,
  };
}

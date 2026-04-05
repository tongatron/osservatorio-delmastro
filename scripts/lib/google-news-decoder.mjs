const GOOGLE_NEWS_HOST = "news.google.com";
const DEFAULT_HEADERS = {
  "accept-language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
  "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
  referrer: `https://${GOOGLE_NEWS_HOST}/`,
  "user-agent": "DelmastroNewswatch/0.2 (+local project)"
};
const BATCH_EXECUTE_URL = `https://${GOOGLE_NEWS_HOST}/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je`;
const BATCH_EXECUTE_PAYLOAD_PREFIX =
  "[[[\"Fbv4je\",\"[\\\"garturlreq\\\",[[\\\"en-US\\\",\\\"US\\\",[\\\"FINANCE_TOP_INDICES\\\",\\\"WEB_TEST_1_0_0\\\"],null,null,1,1,\\\"US:en\\\",null,180,null,null,null,null,null,0,null,null,[1608992183,723341000]],\\\"en-US\\\",\\\"US\\\",1,[2,3,4,8],1,0,\\\"655000234\\\",0,0,null,0],\\\"";
const BATCH_EXECUTE_PAYLOAD_SUFFIX = "\\\"]\",null,\"generic\"]]]";
const BATCH_EXECUTE_RESULT_HEADER = '[\\"garturlres\\",\\"';
const BATCH_EXECUTE_RESULT_FOOTER = '\\",';

export function isGoogleNewsUrl(value) {
  try {
    return new URL(value).hostname === GOOGLE_NEWS_HOST;
  } catch {
    return false;
  }
}

export async function decodeGoogleNewsUrl(sourceUrl, options = {}) {
  if (!isGoogleNewsUrl(sourceUrl)) {
    return {
      sourceUrl,
      decodedUrl: sourceUrl,
      status: "passthrough"
    };
  }

  const token = extractGoogleNewsToken(sourceUrl);
  if (!token) {
    throw new Error(`Unsupported Google News URL: ${sourceUrl}`);
  }

  const parsed = decodeGoogleNewsToken(token);
  if (parsed.kind === "url") {
    return {
      sourceUrl,
      decodedUrl: parsed.url,
      status: "decoded",
      method: "offline"
    };
  }

  const decodedUrl = await fetchDecodedBatchExecute(token, options.headers);
  return {
    sourceUrl,
    decodedUrl,
    status: "decoded",
    method: "batchexecute"
  };
}

export function extractGoogleNewsToken(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== GOOGLE_NEWS_HOST) {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    const last = segments.at(-1) ?? null;
    const previous = segments.at(-2) ?? null;

    if (previous === "articles" || previous === "read") {
      return last;
    }

    return null;
  } catch {
    return null;
  }
}

function decodeGoogleNewsToken(token) {
  let binary = Buffer.from(normalizeBase64(token), "base64").toString("binary");
  const prefix = Buffer.from([0x08, 0x13, 0x22]).toString("binary");
  const suffix = Buffer.from([0xd2, 0x01, 0x00]).toString("binary");

  if (binary.startsWith(prefix)) {
    binary = binary.slice(prefix.length);
  }

  if (binary.endsWith(suffix)) {
    binary = binary.slice(0, -suffix.length);
  }

  if (!binary.length) {
    throw new Error("Empty Google News payload");
  }

  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const len = bytes.at(0);

  if (len == null) {
    throw new Error("Missing Google News payload length");
  }

  let candidate;
  if (len >= 0x80) {
    candidate = binary.slice(2, len + 2);
  } else {
    candidate = binary.slice(1, len + 1);
  }

  if (/^https?:\/\//i.test(candidate)) {
    return { kind: "url", url: candidate };
  }

  if (candidate.startsWith("AU_yqL")) {
    return { kind: "batch" };
  }

  throw new Error("Unsupported Google News payload format");
}

async function fetchDecodedBatchExecute(token, extraHeaders = {}) {
  const response = await fetch(BATCH_EXECUTE_URL, {
    method: "POST",
    headers: {
      ...DEFAULT_HEADERS,
      ...extraHeaders
    },
    body: new URLSearchParams({
      "f.req": `${BATCH_EXECUTE_PAYLOAD_PREFIX}${token}${BATCH_EXECUTE_PAYLOAD_SUFFIX}`
    })
  });

  if (!response.ok) {
    throw new Error(`Google News decoder failed with HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text.includes(BATCH_EXECUTE_RESULT_HEADER)) {
    throw new Error("Google News decoder response missing garturlres");
  }

  const start = text.slice(text.indexOf(BATCH_EXECUTE_RESULT_HEADER) + BATCH_EXECUTE_RESULT_HEADER.length);
  if (!start.includes(BATCH_EXECUTE_RESULT_FOOTER)) {
    throw new Error("Google News decoder response missing result footer");
  }

  return start.slice(0, start.indexOf(BATCH_EXECUTE_RESULT_FOOTER));
}

function normalizeBase64(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  return padding === 0 ? normalized : `${normalized}${"=".repeat(4 - padding)}`;
}

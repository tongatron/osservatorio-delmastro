import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseHTML } from "linkedom";

const ROOT = process.cwd();
const ARTICLES_PATH = path.join(ROOT, "data", "articles.json");
const CONFIG_PATH = path.join(ROOT, "config", "watch.json");
const CACHE_DIR = path.join(ROOT, "cache");
const CACHE_PATH = path.join(CACHE_DIR, "article-bodies.json");
const USER_AGENT = "DelmastroBriefsBot/0.1 (+local project)";

const [articlesPayload, config] = await Promise.all([
  readJson(ARTICLES_PATH),
  readJson(CONFIG_PATH)
]);

const selectorConfig = config.articleSelectors ?? {};
const cached = await readJson(CACHE_PATH, { items: [] });
const cacheMap = new Map((cached.items ?? []).map((item) => [item.id, item]));
const maxBodyChars = Number(config.ai?.maxBodyCharsPerArticle ?? 3500);

const items = [];

for (const article of articlesPayload.articles ?? []) {
  const cachedItem = cacheMap.get(article.id);
  if (cachedItem && cachedItem.link === article.link) {
    items.push(cachedItem);
    continue;
  }

  try {
    const extracted = await fetchArticleBody(article, selectorConfig, maxBodyChars);
    items.push(extracted);
  } catch (error) {
    items.push({
      id: article.id,
      link: article.link,
      sourceHost: article.sourceHost,
      title: article.title,
      fetchedAt: new Date().toISOString(),
      extractionStatus: "error",
      extractionMethod: "failed",
      bodyText: "",
      bodyExcerpt: article.excerpt ?? "",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

await mkdir(CACHE_DIR, { recursive: true });
await writeFile(
  CACHE_PATH,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      articleCount: items.length,
      items
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Saved ${items.length} article bodies to ${CACHE_PATH}`);

async function fetchArticleBody(article, selectors, maxChars) {
  const response = await fetch(article.link, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "it-IT,it;q=0.9,en;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${article.link}`);
  }

  const html = await response.text();
  const { document } = parseHTML(html);

  for (const selector of ["script", "style", "noscript", "svg", "form", "iframe"]) {
    for (const node of document.querySelectorAll(selector)) {
      node.remove();
    }
  }

  const hostSelectors = selectors[article.sourceHost] ?? [];
  const defaultSelectors = selectors.default ?? [];
  const selectorList = [...hostSelectors, ...defaultSelectors];

  let extractionMethod = "fallback";
  let paragraphs = [];

  for (const selector of selectorList) {
    const root = document.querySelector(selector);
    if (!root) {
      continue;
    }

    const extractedParagraphs = collectParagraphs(root);
    if (extractedParagraphs.length >= 3) {
      paragraphs = extractedParagraphs;
      extractionMethod = `selector:${selector}`;
      break;
    }
  }

  if (paragraphs.length === 0) {
    paragraphs = collectParagraphs(document);
  }

  const bodyText = normalizeText(paragraphs.join("\n\n")).slice(0, maxChars);

  return {
    id: article.id,
    link: article.link,
    sourceHost: article.sourceHost,
    title: article.title,
    fetchedAt: new Date().toISOString(),
    extractionStatus: bodyText ? "ok" : "empty",
    extractionMethod,
    bodyText,
    bodyExcerpt: bodyText.slice(0, 400),
    error: null
  };
}

function collectParagraphs(root) {
  const paragraphNodes = root.querySelectorAll("p");
  const values = [];

  for (const node of paragraphNodes) {
    const text = normalizeText(node.textContent);
    if (text.length < 70) {
      continue;
    }

    if (looksLikeUiNoise(text)) {
      continue;
    }

    values.push(text);
  }

  return dedupeParagraphs(values);
}

function dedupeParagraphs(values) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(value);
  }

  return output;
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeUiNoise(text) {
  const value = text.toLowerCase();
  return [
    "iscriviti",
    "newsletter",
    "pubblicità",
    "cookie",
    "continua a leggere",
    "leggi anche",
    "potrebbe interessarti",
    "riproduzione riservata"
  ].some((token) => value.includes(token));
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== null) {
      return fallback;
    }
    throw error;
  }
}

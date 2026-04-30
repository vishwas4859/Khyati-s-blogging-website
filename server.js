const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const SESSION_COOKIE = "ink_emotion_session";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@inkandemotion.com";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".py": "text/x-python; charset=utf-8",
};

const sessions = new Map();
let store = null;

function readJsonFile(filePath) {
  return fsp.readFile(filePath, "utf8").then((data) => JSON.parse(data));
}

async function loadStore() {
  store = await readJsonFile(DATA_FILE);
}

async function saveStore() {
  const payload = JSON.stringify(store, null, 2);
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(DATA_FILE, payload, "utf8");
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function sendNoContent(res, extraHeaders = {}) {
  res.writeHead(204, extraHeaders);
  res.end();
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header.split(";").map((part) => {
      const [name, ...rest] = part.trim().split("=");
      return [name, decodeURIComponent(rest.join("="))];
    }),
  );
}

function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  return sessions.get(token) || null;
}

function createSession(email) {
  const token = crypto.randomBytes(24).toString("hex");
  const session = { email };
  sessions.set(token, session);
  return { token, session };
}

function destroySession(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    sessions.delete(token);
  }
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

function isAdmin(req) {
  return Boolean(getSession(req));
}

function sanitizeReviewInput(input) {
  return {
    title: String(input.title || "").trim(),
    bookAuthor: String(input.bookAuthor || "").trim() || "Unknown Author",
    genre: String(input.genre || "").trim(),
    stars: Math.max(1, Math.min(5, Number(input.stars) || 5)),
    status: input.status === "draft" ? "draft" : "published",
    emoji: String(input.emoji || "📖").trim() || "📖",
    content: String(input.content || "").trim(),
  };
}

function buildExcerpt(content) {
  const cleaned = content.replace(/[#>\[\]*_\n]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 130) {
    return cleaned;
  }
  return `${cleaned.slice(0, 130).trim()}…`;
}

function formatLongDate(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCommentTime(date = new Date()) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ensureReviewPayload(input) {
  const review = sanitizeReviewInput(input);
  if (!review.title || !review.genre || !review.content) {
    return { error: "Title, genre, and content are required." };
  }

  return {
    value: {
      ...review,
      excerpt: buildExcerpt(review.content),
    },
  };
}

function visibleReviews(req) {
  const admin = isAdmin(req);
  return store.reviews.filter((review) => admin || review.status === "published");
}

function commentsByPostForVisibleReviews(req) {
  const visibleIds = new Set(visibleReviews(req).map((review) => review.id));
  const grouped = {};

  for (const comment of store.comments) {
    if (!visibleIds.has(comment.postId)) {
      continue;
    }

    if (!grouped[comment.postId]) {
      grouped[comment.postId] = [];
    }
    grouped[comment.postId].push(comment);
  }

  return grouped;
}

function buildBootstrap(req) {
  return {
    reviews: visibleReviews(req),
    commentsByPost: commentsByPostForVisibleReviews(req),
    session: {
      isAdmin: isAdmin(req),
      email: getSession(req)?.email || null,
    },
  };
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function unauthorized(res) {
  sendJson(res, 401, { error: "Authentication required." });
}

async function handleLogin(req, res) {
  const body = await getRequestBody(req);
  const email = String(body.email || "").trim() || ADMIN_EMAIL;
  const password = String(body.password || "");

  if (password !== ADMIN_PASSWORD) {
    sendJson(res, 401, { error: "Invalid email or password." });
    return;
  }

  const { token } = createSession(email);
  sendJson(
    res,
    200,
    { ok: true, session: { isAdmin: true, email } },
    { "Set-Cookie": sessionCookie(token) },
  );
}

async function handleLogout(req, res) {
  destroySession(req);
  sendNoContent(res, { "Set-Cookie": clearSessionCookie() });
}

async function handleCreateReview(req, res) {
  if (!isAdmin(req)) {
    unauthorized(res);
    return;
  }

  const body = await getRequestBody(req);
  const parsed = ensureReviewPayload(body);
  if (parsed.error) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }

  const review = {
    id: store.nextReviewId++,
    date: formatLongDate(),
    likes: 0,
    ...parsed.value,
  };

  store.reviews.unshift(review);
  await saveStore();
  sendJson(res, 201, { review });
}

async function handleUpdateReview(req, res, reviewId) {
  if (!isAdmin(req)) {
    unauthorized(res);
    return;
  }

  const index = store.reviews.findIndex((review) => review.id === reviewId);
  if (index === -1) {
    sendJson(res, 404, { error: "Review not found." });
    return;
  }

  const body = await getRequestBody(req);
  const parsed = ensureReviewPayload(body);
  if (parsed.error) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }

  store.reviews[index] = {
    ...store.reviews[index],
    ...parsed.value,
  };

  await saveStore();
  sendJson(res, 200, { review: store.reviews[index] });
}

async function handleDeleteReview(req, res, reviewId) {
  if (!isAdmin(req)) {
    unauthorized(res);
    return;
  }

  const before = store.reviews.length;
  store.reviews = store.reviews.filter((review) => review.id !== reviewId);
  if (store.reviews.length === before) {
    sendJson(res, 404, { error: "Review not found." });
    return;
  }

  store.comments = store.comments.filter((comment) => comment.postId !== reviewId);
  await saveStore();
  sendNoContent(res);
}

async function handleToggleLike(req, res, reviewId) {
  const review = store.reviews.find((item) => item.id === reviewId);
  if (!review || review.status !== "published") {
    sendJson(res, 404, { error: "Review not found." });
    return;
  }

  const body = await getRequestBody(req);
  const liked = Boolean(body.liked);
  review.likes = Math.max(0, review.likes + (liked ? 1 : -1));
  await saveStore();
  sendJson(res, 200, { likes: review.likes });
}

async function handleCreateComment(req, res, reviewId) {
  const review = store.reviews.find((item) => item.id === reviewId);
  if (!review || review.status !== "published") {
    sendJson(res, 404, { error: "Review not found." });
    return;
  }

  const body = await getRequestBody(req);
  const text = String(body.text || "").trim();
  const name = String(body.name || "").trim() || "Reader";
  const avatar = String(body.avatar || "📖").trim() || "📖";

  if (!text) {
    sendJson(res, 400, { error: "Comment text is required." });
    return;
  }

  const comment = {
    id: store.nextCommentId++,
    postId: reviewId,
    name: name.slice(0, 40),
    avatar: avatar.slice(0, 4),
    text: text.slice(0, 1000),
    time: formatCommentTime(),
  };

  store.comments.unshift(comment);
  await saveStore();
  sendJson(res, 201, { comment });
}

function safeJoin(root, requestPath) {
  const resolved = path.normalize(path.join(root, requestPath));
  if (!resolved.startsWith(root)) {
    return null;
  }
  return resolved;
}

async function serveStatic(req, res, pathname) {
  const root = __dirname;
  const relativePath = pathname === "/" ? "/ink-and-emotion.html" : pathname;
  const targetPath = safeJoin(root, relativePath);
  if (!targetPath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stats = await fsp.stat(targetPath);
    if (stats.isDirectory()) {
      sendText(res, 403, "Forbidden");
      return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": stats.size,
    });
    fs.createReadStream(targetPath).pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/bootstrap") {
    sendJson(res, 200, buildBootstrap(req));
    return;
  }

  if (req.method === "GET" && pathname === "/api/session") {
    sendJson(res, 200, buildBootstrap(req).session);
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    await handleLogin(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    await handleLogout(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/reviews") {
    await handleCreateReview(req, res);
    return;
  }

  const reviewMatch = pathname.match(/^\/api\/reviews\/(\d+)$/);
  if (reviewMatch) {
    const reviewId = Number(reviewMatch[1]);

    if (req.method === "PUT") {
      await handleUpdateReview(req, res, reviewId);
      return;
    }

    if (req.method === "DELETE") {
      await handleDeleteReview(req, res, reviewId);
      return;
    }
  }

  const likeMatch = pathname.match(/^\/api\/reviews\/(\d+)\/like$/);
  if (likeMatch && req.method === "POST") {
    await handleToggleLike(req, res, Number(likeMatch[1]));
    return;
  }

  const commentMatch = pathname.match(/^\/api\/reviews\/(\d+)\/comments$/);
  if (commentMatch && req.method === "POST") {
    await handleCreateComment(req, res, Number(commentMatch[1]));
    return;
  }

  sendJson(res, 404, { error: "API route not found." });
}

async function requestListener(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal server error." });
  }
}

async function start() {
  await loadStore();
  const server = http.createServer(requestListener);
  server.listen(PORT, HOST, () => {
    console.log(`Ink & Emotion server running at http://${HOST}:${PORT}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

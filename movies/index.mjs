import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHmac } from "crypto";

const client = new DynamoDBClient({});
const ddb    = DynamoDBDocumentClient.from(client);
const SECRET = process.env.AUTH_SECRET || "downlowe-secret";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

const ok      = (b) => ({ statusCode: 200, headers: CORS, body: JSON.stringify(b) });
const created = (b) => ({ statusCode: 201, headers: CORS, body: JSON.stringify(b) });
const err     = (s, m) => ({ statusCode: s, headers: CORS, body: JSON.stringify({ error: m }) });

// ── Token helpers ─────────────────────────────────────────────────────────────

function makeToken(username) {
  const sig = createHmac("sha256", SECRET).update(username).digest("hex");
  return Buffer.from(`${username}:${sig}`).toString("base64");
}
function verifyToken(token) {
  try {
    const decoded  = Buffer.from(token, "base64").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    const username = decoded.slice(0, colonIdx);
    const sig      = decoded.slice(colonIdx + 1);
    const expected = createHmac("sha256", SECRET).update(username).digest("hex");
    return sig === expected ? username : null;
  } catch { return null; }
}
function getUser(event) {
  const auth  = event.headers?.Authorization || event.headers?.authorization || "";
  const token = auth.replace("Bearer ", "").trim();
  return token ? verifyToken(token) : null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  const method  = event.httpMethod || event.requestContext?.http?.method;
  const rawPath = event.rawPath || event.path || "/" + (event.pathParameters?.proxy || "");
  if (method === "OPTIONS") return ok({});

  const segments    = rawPath.replace(/^\//, "").split("/").filter(Boolean);
  const [s0, s1, s2, s3] = segments;

  try {
    // Auth
    if (method === "POST" && s0 === "auth" && s1 === "register") return await register(event);
    if (method === "POST" && s0 === "auth" && s1 === "login")    return await login(event);

    // Movies
    if (method === "GET"    && s0 === "movies" && !s1) return await getMovies();
    if (method === "POST"   && s0 === "movies" && !s1) return await addMovie(event);
    if (method === "DELETE" && s0 === "movies" &&  s1) return await deleteMovie(event, s1);

    // Vote & seen
    if (method === "POST" && s0 === "vote") return await castVote(event);
    if (method === "POST" && s0 === "seen") return await toggleSeen(event);

    // Queue
    if (method === "GET"    && s0 === "queue" && !s1) return await getQueue();
    if (method === "POST"   && s0 === "queue" && !s1) return await addToQueue(event);
    if (method === "DELETE" && s0 === "queue" &&  s1) return await removeFromQueue(event, s1);
    if (method === "PUT"    && s0 === "queue" && !s1) return await reorderQueue(event);

    // Watched
    if (method === "GET"    && s0 === "watched" && !s1) return await getWatched();
    if (method === "POST"   && s0 === "watched" && !s1) return await addToWatched(event);
    if (method === "PUT"    && s0 === "watched" &&  s1) return await updateWatchedDate(event, s1);
    if (method === "DELETE" && s0 === "watched" &&  s1) return await removeFromWatched(event, s1);

    // Lists
    if (method === "GET"    && s0 === "lists" && !s1)                          return await getLists();
    if (method === "POST"   && s0 === "lists" && !s1)                          return await createList(event);
    if (method === "PUT"    && s0 === "lists" &&  s1 && !s2)                   return await updateList(event, s1);
    if (method === "DELETE" && s0 === "lists" &&  s1 && !s2)                   return await deleteList(event, s1);
    if (method === "POST"   && s0 === "lists" &&  s1 && s2 === "movies" && !s3) return await addMovieToList(event, s1);
    if (method === "DELETE" && s0 === "lists" &&  s1 && s2 === "movies" &&  s3) return await removeMovieFromList(event, s1, s3);
    if (method === "PUT"    && s0 === "lists" &&  s1 && s2 === "order")        return await reorderListMovies(event, s1);

    // List ordering
    if (method === "PUT" && s0 === "listorder" && !s1) return await reorderLists(event);

    // Comments
    if (method === "GET"    && s0 === "comments" && s1 && !s2) return await getComments(s1);
    if (method === "POST"   && s0 === "comments" && s1 && !s2) return await addComment(event, s1);
    if (method === "PUT"    && s0 === "comments" && s1 &&  s2) return await editComment(event, s1, s2);
    if (method === "DELETE" && s0 === "comments" && s1 &&  s2) return await deleteComment(event, s1, s2);

    // Chat
    if (method === "GET"  && s0 === "chat" && !s1) return await getChat(event);
    if (method === "POST" && s0 === "chat" && !s1) return await sendChat(event);

    return err(404, "Not found");
  } catch (e) {
    console.error(e);
    return err(500, "Internal server error");
  }
};

// ── Auth ──────────────────────────────────────────────────────────────────────

async function register(event) {
  const { username = "", password = "" } = JSON.parse(event.body || "{}");
  const clean = username.trim().toLowerCase();
  if (!clean || !password.trim()) return err(400, "Username and password required");
  if (!/^[a-z0-9_]{2,20}$/.test(clean)) return err(400, "Username must be 2–20 chars (letters, numbers, underscore)");
  const existing = await ddb.send(new GetCommand({ TableName: "users", Key: { username: clean } }));
  if (existing.Item) return err(409, "Username already taken");
  await ddb.send(new PutCommand({ TableName: "users", Item: { username: clean, password: password.trim(), createdAt: new Date().toISOString() } }));
  return created({ username: clean, token: makeToken(clean) });
}

async function login(event) {
  const { username = "", password = "" } = JSON.parse(event.body || "{}");
  const clean = username.trim().toLowerCase();
  if (!clean || !password.trim()) return err(400, "Username and password required");
  const user = await ddb.send(new GetCommand({ TableName: "users", Key: { username: clean } }));
  if (!user.Item || user.Item.password !== password.trim()) return err(401, "Invalid username or password");
  return ok({ username: clean, token: makeToken(clean) });
}

// ── Movies ────────────────────────────────────────────────────────────────────

const isUsername = (u) => /^[a-z0-9_]{2,20}$/.test(u);

async function getMovies() {
  const [moviesRes, votesRes] = await Promise.all([
    ddb.send(new ScanCommand({ TableName: "movies" })),
    ddb.send(new ScanCommand({ TableName: "votes" })),
  ]);
  const votes  = votesRes.Items || [];
  const movies = (moviesRes.Items || []).map(m => ({
    ...m,
    seenBy:     m.seenBy ? [...m.seenBy].filter(isUsername) : [],
    upvoters:   votes.filter(v => v.movieId === m.movieId && v.direction ===  1 && isUsername(v.userId)).map(v => v.userId),
    downvoters: votes.filter(v => v.movieId === m.movieId && v.direction === -1 && isUsername(v.userId)).map(v => v.userId),
  }));
  movies.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
  return ok(movies);
}

async function addMovie(event) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const body = JSON.parse(event.body || "{}");
  if (!body.title?.trim()) return err(400, "title is required");
  const existing = await ddb.send(new ScanCommand({ TableName: "movies" }));
  if ((existing.Items || []).some(m => m.title.toLowerCase() === body.title.trim().toLowerCase()))
    return err(409, "That movie is already on the list");
  const movie = {
    movieId: crypto.randomUUID(), title: body.title.trim(), addedBy: username,
    addedAt: new Date().toISOString(), upvotes: 0, downvotes: 0,
    posterUrl: body.posterUrl || null, year: body.year || null,
    imdbRating: body.imdbRating || null, runtime: body.runtime || null, imdbId: body.imdbId || null,
  };
  await ddb.send(new PutCommand({ TableName: "movies", Item: movie }));
  return created({ ...movie, upvoters: [], downvoters: [], seenBy: [] });
}

async function deleteMovie(event, movieId) {
  if (!getUser(event)) return err(401, "Login required");
  await ddb.send(new DeleteCommand({ TableName: "movies", Key: { movieId } }));
  // Remove from queue, watched, and all lists in parallel
  const [q, w, listsRes] = await Promise.all([
    ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "main" } })),
    ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "watched" } })),
    ddb.send(new ScanCommand({ TableName: "lists" })),
  ]);
  await Promise.all([
    ddb.send(new PutCommand({ TableName: "queue", Item: { queueId: "main",    movieIds: (q.Item?.movieIds || []).filter(id => id !== movieId) } })),
    ddb.send(new PutCommand({ TableName: "queue", Item: { queueId: "watched", movieIds: (w.Item?.movieIds || []).filter(id => id !== movieId) } })),
    ...(listsRes.Items || [])
      .filter(l => (l.movieIds || []).includes(movieId))
      .map(l => ddb.send(new UpdateCommand({
        TableName: "lists", Key: { listId: l.listId },
        UpdateExpression: "SET movieIds = :ids",
        ExpressionAttributeValues: { ":ids": (l.movieIds || []).filter(id => id !== movieId) },
      }))),
  ]);
  return ok({ deleted: true });
}

// ── Vote ──────────────────────────────────────────────────────────────────────

async function castVote(event) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const { movieId, direction } = JSON.parse(event.body || "{}");
  if (!movieId || ![1, -1].includes(direction)) return err(400, "movieId and direction required");
  const existing = await ddb.send(new GetCommand({ TableName: "votes", Key: { userId: username, movieId } }));
  const prev     = existing.Item?.direction ?? 0;
  if (prev === direction) {
    await ddb.send(new DeleteCommand({ TableName: "votes", Key: { userId: username, movieId } }));
    await adjustCount(movieId, direction, -1);
    return ok({ vote: 0 });
  }
  if (prev !== 0) await adjustCount(movieId, prev, -1);
  await ddb.send(new PutCommand({ TableName: "votes", Item: { userId: username, movieId, direction, votedAt: new Date().toISOString() } }));
  await adjustCount(movieId, direction, +1);
  return ok({ vote: direction });
}

async function adjustCount(movieId, direction, delta) {
  const field = direction === 1 ? "upvotes" : "downvotes";
  await ddb.send(new UpdateCommand({ TableName: "movies", Key: { movieId }, UpdateExpression: `SET ${field} = ${field} + :d`, ExpressionAttributeValues: { ":d": delta } }));
}

// ── Seen ──────────────────────────────────────────────────────────────────────

async function toggleSeen(event) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const { movieId } = JSON.parse(event.body || "{}");
  if (!movieId) return err(400, "movieId required");
  const movie = await ddb.send(new GetCommand({ TableName: "movies", Key: { movieId } }));
  if (!movie.Item) return err(404, "Movie not found");
  const seenBy = movie.Item.seenBy ? [...movie.Item.seenBy] : [];
  const seen   = seenBy.includes(username);
  await ddb.send(new UpdateCommand({ TableName: "movies", Key: { movieId }, UpdateExpression: seen ? "DELETE seenBy :u" : "ADD seenBy :u", ExpressionAttributeValues: { ":u": new Set([username]) } }));
  return ok({ seen: !seen });
}

// ── Queue ─────────────────────────────────────────────────────────────────────

async function getQueue() {
  const res = await ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "main" } }));
  return ok({ movieIds: res.Item?.movieIds || [] });
}
async function addToQueue(event) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const { movieId } = JSON.parse(event.body || "{}");
  if (!movieId) return err(400, "movieId required");
  const res      = await ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "main" } }));
  const movieIds = res.Item?.movieIds || [];
  if (movieIds.includes(movieId)) return err(409, "Already in queue");
  const updated = [...movieIds, movieId];
  await ddb.send(new PutCommand({ TableName: "queue", Item: { queueId: "main", movieIds: updated } }));
  return ok({ movieIds: updated });
}
async function removeFromQueue(event, movieId) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const res      = await ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "main" } }));
  const movieIds = (res.Item?.movieIds || []).filter(id => id !== movieId);
  await ddb.send(new PutCommand({ TableName: "queue", Item: { queueId: "main", movieIds } }));
  return ok({ movieIds });
}
async function reorderQueue(event) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const { movieIds } = JSON.parse(event.body || "{}");
  if (!Array.isArray(movieIds)) return err(400, "movieIds array required");
  await ddb.send(new PutCommand({ TableName: "queue", Item: { queueId: "main", movieIds } }));
  return ok({ movieIds });
}

// ── Watched ───────────────────────────────────────────────────────────────────

async function getWatched() {
  const res = await ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "watched" } }));
  return ok({ movieIds: res.Item?.movieIds || [], watchedDates: res.Item?.watchedDates || {} });
}

async function addToWatched(event) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const { movieId, watchedAt } = JSON.parse(event.body || "{}");
  if (!movieId) return err(400, "movieId required");
  const [watchedRes, queueRes] = await Promise.all([
    ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "watched" } })),
    ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "main" } })),
  ]);
  const watchedIds   = [movieId, ...(watchedRes.Item?.movieIds || []).filter(id => id !== movieId)];
  const watchedDates = { ...(watchedRes.Item?.watchedDates || {}), [movieId]: watchedAt || new Date().toISOString() };
  const queueIds     = (queueRes.Item?.movieIds || []).filter(id => id !== movieId);
  await Promise.all([
    ddb.send(new PutCommand({ TableName: "queue", Item: { queueId: "watched", movieIds: watchedIds, watchedDates } })),
    ddb.send(new PutCommand({ TableName: "queue", Item: { queueId: "main",    movieIds: queueIds  } })),
  ]);
  return ok({ movieIds: watchedIds, queueIds, watchedDates });
}

async function updateWatchedDate(event, movieId) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const { watchedAt } = JSON.parse(event.body || "{}");
  if (!watchedAt) return err(400, "watchedAt required");
  const res = await ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "watched" } }));
  if (!(res.Item?.movieIds || []).includes(movieId)) return err(404, "Movie not in watched list");
  const watchedDates = { ...(res.Item?.watchedDates || {}), [movieId]: watchedAt };
  await ddb.send(new PutCommand({ TableName: "queue", Item: { ...res.Item, watchedDates } }));
  return ok({ watchedDates });
}

async function removeFromWatched(event, movieId) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const res = await ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "watched" } }));
  const movieIds     = (res.Item?.movieIds || []).filter(id => id !== movieId);
  const watchedDates = { ...(res.Item?.watchedDates || {}) };
  delete watchedDates[movieId];
  await ddb.send(new PutCommand({ TableName: "queue", Item: { queueId: "watched", movieIds, watchedDates } }));
  return ok({ movieIds, watchedDates });
}

// ── Lists ─────────────────────────────────────────────────────────────────────

async function getLists() {
  const [listsRes, orderRes] = await Promise.all([
    ddb.send(new ScanCommand({ TableName: "lists" })),
    ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "listOrder" } })),
  ]);
  const allLists = listsRes.Items || [];
  const order    = orderRes.Item?.listIds || [];
  const ordered  = [
    ...order.map(id => allLists.find(l => l.listId === id)).filter(Boolean),
    ...allLists.filter(l => !order.includes(l.listId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  ];
  return ok({ lists: ordered, listOrder: order });
}

async function createList(event) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const { title, description = "", movieId } = JSON.parse(event.body || "{}");
  if (!title?.trim()) return err(400, "title is required");
  const listId = crypto.randomUUID();
  const list   = { listId, title: title.trim(), description: description.trim(), createdBy: username, createdAt: new Date().toISOString(), movieIds: movieId ? [movieId] : [] };
  await ddb.send(new PutCommand({ TableName: "lists", Item: list }));
  const orderRes = await ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "listOrder" } }));
  const listIds  = [listId, ...(orderRes.Item?.listIds || [])];
  await ddb.send(new PutCommand({ TableName: "queue", Item: { queueId: "listOrder", listIds } }));
  return created({ list, listOrder: listIds });
}

async function updateList(event, listId) {
  if (!getUser(event)) return err(401, "Login required");
  const { title, description } = JSON.parse(event.body || "{}");
  await ddb.send(new UpdateCommand({ TableName: "lists", Key: { listId }, UpdateExpression: "SET #t = :title, description = :desc", ExpressionAttributeNames: { "#t": "title" }, ExpressionAttributeValues: { ":title": title?.trim() || "Untitled", ":desc": description?.trim() || "" } }));
  return ok({ updated: true });
}

async function deleteList(event, listId) {
  if (!getUser(event)) return err(401, "Login required");
  await ddb.send(new DeleteCommand({ TableName: "lists", Key: { listId } }));
  const orderRes = await ddb.send(new GetCommand({ TableName: "queue", Key: { queueId: "listOrder" } }));
  const listIds  = (orderRes.Item?.listIds || []).filter(id => id !== listId);
  await ddb.send(new PutCommand({ TableName: "queue", Item: { queueId: "listOrder", listIds } }));
  return ok({ deleted: true });
}

async function addMovieToList(event, listId) {
  if (!getUser(event)) return err(401, "Login required");
  const { movieId } = JSON.parse(event.body || "{}");
  if (!movieId) return err(400, "movieId required");
  const listRes = await ddb.send(new GetCommand({ TableName: "lists", Key: { listId } }));
  if (!listRes.Item) return err(404, "List not found");
  const movieIds = listRes.Item.movieIds || [];
  if (movieIds.includes(movieId)) return err(409, "Movie already in list");
  if (movieIds.length >= 50) return err(400, "List is full (50 movie limit)");
  const updated = [...movieIds, movieId];
  await ddb.send(new UpdateCommand({ TableName: "lists", Key: { listId }, UpdateExpression: "SET movieIds = :ids", ExpressionAttributeValues: { ":ids": updated } }));
  return ok({ movieIds: updated });
}

async function removeMovieFromList(event, listId, movieId) {
  if (!getUser(event)) return err(401, "Login required");
  const listRes = await ddb.send(new GetCommand({ TableName: "lists", Key: { listId } }));
  if (!listRes.Item) return err(404, "List not found");
  const movieIds = (listRes.Item.movieIds || []).filter(id => id !== movieId);
  await ddb.send(new UpdateCommand({ TableName: "lists", Key: { listId }, UpdateExpression: "SET movieIds = :ids", ExpressionAttributeValues: { ":ids": movieIds } }));
  return ok({ movieIds });
}

async function reorderListMovies(event, listId) {
  if (!getUser(event)) return err(401, "Login required");
  const { movieIds } = JSON.parse(event.body || "{}");
  if (!Array.isArray(movieIds)) return err(400, "movieIds array required");
  await ddb.send(new UpdateCommand({ TableName: "lists", Key: { listId }, UpdateExpression: "SET movieIds = :ids", ExpressionAttributeValues: { ":ids": movieIds } }));
  return ok({ movieIds });
}

async function reorderLists(event) {
  if (!getUser(event)) return err(401, "Login required");
  const { listIds } = JSON.parse(event.body || "{}");
  if (!Array.isArray(listIds)) return err(400, "listIds array required");
  await ddb.send(new PutCommand({ TableName: "queue", Item: { queueId: "listOrder", listIds } }));
  return ok({ listIds });
}

// ── Comments ──────────────────────────────────────────────────────────────────

async function getComments(movieId) {
  const res   = await ddb.send(new QueryCommand({ TableName: "comments", KeyConditionExpression: "movieId = :mid", ExpressionAttributeValues: { ":mid": movieId } }));
  const items = (res.Items || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return ok(items);
}
async function addComment(event, movieId) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const { text = "" } = JSON.parse(event.body || "{}");
  if (!text.trim()) return err(400, "text is required");
  const comment = { movieId, commentId: crypto.randomUUID(), username, text: text.trim(), createdAt: new Date().toISOString(), editedAt: null };
  await ddb.send(new PutCommand({ TableName: "comments", Item: comment }));
  return created(comment);
}
async function editComment(event, movieId, commentId) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const { text = "" } = JSON.parse(event.body || "{}");
  if (!text.trim()) return err(400, "text is required");
  const existing = await ddb.send(new GetCommand({ TableName: "comments", Key: { movieId, commentId } }));
  if (!existing.Item) return err(404, "Comment not found");
  if (existing.Item.username !== username) return err(403, "Cannot edit someone else's comment");
  const now = new Date().toISOString();
  await ddb.send(new UpdateCommand({ TableName: "comments", Key: { movieId, commentId }, UpdateExpression: "SET #t = :text, editedAt = :now", ExpressionAttributeNames: { "#t": "text" }, ExpressionAttributeValues: { ":text": text.trim(), ":now": now } }));
  return ok({ ...existing.Item, text: text.trim(), editedAt: now });
}
async function deleteComment(event, movieId, commentId) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const existing = await ddb.send(new GetCommand({ TableName: "comments", Key: { movieId, commentId } }));
  if (!existing.Item) return err(404, "Comment not found");
  if (existing.Item.username !== username) return err(403, "Cannot delete someone else's comment");
  await ddb.send(new DeleteCommand({ TableName: "comments", Key: { movieId, commentId } }));
  return ok({ deleted: true });
}

// ── Chat ──────────────────────────────────────────────────────────────────

async function getChat(event) {
  const before = event.queryStringParameters?.before;
  const limit  = 50;
  const params = { TableName: "chat" };
  if (before) {
    params.FilterExpression          = "createdAt < :before";
    params.ExpressionAttributeValues = { ":before": before };
  }
  const res      = await ddb.send(new ScanCommand(params));
  const all      = (res.Items || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const messages = all.slice(-limit);
  const hasMore  = all.length > limit;
  return ok({ messages, hasMore });
}

async function sendChat(event) {
  const username = getUser(event);
  if (!username) return err(401, "Login required");
  const { text = "" } = JSON.parse(event.body || "{}");
  if (!text.trim()) return err(400, "text required");
  if (text.trim().length > 500) return err(400, "Message too long");
  const msg = {
    messageId: crypto.randomUUID(),
    username,
    text:      text.trim(),
    createdAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: "chat", Item: msg }));
  return created(msg);
}

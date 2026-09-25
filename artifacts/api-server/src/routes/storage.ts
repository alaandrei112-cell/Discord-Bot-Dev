import { Readable } from "node:stream";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import {
  assertCsrf,
  assertGuildAccess,
  assertMutationRateLimit,
  ModerationAuthError,
  requireSession,
  type AuthenticatedRequest,
} from "../moderation/auth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();
const imageUploadSchema = z.object({
  guildId: z.string().regex(/^\d{5,25}$/),
  name: z.string().trim().min(1).max(200),
  size: z.number().int().min(1).max(10 * 1024 * 1024),
  contentType: z.string().regex(/^image\/(?:jpeg|png|gif|webp)$/),
}).strict();

const asyncRoute = (handler: (req: AuthenticatedRequest, res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    void handler(req as AuthenticatedRequest, res).catch((error: unknown) => {
      if (error instanceof ModerationAuthError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      next(error);
    });
  };

const requestUploadUrl = asyncRoute(async (req, res) => {
  const session = await requireSession(req);
  assertCsrf(req, session);
  assertMutationRateLimit(session);
  const parsed = imageUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Sunt acceptate imagini PNG, JPG, GIF sau WEBP de maximum 10 MB." });
    return;
  }
  const access = await assertGuildAccess(parsed.data.guildId, session.userId, "config");
  if (access !== "owner") throw new ModerationAuthError(403, "Only the guild owner may upload ticket assets");
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  res.json({ uploadURL, objectPath, metadata: parsed.data });
});

// The moderation session cookie is deliberately scoped to /api/moderation.
// Keep the upload entry point under that path so authenticated panel requests
// include the cookie; the legacy /api/storage path remains for compatible clients.
router.post("/storage/uploads/request-url", requestUploadUrl);
router.post("/moderation/storage/uploads/request-url", requestUploadUrl);

router.get("/storage/objects/*path", asyncRoute(async (req, res) => {
  try {
    const rawPath = req.params.path;
    const suffix = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    const response = await storage.downloadObject(await storage.getObjectEntityFile(`/objects/${suffix}`));
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Imaginea nu există." });
      return;
    }
    req.log?.error?.({ err: error }, "Could not serve ticket image");
    res.status(500).json({ error: "Imaginea nu a putut fi încărcată." });
  }
}));

export default router;
import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Discord guild emoji images are at most 256 KiB; base64 encoding adds ~33%.
// Keep this deliberately small while allowing that one authenticated payload.
app.use(express.json({ limit: "400kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const safeBodyError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    res.status(413).json({ error: "Request body is too large" });
    return;
  }
  next(error);
};
app.use(safeBodyError);

export default app;

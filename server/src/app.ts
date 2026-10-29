import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requireAuth } from "./auth.js";
import { config } from "./config.js";
import { errorHandler, HttpError } from "./errors.js";
import { router } from "./routes.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: config.CLIENT_ORIGIN }));
app.use(express.json({ limit: "32kb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", (req, _res, next) => {
  if (req.path === "/auth/login" || req.path === "/health") {
    next();
    return;
  }
  requireAuth(req, _res, next);
});
app.use("/api", (req, res, next) => {
  void router(req, res, (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }
    next(new HttpError(404, "That endpoint doesn't exist."));
  });
});
app.use(errorHandler);

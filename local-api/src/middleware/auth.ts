import type { Request, Response, NextFunction } from "express";

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = process.env.DANNY_LOCAL_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "DANNY_LOCAL_API_KEY not configured on server" });
    return;
  }

  const provided = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");

  if (!provided || provided !== apiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

import express from "express";
import { apiKeyAuth } from "./middleware/auth.js";
import claudeRouter from "./routes/claude.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3939", 10);

app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/claude", apiKeyAuth, claudeRouter);

app.listen(PORT, () => {
  console.log(`Local API running on http://localhost:${PORT}`);
});

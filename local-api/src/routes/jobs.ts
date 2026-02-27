import { Router } from "express";
import linkedinAudit from "../jobs/linkedin-audit.js";
import linkedinHumanizer from "../jobs/linkedin-humanizer.js";
import gtmStrategy from "../jobs/gtm-strategy.js";
import sentimentAnalysis from "../jobs/sentiment-analysis.js";
import test from "../jobs/test.js";

const router = Router();

router.use(linkedinAudit);
router.use(linkedinHumanizer);
router.use(gtmStrategy);
router.use(sentimentAnalysis);
router.use(test);

export default router;

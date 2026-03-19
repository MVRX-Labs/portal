# Lead List Generation: Executive Summary

**Date:** 2026-03-15 | **For:** MVRX Labs service offering decision

Full reports: [Tools & Economics](./lead-list-generation-research.md) | [AI Deep Dive](./ai-lead-list-generation-research.md)

---

## The Opportunity

The B2B lead generation services market is $3-5.6B (2025), growing at 12-17% CAGR. Average B2B cost per lead is ~$214, up 7.6% YoY. Agencies charge $2,500-$25,000+/month with 50-80% gross margins. MVRX Labs already has the foundation (Trigger.dev, Apify, HeyReach integration roadmap) — lead list generation is a natural adjacent service.

## Three Ways to Build Lead Lists

| Approach                                                          | Speed                  | Cost/Lead   | Quality    | Differentiation                   |
| ----------------------------------------------------------------- | ---------------------- | ----------- | ---------- | --------------------------------- |
| **Database pull** (Apollo, ZoomInfo)                              | Minutes                | $0.02-$0.15 | Low-Medium | None — everyone has the same data |
| **Manual research** (VAs, $3-10/hr)                               | 40-70 hrs per 1K leads | $0.20-$0.70 | High       | Slow, doesn't scale               |
| **AI-augmented** (LLM research + waterfall enrichment + human QA) | Hours                  | $0.25-$1.00 | High       | Best economics — this is the play |

## Key Tools (What to Use)

**Must-haves for MVRX stack (~$650-$1,300/mo):**

| Tool                     | Cost         | Why                                                              |
| ------------------------ | ------------ | ---------------------------------------------------------------- |
| Apollo.io                | $79-$119/mo  | Best-value contact database (275M+ contacts)                     |
| Clay                     | $185-$495/mo | Waterfall enrichment across 150+ providers, Claygent AI research |
| LinkedIn Sales Navigator | $100-$120/mo | ICP search + prospecting                                         |
| Evaboot                  | $29-$49/mo   | Clean Sales Nav exports at ~$0.02/lead                           |
| ZeroBounce/ClearBounce   | $16-$50/mo   | Email verification (98%+ accuracy)                               |
| Claude API + Firecrawl   | $50-$200/mo  | AI research + web scraping for deep enrichment                   |
| Apify + Trigger.dev      | Existing     | Custom scraping + workflow orchestration                         |

**For UK leads:** Add Cognism (~$15K+/yr) — best GDPR-compliant EU data with phone-verified mobiles.

**Skip (for now):** ZoomInfo ($15K-$60K/yr — overkill), Bombora/6sense intent data ($30K-$200K/yr — enterprise only).

## AI: What Works and What Doesn't

**Works well today:**

- Waterfall enrichment (Clay queries multiple providers → 85-91% email match rates)
- AI research agents extracting structured data from company websites (Firecrawl + Claude)
- ICP scoring and lead prioritization using LLMs
- Trigger event monitoring (funding, hiring, job changes)

**Doesn't work (yet):**

- Fully autonomous AI SDRs ($12K-$60K/yr, mixed results — one company spent $42K, closed 4 deals from 2,847 "leads")
- Pure AI list building without human QA (hallucination risk on contact data)
- Replacing human judgment on nuanced qualification

**The winning formula:** AI does 80% of research and enrichment. Humans define ICP, do QA, and make judgment calls. "AI-researched, human-verified" is the positioning.

## Recommended Service Tiers

| Tier                     | Price          | What's Included                                                                                             | Margin |
| ------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| **List Build**           | $1,500-$3,000  | 500-2K leads, database + waterfall enrichment, email verified, basic firmographics. 3-5 day turnaround      | 70-80% |
| **Research List**        | $3,000-$7,500  | Above + AI company research (tech stack, news, pain points), personalization hooks, lead scoring. 5-10 days | 60-70% |
| **Intelligence Package** | $7,500-$15,000 | Above + trigger event monitoring, intent signals, competitive intel, outreach angles, ongoing refresh       | 50-65% |

**Upsell path:** List building → outbound sequences ($5K-$15K/mo retainer) → appointment setting ($150-$600/meeting). This connects directly to the existing HeyReach/outbound roadmap.

## Unit Economics (1,000-Lead Engagement)

| Item                                    | Cost              |
| --------------------------------------- | ----------------- |
| Tool credits (Apollo, Clay, enrichment) | $200-$500         |
| AI API costs (Claude, Firecrawl)        | $50-$100          |
| Email verification                      | $8-$16            |
| Human QA (4-8 hours)                    | $100-$200         |
| **Total COGS**                          | **$358-$816**     |
| **Sell at $2-5/lead**                   | **$2,000-$5,000** |
| **Gross margin**                        | **60-85%**        |

## Compliance (Quick Reference)

- **US:** B2B cold email is legal (CAN-SPAM). Include physical address + unsubscribe. No consent needed.
- **UK:** Legal under "legitimate interest" for corporate email addresses. Must document your basis, offer opt-out, honor deletion requests in 30 days. Sole traders need consent. Use Cognism for compliant data.

## Key Risks

| Risk                            | Mitigation                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------ |
| AI hallucinating contact data   | Human QA + email verification + cross-reference databases                      |
| Clay credit costs escalating    | Build custom Trigger.dev waterfall workflows over time                         |
| Data goes stale (2.1%/mo decay) | Use within 30 days. Sell refresh packages as recurring revenue                 |
| Commoditization                 | Differentiate on research depth + personalization hooks, not just contact data |

## Performance SLAs

- Email deliverability: 95%+ | Bounce rate: <2% | Email match rate: 85-91%
- ICP fit: 70%+ of delivered leads | Data freshness: <30 days
- Reply rates (with good targeting): 5-8% standard, 10-15% with intent signals

## Bottom Line

Lead list generation fits naturally with MVRX Labs' existing tooling and GTM positioning. The AI-augmented approach (Clay + custom Trigger.dev workflows + human QA) offers the best margin-to-differentiation ratio. Start with Clay for speed-to-market, build proprietary automation over time, and use list building as a wedge to upsell into full outbound retainers.

/**
 * Legacy Slack interactivity endpoint.
 *
 * History:
 * - This route originally handled all engagement Slack actions (button clicks
 *   on outbound engagement cards posted to Slack channels).
 * - When Twitter engagement was added alongside LinkedIn engagement, the route
 *   was renamed to /api/linkedin-engagement-slack and a separate
 *   /api/twitter-engagement-slack was created for the Twitter flow.
 * - This legacy route remains so that Slack apps whose interactivity URL still
 *   points to /api/engagement-slack continue to work without reconfiguration.
 *   It simply re-exports the LinkedIn engagement handler, since that was the
 *   only behaviour the old route ever had.
 *
 * If you've updated your Slack app's Request URL to /api/linkedin-engagement-slack,
 * this file can safely be deleted.
 */

export { POST } from "@/app/api/linkedin-engagement-slack/route";

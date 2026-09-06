import { percentChange } from "./range";
import type { OverviewMetrics, NodeStat, OptionStat } from "./queries";
import type { CampaignStat, FormFieldStat, DeviceStat } from "./breakdowns";

/**
 * Turns computed metrics into plain-English findings.
 *
 * Three rules govern everything here:
 *
 *  1. Every sentence is built from a number that was already calculated by the
 *     analytics engine. Nothing in this file queries, estimates, infers or
 *     rounds its way to a new figure.
 *  2. Nothing is said about a sample too small to mean anything. A 100%
 *     drop-off across two visitors is not a finding, it is two people, and
 *     presenting it as a finding sends clients off rewriting a working flow.
 *  3. Findings state what is true and, where there is an obvious action, what
 *     to do. They never speculate about causes the data cannot show.
 */

export type InsightTone = "good" | "warning" | "info";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  /** Present only where the data supports a concrete next step. */
  recommendation?: string;
}

/**
 * Minimum sample sizes.
 *
 * Set deliberately, not arbitrarily: below these the percentages swing wildly
 * on a single visitor and the advice becomes actively misleading.
 */
const MIN = {
  conversations: 20,
  nodeEntries: 25,
  optionClicks: 20,
  campaignConversations: 15,
  formReached: 20,
  deviceConversations: 15,
};

const pct = (value: number) => `${value.toFixed(1)}%`;
const count = (value: number) => value.toLocaleString();

export interface InsightInput {
  metrics: OverviewMetrics;
  previous?: OverviewMetrics | null;
  nodes?: NodeStat[];
  options?: OptionStat[];
  campaigns?: CampaignStat[];
  formFields?: FormFieldStat[];
  devices?: DeviceStat[];
}

export function buildInsights(input: InsightInput): Insight[] {
  const { metrics, previous, nodes = [], options = [], campaigns = [], formFields = [], devices = [] } = input;
  const insights: Insight[] = [];

  // --- Engagement ----------------------------------------------------------
  if (metrics.chatbotOpens >= MIN.conversations) {
    insights.push({
      id: "engagement",
      tone: metrics.engagementRate >= 50 ? "good" : "info",
      title: "Engagement",
      detail:
        `Your chatbot was opened ${count(metrics.chatbotOpens)} times and ` +
        `${count(metrics.conversationsStarted)} of those started a conversation, ` +
        `an engagement rate of ${pct(metrics.engagementRate)}.`,
    });
  }

  // --- Conversion, and whether it moved ------------------------------------
  if (metrics.conversationsStarted >= MIN.conversations) {
    insights.push({
      id: "conversion",
      tone: metrics.conversionRate >= 15 ? "good" : "info",
      title: "Conversion",
      detail:
        `${count(metrics.totalLeads)} leads came from ${count(metrics.conversationsStarted)} conversations, ` +
        `a conversion rate of ${pct(metrics.conversionRate)}.`,
    });

    if (previous && previous.conversationsStarted >= MIN.conversations) {
      const change = percentChange(metrics.conversionRate, previous.conversionRate);
      if (change !== null && Math.abs(change) >= 5) {
        insights.push({
          id: "conversion_trend",
          tone: change > 0 ? "good" : "warning",
          title: change > 0 ? "Conversion is up" : "Conversion is down",
          detail:
            `Conversion ${change > 0 ? "rose" : "fell"} from ${pct(previous.conversionRate)} to ` +
            `${pct(metrics.conversionRate)} compared with the previous period, ` +
            `a change of ${Math.abs(change).toFixed(1)}%.`,
        });
      }
    }
  }

  // --- The worst leak in the flow ------------------------------------------
  const leakiest = nodes
    .filter((n) => n.entered >= MIN.nodeEntries)
    .sort((a, b) => b.dropOffRate - a.dropOffRate)[0];
  if (leakiest && leakiest.dropOffRate >= 25) {
    insights.push({
      id: "dropoff",
      tone: "warning",
      title: "Highest drop-off step",
      detail:
        `"${leakiest.label}" loses ${pct(leakiest.dropOffRate)} of the people who reach it — ` +
        `${count(leakiest.dropped)} of ${count(leakiest.entered)} left without completing it.`,
      recommendation:
        "This is the single biggest leak in the flow. Consider making the step optional, " +
        "asking for less at once, or moving it later once the visitor is more invested.",
    });
  }

  // --- What visitors actually want -----------------------------------------
  const topOption = options.filter((o) => o.clicks >= MIN.optionClicks)[0];
  if (topOption) {
    insights.push({
      id: "top_option",
      tone: "info",
      title: "Most selected option",
      detail:
        `"${topOption.label}" is the most chosen option, accounting for ${pct(topOption.share)} ` +
        `of all tracked button clicks (${count(topOption.clicks)} clicks).`,
      recommendation:
        topOption.conversionAfter > 0
          ? `Visitors choosing it convert at ${pct(topOption.conversionAfter)}. It is worth giving this path more prominence.`
          : undefined,
    });
  }

  // --- Campaigns, best and worst -------------------------------------------
  const ranked = campaigns
    .filter((c) => c.conversations >= MIN.campaignConversations)
    .sort((a, b) => b.conversionRate - a.conversionRate);
  if (ranked.length) {
    const best = ranked[0];
    insights.push({
      id: "best_campaign",
      tone: "good",
      title: "Best-performing campaign",
      detail:
        `"${best.name}" has the highest lead conversion rate at ${pct(best.conversionRate)}, ` +
        `producing ${count(best.leads)} leads from ${count(best.conversations)} conversations.`,
    });

    if (ranked.length >= 2) {
      const worst = ranked[ranked.length - 1];
      // Only worth saying when the gap is big enough to act on.
      if (best.conversionRate - worst.conversionRate >= 10) {
        insights.push({
          id: "worst_campaign",
          tone: "warning",
          title: "Lowest-performing campaign",
          detail:
            `"${worst.name}" converts at ${pct(worst.conversionRate)}, ` +
            `against ${pct(best.conversionRate)} for "${best.name}".`,
          recommendation: `Compare the audience and the message of "${worst.name}" against "${best.name}".`,
        });
      }
    }
  }

  // --- The form field people give up on ------------------------------------
  const worstField = formFields.filter((f) => f.reached >= MIN.formReached)[0];
  if (worstField && worstField.completionRate < 70) {
    insights.push({
      id: "worst_field",
      tone: "warning",
      title: "Weakest form field",
      detail:
        `"${worstField.label}" is completed by only ${pct(worstField.completionRate)} of the ` +
        `${count(worstField.reached)} people who reach it — ${count(worstField.abandoned)} abandon there.`,
      recommendation:
        "Fields asking for a phone number or budget are the usual culprits. Making this one optional " +
        "often recovers more leads than it costs in data.",
    });
  }

  // --- Device gap -----------------------------------------------------------
  const comparable = devices.filter((d) => d.conversations >= MIN.deviceConversations && d.device !== "Unknown");
  if (comparable.length >= 2) {
    const sorted = [...comparable].sort((a, b) => b.conversionRate - a.conversionRate);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.conversionRate - worst.conversionRate >= 10) {
      insights.push({
        id: "device_gap",
        tone: "warning",
        title: "Conversion differs by device",
        detail:
          `${worst.device} converts at ${pct(worst.conversionRate)} against ${pct(best.conversionRate)} on ${best.device}.`,
        recommendation: `Open the chatbot on ${worst.device.toLowerCase()} and walk the flow yourself — a gap this size is usually a layout or input problem.`,
      });
    }
  }

  // --- Nothing to say is itself worth saying --------------------------------
  if (!insights.length) {
    insights.push({
      id: "insufficient_data",
      tone: "info",
      title: "Not enough data yet",
      detail:
        `This period recorded ${count(metrics.conversationsStarted)} conversations. ` +
        "Findings appear once there is enough activity for the percentages to be meaningful.",
      recommendation: "Share your chatbot link or launch a campaign to start collecting data.",
    });
  }

  return insights;
}

/**
 * The "what should I improve?" list — the subset of findings that name an
 * action, in the order they are worth doing.
 */
export function buildRecommendations(insights: Insight[]): Insight[] {
  const priority: Record<InsightTone, number> = { warning: 0, info: 1, good: 2 };
  return insights
    .filter((i) => i.recommendation)
    .sort((a, b) => priority[a.tone] - priority[b.tone]);
}

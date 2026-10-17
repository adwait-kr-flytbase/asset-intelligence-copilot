import { metricCatalogue } from '../evidence/metrics.js';

export type MetricName = keyof typeof metricCatalogue;
export type UnsupportedQuantity = 'oil-volume' | 'production-forecast';
export type ExplanationTopic =
  | MetricName
  | UnsupportedQuantity
  | 'available-capabilities'
  | 'missing-asset'
  | 'missing-window'
  | 'missing-measure';
export class UnsupportedQuantityError extends Error {}
export function isMeasureClarification(messages: { role: string; content: string }[]) {
  return (
    /\b(?:is that|does that|is it|does it)\b/i.test(
      messages.filter((m) => m.role === 'user').at(-1)?.content ?? '',
    ) && /downtime|non-producing inspection/i.test(messages.map((m) => m.content).join('\n'))
  );
}

/** This deployment has inspection classifications, not metered production or a forecast model. */
export function unsupportedProductionRequest(
  messages: { role: string; content: string }[],
): UnsupportedQuantity | undefined {
  const users = messages.filter((message) => message.role === 'user');
  const latest = users.at(-1)?.content ?? '';
  // Mixed supported/unsupported requests need per-part planning and semantic review.
  if (
    /\b(?:and|also|plus)\b.{0,100}\b(?:map|location|temperature|repair|spill|downtime|status|inspection)\w*\b/i.test(
      latest,
    )
  )
    return undefined;
  if (isMeasureClarification(messages) && /oil|volume|barrels|produced/i.test(latest))
    return undefined;
  const direct = (text: string): UnsupportedQuantity | undefined => {
    if (
      /\b(?:forecast|predict)\w*\b.*\b(?:production|output|oil)\b|\bwill\b.*\bproduc\w*\b.*\b(?:oil|most|barrels)\b/i.test(
        text,
      )
    )
      return 'production-forecast';
    if (
      /\b(?:most|more|highest|largest|total|volume|amount|barrels|bbl|rate)\b.{0,70}\b(?:oil|produced|production|output)\b|\b(?:oil|production)\s+(?:volume|rate|output)\b|\bproduc\w*\b.{0,45}\b(?:most|barrels|bbl)\b/i.test(
        text,
      ) &&
      !/\b(?:spill|leak)\w*\b/i.test(text)
    )
      return 'oil-volume';
    return undefined;
  };
  const quantity = direct(latest);
  if (quantity) return quantity;
  // Resolve terse count/correction follow-ups against prior USER intent, never an erroneous assistant metric.
  if (
    /\b(?:just one|give me one|one well|looks? (?:wrong|incorrect)|that(?:'s| is) (?:wrong|incorrect))\b/i.test(
      latest,
    ) &&
    !/\b(?:status|temperature|repair|spill|downtime|inspect|chart|map)\w*\b/i.test(latest)
  ) {
    for (const message of users.slice(0, -1).reverse()) {
      const prior = direct(message.content);
      if (prior) return prior;
      if (/\b(?:status|temperature|repair|spill|downtime|inspect)\w*\b/i.test(message.content))
        break;
    }
  }
  return undefined;
}

export function explanationText(
  topic: ExplanationTopic,
  conversation: { role: string; content: string }[] = [],
): string {
  if (topic === 'missing-asset')
    return 'Which well or area do you mean? Give me its name or ID so I can retrieve the correct location or records.';
  if (topic === 'missing-window')
    return 'What date range should I use? A start and end date will keep the calculation and its evidence in the scope you intend.';
  if (topic === 'missing-measure')
    return 'Which measure do you want to compare: producing status, temperature, inspection-derived downtime, spills, repair costs, or repeat repairs? They measure different things.';
  if (topic === 'oil-volume' && isMeasureClarification(conversation))
    return 'No. That figure is inspection-derived downtime, expressed in days, not an amount of oil produced. It estimates downtime from weekly non-producing inspections; it does not measure barrels or production rate. Metered production-volume records would be needed to calculate oil output.';
  if (topic === 'oil-volume')
    return 'The available tools do not measure oil production volume or rate, so I cannot calculate or rank oil output. The supported production calculation classifies a well as producing or not producing from inspection temperatures. Downtime and temperature differences cannot substitute for barrels produced. A comparison requires metered production volumes per well over the same period.';
  if (topic === 'production-forecast')
    return 'I cannot forecast which well will produce the most oil with the available tools. Inspection temperatures indicate producing or not producing at an observation; they do not measure oil output. A forecast requires production-volume history and a supported forecasting method. Selecting a well from temperature or downtime would be unsupported.';
  if (topic === 'available-capabilities')
    return 'I can check inspection-based producing status, temperature history, inspection-derived downtime, corrected spill records, recorded repair costs, repeat repairs, and linked reports/procedures. I cannot measure or forecast oil output from these tools. Tell me which of those supported measures you want to compare.';
  if (topic === 'downtime')
    return 'Inspection-derived downtime is an estimate based on weekly inspections: each inspection classified as not producing contributes 7 days. Add those weekly increments to get the reported estimate. This does not prove the well was continuously shut in for that many days: it could stop or restart between inspections. It is separate from repair duration and cannot establish how much oil a well produced.';
  if (topic === 'current-status')
    return 'Producing status is calculated from the latest inspection: subtract ambient temperature from wellhead temperature, then compare that difference with the threshold in the applicable well-type manual. This is a classification at the inspection time, not live telemetry, a production rate, or oil volume. Missing measurements or an applicable rule make the classification unknown.';
  if (topic === 'temperature-history')
    return 'Temperature difference means wellhead temperature minus the surrounding air (ambient) temperature, expressed in degrees Celsius. A positive difference means the wellhead is warmer than the air. Each chart point is one inspection reading, not continuous telemetry. The difference is compared with the well-type manual threshold to classify producing status; it does not measure how much oil was produced.';
  return `${metricCatalogue[topic].definition} This explains the calculation; it is not a new measurement or a refresh of a prior result.`;
}

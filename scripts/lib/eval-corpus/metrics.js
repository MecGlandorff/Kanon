export function withMetrics(
  score,
  falsePositiveCost,
  falseNegativeCost
) {
  const predicted = score.tp + score.fp;
  const expected = score.tp + score.fn;
  const precision =
    predicted > 0 ? score.tp / predicted : expected === 0 ? 1 : 0;
  const recall = expected > 0 ? score.tp / expected : 1;
  return {
    ...score,
    precision,
    recall,
    precision_interval: wilsonInterval(score.tp, predicted),
    recall_interval: wilsonInterval(score.tp, expected),
    weighted_error:
      falsePositiveCost * score.fp +
      falseNegativeCost * score.fn
  };
}

export function sumScores(scores) {
  return scores.reduce(
    (total, score) => ({
      tp: total.tp + (score?.tp || 0),
      fp: total.fp + (score?.fp || 0),
      fn: total.fn + (score?.fn || 0)
    }),
    { tp: 0, fp: 0, fn: 0 }
  );
}

export function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export function wilsonInterval(successes, trials, z = 1.959964) {
  if (trials === 0) {
    return {
      confidence: 0.95,
      lower: 0,
      upper: 1,
      trials: 0
    };
  }
  const proportion = successes / trials;
  const zSquared = z * z;
  const denominator = 1 + zSquared / trials;
  const center =
    (proportion + zSquared / (2 * trials)) / denominator;
  const margin =
    (
      z *
      Math.sqrt(
        (proportion * (1 - proportion) + zSquared / (4 * trials)) /
          trials
      )
    ) / denominator;
  return {
    confidence: 0.95,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    trials
  };
}

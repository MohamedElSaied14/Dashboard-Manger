/**
 * Pulls the first JSON object out of a model response, tolerating markdown code fences,
 * leading/trailing prose, etc. Throws if nothing parseable is found.
 */
export function extractJsonObject(text: string): any {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1] : text;
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : candidate;
  return JSON.parse(jsonText);
}

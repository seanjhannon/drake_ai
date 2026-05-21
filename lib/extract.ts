import { completePrompt } from '@/lib/llm';
import type { Mention } from '@/lib/results';

/** Max lyric chars sent to the model (tune if bars are cut off). */
export const LYRICS_CHAR_LIMIT = 3500;

/**
 * Extraction agent instructions — edit here to refine figure detection.
 */
export const EXTRACT_INSTRUCTIONS = `You are analyzing Drake lyrics to catalog every named real-world person he references.

Rules:
- "figure": use the person's full or commonly known name (e.g. "Lil Wayne" not "Wayne", "21 Savage" not "Savage", "Noah '40' Shebib" for Forty/40, "Oliver El-Khatib" for Oliver)
- "bar": the exact single lyric line containing the mention
- Include: producers, collaborators, rivals, family, OVO crew (Chubbs, Niko, etc.), any real named person
- Exclude: generic terms ("haters", "the label", "my guys", "the plug", unnamed groups)
- Return ONLY a valid JSON array, no markdown fences. Return [] if none found.`;

export function buildExtractPrompt(
  song: string,
  album: string,
  year: number,
  lyrics: string,
): string {
  const truncatedLyrics = lyrics.slice(0, LYRICS_CHAR_LIMIT);

  return `${EXTRACT_INSTRUCTIONS}

Song: "${song}" | Album: "${album}" | Year: ${year}

LYRICS:
${truncatedLyrics}

Return a JSON array. Each object:
- "figure": string
- "bar": string (one line)
- "song": "${song}"
- "album": "${album}"
- "year": ${year}`;
}

export async function extractFigures(
  song: string,
  album: string,
  year: number,
  lyrics: string,
): Promise<Mention[]> {
  const prompt = buildExtractPrompt(song, album, year, lyrics);
  const text = await completePrompt(prompt);

  try {
    const parsed = JSON.parse(text.trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return [];
  }
}

export function mentionKey(m: Mention): string {
  return `${m.figure}|||${m.bar}|||${m.song}`;
}

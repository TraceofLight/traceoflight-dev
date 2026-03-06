const DEFAULT_WORDS_PER_MINUTE = 200;

function markdownToPlainText(markdownSource = "") {
  return String(markdownSource)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~=-]+/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countReadingWords(markdownSource = "") {
  const plainText = markdownToPlainText(markdownSource);
  if (!plainText) {
    return 0;
  }
  return plainText.split(/\s+/).filter(Boolean).length;
}

export function estimateReadingMinutes(
  markdownSource = "",
  wordsPerMinute = DEFAULT_WORDS_PER_MINUTE,
) {
  const normalizedWordsPerMinute = Math.max(1, Math.floor(wordsPerMinute));
  const wordCount = countReadingWords(markdownSource);
  return Math.max(1, Math.ceil(wordCount / normalizedWordsPerMinute));
}

export function formatReadingTimeLabel(
  markdownSource = "",
  wordsPerMinute = DEFAULT_WORDS_PER_MINUTE,
) {
  return `${estimateReadingMinutes(markdownSource, wordsPerMinute)} min read`;
}

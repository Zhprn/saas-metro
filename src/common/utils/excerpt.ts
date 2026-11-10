export function generateExcerpt(text: string, wordLimit = 30): string {
  const plainText = text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const words = plainText.split(' ');
  return (
    words.slice(0, wordLimit).join(' ') +
    (words.length > wordLimit ? '...' : '')
  );
}

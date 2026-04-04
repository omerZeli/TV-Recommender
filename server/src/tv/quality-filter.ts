/**
 * Shared quality filter for TMDB TV show results.
 *
 * Shows from major markets get stricter thresholds because they accumulate
 * votes quickly, while niche / regional content uses relaxed limits so it
 * isn't unfairly hidden.
 */

const MAJOR_COUNTRIES = new Set([
  'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'KR', 'CN', 'IN',
  'BR', 'ES', 'MX', 'RU',
]);

const COMMON_LANGUAGES = new Set([
  'en', 'es', 'fr', 'de', 'ja', 'ko', 'zh', 'ru',
  'hi', 'ar',
]);

function isMajorMarket(show: any): boolean {
  const countries: string[] = show.origin_country ?? [];
  if (countries.some((c: string) => MAJOR_COUNTRIES.has(c.toUpperCase()))) {
    return true;
  }

  const lang: string = (show.original_language ?? '').toLowerCase();
  return COMMON_LANGUAGES.has(lang);
}

export function applyQualityFilter(shows: any[]): any[] {
  const seenIds = new Set<number>();

  return shows.filter((show) => {
    if (seenIds.has(show.id)) return false;
    seenIds.add(show.id);
    if (!show.poster_path) return false;

    const votes = show.vote_count ?? 0;
    const rating = show.vote_average ?? 0;

    if (isMajorMarket(show)) {
      return votes >= 30 && rating >= 4;
    }

    return true;
  });
}

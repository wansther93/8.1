import type { Anime } from '../types';
import { getAggregatedStreamingLinks, getAggregatedCharacters } from './multiApiAggregatorService';
import { searchAnimeMetadata, type AnimeStreamingLink, type AnimeCharacterItem } from './jikanService';
import { fetchAnimeThemesMedia, type AnimeThemeMedia } from './animeThemesService';
import { fetchFreshAnimeDetails, fetchOfficialAnimeTrailer } from './animeSyncService';
import { updateAnime } from './animeService';

export interface DynamicAnimeRichData {
  streamingLinks: AnimeStreamingLink[];
  characters: AnimeCharacterItem[];
  themes: AnimeThemeMedia[];
  trailerUrl?: string | null;
  bannerUrl?: string | null;
  mal_id?: number | null;
  synopsis?: string | null;
  cachedAt?: number;
}

const STORAGE_PREFIX = 'wanime_rich_meta_';
const RICH_DATA_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias para dados completos
const EMPTY_DATA_TTL = 2 * 60 * 60 * 1000; // 2 horas para dados vazios/incompletos

/**
 * Normaliza chave de identificação do anime para armazenamento local seguro
 */
export function getAnimeStorageKey(animeIdOrTitle: number | string): string {
  const clean = String(animeIdOrTitle).trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${STORAGE_PREFIX}${clean}`;
}

/**
 * Lê metadados ricos salvos no armazenamento persistente local com verificação de validade (TTL)
 */
export function getPersistedAnimeRichData(anime: { mal_id?: number; id?: string; title: string }): DynamicAnimeRichData | null {
  if (typeof window === 'undefined' || !anime) return null;

  try {
    let raw: string | null = null;

    // Tenta primeiro por mal_id (se tiver)
    if (anime.mal_id) {
      raw = localStorage.getItem(getAnimeStorageKey(anime.mal_id));
    }

    // Tenta por título se não encontrou por ID
    if (!raw && anime.title) {
      raw = localStorage.getItem(getAnimeStorageKey(anime.title));
    }

    if (raw) {
      const parsed: DynamicAnimeRichData = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.streamingLinks)) {
        const cachedTime = parsed.cachedAt || 0;
        const age = Date.now() - cachedTime;
        const isEmpty = (!parsed.characters || parsed.characters.length === 0) && (!parsed.streamingLinks || parsed.streamingLinks.length === 0);

        // Se o cache for vazio ou incompleto e já tiver mais de 2 horas, expira para re-tentar na API
        if (isEmpty && age > EMPTY_DATA_TTL) {
          return null;
        }

        // Se o cache tiver mais de 7 dias, expira para buscar novidades (novos streamings, episódios, trailers)
        if (age > RICH_DATA_TTL) {
          return null;
        }

        return parsed;
      }
    }
  } catch (err) {
    console.debug('Erro ao ler cache persistente do anime:', err);
  }

  return null;
}

/**
 * Salva os metadados ricos no armazenamento local persistente
 */
export function savePersistedAnimeRichData(
  anime: { mal_id?: number; id?: string; title: string },
  data: DynamicAnimeRichData
): void {
  if (typeof window === 'undefined' || !anime || !data) return;

  const toSave: DynamicAnimeRichData = {
    ...data,
    cachedAt: Date.now(),
  };

  try {
    const raw = JSON.stringify(toSave);
    if (anime.mal_id) {
      localStorage.setItem(getAnimeStorageKey(anime.mal_id), raw);
    }
    if (anime.title) {
      localStorage.setItem(getAnimeStorageKey(anime.title), raw);
    }
  } catch (err) {
    console.debug('Erro ao persistir metadados do anime:', err);
  }
}

/**
 * Verifica se os metadados ricos estão incompletos ou com dados vitais faltando
 */
export function isAnimeRichDataIncomplete(data: DynamicAnimeRichData | null): boolean {
  if (!data) return true;
  const missingTrailer = !data.trailerUrl;
  const missingStreaming = !data.streamingLinks || data.streamingLinks.length === 0;
  const missingCharacters = !data.characters || data.characters.length === 0;
  const missingThemes = !data.themes || data.themes.length === 0;
  return missingTrailer || missingStreaming || missingCharacters || missingThemes;
}

/**
 * Obtém os metadados ricos de um anime da Coleção Completa:
 * 1. Se já existir no armazenamento persistente e estiver 100% completo, retorna imediatamente (0ms).
 * 2. Se for um anime recém-adicionado ou antigo sem mal_id/trailer/streaming/músicas,
 *    realiza auto-cura inteligente, consulta as APIs oficiais e persiste os dados consolidados.
 */
export async function getOrFetchAnimeRichData(
  anime: { mal_id?: number; id?: string; title: string; trailerUrl?: string | null; bannerUrl?: string | null },
  forceRefresh = false
): Promise<DynamicAnimeRichData> {
  const existing = getPersistedAnimeRichData(anime);

  // 1. Se já existir dados completos e não for forçado, retorna imediatamente
  if (!forceRefresh && existing && !isAnimeRichDataIncomplete(existing)) {
    return existing;
  }

  let malId = anime.mal_id || (existing?.mal_id ?? 0);
  const title = anime.title || '';
  let resolvedTrailerUrl: string | null = anime.trailerUrl || existing?.trailerUrl || null;
  let resolvedBannerUrl: string | null = anime.bannerUrl || existing?.bannerUrl || null;

  // 2. Se malId não existir, descobre o ID oficial canônico através da AniList ou Jikan
  if (!malId && title) {
    try {
      const searchRes = await searchAnimeMetadata(title);
      if (searchRes.length > 0 && searchRes[0].mal_id) {
        malId = searchRes[0].mal_id;
        if (!resolvedBannerUrl && searchRes[0].bannerUrl) {
          resolvedBannerUrl = searchRes[0].bannerUrl;
        }
      }
    } catch {
      // Silencioso
    }
  }

  // 3. Auto-cura: se ainda não tiver trailer oficial, busca imediatamente via extrator consolidado
  if (!resolvedTrailerUrl && (malId || title)) {
    try {
      const foundTrailer = await fetchOfficialAnimeTrailer(title, malId || null);
      if (foundTrailer) {
        resolvedTrailerUrl = foundTrailer;
      }
    } catch {
      // Silencioso
    }
  }

  // Se faltar banner oficial, busca banner de alta qualidade
  if (!resolvedBannerUrl && (malId || title)) {
    try {
      const fresh = await fetchFreshAnimeDetails(title, malId || null);
      if (fresh) {
        if (!malId && fresh.mal_id) malId = fresh.mal_id;
        if (!resolvedTrailerUrl && fresh.trailerUrl) resolvedTrailerUrl = fresh.trailerUrl;
        if (fresh.bannerUrl) resolvedBannerUrl = fresh.bannerUrl;
      }
    } catch {
      // Silencioso
    }
  }

  // 4. Busca simultânea nas APIs agregadas (AniList + Jikan + Shikimori + AnimeThemes)
  const [streamRes, charRes, themesRes] = await Promise.allSettled([
    getAggregatedStreamingLinks(malId, title),
    malId || title ? getAggregatedCharacters(malId, title) : Promise.resolve([]),
    title || malId ? fetchAnimeThemesMedia(title, malId) : Promise.resolve([]),
  ]);

  const rawStreams = streamRes.status === 'fulfilled' ? streamRes.value : [];
  const sanitizedStreams = rawStreams.filter(
    (l) => !l.name.toLowerCase().includes('youtube') && !l.url.toLowerCase().includes('youtube')
  );

  const fetchedChars = charRes.status === 'fulfilled' ? charRes.value : [];
  const fetchedThemes = themesRes.status === 'fulfilled' ? themesRes.value : [];

  const finalStreaming =
    sanitizedStreams.length > 0 ? sanitizedStreams : existing?.streamingLinks && existing.streamingLinks.length > 0 ? existing.streamingLinks : [];
  const finalCharacters =
    fetchedChars.length > 0 ? fetchedChars : existing?.characters && existing.characters.length > 0 ? existing.characters : [];
  const finalThemes =
    fetchedThemes.length > 0 ? fetchedThemes : existing?.themes && existing.themes.length > 0 ? existing.themes : [];

  const richData: DynamicAnimeRichData = {
    streamingLinks: finalStreaming,
    characters: finalCharacters,
    themes: finalThemes,
    trailerUrl: resolvedTrailerUrl,
    bannerUrl: resolvedBannerUrl,
    mal_id: malId || null,
  };

  // Salva no armazenamento persistente
  savePersistedAnimeRichData(
    { mal_id: malId || anime.mal_id, id: anime.id, title: anime.title },
    richData
  );

  // Sincroniza campos essenciais no Firestore caso o anime possua ID registrado
  if (anime.id) {
    const updates: Record<string, unknown> = {};
    if (!anime.mal_id && malId) updates.mal_id = malId;
    if (!anime.trailerUrl && resolvedTrailerUrl) updates.trailerUrl = resolvedTrailerUrl;
    if (!anime.bannerUrl && resolvedBannerUrl) updates.bannerUrl = resolvedBannerUrl;
    if (Object.keys(updates).length > 0) {
      updateAnime(anime.id, updates as any).catch(() => {});
    }
  }

  return richData;
}

// Controle de fila em segundo plano para não sobrecarregar as APIs
let isPrefetching = false;

/**
 * Pré-carregador silencioso em segundo plano:
 * Analisa a coleção do usuário e busca metadados ricos APENAS para os animes que ainda
 * NÃO possuem seus dados persistidos localmente (ex.: animes recém-adicionados).
 * Uma vez gravado, NUNCA mais dispara requisições repetidas ao abrir a Coleção Completa!
 */
export async function prefetchUserCollectionMetadata(animes: Anime[]): Promise<void> {
  if (isPrefetching || !animes || animes.length === 0) return;
  isPrefetching = true;

  try {
    // Filtra estritamente os animes que AINDA NÃO possuem metadados persistidos
    const missingMetadataList = animes.filter((a) => {
      const hasCached = getPersistedAnimeRichData(a);
      return !hasCached;
    });

    if (missingMetadataList.length === 0) {
      // Todos os animes já estão com metadados persistidos, zero requisições!
      return;
    }

    // Processa os que faltam em segundo plano, limitando a lotes de 10 por execução
    const queue = missingMetadataList.slice(0, 10);

    for (const anime of queue) {
      try {
        await getOrFetchAnimeRichData(anime, false);
      } catch (err) {
        console.debug('Prefetch silencioso individual falhou:', err);
      }

      // Intervalo de segurança (350ms) entre requisições para respeitar os limites de taxa
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  } finally {
    isPrefetching = false;
  }
}

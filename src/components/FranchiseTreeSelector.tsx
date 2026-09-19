import React, { useState, useEffect, useRef } from 'react';
import { 
  GitBranch, 
  Layers, 
  CheckCircle2, 
  Circle, 
  Loader2, 
  Tv, 
  ListTree, 
  ChevronRight, 
  ChevronLeft,
  Check, 
  RefreshCw, 
  Plus, 
  Trash2,
  SlidersHorizontal,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Film,
  Search,
  CheckCircle,
  Play,
  Edit3,
  X,
  CheckSquare,
  Square,
  MapPin,
  Sparkles
} from 'lucide-react';
import type { AnimeSeasonOrArc, FranchiseTreeItem, FranchiseCandidate } from '../types';
import { 
  fetchAnimeFranchiseTree, 
  buildSeasonsFromFranchiseSelection, 
  getFranchiseRootTitle 
} from '../services/franchiseService';

interface FranchiseTreeSelectorProps {
  animeTitle: string;
  malId?: number | null;
  currentSeasonName: string;
  currentTotalEpisodes?: number | null;
  existingSeasons: AnimeSeasonOrArc[];
  initialStructureMode?: 'seasons' | 'arcs' | null;
  initialExcludedItems?: (number | string)[];
  onExcludedItemsChange?: (excluded: (number | string)[]) => void;
  onApplyFranchiseTree: (
    seasons: AnimeSeasonOrArc[],
    currentSeasonName: string,
    totalEpisodes: number | null,
    franchiseIds: number[],
    rootTitle: string,
    activeAiringDay?: string | null,
    structureMode?: 'seasons' | 'arcs',
    excludedFranchiseItems?: (number | string)[]
  ) => void;
  onToggleSeasonWatched?: (seasonId: string) => void;
  onUpdateSeasonName?: (seasonId: string, name: string) => void;
  onUpdateSeasonEpisodes?: (seasonId: string, episodesStr: string) => void;
  onRemoveCustomArc?: (seasonId: string) => void;
  onSelectCurrentSeason?: (seasonName: string, totalEp: number | null, seasonId?: string) => void;
  onTriggerLoadMetadata?: (query: string) => void;
}

export const FranchiseTreeSelector: React.FC<FranchiseTreeSelectorProps> = ({
  animeTitle,
  malId,
  currentSeasonName,
  currentTotalEpisodes,
  existingSeasons,
  initialStructureMode,
  initialExcludedItems,
  onExcludedItemsChange,
  onApplyFranchiseTree,
  onToggleSeasonWatched,
  onUpdateSeasonName,
  onUpdateSeasonEpisodes,
  onRemoveCustomArc,
  onSelectCurrentSeason,
  onTriggerLoadMetadata,
}) => {
  const [loading, setLoading] = useState(false);
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [isSearchingCustom, setIsSearchingCustom] = useState(false);
  const [franchiseItems, setFranchiseItems] = useState<FranchiseTreeItem[]>([]);
  const [candidateFranchises, setCandidateFranchises] = useState<FranchiseCandidate[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [franchiseIds, setFranchiseIds] = useState<number[]>([]);
  const [rootTitle, setRootTitle] = useState<string>('');
  const [excludedItemIds, setExcludedItemIds] = useState<(number | string)[]>(() => initialExcludedItems || []);
  const [selectedItemId, setSelectedItemId] = useState<string | number>('');
  const [activeAiringDay, setActiveAiringDay] = useState<string | null>(null);
  const [autoMarkPrevious, setAutoMarkPrevious] = useState(true);
  const [isTreeSelectorOpen, setIsTreeSelectorOpen] = useState(false);
  const [hasLoadedTree, setHasLoadedTree] = useState(false);
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Estados para Navegação Horizontal do Carrossel e Filtros de Formato / Lote
  const carouselRef = useRef<HTMLDivElement>(null);
  const [formatFilter, setFormatFilter] = useState<'all' | 'tv' | 'movie' | 'special'>('all');
  const [includedItemIds, setIncludedItemIds] = useState<(string | number)[]>([]);

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const offset = direction === 'left' ? -260 : 260;
      carouselRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // Contadores dinâmicos por formato/categoria
  const totalCount = franchiseItems.length;
  const tvCount = franchiseItems.filter((it) => !it.format || it.format === 'TV').length;
  const movieCount = franchiseItems.filter(
    (it) => it.format === 'Movie' || /filme|movie/i.test(it.title) || /filme|movie/i.test(it.englishTitle || '')
  ).length;
  const specialCount = franchiseItems.filter(
    (it) =>
      it.format === 'OVA' ||
      it.format === 'Special' ||
      it.format === 'ONA' ||
      /ova|special|especial/i.test(it.title) ||
      /ova|special|especial/i.test(it.englishTitle || '')
  ).length;

  // Itens filtrados para visualização nas abas de formato
  const displayedFranchiseItems = franchiseItems.filter((it) => {
    if (formatFilter === 'all') return true;
    if (formatFilter === 'tv') return !it.format || it.format === 'TV';
    if (formatFilter === 'movie') {
      return it.format === 'Movie' || /filme|movie/i.test(it.title) || /filme|movie/i.test(it.englishTitle || '');
    }
    if (formatFilter === 'special') {
      return (
        it.format === 'OVA' ||
        it.format === 'Special' ||
        it.format === 'ONA' ||
        /ova|special|especial/i.test(it.title) ||
        /ova|special|especial/i.test(it.englishTitle || '')
      );
    }
    return true;
  });

  // Ações de Inclusão com 1 Toque (Substitui totalmente botões destrutivos de lixeira)
  const handleToggleInclude = (id: string | number) => {
    setIncludedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectOnlyTv = () => {
    const tvIds = franchiseItems
      .filter((it) => !it.format || it.format === 'TV')
      .map((it) => it.id);
    setIncludedItemIds(tvIds);
  };

  const handleSelectTvAndMovies = () => {
    const tvAndMovieIds = franchiseItems
      .filter(
        (it) =>
          !it.format ||
          it.format === 'TV' ||
          it.format === 'Movie' ||
          /filme|movie/i.test(it.title) ||
          /filme|movie/i.test(it.englishTitle || '')
      )
      .map((it) => it.id);
    setIncludedItemIds(tvAndMovieIds);
  };

  const handleSelectAll = () => {
    setIncludedItemIds(franchiseItems.map((it) => it.id));
  };

  const handleDeselectAll = () => {
    setIncludedItemIds([]);
  };

  // Carrega a árvore de franquia automaticamente ou ao acionar
  const handleLoadTree = async (overrideQuery?: string, resetExclusions = false) => {
    const query = (overrideQuery || customSearchQuery || animeTitle).trim();
    if (!query) return;
    setLoading(true);
    if (resetExclusions) {
      setExcludedItemIds([]);
      if (onExcludedItemsChange) onExcludedItemsChange([]);
    }
    try {
      // Sempre busca a árvore completa da franquia pelo título da obra (query)
      const res = await fetchAnimeFranchiseTree(query, query);
      const activeExcluded = resetExclusions ? [] : excludedItemIds;
      const excludedNorm = (activeExcluded || []).map((x) => String(x).toLowerCase().trim());

      const rawItems = res.items || [];
      setFranchiseItems(rawItems);
      setFranchiseIds(res.franchiseIds);
      setRootTitle(res.rootTitle);
      setActiveAiringDay(res.activeAiringDay || null);

      const cands = res.candidateFranchises || [];
      setCandidateFranchises(cands);
      if (cands.length > 1) {
        setSelectedClusterId(cands[0].clusterId);
      } else {
        setSelectedClusterId(null);
      }

      // Define itens selecionados inicialmente:
      // Se o usuário já tinha exclusões salvas, preserva.
      // Se não, seleciona TV + Filmes (ou tudo se a obra tiver até 8 itens)
      let initialIncluded: (number | string)[] = [];
      if (excludedNorm.length > 0) {
        initialIncluded = rawItems
          .filter(
            (it) =>
              !excludedNorm.includes(String(it.id).toLowerCase().trim()) &&
              !(it.title && excludedNorm.includes(it.title.toLowerCase().trim()))
          )
          .map((it) => it.id);
      } else if (rawItems.length <= 8) {
        initialIncluded = rawItems.map((it) => it.id);
      } else {
        const tvAndMovies = rawItems.filter(
          (it) =>
            !it.format ||
            it.format === 'TV' ||
            it.format === 'Movie' ||
            /filme|movie/i.test(it.title) ||
            /filme|movie/i.test(it.englishTitle || '')
        );
        initialIncluded = (tvAndMovies.length > 0 ? tvAndMovies : rawItems).map((it) => it.id);
      }
      setIncludedItemIds(initialIncluded);

      if (rawItems.length > 0) {
        const found = rawItems.find((it) => it.title.toLowerCase() === currentSeasonName.toLowerCase());
        if (found) {
          setSelectedItemId(found.id);
        } else {
          // Prioriza o primeiro item de TV incluído
          const firstTv = rawItems.find((it) => !it.format || it.format === 'TV');
          setSelectedItemId(firstTv ? firstTv.id : rawItems[0].id);
        }
      }

      setHasLoadedTree(true);
      setIsTreeSelectorOpen(true);
      setIsSearchingCustom(false);
    } catch (err) {
      console.warn('Erro ao carregar árvore de franquia:', err);
    } finally {
      setLoading(false);
    }
  };

  // Alterna entre candidatos de franquia quando a busca encontrou múltiplas obras distintas
  const handleSelectCandidateFranchise = (cand: FranchiseCandidate) => {
    setSelectedClusterId(cand.clusterId);
    setRootTitle(cand.title);
    setFranchiseIds(cand.franchiseIds);

    const activeExcluded = excludedItemIds || [];
    const excludedNorm = activeExcluded.map((x) => String(x).toLowerCase().trim());

    setFranchiseItems(cand.items);

    let initialIncluded: (number | string)[] = [];
    if (excludedNorm.length > 0) {
      initialIncluded = cand.items
        .filter(
          (it) =>
            !excludedNorm.includes(String(it.id).toLowerCase().trim()) &&
            !(it.title && excludedNorm.includes(it.title.toLowerCase().trim()))
        )
        .map((it) => it.id);
    } else if (cand.items.length <= 8) {
      initialIncluded = cand.items.map((it) => it.id);
    } else {
      const tvAndMovies = cand.items.filter(
        (it) =>
          !it.format ||
          it.format === 'TV' ||
          it.format === 'Movie' ||
          /filme|movie/i.test(it.title) ||
          /filme|movie/i.test(it.englishTitle || '')
      );
      initialIncluded = (tvAndMovies.length > 0 ? tvAndMovies : cand.items).map((it) => it.id);
    }
    setIncludedItemIds(initialIncluded);

    if (cand.items.length > 0) {
      const found = cand.items.find((it) => it.title.toLowerCase() === currentSeasonName.toLowerCase());
      setSelectedItemId(found ? found.id : cand.items[0].id);
    } else {
      setSelectedItemId('');
    }
  };

  const handleApply = () => {
    if (!franchiseItems || franchiseItems.length === 0) return;

    setIsApplying(true);
    
    // Filtra estritamente os itens que o usuário escolheu incluir no checklist
    let itemsToApply = franchiseItems.filter((it) => includedItemIds.includes(it.id));
    if (itemsToApply.length === 0) {
      const fallback = franchiseItems.find((it) => String(it.id) === String(selectedItemId)) || franchiseItems[0];
      if (fallback) itemsToApply = [fallback];
    }

    // Identifica itens não inclusos para persistência limpa
    const newExcluded = franchiseItems
      .filter((it) => !itemsToApply.some((app) => String(app.id) === String(it.id)))
      .map((it) => it.id);
    setExcludedItemIds(newExcluded);
    if (onExcludedItemsChange) onExcludedItemsChange(newExcluded);

    // Garante que o selectedItemId é válido dentro de itemsToApply
    let finalActiveId = selectedItemId;
    if (!itemsToApply.some((it) => String(it.id) === String(selectedItemId))) {
      finalActiveId = itemsToApply[0].id;
      setSelectedItemId(finalActiveId);
    }

    // Executa a montagem e aplicação da estrutura legítima da API
    const result = buildSeasonsFromFranchiseSelection(itemsToApply, finalActiveId, autoMarkPrevious);
    onApplyFranchiseTree(
      result.seasons,
      result.currentSeasonName,
      result.activeTotalEpisodes,
      franchiseIds,
      rootTitle || getFranchiseRootTitle(animeTitle),
      activeAiringDay,
      'seasons',
      newExcluded
    );

    // Feedback tátil imediato e fechamento suave do seletor
    setTimeout(() => {
      setIsApplying(false);
      setIsTreeSelectorOpen(false);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 5000);
    }, 400);
  };

  const hasSeasons = existingSeasons && existingSeasons.length > 0;

  return (
    <div className="space-y-4">
      {/* Cabeçalho do Bloco */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-indigo-400 shrink-0 shadow-sm">
            <GitBranch className="w-4.5 h-4.5" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              <span>Árvore de Temporadas & Franquia</span>
            </h4>
            <p className="text-[11px] text-zinc-400">
              Detecte todas as temporadas, filmes e arcos oficiais automaticamente
            </p>
          </div>
        </div>

        {/* Botão de Ação do Topo: SEMPRE 'Carregar Árvore Oficial' (fixo, estável e funcional como reset) */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            id="btn-load-franchise-tree"
            onClick={() => {
              setIsTreeSelectorOpen(true);
              handleLoadTree(undefined, true);
              if (onTriggerLoadMetadata) {
                onTriggerLoadMetadata(animeTitle);
              }
            }}
            disabled={loading || !animeTitle.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/25 flex items-center gap-2 cursor-pointer shrink-0"
            title="Carregar ou resetar a árvore oficial de temporadas da API e ficha técnica da obra"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Buscando Temporadas...</span>
              </>
            ) : (
              <>
                <GitBranch className="w-3.5 h-3.5 text-amber-300" />
                <span>Carregar Árvore Oficial</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Banner de Feedback de Sucesso */}
      {showSuccessToast && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between gap-2 text-emerald-300 text-xs font-medium animate-in fade-in duration-200 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Estrutura aplicada com sucesso! Todas as temporadas da obra foram conectadas.</span>
          </div>
          <button
            type="button"
            onClick={() => setShowSuccessToast(false)}
            className="text-emerald-400 hover:text-emerald-200 text-xs px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ============================================================
          PAINEL DE SELEÇÃO DA ÁRVORE (QUANDO ABERTO) - ESTRUTURA PLANA
         ============================================================ */}
      {hasLoadedTree && isTreeSelectorOpen && (
        <div className="space-y-4 pt-3 border-t border-white/[0.06] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
            <div>
              <span className="text-xs font-black text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <ListTree className="w-3.5 h-3.5 text-amber-400" />
                <span>Escolha em qual temporada ou filme você está:</span>
              </span>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Selecione o ponto em que você está e aplique. Remova itens indesejados individualmente ou via seleção em lote.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsSearchingCustom(!isSearchingCustom)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-semibold"
              >
                <Search className="w-3 h-3" />
                <span>Buscar Outro Nome</span>
              </button>

              <button
                type="button"
                onClick={() => setIsTreeSelectorOpen(false)}
                className="text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 rounded-lg hover:bg-white/[0.06] cursor-pointer"
              >
                Ocultar ✕
              </button>
            </div>
          </div>

          {/* Campo de Busca Personalizada se Solicitado */}
          {isSearchingCustom && (
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-white/[0.08] flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <input
                type="text"
                placeholder="Ex: Mushoku Tensei, Kimetsu no Yaiba, Slime..."
                value={customSearchQuery}
                onChange={(e) => setCustomSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLoadTree(customSearchQuery);
                  }
                }}
                className="bg-transparent text-xs text-white placeholder:text-zinc-500 flex-1 outline-none"
              />
              <button
                type="button"
                onClick={() => handleLoadTree(customSearchQuery)}
                disabled={loading || !customSearchQuery.trim()}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shrink-0 disabled:opacity-50"
              >
                Buscar
              </button>
            </div>
          )}

          {/* Desambiguação de Franquia / Carrossel Horizontal Responsivo */}
          {candidateFranchises.length > 1 && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Obras Encontradas:</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] text-zinc-400 font-medium">
                    {candidateFranchises.length} obras disponíveis
                  </span>
                  {/* Navegação por setas no PC */}
                  <div className="hidden sm:flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => scrollCarousel('left')}
                      className="p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-zinc-400 hover:text-white border border-white/[0.08] transition-colors cursor-pointer"
                      title="Navegar para a esquerda"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollCarousel('right')}
                      className="p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-zinc-400 hover:text-white border border-white/[0.08] transition-colors cursor-pointer"
                      title="Navegar para a direita"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Carrossel horizontal com toque suave no celular e setas no Desktop */}
              <div
                ref={carouselRef}
                className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar overscroll-contain snap-x scroll-smooth"
              >
                {candidateFranchises.map((cand) => {
                  const isActive = selectedClusterId === cand.clusterId;
                  return (
                    <button
                      key={`candidate_franchise_${cand.clusterId}`}
                      type="button"
                      onClick={() => handleSelectCandidateFranchise(cand)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2.5 border cursor-pointer snap-start ${
                        isActive
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-md ring-1 ring-indigo-400/50'
                          : 'bg-zinc-950/80 text-zinc-300 border-white/[0.08] hover:border-white/20 hover:bg-white/[0.06]'
                      }`}
                    >
                      {cand.coverUrl && (
                        <img
                          src={cand.coverUrl}
                          alt={cand.title}
                          referrerPolicy="no-referrer"
                          className="w-5 h-7 object-cover rounded shadow-xs shrink-0 bg-zinc-900"
                        />
                      )}
                      <div className="text-left min-w-0">
                        <span className="truncate max-w-[150px] sm:max-w-[210px] block font-semibold">
                          {cand.title}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {cand.year && (
                            <span className={`text-[10px] ${isActive ? 'text-indigo-200' : 'text-zinc-500'}`}>
                              {cand.year}
                            </span>
                          )}
                          <span
                            className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono ${
                              isActive ? 'bg-indigo-700 text-white' : 'bg-white/[0.08] text-zinc-400'
                            }`}
                          >
                            {cand.itemCount} {cand.itemCount === 1 ? 'item' : 'itens'}
                          </span>
                        </div>
                      </div>
                      {isActive && <Check className="w-3.5 h-3.5 text-white shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Barra de Presets Rápidos de 1 Toque */}
          <div className="p-3 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-indigo-200 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                <span>Escolha Rápida da Linha do Tempo:</span>
              </span>
              <span className="text-[11px] font-semibold text-indigo-300">
                {includedItemIds.length} de {totalCount} selecionados
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleSelectOnlyTv}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-white/[0.05] hover:bg-indigo-600/30 text-zinc-200 hover:text-white border border-white/10 hover:border-indigo-500/40 cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Tv className="w-3 h-3 text-indigo-400" />
                <span>Apenas Séries TV ({tvCount})</span>
              </button>

              <button
                type="button"
                onClick={handleSelectTvAndMovies}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-white/[0.05] hover:bg-indigo-600/30 text-zinc-200 hover:text-white border border-white/10 hover:border-indigo-500/40 cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Film className="w-3 h-3 text-purple-400" />
                <span>Séries + Filmes ({tvCount + movieCount})</span>
              </button>

              <button
                type="button"
                onClick={handleSelectAll}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-white/[0.05] hover:bg-indigo-600/30 text-zinc-200 hover:text-white border border-white/10 hover:border-indigo-500/40 cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Toda a Franquia ({totalCount})</span>
              </button>

              <button
                type="button"
                onClick={handleDeselectAll}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all bg-black/40 hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 border border-white/[0.06] cursor-pointer ml-auto active:scale-95"
              >
                Desmarcar Todos
              </button>
            </div>
          </div>

          {/* Abas de Filtro de Visualização por Formato */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            <button
              type="button"
              onClick={() => setFormatFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                formatFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.06]'
              }`}
            >
              Todos ({totalCount})
            </button>

            {tvCount > 0 && (
              <button
                type="button"
                onClick={() => setFormatFilter('tv')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  formatFilter === 'tv'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                Séries TV ({tvCount})
              </button>
            )}

            {movieCount > 0 && (
              <button
                type="button"
                onClick={() => setFormatFilter('movie')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  formatFilter === 'movie'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                Filmes ({movieCount})
              </button>
            )}

            {specialCount > 0 && (
              <button
                type="button"
                onClick={() => setFormatFilter('special')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  formatFilter === 'special'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                Especiais & OVAs ({specialCount})
              </button>
            )}
          </div>

          {/* Lista de Itens com Seleção por Checklist */}
          <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1 no-scrollbar overscroll-auto">
            {displayedFranchiseItems.length > 0 ? (
              displayedFranchiseItems.map((item, index) => {
                const isIncluded = includedItemIds.includes(item.id);
                const isSelected = String(selectedItemId) === String(item.id);
                const isMovie = item.format === 'Movie' || /filme|movie/i.test(item.title);
                const isOva = item.format === 'OVA';
                const isSpecial = item.format === 'Special' || item.format === 'ONA';

                // Determina se este item é uma temporada de TV anterior à ativa
                const activeItemIdx = franchiseItems.findIndex((it) => String(it.id) === String(selectedItemId));
                const currentItemIdx = franchiseItems.findIndex((it) => String(it.id) === String(item.id));
                const isPriorTvSeason =
                  autoMarkPrevious &&
                  activeItemIdx !== -1 &&
                  currentItemIdx < activeItemIdx &&
                  (!item.format || item.format === 'TV');

                return (
                  <div
                    key={`franchise_item_${item.id}_${index}`}
                    onClick={() => handleToggleInclude(item.id)}
                    className={`p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none ${
                      isIncluded
                        ? isSelected
                          ? 'bg-indigo-600/20 border-indigo-400/80 text-white ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-950/50'
                          : 'bg-zinc-950/90 border-white/[0.12] text-zinc-200 hover:border-white/[0.25] hover:bg-zinc-900/60'
                        : 'bg-zinc-950/40 border-white/[0.04] text-zinc-500 opacity-60 hover:opacity-85 hover:bg-zinc-900/30'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Checkbox de Inclusão com 1 Toque */}
                      <div className="shrink-0">
                        {isIncluded ? (
                          <div className="w-5 h-5 rounded-lg bg-indigo-600 border border-indigo-400 text-white flex items-center justify-center shadow-xs">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-lg bg-black/40 border border-white/20 hover:border-white/40 transition-colors" />
                        )}
                      </div>

                      {/* Poster / Thumbnail com numeração */}
                      <div className="w-10 h-14 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-white/[0.08] shadow-xs relative">
                        {item.coverUrl ? (
                          <img
                            src={item.coverUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-zinc-500">
                            {index + 1}
                          </div>
                        )}
                        <div className="absolute top-0.5 left-0.5 bg-black/80 px-1 rounded text-[8px] font-black text-zinc-300">
                          #{index + 1}
                        </div>
                      </div>

                      {/* Informações da Temporada / Filme */}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-bold break-words leading-tight ${
                            isIncluded ? 'text-white' : 'text-zinc-400'
                          }`}
                        >
                          {item.title}
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] text-zinc-400">
                          {/* Badge de Formato */}
                          <span
                            className={`px-1.5 py-0.2 rounded font-bold uppercase tracking-wider text-[9px] border ${
                              isMovie
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                : isOva || isSpecial
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                            }`}
                          >
                            {item.format || 'TV'}
                          </span>

                          {item.episodes ? (
                            <span className="font-medium text-zinc-300">{item.episodes} eps</span>
                          ) : (
                            <span className="text-cyan-300 font-medium">Em exibição</span>
                          )}

                          {item.seasonYear && (
                            <span className="text-zinc-500">• {item.seasonYear}</span>
                          )}

                          {/* Status de Assistida se aplicável */}
                          {isIncluded && isPriorTvSeason && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Assistida</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Lado Direito: Ação de Definir "Estou aqui" ou Status de Inclusão */}
                    <div className="shrink-0 flex items-center gap-2">
                      {isIncluded ? (
                        isSelected ? (
                          <span className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[11px] font-black flex items-center gap-1 shadow-md shadow-indigo-600/40 border border-indigo-400/40">
                            <MapPin className="w-3.5 h-3.5 fill-white" />
                            <span>Estou aqui</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItemId(item.id);
                            }}
                            className="px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-indigo-600/30 text-zinc-300 hover:text-white border border-white/[0.08] hover:border-indigo-500/40 text-[10.5px] font-bold transition-all cursor-pointer"
                          >
                            Marcar onde estou
                          </button>
                        )
                      ) : (
                        <span className="text-[10px] font-semibold text-zinc-500 px-2 py-0.5 rounded-md bg-white/[0.02] border border-white/[0.04]">
                          Omitido
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-zinc-400 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                {franchiseItems.length === 0
                  ? 'Nenhuma temporada adicional encontrada. Você pode adicionar manualmente abaixo.'
                  : 'Nenhum item corresponde ao filtro de formato selecionado.'}
              </div>
            )}
          </div>

          {/* Opções e Botão de Aplicar com Efeito Tátil */}
          <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoMarkPrevious}
                onChange={(e) => setAutoMarkPrevious(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-black text-indigo-600 focus:ring-0 cursor-pointer"
              />
              <span>Marcar temporadas de TV anteriores como assistidas</span>
            </label>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-zinc-400 hidden sm:inline">
                {includedItemIds.length} item(ns) na ficha
              </span>
              <button
                type="button"
                id="btn-apply-franchise-structure"
                onClick={handleApply}
                disabled={isApplying}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 shadow-lg flex items-center gap-2 cursor-pointer active:scale-95 border ${
                  isApplying
                    ? 'bg-emerald-500 text-black shadow-emerald-500/40 scale-105 border-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 border-emerald-400/30'
                }`}
              >
                {isApplying ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 animate-bounce" />
                    <span>✓ Aplicando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Aplicar Estrutura no Anime</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          ESTRUTURA APLICADA NO ANIME (LISTA LIMPA E CONFIGURÁVEL)
         ============================================================ */}
      {hasSeasons && (
        <div className="space-y-3 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Linha do Tempo Ativa:</span>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-open-manual-season-editor"
                onClick={() => setShowManualEditor(true)}
                className="text-[11px] text-indigo-300 hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 cursor-pointer font-bold transition-all active:scale-95 shadow-sm"
              >
                <Edit3 className="w-3 h-3 text-indigo-400" />
                <span>Editar Manualmente</span>
              </button>
            </div>
          </div>

          {/* Cards Rápidos de Temporadas Ativas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto no-scrollbar pr-0.5 overscroll-auto">
            {existingSeasons.map((sec, idx) => {
              const isCurrent = sec.name === currentSeasonName;
              return (
                <div
                  key={`quick_season_${sec.id || idx}_${idx}`}
                  className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                    isCurrent
                      ? 'bg-indigo-600/25 border-indigo-400 text-white ring-1 ring-indigo-500/50 shadow-sm'
                      : 'bg-zinc-950/80 border-white/[0.06] text-zinc-300 hover:border-white/15'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold break-words text-white leading-snug">{sec.name}</span>
                      {isCurrent && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-indigo-500 text-white font-black shrink-0">
                          Atual
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400">
                      {sec.totalEpisodes ? `${sec.totalEpisodes} episódios` : 'Em exibição'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {onToggleSeasonWatched && (
                      <button
                        type="button"
                        onClick={() => onToggleSeasonWatched(sec.id)}
                        className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-bold transition-all cursor-pointer border ${
                          sec.isWatched
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-white/[0.04] text-zinc-400 border-white/[0.06] hover:text-white'
                        }`}
                        title={sec.isWatched ? 'Marcar como pendente' : 'Marcar como assistido'}
                      >
                        {sec.isWatched ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Visto</span>
                          </>
                        ) : (
                          <>
                            <Circle className="w-3 h-3 opacity-60" />
                            <span>Pendente</span>
                          </>
                        )}
                      </button>
                    )}

                    {onSelectCurrentSeason && (
                      isCurrent ? (
                        <button
                          type="button"
                          onClick={() => onSelectCurrentSeason('', null)}
                          className="text-[10px] px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1 shadow-sm"
                          title="Clique para desmarcar esta temporada como atual"
                        >
                          <Check className="w-3 h-3" />
                          <span>Desmarcar</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectCurrentSeason(sec.name, sec.totalEpisodes || null, sec.id)}
                          className="text-[10px] px-2 py-1 rounded-lg bg-indigo-600/40 hover:bg-indigo-600 text-indigo-100 font-bold transition-all cursor-pointer active:scale-95"
                          title="Tornar esta temporada a atual"
                        >
                          Definir Atual
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-Modal Focado de Edição Manual de Temporadas & Arcos */}
      {showManualEditor && (
        <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-black border border-white/[0.08] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 ring-1 ring-white/[0.05]">
            {/* Topo do Modal */}
            <div className="p-4 sm:p-5 bg-black/90 border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-indigo-400 shrink-0">
                  <Layers className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">Editar Temporadas & Arcos</h3>
                  <p className="text-[11px] text-zinc-400">Personalize os nomes e episódios como preferir</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualEditor(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de temporadas e arcos com scroll responsivo */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-2.5 flex-1">
              {existingSeasons.length === 0 ? (
                <div className="p-6 text-center text-zinc-400 text-xs">
                  Nenhuma temporada ou arco adicionado. Clique abaixo para criar o primeiro.
                </div>
              ) : (
                existingSeasons.map((sec, idx) => (
                  <div
                    key={`manual_editor_card_${sec.id || idx}_${idx}`}
                    className="p-2.5 rounded-xl bg-zinc-950/80 border border-white/[0.06] flex items-center gap-2.5 hover:border-white/15 transition-colors"
                  >
                    <span className="text-[11px] font-bold text-zinc-500 w-5 text-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        placeholder="Nome da temporada / arco"
                        value={sec.name}
                        onChange={(e) => onUpdateSeasonName?.(sec.id, e.target.value)}
                        className="w-full bg-black/60 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                      />
                    </div>
                    <div className="w-20 shrink-0">
                      <input
                        type="number"
                        min="1"
                        placeholder="Eps"
                        value={sec.totalEpisodes ?? ''}
                        onChange={(e) => onUpdateSeasonEpisodes?.(sec.id, e.target.value)}
                        className="w-full bg-black/60 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-2 py-1.5 text-xs text-white text-center outline-none"
                      />
                    </div>
                    {onRemoveCustomArc && (
                      <button
                        type="button"
                        onClick={() => onRemoveCustomArc(sec.id)}
                        className="p-2 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors shrink-0"
                        title="Remover esta temporada"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Rodapé com Concluir */}
            <div className="p-4 bg-black/90 border-t border-white/[0.06] flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowManualEditor(false)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Concluir Edição</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

(function(global){
  'use strict';

  const state = {
    characterData: null,
    mathUnits: null,
    levelData: null,
    labels: null,
    progress: null,
    selectedStageId: null,
    selectedMonsterId: null,
    selectedMode: GameLogic.MODES.PROGRESSION_100,
    battle: null,
    battleTimer: null,
    lastResult: null,
    lastApplied: null
  };

  async function loadJson(url, fallback){
    try{
      const res = await fetch(url, { cache:'no-store' });
      if(!res.ok) throw new Error(`${url} ${res.status}`);
      return await res.json();
    }catch(e){
      return JSON.parse(JSON.stringify(fallback));
    }
  }

  async function init(){
    const [characters, units, levels, labels, progress, customMathUnits] = await Promise.all([
      loadJson('data/character.json', window.DEFAULT_CHARACTER_DATA),
      loadJson('data/mathUnits.json', window.DEFAULT_MATH_UNITS),
      loadJson('data/level.json', window.DEFAULT_LEVEL_DATA),
      loadJson('data/labels.json', window.DEFAULT_LABELS),
      Storage.loadProgress(),
      Storage.loadCustomMathUnits()
    ]);
    state.characterData = normalizeCharacterData(characters);
    state.mathUnits = customMathUnits || units;
    state.levelData = levels;
    state.labels = normalizeLabels(labels);
    state.progress = progress;
    UI.setLabels(state.labels);
    applyStaticLabels(state.labels);
    ensureInitialSelection();
    bindEvents();
    renderAll();
    UI.setView('home');
  }

  function normalizeLabels(labels){
    const fallback = window.DEFAULT_LABELS || {};
    const safe = labels && typeof labels === 'object' ? labels : {};
    return {
      modes:   Object.assign({}, fallback.modes,   safe.modes   || {}),
      nav:     Object.assign({}, fallback.nav,     safe.nav     || {}),
      screens: Object.assign({}, fallback.screens, safe.screens || {})
    };
  }

  function applyStaticLabels(labels){
    // モード切替ボタンの表示テキスト
    document.querySelectorAll('[data-mode-option]').forEach(btn=>{
      const id = btn.dataset.modeOption;
      const m = labels.modes?.[id];
      if(m) btn.textContent = m.shortName || m.name || btn.textContent;
    });
    // 下部ナビ
    document.querySelectorAll('.nav-button').forEach(btn=>{
      const view = btn.dataset.view;
      const n = labels.nav?.[view];
      if(n){
        btn.innerHTML = `<span>${UI.esc(n.icon || '')}</span>${UI.esc(n.label || '')}`;
      }
    });
    // 図鑑画面のヘッダ
    const enc = labels.screens?.encyclopedia;
    if(enc){
      const card = document.querySelector('#encyclopedia-view .card');
      if(card){
        const title = card.querySelector('.section-title');
        const sub = card.querySelector('p.tiny.muted');
        if(title && enc.title) title.textContent = enc.title;
        if(sub && enc.subtitle) sub.textContent = enc.subtitle;
      }
    }
    // ブートキャンプ（旧復習）画面のヘッダとボタン
    const rv = labels.screens?.review;
    if(rv){
      const card = document.querySelector('#review-view .card');
      if(card){
        const title = card.querySelector('.section-title');
        const sub = card.querySelector('p.tiny.muted');
        const btn = card.querySelector('#start-review-button');
        if(title && rv.title) title.textContent = rv.title;
        if(sub && rv.subtitle) sub.textContent = rv.subtitle;
        if(btn && rv.retryButton) btn.textContent = rv.retryButton;
      }
    }
  }

  function normalizeCharacterData(data){
    const safe = data && typeof data === 'object' ? data : { monsters:[], difficulties:[] };
    safe.monsters = Array.isArray(safe.monsters) ? safe.monsters.filter(m=>m && m.id && m.name) : [];
    safe.difficulties = Array.isArray(safe.difficulties) && safe.difficulties.length ? safe.difficulties : [{ id:'easy', name:'はじまり', icon:'🌳', xpMulti:1 }];
    safe.difficulties = safe.difficulties.map((d,i)=>Object.assign({ order:i, requiredBadges:5 }, d));
    safe.settings = Object.assign({ stageClearBadgeCount:5 }, safe.settings || {});
    return safe;
  }

  function ensureInitialSelection(){
    const stages = GameLogic.getStages(state.characterData);
    const openStage = stages.find(s=>GameLogic.isStageOpen(state.progress,state.characterData,s.id)) || stages[0];
    state.selectedStageId = state.selectedStageId || openStage?.id;
    const monsters = GameLogic.getMonstersByStage(state.characterData, state.selectedStageId);
    state.selectedMonsterId = state.selectedMonsterId || monsters[0]?.id;
  }

  function bindTap(element, handler){
    if(!element) return;
    if(global.UI && typeof UI.activate === 'function'){ UI.activate(element, handler); return; }
    element.addEventListener('click', handler);
  }

  function bindEvents(){
    document.querySelectorAll('.nav-button').forEach(btn=>bindTap(btn,()=>{
      if(state.battle?.active) return;
      const view = btn.dataset.view;
      if(view === 'setup') refreshSetup();
      if(view === 'review') renderReviewBank();
      if(view === 'history') UI.renderHistory(state.progress.history || []);
      if(view === 'encyclopedia') UI.renderEncyclopedia(GameLogic.getMonsters(state.characterData), state.progress);
      UI.setView(view);
    }));
    document.querySelectorAll('[data-mode-option]').forEach(btn=>bindTap(btn,()=>{
      state.selectedMode = btn.dataset.modeOption;
      UI.renderModeOptions(state.selectedMode);
      renderStartSummary();
    }));
    bindTap(UI.$('go-setup-button'),()=>{ refreshSetup(); UI.setView('setup'); });
    bindTap(UI.$('start-button'),startSelectedBattle);
    bindTap(UI.$('result-next-button'),()=>{ refreshSetup(); UI.setView('setup'); });
    bindTap(UI.$('result-home-button'),()=>{ state.battle = null; UI.setView('home'); });
    bindTap(UI.$('export-progress'),()=>Storage.exportProgress(state.progress));
    UI.$('import-progress-input')?.addEventListener('change',importProgress);
  }

  function getLevelInfo(){ return GameLogic.getLevelInfo(state.progress.xp, state.levelData); }

  function renderAll(){
    UI.renderPlayer(state.progress, getLevelInfo());
    renderHome();
    refreshSetup();
    UI.renderEncyclopedia(GameLogic.getMonsters(state.characterData), state.progress);
    UI.renderHistory(state.progress.history || []);
    renderReviewBank();
  }

  function renderHome(){
    const stages = GameLogic.getStages(state.characterData);
    const stats = Object.fromEntries(stages.map(stage=>[stage.id, {
      badges: GameLogic.getBadgeCountForStage(state.progress, state.characterData, stage.id),
      open: GameLogic.isStageOpen(state.progress, state.characterData, stage.id)
    }]));
    UI.renderHome({ progress:state.progress, levelInfo:getLevelInfo(), stages, stageStats:stats });
  }

  function refreshSetup(){
    const stages = GameLogic.getStages(state.characterData);
    if(!state.selectedStageId || !stages.some(s=>s.id===state.selectedStageId)) ensureInitialSelection();
    UI.renderModeOptions(state.selectedMode);
    UI.renderStageSelector({
      stages,
      selectedStageId: state.selectedStageId,
      getStats: stageId => ({
        badges: GameLogic.getBadgeCountForStage(state.progress, state.characterData, stageId),
        open: GameLogic.isStageOpen(state.progress, state.characterData, stageId)
      }),
      onSelect: stageId => {
        state.selectedStageId = stageId;
        const monsters = GameLogic.getMonstersByStage(state.characterData, stageId);
        state.selectedMonsterId = monsters[0]?.id;
        refreshSetup();
      },
      onOpen: stageId => openStage(stageId)
    });
    const monsters = GameLogic.getMonstersByStage(state.characterData, state.selectedStageId);
    if(!monsters.some(m=>m.id===state.selectedMonsterId)) state.selectedMonsterId = monsters[0]?.id;
    UI.renderMonsterSelector({
      monsters,
      selectedMonsterId: state.selectedMonsterId,
      records: state.progress.records || {},
      onSelect: monsterId => { state.selectedMonsterId = monsterId; refreshSetup(); }
    });
    renderStartSummary();
  }

  async function openStage(stageId){
    const result = GameLogic.openStageWithCoins(state.progress, state.characterData, stageId);
    if(!result.ok){
      const stage = GameLogic.getStage(state.characterData, stageId);
      UI.toast(`${stage?.name || 'ステージ'}をオープンするには${stage?.openCost || result.need || 0}G必要です`);
      return;
    }
    state.progress = await Storage.saveProgress(result.progress);
    state.selectedStageId = stageId;
    const monsters = GameLogic.getMonstersByStage(state.characterData, stageId);
    state.selectedMonsterId = monsters[0]?.id;
    renderAll();
    UI.toast(result.alreadyOpen ? 'すでにオープンしています' : `賞金${result.cost}Gでステージをオープンしました`);
  }

  function renderStartSummary(){
    const stage = GameLogic.getStage(state.characterData, state.selectedStageId);
    const monster = GameLogic.getMonster(state.characterData, state.selectedMonsterId);
    const unit = monster ? QuestionLogic.getUnitForMonster(state.mathUnits, monster) : null;
    UI.renderStartSummary({ mode: state.selectedMode, stage, monster, unit, canProgress: state.selectedMode === GameLogic.MODES.PROGRESSION_100 });
  }

  function startSelectedBattle(){
    const stage = GameLogic.getStage(state.characterData, state.selectedStageId);
    const monster = GameLogic.getMonster(state.characterData, state.selectedMonsterId);
    if(!stage || !monster){ UI.toast('ステージとモンスターを選んでください'); return; }
    if(!GameLogic.isStageOpen(state.progress, state.characterData, stage.id)){ UI.toast('このステージはまだオープンしていません'); return; }
    const mode = state.selectedMode;
    let count = 100;
    let timeLimitSec = null;
    if(mode === GameLogic.MODES.PRACTICE_COUNT) count = Number(UI.$('practice-count').value || 20);
    if(mode === GameLogic.MODES.TIME_ATTACK){ count = 1000; timeLimitSec = Number(UI.$('time-limit').value || 60); }
    const questions = QuestionLogic.generateQuestions({ mathUnits:state.mathUnits, monster, count });
    startBattle({ mode, monster, stage, questions, questionCount:count, timeLimitSec });
  }

  function startBattle({ mode, monster, stage, questions, questionCount, timeLimitSec }){
    clearInterval(state.battleTimer);
    state.battle = GameLogic.createBattle({ mode, monster, stage, questions, questionCount, timeLimitSec });
    UI.setView('battle');
    renderBattleScreen();
    state.battleTimer = setInterval(tickBattle, 250);
  }

  function tickBattle(){
    if(!state.battle?.active) return;
    state.battle.elapsedSec = Math.floor((Date.now() - state.battle.startedAt) / 1000);
    if(state.battle.mode === GameLogic.MODES.TIME_ATTACK && state.battle.timeLimitSec && state.battle.elapsedSec >= state.battle.timeLimitSec){
      const finished = GameLogic.finishBattle(state.battle, 'time_up');
      state.battle = finished.battle;
      finishCurrentBattle(finished.result);
      return;
    }
    UI.renderBattle(state.battle);
  }

  function renderBattleScreen(){
    UI.renderBattle(state.battle);
    const q = state.battle.questions[state.battle.currentIndex];
    if(q) UI.renderQuestion(q, handleAnswerSubmit);
  }

  function handleAnswerSubmit(userAnswer){
    const q = state.battle.questions[state.battle.currentIndex];
    const ok = QuestionLogic.checkAnswer(q, userAnswer);
    const out = GameLogic.submitAnswer(state.battle, userAnswer, ok, Date.now());
    state.battle = out.battle;
    if(out.finished){
      finishCurrentBattle(out.result);
    }else{
      renderBattleScreen();
    }
  }

  async function finishCurrentBattle(result){
    clearInterval(state.battleTimer);
    const applied = GameLogic.applyBattleResult(state.progress, result, state.characterData);
    state.progress = await Storage.saveProgress(applied.progress);
    state.lastResult = result;
    state.lastApplied = applied;
    UI.renderPlayer(state.progress, getLevelInfo());
    const correctLabels = Object.fromEntries(result.answers.map(a=>[a.index, QuestionLogic.getCorrectLabel(a.question)]));
    UI.renderResult({
      result,
      rewards: applied.rewards,
      stars: applied.stars,
      rank: applied.rank,
      badgeEarned: applied.badgeEarned,
      stageCleared: applied.stageCleared,
      correctLabels,
      onReview: () => showAnswerReview(result),
      onRetryMistakes: () => retryMistakesFromResult(result)
    });
    UI.setView('result');
  }

  function showAnswerReview(result){
    UI.renderAnswerReview(result, q=>QuestionLogic.getCorrectLabel(q), () => retryMistakesFromResult(result));
    UI.setView('review');
  }

  function retryMistakesFromResult(result){
    const questions = (result.answers || []).filter(a=>!a.isCorrect).map(a=>a.question);
    if(!questions.length){ UI.toast('再テストする間違いはありません'); return; }
    const monster = GameLogic.getMonster(state.characterData, result.monsterId) || { id:'review', name:'復習', sprite:'📝', hp:500, defense:0 };
    const stage = GameLogic.getStage(state.characterData, result.stageId);
    startBattle({ mode:GameLogic.MODES.REVIEW, monster, stage, questions, questionCount:questions.length });
  }

  function renderReviewBank(){
    const items = state.progress?.reviewBank || [];
    UI.renderReviewBank(items.slice(0,30), q=>QuestionLogic.getCorrectLabel(q), () => {
      const questions = GameLogic.getReviewQuestions(state.progress, 20);
      if(!questions.length){ UI.toast('復習する問題がありません'); return; }
      startBattle({ mode:GameLogic.MODES.REVIEW, monster:{ id:'review', name:'復習モンスター', sprite:'📝', hp:600, defense:0 }, stage:null, questions, questionCount:questions.length });
    });
  }

  async function importProgress(event){
    const file = event.target.files?.[0];
    if(!file) return;
    try{
      const data = await Storage.readJsonFile(file);
      state.progress = await Storage.saveProgress(GameLogic.ensureProgress(data));
      renderAll();
      UI.toast('進捗データをインポートしました');
    }catch(e){ UI.toast('進捗データを読み込めませんでした'); }
    event.target.value = '';
  }



  function showFatalError(error){
    console.error(error);
    const toast = document.getElementById('toast');
    if(toast){
      toast.textContent = `起動に失敗しました: ${error.message || error}`;
      toast.classList.remove('hidden');
    }
  }

  global.App = { init, state };
  document.addEventListener('DOMContentLoaded',()=>{ init().catch(showFatalError); });
})(window);

(function(global){
  'use strict';

  const MODES = Object.freeze({
    PROGRESSION_100: 'progression100',
    PRACTICE_COUNT: 'practiceCount',
    TIME_ATTACK: 'timeAttack',
    REVIEW: 'review'
  });

  function clamp(value,min,max){ return Math.max(min, Math.min(max, value)); }
  function now(){ return Date.now(); }
  function deepClone(x){ return JSON.parse(JSON.stringify(x)); }

  function defaultProgress(){
    return {
      version: 1,
      xp: 0,
      coins: 0,
      openedStages: ['easy'],
      badges: {},
      defeated: {},
      records: {},
      history: [],
      reviewBank: []
    };
  }

  function ensureProgress(progress){
    return Object.assign(defaultProgress(), progress || {}, {
      openedStages: Array.isArray(progress?.openedStages) ? progress.openedStages : ['easy'],
      badges: progress?.badges || {},
      defeated: progress?.defeated || {},
      records: progress?.records || {},
      history: Array.isArray(progress?.history) ? progress.history : [],
      reviewBank: Array.isArray(progress?.reviewBank) ? progress.reviewBank : []
    });
  }

  function getStages(characterData){
    const difficulties = Array.isArray(characterData?.difficulties) ? characterData.difficulties : [];
    return difficulties.map((d,index)=>({
      id: d.id,
      name: d.name || d.id,
      icon: d.icon || '🗺️',
      color: d.color || '#5bbfb5',
      xpMulti: Number(d.xpMulti || 1),
      order: Number(d.order ?? index),
      requiredBadges: Number(d.requiredBadges || characterData?.settings?.stageClearBadgeCount || 5),
      openCost: Number(d.openCost ?? (index === 0 ? 0 : 300 * (index + 1) * Number(d.xpMulti || 1)))
    })).sort((a,b)=>a.order-b.order);
  }

  function getStage(characterData, stageId){ return getStages(characterData).find(s=>s.id===stageId); }
  function getMonsters(characterData){ return Array.isArray(characterData?.monsters) ? characterData.monsters : []; }
  function getMonstersByStage(characterData, stageId){ return getMonsters(characterData).filter(m=>(m.stageId || m.difficulty) === stageId); }
  function getMonster(characterData, monsterId){ return getMonsters(characterData).find(m=>m.id===monsterId); }

  function getStageBadgeIds(characterData, stageId){
    return getMonstersByStage(characterData, stageId).map(m=>m.badge?.id).filter(Boolean);
  }
  function getBadgeCountForStage(progress, characterData, stageId){
    const p = ensureProgress(progress);
    const ids = new Set(getStageBadgeIds(characterData, stageId));
    return Object.keys(p.badges || {}).filter(id=>ids.has(id)).length;
  }
  function isStageCleared(progress, characterData, stageId){
    const stage = getStage(characterData, stageId);
    if(!stage) return false;
    return getBadgeCountForStage(progress, characterData, stageId) >= stage.requiredBadges;
  }
  function isStageOpen(progress, characterData, stageId){
    const p = ensureProgress(progress);
    const stages = getStages(characterData);
    const index = stages.findIndex(s=>s.id===stageId);
    if(index <= 0) return true;
    if(p.openedStages.includes(stageId)) return true;
    return isStageCleared(p, characterData, stages[index-1].id);
  }
  function canOpenStageWithCoins(progress, characterData, stageId){
    const p = ensureProgress(progress);
    const stage = getStage(characterData, stageId);
    return Boolean(stage && !isStageOpen(p, characterData, stageId) && p.coins >= stage.openCost);
  }
  function openStageWithCoins(progress, characterData, stageId){
    const p = ensureProgress(deepClone(progress));
    const stage = getStage(characterData, stageId);
    if(!stage) return { progress:p, ok:false, reason:'stage_not_found' };
    if(isStageOpen(p, characterData, stageId)) return { progress:p, ok:true, alreadyOpen:true, cost:0 };
    if(p.coins < stage.openCost) return { progress:p, ok:false, reason:'not_enough_coins', need:stage.openCost };
    p.coins -= stage.openCost;
    p.openedStages = Array.from(new Set([...(p.openedStages || []), stageId]));
    return { progress:p, ok:true, cost:stage.openCost };
  }

  function createBattle({ mode, monster, stage, questions, questionCount, timeLimitSec }){
    const modeId = mode || MODES.PROGRESSION_100;
    const total = Number(questionCount || questions?.length || 100);
    const hpScale = modeId === MODES.PROGRESSION_100 ? 1 : Math.max(0.2, total / 100);
    const hpMax = Math.max(1, Math.round(Number(monster?.hp || 1000) * hpScale));
    return {
      id: `battle_${Date.now()}`,
      mode: modeId,
      monster: deepClone(monster || { id:'practice', name:'練習モンスター', sprite:'✨', hp:hpMax, defense:0, xpReward:0 }),
      stage: stage ? deepClone(stage) : null,
      questions: deepClone(questions || []),
      totalQuestions: total,
      currentIndex: 0,
      startedAt: now(),
      currentStartedAt: now(),
      elapsedSec: 0,
      timeLimitSec: timeLimitSec ? Number(timeLimitSec) : null,
      hpMax,
      hpCurrent: hpMax,
      powerGauge: 100,
      combo: 0,
      maxCombo: 0,
      totalDamage: 0,
      answers: [],
      active: true,
      finished: false,
      victory: false,
      finishReason: null
    };
  }

  function calculateDamage({ battle, question, answerTimeSec }){
    const expected = Number(question.expectedAnswerSeconds || 6);
    const speedMultiplier = clamp(expected / Math.max(0.35, answerTimeSec), 0.35, 2.4);
    const comboMultiplier = 1 + Math.min((battle.combo || 0) * 0.04, 0.7);
    const gaugeMultiplier = clamp((battle.powerGauge || 0) / 100, 0.25, 1.15);
    const defenseFactor = Math.max(0.35, 1 - Number(battle.monster?.defense || 0) / 100);
    const targetCorrectRate = clamp(Number(battle.monster?.targetCorrectRate || 0.85), 0.55, 0.98);
    const budget = Math.max(1, battle.mode === MODES.PROGRESSION_100 ? 100 : battle.totalQuestions || 100);
    const base = battle.hpMax / (budget * targetCorrectRate);
    return Math.max(1, Math.round(base * speedMultiplier * comboMultiplier * gaugeMultiplier * defenseFactor));
  }

  function submitAnswer(battle, userAnswer, isCorrect, currentTime){
    if(!battle?.active) return { battle, ignored:true };
    const b = deepClone(battle);
    const t = currentTime || now();
    const q = b.questions[b.currentIndex];
    if(!q){ return finishBattle(b, 'no_question'); }
    const answerTimeSec = Math.max(0.1, (t - b.currentStartedAt) / 1000);
    let damage = 0;
    if(isCorrect){
      b.combo += 1;
      b.maxCombo = Math.max(b.maxCombo || 0, b.combo);
      damage = calculateDamage({ battle:b, question:q, answerTimeSec });
      b.hpCurrent = Math.max(0, b.hpCurrent - damage);
      b.totalDamage += damage;
      b.powerGauge = clamp(b.powerGauge + 3 + (answerTimeSec <= Number(q.expectedAnswerSeconds || 6) ? 4 : 0), 0, 100);
    }else{
      b.combo = 0;
      b.powerGauge = clamp(b.powerGauge - 15, 0, 100);
    }
    b.answers.push({
      index: b.currentIndex,
      question: q,
      userAnswer,
      isCorrect,
      answerTimeSec: Math.round(answerTimeSec * 10) / 10,
      expectedAnswerSeconds: q.expectedAnswerSeconds,
      damage
    });
    b.currentIndex += 1;
    b.currentStartedAt = t;
    b.elapsedSec = Math.round((t - b.startedAt) / 1000);

    if(b.mode === MODES.PROGRESSION_100 && b.hpCurrent <= 0) return finishBattle(b, 'boss_defeated');
    if(b.mode === MODES.TIME_ATTACK && b.timeLimitSec && b.elapsedSec >= b.timeLimitSec) return finishBattle(b, 'time_up');
    if(b.currentIndex >= b.questions.length) return finishBattle(b, 'questions_done');
    return { battle:b, event:{ isCorrect, damage, answerTimeSec }, finished:false };
  }

  function finishBattle(battle, reason){
    const b = deepClone(battle);
    b.active = false;
    b.finished = true;
    b.finishReason = reason;
    b.elapsedSec = Math.round((now() - b.startedAt) / 1000);
    b.victory = b.mode === MODES.PROGRESSION_100 ? b.hpCurrent <= 0 : true;
    return { battle:b, result:buildResult(b), finished:true };
  }

  function buildResult(battle){
    const answers = battle.answers || [];
    const correct = answers.filter(a=>a.isCorrect).length;
    const total = answers.length;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    const correctTimes = answers.filter(a=>a.isCorrect).map(a=>a.answerTimeSec);
    const avgSpeed = correctTimes.length ? Math.round((correctTimes.reduce((s,t)=>s+t,0)/correctTimes.length)*10)/10 : 0;
    return {
      id: battle.id,
      date: new Date().toISOString(),
      mode: battle.mode,
      monsterId: battle.monster?.id,
      monsterName: battle.monster?.name,
      stageId: battle.stage?.id || battle.monster?.difficulty || battle.monster?.stageId,
      victory: Boolean(battle.victory),
      finishReason: battle.finishReason,
      total,
      correct,
      accuracy,
      avgSpeed,
      elapsedSec: battle.elapsedSec,
      maxCombo: battle.maxCombo || 0,
      totalDamage: battle.totalDamage || 0,
      hpRemaining: battle.hpCurrent,
      hpMax: battle.hpMax,
      answers
    };
  }

  function calculateRank(avgSpeed){
    if(!avgSpeed) return 'D';
    if(avgSpeed <= 2) return 'S';
    if(avgSpeed <= 4) return 'A';
    if(avgSpeed <= 7) return 'B';
    if(avgSpeed <= 12) return 'C';
    return 'D';
  }
  function calculateStars(result){
    if(!result?.victory) return 0;
    if(result.accuracy >= 97 && result.avgSpeed <= 3) return 3;
    if(result.accuracy >= 90 && result.avgSpeed <= 6) return 2;
    return 1;
  }

  function calculateRewards(result, progress, monster, stage){
    const p = ensureProgress(progress);
    const firstDefeat = Boolean(result.victory && monster?.id && !p.defeated[monster.id]);
    const firstBadge = Boolean(result.victory && result.mode === MODES.PROGRESSION_100 && monster?.badge?.id && !p.badges[monster.badge.id]);
    let xp = Math.round(result.correct * 2 + result.total * 0.25);
    let coins = 0;
    if(result.mode === MODES.PROGRESSION_100){
      xp += result.victory ? Number(monster?.xpReward || 0) : Math.round(result.correct * 0.5);
      coins += Math.round(result.correct * 0.5);
      if(firstDefeat) xp += Math.round(Number(monster?.xpReward || 0) * 0.5);
    }else if(result.mode === MODES.PRACTICE_COUNT){
      coins += Math.round(result.correct * 3 + result.maxCombo * 2 + (result.accuracy >= 90 ? 20 : 0));
      xp += Math.round(result.correct * 0.5);
    }else if(result.mode === MODES.TIME_ATTACK){
      coins += Math.round(result.correct * 4 + result.maxCombo * 3 + (result.avgSpeed && result.avgSpeed <= 4 ? 30 : 0));
      xp += Math.round(result.correct * 0.4);
    }else if(result.mode === MODES.REVIEW){
      coins += Math.round(result.correct * 2 + (result.accuracy === 100 ? 15 : 0));
      xp += Math.round(result.correct * 0.3);
    }
    if(!firstDefeat && result.mode === MODES.PROGRESSION_100) xp = Math.round(xp * 0.45);
    return { xp: Math.max(0,xp), coins: Math.max(0,coins), firstDefeat, firstBadge };
  }

  function applyBattleResult(progress, result, characterData){
    const p = ensureProgress(deepClone(progress));
    const monster = getMonster(characterData, result.monsterId) || {};
    const stage = getStage(characterData, result.stageId);
    const rewards = calculateRewards(result, p, monster, stage);
    const stars = calculateStars(result);
    const rank = calculateRank(result.avgSpeed);
    p.xp += rewards.xp;
    p.coins += rewards.coins;

    let badgeEarned = null;
    if(result.mode === MODES.PROGRESSION_100 && result.victory && monster.badge?.id){
      p.defeated[monster.id] = true;
      if(!p.badges[monster.badge.id]){
        badgeEarned = {
          id: monster.badge.id,
          name: monster.badge.name,
          icon: monster.badge.icon,
          monsterId: monster.id,
          stageId: result.stageId,
          date: new Date().toISOString()
        };
        p.badges[monster.badge.id] = badgeEarned;
      }
    }

    const prev = p.records[monster.id] || { plays:0, stars:0, bestAccuracy:0, bestAvgSpeed:null, bestRank:'D' };
    const betterSpeed = result.avgSpeed && (!prev.bestAvgSpeed || result.avgSpeed < prev.bestAvgSpeed);
    p.records[monster.id] = {
      plays: (prev.plays || 0) + 1,
      stars: Math.max(prev.stars || 0, stars),
      bestAccuracy: Math.max(prev.bestAccuracy || 0, result.accuracy),
      bestAvgSpeed: betterSpeed ? result.avgSpeed : prev.bestAvgSpeed,
      bestRank: betterRank(prev.bestRank, rank),
      lastPlayedAt: result.date
    };

    const mistakes = result.answers.filter(a=>!a.isCorrect).map(a=>({
      id: `review_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      sourceBattleId: result.id,
      date: result.date,
      monsterId: result.monsterId,
      stageId: result.stageId,
      question: a.question,
      userAnswer: a.userAnswer
    }));
    p.reviewBank = [...mistakes, ...(p.reviewBank || [])].slice(0,300);

    const compactResult = Object.assign({}, result, { answers: result.answers.slice(0,120), rewards, stars, rank, badgeEarned });
    p.history = [compactResult, ...(p.history || [])].slice(0,80);
    return { progress:p, rewards, stars, rank, badgeEarned, stageCleared: stage ? isStageCleared(p, characterData, stage.id) : false };
  }

  function betterRank(a,b){
    const order = ['S','A','B','C','D'];
    return order.indexOf(b) < order.indexOf(a || 'D') ? b : (a || b || 'D');
  }

  function getLevelInfo(xp, levelData){
    const levels = (levelData?.levels || []).slice().sort((a,b)=>a.requiredTotalXp-b.requiredTotalXp);
    if(!levels.length) return { level:1, title:'Lv.1', currentXp:xp, nextXp:100, progress:0 };
    let current = levels[0];
    for(const lvl of levels){ if(xp >= lvl.requiredTotalXp) current = lvl; }
    const next = levels.find(l=>l.requiredTotalXp > xp);
    const currentBase = current.requiredTotalXp;
    const nextBase = next ? next.requiredTotalXp : currentBase + 1000;
    return {
      level: current.level,
      title: current.title,
      message: current.message,
      currentXp: xp - currentBase,
      neededXp: nextBase - currentBase,
      nextLevel: next?.level || current.level + 1,
      progress: clamp(((xp - currentBase) / (nextBase - currentBase)) * 100, 0, 100)
    };
  }

  function getReviewQuestions(progress, limit){
    const p = ensureProgress(progress);
    return (p.reviewBank || []).slice(0, limit || 20).map(item=>deepClone(item.question));
  }

  global.GameLogic = {
    MODES,
    defaultProgress,
    ensureProgress,
    getStages,
    getStage,
    getMonsters,
    getMonster,
    getMonstersByStage,
    getBadgeCountForStage,
    isStageCleared,
    isStageOpen,
    canOpenStageWithCoins,
    openStageWithCoins,
    createBattle,
    submitAnswer,
    finishBattle,
    buildResult,
    calculateDamage,
    calculateRank,
    calculateStars,
    calculateRewards,
    applyBattleResult,
    getLevelInfo,
    getReviewQuestions
  };
})(window);

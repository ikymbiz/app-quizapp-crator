(function(global){
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const fmtTime = sec => `${Math.floor(sec/60).toString().padStart(2,'0')}:${Math.floor(sec%60).toString().padStart(2,'0')}`;

  let labels = null;
  function setLabels(value){ labels = value || null; }
  function modeName(mode){
    if(labels?.modes?.[mode]?.name) return labels.modes[mode].name;
    if(mode === 'progression100') return 'バトル';
    if(mode === 'practiceCount') return 'トレーニング';
    if(mode === 'timeAttack') return 'タイムアタック';
    if(mode === 'review') return 'ブートキャンプ';
    return mode;
  }
  function modeSummary(mode){ return labels?.modes?.[mode]?.summary || ''; }
  function modeCallout(mode){ return labels?.modes?.[mode]?.monsterCallout || ''; }
  function screenLabel(section, key, fallback){ return labels?.screens?.[section]?.[key] ?? fallback ?? ''; }

  function activate(element, handler){
    if(!element || typeof handler !== 'function') return;
    // タップごとに pointerup（または touchend）→ ブラウザが合成 click を発火する流れになるため、
    // 直前の pointerup/touchend が処理した click だけを抑制する。
    // 時間窓全体をブロックする方式だと、テンキーで「77」「99」のような同一キー連打ができないため、
    // 「直近の pointerup/touchend が処理済みかどうか」のフラグだけで重複発火を防ぐ。
    let suppressClick = false;
    let suppressTimer = null;
    const armSuppress = () => {
      suppressClick = true;
      if(suppressTimer) clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => { suppressClick = false; suppressTimer = null; }, 600);
    };
    if(window.PointerEvent){
      element.addEventListener('pointerup', event => { armSuppress(); handler(event); });
    }else{
      element.addEventListener('touchend', event => { event.preventDefault(); armSuppress(); handler(event); }, { passive:false });
    }
    element.addEventListener('click', event => {
      if(suppressClick){
        // 直前の pointerup/touchend が処理済み → 合成 click は捨てる
        suppressClick = false;
        if(suppressTimer){ clearTimeout(suppressTimer); suppressTimer = null; }
        return;
      }
      handler(event);
    });
  }

  function setView(view){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    $(`${view}-view`)?.classList.add('active');
    document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active', b.dataset.view === view));
    document.body.classList.toggle('in-battle', view === 'battle');
    window.scrollTo(0,0);
  }

  function renderPlayer(progress, levelInfo){
    $('player-level').textContent = `Lv.${levelInfo.level} ${levelInfo.title || ''}`;
    $('player-xp').textContent = `${progress.xp.toLocaleString()} XP / ${progress.coins.toLocaleString()} G`;
  }

  function renderHome({ progress, levelInfo, stages, stageStats }){
    $('home-level-title').textContent = `Level ${levelInfo.level}：${levelInfo.title || ''}`;
    $('home-level-message').textContent = levelInfo.message || '学習を続けよう';
    $('home-level-progress-text').textContent = `${levelInfo.currentXp} / ${levelInfo.neededXp} XP to Lv.${levelInfo.nextLevel}`;
    $('home-level-progress').style.width = `${levelInfo.progress}%`;
    $('home-coins').textContent = `${progress.coins.toLocaleString()} G`;
    $('home-stage-list').innerHTML = stages.map(stage=>{
      const stat = stageStats[stage.id];
      return `<div class="card">
        <div class="stage-head"><div class="stage-icon">${esc(stage.icon)}</div><div>
          <b>${esc(stage.name)}</b><br><span class="tiny muted">バッジ ${stat.badges}/${stage.requiredBadges} ・ ${stat.open ? 'オープン中' : `未オープン（${stage.openCost}G）`}</span>
        </div></div>
        <div class="progress-track" style="margin-top:10px"><div class="progress-fill" style="width:${Math.min(100, stat.badges/stage.requiredBadges*100)}%"></div></div>
      </div>`;
    }).join('');
  }

  function renderModeOptions(selectedMode){
    document.querySelectorAll('[data-mode-option]').forEach(btn=>{
      btn.classList.toggle('btn-primary', btn.dataset.modeOption === selectedMode);
      btn.classList.toggle('btn-mint', btn.dataset.modeOption !== selectedMode);
    });
    $('practice-config').classList.toggle('hidden', selectedMode !== 'practiceCount');
    $('time-config').classList.toggle('hidden', selectedMode !== 'timeAttack');
  }

  function renderStageSelector({ stages, selectedStageId, getStats, onSelect, onOpen }){
    const root = $('stage-list');
    root.innerHTML = '';
    stages.forEach(stage=>{
      const stat = getStats(stage.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `card stage-card ${stage.id===selectedStageId?'selected':''} ${stat.open?'':'locked'}`;
      card.innerHTML = `<div class="stage-head"><div class="stage-icon">${esc(stage.icon)}</div><div style="flex:1">
        <b>${esc(stage.name)}</b><br>
        <span class="tiny muted">${stat.open ? 'オープン中' : 'ロック中'} / バッジ ${stat.badges}/${stage.requiredBadges}</span>
      </div></div>
      ${stat.open ? '' : `<div class="notice tiny" style="margin-top:10px">${stage.openCost.toLocaleString()}Gでオープン可能</div>`}`;
      activate(card,()=> stat.open ? onSelect(stage.id) : onOpen(stage.id));
      root.appendChild(card);
    });
  }

  function renderMonsterSelector({ monsters, selectedMonsterId, records, onSelect }){
    const root = $('monster-list');
    root.innerHTML = '';
    if(!monsters.length){ root.innerHTML = '<div class="notice">このステージにはまだモンスターがありません。character.jsonに追加してください。</div>'; return; }
    monsters.forEach(monster=>{
      const record = records[monster.id] || {};
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `card monster-card ${monster.id===selectedMonsterId?'selected':''}`;
      card.innerHTML = `<div class="monster-head">
        <div class="monster-icon">${esc(monster.sprite || '✨')}</div>
        <div class="monster-info">
          <b>${esc(monster.name)}</b>
          <div class="tiny muted">HP ${Number(monster.hp || 0).toLocaleString()} / ${esc(monster.origin || '')}</div>
          <div class="badge-row" style="margin-top:5px">
            ${monster.badge ? `<span class="badge-token">${esc(monster.badge.icon || '🏅')} ${esc(monster.badge.name)}</span>` : ''}
            ${record.bestRank ? `<span class="rank rank-${esc(record.bestRank)}">${esc(record.bestRank)}</span>` : ''}
            ${record.stars ? `<span class="tiny">${'★'.repeat(record.stars)}${'☆'.repeat(3-record.stars)}</span>` : '<span class="tiny muted">未撃破</span>'}
          </div>
        </div>
      </div>`;
      activate(card,()=>onSelect(monster.id));
      root.appendChild(card);
    });
  }

  function renderStartSummary({ mode, stage, monster, unit, canProgress }){
    const text = `${modeName(mode)}：${modeSummary(mode)}`;
    $('start-summary').innerHTML = `<b>${esc(stage?.name || '')} / ${esc(monster?.name || '')}</b><br><span class="tiny muted">${esc(unit?.title || '')} / ${esc(text)}</span>${canProgress?'':'<br><span class="tiny danger">このモードではステージ進行しません</span>'}`;
  }

  function renderBattle(battle){
    $('battle-progress').textContent = battle.mode === 'timeAttack' ? `${battle.answers.length}` : `${Math.min(battle.currentIndex+1,battle.questions.length)}/${battle.questions.length}`;
    $('battle-combo').textContent = `${battle.combo || 0} COMBO`;
    $('battle-timer').textContent = battle.timeLimitSec ? `${fmtTime(Math.max(0,battle.timeLimitSec - battle.elapsedSec))}` : fmtTime(battle.elapsedSec || 0);
    $('battle-monster-icon').textContent = battle.monster?.sprite || '✨';
    $('battle-monster-name').textContent = battle.monster?.name || '';
    const calloutEl = $('battle-monster-callout');
    if(calloutEl) calloutEl.textContent = modeCallout(battle.mode) || '';
    $('battle-hp-text').textContent = `${Math.ceil(battle.hpCurrent).toLocaleString()} / ${battle.hpMax.toLocaleString()}`;
    $('battle-hp').style.width = `${Math.max(0, battle.hpCurrent / battle.hpMax * 100)}%`;
    $('battle-gauge').style.width = `${battle.powerGauge}%`;
    $('battle-gauge-text').textContent = `${Math.round(battle.powerGauge)}%`;
  }

  function renderQuestion(question, onSubmit){
    const contentRoot = $('question-content');
    contentRoot.innerHTML = (question.content || []).map(renderContentBlock).join('');
    const area = $('answer-area');
    area.innerHTML = '';
    const type = question.response?.type || 'numeric';
    if(type === 'choice') renderChoiceAnswer(area, question, onSubmit);
    else if(type === 'text') renderTextAnswer(area, onSubmit);
    else renderNumericAnswer(area, onSubmit);
  }

  function renderContentBlock(block){
    if(block.type === 'formula') return `<div class="content-block content-formula">${esc(block.text)}</div>`;
    if(block.type === 'image') return `<img class="content-media" src="${esc(block.src)}" alt="${esc(block.alt || '問題画像')}">`;
    if(block.type === 'video') return `<video class="content-media" src="${esc(block.src)}" controls playsinline></video>`;
    if(block.type === 'audio') return `<audio src="${esc(block.src)}" controls></audio>`;
    return `<div class="content-block content-text">${esc(block.text || '')}</div>`;
  }

  function renderNumericAnswer(area, onSubmit){
    let buffer = '';
    area.innerHTML = `<div class="answer-display" id="answer-display">&nbsp;</div><div class="numpad"></div>`;
    const pad = area.querySelector('.numpad');
    const keys = ['7','8','9','OK','4','5','6','1','2','3','C','0','←'];
    keys.forEach(k=>{
      const btn = document.createElement('button');
      btn.type='button'; btn.className = `key ${k==='OK'?'ok':''}`; btn.textContent = k;
      if(k==='OK') activate(btn,()=>{ if(buffer !== '') onSubmit(buffer); });
      else if(k==='C') activate(btn,()=>{ buffer=''; update(); });
      else if(k==='←') activate(btn,()=>{ buffer=buffer.slice(0,-1); update(); });
      else activate(btn,()=>{ if(buffer.length < 9){ buffer += k; update(); } });
      pad.appendChild(btn);
    });
    function update(){ area.querySelector('#answer-display').innerHTML = buffer ? esc(buffer) : '&nbsp;'; }
  }

  function renderChoiceAnswer(area, question, onSubmit){
    area.innerHTML = '<div class="choice-grid"></div>';
    const grid = area.querySelector('.choice-grid');
    (question.response.choices || []).forEach(choice=>{
      const btn = document.createElement('button');
      btn.type='button'; btn.className='btn choice-btn'; btn.textContent=choice.label;
      activate(btn,()=>onSubmit(choice.id));
      grid.appendChild(btn);
    });
  }

  function renderTextAnswer(area, onSubmit){
    area.innerHTML = `<div class="text-answer"><input id="text-answer-input" type="text" autocomplete="off" placeholder="答えを入力"><button class="btn btn-primary" id="text-answer-submit">OK</button></div>`;
    const input = area.querySelector('#text-answer-input');
    const submit = () => { if(input.value.trim()) onSubmit(input.value); };
    activate(area.querySelector('#text-answer-submit'),submit);
    input.addEventListener('keydown',e=>{ if(e.key === 'Enter') submit(); });
    input.focus();
  }

  function renderResult({ result, rewards, stars, rank, badgeEarned, stageCleared, correctLabels, onReview, onRetryMistakes }){
    const title = result.mode === 'progression100'
      ? (result.victory ? screenLabel('result','victory','VICTORY!') : screenLabel('result','defeat','ざんねん...'))
      : screenLabel('result','neutral','RESULT');
    $('result-main').innerHTML = `<section class="card result-hero">
      <span class="pill">${esc(modeName(result.mode))}</span>
      <div class="result-title">${esc(title)}</div>
      <p class="muted">${esc(result.monsterName || '')} ${result.victory ? 'クリア' : '未クリア'}</p>
      <div style="font-size:28px;letter-spacing:4px">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div>
      <div style="margin-top:8px"><span class="rank rank-${rank}">${rank}</span></div>
    </section>
    <section class="card"><div class="stat-grid">
      <div class="stat"><small>正答</small><b>${result.correct}/${result.total}</b></div>
      <div class="stat"><small>正答率</small><b>${result.accuracy}%</b></div>
      <div class="stat"><small>平均</small><b>${result.avgSpeed}s</b></div>
      <div class="stat"><small>最大COMBO</small><b>${result.maxCombo}</b></div>
    </div></section>
    <section class="card"><h3 class="section-title">報酬</h3>
      <div class="badge-row"><span class="badge-token">XP +${rewards.xp}</span><span class="badge-token">賞金 +${rewards.coins}G</span>${badgeEarned ? `<span class="badge-token">${esc(badgeEarned.icon)} ${esc(badgeEarned.name)} 獲得</span>` : ''}${stageCleared ? '<span class="badge-token">🎉 ステージクリア</span>' : ''}</div>
    </section>
    <section class="card" id="mistakes-section"><h3 class="section-title">まちがえた問題</h3><div id="result-mistakes" class="mistake-list"></div></section>
    <div class="grid-2"><button class="btn btn-mint" id="review-button">答えを見る</button><button class="btn btn-primary" id="retry-mistakes-button">${esc(screenLabel('review','retryButton','間違いだけ再テスト'))}</button></div>`;
    renderMistakes($('result-mistakes'), result.answers.filter(a=>!a.isCorrect), correctLabels);
    $('mistakes-section').classList.toggle('hidden', !result.answers.some(a=>!a.isCorrect));
    activate($('review-button'), onReview);
    activate($('retry-mistakes-button'), onRetryMistakes);
    $('retry-mistakes-button').disabled = !result.answers.some(a=>!a.isCorrect);
  }

  function renderMistakes(root, answers, correctLabels){
    root.innerHTML = answers.length ? answers.map(a=>`<div class="mistake-item"><b>Q${a.index+1}</b><br>${renderQuestionPlain(a.question)}<br><span class="tiny muted">あなたの答え：${esc(answerLabel(a.userAnswer, a.question))}</span><br><span class="tiny">正解：${esc(correctLabels?.[a.index] || '')}</span></div>`).join('') : '<p class="muted">間違いはありません。</p>';
  }

  function renderReviewBank(items, correctLabelForQuestion, onStartReview){
    $('review-list').innerHTML = items.length ? items.map((item,i)=>`<div class="mistake-item"><b>${i+1}. ${esc(item.monsterId || '')}</b><br>${renderQuestionPlain(item.question)}<br><span class="tiny muted">正解：${esc(correctLabelForQuestion(item.question))}</span></div>`).join('') : '<div class="notice">復習する問題はまだありません。</div>';
    $('start-review-button').disabled = !items.length;
    $('start-review-button').onclick = onStartReview;
  }

  function renderQuestionPlain(question){
    return (question.content || []).map(b=> b.type === 'formula' || b.type === 'text' ? esc(b.text) : `[${esc(b.type)}]`).join(' / ');
  }
  function answerLabel(value, question){
    if(question.response?.type === 'choice'){
      const c = (question.response.choices || []).find(x=>x.id===value || String(x.value)===String(value));
      return c ? c.label : value;
    }
    return value;
  }
  function modeLabel(mode){ return modeName(mode); }


  function renderAnswerReview(result, correctLabelForQuestion, onRetryMistakes){
    const answers = result.answers || [];
    $('review-list').innerHTML = answers.length ? answers.map(a=>`<div class="mistake-item"><b>Q${a.index+1} ${a.isCorrect ? '⭕' : '❌'}</b><br>${renderQuestionPlain(a.question)}<br><span class="tiny muted">あなたの答え：${esc(answerLabel(a.userAnswer, a.question))}</span><br><span class="tiny">正解：${esc(correctLabelForQuestion(a.question))}</span><br><span class="tiny muted">回答時間：${a.answerTimeSec}s / 期待：${a.expectedAnswerSeconds}s</span></div>`).join('') : '<div class="notice">表示できる回答がありません。</div>';
    $('start-review-button').disabled = !answers.some(a=>!a.isCorrect);
    $('start-review-button').textContent = '間違いだけ再テスト';
    $('start-review-button').onclick = onRetryMistakes;
  }

  function renderEncyclopedia(monsters, progress){
    $('encyclopedia-list').innerHTML = monsters.map(m=>{
      const got = m.badge?.id && progress.badges[m.badge.id];
      return `<div class="card monster-head"><div class="monster-icon">${got ? esc(m.sprite || '✨') : '❔'}</div><div><b>${esc(m.name)}</b><br><span class="tiny muted">${esc(m.origin || '')}</span><p class="tiny">${got ? esc(m.description || '') : '撃破すると図鑑に登録されます。'}</p>${m.badge ? `<span class="badge-token">${got ? '獲得済み' : '未獲得'}：${esc(m.badge.icon || '🏅')} ${esc(m.badge.name)}</span>` : ''}</div></div>`;
    }).join('');
  }

  function renderHistory(history){
    $('history-list').innerHTML = history.length ? history.map(h=>`<div class="card history-item"><div><b>${esc(h.monsterName || modeLabel(h.mode))}</b><br><span class="tiny muted">${new Date(h.date).toLocaleString()} / ${modeLabel(h.mode)}</span></div><div style="text-align:right"><b>${h.accuracy}%</b><br><span class="tiny muted">${h.correct}/${h.total}</span></div></div>`).join('') : '<div class="notice">まだ記録がありません。</div>';
  }

  function toast(message){
    const box = $('toast');
    box.textContent = message;
    box.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(()=>box.classList.add('hidden'), 2500);
  }

  global.UI = {
    $, esc, fmtTime, activate,
    setLabels,
    setView,
    renderPlayer,
    renderHome,
    renderModeOptions,
    renderStageSelector,
    renderMonsterSelector,
    renderStartSummary,
    renderBattle,
    renderQuestion,
    renderResult,
    renderReviewBank,
    renderAnswerReview,
    renderEncyclopedia,
    renderHistory,
    toast,
    modeLabel,
    modeName
  };
})(window);

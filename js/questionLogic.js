(function(global){
  'use strict';

  const symbols = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  function randomInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function shuffle(arr){
    const copy = arr.slice();
    for(let i=copy.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [copy[i],copy[j]]=[copy[j],copy[i]]; }
    return copy;
  }
  function normalizeText(value){
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s　]/g,'')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0xFEE0))
      .replace(/[ーｰ]/g,'ー');
  }

  function getUnits(mathUnits){ return Array.isArray(mathUnits?.units) ? mathUnits.units : []; }
  function getUnit(mathUnits, unitId){ return getUnits(mathUnits).find(u=>u.id===unitId) || getUnits(mathUnits)[0]; }
  function getUnitForMonster(mathUnits, monster){
    const map = mathUnits?.monsterUnitMap || {};
    return getUnit(mathUnits, monster.unitId || map[monster.id]);
  }
  function getExpectedSeconds(unit, fallback){ return Number(unit?.expectedAnswerSeconds || fallback || 6); }

  function createFormulaQuestion(a, op, b, ans, unit, responseType){
    const base = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      content: [{ type:'formula', text:`${a} ${symbols[op]} ${b} = ?` }],
      expectedAnswerSeconds: getExpectedSeconds(unit),
      meta: { unitId: unit.id, source:'generated', operation:op }
    };
    if(responseType === 'choice'){
      base.response = makeChoiceResponse(ans, unit?.generator?.choiceCount || 4);
    }else{
      base.response = { type:'numeric', correct: ans };
    }
    return base;
  }

  function makeChoiceResponse(correct, count){
    const values = new Set([Number(correct)]);
    const spread = Math.max(3, Math.ceil(Math.abs(correct)*0.12));
    let guard = 0;
    while(values.size < count && guard < 80){
      guard++;
      const delta = randomInt(-spread*2, spread*2) || randomInt(1, spread);
      const v = Math.max(0, Number(correct) + delta);
      values.add(v);
    }
    while(values.size < count) values.add(values.size + Number(correct) + 1);
    const choices = shuffle(Array.from(values)).map((v,i)=>({ id:`c${i+1}`, label:String(v), value:v }));
    const right = choices.find(c=>c.value === Number(correct));
    return { type:'choice', choices, correctId:right.id, correctValue:Number(correct) };
  }

  function generateArithmetic(unit){
    const g = unit.generator || {};
    const [min,max] = g.operandRange || [1,9];
    const op = pick(g.operations || ['+']);
    let a = randomInt(min,max);
    let b = randomInt(min,max);
    let ans;
    if(op === '+') ans = a + b;
    if(op === '-'){
      if(g.nonNegative !== false && a < b) [a,b] = [b,a];
      ans = a - b;
    }
    if(op === '*') ans = a * b;
    if(op === '/'){
      b = Math.max(1,b);
      ans = a;
      a = a * b;
    }
    return createFormulaQuestion(a, op, b, ans, unit, unit.answerType || 'numeric');
  }

  function cloneStaticQuestion(q, unit){
    return {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      content: JSON.parse(JSON.stringify(q.content || [{type:'text', text:q.prompt || ''}])),
      response: JSON.parse(JSON.stringify(q.response)),
      expectedAnswerSeconds: Number(q.expectedAnswerSeconds || unit.expectedAnswerSeconds || 8),
      meta: { unitId: unit.id, source:'static' }
    };
  }

  function generateOne(unit){
    if(!unit) throw new Error('問題単元が見つかりません');
    const kind = unit.generator?.kind || 'arithmetic';
    if(kind === 'static') return cloneStaticQuestion(pick(unit.generator.questions || []), unit);
    return generateArithmetic(unit);
  }

  function generateQuestions({ mathUnits, monster, unitId, count }){
    const unit = unitId ? getUnit(mathUnits, unitId) : getUnitForMonster(mathUnits, monster);
    const total = Math.max(1, Number(count || mathUnits?.defaults?.questionCount || 100));
    return Array.from({length: total},()=>generateOne(unit));
  }

  function getCorrectLabel(question){
    const r = question.response || {};
    if(r.type === 'numeric') return String(r.correct);
    if(r.type === 'choice'){
      const c = (r.choices || []).find(x=>x.id===r.correctId || x.value===r.correctValue);
      return c ? c.label : String(r.correctValue ?? r.correctId ?? '');
    }
    if(r.type === 'text') return String((r.answers || [])[0] || '');
    return '';
  }

  function checkAnswer(question, userAnswer){
    const r = question.response || {};
    if(r.type === 'numeric'){
      const ua = Number(String(userAnswer).trim());
      const tolerance = Number(r.tolerance || 0);
      return Number.isFinite(ua) && Math.abs(ua - Number(r.correct)) <= tolerance;
    }
    if(r.type === 'choice'){
      return String(userAnswer) === String(r.correctId) || String(userAnswer) === String(r.correctValue);
    }
    if(r.type === 'text'){
      const ua = normalizeText(userAnswer);
      return (r.answers || []).some(ans=>normalizeText(ans) === ua);
    }
    return false;
  }

  global.QuestionLogic = {
    generateQuestions,
    generateOne,
    checkAnswer,
    getCorrectLabel,
    getUnit,
    getUnitForMonster,
    normalizeText
  };
})(window);

(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.LOCAL_PROBLEM_TOOL_CONFIG || {};
  const state = { package: null, session: null };
  const schemaForGemini = { type:'object', properties:{ type:{type:'string'}, schemaVersion:{type:'integer'}, packageId:{type:'string'}, title:{type:'string'}, description:{type:'string'}, locale:{type:'string'}, monsterUnitMap:{type:'object'}, units:{type:'array', items:{type:'object', properties:{ id:{type:'string'}, title:{type:'string'}, description:{type:'string'}, expectedAnswerSeconds:{type:'number'}, answerType:{type:'string', enum:['numeric','choice','text']}, contentTypes:{type:'array', items:{type:'string'}}, generator:{type:'object', properties:{ kind:{type:'string'}, questions:{type:'array', items:{type:'object', properties:{ content:{type:'array', items:{type:'object'}}, response:{type:'object'}, expectedAnswerSeconds:{type:'number'}, explanation:{type:'string'}}, required:['content','response']}}}, required:['kind','questions']}}, required:['id','title','expectedAnswerSeconds','answerType','generator'] }}}, required:['type','schemaVersion','packageId','title','units'] };

  function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),2600); }
  function activate(element, handler){
    if(!element || typeof handler !== 'function') return;
    let last = 0;
    const run = event => { const now = Date.now(); if(now - last < 450) return; last = now; handler(event); };
    if(window.PointerEvent) element.addEventListener('pointerup', run);
    else element.addEventListener('touchend', event=>{event.preventDefault();run(event);},{passive:false});
    element.addEventListener('click', run);
  }
  function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function isLocalRuntime(){
    const {protocol, hostname} = location;
    if(protocol === 'file:') return true;
    if(['localhost','127.0.0.1','0.0.0.0'].includes(hostname)) return true;
    if(hostname.endsWith('.local')) return true;
    if(/^10\./.test(hostname)) return true;
    if(/^192\.168\./.test(hostname)) return true;
    if(/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
    return false;
  }
  function isAuthConfigured(){ const id=String(config.googleAuth?.clientId||''); return id && !id.includes('REPLACE_WITH'); }
  function decodeJwt(jwt){ const p=String(jwt||'').split('.')[1]; if(!p) throw new Error('IDトークンを解析できません'); return JSON.parse(decodeURIComponent(Array.from(atob(p.replace(/-/g,'+').replace(/_/g,'/')), c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''))); }
  function allowed(payload){ const emails=(config.googleAuth?.allowedEmails||[]).map(x=>String(x).toLowerCase()); return emails.includes(String(payload.email||'').toLowerCase()); }
  function handleCredential(res){ try{ const payload=decodeJwt(res.credential); state.session={profile:payload, allowed:allowed(payload)}; renderAuth(); }catch(e){ toast(e.message); } }
  function renderGoogleButton(){
    const root=$('google-button'); root.innerHTML='';
    if(!isAuthConfigured()){ $('auth-status').innerHTML='<div class="notice danger">config/local-tool.config.js に Google OAuth Client ID と allowedEmails を設定してください。</div>'; return; }
    if(!window.google?.accounts?.id){ $('auth-status').textContent='Google Identity Services を読み込み中です。'; setTimeout(renderGoogleButton,800); return; }
    window.google.accounts.id.initialize({ client_id:config.googleAuth.clientId, callback:handleCredential, auto_select:false, cancel_on_tap_outside:false });
    window.google.accounts.id.renderButton(root,{theme:'outline',size:'large',shape:'pill',width:280});
  }
  function renderAuth(){
    if(!isLocalRuntime()){
      $('runtime-chip').textContent='非ローカル'; $('locked-view').classList.remove('hidden'); $('auth-view').classList.add('hidden'); $('tool-view').classList.add('hidden');
      $('lock-reason').textContent='このURLはローカル環境ではありません。GitHub Pagesなど公開URLでは問題作成ツールを表示しません。'; return;
    }
    $('runtime-chip').textContent='ローカル'; $('locked-view').classList.add('hidden');
    if(!state.session?.allowed){ $('auth-view').classList.remove('hidden'); $('tool-view').classList.add('hidden');
      if(state.session && !state.session.allowed){ $('auth-status').innerHTML=`<div class="notice danger">${esc(state.session.profile?.email)} は許可されていません。</div>`; }
      renderGoogleButton(); return;
    }
    $('auth-view').classList.add('hidden'); $('tool-view').classList.remove('hidden');
    renderPreview();
  }
  function normalizePackage(raw){
    if(!raw || typeof raw !== 'object') throw new Error('JSONオブジェクトが必要です');
    const pkg = JSON.parse(JSON.stringify(raw));
    pkg.type = 'learning.problemPackage'; pkg.schemaVersion = Number(pkg.schemaVersion||1); pkg.packageId = pkg.packageId || `package_${Date.now()}`; pkg.title = pkg.title || '問題パッケージ'; pkg.locale = pkg.locale || 'ja-JP';
    if(!Array.isArray(pkg.units) || !pkg.units.length) throw new Error('units が必要です');
    pkg.units = pkg.units.map((u,ui)=>{
      if(!u.id || !u.title) throw new Error(`units[${ui}] に id と title が必要です`);
      u.expectedAnswerSeconds = Number(u.expectedAnswerSeconds || 6);
      u.answerType = u.answerType || u.generator?.questions?.[0]?.response?.type || 'numeric';
      u.contentTypes = Array.isArray(u.contentTypes) && u.contentTypes.length ? u.contentTypes : ['text'];
      if(!u.generator) throw new Error(`${u.id}: generator が必要です`);
      if(u.generator.kind === 'static'){
        if(!Array.isArray(u.generator.questions) || !u.generator.questions.length) throw new Error(`${u.id}: questions が必要です`);
        u.generator.questions = u.generator.questions.map((q,qi)=>normalizeQuestion(q,u,qi));
      }
      return u;
    });
    return pkg;
  }
  function normalizeQuestion(q,u,i){
    q = q || {}; q.id = q.id || `${u.id}_q${i+1}`; q.content = Array.isArray(q.content) && q.content.length ? q.content : [{type:'text',text:String(q.prompt||'')}]; q.response = q.response || {}; q.response.type = q.response.type || u.answerType;
    if(q.response.type === 'numeric'){ if(q.response.correct === undefined) throw new Error(`${q.id}: numeric.correct が必要です`); q.response.correct=Number(q.response.correct); }
    if(q.response.type === 'choice'){ if(!Array.isArray(q.response.choices)||q.response.choices.length<2) throw new Error(`${q.id}: choice.choices が必要です`); if(!q.response.correctId && q.response.correctValue===undefined) throw new Error(`${q.id}: correctId または correctValue が必要です`); }
    if(q.response.type === 'text'){ if(!Array.isArray(q.response.answers)||!q.response.answers.length) throw new Error(`${q.id}: text.answers が必要です`); }
    q.expectedAnswerSeconds = Number(q.expectedAnswerSeconds || u.expectedAnswerSeconds || 6); return q;
  }
  function packageToMathUnits(pkg){ return { schemaVersion:1, defaults:{questionCount:100,expectedAnswerSeconds:6,answerType:'numeric'}, monsterUnitMap:pkg.monsterUnitMap||{}, units:pkg.units }; }
  function download(obj, filename){ const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); }
  function looksLikeHtml(text){
    const head = String(text || '').trimStart().slice(0, 80).toLowerCase();
    return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<head') || head.startsWith('<body');
  }
  async function readJsonFile(file){
    const name = String(file?.name || '').toLowerCase();
    const text = await file.text();
    if(looksLikeHtml(text)){
      throw new Error(`${file.name || '選択ファイル'} はHTMLです。問題パッケージJSONではありません。index.htmlではなく .learning-pack.json または mathUnits.json を選択してください。`);
    }
    if(!(name.endsWith('.json') || name.endsWith('.learning-pack.json'))){
      throw new Error(`${file.name || '選択ファイル'} は未対応形式です。.learning-pack.json または .json を選択してください。`);
    }
    try{
      return JSON.parse(text);
    }catch(e){
      throw new Error(`JSONとして読み込めません: ${e.message}`);
    }
  }
  function renderPreview(){
    const root=$('preview');
    if(!state.package){ root.innerHTML='<div class="notice">問題パッケージはまだ読み込まれていません。</div>'; return; }
    root.innerHTML = `<div class="notice ok">${esc(state.package.title)} / ${state.package.units.length}単元</div>` + state.package.units.map(u=>`<div class="unit"><b>${esc(u.title)}</b><br><span class="muted">id:${esc(u.id)} / ${esc(u.answerType)} / 期待${Number(u.expectedAnswerSeconds)}秒</span>${(u.generator.questions||[]).slice(0,3).map(q=>`<div class="question">${esc((q.content||[]).map(c=>c.text||c.latex||c.alt||c.src||'').join(' / '))}</div>`).join('')}</div>`).join('');
  }
  function parseJsonText(text, label){
    if(looksLikeHtml(text)) throw new Error(`${label || '入力内容'} はHTMLです。問題パッケージJSONを貼り付けてください。`);
    try{ return JSON.parse(text || '{}'); }
    catch(e){ throw new Error(`JSONとして読み込めません: ${e.message}`); }
  }
  function applyFromText(){ const pkg=normalizePackage(parseJsonText($('package-json').value||'{}','JSON編集欄')); state.package=pkg; $('package-json').value=JSON.stringify(pkg,null,2); $('validation-result').className='notice ok'; $('validation-result').textContent='OK: 問題パッケージとして利用できます。'; renderPreview(); }
  function fillPrompt(){ $('gemini-prompt').value='小学3年生向けの算数問題を作ってください。単元は「時刻と時間」。スマホ1画面で読める短い問題にしてください。回答形式は四択。10問作ってください。'; }
  async function generateWithGemini(){
    const apiKey=$('gemini-api-key').value.trim(); const model=$('gemini-model').value.trim() || config.gemini?.defaultModel || 'gemini-2.5-flash'; const count=Number($('gemini-count').value||10); const answerType=$('gemini-answer-type').value; const prompt=$('gemini-prompt').value.trim();
    if(!apiKey) return toast('Gemini API Keyを入力してください'); if(!prompt) return toast('生成プロンプトを入力してください');
    const btn=$('gemini-generate'); btn.disabled=true; btn.textContent='生成中...';
    try{
      const base=config.gemini?.endpointBase||'https://generativelanguage.googleapis.com/v1beta'; const url=`${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const instruction=`learning.problemPackage JSONだけを返してください。schemaVersionは1。unitsは1つ以上。generator.kindはstatic。questionsを${count}問。answerTypeは${answerType}。contentはtext/formula/image/video/audioを使用可能。問題画面に収まる短い問題にする。`;
      const body={contents:[{role:'user',parts:[{text:`${instruction}\n\n依頼内容:\n${prompt}`}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schemaForGemini}};
      const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
      const data=await res.json(); const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||''; if(!text) throw new Error('JSON本文を取得できませんでした');
      const pkg=normalizePackage(parseJsonText(text,'Gemini応答')); state.package=pkg; $('package-json').value=JSON.stringify(pkg,null,2); renderPreview(); toast('生成しました');
    }catch(e){ toast(`生成失敗: ${e.message.slice(0,160)}`); }
    finally{ btn.disabled=false; btn.textContent='Geminiで生成'; }
  }
  function bind(){
    $('import-package').addEventListener('change',async e=>{ const f=e.target.files?.[0]; if(!f) return; try{ const pkg=normalizePackage(await readJsonFile(f)); state.package=pkg; $('package-json').value=JSON.stringify(pkg,null,2); renderPreview(); toast('読み込みました'); }catch(err){ toast(err.message); } e.target.value=''; });
    activate($('download-package'),()=>{ if(!state.package) return toast('先に問題パッケージを作成してください'); download(state.package,`${state.package.packageId}.learning-pack.json`); });
    activate($('download-mathunits'),()=>{ if(!state.package) return toast('先に問題パッケージを作成してください'); download(packageToMathUnits(state.package),'mathUnits.json'); });
    activate($('validate-json'),()=>{ try{ applyFromText(); }catch(e){ $('validation-result').className='notice danger'; $('validation-result').textContent=e.message; } });
    activate($('apply-json'),()=>{ try{ applyFromText(); toast('反映しました'); }catch(e){ toast(e.message); } });
    activate($('prompt-template'),fillPrompt);
    activate($('gemini-generate'),generateWithGemini);
  }
  document.addEventListener('DOMContentLoaded',()=>{ bind(); fillPrompt(); renderAuth(); });
})();

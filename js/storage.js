(function(global){
  'use strict';
  const DB_NAME = 'MathBattleSeparatedDB';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const PROGRESS_KEY = 'progress';
  const CUSTOM_CHARACTER_KEY = 'customCharacterData';
  const CUSTOM_MATH_UNITS_KEY = 'customMathUnits';

  function openDB(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function get(key){
    const db = await openDB();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(STORE,'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function set(key,value){
    const db = await openDB();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(STORE,'readwrite');
      const req = tx.objectStore(STORE).put(value,key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  async function del(key){
    const db = await openDB();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(STORE,'readwrite');
      const req = tx.objectStore(STORE).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  async function loadProgress(){
    try{return GameLogic.ensureProgress(await get(PROGRESS_KEY));}
    catch(e){
      const raw = localStorage.getItem('mathbattle.progress');
      return GameLogic.ensureProgress(raw ? JSON.parse(raw) : null);
    }
  }
  async function saveProgress(progress){
    const safe = GameLogic.ensureProgress(progress);
    try{ await set(PROGRESS_KEY, safe); }
    catch(e){ localStorage.setItem('mathbattle.progress', JSON.stringify(safe)); }
    return safe;
  }
  async function loadCustomCharacterData(){
    try{return await get(CUSTOM_CHARACTER_KEY);}catch(e){return null;}
  }
  async function saveCustomCharacterData(data){ return set(CUSTOM_CHARACTER_KEY, data); }
  async function clearCustomCharacterData(){ return del(CUSTOM_CHARACTER_KEY); }
  async function loadCustomMathUnits(){
    try{return await get(CUSTOM_MATH_UNITS_KEY);}catch(e){return null;}
  }
  async function saveCustomMathUnits(data){ return set(CUSTOM_MATH_UNITS_KEY, data); }
  async function clearCustomMathUnits(){ return del(CUSTOM_MATH_UNITS_KEY); }
  function exportProgress(progress){
    const blob = new Blob([JSON.stringify(progress,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mathbattle-progress-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }
  function readJsonFile(file){
    return new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = () => {
        try{ resolve(JSON.parse(reader.result)); }catch(e){ reject(e); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }
  global.Storage = {
    loadProgress, saveProgress,
    loadCustomCharacterData, saveCustomCharacterData, clearCustomCharacterData,
    loadCustomMathUnits, saveCustomMathUnits, clearCustomMathUnits,
    exportProgress, readJsonFile
  };
})(window);

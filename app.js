
import {VERSION,PRIMARY,SECONDARY,ABILITIES,MOVE_LIBRARY,TIERS,PRIMARY_PASSIVES,SECONDARY_PASSIVES,REROLL_COSTS,MAX_REROLLS,MAX_ROSTER} from "./data.js";
import {watchAuth,googleLogin,emailLogin,emailRegister,logout,loadUserSave,saveUser,publishLeaderboard,fetchLeaderboard} from "./firebase.js";
import {sfx,startFightMusic,stopFightMusic} from "./sound.js";

const app=document.querySelector("#app");
const modalRoot=document.querySelector("#modal-root");
const toastEl=document.querySelector("#toast");

const DEFAULT_SAVE={
  credits:300,totalRuns:0,matchWins:0,matchLosses:0,totalKOs:0,damageDealt:0,damageTaken:0,
  mutantsRecruited:0,longestStreak:0,currentStreak:0,championships:0,bestBracket:4,
  fastestChampionship:null,highestRunWins:0,abilitiesSeen:{},animalsSeen:{},runHistory:[],
  settings:{sound:true,confirmForfeit:true}
};
let save=mergeSave(JSON.parse(localStorage.getItem("umfl-save")||"{}"));
let user=null;
let state={screen:"home",rolls:null,run:null,battle:null,leaderboard:[],leaderField:"championships",busy:false};
let cloudTimer=null;

function mergeSave(raw){
  return {...structuredClone(DEFAULT_SAVE),...raw,settings:{...DEFAULT_SAVE.settings,...(raw.settings||{})}};
}
function persist(){
  localStorage.setItem("umfl-save",JSON.stringify(save));
  if(user){
    clearTimeout(cloudTimer);
    cloudTimer=setTimeout(async()=>{
      try{
        await saveUser(user.uid,user,save,state.run);
        await publishLeaderboard(user.uid,user,save);
      }catch(e){console.warn("Cloud sync failed",e)}
    },450);
  }
}
function toast(text){
  toastEl.textContent=text;toastEl.classList.add("show");
  setTimeout(()=>toastEl.classList.remove("show"),1900);
}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0}
function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function randInt(r,min,max){return Math.floor(r()*(max-min+1))+min}
function choose(arr,r=Math.random){return arr[Math.floor(r()*arr.length)]}
function clone(x){return structuredClone(x)}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function format(n){return Math.round(n).toLocaleString()}
function uid(prefix="id"){return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`}

function generateMutant(seed,scale=1){
  const r=mulberry32(hash(seed));
  const primary=choose(PRIMARY,r),secondary=choose(SECONDARY,r),ability=choose(ABILITIES,r);
  const stats={};
  for(const k of ["hp","atk","def","spd"]){
    stats[k]=Math.round((primary.stats[k]+secondary.stats[k])*(.94+r()*.12)*scale);
  }
  if(ability.mods)for(const [k,v] of Object.entries(ability.mods))stats[k]=Math.round(stats[k]*v);
  const moveNames=[...primary.moves];
  const replaceIndex=randInt(r,1,3);
  moveNames[replaceIndex]=secondary.move;
  const moves=moveNames.map(name=>({name,...MOVE_LIBRARY[name]}));
  const syllableA=primary.name.replace(/\s/g,"").slice(0,Math.ceil(primary.name.replace(/\s/g,"").length/2));
  const syllableB=secondary.name.replace(/\s/g,"").slice(Math.floor(secondary.name.replace(/\s/g,"").length/2));
  const name=(syllableA+syllableB).replace(/[^a-z]/gi,"");
  save.animalsSeen[primary.name]=true;save.animalsSeen[secondary.name]=true;save.abilitiesSeen[ability.name]=true;
  return {
    id:uid("mut"),seed,name,primary:clone(primary),secondary:clone(secondary),ability:clone(ability),
    stats,moves,primaryPassive:clone(PRIMARY_PASSIVES[primary.name]),secondaryPassive:clone(SECONDARY_PASSIVES[secondary.name]),
    record:{wins:0,kos:0,damage:0,recruitedAt:null}
  };
}
function createStartingMutant(){
  const {primary,secondary,ability}=state.rolls;
  const seed=`start-${primary.name}-${secondary.name}-${ability.name}-${Date.now()}`;
  const generated=generateMutant(seed,1);
  generated.primary=clone(primary);generated.secondary=clone(secondary);generated.ability=clone(ability);
  for(const k of ["hp","atk","def","spd"]){
    generated.stats[k]=Math.round(primary.stats[k]+secondary.stats[k]);
  }
  if(ability.mods)for(const [k,v] of Object.entries(ability.mods))generated.stats[k]=Math.round(generated.stats[k]*v);
  generated.primaryPassive=clone(PRIMARY_PASSIVES[primary.name]);
  generated.secondaryPassive=clone(SECONDARY_PASSIVES[secondary.name]);
  generated.moves=primary.moves.map(name=>({name,...MOVE_LIBRARY[name]}));
  generated.moves[2]={name:secondary.move,...MOVE_LIBRARY[secondary.move]};
  return generated;
}
function generateEnemyTeam(size,scale,tier,round){
  const team=[];
  for(let i=0;i<size;i++){
    const bossBoost=round===TIERS[tier].wins-1?1.06:1;
    team.push(generateMutant(`enemy-${tier}-${round}-${i}-${Math.random()}`,scale*bossBoost));
  }
  return team;
}
function portrait(m,small=false){
  const h=hash(m.seed||m.id),hue=h%360,hue2=(hue+55+(h%65))%360;
  const ear=(h%3),pattern=(h%4),eye=(h%2),scar=(h%5===0);
  const primary=esc(m.primary.icon),secondary=esc(m.secondary.icon),ability=esc(m.ability.icon);
  return `<svg viewBox="0 0 200 200" role="img" aria-label="${esc(m.name)}">
  <defs>
    <radialGradient id="bg${h}" cx="50%" cy="34%"><stop offset="0" stop-color="hsl(${hue} 46% 48%)"/><stop offset="1" stop-color="hsl(${hue2} 35% 12%)"/></radialGradient>
    <linearGradient id="metal${h}" x1="0" x2="1"><stop stop-color="#63737a"/><stop offset=".5" stop-color="#1a252a"/><stop offset="1" stop-color="#7c8b90"/></linearGradient>
  </defs>
  <rect width="200" height="200" rx="18" fill="url(#bg${h})"/>
  <path d="M12 168 Q45 128 100 139 Q154 128 188 168 V200 H12Z" fill="rgba(4,7,8,.6)"/>
  ${pattern===0?'<path d="M22 42L178 158M5 80L125 200" stroke="rgba(255,255,255,.07)" stroke-width="12"/>':''}
  ${pattern===1?'<circle cx="36" cy="55" r="9" fill="rgba(255,255,255,.07)"/><circle cx="166" cy="106" r="12" fill="rgba(255,255,255,.07)"/>':''}
  <ellipse cx="100" cy="113" rx="66" ry="57" fill="rgba(4,7,8,.38)" stroke="rgba(255,255,255,.08)" stroke-width="2"/>
  <text x="100" y="124" text-anchor="middle" font-size="${small?76:84}">${primary}</text>
  <g transform="translate(128 126)"><circle cx="25" cy="25" r="31" fill="rgba(7,11,13,.8)" stroke="url(#metal${h})" stroke-width="3"/><text x="25" y="37" text-anchor="middle" font-size="39">${secondary}</text></g>
  <g transform="translate(142 15)"><circle cx="22" cy="22" r="20" fill="#0b1114" stroke="#f1b83b" stroke-width="3"/><text x="22" y="30" text-anchor="middle" font-size="23">${ability}</text></g>
  ${scar?'<path d="M68 76l28 24m-20-29l28 24" stroke="#d8c3ad" stroke-width="3" opacity=".7"/>':''}
  <circle cx="${eye?77:123}" cy="87" r="5" fill="#ffd76d"/>
  <path d="M17 184H183" stroke="rgba(255,255,255,.12)"/>
  </svg>`;
}
function header(){
  return `<header class="topbar"><div class="brand"><div class="brandmark">U</div><div><div class="brand-title">UMFL</div><div class="version">${VERSION}</div></div></div>
  <div class="top-actions"><div class="pill">◆ ${format(save.credits)}</div><button class="icon-btn" data-action="settings">⚙</button></div></header>`;
}
function nav(active){
  return `<nav class="nav">
  <button data-go="home" class="${active==="home"?"active":""}"><span>🥊</span>Arena</button>
  <button data-go="roster" class="${active==="roster"?"active":""}"><span>🧬</span>Roster</button>
  <button data-go="leaderboard" class="${active==="leaderboard"?"active":""}"><span>🏆</span>Ranks</button>
  <button data-go="stats" class="${active==="stats"?"active":""}"><span>▥</span>Stats</button>
  </nav>`;
}
function shell(content,navKey=null){
  app.innerHTML=`<div class="app-shell">${header()}${content}${navKey?nav(navKey):""}</div>`;
}
function render(){
  const fn={
    home:renderHome,wheels:renderWheels,mutant:renderMutant,bracket:renderBracket,
    roster:renderRoster,battle:renderBattle,reward:renderReward,stats:renderStats,
    leaderboard:renderLeaderboard,runEnd:renderRunEnd
  }[state.screen]||renderHome;
  fn();
}
function renderHome(){
  const auth=user?`<div class="card auth-card"><div class="auth-name"><span class="status-dot"></span>${esc(user.displayName||user.email)}</div><div class="muted">Cloud save active</div></div>`
  :`<div class="card auth-card"><b>Sign in for cloud saves and rankings</b><div class="grid2" style="margin-top:9px"><button class="btn secondary" data-action="google-login">Google</button><button class="btn secondary" data-action="email-modal">Email</button></div></div>`;
  const continueBtn=state.run?`<button class="btn" data-action="continue-run">Continue Run · ${TIERS[state.run.tier].name}</button><button class="btn ghost" style="margin-top:8px" data-action="abandon-run">Abandon current run</button>`
  :`<button class="btn" data-action="start-run">Enter Arena</button>`;
  shell(`<main><section class="hero"><div class="hero-logo">UMFL</div><div class="hero-subtitle">UNDERGROUND MUTANT FIGHTING LEAGUE</div>
  <div class="hero-stage"><div class="hero-creatures"><div class="hero-creature" style="--r:-7deg">🦍</div><div class="hero-creature" style="--r:5deg">🦈</div><div class="hero-creature" style="--r:8deg">🐅</div></div></div>
  ${auth}${continueBtn}
  <div class="grid2" style="margin-top:9px"><button class="btn secondary" data-go="leaderboard">Leaderboards</button><button class="btn secondary" data-go="stats">Career</button></div>
  </section></main>`,"home");
}
function startRun(){
  save.totalRuns++;
  state.rolls={primary:null,secondary:null,ability:null,spun:{primary:false,secondary:false,ability:false},rerolls:MAX_REROLLS,spinning:null};
  state.run=null;state.screen="wheels";persist();render();
}
function wheelBlock(kind,label,item){
  const pool=kind==="primary"?PRIMARY:kind==="secondary"?SECONDARY:ABILITIES;
  const unknown={name:"Unknown",icon:"?",archetype:"Spin to reveal",trait:"Spin to reveal",desc:"Spin to reveal this mutation."};
  const shown=item||unknown;
  const idx=item?pool.indexOf(item):0,prev=item?pool[(idx-1+pool.length)%pool.length]:unknown,next=item?pool[(idx+1)%pool.length]:unknown;
  const desc=!item?"Tap SPIN to generate this part of your mutant.":kind==="primary"?`${item.archetype} · 75% stat foundation`:kind==="secondary"?`${item.trait} · secondary move: ${item.move}`:`${item.rarity} · ${item.desc}`;
  const hasSpun=state.rolls.spun[kind];
  const cost=REROLL_COSTS[kind];
  return `<section class="card wheel-card"><div class="wheel-head"><b>${label}</b>
  <button class="small-btn" data-spin="${kind}" ${state.busy?"disabled":""}>${hasSpun?`REROLL ◆${cost}`:"SPIN"}</button></div>
  <div class="wheel ${state.rolls.spinning===kind?"spinning":""}"><div class="wheel-item">${prev.icon}</div><div class="wheel-item active">${shown.icon}</div><div class="wheel-item">${next.icon}</div></div>
  <div class="wheel-result">${esc(shown.name)}</div><div class="wheel-desc">${esc(desc)}</div></section>`;
}
function creationPreview(){
  if(!state.rolls.primary&&!state.rolls.secondary&&!state.rolls.ability)return "";
  if(!(state.rolls.primary&&state.rolls.secondary&&state.rolls.ability))return `<div class="card creation-preview"><div class="eyebrow">Mutant analysis</div><p class="muted">Spin all three wheels to reveal projected stats, moves, mutation, and inherited passives.</p></div>`;
  const temp=createStartingMutant();
  return `<div class="card creation-preview"><div class="screen-title"><div><div class="eyebrow">Projected mutant</div><h2 style="font-size:17px">${esc(temp.name)}</h2></div></div>
  <div class="stat-grid">${["hp","atk","def","spd"].map(k=>`<div class="stat">${k.toUpperCase()}<b>${temp.stats[k]}</b></div>`).join("")}</div>
  <div class="passive-grid"><div class="passive-box"><b>${temp.primary.icon} ${esc(temp.primaryPassive.name)}</b><span>${esc(temp.primaryPassive.desc)}</span></div>
  <div class="passive-box"><b>${temp.secondary.icon} ${esc(temp.secondaryPassive.name)}</b><span>${esc(temp.secondaryPassive.desc)}</span></div>
  <div class="passive-box mutation-box"><b>${temp.ability.icon} ${esc(temp.ability.name)}</b><span>${esc(temp.ability.desc)}</span></div></div>
  <div class="moves">${temp.moves.map(m=>`<div class="move"><div><div class="move-name">${esc(m.name)}</div><div class="move-meta">${moveDescription(m)}</div></div><div><b>${m.power||"—"}</b><div class="move-meta">${Math.round(moveAccuracy(m)*100)}% ACC</div></div></div>`).join("")}</div></div>`;
}
function renderWheels(){
  shell(`<main><div class="screen-title"><button class="icon-btn" data-go="home">‹</button><h2>Generation Lab</h2><span></span></div>
  ${wheelBlock("primary","WHEEL 1 · PRIMARY",state.rolls.primary)}
  ${wheelBlock("secondary","WHEEL 2 · SECONDARY",state.rolls.secondary)}
  ${wheelBlock("ability","WHEEL 3 · MUTATION",state.rolls.ability)}${creationPreview()}
  <div class="card reroll-bank"><span>Rerolls remaining</span><b>${state.rolls.rerolls}</b></div>
  <div class="grid2"><button class="btn secondary" data-action="tutorial">How to Play</button>
  <button class="btn" data-action="lock-mutant" ${Object.values(state.rolls.spun).every(Boolean)?"":"disabled"}>Lock Mutant</button></div></main>`);
}
async function spinWheel(kind){
  if(state.busy)return;
  const first=!state.rolls.spun[kind],cost=REROLL_COSTS[kind];
  if(!first){
    if(state.rolls.rerolls<=0)return toast("No rerolls remaining");
    if(save.credits<cost)return toast("Not enough credits");
    save.credits-=cost;state.rolls.rerolls--;
  }
  state.busy=true;state.rolls.spinning=kind;sfx("spin");persist();render();
  const pool=kind==="primary"?PRIMARY:kind==="secondary"?SECONDARY:ABILITIES;
  const steps=first?18:24;
  for(let i=0;i<steps;i++){
    await new Promise(r=>setTimeout(r,55+i*5));
    state.rolls[kind]=choose(pool);render();
    if(i%3===0)sfx("spin");
  }
  state.rolls.spun[kind]=true;state.rolls.spinning=null;state.busy=false;sfx("lock");persist();render();
}
function lockMutant(){
  if(!Object.values(state.rolls.spun).every(Boolean))return toast("Spin all three wheels first");
  sfx("lock");
  const starter=createStartingMutant();
  const runId=uid("run");
  const bracketSeed=Math.random().toString(36).slice(2);
  const support=generateMutant(`league-partner-${runId}-${bracketSeed}`,.96);
  support.record.recruitedAt={tier:-1,round:0};
  state.run={
    id:runId,startedAt:Date.now(),tier:0,winsInTier:0,totalWins:0,totalKOs:0,
    roster:[starter,support],activeIds:[starter.id,support.id],enemyTeam:[],rewardTeam:[],selectedRecruit:null,
    bracketSeed,completed:false
  };
  persist();state.screen="mutant";render();
}
function moveDescription(move){
  const map={guard:"Reduces incoming damage until next action.",guardStrong:"Strong damage reduction until next action.",
  area:"Hits every enemy.",areaLow:"Hits every enemy at reduced power.",poison:"May inflict poison.",bleed:"May inflict bleed.",
  slow:"May reduce speed.",stun:"May push the target backward.",weaken:"May reduce combat effectiveness.",
  buffAttack:"Raises ATK.",buffAttackDef:"Raises ATK and DEF.",buffTeamAttack:"Raises team ATK.",selfHeal:"Restores HP.",
  cleanseHeal:"Removes statuses and heals.",teamGuard:"Protects the team.",poisonAll:"Poisons all enemies.",
  weakenAll:"Weakens all enemies.",slowAll:"Slows all enemies.",doubleHit:"Hits twice.",doubleHitLight:"Two lighter hits.",
  armorPierce:"Partially ignores DEF.",lifestealMove:"Heals from damage.",counterBuff:"Prepares a counter stance."};
  return map[move.effect]||`${move.tags.join(" · ")} move`;
}
function mutantCard(m,full=true){
  return `<div class="card mutant-detail-card"><div class="mutant-summary"><div class="portrait">${portrait(m)}</div><div>
  <div class="mutant-name">${esc(m.name)}</div><div class="genetics">${esc(m.primary.name)} × ${esc(m.secondary.name)}</div>
  <div class="stat-grid">${["hp","atk","def","spd"].map(k=>`<div class="stat">${k.toUpperCase()}<b>${m.stats[k]}</b></div>`).join("")}</div></div></div>
  <div class="passive-grid">
    <div class="passive-box"><b>${m.primary.icon} ${esc(m.primaryPassive?.name||"Primary Passive")}</b><span>${esc(m.primaryPassive?.desc||"")}</span></div>
    <div class="passive-box"><b>${m.secondary.icon} ${esc(m.secondaryPassive?.name||"Secondary Passive")}</b><span>${esc(m.secondaryPassive?.desc||"")}</span></div>
    <div class="passive-box mutation-box"><b>${m.ability.icon} ${esc(m.ability.name)}</b><span>${esc(m.ability.desc)}</span></div>
  </div>
  ${full?`<div class="moves">${m.moves.map(move=>`<div class="move"><div><div class="move-name">${esc(move.name)}</div><div class="move-meta">${moveDescription(move)}</div></div><div><b>${move.power||"—"}</b><div class="move-meta">${Math.round(moveAccuracy(move)*100)}% ACC · CD ${moveCooldown(move)}</div></div></div>`).join("")}</div>`:""}</div>`;
}
function renderMutant(){
  const starter=state.run.roster[0],support=state.run.roster[1];
  shell(`<main><div class="screen-title"><button class="icon-btn" data-go="home">‹</button><h2>Opening Team</h2><span></span></div>
  <div class="eyebrow" style="margin-bottom:7px">Your wheel-generated captain</div>${mutantCard(starter)}
  <div class="eyebrow" style="margin:14px 0 7px">League-issued partner</div>${mutantCard(support)}
  <div class="grid2" style="margin-top:11px"><button class="btn secondary" data-action="tutorial">Battle Guide</button><button class="btn" data-action="enter-tier">Enter Qualifier</button></div></main>`);
}

function buildBracket(tierIndex){
  const t=TIERS[tierIndex],handlers=[];
  handlers.push({id:"you",name:user?.displayName||"YOU",team:activeTeam(),isPlayer:true});
  for(let i=1;i<t.size;i++){
    const team=generateEnemyTeam(t.teamSize,t.scale,tierIndex,i);
    handlers.push({id:`handler-${tierIndex}-${i}`,name:`Handler ${String(i).padStart(3,"0")}`,team,isPlayer:false});
  }
  const r=mulberry32(hash(`${state.run.bracketSeed}-${tierIndex}`));
  for(let i=handlers.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[handlers[i],handlers[j]]=[handlers[j],handlers[i]]}
  const rounds=[];let count=t.size,roundIndex=0;
  while(count>=2){
    const matches=[];
    for(let i=0;i<count/2;i++){
      matches.push({
        id:`r${roundIndex}m${i}`,
        left:roundIndex===0?handlers[i*2]:null,
        right:roundIndex===0?handlers[i*2+1]:null
      });
    }
    rounds.push(matches);count/=2;roundIndex++;
  }
  return {participants:handlers,handlers,rounds};
}
function bracketBoard(){
  const b=state.run.fullBracket;if(!b)return "";
  const labels=b.rounds.map((_,i)=>i===b.rounds.length-1?"FINAL":i===b.rounds.length-2?"SEMIFINAL":i===b.rounds.length-3?"QUARTERFINAL":`ROUND ${i+1}`);
  return `<div class="bracket-clean">${b.rounds.map((matches,ri)=>`<section class="bracket-round"><h4>${labels[ri]}</h4>
  ${matches.map((match,mi)=>ri===0?
  `<div class="match-card"><button data-handler="${match.left.id}" class="${match.left.isPlayer?"you":""}">${match.left.isPlayer?"★":"♟"} ${esc(match.left.name)}</button><span>VS</span><button data-handler="${match.right.id}" class="${match.right.isPlayer?"you":""}">${match.right.isPlayer?"★":"♟"} ${esc(match.right.name)}</button></div>`:
  `<div class="match-card future"><button>${mi===0?"★ YOUR PATH":"TBD"}</button><span>VS</span><button>TBD</button></div>`).join("")}</section>`).join("")}</div>`;
}
function showHandler(id){
  const h=state.run.fullBracket?.handlers.find(x=>x.id===id);if(!h)return;
  modalRoot.innerHTML=`<div class="modal-wrap"><div class="modal"><div class="screen-title"><h2>${esc(h.name)}</h2><button class="icon-btn" data-modal-close>×</button></div>
  <div class="roster-list">${h.team.map(m=>`<div class="card">${mutantCard(m,false)}</div>`).join("")}</div></div></div>`;
}
function enterTier(){
  const tier=TIERS[state.run.tier];
  if(!state.run.fullBracket || !Array.isArray(state.run.fullBracket.handlers) || !state.run.fullBracket.rounds){
    state.run.fullBracket=buildBracket(state.run.tier);
  }
  state.run.enemyTeam=generateEnemyTeam(tier.teamSize,tier.scale,state.run.tier,state.run.winsInTier);
  persist();state.screen="bracket";render();
}
function activeTeam(){
  const tier=TIERS[state.run.tier],selected=state.run.roster.filter(m=>state.run.activeIds.includes(m.id));
  return selected.slice(0,tier.teamSize);
}
function renderBracket(){
  const t=TIERS[state.run.tier];
  const roundRows=Array.from({length:t.wins},(_,i)=>`<div class="round ${i<state.run.winsInTier?"done":i===state.run.winsInTier?"current":""}"><b>${i===t.wins-1?"Final":`Round ${i+1}`}</b><span>${i<state.run.winsInTier?"WON":i===state.run.winsInTier?"NEXT":"LOCKED"}</span></div>`).join("");
  shell(`<main><div class="screen-title"><button class="icon-btn" data-go="home">‹</button><h2>${t.name}</h2><button class="small-btn" data-action="tutorial">?</button></div>
  <div class="card colorful"><div class="bracket-header"><div><div class="eyebrow">Single elimination</div><b>${t.wins} wins to promotion</b></div><div class="bracket-size">${t.size}</div></div>
  <div class="progress" style="margin-top:11px"><i style="width:${state.run.winsInTier/t.wins*100}%"></i></div></div>
  <div class="round-list">${roundRows}</div>
  <div class="card" style="margin-top:10px"><div class="screen-title"><div><div class="eyebrow">Scouting report</div><b>Tap a mutant for full details</b></div></div>
  <div class="scout-grid">${state.run.enemyTeam.map(m=>`<button class="scout scout-button" data-scout="${m.id}"><div class="portrait">${portrait(m,true)}</div><div class="scout-name">${esc(m.name)}</div><div class="scout-mini">HP ${m.stats.hp} · ATK ${m.stats.atk}<br>DEF ${m.stats.def} · SPD ${m.stats.spd}</div></button>`).join("")}</div></div>
  <div class="card" style="margin-top:10px"><div class="screen-title"><div><div class="eyebrow">Full ${t.size}-fighter bracket</div><b>Tap handlers to inspect rosters</b></div></div>${bracketBoard()}</div>
  <div class="grid2" style="margin-top:10px"><button class="btn secondary" data-go="roster">Your Team</button><button class="btn" data-action="start-battle">Fight</button></div></main>`);
}
function showScout(id){
  const m=state.run.enemyTeam.find(x=>x.id===id);if(!m)return;
  modalRoot.innerHTML=`<div class="modal-wrap"><div class="modal"><div class="screen-title"><h2>Scouting File</h2><button class="icon-btn" data-modal-close>×</button></div>${mutantCard(m,true)}</div></div>`;
}
function renderRoster(){
  if(!state.run){
    shell(`<main><div class="screen-title"><h2>Roster</h2></div><div class="card"><b>Mutants are run-bound.</b><p class="muted">Your exact recruited mutants remain with you until that run ends. Career records persist.</p></div></main>`,"roster");return;
  }
  const needed=TIERS[state.run.tier].teamSize;
  shell(`<main><div class="screen-title"><button class="icon-btn" data-go="bracket">‹</button><h2>Select Team</h2><span>${activeTeam().length}/${needed}</span></div>
  <div class="roster-list">${state.run.roster.map((m,i)=>{
    const active=state.run.activeIds.includes(m.id),slot=state.run.activeIds.indexOf(m.id)+1;
    return `<button class="card roster-card ${active?"active":""}" data-toggle-mutant="${m.id}">
      <div class="portrait">${portrait(m,true)}</div><div style="text-align:left"><b>${esc(m.name)}</b><div class="muted">${esc(m.primary.name)} × ${esc(m.secondary.name)}</div><div class="badges"><span class="badge">${m.ability.icon} ${esc(m.ability.name)}</span><span class="badge">${m.record.kos} KOs</span></div></div>
      <div>${active?`<span class="team-number">${slot}</span>`:"＋"}</div></button>`;
  }).join("")}</div>
  <button class="btn" style="margin-top:11px" data-action="confirm-team" ${activeTeam().length!==needed?"disabled":""}>Confirm Team</button></main>`);
}
function toggleMutant(id){
  const needed=TIERS[state.run.tier].teamSize,ids=state.run.activeIds;
  if(ids.includes(id))state.run.activeIds=ids.filter(x=>x!==id);
  else if(ids.length<needed)state.run.activeIds.push(id);
  else{state.run.activeIds.shift();state.run.activeIds.push(id)}
  persist();render();
}
function makeCombatant(m,side,index){
  return {
    ...clone(m),uid:`${m.id}-${side}-${index}`,side,index,hp:m.stats.hp,maxHp:m.stats.hp,gauge:Math.random()*32,
    alive:true,status:{poison:0,burn:0,bleed:0,slow:0,weaken:0},buff:{atk:0,def:0,crit:0,evasion:0,guard:0},
    flags:{revived:false,lastStand:false,firstGuard:false,phaseHits:0,coldStarted:true},
    actionCount:0,momentum:0,reactiveDef:0,stolenSpeed:0,cooldowns:{},lastMove:null,lastTarget:null,passiveCounters:{}
  };
}
function startBattle(){
  const needed=TIERS[state.run.tier].teamSize;
  if(activeTeam().length!==needed)return toast(`Select ${needed} mutants`);
  const players=activeTeam().map((m,i)=>makeCombatant(m,"player",i));
  const enemies=state.run.enemyTeam.map((m,i)=>makeCombatant(m,"enemy",i));
  state.battle={players,enemies,turn:null,selectedTarget:null,log:["The cage locks. Fight!"],ended:false,processing:false};
  applyOpeningEffects();
  state.screen="battle";startFightMusic(save.settings.sound);render();setTimeout(advanceTimeline,350);
}
function allCombatants(){return [...state.battle.players,...state.battle.enemies]}
function alliesOf(c){return c.side==="player"?state.battle.players:state.battle.enemies}
function foesOf(c){return c.side==="player"?state.battle.enemies:state.battle.players}
function living(arr){return arr.filter(c=>c.alive)}
function effectiveSpeed(c){
  let s=c.stats.spd+c.stolenSpeed;
  s*=1+c.momentum*.07;
  if(c.status.slow>0)s*=.72;
  if(c.ability.effect==="lowHpSpeed"&&c.hp/c.maxHp<.4)s*=1.38;
  if(c.ability.effect==="underdog"&&living(alliesOf(c)).length<living(foesOf(c)).length)s*=1.08;
  return Math.max(10,s);
}
function effectiveAtk(c){
  let a=c.stats.atk*(1+c.buff.atk);
  if(c.ability.effect==="berserk")a*=1+(1-c.hp/c.maxHp)*.6;
  if(c.ability.effect==="underdog"&&living(alliesOf(c)).length<living(foesOf(c)).length)a*=1.08;
  return a;
}
function effectiveDef(c){
  let d=c.stats.def*(1+c.buff.def+c.reactiveDef);
  if(c.status.weaken>0)d*=.88;
  if(c.ability.effect==="underdog"&&living(alliesOf(c)).length<living(foesOf(c)).length)d*=1.08;
  return Math.max(1,d);
}
function applyOpeningEffects(){
  for(const side of [state.battle.players,state.battle.enemies]){
    for(const c of side){
      if(c.primaryPassive?.effect==="primaryPrideLeader")for(const ally of side)ally.buff.atk+=.06;
      if(c.secondaryPassive?.effect==="secondaryNoxiousAura")for(const foe of foesOf(c))foe.buff.atk-=.04;
    }
  }
  for(const c of allCombatants()){
    if(c.ability.effect==="openingPoison")for(const f of living(foesOf(c)))f.status.poison=Math.max(f.status.poison,1);
    if(c.ability.effect==="gaugeSuppress")for(const f of foesOf(c))f.gauge=Math.max(0,f.gauge-12);
    if(c.secondaryPassive?.effect==="secondaryQuickFeet")c.gauge+=18;
    if(c.secondaryPassive?.effect==="secondaryShell")c.buff.guard=Math.max(c.buff.guard,.18);
    if(c.primaryPassive?.effect==="primaryShadowStep")c.buff.evasion+=.12;
  }
}
function advanceTimeline(){
  const b=state.battle;if(!b||b.ended||b.processing)return;
  if(!living(b.players).length||!living(b.enemies).length)return finishBattle();
  let actor=null,guard=0;
  while(!actor&&guard++<1000){
    for(const c of living(allCombatants()))c.gauge+=effectiveSpeed(c)/20;
    actor=living(allCombatants()).find(c=>c.gauge>=100);
  }
  if(!actor)return;
  actor.gauge-=100;b.turn=actor;b.processing=true;
  processStartTurn(actor);
  if(!actor.alive){b.processing=false;b.turn=null;render();return setTimeout(advanceTimeline,250)}
  render();
  if(actor.side==="enemy")setTimeout(()=>enemyChoose(actor),520);
  else{b.processing=false;state.battle.selectedTarget=living(b.enemies)[0]?.uid||null;render()}
}
function processStartTurn(c){
  for(const k of Object.keys(c.cooldowns||{}))c.cooldowns[k]=Math.max(0,c.cooldowns[k]-1);
  const entries=[["poison",.045,"poison"],["burn",.04,"burn"],["bleed",.035,"bleed"]];
  for(const [key,pct,label] of entries){
    if(c.status[key]>0&&c.alive){
      let finalPct=pct;
      if(c.primaryPassive?.effect==="primaryBlubber")finalPct*=.82;
      const dmg=Math.max(2,Math.round(c.maxHp*finalPct));rawDamage(c,dmg,null,label);c.status[key]--;
    }
  }
  if(c.status.slow>0)c.status.slow--;
  if(c.status.weaken>0)c.status.weaken--;
}
function rawDamage(target,amount,source,label="damage"){
  if(!target.alive)return;
  target.hp=Math.max(0,target.hp-amount);
  state.battle.log.push(`${target.name} takes ${amount} ${label}.`);
  if(target.hp<=0)knockout(target,source);
}
function knockout(target,killer){
  if(target.ability.effect==="revive"&&!target.flags.revived){
    target.flags.revived=true;target.hp=Math.round(target.maxHp*.28);state.battle.log.push(`${target.name}'s Second Heart restarts.`);return;
  }
  if(target.ability.effect==="lastStand"&&!target.flags.lastStand){
    target.flags.lastStand=true;target.hp=1;state.battle.log.push(`${target.name} refuses the knockout.`);return;
  }
  target.alive=false;target.hp=0;save.totalKOs++;sfx("ko");
  if(killer){
    killer.record.kos=(killer.record.kos||0)+1;state.run.totalKOs++;
    if(killer.ability.effect==="frenzy")killer.gauge+=50;
    if(killer.ability.effect==="koHeal")killer.hp=Math.min(killer.maxHp,killer.hp+Math.round(killer.maxHp*.22));
  }
  state.battle.log.push(`${target.name} is knocked out.`);
}
function targetByUid(id){return allCombatants().find(c=>c.uid===id)}
function calculateDamage(actor,target,move){
  let base=move.power*(effectiveAtk(actor)/100)*(100/(100+effectiveDef(target)));
  if(move.effect==="armorPierce")base*=1.22;
  if(move.effect==="hpScale")base+=actor.maxHp*.12;
  if(move.effect==="defScale")base+=effectiveDef(actor)*.1;
  if(move.effect==="speedScale")base+=effectiveSpeed(actor)*.11;
  if(move.effect==="woundedBonus"&&target.hp/target.maxHp<.5)base*=1.35;
  if(move.effect==="firstActionBonus"&&actor.actionCount===0)base*=1.45;
  if(move.effect==="allyScale")base*=1+.12*(living(alliesOf(actor)).length-1);
  if(actor.ability.effect==="execute"&&target.hp/target.maxHp<.5)base*=1.24;
  if(actor.ability.effect==="pack")base*=1+.11*(living(alliesOf(actor)).length-1);
  if(actor.ability.effect==="unstable")base*=1.2;
  if(actor.ability.effect==="heavyDamage")base*=1.12;
  if(actor.ability.effect==="quickPower"&&move.tags.includes("quick"))base*=1.25;
  if(actor.ability.effect==="trance"&&(actor.actionCount+1)%3===0)base*=1.45;
  if(actor.ability.effect==="doom")base*=1+actor.actionCount*.1;
  if(actor.primaryPassive?.effect==="primaryBloodScent"&&target.status.bleed>0)base*=1.15;
  if(actor.primaryPassive?.effect==="primaryAmbush"&&actor.actionCount===1)base*=1.20;
  if(actor.primaryPassive?.effect==="primaryStalker"&&target.hp/target.maxHp>.8)base*=1.12;
  if(actor.primaryPassive?.effect==="primaryPainFueled")base*=1+Math.floor((1-actor.hp/actor.maxHp)*5)*.05;
  if(actor.primaryPassive?.effect==="primaryTerritorial"&&actor.hp/actor.maxHp<.35)base*=1.12;
  if(actor.primaryPassive?.effect==="primaryCombo"&&actor.lastMove&&actor.lastMove!==move.name)base*=1.08;
  if(actor.primaryPassive?.effect==="primaryPackInstinct")base*=1+.07*(living(alliesOf(actor)).length-1);
  if(actor.secondaryPassive?.effect==="secondaryImproviser"){const minCd=Math.min(...actor.moves.map(m=>moveCooldown(m)));if(moveCooldown(move)===minCd)base*=1.08}
  if(actor.secondaryPassive?.effect==="secondaryCoilingPressure"&&target.status.slow>0)base*=1.07;
  if(actor.status.weaken>0)base*=.86;
  if(target.ability.effect==="fragile")base*=1.12;
  if(target.primaryPassive?.effect==="primaryMassiveFrame"&&move.tags.includes("area"))base*=.82;
  if(target.primaryPassive?.effect==="primaryHerdWall"){const idx=alliesOf(target).indexOf(target),adj=[alliesOf(target)[idx-1],alliesOf(target)[idx+1]].filter(Boolean).some(x=>x.alive);if(adj)base*=.92}
  if(target.primaryPassive?.effect==="primaryThickFur"&&(target.passiveCounters.thickFur||0)<2){target.passiveCounters.thickFur=(target.passiveCounters.thickFur||0)+1;base*=.88}
  if(target.secondaryPassive?.effect==="secondaryUndergroundCover"&&move.tags.includes("area")&&!target.passiveCounters.underground){target.passiveCounters.underground=true;base*=.75}
  if(target.flags.coldStarted&&target.ability.effect==="coldStart")base*=.75;
  if(target.buff.guard>0)base*=1-target.buff.guard;
  if(target.ability.effect==="firstGuard"&&!target.flags.firstGuard){target.flags.firstGuard=true;base*=.4}
  const critChance=.08+actor.buff.crit+(actor.ability.effect==="crit"?.2:0);
  const crit=Math.random()<critChance;if(crit)base*=1.75;
  return {amount:Math.max(1,Math.round(base*(.92+Math.random()*.16))),crit};
}
function moveAccuracy(move){
  if(move.accuracy)return move.accuracy;
  if(move.tags.includes("utility")||move.tags.includes("guard"))return 1;
  if(move.tags.includes("quick"))return .95;
  if(move.power>=48)return .80;
  if(move.power>=42)return .86;
  return .91;
}
function adjustedRecovery(actor,move){
  let recovery=move.recovery;
  if(actor.secondaryPassive?.effect==="secondaryDirtyTactics"&&(move.tags.includes("utility")||move.tags.includes("guard")))recovery*=.88;
  if(actor.secondaryPassive?.effect==="secondaryHyperactive")recovery*=.90;
  return recovery;
}
function moveCooldown(move){
  if(move.tags.includes("utility")||move.tags.includes("guard"))return move.recovery>=80?2:1;
  if(move.power>=48||move.recovery>=110)return 3;
  if(move.power>=40||move.recovery>=90)return 2;
  return 1;
}
function hitResult(actor,target,move){
  let accuracy=moveAccuracy(move),evade=target.buff.evasion+(target.ability.effect==="evade"?.19:0);
  if(actor.primaryPassive?.effect==="primaryHighGround"&&move.tags.includes("quick"))accuracy+=.08;
  if(actor.secondaryPassive?.effect==="secondaryEcholocation")accuracy=Math.max(accuracy,.70);
  if(actor.secondaryPassive?.effect==="secondaryTargetLock"&&actor.lastTarget===target.uid)accuracy+=.06;
  if(target.ability.effect==="phase"&&target.flags.phaseHits<2){target.flags.phaseHits++;evade+=.45}
  const roll=Math.random(),hitChance=clamp(accuracy-evade,.2,.99);
  if(roll<=hitChance)return "hit";
  if(roll<=hitChance+.10)return "glance";
  return "miss";
}
function directHit(actor,target,move,mult=1){
  if(!target.alive)return 0;
  const result=hitResult(actor,target,move);
  if(result==="miss"){state.battle.log.push(`${actor.name}'s ${move.name} misses ${target.name}.`);sfx("miss");return 0}
  const calc=calculateDamage(actor,target,move);let glanceMult=result==="glance"?.38:1;
  if(result==="glance"&&target.secondaryPassive?.effect==="secondaryElasticBody")glanceMult*=.8;
  let dmg=Math.round(calc.amount*mult*glanceMult);
  if(calc.crit&&target.secondaryPassive?.effect==="secondarySideArmor")dmg=Math.round(dmg*.8);
  target.hp=Math.max(0,target.hp-dmg);
  state.battle.log.push(`${actor.name} uses ${move.name}: ${dmg}${result==="glance"?" GLANCING":calc.crit?" CRIT":""}.`);
  sfx(result==="glance"?"glance":calc.crit?"crit":"hit");
  actor.lastTarget=target.uid;
  if(actor.side==="player"){save.damageDealt+=dmg;actor.record.damage=(actor.record.damage||0)+dmg}
  else save.damageTaken+=dmg;
  applyOnHit(actor,target,move,dmg,calc);
  if(target.hp<=0)knockout(target,actor);
  if(target.alive&&target.ability.effect==="counter"&&Math.random()<.22){
    const counter=Math.max(1,Math.round(target.stats.atk*.18));actor.hp=Math.max(0,actor.hp-counter);
    state.battle.log.push(`${target.name} counters for ${counter}.`);if(actor.hp<=0)knockout(actor,target);
  }
  return dmg;
}
function applyOnHit(actor,target,move,dmg,calc){
  const chance=move.chance??1;
  if(move.effect==="poison"&&Math.random()<chance)target.status.poison=Math.max(target.status.poison,3);
  if(move.effect==="bleed"&&Math.random()<chance)target.status.bleed=Math.max(target.status.bleed,3);
  if(move.effect==="slow"&&Math.random()<chance)target.status.slow=Math.max(target.status.slow,2);
  if(move.effect==="weaken"&&Math.random()<chance)target.status.weaken=Math.max(target.status.weaken,2);
  if(move.effect==="stun"&&Math.random()<chance)target.gauge=Math.max(0,target.gauge-45);
  if(actor.ability.effect==="attackPoison"&&Math.random()<.28)target.status.poison=Math.max(target.status.poison,3);
  if(actor.ability.effect==="lifesteal"||move.effect==="lifestealMove"){
    const pct=actor.ability.effect==="lifesteal"?.18:.14;actor.hp=Math.min(actor.maxHp,actor.hp+Math.round(dmg*pct));
  }
  if(actor.ability.effect==="stealSpeed"){actor.stolenSpeed+=4;target.stolenSpeed-=4}
  if(target.ability.effect==="retaliateBurn")actor.status.burn=Math.max(actor.status.burn,2);
  if(target.ability.effect==="retaliatePoison"&&Math.random()<.35)actor.status.poison=Math.max(actor.status.poison,2);
  if(target.ability.effect==="retaliateSlow"&&Math.random()<.3)actor.status.slow=Math.max(actor.status.slow,2);
  if(target.ability.effect==="reflect"){
    const reflected=Math.max(1,Math.round(dmg*.2));actor.hp=Math.max(0,actor.hp-reflected);
    state.battle.log.push(`${actor.name} takes ${reflected} reflected damage.`);if(actor.hp<=0)knockout(actor,target);
  }
  if(target.ability.effect==="reactiveDef")target.reactiveDef=Math.min(.32,target.reactiveDef+.08);
  if(actor.secondaryPassive?.effect==="secondaryBarbedTail"&&Math.random()<.12)target.status.poison=Math.max(target.status.poison,2);
  if(actor.secondaryPassive?.effect==="secondaryPrecisionBlades"&&calc.crit)target.status.bleed=Math.max(target.status.bleed,1);
  if(actor.secondaryPassive?.effect==="secondaryDiveMomentum"&&move.effect==="priority")actor.gauge+=8;
  if(target.primaryPassive?.effect==="primaryRebound")target.gauge+=7;
  if(target.primaryPassive?.effect==="primaryColdPressure")actor.gauge=Math.max(0,actor.gauge-4);
  if(target.secondaryPassive?.effect==="secondaryQuillCoat"){const r=Math.max(1,Math.round(dmg*.06));actor.hp=Math.max(0,actor.hp-r)}
  if(actor.secondaryPassive?.effect==="secondaryRestless"&&dmg===0)actor.gauge+=16;
  if(actor.ability.effect==="execution"&&target.alive&&target.hp/target.maxHp<=.12)knockout(target,actor);
}
const EXTRA_AOE=new Set(["Ground Pound","Stampede","Earthshaker","Wave Crash","Quill Burst","Sonic Screech","Musk Cloud","Stomp"]);
function resolveMove(actor,target,move){
  actor.actionCount++;actor.flags.coldStarted=false;
  actor.buff.guard=0;
  if(move.tags.includes("guard")||move.tags.includes("utility")){
    resolveUtility(actor,target,move);
  }else if(move.effect==="area"||move.effect==="areaLow"||EXTRA_AOE.has(move.name)){
    const mult=move.effect==="areaLow"?.72:.86;for(const foe of living(foesOf(actor)))directHit(actor,foe,move,mult);
  }else if(move.effect==="poisonAll"||move.effect==="weakenAll"||move.effect==="slowAll"){
    for(const foe of living(foesOf(actor))){if(move.power)directHit(actor,foe,move,.62);
      if(move.effect==="poisonAll")foe.status.poison=Math.max(foe.status.poison,2);
      if(move.effect==="weakenAll")foe.status.weaken=Math.max(foe.status.weaken,2);
      if(move.effect==="slowAll")foe.status.slow=Math.max(foe.status.slow,2);}
  }else if(move.effect==="doubleHit"){
    directHit(actor,target,move,.58);if(target.alive)directHit(actor,target,move,.58);
  }else if(move.effect==="doubleHitLight"){
    directHit(actor,target,move,.52);if(target.alive)directHit(actor,target,move,.52);
  }else if(move.effect==="wild"){
    directHit(actor,target,move,Math.random()<.25?1.65:.9);
  }else directHit(actor,target,move);
  if(actor.ability.effect==="regen")actor.hp=Math.min(actor.maxHp,actor.hp+Math.round(actor.maxHp*.06));
  if(actor.ability.effect==="unstable")rawDamage(actor,Math.round(actor.maxHp*.03),actor,"core backlash");
  if(actor.ability.effect==="bloodPrice")rawDamage(actor,Math.round(actor.maxHp*.06),actor,"blood price");
  if(actor.ability.effect==="momentum")actor.momentum=Math.min(5,actor.momentum+1);
  actor.cooldowns[move.name]=moveCooldown(move);actor.lastMove=move.name;
  actor.gauge-=adjustedRecovery(actor,move)*.42;
  if(actor.gauge<0)actor.gauge=0;
}
const FLAVOR=[
(a,m)=>`${a.name} uses ${m.name}. The crowd pretends it understood the plan.`,
(a,m)=>`${a.name} deploys ${m.name}. A rules official quietly updates the waiver.`,
(a,m)=>`${a.name} chooses ${m.name}. The handler nods like this was inevitable.`,
(a,m)=>`${a.name} performs ${m.name}. The front row reconsiders its seating choice.`,
(a,m)=>`${a.name} uses ${m.name}. Strategy has entered the cage, apparently.`,
(a,m)=>`${a.name} executes ${m.name}. Nobody is sure whether that was legal.`
];
function flavorLine(actor,move){return choose(FLAVOR)(actor,move)}
function resolveUtility(actor,target,move){
  switch(move.effect){
    case"guard":actor.buff.guard=.52;break;case"guardStrong":actor.buff.guard=.66;break;
    case"fortify":actor.buff.guard=.45;actor.buff.def=Math.min(.35,actor.buff.def+.15);break;
    case"guardHeal":actor.buff.guard=.38;actor.hp=Math.min(actor.maxHp,actor.hp+Math.round(actor.maxHp*.1));break;
    case"teamGuard":for(const a of living(alliesOf(actor)))a.buff.guard=Math.max(a.buff.guard,.38);break;
    case"buffAttack":actor.buff.atk=Math.min(.55,actor.buff.atk+.24);break;
    case"buffAttackDef":actor.buff.atk=Math.min(.45,actor.buff.atk+.18);actor.buff.def=Math.min(.45,actor.buff.def+.18);break;
    case"buffTeamAttack":for(const a of living(alliesOf(actor)))a.buff.atk=Math.min(.42,a.buff.atk+.14);break;
    case"buffCrit":actor.buff.crit=Math.min(.35,actor.buff.crit+.15);break;
    case"buffAccuracy":actor.buff.crit=Math.min(.25,actor.buff.crit+.08);break;
    case"buffAccuracyCrit":actor.buff.crit=Math.min(.32,actor.buff.crit+.12);break;
    case"evasionBuff":actor.buff.evasion=Math.min(.35,actor.buff.evasion+.18);break;
    case"selfHeal":actor.hp=Math.min(actor.maxHp,actor.hp+Math.round(actor.maxHp*.18));break;
    case"cleanseHeal":actor.status={poison:0,burn:0,bleed:0,slow:0,weaken:0};actor.hp=Math.min(actor.maxHp,actor.hp+Math.round(actor.maxHp*.08));break;
    case"lastStandBuff":actor.flags.lastStand=false;actor.buff.def=Math.min(.4,actor.buff.def+.2);break;
    case"counterBuff":actor.buff.evasion=Math.min(.3,actor.buff.evasion+.1);actor.buff.atk=Math.min(.3,actor.buff.atk+.08);break;
    case"weakenAll":for(const f of living(foesOf(actor)))f.status.weaken=Math.max(f.status.weaken,2);break;
    case"weaken":if(target)target.status.weaken=Math.max(target.status.weaken,2);break;
  }
  if(actor.primaryPassive?.effect==="primaryHeavyHands")actor.buff.atk=Math.min(.5,actor.buff.atk+.10);
  if(actor.primaryPassive?.effect==="primaryApexCoordination"){const fastest=living(alliesOf(actor)).sort((a,b)=>effectiveSpeed(b)-effectiveSpeed(a))[0];if(fastest)fastest.gauge+=12}
  if(actor.primaryPassive?.effect==="primaryWideGuard"&&move.tags.includes("guard")){const low=living(alliesOf(actor)).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];if(low&&low!==actor)low.buff.guard=Math.max(low.buff.guard,actor.buff.guard*.5)}
  state.battle.log.push(flavorLine(actor,move));
}
function choosePlayerMove(index){
  const b=state.battle,actor=b.turn;if(!actor||actor.side!=="player"||b.processing)return;
  const move=actor.moves[index],target=targetByUid(b.selectedTarget)||living(b.enemies)[0];
  if((actor.cooldowns[move.name]||0)>0)return toast(`${move.name} is recovering`);
  if(!target&&!move.tags.includes("utility")&&!move.tags.includes("guard"))return;
  b.processing=true;resolveMove(actor,target,move);b.turn=null;render();
  setTimeout(()=>{b.processing=false;advanceTimeline()},360);
}
function selectTarget(id){state.battle.selectedTarget=id;render()}
function enemyChoose(actor){
  if(!actor.alive){state.battle.processing=false;state.battle.turn=null;return advanceTimeline()}
  const foes=living(foesOf(actor));if(!foes.length)return finishBattle();
  let target=foes.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
  const usable=actor.moves.filter(m=>(actor.cooldowns[m.name]||0)<=0);
  let move=choose(usable.length?usable:actor.moves);
  if(actor.hp/actor.maxHp<.35){
    const defensive=usable.find(m=>m.tags.includes("guard")||["selfHeal","cleanseHeal","guardHeal"].includes(m.effect));
    if(defensive&&Math.random()<.6)move=defensive;
  }
  resolveMove(actor,target,move);state.battle.turn=null;render();
  setTimeout(()=>{state.battle.processing=false;advanceTimeline()},360);
}
function fighterHTML(c){
  const statuses=[c.status.poison?"☠️":"",c.status.burn?"🔥":"",c.status.bleed?"🩸":"",c.status.slow?"🐌":"",c.status.weaken?"⬇️":""].join("");
  const targetable=c.side==="enemy"&&state.battle.turn?.side==="player";
  return `<div class="fighter ${!c.alive?"dead":""} ${state.battle.turn?.uid===c.uid?"active":""} ${targetable?"targetable":""}" ${targetable?`data-target="${c.uid}"`:""}>
  <div class="portrait">${portrait(c,true)}</div><div class="fighter-bars"><div class="hp"><i style="width:${c.hp/c.maxHp*100}%"></i></div><div class="energy"><i style="width:${clamp(c.gauge,0,100)}%"></i></div></div>
  <div class="fighter-name">${esc(c.name)}</div><div class="statuses">${statuses}</div></div>`;
}
function projectedTurns(){
  return living(allCombatants()).sort((a,b)=>(100-a.gauge)/effectiveSpeed(a)-(100-b.gauge)/effectiveSpeed(b)).slice(0,8);
}
function renderBattle(){
  const b=state.battle,actor=b.turn;
  const targets=actor?.side==="player"?living(b.enemies):[];
  const controls=actor?.side==="player"?`<div class="target-strip">${targets.map(t=>`<button class="target-btn ${b.selectedTarget===t.uid?"selected":""}" data-target="${t.uid}">${esc(t.name)} · ${Math.ceil(t.hp/t.maxHp*100)}%</button>`).join("")}</div>
  <div class="action-grid">${actor.moves.map((m,i)=>{const cd=actor.cooldowns[m.name]||0,acc=Math.round(moveAccuracy(m)*100),cool=moveCooldown(m);
  return `<button class="action-btn ${cd?"cooling":""}" data-move="${i}" ${cd?"disabled":""}><b>${esc(m.name)}</b><small>${moveDescription(m)}<br>${m.power?`Power ${m.power}`:"Utility"} · ${acc}% accuracy · Recovery ${Math.round(adjustedRecovery(actor,m))}<br>Cooldown ${cool}${cd?` · ${cd} turn${cd===1?"":"s"} left`:""}</small></button>`}).join("")}</div>`
  :`<div class="card" style="text-align:center"><b>${actor?"Enemy handler is thinking…":"Timeline advancing…"}</b></div>`;
  shell(`<main><div class="battle-top"><button class="icon-btn" data-action="forfeit">×</button><div><div class="eyebrow">${TIERS[state.run.tier].name}</div><b>Round ${state.run.winsInTier+1}</b></div><button class="small-btn" data-action="tutorial">?</button></div>
  <div class="battle-stage vertical-stage"><div class="battle-side left vertical-team">${b.players.map(fighterHTML).join("")}</div>
  <div class="center-log"><div class="center-log-title">CAGE FEED</div><div class="combat-log">${b.log.slice(-14).join("<br>")}</div></div>
  <div class="battle-side right vertical-team">${b.enemies.map(fighterHTML).join("")}</div></div>
  <div class="turnbar">${projectedTurns().map(c=>`<div class="turn-chip ${actor?.uid===c.uid?"current-turn":""}">${portrait(c,true)}</div>`).join("")}</div>
  <div class="action-panel">${controls}</div></main>`);
}
function finishBattle(){
  stopFightMusic();
  const won=living(state.battle.players).length>0;state.battle.ended=true;
  if(won){
    sfx("win");
    save.matchWins++;save.currentStreak++;save.longestStreak=Math.max(save.longestStreak,save.currentStreak);
    state.run.totalWins++;state.run.winsInTier++;
    const reward=TIERS[state.run.tier].credit;save.credits+=reward;
    for(const c of state.battle.players){
      const original=state.run.roster.find(m=>m.id===c.id);
      if(original){original.record=clone(c.record);if(c.alive)original.record.wins++}
    }
    state.run.rewardTeam=state.run.enemyTeam;state.run.selectedRecruit=null;state.screen="reward";
  }else{
    sfx("lose");
    save.matchLosses++;save.currentStreak=0;completeRun(false);
  }
  persist();render();
}
function renderReward(){
  const t=TIERS[state.run.tier],tierDone=state.run.winsInTier>=t.wins;
  shell(`<main><div class="reward-title">VICTORY</div><div class="card" style="text-align:center;margin:10px 0"><b>◆ ${t.credit} credits secured</b><div class="muted">Recruit one exact defeated mutant or pass.</div></div>
  ${state.run.rewardTeam.map(m=>`<button class="reward-card ${state.run.selectedRecruit===m.id?"selected":""}" data-recruit-select="${m.id}"><div class="portrait">${portrait(m,true)}</div><div style="text-align:left"><b>${esc(m.name)}</b><div class="genetics">${esc(m.primary.name)} × ${esc(m.secondary.name)}</div><div class="badges"><span class="badge">${m.ability.icon} ${esc(m.ability.name)}</span><span class="badge">HP ${m.stats.hp}</span><span class="badge">ATK ${m.stats.atk}</span></div></div></button>`).join("")}
  <div class="grid2"><button class="btn secondary" data-action="pass-recruit">Pass</button><button class="btn" data-action="confirm-recruit" ${state.run.selectedRecruit?"":"disabled"}>Recruit</button></div></main>`);
}
function selectRecruit(id){state.run.selectedRecruit=id;render()}
function confirmRecruit(){
  const m=state.run.rewardTeam.find(x=>x.id===state.run.selectedRecruit);if(!m)return;
  m.record.recruitedAt={tier:state.run.tier,round:state.run.winsInTier};
  if(state.run.roster.length<MAX_ROSTER){state.run.roster.push(m);save.mutantsRecruited++;afterRecruit();return}
  showReplacementModal(m);
}
function showReplacementModal(newMutant){
  modalRoot.innerHTML=`<div class="modal-wrap"><div class="modal"><div class="screen-title"><h2>Roster Full</h2><button class="icon-btn" data-modal-close>×</button></div>
  <p class="muted">Choose one mutant to release. This cannot be undone during the run.</p>
  <div class="roster-list">${state.run.roster.map(m=>`<button class="card roster-card" data-replace="${m.id}" data-new="${newMutant.id}"><div class="portrait">${portrait(m,true)}</div><div style="text-align:left"><b>${esc(m.name)}</b><div class="muted">${m.ability.icon} ${esc(m.ability.name)}</div></div><span>Release</span></button>`).join("")}</div></div></div>`;
}
function replaceMutant(oldId,newId){
  const m=state.run.rewardTeam.find(x=>x.id===newId),idx=state.run.roster.findIndex(x=>x.id===oldId);
  state.run.roster[idx]=m;state.run.activeIds=state.run.activeIds.filter(x=>x!==oldId);
  save.mutantsRecruited++;modalRoot.innerHTML="";afterRecruit();
}
function passRecruit(){afterRecruit()}
function afterRecruit(){
  const t=TIERS[state.run.tier];
  if(state.run.winsInTier>=t.wins){
    if(state.run.tier===TIERS.length-1){save.championships++;completeRun(true);return}
    state.run.tier++;state.run.winsInTier=0;state.run.fullBracket=buildBracket(state.run.tier);save.bestBracket=Math.max(save.bestBracket,TIERS[state.run.tier].size);
    const needed=TIERS[state.run.tier].teamSize;
    state.run.activeIds=state.run.roster.slice(0,needed).map(m=>m.id);
    state.run.enemyTeam=generateEnemyTeam(needed,TIERS[state.run.tier].scale,state.run.tier,0);
    state.screen="roster";
  }else{
    state.run.enemyTeam=generateEnemyTeam(t.teamSize,t.scale,state.run.tier,state.run.winsInTier);
    state.screen="bracket";
  }
  persist();render();
}
function completeRun(champion){
  const run=state.run;if(!run)return;
  const duration=Math.round((Date.now()-run.startedAt)/1000);
  save.highestRunWins=Math.max(save.highestRunWins,run.totalWins);
  if(champion&&(!save.fastestChampionship||duration<save.fastestChampionship))save.fastestChampionship=duration;
  save.runHistory.unshift({date:new Date().toISOString(),wins:run.totalWins,kos:run.totalKOs,tier:run.tier,champion,duration});
  save.runHistory=save.runHistory.slice(0,25);
  state.lastRun={...run,champion,duration};state.run=null;state.battle=null;state.screen="runEnd";persist();
}
function renderRunEnd(){
  const r=state.lastRun;
  shell(`<main><div class="hero" style="min-height:calc(100vh - 120px)"><div class="hero-logo" style="font-size:42px">${r.champion?"CHAMPION":"RUN OVER"}</div>
  <div class="hero-subtitle">${r.champion?"THE 256 BRACKET IS YOURS":`ELIMINATED IN ${TIERS[r.tier].name.toUpperCase()}`}</div>
  <div class="card" style="margin:24px 0;text-align:left"><div class="stats-grid">
  <div class="big-stat"><small>Match wins</small><b>${r.totalWins}</b></div><div class="big-stat"><small>KOs</small><b>${r.totalKOs}</b></div>
  <div class="big-stat"><small>Final roster</small><b>${r.roster.length}</b></div><div class="big-stat"><small>Run time</small><b>${formatTime(r.duration)}</b></div></div></div>
  <button class="btn" data-action="start-run">Start New Run</button><button class="btn secondary" style="margin-top:8px" data-go="stats">Career Stats</button></div></main>`);
}
function renderStats(){
  const total=save.matchWins+save.matchLosses,wr=total?Math.round(save.matchWins/total*100):0;
  shell(`<main><div class="screen-title"><h2>Career Stats</h2><span class="eyebrow">All runs</span></div>
  <div class="stats-grid">
  ${stat("Runs",save.totalRuns)}${stat("Match wins",save.matchWins)}${stat("Win rate",wr+"%")}${stat("Championships",save.championships)}
  ${stat("Total KOs",save.totalKOs)}${stat("Recruited",save.mutantsRecruited)}${stat("Longest streak",save.longestStreak)}
  ${stat("Best bracket",save.bestBracket)}${stat("Damage dealt",format(save.damageDealt))}${stat("Damage taken",format(save.damageTaken))}
  ${stat("Animals seen",Object.keys(save.animalsSeen).length)}${stat("Abilities seen",Object.keys(save.abilitiesSeen).length)}
  </div>
  <div class="card" style="margin-top:10px"><div class="screen-title"><h2 style="font-size:16px">Run History</h2></div>
  <div class="record-list">${save.runHistory.length?save.runHistory.map(r=>`<div class="record"><span>${new Date(r.date).toLocaleDateString()} · ${TIERS[r.tier].name}</span><b>${r.wins}W / ${r.kos}KO ${r.champion?"🏆":""}</b></div>`).join(""):`<p class="muted">No completed runs yet.</p>`}</div></div></main>`,"stats");
}
function stat(label,value){return `<div class="big-stat"><small>${label}</small><b>${value}</b></div>`}
async function renderLeaderboard(){
  shell(`<main><div class="screen-title"><h2>Leaderboards</h2><span class="eyebrow">${user?"Online":"Sign in required"}</span></div>
  <div class="leader-tabs">${[
    ["championships","Champions"],["matchWins","Wins"],["totalKOs","KOs"],["longestStreak","Streak"],["damageDealt","Damage"]
  ].map(([f,l])=>`<button class="small-btn" data-leader="${f}" ${state.leaderField===f?"style='border-color:var(--gold)'":""}>${l}</button>`).join("")}</div>
  <div class="card" id="leader-content">${user?`<p class="muted">Loading rankings…</p>`:`<b>Sign in to view live Firebase rankings.</b><button class="btn secondary" style="margin-top:10px" data-action="google-login">Sign in with Google</button>`}</div></main>`,"leaderboard");
  if(user){
    try{
      state.leaderboard=await fetchLeaderboard(state.leaderField);
      const box=document.querySelector("#leader-content");if(!box)return;
      box.innerHTML=state.leaderboard.length?state.leaderboard.map((x,i)=>`<div class="leader-row"><div class="leader-rank">#${i+1}</div><div><b>${esc(x.displayName||"Fighter")}</b><div class="muted">Best bracket ${x.bestBracket||4}</div></div><b>${format(x[state.leaderField]||0)}</b></div>`).join(""):`<p class="muted">No ranked fighters yet.</p>`;
    }catch(e){document.querySelector("#leader-content").innerHTML=`<p class="muted">Leaderboard unavailable. Firestore may still need its index or rules published.</p>`}
  }
}
function formatTime(sec){const m=Math.floor(sec/60),s=sec%60;return `${m}:${String(s).padStart(2,"0")}`}

function openTutorial(){
  modalRoot.innerHTML=`<div class="modal-wrap"><div class="modal tutorial"><div class="screen-title"><h2>UMFL Field Manual</h2><button class="icon-btn" data-modal-close>×</button></div>
  <div class="guide-section"><h3>How a run works</h3><p>Spin Primary, Secondary, and Mutation. Your generated mutant is fixed for the run. Win brackets from Qualifier through the 256-fighter Championship. After every win, you may recruit one exact mutant you defeated.</p></div>
  <div class="guide-section"><h3>Stats</h3><p><b>HP</b> is survivability. <b>ATK</b> increases direct damage. <b>DEF</b> reduces incoming direct damage. <b>SPD</b> fills the action gauge faster, so very fast mutants may act more often.</p></div>
  <div class="guide-section"><h3>Recovery and cooldown</h3><p><b>Recovery</b> is the timeline cost after using a move. A high-recovery move pushes that mutant farther back before its next action. <b>Cooldown</b> prevents repeating the same powerful move every action. Cooldowns count down when that mutant receives a turn.</p></div>
  <div class="guide-section"><h3>Accuracy, misses, glancing blows, and crits</h3><p>Every attack has an accuracy value. Fast attacks are usually accurate; huge attacks are less reliable. A near miss becomes a <b>glancing blow</b> for reduced damage. Critical hits usually deal 175% damage. Evasion lowers an attacker's final hit chance.</p></div>
  <div class="guide-section"><h3>Status effects</h3><p>☠️ Poison, 🔥 Burn, and 🩸 Bleed deal damage at the start of turns. 🐌 Slow reduces action-gauge speed. ⬇️ Weaken reduces combat performance.</p></div>
  <div class="guide-section"><h3>Inherited passives</h3><p>Every primary and secondary animal contributes a separate passive. These stack with the rolled mutation, giving each mutant three identity-defining effects.</p></div>
  <div class="guide-section"><h3>Strategy and utility</h3><p>Teams grow from 2v2 to 4v4. Guarding, team buffs, healing, debuffs, action-gauge control, area attacks, and focus fire become essential. Heavy attacks have larger cooldown and recovery costs.</p></div>
  <div class="guide-section"><h3>Mutations</h3><p>Tap any mutant in scouting or roster screens to inspect its fixed mutation and move details. Mutations include stat changes, counters, healing, status application, revival, speed effects, and risk/reward mechanics.</p></div>
  <button class="btn" data-modal-close>Close Manual</button></div></div>`;
}
function openSettings(){
  modalRoot.innerHTML=`<div class="modal-wrap"><div class="modal"><div class="screen-title"><h2>Settings</h2><button class="icon-btn" data-modal-close>×</button></div>
  <div class="settings-row"><span>Sound effects</span><button class="toggle ${save.settings.sound?"on":""}" data-setting="sound"><i></i></button></div>
  <div class="settings-row"><span>Confirm forfeits</span><button class="toggle ${save.settings.confirmForfeit?"on":""}" data-setting="confirmForfeit"><i></i></button></div>
  <div class="settings-row"><span>Version</span><b>${VERSION}</b></div>
  ${user?`<button class="btn secondary" style="margin-top:12px" data-action="logout">Sign out</button>`:""}
  <button class="btn red" style="margin-top:8px" data-action="reset-save">Reset local career</button></div></div>`;
}
function openEmailModal(){
  modalRoot.innerHTML=`<div class="modal-wrap"><div class="modal"><div class="screen-title"><h2>Email Sign In</h2><button class="icon-btn" data-modal-close>×</button></div>
  <div class="form"><input id="email" type="email" autocomplete="email" placeholder="Email"><input id="password" type="password" autocomplete="current-password" placeholder="Password"></div>
  <div class="grid2"><button class="btn secondary" data-action="email-register">Create account</button><button class="btn" data-action="email-login">Sign in</button></div></div></div>`;
}
async function doAuth(type){
  try{
    if(type==="google")await googleLogin();
    else{
      const email=document.querySelector("#email")?.value.trim(),password=document.querySelector("#password")?.value;
      if(!email||!password)return toast("Enter email and password");
      if(type==="register")await emailRegister(email,password);else await emailLogin(email,password);
      modalRoot.innerHTML="";
    }
  }catch(e){toast(authMessage(e.code)||e.message)}
}
function authMessage(code){
  const map={"auth/unauthorized-domain":"This GitHub Pages domain is not in Firebase Authentication → Settings → Authorized domains.","auth/operation-not-allowed":"Enable this sign-in provider in Firebase Authentication → Sign-in method.","auth/popup-closed-by-user":"The Google sign-in window was closed.","auth/email-already-in-use":"That email already has an account.","auth/invalid-credential":"Email or password is incorrect.","auth/weak-password":"Use at least six characters.","auth/popup-blocked":"Popup blocked. Try again."};
  return map[code];
}
function forfeit(){
  if(save.settings.confirmForfeit&&!confirm("Forfeit this run?"))return;
  save.matchLosses++;save.currentStreak=0;completeRun(false);render();
}
function go(screen){
  if(screen==="wheels"&&!state.rolls)return;
  if(screen==="bracket"&&!state.run)return state.screen="home",render();
  state.screen=screen;render();
}

app.addEventListener("click",async e=>{
  const goEl=e.target.closest("[data-go]");if(goEl)return go(goEl.dataset.go);
  const spin=e.target.closest("[data-spin]");if(spin)return spinWheel(spin.dataset.spin);
  const toggle=e.target.closest("[data-toggle-mutant]");if(toggle)return toggleMutant(toggle.dataset.toggleMutant);
  const target=e.target.closest("[data-target]");if(target)return selectTarget(target.dataset.target);
  const move=e.target.closest("[data-move]");if(move)return choosePlayerMove(Number(move.dataset.move));
  const scout=e.target.closest("[data-scout]");if(scout)return showScout(scout.dataset.scout);
  const handler=e.target.closest("[data-handler]");if(handler)return showHandler(handler.dataset.handler);
  const recruit=e.target.closest("[data-recruit-select]");if(recruit)return selectRecruit(recruit.dataset.recruitSelect);
  const replace=e.target.closest("[data-replace]");if(replace)return replaceMutant(replace.dataset.replace,replace.dataset.new);
  const leader=e.target.closest("[data-leader]");if(leader){state.leaderField=leader.dataset.leader;return renderLeaderboard()}
  const setting=e.target.closest("[data-setting]");if(setting){const k=setting.dataset.setting;save.settings[k]=!save.settings[k];persist();return openSettings()}
  if(e.target.closest("[data-modal-close]")){modalRoot.innerHTML="";return}
  const action=e.target.closest("[data-action]")?.dataset.action;
  if(!action)return;
  const actions={
    "settings":openSettings,"tutorial":openTutorial,"start-run":startRun,"lock-mutant":lockMutant,"enter-tier":enterTier,
    "start-battle":startBattle,"confirm-team":()=>go("bracket"),"confirm-recruit":confirmRecruit,
    "pass-recruit":passRecruit,"forfeit":forfeit,"continue-run":()=>go(state.run.enemyTeam.length?"bracket":"mutant"),
    "abandon-run":()=>{if(confirm("Abandon current run?")){state.run=null;persist();render()}},
    "google-login":()=>doAuth("google"),"email-modal":openEmailModal,"email-login":()=>doAuth("login"),
    "email-register":()=>doAuth("register"),"logout":async()=>{await logout();modalRoot.innerHTML=""},
    "reset-save":()=>{if(confirm("Reset all local UMFL career data?")){save=mergeSave({});localStorage.removeItem("umfl-save");state.run=null;modalRoot.innerHTML="";persist();render()}}
  };
  actions[action]?.();
});
modalRoot.addEventListener("click",e=>{
  if(e.target.closest("[data-modal-close]")||e.target.classList.contains("modal-wrap"))modalRoot.innerHTML="";
  const replace=e.target.closest("[data-replace]");if(replace)return replaceMutant(replace.dataset.replace,replace.dataset.new);
  const setting=e.target.closest("[data-setting]");if(setting){const k=setting.dataset.setting;save.settings[k]=!save.settings[k];persist();return openSettings()}
  const action=e.target.closest("[data-action]")?.dataset.action;
  if(action==="logout")logout().then(()=>modalRoot.innerHTML="");
  if(action==="reset-save"&&confirm("Reset all local UMFL career data?")){save=mergeSave({});localStorage.removeItem("umfl-save");state.run=null;modalRoot.innerHTML="";persist();render()}
});

document.addEventListener("pointerdown",e=>{if(save.settings.sound&&e.target.closest("button"))sfx("click")},{passive:true});
watchAuth(async nextUser=>{
  user=nextUser;
  if(user){
    try{
      const cloud=await loadUserSave(user.uid);
      if(cloud?.save){
        const localProgress=save.matchWins+save.championships;
        const cloudProgress=(cloud.save.matchWins||0)+(cloud.save.championships||0);
        if(cloudProgress>=localProgress)save=mergeSave(cloud.save);
        if(cloud.activeRun&&!state.run)state.run=cloud.activeRun;
        localStorage.setItem("umfl-save",JSON.stringify(save));
      }
      persist();
    }catch(e){console.warn(e)}
  }
  render();
});
render();


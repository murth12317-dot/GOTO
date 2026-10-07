// 三麻 ノーマル華4ルール：対局エンジン（サーバー・ブラウザ共通）
"use strict";
function createGame(hooks){
  let G, H, R, handSeq=0, dead=false;
  const AUTO_WIN=[false,false,false]; // 自動和了（席ごと。局をまたいでも続く）
  const NAMES = hooks.names;
  // ルールの選択：shuba（シュバリーあり）、wareme（割れ目あり）
  const RULES = Object.assign({ hana:4, shuba:false, wareme:false }, hooks.rules||{});
  const isCPU = s => hooks.isCPU(s);
  const SE = hooks.SE;
  const render = () => hooks.update && hooks.update();
  const showResult = () => hooks.result && hooks.result();
  const showFinal = order => hooks.final && hooks.final(order);
  const _st = (typeof globalThis!=="undefined"?globalThis:window).setTimeout;
  const _ct = (typeof globalThis!=="undefined"?globalThis:window).clearTimeout;
  const setTimeout = (fn,ms) => { const hid=H&&H.id; return _st(()=>{ if(dead||!H||H.id!==hid) return; fn(); }, ms*(hooks.speed??1)); };
  const clearTimeout = t => _ct(t);

const NUMS = "一二三四五六七八九";
const HON = ["東","南","西","北","白","發","中","春","夏","秋","冬"];
const ALLK = [0,8]; for(let i=9;i<=33;i++) ALLK.push(i);
const YAO = [0,8,9,17,18,26,27,28,29,30,31,32,33];
const isYao = k => k>=27 || k%9===0 || k%9===8;
const isHonor = k => k>=27;
const suitOf = k => k<9?0:k<18?1:k<27?2:3;
function nextKind(k){
  if(k===0) return 8; if(k===8) return 0;
  if(k<27){ const b=Math.floor(k/9)*9; return b+((k-b+1)%9); }
  if(k<=30) return 27+((k-27+1)%4);
  return 31+((k-31+1)%3);
}
function kName(k){
  if(k<9) return NUMS[k]+"萬"; if(k<18) return NUMS[k-9]+"筒"; if(k<27) return NUMS[k-18]+"索";
  return HON[k-27];
}
function tName(t){ return (t.red?"赤":t.gold?"金":t.pocchi?"ポッチ":t.rainbow?"虹":t.fk?HON[t.fk-27]+"の":"")+kName(t.k); }
function buildTiles(){
  let id=0; const a=[]; const add=(k,o={})=>a.push(Object.assign({id:id++,k},o));
  for(const k of ALLK){
    if(k===13||k===22){ add(k,{red:true}); add(k,{gold:true}); add(k); add(k); }
    else if(k===31){ add(k,{pocchi:true}); add(k); add(k); add(k); }
    else if(RULES.hana===7&&(k===15||k===24)){ add(k); add(k); add(k); add(k,{rainbow:true}); add(k,{fk:k===15?34:35}); add(k,{fk:k===15?37:36}); } // セブンスター：7p・7sは黒3・虹1・華2（7p＝春・冬、7s＝夏・秋）
    else for(let j=0;j<4;j++) add(k);
  }
  for(let n=0;n<(RULES.hana===8?2:1);n++) for(let f=34;f<=37;f++) add(f);
  return a;
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
const sortHand = h => h.sort((a,b)=>a.k-b.k || (b.red?2:b.gold?1:0)-(a.red?2:a.gold?1:0));
const counts = tiles => { const c=new Array(38).fill(0); for(const t of tiles) c[t.k]++; return c; };
const ceil1000 = x => Math.ceil(x/1000)*1000;
const rollDice = () => { const rolls=[]; let total=0; while(true){ const a=1+Math.floor(Math.random()*6), b=1+Math.floor(Math.random()*6); rolls.push([a,b]); total+=a+b; if(a!==b) break; } return {rolls,total}; };

// ===== 向聴数 =====
function shantenNormal(c0, m){
  const c=c0.slice(0,34); c[30]=0; let best=8;
  function rec(i,me,ta,pr){
    while(i<34 && c[i]===0) i++;
    if(i>=34){ const t=Math.min(ta,m-me); const s=2*(m-me)-t-pr; if(s<best) best=s; return; }
    if(c[i]>=3 && me<m){ c[i]-=3; rec(i,me+1,ta,pr); c[i]+=3; }
    if(i<27 && i%9<=6 && c[i+1] && c[i+2] && me<m){ c[i]--;c[i+1]--;c[i+2]--; rec(i,me+1,ta,pr); c[i]++;c[i+1]++;c[i+2]++; }
    if(c[i]>=2){ if(!pr){ c[i]-=2; rec(i,me,ta,1); c[i]+=2; } if(me+ta<m){ c[i]-=2; rec(i,me,ta+1,pr); c[i]+=2; } }
    if(i<27 && me+ta<m){
      if(i%9<=7 && c[i+1]){ c[i]--;c[i+1]--; rec(i,me,ta+1,pr); c[i]++;c[i+1]++; }
      if(i%9<=6 && c[i+2]){ c[i]--;c[i+2]--; rec(i,me,ta+1,pr); c[i]++;c[i+2]++; }
    }
    c[i]--; rec(i,me,ta,pr); c[i]++;
  }
  rec(0,0,0,0); return best;
}
function shanten(tiles, calls){
  const c=counts(tiles); let s=shantenNormal(c,4-calls);
  if(calls===0){
    let pairs=0; for(let k=0;k<34;k++) if(k!==30) pairs+=Math.floor(c[k]/2);
    s=Math.min(s, 6-Math.min(pairs,7));
    let d=0,p=0; for(const k of YAO){ if(c[k]) d++; if(c[k]>=2) p=1; }
    s=Math.min(s, 13-d-p);
  }
  return s;
}

// ===== 和了判定 =====
function decomps(c, need){
  const res=[];
  function dfs(i,sets,pair){
    while(i<34 && c[i]===0) i++;
    if(i>=34){ if(sets.length===need) res.push({pair,sets:sets.slice()}); return; }
    if(sets.length>=need) return;
    if(c[i]>=3){ c[i]-=3; sets.push({t:"pon",k:i}); dfs(i,sets,pair); sets.pop(); c[i]+=3; }
    if(i<27 && i%9<=6 && c[i+1] && c[i+2]){ c[i]--;c[i+1]--;c[i+2]--; sets.push({t:"chi",k:i}); dfs(i,sets,pair); sets.pop(); c[i]++;c[i+1]++;c[i+2]++; }
  }
  for(let p=0;p<34;p++) if(c[p]>=2){ c[p]-=2; dfs(0,[],p); c[p]+=2; }
  return res;
}
function basePts(han,fu){
  if(han>=13) return 8000; if(han>=11) return 6000; if(han>=8) return 4000; if(han>=6) return 3000; if(han>=5) return 2000;
  return Math.min(fu*Math.pow(2,han+2), 2000);
}
const RANK = {2000:"満貫",3000:"跳満",4000:"倍満",6000:"三倍満",8000:"数え役満",10000:"5倍満",12000:"6倍満"};
const roundWind = () => G.phase%2===0?27:28;
const seatWind = s => 27+((s-G.dealer+3)%3);

// conc: 和了形の手牌（14-3×鳴き枚数）, winK: 和了牌の種類
function evaluate(seat, conc, winK, ctx, shapeOnly){
  const P=H.p[seat], called=P.melds, closed=called.every(m=>m.t==="ankan");
  const c=counts(conc); const rw=roundWind(), sw=seatWind(seat);
  // セブンスター：7p・7sは6枚あるが、1人が使えるのは鳴きも含めて4枚まで（45677777 のような和了はできない）
  if(RULES.hana===7) for(const k of [15,24]){ if(c[k]+called.reduce((n,m)=>n+m.tiles.filter(t=>t.k===k).length,0)>4) return shapeOnly?false:null; }
  const sit={yaku:[],ym:[]};
  if(ctx.tenhou) sit.ym.push(["天和",1]);
  if(ctx.chihou) sit.ym.push(["地和",1]);
  if(ctx.riichi){ sit.yaku.push(ctx.dbl?["ダブル立直",2]:["立直",1]); if(ctx.open) sit.yaku.push(["オープンリーチ",1]); if(ctx.ippatsu) sit.yaku.push(["一発",1]); }
  if(closed && ctx.tsumo) sit.yaku.push(["門前清自摸和",1]);
  if(ctx.haitei) sit.yaku.push(["海底摸月",1]);
  if(ctx.rinshan) sit.yaku.push(["嶺上開花",1]);
  if(ctx.houtei) sit.yaku.push(["河底撈魚",1]);
  const cands=[];
  const add=(yk,ym,fu,kind)=>cands.push({yaku:sit.yaku.concat(yk),ym:sit.ym.concat(ym),fu,kind});
  // 国士無双
  if(closed && YAO.every(k=>c[k]>=1) && YAO.reduce((s,k)=>s+c[k],0)===14){ if(shapeOnly) return true; add([],[["国士無双",1]],30,"kokushi"); }
  // 七対子
  if(closed && conc.length===14 && c.slice(0,34).every(x=>x%2===0) && c[30]===0){
    if(shapeOnly) return true;
    const ks=[]; for(let k=0;k<34;k++) if(c[k]) ks.push(k);
    const quads=ks.filter(k=>c[k]===4).length;
    const allH=ks.every(isHonor), suits=new Set(ks.filter(k=>k<27).map(suitOf)), hasH=ks.some(isHonor);
    const chin=suits.size===1&&!hasH, hon=suits.size===1&&hasH, honro=ks.every(isYao);
    const yk=[], ym=[];
    if(chin) ym.push(["大車輪",1]);
    if(quads>=3) ym.push(["4枚使い七対子（3組）",1]);
    if(allH) ym.push(["字一色",1]);
    if(ks.every(k=>!isYao(k))) yk.push(["断么九",1]);
    if(hon) yk.push(["小車輪",6]); else if(honro) yk.push(["混老頭七対子",6]); else if(!chin) yk.push(["七対子",2]);
    if(hon&&honro) yk.push(["混老頭",2]);
    if(quads>0 && quads<3) yk.push([`4枚使い×${quads}`,4*quads]);
    add(yk,ym,25,"chiitoi");
  }
  // 通常形
  const need=4-called.length;
  for(const d of decomps(c.slice(0,34),need)){
    const places=[]; if(d.pair===winK) places.push(-1);
    d.sets.forEach((s,i)=>{ if((s.t==="pon"&&s.k===winK)||(s.t==="chi"&&winK>=s.k&&winK<=s.k+2)) places.push(i); });
    for(const pl of places){
      const sets=d.sets.map((s,i)=>({t:s.t,k:s.k,open:false,ronOpen:!ctx.tsumo&&i===pl&&s.t==="pon"}));
      const all=sets.concat(called.map(m=>({t:"pon",k:m.k,open:m.t!=="ankan",kan:m.t!=="pon"})));
      const pons=all.filter(s=>s.t==="pon"), chis=all.filter(s=>s.t==="chi");
      const windPons=pons.filter(s=>s.k>=27&&s.k<=30).length, windPair=d.pair>=27&&d.pair<=30;
      const dai4=windPons===4, sho4=windPons===3&&windPair;
      const uses30=d.pair===30||pons.some(s=>s.k===30);
      if(uses30 && !(dai4||sho4)) continue;
      if(shapeOnly) return true;
      let wait="ryanmen";
      if(pl===-1) wait="tanki"; else if(sets[pl].t==="pon") wait="shanpon";
      else { const w=winK-sets[pl].k; if(w===1) wait="kanchan"; else if((w===0&&sets[pl].k%9===6)||(w===2&&sets[pl].k%9===0)) wait="penchan"; }
      const ks=[d.pair,d.pair]; for(const s of all){ if(s.t==="pon") ks.push(s.k,s.k,s.k); else ks.push(s.k,s.k+1,s.k+2); }
      const yk=[], ym=[];
      const hasH=ks.some(isHonor), allH=ks.every(isHonor), suits=new Set(ks.filter(k=>k<27).map(suitOf));
      if(ks.every(k=>!isYao(k))) yk.push(["断么九",1]);
      for(const s of pons){
        if(s.k===31) yk.push(["役牌 白",1]); if(s.k===32) yk.push(["役牌 發",1]); if(s.k===33) yk.push(["役牌 中",1]);
        if(s.k===rw) yk.push(["場風 "+HON[rw-27],1]); if(s.k===sw) yk.push(["自風 "+HON[sw-27],1]);
      }
      const yakuPair=d.pair>=31||d.pair===rw||d.pair===sw;
      const pinfu=closed&&chis.length===4&&!yakuPair&&wait==="ryanmen";
      if(pinfu) yk.push(["平和",1]);
      if(closed){ const m={}; chis.forEach(s=>m[s.k]=(m[s.k]||0)+1); const n=Object.values(m).reduce((a,v)=>a+Math.floor(v/2),0);
        if(n===2) yk.push(["二盃口",3]); else if(n===1) yk.push(["一盃口",1]); }
      for(const b of [9,18]) if([b,b+3,b+6].every(x=>chis.some(s=>s.k===x))) yk.push(["一気通貫",closed?2:1]);
      for(const n of [0,8]) if([n,9+n,18+n].every(x=>pons.some(s=>s.k===x))) yk.push(["三色同刻",2]);
      if(pons.length===4) yk.push(["対々和",2]);
      const ank=sets.filter(s=>s.t==="pon"&&!s.ronOpen).length+called.filter(m=>m.t==="ankan").length;
      const kans=called.filter(m=>m.t!=="pon").length; if(kans===4) ym.push(["四槓子",1]); else if(kans===3) yk.push(["三槓子",2]);
      if(ank===4) ym.push(["四暗刻",1]); else if(ank===3) yk.push(["三暗刻",2]);
      const dp=pons.filter(s=>s.k>=31).length;
      if(dp===3) ym.push(["大三元",1]); else if(dp===2&&d.pair>=31) yk.push(["小三元",2]);
      if(dai4) ym.push(["大四喜",1]); else if(sho4) ym.push(["小四喜",1]);
      if(allH) ym.push(["字一色",1]);
      const chinro=ks.every(k=>k<27&&isYao(k)); if(chinro) ym.push(["清老頭",1]);
      if(ks.every(k=>[19,20,21,23,25,32].includes(k))) ym.push(["緑一色",1]);
      if(closed && suits.size===1 && !hasH){ const b=[...suits][0]*9; let ok=c[b]>=3&&c[b+8]>=3; for(let j=1;j<=7;j++) if(c[b+j]<1) ok=false; if(ok) ym.push(["九蓮宝燈",1]); }
      if(ks.every(isYao) && chis.length===0 && !allH && !chinro) yk.push(["混老頭",2]);
      const chantaOK=chis.length>0 && isYao(d.pair) && all.every(s=>s.t==="pon"?isYao(s.k):(s.k%9===0||s.k%9===6));
      if(chantaOK) yk.push(hasH?["チャンタ",closed?4:2]:["純チャン",closed?6:4]);
      if(suits.size===1){ if(hasH) yk.push(["混一色",closed?3:2]); else yk.push(["清一色",closed?6:5]); }
      let fu;
      if(pinfu) fu=ctx.tsumo?20:30;
      else {
        fu=20; if(closed&&!ctx.tsumo) fu+=10; if(ctx.tsumo) fu+=2;
        if(["tanki","kanchan","penchan"].includes(wait)) fu+=2;
        if(d.pair>=31) fu+=2; if(d.pair===rw) fu+=2; if(d.pair===sw) fu+=2;
        for(const s of pons){ let f=isYao(s.k)?4:2; if(!s.open&&!s.ronOpen) f*=2; if(s.kan) f*=4; fu+=f; }
        if(!closed && fu===20) fu=30;
        fu=Math.ceil(fu/10)*10;
      }
      add(yk,ym,fu,"normal");
    }
  }
  if(shapeOnly) return false;
  let best=null;
  for(const r of cands){
    r.han=r.yaku.reduce((s,y)=>s+y[1],0);
    r.ymN=r.ym.reduce((s,y)=>s+y[1],0);
    if(r.ymN===0 && r.han===0) continue;
    r.key=r.ymN>0?1e7*r.ymN:basePts(r.han+(ctx.dora||0),r.fu)*100+r.han;
    if(!best||r.key>best.key) best=r;
  }
  return best;
}
const isAgariShape = (seat, conc, k) => evaluate(seat, conc, k, {tsumo:true}, true);
function waits(seat, conc){
  const w=[]; for(const k of ALLK){ if(isAgariShape(seat, conc.concat([{k,id:-1}]), k)) w.push(k); } return w;
}

const isClosed = P => P.melds.every(m=>m.t==="ankan");
// ===== ゲーム状態 =====
function newGame(){
  G={scores:[35000,35000,35000],chips:[0,0,0],dealer:0,phase:0,honba:0,kyotaku:0,over:false,log:[],hist:[],shubaUsed:[false,false,false],shubaOn:!!RULES.shuba};
  startHand();
}
function log(s){ G.log.unshift(s); if(G.log.length>60) G.log.pop(); }
var startHand=function(){
  const all=shuffle(buildTiles());
  const dead={kan:all.splice(-4),kita:all.splice(-4),hana:all.splice(-(RULES.hana===4?4:8)),dora:all.splice(-2),ura:all.splice(-2)};
  H={id:++handSeq,live:all,dead,p:[0,1,2].map(()=>({hand:[],melds:[],river:[],kita:[],hana:[],riichi:false,shuba:false,dbl:false,ippatsu:false,tempF:false,riichiF:false,calledFrom:false})),
     turn:G.dealer,noCalls:true,noNaki:[false,false,false],kanDora:[],kanUra:[],state:"idle",drawn:null,tobiPaid:[0,0,0],sel:null,prompt:null};
  H.startScores=G.scores.slice(); H.startChips=G.chips.slice(); H.label=roundLabel();
  // 割れ目：局の始めにランダムで1人（サイコロは使わない）
  H.wareme=RULES.wareme?Math.floor(Math.random()*3):null;
  for(let r=0;r<13;r++) for(let i=0;i<3;i++) H.p[(G.dealer+i)%3].hand.push(H.live.shift());
  for(const p of H.p) sortHand(p.hand);
  log(`── ${roundLabel()} 開始`); if(H.wareme!=null) log(`割れ目：${NAMES[H.wareme]}`); SE.shuffle();
  // 配牌の華牌・北は、各自の最初の手番で抜く（ツモ順を守る）
  for(let i=0;i<3;i++){ sortHand(H.p[(G.dealer+i)%3].hand); }
  drawFor(G.dealer);
}
function roundLabel(){
  const w=["東","南","返り東","南（2周目）"][Math.min(G.phase,3)];
  return `${w}${G.dealer+1}局 ${G.honba}本場`;
}
function doraKinds(list){ return list.filter(t=>t.k<34).map(t=>nextKind(t.k)); }

// ===== 華牌・北 =====
// 祝儀の倍率：シュバリーした人がもらう分×2、割れ目の人が払う・もらう分×2（重なれば×4）。ウマ・8万点超えは普通通り
const CHIP_PLAIN=["ウマ","8万点超え"];
function chipMult(from,to,why){
  if(!H||CHIP_PLAIN.includes(why)) return 1;
  let m=1;
  if(RULES.shuba && H.p[to] && H.p[to].shuba) m*=2;
  if(RULES.wareme && H.wareme!=null && (from===H.wareme||to===H.wareme)) m*=2;
  return m;
}
function payChips(from,to,n,why){ if(n<=0||from===to) return; n*=chipMult(from,to,why); G.chips[from]-=n; G.chips[to]+=n; if(R) R.chips.push({from,to,n,why}); else log(`${NAMES[from]} → ${NAMES[to]} 祝儀${n}枚（${why}）`); }
// 華の効果の種類（34春・35夏・36秋・37冬）。華牌はそのまま、セブンスターの特別な7は fk
const fkOf = t => t.k>=34 ? t.k : (t.fk||null);
// 特別な7を抜けるか：自分の番。リーチ中はいま引いた牌だけ
function starOptions(s){
  const P=H.p[s]; if(H.state!=="play"&&H.state!=="cpu"||H.turn!==s) return [];
  return P.hand.filter(t=>t.fk && (!P.riichi || t===H.drawn)).map(t=>t.id);
}
function nukiHana(s, id){
  const P=H.p[s]; const t=id!=null ? P.hand.find(x=>x.id===id&&x.fk) : P.hand.find(x=>x.k>=34); if(!t) return false;
  if(id!=null && !starOptions(s).includes(id)) return false;
  P.hand.splice(P.hand.indexOf(t),1);
  if(t.fk){
    // 華の7は、その7で和了できる人がロンできる（抜いた効果より先に確かめる）
    const order=[(s+1)%3,(s+2)%3];
    const rons=[]; for(const o of order){ const r=ronResult(o,t,s); if(r) rons.push({o,...r,robbed:t}); }
    if(rons.length){
      const cpuR=rons.filter(x=>isCPU(x.o)), pend={};
      for(const x of rons) if(!isCPU(x.o)) pend[x.o]={ron:x,pon:false,kan:false,answer:null};
      H.limbo=t; // ロンを確かめている間の華の7（ロンされたら和了した人の手に入る）
      H.prompt={s,t,cpuR,pend,rob:true}; H.state="prompt"; render();
      if(!Object.keys(pend).length){ setTimeout(()=>resolvePrompt(),300); return "prompt"; }
      const autoRon=Object.keys(pend).map(Number).filter(o=>AUTO_WIN[o]);
      if(autoRon.length) setTimeout(()=>{ for(const o of autoRon) if(H.prompt&&H.prompt.pend[o]&&!H.prompt.pend[o].answer) promptAnswer(o,"ron"); },300);
      H.promptTimer=setTimeout(()=>{ if(H.prompt) { for(const p of Object.values(H.prompt.pend)) if(!p.answer) p.answer="pass"; resolvePrompt(); } },30000);
      return "prompt";
    }
  }
  return finishNuki(s,t);
}
// 抜いた華（華牌・華の7）の効果と補充
function finishNuki(s,t){
  const P=H.p[s];
  P.hana.push(t);
  const fk=fkOf(t), nm=HON[fk-27]+(t.fk?"の7":"");
  log(`${NAMES[s]}：${nm}を抜いた`);
  const KN=["","一","二","三","四","五","六","七","八"];
  const hasSpring=P.hana.some(x=>fkOf(x)===34), secondSpring=fk===34&&P.hana.filter(x=>fkOf(x)===34).length>=2;
  if(secondSpring) SE.say("春、二枚目です",s);
  else if(fk===34){ const n=P.hana.length; SE.say(n===1?"春の、一枚です":`春で、${KN[n]}枚です`,s); }
  else SE.say(hasSpring?`${HON[fk-27]}で、追加一枚です`:HON[fk-27],s);
  // 春を持っていれば、華牌を抜くたびに1枚（2枚目の春も、1枚目の春の効果で1枚。2枚目の春そのものの効果は和了時）
  if(hasSpring){ const n=fk===34&&!secondSpring?P.hana.length:1; for(const o of [0,1,2]) if(o!==s) payChips(o,s,n,"春"); }
  const r=H.dead.hana.pop(); if(r){ P.hand.push(r); H.drawn=r; H.rinshan=false; }
  return true;
}
function autoHana(s){ if(!isCPU(s)) return; while(nukiHana(s)); }
function nukiKita(s){
  const P=H.p[s]; const t=P.hand.find(x=>x.k===30); if(!t) return false;
  P.hand.splice(P.hand.indexOf(t),1); P.kita.push(t); log(`${NAMES[s]}：北を抜いた`); SE.say("ぺー",s);
  const r=H.dead.kita.pop(); if(r){ P.hand.push(r); H.drawn=r; H.rinshan=false; autoHana(s); }
  return true;
}
function autoKita(s){ while(H.p[s].hand.some(x=>x.k===30)) nukiKita(s); }

// ===== ツモ =====
function drawFor(s){
  H.turn=s; H.rinshan=false;
  if(H.live.length===0){ return exhaustive(); }
  const t=H.live.shift(); const P=H.p[s]; P.hand.push(t); H.drawn=t; SE.draw(s);
  H.haitei=H.live.length===0;
  autoHana(s);
  if(isCPU(s)){ H.state="cpu"; render(); setTimeout(()=>cpuTurn(s),420); }
  else { H.state="play"; render(); setTimeout(()=>{ if(!autoTsumo(s)&&P.riichi) riichiAuto(s); },380); }
}
function winCtx(s, tsumo){
  const P=H.p[s];
  return {tsumo, riichi:P.riichi, open:!!P.open, dbl:P.dbl, ippatsu:P.ippatsu,
    haitei:tsumo&&H.live.length===0&&!H.rinshan, houtei:!tsumo&&H.live.length===0, rinshan:tsumo&&!!H.rinshan,
    tenhou:tsumo&&s===G.dealer&&H.noCalls&&P.river.length===0,
    chihou:tsumo&&s!==G.dealer&&H.noCalls&&P.river.length===0};
}
function tryTsumo(s){
  const P=H.p[s];
  if(P.hand.some(x=>x.k>=34)) return null;
  // 白ポッチ（リーチ中のみ万能）
  if(P.riichi && H.drawn && H.drawn.pocchi){
    const rest=P.hand.filter(x=>x!==H.drawn); let best=null;
    for(const k of ALLK){ const v={k,id:-2,virtual:true}; const conc=rest.concat([v]); const ctx=winCtx(s,true); ctx.dora=doraInfo(s,conc).total;
      const r=evaluate(s,conc,k,ctx); if(r&&(!best||r.key>best.r.key)) best={r,conc,k}; }
    if(best) return {res:best.r,conc:best.conc,winK:best.k,pocchi:true};
  }
  if(!H.drawn||!P.hand.includes(H.drawn)) return null;
  const ctx=winCtx(s,true); ctx.dora=doraInfo(s,P.hand).total;
  const r=evaluate(s,P.hand,H.drawn.k,ctx);
  return r?{res:r,conc:P.hand.slice(),winK:H.drawn.k}:null;
}
// シュバリーできるか：ルールであり、この半荘でまだシュバ棒を出していない人間
function canShuba(s){ return !!(RULES.shuba && G.shubaUsed && !G.shubaUsed[s] && !isCPU(s)); }
function riichiOptions(s,open){
  const P=H.p[s];
  if(P.riichi||!isClosed(P)||G.scores[s]<(open?2000:1000)||H.live.length<3||P.hand.some(x=>x.k>=34)) return [];
  const ids=[];
  const ok=discardable(s);
  for(const t of P.hand){ if(t.k===30||t.k>=34||!ok.includes(t.id)) continue; const rest=P.hand.filter(x=>x!==t); if(shanten(rest,P.melds.length)===0 && waits(s,rest).length) ids.push(t.id); }
  return ids;
}
// 自動和了：ツモれるなら自動でツモ（手番の人が人間で、自動和了をオンにしているとき）
function autoTsumo(s){
  if(!AUTO_WIN[s]||isCPU(s)||H.state!=="play"||H.turn!==s) return false;
  const w=tryTsumo(s); if(!w) return false;
  settleTsumo(s,w); return true;
}
function setAutoWin(s,on){
  AUTO_WIN[s]=!!on; if(!on) return;
  if(H&&H.state==="play"&&H.turn===s) autoTsumo(s);
  else if(H&&H.state==="prompt"&&H.prompt&&H.prompt.pend[s]&&H.prompt.pend[s].ron&&!H.prompt.pend[s].answer) promptAnswer(s,"ron");
}
function riichiAuto(s){
  if(H.state!=="play"||H.turn!==s||!H.drawn) return; const P=H.p[s];
  if(!P.riichi) return;
  if(tryTsumo(s)) return; // ボタンで選ぶ
  if(P.hand.some(x=>x.k>=34)) return; // 華は抜いてから
  if(H.drawn.k===30) return; // 引いた北は抜くか持つか選ぶ（切れない）
  if(H.drawn.fk) return; // 引いた特別な7は、抜くか切るかを選ぶ
  if(kanOptions(s).length) return; // カンするか選べる
  discard(s,H.drawn.id,false);
}

// ===== 打牌 =====
function discard(s, id, riichi, open, shuba){
  const P=H.p[s]; const t=P.hand.find(x=>x.id===id); if(!t||t.k===30||t.k>=34) return;
  if(!P.riichi && !discardable(s).includes(id)) return;
  P.hand.splice(P.hand.indexOf(t),1); sortHand(P.hand);
  if(P.ippatsu && !riichi) P.ippatsu=false;
  const doShuba=!!(riichi && shuba && canShuba(s));
  if(doShuba){ P.shuba=true; G.shubaUsed[s]=true; log(`${NAMES[s]}：シュバ棒を出した（このあともらう祝儀が2倍）`); }
  if(riichi){ SE.say(doShuba?(open?"シュバオープン":"シュバリー"):open?"オープンリーチ":"リーチ",s); P.riichi=true; P.open=!!open; P.dbl=P.river.length===0&&H.noCalls; P.ippatsu=true; G.scores[s]-=open?2000:1000; G.kyotaku+=open?2:1; log(`${NAMES[s]}：${open?"オープンリーチ":"リーチ"}`); }
  if(!P.riichi) P.tempF=false;
  P.river.push({t,riichi,tg:t===H.drawn}); H.drawn=null; // tg：ツモ切り（引いた牌をそのまま切った） H.rinshan=false; H.last={s,t}; SE.clack();
  log(`${NAMES[s]}：${tName(t)}を切った`);
  afterDiscard(s,t);
}
function furiten(o){
  const P=H.p[o]; if(P.tempF||P.riichiF) return true;
  const w=waits(o,P.hand); return P.river.some(r=>w.includes(r.t.k));
}
function ronResult(o,t,d){
  const P=H.p[o]; if(furiten(o)) return null;
  const conc=P.hand.concat([t]); const ctx=winCtx(o,false); ctx.dora=doraInfo(o,conc).total;
  let r=evaluate(o,conc,t.k,ctx);
  // オープンリーチに、リーチしていない人が放銃したら役満
  if(r && P.open && d!=null && !H.p[d].riichi && r.ymN<1) r=Object.assign({},r,{ym:[["オープンリーチ放銃",1]],ymN:1,key:1e7});
  return r?{res:r,conc,winK:t.k}:null;
}
// 包：大三元の3つ目の三元牌を鳴かせた人
function checkPao(o,from,k){
  const P=H.p[o];
  if(k>=31&&k<=33 && P.melds.filter(m=>m.k>=31&&m.k<=33).length===3 && !P.pao){ P.pao={by:from,ym:"大三元"}; log(`${NAMES[from]}：大三元の包`); }
}
function paoOf(s,w){ const P=H.p[s]; return P.pao && P.pao.by!==s && w.res.ym.some(y=>y[0]===P.pao.ym) ? P.pao.by : null; }
function canPonOf(o,t){ const P=H.p[o]; return !P.riichi && t.k!==30 && H.live.length>0 && P.hand.filter(x=>x.k===t.k).length>=2; }
function canKanOf(o,t){ const P=H.p[o]; return !P.riichi && t.k!==30 && H.live.length>0 && H.dead.kan.length>0 && P.hand.filter(x=>x.k===t.k).length>=3; }
function afterDiscard(s,t){
  const order=[(s+1)%3,(s+2)%3];
  const rons=[]; for(const o of order){ const r=ronResult(o,t,s); if(r) rons.push({o,...r}); }
  const cpuR=rons.filter(x=>isCPU(x.o));
  const pend={};
  for(const o of order){ if(isCPU(o)) continue;
    const hr=rons.find(x=>x.o===o)||null; const pon=!H.noNaki[o]&&canPonOf(o,t), kan=!H.noNaki[o]&&canKanOf(o,t);
    if(hr||((pon||kan)&&!cpuR.length)) pend[o]={ron:hr,pon,kan,answer:null}; }
  if(Object.keys(pend).length){
    H.state="prompt"; H.prompt={s,t,cpuR,pend}; render();
    // 自動和了：ロンできる人は自動でロン
    const autoRon=Object.keys(pend).map(Number).filter(o=>pend[o].ron&&AUTO_WIN[o]);
    if(autoRon.length){ setTimeout(()=>{ for(const o of autoRon) if(H.prompt&&H.prompt.pend[o]&&!H.prompt.pend[o].answer) promptAnswer(o,"ron"); },300); }
    H.promptTimer=setTimeout(()=>{ if(H.prompt) { for(const p of Object.values(H.prompt.pend)) if(!p.answer) p.answer="pass"; resolvePrompt(); } },30000);
    return;
  }
  if(cpuR.length) return settleRon(s,t,cpuR);
  for(const o of order){ if(isCPU(o) && canPonOf(o,t) && cpuWantsPon(o,t.k)) return doPon(o,s,t); }
  setTimeout(()=>drawFor((s+1)%3), 260);
}
function promptAnswer(o,a){
  const pr=H.prompt; if(!pr||!pr.pend[o]||pr.pend[o].answer) return false;
  const p=pr.pend[o];
  if((a==="ron"&&!p.ron)||(a==="pon"&&!p.pon)||(a==="kan"&&!p.kan)) return false;
  p.answer=a;
  const pend=Object.values(pr.pend);
  // ロンが出ていて、ロンできる人の返事が全部そろったら、ポン・カンの返事は待たずに成立
  const ronWaiting=pend.some(x=>x.ron&&!x.answer);
  const anyRon=pr.cpuR.length>0||pend.some(x=>x.answer==="ron");
  if(anyRon && !ronWaiting) resolvePrompt();
  else if(pend.every(x=>x.answer)) resolvePrompt(); else render();
  return true;
}
function resolvePrompt(){
  const pr=H.prompt; if(!pr) return; clearTimeout(H.promptTimer); H.prompt=null;
  const order=[(pr.s+1)%3,(pr.s+2)%3];
  const ronList=pr.cpuR.slice();
  for(const o of order){ const p=pr.pend[o]; if(!p) continue;
    if(p.answer==="ron") ronList.push(p.ron);
    else if(p.ron){ const P=H.p[o]; if(P.riichi) P.riichiF=true; else P.tempF=true; } }
  if(ronList.length) return settleRon(pr.s,pr.t,ronList.sort((x,y)=>((x.o-pr.s+3)%3)-((y.o-pr.s+3)%3)));
  if(pr.rob){ // 華の7を抜いたのをだれもロンしなかった：抜くのを続けて、その人の番を続ける
    const s=pr.s; H.limbo=null; finishNuki(s,pr.t);
    if(isCPU(s)){ autoHana(s); H.state="cpu"; render(); setTimeout(()=>cpuTurn(s),300); }
    else { H.state="play"; H.turn=s; render(); setTimeout(()=>{ if(!autoTsumo(s)&&H.p[s].riichi) riichiAuto(s); },380); }
    return;
  }
  for(const o of order){ const p=pr.pend[o]; if(p&&p.answer==="kan") return doKan(o,"minkan",pr.t.k,pr.s,pr.t); if(p&&p.answer==="pon") return doPon(o,pr.s,pr.t); }
  for(const o of order){ if(isCPU(o) && canPonOf(o,pr.t) && cpuWantsPon(o,pr.t.k)) return doPon(o,pr.s,pr.t); }
  drawFor((pr.s+1)%3);
}
function cpuWantsPon(o,k){ return [31,32,33,roundWind(),seatWind(o)].includes(k); }
function doPon(o,from,t){
  const P=H.p[o]; const two=P.hand.filter(x=>x.k===t.k).slice(0,2);
  P.hand=P.hand.filter(x=>!two.includes(x));
  P.melds.push({t:"pon",k:t.k,tiles:[...two,t],from}); checkPao(o,from,t.k);
  const rv=H.p[from].river; rv[rv.length-1].called=true; H.p[from].calledFrom=true;
  H.noCalls=false; for(const p of H.p) p.ippatsu=false;
  log(`${NAMES[o]}：ポン（${kName(t.k)}）`); SE.say("ポン",o);
  H.turn=o; H.drawn=null;
  if(isCPU(o)){ H.state="cpu"; render(); setTimeout(()=>cpuDiscard(o),420); }
  else { H.state="play"; render(); }
}

// ===== カン =====
function riichiKanOK(s,k){
  const P=H.p[s]; if(!H.drawn||H.drawn.k!==k) return false;
  const w1=waits(s,P.hand.filter(t=>t!==H.drawn));
  P.melds.push({t:"ankan",k,tiles:[]}); const w2=waits(s,P.hand.filter(t=>t.k!==k)); P.melds.pop();
  return w1.length>0 && w1.join()===w2.join();
}
function kanOptions(s){
  const P=H.p[s]; if(!H.dead.kan.length||H.live.length===0) return [];
  const c=counts(P.hand), res=[];
  for(let k=0;k<34;k++) if(k!==30 && c[k]===4 && (!P.riichi||riichiKanOK(s,k))) res.push({type:"ankan",k});
  if(!P.riichi) for(const m of P.melds) if(m.t==="pon" && c[m.k]>=1) res.push({type:"kakan",k:m.k});
  return res;
}
function doKan(s,type,k,from,t){
  const P=H.p[s];
  if(type==="ankan"){ const four=P.hand.filter(x=>x.k===k); P.hand=P.hand.filter(x=>x.k!==k); P.melds.push({t:"ankan",k,tiles:four}); }
  else if(type==="kakan"){ const x=P.hand.find(y=>y.k===k); P.hand.splice(P.hand.indexOf(x),1); const m=P.melds.find(m=>m.t==="pon"&&m.k===k); m.t="kakan"; m.tiles.push(x); }
  else { const three=P.hand.filter(x=>x.k===k).slice(0,3); P.hand=P.hand.filter(x=>!three.includes(x)); P.melds.push({t:"minkan",k,tiles:[...three,t],from}); checkPao(s,from,k); const rv=H.p[from].river; rv[rv.length-1].called=true; H.p[from].calledFrom=true; }
  H.noCalls=false; for(const p of H.p) p.ippatsu=false;
  log(`${NAMES[s]}：カン（${kName(k)}）`); SE.say("カン",s);
  sortHand(P.hand);
  if(H.live.length>=2){ H.kanDora.push(H.live.pop()); H.kanUra.push(H.live.pop()); }
  const r=H.dead.kan.pop(); P.hand.push(r); H.drawn=r; H.rinshan=true; H.turn=s;
  autoHana(s);
  if(isCPU(s)){ autoKita(s); H.state="cpu"; render(); setTimeout(()=>cpuTurn(s),420); }
  else { H.state="play"; render(); setTimeout(()=>{ if(!autoTsumo(s)&&P.riichi) riichiAuto(s); },380); }
}

// ===== CPU =====
function cpuTurn(s){
  const P=H.p[s];
  autoKita(s);
  const w=tryTsumo(s); if(w) return settleTsumo(s,w);
  const ko=kanOptions(s); if(ko.length) return doKan(s,ko[0].type,ko[0].k);
  if(P.riichi){ if(H.drawn&&H.drawn.fk){ const r=nukiHana(s,H.drawn.id); if(r==="prompt") return; if(r){ autoHana(s); return setTimeout(()=>cpuTurn(s),300); } } return discard(s,H.drawn?H.drawn.id:P.hand[P.hand.length-1].id,false); }
  cpuDiscard(s);
}
// 切れる牌：北・華は不可。リーチしていない人は、オープンリーチの当たり牌は不可（全部当たりなら全部可）
function discardable(s){
  const P=H.p[s]; const cand=P.hand.filter(t=>t.k!==30&&t.k<34);
  const danger=openDanger(s); if(!danger.length) return cand.map(t=>t.id);
  const safe=cand.filter(t=>!danger.includes(t.k));
  return (safe.length?safe:cand).map(t=>t.id);
}
function openDanger(s){
  const P=H.p[s]; if(P.riichi) return [];
  const d=new Set(); for(const o of [0,1,2]) if(o!==s && H.p[o].open) for(const k of waits(o,H.p[o].hand)) d.add(k);
  return [...d];
}
function cpuDiscard(s){
  const P=H.p[s]; const calls=P.melds.length;
  let best=null; const danger=openDanger(s);
  const c=counts(P.hand);
  for(const t of P.hand){
    if(t.k===30||t.k>=34) continue;
    const rest=P.hand.filter(x=>x!==t); const sh=shanten(rest,calls);
    let v=0; const k=t.k;
    if(k<27){ for(const d of [-2,-1,1,2]){ const n=k+d; if(n>=0&&n<27&&suitOf(n)===suitOf(k)) v+=c[n]; } }
    v+=(c[k]-1)*2; if(cpuWantsPon(s,k)) v+=1; if(t.red||t.gold) v+=3; if(k===30) v-=5;
    const score=sh*100+v+(danger.includes(k)?100000:0);
    if(!best||score<best.score) best={t,score,sh};
  }
  if(best.t.fk){ const r=nukiHana(s,best.t.id); if(r==="prompt") return; if(r){ autoHana(s); return setTimeout(()=>cpuTurn(s),300); } } // 華の7は切らずに抜く
  const canR=!P.riichi&&isClosed(P)&&G.scores[s]>=1000&&H.live.length>=3&&best.sh===0&&waits(s,P.hand.filter(x=>x!==best.t)).length>0;
  discard(s,best.t.id,canR);
}

// ===== ドラ =====
function doraInfo(s, conc){
  const P=H.p[s];
  const tiles=conc.concat(...P.melds.map(m=>m.tiles));
  const dk=doraKinds(H.dead.dora.concat(H.kanDora)), uk=P.riichi?doraKinds(H.dead.ura.concat(H.kanUra)):[];
  const fl=flowersFor(s,conc);
  const akiN=fl.all.filter(k=>k===36).length, aki=akiN>0;
  let dora=0; for(const t of tiles) for(const k of dk) if(t.k===k&&!t.virtualSkip) dora++;
  const aka=tiles.filter(t=>t.red).length, gold=tiles.filter(t=>t.gold).length, rainbow=tiles.filter(t=>t.rainbow).length;
  const akaDora=(aka+gold+rainbow)*(aki?2:1); // 虹の7も赤5と同じくドラ1つ（秋で2倍）
  const kn=P.kita.length;
  const aki2=akiN>=2; // 秋秋
  const kitaDora=kn+(aki2?kn:0)+(kn===4?4:0)+kn*dk.filter(k=>k===30).length; // 北1枚1つ（秋秋で2つ）、4枚そろえば＋4
  const plain5=aki2?tiles.filter(t=>(t.k===13||t.k===22)&&!t.red&&!t.gold).length*2:0; // 秋秋：普通の5は1枚でドラ2つ
  let ura=0; for(const t of tiles) for(const k of uk) if(t.k===k) ura++;
  if(kn<4) ura+=kn*uk.filter(k=>k===30).length;
  return {dora,aka,gold,rainbow,akaDora,kitaDora,kn,ura,total:dora+akaDora+kitaDora+ura+plain5,aki,aki2,plain5};
}
function flowersFor(s,conc){
  const P=H.p[s];
  const own=P.hana.map(fkOf);
  const hand=(conc||P.hand).concat(...P.melds.map(m=>m.tiles)).filter(t=>t.fk).map(t=>t.fk); // 手に持ったままの特別な7
  const ind=H.dead.dora.concat(H.kanDora).filter(t=>fkOf(t)).map(fkOf); // ドラ表示（カンドラも）の華牌・華の7（華の7は普通の7としてもドラを決める）
  const ura=P.riichi?H.dead.ura.concat(H.kanUra).filter(t=>fkOf(t)).map(fkOf):[];
  return {own,ind,ura,hand,all:own.concat(ind,ura,hand)};
}

// ===== 精算 =====
function tier(sc){ return sc<=0?3+Math.floor(-sc/10000):0; }
// 割れ目の人が払う・もらう和了の点数は2倍（hb＝本場の分は倍にしない。ノーテン罰符も普通通り）
const PTS_WAREME=["ツモ","ロン","包（全額）","包（折半）","流し役満"];
function payPts(from,to,n,why,noTobi,hb=0){
  if(RULES.wareme && H && H.wareme!=null && (from===H.wareme||to===H.wareme) && PTS_WAREME.includes(why)) n*=2;
  n+=hb;
  if(n<=0) return; G.scores[from]-=n; G.scores[to]+=n; R.pts.push({from,to,n,why});
  if(!noTobi){ const due=tier(G.scores[from])-H.tobiPaid[from]; if(due>0){ H.tobiPaid[from]+=due; payChips(from,to,due,"トビ賞"); } }
}
function finalPoints(s, w){
  const r=w.res; const di=doraInfo(s,w.conc); const fl=flowersFor(s,w.conc);
  let base, han=r.han+di.total, label;
  const summer=fl.all.filter(k=>k===35).length; // 夏1枚につきワンランクアップ
  let kazoe=false;
  if(r.ymN>0){
    base=8000*r.ymN; label=r.ymN>1?`${r.ymN}倍役満`:"役満"; han=null;
    if(summer){ const m=4*r.ymN+summer; base=2000*m; label=`${m}倍満`; } // 夏：役満→5倍満（夏2枚なら6倍満）、ダブル役満→9倍満…（祝儀は役満のまま）
  } else {
    base=basePts(han,r.fu);
    for(let i=0;i<summer;i++){
      if(base<2000){ han+=1; base=basePts(han,r.fu); }
      else base={2000:3000,3000:4000,4000:6000,6000:8000,8000:10000,10000:12000}[base]||base;
    }
    kazoe=base>=8000;
    label=RANK[base]||`${r.fu}符${han}翻`;
  }
  return {base,han,label,di,fl,kazoe};
}
function newR(){ R={pts:[],chips:[],dice:[],alice:[],wins:[],draw:null,handDealer:G.dealer,handPhase:G.phase,handHonba:G.honba,wareme:H?H.wareme:null,shuba:H?H.p.map(p=>!!p.shuba):[false,false,false]}; }
function settleTsumo(s,w){
  SE.say("ツモ",s); SE.win();
  newR(); const P=H.p[s]; const fp=finalPoints(s,w); const dealerWin=s===G.dealer;
  const pao=paoOf(s,w);
  if(pao!=null){
    // 包の役満（大三元）1つ分は包の人が全額、残り（複合分・夏の上乗せ）は普通のツモ
    payPts(pao,s,ceil1000(8000*(dealerWin?6:4)),"包（全額）",false,2000*G.honba);
    const rest=fp.base-8000;
    if(rest>0) for(const o of [0,1,2]) if(o!==s){ const mult=(dealerWin||o===G.dealer)?2:1; payPts(o,s,ceil1000(rest*mult)+1000,"ツモ"); }
  }
  else for(const o of [0,1,2]) if(o!==s){
    const mult=(dealerWin||o===G.dealer)?2:1;
    payPts(o,s,ceil1000(fp.base*mult)+1000,"ツモ",false,1000*G.honba);
  }
  if(G.kyotaku){ G.scores[s]+=1000*G.kyotaku; R.pts.push({from:-1,to:s,n:1000*G.kyotaku,why:"供託"}); G.kyotaku=0; }
  const chips=winChips(s,w,fp,true,null);
  R.wins.push({s,w,fp,tsumo:true,chips,pao});
  finishHand([s]);
}
function settleRon(d,t,list){
  list.forEach(x=>SE.say("ロン",x.o)); SE.win();
  // リーチ（シュバリー）の宣言牌でロンされたら不成立：リーチ棒は払わない扱いで戻し、シュバ棒も使っていない扱いにする
  { const D=H.p[d], last=D.river[D.river.length-1];
    if(D.riichi && last && last.riichi && last.t===t){
      const amt=D.open?2000:1000; G.scores[d]+=amt; G.kyotaku=Math.max(0,G.kyotaku-amt/1000);
      D.riichi=false; D.open=false; D.ippatsu=false; D.dbl=false;
      if(D.shuba){ D.shuba=false; G.shubaUsed[d]=false; }
      log(`${NAMES[d]}：宣言牌でロンされたのでリーチは不成立`);
    } }
  newR();
  list.forEach((w,i)=>{
    const s=w.o; const fp=finalPoints(s,w); const mult=s===G.dealer?6:4;
    const pao=paoOf(s,w), amt=ceil1000(fp.base*mult), hb=(i===0?2000*G.honba:0);
    if(pao!=null && pao!==d){ const pa=ceil1000(8000*mult); payPts(d,s,pa/2+(amt-pa),"ロン",false,hb); payPts(pao,s,pa/2,"包（折半）"); }
    else payPts(d,s,amt,"ロン",false,hb);
    if(i===0&&G.kyotaku){ G.scores[s]+=1000*G.kyotaku; R.pts.push({from:-1,to:s,n:1000*G.kyotaku,why:"供託"}); G.kyotaku=0; }
    const chips=winChips(s,w,fp,false,d);
    R.wins.push({s,w,fp,tsumo:false,from:d,chips,pao});
  });
  finishHand(list.map(x=>x.o));
}
function winChips(s,w,fp,tsumo,d){
  const P=H.p[s], r=w.res, di=fp.di, closed=isClosed(P); const others=[0,1,2].filter(o=>o!==s);
  const lines=[];
  const pay=(n,why,both)=>{ if(n<=0) return; lines.push([why,n,both||tsumo?"2人から":"放銃者から"]); if(both||tsumo) others.forEach(o=>payChips(o,s,n,why)); else payChips(d,s,n,why); };
  const dice=(why)=>{ const x=rollDice(); R.dice.push({s,why,...x}); lines.push([why+"（サイコロ）",x.total,"2人から"]); others.forEach(o=>payChips(o,s,x.total,why+" サイコロ")); };
  const pocchiIppatsu=w.pocchi&&tsumo&&P.ippatsu;
  pay(di.aka,"赤5"); pay(di.gold*2,"金5"); pay((di.rainbow||0)*3,"虹7"); pay(di.kn,"抜き北"); pay(di.ura,"裏ドラ");
  if(P.ippatsu&&P.riichi&&!pocchiIppatsu) pay(1,"一発");
  if(r.ymN>0){ const pao=paoOf(s,w);
    if(pao!=null){ lines.push(["役満（包）",10,"包から"]); payChips(pao,s,10,"役満（包）"); if(r.ymN>1) pay(tsumo?5*(r.ymN-1):10*(r.ymN-1),"役満"); }
    else pay(tsumo?5*r.ymN:10*r.ymN,"役満");
    for(let i=0;i<r.ymN;i++) dice("役満"); }
  else if(fp.kazoe){ pay(tsumo?5:10,"数え役満"); }
  else if(fp.base===6000){ pay(3,"三倍満",true); }
  const tiles=w.conc.concat(...P.melds.map(m=>m.tiles));
  if(closed && tiles.some(t=>t.red&&t.k===13)&&tiles.some(t=>t.gold&&t.k===13)&&tiles.some(t=>t.red&&t.k===22)&&tiles.some(t=>t.gold&&t.k===22)) dice("赤金4枚");
  if(P.kita.length===4) dice("北4枚");
  if(RULES.hana===7 && tiles.filter(t=>t.fk||t.rainbow).length>=4) dice("セブンスター"); // 華の7・虹の7（6枚）のうち4枚以上を手牌で使って和了
  const mine=P.hana.map(fkOf).concat(w.robbed&&w.robbed.fk?[w.robbed.fk]:[]); // 抜いた華（相手が抜いた華の7をロンしたら、その牌も）
  const sets=Math.min(...[34,35,36,37].map(k=>mine.filter(f=>f===k).length));
  for(let i=0;i<sets;i++) dice(RULES.hana===4?"華牌4枚":"春夏秋冬");
  // 春（和了時）：1枚目の春は表示牌の華牌×1枚を追加、2枚目の春（自分の2枚目か表示牌の春）は全部の華牌×1枚（華4・華8共通）
  {
    const atWin=fp.fl.ind.concat(fp.fl.ura,fp.fl.hand), indF=atWin.length, ownS=P.hana.filter(t=>fkOf(t)===34).length;
    const springs=ownS+atWin.filter(k=>k===34).length, allF=P.hana.length+indF;
    if(ownS>=1 && indF) pay(indF,"春（表示牌の華牌）",true);
    if(ownS===0 && springs>=1) pay(allF,"表示牌の春",true); // 1枚目の春が表示牌のとき
    if(springs>=2) pay(allF,"2枚目の春",true);
  }
  if(w.pocchi){ if(pocchiIppatsu){ pay(4,"白ポッチ一発",true); dice("白ポッチ一発"); } else pay(1,"白ポッチ",true); }
  if(fp.fl.all.includes(37)){ // 冬：アリス（冬2枚ならチューリップ）
    // ドラ表示牌の隣（残りの山の最後）から順にめくる。嶺上牌はさわらない
    const tulip=fp.fl.all.filter(k=>k===37).length>=2; R.tulip=tulip;
    const src=H.live.slice().reverse(); const mult=closed?2:1; let total=0; R.aliceOut=true;
    // チューリップ：めくった牌と前後1つ（9→1・白發中・東南西北はつながる）が当たり。抜き北も持っている北として数える
    const own=tulip?tiles.concat(P.kita):tiles;
    for(const t of src){
      if(t.k>=34){ const n=fp.fl.all.length*mult; R.alice.push({t,hit:true,n}); total+=n; continue; } // 抜いた華牌＋ドラ表示・裏ドラ表示の華牌
      const kc=(tulip?tulipKinds(t.k).reduce((a,k)=>a+own.filter(x=>x.k===k).length,0):tiles.filter(x=>x.k===t.k).length)+(t.fk?fp.fl.all.length:0); // 華の7は華牌としても当たり
      if(kc>0){ R.alice.push({t,hit:true,n:kc*mult}); total+=kc*mult; } else { R.alice.push({t,hit:false}); R.aliceOut=false; break; }
    }
    pay(total,tulip?"チューリップ":"アリス");
  }
  return lines;
}
// チューリップで当たりになる牌の種類：同じ牌と前後1つ（数牌は9の次が1、三元牌は白發中、風牌は東南西北でつながる）
function tulipKinds(k){
  if(k<27){ const b=k-k%9, n=k%9; return [b+(n+8)%9, k, b+(n+1)%9]; }
  if(k<31){ const n=k-27; return [27+(n+3)%4, k, 27+(n+1)%4]; }
  const n=k-31; return [31+(n+2)%3, k, 31+(n+1)%3];
}
function exhaustive(){
  newR(); H.state="result";
  const ten=[0,1,2].map(s=>shanten(H.p[s].hand,H.p[s].melds.length)===0 && waits(s,H.p[s].hand).length>0);
  const naga=[0,1,2].filter(s=>!H.p[s].calledFrom && H.p[s].river.length>0 && H.p[s].river.every(r=>isYao(r.t.k)) && !H.p[s].river.some(r=>r.called));
  R.draw={ten,naga};
  if(naga.length){
    const s=naga[0]; const others=[0,1,2].filter(o=>o!==s);
    for(const o of others){ const mult=(s===G.dealer||o===G.dealer)?2:1; payPts(o,s,ceil1000(8000*mult)+1000,"流し役満"); }
    others.forEach(o=>payChips(o,s,5,"流し役満"));
    const x=rollDice(); R.dice.push({s,why:"流し役満",...x}); others.forEach(o=>payChips(o,s,x.total,"流し役満 サイコロ"));
    R.wins.push({s,nagashi:true});
    return finishHand([s]);
  }
  const tn=[0,1,2].filter(s=>ten[s]), nt=[0,1,2].filter(s=>!ten[s]);
  if(tn.length===1){ for(const o of nt) payPts(o,tn[0],2000,"ノーテン罰符",true); }
  else if(tn.length===2){ for(const t of tn) payPts(nt[0],t,2000,"ノーテン罰符",true); }
  for(const o of nt){ const due=tier(G.scores[o])-H.tobiPaid[o]; if(due>0 && tn.length){ H.tobiPaid[o]+=due; tn.forEach(t=>payChips(o,t,due,"トビ賞")); } }
  finishHand([]);
}
function finishHand(winners){
  // リーチ棒で0点になった人など、未精算のトビ
  for(const s of [0,1,2]){
    const due=tier(G.scores[s])-H.tobiPaid[s]; if(due<=0) continue; H.tobiPaid[s]+=due;
    let to=winners.filter(w=>w!==s);
    if(!winners.length) to=[0,1,2].filter(o=>o!==s && R.draw && R.draw.ten[o]);
    if(!to.length) to=[0,1,2].filter(o=>o!==s);
    if(winners.length) to=[to[0]];
    to.forEach(o=>payChips(s,o,due,"トビ賞"));
  }
  // 履歴
  let desc;
  if(R.wins.length) desc=R.wins.map(x=>x.nagashi?`${NAMES[x.s]} 流し役満`:`${NAMES[x.s]} ${x.tsumo?"ツモ":"ロン"} ${x.fp.label}`).join(" / ");
  else desc="流局";
  G.hist.push({label:H.label,desc,dp:G.scores.map((v,i)=>v-H.startScores[i]),dc:G.chips.map((v,i)=>v-H.startChips[i]),sc:G.scores.slice(),ch:G.chips.slice()});
  const bust=G.scores.some(x=>x<=0);
  const childWon=winners.some(w=>w!==G.dealer);
  let over=bust, msg="";
  if(childWon){
    G.honba=0; G.dealer=(G.dealer+1)%3;
    if(G.dealer===0){
      if(G.phase===0){ if(Math.max(...G.scores)>40000) over=true; else { G.phase=1; msg="誰も40000点を超えていないので南入"; } }
      else { G.phase++; if(!over) msg="返り東"; }
    }
  } else G.honba++;
  if(G.phase>=1 && Math.max(...G.scores)>40000) over=true;
  // オーラス（親が流れたら終わる局）で親が和了したら、親がやめるか続けるかを選ぶ（流局・流し満貫は続行）
  const dealerWon=!childWon && R.wins.some(x=>x.s===G.dealer && !x.nagashi);
  const lastHand=G.dealer===2 && (G.phase>=1 || Math.max(...G.scores)>40000);
  if(!over && dealerWon && lastHand){ R.yame={s:G.dealer,choice:null}; msg=`オーラスの親の和了：${NAMES[G.dealer]}がやめるか続けるかを選びます`; }
  G.over=over; H.state="result"; R.msg=msg;
  showResult();
}
// オーラスの親の和了やめ（stop=true で終局、false で続行）
function decideYame(stop){
  if(!R.yame || R.yame.choice!=null) return;
  R.yame.choice=!!stop;
  if(stop){ G.over=true; R.msg=`${NAMES[R.yame.s]}の和了やめで終局`; }
  else R.msg=`${NAMES[R.yame.s]}が続行（${G.honba}本場）`;
}
function endGame(){
  const s0=G.scores.slice(), c0=G.chips.slice();
  newR();
  const order=[0,1,2].sort((a,b)=>G.scores[b]-G.scores[a] || a-b);
  if(G.kyotaku){ G.scores[order[0]]+=1000*G.kyotaku; R.pts.push({from:-1,to:order[0],n:1000*G.kyotaku,why:"供託"}); G.kyotaku=0; }
  const [a,b,c]=order;
  if(G.scores[b]>40000){ payChips(c,a,15,"ウマ"); payChips(c,b,5,"ウマ"); }
  else payChips(c,a,15,"ウマ");
  for(const s of [0,1,2]) if(G.scores[s]>80000){ const n=3+Math.floor((G.scores[s]-80001)/10000); for(const o of [0,1,2]) if(o!==s) payChips(o,s,n,"8万点超え"); }
  G.hist.push({label:"終局",desc:"ウマ・ボーナス・供託",dp:G.scores.map((v,i)=>v-s0[i]),dc:G.chips.map((v,i)=>v-c0[i]),sc:G.scores.slice(),ch:G.chips.slice(),final:true});
  showFinal(order);
}


  const _startHand = startHand;
  startHand = function(){ _startHand(); };
  return {
    get G(){return G;}, get H(){return H;}, get R(){return R;},
    newGame, startHand, endGame, decideYame, canShuba, rules: RULES, starOptions, autoTsumo, setAutoWin, autoWinOf: s=>AUTO_WIN[s], discard, tryTsumo, settleTsumo, riichiOptions, kanOptions, doKan,
    nukiKita, nukiHana, promptAnswer, riichiAuto, waits, shanten, seatWind, roundLabel, isClosed, openDanger, discardable,
    destroy(){ dead=true; }
  };
}
if(typeof module!=="undefined") module.exports={createGame};

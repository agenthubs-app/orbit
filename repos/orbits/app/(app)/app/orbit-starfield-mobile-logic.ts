// @ts-nocheck -- transplanted untyped reference JS; typing it would force
// rewrites that risk drifting from the reference behavior.
// Transplanted verbatim from docs/designs/iOrbit Starfield (Mobile).html
// (x-dc Component.componentDidMount / componentWillUnmount). Do not hand-edit
// values here; regenerate from the reference. Mechanical adaptations only:
// this->self, element lookups scoped to host, avatars mapped to local assets.
export function runStarfieldMobile(host: HTMLElement): () => void {
  const self: any = { props: {} };

    const RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const $ = (id) => host.querySelector('#' + id);
    const lerp=(a,b,t)=>a+(b-a)*t, clamp=(x,a,b)=>x<a?a:x>b?b:x;
    const seg=(p,a,b)=>clamp((p-a)/(b-a),0,1);
    const smooth=(x,e0,e1)=>{const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t);};
    const smoother=(t)=>t*t*t*(t*(t*6-15)+10);
    const clampr=(x,s,d)=>{const t=clamp((x-s)/d,0,1);return t*t*(3-2*t);};
    const bez=(x1,y1,x2,y2)=>{const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;const fx=t=>((ax*t+bx)*t+cx)*t,fy=t=>((ay*t+by)*t+cy)*t,dfx=t=>(3*ax*t+2*bx)*t+cx;return x=>{let t=x;for(let i=0;i<5;i++){const e=fx(t)-x;if(Math.abs(e)<1e-4)break;t-=e/(dfx(t)||1e-4);}return fy(t);};};
    const ease=bez(0.22,1,0.36,1);
    let _s=20260630>>>0; const rnd=()=>{_s|=0;_s=(_s+0x6D2B79F5)|0;let t=Math.imul(_s^(_s>>>15),1|_s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};

    const glow=document.createElement('canvas');glow.width=glow.height=64;
    {const c=glow.getContext('2d');const g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.22,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,64,64);}
    const noise=document.createElement('canvas');noise.width=noise.height=170;
    {const c=noise.getContext('2d');const id=c.createImageData(170,170);for(let i=0;i<id.data.length;i+=4){const v=Math.random()*255|0;id.data[i]=id.data[i+1]=id.data[i+2]=v;id.data[i+3]=255;}c.putImageData(id,0,0);}

    // palette: cold white -> warm gold narrow range (only star colour band)
    const starHSL=(v)=>'hsl('+lerp(228,42,v).toFixed(0)+','+lerp(15,54,v).toFixed(0)+'%,'+lerp(89,73,v).toFixed(0)+'%)';
    const VBEAM='rgba(176,162,250,0.85)', GBEAM='rgba(224,186,120,0.9)';

    const pick=(a,i)=>a[((i%a.length)+a.length)%a.length];
    // ===== i18n =====
    const _SUR='林周陈沈顾郑叶许苏韩江宋钟唐梁谢何卢段'.split('');
    const _GIV=['见澈','知行','怀瑾','远舟','屿','则铭','南星','向晚','栖梧','听澜','与之','慎之','照临','以恒','砚清','清越'];
    const _NAMES=['Ethan Walker','Olivia Chen','Liam Brooks','Sophia Reyes','Noah Bennett','Ava Sullivan','Mason Clarke','Isabella Cruz','Lucas Hayes','Mia Donovan','Henry Foster','Amelia Park','Daniel Reed','Grace Holloway','Owen Mercer','Chloe Nakamura'];
    const DICT={
      zh:{
        name:(i)=>pick(_SUR,i*7+1)+pick(_GIV,i*3+2),
        ORG:['蓝湖资本','远帆基金','云图科技','星桥创投','跨海 SaaS','屿见科技','瀚星支付','北辰产业','合鸣资本','潮汐增长'],
        ROLE:['合伙人','增长负责人','渠道总监','投资总监','产品负责人','生态合伙人','商务负责人','技术顾问'],
        TAG:['同赛道投资人','潜在客户','供应链资源','可对接渠道','同城同行','技术顾问','早期用户','行业前辈'],
        HELP:['看早期 AI 应用，能给你估值与节奏建议','正在选型 AI 获客工具，愿做你的首批内测','手握本地渠道，帮你的产品快速落地','能把你引荐给对口的产业客户','带过同类项目，能补上你的增长盘','正在搭出海合规链路，可与你并道','能帮你把核心团队补齐','常年混迹你的目标圈层，熟人多'],
        DEAL:['领投你的天使轮','付费 PoC + 案例背书','渠道分销协议','联合解决方案','资源置换 / 互推','顾问入股','内推核心候选人','邀你进核心局'],
        relTags:['同赛道投资人','潜在客户','供应链资源','可对接渠道','同城同行','技术顾问'],
        sep:' · ', badge:'今日最值得认识', cardRsn:'iOrbit 为你匹配', couldWork:'可能合作 · ', tipPrefix:'iOrbit：',
        query:'我想创业，给我推荐一些人脉资源', placeholder:'向 Orbit 写下你的目标…',
        proc1:'iOrbit 解析你的目标  →  挖掘人脉关联  →  为你排序推荐',
        proc2:'iOrbit 读懂全场  →  计算商业匹配  →  为你排好这一桌',
        slo2:'一场活动几百张名片，对的只有几个人\n—— Orbit 帮你找到他们。',
        clusters:['金融','AI','出海'], you:'你',
        steps:[['注册一次 · 名片通用','你的商务身份成为一颗固定的星'],['报名即自动归轨','Orbit 把同频的人悄悄聚到你周围'],['到场即连接','坐下就在对的圈子，并点名该认识谁']],
        cueNext:'上滑 · 翻到下一幕', cueLast:'已是最后一幕 · 上滑回到顶部',
        brandSub:'由 iOrbit 智能匹配引擎驱动', navEvents:'活动', navSchedule:'日程', navNetwork:'人脉', account:'我的',
        kickerHtml:'Relationship&nbsp;Starfield&nbsp;&nbsp;·&nbsp;&nbsp;人脉星空',
        h1Html:'<span class="sk-word" style="display:inline-block;opacity:0;">你的人脉，</span><span class="sk-word" style="display:inline-block;opacity:0;">是一片</span><br><span class="sk-word" style="display:inline-block;opacity:0;">待你点亮的</span><span class="sk-word" style="display:inline-block;font-weight:500;color:#fff;opacity:0;">星空</span>',
        subText:'人脉本是散落天际的星星，Orbit 让它们围绕你的轨道运转、为你所用。',
        chip0:'我要创业', chip1:'看看谁能帮我', chip2:'找金融 AI 方向的人脉', chip3:'推荐 AI / 出海活动',
        corner:'某商业峰会 · 已报名 826 人 · iOrbit 已读取全场',
        forYou:'For You · 个人用户', forOrg:'For Organizers · 活动方', leftCTA:'创建我的人脉星图 · 注册', rightCTA:'我是活动主办方 · 接入 Orbit',
        leftParaHtml:'<span style="display:block;">名片夹里的人，是一片待点亮的星空。</span><span style="display:block;margin-top:3px;">iOrbit 逐颗解读，挖出背后的<b style="font-weight:500;color:#fff;">商业价值</b>。</span>',
        rightParaHtml:'<span style="display:block;">让活动从「人多」变成<b style="font-weight:500;color:#fff;">「人对」</b>。</span><span style="display:block;margin-top:3px;">iOrbit 替每位来宾算好轨道。</span>'
      },
      en:{
        name:(i)=>pick(_NAMES,i*7+1),
        ORG:['Blue Lake Capital','Farsail Ventures','Nimbus Labs','Star Bridge VC','Crosstide SaaS','Isla Tech','Vast Pay','Polaris Industries','Concord Capital','Tidewave Growth'],
        ROLE:['Partner','Head of Growth','Director of Channels','Investment Director','Head of Product','Ecosystem Partner','Head of BD','Technical Advisor'],
        TAG:['Investor in your space','Potential customer','Supply-chain resource','Channel to tap','Local peer','Technical advisor','Early adopter','Industry veteran'],
        HELP:['Backs early AI products — can advise on valuation and pacing','Choosing an AI growth tool — happy to be one of your first testers','Holds local channels to get your product live fast','Can introduce you to the right enterprise customers','Has run similar projects — can round out your growth plan','Building a cross-border compliance path — can travel it with you','Can help you complete your core team','A regular in your target circles, and knows everyone'],
        DEAL:['Lead your angel round','Paid PoC + case-study endorsement','Channel distribution deal','Joint solution','Resource swap / cross-promo','Advisor equity','Refer a key hire','An invite to the inner circle'],
        relTags:['Investor in your space','Potential customer','Supply-chain resource','Channel to tap','Local peer','Technical advisor'],
        sep:' · ', badge:"Today's top intro", cardRsn:'Matched by iOrbit', couldWork:'Could collaborate · ', tipPrefix:'iOrbit: ',
        query:"I'm starting a company — show me who can help.", placeholder:"Tell Orbit what you're after…",
        proc1:'iOrbit reads your goal  →  maps your connections  →  ranks the best matches',
        proc2:'iOrbit reads the whole room  →  scores every match  →  seats your table',
        slo2:'Hundreds of cards at one event —\nonly a few matter. Orbit finds them for you.',
        clusters:['Finance','AI','Global'], you:'You',
        steps:[['Sign up once · one card everywhere','Your identity becomes a fixed star.'],['Register — auto-enter orbit','Orbit draws your people around you.'],['Arrive and connect','Sit down in the right circle.']],
        cueNext:'Swipe up · next scene', cueLast:'Swipe up to restart',
        brandSub:'Powered by iOrbit', navEvents:'Events', navSchedule:'Schedule', navNetwork:'Network', account:'Account',
        kickerHtml:'Relationship&nbsp;Starfield',
        h1Html:'<span class="sk-word" style="display:inline-block;opacity:0;">Your&nbsp;network&nbsp;is&nbsp;</span><span class="sk-word" style="display:inline-block;opacity:0;">a&nbsp;starfield</span><br><span class="sk-word" style="display:inline-block;opacity:0;">waiting&nbsp;for&nbsp;</span><span class="sk-word" style="display:inline-block;font-weight:500;color:#fff;opacity:0;">your&nbsp;light</span>',
        subText:'Your contacts are stars scattered across the sky — Orbit pulls them into orbit around you, ready when you need them.',
        chip0:'Raising a seed round', chip1:'Fintech & AI contacts', chip2:'Partners to go global', chip3:'AI / expansion events',
        corner:'A business summit · 826 registered · iOrbit has read the room',
        forYou:'For You · Individuals', forOrg:'For Organizers · Event hosts', leftCTA:'Create my network map · Sign up', rightCTA:'I host events · Get Orbit',
        leftParaHtml:'<span style="display:block;">The people in your card holder are a starfield.</span><span style="display:block;margin-top:3px;">Orbit surfaces the <b style="font-weight:500;color:#fff;">business value</b> in each.</span>',
        rightParaHtml:'<span style="display:block;">Turn an event into <b style="font-weight:500;color:#fff;">the right crowd</b>.</span><span style="display:block;margin-top:3px;">Orbit charts an orbit for every guest.</span>'
      }
    };
    let LANG=(()=>{try{const s=localStorage.getItem('iorbit_lang');if(s==='en'||s==='zh')return s;}catch(e){}return (host.getAttribute('data-lang')==='en')?'en':'zh';})();
    const T=()=>DICT[LANG];
    const AVA=['1573496359142-b8d87734a5a2','1494790108377-be9c29b29330','1507003211169-0a1dd7228f2d','1438761681033-6461ffad8d80','1599566150163-29194dcaad36','1544005313-94ddf0286df2','1580489944761-15a19d654956','1573497019940-1c28c88b4f3e','1560250097-0b93528c311a','1551836022-deb4988cc6c0','1568602471122-7832951cc4c5','1521119989659-a83eee488004','1531123897727-8f129e1688ce','1488161628813-04466f872be2','1500648767791-00dcc994a43e','1607990281513-2c110a25bd8c'];
    const avaURL=(i)=>{const idx=((i%AVA.length)+AVA.length)%AVA.length;return '/iorbit-starfield/avatars/mobile/ava' + idx + '.png';};
    const card=(i)=>{const D=DICT[LANG];return {_i:i,name:D.name(i),company:pick(D.ORG,i*5),role:pick(D.ROLE,i*2+1),tag:pick(D.TAG,i),help:pick(D.HELP,i*3+1),deal:pick(D.DEAL,i*2),av:avaURL(i*5+3)};};

    const AVAFALL="this.removeAttribute('src');this.style.background='radial-gradient(circle at 34% 30%,#cfc6ff,#8b7bf0 72%)';" // inline onerror: `this` is the <img> element;
    const cardHTML=(d,gold,w)=>{
      const ac=gold?'#d8b06a':'#8b7bf0', rc=gold?'#e7cd9a':'#a99fe8';
      return ''+
      '<div class="sk-cardx'+(gold?' gold':'')+'" style="position:relative;width:'+w+'px;border-radius:16px;padding:16px 17px;background:linear-gradient(158deg,rgba(24,22,45,0.99),rgba(14,13,27,1));border:1px solid '+(gold?'rgba(216,176,106,0.4)':'rgba(150,145,200,0.16)')+';box-shadow:0 22px 60px -28px rgba(0,0,0,0.9),0 0 50px -24px '+(gold?'rgba(216,176,106,0.5)':'rgba(123,108,232,0.4)')+';display:flex;flex-direction:column;gap:11px;">'+
        '<div style="position:absolute;inset:0;border-radius:16px;padding:1px;background:conic-gradient(from var(--skAng,0deg),transparent 0deg,'+(gold?GBEAM:VBEAM)+' 60deg,transparent 130deg,transparent 360deg);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:skFlow '+(gold?5:6.5)+'s linear infinite;pointer-events:none;"></div>'+
        (gold?'<div style="position:absolute;top:-11px;left:14px;z-index:3;display:flex;align-items:center;gap:5px;padding:4px 11px;border-radius:999px;background:linear-gradient(180deg,#f0cf94,#d8b06a);box-shadow:0 5px 16px -4px rgba(216,176,106,0.85);"><span style="font-size:9px;color:#3a2c11;">★</span><span style="font-family:\'JetBrains Mono\',monospace;font-size:9px;font-weight:600;letter-spacing:.04em;color:#3a2c11;">'+T().badge+'</span></div>':'')+
        '<div style="position:relative;display:flex;align-items:center;gap:11px;"><img src="'+d.av+'" alt="" onerror="'+AVAFALL+'" style="width:42px;height:42px;border-radius:50%;flex:0 0 auto;object-fit:cover;border:1px solid '+(gold?'rgba(216,176,106,0.5)':'rgba(150,145,200,0.3)')+';background:#1a1830;"/><div style="min-width:0;flex:1;"><div style="font-size:16.5px;font-weight:600;color:#F5F6FF;line-height:1.2;">'+d.name+'</div><div style="font-size:12.5px;color:rgba(186,190,214,0.7);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+d.company+T().sep+d.role+'</div></div></div>'+
        '<div style="position:relative;font-size:14.5px;font-weight:500;line-height:1.5;color:#F3F5FF;">'+d.help+'</div>'+
        '<div style="position:relative;display:flex;align-items:center;gap:6px;"><span style="width:5px;height:5px;border-radius:50%;background:'+ac+';box-shadow:0 0 6px '+ac+';"></span><span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;letter-spacing:.04em;color:'+rc+';">'+T().cardRsn+'</span></div>'+
        '<div class="sk-more" style="position:relative;font-size:12px;line-height:1.5;color:rgba(170,176,204,0.8);border-top:1px solid rgba(150,145,200,0.12);padding-top:9px;">'+T().couldWork+d.deal+'</div>'+
      '</div>';
    };

    const scene=$('skScene'), canvas=$('skCanvas'), ctx=canvas.getContext('2d'), fog=$('skFog'), dots=$('skDots');
    const showGrain=self.props.showGrain??true;
    // Static CSS grain layer — same look as the old per-frame canvas grain, but lifted off the rAF loop (GPU-composited drift).
    if(showGrain){try{
      const gst=document.createElement('style');gst.textContent='@keyframes skGrainDrift{from{background-position:0 0}to{background-position:170px 170px}}@media (prefers-reduced-motion: reduce){#skGrain{animation:none!important}}';document.head.appendChild(gst);self._gst=gst;
      const grain=document.createElement('div');grain.id='skGrain';
      grain.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:3;opacity:0.04;mix-blend-mode:overlay;background-image:url('+noise.toDataURL()+');background-repeat:repeat;animation:skGrainDrift 30s linear infinite;';
      scene.appendChild(grain);self._grain=grain;
    }catch(e){}}
    const hero=$('skHero'), kicker=$('skKicker'), sub=$('skSub');
    let words=[].slice.call(host.querySelectorAll('.sk-word'));
    const fieldWrap=$('skFieldWrap'), chips=$('skChips'), typed=$('skTyped'), caret=$('skCaret'), ph=$('skPh');
    const demoWrap=$('skDemo'), tip=$('skTip'), cardEl=$('skCard'), cardBeam=$('skCardBeam');
    const corner=$('skCorner'), pain=$('skPain'), painTxt=$('skPainTxt'), painCaret=$('skPainCaret'), org=$('skOrg'), cue=$('skCue');
    const orbitWrap=$('skOrbitCards'), stepsWrap=$('skSteps'), proc=$('skProc'), procTxt=$('skProcTxt');
    let QUERY=T().query, SLO2=T().slo2, PROC1=T().proc1, PROC2=T().proc2;

    // demo cards (toC) — one hero per card, gold = top pick
    const DEMO_SEEDS=[2,11,20];
    const demoData=()=>{const a=DEMO_SEEDS.map(card);a[0]._gold=true;return a;};
    let DEMOW=Math.min(322,((scene.getBoundingClientRect().width)||390)-56);
    demoWrap.innerHTML=''; const demoEls=demoData().map((d)=>{const e=document.createElement('div');e.style.cssText='position:absolute;left:50%;top:0;width:'+DEMOW+'px;opacity:0;transform:translate(-50%,0) scale(1);transform-origin:center center;transition:transform .5s cubic-bezier(.22,1,.36,1);will-change:transform,opacity;pointer-events:auto;';e.innerHTML=cardHTML(d,!!d._gold,DEMOW);e._op=0;e._roleOp=1;demoWrap.appendChild(e);return e;});
    demoWrap.style.width=DEMOW+'px';
    const rebuildDemo=()=>{const a=demoData();demoEls.forEach((el,i)=>{el.innerHTML=cardHTML(a[i],!!a[i]._gold,DEMOW);});};
    // ===== recommendation carousel (3 cards · center + peeking sides) =====
    const demoDots=$('skDemoDots');
    demoDots.innerHTML=''; const demoDotEls=[0,1,2].map((i)=>{const d=document.createElement('button');d.style.cssText='width:7px;height:7px;border-radius:50%;border:0;background:rgba(180,176,220,0.32);cursor:pointer;padding:0;transition:all .3s;';d.addEventListener('click',()=>{self._demoI=i;updateCarousel();resetDemoTimer();});demoDots.appendChild(d);return d;});
    self._demoI=0;
    const updateCarousel=()=>{const act=self._demoI;demoEls.forEach((el,j)=>{let off,s,z,f,ro;if(j===act){off=0;s=1;z=4;f='none';ro=1;}else if(j===((act+1)%3)){off=DEMOW*0.86;s=0.82;z=2;f='blur(2.4px) brightness(0.46)';ro=0.5;}else{off=-DEMOW*0.86;s=0.82;z=2;f='blur(2.4px) brightness(0.46)';ro=0.5;}el.style.transform='translate(calc(-50% + '+off.toFixed(0)+'px),0) scale('+s+')';el.style.zIndex=String(z);el.style.filter=f;el._roleOp=ro;});demoDotEls.forEach((d,i)=>{const on=i===act;d.style.background=on?'#cfc9ef':'rgba(180,176,220,0.32)';d.style.width=on?'18px':'7px';d.style.borderRadius=on?'4px':'50%';});};
    const advanceDemo=(dir)=>{self._demoI=((self._demoI+dir)%3+3)%3;self._canvasKick=-dir*42;updateCarousel();};
    const resetDemoTimer=()=>{if(self._demoIv)clearInterval(self._demoIv);self._demoIv=setInterval(()=>{if(stopIdx===1&&!animating)advanceDemo(1);},3600);};

    // step stars (woven into the map)
    const stepHTML=(d,i)=>'<div style="display:flex;align-items:center;gap:12px;width:100%;padding:10px 14px;border-radius:13px;background:rgba(18,16,34,0.4);border:1px solid rgba(150,145,200,0.1);"><span style="flex:0 0 auto;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 35% 30%,#fff,#8b7bf0 70%);box-shadow:0 0 12px -3px #8b7bf0;font-family:\'Newsreader\',serif;font-style:italic;font-size:12px;color:#241c3a;font-weight:600;">0'+(i+1)+'</span><div style="text-align:left;min-width:0;"><div style="font-size:15px;font-weight:500;color:#F5F6FF;line-height:1.25;">'+d[0]+'</div><div style="font-size:12.5px;line-height:1.5;color:rgba(176,180,206,0.68);margin-top:2px;">'+d[1]+'</div></div></div>';
    stepsWrap.innerHTML=''; const stepEls=T().steps.map((d,i)=>{const e=document.createElement('div');e.style.cssText='position:absolute;left:0;top:0;width:210px;opacity:0;will-change:transform,opacity;text-align:center;';e.innerHTML=stepHTML(d,i);stepsWrap.appendChild(e);return e;});
    const rebuildSteps=()=>{T().steps.forEach((d,i)=>{if(stepEls[i])stepEls[i].innerHTML=stepHTML(d,i);});};

    // ===== WORLD A (toC starfield) =====
    let A={far:[],mid:[],near:[],bright:[],links:[]};
    const buildA=()=>{
      A={far:[],mid:[],near:[],bright:[],links:[]};
      const mk=(sx,sy,vlo,vhi,sz)=>{const aa=rnd()*6.283,rr=Math.pow(rnd(),0.62),vv=vlo+Math.pow(rnd(),2.2)*(vhi-vlo);return{nx:Math.cos(aa)*rr*sx,ny:Math.sin(aa)*rr*sy,v:vv,col:starHSL(vv),sz,depth:0.3+rnd()*0.7,twf:6e-4+rnd()*13e-4,twp:rnd()*6.28,fr:1e-4+rnd()*3e-4,ph:rnd()*6.28,px:0,py:0};};
      for(let i=0;i<640;i++)A.far.push(mk(1.05,0.92,0,0.12,0.7));
      for(let i=0;i<240;i++)A.mid.push(mk(1.0,0.86,0,0.3,1.3));
      for(let i=0;i<110;i++)A.near.push(mk(0.95,0.8,0.05,0.5,2.0));
      for(let i=0;i<32;i++){const aa=(i/32)*6.283+rnd()*0.32,rr=0.26+rnd()*0.58;const b=mk(0,0,0.6,1,3.0);b.nx=Math.cos(aa)*rr*0.98;b.ny=Math.sin(aa)*rr*0.76;b.v=0.5+rnd()*0.5;b.col=starHSL(b.v);b.data=card(i*4+5);b.bridge=(i%7===0);b.cl=i%3;b.jnx=(rnd()*2-1)*(0.6+rnd()*0.85);b.jny=(rnd()*2-1)*(0.6+rnd()*0.85);A.bright.push(b);}
      A.links=[];const seen={};const pool=A.near.concat(A.bright);
      for(let a=0;a<pool.length;a++){let bi=-1,bd=1e9;for(let b=0;b<pool.length;b++){if(a===b)continue;const dx=pool[a].nx-pool[b].nx,dy=pool[a].ny-pool[b].ny,d=dx*dx+dy*dy;if(d<bd){bd=d;bi=b;}}if(bi>=0&&bd<0.02){const k=a<bi?a+'_'+bi:bi+'_'+a;if(!seen[k]){seen[k]=1;A.links.push([pool[a],pool[bi]]);}}}
    };

    // ===== WORLD C (toB nebula) =====
    let C={blobs:[],stars:[],rel:[],intake:[],you:null};
    const buildC=()=>{
      C={blobs:[],stars:[],rel:[],intake:[],you:null};
      for(let i=0;i<7;i++)C.blobs.push({ang:rnd()*6.283,rad:0.12+rnd()*0.34,r:0.32+rnd()*0.34,sp:(rnd()-0.5)*4e-5,ph:rnd()*6.28,dph:1e-4+rnd()*2e-4});
      for(let i=0;i<560;i++){const aa=rnd()*6.283,rr=Math.pow(rnd(),0.5)*0.98,vv=Math.pow(rnd(),2.0)*0.46;C.stars.push({nx:Math.cos(aa)*rr,ny:Math.sin(aa)*rr*0.72,v:vv,col:starHSL(vv),depth:0.3+rnd()*0.7,twf:6e-4+rnd()*13e-4,twp:rnd()*6.28,px:0,py:0,data:card(i*3+7)});}
      const tg=T().relTags;
      for(let i=0;i<6;i++){const d=card(i*9+3);d.tag=tg[i];if(i===0)d._gold=true;C.rel.push({v:0.6+rnd()*0.4,gold:(i===0),data:d,col:(i===0?'hsl(42,56%,76%)':starHSL(0.5)),hnx:0,hny:0,px:0,py:0,dep:0.5,phi:rnd()*6.28,phi2:rnd()*6.28});}
      for(let i=0;i<14;i++){const s=C.stars[(i*37+5)%C.stars.length];C.intake.push({s,off:rnd(),sp:0.55+rnd()*0.5});}
      C.you={px:0,py:0};
    };

    // ===== FOG transition =====
    let fogBlobs=[];
    const buildFog=()=>{fogBlobs=[];for(let i=0;i<18;i++){const ang=rnd()*6.2832;fogBlobs.push({ang,base:0.55+rnd()*0.85,sz:0.65+rnd()*0.85,dx:(rnd()-0.5)*0.5,dy:(rnd()-0.5)*0.5,drift:(rnd()-0.5)*5e-4,swf:2e-4+rnd()*4e-4,ph:rnd()*6.2832,hue:rnd()});}};
    const renderFog=(p,t)=>{
      const a=smooth(p,0.235,0.335), b=smooth(p,0.335,0.435);
      if(a<0.002) return;
      const env=a*(1-b*0.96);
      ctx.save();
      for(let i=0;i<fogBlobs.length;i++){const fb=fogBlobs[i];
        const rf=lerp(1.4,0.4,a)+b*1.35;
        const cxx=cx+Math.cos(fb.ang+t*fb.drift)*fb.base*minDim*rf*0.6+fb.dx*minDim*0.08;
        const cyy=cyc+Math.sin(fb.ang+t*fb.drift)*fb.base*minDim*rf*0.52+fb.dy*minDim*0.08+Math.sin(t*fb.swf+fb.ph)*minDim*0.03;
        const r=minDim*(0.32+0.30*a+0.30*b)*fb.sz;
        const al=env*(0.20+0.10*Math.sin(t*fb.swf*1.7+fb.ph));
        if(al<0.004) continue;
        const lum=fb.hue;
        const g=ctx.createRadialGradient(cxx,cyy,0,cxx,cyy,r);
        g.addColorStop(0,'rgba('+(54+lum*54|0)+','+(46+lum*40|0)+','+(98+lum*70|0)+','+al+')');
        g.addColorStop(0.5,'rgba(40,34,68,'+(al*0.66)+')');
        g.addColorStop(1,'rgba(20,17,42,0)');
        ctx.fillStyle=g;ctx.fillRect(cxx-r,cyy-r,r*2,r*2);
      }
      ctx.globalCompositeOperation='lighter';
      const bloom=Math.pow(env,0.8)*0.5;
      if(bloom>0.004){const bg=ctx.createRadialGradient(cx,cyc-minDim*0.04,0,cx,cyc,minDim*0.7);bg.addColorStop(0,'rgba(150,138,224,'+bloom+')');bg.addColorStop(1,'rgba(150,138,224,0)');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);}
      ctx.globalCompositeOperation='source-over';
      const wash=Math.pow(env,0.5)*0.99;
      if(wash>0.003){const wg=ctx.createRadialGradient(cx,cyc-minDim*0.05,0,cx,cyc,minDim*1.15);wg.addColorStop(0,'rgba(48,42,86,'+wash+')');wg.addColorStop(0.6,'rgba(30,26,58,'+(wash*0.96)+')');wg.addColorStop(1,'rgba(15,12,34,'+(wash*0.82)+')');ctx.fillStyle=wg;ctx.fillRect(0,0,W,H);}
      ctx.restore();
    };

    // orbit cards
    let relCards=[];
    const buildRelCards=()=>{orbitWrap.innerHTML='';relCards=[];};

    // layout
    let W,H,dpr,cx,cyc,minDim,spread,Rneb,cardY,clusterY,RX,RY,orx,ory;
    const resize=()=>{
      const r=scene.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
      cx=W/2;cyc=H*0.38;minDim=Math.min(W,H);spread=minDim*0.95;Rneb=minDim*0.27;RX=Rneb*1.52;RY=Rneb*0.82;orx=RX*0.80;ory=RY*0.86;
      DEMOW=Math.min(322,W-56);
      cardY=clamp(H*0.54-70,H*0.34,H*0.60);
      clusterY=cardY-Math.min(H*0.13,110);
      demoWrap.style.top=cardY+'px';demoWrap.style.width=DEMOW+'px';
      demoEls.forEach(el=>{el.style.width=DEMOW+'px';});rebuildDemo();updateCarousel();
      {const dh=(demoEls[0]&&demoEls[0].offsetHeight)||190;demoDots.style.top=(cardY+dh+16).toFixed(0)+'px';}
      // cache full-screen gradients (constant per layout) — avoids rebuilding them every frame
      self._wb=ctx.createRadialGradient(W*0.5,H*0.32,0,W*0.5,H*0.32,minDim*1.05);self._wb.addColorStop(0,'rgba(90,80,200,0.08)');self._wb.addColorStop(1,'rgba(90,80,200,0)');
      self._vg=ctx.createRadialGradient(cx,cyc,minDim*0.32,cx,cyc,minDim*0.95);self._vg.addColorStop(0,'rgba(5,4,11,0)');self._vg.addColorStop(1,'rgba(4,3,9,0.62)');
    };

    const drawDot=(x,y,r,col,a,grK)=>{if(a<0.012)return;const gr=r*(grK||4);ctx.globalAlpha=Math.min(1,a*0.42);ctx.drawImage(glow,x-gr,y-gr,gr*2,gr*2);ctx.globalAlpha=Math.min(1,a);ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,r,0,6.2832);ctx.fill();ctx.globalAlpha=1;};
    const nebBlob=(x,y,r,a)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(118,104,232,'+a+')');g.addColorStop(0.5,'rgba(96,84,200,'+(a*0.5)+')');g.addColorStop(1,'rgba(96,84,200,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);};
    const nebBlobAdd=(x,y,r,a)=>{ctx.save();ctx.globalCompositeOperation='lighter';nebBlob(x,y,r,a);ctx.restore();};

    // interaction state
    let mx=-1,my=-1, hoverStar=null, pinned=null, curP=0;
    let featured=null, carIdx=0, carT=0, carPhase=0;
    const fillCard=(d,gold)=>{const av=$('skCardAva');if(av.dataset.src!==d.av){av.dataset.src=d.av;av.src=d.av;}$('skCardName').textContent=d.name;$('skCardRole').textContent=d.company+T().sep+d.role;$('skCardHelp').textContent=d.help;$('skCardMore').textContent=T().couldWork+d.deal;$('skCardBadge').style.display=gold?'flex':'none';$('skCardInner').style.border='1px solid '+(gold?'rgba(216,176,106,0.3)':'rgba(150,145,200,0.14)');av.style.border='1px solid '+(gold?'rgba(216,176,106,0.5)':'rgba(150,145,200,0.3)');$('skCardRsnDot').style.background=gold?'#d8b06a':'#8b7bf0';$('skCardRsnDot').style.boxShadow='0 0 6px '+(gold?'#d8b06a':'#8b7bf0');$('skCardRsn').style.color=gold?'#e7cd9a':'#a99fe8';$('skCardInner').style.boxShadow='0 28px 72px -28px rgba(0,0,0,0.85),0 0 56px -22px '+(gold?'rgba(216,176,106,0.5)':'rgba(139,123,240,0.5)');cardBeam.style.background='conic-gradient(from var(--skAng,0deg),transparent 0deg,'+(gold?GBEAM:VBEAM)+' 60deg,transparent 130deg,transparent 360deg)';};
    const showCard=(x,y,d,gold)=>{fillCard(d,gold);
      const compact=curP<0.30, inner=$('skCardInner'), more=$('skCardMore'), help=$('skCardHelp');
      if(compact){inner.style.padding='12px 15px';inner.style.gap='7px';more.style.display='none';help.style.whiteSpace='nowrap';help.style.overflow='hidden';help.style.textOverflow='ellipsis';help.style.fontSize='13.5px';}
      else{inner.style.padding='17px 18px';inner.style.gap='11px';more.style.display='';help.style.whiteSpace='normal';help.style.overflow='visible';help.style.textOverflow='clip';help.style.fontSize='14.5px';}
      const cw=300,chh=cardEl.offsetHeight||(compact?114:200);
      if(compact){
        // dock below the slogan, above the field; never cover the title or input — suppress if no room
        const h1b=$('skH1').getBoundingClientRect().bottom,sb=$('skSub').getBoundingClientRect().bottom,ft=fieldWrap.getBoundingClientRect().top;
        const titleBot=(isFinite(h1b)&&h1b>0)?h1b:H*0.40, subBot=(isFinite(sb)&&sb>0)?sb:H*0.46, fieldTop=(isFinite(ft)&&ft>0)?ft:H*0.70;
        const hi=fieldTop-12-chh; let lo=subBot+10;
        if(hi<lo)lo=titleBot+10;            // tight screen: allow overlapping only the secondary sub-line
        if(hi<lo){hideCard();return;}        // no room at all: suppress (never cover title or field)
        cardEl.style.transformOrigin='center top';cardEl.style.left=clamp(x-cw/2,12,W-cw-12).toFixed(0)+'px';cardEl.style.top=clamp(y-chh/2,lo,hi).toFixed(0)+'px';
      } else {
        let lx=x+24;if(lx+cw+12>W){lx=x-cw-24;cardEl.style.transformOrigin='right center';}else cardEl.style.transformOrigin='left center';lx=clamp(lx,10,W-cw-10);
        cardEl.style.left=lx+'px';cardEl.style.top=clamp(y-66,80,Math.max(90,H-30-chh)).toFixed(0)+'px';
      }
      cardEl.style.opacity='1';cardEl.style.transform='translateY(0) scale(1)';};
    const hideCard=()=>{cardEl.style.opacity='0';cardEl.style.transform='translateY(8px) scale(.97)';};
    const showTip=(x,y,d)=>{$('skTipName').textContent=d.name;$('skTipVal').textContent=T().tipPrefix+d.tag;let lx=x+16,ty=y-34;if(lx+220>W)lx=x-220;tip.style.left=lx+'px';tip.style.top=clamp(ty,70,H-40)+'px';tip.style.opacity='1';tip.style.transform='translateY(0)';};
    const hideTip=()=>{tip.style.opacity='0';tip.style.transform='translateY(4px)';};

    // ===== RENDER A =====
    const renderA=(p,t)=>{
      const conv=ease(seg(p,0.02,0.15)); const cat=smooth(p,0.10,0.17)*(1-smooth(p,0.24,0.30)); const dim=smooth(p,0.03,0.16);
      ctx.fillStyle='hsl(228,15%,87%)';
      for(let i=0;i<A.far.length;i++){const s=A.far[i];const x=cx+s.nx*spread,y=cyc+s.ny*spread;s.px=x;s.py=y;const a=(0.16+0.5*s.v)*(0.45+0.55*Math.sin(t*s.twf+s.twp));if(a<0.04)continue;ctx.globalAlpha=Math.min(0.85,a);ctx.fillRect(x,y,s.sz,s.sz);}
      ctx.globalAlpha=1;
      for(let i=0;i<A.links.length;i++){const a=A.links[i][0],b=A.links[i][1];const al=(1-dim)*0.5*Math.min(1,a.v+b.v+0.3);if(al<0.03)continue;ctx.strokeStyle='rgba(150,150,210,'+(0.06*al)+')';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.px,a.py);ctx.lineTo(b.px,b.py);ctx.stroke();}
      const drawAmb=(arr,gk)=>{for(let i=0;i<arr.length;i++){const s=arr[i];const x=cx+s.nx*spread+Math.sin(t*s.fr+s.ph)*minDim*0.008,y=cyc+s.ny*spread+Math.cos(t*s.fr*0.9+s.ph)*minDim*0.008;s.px=x;s.py=y;const tw=0.6+0.4*Math.sin(t*s.twf+s.twp);drawDot(x,y,s.sz*(0.7+0.3*s.depth),s.col,(0.25+0.65*s.v)*tw*(1-dim*0.7),gk);}};
      drawAmb(A.mid,3.2); drawAmb(A.near,3.6);
      const clGap=Math.min(W*0.2,230);
      for(let i=0;i<A.bright.length;i++){const s=A.bright[i];
        let hx=cx+s.nx*spread+Math.sin(t*s.fr+s.ph)*minDim*0.008,hy=cyc+s.ny*spread+Math.cos(t*s.fr*0.9+s.ph)*minDim*0.008;
        const ccx=cx+(s.cl-1)*clGap,ccy=clusterY;const sx=ccx+s.jnx*minDim*0.085,sy=ccy+s.jny*minDim*0.05;
        let tx=lerp(hx,sx,conv),ty=lerp(hy,sy,conv);s.px=tx;s.py=ty;
        if(conv>0.04&&conv<0.97){ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(180,176,235,0.3)';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(lerp(hx,tx,0.86),lerp(hy,ty,0.86));ctx.lineTo(tx,ty);ctx.stroke();ctx.restore();}
        const tw=0.7+0.3*Math.sin(t*s.twf+s.twp); const hot=(hoverStar===s||featured===s);
        if((s.bridge||hot)&&conv<0.06){nebBlobAdd(tx,ty,minDim*0.05*(hot?1.3:1),0.05*(1-dim)*(hot?1.5:1));}
        drawDot(tx,ty,(s.sz+(hot?1.6:0))*(0.9+0.4*s.depth),s.col,(0.7+0.3*s.v)*tw,4.2+s.v*2.5);
      }
      if(cat>0.02){ctx.globalAlpha=cat;ctx.font='500 12px "JetBrains Mono",monospace';ctx.textAlign='center';const nm=T().clusters;for(let c=0;c<3;c++){ctx.fillStyle='rgba(205,201,230,0.92)';ctx.fillText(nm[c],cx+(c-1)*clGap,clusterY-minDim*0.105);}ctx.globalAlpha=1;ctx.textAlign='left';}
    };

    // ===== RENDER C =====
    const renderC=(p,t)=>{
      const reveal=smooth(p,0.30,0.42);
      const crowd=reveal*(1-smooth(p,0.58,0.66)*0.84);
      const focus=smooth(p,0.54,0.70);
      const youLight=smooth(p,0.50,0.58);
      const engBase=smooth(p,0.51,0.58)*(1-smooth(p,0.82,0.90)*0.45);
      const engBoost=smooth(p,0.55,0.61)*(1-smooth(p,0.66,0.73));
      const sweep=seg(p,0.56,0.64);
      const arc=ease(seg(p,0.60,0.72));
      const connA=smooth(p,0.66,0.74)*(1-smooth(p,0.88,0.94));
      const intakeA=smooth(p,0.54,0.60)*(1-smooth(p,0.68,0.74));

      ctx.save();ctx.globalCompositeOperation='lighter';
      for(let i=0;i<C.blobs.length;i++){const b=C.blobs[i];const cv=lerp(1,0.6,focus);const ang=b.ang+t*b.sp,rad=b.rad*cv*minDim*1.0+Math.sin(t*b.dph+b.ph)*minDim*0.02;const x=cx+Math.cos(ang)*rad,y=cyc+Math.sin(ang)*rad*0.8;nebBlob(x,y,b.r*minDim*(0.55+0.15*Math.sin(t*b.dph+b.ph)),0.05*reveal*(0.7+0.5*focus));}
      ctx.restore();

      for(let i=0;i<C.stars.length;i++){const s=C.stars[i];const x=cx+s.nx*minDim*0.66+Math.sin(t*5e-4+s.twp)*minDim*0.01;const y=cyc+s.ny*minDim*0.66+Math.cos(t*5e-4+s.twp)*minDim*0.01;s.px=x;s.py=y;const tw=0.6+0.4*Math.sin(t*s.twf+s.twp);const a=(0.18+0.5*s.v)*tw*crowd;if(a<0.012)continue;const isHover=(hoverStar===s);if(s.v>0.34||isHover){drawDot(x,y,(lerp(1.0,2.3,s.v)+(isHover?1.2:0))*(0.6+0.4*s.depth),s.col,a*(isHover?1.6:1),3.2);}else{ctx.globalAlpha=Math.min(0.8,a);ctx.fillStyle=s.col;ctx.fillRect(x,y,1.1,1.1);ctx.globalAlpha=1;}}

      if(intakeA>0.02){ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<C.intake.length;i++){const it=C.intake[i];const fr=((t*0.00045*it.sp+it.off)%1+1)%1;const x=lerp(it.s.px,cx,fr),y=lerp(it.s.py,cyc,fr);const a=intakeA*Math.sin(fr*3.1416)*0.85;if(a<0.02)continue;drawDot(x,y,1.7,'#b9aef0',a,4.2);}ctx.restore();}

      if(sweep>0.001&&sweep<1){const rad=ease(sweep)*minDim*0.95,al=(1-sweep)*0.42;ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(139,123,240,'+al+')';ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(cx,cyc,rad,0,6.283);ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='rgba(139,123,240,'+(al*0.5)+')';ctx.beginPath();ctx.arc(cx,cyc,rad*0.82,0,6.283);ctx.stroke();ctx.restore();}

      if(engBase>0.02){ctx.save();ctx.globalCompositeOperation='lighter';const rx=orx,ry=ory;
        ctx.lineWidth=1;ctx.strokeStyle='rgba(139,123,240,'+(engBase*0.16)+')';ctx.beginPath();ctx.ellipse(cx,cyc,rx,ry,0,0,6.2832);ctx.stroke();
        ctx.strokeStyle='rgba(139,123,240,'+(engBase*0.1)+')';ctx.beginPath();ctx.ellipse(cx,cyc,rx*1.32,ry*1.32,0,0,6.2832);ctx.stroke();
        const spin=t*(0.00018+engBoost*0.0014);ctx.lineWidth=2.0;
        for(let k=0;k<2;k++){const a0=spin+k*3.14159;ctx.strokeStyle='rgba(166,150,250,'+(engBase*(0.32+engBoost*0.45))+')';ctx.beginPath();ctx.ellipse(cx,cyc,rx,ry,0,a0,a0+0.8);ctx.stroke();}
        ctx.restore();}

      const orbT=t*3.0e-5;
      for(let i=0;i<6;i++){const s=C.rel[i];
        const baseAng=(i/6)*6.2832-1.5708+orbT;
        const onx=cx+Math.cos(baseAng)*orx,ony=cyc+Math.sin(baseAng)*ory;
        const home=[cx+s.hnx*minDim*0.55,cyc+s.hny*minDim*0.55];
        const px=lerp(home[0],onx,arc),py=lerp(home[1],ony,arc);s.px=px;s.py=py;s.ang=baseAng;const dep=(Math.sin(baseAng)+1)/2;s.dep=dep;
        if(connA>0.02){ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=(s.gold?'rgba(216,176,106,':'rgba(143,128,244,')+(connA*0.32*(0.5+0.5*dep))+')';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx,cyc);const m2x=(cx+px)/2+Math.cos(baseAng+1.57)*22,m2y=(cyc+py)/2+Math.sin(baseAng+1.57)*22;ctx.quadraticCurveTo(m2x,m2y,px,py);ctx.stroke();ctx.restore();}
        const isHover=(hoverStar===s),cur=(self._curRel===i);
        if(cur&&arc>0.35){ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=(s.gold?'rgba(216,176,106,0.8)':'rgba(170,154,250,0.8)');ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(px,py,12,0,6.283);ctx.stroke();ctx.restore();}
        drawDot(px,py,(3.2+(isHover||cur?1.8:0))*(0.72+0.45*dep),s.col,reveal*lerp(0.5,1,arc)*(0.6+0.4*dep),5.4);}

      // short connectors from each star to its expanded card
      for(let j=0;j<C.rel.length;j++){const s=C.rel[j];if(!s._cv||s._cv<0.06)continue;ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=(s.gold?'rgba(216,176,106,':'rgba(170,156,240,')+(s._cv*0.5).toFixed(3)+')';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(s.px,s.py);ctx.lineTo(s._lx,s._ly);ctx.stroke();ctx.restore();}

      const yB=reveal*Math.max(youLight,focus*0.55);
      if(yB>0.02){const r=5.6*(1+0.08*Math.sin(t*0.003));ctx.save();ctx.globalCompositeOperation='lighter';drawDot(cx,cyc,r,'#cfc6ff',yB,7.5);ctx.restore();drawDot(cx,cyc,r,'#efeaff',yB,3.0);ctx.globalAlpha=Math.min(1,yB*0.95);ctx.font=(LANG==='en'?'600 13px "Newsreader",Georgia,serif':'600 13px "Noto Serif SC",serif');ctx.textAlign='center';ctx.fillStyle='#d6d0ff';ctx.fillText(T().you,cx,cyc+r+18);ctx.textAlign='left';ctx.globalAlpha=1;}
      C.you.px=cx;C.you.py=cyc;
    };

    // ===== OVERLAYS =====
    const setOp=(el,v)=>{el.style.opacity=Math.max(0,Math.min(1,v)).toFixed(3);};
    const updateOverlays=(p,t,elapsed,dt,idle)=>{
      const ch1=1-smooth(p,0.16,0.22);
      const rev=(d,du)=>{const e=clamp((elapsed-d)/du,0,1);return e*e*(3-2*e);};
      const bw=(el,r)=>{el.style.opacity=(r*ch1).toFixed(3);el.style.filter='blur('+((1-r)*12).toFixed(2)+'px)';el.style.transform='translateY('+((1-r)*8).toFixed(1)+'px)';};
      bw(kicker,rev(0.15,0.8)); words.forEach((w,i)=>bw(w,rev(0.35+i*0.15,0.8))); bw(sub,rev(1.0,0.9));
      hero.style.transform='translateX(-50%)';
      const frv=rev(1.2,0.9); setOp(fieldWrap,frv*ch1); fieldWrap.style.transform='translateX(-50%) translateY('+((1-frv)*10).toFixed(1)+'px)';
      // scroll cue: visible only when settled (fades during play); last stop = return to top
      {const last=stopIdx===STOPS.length-1;cue.style.opacity=animating?'0':'1';if(cue._l!==last||cue._lang!==LANG){cue._l=last;cue._lang=LANG;$('skCueTxt').textContent=last?T().cueLast:T().cueNext;$('skCueArrow').textContent=last?'↑':'↓';}}
      canvas.style.opacity=(1-smooth(p,0.93,0.99)).toFixed(3);
      {const qS=1.55,qD=1.7;const qN=Math.round(clamp((elapsed-qS)/qD,0,1)*QUERY.length);
       if(p<0.16){typed.textContent=QUERY.slice(0,qN);ph.style.display=qN>0?'none':'inline';caret.style.display=(elapsed>qS&&p<0.14)?'inline':'none';}
       else{typed.textContent='';ph.style.display='inline';caret.style.display='none';}}
      setOp(chips,(1-smooth(p,0.04,0.1))*ch1); chips.style.pointerEvents=p<0.05?'auto':'none';
      // processing signature
      let prOp=0,prTxt='',prTop=H*0.5;
      if(p<0.30){const a=clampr(elapsed,3.4,0.6)*(1-clampr(elapsed,6.2,0.8));prOp=a*ch1;prTxt=PROC1;prTop=H*0.52;}
      else{const a=smooth(p,0.51,0.58)*(1-smooth(p,0.74,0.80));prOp=a;prTxt=PROC2;prTop=Math.max(150,cyc-ory-44);}
      setOp(proc,prOp);proc.style.top=prTop.toFixed(0)+'px';if(prTxt&&proc._t!==prTxt){procTxt.textContent=prTxt;proc._t=prTxt;}
      // hero card carousel (2s) — input -> compute -> output, restful loop
      if(false){
        carT+=dt;
        if(carPhase===0){const s=A.bright[carIdx%A.bright.length];featured=s;showCard(s.px,s.py,s.data,s.data._gold);if(carT>2.0){carPhase=1;carT=0;hideCard();}}
        else{featured=null;if(carT>0.5){carPhase=0;carT=0;carIdx=(carIdx+1)%A.bright.length;}}
      } else { if(featured){featured=null; if(!pinned&&!hoverStar)hideCard();} carPhase=0;carT=0; }
      // demo cards
      {const va=smooth(p,0.15,0.21)*(1-smooth(p,0.24,0.30));demoEls.forEach((el)=>{const tg=va*(el._roleOp||0.5);el._op=(el._op||0)+(tg-(el._op||0))*0.22;el.style.opacity=el._op.toFixed(3);});demoWrap.style.pointerEvents=va>0.4?'auto':'none';setOp(demoDots,va);demoDots.style.pointerEvents=va>0.4?'auto':'none';}
      // starfield slides WITH the cards on swipe (bounded parallax nudge)
      {const vp=smooth(p,0.13,0.20)*(1-smooth(p,0.26,0.33));self._canvasKick=(self._canvasKick||0)*0.9;const cxk=self._canvasKick*vp;canvas.style.transform=Math.abs(cxk)>0.15?('translateX('+cxk.toFixed(1)+'px)'):'none';}
      // fog DOM blur
      const f=Math.max(0,1-Math.abs(p-0.335)/0.10);setOp(fog,f*0.9);if(f>0.001){const bl=(f*f*22).toFixed(1);fog.style.background='radial-gradient(130% 100% at 50% '+(34+f*16)+'%, rgba(40,34,72,'+(0.4*f)+'), rgba(24,20,48,'+(0.3*f)+') 52%, rgba(14,11,30,'+(0.22*f)+'))';fog.style.backdropFilter='blur('+bl+'px)';fog.style.webkitBackdropFilter='blur('+bl+'px)';}else{fog.style.backdropFilter='none';fog.style.webkitBackdropFilter='none';}
      // corner (event context)
      setOp(corner,smooth(p,0.44,0.50)*(1-smooth(p,0.80,0.86)));
      // slogan: type ~1s, hold ~2s, then shrink & dock at the TOP with a subtle backing (clear of cards)
      {const sf=seg(p,0.30,0.36);const sN=Math.round(sf*SLO2.length);
       const shrink=smooth(p,0.50,0.58);
       const show=smooth(p,0.30,0.35)*(1-smooth(p,0.88,0.93));setOp(pain,show);
       painTxt.textContent=sf<1?SLO2.slice(0,sN):SLO2;
       painCaret.style.display=(sf<1&&show>0.05)?'inline':'none';
       pain.style.top=lerp(0.20*H,104,shrink).toFixed(0)+'px';
       pain.style.fontSize=lerp(19,14,shrink).toFixed(1)+'px';
       pain.style.width='86%';
       pain.style.lineHeight=lerp(1.55,1.45,shrink).toFixed(2);
       const dk=shrink>0.4;
       pain.style.color=dk?'#e8e6f4':'#f1eff9';
       pain.style.background=dk?'rgba(11,10,21,0.62)':'transparent';
       pain.style.border='1px solid '+(dk?'rgba(150,145,200,0.16)':'transparent');
       pain.style.borderRadius='14px';
       pain.style.padding=dk?'10px 22px':'0';
       pain.style.backdropFilter=dk?'blur(10px)':'none';pain.style.webkitBackdropFilter=pain.style.backdropFilter;
       pain.style.boxShadow=dk?'0 12px 34px -18px rgba(0,0,0,0.7)':'none';
       pain.style.zIndex='8';}
      // all 6 cards orbit "你" together, sitting on the OUTER side of each star — near big & solid, far small & blurred
      const ocClose=1-smooth(p,0.92,0.97);
      const appear=smooth(p,0.66,0.76)*ocClose;
      // orbit page (mobile): one connector-popped card at a time, rotating around "你"
      {const mc=$('skMobCard');if(mc){
        if(appear>0.5){self._orbT=(self._orbT||0)+dt;if(self._orbT>2.8){self._orbT=0;self._orbI=((self._orbI||0)+1)%(C.rel.length||1);self._fillOrb&&self._fillOrb();}}
        let sf=1;const tt=self._orbT||0;if(appear>0.5){if(tt>2.48)sf=Math.max(0,1-(tt-2.48)/0.32);else if(tt<0.32)sf=tt/0.32;}
        const op=appear*sf;const mcTop=cyc+ory+30;
        mc.style.opacity=op.toFixed(3);mc.style.top=mcTop.toFixed(0)+'px';mc.style.pointerEvents='none';
        for(let k=0;k<C.rel.length;k++)C.rel[k]._cv=0;
        self._curRel=self._orbI||0;const cur=C.rel[self._curRel];if(cur){cur._cv=op;cur._lx=cx;cur._ly=mcTop;}
      }}
      // step stars — compact lightweight rows, clear of the bottom hint band (mobile)
      const HINTBAND=60;
      const stepW=Math.min(W-40,338);
      const stepGap=Math.min(H*0.078,66);
      const stepsTop=(H-HINTBAND)-stepGap*3;
      stepEls.forEach((el,i)=>{const a=smooth(p,0.74+i*0.02,0.80+i*0.02)*(1-smooth(p,0.93,0.99));
        el.style.width=stepW+'px';
        const x=(W-stepW)/2,y=stepsTop+i*stepGap;
        el.style.opacity=a.toFixed(3);el.style.transform='translate('+x.toFixed(1)+'px,'+(y+(1-a)*12).toFixed(1)+'px)';});
      // organizer
      const oa=smooth(p,0.90,1.0);setOp(org,oa);org.style.pointerEvents=oa>0.5?'auto':'none';
    };

    // ===== STOP MACHINE =====
    const STOPS=[0.00,0.22,0.84,1.00];
    let stopIdx=0, animating=false, animFrom=0, animTo=0, animT=0, animDur=2.0;
    self._p=0;
    const buildDots=()=>{dots.innerHTML='';STOPS.forEach((_,i)=>{const d=document.createElement('button');d.style.cssText='width:9px;height:9px;border-radius:50%;border:1px solid rgba(165,160,210,0.45);background:transparent;cursor:pointer;padding:0;transition:all .35s;pointer-events:auto;';d.addEventListener('click',()=>goStop(i));dots.appendChild(d);});};
    const updateDots=()=>{[].slice.call(dots.children).forEach((d,i)=>{const on=i===stopIdx;d.style.background=on?'#bcb2f4':'transparent';d.style.borderColor=on?'#bcb2f4':'rgba(165,160,210,0.4)';d.style.transform=on?'scale(1.25)':'scale(1)';d.style.boxShadow=on?'0 0 12px -1px #8b7bf0':'none';});};
    const goStop=(i)=>{i=clamp(i,0,STOPS.length-1);if(animating||i===stopIdx)return;animFrom=self._p;animTo=STOPS[i];stopIdx=i;animT=0;const span=Math.abs(animTo-animFrom);animDur=span>0.45?8.5:(span>0.25?2.8:2.1);animating=true;updateDots();if(i>0&&featured){featured=null;hideCard();}if(pinned){pinned=null;hideCard();}};
    const onIntent=(dir)=>{if(animating)return;goStop(stopIdx+dir);};

    // ===== LOOP =====
    const t0=performance.now();
    const frame=(p,t,dt,idle)=>{
      const elapsed=(t-t0)/1000;
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.clearRect(0,0,W,H);
      if(self._wb){ctx.fillStyle=self._wb;ctx.fillRect(0,0,W,H);}
      if(p<0.33)renderA(p,t);else renderC(p,t);
      if(self._vg){ctx.fillStyle=self._vg;ctx.fillRect(0,0,W,H);}
      renderFog(p,t);
      updateOverlays(p,t,elapsed,dt,idle);
      if(pinned){showCard(pinned.px,pinned.py,pinned.data,pinned.data._gold);}
    };
    const tick=(now)=>{
      const dt=Math.min(0.05,(now-(self._lt||now))/1000);self._lt=now;
      let idle=false;
      if(animating){animT+=dt;const r=clamp(animT/animDur,0,1);self._p=lerp(animFrom,animTo,smoother(r));if(r>=1){animating=false;self._p=animTo;}}
      else{self._p=lerp(self._p,STOPS[stopIdx],0.2);idle=(stopIdx===0&&Math.abs(self._p-STOPS[0])<0.004);}
      curP=self._p;frame(self._p,now,dt,idle);
    };
    const loop=(now)=>{tick(now);self._raf=requestAnimationFrame(loop);};

    // ===== INPUT =====
    let wheelAcc=0,wheelCD=0;
    const onWheel=(e)=>{e.preventDefault();if(animating){wheelAcc=0;return;}const n=performance.now();if(n<wheelCD)return;wheelAcc+=e.deltaY;if(Math.abs(wheelAcc)>50){onIntent(wheelAcc>0?1:-1);wheelAcc=0;wheelCD=n+650;}};
    let tY=0;
    const onTS=(e)=>{tY=e.touches[0].clientY;};
    const onTE=(e)=>{if(animating)return;const dy=tY-(e.changedTouches[0].clientY);if(Math.abs(dy)>40)onIntent(dy>0?1:-1);};
    const onKey=(e)=>{if(['ArrowDown','PageDown',' ','Spacebar'].includes(e.key)){e.preventDefault();onIntent(1);}else if(['ArrowUp','PageUp'].includes(e.key)){e.preventDefault();onIntent(-1);}else if(e.key==='Home'){goStop(0);}else if(e.key==='End'){goStop(STOPS.length-1);}};
    window.addEventListener('wheel',onWheel,{passive:false});
    window.addEventListener('touchstart',onTS,{passive:true});
    window.addEventListener('touchend',onTE,{passive:true});
    window.addEventListener('keydown',onKey);

    // pointer interaction
    const hitTest=()=>{let best=null,bd=1e9;const consider=(arr,rad)=>{for(let i=0;i<arr.length;i++){const s=arr[i];if(!s.data)continue;const d=Math.hypot(mx-s.px,my-s.py);if(d<rad&&d<bd){bd=d;best=s;}}};if(curP<0.30){consider(A.bright,30);consider(A.near,15);}else if(curP>0.42){consider(C.rel,30);consider(C.stars,14);}return best;};
    scene.addEventListener('mousemove',e=>{const r=canvas.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;if(pinned)return;const s=hitTest();if(s){if(featured){featured=null;}if(hoverStar!==s){hoverStar=s;showTip(s.px,s.py,s.data);}scene.style.cursor='pointer';}else if(hoverStar){hoverStar=null;hideTip();scene.style.cursor='';}});
    scene.addEventListener('mouseleave',()=>{mx=my=-1;if(hoverStar){hoverStar=null;hideTip();}});
    scene.style.pointerEvents='auto';
    scene.addEventListener('click',e=>{const r=canvas.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;const s=hitTest();if(s){pinned=s;featured=null;hideTip();showCard(s.px,s.py,s.data,s.data._gold);}else if(pinned){pinned=null;hideCard();}});
    host.querySelectorAll('.sk-chip').forEach((ch)=>{ch.addEventListener('click',()=>goStop(1));});
    // recommendation carousel — horizontal swipe (does not trigger vertical scene nav) + tap a side card to focus
    {let dsx=0,dsy=0;demoWrap.addEventListener('touchstart',e=>{dsx=e.touches[0].clientX;dsy=e.touches[0].clientY;},{passive:true});
     demoWrap.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-dsx,dy=e.changedTouches[0].clientY-dsy;if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>32){e.stopPropagation();advanceDemo(dx<0?1:-1);resetDemoTimer();}},{passive:true});
     demoEls.forEach((el,j)=>{el.addEventListener('click',()=>{if(self._demoI!==j&&stopIdx===1){self._demoI=j;updateCarousel();resetDemoTimer();}});});}
    {const burger=$('skBurger'),menu=$('skMenu');if(burger&&menu){burger.addEventListener('click',e=>{e.stopPropagation();menu.style.display=(menu.style.display==='flex')?'none':'flex';});const menuDocClick=(e)=>{if(menu.style.display==='flex'&&!menu.contains(e.target)&&!burger.contains(e.target))menu.style.display='none';};document.addEventListener('click',menuDocClick);self._menuDocClick=menuDocClick;menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.style.display='none';}));}}
    cue.addEventListener('click',()=>{if(stopIdx===STOPS.length-1)goStop(0);else onIntent(1);});
    {const enter=$('skEnter');if(enter){enter.addEventListener('click',()=>onIntent(1));enter.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onIntent(1);}});}}
    // ending mini popout-card carousel (toC visual)
    {const MS=[31,42,53];let mci=0;const setMini=()=>{const a=$('skMiniAva'),n=$('skMiniName'),h=$('skMiniHelp');if(!a)return;const d=card(MS[mci%MS.length]);if(a.dataset.s!==d.av){a.dataset.s=d.av;a.src=d.av;}n.textContent=d.name;h.textContent=d.help;};self._setMini=setMini;setMini();self._miniIv=setInterval(()=>{const w=$('skMiniCard');if(!w)return;w.style.opacity='0';setTimeout(()=>{mci++;setMini();w.style.opacity='1';},280);},2900);}

    buildA();buildC();buildRelCards();buildFog();
    {const mc=$('skMobCard');self._orbI=0;self._orbT=0;self._fillOrb=()=>{if(!mc||!C.rel.length)return;const i=(self._orbI||0)%C.rel.length;const s=C.rel[i];const ww=Math.min(348,(scene.getBoundingClientRect().width||390)-44);mc.style.width=ww+'px';mc.innerHTML=cardHTML(s.data,s.gold,ww);const more=mc.querySelector('.sk-more');if(more)more.style.display='none';self._curRel=i;};self._fillOrb();}
    C.rel.forEach((s)=>{const aa=rnd()*6.283,rr=0.45+rnd()*0.4;s.hnx=Math.cos(aa)*rr;s.hny=Math.sin(aa)*rr*0.7;});
    buildDots();updateDots();resize();updateCarousel();resetDemoTimer();

    // ===== i18n: live language switch (中 / EN) =====
    const langStyle=document.createElement('style');
    // Scoped to host (data-lang lives on #skRoot here, not <html>); !important beats
    // the reference's inline font-family on [data-serif] elements so EN actually
    // renders Newsreader as designed.
    langStyle.textContent='#skRoot[data-lang="en"] [data-serif]{font-family:\'Newsreader\',Georgia,serif !important;}@media (min-width:1024px){#skRoot[data-lang="en"] #skNavLinks{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);}}';
    document.head.appendChild(langStyle);self._langStyle=langStyle;
    const langBtns=[].slice.call(host.querySelectorAll('[data-lang-btn]'));
    const updateLangBtns=()=>{langBtns.forEach(b=>{const on=b.getAttribute('data-lang-btn')===LANG;b.style.color=on?'#0b0a15':'rgba(230,228,244,0.5)';b.style.background=on?'#cfc9ef':'transparent';b.style.fontWeight=on?'600':'400';b.setAttribute('aria-pressed',on?'true':'false');});};
    const applyDOM=()=>{
      host.querySelectorAll('[data-i18n]').forEach(el=>{const v=T()[el.getAttribute('data-i18n')];if(v!=null)el.textContent=v;});
      host.querySelectorAll('[data-i18n-html]').forEach(el=>{const v=T()[el.getAttribute('data-i18n-html')];if(v!=null)el.innerHTML=v;});
    };
    const applyLang=(lng,persist)=>{
      try{
        LANG=(lng==='en')?'en':'zh';
        host.setAttribute('data-lang',LANG);
        if(persist){try{localStorage.setItem('iorbit_lang',LANG);}catch(e){}}
        QUERY=T().query;SLO2=T().slo2;PROC1=T().proc1;PROC2=T().proc2;
        applyDOM();
        words=[].slice.call(host.querySelectorAll('.sk-word'));   // H1 spans are rebuilt by applyDOM
        // re-derive card text from stored seeds — geometry is untouched, so the scene never jumps
        A.bright.forEach(b=>{b.data=card(b.data._i);});
        C.stars.forEach(s=>{s.data=card(s.data._i);});
        C.rel.forEach((s,i)=>{s.data=card(s.data._i);s.data.tag=T().relTags[i];if(i===0)s.data._gold=true;});
        rebuildDemo();rebuildSteps();buildRelCards();if(self._setMini)self._setMini();if(self._fillOrb)self._fillOrb();
        proc._t=null;cue._lang=null;                                  // force overlay text to refresh next frame
        if(pinned)fillCard(pinned.data,pinned.data._gold);
        if(hoverStar&&hoverStar.data)showTip(hoverStar.px,hoverStar.py,hoverStar.data);
        updateLangBtns();
      }catch(err){
        try{localStorage.setItem('iorbit_lang',(lng==='en')?'en':'zh');}catch(e){}
        location.reload();
      }
    };
    langBtns.forEach(b=>{
      b.addEventListener('click',()=>{const l=b.getAttribute('data-lang-btn');if(l!==LANG)applyLang(l,true);});
      b.addEventListener('mouseenter',()=>{if(b.getAttribute('data-lang-btn')!==LANG)b.style.color='rgba(255,255,255,0.85)';});
      b.addEventListener('mouseleave',updateLangBtns);
    });
    applyLang(LANG,false);

    const onR=()=>resize();window.addEventListener('resize',onR);
    self._cleanup=()=>{window.removeEventListener('resize',onR);window.removeEventListener('wheel',onWheel);window.removeEventListener('touchstart',onTS);window.removeEventListener('touchend',onTE);window.removeEventListener('keydown',onKey);};
    tick(performance.now());
    if(!RM)self._raf=requestAnimationFrame(loop);
  
  // React-only additions to the reference unmount: the reference page never
  // unmounts, so it leaks head styles and a document-level listener; we must not.
  return () => {if(self._raf)cancelAnimationFrame(self._raf);if(self._miniIv)clearInterval(self._miniIv);if(self._demoIv)clearInterval(self._demoIv);if(self._cleanup)self._cleanup();if(self._gst)self._gst.remove();if(self._grain)self._grain.remove();if(self._langStyle)self._langStyle.remove();if(self._menuDocClick)document.removeEventListener('click',self._menuDocClick);};
}

(() => {
  'use strict';
  const fixture=window.SWARM_DATA,graphElement=document.getElementById('graph');
  if(!fixture||!Array.isArray(fixture.messages)||!fixture.messages.length||typeof ForceGraph!=='function'){
    graphElement.textContent='The source data or Force Graph library could not load.';return;
  }
  const families={Claude:'#ba9af7','GPT / OpenAI':'#7bbaff',Gemini:'#8cdeaf',DeepSeek:'#edaa78',Grok:'#f39cc5',Kimi:'#e7ce78',GLM:'#82d7df',Other:'#b7c3d1'};
  function family(name){if(/^(Claude|Opus\b)/i.test(name))return 'Claude';if(/^(GPT-|o\d)/i.test(name))return 'GPT / OpenAI';if(/^Gemini/i.test(name))return 'Gemini';if(/^DeepSeek/i.test(name))return 'DeepSeek';if(/^Grok/i.test(name))return 'Grok';if(/^Kimi/i.test(name))return 'Kimi';if(/^GLM/i.test(name))return 'GLM';return 'Other';}
  const agents=fixture.agents.map(a=>({...a,kind:a.speaker_type==='human'?'human':'agent',family:family(a.name),color:a.speaker_type==='human'?'#aab4bb':families[family(a.name)]}));
  const rooms=fixture.rooms.map(r=>({...r,name:'#'+r.name,kind:'room',color:'#70dec4'}));
  const allNodes=[...agents,...rooms],byId=Object.fromEntries(allNodes.map(n=>[n.id,n]));
  const messages=fixture.messages.map(m=>({id:m.id,time:m.created_at,from:m.agent_speaker_id,room:m.room_id,to:m.recipient_agent_ids,text:m.content,matches:m.address_matches,speakerType:m.speaker_type||'agent'}));
  let baseIndices=[];
  const allIndices=messages.map((_,i)=>i),loadedRange=`${messages[0].time.slice(0,16)}–${messages.at(-1).time.slice(0,16)} UTC`;
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const idOf=value=>typeof value==='object'?value.id:value;
  const pairKey=(a,b)=>a+'|'+b;
  const intervalSelect=document.getElementById('intervalSize');let intervalMinutes=10;intervalSelect.value=String(intervalMinutes);
  const utcMillis=time=>Date.parse(time.slice(0,19).replace(' ','T')+'Z');
  const formatMinute=millis=>new Date(millis).toISOString().slice(0,16).replace('T',' ');
  const binKey=time=>formatMinute(Math.floor(utcMillis(time)/(intervalMinutes*60000))*intervalMinutes*60000);
  const binEnd=start=>formatMinute(utcMillis(start)+intervalMinutes*60000);
  const frameRange=frame=>`${frame.start}–${binEnd(frame.start)} UTC`;
  function route(m){if(m.to.length===1)return [[m.from,m.to[0]]];if(!m.to.length)return [[m.from,m.room]];return [[m.from,m.room],...m.to.map(id=>[m.room,id])];}
  // Count source messages, not the visual route legs they produce.
  function receivedCounts(indices){const ids=new Map();for(const i of indices){const m=messages[i];for(const id of new Set(m.to)){if(!ids.has(id))ids.set(id,new Set());ids.get(id).add(m.id);}}return new Map([...ids].map(([id,found])=>[id,found.size]));}
  const agentRadius=count=>10+5*Math.log10(count+1);
  function routeText(m){return route(m).map(([a,b])=>`${byId[a].name} → ${byId[b].name}`).join(' · ');}
  const wrap=document.getElementById('graphWrap');
  let search='',from='',to='',scopedIndices=allIndices,frames=[],frameByKey=new Map(),frameIndex=0,selected=-1;
  let mode='interval',buildup=false,inspector=null,inspected=null,playing=false,timer=null,graph=null,graphLinks=[],graphPairSignature='',resizeTimer,fitTimer;
  const presetSelect=document.getElementById('datePreset');
  const minute=time=>time.slice(0,16).replace(' ','T');
  const after=(value,ms)=>new Date(Date.parse(value+':00Z')+ms).toISOString().slice(0,16);
  const first=minute(messages[0].time),last=minute(messages.at(-1).time);
  const firstDay=first.slice(0,10),lastDay=last.slice(0,10);
  const dayCounts=new Map();for(const m of messages){const day=m.time.slice(0,10);dayCounts.set(day,(dayCounts.get(day)||0)+1);}
  const busiestDay=[...dayCounts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];
  const dayEnd=day=>after(day+'T00:00',86400000);
  const hourStart=value=>value.slice(0,13)+':00';
  const candidates=[
    ['All dates','',''],
    ['First hour',hourStart(first),after(hourStart(first),3600000)],
    ['First day',firstDay+'T00:00',dayEnd(firstDay)],
    ['Busiest day',busiestDay+'T00:00',dayEnd(busiestDay)],
    ['Latest day',lastDay+'T00:00',dayEnd(lastDay)],
    ['Final hour',hourStart(last),after(hourStart(last),3600000)]
  ];
  const presets=[],seenPresets=new Set();for(const [label,start,end] of candidates){const key=start+'|'+end;if(seenPresets.has(key))continue;seenPresets.add(key);const count=messages.filter(m=>(!start||minute(m.time)>=start)&&(!end||minute(m.time)<end)).length;if(start&&count===messages.length)continue;presets.push({label,start,end,count});if(presets.length===6)break;}
  for(const [index,preset] of presets.entries()){const date=preset.start?` · ${preset.start.slice(0,10)}`:'';presetSelect.add(new Option(`${preset.label}${date} · ${preset.count.toLocaleString()} messages`,String(index)));}
  presetSelect.add(new Option('Custom range','custom'));
  function syncPreset(){const found=presets.findIndex(p=>p.start===document.getElementById('fromInput').value&&p.end===document.getElementById('toInput').value);presetSelect.value=found<0?'custom':String(found);}
  function makeFrames(){
    const map=new Map();scopedIndices.forEach((index,offset)=>{const key=binKey(messages[index].time);if(!map.has(key))map.set(key,{start:key,indices:[],endOffset:0});const f=map.get(key);f.indices.push(index);f.endOffset=offset+1;});
    frames=[...map.values()].sort((a,b)=>a.start.localeCompare(b.start));frameByKey=new Map(frames.map((f,i)=>[f.start,i]));frameIndex=0;selected=frames.length?frames[0].indices[0]:-1;
  }
  function activeIndices(){if(selected<0)return [];return mode==='interval'?frames[frameIndex].indices:[selected];}
  function visibleIndices(){if(!buildup||mode!=='interval')return scopedIndices;if(!frames.length)return [];return scopedIndices.slice(0,frames[frameIndex].endOffset);}
  function activeNodes(){return new Set(activeIndices().flatMap(i=>route(messages[i]).flat()));}
  function buildPairs(indices){
    const map=new Map();for(const i of indices){const m=messages[i];for(const [source,target] of route(m)){
      const key=pairKey(source,target);let p=map.get(key);if(!p){p={key,source,target,messageIndices:[],messageIds:[],count:0};map.set(key,p);}
      p.messageIndices.push(i);p.messageIds.push(m.id);p.count++;
    }}return map;
  }
  function currentPairKeys(){return new Set(selected<0?[]:route(messages[selected]).map(([a,b])=>pairKey(a,b)));}
  function activePairCounts(){const counts=new Map();for(const i of activeIndices())for(const [a,b] of route(messages[i])){const key=pairKey(a,b);counts.set(key,(counts.get(key)||0)+1);}return counts;}
  function fitGraph(){
    if(!graph)return;const nodes=graph.graphData().nodes;if(!nodes.length||nodes.some(n=>!Number.isFinite(n.x)||!Number.isFinite(n.y)))return;
    const c=document.createElement('canvas').getContext('2d');c.font='11px system-ui';const widest=Math.max(...nodes.map(n=>c.measureText(n.name).width));
    const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    const scale=Math.max(.08,Math.min(1.1,(wrap.clientWidth-130-widest)/Math.max(1,right-left),(wrap.clientHeight-160)/Math.max(1,bottom-top)));
    graph.centerAt((left+right)/2,(top+bottom)/2,350).zoom(scale,350);
  }
  function seed(node,i,n){const a=(i/n)*2*Math.PI-Math.PI/2;return {x:Math.cos(a)*230,y:Math.sin(a)*180};}
  function rebuildGraph(resetPositions=false,refit=resetPositions){
    if(!graph)return;const indices=visibleIndices(),pairs=buildPairs(indices),received=receivedCounts(indices),visibleNodeIds=new Set([...pairs.values()].flatMap(p=>[p.source,p.target]));
    indices.forEach(i=>visibleNodeIds.add(messages[i].room));
    const old=resetPositions?new Map():new Map(graph.graphData().nodes.map(n=>[n.id,n]));
    const selectedNodes=allNodes.filter(n=>visibleNodeIds.has(n.id));
    const nodes=selectedNodes.map((n,i)=>{const prior=old.get(n.id),position=prior&&Number.isFinite(prior.x)?{x:prior.x,y:prior.y}:seed(n,i,selectedNodes.length||1);const count=n.kind==='agent'?(received.get(n.id)||0):0;return {...n,...position,receivedCount:count,radius:n.kind==='room'?null:agentRadius(count)};});
    const links=[...pairs.values()].map(p=>({...p}));graphPairSignature=links.map(l=>l.key).join(',');
    graph.graphData({nodes,links});graphLinks=links;graph.cooldownTicks(130);if(refit){clearTimeout(fitTimer);fitTimer=setTimeout(fitGraph,500);}renderLegend(nodes);
  }
  function renderLegend(nodes){
    const legend=document.getElementById('legend');legend.replaceChildren();const present=new Set(nodes.filter(n=>n.kind==='agent').map(n=>n.family));
    for(const [name,color] of Object.entries(families))if(present.has(name)){const item=document.createElement('span'),swatch=document.createElement('i');swatch.style.background=color;item.append(swatch,document.createTextNode(name));legend.append(item);}
    if(nodes.some(n=>n.kind==='room')){const item=document.createElement('span'),swatch=document.createElement('i');swatch.className='room';item.append(swatch,document.createTextNode('Room'));legend.append(item);}
    if(nodes.some(n=>n.kind==='human')){const item=document.createElement('span'),swatch=document.createElement('i');swatch.style.background='#aab4bb';item.append(swatch,document.createTextNode('Human'));legend.append(item);}
    const item=document.createElement('span');item.textContent='Agent dot size = unique messages explicitly addressed · bright = current';legend.append(item);
  }
  function refreshGraph(){
    if(!graph)return;const active=activePairCounts(),selectedKeys=currentPairKeys(),activeNodeIds=activeNodes();
    graph.linkColor(l=>selectedKeys.has(l.key)?'#8ce8d1':active.has(l.key)?'#80b6e5b0':'#6b84a342')
      .linkWidth(l=>selectedKeys.has(l.key)?3.4:active.has(l.key)?Math.min(4,1.1+Math.log2(active.get(l.key)+1)*.55):.8)
      .linkDirectionalArrowLength(l=>selectedKeys.has(l.key)?7:0).linkDirectionalArrowColor(()=>'#a9f8de');
    graph.nodeColor(n=>activeNodeIds.has(n.id)?n.color:'#73869a');
  }
  function paintNode(node,ctx,scale){
    const isCurrent=activeNodes().has(node.id),isSelected=selected>=0&&route(messages[selected]).flat().includes(node.id);
    ctx.save();ctx.globalAlpha=isCurrent?1:.55;ctx.shadowColor=isSelected?node.color:'transparent';ctx.shadowBlur=isSelected?16:0;
    if(node.kind==='room'){
      ctx.beginPath();ctx.roundRect(node.x-35,node.y-20,70,40,8);ctx.fillStyle='#183842';ctx.strokeStyle=isSelected?'#a0f5dc':'#63b9aa';ctx.lineWidth=isSelected?2.8:1.5;ctx.fill();ctx.stroke();ctx.shadowBlur=0;
      ctx.fillStyle='#e1fff4';ctx.font=`${Math.max(10,11/scale)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(node.name,node.x,node.y);
    }else{
      ctx.beginPath();ctx.arc(node.x,node.y,node.radius,0,Math.PI*2);ctx.fillStyle=node.color;ctx.fill();ctx.shadowBlur=0;
      ctx.beginPath();ctx.arc(node.x,node.y,Math.min(6,node.radius*.5),0,Math.PI*2);ctx.fillStyle='#122034';ctx.fill();
      const crowded=graph.graphData().nodes.some(other=>other.id!==node.id&&Math.abs(other.x-node.x)*scale<95&&Math.abs(other.y-node.y)*scale<34);
      if(isSelected||!crowded){ctx.fillStyle='#e7f2ff';ctx.font=`${Math.max(9,10/scale)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText(node.name,node.x,node.y+node.radius+6);}
    }ctx.restore();
  }
  function eligibleIndices(){return visibleIndices();}
  function collectionIndices(){
    if(!inspector)return [];
    const eligible=eligibleIndices();if(inspector.type==='node'){const n=byId[inspector.id];return eligible.filter(i=>n.kind==='room'?messages[i].room===n.id:messages[i].from===n.id||messages[i].to.includes(n.id));}
    const pair=graphLinks.find(l=>l.key===inspector.key);return pair?pair.messageIndices:[];
  }
  function renderDetail(){
    const detail=document.getElementById('detail'),heading=document.getElementById('detailHeading');
    if(inspector&&inspected===null){
      const indices=collectionIndices(),scope=buildup?'visible buildup':'filtered range';
      if(inspector.type==='node'){
        const n=byId[inspector.id];heading.textContent=`${n.kind==='room'?'Room':'Agent'} messages · ${scope}`;
        if(n.kind==='room')detail.innerHTML=`<h2>${esc(n.name)}</h2><p>${indices.length} messages originally posted in this room.</p><p class="detail-note">${esc(scope)} · choose a message below to read its full text.</p>`;
        else{const sent=indices.filter(i=>messages[i].from===n.id).length,received=indices.filter(i=>messages[i].to.includes(n.id)).length;
          detail.innerHTML=`<h2>${esc(n.name)}</h2><p>${indices.length} unique messages.</p><p class="node-stats">${sent} sent · ${received} explicitly addressed to this agent</p><p class="detail-note">Dot size uses ${received} uniquely addressed source messages in the ${esc(scope)}. Recipients come from your supplied records.</p>`;}
      }else{
        const [a,b]=inspector.key.split('|');heading.textContent=`Connection messages · ${scope}`;
        detail.innerHTML=`<h2>${esc(byId[a].name)} → ${esc(byId[b].name)}</h2><p>${indices.length} messages on this directed connection.</p><p class="detail-note">${esc(scope)} · choose a message below to read its full text.</p>`;
      }return;
    }
    if(selected<0){heading.textContent='No messages';detail.innerHTML='<p>No messages match these filters.</p>';return;}
    const index=inspected===null?selected:inspected,m=messages[index];heading.textContent=inspector?'Message from connection or node':'Selected source message';
    detail.innerHTML=`<div class="label">${esc(m.id)}</div><h2>${esc(byId[m.from].name)}</h2><div class="label">${esc(m.time)} UTC</div><p id="messageText"></p><dl class="meta"><dt>Original room</dt><dd>${esc(byId[m.room].name)}</dd><dt>Recipients</dt><dd>${m.to.length?esc(m.to.map(id=>byId[id].name).join(', ')):'None supplied'}</dd><dt>Visual route</dt><dd class="route">${esc(routeText(m))}</dd><dt>Message ID</dt><dd>${esc(m.id)}</dd></dl>`;
    document.getElementById('messageText').textContent=m.text;
    if(inspector&&!activeIndices().includes(index)){const note=document.createElement('p');note.className='detail-note';note.textContent='This message is outside the graph’s current interval. The graph has not moved.';detail.append(note);}
  }
  function renderEvents(){
    const list=document.getElementById('events');list.replaceChildren();const indices=inspector?collectionIndices():activeIndices();
    document.getElementById('clearFilter').hidden=!inspector;
    document.getElementById('eventLabel').textContent=inspector?`${indices.length} messages · ${buildup?'visible buildup':'filtered range'}`:mode==='interval'?`${indices.length} messages in this interval`:`${indices.length} selected message`;
    indices.forEach(i=>{
      const m=messages[i],b=document.createElement('button');b.className='event'+(i===(inspector?inspected:selected)?' active':'');
      const role=inspector?.type==='node'?(byId[inspector.id].kind==='room'?`Posted in ${byId[inspector.id].name}`:[m.from===inspector.id?'Sent':null,m.to.includes(inspector.id)?'Addressed':null].filter(Boolean).join(' + ')):inspector?.type==='pair'?'On this connection':byId[m.from].name;
      b.innerHTML=`<strong>${esc(role)}</strong> <small>${esc(m.time)} UTC · ${esc(byId[m.from].name)} · ${esc(byId[m.room].name)} · ${esc(m.id.slice(0,8))}</small>${inspector?`<span class="snippet">${esc(m.text.replace(/\s+/g,' ').slice(0,105))}</span>`:''}`;
      b.onclick=()=>{if(inspector){inspected=i;renderDetail();list.querySelector('.event.active')?.classList.remove('active');b.classList.add('active');}else selectMessage(i,false);};list.append(b);
    });
    list.querySelector('.event.active')?.scrollIntoView({block:'nearest'});
  }
  function renderTimeline(){const timeline=document.getElementById('timeline');if(!frames.length){timeline.replaceChildren();return;}
    if(mode==='interval'&&frames.length>96){let s=timeline.querySelector('#intervalSlider');if(!s){s=document.createElement('input');s.type='range';s.id='intervalSlider';s.setAttribute('aria-label','Select active interval');s.oninput=()=>selectFrame(Number(s.value));timeline.replaceChildren(s);}s.min='0';s.max=String(frames.length-1);s.value=String(frameIndex);s.title=frameRange(frames[frameIndex]);}
    else if(mode==='interval'){timeline.replaceChildren();frames.forEach((f,i)=>{const b=document.createElement('button');b.className='tick'+(i===frameIndex?' active':'')+(i<frameIndex?' seen':'');b.title=`${frameRange(f)} · ${f.indices.length} messages`;b.setAttribute('aria-label',`Select ${frameRange(f)}`);b.onclick=()=>selectFrame(i);timeline.append(b);});}
    else{let s=timeline.querySelector('#messageSlider');if(!s){s=document.createElement('input');s.type='range';s.id='messageSlider';s.setAttribute('aria-label','Select filtered message');s.oninput=()=>selectMessage(scopedIndices[Number(s.value)],false);timeline.replaceChildren(s);}s.min='0';s.max=String(scopedIndices.length-1);s.value=String(scopedIndices.indexOf(selected));}
  }
  function render(){
    document.getElementById('modeInterval').classList.toggle('active',mode==='interval');document.getElementById('modeMessage').classList.toggle('active',mode==='message');
    const button=document.getElementById('buildupButton');button.classList.toggle('active',buildup);button.setAttribute('aria-pressed',String(buildup));button.textContent=buildup?'Build up: on':'Build up: off';
    document.getElementById('nextButton').title=mode==='interval'?'Next active interval; empty bins skipped':'Next filtered message';
    if(!frames.length){document.getElementById('summary').textContent='No messages match the search and UTC range.';document.getElementById('count').textContent='0 matches';}
    else if(mode==='interval'){const f=frames[frameIndex],speakers=new Set(f.indices.filter(i=>messages[i].speakerType==='agent').map(i=>messages[i].from));document.getElementById('summary').textContent=`${frameRange(f)} · ${f.indices.length} messages · ${speakers.size} speaking agents`;document.getElementById('count').textContent=`Active interval ${frameIndex+1} of ${frames.length}`;}
    else{document.getElementById('summary').textContent=`${messages[selected].time} UTC · filtered message ${scopedIndices.indexOf(selected)+1} of ${scopedIndices.length}`;document.getElementById('count').textContent=`Message ${scopedIndices.indexOf(selected)+1} of ${scopedIndices.length}`;}
    document.getElementById('captionTitle').textContent=buildup?'Buildup through current interval':'Filtered range · current interval emphasized';
    document.getElementById('graphCaption').textContent=inspector?`The graph stays at this interval. Sidebar evidence covers the ${buildup?'visible buildup':'filtered range'}.`:buildup?'Only connections observed from the filtered range start through this interval appear. Older ones stay faint; current ones are stronger.':'Faint lines show the filtered range. Current interval activity is stronger; selected route pairs are brightest.';
    document.getElementById('sourceNote').textContent=`${scopedIndices.length.toLocaleString()} of ${messages.length.toLocaleString()} loaded messages · ${loadedRange}. Empty ${intervalSelect.selectedOptions[0].textContent} bins skipped; playback advances one occupied bin per step. Routes use supplied recipients; room membership is not inferred.`;
    renderDetail();renderEvents();renderTimeline();refreshGraph();
  }
  function pulseSelected(){if(selected<0||!graph)return;const keys=route(messages[selected]).map(([a,b])=>pairKey(a,b));keys.forEach((key,leg)=>{const link=graphLinks.find(l=>l.key===key);if(link)setTimeout(()=>{if(selected>=0&&currentPairKeys().has(key))graph.emitParticle(link);},leg*350);});}
  function selectFrame(i){if(!frames.length)return;frameIndex=(i+frames.length)%frames.length;selected=frames[frameIndex].indices[0];inspector=null;inspected=null;if(buildup)rebuildGraph();render();pulseSelected();}
  function selectMessage(i,pulse=true){if(i===undefined||i<0)return;selected=i;frameIndex=frameByKey.get(binKey(messages[i].time));inspector=null;inspected=null;render();if(pulse)pulseSelected();}
  function stop(){playing=false;clearInterval(timer);timer=null;document.getElementById('playButton').textContent='▶ Play';}
  function advance(){if(!frames.length)return;if(mode==='interval')selectFrame(frameIndex+1);else{const at=scopedIndices.indexOf(selected);selectMessage(scopedIndices[(at+1)%scopedIndices.length]);}}
  function start(){if(!frames.length)return;playing=true;document.getElementById('playButton').textContent='Ⅱ Pause';pulseSelected();timer=setInterval(advance,2500);}
  function setMode(next){stop();mode=next;if(next==='message')buildup=false;inspector=null;inspected=null;rebuildGraph();render();}
  function setBuildup(on){stop();buildup=on;if(on){mode='interval';frameIndex=0;selected=frames.length?frames[0].indices[0]:-1;}inspector=null;inspected=null;rebuildGraph(on);render();}
  function setIntervalSize(minutes){
    if(![1,5,10,60,1440].includes(minutes))throw new Error('Unsupported interval');
    stop();const oldSelected=selected;intervalMinutes=minutes;intervalSelect.value=String(minutes);makeFrames();
    if(oldSelected>=0&&scopedIndices.includes(oldSelected)){
      frameIndex=frameByKey.get(binKey(messages[oldSelected].time));
      selected=mode==='message'?oldSelected:frames[frameIndex].indices[0];
    }
    inspector=null;inspected=null;if(buildup)rebuildGraph();render();
  }
  function applyFilters(clear=false){
    const q=clear?'':document.getElementById('searchInput').value.trim().toLocaleLowerCase();
    const fromValue=clear?'':document.getElementById('fromInput').value,toValue=clear?'':document.getElementById('toInput').value;
    const f=fromValue.replace('T',' '),t=toValue.replace('T',' '),error=document.getElementById('filterError');
    if(f&&t&&f>=t){error.textContent='To UTC must be later than From UTC. The current view was kept.';return;}
    error.textContent='';stop();search=q;from=f;to=t;
    if(clear){document.getElementById('searchInput').value='';document.getElementById('fromInput').value='';document.getElementById('toInput').value='';}
    syncPreset();
    baseIndices=allIndices.filter(i=>{const m=messages[i],time=m.time.slice(0,16);if(f&&time<f||t&&time>=t)return false;if(!q)return true;return [m.id,m.text,byId[m.from].name,byId[m.room].name,...m.to.map(id=>byId[id].name)].some(s=>s.toLocaleLowerCase().includes(q));});
    scopedIndices=baseIndices;
    makeFrames();inspector=null;inspected=null;rebuildGraph(true);render();
  }
  function collisionForce(){let ns=[];function force(alpha){for(let i=0;i<ns.length;i++)for(let j=i+1;j<ns.length;j++){const a=ns[i],b=ns[j];let dx=(b.x||0)-(a.x||0),dy=(b.y||0)-(a.y||0),dist=Math.hypot(dx,dy)||.001;const min=(a.kind==='room'?55:a.radius)+(b.kind==='room'?55:b.radius)+14;if(dist>=min)continue;const move=(min-dist)/dist*alpha*.45;dx*=move;dy*=move;a.vx=(a.vx||0)-dx;b.vx=(b.vx||0)+dx;a.vy=(a.vy||0)-dy;b.vy=(b.vy||0)+dy;}}force.initialize=n=>{ns=n};return force;}
  graph=ForceGraph()(graphElement).width(wrap.clientWidth).height(wrap.clientHeight).backgroundColor('rgba(0,0,0,0)')
    .nodeCanvasObject(paintNode).nodePointerAreaPaint((n,color,ctx)=>{ctx.fillStyle=color;if(n.kind==='room'){ctx.beginPath();ctx.roundRect(n.x-37,n.y-22,74,44,9);ctx.fill();}else{ctx.beginPath();ctx.arc(n.x,n.y,n.radius+5,0,2*Math.PI);ctx.fill();}})
    .nodeLabel(n=>n.kind==='room'?`Room: ${esc(n.name)}`:n.kind==='human'?`Human: ${esc(n.name)}`:`${esc(n.family)} agent: ${esc(n.name)} · ${n.receivedCount} explicitly addressed messages`)
    .linkPointerAreaPaint((l,color,ctx,scale)=>{ctx.strokeStyle=color;ctx.lineWidth=8/scale;ctx.beginPath();ctx.moveTo(l.source.x,l.source.y);ctx.lineTo(l.target.x,l.target.y);ctx.stroke();})
    .linkDirectionalArrowRelPos(.88).linkDirectionalParticleWidth(5).linkDirectionalParticleColor(()=>'#f7cf80').linkDirectionalParticleSpeed(.018)
    .onNodeClick(n=>{stop();inspector={type:'node',id:n.id};inspected=null;render();})
    .onLinkClick(l=>{stop();inspector={type:'pair',key:l.key};inspected=null;render();});
  graph.d3Force('charge').strength(n=>n.kind==='room'?-1050:-390);
  graph.d3Force('link').distance(l=>idOf(l.source) in byId&&byId[idOf(l.source)].kind==='room'||idOf(l.target) in byId&&byId[idOf(l.target)].kind==='room'?170:135).strength(.035);
  graph.d3Force('separation',collisionForce());graph.cooldownTicks(130);
  new ResizeObserver(()=>{graph.width(wrap.clientWidth).height(wrap.clientHeight);clearTimeout(resizeTimer);resizeTimer=setTimeout(fitGraph,180);}).observe(wrap);
  document.getElementById('applyFilters').onclick=()=>applyFilters();document.getElementById('resetFilters').onclick=()=>applyFilters(true);
  presetSelect.onchange=()=>{const preset=presets[Number(presetSelect.value)];if(!preset)return;document.getElementById('fromInput').value=preset.start;document.getElementById('toInput').value=preset.end;applyFilters();};
  for(const id of ['searchInput','fromInput','toInput'])document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter')applyFilters();});
  document.getElementById('modeInterval').onclick=()=>setMode('interval');document.getElementById('modeMessage').onclick=()=>setMode('message');
  intervalSelect.onchange=()=>setIntervalSize(Number(intervalSelect.value));
  document.getElementById('buildupButton').onclick=()=>setBuildup(!buildup);
  document.getElementById('fitButton').onclick=()=>{clearTimeout(fitTimer);fitGraph();};
  document.getElementById('clearFilter').onclick=()=>{inspector=null;inspected=null;render();};
  document.getElementById('playButton').onclick=()=>playing?stop():start();document.getElementById('nextButton').onclick=()=>{stop();advance();};
  document.getElementById('resetButton').onclick=()=>{stop();if(frames.length)selectFrame(0);};
  applyFilters();
  window.__demo={messages,route,receivedCounts,agentRadius,binKey,binEnd,applyFilters,selectFrame,selectMessage,setMode,setBuildup,setIntervalSize,presets,get frames(){return frames},get graphLinks(){return graphLinks},get graphNodes(){return graph.graphData().nodes},get scopedIndices(){return scopedIndices},get baseIndices(){return baseIndices},get visibleIndices(){return visibleIndices()},get state(){return {mode,buildup,intervalMinutes,frameIndex,selected,inspector,inspected,search,from,to,pairs:graphLinks.length}}};
})();

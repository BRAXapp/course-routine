/* CONFIG */
const DATA_URL = 'https://usis-cdn.eniamza.com/connect.json';
const LOCAL_FALLBACK = 'connect.json';
const POLL_INTERVAL = 60000;
const START_OF_DAY = timeToMinutes('08:00:00');
const END_OF_DAY = timeToMinutes('18:20:00');
const DAY_ORDER = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

let rawData = [];
let cart = [];
let mountedGhosts = [];

function timeToMinutes(t){
  if(!t) return 0;
  const [h,m,s] = t.split(':').map(Number);
  return h*60 + m;
}
function minutesToPercent(minute){
  const total = END_OF_DAY - START_OF_DAY;
  return ((minute - START_OF_DAY) / total) * 100;
}

async function fetchData(){
  try{
    const res = await fetch(DATA_URL,{cache:"no-store"});
    if(!res.ok) throw new Error();
    return await res.json();
  }catch{
    try{
      const res2 = await fetch(LOCAL_FALLBACK);
      if(!res2.ok) throw new Error();
      return await res2.json();
    }catch{
      return [];
    }
  }
}

/* refs */
const resultsEl=document.getElementById('results');
const searchEl=document.getElementById('search');
const gridEl=document.getElementById('grid');
const timeGutterEl=document.getElementById('time-gutter');
const cartListEl=document.getElementById('cart-list');
const refreshBtn=document.getElementById('refresh');
const clearCartBtn=document.getElementById('clear-cart');

refreshBtn.addEventListener('click',loadAndRender);
clearCartBtn.addEventListener('click',()=>{cart=[];renderCart();clearSolidEvents();});

const timeLabels=[
  '08:00 - 09:20','09:30 - 10:50','11:00 - 12:20',
  '12:30 - 13:50','14:00 - 15:20','15:30 - 16:50','17:00 - 18:20'
];
function buildTimeGutter(){
  timeGutterEl.innerHTML='';
  timeLabels.forEach(lbl=>{
    const d=document.createElement('div');
    d.className='time-slot';d.textContent=lbl;
    timeGutterEl.appendChild(d);
  });
  gridEl.innerHTML='';
  for(let i=0;i<7;i++){
    const col=document.createElement('div');
    col.style.position='relative';
    col.className='grid-col';
    gridEl.appendChild(col);
  }
}
buildTimeGutter();

/* render results carousel */
function renderResults(list){
  resultsEl.innerHTML='';
  if(!list.length) return;

  // sort by available seats desc, then by numeric section ascending
  list.sort((a,b)=>{
    const aSeats = Math.max(0,(a.capacity||0)-(a.consumedSeat||0));
    const bSeats = Math.max(0,(b.capacity||0)-(b.consumedSeat||0));
    if(bSeats !== aSeats) return bSeats - aSeats;
    const aSec = parseInt(a.sectionName,10);
    const bSec = parseInt(b.sectionName,10);
    if(!isNaN(aSec) && !isNaN(bSec)) return aSec - bSec;
    return String(a.sectionName).localeCompare(String(b.sectionName));
  });

  list.forEach(item=>{
    const card=document.createElement('div');
    card.className='card';

    const seatsAvailable=Math.max(0,(item.capacity||0)-(item.consumedSeat||0));
    const pct=item.capacity?Math.round((seatsAvailable/item.capacity)*100):0;
    let fillClass='fill-gray';
    if(pct>=80) fillClass='fill-green';
    else if(pct>=50) fillClass='fill-yellow';
    else if(pct>=20) fillClass='fill-orange';
    else if(pct>0) fillClass='fill-red';

    const isLab=(item.sectionType||'').toUpperCase()==='LAB';
    card.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h3>${item.courseCode} — ${item.sectionName}</h3>
          <div class="meta">${item.roomName||''} · ${item.faculties||''}</div>
          <div class="tiny">${item.courseCredit} cr • ${isLab?'Lab':'Class'}</div>
        </div>
        <div class="right">
          <div class="seats" title="Seats available: ${seatsAvailable}/${item.capacity||'N/A'}">
            <div class="seat-bar"><div class="seat-fill ${fillClass}" style="width:${pct}%"></div></div>
          </div>
          <div class="tiny seat-text ${fillClass}">${seatsAvailable}/${item.capacity||0} seats</div>
        </div>
      </div>`;

    card.addEventListener('mouseenter',()=>showGhostForSection(item));
    card.addEventListener('mouseleave',()=>clearGhosts());
    card.addEventListener('click',ev=>{ev.preventDefault();tryToggleAdd(item);});
    resultsEl.appendChild(card);
  });
}

/* timetable blocks */
function showGhostForSection(section){
  clearGhosts();
  const blocks=getEventBlocksForSection(section);
  const conflict=blocks.some(b=>isConflictWithCartBlock(b));
  blocks.forEach(b=>{
    const dom=createEventDom(b,true,conflict);
    gridEl.appendChild(dom);
    mountedGhosts.push(dom);
  });
}
function clearGhosts(){mountedGhosts.forEach(n=>n.remove());mountedGhosts=[];}
function createEventDom(block,ghost=false,conflict=false){
  const dayIndex=block.dayIndex;
  const colLeft=(dayIndex/7)*100;
  const colWidthPct=(1/7)*100;
  const topPct=minutesToPercent(block.startMin);
  const bottomPct=minutesToPercent(block.endMin);
  const heightPct=bottomPct-topPct;
  const el=document.createElement('div');
  el.className='event-block';
  el.style.top=topPct+'%';
  el.style.height=heightPct+'%';
  el.style.left=`calc(${colLeft}% + 8px)`;
  el.style.width=`calc(${colWidthPct}% - 16px)`;
  el.dataset.sectionId=block.sectionId;
  if(block.isLab) el.classList.add('event-lab'); else el.classList.add('event-class');
  if(ghost) el.classList.add('event-ghost');
  if(conflict) el.classList.add('event-conflict');
  if(block.solid) el.classList.add('event-solid');
  el.innerHTML=`<div class="event-title">${block.title}</div>
                <div class="event-meta">${block.meta}</div>`;
  return el;
}
function getEventBlocksForSection(section){
  const blocks=[];
  const baseTitle=`${section.courseCode} ${section.sectionName}`;
  const metaRoom=section.roomName||'';
  const cs=(section.sectionSchedule&&section.sectionSchedule.classSchedules)||[];
  cs.forEach(sch=>{
    const startMin=timeToMinutes(sch.startTime);
    const endMin=timeToMinutes(sch.endTime);
    const dayIndex=DAY_ORDER.indexOf(sch.day);
    if(dayIndex<0)return;
    blocks.push({dayIndex,startMin,endMin,
      title:baseTitle,meta:`${metaRoom}`,
      isLab:false,sectionId:section.sectionId,section});
  });
  const ls=(section.labSchedules)||[];
  ls.forEach(sch=>{
    const startMin=timeToMinutes(sch.startTime);
    const endMin=timeToMinutes(sch.endTime);
    const dayIndex=DAY_ORDER.indexOf(sch.day);
    if(dayIndex<0)return;
    blocks.push({dayIndex,startMin,endMin,
      title:baseTitle+' (Lab)',meta:`${section.labRoomName||''}`,
      isLab:true,sectionId:section.sectionId,section});
  });
  return blocks;
}

/* conflicts */
function isConflictWithCartBlock(block){
  for(const c of cart){
    const cblocks=getEventBlocksForSection(c);
    for(const cb of cblocks){
      if(cb.dayIndex!==block.dayIndex) continue;
      if(timesOverlap(cb.startMin,cb.endMin,block.startMin,block.endMin)) return true;
    }
  }
  return false;
}
function timesOverlap(s1,e1,s2,e2){return Math.max(s1,s2)<Math.min(e1,e2);}
function tryToggleAdd(section){
  const idx=cart.findIndex(c=>c.sectionId===section.sectionId);
  if(idx>=0){cart.splice(idx,1);renderCart();clearSolidEvents();drawSolidEvents();return;}
  const examConflict=checkExamConflict(section);
  if(examConflict){alert('Exam clash: '+examConflict);return;}
  const blocks=getEventBlocksForSection(section);
  const hasConflict=blocks.some(b=>isConflictWithCartBlock(b));
  if(hasConflict){alert('Time clash: cannot add.');return;}
  cart.push(section);renderCart();drawSolidEvents();
}
function checkExamConflict(candidate){
  const cExamDate=candidate.sectionSchedule&&candidate.sectionSchedule.finalExamDate;
  const cStart=candidate.sectionSchedule&&candidate.sectionSchedule.finalExamStartTime;
  const cEnd=candidate.sectionSchedule&&candidate.sectionSchedule.finalExamEndTime;
  if(!cExamDate) return null;
  for(const other of cart){
    const oDate=other.sectionSchedule&&other.sectionSchedule.finalExamDate;
    const oStart=other.sectionSchedule&&other.sectionSchedule.finalExamStartTime;
    const oEnd=other.sectionSchedule&&other.sectionSchedule.finalExamEndTime;
    if(!oDate) continue;
    if(oDate===cExamDate){
      const s1=timeToMinutes(cStart),e1=timeToMinutes(cEnd);
      const s2=timeToMinutes(oStart),e2=timeToMinutes(oEnd);
      if(timesOverlap(s1,e1,s2,e2)) return `${candidate.courseCode} ${candidate.sectionName} vs ${other.courseCode} ${other.sectionName} on ${cExamDate}`;
    }
  }
  return null;
}

/* cart rendering */
function renderCart(){
  cartListEl.innerHTML='';
  if(!cart.length){
    cartListEl.innerHTML='<div class="tiny">Cart empty</div>';
    saveCart();
    return;
  }
  cart.forEach(s=>{
    const midDate = s.sectionSchedule?.midExamDate || '';
    const midStart = s.sectionSchedule?.midExamStartTime || '';
    const midEnd = s.sectionSchedule?.midExamEndTime || '';
    const finalDate = s.sectionSchedule?.finalExamDate || '';
    const finalStart = s.sectionSchedule?.finalExamStartTime || '';
    const finalEnd = s.sectionSchedule?.finalExamEndTime || '';

    const item=document.createElement('div');
    item.className='cart-item';
    item.innerHTML=`<div>
        <div style="font-weight:700">${s.courseCode} — ${s.sectionName} ${s.sectionType==='LAB'?'(Lab)':''}</div>
        <div class="tiny">Faculty: ${s.faculties||''}</div>
        <div class="tiny">Midterm: ${midDate? midDate+' '+midStart+'-'+midEnd : 'N/A'}</div>
        <div class="tiny">Final: ${finalDate? finalDate+' '+finalStart+'-'+finalEnd : 'N/A'}</div>
      </div>
      <div><button class="btn small" data-sectionid="${s.sectionId}">Remove</button></div>`;

    item.querySelector('button').addEventListener('click',()=>{
      cart=cart.filter(x=>x.sectionId!==s.sectionId);
      renderCart();clearSolidEvents();drawSolidEvents();
    });
    cartListEl.appendChild(item);
  });
  saveCart();
}

function drawSolidEvents(){
  clearSolidEvents();
  cart.forEach(section=>{
    const blocks=getEventBlocksForSection(section);
    blocks.forEach(b=>{b.solid=true;const el=createEventDom(b,false,false);el.classList.add('event-solid');gridEl.appendChild(el);});
  });
}
function clearSolidEvents(){Array.from(gridEl.querySelectorAll('.event-solid')).forEach(n=>n.remove());}

/* search */
function filterData(q){
  if(!q) return [];
  q=q.trim().toLowerCase();
  return rawData.filter(item=>{
    const code=(item.courseCode||'').toLowerCase();
    const faculties=(item.faculties||'').toLowerCase();
    const sec=(String(item.sectionName)||'').toLowerCase();
    return code.includes(q)||faculties.includes(q)||sec.includes(q);
  });
}
let searchTimeout=null;
searchEl.addEventListener('input',()=>{
  if(searchTimeout) clearTimeout(searchTimeout);
  searchTimeout=setTimeout(()=>{
    const list=filterData(searchEl.value);
    renderResults(list);
  },180);
});

/* --- Cart persistence helpers --- */
function saveCart(){
  localStorage.setItem('courseCart', JSON.stringify(cart));
}
function loadCart(){
  try{
    const saved=localStorage.getItem('courseCart');
    if(saved) cart=JSON.parse(saved);
  }catch{ cart=[]; }
}

/* load */
async function loadAndRender(){
  rawData=await fetchData();
  loadCart();
  renderResults([]);
  renderCart();clearSolidEvents();drawSolidEvents();
}
setInterval(async()=>{
  const data=await fetchData();
  rawData=data;
  if(searchEl.value.trim()) renderResults(filterData(searchEl.value));
},POLL_INTERVAL);
loadAndRender();

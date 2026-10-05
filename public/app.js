import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.91.0/+esm";

const SUPABASE_URL = window.PIXEL_PLAZA_CONFIG?.supabaseUrl || "";
const SUPABASE_KEY = window.PIXEL_PLAZA_CONFIG?.supabasePublishableKey || "";

const $ = id => document.getElementById(id);
const login = $("login");
const nameForm = $("nameForm");
const nameInput = $("nameInput");
const nameError = $("nameError");
const world = $("world");
const scene = $("scene");
const playersEl = $("players");
const onlineList = $("onlineList");
const onlineCount = $("onlineCount");
const statusText = $("statusText");
const statusDot = $("statusDot");
const chatTitle = $("chatTitle");
const globalButton = $("globalButton");
const messageForm = $("messageForm");
const messageInput = $("messageInput");
const messagesEl = $("messages");
const coordsEl = $("coords");
const floorEl = $("floorLabel");
const teleportForm = $("teleportForm");
const tpX = $("tpX");
const tpY = $("tpY");
const tpFloor = $("tpFloor");
const avatarInput = $("avatarInput");
const avatarPreview = $("avatarPreview");
const clearAvatarBtn = $("clearAvatarBtn");
const stairsHint = $("stairsHint");

let supabase = null;
let channel = null;
let username = "";
let clientId = crypto.randomUUID();
let targetUser = null;
let myX = 0, myY = 0, myFloor = 1;
let moving = false;
let lastMoveSent = 0;
let cameraX = 0, cameraY = 0;
const keys = new Set();
const remotePlayers = new Map();
const chunkEls = new Map();
const TILE = 48;
const CHUNK = 12;
const MOVE_SPEED = 0.11;
let avatarData = "";
let appearance = randomAppearance();

function randomAppearance(){
  const skins = ["#f2c19a","#d89b72","#9a5c36","#6e4229","#f4d0ae"];
  const hairs = ["#24180f","#4b2c1b","#111827","#8a4f22","#d5a15d"];
  const shirts = ["#5b7cfa","#ff6b6b","#42b883","#9b6cff","#f0a44b"];
  return {
    skin: skins[Math.floor(Math.random()*skins.length)],
    hair: hairs[Math.floor(Math.random()*hairs.length)],
    shirt: shirts[Math.floor(Math.random()*shirts.length)]
  };
}

function setStatus(text, ok=false){
  statusText.textContent = text;
  statusDot.style.background = ok ? "#60cf78" : "#e2a83b";
}

function validConfig(){
  if(!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_KEY.includes("PASTE_YOUR")){
    nameError.textContent = "Add your Supabase URL and publishable key in public/config.js first.";
    return false;
  }
  return true;
}

function addMessage(from, body, mine=false, privateMsg=false){
  const row = document.createElement("div");
  row.className = "msg" + (mine ? " mine" : "");
  const who = document.createElement("div");
  who.className = "who";
  who.textContent = privateMsg ? `${from} → ${targetUser || "you"}` : from;
  const text = document.createElement("div");
  text.textContent = body;
  row.append(who,text);
  messagesEl.append(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function clearMessages(){ messagesEl.replaceChildren(); }

function makePlayerEl(p, me=false){
  const el = document.createElement("div");
  el.className = "player" + (me ? " me" : "");
  el.dataset.name = p.name;
  el.innerHTML = `
    <div class="avatar"><div class="avatar-image"></div><div class="cartoon"><div class="hair"></div><div class="face"><i></i><i></i><b></b></div><div class="shirt"></div><div class="arm a1"></div><div class="arm a2"></div><div class="leg l1"></div><div class="leg l2"></div></div></div>
    <div class="name"></div>`;
  el.querySelector(".name").textContent = p.name;
  applyAvatar(el,p);
  el.addEventListener("click", () => { if(!me) openDM(p.name); });
  return el;
}

function applyAvatar(el,p){
  const image = el.querySelector(".avatar-image");
  const cartoon = el.querySelector(".cartoon");
  if(p.avatar){
    image.style.backgroundImage = `url(${JSON.stringify(p.avatar).slice(1,-1)})`;
    image.classList.add("has-image");
    cartoon.style.display = "none";
  }else{
    image.style.backgroundImage = "none";
    image.classList.remove("has-image");
    cartoon.style.display = "block";
    el.querySelector(".face").style.setProperty("--skin",p.skin || appearance.skin);
    el.querySelector(".hair").style.setProperty("--hair",p.hair || appearance.hair);
    el.querySelector(".shirt").style.setProperty("--shirt",p.shirt || appearance.shirt);
  }
}

function placeEl(el,x,y){
  // Players live in scene/world coordinates. The scene itself is moved by the camera.
  el.style.left = `${x * TILE}px`;
  el.style.top = `${y * TILE}px`;
  el.style.display = "";
}

function drawMe(){
  if(!window.myEl) return;
  placeEl(window.myEl,myX,myY);
  window.myEl.classList.toggle("walk", moving);
}

function updateRemote(p){
  if(p.floor !== myFloor) return hideRemote(p.name);
  let el = remotePlayers.get(p.name);
  if(!el){
    el = makePlayerEl(p);
    remotePlayers.set(p.name,el);
    playersEl.append(el);
  }
  applyAvatar(el,p);
  placeEl(el,Number(p.x)||0,Number(p.y)||0);
  el.classList.toggle("walk",!!p.moving);
}

function hideRemote(name){
  const el = remotePlayers.get(name);
  if(el) el.style.display = "none";
}

function removeRemote(name){
  const el = remotePlayers.get(name);
  if(el) el.remove();
  remotePlayers.delete(name);
}

function renderOnline(state){
  const users = Object.values(state).flat().filter(Boolean);
  const unique = new Map();
  users.forEach(p => { if(p?.name) unique.set(p.name,p); });
  unique.set(username,{name:username,x:myX,y:myY,floor:myFloor,...appearance,avatar:avatarData});
  onlineCount.textContent = unique.size;
  onlineList.replaceChildren();
  for(const [name,p] of unique){
    const row = document.createElement("div");
    row.className = "online-row";
    const dot = document.createElement("span"); dot.className = "dot";
    const label = document.createElement("span"); label.textContent = name + (name===username ? " (you)" : "");
    row.append(dot,label);
    if(name !== username) row.addEventListener("click",()=>openDM(name));
    onlineList.append(row);
    if(name !== username) updateRemote(p);
  }
  for(const [name] of remotePlayers){ if(!unique.has(name)) removeRemote(name); }
}

async function openDM(name){
  targetUser=name;
  chatTitle.textContent=`✉️ DM: ${name}`;
  globalButton.classList.remove("hidden");
  clearMessages();
  messageInput.placeholder=`Message ${name}…`;
  const {data} = await supabase.from("direct_messages").select("*")
    .or(`and(sender.eq.${username},recipient.eq.${name}),and(sender.eq.${name},recipient.eq.${username})`)
    .order("created_at",{ascending:true}).limit(80);
  (data||[]).forEach(m=>addMessage(m.sender,m.body,m.sender===username,true));
}

async function openGlobal(){
  targetUser=null;
  chatTitle.textContent="💬 Global chat";
  globalButton.classList.add("hidden");
  messageInput.placeholder="Say something…";
  clearMessages();
  const {data} = await supabase.from("chat_messages").select("*").order("created_at",{ascending:true}).limit(80);
  (data||[]).forEach(m=>addMessage(m.username,m.body,m.username===username,false));
}

async function sendMessage(body){
  body=body.trim();
  if(!body || !channel) return;
  if(targetUser){
    const {error}=await supabase.from("direct_messages").insert({sender:username,recipient:targetUser,body:body.slice(0,300)});
    if(!error){ addMessage(username,body,true,true); await channel.send({type:"broadcast",event:"dm",payload:{from:username,to:targetUser,body:body.slice(0,300)}}); }
  }else{
    const {error}=await supabase.from("chat_messages").insert({username,body:body.slice(0,300)});
    if(!error){ addMessage(username,body,true,false); await channel.send({type:"broadcast",event:"global-chat",payload:{name:username,body:body.slice(0,300)}}); }
  }
  messageInput.value="";
}

async function reserveName(name){
  if(!validConfig()) return;
  const normalized=name.trim().replace(/\s+/g," ");
  if(!/^[A-Za-z0-9_ -]{2,18}$/.test(normalized)){
    nameError.textContent="Use 2–18 letters, numbers, spaces, _ or - only."; return;
  }
  nameError.textContent="Checking name…";
  supabase=createClient(SUPABASE_URL,SUPABASE_KEY);
  const {data,error}=await supabase.rpc("reserve_username",{requested_username:normalized,requested_client_id:clientId});
  if(error || !data?.ok){ nameError.textContent=data?.error||error?.message||"Could not reserve that name."; return; }
  username=data.username;
  login.style.display="none";
  await connect();
}

async function connect(){
  setStatus("Connecting…");
  channel=supabase.channel("pixel-plaza-v2",{config:{presence:{key:clientId},broadcast:{self:false}}});
  channel
    .on("presence",{event:"sync"},()=>renderOnline(channel.presenceState()))
    .on("presence",{event:"join"},()=>renderOnline(channel.presenceState()))
    .on("presence",{event:"leave"},()=>renderOnline(channel.presenceState()))
    .on("broadcast",{event:"state"},({payload})=>{ if(payload.name!==username) updateRemote(payload); })
    .on("broadcast",{event:"global-chat"},({payload})=>{ if(payload.name!==username) addMessage(payload.name,payload.body,false,false); })
    .on("broadcast",{event:"dm"},({payload})=>{ if(payload.to===username) addMessage(payload.from,payload.body,false,true); });

  channel.subscribe(async status=>{
    if(status==="SUBSCRIBED"){
      setStatus("Online",true);
      window.myEl=makePlayerEl({name:username,...appearance,avatar:avatarData},true);
      playersEl.append(window.myEl);
      drawMe();
      await channel.track({name:username,x:myX,y:myY,floor:myFloor,...appearance});
      await broadcastMove(true);
      await openGlobal();
      renderWorld();
      updateCamera();
    }else if(status==="CHANNEL_ERROR") setStatus("Connection error");
  });
}

async function broadcastMove(force=false){
  if(!channel) return;
  const now=performance.now();
  if(!force && now-lastMoveSent<120) return;
  lastMoveSent=now;
  const payload={name:username,x:myX,y:myY,floor:myFloor,moving,...appearance,avatar:avatarData};
  await channel.send({type:"broadcast",event:"state",payload});
}


function chunkKey(cx,cy,floor){ return `${floor}:${cx}:${cy}`; }
function roomType(cx,cy){
  const n=Math.abs((cx*928371+cy*1237)%7);
  return n;
}

function makeChunk(cx,cy,floor){
  const key=chunkKey(cx,cy,floor);
  if(chunkEls.has(key)) return;
  const wrap=document.createElement("div");
  wrap.className="chunk";
  wrap.style.left=`${cx*CHUNK*TILE}px`;
  wrap.style.top=`${cy*CHUNK*TILE}px`;
  wrap.style.width=`${CHUNK*TILE}px`;
  wrap.style.height=`${CHUNK*TILE}px`;
  const room=roomType(cx,cy);
  const roomX=1, roomY=1, roomW=10, roomH=10;
  const wall=document.createElement("div"); wall.className="room-shell";
  wall.style.left=`${roomX*TILE}px`; wall.style.top=`${roomY*TILE}px`; wall.style.width=`${roomW*TILE}px`; wall.style.height=`${roomH*TILE}px`;
  const label=document.createElement("div"); label.className="room-label"; label.textContent=floor===2?`ROOM ${Math.abs(cx)+1}-${Math.abs(cy)+1}`:`ROOM ${Math.abs(cx)+1}-${Math.abs(cy)+1}`;
  wall.append(label);
  const door=document.createElement("div"); door.className="door";
  const side=room%4;
  if(side===0){door.style.left=`${5*TILE}px`;door.style.bottom="-8px";}
  if(side===1){door.style.right="-8px";door.style.top=`${5*TILE}px`;}
  if(side===2){door.style.left=`${5*TILE}px`;door.style.top="-8px";}
  if(side===3){door.style.left="-8px";door.style.top=`${5*TILE}px`;}
  wall.append(door);
  if(room%3===0){
    const desk=document.createElement("div"); desk.className="room-furniture desk"; desk.style.left=`${2*TILE}px`;desk.style.top=`${3*TILE}px`; wall.append(desk);
    const desk2=document.createElement("div"); desk2.className="room-furniture sofa"; desk2.style.right=`${1.5*TILE}px`;desk2.style.bottom=`${2*TILE}px`; wall.append(desk2);
  }else if(room%3===1){
    const rug=document.createElement("div"); rug.className="room-furniture rug"; rug.style.left=`${2*TILE}px`;rug.style.top=`${2.5*TILE}px`;wall.append(rug);
  }else{
    for(let i=0;i<3;i++){const box=document.createElement("div");box.className="room-furniture box";box.style.left=`${(2+i*2)*TILE}px`;box.style.bottom=`${2*TILE}px`;wall.append(box);}
  }
  wrap.append(wall);
  if(cx===0 && cy===0){
    const stairs=document.createElement("div"); stairs.className="stairs"; stairs.textContent=floor===1?"STAIRS ↑":"STAIRS ↓"; stairs.style.left=`${6*TILE}px`;stairs.style.top=`${6*TILE}px`;wrap.append(stairs);
  }
  scene.append(wrap); chunkEls.set(key,wrap);
}

function renderWorld(){
  const radius=2;
  const cx=Math.floor(myX/CHUNK), cy=Math.floor(myY/CHUNK);
  for(let y=cy-radius;y<=cy+radius;y++) for(let x=cx-radius;x<=cx+radius;x++) makeChunk(x,y,myFloor);
  for(const [key,el] of chunkEls){
    const [f,x,y]=key.split(":").map(Number);
    if(f!==myFloor || Math.abs(x-cx)>radius+1 || Math.abs(y-cy)>radius+1){el.remove();chunkEls.delete(key);}
  }
}

function updateCamera(){
  cameraX=myX; cameraY=myY;
  scene.style.transform=`translate(${world.clientWidth/2-cameraX*TILE}px,${world.clientHeight/2-cameraY*TILE}px)`;
  drawMe();
  for(const [name,el] of remotePlayers){
    const p=channel?.presenceState();
    const entries=Object.values(p||{}).flat().find(v=>v?.name===name);
    if(entries) updateRemote(entries);
  }
  coordsEl.textContent=`X ${Math.round(myX*10)/10}  Y ${Math.round(myY*10)/10}`;
  floorEl.textContent=`Floor ${myFloor}`;
  stairsHint.textContent=(myFloor===1 && Math.abs(myX-6)<2 && Math.abs(myY-6)<2)?"You are at the main stairs. Press E to go up.":(myFloor===2?"Press Q to return to floor 1 from the stairs.":"");
}

function moveLoop(){
  let dx=0,dy=0;
  if(keys.has("w")||keys.has("arrowup"))dy--;
  if(keys.has("s")||keys.has("arrowdown"))dy++;
  if(keys.has("a")||keys.has("arrowleft"))dx--;
  if(keys.has("d")||keys.has("arrowright"))dx++;
  moving=!!(dx||dy);
  if(moving){
    const len=Math.hypot(dx,dy);
    myX+=dx/len*MOVE_SPEED; myY+=dy/len*MOVE_SPEED;
    drawMe(); renderWorld(); updateCamera(); broadcastMove();
  }else{
    drawMe(); updateCamera();
  }
  requestAnimationFrame(moveLoop);
}

function teleport(){
  const x=Number(tpX.value), y=Number(tpY.value), f=Number(tpFloor.value);
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(f)||Math.abs(x)>1000000||Math.abs(y)>1000000||(f!==1&&f!==2)) return;
  myX=x; myY=y; myFloor=f; renderWorld(); updateCamera(); broadcastMove(true);
}

async function handleAvatar(file){
  if(!file) return;
  if(!file.type.startsWith("image/")){nameError.textContent="Choose a PNG, JPG, GIF or WEBP image.";return;}
  if(file.size>100*1024){nameError.textContent="Avatar must be 100 KB or smaller so multiplayer stays fast.";return;}
  const reader=new FileReader();
  reader.onload=()=>{
    avatarData=String(reader.result);
    avatarPreview.style.backgroundImage=`url(${JSON.stringify(avatarData).slice(1,-1)})`;
    avatarPreview.classList.add("has-image");
    if(window.myEl) { applyAvatar(window.myEl,{...appearance,avatar:avatarData}); broadcastMove(true); }
  };
  reader.readAsDataURL(file);
}

nameForm.addEventListener("submit",e=>{e.preventDefault();reserveName(nameInput.value)});
messageForm.addEventListener("submit",e=>{e.preventDefault();sendMessage(messageInput.value)});
globalButton.addEventListener("click",openGlobal);
teleportForm.addEventListener("submit",e=>{e.preventDefault();teleport()});
avatarInput.addEventListener("change",e=>handleAvatar(e.target.files?.[0]));
clearAvatarBtn.addEventListener("click",()=>{avatarData="";avatarPreview.classList.remove("has-image");avatarPreview.style.backgroundImage="none";if(window.myEl){applyAvatar(window.myEl,{...appearance,avatar:""});broadcastMove(true);}});

window.addEventListener("keydown",e=>{
  if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) return;
  const k=e.key.toLowerCase();
  if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"].includes(k)){keys.add(k);e.preventDefault();}
  if(k==="e" && myFloor===1 && Math.abs(myX-6)<2 && Math.abs(myY-6)<2){myFloor=2;renderWorld();updateCamera();broadcastMove(true);}
  if(k==="q" && myFloor===2 && Math.abs(myX-6)<2 && Math.abs(myY-6)<2){myFloor=1;renderWorld();updateCamera();broadcastMove(true);}
});
window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));

document.querySelectorAll("[data-key]").forEach(btn=>{
  const map={up:"arrowup",down:"arrowdown",left:"arrowleft",right:"arrowright"};
  const k=map[btn.dataset.key];
  const down=e=>{e.preventDefault();keys.add(k)};
  const up=e=>{e.preventDefault();keys.delete(k)};
  btn.addEventListener("pointerdown",down);btn.addEventListener("pointerup",up);btn.addEventListener("pointercancel",up);btn.addEventListener("pointerleave",up);
});

window.addEventListener("beforeunload",()=>{
  if(supabase && username) supabase.rpc("release_username",{requested_username:username,requested_client_id:clientId});
});

if(SUPABASE_URL && SUPABASE_KEY && !SUPABASE_KEY.includes("PASTE_YOUR")) nameInput.focus();
else nameError.textContent="Supabase is not configured yet. See README.md.";
renderWorld();
moveLoop();

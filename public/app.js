import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.91.0/+esm";

const SUPABASE_URL = window.PIXEL_PLAZA_CONFIG?.supabaseUrl || "";
const SUPABASE_KEY = window.PIXEL_PLAZA_CONFIG?.supabasePublishableKey || "";

const $ = id => document.getElementById(id);
const login = $("login");
const nameForm = $("nameForm");
const nameInput = $("nameInput");
const nameError = $("nameError");
const world = $("world");
const playersEl = $("players");
const messagesEl = $("messages");
const onlineList = $("onlineList");
const onlineCount = $("onlineCount");
const statusText = $("statusText");
const statusDot = $("statusDot");
const chatTitle = $("chatTitle");
const globalButton = $("globalButton");
const messageForm = $("messageForm");
const messageInput = $("messageInput");

let supabase = null;
let channel = null;
let username = "";
let clientId = crypto.randomUUID();
let targetUser = null;
let myX = 50, myY = 72;
let moving = false;
const keys = new Set();
const remotePlayers = new Map();

const skins = ["#f0b27a","#e6a879","#8d5524","#c68642","#ffdbac"];
const hairs = ["#382b1f","#17202a","#7b3f00","#e0c07b","#633d2d"];
const shirts = ["#e76f51","#457b9d","#6a994e","#9b5de5","#f4a261"];

function setStatus(text, ok=false){
  statusText.textContent = text;
  statusDot.style.background = ok ? "#60cf78" : "#e2a83b";
}

function validConfig(){
  if(!SUPABASE_URL || !SUPABASE_KEY){
    nameError.textContent = "Add your Supabase URL and publishable key in public/config.js first.";
    return false;
  }
  return true;
}

function cleanText(s){ return s.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }

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
    <div class="sprite">
      <div class="head"></div><div class="hair"></div><div class="body"></div>
      <div class="leg l1"></div><div class="leg l2"></div>
    </div>
    <div class="name"></div>`;
  el.querySelector(".head").style.setProperty("--skin", p.skin || skins[0]);
  el.querySelector(".hair").style.setProperty("--hair", p.hair || hairs[0]);
  el.querySelector(".body").style.setProperty("--shirt", p.shirt || shirts[0]);
  el.querySelector(".name").textContent = p.name;
  el.addEventListener("click", () => {
    if(!me) openDM(p.name);
  });
  return el;
}

function drawMe(){
  if(!window.myEl) return;
  window.myEl.style.left = `${myX}%`;
  window.myEl.style.top = `${myY}%`;
  window.myEl.classList.toggle("walk", moving);
}

function updateRemote(p){
  let el = remotePlayers.get(p.name);
  if(!el){
    el = makePlayerEl(p);
    remotePlayers.set(p.name, el);
    playersEl.append(el);
  }
  el.style.left = `${p.x}%`;
  el.style.top = `${p.y}%`;
  el.classList.toggle("walk", !!p.moving);
}

function removeRemote(name){
  const el = remotePlayers.get(name);
  if(el) el.remove();
  remotePlayers.delete(name);
}

function renderOnline(state){
  const users = Object.values(state).flat().map(x => x);
  const unique = new Map();
  users.forEach(p => { if(p?.name) unique.set(p.name,p); });
  unique.set(username, {name:username});
  onlineCount.textContent = unique.size;
  onlineList.replaceChildren();
  for(const [name,p] of unique){
    const row = document.createElement("div");
    row.className = "online-row";
    row.innerHTML = `<span class="dot"></span><span></span>`;
    row.lastChild.textContent = name + (name === username ? " (you)" : "");
    if(name !== username) row.addEventListener("click", () => openDM(name));
    onlineList.append(row);
    if(name !== username) updateRemote(p);
  }
  for(const [name] of remotePlayers){
    if(!unique.has(name)) removeRemote(name);
  }
}

async function openDM(name){
  targetUser = name;
  chatTitle.textContent = `✉️ DM: ${name}`;
  globalButton.classList.remove("hidden");
  clearMessages();
  messageInput.placeholder = `Message ${name}…`;
  const {data} = await supabase
    .from("direct_messages")
    .select("*")
    .or(`and(sender.eq.${username},recipient.eq.${name}),and(sender.eq.${name},recipient.eq.${username})`)
    .order("created_at",{ascending:true})
    .limit(80);
  (data || []).forEach(m => addMessage(m.sender,m.body,m.sender===username,true));
}

async function openGlobal(){
  targetUser = null;
  chatTitle.textContent = "💬 Global chat";
  globalButton.classList.add("hidden");
  messageInput.placeholder = "Say something…";
  clearMessages();
  const {data} = await supabase.from("chat_messages").select("*").order("created_at",{ascending:true}).limit(80);
  (data || []).forEach(m => addMessage(m.username,m.body,m.username===username,false));
}

async function sendMessage(body){
  body = body.trim();
  if(!body || !channel) return;
  if(targetUser){
    const {error} = await supabase.from("direct_messages").insert({
      sender:username, recipient:targetUser, body:body.slice(0,300)
    });
    if(!error) addMessage(username,body,true,true);
  }else{
    const {error} = await supabase.from("chat_messages").insert({
      username, body:body.slice(0,300)
    });
    if(!error) addMessage(username,body,true,false);
  }
  messageInput.value = "";
}

async function reserveName(name){
  if(!validConfig()) return;
  const normalized = name.trim().replace(/\s+/g," ");
  if(!/^[A-Za-z0-9_ -]{2,18}$/.test(normalized)){
    nameError.textContent = "Use 2–18 letters, numbers, spaces, _ or - only.";
    return;
  }
  nameError.textContent = "Checking name…";
  supabase = createClient(SUPABASE_URL,SUPABASE_KEY);
  const {data,error} = await supabase.rpc("reserve_username",{
    requested_username:normalized,
    requested_client_id:clientId
  });
  if(error || !data?.ok){
    nameError.textContent = data?.error || error?.message || "Could not reserve that name.";
    return;
  }
  username = data.username;
  login.style.display = "none";
  await connect();
}

async function connect(){
  setStatus("Connecting…");
  channel = supabase.channel("pixel-plaza",{
    config:{presence:{key:clientId},broadcast:{self:false}}
  });

  channel
    .on("presence",{event:"sync"},()=>renderOnline(channel.presenceState()))
    .on("presence",{event:"join"},()=>renderOnline(channel.presenceState()))
    .on("presence",{event:"leave"},()=>renderOnline(channel.presenceState()))
    .on("broadcast",{event:"move"},({payload})=>{
      if(payload.name !== username) updateRemote(payload);
    })
    .on("broadcast",{event:"global-chat"},({payload})=>{
      if(payload.name !== username) addMessage(payload.name,payload.body,false,false);
    })
    .on("broadcast",{event:"dm"},({payload})=>{
      if(payload.to === username) addMessage(payload.from,payload.body,false,true);
    });

  channel.subscribe(async status=>{
    if(status === "SUBSCRIBED"){
      setStatus("Online",true);
      window.myEl = makePlayerEl({
        name:username,skin:skins[Math.floor(Math.random()*skins.length)],
        hair:hairs[Math.floor(Math.random()*hairs.length)],
        shirt:shirts[Math.floor(Math.random()*shirts.length)]
      },true);
      window.myAppearance = {
        skin:window.myEl.querySelector(".head").style.getPropertyValue("--skin"),
        hair:window.myEl.querySelector(".hair").style.getPropertyValue("--hair"),
        shirt:window.myEl.querySelector(".body").style.getPropertyValue("--shirt")
      };
      playersEl.append(window.myEl);
      drawMe();
      await channel.track({
        name:username,x:myX,y:myY,moving:false,...window.myAppearance
      });
      await openGlobal();
    }else if(status === "CHANNEL_ERROR"){
      setStatus("Connection error");
    }
  });
}

async function broadcastMove(){
  if(!channel) return;
  await channel.track({
    name:username,x:myX,y:myY,moving,...window.myAppearance
  });
  await channel.send({
    type:"broadcast",event:"move",
    payload:{name:username,x:myX,y:myY,moving,...window.myAppearance}
  });
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
    myX=Math.max(5,Math.min(95,myX+dx/len*0.55));
    myY=Math.max(51,Math.min(94,myY+dy/len*0.55));
    drawMe();
    broadcastMove();
  }else drawMe();
  requestAnimationFrame(moveLoop);
}

nameForm.addEventListener("submit",e=>{e.preventDefault();reserveName(nameInput.value)});
messageForm.addEventListener("submit",e=>{e.preventDefault();sendMessage(messageInput.value)});
globalButton.addEventListener("click",openGlobal);

window.addEventListener("keydown",e=>{
  if(["INPUT","TEXTAREA"].includes(document.activeElement.tagName))return;
  const k=e.key.toLowerCase();
  if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"].includes(k)){
    keys.add(k); e.preventDefault();
  }
});
window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));

document.querySelectorAll("[data-key]").forEach(btn=>{
  const map={up:"arrowup",down:"arrowdown",left:"arrowleft",right:"arrowright"};
  const k=map[btn.dataset.key];
  const down=e=>{e.preventDefault();keys.add(k)};
  const up=e=>{e.preventDefault();keys.delete(k)};
  btn.addEventListener("pointerdown",down);
  btn.addEventListener("pointerup",up);
  btn.addEventListener("pointercancel",up);
  btn.addEventListener("pointerleave",up);
});

window.addEventListener("beforeunload",()=>{
  if(supabase && username){
    supabase.rpc("release_username",{
      requested_username:username,requested_client_id:clientId
    });
  }
});

if(SUPABASE_URL && SUPABASE_KEY){
  nameInput.focus();
}else{
  nameError.textContent="Supabase is not configured yet. See README.md.";
}
moveLoop();

// ===== 0. Service worker =====
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}

// ===== 1. Grab elements (must be first) =====
const chat = document.getElementById("chat");
const promptInput = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const banner = document.getElementById("offlineBanner");
const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]").value;

const history = [];   // each item: { role: "user" | "model", text: "..." }
const MAX_TURNS = 20; // keeps requests small and fast

let busy = false;

function renderMarkdown(text) {
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(text, { breaks: true }));
  }
  return null;   // libraries didn't load, so fall back to plain text
}

// ===== 2. Add a message to the chat =====
function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = role === "user" ? "You" : "RadBot · Assistant";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  msg.append(meta, bubble);
  chat.append(msg);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

// ===== 3. Online/offline status =====
function updateStatus() {
  banner.hidden = navigator.onLine;
  sendBtn.disabled = !navigator.onLine || busy;
}

// ===== 4. Send a message to the backend =====
async function sendMessage() {
  const text = promptInput.value.trim();
  if (!text || busy || !navigator.onLine) return;

  busy = true;
  updateStatus();

  addMessage("user", text);
  promptInput.value = "";

  const bubble = addMessage("assistant", "Thinking");
  bubble.classList.add("thinking");

  try {
    const res = await fetch("/api/chat/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({ prompt: text, history: history }),
    });
    const data = await res.json();

    if (res.ok) {
      const html = renderMarkdown(data.reply);
      if (html !== null) {
        bubble.innerHTML = html;
        bubble.classList.add("md");
      } else {
        bubble.textContent = data.reply;
      }
      history.push({ role: "user", text: text });
      history.push({ role: "model", text: data.reply });
      if (history.length > MAX_TURNS) history.splice(0, history.length - MAX_TURNS);
    } else {
      bubble.textContent = data.error || "Something went wrong.";
    }
  } catch (err) {
    console.error(err);
    bubble.textContent = "Couldn't reach the server. Please try again.";
  } finally {
    bubble.classList.remove("thinking");
    busy = false;
    updateStatus();
    chat.scrollTop = chat.scrollHeight;
    promptInput.focus();
  }
}

// ===== 5. Button and input events =====
sendBtn.addEventListener("click", sendMessage);

promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

clearBtn.addEventListener("click", () => {
  promptInput.value = "";
  promptInput.focus();
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    promptInput.value = chip.textContent;
    promptInput.focus();
  });
});

document.getElementById("newChatBtn").addEventListener("click", () => {
  history.length = 0;
  chat.querySelectorAll(".msg:not(:first-child)").forEach((m) => m.remove());
  promptInput.focus();
});

// ===== 6. Offline listeners + first check =====
window.addEventListener("online", updateStatus);
window.addEventListener("offline", updateStatus);
updateStatus();

// ===== 7. Weather widget =====
const cityInput = document.getElementById("cityInput");
const cityBtn = document.getElementById("cityBtn");
const weatherStatus = document.getElementById("weatherStatus");
const weatherData = document.getElementById("weatherData");
const weatherCard = document.getElementById("weather");
const weatherBtn = document.getElementById("weatherBtn");
const weatherBtnTemp = document.getElementById("weatherBtnTemp");

async function loadWeather(city) {
  weatherStatus.textContent = "Loading…";
  weatherStatus.hidden = false;
  weatherBtnTemp.textContent = `${d.temp}°C`;
  weatherData.hidden = true;

  try {
    const res = await fetch("/api/weather/?city=" + encodeURIComponent(city));
    const d = await res.json();
    if (!res.ok) {
      weatherStatus.textContent = d.error || "Couldn't load weather.";
      return;
    }

    document.getElementById("wCity").textContent = `${d.city}, ${d.country}`;
    document.getElementById("wTemp").textContent = `${d.temp}°C`;
    document.getElementById("wDesc").textContent = d.desc;
    document.getElementById("wFeels").textContent = `${d.feels}°C`;
    document.getElementById("wHumidity").textContent = `${d.humidity}%`;
    document.getElementById("wWind").textContent = `${d.wind} km/h`;
    document.getElementById("wIcon").src =
      `https://openweathermap.org/img/wn/${d.icon}@2x.png`;

    weatherStatus.hidden = true;
    weatherData.hidden = false;

    try { localStorage.setItem("radbot_city", d.city); } catch (e) {}
  } catch (err) {
    weatherStatus.textContent = "Couldn't reach the server.";
  }
}

function searchCity() {
  const city = cityInput.value.trim();
  if (city) loadWeather(city);
}

cityBtn.addEventListener("click", searchCity);
cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchCity();
});

let savedCity = "Calamba";
try { savedCity = localStorage.getItem("radbot_city") || "Calamba"; } catch (e) {}
loadWeather(savedCity);

weatherBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  weatherCard.classList.toggle("open");
});
document.addEventListener("click", (e) => {
  if (!weatherCard.contains(e.target)) weatherCard.classList.remove("open");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") weatherCard.classList.remove("open");
});

// ===== 8. Roaming Pokémon (walk-cycle sprites + dragging) =====
const pet = document.getElementById("pet");
const petBubble = document.getElementById("petBubble");
const petSprite = document.getElementById("petSprite");
const petSelect = document.getElementById("petSelect");

// name: Pokédex number
const POKEMON = {
  litten: 725,
  pikachu: 25, charmander: 4, bulbasaur: 1, squirtle: 7,
  eevee: 133, jigglypuff: 39, psyduck: 54, snorlax: 143,
};
const CRIES = {
  litten: "Nyao!",
  pikachu: "Pika pika!", charmander: "Char!", bulbasaur: "Bulba!",
  squirtle: "Squirtle!", eevee: "Vui!", jigglypuff: "Jiggly…",
  psyduck: "Psy… duck?", snorlax: "Zzz…",
};
const DEFAULT_PET = "litten";
let petName = DEFAULT_PET;

const SPRITE_BASE = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/";
const SCALE = 2;                        // how much to enlarge the pixel art
const DIR_ROW = { right: 2, left: 6 };  // checked against Litten's actual sheet
const WALK_SPEED = 45;                  // px per second on flat ground
const FLOOR = 6;                        // distance from the screen bottom to the pet's feet

let petX = 20;
let petY = FLOOR;         // height of the pet's FEET above the screen bottom
let foot = 0;             // empty pixels under the feet inside the sprite box
let ride = null;          // { el } while standing on top of an element
let petTimer = null;

let actionId = 0;         // goes up when you grab the pet, cancelling any move in progress
let dragging = false;     // true while held AND while dropping
let lastDrop = 0;         // when the pet was last let go

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const petSize = () => pet.offsetWidth || 64;

// Places the pet so its FEET (not the bottom of its box) are at height y
function setBottom(y) {
  pet.style.bottom = (y - foot) + "px";
}

// ----- Sprite sheet animation -----
let sprite = null;        // { fw, fh, durations, sheet, footPad }
let frame = 0;
let facing = "right";
let walking = false;
let animTimer = null;
let loadCount = 0;

function drawFrame() {
  if (!sprite) return;
  const x = frame * sprite.fw * SCALE;
  const y = DIR_ROW[facing] * sprite.fh * SCALE;
  petSprite.style.backgroundPosition = `-${x}px -${y}px`;
}

function tick() {
  if (!walking || !sprite) {      // resting: show the first frame
    frame = 0;
    drawFrame();
    animTimer = null;
    return;
  }
  drawFrame();
  const d = sprite.durations[frame] || 8;
  frame = (frame + 1) % sprite.durations.length;
  animTimer = setTimeout(tick, (d * 1000) / 60);   // durations are in 1/60 s
}

function setWalking(on) {
  walking = on;
  if (on && !animTimer) tick();
}

function setFacing(dir) {
  facing = dir;
  drawFrame();
}

function loadImage(url, cors) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";   // lets us read pixels to measure the padding
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Reads AnimData.xml for the frame size and count, then measures the empty space under the feet
async function loadSprite(name) {
  const id = String(POKEMON[name]).padStart(4, "0");
  const base = SPRITE_BASE + id + "/";

  const res = await fetch(base + "AnimData.xml");
  if (!res.ok) throw new Error("AnimData.xml not found for " + name);
  const doc = new DOMParser().parseFromString(await res.text(), "application/xml");

  const walk = [...doc.querySelectorAll("Anim")].find(
    (a) => a.querySelector("Name") && a.querySelector("Name").textContent.trim() === "Walk"
  );
  if (!walk) throw new Error("No Walk animation for " + name);

  const fw = parseInt(walk.querySelector("FrameWidth").textContent, 10);
  const fh = parseInt(walk.querySelector("FrameHeight").textContent, 10);
  const durations = [...walk.querySelectorAll("Duration")].map((d) => parseInt(d.textContent, 10));

  const sheet = base + "Walk-Anim.png";
  let footPad = Math.round(fh * 0.3);          // fallback guess if measuring fails

  try {
    const img = await loadImage(sheet, true);
    const c = document.createElement("canvas");
    c.width = fw;
    c.height = fh;
    const ctx = c.getContext("2d");
    let lowest = 0;
    [DIR_ROW.right, DIR_ROW.left].forEach((row) => {
      ctx.clearRect(0, 0, fw, fh);
      ctx.drawImage(img, 0, row * fh, fw, fh, 0, 0, fw, fh);   // first frame = resting pose
      const px = ctx.getImageData(0, 0, fw, fh).data;
      for (let y = fh - 1; y >= 0; y--) {
        let hit = false;
        for (let x = 0; x < fw; x++) {
          if (px[(y * fw + x) * 4 + 3] > 20) { hit = true; break; }
        }
        if (hit) { lowest = Math.max(lowest, y + 1); break; }
      }
    });
    if (lowest > 0) footPad = fh - lowest;
  } catch (err) {
    console.warn("Couldn't measure sprite padding, using a guess", err);
    await loadImage(sheet, false);               // at least make sure the image loads
  }

  return { fw, fh, durations, sheet, footPad };
}

function applySprite() {
  const { fw, fh, durations, sheet, footPad } = sprite;
  const w = fw * SCALE;
  const h = fh * SCALE;
  foot = footPad * SCALE;

  petSprite.style.display = "block";
  petSprite.style.width = w + "px";
  petSprite.style.height = h + "px";
  petSprite.style.backgroundImage = `url("${sheet}")`;
  petSprite.style.backgroundRepeat = "no-repeat";
  petSprite.style.backgroundSize = `${fw * durations.length * SCALE}px ${fh * 8 * SCALE}px`;

  pet.style.width = w + "px";      // the pet's box now matches the sprite
  pet.style.height = h + "px";
  setBottom(petY);                 // re-seat the feet with the new padding

  frame = 0;
  drawFrame();
}

function petSay(text, ms = 2000) {
  petBubble.textContent = text;
  petBubble.hidden = false;
  clearTimeout(petTimer);
  petTimer = setTimeout(() => { petBubble.hidden = true; }, ms);
}

async function setPet(name) {
  if (!POKEMON[name]) name = DEFAULT_PET;
  petName = name;
  petSelect.value = name;
  try { localStorage.setItem("radbot_pet", name); } catch (e) {}

  const mine = ++loadCount;               // ignore stale loads if the user switches fast
  try {
    const data = await loadSprite(name);
    if (mine !== loadCount) return;
    sprite = data;
    applySprite();
    petSay(CRIES[name], 1500);
  } catch (err) {
    console.error(err);
    petSay("Sprite not found", 3000);
  }
}

// ----- Movement -----
// Distance from the screen bottom to the top of an element (where the feet should stand)
function surfaceY(el) {
  return el ? window.innerHeight - el.getBoundingClientRect().top : FLOOR;
}

// Left and right limits for standing on an element (or on the floor)
function bounds(el) {
  const size = petSize();
  if (!el) return { min: 0, max: window.innerWidth - size - 10 };
  const r = el.getBoundingClientRect();
  return { min: r.left, max: Math.max(r.left, r.right - size) };
}

// Is this element still visible where the pet expects it?
function stillThere(el) {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  const minTop = el.classList.contains("weather") ? 60 : 90;
  return r.width > 60 && r.top > minTop && r.top < window.innerHeight - 80;
}

// Things the pet can stand on
function platforms() {
  return [...document.querySelectorAll(".composer, .chip, .msg .bubble, .weather")]
    .filter((el) => el !== (ride && ride.el) && stillThere(el));
}

async function walkTo(x) {
  const id = actionId;
  const b = bounds(ride ? ride.el : null);
  x = clamp(x, b.min, b.max);
  const ms = Math.max(300, (Math.abs(x - petX) / WALK_SPEED) * 1000);
  setFacing(x > petX ? "right" : "left");
  setWalking(true);
  pet.style.transition = `left ${ms}ms linear, bottom 100ms linear`;
  pet.style.left = x + "px";
  petX = x;
  await sleep(ms);
  if (id !== actionId) return;            // the user grabbed the pet meanwhile
  setWalking(false);
}

// Jump in an arc to x, landing on el (or on the floor when el is null)
function jumpTo(el, x) {
  return new Promise((resolve) => {
    const id = actionId;
    const x0 = petX;
    const y0 = petY;
    const rise = (el ? surfaceY(el) : FLOOR) - y0;
    const ms = Math.min(1100, 500 + Math.abs(x - x0) * 0.8);
    const arc = 50 + Math.max(0, rise) * 0.5;   // higher targets get a higher jump

    ride = null;
    setWalking(false);
    setFacing(x > x0 ? "right" : "left");
    pet.style.transition = "none";

    const t0 = performance.now();
    function frameStep(now) {
      if (id !== actionId) { resolve(); return; }   // grabbed mid-jump
      const t = Math.min(1, (now - t0) / ms);
      const endY = el ? surfaceY(el) : FLOOR;       // follows the platform if the chat scrolls
      pet.style.left = x0 + (x - x0) * t + "px";
      setBottom(y0 + (endY - y0) * t + 4 * arc * t * (1 - t));
      if (t < 1) {
        requestAnimationFrame(frameStep);
      } else {
        petX = x;
        petY = endY;
        ride = el ? { el } : null;
        pet.style.transition = "bottom 100ms linear";
        resolve();
      }
    }
    requestAnimationFrame(frameStep);
  });
}

// Drop straight down to the floor
async function fall() {
  ride = null;
  pet.style.transition = "bottom 500ms cubic-bezier(.5,0,1,.5), left 300ms linear";
  setBottom(FLOOR);
  petY = FLOOR;
  await sleep(500);
}

// While standing on something, ride along with it (the chat scrolls and shifts)
setInterval(() => {
  if (!ride) return;
  if (!stillThere(ride.el)) { fall(); return; }
  petY = surfaceY(ride.el);
  setBottom(petY);
}, 100);

// ----- Dragging -----
let press = null;   // { startX, startY, offX, offY, lastX, moved }

function startDrag() {
  actionId++;                         // cancels any walk or jump in progress
  dragging = true;
  ride = null;
  setWalking(false);
  const r = pet.getBoundingClientRect();   // read the position BEFORE removing the transition
  pet.style.transition = "none";
  petX = r.left;
  petY = window.innerHeight - r.bottom + foot;   // feet height at the current spot
  pet.style.left = petX + "px";
  setBottom(petY);
  pet.classList.add("dragging");
  petSay("Whee!", 1200);
}

// Let go: land on the first platform below the feet, or on the floor
async function dropPet() {
  const size = petSize();
  const cx = petX + size / 2;
  const feetY = window.innerHeight - petY;     // screen y of the pet's feet

  let target = null;
  let targetTop = Infinity;
  platforms().forEach((el) => {
    const r = el.getBoundingClientRect();
    if (cx >= r.left && cx <= r.right && r.top >= feetY - 12 && r.top < targetTop) {
      target = el;
      targetTop = r.top;
    }
  });

  const b = bounds(target);
  const x = clamp(petX, b.min, b.max);
  const endY = surfaceY(target);
  const ms = clamp(250 + Math.abs(endY - petY) * 0.6, 250, 700);

  pet.style.transition = `left 150ms ease, bottom ${ms}ms cubic-bezier(.5,0,1,.5)`;
  pet.style.left = x + "px";
  setBottom(endY);
  petX = x;
  petY = endY;
  await sleep(ms);

  ride = target ? { el: target } : null;
  pet.style.transition = "bottom 100ms linear";
  if (Math.random() < 0.6) petSay(CRIES[petName]);
}

function clickReaction() {
  pet.classList.remove("jump");
  void pet.offsetWidth;                 // restarts the animation if clicked twice
  pet.classList.add("jump");
  petSay(CRIES[petName]);
  setTimeout(() => pet.classList.remove("jump"), 500);
}

pet.addEventListener("pointerdown", (e) => {
  if (dragging || e.button !== 0) return;
  const r = pet.getBoundingClientRect();
  press = {
    startX: e.clientX, startY: e.clientY,
    offX: e.clientX - r.left, offY: e.clientY - r.top,
    lastX: e.clientX, moved: false,
  };
  pet.setPointerCapture(e.pointerId);
  e.preventDefault();
});

pet.addEventListener("pointermove", (e) => {
  if (!press) return;
  if (!press.moved) {
    if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) < 6) return;
    press.moved = true;               // moved far enough, so it's a drag, not a click
    startDrag();
  }
  const h = pet.offsetHeight;
  const left = clamp(e.clientX - press.offX, 0, window.innerWidth - petSize());
  const top = clamp(e.clientY - press.offY, 0, window.innerHeight - h + foot - FLOOR);
  petX = left;
  petY = window.innerHeight - top - h + foot;
  pet.style.left = petX + "px";
  setBottom(petY);

  if (Math.abs(e.clientX - press.lastX) > 3) {      // face the way you're dragging
    setFacing(e.clientX > press.lastX ? "right" : "left");
    press.lastX = e.clientX;
  }
});

async function endPress(e, wasClick) {
  if (!press) return;
  const p = press;
  press = null;
  try { pet.releasePointerCapture(e.pointerId); } catch (err) {}
  if (!p.moved) {
    if (wasClick) clickReaction();
    return;
  }
  pet.classList.remove("dragging");
  await dropPet();
  lastDrop = Date.now();
  dragging = false;
}
pet.addEventListener("pointerup", (e) => endPress(e, true));
pet.addEventListener("pointercancel", (e) => endPress(e, false));

// ----- Behavior loop -----
async function petLoop() {
  await sleep(1500);
  while (true) {
    // wait while you're holding the pet, and a moment after you let go
    while (dragging || Date.now() - lastDrop < 1500) await sleep(200);

    try {
      const roll = Math.random();
      const spots = platforms();

      if (roll < 0.2 && spots.length) {
        // jump onto something
        const el = spots[Math.floor(Math.random() * spots.length)];
        const b = bounds(el);
        await jumpTo(el, b.min + Math.random() * (b.max - b.min));
        if (Math.random() < 0.4) petSay(CRIES[petName]);
      } else if (roll < 0.3 && ride) {
        // hop back down to the floor
        const b = bounds(null);
        await jumpTo(null, clamp(petX, b.min, b.max));
      } else {
        // wander around (most of the time)
        const b = bounds(ride ? ride.el : null);
        await walkTo(b.min + Math.random() * (b.max - b.min));
      }
    } catch (err) {
      console.error(err);
      await fall();
    }
    await sleep(1000 + Math.random() * 2500);
  }
}

// ===== 9. Pet start-up (keep this last) =====
Object.keys(POKEMON).forEach((n) => {
  const opt = document.createElement("option");
  opt.value = n;
  opt.textContent = n;
  petSelect.append(opt);
});
petSelect.addEventListener("change", () => setPet(petSelect.value));

let savedPet = DEFAULT_PET;
try { savedPet = localStorage.getItem("radbot_pet") || DEFAULT_PET; } catch (e) {}
setPet(savedPet);

petLoop();
// Visual shell only. Chat persistence and streaming remain in app.js.
const uiIcons = {
  edit: '<path d="M14 5 19 10M4 20l5-1L21 7l-5-5L4 14v6Z"/><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  library: '<rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="3" width="4" height="18" rx="1"/><path d="m17 4 3-1 3 17-3 1Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  more: '<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
  pin: '<path d="m8 3 10 10M10 5 5 10l-2 1 10 10 1-3 5-5M9 15l-6 6"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  chat: '<path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2Z"/>',
  settings: '<path d="m9 3 1-2h4l1 2 3 2 3 1v4l-2 2v3l1 3-3 3-3-1h-3l-3 1-3-3 1-3v-3l-2-2V6l3-1Z"/><circle cx="12" cy="11" r="3"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  leaf: '<path d="M20 3C6 1 0 11 7 17s16-1 13-14ZM3 22 17 7M8 16v-6M9 16h6"/>',
  book: '<path d="M12 5C8 2 4 3 2 4v16c3-2 7-1 10 1 3-2 7-3 10-1V4c-2-1-6-2-10 1v16"/>',
  mountain: '<path d="m2 20 7-14 5 8 3-6 5 12ZM6 12l3 2 2-2"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5ZM21 2v4M19 4h4"/>'
};
function uiIcon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${uiIcons[name] || uiIcons.spark}</svg>`;
}
document.querySelectorAll('[data-icon]').forEach(element => {
  element.outerHTML = uiIcon(element.dataset.icon);
});

let uiPage = 'chat';
function uiShowPage(page) {
  if (isSending || busy) return;
  uiPage = page;
  document.querySelector('#chat-view').hidden = page !== 'chat';
  document.querySelector('#feature-view').hidden = page === 'chat';
  document.querySelectorAll('.primary-nav [data-page]').forEach(button => {
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelector('#view-label').textContent = page === 'chat' ? 'Your space, a little quieter.' : 'Asterion / ' + page[0].toUpperCase() + page.slice(1);
  if (page !== 'chat') uiFeature(page);
  uiRefreshHome();
  if (matchMedia('(max-width:680px)').matches) uiSidebar(false);
}
function uiRefreshHome() {
  const home = !messages.children.length;
  document.body.classList.toggle('is-home', uiPage === 'chat' && home);
  for (const id of ['welcome', 'suggestions', 'home-signature']) document.getElementById(id).hidden = !home;
  document.querySelectorAll('[data-page], [data-prompt]').forEach(button => {
    button.disabled = busy || isSending;
  });
}
function uiSidebar(open) {
  document.body.classList.toggle('sidebar-closed', !open);
  document.querySelector('#expand-sidebar').setAttribute('aria-expanded', String(open));
}
document.querySelector('#collapse-sidebar').addEventListener('click', () => uiSidebar(false));
document.querySelector('#expand-sidebar').addEventListener('click', () => uiSidebar(document.body.classList.contains('sidebar-closed')));
if (matchMedia('(max-width:680px)').matches) uiSidebar(false);
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => uiShowPage(button.dataset.page)));
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  if (isSending || busy || input.disabled) return;
  input.value = button.dataset.prompt;
  input.focus();
}));

// app.js dispatches this only after a conversation has successfully opened.
window.addEventListener('asterion:chat-opened', () => {
  uiPage = 'chat';
  document.querySelector('#chat-view').hidden = false;
  document.querySelector('#feature-view').hidden = true;
  document.querySelector('#view-label').textContent = 'Your space, a little quieter.';
  document.querySelectorAll('.primary-nav [data-page]').forEach(button => button.removeAttribute('aria-current'));
  uiRefreshHome();
  if (matchMedia('(max-width:680px)').matches) uiSidebar(false);
});
new MutationObserver(uiRefreshHome).observe(messages, {childList:true});
new MutationObserver(uiRefreshHome).observe(sendButton, {attributes:true, attributeFilter:['disabled']});
const hour = new Date().getHours();
document.querySelector('#greeting').textContent = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';

function uiFeature(page) {
  const content = document.querySelector('#feature-content');
  const definitions = {
    images: ['Images', 'A space for visual ideas, references, and future image creation.', 'image', 'Your imagination, in view', 'Image input and generation are not connected yet.'],
    library: ['Library', 'Your images across conversations, together in one place.', 'library', 'A home for your images', 'Once image attachments are connected, find them here, manage them, delete them, or download them again.'],
    schedule: ['Schedule', 'A place for your calendar, plans, and reminders.', 'clock'],
    plugins: ['Plugins', 'Connections that will extend what Asterion can do.', 'grid', 'More possibilities, when you choose', 'No plugins or external services are connected.'],
    more: ['More', 'Room for the ways you will use Asterion.', 'folder', 'Your space will grow with you', 'Projects, pinned conversations, and additional tools will be added here as they become available.']
  };
  const [title, description, icon, heading, note] = definitions[page];
  document.querySelector('#feature-title').textContent = title;
  document.querySelector('#feature-description').textContent = description;
  if (page === 'schedule') { uiCalendar(content); return; }
  // All strings here are static UI copy, never model or user content.
  content.innerHTML = `<span class="coming-label">Not connected yet</span>${page === 'library' ? '<div class="feature-toolbar"><input placeholder="Search your images" aria-label="Search images coming later" disabled><button disabled>Newest first</button></div>' : ''}<div class="empty-state">${uiIcon(icon)}<h2>${heading}</h2><p>${note}</p></div>`;
}
function uiCalendar(content) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const count = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const offset = (first.getDay()+6)%7;
  content.innerHTML = '<span class="coming-label">Calendar preview · Reminders are not active</span><div class="schedule-grid"><section class="calendar-panel"><h2></h2><div class="calendar-cells"></div></section><section class="agenda-panel"><h2>Upcoming</h2><p>Calendar connections and reminder creation are coming next. Nothing is scheduled from this page yet.</p><button disabled>＋ Add reminder</button></section></div>';
  content.querySelector('.calendar-panel h2').textContent = now.toLocaleDateString(undefined, {month:'long',year:'numeric'});
  const cells = content.querySelector('.calendar-cells');
  ['M','T','W','T','F','S','S'].forEach(day => {const cell=document.createElement('span');cell.className='weekday';cell.textContent=day;cells.append(cell);});
  for (let n=0;n<offset+count;n++) {
    const cell=document.createElement('span');
    if(n>=offset){const day=n-offset+1;cell.textContent=day;if(day===now.getDate()){cell.className='today';cell.setAttribute('aria-label',`Today, ${now.toLocaleDateString()}`);}}
    cells.append(cell);
  }
}

const uiSettings = document.querySelector('#settings-dialog');
document.querySelector('#open-settings').addEventListener('click', () => uiSettings.showModal());
document.querySelector('#close-settings').addEventListener('click', () => uiSettings.close());
const uiMotion = matchMedia('(prefers-reduced-motion: reduce)');
const uiVideo = document.querySelector('#ambient-video');
const uiAnimate = document.querySelector('#animate-background');
const uiFont = document.querySelector('#font-size');
let uiPrefs = {animate:true, font:'16'};
try {
  const saved = JSON.parse(localStorage.getItem('asterion.appearance') || '{}');
  if(typeof saved.animate==='boolean') uiPrefs.animate=saved.animate;
  if(['14','16','18','20'].includes(saved.font)) uiPrefs.font=saved.font;
} catch { /* Default appearance remains usable if browser storage is unavailable. */ }
function uiApplyAppearance() {
  document.documentElement.style.setProperty('--chat-size',uiPrefs.font+'px');
  uiFont.value=uiPrefs.font;
  uiAnimate.checked=uiPrefs.animate;
  const animate=uiPrefs.animate&&!uiMotion.matches;
  uiVideo.hidden=!animate;
  if(animate&&!document.hidden) uiVideo.play().catch(()=>{uiVideo.hidden=true;});
  else uiVideo.pause();
}
function uiSaveAppearance() {
  uiPrefs={animate:uiAnimate.checked,font:uiFont.value};
  uiApplyAppearance();
  try {localStorage.setItem('asterion.appearance',JSON.stringify(uiPrefs));document.querySelector('#appearance-status').textContent='Appearance saved in this browser.';}
  catch {document.querySelector('#appearance-status').textContent='Applied for this session; browser storage is unavailable.';}
}
uiVideo.addEventListener('error',()=>{uiVideo.hidden=true;});
uiAnimate.addEventListener('change',uiSaveAppearance);
uiFont.addEventListener('change',uiSaveAppearance);
uiMotion.addEventListener('change',uiApplyAppearance);
document.addEventListener('visibilitychange',uiApplyAppearance);
uiApplyAppearance();
uiRefreshHome();

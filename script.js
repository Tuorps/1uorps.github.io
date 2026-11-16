"use strict";
// One JSON schema, one renderer. No build step required.
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const PAGE_SIZE = 24;
const groups = new Map();
const viewer = $("#viewer");
let currentGroup = null;
let currentIndex = 0;
let returnFocus = null;
let videoObserver;
let visibleVideos = new Set();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const saveData = () => !!navigator.connection?.saveData;
const typeOf = media => media.type || (/\.(mp4|webm|mov)(?:[?#]|$)/i.test(media.src) ? "video" : "image");
function assetPath(value) {
  if (!value || !/^assets\/[a-zA-Z0-9_./-]+$/.test(value) || value.split("/").includes("..")) throw Error("Media must use a local assets/ path.");
  return value;
}
function mediaFor(item, alternate = false) {
  return alternate ? item.preview : {src:item.src,type:item.type,poster:item.poster,thumbnail:item.thumbnail,fit:item.fit,position:item.position,width:item.width,height:item.height};
}
// Card shape follows the asset: wide strips span the row, portraits span two rows.
// Set "layout": "standard" | "wide" | "portrait" on an item to override the automatic choice.
const WIDE_RATIO = 2.4;
const PORTRAIT_RATIO = 0.8;
const hasSize = media => media.width > 0 && media.height > 0;
function shapeOf(item) {
  if (['standard','wide','portrait'].includes(item.layout)) return item.layout;
  if (item.preview || !hasSize(item)) return 'standard';
  const ratio = item.width / item.height;
  return ratio >= WIDE_RATIO ? 'wide' : ratio <= PORTRAIT_RATIO ? 'portrait' : 'standard';
}
function mediaHtml(media, title, groupId, index, alternate = false) {
  const type = typeOf(media);
  const path = assetPath(media.thumbnail || media.src);
  const fit = media.fit === "cover" ? "cover" : "contain";
  const position = /^[\d.% a-z-]+$/i.test(media.position || "") ? media.position : "center";
  const element = type === "video"
    ? `<video muted loop playsinline preload="none" data-src="${escapeHtml(assetPath(media.src))}" ${media.poster ? `poster="${escapeHtml(assetPath(media.poster))}"` : ""} aria-label="${escapeHtml(title)}"></video>`
    : `<img src="${escapeHtml(path)}" alt="" loading="lazy" decoding="async" width="${hasSize(media) ? Number(media.width) : 640}" height="${hasSize(media) ? Number(media.height) : 360}">`;
  const ratio = hasSize(media) ? `;--media-ratio:${Number(media.width)}/${Number(media.height)}` : '';
  return `<button class="media-button" style="--media-fit:${fit};--media-position:${position}${ratio}" data-group="${groupId}" data-index="${index}" data-alternate="${alternate}" aria-label="Open ${escapeHtml(title)}${alternate ? ' alternate preview' : ''}">${element}${type === 'video' || alternate ? `<span class="media-badge">${alternate ? 'ALTERNATE' : 'VIDEO'}</span>` : ''}<span class="open-mark" aria-hidden="true">${OPEN_ICON}</span></button>`;
}
const OPEN_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9"/></svg>';
function cardHtml(item, groupId, index, anchorId = '') {
  const main = mediaHtml(mediaFor(item),item.title,groupId,index);
  const media = item.preview ? `<div class="media-split">${main}${mediaHtml(item.preview,item.title,groupId,index,true)}</div>` : main;
  const titleAbove = groupId === 'featured' || groupId === 'collection-a' || groupId === 'categories';
  const category = item.category && (!titleAbove || item.category !== item.title)
    ? `<p class="card-category">${escapeHtml(item.category)}</p>` : '';
  const title = `${category}<h3>${escapeHtml(item.title)}</h3>`;
  const description = item.description ? `<p>${escapeHtml(item.description)}</p>` : '';
  const contents = titleAbove
    ? `<header class="card-heading">${title}</header>${media}${description ? `<div class="card-content card-description">${description}</div>` : ''}`
    : `${media}<div class="card-content">${title}${description}</div>`;
  // The media button is the keyboard target; clicking the heading also opens the viewer.
  return `<article class="card card--${shapeOf(item)}${titleAbove ? ' card--title-above' : ''}"${anchorId ? ` id="${anchorId}"` : ''} data-group="${groupId}" data-index="${index}">${contents}</article>`;
}
// anchors maps an item index to a category ID. Categorised groups render in full so every category link has a target.
function groupHtml(id, items, anchors = null, zoom = false) {
  const pageSize = anchors ? items.length : PAGE_SIZE;
  groups.set(id,{items,zoom,shown:Math.min(pageSize,items.length)});
  return `<div class="grid" id="grid-${id}">${items.slice(0,pageSize).map((item,i)=>cardHtml(item,id,i,anchors?.get(i))).join('')}</div>${items.length > pageSize ? `<button class="load-more" data-more="${id}" aria-controls="grid-${id}">Show more previews (${items.length-pageSize} remaining)</button>` : ''}`;
}
function validate(data) {
  if (!Array.isArray(data.sections)) throw Error("Expected a sections array.");
  const ids = new Set();
  const addId = id => { if (!/^[a-z][a-z0-9-]*$/.test(id || '') || ids.has(id)) throw Error("Section, category and item IDs must be unique lowercase slugs."); ids.add(id); };
  for (const section of data.sections) {
    addId(section.id);
    if (!section.title || !Array.isArray(section.items)) throw Error("Each section needs a title and items array.");
    const categories = section.categories || [];
    const titles = new Set();
    for (const category of categories) { addId(category.id); if (!category.title || titles.has(category.title)) throw Error("Category titles must be unique within a section."); titles.add(category.title); }
    for (const item of section.items) {
      try {
        addId(item.id);
        if (!item.title) throw Error("Each item needs a title.");
        for (const zoom of [section.zoom,item.zoom]) if(zoom !== undefined && typeof zoom !== 'boolean') throw Error("zoom must be true or false.");
        for (const media of [mediaFor(item),item.preview].filter(Boolean)) {
          assetPath(media.src);
          if(media.thumbnail) assetPath(media.thumbnail);
          if(media.poster) assetPath(media.poster);
          if(!['image','video'].includes(typeOf(media))) throw Error("Unsupported media type.");
          for (const size of [media.width,media.height]) if(size !== undefined && !(Number.isFinite(size) && size > 0)) throw Error("Media width and height must be positive numbers.");
        }
        if (categories.length) {
          // Items name their category by ID (preferred) or title. Store the title, which is what the page shows.
          const category = categories.find(c => c.id === item.category) || categories.find(c => c.title === item.category);
          if (!category) throw Error(`Unknown category "${item.category ?? ''}".`);
          item.category = category.title;
        }
      } catch (error) {
        // Say which entry is wrong, so it can be found in content.json.
        throw Error(`Item "${item.id || item.title || '?'}" in section "${section.id}": ${error.message}`);
      }
    }
  }
}
function render(data) {
  validate(data);
  let total = 0;
  $("#preview-sections").innerHTML = data.sections.map((section, index) => {
    total += section.items.length;
    const categories = (section.categories || []).filter(c => section.items.some(item => item.category === c.title));
    // One grid per section, ordered by category. Each category link targets the first card of its category.
    const ordered = categories.flatMap(c => section.items.filter(item => item.category === c.title));
    const anchors = new Map(categories.map(c => [ordered.findIndex(item => item.category === c.title), c.id]));
    const body = categories.length
      ? `<nav class="category-links" aria-label="${escapeHtml(section.title)} groups">${categories.map(c=>`<a href="#${c.id}">${escapeHtml(c.title)}</a>`).join('')}</nav>` + groupHtml(section.id,ordered,anchors,section.zoom === true)
      : groupHtml(section.id,section.items,null,section.zoom === true);
    return `<section class="section" id="${section.id}" aria-labelledby="heading-${section.id}"><header class="section-head"><div><h2 id="heading-${section.id}">${escapeHtml(section.title)}</h2><p>${escapeHtml(section.description || '')}</p></div></header>${body}</section>`;
  }).join('');
  $("#sectionNav").innerHTML = data.sections.map(s=>`<a href="#${s.id}">${escapeHtml(s.title)}<span class="nav-count">${s.items.length}</span></a>`).join('');
  $("#libraryCount").textContent = `${total} previews · ${data.sections.length} sections`;
  $("#preview-sections").setAttribute('aria-busy','false');
  setupLazyVideo();
  updateActiveSection();
  // Support direct category/section links after asynchronous rendering.
  if(location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}
function updateActiveSection() {
  const sections = [...document.querySelectorAll('#preview-sections > .section')];
  const active = sections.filter(s=>s.getBoundingClientRect().top <= 130).at(-1) || sections[0];
  document.querySelectorAll('#sectionNav a').forEach(a=>{
    if(a.hash === `#${active?.id}`) a.setAttribute('aria-current','location');
    else a.removeAttribute('aria-current');
  });
}
let scrollScheduled = false;
addEventListener('scroll',()=>{if(!scrollScheduled){scrollScheduled=true;requestAnimationFrame(()=>{updateActiveSection();scrollScheduled=false;});}},{passive:true});
function syncVideoPlayback() {
  let playing = 0;
  for (const video of document.querySelectorAll('.media-button video')) {
    if(visibleVideos.has(video) && !viewer.open && !document.hidden && !reducedMotion.matches && !saveData() && playing<2) {playing++;video.play().catch(()=>{});}
    else video.pause();
  }
}
function setupLazyVideo() {
  videoObserver?.disconnect();
  visibleVideos.clear();
  if(!('IntersectionObserver' in window)) return; // Posters and viewer remain usable.
  videoObserver = new IntersectionObserver(entries=>{
    for(const {target:video,isIntersecting} of entries){
      if(isIntersecting){visibleVideos.add(video);if(!video.getAttribute('src') && !reducedMotion.matches && !saveData()) video.src=video.dataset.src;}
      else visibleVideos.delete(video);
    }
    syncVideoPlayback();
  },{threshold:.35});
  document.querySelectorAll('.media-button video').forEach(video=>videoObserver.observe(video));
}
reducedMotion.addEventListener('change',setupLazyVideo);
navigator.connection?.addEventListener('change',setupLazyVideo);
document.addEventListener('visibilitychange',syncVideoPlayback);
// Deliberate zoom: Fit -> 2x -> 4x, with native touch scrolling and mouse drag.
const zoomButton = $('#viewerZoom');
const zoomOutButton = $('#viewerZoomOut');
const fitButton = $('#viewerFit');
let changeZoom = null;
let disposeInspector = null;
function resetZoom() {
  disposeInspector?.();
  disposeInspector = null;
  changeZoom = null;
  const stage = $('#viewerMedia');
  stage.classList.remove('is-zoomed','is-dragging');
  stage.removeAttribute('tabindex');
  stage.scrollTo(0,0);
  for(const control of [zoomButton,zoomOutButton,fitButton]) control.hidden = true;
}
function setupInspect(image, stage) {
  const canvas = document.createElement('div');
  canvas.className = 'inspect-canvas';
  image.replaceWith(canvas);
  canvas.append(image);
  image.draggable = false;
  image.classList.add('inspect-image');
  const hint = document.createElement('span');
  hint.className = 'zoom-hint';
  hint.textContent = 'Click, tap or scroll to zoom · Drag or swipe to explore';
  stage.append(hint);
  let level = 1;
  let drag = null;
  let suppressClick = false;
  const clamp = n => Math.max(0,Math.min(1,n));
  function focusPoint() {
    if(level === 1) return {x:.5,y:.5};
    return {x:clamp((stage.scrollLeft+stage.clientWidth/2-image.offsetLeft)/image.offsetWidth),y:clamp((stage.scrollTop+stage.clientHeight/2-image.offsetTop)/image.offsetHeight)};
  }
  function apply(next, point = focusPoint(), anchor = null) {
    if(!image.isConnected) return;
    level = Math.max(1,Math.min(4,next));
    const width = stage.clientWidth, height = stage.clientHeight;
    const fit = Math.min(width/image.naturalWidth,height/image.naturalHeight);
    stage.classList.toggle('is-zoomed',level>1);
    if(level===1){
      canvas.style.cssText = '';
      image.style.cssText = '';
      stage.removeAttribute('tabindex');
      stage.scrollTo(0,0);
    } else {
      const w = image.naturalWidth*fit*level, h = image.naturalHeight*fit*level;
      const cw = Math.max(width,w), ch = Math.max(height,h);
      canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
      image.style.width = `${w}px`; image.style.height = `${h}px`;
      image.style.left = `${(cw-w)/2}px`; image.style.top = `${(ch-h)/2}px`;
      stage.tabIndex = 0;
      stage.scrollTo((cw-w)/2+point.x*w-(anchor?.x ?? width/2),(ch-h)/2+point.y*h-(anchor?.y ?? height/2));
    }
    zoomOutButton.disabled = level===1;
    zoomButton.disabled = level===4;
    fitButton.disabled = level===1;
    fitButton.textContent = level===1 ? 'Fit image' : `Fit image · ${level}×`;
    $('#viewerStatus').textContent = level===1 ? 'Full image shown' : `Zoom ${level} times. Drag, swipe, or focus the image area and use arrow keys to pan.`;
  }
  changeZoom = action => apply(action==='fit'?1:action==='in'?(level<2?2:4):(level>2?2:1));
  for(const control of [zoomButton,zoomOutButton,fitButton]) control.hidden = false;
  image.addEventListener('click',event=>{
    if(suppressClick){suppressClick=false;return;}
    const rect=image.getBoundingClientRect();
    let w=rect.width,h=rect.height,x=rect.left,y=rect.top;
    if(level===1){const fit=Math.min(w/image.naturalWidth,h/image.naturalHeight);const dw=image.naturalWidth*fit,dh=image.naturalHeight*fit;x+=(w-dw)/2;y+=(h-dh)/2;w=dw;h=dh;}
    if(event.clientX<x||event.clientX>x+w||event.clientY<y||event.clientY>y+h)return;
    apply(level<2?2:level<4?4:1,{x:clamp((event.clientX-x)/w),y:clamp((event.clientY-y)/h)});
  });
  // Wheel magnification keeps the detail under the cursor in place.
  // Listen on this image's canvas so replacing the image removes the listener too.
  canvas.addEventListener('wheel',event=>{
    if(event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    event.preventDefault();
    if(drag)return;
    const box=stage.getBoundingClientRect();
    const rect=image.getBoundingClientRect();
    let width=rect.width,height=rect.height,left=rect.left,top=rect.top;
    if(level===1){
      const fit=Math.min(width/image.naturalWidth,height/image.naturalHeight);
      const w=image.naturalWidth*fit,h=image.naturalHeight*fit;
      left+=(width-w)/2;top+=(height-h)/2;width=w;height=h;
    }
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1);
    let next=Math.max(1,Math.min(4,Math.round(level*Math.exp(-Math.max(-300,Math.min(300,delta))*.002)*100)/100));
    if(next<1.03)next=1;
    apply(next,{x:clamp((event.clientX-left)/width),y:clamp((event.clientY-top)/height)},
      {x:event.clientX-box.left-stage.clientLeft,y:event.clientY-box.top-stage.clientTop});
  },{passive:false});
  image.addEventListener('pointerdown',event=>{
    suppressClick=false;
    if(level===1||event.pointerType!=='mouse'||event.button!==0)return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:stage.scrollLeft,top:stage.scrollTop,moved:false};
    image.setPointerCapture(event.pointerId);
  });
  image.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.hypot(dx,dy)>4)drag.moved=true;
    if(drag.moved){stage.classList.add('is-dragging');stage.scrollTo(drag.left-dx,drag.top-dy);}
  });
  const endDrag=event=>{if(!drag||event.pointerId!==drag.id)return;suppressClick=drag.moved;drag=null;stage.classList.remove('is-dragging');if(image.hasPointerCapture(event.pointerId))image.releasePointerCapture(event.pointerId);};
  image.addEventListener('pointerup',endDrag);
  image.addEventListener('pointercancel',endDrag);
  const observer=new ResizeObserver(()=>{if(level>1)apply(level);});
  observer.observe(stage);
  disposeInspector=()=>observer.disconnect();
  apply(1);
}
zoomButton.addEventListener('click',()=>changeZoom?.('in'));
zoomOutButton.addEventListener('click',()=>changeZoom?.('out'));
fitButton.addEventListener('click',()=>changeZoom?.('fit'));
function showViewer(groupId,index,alternate=false,trigger=null) {
  const group = groups.get(groupId);
  if(!group || !group.items[index]) return;
  const item = group.items[index];
  const media = mediaFor(item,alternate && !!item.preview);
  currentGroup=groupId;currentIndex=index;
  // Announce the new item to screen readers when stepping; on open the dialog's own label is read.
  $('#viewerStatus').textContent = viewer.open ? `${item.title}, ${index+1} of ${group.items.length}` : '';
  if(!viewer.open) {returnFocus=(trigger?.matches('button') ? trigger : trigger?.querySelector('.media-button')) || document.activeElement;viewer.showModal();document.body.style.overflow='hidden';}
  syncVideoPlayback();
  const stage = $('#viewerMedia');
  stage.replaceChildren();
  resetZoom();
  const loading=document.createElement('span');loading.className='viewer-loading';loading.textContent='Loading preview…';loading.setAttribute('role','status');stage.append(loading);
  const element=document.createElement(typeOf(media)==='video'?'video':'img');
  if(element.tagName==='VIDEO'){element.controls=true;element.playsInline=true;element.preload='metadata';if(media.poster)element.poster=media.poster;}
  else element.alt=item.title;
  const ready=()=>{
    loading.remove();
    // "zoom" on an item overrides "zoom" on its section.
    if(element.tagName==='IMG' && (item.zoom ?? group.zoom)) setupInspect(element,stage);
  };
  element.addEventListener(element.tagName==='VIDEO'?'loadeddata':'load',ready,{once:true});
  element.addEventListener('error',()=>{element.remove();loading.textContent='Preview unavailable. Please try another item.';},{once:true});
  element.src=assetPath(media.src);stage.append(element);
  $('#viewerTitle').textContent=item.title+(alternate?' · Alternate':'');
  $('#viewerDesc').textContent=item.description || '';
  $('#viewerPosition').textContent=`${item.category ? `${item.category} · ` : ''}${index+1} / ${group.items.length}`;
  $('#viewerPrev').disabled=index===0;
  $('#viewerNext').disabled=index===group.items.length-1;
}
function stepViewer(offset){showViewer(currentGroup,currentIndex+offset);}
$('#viewerClose').addEventListener('click',()=>viewer.close());
$('#viewerPrev').addEventListener('click',()=>stepViewer(-1));
$('#viewerNext').addEventListener('click',()=>stepViewer(1));
viewer.addEventListener('click',event=>{if(event.target===viewer){const r=viewer.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)viewer.close();}});
viewer.addEventListener('close',()=>{if(viewer.open)return; /* Reopened before this event arrived. */ $('#viewerMedia').replaceChildren();resetZoom();document.body.style.overflow='';returnFocus?.focus({preventScroll:true});syncVideoPlayback();});
viewer.addEventListener('keydown',event=>{if(event.target.closest('video,.is-zoomed'))return;if(event.key==='ArrowLeft'){event.preventDefault();stepViewer(-1);}if(event.key==='ArrowRight'){event.preventDefault();stepViewer(1);}});
document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-group]');
  if(trigger)showViewer(trigger.dataset.group,Number(trigger.dataset.index),trigger.dataset.alternate==='true',trigger);
  const more=event.target.closest('[data-more]');
  if(more){const id=more.dataset.more;const group=groups.get(id);const start=group.shown;group.shown=Math.min(start+PAGE_SIZE,group.items.length);$(`#grid-${id}`).insertAdjacentHTML('beforeend',group.items.slice(start,group.shown).map((item,i)=>cardHtml(item,id,start+i)).join(''));const next=$(`#grid-${id} .media-button[data-index="${start}"]`);if(group.shown===group.items.length)more.remove();else more.textContent=`Show more previews (${group.items.length-group.shown} remaining)`;next?.focus({preventScroll:true});setupLazyVideo();}
});
// Resource errors do not bubble; capture handles both images and videos.
document.addEventListener('error',event=>{const element=event.target;if(!element.matches?.('.media-button img,.media-button video'))return;const fallback=document.createElement('span');fallback.className='media-failed';fallback.textContent='Preview unavailable';element.replaceWith(fallback);},{capture:true});
$('#year').textContent=new Date().getFullYear();
fetch('content.json').then(response=>{if(!response.ok)throw Error('Content unavailable');return response.json();}).then(render).catch(error=>{console.error(error);$('#preview-sections').innerHTML=`<p class="status" role="alert">The gallery could not be loaded: ${escapeHtml(error.message)} Check content.json and serve this folder with Live Server, then refresh.</p>`;$('#preview-sections').setAttribute('aria-busy','false');$('#libraryCount').textContent='Gallery unavailable';});

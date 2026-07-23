let MANIFEST, pdfInstance, currentPdfPage = 1, pdfStorageKey = '', PREVIEWABLE_TYPES = [], BRANDING = {};

const getPathParts = p => p ? p.split('/').filter(Boolean) : [];
const getParentPath = p => getPathParts(p).slice(0, -1).join('/');

const getIconClass = (t, isDir) => isDir ? 'fa-folder icon-dir' : ({
    img: 'fa-image icon-img', 'pro-img': 'fa-image icon-img', vid: 'fa-film icon-vid', 'pro-vid': 'fa-film icon-vid',
    aud: 'fa-music icon-aud', 'pro-aud': 'fa-music icon-aud', md: 'fa-file-lines icon-text', text: 'fa-file-lines icon-text',
    code: 'fa-code icon-code', zip: 'fa-box-archive icon-zip', pdf: 'fa-file-pdf icon-pdf', '3d': 'fa-cube icon-3d'
}[t] || 'fa-file icon-other');

const findItemByPath = reqPath => {
    if (!reqPath || !MANIFEST?.items) return null;
    const norm = reqPath.replace(/_/g, '-').toLowerCase();
    return MANIFEST.items.find(i => i.path === reqPath) || MANIFEST.items.find(i => i.path.replace(/_/g, '-').toLowerCase() === norm);
};

function configureMarked() {
    if (!window.marked) return;
    const renderer = new marked.Renderer();
    renderer.link = (href, title, text) => {
        if (!href) return text;
        const ext = /^(https?:|\/\/|mailto:)/.test(href);
        const tAttr = title ? ` title="${title}"` : '';
        return ext ? `<a href="${href}" target="_blank" rel="noopener noreferrer"${tAttr}>${text}</a>`
                   : `<a href="#/${href.replace(/^\.?\//, '')}"${tAttr}>${text}</a>`;
    };
    marked.use({ renderer });
}

async function initApp() {
    try {
        const [mRes, cRes] = await Promise.all([fetch('static/files.json'), fetch('static/config.json').catch(() => null)]);
        MANIFEST = await mRes.json();
        PREVIEWABLE_TYPES = MANIFEST.previewable_types || [];
        
        if (cRes?.ok) BRANDING = await cRes.json().catch(() => ({}));

        document.title = BRANDING.title;
        document.querySelector('.logo-area h2')?.replaceChildren(BRANDING.title);

        configureMarked();
        await initBgmPlayer();
        initMobileMenu();
        initModalEvents();
        initSearchInput();

        window.addEventListener('hashchange', handleRoute);
        window.addEventListener('popstate', handleRoute);

        if (!location.hash || location.hash === '#/' || location.hash === '#') {
            if (MANIFEST.items.some(i => i.path === BRANDING.main)) return location.hash = `#/${BRANDING.main}`;
        }
        handleRoute();
    } catch (err) {
        document.getElementById('file-list').innerHTML = '<div style="padding:20px;color:#f44336;">Index failed.</div>';
    }
}

function handleRoute() {
    closeMobileSidebar();
    const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const isSearch = hash.startsWith('search?');
    const searchQuery = isSearch ? new URLSearchParams(hash.slice(7)).get('q') || '' : '';
    const reqPath = isSearch ? '' : hash;

    const sInput = document.getElementById('search-input');
    if (sInput) sInput.value = searchQuery;

    let activeItem = null, folderPath = '';
    if (!isSearch && reqPath) {
        const exact = findItemByPath(reqPath);
        if (exact) {
            folderPath = exact.is_dir ? exact.path : getParentPath(exact.path);
            if (!exact.is_dir) activeItem = exact;
        } else folderPath = reqPath;
    }

    renderSidebar(folderPath, activeItem?.path, searchQuery);
    renderBreadcrumb(isSearch ? '' : (activeItem?.path || folderPath), searchQuery);
    renderMainView(activeItem, searchQuery);
}

function renderSidebar(folderPath, activeFilePath, searchQuery) {
    const fileListEl = document.getElementById('file-list');
    const parentContainer = document.getElementById('parent-dir-container');
    fileListEl.innerHTML = parentContainer.innerHTML = '';

    let items = MANIFEST.items;
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        items = q.startsWith('tag:') 
            ? items.filter(i => i.tags?.some(t => t.toLowerCase().includes(q.slice(4).trim())))
            : items.filter(i => i.name.toLowerCase().includes(q) || i.tags?.some(t => t.toLowerCase().includes(q)));
    } else {
        if (folderPath) parentContainer.innerHTML = `<a href="#/${getParentPath(folderPath)}" class="back-btn"><i class="fa-solid fa-arrow-left"></i> Parent Directory</a>`;
        items = items.filter(i => getParentPath(i.path) === folderPath);
    }

    items.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        const aP = !a.is_dir && PREVIEWABLE_TYPES.includes(a.ext), bP = !b.is_dir && PREVIEWABLE_TYPES.includes(b.ext);
        if (aP !== bP) return aP ? -1 : 1;
        return a.type !== b.type ? a.type.localeCompare(b.type) : a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    if (!items.length) return fileListEl.innerHTML = '<div style="padding: 15px; color: #666; font-size: 0.9em;">No results found</div>';

    items.forEach(item => {
        const isPreview = !item.is_dir && PREVIEWABLE_TYPES.includes(item.ext);
        const tags = item.tags?.map(t => `<span class="search-tag" style="--tag-color: var(--tag-${t.toLowerCase().replace(/\s+/g, '-')});">${t}</span>`).join('') || '';
        
        const a = document.createElement('a');
        a.href = `#/${item.path}`;
        a.className = `item ${item.is_dir ? 'dir' : (isPreview ? 'is-preview' : 'is-download')} ${activeFilePath === item.path ? 'active' : ''}`;
        a.innerHTML = `
            <div class="item-info">
                <span class="item-name-group">
                    ${item.is_dir ? '' : `<span class="status-icon"><i class="fa-solid ${isPreview ? 'fa-eye status-preview' : 'fa-download status-download'}"></i></span>`}
                    <span class="type-icon"><i class="fa-solid ${getIconClass(item.type, item.is_dir)}"></i></span>
                    ${item.name}
                </span>
                ${item.size ? `<span class="size-tag">${item.size}</span>` : ''}
            </div>
            ${tags ? `<div class="search-tags">${tags}</div>` : ''}
        `;
        fileListEl.appendChild(a);
    });
}

function renderBreadcrumb(path, searchQuery) {
    const el = document.getElementById('breadcrumb');
    if (searchQuery) return el.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> <a href="#/">${BRANDING.title}</a> / Search Results: "${searchQuery}"`;

    let accum = '', html = `<i class="fa-solid fa-location-dot"></i> <a href="#/">${BRANDING.title}</a> /`;
    getPathParts(path).forEach((p, i) => {
        accum += (i ? '/' : '') + p;
        html += ` <a href="#/${accum}">${p}</a> /`;
    });
    el.innerHTML = html;
}

async function renderMainView(activeItem, searchQuery) {
    const actionsBar = document.getElementById('top-actions-bar');
    const mainContent = document.getElementById('main-content');
    const tagsContainer = document.getElementById('tags-container');

    actionsBar.style.display = tagsContainer.style.display = 'none';
    actionsBar.innerHTML = tagsContainer.innerHTML = mainContent.innerHTML = '';

    if (!activeItem) {
        return mainContent.innerHTML = `
            <div style="text-align:center; margin-top:100px; opacity:0.5;">
                ${searchQuery ? '<i class="fa-solid fa-magnifying-glass" style="font-size: 48px; color: #ffbc00;"></i><h2>Search Results</h2>' : `<img src="static/icon.png" style="width:100px; filter: grayscale(1);"><h2>${BRANDING.title}</h2>`}
                <p>${searchQuery ? 'You can select a file from the list on the left.' : 'Select a file to get started.'}</p>
            </div>`;
    }

    document.title = `${activeItem.name} - ${BRANDING.title}`;
    actionsBar.style.display = 'flex';
    
    actionsBar.innerHTML = `
        <a href="root/${activeItem.path}" class="download-link" download><i class="fa-solid fa-download"></i> Download</a>
        ${activeItem.source_archive ? `<a href="root/${activeItem.source_archive}" class="download-link source-link" download><i class="fa-solid fa-file-zipper"></i> Download Source</a>` : ''}
        ${activeItem.has_details || activeItem.details_content ? `<button class="download-link details-link" id="open-details-btn"><i class="fa-solid fa-circle-info"></i> Details</button>` : ''}
    `;
    document.getElementById('open-details-btn')?.addEventListener('click', () => openDetailsModal(activeItem));

    if (activeItem.tags?.length) {
        tagsContainer.style.display = 'flex';
        tagsContainer.innerHTML = activeItem.tags.map(t => `<a href="#/search?q=tag:${encodeURIComponent(t)}" class="tag" style="--tag-color: var(--tag-${t.toLowerCase().replace(/\s+/g, '-')}); text-decoration: none;">${t}</a>`).join('');
    }

    const views = {
        md: async () => {
            mainContent.innerHTML = `<div class="md-view" id="md-target">Loading...</div>`;
            const t = await (await fetch(`root/${activeItem.path}`)).text();
            document.getElementById('md-target').innerHTML = window.marked ? marked.parse(t) : t;
        },
        text: async () => {
            mainContent.innerHTML = `<pre class="text-view" id="txt-target">Loading...</pre>`;
            document.getElementById('txt-target').textContent = await (await fetch(`root/${activeItem.path}`)).text();
        },
        img: () => {
            const res = activeItem.img_resolution ? `<span class="img-res">${activeItem.img_resolution}</span>` : '';
            mainContent.innerHTML = `<div class="img-preview-wrapper"><div class="img-container zoomable" id="zoom-container"><img src="root/${activeItem.path}" id="zoom-img"></div><div class="img-info-overlay">${res}<span class="zoom-level" id="zoom-level">100%</span></div></div>`;
            initImageZoom();
        },
        vid: () => mainContent.innerHTML = `<div class="vid-container"><video controls autoplay src="root/${activeItem.path}"></video></div>`,
        aud: () => mainContent.innerHTML = `<div class="aud-container"><audio controls autoplay src="root/${activeItem.path}"></audio></div>`,
        pdf: () => {
            mainContent.innerHTML = `<div class="pdf-viewer-container" id="pdf-viewer-root"><div class="pdf-controls"><button class="pdf-btn" id="pdf-prev"><i class="fa-solid fa-chevron-left"></i></button><div class="pdf-info">Page <input type="number" id="pdf-page-input" min="1" value="1"> / <span id="pdf-page-total">?</span></div><button class="pdf-btn" id="pdf-next"><i class="fa-solid fa-chevron-right"></i></button><button class="pdf-btn" id="pdf-fullscreen"><i class="fa-solid fa-expand"></i></button></div><div class="pdf-canvas-wrapper" id="pdf-container"></div></div>`;
            initPdfViewer(`root/${activeItem.path}`);
        },
        '3d': () => mainContent.innerHTML = `<div class="model-3d-container"><model-viewer src="root/${activeItem.path}" camera-controls auto-rotate bounds="tight" enable-pan shadow-intensity="1" environment-image="neutral" exposure="1.2" touch-action="pan-y"></model-viewer></div>`
    };

    views.code = views.text;
    await (views[activeItem.type] || (() => mainContent.innerHTML = `<div style="text-align:center; padding:50px;"><p>Preview not supported.</p><a href="root/${activeItem.path}" class="download-link" download>Download</a></div>`))();
}

async function openDetailsModal(item) {
    const modal = document.getElementById('details-modal');
    const body = document.getElementById('details-modal-body');
    if (!modal || !body) return;
    body.innerHTML = 'Loading...';
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    let c = item.details_content || (item.has_details ? await (await fetch(`root/${item.path}.md`)).text().catch(() => 'Error') : '');
    body.innerHTML = window.marked ? marked.parse(c) : c;
}

function closeDetailsModal() {
    const modal = document.getElementById('details-modal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
}

function initModalEvents() {
    document.querySelector('.close-modal')?.addEventListener('click', closeDetailsModal);
    window.addEventListener('click', e => e.target === document.getElementById('details-modal') && closeDetailsModal());
    document.addEventListener('keydown', e => e.key === 'Escape' && closeDetailsModal());
}

async function initBgmPlayer() {
    const bar = document.getElementById('bgm-bar'), audio = document.getElementById('bgm-audio'), btn = document.getElementById('bgm-play-btn'), slider = document.getElementById('bgm-volume');
    if (!bar || !audio || !btn) return;

    try {
        if (!(await fetch('bgm.mp3', { method: 'HEAD' })).ok) return bar.style.display = 'none';
    } catch { return bar.style.display = 'none'; }

    bar.style.display = 'flex';
    audio.src = 'bgm.mp3'; audio.volume = 0.05;

    btn.onclick = () => {
        audio.paused ? audio.play().then(() => btn.innerHTML = '<i class="fa-solid fa-pause"></i>') : (audio.pause(), btn.innerHTML = '<i class="fa-solid fa-play"></i>');
    };
    if (slider) slider.oninput = () => audio.volume = parseFloat(slider.value);
    audio.play().then(() => btn.innerHTML = '<i class="fa-solid fa-pause"></i>').catch(() => {});
}

function initMobileMenu() {
    const toggle = document.getElementById('mobile-menu-toggle'), sidebar = document.querySelector('sidebar'), overlay = document.getElementById('sidebar-overlay');
    const fn = () => { sidebar?.classList.toggle('active'); overlay?.classList.toggle('active'); };
    toggle?.addEventListener('click', fn); overlay?.addEventListener('click', fn);
}

function closeMobileSidebar() {
    if (window.innerWidth <= 768) {
        document.querySelector('sidebar')?.classList.remove('active');
        document.getElementById('sidebar-overlay')?.classList.remove('active');
    }
}

function initSearchInput() {
    let timer;
    document.getElementById('search-input')?.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const q = e.target.value.trim();
            location.hash = q ? `#/search?q=${encodeURIComponent(q)}` : '#/';
        }, 300);
    });
}

function initPdfViewer(pdfUrl) {
    const container = document.getElementById('pdf-container'), controls = document.querySelector('.pdf-controls');
    if (!container || !window.pdfjsLib) return;

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    pdfStorageKey = 'pdf_last_page_' + pdfUrl;
    currentPdfPage = parseInt(localStorage.getItem(pdfStorageKey)) || 1;

    async function renderPage(num) {
        if (!pdfInstance) return;
        num = num < 1 ? pdfInstance.numPages : (num > pdfInstance.numPages ? 1 : num);
        currentPdfPage = num;
        localStorage.setItem(pdfStorageKey, num);
        
        const page = await pdfInstance.getPage(num);
        const viewport = page.getViewport({ scale: Math.min((window.innerHeight - 120) / page.getViewport({ scale: 1 }).height, (container.clientWidth - 20) / page.getViewport({ scale: 1 }).width) });
        const svg = await (new pdfjsLib.SVGGraphics(page.commonObjs, page.objs)).getSVG(await page.getOperatorList(), viewport);
        
        svg.style.width = viewport.width + 'px'; svg.style.height = viewport.height + 'px';
        container.replaceChildren(svg);
    }

    pdfjsLib.getDocument(pdfUrl).promise.then(doc => {
        pdfInstance = doc;
        document.getElementById('pdf-page-total').textContent = doc.numPages;
        renderPage(currentPdfPage);
    });

    document.getElementById('pdf-prev')?.addEventListener('click', () => renderPage(currentPdfPage - 1));
    document.getElementById('pdf-next')?.addEventListener('click', () => renderPage(currentPdfPage + 1));
    document.getElementById('pdf-fullscreen')?.addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.getElementById('pdf-viewer-root')?.requestFullscreen());
}

function initImageZoom() {
    const zoomContainer = document.getElementById('zoom-container');
    const zoomImg = document.getElementById('zoom-img');
    const zoomLevelDisplay = document.getElementById('zoom-level');
    if (!zoomContainer || !zoomImg) return;

    let scale = 1, translateX = 0, translateY = 0;
    let isDragging = false, startX = 0, startY = 0, lastPinchDist = 0;

    const updateTransform = (smooth) => {
        zoomImg.style.transition = smooth ? 'transform 0.1s ease-out' : 'none';
        zoomImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        zoomImg.draggable = scale <= 1;
        if (zoomLevelDisplay) zoomLevelDisplay.textContent = Math.round(scale * 100) + '%';
    };

    zoomImg.addEventListener('dragstart', (e) => { if (scale > 1) e.preventDefault(); });

    zoomContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const oldScale = scale;
        scale = e.deltaY < 0 ? Math.min(scale + 0.15, 10) : Math.max(scale - 0.15, 1);
        
        if (oldScale !== scale) {
            if (scale === 1) { translateX = 0; translateY = 0; updateTransform(true); }
            else {
                const rect = zoomContainer.getBoundingClientRect();
                const mx = e.clientX - (rect.left + rect.width / 2);
                const my = e.clientY - (rect.top + rect.height / 2);
                const ratio = (scale / oldScale) - 1;
                translateX -= (mx - translateX) * ratio;
                translateY -= (my - translateY) * ratio;
                updateTransform(true);
            }
        }
    }, { passive: false });

    zoomContainer.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || scale <= 1) return;
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        zoomContainer.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateTransform(false);
    });

    window.addEventListener('mouseup', () => { isDragging = false; if (zoomContainer) zoomContainer.style.cursor = 'grab'; });

    zoomContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            lastPinchDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            isDragging = false;
        } else if (e.touches.length === 1) {
            isDragging = true;
            startX = e.touches[0].clientX - translateX;
            startY = e.touches[0].clientY - translateY;
        }
    }, { passive: false });

    zoomContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            const oldScale = scale;
            scale = dist > lastPinchDist ? Math.min(scale + 0.05, 10) : Math.max(scale - 0.05, 1);
            if (scale === 1) { translateX = 0; translateY = 0; updateTransform(true); }
            else {
                const rect = zoomContainer.getBoundingClientRect();
                const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - (rect.left + rect.width / 2);
                const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - (rect.top + rect.height / 2);
                const ratio = (scale / oldScale) - 1;
                translateX -= (cx - translateX) * ratio;
                translateY -= (cy - translateY) * ratio;
                updateTransform(false);
            }
            lastPinchDist = dist;
        } else if (e.touches.length === 1 && isDragging && scale > 1) {
            translateX = e.touches[0].clientX - startX;
            translateY = e.touches[0].clientY - startY;
            updateTransform(false);
        }
    }, { passive: false });

    zoomContainer.addEventListener('touchend', () => isDragging = false);
    zoomContainer.addEventListener('dblclick', () => { scale = 1; translateX = 0; translateY = 0; updateTransform(true); });
}

document.addEventListener('DOMContentLoaded', initApp);
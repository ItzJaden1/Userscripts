(function() {
    'use strict';

    /*** ===== HARDCODED CONFIG (Developer Only) ===== ***/
    const SKIP_CONFIG = {
        wayground: true,
        iready: true,
        subjects: ["Music", "Art"], 
        forceFallback: false // SET TO TRUE TO TEST "NOTHING ELSE TO DO" MODE
    };

    /*** ===== STATE & DATABASE ===== ***/
    const defaultDB = {
        "PE": 0.5, "Health": 0.5, "Art": 0.8, "Music": 0.8, "Career Planning": 1.0,
        "Social Studies": 1.5, "History": 1.5, "Science": 2.0,
        "ELA": 2.5, "Math": 3.0, "Algebra": 3.5
    };
    const tasklyDB = GM_getValue("customWeights", defaultDB);

    let state = {
        tasks: GM_getValue("savedTasks", []),
        isFallbackMode: false,
        view: 'list',
        searchQuery: "",
        accentColor: GM_getValue("accentColor", "#0267f0"),
        notifs: GM_getValue("notifs", true),
        autoDismiss: GM_getValue("autoDismiss", true),
        tpp: 4,
        compactMode: GM_getValue("compactMode", false),
        showScore: GM_getValue("showScore", true),
        isDark: true,
        currentPage: 0
    };

    const updateThemeDetect = () => {
        const bg = window.getComputedStyle(document.body).backgroundColor;
        const rgb = bg.match(/\d+/g);
        if (rgb) {
            const brightness = ((rgb[0] * 299) + (rgb[1] * 587) + (rgb[2] * 114)) / 1000;
            const newIsDark = brightness < 128;
            if (newIsDark !== state.isDark) {
                state.isDark = newIsDark;
                injectStyles();
            }
        }
    };

    const injectStyles = () => {
        const old = document.getElementById("taskly-styles");
        if(old) old.remove();
        const theme = {
            bg: state.isDark ? '#121214f5' : '#fffffff5',
            card: state.isDark ? '#1e1e22' : '#f1f3f5',
            text: state.isDark ? '#ffffff' : '#1a1a1c',
            border: state.isDark ? '#333' : '#dee2e6',
            input: state.isDark ? '#1e1e22' : '#ffffff'
        };
        const style = document.createElement('style');
        style.id = "taskly-styles";
        style.innerHTML = `
            :root { --t-accent: ${state.accentColor}; --t-bg: ${theme.bg}; --t-card: ${theme.card}; --t-text: ${theme.text}; --t-border: ${theme.border}; }
            #taskly-modal, #taskly-notification { font-family: 'Segoe UI', system-ui, sans-serif; color: var(--t-text); }
            #t-bg { position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.5) !important; backdrop-filter: blur(8px) !important; display: flex !important; justify-content: center !important; align-items: center !important; z-index: 2147483647 !important; }
            #taskly-modal { background: var(--t-bg); width: ${state.compactMode ? '520px' : '680px'}; border-radius: 28px; padding: 32px; box-shadow: 0 40px 80px rgba(0,0,0,0.3); display: flex; flex-direction: column; animation: t-pop 0.3s ease; backdrop-filter: blur(15px); border: 1px solid var(--t-border); }
            .t-card { background: var(--t-card); border-radius: 16px; padding: 18px; margin-bottom: 12px; border: 1px solid var(--t-border); transition: 0.2s; position: relative; overflow: hidden; }
            .t-card.easiest { border-left: 4px solid #4bb543; }
            .t-card.faded { opacity: 0.45; filter: grayscale(0.5); }
            .t-btn { background: var(--t-accent); color: #fff !important; padding: 10px 18px; border-radius: 10px; border: none; font-weight: 700; cursor: pointer; text-decoration: none !important; font-size: 12px; display: inline-flex; align-items: center; }
            .t-btn-sec { background: rgba(120,120,120,0.15); color: var(--t-text) !important; }
            .t-input { width: 100%; background: ${theme.input}; border: 1px solid var(--t-border); padding: 12px; border-radius: 12px; color: var(--t-text); margin-bottom: 5px; outline: none; box-sizing: border-box; }
            .t-switch { width: 38px; height: 18px; background: #888; border-radius: 20px; position: relative; cursor: pointer; transition: 0.3s; }
            .t-switch.active { background: var(--t-accent); }
            .t-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; background: white; border-radius: 50%; transition: 0.2s; }
            .t-switch.active::after { left: 22px; }
            #taskly-notification { position: fixed; bottom: 25px; right: 25px; width: 320px; background: var(--t-bg); border-radius: 20px; padding: 20px; border-left: 5px solid #4bb543; box-shadow: 0 15px 40px rgba(0,0,0,0.2); z-index: 2147483647; cursor: pointer; animation: t-slide 0.4s ease; border-top: 1px solid var(--t-border); border-right: 1px solid var(--t-border); backdrop-filter: blur(10px); }
            @keyframes t-pop { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            @keyframes t-slide { from { transform: translateX(120%); } to { transform: translateX(0); } }
        `;
        document.documentElement.appendChild(style);
    };

    function analyzeTask(el) {
        let fullText = el.innerText.trim();
        const link = el.querySelector('a')?.href || el.closest('a')?.href || "#";
        const overdueMatch = fullText.match(/(\d+)\s*day/i);
        const days = overdueMatch ? parseInt(overdueMatch[1]) : 0;
        let title = fullText.split('\n')[0].replace(/^\d+%/g, '').replace(/\s*\d+\s*day\(s\)Overdue/gi, '').replace(/Physical Education & Health|Career Planning/gi, '').trim();
        let sub = "General";
        for (const s of Object.keys(tasklyDB)) { if (fullText.toLowerCase().includes(s.toLowerCase())) { sub = s; break; } }
        let difficulty = (tasklyDB[sub] || 1.5) + (days * 0.05);
        const lowerFull = fullText.toLowerCase();
        let isIgnored = false;
        if (SKIP_CONFIG.wayground && lowerFull.includes("wayground")) isIgnored = true;
        if (SKIP_CONFIG.iready && lowerFull.includes("iready")) isIgnored = true;
        if (SKIP_CONFIG.subjects.some(s => lowerFull.includes(s.toLowerCase()))) isIgnored = true;
        return { title, sub, difficulty, link, days, isIgnored };
    }

    const shadowScan = () => {
        const items = document.querySelectorAll(".c-calendar-list-accordion__item__content__item");
        if (items.length > 0) {
            const allTasks = Array.from(items).map(analyzeTask).sort((a,b) => a.difficulty - b.difficulty);
            let filtered;
            if (SKIP_CONFIG.forceFallback) { filtered = allTasks; state.isFallbackMode = true; }
            else {
                filtered = allTasks.filter(t => !t.isIgnored);
                if (filtered.length === 0 && allTasks.length > 0) { filtered = allTasks; state.isFallbackMode = true; }
                else { state.isFallbackMode = false; }
            }
            if (JSON.stringify(filtered) !== JSON.stringify(state.tasks)) {
                if (state.notifs && filtered.length > 0 && !state.isFallbackMode) showNotification(filtered[0]);
                state.tasks = filtered;
                GM_setValue("savedTasks", filtered);
                if(document.getElementById('t-bg')) render();
            }
        }
    };

    function showNotification(t) {
        if (!t || document.getElementById("taskly-notification")) return;
        const n = document.createElement('div');
        n.id = "taskly-notification";
        n.innerHTML = `<div style="font-size:10px; font-weight:900; color:#4bb543; margin-bottom:5px;">EASIEST TASK DETECTED</div><div style="font-weight:700; margin-bottom:15px; line-height:1.4;">${t.title}</div><div style="display:flex; gap:10px;"><a href="${t.link}" class="t-btn" style="background:#4bb543;">Do it now</a><button id="notif-dash" class="t-btn t-btn-sec">Dashboard</button></div>`;
        document.documentElement.appendChild(n);
        document.getElementById('notif-dash').onclick = (e) => { e.stopPropagation(); n.remove(); showOverlay(); };
        if (state.autoDismiss) setTimeout(() => n?.remove(), 8000);
    }

    function showOverlay() {
        if (document.getElementById("t-bg")) return;
        const bg = document.createElement('div');
        bg.id = "t-bg";
        bg.innerHTML = `<div id="taskly-modal"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;"><h2 style="margin:0; font-weight:800; letter-spacing:-0.5px;">Taskly <span style="font-size: 12px; vertical-align: middle; opacity: 0.6;">Beta</span></h2><span id="t-close" style="cursor:pointer; font-size:24px; opacity:0.5;">&times;</span></div><div id="t-wrap" style="flex:1; overflow:auto;"></div><div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; gap:10px;"><button id="v-list" class="t-btn">Queue</button><button id="v-set" class="t-btn t-btn-sec">Settings</button></div><div id="t-pag" style="display:flex; gap:8px;"></div></div></div>`;
        document.documentElement.appendChild(bg);
        document.getElementById('t-close').onclick = () => bg.remove();
        document.getElementById('v-list').onclick = () => { state.view = 'list'; render(); };
        document.getElementById('v-set').onclick = () => { state.view = 'settings'; render(); };
        render();
    }

    function render() {
        const wrap = document.getElementById('t-wrap');
        if (!wrap) return;
        wrap.innerHTML = "";
        if (state.view === 'settings') {
            wrap.innerHTML = `<div class="t-card"><span>Compact Mode</span><div class="t-switch ${state.compactMode?'active':''}" id="s-comp"></div></div>`;
            document.getElementById('s-comp').onclick = () => { state.compactMode = !state.compactMode; GM_setValue("compactMode", state.compactMode); injectStyles(); render(); };
        } else {
            const search = document.createElement('input');
            search.className = "t-input"; search.placeholder = "Filter easiest tasks..."; search.value = state.searchQuery;
            search.oninput = (e) => { state.searchQuery = e.target.value; updateList(listCont); };
            const listCont = document.createElement('div');
            wrap.appendChild(search);
            if (state.isFallbackMode) {
                const subText = document.createElement('div');
                subText.style = "font-size: 10px; opacity: 0.8; margin-bottom: 15px; margin-left: 5px; color: #ffae00; font-weight: bold;";
                subText.innerText = SKIP_CONFIG.forceFallback ? "🛠️ EMULATION MODE" : "⚠️ Showing ignored subjects.";
                wrap.appendChild(subText);
            }
            wrap.appendChild(listCont);
            updateList(listCont);
        }
    }

    function updateList(container) {
        container.innerHTML = "";
        const filtered = state.tasks.filter(t => t.title.toLowerCase().includes(state.searchQuery.toLowerCase()));
        if (filtered.length === 0) { container.innerHTML = `<div style="text-align:center; padding: 40px; opacity: 0.5;">No tasks.</div>`; return; }
        filtered.slice(state.currentPage * state.tpp, (state.currentPage + 1) * state.tpp).forEach((t, i) => {
            const isFirst = i === 0 && state.searchQuery === "" && !t.isIgnored;
            const card = document.createElement('div');
            card.className = `t-card ${isFirst ? 'easiest' : ''} ${t.isIgnored ? 'faded' : ''}`;
            card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><div style="flex:1;"><span style="background:${isFirst ? '#4bb543' : 'var(--t-accent)'}; color:#fff; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:800;">${t.sub}</span>${t.isIgnored ? '<span style="color: #ffae00; font-size: 9px; margin-left: 8px; font-weight: bold;">IGNORED</span>' : ''}<div style="font-weight:700; margin-top:8px;">${t.title}</div><div style="font-size:11px; opacity:0.6; margin-top:4px;">Difficulty: ${t.difficulty.toFixed(1)}</div></div><a href="${t.link}" class="t-btn" style="background:${isFirst ? '#4bb543' : ''}">Start</a></div>`;
            container.appendChild(card);
        });
    }

    injectStyles();
    let lastT = 0;
    window.addEventListener('keydown', e => {
        if (e.key.toLowerCase() === 't') {
            const now = Date.now();
            if (now - lastT < 400) { e.stopImmediatePropagation(); showOverlay(); }
            lastT = now;
        }
    }, true);
    const observer = new MutationObserver(() => { shadowScan(); updateThemeDetect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();

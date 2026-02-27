(function() {
    'use strict';

    /*** ===== STATE & DATABASE ===== ***/
    const defaultDB = {
        "PE": 0.5, "Health": 0.5, "Art": 0.8, "Music": 0.8, "Career Planning": 1.0,
        "Social Studies": 1.5, "History": 1.5, "Science": 2.0,
        "ELA": 2.5, "Math": 3.0, "Algebra": 3.5
    };
    const tasklyDB = GM_getValue("customWeights", defaultDB);

    let state = {
        tasks: GM_getValue("savedTasks", []),
        skippedTitles: GM_getValue("skippedTitles", []),
        maxSkips: GM_getValue("maxSkips", 3),
        view: 'list', // 'list' or 'settings'
        searchQuery: "",
        accentColor: GM_getValue("accentColor", "#4bb543"),
        notifs: GM_getValue("notifs", true),
        autoDismiss: GM_getValue("autoDismiss", true),
        dismissTime: GM_getValue("dismissTime", 8000),
        compactMode: GM_getValue("compactMode", false),
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
            #taskly-modal, #taskly-notification { font-family: 'Segoe UI', system-ui, sans-serif; color: var(--t-text); box-sizing: border-box; }
            #t-bg { position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.4) !important; backdrop-filter: blur(12px) !important; display: flex !important; justify-content: center !important; align-items: center !important; z-index: 2147483647 !important; animation: t-fade-in 0.3s ease; }
            #taskly-modal { background: var(--t-bg); width: ${state.compactMode ? '480px' : '620px'}; border-radius: 28px; padding: 32px; box-shadow: 0 40px 80px rgba(0,0,0,0.4); display: flex; flex-direction: column; border: 1px solid var(--t-border); animation: t-modal-zoom 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); max-height: 80vh; }
            .t-card { background: var(--t-card); border-radius: 16px; padding: 18px; margin-bottom: 12px; border: 1px solid var(--t-border); transition: 0.2s; position: relative; overflow: hidden; }
            .t-btn { background: var(--t-accent); color: #fff !important; padding: 8px 14px; border-radius: 10px; border: none; font-weight: 700; cursor: pointer; text-decoration: none !important; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; height: 34px; transition: 0.2s; }
            .t-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
            .t-btn-sec { background: rgba(120,120,120,0.15); color: var(--t-text) !important; }
            .t-input { width: 100%; background: ${theme.input}; border: 1px solid var(--t-border); padding: 10px; border-radius: 10px; color: var(--t-text); outline: none; margin-bottom: 15px; }
            .t-setting-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(128,128,128,0.1); }
            #taskly-notification { position: fixed; bottom: 25px; right: 25px; width: 360px; background: var(--t-bg); border-radius: 24px; padding: 18px; border-left: 5px solid var(--t-accent); box-shadow: 0 20px 50px rgba(0,0,0,0.3); z-index: 2147483647; border-top: 1px solid var(--t-border); border-right: 1px solid var(--t-border); backdrop-filter: blur(15px); animation: t-notif-slide 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
            @keyframes t-fade-in { from { opacity: 0; } to { opacity: 1; } }
            @keyframes t-modal-zoom { from { transform: scale(0.9) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
            @keyframes t-notif-slide { from { transform: translateX(100%) scale(0.9); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }
        `;
        document.documentElement.appendChild(style);
    };

    function analyzeTask(el) {
        let fullText = el.innerText.trim();
        const link = el.querySelector('a')?.href || el.closest('a')?.href || "#";
        const overdueMatch = fullText.match(/(\d+)\s*day/i);
        const days = overdueMatch ? parseInt(overdueMatch[1]) : 0;
        let title = fullText.split('\n')[0].replace(/^\d+%/g, '').replace(/\s*\d+\s*day\(s\)Overdue/gi, '').trim();
        let sub = "General";
        for (const s of Object.keys(tasklyDB)) { if (fullText.toLowerCase().includes(s.toLowerCase())) { sub = s; break; } }
        let difficulty = (tasklyDB[sub] || 1.5) + (days * 0.05);
        return { title, sub, difficulty, link, days };
    }

    const shadowScan = () => {
        const items = document.querySelectorAll(".c-calendar-list-accordion__item__content__item");
        if (items.length > 0) {
            const allTasks = Array.from(items).map(analyzeTask).sort((a,b) => a.difficulty - b.difficulty);
            let filtered = allTasks.filter(t => !state.skippedTitles.includes(t.title));
            if (filtered.length === 0 && allTasks.length > 0) filtered = allTasks;
            if (JSON.stringify(filtered) !== JSON.stringify(state.tasks)) {
                if (state.notifs && filtered.length > 0) showNotification(filtered[0]);
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
        const canSkip = state.skippedTitles.length < state.maxSkips;
        n.innerHTML = `
            <div style="font-size:10px; font-weight:900; color:var(--t-accent); margin-bottom:5px; text-transform: uppercase;">Easiest Task Detected</div>
            <div style="font-weight:700; margin-bottom:16px; font-size: 13px; height:34px; overflow:hidden;">${t.title}</div>
            <div style="display:flex; gap:8px;">
                <a href="${t.link}" class="t-btn" style="flex:1.2;">Do it now</a>
                <button id="notif-skip" class="t-btn t-btn-sec" style="flex:1;">Skip (${state.skippedTitles.length}/${state.maxSkips})</button>
            </div>`;
        document.documentElement.appendChild(n);
        document.getElementById('notif-skip').onclick = () => {
            if (canSkip) {
                state.skippedTitles.push(t.title);
                GM_setValue("skippedTitles", state.skippedTitles);
                n.remove();
                shadowScan();
            } else { alert("Max skips reached! Reset them in the dashboard."); }
        };
        if (state.autoDismiss) setTimeout(() => n.remove(), state.dismissTime);
    }

    function showOverlay() {
        if (document.getElementById("t-bg")) return;
        const bg = document.createElement('div');
        bg.id = "t-bg";
        bg.innerHTML = `
            <div id="taskly-modal">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2 style="margin:0; font-weight:800;">Taskly</h2>
                    <span id="t-close" style="cursor:pointer; font-size:24px; opacity:0.5;">&times;</span>
                </div>
                <div id="t-wrap" style="flex:1; overflow:auto; padding-right:5px;"></div>
                <div style="margin-top:20px; display:flex; gap:10px;">
                    <button id="nav-list" class="t-btn ${state.view === 'list' ? '' : 't-btn-sec'}">Tasks</button>
                    <button id="nav-set" class="t-btn ${state.view === 'settings' ? '' : 't-btn-sec'}">Settings</button>
                </div>
            </div>`;
        document.documentElement.appendChild(bg);
        document.getElementById('t-close').onclick = () => bg.remove();
        document.getElementById('nav-list').onclick = () => { state.view = 'list'; render(); };
        document.getElementById('nav-set').onclick = () => { state.view = 'settings'; render(); };
        render();
    }

    function render() {
        const wrap = document.getElementById('t-wrap');
        if (!wrap) return;
        wrap.innerHTML = "";

        if (state.view === 'list') {
            const search = document.createElement('input');
            search.className = "t-input"; search.placeholder = "Search tasks..."; search.value = state.searchQuery;
            search.oninput = (e) => { state.searchQuery = e.target.value; updateList(listCont); };
            const listCont = document.createElement('div');
            wrap.appendChild(search);
            wrap.appendChild(listCont);
            updateList(listCont);
        } else {
            wrap.innerHTML = `
                <div class="t-setting-row"><span>Accent Color</span><input type="color" id="s-color" value="${state.accentColor}"></div>
                <div class="t-setting-row"><span>Notifications</span><input type="checkbox" id="s-notif" ${state.notifs ? 'checked' : ''}></div>
                <div class="t-setting-row"><span>Auto-Dismiss</span><input type="checkbox" id="s-auto" ${state.autoDismiss ? 'checked' : ''}></div>
                <div class="t-setting-row"><span>Dismiss Timer (ms)</span><input type="number" id="s-time" style="width:60px" value="${state.dismissTime}"></div>
                <div class="t-setting-row"><span>Compact Mode</span><input type="checkbox" id="s-comp" ${state.compactMode ? 'checked' : ''}></div>
                <div class="t-setting-row"><span>Max Skips</span><input type="number" id="s-max" style="width:40px" value="${state.maxSkips}"></div>
                <button id="s-reset-skips" class="t-btn t-btn-sec" style="width:100%; margin-top:20px;">Reset All Skips (${state.skippedTitles.length} used)</button>
            `;
            document.getElementById('s-color').onchange = (e) => { state.accentColor = e.target.value; GM_setValue("accentColor", e.target.value); injectStyles(); };
            document.getElementById('s-notif').onchange = (e) => { state.notifs = e.target.checked; GM_setValue("notifs", e.target.checked); };
            document.getElementById('s-auto').onchange = (e) => { state.autoDismiss = e.target.checked; GM_setValue("autoDismiss", e.target.checked); };
            document.getElementById('s-time').onchange = (e) => { state.dismissTime = parseInt(e.target.value); GM_setValue("dismissTime", state.dismissTime); };
            document.getElementById('s-comp').onchange = (e) => { state.compactMode = e.target.checked; GM_setValue("compactMode", e.target.checked); injectStyles(); };
            document.getElementById('s-max').onchange = (e) => { state.maxSkips = parseInt(e.target.value); GM_setValue("maxSkips", state.maxSkips); };
            document.getElementById('s-reset-skips').onclick = () => { state.skippedTitles = []; GM_setValue("skippedTitles", []); shadowScan(); render(); };
        }
    }

    function updateList(container) {
        container.innerHTML = "";
        const filtered = state.tasks.filter(t => t.title.toLowerCase().includes(state.searchQuery.toLowerCase()));
        filtered.forEach((t, i) => {
            const card = document.createElement('div');
            card.className = "t-card";
            card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
                <div><div style="font-weight:700;">${t.title}</div><div style="font-size:11px; opacity:0.6;">${t.sub} • Diff: ${t.difficulty.toFixed(1)}</div></div>
                <a href="${t.link}" class="t-btn">Start</a>
            </div>`;
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

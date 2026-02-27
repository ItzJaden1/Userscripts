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
        maxSkips: 3,
        view: 'list',
        searchQuery: "",
        accentColor: GM_getValue("accentColor", "#0267f0"),
        notifs: GM_getValue("notifs", true),
        autoDismiss: GM_getValue("autoDismiss", true),
        tpp: 4,
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
            
            #t-bg { position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.4) !important; backdrop-filter: blur(12px) !important; display: flex !important; justify-content: center !important; align-items: center !important; z-index: 2147483647 !important; animation: t-fade-in 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
            
            #taskly-modal { background: var(--t-bg); width: ${state.compactMode ? '520px' : '680px'}; border-radius: 28px; padding: 32px; box-shadow: 0 40px 80px rgba(0,0,0,0.4); display: flex; flex-direction: column; border: 1px solid var(--t-border); animation: t-modal-zoom 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
            
            .t-card { background: var(--t-card); border-radius: 16px; padding: 18px; margin-bottom: 12px; border: 1px solid var(--t-border); transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s; position: relative; overflow: hidden; }
            .t-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.15); }
            .t-card.easiest { border-left: 4px solid #4bb543; }
            
            .t-btn { background: var(--t-accent); color: #fff !important; padding: 8px 12px; border-radius: 10px; border: none; font-weight: 700; cursor: pointer; text-decoration: none !important; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; height: 34px; transition: filter 0.2s, transform 0.1s; }
            .t-btn:active { transform: scale(0.96); }
            .t-btn:hover { filter: brightness(1.1); }
            .t-btn-sec { background: rgba(120,120,120,0.15); color: var(--t-text) !important; }
            
            #taskly-notification { position: fixed; bottom: 25px; right: 25px; width: 360px; background: var(--t-bg); border-radius: 24px; padding: 18px; border-left: 5px solid #4bb543; box-shadow: 0 20px 50px rgba(0,0,0,0.3); z-index: 2147483647; border-top: 1px solid var(--t-border); border-right: 1px solid var(--t-border); backdrop-filter: blur(15px); animation: t-notif-slide 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
            
            .notif-exit { animation: t-notif-exit 0.4s cubic-bezier(0.4, 0, 1, 1) forwards !important; }

            @keyframes t-fade-in { from { opacity: 0; } to { opacity: 1; } }
            @keyframes t-modal-zoom { from { transform: scale(0.85) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
            @keyframes t-notif-slide { from { transform: translateX(100%) scale(0.9); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }
            @keyframes t-notif-exit { to { transform: translateX(100%) scale(0.9); opacity: 0; } }
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
        return { title, sub, difficulty, link, days };
    }

    const shadowScan = () => {
        const items = document.querySelectorAll(".c-calendar-list-accordion__item__content__item");
        if (items.length > 0) {
            const allTasks = Array.from(items).map(analyzeTask).sort((a,b) => a.difficulty - b.difficulty);
            let filtered = allTasks.filter(t => !state.skippedTitles.includes(t.title));
            if (filtered.length === 0 && allTasks.length > 0) { filtered = allTasks; }
            if (JSON.stringify(filtered) !== JSON.stringify(state.tasks)) {
                if (state.notifs && filtered.length > 0) { showNotification(filtered[0]); }
                state.tasks = filtered;
                GM_setValue("savedTasks", filtered);
                if(document.getElementById('t-bg')) render();
            }
        }
    };

    function dismissNotif(n) {
        n.classList.add('notif-exit');
        setTimeout(() => n.remove(), 400);
    }

    function showNotification(t) {
        if (!t || document.getElementById("taskly-notification")) return;
        const n = document.createElement('div');
        n.id = "taskly-notification";
        
        const canSkip = state.skippedTitles.length < state.maxSkips;
        const skipBtn = canSkip ? `<button id="notif-skip" class="t-btn t-btn-sec" style="flex: 1;">Skip (${state.skippedTitles.length}/${state.maxSkips})</button>` : '';

        n.innerHTML = `
            <div style="font-size:10px; font-weight:900; color:#4bb543; margin-bottom:5px; text-transform: uppercase; letter-spacing: 0.5px;">Easiest Task Detected</div>
            <div style="font-weight:700; margin-bottom:16px; line-height:1.3; font-size: 13px; height: 36px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${t.title}</div>
            <div style="display:flex; gap:8px; justify-content: space-between;">
                <a href="${t.link}" class="t-btn" style="background:#4bb543; flex: 1.2;">Do it now</a>
                <button id="notif-dash" class="t-btn t-btn-sec" style="flex: 1;">Dashboard</button>
                ${skipBtn}
            </div>`;
            
        document.documentElement.appendChild(n);
        
        document.getElementById('notif-dash').onclick = (e) => { e.stopPropagation(); dismissNotif(n); showOverlay(); };
        
        if (canSkip) {
            document.getElementById('notif-skip').onclick = (e) => {
                e.stopPropagation();
                state.skippedTitles.push(t.title);
                GM_setValue("skippedTitles", state.skippedTitles);
                dismissNotif(n);
                setTimeout(shadowScan, 450);
            };
        }

        if (state.autoDismiss) setTimeout(() => { if(n.parentElement) dismissNotif(n); }, 8000);
    }

    function showOverlay() {
        if (document.getElementById("t-bg")) return;
        const bg = document.createElement('div');
        bg.id = "t-bg";
        bg.innerHTML = `<div id="taskly-modal"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;"><h2 style="margin:0; font-weight:800; letter-spacing:-0.5px;">Taskly <span style="font-size: 12px; vertical-align: middle; opacity: 0.6;">Beta</span></h2><span id="t-close" style="cursor:pointer; font-size:24px; opacity:0.5; transition: opacity 0.2s;">&times;</span></div><div id="t-wrap" style="flex:1; overflow:auto;"></div><div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; gap:10px;"><button id="v-list" class="t-btn">Queue</button><button id="v-set" class="t-btn t-btn-sec">Clear Skips</button></div></div></div>`;
        document.documentElement.appendChild(bg);

        const closeBtn = document.getElementById('t-close');
        closeBtn.onmouseover = () => closeBtn.style.opacity = "1";
        closeBtn.onmouseout = () => closeBtn.style.opacity = "0.5";
        closeBtn.onclick = () => {
            bg.style.opacity = "0";
            bg.children[0].style.transform = "scale(0.9) translateY(20px)";
            setTimeout(() => bg.remove(), 300);
        };

        document.getElementById('v-list').onclick = () => { state.view = 'list'; render(); };
        document.getElementById('v-set').onclick = () => { 
            state.skippedTitles = []; 
            GM_setValue("skippedTitles", []); 
            shadowScan(); 
            render(); 
        };
        render();
    }

    function render() {
        const wrap = document.getElementById('t-wrap');
        if (!wrap) return;
        wrap.innerHTML = "";
        const search = document.createElement('input');
        search.className = "t-input"; search.placeholder = "Filter easiest tasks..."; search.value = state.searchQuery;
        search.oninput = (e) => { state.searchQuery = e.target.value; updateList(listCont); };
        const listCont = document.createElement('div');
        wrap.appendChild(search);
        const skipStatus = document.createElement('div');
        skipStatus.style = "font-size: 11px; opacity: 0.7; margin-bottom: 10px;";
        skipStatus.innerText = `Skips used: ${state.skippedTitles.length} / ${state.maxSkips}`;
        wrap.appendChild(skipStatus);
        wrap.appendChild(listCont);
        updateList(listCont);
    }

    function updateList(container) {
        container.innerHTML = "";
        const filtered = state.tasks.filter(t => t.title.toLowerCase().includes(state.searchQuery.toLowerCase()));
        if (filtered.length === 0) { container.innerHTML = `<div style="text-align:center; padding: 40px; opacity: 0.5;">No tasks found.</div>`; return; }
        filtered.slice(state.currentPage * state.tpp, (state.currentPage + 1) * state.tpp).forEach((t, i) => {
            const isFirst = i === 0 && state.searchQuery === "";
            const isCurrentlySkipped = state.skippedTitles.includes(t.title);
            const card = document.createElement('div');
            card.className = `t-card ${isFirst ? 'easiest' : ''}`;
            card.style.animation = `t-fade-in 0.3s ease forwards ${i * 0.05}s`;
            card.style.opacity = "0";
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <span style="background:${isFirst ? '#4bb543' : 'var(--t-accent)'}; color:#fff; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:800;">${t.sub}</span>
                        ${isCurrentlySkipped ? '<span style="color: #ffae00; font-size: 9px; margin-left: 8px; font-weight: bold;">SKIPPED</span>' : ''}
                        <div style="font-weight:700; margin-top:8px;">${t.title}</div>
                        <div style="font-size:11px; opacity:0.6; margin-top:4px;">Difficulty: ${t.difficulty.toFixed(1)}</div>
                    </div>
                    <a href="${t.link}" class="t-btn" style="background:${isFirst ? '#4bb543' : ''}">Start</a>
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

/**
 * Marp MQTT 遠端控制腳本 (註解提取強化版)
 * * 使用方式：
 * 1. 在 Marp Markdown 中引入依賴：
 * <script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script>
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
 * 2. 設定控制器網址與固定 ID (可選) 並引入此腳本：
 * <script>
 * window.MARP_REMOTE_CONTROLLER = "https://yourname.github.io/controller.html";
 * window.MARP_REMOTE_ROOM_ID = "DEMO2024"; 
 * </script>
 * <script src="https://yourname.github.io/marp-remote.js"></script>
 */

(function() {
    const CONTROLLER_URL = window.MARP_REMOTE_CONTROLLER || "https://chihchao.github.io/marp_sliders_controller/controller.html"; 
    const BROKER_URL = "wss://broker.hivemq.com:8884/mqtt";
    const roomId = window.MARP_REMOTE_ROOM_ID || Math.random().toString(36).substring(2, 10).toUpperCase();
    
    const TOPIC_CMD = `marp/remote/${roomId}/cmd`;
    const TOPIC_STATUS = `marp/remote/${roomId}/status`;

    const client = mqtt.connect(BROKER_URL, {
        clientId: 'marp_p_' + Math.random().toString(16).slice(2, 8)
    });

    const getPageInfo = () => {
        const pageHash = window.location.hash.replace('#', '');
        const current = parseInt(pageHash) || 1;
        const sections = document.querySelectorAll('section');
        return { current, total: sections.length, sections };
    };

    // 關鍵函數：從 HTML 註解中提取筆記
    const extractMarpNotes = (element) => {
        if (!element) return "";
        const notes = [];
        // 建立 TreeWalker 專門尋找註解節點 (Node.COMMENT_NODE = 8)
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_COMMENT, null, false);
        let node;
        while (node = walker.nextNode()) {
            const text = node.nodeValue.trim();
            // 排除 Marp 可能自帶的系統註解
            if (text && !text.startsWith('fit')) {
                notes.push(text);
            }
        }
        return notes.join('<br>');
    };

    const syncStatus = () => {
        if (!client.connected) return;
        const info = getPageInfo();
        const activeSection = info.sections[info.current - 1];
        
        const notes = extractMarpNotes(activeSection);
        const status = JSON.stringify({ 
            currentPage: info.current, 
            totalPages: info.total, 
            notes: notes 
        });
        
        client.publish(TOPIC_STATUS, status, { retain: true, qos: 1 });
    };

    client.on('connect', () => {
        client.subscribe(TOPIC_CMD);
        syncStatus();
    });

    client.on('message', (topic, message) => {
        if (topic === TOPIC_CMD) {
            const data = JSON.parse(message.toString());
            const info = getPageInfo();
            switch(data.action) {
                case 'next': if (info.current < info.total) window.location.hash = `#${info.current + 1}`; break;
                case 'prev': if (info.current > 1) window.location.hash = `#${info.current - 1}`; break;
                case 'restart': window.location.hash = "#1"; break;
                case 'jump': window.location.hash = `#${data.value}`; break;
            }
            setTimeout(syncStatus, 100);
        }
    });

    window.addEventListener('hashchange', syncStatus);

    // QR Code 介面
    window.addEventListener('load', () => {
        const div = document.createElement('div');
        div.id = 'marp-qr-overlay';
        Object.assign(div.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '9999',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            color: 'white', fontFamily: 'sans-serif'
        });
        div.innerHTML = `<div style="background:white;padding:15px;border-radius:10px" id="qr"></div>
                         <p style="margin-top:15px">Room: ${roomId}</p>
                         <p style="font-size:12px;color:#666">Press [K] to toggle</p>`;
        document.body.appendChild(div);
        new QRCode(document.getElementById("qr"), { text: `${CONTROLLER_URL}?room=${roomId}`, width: 200, height: 200 });
        
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'k') div.style.display = div.style.display === 'none' ? 'flex' : 'none';
        });
    });
})();

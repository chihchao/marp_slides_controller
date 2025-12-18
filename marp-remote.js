/**
 * Marp MQTT 遠端控制腳本 (穩定修復版)
 * * 使用方式：
 * 1. 在 Marp Markdown 中引入依賴：
 * <script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script>
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
 * 2. 定義設定並引入此腳本：
 * <script>
 * window.MARP_REMOTE_CONTROLLER = "https://yourname.github.io/controller.html";
 * window.MARP_REMOTE_ROOM_ID = "DEMO2024"; // 指定固定 ID
 * </script>
 * <script src="https://yourname.github.io/marp-remote.js"></script>
 */

(function() {
    // === 1. 配置與初始化 ===
    const CONTROLLER_URL = window.MARP_REMOTE_CONTROLLER || "https://chihchao.github.io/marp_sliders_controller/controller.html"; 
    const BROKER_URL = "wss://broker.hivemq.com:8884/mqtt";
    
    // 指定或隨機產生 Room ID
    const roomId = window.MARP_REMOTE_ROOM_ID || Math.random().toString(36).substring(2, 10).toUpperCase();
    const TOPIC_CMD = `marp/remote/${roomId}/cmd`;
    const TOPIC_STATUS = `marp/remote/${roomId}/status`;

    // 建立連線 (加上隨機 clientId 避免與手機端衝突)
    const client = mqtt.connect(BROKER_URL, {
        clientId: 'marp_presenter_' + Math.random().toString(16).slice(2, 8)
    });

    const getPageInfo = () => {
        const pageHash = window.location.hash.replace('#', '');
        const current = parseInt(pageHash) || 1;
        const sections = document.querySelectorAll('section');
        return { current, total: sections.length, sections };
    };

    // === 2. UI 建立 (QR Code) ===
    const createOverlay = () => {
        const div = document.createElement('div');
        div.id = 'marp-remote-qr-overlay';
        Object.assign(div.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.95)', zIndex: '9999',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            color: 'white', fontFamily: 'sans-serif', transition: 'opacity 0.3s'
        });
        div.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 12px;" id="marp-qrcode"></div>
            <h2 style="margin-top: 24px; font-size: 1.5rem;">掃描遙控簡報</h2>
            <p style="margin-top: 8px; color: #888;">ROOM ID: <span style="color: #3b82f6; font-weight: bold;">${roomId}</span></p>
            <div style="margin-top: 30px; font-size: 0.8rem; color: #555;">按 [ K ] 鍵開關視窗</div>
        `;
        document.body.appendChild(div);

        const fullUrl = `${CONTROLLER_URL}?room=${roomId}`;
        new QRCode(document.getElementById("marp-qrcode"), {
            text: fullUrl, width: 256, height: 256
        });
        return div;
    };

    let overlay;
    window.addEventListener('load', () => { overlay = createOverlay(); });

    // === 3. 通訊邏輯 ===
    client.on('connect', () => {
        console.log("Presenter Connected. Room:", roomId);
        client.subscribe(TOPIC_CMD);
        syncStatus(); // 連線成功立刻同步一次
    });

    client.on('message', (topic, message) => {
        if (topic === TOPIC_CMD) {
            try {
                const data = JSON.parse(message.toString());
                const info = getPageInfo();
                
                switch(data.action) {
                    case 'next':
                        if (info.current < info.total) window.location.hash = `#${info.current + 1}`;
                        break;
                    case 'prev':
                        if (info.current > 1) window.location.hash = `#${info.current - 1}`;
                        break;
                    case 'restart':
                        window.location.hash = "#1";
                        break;
                    case 'jump':
                        if (data.value >= 1 && data.value <= info.total) window.location.hash = `#${data.value}`;
                        break;
                }
                setTimeout(syncStatus, 50); // 確保導航完成後同步
            } catch (e) { console.error("Cmd error:", e); }
        }
    });

    function syncStatus() {
        if (!client.connected) return;
        const info = getPageInfo();
        const activeSection = info.sections[info.current - 1];
        let notes = "";
        if (activeSection) {
            const aside = activeSection.querySelector('aside');
            notes = aside ? aside.innerHTML : "";
        }
        const status = JSON.stringify({ currentPage: info.current, totalPages: info.total, notes });
        // 使用 retain: true 讓手機端進入時能即時拿到最新頁碼
        client.publish(TOPIC_STATUS, status, { retain: true, qos: 1 });
    }

    window.addEventListener('hashchange', syncStatus);
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'k' && overlay) {
            overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
        }
    });
})();

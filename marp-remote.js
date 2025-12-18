/**
 * Marp MQTT 遠端控制腳本 (通用託管版本)
 * * 使用方式：
 * 1. 在 Marp Markdown 中引入依賴：
 * <script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script>
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
 * 2. 定義控制器網址並引入此腳本：
 * <script>window.MARP_REMOTE_CONTROLLER = "https://yourname.github.io/controller.html";</script>
 * <script src="https://yourname.github.io/marp-remote.js"></script>
 */

(function() {
    // === 配置解析 ===
    // 優先讀取全域變數 window.MARP_REMOTE_CONTROLLER，若無則使用預設值
    const CONTROLLER_URL = window.MARP_REMOTE_CONTROLLER || "https://chihchao.github.io/marp_sliders_controller/controller.html"; 
    const BROKER_URL = "wss://broker.hivemq.com:8884/mqtt";
    
    // 生成隨機且唯一的 Room ID
    const roomId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const TOPIC_CMD = `marp/remote/${roomId}/cmd`;
    const TOPIC_STATUS = `marp/remote/${roomId}/status`;

    const client = mqtt.connect(BROKER_URL);

    // 建立 QR Code 覆蓋層 UI
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
            <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);" id="marp-qrcode"></div>
            <h2 style="margin-top: 24px; font-size: 1.5rem; letter-spacing: 1px;">掃描開始遙控</h2>
            <p style="margin-top: 8px; color: #888;">ROOM ID: <span style="color: #3b82f6; font-weight: bold; font-family: monospace;">${roomId}</span></p>
            <div style="margin-top: 30px; padding: 10px 20px; border: 1px solid #444; border-radius: 8px; font-size: 0.8rem; color: #666;">
                按 <kbd style="background: #333; color: #fff; padding: 2px 6px; border-radius: 4px; border: 1px solid #555;">K</kbd> 鍵開關此視窗
            </div>
        `;
        document.body.appendChild(div);

        // 生成 QR Code
        const fullUrl = `${CONTROLLER_URL}?room=${roomId}`;
        new QRCode(document.getElementById("marp-qrcode"), {
            text: fullUrl,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff"
        });
        return div;
    };

    let overlay;
    
    // 確保 DOM 載入後再建立 UI
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { overlay = createOverlay(); });
    } else {
        overlay = createOverlay();
    }

    // 1. MQTT 指令監聽
    client.on('connect', () => {
        console.log("MQTT Connected. Room ID:", roomId);
        client.subscribe(TOPIC_CMD);
        syncStatus();
    });

    client.on('message', (topic, message) => {
        if (topic === TOPIC_CMD) {
            try {
                const data = JSON.parse(message.toString());
                switch(data.action) {
                    case 'next':
                        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
                        break;
                    case 'prev':
                        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
                        break;
                    case 'restart':
                        window.location.hash = "#1";
                        break;
                    case 'jump':
                        window.location.hash = `#${data.value}`;
                        break;
                }
            } catch (e) { console.error("Command error:", e); }
        }
    });

    // 2. 狀態同步
    function syncStatus() {
        if (!client.connected) return;

        const pageHash = window.location.hash.replace('#', '');
        const currentPage = parseInt(pageHash) || 1;
        const totalPages = document.querySelectorAll('section').length;

        const activeSection = document.querySelector(`section#${currentPage}`) || document.querySelectorAll('section')[currentPage - 1];
        let notes = "";
        if (activeSection) {
            const aside = activeSection.querySelector('aside');
            notes = aside ? aside.innerHTML : "";
        }

        const status = JSON.stringify({ currentPage, totalPages, notes });
        client.publish(TOPIC_STATUS, status, { retain: true });
    }

    window.addEventListener('hashchange', syncStatus);

    // 3. 熱鍵控制
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'k' && overlay) {
            overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
        }
    });

})();

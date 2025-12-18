/**
 * Marp MQTT 遠端控制腳本 (通用託管版本)
 * * 使用方式：
 * 1. 在 Marp Markdown 中引入依賴：
 * <script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script>
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
 * 2. 定義控制器網址、指定 Room ID (可選) 並引入此腳本：
 * <script>
 * window.MARP_REMOTE_CONTROLLER = "https://yourname.github.io/controller.html";
 * window.MARP_REMOTE_ROOM_ID = "MY_FIXED_ID"; // 指定固定 ID，若不設定則亂數產生
 * </script>
 * <script src="https://yourname.github.io/marp-remote.js"></script>
 */

(function() {
    // === 配置解析 ===
    const CONTROLLER_URL = window.MARP_REMOTE_CONTROLLER || "https://chihchao.github.io/marp_sliders_controller/controller.html"; 
    const BROKER_URL = "wss://broker.hivemq.com:8884/mqtt";
    
    // 優先使用指定的 Room ID，否則產生隨機 ID
    const roomId = window.MARP_REMOTE_ROOM_ID || Math.random().toString(36).substring(2, 10).toUpperCase();
    const TOPIC_CMD = `marp/remote/${roomId}/cmd`;
    const TOPIC_STATUS = `marp/remote/${roomId}/status`;

    const client = mqtt.connect(BROKER_URL);

    // 取得目前頁碼與總頁數的輔助工具
    const getPageInfo = () => {
        const pageHash = window.location.hash.replace('#', '');
        const current = parseInt(pageHash) || 1;
        // Marp 簡報的每一頁都是一個 section
        const sections = document.querySelectorAll('section');
        return { 
            current: current, 
            total: sections.length,
            sections: sections 
        };
    };

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
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { overlay = createOverlay(); });
    } else {
        overlay = createOverlay();
    }

    // 1. MQTT 指令監聽與執行
    client.on('connect', () => {
        console.log("MQTT Connected. Room ID:", roomId);
        client.subscribe(TOPIC_CMD);
        syncStatus();
    });

    client.on('message', (topic, message) => {
        if (topic === TOPIC_CMD) {
            try {
                const data = JSON.parse(message.toString());
                const info = getPageInfo();
                
                console.log("Processing command:", data.action, "at page", info.current, "/", info.total);

                switch(data.action) {
                    case 'next':
                        if (info.current < info.total) {
                            window.location.hash = `#${info.current + 1}`;
                        } else {
                            console.log("Already at the last page.");
                        }
                        break;
                    case 'prev':
                        if (info.current > 1) {
                            window.location.hash = `#${info.current - 1}`;
                        } else {
                            console.log("Already at the first page.");
                        }
                        break;
                    case 'restart':
                        window.location.hash = "#1";
                        break;
                    case 'jump':
                        if (data.value >= 1 && data.value <= info.total) {
                            window.location.hash = `#${data.value}`;
                        }
                        break;
                }
                // 指令執行後稍微延遲同步，確保 hashchange 已經觸發完畢
                setTimeout(syncStatus, 100); 
            } catch (e) { console.error("Command error:", e); }
        }
    });

    // 2. 狀態同步：從簡報端傳送資訊至手機端
    function syncStatus() {
        if (!client.connected) return;

        const info = getPageInfo();
        // 使用索引抓取當前 section，避免 ID 選取器失效
        const activeSection = info.sections[info.current - 1];
        
        let notes = "";
        if (activeSection) {
            // 抓取備忘錄 (Marp 通常放在 aside 中)
            const aside = activeSection.querySelector('aside');
            notes = aside ? aside.innerHTML : "";
        }

        const status = JSON.stringify({ 
            currentPage: info.current, 
            totalPages: info.total, 
            notes: notes 
        });
        
        console.log("Syncing status to controller:", { page: info.current, total: info.total });
        
        // 使用 retain: true 確保手機端連線時能立即獲取最後狀態
        client.publish(TOPIC_STATUS, status, { retain: true, qos: 1 });
    }

    // 監聽網址變化 (不論是手動還是指令觸發)
    window.addEventListener('hashchange', syncStatus);

    // 3. 熱鍵控制
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'k' && overlay) {
            overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
        }
    });

})();

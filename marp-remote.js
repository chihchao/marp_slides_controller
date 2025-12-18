/**
 * Marp MQTT 遠端控制腳本 (嵌入簡報用)
 * * 使用說明：
 * 1. 將此腳本貼在 Marp Markdown 檔案的最下方，並用 <script> 標籤包起來。
 * 2. 確保在 Markdown 中也引入了 mqtt.js 與 qrcode.js。
 */

(function() {
    // === 配置區 ===
    // 請將此網址改為您部署 controller.html 的實際網址
    const CONTROLLER_URL = "https://chihchao.github.io/marp_sliders_controller/controller.html"; 
    const BROKER_URL = "wss://broker.hivemq.com:8884/mqtt";
    
    // 生成隨機且唯一的 Room ID (8位字串)
    const roomId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const TOPIC_CMD = `marp/remote/${roomId}/cmd`;
    const TOPIC_STATUS = `marp/remote/${roomId}/status`;

    // 建立 MQTT 連線
    const client = mqtt.connect(BROKER_URL);

    // 建立 QR Code 覆蓋層 UI
    const createOverlay = () => {
        const div = document.createElement('div');
        div.id = 'marp-remote-qr-overlay';
        Object.assign(div.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '9999',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            color: 'white', fontFamily: 'sans-serif', transition: 'opacity 0.3s'
        });
        div.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);" id="marp-qrcode"></div>
            <h2 style="margin-top: 24px; font-size: 1.5rem;">掃描開始遙控</h2>
            <p style="margin-top: 8px; color: #888;">房間 ID: <span style="color: #3b82f6; font-weight: bold;">${roomId}</span></p>
            <p style="margin-top: 20px; font-size: 0.9rem; color: #555;">按下 [ K ] 鍵可隨時開關此視窗</p>
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

    const overlay = createOverlay();

    // 1. MQTT 指令監聽
    client.on('connect', () => {
        console.log("MQTT Connected. Room:", roomId);
        client.subscribe(TOPIC_CMD);
        syncStatus(); // 初始同步
    });

    client.on('message', (topic, message) => {
        if (topic === TOPIC_CMD) {
            const data = JSON.parse(message.toString());
            console.log("Command Received:", data.action);
            
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
        }
    });

    // 2. 狀態同步 (傳送至手機)
    function syncStatus() {
        if (!client.connected) return;

        const pageHash = window.location.hash.replace('#', '');
        const currentPage = parseInt(pageHash) || 1;
        const totalPages = document.querySelectorAll('section').length;

        // 提取當前頁面的 Speaker Notes
        // Marp 通常將 notes 放在 section 內的 aside 標籤中
        const activeSection = document.querySelector(`section#${currentPage}`) || document.querySelectorAll('section')[currentPage - 1];
        let notes = "";
        if (activeSection) {
            const aside = activeSection.querySelector('aside');
            notes = aside ? aside.innerHTML : "";
        }

        const status = JSON.stringify({ currentPage, totalPages, notes });
        client.publish(TOPIC_STATUS, status, { retain: true });
    }

    // 監聽換頁事件
    window.addEventListener('hashchange', syncStatus);

    // 3. 熱鍵控制 (K 鍵切換 QR Code)
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'k') {
            overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
        }
    });

})();

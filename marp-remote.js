/**
 * Marp MQTT 遠端控制腳本（提取 notes + 隱藏式 QRCode）
 *
 * 使用方式：
 * 1) 在 Marp HTML 尾端插入依賴：
 *    <script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script>
 *    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
 * 2) 可選：自訂控制器與固定房間 ID
 *    window.MARP_REMOTE_CONTROLLER = "https://yourname.github.io/controller.html";
 *    window.MARP_REMOTE_ROOM_ID = "DEMOHELLOMARP2025";
 * 3) 載入本檔：<script src="https://chihchao.github.io/marp_sliders_controller/marp-remote.js"></script>
 *
 * 簡報端會：
 * - 建立 MQTT 連線，持續送出頁碼與講稿到 `marp/remote/{roomId}/status`
 * - 監聽 `marp/remote/{roomId}/cmd` 的控制指令
 * - 按 K 才生成/顯示 QRCode（預設隱藏）
 */

(function() {
    // === 1. 配置解析 ===
    const CONTROLLER_URL = window.MARP_REMOTE_CONTROLLER || "https://chihchao.github.io/marp_sliders_controller/controller.html"; 
    const BROKER_URL = "wss://broker.hivemq.com:8884/mqtt";
    const roomId = window.MARP_REMOTE_ROOM_ID || Math.random().toString(36).substring(2, 10).toUpperCase();
    
    const TOPIC_CMD = `marp/remote/${roomId}/cmd`;
    const TOPIC_STATUS = `marp/remote/${roomId}/status`;

    // 建立唯一的 Client ID 避免衝突
    const client = mqtt.connect(BROKER_URL, {
        clientId: 'marp_host_' + Math.random().toString(16).slice(2, 8)
    });

    // 取得目前簡報資訊
    const getPageInfo = () => {
        const pageHash = window.location.hash.replace('#', '');
        const current = parseInt(pageHash) || 1;
        const sections = document.querySelectorAll('section');
        return { current, total: sections.length, sections };
    };

    // 深度優先提取該頁面所有 HTML 註解內容 (Node.COMMENT_NODE = 8)
    const getAllComments = (root) => {
        const comments = [];
        const walk = (node) => {
            if (node.nodeType === 8) { // 註解節點
                const text = node.nodeValue.trim();
                // 排除系統內建註解 (如 Marp 的 fit 或指令)
                if (text && !text.startsWith('fit') && !text.startsWith('scald')) {
                    comments.push(text);
                }
            }
            if (node.childNodes) {
                node.childNodes.forEach(walk);
            }
        };
        walk(root);
        return comments.join('<br>');
    };

    // 取得目前頁面的講稿（Marp notes 優先，否則讀 section 註解）
    const getSpeakerNotes = () => {
        const info = getPageInfo();
        const slideIndex = info.current - 1;

        // 1) 嘗試讀取 Marp 產生的 presenter notes
        const noteEl = document.querySelector(`.bespoke-marp-note[data-index="${slideIndex}"]`);
        if (noteEl) {
            // Marp 產生的 note 會包在 <p> 中，取出所有段落文本後組成 HTML
            const paragraphs = Array.from(noteEl.querySelectorAll('p'));
            const texts = paragraphs.length
                ? paragraphs.map(p => (p.textContent || '').trim()).filter(Boolean)
                : [(noteEl.textContent || '').trim()];
            const merged = texts.join('<br>');
            return merged;
        }

        // 2) 回退：讀取 section 註解
        const activeSection = info.sections[slideIndex];
        const commentNotes = activeSection ? getAllComments(activeSection) : '';
        return commentNotes;
    };

    // 同步狀態到手機端
    const syncStatus = () => {
        if (!client.connected) return;
        
        const info = getPageInfo();
        // 提取講稿內容 (Marp presenter note > section 註解)
        const notes = getSpeakerNotes();
        
        const statusPayload = JSON.stringify({ 
            currentPage: info.current, 
            totalPages: info.total, 
            notes: notes 
        });
        
        // 使用 retain: true 讓新連入的手機能立刻取得最後狀態
        client.publish(TOPIC_STATUS, statusPayload, { retain: true, qos: 1 });
        console.log("Status Synced:", { page: info.current, hasNotes: !!notes });
    };

    // === 2. MQTT 通訊處理 ===
    client.on('connect', () => {
        console.log("Marp Presenter Connected. Room ID:", roomId);
        client.subscribe(TOPIC_CMD);
        syncStatus(); // 連線時立即同步
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
                        window.location.hash = `#${data.value}`;
                        break;
                }
                // 指令執行後稍微延遲，等待 DOM 與 Hash 更新後再同步
                setTimeout(syncStatus, 150);
            } catch (e) {
                console.error("Failed to parse command", e);
            }
        }
    });

    // 監聽本地換頁 (如按鍵盤左右鍵)
    window.addEventListener('hashchange', syncStatus);

    // === 3. QR Code 介面建立（延遲建立：按下 K 才生成與顯示） ===
    window.addEventListener('load', () => {
        let overlay = null;
        let overlayVisible = false;

        const ensureOverlay = () => {
            if (overlay) return overlay;

            overlay = document.createElement('div');
            overlay.id = 'marp-qr-overlay';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
                backgroundColor: 'rgba(0,0,0,0.95)', zIndex: '9999',
                display: 'none', // 預設不顯示，按 K 才出現
                flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                color: 'white', fontFamily: 'sans-serif'
            });

            overlay.innerHTML = `
                <div style="background: white; padding: 15px; border-radius: 12px; box-shadow: 0 0 30px rgba(0,0,0,0.5);" id="marp-qrcode-box"></div>
                <p style="margin-top: 20px; font-size: 1.2rem; font-weight: bold;">Marp 遠端控制</p>
                <p style="margin-top: 5px; color: #888; font-family: monospace;">Room: ${roomId}</p>
                <p style="margin-top: 30px; font-size: 0.8rem; opacity: 0.6;">按 [ K ] 鍵關閉此視窗</p>
            `;
            document.body.appendChild(overlay);

            // 生成 QR Code（在第一次按 K 時才建立）
            new QRCode(document.getElementById("marp-qrcode-box"), {
                text: `${CONTROLLER_URL}?room=${roomId}`,
                width: 256,
                height: 256
            });

            return overlay;
        };

        const applyOverlayVisibility = (visible) => {
            const target = ensureOverlay();
            target.style.display = visible ? 'flex' : 'none';
            overlayVisible = visible;
        };

        const toggleOverlay = () => {
            applyOverlayVisibility(!overlayVisible);
        };

        // 監聽 K 鍵開關介面
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'k') {
                toggleOverlay();
            }
        });

        // 確保初始狀態為隱藏 (若舊版留下的 overlay 仍存在)
        const staleOverlay = document.getElementById('marp-qr-overlay');
        if (staleOverlay) staleOverlay.style.display = 'none';
    });

})();

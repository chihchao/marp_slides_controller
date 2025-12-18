# Marp Slide Controller


在您的 Marp Markdown 檔案中，貼入以下 HTML 標籤：

```
<!-- 引入必要依賴 -->
<script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

<!-- 設定控制器網址並載入腳本 -->
<script>
  // 這行可以讓你隨時更換控制器的位置，而不必動到 GitHub 上的腳本
  // window.MARP_REMOTE_CONTROLLER = "https://yourname.github.io/controller.html";
</script>
<script src="https://chihchao.github.io/marp_sliders_controller/marp-remote.js"></script>
```
### 注意事項：
1. **GitHub Pages 快取**：如果你修改了 `marp-remote.js` 並推送到 GitHub，瀏覽器可能會有快取。測試時如果沒反應，可以試著強制重新整理（Ctrl+F5）。
2. **依賴順序**：務必確保 `mqtt.min.js` 和 `qrcode.min.js` 在 `marp-remote.js` **之前**載入。
3. **HTTPS**：GitHub Pages 預設使用 HTTPS，這與腳本中使用的 `wss://`（加密 WebSocket）完全相容。


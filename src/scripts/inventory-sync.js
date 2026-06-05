/**
 * @file Inventory synchronization for the AQW account page.
 * @description Fetches the player's full inventory from the AQW account API
 *   and persists it to chrome.storage.local.
 * 
 * @version 3.0.7 - Sync button in grid toolbar (blue color, next to Refresh)
 */

// Hanya jalan di halaman Inventory Management yang tepat
if (window.location.pathname === "/AQW/Inventory" || window.location.pathname === "/AQW/Inventory/") {

    // ============================================================
    // FETCH INVENTORY FROM WORKING API
    // ============================================================
    
    async function fetchInventoryFromAPI() {
        console.log("[AQWikiTools] Fetching inventory from API...");
        
        let allItems = [];
        let skip = 0;
        const take = 300;
        let page = 1;
        let consecutiveErrors = 0;
        
        try {
            while (consecutiveErrors < 3) {
                console.log(`[AQWikiTools] Fetching skip=${skip}, take=${take} (page ${page})...`);
                
                try {
                    const response = await fetch(
                        `https://account.aq.com/myapi/inventory/InventoryData?skip=${skip}&take=${take}&requireTotalCount=true&sort=[{"selector":"Added","desc":true}]&_=${Date.now() + page}`,
                        {
                            headers: {
                                "accept": "application/json, text/javascript, */*; q=0.01",
                                "x-requested-with": "XMLHttpRequest"
                            },
                            credentials: "include"
                        }
                    );
                    
                    if (response.status === 500) {
                        console.warn(`[AQWikiTools] Server error 500 at skip=${skip}. Stopping pagination.`);
                        showStatusMessage(`Stopped at ${allItems.length} items (server limit reached)`, "warning");
                        break;
                    }
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    
                    if (!data.data || data.data.length === 0) {
                        console.log(`[AQWikiTools] No more items at skip=${skip}`);
                        break;
                    }
                    
                    const processedItems = processAPIData(data.data);
                    allItems.push(...processedItems);
                    console.log(`[AQWikiTools] Page ${page}: ${processedItems.length} items (total: ${allItems.length})`);
                    
                    if (data.totalCount && allItems.length >= data.totalCount) {
                        console.log(`[AQWikiTools] Reached total count: ${data.totalCount}`);
                        break;
                    }
                    
                    if (data.data.length < take) {
                        console.log(`[AQWikiTools] Last page (got ${data.data.length} < ${take})`);
                        break;
                    }
                    
                    skip += take;
                    page++;
                    consecutiveErrors = 0;
                    await new Promise(r => setTimeout(r, 100));
                    
                } catch (fetchError) {
                    consecutiveErrors++;
                    console.error(`[AQWikiTools] Fetch error (attempt ${consecutiveErrors}):`, fetchError);
                    
                    if (consecutiveErrors >= 3) {
                        console.error("[AQWikiTools] Too many consecutive errors, stopping.");
                        showStatusMessage(`Stopped at ${allItems.length} items due to errors`, "error");
                        break;
                    }
                    
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            
            console.log(`[AQWikiTools] ✅ TOTAL: ${allItems.length} items fetched via API`);
            return allItems;
            
        } catch (error) {
            console.error("[AQWikiTools] Fatal API error:", error);
            throw error;
        }
    }
    
    function processAPIData(data) {
        return data.map(item => {
            let itemName = item.Name || "";
            let quantity = item.Count || 1;
            
            const match = itemName.match(/(.*?)\s+x(\d+)$/i);
            if (match && quantity === 1) {
                itemName = match[1].trim();
                quantity = parseInt(match[2], 10);
            }
            
            return {
                name: itemName,
                quantity: quantity,
                location: item.Bank === 1 ? "Bank" : "Inventory",
                type: item.Type || "",
                currency: item.AC === 1 ? "AC" : "Gold",
                category: item.Member === 1 ? "Member" : "Free",
                rawName: item.Name || "",
                added: item.Added || null
            };
        });
    }
    
    async function saveInventoryToStorage(inventory) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ 
                savedInventory: inventory,
                savedInventoryLastSync: Date.now(),
                savedInventoryCount: inventory.length
            }, () => {
                console.log(`[AQWikiTools] ✅ Saved ${inventory.length} items to storage`);
                resolve();
            });
        });
    }
    
    async function loadInventoryFromStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get(["savedInventory"], (result) => {
                resolve(result.savedInventory || []);
            });
        });
    }
    
    function showStatusMessage(message, type = "info") {
        let statusDiv = document.getElementById("aqw-sync-status");
        if (!statusDiv) {
            statusDiv = document.createElement("div");
            statusDiv.id = "aqw-sync-status";
            statusDiv.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: bold;
                font-family: Arial, sans-serif;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                transition: opacity 0.5s ease;
                pointer-events: none;
            `;
            document.body.appendChild(statusDiv);
        }
        
        const colors = {
            success: "#4caf50",
            error: "#f44336",
            warning: "#ff9800",
            info: "#2196f3"
        };
        
        statusDiv.style.backgroundColor = colors[type] || colors.info;
        statusDiv.style.color = "white";
        statusDiv.style.opacity = "1";
        statusDiv.textContent = message;
        
        setTimeout(() => {
            statusDiv.style.opacity = "0";
            setTimeout(() => {
                if (statusDiv.parentNode) statusDiv.remove();
            }, 500);
        }, 4000);
    }
    
    // ============================================================
    // ADD ANIMATION CSS
    // ============================================================
    
    function addAnimationCSS() {
        if (!document.getElementById("aqw-animation-style")) {
            const style = document.createElement("style");
            style.id = "aqw-animation-style";
            style.textContent = `
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .aqw-spinning {
                    animation: spin 0.5s linear !important;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // ============================================================
    // ADD SYNC BUTTON TO GRID TOOLBAR (blue color, next to Refresh)
    // ============================================================
    
    function addSyncButtonToGridToolbar() {
        console.log("[AQWikiTools] Looking to add sync button to grid toolbar...");
        
        // Cek apakah tombol sudah ada
        let syncButton = document.getElementById("aqw-manual-sync-btn");
        if (syncButton) {
            console.log("[AQWikiTools] Sync button already exists");
            return;
        }
        
        // Tunggu DataGrid toolbar tersedia
        const findToolbar = setInterval(() => {
            const toolbarBefore = document.querySelector(".dx-toolbar-items-container .dx-toolbar-before");
            if (toolbarBefore && !document.getElementById("aqw-manual-sync-btn")) {
                clearInterval(findToolbar);
                
                // Cari tombol Refresh yang sudah ada
                const existingRefreshBtn = Array.from(document.querySelectorAll(".dx-button")).find(
                    btn => btn.getAttribute("aria-label") === "Refresh" || 
                           (btn.textContent && btn.textContent.includes("Refresh"))
                );
                
                // Buat tombol sync dengan warna biru (primary)
                const syncBtnContainer = document.createElement("div");
                syncBtnContainer.id = "aqw-manual-sync-btn";
                syncBtnContainer.className = "dx-item dx-toolbar-item dx-toolbar-button";
                syncBtnContainer.style.marginLeft = "5px";
                syncBtnContainer.innerHTML = `
                    <div class="dx-item-content dx-toolbar-item-content">
                        <div role="button" aria-label="Sync Inventory" class="dx-widget dx-button dx-button-mode-contained dx-button-normal dx-button-has-text dx-button-has-icon dx-button-success" tabindex="0" title="Sync inventory to local storage" id="aqw-sync-grid-btn" style="background-color: #007bff; border-color: #007bff;">
                            <div class="dx-button-content">
                                <i class="dx-icon dx-icon-download"></i>
                                <span class="dx-button-text">Sync Inventory</span>
                            </div>
                        </div>
                    </div>
                `;
                
                // Sisipkan setelah tombol Refresh jika ada
                if (existingRefreshBtn) {
                    const refreshContainer = existingRefreshBtn.closest(".dx-toolbar-item");
                    if (refreshContainer && refreshContainer.nextSibling) {
                        toolbarBefore.insertBefore(syncBtnContainer, refreshContainer.nextSibling);
                    } else if (refreshContainer) {
                        toolbarBefore.appendChild(syncBtnContainer);
                    } else {
                        toolbarBefore.appendChild(syncBtnContainer);
                    }
                } else {
                    toolbarBefore.appendChild(syncBtnContainer);
                }
                
                // Event listener untuk sync
                const syncGridBtn = document.getElementById("aqw-sync-grid-btn");
                if (syncGridBtn) {
                    // Tambahkan efek hover
                    syncGridBtn.addEventListener("mouseenter", () => {
                        syncGridBtn.style.backgroundColor = "#0056b3";
                        syncGridBtn.style.borderColor = "#0056b3";
                    });
                    syncGridBtn.addEventListener("mouseleave", () => {
                        syncGridBtn.style.backgroundColor = "#007bff";
                        syncGridBtn.style.borderColor = "#007bff";
                    });
                    
                    syncGridBtn.addEventListener("click", async () => {
                        const icon = syncGridBtn.querySelector(".dx-icon");
                        if (icon) {
                            icon.classList.add("aqw-spinning");
                            setTimeout(() => icon.classList.remove("aqw-spinning"), 500);
                        }
                        
                        const originalText = syncGridBtn.querySelector(".dx-button-text").textContent;
                        syncGridBtn.querySelector(".dx-button-text").textContent = "Syncing...";
                        syncGridBtn.style.pointerEvents = "none";
                        syncGridBtn.style.opacity = "0.7";
                        
                        await synchronizeInventory();
                        
                        syncGridBtn.querySelector(".dx-button-text").textContent = originalText;
                        syncGridBtn.style.pointerEvents = "";
                        syncGridBtn.style.opacity = "";
                    });
                }
                
                console.log("[AQWikiTools] ✅ Blue sync button added to grid toolbar!");
                
                // Tampilkan info last sync
                addLastSyncInfo();
            }
        }, 500);
    }
    
    // ============================================================
    // ADD LAST SYNC INFO TO TOOLBAR
    // ============================================================
    
    function addLastSyncInfo() {
        chrome.storage.local.get(["savedInventoryCount", "savedInventoryLastSync"], (result) => {
            if (result.savedInventoryCount) {
                const toolbarAfter = document.querySelector(".dx-toolbar-items-container .dx-toolbar-after");
                if (toolbarAfter && !document.getElementById("aqw-sync-info")) {
                    const infoContainer = document.createElement("div");
                    infoContainer.id = "aqw-sync-info";
                    infoContainer.className = "dx-item dx-toolbar-item";
                    infoContainer.style.cssText = "margin-left: 10px; font-size: 11px; color: #666;";
                    
                    const lastSync = result.savedInventoryLastSync ? new Date(result.savedInventoryLastSync).toLocaleString() : "never";
                    infoContainer.innerHTML = `
                        <div class="dx-item-content dx-toolbar-item-content">
                            <span>📦 ${result.savedInventoryCount} items cached | Last sync: ${lastSync}</span>
                        </div>
                    `;
                    toolbarAfter.appendChild(infoContainer);
                }
            }
        });
    }
    
    // ============================================================
    // MAIN SYNC - MANUAL ONLY (NO AUTO SYNC)
    // ============================================================
    
    async function synchronizeInventory() {
        console.log("[AQWikiTools] 🔄 Starting manual inventory synchronization...");
        
        showStatusMessage("Syncing inventory...", "info");
        
        try {
            const inventory = await fetchInventoryFromAPI();
            await saveInventoryToStorage(inventory);
            showStatusMessage(`✅ Synced ${inventory.length} items successfully!`, "success");
            console.log(`[AQWikiTools] ✅ Sync completed: ${inventory.length} items`);
            
            // Update info last sync
            const existingInfo = document.getElementById("aqw-sync-info");
            if (existingInfo) existingInfo.remove();
            addLastSyncInfo();
            
            return inventory;
        } catch (error) {
            console.error("[AQWikiTools] ❌ Sync failed:", error);
            showStatusMessage("❌ Sync failed! Please refresh and try again.", "error");
            
            const cached = await loadInventoryFromStorage();
            if (cached.length > 0) {
                console.log(`[AQWikiTools] Using cached data (${cached.length} items) as fallback`);
                return cached;
            }
            return [];
        }
    }
    
    async function getInventory() {
        const { savedInventory } = await chrome.storage.local.get(["savedInventory"]);
        return savedInventory || [];
    }
    
    // ============================================================
    // INITIALIZE
    // ============================================================
    
    function waitForPageReady() {
        if (document.body && document.querySelector("#dataGridContainer")) {
            console.log("[AQWikiTools] Page ready, adding buttons...");
            addAnimationCSS();
            setTimeout(addSyncButtonToGridToolbar, 1500);
        } else {
            console.log("[AQWikiTools] Waiting for page to load...");
            setTimeout(waitForPageReady, 500);
        }
    }
    
    waitForPageReady();
    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { 
            synchronizeInventory, 
            getInventory, 
            fetchInventoryFromAPI
        };
    }
    
    console.log("[AQWikiTools] Inventory sync module loaded (v3.0.7 - Blue sync button in grid toolbar)");
}
